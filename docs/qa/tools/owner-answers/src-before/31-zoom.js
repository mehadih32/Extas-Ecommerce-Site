/* =====================================================================
   R15 · 13.1. PHOTO ZOOM — the real picture, full screen.
   The page shows a short, wide crop of each photo (the first screen has no
   room for more). Tap a photo, double-tap it, or start a two-finger pinch on
   it, and a full-screen viewer opens with the ACTUAL picture — the whole
   uncropped image, from the backend's zoom file when there is one:
       product.photos[colour][view].zoom   (full-size, e.g. 2000 px)
       product.photos[colour][view].src    (normal)
   falling back to the drawing in this demo. In the viewer:
     · pinch or double-tap to zoom (up to 4×) and drag to look around —
       fabric texture, stitching, collar;
     · swipe sideways for the next photo (only when not zoomed in);
     · swipe down, tap ✕ or press Esc to close; back gesture closes too.
   ===================================================================== */
var ZOOM = {max:4, dbl:2.5};
function zm_src(p, color, view){
  var ph = p.photos && p.photos[color] && p.photos[color][view];
  if(ph && (ph.zoom || ph.src)) return '<img src="'+esc(ph.zoom || ph.src)+'" alt="'+esc(p.name+' — '+(VIEW_LABEL[view]||view))+'" draggable="false">';
  var c = COL(color || p.colors[0]), cat = CAT(p.cat) || {garment:'tee'};
  return '<div class="zm-draw" style="background:'+mixHex(c.hex,'#EFEDE8', isLight(c.hex) ? .55 : .80)+'">'+garmentSVG(p.garment||cat.garment, c.hex, view)+'</div>';
}
function zm_open(startView){
  var c = pdp_cur(); if(!c) return;
  var p = c.p, u = c.u, views = pdp_views(p), i0 = Math.max(0, views.indexOf(startView || u.view || views[0]));
  zm_close(true);
  var el = document.createElement('div'); el.className = 'zm'; el.setAttribute('role','dialog'); el.setAttribute('aria-label', p.name+' photos');
  el.innerHTML = '<div class="zm-top"><span class="zm-n" aria-live="polite"></span><button type="button" class="zm-x" aria-label="Close">'+ico('close',22)+'</button></div>'+
    '<div class="zm-trk">'+views.map(function(v){ return '<div class="zm-slide" data-v="'+v+'"><div class="zm-pan">'+zm_src(p, u.color, v)+'</div></div>'; }).join('')+'</div>'+
    '<div class="zm-hint">Pinch or double-tap to zoom</div>';
  document.body.appendChild(el); document.body.style.overflow = 'hidden';
  var trk = el.querySelector('.zm-trk'), n = el.querySelector('.zm-n');
  trk.scrollLeft = i0 * trk.clientWidth;
  var idx = function(){ return Math.round(trk.scrollLeft / Math.max(1, trk.clientWidth)); };
  var count = function(){ n.textContent = (idx()+1)+' / '+views.length; };
  count(); trk.addEventListener('scroll', function(){ count(); }, {passive:true});
  el.querySelector('.zm-x').addEventListener('click', function(){ zm_close(); });
  setTimeout(function(){ var h = el.querySelector('.zm-hint'); if(h) h.classList.add('off'); }, 2200);
  /* --- pinch / double-tap / pan on the current slide --- */
  var s = 1, tx = 0, ty = 0, start = null, lastTap = 0, down = null;
  var pan = function(){ return trk.children[idx()].querySelector('.zm-pan'); };
  var apply = function(anim){ var e = pan(); if(!e) return; e.style.transition = anim ? 'transform .2s ease' : 'none';
    e.style.transform = 'translate('+tx+'px,'+ty+'px) scale('+s+')'; trk.classList.toggle('zoomed', s > 1.01); };
  var clampPan = function(){ var e = pan(); if(!e) return; var w = e.clientWidth, h = e.clientHeight, mx = (w*s - w)/2, my = (h*s - h)/2;
    tx = Math.max(-mx, Math.min(mx, tx)); ty = Math.max(-my, Math.min(my, ty)); };
  var reset = function(){ s = 1; tx = 0; ty = 0; apply(true); };
  trk.addEventListener('scroll', function(){ if(s > 1.01){ /* never scroll away while zoomed */ } else { [].forEach.call(trk.querySelectorAll('.zm-pan'), function(e){ e.style.transform = ''; }); } }, {passive:true});
  var dist = function(t){ var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY; return Math.sqrt(dx*dx + dy*dy); };
  el.addEventListener('touchstart', function(e){
    if(e.target.closest('.zm-x')) return;
    if(e.touches.length === 2){ start = {d:dist(e.touches), s:s}; }
    else if(e.touches.length === 1){ down = {x:e.touches[0].clientX, y:e.touches[0].clientY, tx:tx, ty:ty, t:Date.now()}; }
  }, {passive:true});
  el.addEventListener('touchmove', function(e){
    if(start && e.touches.length === 2){ e.preventDefault(); s = Math.max(1, Math.min(ZOOM.max, start.s * dist(e.touches) / start.d)); clampPan(); apply(false); return; }
    if(down && e.touches.length === 1 && s > 1.01){ e.preventDefault(); tx = down.tx + (e.touches[0].clientX - down.x); ty = down.ty + (e.touches[0].clientY - down.y); clampPan(); apply(false); }
  }, {passive:false});
  el.addEventListener('touchend', function(e){
    if(start && e.touches.length < 2){ start = null; if(s < 1.05) reset(); return; }
    if(!down) return;
    var t = e.changedTouches[0], dx = t.clientX - down.x, dy = t.clientY - down.y, dt = Date.now() - down.t;
    if(s <= 1.01 && dy > 90 && Math.abs(dx) < 60 && dt < 600){ zm_close(); down = null; return; }   /* swipe down: close */
    if(Math.abs(dx) < 8 && Math.abs(dy) < 8 && dt < 300){
      var now = Date.now();
      if(now - lastTap < 300){                                   /* double tap: zoom in where tapped, or back out */
        if(s > 1.01) reset(); else { var r = pan().getBoundingClientRect(); s = ZOOM.dbl; tx = (r.left + r.width/2 - t.clientX) * (s-1); ty = (r.top + r.height/2 - t.clientY) * (s-1); clampPan(); apply(true); }
        lastTap = 0;
      } else lastTap = now;
    }
    down = null;
  });
  /* desktop: wheel / double-click zoom, Esc closes */
  var touched = 0; el.addEventListener('touchstart', function(){ touched = Date.now(); }, {passive:true});
  el.addEventListener('dblclick', function(e){ if(e.target.closest('.zm-x') || Date.now() - touched < 800) return;   /* phones use the touch double-tap above */ if(s > 1.01) reset(); else { s = ZOOM.dbl; apply(true); } });
  el.addEventListener('wheel', function(e){ if(!e.ctrlKey && Math.abs(e.deltaY) < 1) return; e.preventDefault(); s = Math.max(1, Math.min(ZOOM.max, s * (e.deltaY < 0 ? 1.12 : 0.89))); clampPan(); apply(false); }, {passive:false});
  ZOOM.key = function(e){ if(e.key === 'Escape') zm_close(); if(s <= 1.01 && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) trk.scrollBy({left:(e.key==='ArrowRight'?1:-1)*trk.clientWidth, behavior:'smooth'}); };
  document.addEventListener('keydown', ZOOM.key);
}
function zm_close(silent){
  var el = document.querySelector('.zm'); if(!el) return;
  el.remove(); document.body.style.overflow = '';
  if(ZOOM.key) document.removeEventListener('keydown', ZOOM.key);
}
window.addEventListener('hashchange', function(){ zm_close(true); });
/* opening: a tap on the photo (not on its badges/arrows), a double-tap, or a two-finger touch */
(function(){
  var pick = function(t){
    if(!t || !t.closest) return null;
    if(t.closest('button, a, .pdp-arrow, .pdp-chip, [data-act]')) return null;
    var tile = t.closest('.pdp-page .pdp-tile'); if(!tile) return null;
    return tile.getAttribute('data-v');
  };
  document.addEventListener('click', function(e){ var v = pick(e.target); if(v){ zm_open(v); } });
  document.addEventListener('touchstart', function(e){ if(e.touches.length === 2){ var v = pick(e.target); if(v) zm_open(v); } }, {passive:true});
})();
