/* =====================================================================
   R15 · 12.1. SIZE GUIDE FROM ANYWHERE (footer, menu, help search).
   The footer link used to open the polo product page. It now opens the
   same height-and-weight size finder as a window on the page you are on:
     1. what are you buying? (every category that has a size chart — a new
        category appears here by itself)
     2. height and weight (the same steppers as the product page)
     3. your size, the reasons, "saved as your size", and a link to shop
        that category. The size is saved exactly as the product page saves it.
   ===================================================================== */
var SG = {cat:null, fH:67, fW:66, step:'pick'};
function sg_cats(){
  return (DB.categories||[]).filter(function(c){ return !c.hidden && c.chart && CHART(c.chart) && (DB.products||[]).some(function(p){ return p.cat===c.id; }); });
}
function sg_stepper(k, val, label){
  return '<div class="pdp-step" role="group" aria-label="'+label+'"><button type="button" data-act="sg-step" data-k="'+k+'" data-d="-1" aria-label="'+label+' less">'+ico('minus',18)+'</button><output id="sg-'+k+'" aria-live="polite">'+val+'</output><button type="button" data-act="sg-step" data-k="'+k+'" data-d="1" aria-label="'+label+' more">'+ico('plus',18)+'</button></div>';
}
function sg_html(){
  var m = mySize(); if(m && m.heightIn && SG.step==='pick' && !SG.seeded){ SG.fH = m.heightIn; SG.fW = m.weightKg || SG.fW; SG.seeded = true; }
  if(SG.step === 'pick'){
    return '<div class="small text2">What are you buying? Then tell us your height and weight (kg) — we match you to that size chart.</div>'+
      '<div class="sg-cats mt16">'+sg_cats().map(function(c){
        return '<button type="button" class="sg-cat" data-act="sg-cat" data-c="'+esc(c.id)+'">'+(typeof catIcon==='function' ? catIcon(c.garment, 22) : ico('ruler',20))+'<span>'+esc(t(c.name))+'</span></button>';
      }).join('')+'</div>';
  }
  var c = CAT(SG.cat), ch = c && CHART(c.chart); if(!ch){ SG.step = 'pick'; return sg_html(); }
  if(SG.step === 'ask'){
    return '<div class="small text2">Two quick questions — we match you to our <b style="color:var(--ink)">'+esc(ch.name)+'</b> size chart.</div>'+
      '<div class="stack s16 mt16">'+
        '<div><div class="label">Your height</div><div class="row wrap" style="gap:10px">'+sg_stepper('ft', Math.floor(SG.fH/12)+' ft','Height in feet')+sg_stepper('in', (SG.fH%12)+' in','Height in inches')+'<span class="xs muted" id="sg-cm">'+Math.round(SG.fH*2.54)+' cm</span></div></div>'+
        '<div><div class="label">Your weight</div><div class="row" style="gap:10px">'+sg_stepper('kg', SG.fW+' kg','Weight in kg')+'</div></div>'+
      '</div>'+
      '<button type="button" class="btn btn-primary btn-block mt24" data-act="sg-show">Show my size</button>'+
      '<div class="row between mt12"><button type="button" class="link xs" data-act="sg-back">'+ico('back',14)+' Change item</button><span class="xs muted">Saved on this phone for next time.</span></div>';
  }
  var rec = recommendSize(ch, SG.fH, SG.fW);
  return '<div class="pdp-res"><div class="eyebrow">Your size · '+esc(t(c.name))+'</div><div class="pdp-res-size mt8">'+esc(rec.size)+'</div>'+
      '<div class="small text2 mt8">For '+esc(Math.floor(SG.fH/12)+' ft '+(SG.fH%12)+' in')+' · '+SG.fW+' kg · saved as your '+(c.group==='bottom'?'bottom':'top')+' size</div></div>'+
    (rec.next && rec.next!==rec.size ? '<div class="soft p16 small mt12">Between sizes or like it roomy? Take <b>'+esc(rec.next)+'</b>.</div>' : '')+
    '<div class="row mt16" style="gap:10px"><button type="button" class="btn btn-ghost" data-act="sg-change">Change answers</button>'+
      '<a class="btn btn-primary grow" href="#/c/'+esc(c.id)+'" data-act="sg-shop">Shop '+esc(t(c.name).toLowerCase())+' in '+esc(rec.size)+'</a></div>';
}
function sg_save(){
  var c = CAT(SG.cat), ch = c && CHART(c.chart); if(!ch) return;
  var rec = recommendSize(ch, SG.fH, SG.fW), p = (DB.products||[]).filter(function(x){ return x.cat===c.id; })[0];
  if(p && typeof pdp_saveMySize==='function') pdp_saveMySize(p, rec.size, SG.fH, SG.fW);
}
ACT['size-guide'] = function(el, ev){ if(ev) ev.preventDefault(); SG.step = 'pick'; SG.cat = null; openModal(sg_html(), {title:'Find my size', rebuild:sg_html, cls:'pdp-sheet'}); };
ACT['sg-cat'] = function(el){ SG.cat = el.getAttribute('data-c'); SG.step = 'ask'; refreshModal(); };
ACT['sg-back'] = function(){ SG.step = 'pick'; refreshModal(); };
ACT['sg-show'] = function(){ SG.step = 'result'; sg_save(); refreshModal(); };
ACT['sg-change'] = function(){ SG.step = 'ask'; refreshModal(); };
ACT['sg-shop'] = function(el){ closeModal(); location.hash = el.getAttribute('href'); };
ACT['sg-step'] = function(el){
  var k = el.getAttribute('data-k'), d = Number(el.getAttribute('data-d'));
  var cl = function(v, a, b){ return Math.max(a, Math.min(b, v)); };
  if(k==='ft') SG.fH = cl(SG.fH + 12*d, 54, 84); else if(k==='in') SG.fH = cl(SG.fH + d, 54, 84); else SG.fW = cl(SG.fW + d, 35, 150);
  var set = function(id, v){ var e = document.getElementById(id); if(e) e.textContent = v; };
  set('sg-ft', Math.floor(SG.fH/12)+' ft'); set('sg-in', (SG.fH%12)+' in'); set('sg-kg', SG.fW+' kg'); set('sg-cm', Math.round(SG.fH*2.54)+' cm');
};

/* a deep link (#/size-guide, e.g. from search or an ad) lands on a small page
   that opens the same window */
if(typeof ROUTES !== 'undefined') ROUTES.push([/^\/size-guide$/, 'size-guide']);
if(typeof PAGES !== 'undefined') PAGES['size-guide'] = {
  title:'Size guide',
  render:function(){ return '<div class="container sg-page"><h1 class="h1">Size guide</h1><p class="text2 mt8">Tell us your height and weight and we will match you to the right size for any item.</p><button type="button" class="btn btn-primary mt16" data-act="size-guide">'+ico('ruler',18)+'Find my size</button></div>'; },
  after:function(){ setTimeout(function(){ if(!MODAL) ACT['size-guide'](); }, 60); }
};
