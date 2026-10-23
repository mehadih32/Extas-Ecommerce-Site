/* =====================================================================
   97o-adm2-shell.js — NEW EXTAS ADMIN · shell, router and page patterns
   API (read ADMIN2-FRAMEWORK.md next to src/):
     a2Section({id, en, bn, icon, group, base, perm, badge, guide, tabs:[…]})
     a2Page({path, section, tab, en, bn, perm, render(params, query) → html})
     patterns: a2Head · a2Tabs · a2Kpis · a2List · a2Detail · a2Form ·
               a2SetCard · a2State · a2Band · a2Drawer · a2Confirm · a2Board ·
               a2TL · a2Spark · a2Chart · a2Bars
   The old admin is kept, untouched, at #/admin-classic/… (nothing deleted).
   ===================================================================== */
var A2_IC = {
 grid:'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', bag:'M5.5 8h13l-1 12.5h-11zM9 8V7a3 3 0 0 1 6 0v1',
 shirt:'M8.5 3.5 4 6 2.5 10.5l3 1.3V20.5h13v-8.7l3-1.3L20 6l-4.5-2.5a3.5 3.5 0 0 1-7 0z',
 users:'M15.5 20v-1.3a3.7 3.7 0 0 0-3.7-3.7H7.2a3.7 3.7 0 0 0-3.7 3.7V20M9.5 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20.5 20v-1.3a3.7 3.7 0 0 0-2.7-3.5M15.3 4.7a3.5 3.5 0 0 1 0 6.6',
 truck:'M2.5 6.5h11v9.5h-11zM13.5 9.5h4l3.5 3.5v3h-7.5M6.5 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
 msg:'M20.5 11.5a8 8 0 0 1-11.7 7.1L3.5 20l1.4-4.9A8 8 0 1 1 20.5 11.5z', headset:'M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v5.5H5.2A1.2 1.2 0 0 1 4 18.3zM20 14h-3v5.5h1.8a1.2 1.2 0 0 0 1.2-1.2z',
 mega:'M3.5 10v4h3l6 4.5v-13l-6 4.5zM16 9a4 4 0 0 1 0 6M18.8 6.3a8 8 0 0 1 0 11.4', globe:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z',
 wallet:'M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3M4 7.5v10A2.5 2.5 0 0 0 6.5 20H20V8H6.5A2.5 2.5 0 0 1 4 5.5M16.5 14h.01', chart:'M4 4v16h16M8 16v-4M12 16V8M16 16v-6',
 spark:'M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1-5.1-1.9 5.1-1.9zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
 sliders:'M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1M15 4.5v4M9 10v4M17 15.5v4', help:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.6 9.2a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.5M12 16.8h.01',
 flag:'M5 21V4M5 4h11l-2 4 2 4H5', search:'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4', bell:'M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15zM10 20.5h4',
 book:'M4.5 5.5A2 2 0 0 1 6.5 3.5h12.5v15H6.5a2 2 0 0 0-2 2zM4.5 20.5v-15M8.5 7.5h6.5', cd:'M6 9l6 6 6-6', cr:'M9 6l6 6-6 6', cl:'M15 6l-6 6 6 6', plus:'M12 5v14M5 12h14',
 dl:'M12 4v11M7 10l5 5 5-5M5 20h14', up2:'M12 20V9M7 14l5-5 5 5M5 4h14', cal:'M4 6h16v14H4zM4 10h16M8 3.5v4M16 3.5v4', check:'M5 12.5l4.5 4.5L19 7', alert:'M12 4 2.8 19.5h18.4zM12 10v4M12 16.8h.01',
 clock:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2', box:'M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4zM3.5 7.5 12 11.5l8.5-4M12 11.5v9',
 uturn:'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11', shield:'M12 3.5l7.5 3v5.5c0 4.3-3.2 7.9-7.5 8.5-4.3-.6-7.5-4.2-7.5-8.5V6.5z',
 store:'M4 9.5 5.5 4.5h13L20 9.5M4.5 9.5v10.5h15V9.5M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M10 20v-5h4v5', layers:'M12 3.5 2.5 8.5 12 13.5l9.5-5zM2.5 12.5 12 17.5l9.5-5M2.5 16.5 12 21.5l9.5-5',
 file:'M6 3.5h8l4 4v13H6zM14 3.5v4h4', cog:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1',
 enter:'M20 5v6a3 3 0 0 1-3 3H5M9 10l-4 4 4 4', phone:'M5 4h3.5l2 5-2.4 1.5a11 11 0 0 0 5.4 5.4L15 13.5l5 2V19a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z',
 x:'M6 6l12 12M18 6 6 18', menu:'M4 7h16M4 12h16M4 17h16', more:'M5 12h.01M12 12h.01M19 12h.01', dots:'M12 5h.01M12 12h.01M12 19h.01', home:'M4 11 12 4l8 7M6 9.5V20h12V9.5',
 print:'M7 9V4h10v5M7 17H5v-6h14v6h-2M7 14h10v6H7z', scan:'M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M7 12h10', tag:'M3.5 12.5V4h8.5l8.5 8.5-8.5 8.5zM8 8h.01',
 lock:'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3', eye:'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
 send:'M21 3 10 14M21 3l-7 18-4-7-7-4z', edit:'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4', copy:'M8 8h12v12H8zM4 16V4h12', ext:'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
 filter:'M4 5h16l-6 8v6l-4-2v-4z', refresh:'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7', merge:'M7 4v6a5 5 0 0 0 5 5h5M7 20v-4M14 12l3 3-3 3', star:'M12 3.5l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.8l6-.8z',
 camera:'M4 8h3l2-2.5h6L17 8h3v11H4zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', mic:'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM6 11a6 6 0 0 0 12 0M12 17v3',
 gift:'M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-1.5-3-5-3-5-1s5 1 5 1zM12 7c1.5-3 5-3 5-1s-5 1-5 1z', zap:'M13 3 4 14h7l-1 7 9-11h-7z',
 upload:'M12 16V4M7 9l5-5 5 5M5 20h14', info:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.8h.01', down:'M4 7l5 5 4-4 7 7M20 9v6h-6'
};
function a2i(name, size, sw){ var d = A2_IC[name] || A2_IC.grid; size = size || 18; return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.7) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>'; }

/* ---------- registry ---------- */
A2.sections = []; A2.pages = []; A2.lists = {};
function a2Section(def){ def.tabs = def.tabs || []; for(var i = 0; i < A2.sections.length; i++) if(A2.sections[i].id === def.id){ A2.sections[i] = def; return def; } A2.sections.push(def); return def; }
function a2Sec(id){ for(var i = 0; i < A2.sections.length; i++) if(A2.sections[i].id === id) return A2.sections[i]; return null; }
function a2Page(def){
  var keys = [], src = def.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:(\w+)/g, function(m, k){ keys.push(k); return '([^/]+)'; });
  def.re = new RegExp('^' + src + '$'); def.keys = keys; def.dyn = keys.length > 0;
  A2.pages = A2.pages.filter(function(p){ return p.path !== def.path; }); A2.pages.push(def);
  A2.pages.sort(function(a, b){ return (a.dyn ? 1 : 0) - (b.dyn ? 1 : 0); });
  return def;
}
function a2Claims(path){ path = String(path || '').split('?')[0]; if(path === '/admin' || path === '/admin/') return true; return A2.sections.some(function(s){ return s.base && s.base !== '/admin' && (path === s.base || path.indexOf(s.base + '/') === 0); }); }
function a2Find(path){
  path = String(path || '').replace(/\/+$/, '') || '/admin';
  for(var i = 0; i < A2.pages.length; i++){ var m = A2.pages[i].re.exec(path); if(m){ var params = {}; A2.pages[i].keys.forEach(function(k, j){ params[k] = decodeURIComponent(m[j + 1]); }); return {page:A2.pages[i], params:params}; } }
  var sec = null; A2.sections.forEach(function(s){ if(s.base && (path === s.base || (s.base !== '/admin' && path.indexOf(s.base + '/') === 0)) && (!sec || s.base.length > sec.base.length)) sec = s; });
  return sec ? {page:null, sec:sec, params:{}} : null;
}
/* one route in the shop's router for everything the new admin owns (dynamic: sections register themselves) */
(function(){
  if(typeof ROUTES === 'undefined') return;
  var m = {source:'a2-dynamic'}; m[Symbol.match] = function(s){ return a2Claims(s) || a2Unrouted(s) ? [s] : null; };
  ROUTES.unshift([m, 'adm2']);
  ROUTES.unshift([/^\/admin-classic(\/.*)?$/, 'adm2-classic']);
})();

