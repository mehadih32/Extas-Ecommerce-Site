/* =====================================================================
   R15 wave 1 (Prohori) · ONE NAVIGATION MODEL
   ---------------------------------------------------------------------
   1. The browser's own history is the only truth. Every history entry the
      shop makes is tagged in history.state with {ex:1, id, idx}:
        id  — which page-visit this entry is (its saved scroll is keyed on it)
        idx — how deep in this visit it is (0 = first page of the visit)
      history.state survives a refresh, so swipe / Backspace keep working
      after a pull-to-refresh or F5 (bug 12).
   2. A tapped link adds an entry (the browser does it); Back / Forward /
      swipe only ever MOVE along the browser's list (history.back/forward).
      Nothing ever pushes an entry to "go back" (bug 2).
   3. Scroll is saved per entry id and put back on return — in the same task
      as the render, so there is no flash of the top (bugs 1, 13 N35).
   4. Popups (menu, search, size finder, photo zoom) add one "layer" entry
      while open, so the phone's Back closes the popup first and stays on the
      page (bug 11). Closed any other way, the entry stays as "this page
      again" and is stepped over by itself, so it never costs an extra Back.
   5. A swipe never moves twice: if the phone's own back lands late on top of
      ours, the extra step is undone before anything is drawn (bug 4).
   6. Only if the browser truly did not move (no popstate / hashchange at
      all in 1.5 s, page visible) does the shop step from its own record —
      by REPLACING the entry, never by pushing one.
   ===================================================================== */
var NAVS = {fixing:null, cur:null, tok:0, expect:null, pending:null, fbUntil:0, userMoved:false, restoreTok:0, layer:null, E:{}, POS:{}};
var NAV_KEY = 'extas-nav-v1';
function navNewId(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function navLoad(){ try{ var s = JSON.parse(sessionStorage.getItem(NAV_KEY) || 'null'); if(s && s.E && s.POS){ NAVS.E = s.E; NAVS.POS = s.POS; } }catch(e){} }
function navSave(){
  try{
    /* keep the record small: the last 80 page-visits are plenty */
    var ids = Object.keys(NAVS.E); if(ids.length > 80){ ids.sort(function(a, b){ return (NAVS.E[a].t||0) - (NAVS.E[b].t||0); }).slice(0, ids.length - 80).forEach(function(k){ delete NAVS.E[k]; delete NAVS.POS[k]; }); }
    sessionStorage.setItem(NAV_KEY, JSON.stringify({E:NAVS.E, POS:NAVS.POS}));
  }catch(e){}
}
function navHash(){ return location.hash || '#/'; }
function navLayerEl(){ return document.querySelector('.modal-back, .zm'); }
/* close the top popup WITHOUT touching history (history already moved) */
function navCloseLayersSilently(){
  if(document.querySelector('.modal-back') && typeof closeModal === 'function') closeModal(true);
  if(document.querySelector('.ca-zm') && typeof ca_zoomClose === 'function') ca_zoomClose();
  if(document.querySelector('.zm') && typeof zm_close === 'function') zm_close(true);
  var left = navLayerEl(); if(left){ left.remove(); document.body.style.overflow = ''; }
}
/* close the top popup the normal way (its own close button) — that also
   removes its history layer */
function navCloseTop(){
  var x = document.querySelector('.zm .zm-x');
  if(document.querySelector('.zm') && x){ x.click(); return; }
  if(typeof closeModal === 'function') closeModal();
}
function navInit(){
  navLoad();
  if('scrollRestoration' in history){ try{ history.scrollRestoration = 'manual'; }catch(e){} }
  var st = history.state, h = navHash();
  /* R15 · 7.1. The first page REPLACES the bare address — no blank step under Home */
  if(!location.hash){ try{ history.replaceState(st, '', location.href.split('#')[0] + '#/'); }catch(e){} h = '#/'; }
  if(st && st.ex && st.id){
    NAVS.cur = {id:st.id, idx:st.idx||0, h:h};
    if(!NAVS.E[st.id]) NAVS.E[st.id] = {h:h, idx:Math.floor(st.idx||0), t:Date.now()};
    if(st.layer){ /* refreshed while a popup was open: the entry now just means "this page" */ }
  } else {
    var id = navNewId();
    try{ history.replaceState({ex:1, id:id, idx:0}, ''); }catch(e){}
    NAVS.cur = {id:id, idx:0, h:h}; NAVS.E[id] = {h:h, idx:0, t:Date.now()};
  }
  navSave();
}
/* ---- put the page back where it was --------------------------------- */
function navRestore(y){
  var my = ++NAVS.restoreTok; NAVS.userMoved = false; y = y || 0;
  var apply = function(){
    if(my !== NAVS.restoreTok || NAVS.userMoved) return;
    var max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    var to = Math.min(y, max); if(Math.abs((window.pageYOffset||0) - to) > 0.5) window.scrollTo(0, to);
  };
  apply();                                              /* same task as the render: no flash of the top */
  if(y > 0){ requestAnimationFrame(apply); setTimeout(apply, 160); setTimeout(apply, 480); }   /* late content */
}
['touchstart', 'wheel', 'mousedown'].forEach(function(ev){ window.addEventListener(ev, function(){ NAVS.userMoved = true; }, {passive:true, capture:true}); });
window.addEventListener('keydown', function(e){ if(/^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End| )$/.test(e.key)) NAVS.userMoved = true; }, true);
/* any new input from the person means a later history move is theirs, not a double */
['touchstart', 'keydown', 'mousedown'].forEach(function(ev){ window.addEventListener(ev, function(){ NAVS.expect = null; }, {passive:true, capture:true}); });

