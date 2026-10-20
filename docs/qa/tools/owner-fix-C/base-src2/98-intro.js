/* ================= first-visit guide ================= */
function introHTML(){
  var step = function(n, title, text){ return '<div class="row top" style="gap:12px"><span class="tl-dot done" style="width:26px;height:26px">'+n+'</span><div><div class="h3">'+title+'</div><div class="small text2" style="margin-top:2px">'+text+'</div></div></div>'; };
  return '<div class="stack s16">'+
    '<p class="text2" style="margin:0">This is a working demo of the EXTAS shop with sample products. Click around like a real customer — everything is saved in this browser only.</p>'+
    step(1,'Shop as a new customer','Open a product, use Find my size, add to bag, check out with any name, phone and address. You get an order and an account.')+
    step(2,'Try a returning customer','Log in with 01712345678 (password 01712345678). That account has a delivered order you can review and exchange.')+
    step(3,'See the owner side','Open <b>Demo controls</b> (bottom right) → Owner admin: Orders, Smart Rules, Size charts, AI & agents, Landing pages, Combos. Change a rule and watch the shop update.')+
    step(4,'Switch looks','Demo controls also switch the theme, product page template (T1/T2/T3), combo template and the Eid banner.')+
    '<div class="row wrap" style="gap:10px"><button class="btn btn-primary" data-act="intro-close">Start shopping</button><a class="btn btn-secondary" href="#/login?demo=1" data-act="intro-close-go" data-href="#/login?demo=1">Log in as returning customer</a></div>'+
    '<div class="xs muted">You can reset everything from Demo controls → Reset all demo data.</div>'+
  '</div>';
}
ACT['intro-close'] = function(){ ST.seenIntro = true; saveState(); closeModal(); };
ACT['intro-close-go'] = function(el){ ST.seenIntro = true; saveState(); closeModal(); go(el.getAttribute('data-href')); };
function maybeIntro(){ if(!ST.seenIntro && (location.hash==='' || location.hash==='#/' )) setTimeout(function(){ openModal(introHTML(), {title:'Welcome to the EXTAS demo'}); }, 350); }