/* an /admin/… address nobody owns shows the new admin's own "not found" page, inside the shell */
function a2Unrouted(path){ if(String(path).indexOf('/admin/') !== 0) return false; for(var i = 0; i < ROUTES.length; i++){ var r = ROUTES[i]; if(r[1] === 'adm2' || !(r[0] instanceof RegExp)) continue; if(r[0].test(path)) return false; } return true; }
/* ---------- the classic admin, kept whole ---------- */
function a2ClassicResolve(rest){
  var path = '/admin' + (rest || '');
  for(var i = 0; i < ROUTES.length; i++){ var r = ROUTES[i]; if(r[1] === 'adm2' || r[1] === 'adm2-classic' || !(r[0] instanceof RegExp)) continue; var m = path.match(r[0]); if(m) return {name:r[1], params:m.slice(1), path:path}; }
  return null;
}
PAGES['adm2-classic'] = {layout:'admin',
  title:function(p, q){ var c = A2.classic; var pg = c && PAGES[c.name]; return pg && pg.title ? (typeof pg.title === 'function' ? pg.title(c.params, q) : pg.title) : 'Admin'; },
  render:function(params, q){
    var c = a2ClassicResolve(params[0] || ''); A2.classic = c;
    if(!c || !PAGES[c.name]) return '<div class="container empty"><h1 class="h1">Page not found</h1><a class="btn btn-primary mt16" href="#/admin">Open the admin</a></div>';
    CUR.page = c.name; CUR.params = c.params; CUR.path = c.path; CUR.a2classic = true;
    return PAGES[c.name].render(c.params, q);
  },
  after:function(p, q){ var c = A2.classic, pg = c && PAGES[c.name]; if(pg && pg.after) pg.after(c.params, q); }
};
function a2ClassicHref(h){
  var m = /^#(\/admin(?:\/[^?#]*)?)(\?.*)?$/.exec(String(h || '')); if(!m) return h;
  return a2Claims(m[1]) ? '#/admin-classic' + m[1].slice(6) + (m[2] || '') : h;
}
(function(){
  /* the shop's layout(): the new admin draws its own shell; classic admin pages keep theirs, with links into the new admin's paths sent to the classic copy */
  if(typeof layout === 'function' && !layout._a2){
    var l0 = layout;
    layout = function(body, kind, cur){
      A2.lastKind = kind;
      if(kind === 'adm2'){ var skip = '<a class="skip" href="#main" data-act="skip">Skip to content</a>'; return skip + body + demoPanel(); }
      var out = l0.apply(this, arguments);
      if(kind === 'admin') out = out.replace(/(href|data-href)="(#\/admin(?:\/[^"?]*)?(?:\?[^"]*)?)"/g, function(all, at, h){ return at + '="' + a2ClassicHref(h) + '"'; });
      return out;
    };
    layout._a2 = true;
  }
  if(typeof go === 'function' && !go._a2){ var g0 = go; go = function(h){ if(A2.lastKind === 'admin' && typeof h === 'string') h = a2ClassicHref(h); return g0(h); }; go._a2 = true; }
  /* the English layer of the classic admin also covers its classic address */
  if(typeof al_route === 'function' && !al_route._a2){ al_route = function(){ return /^#\/(admin|admin-classic|preview)(?:[\/?]|$)/.test(location.hash || ''); }; al_route._a2 = true; }
  /* demo controls: a role switcher and a page-state preview while the new admin is open */
  if(typeof demoPanel === 'function' && !demoPanel._a2){
    var d0 = demoPanel;
    demoPanel = function(){
      var out = d0.apply(this, arguments);
      if(CUR && CUR.page === 'adm2' && out.indexOf('demo-panel') >= 0){
        var role = a2S().role, st = UI.a2state || '';
        var seg = function(act, val, opts){ return '<div class="seg" style="flex-wrap:wrap">' + opts.map(function(o){ return '<button data-act="' + act + '" data-v="' + o[0] + '" class="' + (val === o[0] ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</div>'; };
        var blk = '<div style="border-top:1px solid #E6E3DE;margin:12px 0 8px"></div><div style="font-weight:600;margin-bottom:6px">New admin · view as role</div>' +
          seg('a2-role', role, Object.keys(A2_ROLES).map(function(k){ return [k, A2_ROLES[k].en]; })) +
          '<div style="font-weight:600;margin:12px 0 6px">Page state preview</div>' + seg('a2-state', st, [['', 'Normal'], ['loading', 'Loading'], ['empty', 'Empty'], ['error', 'Error'], ['denied', 'No access']]) +
          '<a href="#/admin-classic" style="display:block;padding:8px 0 0;color:#1F4E46;font-weight:600">Open the classic admin</a>';
        out = out.replace('<button class="btn btn-sm btn-ghost mt12" data-act="demo-reset"', blk + '<button class="btn btn-sm btn-ghost mt12" data-act="demo-reset"');
      }
      return out;
    };
    demoPanel._a2 = true;
  }
})();
ACT['a2-role'] = function(el){ var v = el.getAttribute('data-v'); if(!A2_ROLES[v]) return; a2S().role = v; UI.a2pop = null; UI.a2sb = false; saveState(); toast(L('Now viewing as ', 'এখন দেখছেন: ') + L(A2_ROLES[v].en, A2_ROLES[v].bn)); go('#' + A2_ROLES[v].start); };
ACT['a2-state'] = function(el){ UI.a2state = el.getAttribute('data-v') || null; rerender(); };

/* ---------- the page ---------- */
PAGES['adm2'] = {layout:'adm2',
  title:function(){ var f = a2Find(CUR.path); var p = f && f.page; return p ? L(p.en, p.bn) + ' · Admin' : 'Admin'; },
  render:function(params, q){
    A2.mc = {}; A2.drawer = ''; A2.drawerOpen = false; a2S(); a2Seed(); if(typeof a2FtFns === 'function') a2FtFns();
    var path = CUR.path.replace(/\/+$/, '') || '/admin', f = a2Find(path), body, ctx = {path:path, q:q || {}};
    if(A2.lastPath !== path){ if(A2.lastPath) { UI.a2sb = false; UI.a2pop = null; a2CloseDrawers(); } A2.lastPath = path; }
    if(path === '/admin' && a2Role().start !== '/admin' && !q.home){ var st = a2Find(a2Role().start); if(st && st.page && a2Can(st.page.perm)) f = st, ctx.path = a2Role().start; }
    ctx.page = f && f.page; ctx.sec = f ? (f.page ? a2Sec(f.page.section) : f.sec) : null; ctx.params = f ? f.params : {}; A2.ctx = ctx;
    var state = UI.a2state || (q && q.state) || '';
    try{
      if(!f) body = a2State('notfound');
      else if(!f.page) body = a2Placeholder(ctx.sec);
      else if(state === 'denied' || !a2Can(f.page.perm)) body = a2Head(ctx, {}) + a2State('denied', {perm:f.page.perm});
      else if(state === 'loading') body = a2Head(ctx, {}) + a2Tabs(ctx) + a2Skeleton(f.page.skel);
      else if(state === 'error') body = a2Head(ctx, {}) + a2Tabs(ctx) + a2State('error');
      else if(state === 'empty') body = a2Head(ctx, {}) + a2Tabs(ctx) + (f.page.empty ? f.page.empty(ctx) : a2State('empty', {t:L('Nothing here yet', 'এখানে এখনো কিছু নেই')}));
      else body = f.page.render(ctx.params, ctx.q, ctx);
    }catch(e){ console.error(e); body = a2State('error', {msg:e.message}); }
    return a2Shell(body, ctx);
  },
  after:function(){
    var c = A2.ctx; if(c && c.page && c.page.after) try{ c.page.after(c); }catch(e){ console.error(e); }
    a2RestoreFocus();
    [['.a2-tabs-s', '.a2-tab.on'], ['.a2-views', '.a2-view.on']].forEach(function(x){ document.querySelectorAll(x[0]).forEach(function(box){ var on = box.querySelector(x[1]); if(on && box.scrollWidth > box.clientWidth) box.scrollLeft = Math.max(0, on.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft - 24); }); });
    var hl = c && c.q && c.q.hl; if(hl){ var el = document.getElementById('a2s-' + hl); if(el){ el.classList.add('hl'); setTimeout(function(){ el.scrollIntoView({block:'center'}); }, 30); } }
  }
};

/* ---------- shell ---------- */
var A2_GROUPS = [['daily', 'Daily work', 'রোজকার কাজ'], ['grow', 'Grow', 'বিক্রি বাড়ানো'], ['business', 'Business', 'ব্যবসা']];
function a2SecVisible(s){ return a2CanAny(s.perms || [s.perm]); }
function a2Shell(body, ctx){
  var role = a2Role(), sec = ctx.sec, S = a2S(), unread = S.ntf.filter(function(n){ return !n.read; }).length;
  var item = function(s){
    if(!a2SecVisible(s)) return '';
    var b = s.badge ? s.badge() : 0, on = sec && sec.id === s.id;
    return '<a class="a2-ni' + (on ? ' on' : '') + '" href="#' + (s.home || s.base) + '"' + (on ? ' aria-current="page"' : '') + ' title="' + esc(L(s.en, s.bn)) + '">' + a2i(s.icon, 18) + '<span>' + Le(s.en, s.bn) + '</span>' + (b ? '<em class="a2-nb' + (s.hot ? ' hot' : '') + '" aria-label="' + b + ' waiting">' + b + '</em>' : '') + '</a>';
  };
  var nav = A2_GROUPS.map(function(g){ var items = A2.sections.filter(function(s){ return s.group === g[0]; }).map(item).join(''); return items ? '<div class="a2-ng">' + Le(g[1], g[2]) + '</div>' + items : ''; }).join('');
  var foot = A2.sections.filter(function(s){ return s.group === 'bottom'; }).map(item).join('');
  var me = '<button type="button" class="a2-me" data-act="a2-pop" data-p="me" aria-haspopup="menu" aria-expanded="' + (UI.a2pop === 'me') + '"><span class="a2-av">' + role.ini + '</span><span><b>' + esc(role.person) + '</b><i>' + Le(role.en, role.bn) + ' · EXTAS</i></span>' + a2i('cd', 16) + '</button>' +
    (UI.a2pop === 'me' ? '<div class="a2-sbmenu" data-a2pop>' + a2MeMenu() + '</div>' : '');
  var side = '<aside class="a2-sb' + (UI.a2sb ? ' open' : '') + '" aria-label="' + Le('Admin sections', 'অ্যাডমিন সেকশন') + '">' +
    '<div class="a2-brand"><span class="a2-logo">E</span><div><div class="a2-wm">EXTAS</div><div class="a2-wm-s">Admin</div></div></div>' +
    '<div class="a2-store" title="' + Le('One store until more stores are added (S17)', 'একটাই দোকান') + '">' + a2i('store', 16) + '<span><b>' + esc(a2StoreName()) + '</b><i>' + esc(a2StoreDomain()) + '</i></span></div>' +
    '<nav class="a2-nav">' + nav + '</nav><div class="a2-sbf">' + foot + me + '</div></aside>' + (UI.a2sb ? '<div class="a2-sbscrim" data-act="a2-sb" aria-hidden="true"></div>' : '');
  var tb = '<header class="a2-tb">' +
    '<button type="button" class="a2-icb a2-mbtn" data-act="a2-sb" aria-label="' + Le('Open the menu', 'মেনু খুলুন') + '">' + a2i('menu', 20) + '</button>' +
    '<button type="button" class="a2-srch" data-act="a2-pal" aria-label="' + Le('Search pages, settings, orders, products, customers', 'সার্চ') + '">' + a2i('search', 17) + '<span>' + Le('Search pages, settings, orders, products, customers…', 'পাতা, সেটিং, অর্ডার, প্রোডাক্ট, কাস্টমার খুঁজুন…') + '</span><kbd>Ctrl K</kbd></button>' +
    '<div class="a2-tbr"><span class="a2-storetb a2-hm">' + a2i('store', 15) + esc(a2StoreName()) + '</span>' +
      '<button type="button" class="a2-icb" data-act="a2-pop" data-p="ntf" aria-label="' + Le('Notifications', 'নোটিফিকেশন') + (unread ? ', ' + unread + ' unread' : '') + '">' + a2i('bell', 19) + (unread ? '<span class="a2-dot">' + unread + '</span>' : '') + '</button>' +
      '<div class="a2-lang" role="group" aria-label="Admin language · অ্যাডমিনের ভাষা"><button type="button" class="' + (a2bn() ? '' : 'on') + '" data-act="a2-lang" data-v="en" aria-pressed="' + !a2bn() + '">EN</button><button type="button" class="' + (a2bn() ? 'on' : '') + '" data-act="a2-lang" data-v="bn" aria-pressed="' + a2bn() + '" lang="bn">বাং</button></div>' +
      '<button type="button" class="a2-icb a2-hm" data-act="a2-pop" data-p="me2" aria-label="' + Le('Account', 'অ্যাকাউন্ট') + '"><span class="a2-av g">' + role.ini + '</span></button>' +
    '</div>' + (UI.a2pop === 'me2' ? '<div class="a2-tbpop" data-a2pop>' + a2MeMenu() + '</div>' : '') + '</header>';
  var bn = function(href, ic, en, bnl, on, badge){ return '<a href="' + href + '" class="' + (on ? 'on' : '') + '">' + a2i(ic, 21) + '<span>' + Le(en, bnl) + '</span>' + (badge ? '<em class="a2-nb">' + badge + '</em>' : '') + '</a>'; };
  var oSec = a2Sec('orders'), sSec = a2Sec('support');
  var bnav = '<nav class="a2-bnav" aria-label="' + Le('Quick menu', 'দ্রুত মেনু') + '">' + bn('#/admin?home=1', 'home', 'Home', 'হোম', sec && sec.id === 'dashboard') +
    (oSec && a2SecVisible(oSec) ? bn('#' + (oSec.home || oSec.base), 'bag', 'Orders', 'অর্ডার', sec && sec.id === 'orders', oSec.badge && oSec.badge()) : '') +
    (sSec && a2SecVisible(sSec) ? bn('#' + sSec.base, 'headset', 'Support', 'সাপোর্ট', sec && sec.id === 'support', sSec.badge && sSec.badge()) : '') +
    '<button type="button" data-act="a2-pal">' + a2i('search', 21) + '<span>' + Le('Search', 'সার্চ') + '</span></button>' +
    '<button type="button" data-act="a2-sb">' + a2i('menu', 21) + '<span>' + Le('More', 'আরও') + '</span></button></nav>';
  var ntf = UI.a2pop === 'ntf' ? a2NtfDrawer() : '';
  return '<div class="adm2" translate="no" data-role="' + a2S().role + '" lang="' + (a2bn() ? 'bn' : 'en') + '">' + side + '<div class="a2-main">' + tb + '<main class="a2-ct" id="main" tabindex="-1">' + body + '</main></div>' + bnav + ntf + (A2.drawer || a2DrawerOf() || '') + '</div>';
}
function a2StoreName(){ var n = ''; try{ n = typeof SITE === 'function' ? SITE('name') : ''; }catch(e){} return n || 'Main store'; }
function a2StoreDomain(){ var n = ''; try{ n = typeof SITE === 'function' ? (SITE('domain') || '') : ''; }catch(e){} return n || 'extas.com.bd'; }
function a2MeMenu(){
  var cur = a2S().role, r = a2Role();
  return '<div class="a2-menu" role="menu"><div class="a2-mh">' + esc(r.person) + ' · ' + Le(r.en, r.bn) + '</div>' +
    [['Profile', 'প্রোফাইল', 'users'], ['Two-step login', 'দুই ধাপে লগইন', 'lock'], ['My sessions', 'আমার সেশন', 'clock']].map(function(x){ return '<button type="button" class="a2-mi" role="menuitem" data-act="a2-soon" data-t="' + esc(x[0]) + '">' + a2i(x[2], 16) + Le(x[0], x[1]) + '</button>'; }).join('') +
    '<div class="a2-mh">' + Le('Demo · view as', 'ডেমো · যে হিসেবে দেখবেন') + '</div>' +
    Object.keys(A2_ROLES).map(function(k){ return '<button type="button" class="a2-mi' + (k === cur ? ' on' : '') + '" role="menuitemradio" aria-checked="' + (k === cur) + '" data-act="a2-role" data-v="' + k + '">' + a2i(k === cur ? 'check' : 'users', 16) + Le(A2_ROLES[k].en, A2_ROLES[k].bn) + '</button>'; }).join('') +
    '<div class="a2-hr" style="margin:6px 0"></div><a class="a2-mi" href="#/admin-classic">' + a2i('ext', 16) + Le('Classic admin', 'পুরনো অ্যাডমিন') + '</a><a class="a2-mi" href="#/">' + a2i('store', 16) + Le('Open the shop', 'দোকান খুলুন') + '</a>' +
    '<button type="button" class="a2-mi" data-act="a2-soon" data-t="Sign out">' + a2i('cl', 16) + Le('Sign out', 'সাইন আউট') + '</button></div>';
}
ACT['a2-soon'] = function(el){ UI.a2pop = null; rerender(); toast(L('Demo: “', 'ডেমো: “') + (el.getAttribute('data-t') || '') + L('” works in the real build', '” আসল সাইটে চলবে')); };
ACT['a2-pop'] = function(el){ var p = el.getAttribute('data-p'); UI.a2pop = UI.a2pop === p ? null : p; rerender(); };
ACT['a2-sb'] = function(){ UI.a2sb = !UI.a2sb; UI.a2pop = null; rerender(); };
ACT['a2-lang'] = function(el){ ST.adminLang = el.getAttribute('data-v') === 'bn' ? 'bn' : 'en'; saveState(); rerender(); };
/* close pop-ups on an outside click or Esc */
document.addEventListener('click', function(ev){
  if(!UI.a2pop && !UI.a2sb) return;
  if(ev.target.closest('[data-a2pop]') || ev.target.closest('[data-act="a2-pop"]') || ev.target.closest('[data-act="a2-sb"]') || ev.target.closest('.a2-sb')) return;
  if(UI.a2pop){ UI.a2pop = null; rerender(); }
});
document.addEventListener('keydown', function(ev){
  if(!CUR || CUR.page !== 'adm2') return;
  var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((ev.target || {}).tagName || '') || (ev.target && ev.target.isContentEditable);
  if((ev.ctrlKey || ev.metaKey) && (ev.key === 'k' || ev.key === 'K')){ ev.preventDefault(); a2PalOpen(''); return; }
  if(ev.key === '/' && !typing && !document.querySelector('.a2-ov')){ ev.preventDefault(); a2PalOpen(''); return; }
  if(ev.key === 'Escape'){
    if(document.querySelector('.a2-ov')) return;   /* its own handler */
    if(UI.a2pop || UI.a2sb || A2.drawerOpen){ UI.a2pop = null; UI.a2sb = false; a2CloseDrawers(); rerender(); }
  }
});
function a2CloseDrawers(){ Object.keys(UI).forEach(function(k){ if(k.indexOf('a2l:') === 0 && UI[k].peek) UI[k].peek = null; if(k.indexOf('a2d:') === 0) UI[k] = null; }); }

/* ---------- page header, tabs, guide ---------- */
function a2Head(ctx, o){
  o = o || {}; var sec = ctx.sec, p = ctx.page;
  var title = o.title != null ? o.title : (p ? L(p.en, p.bn) : sec ? L(sec.en, sec.bn) : '');
  var crumb = o.crumb || (sec ? '<a href="#' + (sec.home || sec.base) + '">' + Le(sec.en, sec.bn) + '</a>' + (p && p.tab && sec.home !== ctx.path && L(p.en, p.bn) !== L(sec.en, sec.bn) ? a2i('cr', 12) + '<span>' + Le(p.en, p.bn) + '</span>' : '') : '');
  var guide = sec && sec.guide !== false ? '<button type="button" class="a2-guide" data-act="a2-guide" data-s="' + esc(sec.id) + '" lang="bn">' + a2i('book', 16) + 'এই সেকশনে কী করা যায়</button>' : '';
  return '<div class="a2-ph"><div>' + (o.back ? '<div class="a2-crumb"><a href="' + o.back[0] + '" class="a2-lnk">' + a2i('cl', 14) + esc(o.back[1]) + '</a></div>' : crumb ? '<div class="a2-crumb">' + crumb + '</div>' : '') +
    '<h1 class="a2-h1">' + (o.titleHtml || esc(title)) + '</h1>' + (o.sub ? '<p class="a2-subt">' + o.sub + '</p>' : '') + '</div>' +
    '<div class="a2-phr">' + guide + (o.right || '') + '</div></div>';
}
function a2Tabs(ctx, active){
  var sec = ctx.sec; if(!sec || !sec.tabs.length) return '';
  active = active || (ctx.page && ctx.page.tab);
  var vis = sec.tabs.filter(function(t){ return a2Can(t.perm) && (!t.when || t.when()); });
  if(vis.length < 2 && !(vis.length === 1 && vis[0].id !== active)) return vis.length === 1 ? '' : '';
  var main = vis.filter(function(t){ return !t.more; }), more = vis.filter(function(t){ return t.more; });
  var tab = function(t){ var n = t.count ? t.count() : 0; return '<a class="a2-tab' + (t.id === active ? ' on' : '') + '" href="#' + t.path + '"' + (t.id === active ? ' aria-current="page"' : '') + '>' + Le(t.en, t.bn) + (n ? '<span class="a2-cnt">' + n + '</span>' : '') + '</a>'; };
  var moreOn = more.some(function(t){ return t.id === active; }), open = UI.a2pop === 'more';
  return '<nav class="a2-tabs" aria-label="' + esc(L(sec.en, sec.bn)) + '"><div class="a2-tabs-s">' + main.map(tab).join('') + '</div>' +
    (more.length ? '<div class="a2-more"><button type="button" class="a2-tab' + (moreOn ? ' on' : '') + '" data-act="a2-pop" data-p="more" aria-haspopup="menu" aria-expanded="' + open + '">' + (moreOn ? Le(more.filter(function(t){ return t.id === active; })[0].en, more.filter(function(t){ return t.id === active; })[0].bn) : Le('More', 'আরও')) + a2i('cd', 14) + '</button>' +
      (open ? '<div class="a2-morepop" data-a2pop><div class="a2-menu" role="menu">' + more.map(function(t){ return '<a class="a2-mi' + (t.id === active ? ' on' : '') + '" role="menuitem" href="#' + t.path + '">' + Le(t.en, t.bn) + '</a>'; }).join('') + '</div></div>' : '') + '</div>' : '') + '</nav>';
}
/* the guide reuses the shop's Bengali guide panel ("এই সেকশনে কী করা যায়", 98f-admin-guide.js): same markup, same modal */
var A2_GUIDE = {};
ACT['a2-guide'] = function(el){
  var id = el.getAttribute('data-s'), g = A2_GUIDE[id] || (typeof AG !== 'undefined' && AG[id]) || null; if(!g) return toast('এই সেকশনের গাইড শিগগিরই আসছে');
  var parts = typeof AG_PARTS !== 'undefined' ? AG_PARTS : [['kaj', 'এই সেকশন কিসের জন্য'], ['menu', 'মেনু আর ট্যাব'], ['kora', 'এখানে কী করা যায়'], ['sw', 'সুইচ আর সংখ্যা (ডিফল্টসহ)'], ['next', 'তারপর কী হয়']];
  var html = '<div class="ag-panel" lang="bn" translate="no" data-testid="ag-panel">' + parts.map(function(p){ return '<section><h3>' + esc(p[1]) + '</h3><ul>' + (g[p[0]] || []).map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></section>'; }).join('') +
    '<p class="ag-foot">এই লেখা ব্যাকএন্ডের প্রতিটা বদলের সাথে আপডেট হয় (CN-014)।</p></div>';
  openModal(html, {title:g.t + ' — এই সেকশনে কী করা যায়'});
};

/* ---------- KPI strip, sparkline, charts ---------- */
function a2Smooth(pts){ if(pts.length < 2) return ''; var d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1); for(var i = 0; i < pts.length - 1; i++){ var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2, t = .16; d += ' C' + (p1[0] + (p2[0] - p0[0]) * t).toFixed(1) + ',' + (p1[1] + (p2[1] - p0[1]) * t).toFixed(1) + ' ' + (p2[0] - (p3[0] - p1[0]) * t).toFixed(1) + ',' + (p2[1] - (p3[1] - p1[1]) * t).toFixed(1) + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1); } return d; }
A2.gid = 0;
function a2Spark(vals, color, w, h){
  w = w || 104; h = h || 34; color = color || '#1F4E46'; if(!vals || vals.length < 2) return '';
  var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), rg = (hi - lo) || 1, id = 'a2g' + (A2.gid++);
  var pts = vals.map(function(v, i){ return [i * w / (vals.length - 1), h - 3 - (v - lo) / rg * (h - 8)]; }), d = a2Smooth(pts);
  return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".16"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
    '<path d="' + d + ' L' + w + ',' + h + ' L0,' + h + ' Z" fill="url(#' + id + ')"/><path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-linecap="round"/><circle cx="' + (pts[pts.length - 1][0] - 1.5).toFixed(1) + '" cy="' + pts[pts.length - 1][1].toFixed(1) + '" r="2.6" fill="' + color + '"/></svg>';
}
/* k: {l, bn, v, delta (fraction or null), deltaPts, good:'up'|'down', note, spark:[], status, href, title} */
function a2Kpis(items, cls){
  return '<div class="a2-kpis' + (cls ? ' ' + cls : '') + '">' + items.map(function(k){
    var tr = '';
    if(k.delta != null && isFinite(k.delta)){ var up = k.delta >= 0, good = (k.good || 'up') === 'up' ? up : !up; tr = '<span class="a2-trend ' + (Math.abs(k.delta) < .0005 ? 'flat' : good ? 'up' : 'down') + '">' + (up ? '▲' : '▼') + ' ' + (k.deltaPts ? Math.abs(k.delta * 100).toFixed(1) + ' pts' : Math.abs(k.delta * 100).toFixed(1) + '%') + '</span>'; }
    var tag = k.href ? 'a' : 'div';
    return '<' + tag + ' class="a2-card a2-kpi"' + (k.href ? ' href="' + k.href + '"' : '') + (k.title ? ' title="' + esc(k.title) + '"' : '') + '><div class="a2-kl">' + Le(k.l, k.bn) + (k.status ? a2MS(k.status) : '') + '</div><div class="a2-kv">' + k.v + '</div>' +
      (k.spark ? '<div class="a2-kspark">' + a2Spark(k.spark, k.color) + '</div>' : '') + '<div class="a2-kf">' + tr + (k.note ? '<span class="a2-kn">' + k.note + '</span>' : '') + '</div></' + tag + '>';
  }).join('') + '</div>';
}
function a2MS(s){ var m = {estimated:['~ estimated', '~ আনুমানিক'], provisional:['provisional', 'অস্থায়ী'], reconciled:['reconciled', 'মেলানো'], final:['final', 'চূড়ান্ত']}[s]; return m ? '<span class="a2-ms ' + s + '" title="' + esc(L('Money status: ', 'টাকার অবস্থা: ') + m[0]) + '">' + Le(m[0], m[1]) + '</span>' : ''; }
/* line chart: series [{v:[…], c, dash, area, end}]. Lines are drawn in a stretchable SVG; the axis words are HTML, so they stay crisp and readable at every width. */
function a2Chart(series, labels, o){
  o = o || {}; var h = o.h || 230, W = 1000, H = 1000;
  var max = 0; series.forEach(function(s){ s.v.forEach(function(x){ if(x > max) max = x; }); }); max = max || 1;
  var step = Math.pow(10, Math.floor(Math.log10(max))); if(max / step < 2.5) step /= 4; else if(max / step < 5) step /= 2; var ticks = []; for(var t = 0; t <= max + step * .999; t += step) ticks.push(t); max = ticks[ticks.length - 1];
  var id = 'a2c' + (A2.gid++), n = labels.length;
  var X = function(i, len){ return i * W / Math.max(1, (len || n) - 1); }, Y = function(v){ return H - v / max * H; };
  var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#1F4E46" stop-opacity=".14"/><stop offset="1" stop-color="#1F4E46" stop-opacity="0"/></linearGradient></defs>';
  ticks.forEach(function(t){ svg += '<line x1="0" x2="' + W + '" y1="' + Y(t).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '" stroke="#EEEAE1" vector-effect="non-scaling-stroke"/>'; });
  var dot = '';
  series.forEach(function(s){
    var pts = s.v.map(function(v, i){ return [X(i, s.v.length), Y(v)]; }), d = a2Smooth(pts);
    if(s.area) svg += '<path d="' + d + ' L' + W + ',' + H + ' L0,' + H + ' Z" fill="url(#' + id + ')"/>';
    svg += '<path d="' + d + '" fill="none" stroke="' + s.c + '" stroke-width="' + (s.sw || 2.2) + '" stroke-linecap="round" vector-effect="non-scaling-stroke"' + (s.dash ? ' stroke-dasharray="4 5"' : '') + '/>';
    if(s.end){ var last = s.v[s.v.length - 1]; dot = '<span style="position:absolute;right:-6px;top:calc(' + (Y(last) / H * 100).toFixed(2) + '% - 6px);width:12px;height:12px;border-radius:50%;background:#fff;border:2.4px solid ' + s.c + ';box-shadow:0 0 0 5px rgba(31,78,70,.12)"></span>'; }
  });
  svg += '</svg>';
  var ylab = ticks.map(function(t){ return '<span style="position:absolute;right:0;top:calc(' + (Y(t) / H * 100).toFixed(2) + '% - 8px);font-size:11.5px;color:#8E948F;line-height:16px">' + (o.fmt ? o.fmt(t) : t) + '</span>'; }).join('');
  var every = Math.max(1, Math.round(n / (o.xn || 6))), xl = '';
  var shown = 0; labels.forEach(function(lb, i){ if(i % every === 0 || i === n - 1){ if(i !== n - 1 && n - 1 - i < every * .8) return; shown++; xl += '<span class="' + (shown % 2 === 0 && i !== n - 1 ? 'a2-xo' : '') + '" style="position:absolute;left:' + (X(i) / W * 100).toFixed(2) + '%;transform:translateX(' + (i === 0 ? '0' : i === n - 1 ? '-100%' : '-50%') + ');white-space:nowrap">' + esc(lb) + '</span>'; } });
  return '<div class="a2-chartw" role="img" aria-label="' + esc(o.label || 'chart') + '" style="display:grid;grid-template-columns:auto 1fr;gap:0 10px;margin-top:6px">' +
    '<div style="position:relative;height:' + h + 'px;min-width:40px">' + ylab + '</div><div style="position:relative;height:' + h + 'px">' + svg + dot + '</div>' +
    '<div></div><div style="position:relative;height:22px;margin-top:6px;font-size:11.5px;color:#8E948F">' + xl + '</div></div>';
}
/* horizontal bars: rows [{l, v, max, fmt, tone, sub}] */
function a2Bars(rows){ var max = Math.max.apply(null, rows.map(function(r){ return r.max || r.v || 0; }).concat([1])); return rows.map(function(r){ return '<div class="a2-crow"><div class="a2-crh"><b>' + esc(r.l) + '</b><span class="a2-num a2-b">' + (r.fmt || r.v) + '</span>' + (r.extra || '') + '</div><div class="a2-bar' + (r.tone ? ' ' + r.tone : '') + '"><i style="width:' + Math.max(1.5, Math.min(100, (r.v || 0) / max * 100)).toFixed(1) + '%"></i></div>' + (r.sub ? '<div class="a2-xs a2-mute" style="margin-top:5px">' + r.sub + '</div>' : '') + '</div>'; }).join(''); }

/* ---------- states, bands, skeleton ---------- */
function a2State(kind, o){
  o = o || {};
  if(kind === 'denied'){ var pn = A2_PERM_NAME[o.perm] || [o.perm || 'this page', o.perm || 'এই পাতা'];
    return '<div class="a2-state deny"><div class="a2-sti">' + a2i('lock', 26) + '</div><h3>' + Le('You don’t have access to this page', 'এই পাতায় আপনার অনুমতি নেই') + '</h3><p>' + Le('It needs the permission “' + pn[0] + '”. Your role is ' + a2Role().en + '.', 'এর জন্য “' + pn[1] + '” অনুমতি লাগে। আপনার ভূমিকা: ' + a2Role().bn + '।') + '</p>' +
      '<div class="a2-gap8"><button type="button" class="a2-btn pri" data-act="a2-askowner" data-perm="' + esc(o.perm || '') + '">' + a2i('send', 15) + Le('Ask the owner', 'মালিকের কাছে চান') + '</button><a class="a2-btn" href="#' + a2Role().start + '">' + Le('Back to my start page', 'আমার শুরুর পাতায় ফিরুন') + '</a></div></div>'; }
  if(kind === 'error'){ var eid = 'ERR-' + String(Date.now()).slice(-6);
    return '<div class="a2-state err"><div class="a2-sti">' + a2i('alert', 26) + '</div><h3>' + Le('This page could not load', 'পাতাটা খোলা গেল না') + '</h3><p>' + Le('Nothing was changed. Try again; if it keeps happening, send the error id to the team.', 'কিছু বদলায়নি। আবার চেষ্টা করুন; বারবার হলে এরর নম্বরটা টিমকে পাঠান।') + '</p><span class="a2-errid">' + eid + (o.msg ? ' · ' + esc(o.msg) : '') + '</span>' +
      '<div class="a2-gap8"><button type="button" class="a2-btn pri" data-act="a2-retry">' + a2i('refresh', 15) + Le('Retry', 'আবার চেষ্টা') + '</button><a class="a2-btn" href="#/admin?home=1">' + Le('Back to Dashboard', 'ড্যাশবোর্ডে ফিরুন') + '</a></div></div>'; }
  if(kind === 'notfound') return '<div class="a2-state err"><div class="a2-sti">' + a2i('search', 26) + '</div><h3>' + Le('Page not found', 'পাতাটা পাওয়া যায়নি') + '</h3><p>' + Le('The link may be old. Search finds every page and setting.', 'লিংকটা পুরনো হতে পারে। সার্চে সব পাতা পাওয়া যায়।') + '</p><div class="a2-gap8"><button type="button" class="a2-btn pri" data-act="a2-pal">' + a2i('search', 15) + Le('Search', 'সার্চ') + '</button><a class="a2-btn" href="#/admin?home=1">' + Le('Back to Dashboard', 'ড্যাশবোর্ডে ফিরুন') + '</a></div></div>';
  /* empty: what goes here, why it is empty, one action, the guide */
  return '<div class="a2-state"><div class="a2-sti">' + a2i(o.icon || 'box', 26) + '</div><h3>' + esc(o.t || L('Nothing here yet', 'এখানে এখনো কিছু নেই')) + '</h3>' + (o.s ? '<p>' + o.s + '</p>' : '') + '<div class="a2-gap8">' + (o.action || '') + (A2.ctx && A2.ctx.sec ? '<button type="button" class="a2-btn ghost" data-act="a2-guide" data-s="' + A2.ctx.sec.id + '" lang="bn">' + a2i('book', 15) + 'গাইড পড়ুন</button>' : '') + '</div></div>';
}
ACT['a2-retry'] = function(){ UI.a2state = null; var h = location.hash.replace(/([?&])state=[^&]*&?/, '$1').replace(/[?&]$/, ''); if(h !== location.hash) go(h); else rerender(); toast(L('Loaded again', 'আবার লোড হয়েছে')); };
ACT['a2-askowner'] = function(el){ a2S().ntf.unshift({id:'n' + Date.now(), lvl:'important', t:a2Role().person + ' asked for access', bn:'অনুমতি চাওয়া হয়েছে', s:'Permission: ' + (el.getAttribute('data-perm') || ''), at:Date.now(), href:'/admin'}); saveState(); toast(L('Sent to the owner — you will get a notification', 'মালিকের কাছে পাঠানো হয়েছে')); };
function a2Bnd(kind, html, btn){ var ic = {mock:'zap', partial:'alert', stale:'clock', locked:'lock', off:'eye', bad:'alert'}[kind] || 'alert'; return '<div class="a2-band ' + kind + '">' + a2i(ic, 16) + '<span>' + html + '</span>' + (btn || '') + '</div>'; }
function a2Mock(what){ return a2Bnd('mock', '<b>' + Le('Sample data', 'নমুনা ডেটা') + '</b> · ' + (what || L('nothing is really sent or charged', 'আসলে কিছু পাঠানো বা কাটা হয় না'))); }
function a2Skeleton(kind){
  var b = function(w, h, m){ return '<div class="a2-skel" style="width:' + w + ';height:' + h + 'px;margin:' + (m || '0 0 10px') + '"></div>'; };
  var kp = '<div class="a2-kpis">' + [1, 2, 3, 4].map(function(){ return '<div class="a2-card a2-kpi">' + b('50%', 12) + b('70%', 26) + b('40%', 12, '8px 0 0') + '</div>'; }).join('') + '</div>';
  var rows = ''; for(var i = 0; i < 7; i++) rows += '<div style="display:flex;gap:14px;padding:12px 14px;border-bottom:1px solid #F0ECE4">' + b('18px', 18, '0') + b('22%', 14, '0') + b('30%', 14, '0') + b('14%', 14, '0') + b('12%', 14, '0') + '</div>';
  return '<div aria-busy="true" aria-label="' + Le('Loading', 'লোড হচ্ছে') + '">' + (kind === 'form' ? '' : kp) + '<div class="a2-card flush">' + rows + '</div></div>';
}

/* ---------- placeholder for sections built in phase 2 ---------- */
function a2Placeholder(sec){
  if(!sec) return a2State('notfound');
  var links = (sec.classic || []).map(function(c){ return '<a class="a2-btn" href="#/admin-classic' + c[0] + '">' + a2i('ext', 15) + esc(c[1]) + '</a>'; }).join('');
  return a2Head({sec:sec, page:null, path:sec.base}, {sub:Le(sec.purpose || '', sec.purposeBn || '')}) +
    '<div class="a2-state"><div class="a2-sti">' + a2i(sec.icon, 26) + '</div><h3>' + Le(sec.en + ' moves here next', sec.bn + ' পরের ধাপে এখানে আসছে') + '</h3><p>' +
    Le('This section is being rebuilt in the new design. Everything it does still works today in the classic admin — open it below.', 'এই সেকশন নতুন ডিজাইনে বানানো হচ্ছে। এর সব কাজ এখনো পুরনো অ্যাডমিনে চলে — নিচে খুলুন।') + '</p>' +
    '<div class="a2-gap8" style="justify-content:center">' + links + '</div>' +
    (sec.tree ? '<div class="a2-sm a2-mute" style="max-width:640px;margin-top:6px"><b>' + Le('Pages planned: ', 'যে পাতাগুলো আসছে: ') + '</b>' + esc(sec.tree) + '</div>' : '') + '</div>';
}

/* ---------- drawer (right side on desktop, bottom sheet on phone) ---------- */
function a2Drawer(o){
  A2.drawerOpen = true;
  return '<div class="a2-scrim" data-act="' + (o.close || 'a2-drw-x') + '"' + (o.closeData || '') + ' aria-hidden="true"></div><aside class="a2-drw' + (o.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(o.label || o.title || '') + '" data-a2pop>' +
    '<div class="a2-drh"><div>' + (o.eyebrow ? '<div class="a2-xs a2-mute" style="margin-bottom:3px">' + o.eyebrow + '</div>' : '') + '<h2 class="a2-h3">' + (o.titleHtml || esc(o.title || '')) + '</h2>' + (o.sub ? '<div class="a2-cs">' + o.sub + '</div>' : '') + '</div>' +
    '<button type="button" class="a2-icb" data-act="' + (o.close || 'a2-drw-x') + '"' + (o.closeData || '') + ' aria-label="' + Le('Close', 'বন্ধ') + '">' + a2i('x', 18) + '</button></div>' +
    '<div class="a2-drb">' + o.body + '</div>' + (o.foot ? '<div class="a2-drf">' + o.foot + '</div>' : '') + '</aside>';
}
ACT['a2-drw-x'] = function(el){ var k = el.getAttribute('data-k'); if(k && UI[k]) { if(UI[k].peek !== undefined) UI[k].peek = null; else UI[k] = null; } else a2CloseDrawers(); UI.a2pop = null; A2.drawerOpen = false; rerender(); };
/* a generic drawer driven by UI['a2d:<id>'] = {…} and A2.drawers[id](state) */
A2.drawers = {};
function a2DrawerOf(){ var out = ''; Object.keys(UI).forEach(function(k){ if(k.indexOf('a2d:') === 0 && UI[k] && A2.drawers[k.slice(4)]) out = A2.drawers[k.slice(4)](UI[k]); }); return out; }
ACT['a2-dopen'] = function(el){ var id = el.getAttribute('data-d'); a2CloseDrawers(); UI['a2d:' + id] = {v:el.getAttribute('data-v') || 1}; rerender(); };

/* ---------- confirm dialog with preview and reason ([confirm] actions, §5.0) ---------- */
/* o: {title, bn, body, effects:[text], reason:true|'optional', ok, okBn, tone:'pri'|'badf', fn(reason)} */
function a2Confirm(o){
  var old = document.querySelector('.a2-ov'); if(old) old.remove();
  var d = document.createElement('div'); d.className = 'adm2 a2-ov mid'; d.setAttribute('translate', 'no');
  d.innerHTML = '<div class="a2-dlg' + (o.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="a2dlgt"><div class="a2-dlgh"><div><h2 class="a2-h3" id="a2dlgt">' + Le(o.title, o.bn) + '</h2>' + (o.sub ? '<div class="a2-cs">' + o.sub + '</div>' : '') + '</div><button type="button" class="a2-icb" data-x aria-label="Close">' + a2i('x', 18) + '</button></div>' +
    '<div class="a2-dlgb">' + (o.body || '') + (o.effects && o.effects.length ? '<div class="a2-xs a2-mute a2-b" style="margin-top:4px">' + Le('What will happen', 'যা হবে') + '</div><ul class="a2-eff">' + o.effects.map(function(e){ return '<li>' + a2i('check', 14) + '<span>' + e + '</span></li>'; }).join('') + '</ul>' : '') +
    (o.reason ? '<label class="a2-lbl" for="a2dlgr">' + Le(o.reason === 'optional' ? 'Note (optional)' : 'Reason (required)', o.reason === 'optional' ? 'নোট (ইচ্ছা হলে)' : 'কারণ (লিখতেই হবে)') + '</label><textarea id="a2dlgr" class="a2-ta" rows="2" placeholder="' + esc(o.ph || L('Write a short reason — it goes into the audit log', 'ছোট করে কারণ লিখুন — অডিট লগে থাকবে')) + '"></textarea>' : '') +
    (o.extra || '') + '</div><div class="a2-dlgf"><button type="button" class="a2-btn" data-x>' + Le('Cancel', 'বাতিল') + '</button><button type="button" class="a2-btn ' + (o.tone || 'pri') + '" data-ok>' + Le(o.ok || 'Confirm', o.okBn || 'নিশ্চিত') + '</button></div></div>';
  document.body.appendChild(d);
  var close = function(){ d.remove(); document.removeEventListener('keydown', kd, true); };
  var kd = function(ev){ if(ev.key === 'Escape'){ ev.stopPropagation(); close(); } };
  document.addEventListener('keydown', kd, true);
  d.addEventListener('click', function(ev){
    if(ev.target === d || ev.target.closest('[data-x]')) return close();
    if(ev.target.closest('[data-ok]')){
      var ta = d.querySelector('#a2dlgr'), r = ta ? ta.value.trim() : '';
      if(o.reason === true && !r){ ta.focus(); ta.setAttribute('aria-invalid', 'true'); ta.style.borderColor = '#B4453B'; return; }
      var vals = {}; d.querySelectorAll('[data-f]').forEach(function(x){ vals[x.getAttribute('data-f')] = x.type === 'checkbox' ? x.checked : x.value; });
      close(); try{ o.fn(r, vals); }catch(e){ console.error(e); }
    }
  });
  setTimeout(function(){ var f = d.querySelector('#a2dlgr') || d.querySelector('[data-f]') || d.querySelector('[data-ok]'); if(f) f.focus(); }, 20);
}

/* ---------- list pattern ---------- */
/* cfg: {id, rows, views:[{id,en,bn,fn}], search:{en,bn,fn}, filters:[{id,en,bn,opts:[[v,en,bn]],fn}], cols:[{en,bn,r,cls,k:'h'|'w'|'x'|'c',w}],
        key, href, peek(row)→{title,sub,body,foot}, bulk:[{id,en,bn,tone,skip(row)→reason|null,run(rows)}], empty:{t,s,action}, pageSize, saveViews:true} */
function a2List(cfg){
  var u = ui('a2l:' + cfg.id, {v:cfg.view || (cfg.views && cfg.views[0] ? cfg.views[0].id : ''), q:'', f:{}, sel:{}, peek:null, n:cfg.pageSize || 25});
  if(cfg.forceView){ u.v = cfg.forceView; }
  A2.lists[cfg.id] = cfg;
  var custom = (a2S().views || []).filter(function(v){ return v.list === cfg.id; });
  var views = (cfg.views || []).concat(custom.map(function(c){ return {id:c.id, en:c.name, bn:c.name, custom:c}; }));
  var cv = views.filter(function(v){ return v.id === u.v; })[0] || views[0];
  if(cv && cv.custom && !u._applied){ u.q = cv.custom.q || ''; u.f = JSON.parse(JSON.stringify(cv.custom.f || {})); u._applied = true; }
  var base = cfg.rows, rows = base.filter(function(r){ return !cv || !cv.fn || cv.fn(r); });
  if(cv && cv.custom && cv.custom.base){ var bv = (cfg.views || []).filter(function(v){ return v.id === cv.custom.base; })[0]; if(bv && bv.fn) rows = base.filter(bv.fn); }
  if(u.q && cfg.search) { var qq = u.q.toLowerCase().trim(); rows = rows.filter(function(r){ return cfg.search.fn(r, qq); }); }
  (cfg.filters || []).forEach(function(f){ var v = u.f[f.id]; if(v) rows = rows.filter(function(r){ return f.fn(r, v); }); });
  var key = cfg.key || function(r){ return r.id; };
  var vh = views.length ? '<div class="a2-views" role="tablist" aria-label="' + Le('Saved views', 'সেভ করা ভিউ') + '">' + views.map(function(v){ var n = v.fn ? base.filter(v.fn).length : v.custom ? '' : base.length; return '<button type="button" role="tab" aria-selected="' + (cv === v) + '" class="a2-view' + (cv === v ? ' on' : '') + '" data-act="a2-lv" data-l="' + cfg.id + '" data-v="' + esc(v.id) + '">' + Le(v.en, v.bn) + (n !== '' && v.count !== false ? '<span class="a2-cnt">' + n + '</span>' : '') + '</button>'; }).join('') +
    (cfg.saveViews !== false && (u.q || Object.keys(u.f).some(function(k){ return u.f[k]; })) ? '<button type="button" class="a2-view" data-act="a2-lsave" data-l="' + cfg.id + '">' + a2i('plus', 14) + Le('Save this view', 'এই ভিউ সেভ') + '</button>' : '') + '</div>' : '';
  var fb = (cfg.search || (cfg.filters && cfg.filters.length)) ? '<div class="a2-fbar">' + (cfg.search ? '<label class="a2-fsrch"><span class="a2-sr">' + Le(cfg.search.en, cfg.search.bn) + '</span>' + a2i('search', 16) + '<input id="a2q-' + cfg.id + '" class="a2-inp" type="search" value="' + esc(u.q) + '" placeholder="' + esc(L(cfg.search.en, cfg.search.bn)) + '" data-input="a2-lq" data-l="' + cfg.id + '" autocomplete="off"></label>' : '') +
    (cfg.filters || []).map(function(f){ return '<label class="a2-sr" for="a2f-' + cfg.id + '-' + f.id + '">' + Le(f.en, f.bn) + '</label><select id="a2f-' + cfg.id + '-' + f.id + '" class="a2-sel" data-change="a2-lf" data-l="' + cfg.id + '" data-f="' + f.id + '"><option value="">' + Le(f.en, f.bn) + ': ' + Le('all', 'সব') + '</option>' + f.opts.map(function(o){ return '<option value="' + esc(o[0]) + '"' + (u.f[f.id] === o[0] ? ' selected' : '') + '>' + Le(o[1], o[2]) + '</option>'; }).join('') + '</select>'; }).join('') +
    (cfg.tools || '') + '</div>' : '';
  var selKeys = Object.keys(u.sel).filter(function(k){ return u.sel[k]; }), hasBulk = cfg.bulk && cfg.bulk.length;
  var shown = rows.slice(0, u.n);
  var allOn = shown.length && shown.every(function(r){ return u.sel[key(r)]; });
  var th = (hasBulk ? '<th class="w0"><input type="checkbox" class="a2-chk" data-change="a2-lall" data-l="' + cfg.id + '" aria-label="' + Le('Select all shown', 'সব বাছুন') + '"' + (allOn ? ' checked' : '') + '></th>' : '') + cfg.cols.map(function(c){ return '<th class="' + (c.cls || '') + '">' + Le(c.en, c.bn) + '</th>'; }).join('');
  var tr = shown.map(function(r){ var k = key(r), sel = !!u.sel[k];
    return '<tr class="' + (sel ? 'sel' : '') + (u.peek === k ? ' open' : '') + '" data-act="a2-lrow" data-l="' + cfg.id + '" data-k="' + esc(k) + '" tabindex="0">' +
      (hasBulk ? '<td class="w0 a2-tdc" data-stop><input type="checkbox" class="a2-chk" data-change="a2-lsel" data-l="' + cfg.id + '" data-k="' + esc(k) + '" aria-label="' + Le('Select', 'বাছুন') + ' ' + esc(k) + '"' + (sel ? ' checked' : '') + '></td>' : '') +
      cfg.cols.map(function(c, i){ var cl = (c.cls || '') + (c.k === 'h' ? ' a2-tdh' : c.k === 'w' ? ' a2-tdw' : c.k === 'x' ? ' a2-tdx' : ''); return '<td class="' + cl + '"' + (c.k !== 'h' ? ' data-l="' + esc(L(c.en, c.bn)) + '"' : '') + '>' + c.r(r) + '</td>'; }).join('') + '</tr>'; }).join('');
  var table = rows.length ? '<div class="a2-tblw"><table class="a2-tbl"><thead><tr>' + th + '</tr></thead><tbody>' + tr + '</tbody></table>' +
    '<div class="a2-tblf"><span>' + Le('Showing ', 'দেখাচ্ছে ') + shown.length + Le(' of ', ' / ') + rows.length + '</span>' + (rows.length > shown.length ? '<button type="button" class="a2-btn sm" data-act="a2-lmore" data-l="' + cfg.id + '">' + Le('Show more', 'আরও দেখুন') + '</button>' : '') + (cfg.foot || '') + '</div></div>' :
    a2State('empty', cfg.empty || {t:L('Nothing matches', 'কিছু মেলেনি'), s:L('Try another view or clear the search.', 'অন্য ভিউ দেখুন বা সার্চ মুছে দিন।'), action:'<button type="button" class="a2-btn" data-act="a2-lclear" data-l="' + cfg.id + '">' + Le('Clear filters', 'ফিল্টার মুছুন') + '</button>', icon:'search'});
  var bulk = '';
  if(hasBulk && selKeys.length){
    var selRows = base.filter(function(r){ return u.sel[key(r)]; });
    var skips = [];
    var btns = cfg.bulk.filter(function(b){ return a2Can(b.perm); }).map(function(b){
      var bad = b.skip ? selRows.filter(function(r){ return b.skip(r); }) : [], okN = selRows.length - bad.length;
      if(bad.length){ var why = {}; bad.forEach(function(r){ var w = b.skip(r); why[w] = (why[w] || 0) + 1; }); skips.push('<b>' + Le(b.en, b.bn) + ':</b> ' + Object.keys(why).map(function(w){ return why[w] + ' ' + w; }).join(', ') + ' ' + L('will be skipped', 'বাদ যাবে')); }
      return '<button type="button" class="a2-btn sm' + (b.tone === 'pri' ? ' pri' : '') + '" data-act="a2-lbulk" data-l="' + cfg.id + '" data-b="' + b.id + '"' + (okN ? '' : ' disabled') + '>' + Le(b.en, b.bn) + (bad.length ? ' (' + okN + ')' : '') + '</button>';
    }).join('');
    bulk = '<div class="a2-bulk" role="region" aria-label="' + Le('Bulk actions', 'একসাথে কাজ') + '"><b>' + selKeys.length + Le(' selected', 'টা বাছা') + '</b>' + btns + '<button type="button" class="a2-btn sm ghost" style="color:#C9D9D3" data-act="a2-lnone" data-l="' + cfg.id + '">' + Le('Clear', 'মুছুন') + '</button>' +
      (skips.length ? '<div class="a2-skip">' + a2i('alert', 14) + '<span>' + skips.join(' · ') + '</span></div>' : '') + '</div>';
  }
  var drawer = '';
  if(u.peek && cfg.peek){ var pr = base.filter(function(r){ return key(r) === u.peek; })[0]; if(pr){ var pk = cfg.peek(pr); drawer = a2Drawer(Object.assign({close:'a2-drw-x', closeData:' data-k="a2l:' + cfg.id + '"'}, pk)); } }
  A2.drawer = drawer || A2.drawer;
  return vh + fb + table + bulk;
}
ACT['a2-lv'] = function(el){ var u = UI['a2l:' + el.getAttribute('data-l')]; if(!u) return; u.v = el.getAttribute('data-v'); u.sel = {}; u._applied = false; u.n = (A2.lists[el.getAttribute('data-l')] || {}).pageSize || 25; var cust = (a2S().views || []).filter(function(v){ return v.id === u.v; })[0]; if(!cust){ u.q = ''; u.f = {}; } rerender(); };
ACT['a2-lrow'] = function(el, ev){
  if(ev.target.closest('[data-stop]') || ev.target.closest('a,button,input,select,label') && ev.target.closest('a,button,input,select,label') !== el) return;
  var id = el.getAttribute('data-l'), cfg = A2.lists[id], k = el.getAttribute('data-k'), u = UI['a2l:' + id]; if(!cfg) return;
  if(cfg.peek){ u.peek = k; rerender(); } else if(cfg.href){ var r = cfg.rows.filter(function(x){ return (cfg.key || function(z){ return z.id; })(x) === k; })[0]; if(r) go(cfg.href(r)); }
};
document.addEventListener('keydown', function(ev){ if(ev.key === 'Enter' && ev.target && ev.target.matches && ev.target.matches('tr[data-act="a2-lrow"]')){ ev.preventDefault(); ACT['a2-lrow'](ev.target, ev); } });
CHANGE['a2-lsel'] = function(el){ var u = UI['a2l:' + el.getAttribute('data-l')]; u.sel[el.getAttribute('data-k')] = el.checked; rerender(); };
CHANGE['a2-lall'] = function(el){ var id = el.getAttribute('data-l'), cfg = A2.lists[id], u = UI['a2l:' + id]; document.querySelectorAll('input[data-change="a2-lsel"][data-l="' + id + '"]').forEach(function(c){ u.sel[c.getAttribute('data-k')] = el.checked; }); rerender(); };
ACT['a2-lnone'] = function(el){ UI['a2l:' + el.getAttribute('data-l')].sel = {}; rerender(); };
ACT['a2-lmore'] = function(el){ UI['a2l:' + el.getAttribute('data-l')].n += 25; rerender(); };
ACT['a2-lclear'] = function(el){ var u = UI['a2l:' + el.getAttribute('data-l')]; u.q = ''; u.f = {}; rerender(); };
CHANGE['a2-lf'] = function(el){ var u = UI['a2l:' + el.getAttribute('data-l')]; u.f[el.getAttribute('data-f')] = el.value; u.sel = {}; rerender(); };
INPUT['a2-lq'] = function(el){ var u = UI['a2l:' + el.getAttribute('data-l')]; u.q = el.value; clearTimeout(A2.qt); A2.focus = {id:el.id, s:el.selectionStart}; A2.qt = setTimeout(function(){ rerender(); }, 220); };
function a2RestoreFocus(){ var f = A2.focus; if(!f) return; A2.focus = null; var el = document.getElementById(f.id); if(el){ el.focus(); try{ el.setSelectionRange(f.s, f.s); }catch(e){} } }
ACT['a2-lsave'] = function(el){
  var id = el.getAttribute('data-l'), u = UI['a2l:' + id];
  a2Confirm({title:'Save this view', bn:'এই ভিউ সেভ করুন', body:'<label class="a2-lbl" for="a2vn">' + Le('Name', 'নাম') + '</label><input id="a2vn" class="a2-inp" data-f="name" value="' + esc(u.q ? '“' + u.q + '”' : L('My view', 'আমার ভিউ')) + '">', ok:'Save view', okBn:'সেভ',
    fn:function(r, v){ var vid = 'cv' + Date.now(); a2S().views.push({id:vid, list:id, name:v.name || 'My view', q:u.q, f:JSON.parse(JSON.stringify(u.f)), base:u.v}); u.v = vid; u._applied = true; saveState(); rerender(); toast(L('View saved — it is in the chips above', 'ভিউ সেভ হয়েছে')); }});
};
ACT['a2-lbulk'] = function(el){
  var id = el.getAttribute('data-l'), cfg = A2.lists[id], u = UI['a2l:' + id], b = (cfg.bulk || []).filter(function(x){ return x.id === el.getAttribute('data-b'); })[0]; if(!b) return;
  var key = cfg.key || function(r){ return r.id; }, sel = cfg.rows.filter(function(r){ return u.sel[key(r)]; }), ok = sel.filter(function(r){ return !b.skip || !b.skip(r); }), skipped = sel.length - ok.length;
  var run = function(reason){ var res = b.run(ok, reason) || ''; u.sel = {}; saveState(); rerender(); toast(L(ok.length + ' done', ok.length + 'টা হয়েছে') + (skipped ? L(' · ' + skipped + ' skipped (reason shown on the bar)', ' · ' + skipped + 'টা বাদ') : '') + (res ? ' · ' + res : '')); };
  if(b.confirm) a2Confirm({title:b.en + ' — ' + ok.length, bn:b.bn, effects:b.confirm(ok), reason:b.reason, ok:b.en, okBn:b.bn, tone:b.tone === 'bad' ? 'badf' : 'pri', fn:run}); else run('');
};

/* ---------- detail pattern: header + cards (⅔) + timeline (⅓) ---------- */
function a2Detail(o){
  var dt = ui('a2dt', {t:'main'});
  return (o.lock ? '<div class="a2-lock">' + a2i('lock', 16) + '<span>' + o.lock + '</span></div>' : '') + (o.bands || '') +
    '<div class="a2-seg a2-dtabs" role="tablist"><button type="button" class="' + (dt.t === 'main' ? 'on' : '') + '" data-act="a2-dtab" data-v="main">' + Le('Details', 'বিস্তারিত') + '</button><button type="button" class="' + (dt.t === 'side' ? 'on' : '') + '" data-act="a2-dtab" data-v="side">' + Le('Timeline', 'টাইমলাইন') + '</button></div>' +
    '<div class="a2-dgrid" data-dt="' + dt.t + '"><div class="a2-dmain a2-stack">' + o.main.join('') + '</div><div class="a2-dside a2-stack">' + o.side + '</div></div>';
}
ACT['a2-dtab'] = function(el){ ui('a2dt', {}).t = el.getAttribute('data-v'); rerender(); };
/* timeline: events [{at, t, s, k, who}] newest first */
function a2TL(events, empty){ if(!events.length) return '<div class="a2-sm a2-mute">' + (empty || Le('Nothing yet', 'এখনো কিছু নেই')) + '</div>'; return '<div class="a2-tl">' + events.map(function(e){ return '<div class="a2-tli ' + (e.k || '') + '"><b>' + esc(e.t) + '</b><span>' + a2dt(e.at) + (e.who ? ' · ' + esc(e.who) : '') + '</span>' + (e.s ? '<p>' + e.s + '</p>' : '') + '</div>'; }).join('') + '</div>'; }

/* ---------- form pattern: anchors with ✓/!, sections, readiness, sticky save ---------- */
function a2Form(o){
  var anch = '<nav class="a2-anch" aria-label="' + Le('Form sections', 'ফর্মের অংশ') + '">' + o.sections.map(function(s){ return '<a href="javascript:void 0" data-act="a2-anchor" data-t="a2fs-' + s.id + '"><span class="' + (s.ok === true ? 'ok' : s.ok === false ? 'warn' : 'a2-faint') + '">' + a2i(s.ok === true ? 'check' : s.ok === false ? 'alert' : 'more', 15) + '</span>' + Le(s.en, s.bn) + '</a>'; }).join('') + '</nav>';
  var body = o.sections.map(function(s){ return '<section class="a2-card a2-fs" id="a2fs-' + s.id + '"><div class="a2-ch"><div><h2 class="a2-h3">' + Le(s.en, s.bn) + '</h2>' + (s.sub ? '<div class="a2-cs">' + s.sub + '</div>' : '') + '</div>' + (s.right || '') + '</div>' + s.html + '</section>'; }).join('');
  var ready = o.ready ? '<aside class="a2-formr a2-stack"><div class="a2-card"><h2 class="a2-h3">' + Le(o.ready.en || 'Ready to place?', o.ready.bn || 'অর্ডার দেওয়ার জন্য তৈরি?') + '</h2><ul class="a2-ready" style="margin-top:10px">' + o.ready.items.map(function(i){ return '<li class="' + (i.ok ? 'ok' : 'warn') + '">' + a2i(i.ok ? 'check' : 'alert', 15) + '<span>' + i.t + '</span></li>'; }).join('') + '</ul>' + (o.ready.extra || '') + '</div>' + (o.aside || '') + '</aside>' : '';
  return '<div class="a2-form">' + anch + '<div>' + body + '</div>' + ready + '</div>' +
    '<div class="a2-savebar"><span class="a2-sm a2-mute">' + (o.saveNote || '') + '</span><div class="a2-gap8">' + (o.secondary || '') + o.save + '</div></div>';
}
ACT['a2-anchor'] = function(el){ var t = document.getElementById(el.getAttribute('data-t')); if(t) t.scrollIntoView({behavior:'smooth', block:'start'}); };

/* ---------- settings card: one feature, off by default, values fold away, default shown, Reset ---------- */
/* o: {id, en, bn, where, desc, descBn, key (bool setting) | on/act, fields:[{k, en, bn, type:'num'|'text'|'sel'|'sw'|'area', opts, def}], reset:[keys], money:true} */
function a2SetCard(o){
  var on = o.key ? !!a2Set(o.key) : o.on, sw = o.key || o.act;
  var field = function(f){
    var v = f.get ? f.get() : a2Set(f.k), id = 'a2sf-' + f.k.replace(/\W/g, '-'), def = f.def != null ? f.def : A2_SET_DEF[f.k], defTxt = def === '' || def == null ? L('empty — you fill it in', 'খালি — আপনি দেবেন') : typeof def === 'boolean' ? (def ? L('on', 'চালু') : L('off', 'বন্ধ')) : def;
    var act = f.set ? ' data-fn="' + esc(f.set) + '"' : '';
    if(f.type === 'sw') return '<div class="a2-fld a2-swl"><span>' + Le(f.en, f.bn) + '<span class="a2-def" style="display:block">' + Le('Default: ', 'ডিফল্ট: ') + esc(defTxt) + '</span></span><button type="button" class="a2-sw' + (v ? ' on' : '') + '" role="switch" aria-checked="' + !!v + '" aria-label="' + esc(L(f.en, f.bn)) + '" data-act="a2-setsw" data-k="' + f.k + '"' + act + (o.money ? ' data-money="1"' : '') + '></button></div>';
    var input = f.type === 'sel' ? '<select id="' + id + '" class="a2-sel" data-change="a2-setv" data-k="' + f.k + '"' + act + (o.money ? ' data-money="1"' : '') + '>' + f.opts.map(function(x){ return '<option value="' + esc(x[0]) + '"' + (String(v) === String(x[0]) ? ' selected' : '') + '>' + Le(x[1], x[2]) + '</option>'; }).join('') + '</select>' :
      f.type === 'area' ? '<textarea id="' + id + '" class="a2-ta" rows="2" data-change="a2-setv" data-k="' + f.k + '"' + act + '>' + esc(v) + '</textarea>' :
      '<input id="' + id + '" class="a2-inp" type="' + (f.type === 'num' ? 'number' : 'text') + '" value="' + esc(v) + '" placeholder="' + esc(f.ph || L('Not set', 'দেওয়া নেই')) + '" data-change="a2-setv" data-k="' + f.k + '"' + act + (f.type === 'num' ? ' data-num="1"' : '') + (o.money ? ' data-money="1"' : '') + '>';
    return '<div class="a2-fld' + (f.type === 'area' ? '" style="grid-column:1/-1' : '') + '"><label class="a2-lbl" for="' + id + '">' + Le(f.en, f.bn) + '</label>' + input + '<div class="a2-def">' + Le('Default: ', 'ডিফল্ট: ') + esc(defTxt) + '</div></div>';
  };
  var showFields = o.fields && o.fields.length && (on !== false || !sw);
  return '<section class="a2-sc" id="a2s-' + o.id + '"><div class="a2-sch"><div>' + (o.where ? '<div class="a2-scw">' + esc(o.where) + '</div>' : '') + '<h3 class="a2-h3">' + Le(o.en, o.bn) + (sw ? ' <span class="a2-pill ' + (on ? 'ok' : 'line') + '">' + (on ? Le('On', 'চালু') : Le('Off', 'বন্ধ')) + '</span>' : '') + '</h3>' + (o.desc ? '<p class="a2-scd">' + Le(o.desc, o.descBn) + '</p>' : '') + '</div>' +
    (sw ? '<button type="button" class="a2-sw' + (on ? ' on' : '') + '" role="switch" aria-checked="' + !!on + '" aria-label="' + esc(L(o.en, o.bn)) + '" data-act="' + (o.key ? 'a2-setsw' : o.act) + '" data-k="' + esc(o.key || o.actKey || '') + '"' + (o.money ? ' data-money="1"' : '') + '></button>' : '') + '</div>' +
    (showFields ? '<div class="a2-scb"><div class="a2-scv">' + o.fields.map(field).join('') + '</div>' + (o.extra || '') + (o.reset ? '<div style="margin-top:12px"><button type="button" class="a2-btn sm ghost" data-act="a2-setreset" data-keys="' + o.reset.join(',') + '">' + a2i('refresh', 14) + Le('Reset to default', 'ডিফল্টে ফেরান') + '</button></div>' : '') + '</div>' : (sw && !on && o.fields && o.fields.length ? '<div class="a2-xs a2-faint" style="margin-top:8px">' + Le('Turn it on to see its options.', 'চালু করলে অপশনগুলো দেখা যাবে।') + '</div>' : '')) + '</section>';
}
A2.setFns = {};
ACT['a2-setsw'] = function(el){
  var k = el.getAttribute('data-k'), fn = el.getAttribute('data-fn'), cur = fn && A2.setFns[fn] ? A2.setFns[fn].get() : !!a2Set(k), apply = function(){ if(fn && A2.setFns[fn]) A2.setFns[fn].set(!cur); else a2SetV(k, !cur); rerender(); toast((!cur ? L('Turned on', 'চালু হয়েছে') : L('Turned off', 'বন্ধ হয়েছে')) + L(' — saved, shown in the audit log', ' — সেভ হয়েছে')); };
  if(el.getAttribute('data-money')) a2Confirm({title:'Change a money setting?', bn:'টাকার সেটিং বদলাবেন?', effects:[L('This changes what customers pay or what you collect.', 'এতে কাস্টমারের টাকা বা আপনার আদায় বদলায়।'), L('It starts with the next order; placed orders keep their price.', 'পরের অর্ডার থেকে চালু হবে।')], reason:true, fn:apply}); else apply();
};
CHANGE['a2-setv'] = function(el){
  var k = el.getAttribute('data-k'), fn = el.getAttribute('data-fn'), v = el.value; if(el.getAttribute('data-num')) v = v === '' ? '' : +v;
  var apply = function(){ if(fn && A2.setFns[fn]) A2.setFns[fn].set(v); else a2SetV(k, v); rerender(); toast(L('Saved', 'সেভ হয়েছে')); };
  if(el.getAttribute('data-money')) a2Confirm({title:'Change a money setting?', bn:'টাকার সেটিং বদলাবেন?', effects:[L('New value: ', 'নতুন মান: ') + esc(v), L('It starts with the next order; placed orders keep their price.', 'পরের অর্ডার থেকে চালু হবে।')], reason:true, fn:apply}); else apply();
};
ACT['a2-setreset'] = function(el){ var keys = el.getAttribute('data-keys').split(','); a2Confirm({title:'Reset to default?', bn:'ডিফল্টে ফেরাবেন?', effects:keys.map(function(k){ return k + ' → ' + (A2_SET_DEF[k] === '' ? L('empty', 'খালি') : String(A2_SET_DEF[k])); }), fn:function(){ a2SetReset(keys); rerender(); toast(L('Back to default', 'ডিফল্টে ফিরেছে')); }}); };

/* ---------- board (drag only where legal → here: buttons on each card) ---------- */
function a2Board(cols){ return '<div class="a2-board">' + cols.map(function(c){ return '<div class="a2-col"><div class="a2-colh"><span>' + Le(c.en, c.bn) + '</span><span class="a2-pill line">' + c.cards.length + '</span></div>' + (c.cards.length ? c.cards.join('') : '<div class="a2-xs a2-mute" style="padding:6px">' + Le('Nothing here', 'কিছু নেই') + '</div>') + '</div>'; }).join('') + '</div>'; }

/* ---------- command palette (SH-02) ---------- */
function a2PalOpen(q){
  var old = document.querySelector('.a2-ov'); if(old) old.remove();
  UI.a2pop = null;
  var d = document.createElement('div'); d.className = 'adm2 a2-ov'; d.setAttribute('translate', 'no');
  d.innerHTML = '<div class="a2-pal" role="dialog" aria-modal="true" aria-label="' + Le('Search', 'সার্চ') + '"><div class="a2-palin">' + a2i('search', 19) + '<input type="text" id="a2palq" value="' + esc(q || '') + '" placeholder="' + esc(L('Type a page, setting, order no., phone, product…', 'পাতা, সেটিং, অর্ডার নম্বর, ফোন, প্রোডাক্ট লিখুন…')) + '" autocomplete="off" aria-controls="a2palb" aria-autocomplete="list"><kbd>Esc</kbd></div><div class="a2-palb" id="a2palb" role="listbox"></div>' +
    '<div class="a2-palf"><span><kbd>↑</kbd><kbd>↓</kbd> ' + Le('move', 'সরান') + '</span><span><kbd>Enter</kbd> ' + Le('open', 'খুলুন') + '</span><span class="a2-hide-ph">' + Le('> actions · # order · ? help · Bengali words work', '> কাজ · # অর্ডার · ? সাহায্য · বাংলা শব্দেও খোঁজে') + '</span></div></div>';
  document.body.appendChild(d);
  var inp = d.querySelector('#a2palq'), box = d.querySelector('#a2palb'), sel = 0, items = [];
  var draw = function(){
    var res = a2PalSearch(inp.value); items = []; var h = '';
    res.forEach(function(g){ h += '<div class="a2-pg">' + esc(g.g) + '</div>'; g.items.forEach(function(it){ var i = items.length; items.push(it); h += '<button type="button" class="a2-pi' + (i === sel ? ' sel' : '') + '" role="option" aria-selected="' + (i === sel) + '" data-i="' + i + '">' + a2i(it.ic || 'cr', 17) + '<div><b>' + esc(it.t) + '</b>' + (it.s ? '<span>' + esc(it.s) + '</span>' : '') + '</div><span class="a2-ent">' + a2i('enter', 15) + '</span></button>'; }); });
    box.innerHTML = h || '<div class="a2-palx">' + Le('No match. Try an order number (#1043), a phone, or a word like “cod”.', 'কিছু মেলেনি। অর্ডার নম্বর, ফোন বা “cod” লিখে দেখুন।') + '</div>';
    var s = box.querySelector('.a2-pi.sel'); if(s) s.scrollIntoView({block:'nearest'});
  };
  var open = function(it){ if(!it) return; close(); if(it.fn) it.fn(); else if(it.h) go(it.h); };
  var close = function(){ d.remove(); document.removeEventListener('keydown', kd, true); };
  var kd = function(ev){
    if(ev.key === 'Escape'){ ev.preventDefault(); ev.stopPropagation(); close(); }
    else if(ev.key === 'ArrowDown'){ ev.preventDefault(); sel = Math.min(items.length - 1, sel + 1); draw(); }
    else if(ev.key === 'ArrowUp'){ ev.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    else if(ev.key === 'Enter'){ ev.preventDefault(); open(items[sel]); }
  };
  document.addEventListener('keydown', kd, true);
  inp.addEventListener('input', function(){ sel = 0; draw(); });
  d.addEventListener('click', function(ev){ if(ev.target === d) return close(); var b = ev.target.closest('.a2-pi'); if(b) open(items[+b.getAttribute('data-i')]); });
  draw(); setTimeout(function(){ inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }, 10);
}
ACT['a2-pal'] = function(){ UI.a2sb = false; a2PalOpen(''); };
/* settings registry for search: every setting card registers {id, en, bn, path, syn} */
A2.settings = [];
function a2RegSetting(id, en, bn, path, where, syn){ A2.settings = A2.settings.filter(function(s){ return s.id !== id; }); A2.settings.push({id:id, en:en, bn:bn, path:path, where:where, syn:syn || ''}); }
A2.actions = [];
function a2RegAction(en, bn, h, perm, syn){ A2.actions.push({en:en, bn:bn, h:h, perm:perm, syn:syn || ''}); }
function a2PalSearch(raw){
  var q = bnDigits ? bnDigits(String(raw || '')) : String(raw || ''), mode = '', out = [];
  if(/^[>#?]/.test(q)){ mode = q[0]; q = q.slice(1); }
  q = q.trim().toLowerCase(); var qd = q.replace(/\D/g, '');
  var has = function(s){ return String(s || '').toLowerCase().indexOf(q) >= 0; };
  var group = function(g, list, max){ if(list.length) out.push({g:g, items:list.slice(0, max || 5)}); };
  if(!q && !mode){
    group(L('Jump to', 'যান'), A2.sections.filter(a2SecVisible).map(function(s){ return {t:L(s.en, s.bn), s:L(A2_GROUPS.filter(function(g){ return g[0] === s.group; }).map(function(g){ return g[1]; })[0] || 'Sidebar', ''), h:'#' + (s.home || s.base), ic:s.icon}; }), 8);
    group(L('Actions', 'কাজ'), A2.actions.filter(function(a){ return a2Can(a.perm); }).map(function(a){ return {t:L(a.en, a.bn), h:a.h, ic:'zap'}; }), 5);
    return out;
  }
  var acts = A2.actions.filter(function(a){ return a2Can(a.perm) && (has(a.en) || has(a.bn) || has(a.syn)); }).map(function(a){ return {t:L(a.en, a.bn), h:a.h, ic:'zap'}; });
  if(mode === '>'){ group(L('Actions', 'কাজ'), acts); return out; }
  if(!mode){
    group(L('Settings', 'সেটিং'), A2.settings.filter(function(s){ var f = a2Find(s.path.split('?')[0]); return (!f || !f.page || a2Can(f.page.perm)) && (has(s.en) || has(s.bn) || has(s.syn)); }).map(function(s){ return {t:L(s.en, s.bn), s:s.where, h:'#' + s.path + (s.path.indexOf('?') >= 0 ? '&' : '?') + 'hl=' + s.id, ic:'sliders'}; }));
    var pages = [];
    A2.pages.forEach(function(p){ if(p.dyn || p.hidden || !a2Can(p.perm)) return; var sec = a2Sec(p.section); if(has(p.en) || has(p.bn) || has(p.syn) || (sec && (has(sec.en) || has(sec.bn)))) pages.push({t:L(p.en, p.bn), s:sec ? L(sec.en, sec.bn) : '', h:'#' + p.path, ic:sec ? sec.icon : 'file'}); });
    A2.sections.forEach(function(s){ if(!a2SecVisible(s) || A2.pages.some(function(p){ return p.section === s.id; })) return; if(has(s.en) || has(s.bn)) pages.push({t:L(s.en, s.bn), s:L('Section', 'সেকশন'), h:'#' + s.base, ic:s.icon}); });
    group(L('Pages', 'পাতা'), pages);
  }
  if(!mode || mode === '#'){
    if(a2Can('orders.read')) group(L('Orders', 'অর্ডার'), a2Orders().slice().sort(function(x, y){ var ex = x.id.toLowerCase().slice(-q.length) === q ? 0 : 1, ey = y.id.toLowerCase().slice(-q.length) === q ? 0 : 1; return ex - ey; }).filter(function(o){ return has(o.id) || (qd.length >= 4 && String(o.phone).replace(/\D/g, '').indexOf(qd.replace(/^880/, '0')) >= 0) || (mode !== '#' && has(o.name)) || has(a2O(o).cid); }).map(function(o){ return {t:o.id + ' · ' + o.name, s:(o.payment === 'cod' ? 'COD ' : '') + a2tk(o.total) + ' · ' + L(A2_OST[a2O(o).ost][0], A2_OST[a2O(o).ost][1]), h:'#/admin/orders/' + o.id, ic:'bag'}; }));
  }
  if(mode === '#') return out;
  if(!mode && q.length >= 2){
    if(a2Can('products.read') || a2Can('orders.read')) group(L('Products', 'প্রোডাক্ট'), (DB.products || []).filter(function(p){ return has(p.name) || has(p.id) || p.colors.some(function(c){ return has(COL(c).name); }); }).map(function(p){ return {t:p.name, s:(CAT(p.cat) || {}).name + ' · ' + a2tk(p.price), h:'#/admin-classic/products/' + p.id, ic:'shirt'}; }));
    if(a2Can('customers.read') && typeof zr_all === 'function') group(L('Customers', 'কাস্টমার'), zr_all().filter(function(c){ return has(c.name) || (qd.length >= 4 && String(c.phone).indexOf(qd) >= 0); }).map(function(c){ return {t:c.name, s:(a2Set('customers.maskPhone') && a2S().role !== 'owner' ? a2ph(c.phone).slice(0, 7) + '•••' : a2ph(c.phone)) + ' · ' + c.n + L(' orders', ' অর্ডার'), h:'#/admin/customers/' + encodeURIComponent(c.id), ic:'users'}; }));
    group(L('Campaigns', 'ক্যাম্পেইন'), a2S().camps.filter(function(c){ return has(c.name); }).map(function(c){ return {t:c.name, s:c.st, h:'#/admin/messages/campaigns/' + c.id, ic:'mega'}; }));
  }
  if(!mode) group(L('Actions', 'কাজ'), acts);
  if(!mode || mode === '?') group(L('Help', 'সাহায্য'), Object.keys(A2_GUIDE).filter(function(k){ var g = A2_GUIDE[k]; var sc = a2Sec(k); return mode === '?' && (!q || has(g.t) || (sc && (has(sc.en) || has(sc.bn)))) || (!mode && (has(g.t) || (sc && has(sc.en)))); }).map(function(k){ var sc = a2Sec(k); return {t:L((sc ? sc.en : k) + ' — guide (Bengali)', A2_GUIDE[k].t + ' — এই সেকশনে কী করা যায়'), s:L('Help', 'সাহায্য'), ic:'book', fn:function(){ var b = document.createElement('button'); b.setAttribute('data-s', k); ACT['a2-guide'](b); }}; }));
  return out;
}

/* ---------- notifications drawer (SH-03): events, read/unread, Urgent · Important · FYI ---------- */
function a2NtfDrawer(){
  var S = a2S(), f = ui('a2ntf', {f:'all'}), list = S.ntf.filter(function(n){ return f.f === 'all' || (f.f === 'unread' ? !n.read : n.lvl === f.f); });
  var lv = {urgent:['Urgent', 'জরুরি', 'bad'], important:['Important', 'জরুরি না, তবে দরকারি', 'warn'], fyi:['FYI', 'জানার জন্য', 'line']};
  var body = '<div class="a2-seg" style="margin-bottom:12px">' + [['all', 'All', 'সব'], ['unread', 'Unread', 'না পড়া'], ['urgent', 'Urgent', 'জরুরি'], ['important', 'Important', 'দরকারি'], ['fyi', 'FYI', 'জানার জন্য']].map(function(x){ return '<button type="button" class="' + (f.f === x[0] ? 'on' : '') + '" data-act="a2-ntff" data-v="' + x[0] + '">' + Le(x[1], x[2]) + '</button>'; }).join('') + '</div>' +
    (list.length ? list.map(function(n){ var l = lv[n.lvl]; return '<a class="a2-task" href="#' + n.href + '" data-act="a2-ntfopen" data-id="' + n.id + '" style="' + (n.read ? 'opacity:.72' : '') + '"><span class="a2-tki ' + (n.lvl === 'urgent' ? 'bad' : n.lvl === 'important' ? 'warn' : 'mute') + '">' + a2i(n.lvl === 'urgent' ? 'alert' : 'bell', 16) + '</span><span class="a2-tkt"><b>' + (n.read ? '' : '● ') + Le(n.t, n.bn) + '</b><span>' + esc(n.s) + '</span><span>' + a2ago(n.at) + L(' ago', ' আগে') + '</span></span><span class="a2-pill ' + l[2] + '">' + Le(l[0], l[1]) + '</span></a>'; }).join('') : a2State('empty', {t:L('All caught up', 'সব দেখা হয়েছে'), icon:'bell'})) +
    '<p class="a2-xs a2-mute" style="margin-top:14px">' + Le('Notifications are things that happened once. Live work waiting for you is on the Dashboard under “Needs you now”. Kept 90 days; Urgent also goes to Telegram.', 'নোটিফিকেশন মানে একবার যা ঘটেছে। চলমান কাজ ড্যাশবোর্ডের “এখনই করতে হবে”-তে। 90 দিন থাকে; জরুরিগুলো Telegram-এও যায়।') + '</p>';
  return a2Drawer({title:L('Notifications', 'নোটিফিকেশন'), body:body, close:'a2-ntfx', foot:'<button type="button" class="a2-btn" data-act="a2-ntfall">' + a2i('check', 15) + Le('Mark all read', 'সব পড়া হয়েছে') + '</button>'});
}
ACT['a2-ntfx'] = function(){ UI.a2pop = null; A2.drawerOpen = false; rerender(); };
ACT['a2-ntff'] = function(el){ ui('a2ntf', {}).f = el.getAttribute('data-v'); rerender(); };
ACT['a2-ntfall'] = function(){ a2S().ntf.forEach(function(n){ n.read = true; }); saveState(); rerender(); };
ACT['a2-ntfopen'] = function(el){ var n = a2S().ntf.filter(function(x){ return x.id === el.getAttribute('data-id'); })[0]; if(n){ n.read = true; saveState(); } UI.a2pop = null; A2.drawerOpen = false; go(el.getAttribute('href')); };

/* small helpers used by every section */
function a2Thumb(pid, color){ var p = P(pid), hex = p ? COL(color || p.colors[0]).hex : '#999', lt = typeof isLight === 'function' && /^#[0-9a-f]{6}$/i.test(hex) && isLight(hex); return '<span class="a2-thumb" style="background:' + hex + (lt ? ';color:#47514C;box-shadow:inset 0 0 0 1px #E2DCCF' : '') + '">' + a2i('shirt', 18) + '</span>'; }
function a2PName(pid){ var p = P(pid); return p ? p.name : pid; }
function a2LineTxt(l){ return a2PName(l.product) + ' · ' + COL(l.color).name + ' · ' + l.size + (l.qty > 1 ? ' × ' + l.qty : ''); }
function a2Sw(on, act, attrs, label){ return '<button type="button" class="a2-sw' + (on ? ' on' : '') + '" role="switch" aria-checked="' + !!on + '" aria-label="' + esc(label || '') + '" data-act="' + act + '" ' + (attrs || '') + '></button>'; }
function a2Opt(list, v){ return list.map(function(x){ return '<option value="' + esc(x[0]) + '"' + (String(v) === String(x[0]) ? ' selected' : '') + '>' + Le(x[1], x[2] || x[1]) + '</option>'; }).join(''); }