/* ---- the one handler for popstate AND hashchange ----------------------
   Both fire for a hash traversal; the second call finds nothing to do. */
function navSync(){
  var st = history.state, h = navHash(), cur = NAVS.cur;
  var leaveY = window.pageYOffset || 0;
  /* (a) a brand-new entry: a tapped link or location.hash = ... */
  if(!st || !st.ex){
    var pend = NAVS.pending; NAVS.pending = null;
    if(pend){                                           /* our own fallback replaced the entry */
      try{ history.replaceState({ex:1, id:pend.id, idx:pend.idx}, ''); }catch(e){}
      if(cur) NAVS.POS[cur.id] = leaveY;
      NAVS.cur = {id:pend.id, idx:pend.idx, h:h}; NAVS.tok++;
      navCloseLayersSilently(); render(true); navRestore(NAVS.POS[pend.id] || 0); navSave(); return;
    }
    var id = navNewId(), idx = cur ? Math.floor(cur.idx) + 1 : 0;
    try{ history.replaceState({ex:1, id:id, idx:idx}, ''); }catch(e){}
    if(cur){ NAVS.POS[cur.id] = leaveY; if(NAVS.E[cur.id]) NAVS.E[cur.id].next = id; }
    NAVS.E[id] = {h:h, idx:idx, prev:cur ? cur.id : null, t:Date.now()};
    NAVS.POS[id] = 0;
    NAVS.cur = {id:id, idx:idx, h:h}; NAVS.tok++; NAVS.expect = null;
    navCloseLayersSilently(); render(true); navRestore(0); navSave(); return;
  }
  /* (b) an entry we already know — Back, Forward, swipe */
  if(cur && st.id === cur.id && h === cur.h){
    if(st.idx === cur.idx) return;                      /* the second event of the same move */
    var dir = st.idx > cur.idx ? 1 : -1;
    NAVS.cur.idx = st.idx; NAVS.tok++;
    if(navLayerEl() && !st.layer){ navCloseLayersSilently(); return; }   /* Back closes the popup, stays on the page */
    if(!navLayerEl() && Date.now() > NAVS.fbUntil){
      /* an old popup step with no popup on it (left by a link inside the
         popup, or by a refresh): it shows nothing new, so keep going the
         same way — one Back always shows a different page */
      try{ history.go(dir); }catch(e){}
    }
    return;
  }
  /* a different page */
  var ex = NAVS.expect;
  if(NAVS.fixing && NAVS.fixing === st.id) return;     /* the second event of the step we are undoing */
  NAVS.fixing = null;
  if(ex && Date.now() < ex.until && Math.floor(st.idx) < ex.target){
    /* the phone's own back landed on top of ours: undo the extra step
       before drawing anything — the swipe moves exactly once */
    NAVS.tok++; NAVS.fixing = st.id;
    try{ history.go(Math.max(1, ex.target - Math.floor(st.idx))); }catch(e){}
    return;
  }
  /* Our own step has landed. The window for a late native back now scales
     with how slow this phone just was (a fast phone: 1 s; a phone that took
     300 ms to move: 2.4 s), so slow phones are covered without holding a
     person's own next Back for long. */
  if(cur) NAVS.POS[cur.id] = leaveY;
  NAVS.cur = {id:st.id, idx:st.idx, h:h}; NAVS.tok++;
  if(!NAVS.E[st.id]) NAVS.E[st.id] = {h:h, idx:Math.floor(st.idx), t:Date.now()};
  NAVS.E[st.id].t = Date.now();
  navCloseLayersSilently(); render(true); navRestore(NAVS.POS[st.id] || 0);
  /* measured after the render, so a phone that is slow to draw counts as slow */
  if(ex && !ex.landed && Math.floor(st.idx) === ex.target){ var took = performance.now() - ex.t0; ex.landed = true; ex.until = Date.now() + Math.max(1000, 8 * took); }
  navSave();
}
/* the browser did not move: step from our own record by REPLACING the entry */
function navFallbackTo(id){
  var e = NAVS.E[id]; if(!e) return;
  NAVS.pending = {id:id, idx:e.idx}; NAVS.fbUntil = Date.now() + 3000;
  try{ location.replace(location.href.split('#')[0] + e.h); }catch(err){ NAVS.pending = null; }
}
function appBack(evTime){
  if(navLayerEl()){ navCloseTop(); return; }
  var cur = NAVS.cur; if(!cur) return;
  if(Math.floor(cur.idx) <= 0) return;                  /* first page of the visit: stay in the shop */
  var tok = NAVS.tok, from = cur.id;
  /* evTime = when the finger lifted / the key went down (event.timeStamp), so
     a phone that is slow to even deliver the event counts as slow */
  NAVS.expect = {target:Math.floor(cur.idx) - 1, t0:(evTime && evTime > 0 && evTime <= performance.now()) ? evTime : performance.now(), until:Date.now() + 2500, landed:false};
  try{ history.back(); }catch(e){}
  setTimeout(function(){
    if(NAVS.tok !== tok || document.hidden) return;     /* the browser moved (or we left) */
    var e = NAVS.E[from]; if(e && e.prev && NAVS.E[e.prev]) navFallbackTo(e.prev);
  }, 1500);
}
function appForward(){
  var cur = NAVS.cur; if(!cur) return;
  var tok = NAVS.tok, from = cur.id;
  try{ history.forward(); }catch(e){}
  setTimeout(function(){
    if(NAVS.tok !== tok || document.hidden) return;
    var e = NAVS.E[from]; if(e && e.next && NAVS.E[e.next]) navFallbackTo(e.next);
  }, 1500);
}
/* old name, kept for anything that still calls it */
function trailBack(){ appBack(); }

