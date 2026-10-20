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
var ZOOM = {max:4, dbl:2.5, side:88, gap:8};
/* desktop click steps (owner review 20 Oct, P7): a setting, "1.8, 2.6, 3.6" by default */
function zm_steps(){
  var raw = (typeof OPT==='function' ? OPT('pdp.zoomSteps') : '') || '1.8,2.6,3.6';
  var a = String(raw).split(/[ ,;]+/).map(Number).filter(function(v){ return v > 1.05 && v <= 8; }).sort(function(x, y){ return x - y; });
  return a.length ? a : [1.8, 2.6, 3.6];
}
function zm_src(p, color, view){
  var ph = p.photos && p.photos[color] && p.photos[color][view];
  if(ph && (ph.zoom || ph.src)) return '<img src="'+esc(ph.zoom || ph.src)+'" alt="'+esc(p.name+' — '+(VIEW_LABEL[view]||view))+'" draggable="false">';
  var c = COL(color || p.colors[0]), cat = CAT(p.cat) || {garment:'tee'};
  return '<div class="zm-draw" style="background:'+mixHex(c.hex,'#EFEDE8', isLight(c.hex) ? .55 : .80)+'">'+garmentSVG(p.garment||cat.garment, c.hex, view)+'</div>';
}
function zm_open(startView){
  var c = pdp_cur(); if(!c) return;
  var p = c.p, u = c.u, views = pdp_views(p), i0 = Math.max(0, views.indexOf(startView || u.view || views[0]));
  var DK = typeof dkb_fine==='function' && dkb_fine();   /* desktop with a mouse; touch tablets keep the phone viewer */
  zm_close(true);
  var el = document.createElement('div'); el.className = 'zm'+(DK ? ' zm-dk' : ''); el.setAttribute('role','dialog'); el.setAttribute('aria-label', p.name+' photos');
  /* Owner review 20 Oct (P7): desktop gets zoom-out / zoom-in / fit buttons beside Close */
  el.innerHTML = '<div class="zm-top"><span class="zm-n" aria-live="polite"></span>'+
    (DK ? '<span class="zm-tools"><button type="button" class="zm-tb" data-z="out" aria-label="'+esc(t('Zoom out'))+'">'+ico('minus',20)+'</button><button type="button" class="zm-tb" data-z="in" aria-label="'+esc(t('Zoom in'))+'">'+ico('plus',20)+'</button><button type="button" class="zm-tb zm-fit" data-z="fit">'+esc(t('Fit'))+'</button></span>' : '')+
    '<button type="button" class="zm-x" aria-label="Close">'+ico('close',22)+'</button></div>'+
    '<div class="zm-trk">'+views.map(function(v){ return '<div class="zm-slide" data-v="'+v+'"><div class="zm-pan">'+zm_src(p, u.color, v)+'</div></div>'; }).join('')+'</div>'+
    '<div class="zm-hint">'+(DK ? esc(t('Click to zoom in · drag or scroll to move · double-click to fit')) : 'Pinch or double-tap to zoom')+'</div>'+
    /* D-032 (desktop only): visible ‹ › and a thumbnail strip — the keyboard
       and wheel helpers below were there, but nobody could see them */
    (DK ? '<button type="button" class="zm-nav l" data-d="-1" aria-label="Previous photo">'+ico('back',22)+'</button><button type="button" class="zm-nav r" data-d="1" aria-label="Next photo">'+ico('right',22)+'</button>'+
      '<div class="zm-thumbs" role="group" aria-label="Photos">'+views.map(function(v, i){ return '<button type="button" class="zm-th" data-i="'+i+'" aria-label="'+esc(pdp_thumbLabel(v))+'">'+productImg(p, u.color, {view:v, ratio:'ratio-11', label:false})+'</button>'; }).join('')+'</div>' : '');
  document.body.appendChild(el); document.body.style.overflow = 'hidden';
  var trk = el.querySelector('.zm-trk'), n = el.querySelector('.zm-n');
  trk.scrollLeft = i0 * trk.clientWidth;
  var idx = function(){ return Math.round(trk.scrollLeft / Math.max(1, trk.clientWidth)); };
  var count = function(){ n.textContent = (idx()+1)+' / '+views.length;
    if(DK){ var k = idx(); [].forEach.call(el.querySelectorAll('.zm-th'), function(b, j){ b.classList.toggle('on', j===k); b.setAttribute('aria-pressed', j===k ? 'true' : 'false'); });
      var l = el.querySelector('.zm-nav.l'), r = el.querySelector('.zm-nav.r'); if(l) l.disabled = k<=0; if(r) r.disabled = k>=views.length-1; } };
  count(); trk.addEventListener('scroll', function(){ count(); }, {passive:true});
  el.querySelector('.zm-x').addEventListener('click', function(){ zm_close(); });
  setTimeout(function(){ var h = el.querySelector('.zm-hint'); if(h) h.classList.add('off'); }, 2200);
  /* --- pinch / double-tap / pan on the current slide --- */
  var s = 1, tx = 0, ty = 0, start = null, lastTap = 0, down = null;
  var pan = function(){ return trk.children[idx()].querySelector('.zm-pan'); };
  var apply = function(anim){ var e = pan(); if(!e) return; e.style.transition = anim ? 'transform .2s ease' : 'none';
    e.style.transform = 'translate('+tx+'px,'+ty+'px) scale('+s+')'; trk.classList.toggle('zoomed', s > 1.01); };
  var clampPan = function(){ var e = pan(); if(!e) return; var w = e.clientWidth, h = e.clientHeight, mx = (w*s - w)/2, my = (h*s - h)/2;
    /* desktop (P7): the limit is the visible area, not the picture box — so a
       zoomed picture can be moved until each of its four edges is on screen */
    if(DK){ var sl = e.parentNode; mx = Math.max(0, (w*s - sl.clientWidth)/2); my = Math.max(0, (h*s - sl.clientHeight)/2); }
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
  /* D-032 / Q-004 (desktop with a mouse): a click zooms in exactly where the
     pointer is (from any smaller zoom), dragging moves the zoomed picture, a
     click at full zoom zooms back out, the wheel zooms in steps. ‹ › and the thumbnails change
     photo. Phones and touch tablets never get these handlers. */
  if(DK){
    /* =================================================================
       Owner review 20 Oct (P7, critical). The desktop viewer used to show a
       crop: the drawing box was as wide as the screen but only as tall as it,
       so the top and bottom of the picture were cut off at the first level,
       and the drag limits were worked out from that cut box — the edges
       could never be reached. Now:
         · level 1 shows the WHOLE picture, fitted inside the visible area
           (between the top bar and the thumbnail strip);
         · each click zooms one step more at the pointer (steps are a
           setting, pdp.zoomSteps); a click at the last step goes back to fit;
         · drag, the mouse wheel (shift or a sideways swipe for left/right)
           and the arrow keys move the picture until each of its four edges
           is on screen; Ctrl + wheel / a trackpad pinch zooms;
         · double-click, the Fit button or the 0 key goes back to fit; Esc
           closes. Phones and touch tablets keep the pinch viewer above.
       ================================================================= */
    var steps = zm_steps(), maxS = steps[steps.length - 1];
    var fit = function(){
      [].forEach.call(trk.querySelectorAll('.zm-slide'), function(sl){
        var e = sl.querySelector('.zm-pan'), im = e && e.querySelector('img'); if(!e) return;
        var ratio = (im && im.naturalWidth && im.naturalHeight) ? im.naturalWidth / im.naturalHeight : 0.8;
        var aw = Math.max(80, sl.clientWidth - 2 * ZOOM.side), ah = Math.max(80, sl.clientHeight - 2 * ZOOM.gap);
        var w = Math.min(aw, ah * ratio), h = w / ratio;
        e.style.width = Math.round(w) + 'px'; e.style.height = Math.round(h) + 'px';
      });
    };
    fit();
    [].forEach.call(trk.querySelectorAll('.zm-pan img'), function(im){ if(!im.complete) im.addEventListener('load', function(){ fit(); reset(); }); });
    window.addEventListener('resize', ZOOM.rs = function(){ fit(); s = 1; tx = 0; ty = 0; apply(false); trk.scrollLeft = idx() * trk.clientWidth; });
    var zgo = function(i){ reset(); trk.scrollTo({left:Math.max(0, Math.min(views.length-1, i))*trk.clientWidth, behavior:'smooth'}); };
    [].forEach.call(el.querySelectorAll('.zm-nav'), function(b){ b.addEventListener('click', function(e){ e.stopPropagation(); zgo(idx() + Number(b.getAttribute('data-d'))); }); });
    [].forEach.call(el.querySelectorAll('.zm-th'), function(b){ b.addEventListener('click', function(e){ e.stopPropagation(); zgo(Number(b.getAttribute('data-i'))); }); });
    /* zoom to s1 keeping the point under (px, py) where it is; no point = the centre */
    var zoomTo = function(s1, px, py, anim){
      var e = pan(); if(!e) return; s1 = Math.max(1, Math.min(maxS, s1));
      var sl = e.parentNode.getBoundingClientRect(), cx = sl.left + sl.width/2, cy = sl.top + sl.height/2;
      if(px == null){ px = cx; py = cy; }
      if(s1 <= 1.001){ s = 1; tx = 0; ty = 0; }
      else { tx = (px - cx) - s1 * (px - cx - tx) / s; ty = (py - cy) - s1 * (py - cy - ty) / s; s = s1; }
      clampPan(); apply(anim);
    };
    var nextStep = function(){ for(var i=0;i<steps.length;i++) if(steps[i] > s + 0.01) return steps[i]; return null; };
    var prevStep = function(){ for(var i=steps.length-1;i>=0;i--) if(steps[i] < s - 0.01) return steps[i]; return 1; };
    var panBy = function(dx, dy){ if(s <= 1.01) return; tx += dx; ty += dy; clampPan(); apply(false); };
    [].forEach.call(el.querySelectorAll('.zm-tb'), function(b){ b.addEventListener('click', function(e){
      e.stopPropagation(); var z = b.getAttribute('data-z');
      if(z === 'fit') reset(); else if(z === 'in'){ var n2 = nextStep(); if(n2) zoomTo(n2, null, null, true); } else zoomTo(prevStep(), null, null, true);
    }); });
    var drag = null, moved = false;
    el.addEventListener('mousedown', function(e){ if(e.button!==0 || !e.target.closest('.zm-slide')) return; moved = false; if(s > 1.01){ e.preventDefault(); drag = {x:e.clientX, y:e.clientY, tx:tx, ty:ty}; trk.classList.add('dragging'); } });
    window.addEventListener('mousemove', ZOOM.mm = function(e){ if(!drag) return; var dx = e.clientX - drag.x, dy = e.clientY - drag.y; if(Math.abs(dx) + Math.abs(dy) > 4) moved = true; tx = drag.tx + dx; ty = drag.ty + dy; clampPan(); apply(false); });
    window.addEventListener('mouseup', ZOOM.mu = function(){ if(drag){ drag = null; trk.classList.remove('dragging'); } });
    el.addEventListener('click', function(e){
      if(Date.now() - touched < 800 || !e.target.closest('.zm-slide') || e.target.closest('button')) return;
      if(moved){ moved = false; return; }                     /* the end of a drag is not a click */
      if(e.detail >= 2) return;                               /* the 2nd click of a double-click belongs to the double-click */
      var n2 = nextStep();
      if(n2) zoomTo(n2, e.clientX, e.clientY, true); else reset();   /* past the last step: back to the whole picture */
    });
    el.addEventListener('dblclick', function(e){ if(e.target.closest('button')) return; e.preventDefault(); reset(); });
    el.addEventListener('wheel', function(e){
      if(e.target.closest('.zm-thumbs')) return;
      e.preventDefault();
      var k = e.deltaMode === 1 ? 16 : (e.deltaMode === 2 ? 400 : 1), dx = e.deltaX * k, dy = e.deltaY * k;
      if(e.ctrlKey){ zoomTo(s * (dy < 0 ? 1.12 : 0.89), e.clientX, e.clientY, false); return; }   /* trackpad pinch / Ctrl + wheel */
      if(s <= 1.01){ if(dy < -2){ var n2 = nextStep(); if(n2) zoomTo(n2, e.clientX, e.clientY, true); } return; }
      if(e.shiftKey && !dx){ dx = dy; dy = 0; }
      panBy(-dx, -dy);
    }, {passive:false});
    ZOOM.key = function(e){
      if(e.key === 'Escape'){ zm_close(); return; }
      if(e.key === '+' || e.key === '='){ var n2 = nextStep(); if(n2) zoomTo(n2, null, null, true); return; }
      if(e.key === '-' || e.key === '_'){ zoomTo(prevStep(), null, null, true); return; }
      if(e.key === '0'){ reset(); return; }
      var A = {ArrowLeft:[1,0], ArrowRight:[-1,0], ArrowUp:[0,1], ArrowDown:[0,-1]}[e.key]; if(!A) return;
      if(s > 1.01){ e.preventDefault(); panBy(A[0] * 80, A[1] * 80); }
      else if(A[0]) zgo(idx() - A[0]);
    };
    document.addEventListener('keydown', ZOOM.key);
    count();
    return;
  }
  el.addEventListener('dblclick', function(e){ if(DK) return; if(e.target.closest('.zm-x') || Date.now() - touched < 800) return;   /* phones use the touch double-tap above */ if(s > 1.01) reset(); else { s = ZOOM.dbl; apply(true); } });
  el.addEventListener('wheel', function(e){ if(!e.ctrlKey && Math.abs(e.deltaY) < 1) return; e.preventDefault(); s = Math.max(1, Math.min(ZOOM.max, s * (e.deltaY < 0 ? 1.12 : 0.89))); clampPan(); apply(false); }, {passive:false});
  ZOOM.key = function(e){ if(e.key === 'Escape') zm_close(); if(s <= 1.01 && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) trk.scrollBy({left:(e.key==='ArrowRight'?1:-1)*trk.clientWidth, behavior:'smooth'}); };
  document.addEventListener('keydown', ZOOM.key);
}
function zm_close(silent){
  var el = document.querySelector('.zm'); if(!el) return;
  el.remove(); document.body.style.overflow = '';
  if(ZOOM.key) document.removeEventListener('keydown', ZOOM.key);
  if(ZOOM.mm){ window.removeEventListener('mousemove', ZOOM.mm); ZOOM.mm = null; }
  if(ZOOM.mu){ window.removeEventListener('mouseup', ZOOM.mu); ZOOM.mu = null; }
  if(ZOOM.rs){ window.removeEventListener('resize', ZOOM.rs); ZOOM.rs = null; }
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
