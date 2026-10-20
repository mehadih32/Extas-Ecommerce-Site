/* =====================================================================
   R15 · 6.1. PULL DOWN TO REFRESH — phones only.
   Why our own: the buy bar fix (2.1) stops the page bouncing, which also
   stops the browser's built-in pull-to-refresh; and inside the demo viewer
   the browser's own never works anyway. So the shop draws its own:
     at the very top of the page, pull down → an arrow appears under the
     header → past the line it turns into "Release to refresh" → let go →
     the page reloads where it is (bag and account are kept; a size or
     colour that was only picked, not added, starts fresh — which is what
     the owner wants when a wrong size was tapped).
   Never inside a popup or a sheet, or while typing; a sideways swipe on a
   photo slider stays a swipe (only a mostly-downward pull counts).
   PTR.on switches it off; PTR.pull is the distance in px.
   ===================================================================== */
var PTR = {on:true, pull:78};
(function(){
  if(typeof window==='undefined') return;
  var el = null, y0 = 0, x0 = 0, d = 0, live = false, armed = false;
  function bar(){
    if(el) return el;
    el = document.createElement('div'); el.className = 'ptr'; el.setAttribute('aria-hidden','true');
    el.innerHTML = '<span class="ptr-ic">'+ico('down',18)+'</span><span class="ptr-t">Pull to refresh</span>';
    document.body.appendChild(el); return el;
  }
  function blocked(t){
    if(!PTR.on || !isTouchUI()) return true;            /* R15 wave 2: touch, at any width (iPad landscape too) */
    if(document.querySelector('.modal-back, .mn-open, .demo-panel.open, .zm')) return true;
    if(t && t.closest && t.closest('input,textarea,select,[contenteditable],.modal,[data-noptr]')) return true;
    return false;
  }
  document.addEventListener('touchstart', function(e){
    live = false; armed = false; d = 0;
    if(e.touches.length !== 1 || (window.pageYOffset || document.documentElement.scrollTop) > 0 || blocked(e.target)) return;
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; live = true;
  }, {passive:true});
  document.addEventListener('touchmove', function(e){
    if(!live) return;
    var dy = e.touches[0].clientY - y0, dx = Math.abs(e.touches[0].clientX - x0);
    if(dy <= 0 || dx > dy){ if(d){ reset(); } return; }
    if((window.pageYOffset || document.documentElement.scrollTop) > 0){ reset(); return; }
    d = Math.min(dy * 0.55, PTR.pull * 1.5);
    var b = bar(), hdr = document.querySelector('.hdr, .ckh');
    b.style.top = ((hdr ? hdr.getBoundingClientRect().bottom : 56) + 6) + 'px';
    b.style.transform = 'translate(-50%,' + (d - 44) + 'px)'; b.style.opacity = Math.min(1, d / 40);
    armed = d >= PTR.pull;
    b.classList.toggle('armed', armed);
    b.querySelector('.ptr-t').textContent = armed ? 'Release to refresh' : 'Pull to refresh';
  }, {passive:true});
  function reset(){ d = 0; armed = false; if(el){ el.style.transform = 'translate(-50%,-44px)'; el.style.opacity = 0; el.classList.remove('armed','busy'); } }
  /* TA-2 (T11): a cancelled touch (a call, a notification, a system gesture)
     never reloads — it just puts the indicator away. It used to stay on
     screen saying "Release to refresh" until the next tap. */
  document.addEventListener('touchcancel', function(){
    if(!live) return; live = false; reset();
    if(el){ var tx = el.querySelector('.ptr-t'); if(tx) tx.textContent = 'Pull to refresh'; }
  }, {passive:true});
  document.addEventListener('touchend', function(){
    if(!live) return; live = false;
    if(!armed){ reset(); return; }
    var b = bar(); b.classList.add('busy'); b.querySelector('.ptr-t').textContent = 'Refreshing…';
    b.style.transform = 'translate(-50%,' + (PTR.pull - 44) + 'px)';
    setTimeout(function(){ try{ location.reload(); }catch(e){ reset(); render(); } }, 350);
  }, {passive:true});
})();