/* ---- popup layers: one history step while a popup is open --------------
   Watches <body> for the popup elements, so every popup — including ones
   drawn by modules this file does not own — gets the same behaviour:
   Back closes it, focus moves into it and stays there (Tab is trapped),
   Esc closes it, and focus returns to the button that opened it. */
var NAV_FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
function navFocusables(root){ return [].filter.call(root.querySelectorAll(NAV_FOCUSABLE), function(e){ return e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden'; }); }
function navLayerOpened(el){
  var opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
  var st = history.state || {};
  if(!st.layer && NAVS.cur){
    try{ history.pushState({ex:1, id:NAVS.cur.id, idx:Math.floor(NAVS.cur.idx) + 0.5, layer:1}, ''); NAVS.cur.idx = Math.floor(NAVS.cur.idx) + 0.5; }catch(e){}
  }
  NAVS.layer = {h:navHash(), opener:opener, openerSel:navSelOf(opener)};
  navFocusInto(el);
}
function navSelOf(e){
  if(!e || !e.getAttribute) return null;
  var a = e.getAttribute('data-act'), l = e.getAttribute('aria-label');
  if(a) return '[data-act="'+a+'"]'+(e.getAttribute('data-id') ? '[data-id="'+e.getAttribute('data-id')+'"]' : '');
  if(l) return '[aria-label="'+l.replace(/"/g, '\\"')+'"]';
  return null;
}
function navFocusInto(el){
  setTimeout(function(){
    var L = navLayerEl(); if(!L) return;
    if(L.contains(document.activeElement)) return;      /* e.g. the search box focused itself */
    var dlg = L.querySelector('[role=dialog]') || L;
    if(!dlg.hasAttribute('tabindex')) dlg.setAttribute('tabindex', '-1');
    try{ dlg.focus({preventScroll:true}); }catch(e){ dlg.focus(); }
  }, 40);
}
function navLayerClosed(){
  var info = NAVS.layer; NAVS.layer = null;
  /* give focus back to the button that opened the popup */
  if(info){
    var back = info.opener && document.contains(info.opener) ? info.opener : (info.openerSel ? document.querySelector(info.openerSel) : null);
    if(back && back.getClientRects().length){ try{ back.focus({preventScroll:true}); }catch(e){} }
  }
  /* Closed by ✕ / Esc / backdrop (not by Back): its history step simply
     stays behind as "this page again". It is never popped with
     history.back() — a pop races any navigation that follows the close
     (a tap on a link inside the popup, a script) and could land the shop
     one page too far back. Instead navSync() treats a step that shows the
     same page as nothing and keeps going, so one Back is still one page. */
}
(function(){
  if(typeof MutationObserver === 'undefined') return;
  var open = false;
  new MutationObserver(function(){
    var el = navLayerEl();
    if(el && !open){ open = true; navLayerOpened(el); }
    else if(!el && open){ open = false; navLayerClosed(); }
    else if(el && open && !el.contains(document.activeElement)){ navFocusInto(el); }   /* redrawn popup */
  }).observe(document.body, {childList:true});
})();
document.addEventListener('keydown', function(e){
  if(e.key !== 'Tab') return;
  var L = navLayerEl(); if(!L) return;
  var f = navFocusables(L); if(!f.length){ e.preventDefault(); return; }
  var a = document.activeElement, i = f.indexOf(a);
  if(!L.contains(a) || i < 0){ e.preventDefault(); (e.shiftKey ? f[f.length - 1] : f[0]).focus(); return; }
  if(e.shiftKey && i === 0){ e.preventDefault(); f[f.length - 1].focus(); }
  else if(!e.shiftKey && i === f.length - 1){ e.preventDefault(); f[0].focus(); }
}, true);
window.addEventListener('pagehide', function(){ if(NAVS.cur) NAVS.POS[NAVS.cur.id] = window.pageYOffset || 0; navSave(); });

/* ================= boot ================= */
loadState(); applyTheme();
navInit();
render(true);
navRestore(NAVS.POS[NAVS.cur.id] || 0);      /* F5 / pull-to-refresh: the same spot */
window.addEventListener('popstate', navSync);
maybeIntro();

/* ---------- edge swipe back (iPhone-style), phone only ----------------
   Distance and direction decide, not speed: a slow, careful swipe counts
   (up to 1.2 s). If the phone's own back already moved, we do nothing. */
var SWIPE = {edge:28, minDx:70, maxMs:1500};
(function(){
  if(typeof window==='undefined') return;
  var x0=0, y0=0, t0=0, live=false, id0=null;
  document.addEventListener('touchstart', function(e){
    live = false;
    if(!isTouchUI() || e.touches.length!==1) return;    /* R15 wave 2: any touch screen, any width */
    var t=e.touches[0];
    if(t.clientX > SWIPE.edge) return;                  /* must start at the left edge */
    live = true; x0=t.clientX; y0=t.clientY; t0=Date.now(); id0 = (history.state||{}).id || null;
  }, {passive:true});
  document.addEventListener('touchcancel', function(){ live = false; }, {passive:true});   /* the phone took the gesture */
  document.addEventListener('touchend', function(e){
    if(!live) return; live=false;
    var t=e.changedTouches[0];
    var dx=t.clientX-x0, dy=Math.abs(t.clientY-y0), dt=Date.now()-t0;
    if(dx < SWIPE.minDx || dy > dx * 0.6 || dt > SWIPE.maxMs) return;
    if(navLayerEl()){ navCloseTop(); return; }
    if(((history.state||{}).id || null) !== id0 || navHash() !== (NAVS.cur && NAVS.cur.h)) return;   /* the phone's own back already landed */
    appBack(e.timeStamp);
  }, {passive:true});
})();

document.addEventListener('keydown', function(e){
  var t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  if(typing) return;
  if(e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft')){
    e.preventDefault(); appBack(e.timeStamp);
  } else if(e.altKey && e.key === 'ArrowRight'){ e.preventDefault(); appForward(); }
});

/* Owner 19 Oct 22:14: clicking a link to the page you are already on (the EXTAS
   logo on home, "Home" in a menu, a category link on that category…) must do
   something: go smoothly to the top. The hash does not change, so the router
   would otherwise ignore it. Capture phase, so it runs before page handlers;
   modifier-clicks (new tab) are left alone. */
document.addEventListener('click', function(ev){
  try{
    if(ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    var a = ev.target && ev.target.closest && ev.target.closest('a[href^="#"]'); if(!a) return;
    var h = a.getAttribute('href'); if(!h || h === '#') return;
    var cur = location.hash || '#/'; if(cur === '#') cur = '#/';
    if(h !== cur) return;
    ev.preventDefault();
    if(typeof closeModal === 'function' && typeof MODAL !== 'undefined' && MODAL) closeModal();
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({top:0, behavior: reduce ? 'auto' : 'smooth'});
    var main = document.getElementById('main') || document.querySelector('main'); if(main){ main.setAttribute('tabindex','-1'); try{ main.focus({preventScroll:true}); }catch(e){} }
  }catch(e){}
}, true);
