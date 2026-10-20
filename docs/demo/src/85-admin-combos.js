/* ================= EXTAS demo — Admin · Combos & customer sets (85) ================= */
(function(){
  var css = `
.acb-page .card{color:var(--ink)}
.acb-g{display:grid;gap:16px;grid-template-columns:minmax(0,1fr)}
@media(min-width:768px){.acb-g{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:1180px){.acb-g{grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}}
.acb-card{display:flex;flex-direction:column;overflow:hidden}
.acb-card.off .acb-img{filter:grayscale(.85);opacity:.7}
.acb-card .pimg{border-radius:0}
.acb-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--line2)}
.acb-money{display:flex;align-items:stretch;border:1px solid var(--input);border-radius:var(--radius);overflow:hidden;background:var(--surface)}
.acb-money span{display:flex;align-items:center;padding:0 10px;background:var(--surface2);color:var(--muted);font-weight:600;border-right:1px solid var(--line2)}
.acb-money input{border:0;flex:1;min-width:0;padding:10px;font-size:16px;font-weight:700;font-family:var(--font-display);background:transparent}
.acb-money:focus-within{outline:2px solid var(--brand);outline-offset:1px}
.acb-tiers{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.acb-info{display:flex;gap:10px;align-items:flex-start;background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--brand);border-radius:8px;padding:12px 14px;font-size:13.5px}
.acb-items{display:flex;flex-wrap:wrap;gap:6px}
.acb-items span{font-size:12.5px;background:var(--surface2);border:1px solid var(--line2);border-radius:14px;padding:3px 9px}
`;
  var s = document.createElement('style'); s.setAttribute('data-mod', 'admin-combos'); s.textContent = css; document.head.appendChild(s);
})();

function acb_regular(c){ return c.items.reduce(function(s, pid){ var p = P(pid); return s + (p ? p.price : 0); }, 0); }
function acb_saveText(c){
  var reg = acb_regular(c), save = reg - (Number(c.price)||0);
  if(!c.price || c.price<=0) return '<span style="color:var(--sale)">Enter a set price</span>';
  /* R16 (5): a set at or above its regular price is sold at the regular
     price, with no "set price" or saving shown anywhere */
  if(save<=0) return '<span style="color:var(--sale);font-weight:600" data-testid="acb-warn-'+esc(c.id)+'">'+ico('info',13)+' Not lower than the regular '+fmt(reg)+'. Customers will pay the regular '+fmt(reg)+' and no set saving is shown. Enter a price below '+fmt(reg)+' to make it an offer.</span>';
  return 'Regular '+fmt(reg)+' · customer saves <b class="brandc">'+fmt(save)+'</b> ('+Math.round(save/reg*100)+'%) · sets already in bags move to this price';
}
function acb_switch(on, act, id, label){
  return '<button class="switch'+(on?' on':'')+'" role="switch" aria-checked="'+(on?'true':'false')+'" aria-label="'+esc(label)+'" data-act="'+act+'" data-id="'+esc(id)+'"></button>';
}
function acb_setCombo(id, patch){ ST.combosOverride[id] = Object.assign({}, ST.combosOverride[id] || {}, patch); saveState(); }
function acb_setRule(id, patch){ ST.setRulesOverride[id] = Object.assign({}, ST.setRulesOverride[id] || {}, patch); saveState(); }
function acb_rule(id){ return setRules().filter(function(r){ return r.id===id; })[0]; }
function acb_each(price, n){ return price ? '= '+fmt(Math.round(price/n))+' each' : 'Not offered'; }

/* R16 wave 2 (সওদাগর Sawdagor A360-04): the page now has three tabs —
   auto colour-pair combos (the owner's model, PR 571–576, default), the
   step-by-step "Make a combo" wizard, and the fixed combos & customer sets
   below (unchanged). Wizard and rule list code: acw_ (end of this file). */
PAGES['admin-combos'] = { layout:'admin', title:'Combos & customer sets', render:function(params, q){
  var tab = (q && q.tab) || 'auto';
  if(typeof ca_rules!=='function') tab = 'fixed';
  if(tab!=='new' && UI.acw && UI.acw.saved) delete UI.acw;   /* a finished wizard starts fresh next time */
  var allR = typeof ca_rules==='function' ? ca_rules() : [];
  var nArch = allR.filter(acw_isArchived).length, nRules = allR.length - nArch;
  /* Owner, 11:51: ended or switched-off rules move to Archive by themselves */
  var tabs = typeof zo_tabs==='function' ? zo_tabs('#/admin/combos', [['auto','Auto colour-pair combos', nRules],['new', (q && q.rule) ? 'Edit combo rule' : '+ Make a combo'],['archive','আর্কাইভ / Archive', nArch],['fixed','Fixed combos & customer sets']], tab) : '';
  var body = tab==='new' ? acw_wizard(q||{}) : tab==='fixed' ? acb_fixedHTML() : tab==='archive' ? acw_archiveHTML() : acw_rulesHTML();
  return '<div class="acb-page zs-page">'+
    (typeof zs_head==='function' ? zs_head('Admin · Offers '+zs_pr('90 · 571–576'), 'Combos', 'কম্বো — রঙের জোড়া নিজে থেকেই তৈরি হয়',
      'একটা প্রোডাক্ট আপলোড করুন, এখানে ক্যাটাগরি বা স্টাইল বেছে নিন, ২ পিস না ৩ পিস বলুন — প্রতিটা রঙের জোড়া আলাদা কম্বো হয়ে দোকানে চলে যাবে। যা বদলাবেন, দোকানে সাথে সাথে বদলায়।',
      '<a class="btn btn-ghost" href="#/combos">'+ico('eye',16)+'See combos on the shop</a>') : '')+
    tabs+body+'</div>';
}};
function acb_fixedHTML(){
  var cs = combos(), rs = setRules();
  var activeC = cs.filter(function(c){ return c.active; }).length, activeR = rs.filter(function(r){ return r.active; }).length;
  return '<div class="acb-fixed">'+
    '<div class="mb24"><h2 class="h2" style="margin-top:6px">Fixed combos &amp; customer sets</h2>'+
      '<p class="text2 mt8" style="max-width:660px;margin-bottom:0">Fixed combos you put together, and the groups customers may mix themselves. Prices here are what the bag and checkout use.</p>'+
      '<div class="row wrap mt12" style="gap:8px"><span class="tag">'+activeC+' of '+cs.length+' combos active</span><span class="tag plain">'+activeR+' of '+rs.length+' customer set groups active</span></div></div>'+

    '<div class="row between wrap mb16" style="align-items:flex-end;gap:8px"><div><h2 class="h2">Fixed combos</h2><div class="small text2" style="margin-top:4px">Ready-made sets with one price.</div></div></div>'+
    acb_layoutCard()+
    '<div class="acb-g">'+cs.map(acb_comboCard).join('')+'</div>'+
    '<div class="acb-info mt16">'+ico('bolt',18,'style="color:var(--brand);flex-shrink:0;margin-top:1px"')+'<div><b>Auto-apply:</b> when the bag has every item of an active combo, the set price is applied by itself — even if the customer added the items one by one.</div></div>'+

    '<div class="mt48 mb16"><h2 class="h2">What customers can combine</h2>'+
      '<div class="small text2" style="margin-top:4px;max-width:660px">Customers can only build sets from these groups — nothing else gets a set price.</div></div>'+
    '<div class="acb-g">'+rs.map(acb_ruleCard).join('')+'</div>'+
  '</div>';
}

/* R16 · which complete layout the set page uses (A/B test), and the phone
   order of the current one. Saved in ST.comboLayout / ST.comboPhoneOrder;
   COMBO_LAYOUT in 40-combo.js is the default when nothing is chosen here. */
