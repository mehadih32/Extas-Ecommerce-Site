/* =====================================================================
   99z-phonefix.js — PHONE + TABLET AUDIT V12b (20 Oct).
   P1 · A PRICE NEVER SPLITS ACROSS TWO LINES (owner rule: a price line is one
   line on every device). fmt() writes "৳" + a thin space (U+2009) + the
   number, and a thin space is a place where the browser may break a line, so
   in a narrow box "You save ৳" ended one line and "200" started the next.
   fmt() itself is left alone (tests and other code read its exact text).
   Instead, after every render this helper looks for a price whose "৳" and
   number really landed on two different lines and wraps only that price in a
   <bdi class="pnw"> (white-space:nowrap, r12-zz-phonefix.css), so the whole
   price moves to the next line together. Prices that already sit on one line
   are never touched, so nothing else on the page moves.
   Prices inside one element (<span class="price">) are kept whole by CSS.
   ===================================================================== */
var PNW_RE = /৳[    ]*[0-9০-৯][0-9০-৯,.]*/g;
function pnwFix(root){
  root = root || document.body; if(!root || !document.createRange) return 0;
  var skip = /^(SCRIPT|STYLE|TEXTAREA|OPTION|TITLE|NOSCRIPT)$/, fixed = 0, todo = [];
  var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n;
  while((n = tw.nextNode())){
    var tx = n.nodeValue; if(!tx || tx.indexOf('৳') < 0) continue;
    var pe = n.parentNode; if(!pe || pe.nodeType !== 1 || skip.test(pe.nodeName) || pe.closest('svg,.pnw')) continue;
    PNW_RE.lastIndex = 0; var m;
    while((m = PNW_RE.exec(tx))){
      var rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
      var rs = rg.getClientRects(), top = null, split = false;
      for(var i = 0; i < rs.length; i++){ if(rs[i].width < 0.5) continue; if(top === null) top = rs[i].top; else if(Math.abs(rs[i].top - top) > 4){ split = true; break; } }
      if(split){ todo.push([n, m.index, m[0].length]); break; }   /* one per text node per pass; the next pass picks up the rest */
    }
  }
  todo.forEach(function(t){
    try{ var node = t[0], mid = node.splitText(t[1]); mid.splitText(t[2]);
      var b = document.createElement('bdi'); b.className = 'pnw'; mid.parentNode.insertBefore(b, mid); b.appendChild(mid); fixed++; }catch(e){}
  });
  return fixed;
}
/* C1 · AUTO ADJUST for two short label lines that were cut with "…" on narrow phones (also in V12):
   - combo store card subtitle "Shirt + Trousers + Polo" (#/combos, 320 px): full names → "3 pcs" (the
     same words the other cards use) when the names do not fit;
   - combo page sticky bar colour names "Sky Blue + Khaki + Charcoal" (430-440 px): hidden when they do
     not fit — the colour dots beside them stay (below 420 px the CSS already hides them).
   The full words come back by themselves when there is room (rotation, wider screen). */
function fitFix(root){
  root = root || document;
  [].forEach.call(root.querySelectorAll('.ca-csub:not(.ca-fit)'), function(e){
    if(!e.hasAttribute('data-full')) e.setAttribute('data-full', e.textContent);
    var full = e.getAttribute('data-full'), n = full.split(' + ').length;
    if(e.textContent !== full) e.textContent = full;
    if(n > 1 && e.scrollWidth > e.clientWidth + 1) e.textContent = n + ' ' + t('pcs');
  });
  [].forEach.call(root.querySelectorAll('.zc-mnames'), function(e){
    e.classList.remove('pf-hide');
    if(e.offsetWidth && e.scrollWidth > e.clientWidth + 1) e.classList.add('pf-hide');
  });
}
(function(){
  if(!window.MutationObserver) return;
  var timer = 0, busy = false;
  var run = function(){ timer = 0; if(busy) return; busy = true;
    try{ fitFix(document); }catch(e){}
    try{ for(var k = 0; k < 4; k++){ if(!pnwFix(document.body)) break; } }catch(e){}
    busy = false; };
  var soon = function(){ if(timer) clearTimeout(timer); timer = setTimeout(function(){ requestAnimationFrame(run); }, 120); };
  var start = function(){
    /* only new elements count (a page, a modal, a drawer, a patched box) — a ticking clock's text does not wake it */
    new MutationObserver(function(muts){ if(busy) return;
      for(var i = 0; i < muts.length; i++){ var a = muts[i].addedNodes; for(var j = 0; j < a.length; j++){ if(a[j].nodeType === 1 && a[j].nodeName !== 'BDI'){ soon(); return; } } }
    }).observe(document.body, {childList:true, subtree:true});
    window.addEventListener('resize', soon);
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(soon);
    soon();
  };
  if(document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