function acb_layoutCard(){
  if(typeof CB_LAYOUTS==='undefined') return '';
  var cur = cb_layout({}), ord = cb_phoneOrder({});
  var opt = function(v, l, on){ return '<option value="'+v+'"'+(on?' selected':'')+'>'+esc(l)+'</option>'; };
  var desc = {current:'One card per item, as before (all bugs fixed).', L1:'Photo, price and one compact row per item — everything on the first phone screen.', L2:'One item at a time; picking a size moves on by itself.', L3:'All colours as a tap grid; one size for all.', L4:'Tap a ready-made look, then one size for all.'};
  return '<div class="card p16 mb16" data-testid="acb-layout"><div class="row between wrap" style="gap:12px;align-items:flex-end">'+
    '<div style="min-width:0"><label class="label" for="acb-layout">Set page layout</label><select id="acb-layout" class="input" data-change="acb-layout">'+Object.keys(CB_LAYOUTS).map(function(k){ return opt(k, CB_LAYOUTS[k], k===cur); }).join('')+'</select>'+
    '<div class="xs text2 mt8">'+esc(desc[cur]||'')+' Preview any layout: add <b>?layout=L1</b> … <b>L4</b> to a set link.</div></div>'+
    (cur==='current' ? '<div><label class="label" for="acb-order">Phone order</label><select id="acb-order" class="input" data-change="acb-order">'+opt('C','Short photo, then pickers', ord==='C')+opt('A','Pickers under the price', ord==='A')+opt('B','Pickers above the photo', ord==='B')+'</select></div>' : '')+
  '</div></div>';
}
CHANGE['acb-layout'] = function(el){ ST.comboLayout = el.value; saveState(); rerender(); toast('Set page layout: '+CB_LAYOUTS[el.value]); };
CHANGE['acb-order'] = function(el){ ST.comboPhoneOrder = el.value; saveState(); rerender(); toast('Phone order saved'); };

function acb_comboCard(c){
  // same product twice → show it in two different colours
  var seen = {}, items = c.items.filter(function(pid){ return !!P(pid); }).map(function(pid){
    var p = P(pid), k = seen[pid] || 0; seen[pid] = k+1; return {product:pid, color:p.colors[k % p.colors.length]};
  });
  return '<article class="card acb-card'+(c.active?'':' off')+'" data-testid="acb-combo-'+c.id+'">'+
    '<div class="acb-img">'+setImg(items, {ratio:'ratio-wide'})+'</div>'+
    '<div class="p16" style="display:flex;flex-direction:column;gap:12px;flex:1">'+
      '<div><div class="row between top" style="gap:8px"><h3 class="h3" style="font-size:16px">'+esc(c.name)+'</h3>'+(c.active?(c.autoApply?'<span class="tag">'+ico('bolt',12)+'Auto</span>':'<span class="tag plain">Manual</span>'):'<span class="tag plain">Off</span>')+'</div>'+
        '<div class="xs muted" style="margin-top:3px">'+esc(c.blurb||'')+'</div></div>'+
      '<div class="acb-items">'+c.items.map(function(pid){ var p = P(pid); return '<span>'+esc(p ? p.name : pid)+'</span>'; }).join('')+'</div>'+
      '<div><label class="label" for="acb-price-'+c.id+'">Set price</label><div class="acb-money"><span>৳</span><input id="acb-price-'+c.id+'" type="number" inputmode="numeric" min="0" step="10" value="'+esc(c.price)+'" data-input="acb-price" data-id="'+c.id+'" data-testid="acb-price-'+c.id+'"></div>'+
        '<div class="xs text2 mt8" id="acb-save-'+c.id+'">'+acb_saveText(c)+'</div></div>'+
      '<div style="margin-top:auto">'+
        '<div class="acb-row"><span class="small bold">Active</span>'+acb_switch(c.active, 'acb-active', c.id, c.name+' active')+'</div>'+
        '<div class="acb-row"><span class="small">Auto-apply when the bag matches</span>'+acb_switch(c.autoApply, 'acb-auto', c.id, 'Auto-apply '+c.name+' when the bag matches')+'</div>'+
        /* K11: one-product combos are colour pairs; the owner may let the same colour count */
        ((c.items||[]).length>1 && (c.items||[]).every(function(x){ return x===c.items[0]; }) ? '<div class="acb-row"><span class="small">একই রঙ দুইটা নিলেও কম্বো দাম</span>'+acb_switch(c.sameColour===true, 'acb-samecol', c.id, 'একই রঙ দুইটা নিলেও কম্বো দাম — '+c.name)+'</div>' : '')+
        '<div class="acb-row" style="padding-bottom:0"><a class="link row" style="gap:4px;text-decoration:none" href="#/combo/'+c.id+'">'+ico('eye',15)+'See the combo page</a><span class="xs muted">/combo/'+esc(c.id)+'</span></div>'+
      '</div>'+
    '</div>'+
  '</article>';
}

function acb_ruleCard(r){
  var chips = r.mode==='category'
    ? r.categories.map(function(id){ var c = CAT(id); return '<span class="chip" style="cursor:default">'+esc(c ? c.name : id)+'</span>'; })
    : r.skus.map(function(id){ var p = P(id); return '<span class="chip" style="cursor:default">'+esc(p ? p.name : id)+'</span>'; });
  var t2 = r.tiers && r.tiers[2], t3 = r.tiers && r.tiers[3];
  var count = r.mode==='category' ? r.categories.reduce(function(s, id){ return s + productsIn(id).length; }, 0) : r.skus.length;
  return '<article class="card p16'+(r.active?'':' acb-off')+'" style="display:flex;flex-direction:column;gap:12px'+(r.active?'':';background:var(--surface2)')+'" data-testid="acb-rule-'+r.id+'">'+
    '<div class="row between top" style="gap:8px"><div><h3 class="h3" style="font-size:16px">'+esc(r.name)+'</h3>'+
      '<div class="row wrap" style="gap:6px;margin-top:6px"><span class="tag '+(r.mode==='category'?'':'gold')+'">'+(r.mode==='category'?'Category ↔ category':'Selected SKUs')+'</span><span class="xs muted">'+plural(count, 'product')+'</span></div></div>'+
      acb_switch(r.active, 'acb-rule-active', r.id, r.name+' active')+'</div>'+
    '<div class="row wrap" style="gap:6px">'+chips.join('')+'</div>'+
    '<div class="acb-tiers">'+
      '<div><label class="label" for="acb-t2-'+r.id+'">2 items</label><div class="acb-money"><span>৳</span><input id="acb-t2-'+r.id+'" type="number" inputmode="numeric" min="0" step="10" value="'+(t2||'')+'" placeholder="Not offered" data-input="acb-tier" data-id="'+r.id+'" data-n="2"></div><div class="xs muted mt8" id="acb-each-'+r.id+'-2">'+acb_each(t2, 2)+'</div></div>'+
      '<div><label class="label" for="acb-t3-'+r.id+'">3 items</label><div class="acb-money"><span>৳</span><input id="acb-t3-'+r.id+'" type="number" inputmode="numeric" min="0" step="10" value="'+(t3||'')+'" placeholder="Not offered" data-input="acb-tier" data-id="'+r.id+'" data-n="3"></div><div class="xs muted mt8" id="acb-each-'+r.id+'-3">'+acb_each(t3, 3)+'</div></div>'+
    '</div>'+
    '<div class="xs muted">Leave a box empty to not offer that size of set.</div>'+
    '<div class="xs '+(r.active?'text2':'')+'" style="'+(r.active?'':'color:var(--warn);font-weight:600')+'">'+(r.active ? 'Customers see this on product pages and in Build a set.' : 'Off — customers cannot build this set.')+'</div>'+
    '<div class="acb-row" style="margin-top:auto;padding-bottom:0"><a class="link row" style="gap:4px;text-decoration:none" href="#/set/'+r.id+'">'+ico('eye',15)+'See it as a customer</a><span class="xs muted">/set/'+esc(r.id)+'</span></div>'+
  '</article>';
}

/* ---------- actions ---------- */
INPUT['acb-price'] = function(el){
  var id = el.getAttribute('data-id'), n = parseInt(el.value, 10);
  if(!isNaN(n) && n>0) acb_setCombo(id, {price:n});
  var c = COMBO(id), shown = Object.assign({}, c, {price: isNaN(n) ? 0 : n});
  var t = document.getElementById('acb-save-'+id); if(t) t.innerHTML = acb_saveText(shown);
};
ACT['acb-active'] = function(el){ var id = el.getAttribute('data-id'), c = COMBO(id); acb_setCombo(id, {active:!c.active}); rerender(); toast(c.name+(c.active?' turned off':' is active')); };
ACT['acb-samecol'] = function(el){ var id = el.getAttribute('data-id'), c = COMBO(id); acb_setCombo(id, {sameColour:c.sameColour!==true}); rerender(); toast(c.name+(c.sameColour!==true ? ' — একই রঙ দুইটা নিলেও এখন কম্বো দাম' : ' — শুধু আলাদা রঙ নিলে কম্বো দাম')); };
ACT['acb-auto'] = function(el){ var id = el.getAttribute('data-id'), c = COMBO(id); acb_setCombo(id, {autoApply:!c.autoApply}); rerender(); toast(!c.autoApply ? c.name+' applies by itself when the bag matches' : c.name+' no longer applies by itself'); };
INPUT['acb-tier'] = function(el){
  var id = el.getAttribute('data-id'), k = el.getAttribute('data-n'), r = acb_rule(id); if(!r) return;
  var v = String(el.value).trim(), n = parseInt(v, 10), tiers = Object.assign({}, r.tiers || {});
  if(v==='') delete tiers[k]; else if(!isNaN(n) && n>0) tiers[k] = n; else return;
  acb_setRule(id, {tiers:tiers});
  var e = document.getElementById('acb-each-'+id+'-'+k); if(e) e.textContent = acb_each(tiers[k], +k);
};
ACT['acb-rule-active'] = function(el){ var id = el.getAttribute('data-id'), r = acb_rule(id); acb_setRule(id, {active:!r.active}); rerender(); toast(r.name+(r.active?' turned off':' is active')); };

/* =====================================================================
   AUTO COLOUR-PAIR COMBOS — rule list + "Make a combo" wizard (PR 90, 571–576)
   সওদাগর Sawdagor A360-04 · R16 wave 2
   · Rules live in DB.comboRules (01y seed). An edit to a seed rule goes to
     ST.comboAutoOverride (the engine's own override, read by ca_rule); a rule
     made in the wizard is kept in ST.ops.combos and pushed into
     DB.comboRules by acw_apply() — so #/combos and #/combos/<rule> change
     the moment the owner saves.
   · Nothing is deleted: a rule is switched off (standing rule).
   ===================================================================== */
var ACW_BASE_IDS = (DB.comboRules||[]).map(function(r){ return r.id; });
function acw_store(){ ST.ops = ST.ops || {}; if(!ST.ops.combos) ST.ops.combos = {rules:[]}; return ST.ops.combos; }
function acw_apply(){
  if(!DB.comboRules) DB.comboRules = [];
  for(var i=DB.comboRules.length-1;i>=0;i--) if(ACW_BASE_IDS.indexOf(DB.comboRules[i].id)<0) DB.comboRules.splice(i,1);
  acw_store().rules.forEach(function(r){ DB.comboRules.push(JSON.parse(JSON.stringify(r))); });
  if(typeof CA!=='undefined') CA.cache = {};
}
function acw_isBase(id){ return ACW_BASE_IDS.indexOf(id)>=0; }
function acw_patch(id, patch){
  if(acw_isBase(id)){ ST.comboAutoOverride = ST.comboAutoOverride || {}; ST.comboAutoOverride[id] = Object.assign({}, ST.comboAutoOverride[id]||{}, JSON.parse(JSON.stringify(patch))); }
  else { var s = acw_store(); s.rules.forEach(function(r){ if(r.id===id) Object.assign(r, JSON.parse(JSON.stringify(patch))); }); }
  acw_apply(); saveState();
}
var ACW_PAIR = {style:['Same style','একই স্টাইলের রং মিলিয়ে','e.g. Black + Navy of the same polo'], across:['One from each style','আলাদা স্টাইল মিলিয়ে','e.g. a hoodie + a jogger'], any:['Any mix','যেকোনো রং, যেকোনো স্টাইল','every piece with every other']};
var ACW_LIST = {'':'Shop default', L1:'L1 · Pair grid', L2:'L2 · Style cards', L3:'L3 · Hub', L4:'L4 · Big list', L5:'L5 · 2 or 3 first'};
var ACW_PAGE = {'':'Shop default', auto:'Auto (P1, or P2 when many)', P1:'P1 · Pair page', P2:'P2 · Pick colours', P3:'P3 · Top + bottom set', P4:'P4 · Mixed set', P5:'P5 · Fixed pack'};
function acw_bindNames(b){
  var out = [];
  (b.categories||[]).forEach(function(path){ out.push(path.indexOf('/')<0 ? ((CAT(path)||{}).name||path) : (typeof zp_path==='function' ? zp_path({cat:path.split('/')[0], sub:path}) : path)); });
  (b.products||[]).forEach(function(id){ var p = P(id); out.push(p ? p.name : id); });
  return out;
}
function acw_link(r){ return '#/combos/'+r.id; }
/* AUTO ADJUST (owner: nothing cut off on any screen). A rule name or link
   that does not fit eases its font down, then drops its least important
   words — " combos" at the end of a name, "#/combos/" in front of a link
   (the Copy button always copies the full link). Last resort for a name:
   two lines. 03-layout.js fit engine; CSS in r12-zadmin2.css. */
function acw_nameHTML(n){ var m = String(n||'').match(/^(.*\S)(\s+combos?)$/i); return m ? esc(m[1])+'<span data-x="1">'+esc(m[2])+'</span>' : esc(n); }
function acw_linkHTML(l){ var m = String(l||'').match(/^(#\/combos\/)(.+)$/); return m ? '<span data-x="1">'+esc(m[1])+'</span>'+esc(m[2]) : esc(l); }
if(typeof fitRule==='function'){ fitRule('.acw-nm', {min:13, collapse:2}); fitRule('.acw-link code', {min:10.5, collapse:true}); }
function acw_priceText(r, L){
  var reg = L ? L.regular : 0, pr = L ? L.price : 0;
  var how = r.price.mode==='percent' ? r.price.value+'% off' : fmt(r.price.value)+' a pack';
  return L ? '<span class="acw-pl">'+r.pieces+' pcs <span class="strike">'+fmt(reg)+'</span> → <b>'+fmt(pr)+'</b></span><span class="zs-mini acw-pl">Price rule: '+how+'</span>' : how;
}
function acw_sel(act, id, map, cur){ return '<select class="input zs-in" data-change="'+act+'" data-id="'+esc(id)+'" aria-label="'+esc(act)+'">'+Object.keys(map).map(function(k){ return '<option value="'+k+'"'+(k===(cur||'')?' selected':'')+'>'+esc(map[k])+'</option>'; }).join('')+'</select>'; }

/* ---------- tab 1: the rules ---------- */
/* ---------- rule lifecycle (owner, 11:51) ----------
   Nothing is deleted. A rule whose end date has passed, or that the owner
   switched off, sits in Archive; its pages still open in the ended state.
   "Turn on again" (or a later end date) brings it back with the same URLs. */
function acw_isArchived(r){ return r.state==='ended' || r.state==='off'; }
var ACW_STATE = {live:['চলছে','ok'], soon:['শুরু হবে','info'], ended:['শেষ হয়েছে','warn'], off:['বন্ধ','']};
function acw_stateTag(r){
  var s = ACW_STATE[r.state] || ACW_STATE.live, txt = s[0] + (r.state==='soon' ? ' '+ca_dateNice(r.start) : r.state==='ended' ? ' · '+ca_dateNice(r.end) : '');
  return '<span class="zo-pill '+s[1]+' za-bn" data-testid="acw-state" data-state="'+r.state+'">'+esc(txt)+'</span>';
}
function acw_dates(r){
  var f = function(k, lab, bn){ return '<label class="zs-mini acw-dt"><span>'+esc(lab)+' · <span class="za-bn">'+esc(bn)+'</span></span><input class="input zs-in" type="date" value="'+esc(r[k]||'')+'" data-change="acw-date" data-id="'+esc(r.id)+'" data-k="'+k+'" aria-label="'+esc(lab)+'"></label>'; };
  return '<div class="acw-tpls acw-dates" data-testid="acw-dates">'+f('start','Starts','শুরু')+f('end','Ends','শেষ')+'</div>'+
    '<div class="zs-mini za-bn">'+(r.start || r.end ? 'তারিখ শেষ হলে নিজে থেকে বন্ধ হবে — পেজ খোলা থাকবে।' : 'তারিখ না দিলে সবসময় চলবে।')+'</div>';
}
function acw_archiveHTML(){
  var rules = ca_rules().filter(acw_isArchived);
  return '<div class="acw"><div class="zs-note mb16">'+ico('layers',17)+'<div class="zs-bnp"><b>এখানে শেষ হওয়া আর বন্ধ করা কম্বো থাকে — কিছুই মোছা হয় না।</b> এদের পেজ এখনো খোলে, "এই অফার শেষ" লেখা দেখায়, পাশে চালু কম্বো দেখায় — তাই গুগল র‍্যাংক আর শেয়ার করা লিংক নষ্ট হয় না। "আবার চালু করুন" চাপলে একই লিংকে ফিরে আসবে।</div></div>'+
    (rules.length ? '<div class="acb-g">'+rules.map(acw_ruleCard).join('')+'</div>' : '<div class="zs-empty" data-testid="acw-arch-empty">Nothing in the archive. Ended or switched-off combo rules come here by themselves.</div>')+'</div>';
}
function acw_rulesHTML(){
  var rules = ca_rules().filter(function(r){ return !acw_isArchived(r); }), def = ST.comboAuto || {};
  var cards = rules.map(acw_ruleCard).join('');
  return '<div class="acw">'+
    '<div class="acw-how">'+[['১','প্রোডাক্ট আপলোড করুন','Products → New product, "Use in combos" ticked'],['২','ক্যাটাগরি বা স্টাইল বাছুন, ২ না ৩ পিস','+ Make a combo — 8 short steps'],['৩','জোড়াগুলো নিজে তৈরি — লিংক প্রমোট করুন','copy the page link for your ad']].map(function(s){ return '<div class="acw-howi"><b class="za-bn">'+s[0]+'</b><div style="min-width:0"><div class="small bold za-bn">'+s[1]+'</div><div class="zs-mini">'+s[2]+'</div></div></div>'; }).join('')+'</div>'+
    '<section class="zs-card mb16"><div class="row between wrap" style="gap:8px"><h2>Shop default templates</h2>'+zs_pr('572 · 573 · 576')+'</div><div class="zs-sub za-bn">কোনো রুলে আলাদা করে না বললে এই ডিজাইন দেখাবে</div>'+
      '<div class="za-f2"><div><label class="label" for="acw-dl">Combo category page</label>'+acw_sel('acw-deftpl', 'listTpl', {L1:ACW_LIST.L1, L2:ACW_LIST.L2, L3:ACW_LIST.L3, L4:ACW_LIST.L4, L5:ACW_LIST.L5}, def.listTpl||'L1').replace('<select', '<select id="acw-dl"')+'</div>'+
      '<div><label class="label" for="acw-dp">Combo product page</label>'+acw_sel('acw-deftpl', 'pageTpl', {auto:ACW_PAGE.auto, P1:ACW_PAGE.P1, P2:ACW_PAGE.P2, P3:ACW_PAGE.P3, P4:ACW_PAGE.P4, P5:ACW_PAGE.P5}, def.pageTpl||'auto').replace('<select', '<select id="acw-dp"')+'</div>'+
      /* wave 2 · PR 574: how a combo shows in the bag (43-combo-tpl.js) */
      (typeof CBT_LIST!=='undefined' ? '<div><label class="label" for="acw-db">Combo in the bag <span class="zs-mini za-bn">ব্যাগে কম্বো কেমন দেখাবে</span></label>'+acw_sel('acw-deftpl', 'bagTpl', (function(){ var m = {}; Object.keys(CBT_LIST).forEach(function(k){ m[k] = k==='current' ? 'Current look' : k+' · '+CBT_LIST[k]; }); return m; })(), def.bagTpl||'current').replace('<select', '<select id="acw-db"')+'</div>' : '')+
      '</div></section>'+
    '<div class="row between wrap mb16" style="gap:8px;align-items:flex-end"><div><h2 class="h2">Combo rules</h2><div class="small text2" style="margin-top:4px">'+rules.filter(function(r){ return r.active; }).length+' of '+rules.length+' on · each rule makes its own combo page</div></div>'+
      '<a class="btn btn-primary" href="#/admin/combos?tab=new" data-testid="acw-new">'+ico('plus',16)+'Make a combo</a></div>'+
    '<div class="acb-g">'+cards+'</div></div>';
}
function acw_ruleCard(r){
  var g = ca_generate(r), top = g.visible[0] || g.all[0], up = ca_upsellRule(Object.assign({}, r, {allowUpsell3:true}));
  var link = acw_link(r);
  return '<article class="card acb-card acw-card'+(r.active?'':' off')+'" data-testid="acw-rule-'+r.id+'">'+
    '<div class="acb-img">'+(top ? ca_setPhoto(top.pieces, {layout:'card', cls:'acw-ph'}) : '<div class="ca-ph ca-ph-card acw-ph ca-ph-empty"><span class="zs-mini">No pairs yet</span></div>')+'</div>'+
    '<div class="p16" style="display:flex;flex-direction:column;gap:10px;flex:1">'+
      '<div class="row between top" style="gap:8px"><div style="min-width:0"><h3 class="h3 acw-nm">'+acw_nameHTML(r.name)+'</h3><div class="row wrap" style="gap:6px;margin-top:5px">'+acw_stateTag(r)+'<span class="tag">'+r.pieces+'-piece</span><span class="tag plain">'+esc(ACW_PAIR[r.pairing][0])+'</span>'+(r.season?'<span class="tag plain">'+esc(r.season)+'</span>':'')+'</div></div>'+
        acb_switch(r.on, 'acw-active', r.id, r.name+' on or off')+'</div>'+
      '<div class="acb-items">'+acw_bindNames(r.bind).map(function(n){ return '<span>'+esc(n)+'</span>'; }).join('')+'</div>'+
      '<div class="small acw-price">'+acw_priceText(r, top)+'</div>'+
      '<div class="acw-cnt"><b>'+g.all.length+'</b> combos made · <b>'+g.visible.length+'</b> with stock'+(g.all.length-g.visible.length ? ' · '+(g.all.length-g.visible.length)+' hidden (sold out)' : '')+'</div>'+
      acw_dates(r)+
      (acw_isArchived(r) ? '<button type="button" class="btn btn-primary btn-sm" data-act="acw-revive" data-id="'+esc(r.id)+'" data-testid="acw-revive">'+ico('check',14)+'<span class="za-bn">আবার চালু করুন</span> · Turn on again</button>' : '')+
      '<div style="margin-top:auto">'+
        '<div class="acb-row"><span class="small">No single pieces in this section <span class="zs-mini za-bn" style="display:block">শুধু জোড়ায় বিক্রি, একটা না</span></span>'+acb_switch(r.noSingle!==false, 'acw-nosingle', r.id, 'No single pieces in '+r.name)+'</div>'+
        (r.pieces===2 ? '<div class="acb-row"><span class="small">“Add 1 more → 3 pcs” <span class="zs-mini" style="display:block">'+(up ? 'uses '+esc(up.name)+(up.active?'':' (off)') : 'needs a 3-piece rule — turn on to make one')+'</span></span>'+acb_switch(!!r.allowUpsell3, 'acw-upsell', r.id, 'Add one more upsell for '+r.name)+'</div>' : '')+
        '<div class="acw-tpls"><label class="zs-mini">Page'+acw_sel('acw-tpl', r.id+'|listTpl', ACW_LIST, r.listTpl)+'</label><label class="zs-mini">Pair page'+acw_sel('acw-tpl', r.id+'|pageTpl', ACW_PAGE, r.pageTpl)+'</label></div>'+
        '<div class="acw-link"><code>'+acw_linkHTML(link)+'</code><button type="button" class="btn btn-sm btn-ghost" data-act="zo-copy" data-text="'+esc(zo_shopUrl(link))+'" data-msg="Page link copied — paste it in your ad">'+ico('link',14)+'Copy link</button></div>'+
        '<div class="acw-acts"><a class="btn btn-sm btn-secondary" href="#/admin/combos?tab=new&rule='+r.id+'">'+ico('edit',14)+'Edit</a><a class="btn btn-sm btn-ghost" href="'+link+'">'+ico('eye',14)+'Open page</a></div>'+
      '</div></div></article>';
}
ACT['acw-active'] = function(el){
  var id = el.getAttribute('data-id'), r = ca_rule(id); acw_patch(id, {active:!r.on}); rerender();
  var n = ca_rule(id);
  toast(r.on ? r.name+' is off — moved to Archive; its pages stay open and say the offer has ended' : n.state==='live' ? r.name+' is on — live on the shop' : r.name+' is on — '+(n.state==='soon' ? 'starts '+ca_dateNice(n.start) : 'end date has passed, change it to sell again'));
};
CHANGE['acw-date'] = function(el){
  var id = el.getAttribute('data-id'), k = el.getAttribute('data-k'), p = {}; p[k] = el.value || '';
  var r0 = ca_rule(id), o = {start:k==='start' ? p.start : r0.start, end:k==='end' ? p.end : r0.end};
  if(o.start && o.end && o.end < o.start){ toast('The end date is before the start date'); rerender(); return; }
  acw_patch(id, p); rerender(); var r = ca_rule(id);
  toast(r.name+' — '+(r.state==='live' ? 'live' + (r.end ? ' until '+ca_dateNice(r.end) : ' all the time') : r.state==='soon' ? 'starts '+ca_dateNice(r.start) : r.state==='ended' ? 'ended — in Archive' : 'off'));
};
/* back from the archive: switched on, and an end date that has passed is cleared (same URLs) */
ACT['acw-revive'] = function(el){
  var id = el.getAttribute('data-id'), r = ca_rule(id), p = {active:true};
  if(r.end && ca_today() > r.end) p.end = '';
  acw_patch(id, p); rerender(); toast(r.name+' is back on the shop — same links as before');
};
ACT['acw-nosingle'] = function(el){ var id = el.getAttribute('data-id'), r = ca_rule(id), v = r.noSingle===false; acw_patch(id, {noSingle:v}); rerender(); toast(v ? 'No single pieces on '+r.title+' combo page' : 'Single pieces listed under the combos'); };
ACT['acw-upsell'] = function(el){
  var id = el.getAttribute('data-id'), r = ca_rule(id), v = !r.allowUpsell3;
  if(v && !ca_upsellRule(Object.assign({}, r, {allowUpsell3:true}))){
    var up = acw_makeUp(r, {mode:r.price.mode, value:r.price.mode==='percent' ? Math.min(90, (+r.price.value||0)+5) : Math.round((+r.price.value||0)*1.42/10)*10});
    acw_patch(id, {allowUpsell3:true, upsell:up.id}); rerender(); toast('3-piece rule made: '+up.name+' — edit its price any time'); return;
  }
  acw_patch(id, {allowUpsell3:v}); rerender(); toast(v ? '“Add 1 more → 3 pcs” on' : '“Add 1 more” off');
};
CHANGE['acw-tpl'] = function(el){ var a = el.getAttribute('data-id').split('|'), p = {}; p[a[1]] = el.value; acw_patch(a[0], p); toast('Template saved — '+(el.value||'shop default')); };
CHANGE['acw-deftpl'] = function(el){ ST.comboAuto = ST.comboAuto || {}; ST.comboAuto[el.getAttribute('data-id')] = el.value; saveState(); toast('Shop default: '+el.options[el.selectedIndex].text); };
/* the companion 3-piece rule for "add 1 more" */
function acw_makeUp(r, price){
  var s = acw_store(), base = r.id.replace(/-2$/,'')+'-3', id = base, i = 2;
  while(ca_rule(id) || s.rules.some(function(x){ return x.id===id; })) id = base+'-'+(i++);
  var up = {id:id, name:(r.title||r.name)+' 3-piece combos', title:r.title||r.name, label:'3-piece combo', season:r.season||'', bind:JSON.parse(JSON.stringify(r.bind)), pieces:3, pairing:r.pairing,
    excludeColours:(r.excludeColours||[]).slice(), price:price, noSingle:r.noSingle!==false, allowUpsell3:false, order:'bestsellers', active:true, made:'wizard'};
  s.rules.push(up); acw_apply(); saveState(); return up;
}

/* ---------- tab 2: the wizard ---------- */
var ACW_STEPS = [['What','কী দিয়ে'],['2 or 3','কয় পিস'],['Pairing','জোড়ার ধরন'],['Price','দাম'],['No singles','একটা না'],['Add 1 more','আরও ১টা'],['Preview','দেখে নিন'],['Promote','প্রমোট']];
function acw_draft(q){
  var key = (q.rule||'new')+'|'+(q.bind||'');
  var u = UI['acw'];
  if(u && u.key===key) return u;
  var d;
  if(q.rule && ca_rule(q.rule)){
    var r = ca_rule(q.rule), up = r.upsell ? ca_rule(r.upsell) : ca_upsellRule(Object.assign({}, r, {allowUpsell3:true}));
    d = JSON.parse(JSON.stringify(r)); d.up3 = up ? JSON.parse(JSON.stringify(up.price)) : {mode:r.price.mode, value:r.price.mode==='percent' ? (+r.price.value||0)+5 : Math.round((+r.price.value||0)*1.42/10)*10};
    d.editing = r.id;
  } else {
    d = {id:'', name:'', title:'', label:'2-piece combo', season:'', bind:{categories:[], products:[]}, pieces:2, pairing:'style', sameColour:false, excludeColours:[], price:{mode:'percent', value:15},
      noSingle:true, allowUpsell3:false, up3:{mode:'percent', value:20}, order:'bestsellers', listTpl:'', pageTpl:'', active:true, start:'', end:''};
    if(q.bind) d.bind.categories.push(q.bind);
  }
  u = UI['acw'] = {key:key, step:1, d:d, mode:(q.bind && q.bind.indexOf('/')>0) ? 'sub' : 'cat', pq:'', all:false, saved:null, err:''};
  return u;
}
function acw_norm(d, over){
  var r = JSON.parse(JSON.stringify(d)); if(over) Object.keys(over).forEach(function(k){ r[k] = over[k]; });
  r.id = r.id || '__acw'; r.label = r.pieces+'-piece combo'; r.title = r.title || acw_autoTitle(d); r.price = r.price || {mode:'percent', value:0};
  return r;
}
function acw_gen(d, over, tmpId){
  var r = acw_norm(d, over); r.id = tmpId || '__acw';
  var g = ca_generate(r); delete CA.cache[r.id]; return g;
}
function acw_autoTitle(d){
  var names = acw_bindNames(d.bind); if(!names.length) return '';
  var last = names[0].split(' › ').pop(); return names.length>1 ? last+' & more' : last;
}
function acw_colours(d){ var seen = {}, out = []; ca_productsFor(acw_norm(d)).forEach(function(p){ p.colors.forEach(function(c){ if(!seen[c]){ seen[c] = 1; out.push(c); } }); }); return out; }
function acw_wizard(q){
  var u = acw_draft(q), d = u.d;
  if(u.saved) return acw_savedHTML(u);
  var g = acw_gen(d), step = u.step;
  var nav = '<ol class="acw-steps" aria-label="Steps">'+ACW_STEPS.map(function(s, i){ var n = i+1, st = n<step ? 'done' : n===step ? 'now' : '';
    return '<li class="'+st+'"><button type="button" data-act="acw-go" data-n="'+n+'" aria-current="'+(n===step?'step':'false')+'"><span class="acw-sn">'+(st==='done'?ico('check',12):n)+'</span><span class="acw-sl">'+esc(s[0])+'</span></button></li>'; }).join('')+'</ol>';
  var body = [null, acw_s1, acw_s2, acw_s3, acw_s4, acw_s5, acw_s6, acw_s7, acw_s8][step](u, g);
  var ok = acw_canNext(u, g);
  return '<div class="acw acw-wiz" data-testid="acw-wiz" data-step="'+step+'">'+
    (d.editing ? '<div class="zs-note mb16">'+ico('edit',17)+'<div class="zs-bnp">আপনি <b>'+esc(d.name)+'</b> রুলটা বদলাচ্ছেন। "Save" চাপলে দোকানে সাথে সাথে বদলে যাবে।</div></div>' : '')+
    nav+
    '<section class="zs-card acw-body"><div class="acw-stephd"><span class="zs-mini">Step '+step+' of 8</span><h2>'+esc(ACW_STEPS[step-1][0])+' <span class="za-bn acw-bnh">· '+esc(ACW_STEPS[step-1][1])+'</span></h2></div>'+body+'</section>'+
    '<div class="acw-foot"><div class="acw-live" data-testid="acw-live"><b>'+g.all.length+'</b><span class="za-bn">টা কম্বো তৈরি হবে</span><span class="zs-mini">'+g.visible.length+' with stock · '+g.products.length+' product'+(g.products.length===1?'':'s')+'</span></div>'+
      '<div class="acw-btns">'+(step>1 ? '<button type="button" class="btn btn-ghost" data-act="acw-go" data-n="'+(step-1)+'">'+ico('back',15)+'Back</button>' : '<a class="btn btn-ghost" href="#/admin/combos">Cancel</a>')+
      (step<8 ? '<button type="button" class="btn btn-primary" data-act="acw-go" data-n="'+(step+1)+'"'+(ok?'':' aria-disabled="true"')+' data-testid="acw-next">Next'+ico('right',15)+'</button>' : '<button type="button" class="btn btn-primary" data-act="acw-save" data-testid="acw-save">'+ico('check',16)+(d.editing?'Save changes':'Save & turn on')+'</button>')+'</div></div>'+
    (u.err ? '<div class="acw-err" role="alert">'+esc(u.err)+'</div>' : '')+
  '</div>';
}
function acw_canNext(u, g){
  if(u.step===1) return g.products.length>0;
  if(u.step===3) return g.all.length>0;
  if(u.step===4) return (+u.d.price.value||0)>0;
  return true;
}
function acw_s1(u, g){
  var d = u.d, chosen = acw_bindNames(d.bind);
  var seg = '<div class="zs-tier acw-mode" role="group" aria-label="Choose by">'+[['cat','Category'],['sub','Sub-category / style'],['prod','Pick products']].map(function(m){ return '<button type="button" class="'+(u.mode===m[0]?'on':'')+'" data-act="acw-mode" data-v="'+m[0]+'">'+m[1]+'</button>'; }).join('')+'</div>';
  var list = '';
  if(u.mode==='cat'){
    list = '<div class="acw-picks">'+DB.categories.filter(function(c){ return productsIn(c.id).length; }).map(function(c){ var on = d.bind.categories.indexOf(c.id)>=0, n = productsIn(c.id).filter(function(p){ return !p.comboOff; }).length;
      return '<button type="button" class="acw-pick'+(on?' on':'')+'" data-act="acw-bind" data-k="categories" data-v="'+c.id+'" aria-pressed="'+on+'"><span class="zs-cb">'+ico('check',13)+'</span><span class="grow"><b>'+esc(c.name)+'</b><span class="zs-mini za-bn">'+esc(c.bn||'')+' · '+plural(n,'product')+'</span></span></button>'; }).join('')+'</div>';
  } else if(u.mode==='sub'){
    var subs = DB.subcats||[];
    list = subs.length ? '<div class="acw-picks">'+subs.map(function(s){ var on = d.bind.categories.indexOf(s.id)>=0, n = DB.products.filter(function(p){ return !p.comboOff && ca_inPath(p, s.id); }).length;
      return '<button type="button" class="acw-pick'+(on?' on':'')+'" data-act="acw-bind" data-k="categories" data-v="'+esc(s.id)+'" aria-pressed="'+on+'"><span class="zs-cb">'+ico('check',13)+'</span><span class="grow"><b>'+esc(s.name)+'</b><span class="zs-mini">'+esc(typeof zp_path==='function' ? zp_path({cat:s.id.split('/')[0], sub:s.id}) : s.id)+' · '+plural(n,'product')+'</span></span></button>'; }).join('')+'</div>' : '<div class="zs-empty">No sub-categories yet — add one from Products → New product.</div>';
  } else {
    var qq = (u.pq||'').toLowerCase();
    list = '<div class="zs-search mb8">'+ico('search',17)+'<input class="input zs-in" type="search" placeholder="Search products" value="'+esc(u.pq||'')+'" data-input="acw-pq" aria-label="Search products"></div>'+
      '<div class="acw-picks acw-prods" id="acw-prods">'+DB.products.filter(function(p){ return p.colors && p.colors.length; }).map(function(p){ var on = d.bind.products.indexOf(p.id)>=0;
        return '<button type="button" class="acw-pick acw-pp'+(on?' on':'')+'" data-act="acw-bind" data-k="products" data-v="'+p.id+'" aria-pressed="'+on+'" data-s="'+esc((p.name+' '+((CAT(p.cat)||{}).name||'')).toLowerCase())+'"'+(qq && (p.name+' '+((CAT(p.cat)||{}).name||'')).toLowerCase().indexOf(qq)<0?' style="display:none"':'')+'><span class="zs-cb">'+ico('check',13)+'</span><span class="acw-pth">'+productImg(p, p.colors[0], {ratio:'ratio-11', label:false})+'</span><span class="grow" style="min-width:0"><b>'+esc(p.name)+'</b><span class="zs-mini">'+p.colors.length+' colours · '+fmt(p.price)+(p.comboOff?' · not ticked for combos':'')+'</span></span></button>'; }).join('')+'</div>';
  }
  return '<p class="zs-bnp acw-help">কোন প্রোডাক্টগুলো থেকে কম্বো হবে? পুরো ক্যাটাগরি, একটা স্টাইল (সাব-ক্যাটাগরি) বা হাতে বেছে নেওয়া প্রোডাক্ট — যেটা সহজ। পরে ওই ক্যাটাগরিতে নতুন প্রোডাক্ট বা নতুন রং এলে নিজে থেকেই যোগ হবে।</p>'+seg+list+
    '<div class="acw-chosen"><span class="zs-mini">Chosen:</span>'+(chosen.length ? chosen.map(function(n, i){ return '<span class="acw-chip">'+esc(n)+'</span>'; }).join('') : '<span class="zs-mini">nothing yet</span>')+'</div>'+
    (g.products.length ? '<div class="zs-mini">'+g.products.length+' product'+(g.products.length===1?'':'s')+' · '+acw_colours(u.d).length+' colours in all</div>' : '');
}
function acw_s2(u, g){
  var d = u.d;
  var opt = function(n){ var c2 = acw_gen(d, {pieces:n}, '__acw_p'+n).all.length, on = d.pieces===n;
    var art = '<div class="acw-art n'+n+'">'+[0,1,2].slice(0,n).map(function(i){ return '<i style="background:'+['#1F2A44','#9DB8D3','#E0B53A'][i]+'"></i>'; }).join('')+'</div>';
    return '<button type="button" class="acw-big'+(on?' on':'')+'" data-act="acw-set" data-k="pieces" data-v="'+n+'" aria-pressed="'+on+'" data-testid="acw-p'+n+'">'+art+'<b>'+n+'-piece combo</b><span class="za-bn">'+(n===2?'২টা একসাথে':'৩টা একসাথে')+'</span><span class="zs-mini">'+c2+' combos</span></button>'; };
  return '<p class="zs-bnp acw-help">প্রতিটা কম্বোতে কয়টা পিস থাকবে? ২ পিস বেছে নিলেও পরে "আরও ১টা নিন → ৩ পিস" অফার চালু করা যাবে (ধাপ ৬)।</p><div class="acw-bigs">'+opt(2)+opt(3)+'</div>';
}
function acw_s3(u, g){
  var d = u.d, prods = g.products.length;
  var opts = ['style','across','any'].map(function(k){ var n = acw_gen(d, {pairing:k}, '__acw_'+k).all.length, on = d.pairing===k, dis = k==='across' && prods<d.pieces;
    return '<button type="button" class="acw-pick acw-pair'+(on?' on':'')+'" data-act="acw-set" data-k="pairing" data-v="'+k+'" aria-pressed="'+on+'"'+(dis?' disabled':'')+'><span class="zs-cb">'+ico('check',13)+'</span><span class="grow" style="min-width:0"><b>'+esc(ACW_PAIR[k][0])+'</b><span class="za-bn small" style="display:block">'+esc(ACW_PAIR[k][1])+'</span><span class="zs-mini">'+esc(ACW_PAIR[k][2])+(dis ? ' · needs '+d.pieces+' different products' : '')+'</span></span><b class="acw-n">'+n+'</b></button>'; }).join('');
  var cols = acw_colours(d);
  var ex = cols.map(function(c){ var off = (d.excludeColours||[]).indexOf(c)>=0; return '<button type="button" class="zp-col'+(off?'':' on')+'" data-act="acw-excol" data-c="'+c+'" aria-pressed="'+(!off)+'"><i style="background:'+COL(c).hex+'"></i>'+esc(COL(c).name)+'</button>'; }).join('');
  return '<p class="zs-bnp acw-help">জোড়া কীভাবে হবে? সাধারণত "একই স্টাইল" — যেমন একই পোলোর কালো + নেভি। হুডি + জগারের মতো সেট হলে "আলাদা স্টাইল" বেছে নিন।</p><div class="acw-picks">'+opts+'</div>'+
    (cols.length ? '<div class="acw-sub mt16"><div class="small bold">Colours in combos</div><div class="zs-mini za-bn mb8">যে রং কম্বোতে চান না, ট্যাপ করে বাদ দিন</div><div class="zp-cols">'+ex+'</div></div>' : '');
}
function acw_s4(u, g){
  var d = u.d, L = g.all[0];
  var reg = L ? L.regular : 0;
  var ex = L ? '<div class="acw-ex"><div class="acw-exph">'+ca_setPhoto(L.pieces, {layout:'thumb'})+'</div><div style="min-width:0"><div class="small bold">'+esc(L.name)+'</div><div class="acw-exp"><span class="strike">'+fmt(reg)+'</span> → <b>'+fmt(L.price)+'</b> <span class="zo-pill ok">Save '+fmt(L.save)+'</span></div><div class="zs-mini">'+d.pieces+' pcs regular '+fmt(reg)+' → combo '+fmt(L.price)+' · '+fmt(L.each)+' each</div></div></div>' : '';
  var warn = d.price.mode==='fixed' && L && (+d.price.value||0) >= reg ? '<div class="zs-note warn mt8">'+ico('info',17)+'<div class="zs-bnp">এই দাম সাধারণ দামের ('+fmt(reg)+') সমান বা বেশি — কাস্টমার সাধারণ দামই দেবে, কোনো ছাড় দেখাবে না।</div></div>' : '';
  return '<p class="zs-bnp acw-help">কম্বোর দাম কীভাবে ঠিক হবে? প্রতি প্যাকের একটা নির্দিষ্ট টাকা, অথবা সাধারণ দামের উপর কত % ছাড়।</p>'+
    '<div class="zs-tier mb12" role="group" aria-label="Price type"><button type="button" class="'+(d.price.mode==='fixed'?'on':'')+'" data-act="acw-pmode" data-v="fixed">Fixed ৳ a pack</button><button type="button" class="'+(d.price.mode==='percent'?'on':'')+'" data-act="acw-pmode" data-v="percent">% off regular</button></div>'+
    '<div class="acb-money acw-money"><span>'+(d.price.mode==='fixed'?'৳':'%')+'</span><input type="number" inputmode="numeric" min="1" step="'+(d.price.mode==='fixed'?10:1)+'" value="'+esc(d.price.value)+'" data-input="acw-price" aria-label="Combo price" data-testid="acw-price"></div>'+
    '<div id="acw-ex">'+ex+warn+'</div><div class="zs-mini mt8">% prices are rounded to ৳10. A combo is never priced above its regular total.</div>';
}
function acw_s5(u){
  var on = u.d.noSingle!==false;
  return '<p class="zs-bnp acw-help">এই কম্বো পেজে কি একটা একটা করেও বিক্রি হবে? আপনার নিয়ম: ২ পিসের কম্বো ২টাতেই বিক্রি — একটা না। টিক দেওয়া থাকলে এই পেজে কোনো সিঙ্গেল পিস দেখাবে না।</p>'+
    '<button type="button" class="zp-tick acw-tick'+(on?' on':'')+'" data-act="acw-flag" data-k="noSingle" aria-pressed="'+on+'" data-testid="acw-nosingle"><span class="zs-cb">'+ico('check',14)+'</span><span><b>No single pieces in this section</b><span class="zs-mini za-bn" style="display:block">এই সেকশনে একটা করে বিক্রি নেই</span></span></button>';
}
function acw_s6(u, g){
  var d = u.d;
  if(d.pieces!==2) return '<p class="zs-bnp acw-help">এটা ৩ পিসের কম্বো — "আরও ১টা নিন" অফার শুধু ২ পিসের কম্বোতে লাগে। Next চাপুন।</p>';
  var on = !!d.allowUpsell3, g3 = on ? acw_gen(d, {pieces:3, price:d.up3}, '__acw_up') : null, L3 = g3 && g3.all[0], L2 = g.all[0];
  return '<p class="zs-bnp acw-help">২ পিস নেওয়ার সময় কাস্টমারকে বলা হবে "আর ১টা নিন — ৩ পিস আরও কম দামে"। এর জন্য একটা ৩ পিসের রুল নিজে থেকেই তৈরি হবে।</p>'+
    '<button type="button" class="zp-tick acw-tick'+(on?' on':'')+'" data-act="acw-flag" data-k="allowUpsell3" aria-pressed="'+on+'" data-testid="acw-upsell"><span class="zs-cb">'+ico('check',14)+'</span><span><b>Offer “add 1 more → 3 pcs”</b><span class="zs-mini za-bn" style="display:block">আরও ১টা নিলে ৩ পিস, বেশি ছাড়</span></span></button>'+
    (on ? '<div class="acw-sub mt16"><div class="small bold mb8">3-piece price</div><div class="zs-tier mb12" role="group"><button type="button" class="'+(d.up3.mode==='fixed'?'on':'')+'" data-act="acw-upmode" data-v="fixed">Fixed ৳</button><button type="button" class="'+(d.up3.mode==='percent'?'on':'')+'" data-act="acw-upmode" data-v="percent">% off</button></div>'+
      '<div class="acb-money acw-money"><span>'+(d.up3.mode==='fixed'?'৳':'%')+'</span><input type="number" inputmode="numeric" min="1" value="'+esc(d.up3.value)+'" data-input="acw-up3" aria-label="3-piece price"></div>'+
      '<div class="zs-mini mt8" id="acw-up3ex">'+(L3 && L2 ? '2 pcs '+fmt(L2.price)+' → 3 pcs '+fmt(L3.price)+' ('+fmt(L3.each)+' each, '+g3.all.length+' combos)' : '')+'</div></div>' : '');
}
function acw_s7(u, g){
  var list = u.all ? g.all : g.all.slice(0, 24);
  var cards = list.map(function(L){ return '<div class="acw-pv'+(L.availCount?'':' out')+'">'+ca_setPhoto(L.pieces, {layout:'card', inner:ca_badges(L)})+'<div class="acw-pvi"><div class="small bold acw-pvt">'+esc(L.title)+'</div><div class="zs-mini">'+esc(L.sub)+'</div><div class="small"><b>'+fmt(L.price)+'</b>'+(L.save>0?' <span class="strike xs">'+fmt(L.regular)+'</span>':'')+'</div><div class="zs-mini">'+(L.availCount ? esc(ca_sizeLine(L)) : 'Sold out — hidden')+'</div></div></div>'; }).join('');
  return '<p class="zs-bnp acw-help">এই কম্বোগুলো দোকানে যাবে — প্রতিটা জোড়ার ছবি নিজে থেকে তৈরি হয়েছে। স্টক শেষ হলে জোড়াটা লুকিয়ে যায়, নতুন রং এলে নতুন জোড়া চলে আসে।</p>'+
    '<div class="acw-pvg" data-testid="acw-preview">'+(cards || '<div class="zs-empty">No combos — go back to step 1 or 3.</div>')+'</div>'+
    (g.all.length>list.length ? '<button type="button" class="btn btn-ghost mt12" data-act="acw-all">Show all '+g.all.length+'</button>' : '');
}
function acw_s8(u, g){
  var d = u.d, title = d.title || acw_autoTitle(d), name = d.name || (title ? title+' combos' : '');
  var tchips = function(k, map){ return '<div class="zs-pages">'+Object.keys(map).map(function(t){ var on = (d[k]||'')===t; return '<button type="button" class="chip'+(on?' on':'')+'" data-act="acw-set" data-k="'+k+'" data-v="'+t+'" aria-pressed="'+on+'">'+(on?ico('check',13):'')+esc(map[t])+'</button>'; }).join('')+'</div>'; };
  var id = d.editing || zo_slug(title)+'-'+d.pieces;
  return '<p class="zs-bnp acw-help">নাম দিন আর পেজের ডিজাইন বেছে নিন। সেভ করলেই কম্বো পেজ চালু — নিচের লিংকটা কপি করে ফেসবুক/গুগল অ্যাডে দিন।</p>'+
    '<div class="za-f2"><div><label class="label" for="acw-t">Style name on cards</label><input id="acw-t" class="input zs-in" type="text" value="'+esc(title)+'" data-input="acw-txt" data-k="title" placeholder="e.g. Solid Polo"></div>'+
    '<div><label class="label" for="acw-n">Rule name (for you)</label><input id="acw-n" class="input zs-in" type="text" value="'+esc(name)+'" data-input="acw-txt" data-k="name" placeholder="e.g. Solid Polo combos"></div></div>'+
    '<div class="mt12"><div class="label">Season tab on the combo hub</div>'+tchips('season', {'':'None', summer:'Summer', winter:'Winter'})+'</div>'+
    /* owner, 11:51: optional dates — empty = runs all the time */
    '<div class="mt12"><div class="label">Dates <span class="zs-mini za-bn">ঐচ্ছিক — খালি রাখলে সবসময় চলবে</span></div><div class="za-f2">'+
      '<div><label class="zs-mini" for="acw-ds">Starts <span class="za-bn">শুরু</span></label><input id="acw-ds" class="input zs-in" type="date" value="'+esc(d.start||'')+'" data-change="acw-wdate" data-k="start"></div>'+
      '<div><label class="zs-mini" for="acw-de">Ends <span class="za-bn">শেষ</span></label><input id="acw-de" class="input zs-in" type="date" value="'+esc(d.end||'')+'" data-change="acw-wdate" data-k="end"></div></div>'+
      '<div class="zs-mini za-bn">শেষের তারিখ পার হলে নিজে থেকে আর্কাইভে যাবে — পেজ খোলা থাকবে, "এই অফার শেষ" দেখাবে।</div></div>'+
    '<div class="mt12"><div class="label">Combo page template</div>'+tchips('listTpl', ACW_LIST)+'</div>'+
    '<div class="mt12"><div class="label">Pair page template</div>'+tchips('pageTpl', ACW_PAGE)+'</div>'+
    '<div class="acw-sub mt16"><div class="small bold">Link to promote</div><div class="acw-link"><code>'+acw_linkHTML('#/combos/'+id)+'</code></div><div class="zs-mini">Copy it after saving. The page shows only the '+g.all.length+' combos — no single pieces'+(d.noSingle===false?' (singles listed below, you turned that on)':'')+'.</div></div>';
}
function acw_savedHTML(u){
  var r = ca_rule(u.saved), g = r ? ca_generate(r) : null, link = r ? acw_link(r) : '#/combos';
  return '<section class="zs-card acw-done" data-testid="acw-done"><div class="zs-okc">'+ico('check',26)+'</div><h2 class="mt12" style="text-align:center">'+esc(r ? r.name : 'Saved')+' is live</h2>'+
    '<p class="zs-bnp" style="text-align:center">'+(g ? zs_bnNum(g.visible.length)+'টা কম্বো এখন দোকানে।' : '')+' লিংকটা কপি করে অ্যাডে দিন।</p>'+
    '<div class="acw-link acw-link-big"><code>'+esc(zo_shopUrl(link))+'</code></div>'+
    '<div class="zs-actions" style="justify-content:center"><button type="button" class="btn btn-primary" data-act="zo-copy" data-text="'+esc(zo_shopUrl(link))+'" data-msg="Page link copied — paste it in your ad" data-testid="acw-copy">'+ico('link',16)+'Copy link</button>'+
      '<a class="btn btn-secondary" href="'+link+'" data-testid="acw-open">'+ico('eye',16)+'Open the page</a><a class="btn btn-ghost" href="#/admin/combos" data-act="acw-reset">All combo rules</a></div></section>';
}
function acw_u(){ return UI['acw']; }
ACT['acw-go'] = function(el){
  var u = acw_u(); if(!u) return; var n = +el.getAttribute('data-n');
  if(n>u.step){ var g = acw_gen(u.d); for(var s=u.step; s<n; s++){ var t = {step:s, d:u.d}; if(!acw_canNext(t, g)){ u.err = s===1 ? 'Choose at least one category, style or product first.' : s===3 ? 'This pairing makes no combos — pick another or add colours.' : 'Enter a price.'; u.step = s; rerender(); return; } } }
  u.err = ''; u.step = Math.max(1, Math.min(8, n)); rerender(); var w = document.querySelector('.acw-wiz'); if(w && w.getBoundingClientRect().top < 0) w.scrollIntoView({block:'start'});
};
ACT['acw-mode'] = function(el){ var u = acw_u(); if(!u) return; u.mode = el.getAttribute('data-v'); rerender(); };
ACT['acw-bind'] = function(el){ var u = acw_u(); if(!u) return; var k = el.getAttribute('data-k'), v = el.getAttribute('data-v'), a = u.d.bind[k], i = a.indexOf(v); if(i>=0) a.splice(i,1); else a.push(v); u.err = ''; rerender(); };
INPUT['acw-pq'] = function(el){ var u = acw_u(); if(!u) return; u.pq = el.value; var q = el.value.toLowerCase(); document.querySelectorAll('#acw-prods .acw-pp').forEach(function(b){ b.style.display = !q || b.getAttribute('data-s').indexOf(q)>=0 ? '' : 'none'; }); };
ACT['acw-set'] = function(el){ var u = acw_u(); if(!u) return; var k = el.getAttribute('data-k'), v = el.getAttribute('data-v'); u.d[k] = k==='pieces' ? +v : v; if(k==='pieces' && +v===3) u.d.allowUpsell3 = false; u.err = ''; rerender(); };
ACT['acw-excol'] = function(el){ var u = acw_u(); if(!u) return; var c = el.getAttribute('data-c'), a = u.d.excludeColours = u.d.excludeColours||[], i = a.indexOf(c); if(i>=0) a.splice(i,1); else a.push(c); rerender(); };
ACT['acw-pmode'] = function(el){ var u = acw_u(); if(!u) return; var m = el.getAttribute('data-v'); if(u.d.price.mode===m) return; var L = acw_gen(u.d).all[0];
  u.d.price = m==='fixed' ? {mode:'fixed', value: L ? L.price : 1000} : {mode:'percent', value: L && L.regular ? Math.max(1, Math.round((1 - L.price/L.regular)*100)) : 10}; rerender(); };
INPUT['acw-price'] = function(el){ var u = acw_u(); if(!u) return; u.d.price.value = Math.max(0, zo_int(el.value));
  clearTimeout(INPUT['acw-price']._t); INPUT['acw-price']._t = setTimeout(function(){ var w = document.getElementById('acw-ex'); if(!w) return; var tmp = document.createElement('div'); tmp.innerHTML = acw_s4(u, acw_gen(u.d)); var nx = tmp.querySelector('#acw-ex'); if(nx) w.innerHTML = nx.innerHTML; }, 200); };
ACT['acw-flag'] = function(el){ var u = acw_u(); if(!u) return; var k = el.getAttribute('data-k'); u.d[k] = k==='noSingle' ? (u.d.noSingle===false) : !u.d[k]; rerender(); };
ACT['acw-upmode'] = function(el){ var u = acw_u(); if(!u) return; u.d.up3 = {mode:el.getAttribute('data-v'), value:el.getAttribute('data-v')==='fixed' ? Math.round((acw_gen(u.d).all[0]||{price:1000}).price*1.42/10)*10 : 20}; rerender(); };
INPUT['acw-up3'] = function(el){ var u = acw_u(); if(!u) return; u.d.up3.value = Math.max(0, zo_int(el.value));
  clearTimeout(INPUT['acw-up3']._t); INPUT['acw-up3']._t = setTimeout(function(){ var w = document.getElementById('acw-up3ex'); if(!w) return; var g3 = acw_gen(u.d, {pieces:3, price:u.d.up3}, '__acw_up'), L3 = g3.all[0], L2 = acw_gen(u.d).all[0]; w.textContent = L3 && L2 ? '2 pcs '+fmt(L2.price)+' → 3 pcs '+fmt(L3.price)+' ('+fmt(L3.each)+' each, '+g3.all.length+' combos)' : ''; }, 200); };
CHANGE['acw-wdate'] = function(el){ var u = acw_u(); if(!u) return; u.d[el.getAttribute('data-k')] = el.value || ''; };
INPUT['acw-txt'] = function(el){ var u = acw_u(); if(!u) return; u.d[el.getAttribute('data-k')] = el.value; };
ACT['acw-all'] = function(){ var u = acw_u(); if(!u) return; u.all = true; rerender(); };
ACT['acw-reset'] = function(){ delete UI['acw']; go('#/admin/combos'); };
ACT['acw-save'] = function(){
  var u = acw_u(); if(!u) return; var d = u.d, g = acw_gen(d);
  if(!g.all.length){ u.err = 'This rule makes no combos yet — check steps 1 and 3.'; rerender(); return; }
  var title = String(d.title || acw_autoTitle(d) || 'Combo').trim(), name = String(d.name || title+' combos').trim();
  var rec = {name:name, title:title, label:d.pieces+'-piece combo', season:d.season||'', bind:JSON.parse(JSON.stringify(d.bind)), pieces:d.pieces, pairing:d.pairing, sameColour:false,
    excludeColours:(d.excludeColours||[]).slice(), price:{mode:d.price.mode, value:+d.price.value||0}, noSingle:d.noSingle!==false, allowUpsell3:d.pieces===2 && !!d.allowUpsell3,
    order:d.order||'bestsellers', listTpl:d.listTpl||'', pageTpl:d.pageTpl||'', active:d.editing ? d.on!==false : true, start:d.start||'', end:d.end||''};
  if(rec.start && rec.end && rec.end < rec.start){ u.err = 'The end date is before the start date.'; rerender(); return; }
  var id;
  if(d.editing){ id = d.editing; acw_patch(id, rec); }
  else {
    var s = acw_store(), base = zo_slug(title)+'-'+d.pieces, i = 2; id = base; while(ca_rule(id)) id = base+'-'+(i++);
    rec.id = id; rec.made = 'wizard'; s.rules.push(rec); acw_apply(); saveState();
  }
  if(rec.allowUpsell3){
    var r = ca_rule(id), up = r.upsell ? ca_rule(r.upsell) : null;
    if(up) acw_patch(up.id, {price:{mode:d.up3.mode, value:+d.up3.value||0}, bind:rec.bind, pairing:rec.pairing, excludeColours:rec.excludeColours, active:true});
    else { up = acw_makeUp(r, {mode:d.up3.mode, value:+d.up3.value||0}); acw_patch(id, {upsell:up.id}); }
  }
  u.saved = id; rerender(); window.scrollTo(0, 0);
  toast((d.editing ? 'Saved' : 'Combo rule on')+' — '+ca_generate(ca_rule(id)).visible.length+' combos live on the shop');
};
