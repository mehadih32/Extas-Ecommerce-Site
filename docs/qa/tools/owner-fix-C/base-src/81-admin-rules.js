/* ================= 81-admin-rules.js — owner: Smart Rules  #/admin/rules ================= */
(function(){
  if(document.getElementById('rl-css')) return;
  var s = document.createElement('style'); s.id = 'rl-css';
  s.textContent = [
    '.rl-grid{display:grid;gap:16px;grid-template-columns:minmax(0,1fr)}',
    '@media(min-width:1024px){.rl-grid{grid-template-columns:420px minmax(0,1fr);gap:22px;align-items:start}}',
    '.rl-desk{display:none}@media(min-width:1024px){.rl-desk{display:block}}',
    '.rl-list{display:grid;gap:10px}',
    '.rl-card{background:#fff;border:1px solid #E6E3DE;border-radius:8px;overflow:hidden}',
    '.rl-card.on{border-color:#1F4E46;box-shadow:inset 0 0 0 1px #1F4E46}',
    '.rl-cardbtn{display:block;width:100%;text-align:left;background:none;border:0;padding:14px 16px;cursor:pointer;font:inherit;color:#171715}',
    '.rl-cardbtn:hover{background:#FAFAF8}',
    '.rl-mini{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-top:6px}',
    '.rl-mini .k{font-size:11px;color:#6E675E;font-weight:600;margin-right:2px}',
    '.rl-pill{font-size:11px;padding:2px 7px;border-radius:10px;background:#F2F1EE;color:#54504A;font-weight:500}',
    '.rl-pill.x{background:#F6EFDF;color:#8A5A1E}',
    '.rl-ed{background:#fff;border:1px solid #E6E3DE;border-radius:8px;padding:18px}',
    '@media(min-width:1024px){.rl-ed{padding:24px}}',
    '.rl-card .rl-ed{border:0;border-top:1px solid #E6E3DE;border-radius:0;background:#FCFCFA}',
    '.rl-sec{margin-top:20px}',
    '.rl-sec>.label.flex{display:flex;justify-content:space-between;align-items:baseline;gap:8px}',
    '.rl-places{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:16px}',
    '.rl-places .rl-place:nth-child(2){border-top:0}',
    '.rl-count{white-space:nowrap;font-size:12px;font-weight:600;color:#6E675E}',
    '.rl-count.over{color:#B4453C}',
    '.rl-prev{background:#F4F3F0;border-radius:6px;padding:10px 12px;font-size:13.5px;margin-top:8px}',
    '.rl-code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;background:#EEF3F1;color:#15302B;padding:1px 5px;border-radius:4px}',
    '.rl-code.warn{background:#F6EFDF;color:#8A5A1E}',
    '.rl-sets{display:grid;gap:12px}',
    '@media(min-width:640px){.rl-sets{grid-template-columns:repeat(2,minmax(0,1fr))}}',
    '.rl-sets .wide{grid-column:1 / -1}',
    '.rl-hint{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;line-height:1.5;margin-top:8px;padding:10px 12px;background:#EEF3F1;border:1px solid #D5E1DC;border-radius:6px;color:#15302B}',
    '.rl-hint svg{flex-shrink:0;margin-top:2px}',
    '.rl-chip{display:inline-flex;align-items:center;gap:4px;padding:5px 6px 5px 11px;border-radius:16px;border:1px solid #D8D4CD;background:#fff;font-size:12.5px;font-weight:500}',
    '.rl-chip.x{background:#FBF6EC;border-color:#EAD9BC}',
    '.rl-chip button{border:0;background:none;cursor:pointer;width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#6E675E;padding:0}',
    '.rl-chip button:hover{background:#EFEDE8}',
    '.rl-add{border:1px dashed #B9B3AA;background:none;border-radius:16px;padding:5px 11px;font-size:12.5px;font-weight:600;color:#1F4E46;cursor:pointer}',
    '.rl-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px}',
    '@media(min-width:640px){.rl-checks{grid-template-columns:repeat(3,minmax(0,1fr))}}',
    '.rl-ai{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border-radius:8px;border:1px solid #E6E3DE;background:#FAFAF8;margin-top:16px}',
    '.rl-ai.on{background:#F6EFDF;border-color:#EAD9BC}',
    '.rl-conflict{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;padding:14px 16px;border-radius:8px;background:#F6EFDF;border:1px solid #EAD9BC;color:#5E3E14;margin-bottom:16px}',
    '.rl-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:22px;padding-top:16px;border-top:1px solid #EFEDE8}',
    '.rl-done{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 12px;border-radius:6px;background:#EEF3F1;color:#15302B;font-size:13px;margin-top:12px}',
    '.rl-place{display:flex;gap:10px;align-items:center;padding:9px 0;border-top:1px solid #EFEDE8;font-size:14px}',
    '.rl-place:first-child{border-top:0}'
  ].join('\n');
  document.head.appendChild(s);
})();

var RL_PLACES = ['Product page','Bag','Checkout','Thank you','My account','SMS & WhatsApp','EXTAS AI','FAQ','Footer','Announcement bar','Build a set'];
var RL_SCOPES = ['All categories','Polos','T-Shirts','Shirts','Panjabi','Trousers','Hoodies','Extras','Boxers & underwear','Sale items','Combos & sets','Logged-in customers','All orders'];
var RL_PLACE_NAME = {'Product page':'Product pages','Thank you':'Thank-you page','SMS & WhatsApp':'SMS templates','EXTAS AI':'EXTAS AI answers','FAQ':'FAQ page'};

function rl_ui(){ return ui('admin-rules', {topic:'All', sel:'exchange', selM:null, drafts:{}, conflict:true, newRules:[], done:null}); }
function rl_draft(id){
  var u = rl_ui();
  if(!u.drafts[id]){ var r = RULE(id); u.drafts[id] = {short:r.short, full:r.full, settings:JSON.parse(JSON.stringify(r.settings||{})), status:r.status, applies:(r.applies||[]).slice(), except:(r.except||[]).slice(), shownOn:(r.shownOn||[]).slice(), ai:true}; }
  return u.drafts[id];
}
function rl_dirty(id){
  var u = rl_ui(), d = u.drafts[id]; if(!d) return false; var r = RULE(id);
  return d.short!==r.short || d.full!==r.full || d.status!==r.status || JSON.stringify(d.settings)!==JSON.stringify(r.settings) ||
    JSON.stringify(d.applies)!==JSON.stringify(r.applies) || JSON.stringify(d.except)!==JSON.stringify(r.except) || JSON.stringify(d.shownOn)!==JSON.stringify(r.shownOn);
}
function rl_fill(text, d){ return fillRule(text, {settings:d.settings}); }
function rl_topics(){ var t = []; DB.rules.forEach(function(r){ if(t.indexOf(r.topic)<0) t.push(r.topic); }); return t; }
/* how many products a rule covers (for "Product pages (17)") */
function rl_productCount(d){
  var all = d.applies.some(function(a){ return /^All (categories|products)$/.test(a); });
  return DB.products.filter(function(p){
    var cat = CAT(p.cat), n = cat ? cat.name : '';
    var inc = all || d.applies.indexOf(n)>=0;
    var exc = d.except.indexOf(n)>=0;
    return inc && !exc;
  }).length;
}
function rl_places(id, d){
  var out = [];
  d.shownOn.forEach(function(pl){
    if(pl==='Product page'){ var n = rl_productCount(d); out.push(n ? 'Product pages ('+n+')' : 'Product pages'); }
    else out.push(RL_PLACE_NAME[pl] || pl);
  });
  if(id==='exchange' && d.shownOn.indexOf('Footer')<0) out.splice(Math.min(out.length, 4), 0, 'Footer');
  return out;
}

/* ---------- cards ---------- */
function rl_card(r, u){
  var on = u.sel===r.id, dirty = rl_dirty(r.id);
  var chips = function(k, arr, cls){ if(!arr || !arr.length) return ''; return '<div class="rl-mini"><span class="k">'+k+'</span>'+arr.map(function(a){ return '<span class="rl-pill '+(cls||'')+'">'+esc(a)+'</span>'; }).join('')+'</div>'; };
  return '<div class="rl-card'+(on?' on':'')+'" id="rl-card-'+r.id+'">'+
    '<button class="rl-cardbtn" data-act="rl-sel" data-id="'+r.id+'" aria-expanded="'+(u.selM===r.id)+'">'+
      '<span class="row wrap" style="gap:6px"><span class="tag plain">'+esc(r.topic)+'</span><span class="tag '+(r.status==='Active'?'':'warn')+'">'+esc(r.status)+'</span>'+(dirty?'<span class="tag gold">Unsaved changes</span>':'')+'</span>'+
      '<span class="h3" style="display:block;margin-top:8px">'+esc(r.title)+'</span>'+
      '<span class="small text2" style="display:block;margin-top:3px">'+esc(fillRule(r.short, r))+'</span>'+
      chips('Applies to', r.applies) + chips('Except', r.except, 'x') + chips('Shown on', r.shownOn) +
      '<span class="xs muted" style="display:block;margin-top:8px">v'+r.version+' · edited '+esc(r.edited)+'</span>'+
    '</button>'+
    (u.selM===r.id ? '<div class="hide-d">'+rl_editor(r.id, 'm')+'</div>' : '')+
  '</div>';
}

/* ---------- editor ---------- */
function rl_phHTML(d, r){
  var keys = []; (d.full+' '+d.short).replace(/\{(\w+)\}/g, function(m, k){ if(keys.indexOf(k)<0) keys.push(k); return m; });
  if(!keys.length) return '<div class="xs muted">No {placeholders} in this rule — the text is used exactly as written.</div>';
  return keys.map(function(k){
    var has = d.settings[k]!==undefined;
    return '<div class="xs" style="margin-top:4px">'+(has
      ? '<span class="rl-code">{'+esc(k)+'}</span> is replaced by the setting “'+esc((r.settingLabels||{})[k]||k)+'” — now <b>'+esc(d.settings[k])+'</b>'
      : '<span class="rl-code warn">{'+esc(k)+'}</span> has no setting — add one or remove it from the text')+'</div>';
  }).join('');
}
function rl_editor(id, sfx){
  var r = RULE(id), d = rl_draft(id), u = rl_ui(), dirty = rl_dirty(id);
  var len = rl_fill(d.short, d).length, idp = 'rl-'+sfx+'-'+id;
  var labels = r.settingLabels || {};
  var sets = Object.keys(d.settings).map(function(k){
    var v = d.settings[k], isNum = typeof (r.settings[k])==='number';
    var hint = '';
    if(id==='exchange' && k==='windowHours') hint = '<div class="rl-hint">'+ico('info',15)+'<span>Change this number (e.g. 72 → 48) and the shop updates by itself. Product page: “<b class="rl-live-short" data-id="'+id+'">'+esc(rl_fill(d.short, d))+'</b>” · Footer: “Size exchange in <b class="rl-live-wh">'+esc(v)+'</b> hours”</span></div>';
    else if(id==='delivery' && k==='freeOver') hint = '<div class="rl-hint">'+ico('info',15)+'<span>Bag and checkout show “Add ৳X more for free delivery” from this number.</span></div>';
    return '<div class="'+(hint?'wide':'')+'"><label class="label" for="'+idp+'-'+k+'">'+esc(labels[k]||k)+'</label>'+
      '<input id="'+idp+'-'+k+'" class="input" '+(isNum?'type="number" inputmode="numeric"':'type="text"')+' value="'+esc(v)+'" data-input="rl-set" data-id="'+id+'" data-k="'+esc(k)+'"'+(hint?' style="max-width:220px"':'')+'>'+hint+'</div>';
  }).join('');
  var chipList = function(list, cls){
    return '<div class="row wrap" style="gap:6px">'+d[list].map(function(a, i){ return '<span class="rl-chip '+(cls||'')+'">'+esc(a)+'<button data-act="rl-rm" data-id="'+id+'" data-list="'+list+'" data-i="'+i+'" aria-label="Remove '+esc(a)+'">'+ico('close',12)+'</button></span>'; }).join('')+
      '<button class="rl-add" data-act="rl-add" data-id="'+id+'" data-list="'+list+'">+ Add</button></div>';
  };
  var checks = RL_PLACES.map(function(pl, i){ var on = d.shownOn.indexOf(pl)>=0; return '<label class="check"><input type="checkbox" data-change="rl-shown" data-id="'+id+'" data-place="'+esc(pl)+'"'+(on?' checked':'')+'> '+esc(pl)+'</label>'; }).join('');
  var done = u.done===id ? '<div class="rl-done">'+ico('check',16)+'<span>Published v'+r.version+'. See it live:</span><a class="link" href="#/p/essential-pique-polo">Product page</a><a class="link" href="#/l/polo-duo">Ad landing page</a><a class="link" href="#/bag">Bag</a></div>' : '';
  return '<div class="rl-ed rl-ed-'+sfx+'" data-rule="'+id+'">'+
    '<div class="row between wrap" style="gap:10px"><div><div class="row wrap" style="gap:6px"><span class="tag plain">'+esc(r.topic)+'</span><span class="xs muted">v'+r.version+' · edited '+esc(r.edited)+'</span></div><div class="h2" style="margin-top:6px">'+esc(r.title)+'</div></div>'+
      '<div class="seg" role="group" aria-label="Status">'+['Active','Draft'].map(function(st){ return '<button class="'+(d.status===st?'on':'')+'" data-act="rl-status" data-id="'+id+'" data-v="'+st+'">'+st+'</button>'; }).join('')+'</div></div>'+
    done+
    '<div class="rl-ai'+(d.ai?' on':'')+'"><button class="switch'+(d.ai?' on':'')+'" data-act="rl-ai" data-id="'+id+'" aria-label="AI helper" aria-pressed="'+d.ai+'"></button><div class="grow small">'+
      '<div class="row wrap" style="gap:6px"><b>AI helper</b><span class="tag gold">'+ico('spark',11)+'AI</span></div>'+
      (d.ai ? '<div style="margin-top:3px">AI wrote the short version and found the settings — check them.</div>' : '<div style="margin-top:3px">AI is off for this rule.</div>')+
      '<div class="xs muted" style="margin-top:3px">AI off? Fill these fields yourself — the rule works exactly the same.</div></div></div>'+
    '<div class="rl-sec"><label class="label flex" for="'+idp+'-short"><span>Short version <span class="muted" style="font-weight:500">· shown next to Add to Bag, in the bag and at checkout</span></span><span class="rl-count'+(len>90?' over':'')+'" data-id="'+id+'" title="Characters customers see, with settings filled in">'+len+' / 90</span></label>'+
      '<input id="'+idp+'-short" class="input" value="'+esc(d.short)+'" data-input="rl-short" data-id="'+id+'">'+
      '<div class="rl-prev"><span class="xs muted">Customers see:</span> <span class="rl-live-short" data-id="'+id+'">'+esc(rl_fill(d.short, d))+'</span></div></div>'+
    '<div class="rl-sec"><label class="label" for="'+idp+'-full"><span>Full rule <span class="muted" style="font-weight:500">· what customers see under “Details”</span></span></label>'+
      '<textarea id="'+idp+'-full" class="input" rows="7" data-input="rl-full" data-id="'+id+'" style="font-size:14px">'+esc(d.full)+'</textarea>'+
      '<div class="mt8 rl-ph" data-id="'+id+'">'+rl_phHTML(d, r)+'</div></div>'+
    (Object.keys(d.settings).length ? '<div class="rl-sec"><div class="label">Settings <span class="muted" style="font-weight:500">· numbers the text uses</span></div><div class="rl-sets">'+sets+'</div></div>' : '<div class="rl-sec"><div class="label">Settings</div><div class="xs muted">This rule has no numbers to set.</div></div>')+
    '<div class="rl-sec"><div class="label">Applies to</div>'+chipList('applies')+'</div>'+
    '<div class="rl-sec"><div class="label">Except</div>'+chipList('except','x')+'</div>'+
    '<div class="rl-sec"><div class="label">Shown on</div><div class="rl-checks">'+checks+'</div></div>'+
    '<div class="rl-actions"><button class="btn btn-secondary btn-sm" data-act="rl-preview" data-id="'+id+'">'+ico('eye',15)+'Preview changes</button>'+
      '<button class="btn btn-primary btn-sm" data-act="rl-publish" data-id="'+id+'" data-testid="rl-publish">'+ico('check',15)+'Publish</button>'+
      '<span class="rl-dirty row" data-id="'+id+'" style="gap:8px">'+rl_dirtyHTML(id)+'</span></div>'+
  '</div>';
}

function rl_dirtyHTML(id){ return rl_dirty(id) ? '<span class="tag gold">Unsaved changes</span><button class="link" data-act="rl-discard" data-id="'+id+'">Discard</button>' : '<span class="xs muted">No unsaved changes</span>'; }

/* ---------- page ---------- */
PAGES['admin-rules'] = {
  layout:'admin',
  title:'Smart Rules',
  render:function(){
    var u = rl_ui(), rules = allRules(), topics = rl_topics();
    if(!RULE(u.sel)) u.sel = 'exchange';
    var shown = rules.filter(function(r){ return u.topic==='All' || r.topic===u.topic; });
    var wh = SET('exchange','windowHours');
    var html = '<div class="row between wrap" style="gap:12px;align-items:flex-end;margin-bottom:16px"><div><h1 class="h1">Smart Rules</h1><div class="small text2" style="margin-top:4px">Write a rule once, the whole shop follows it — product pages, bag, checkout, SMS and EXTAS AI.</div></div>'+
      '<button class="btn btn-primary btn-sm" data-act="rl-new">'+ico('plus',15)+'New rule</button></div>';
    if(u.conflict) html += '<div class="rl-conflict"><div class="row top" style="gap:10px">'+ico('info',18)+'<div class="small"><b>Conflict found</b><div style="margin-top:2px">FAQ text still says 7 days; your Exchange rule says '+esc(wh)+' hours.</div></div></div>'+
      '<button class="btn btn-sm btn-dark" data-act="rl-fix">Fix everywhere</button></div>';
    html += '<div class="row wrap mb16" style="gap:8px" role="group" aria-label="Topics">'+['All'].concat(topics).map(function(t0){ var n = t0==='All' ? rules.length : rules.filter(function(r){ return r.topic===t0; }).length; return '<button class="chip'+(u.topic===t0?' on':'')+'" data-act="rl-topic" data-t="'+esc(t0)+'" aria-pressed="'+(u.topic===t0)+'">'+esc(t0)+' <span style="opacity:.65">'+n+'</span></button>'; }).join('')+'</div>';
    var newCards = u.newRules.filter(function(n){ return u.topic==='All' || n.topic===u.topic; }).map(function(n){
      return '<div class="rl-card"><div class="rl-cardbtn" style="cursor:default"><span class="row wrap" style="gap:6px"><span class="tag plain">'+esc(n.topic)+'</span><span class="tag warn">Draft</span><span class="tag gold">New</span></span>'+
        '<span class="h3" style="display:block;margin-top:8px">'+esc(n.title)+'</span><span class="small text2" style="display:block;margin-top:3px">'+esc(n.short)+'</span><span class="xs muted" style="display:block;margin-top:8px">v1 · saved today · not live yet</span></div></div>';
    }).join('');
    var list = '<div class="rl-list">'+newCards+shown.map(function(r){ return rl_card(r, u); }).join('')+(shown.length||newCards?'':'<div class="card empty">No rules in this topic yet.</div>')+'</div>';
    var selInView = shown.some(function(r){ return r.id===u.sel; }) ? u.sel : (shown[0] ? shown[0].id : u.sel);
    html += '<div class="rl-grid"><div>'+list+'</div><div class="rl-desk">'+rl_editor(selInView, 'd')+'</div></div>';
    return html;
  }
};

/* ---------- interactions ---------- */
function rl_patchLive(id){
  var d = rl_draft(id), r = RULE(id);
  document.querySelectorAll('.rl-live-short[data-id="'+id+'"]').forEach(function(e){ e.textContent = rl_fill(d.short, d); });
  document.querySelectorAll('.rl-ed[data-rule="'+id+'"] .rl-live-wh').forEach(function(e){ e.textContent = d.settings.windowHours; });
  var n = rl_fill(d.short, d).length;
  document.querySelectorAll('.rl-count[data-id="'+id+'"]').forEach(function(e){ e.textContent = n+' / 90'; e.classList.toggle('over', n>90); });
  document.querySelectorAll('.rl-ph[data-id="'+id+'"]').forEach(function(e){ e.innerHTML = rl_phHTML(d, r); });
  document.querySelectorAll('.rl-dirty[data-id="'+id+'"]').forEach(function(e){ e.innerHTML = rl_dirtyHTML(id); });
}
ACT['rl-topic'] = function(el){ rl_ui().topic = el.getAttribute('data-t'); rerender(); };
ACT['rl-sel'] = function(el){
  var u = rl_ui(), id = el.getAttribute('data-id');
  u.sel = id; u.selM = u.selM===id ? null : id; if(u.done!==id) u.done = null;
  rerender();
  if(window.innerWidth < 1024 && u.selM){ var c = document.getElementById('rl-card-'+id); if(c) c.scrollIntoView({block:'start', behavior:'smooth'}); }
};
INPUT['rl-short'] = function(el){ var id = el.getAttribute('data-id'); rl_draft(id).short = el.value; rl_patchLive(id); };
INPUT['rl-full'] = function(el){ var id = el.getAttribute('data-id'); rl_draft(id).full = el.value; rl_patchLive(id); };
INPUT['rl-set'] = function(el){
  var id = el.getAttribute('data-id'), k = el.getAttribute('data-k'), d = rl_draft(id), r = RULE(id);
  if(typeof r.settings[k]==='number'){ var n = parseFloat(el.value); d.settings[k] = isNaN(n) ? el.value : n; } else d.settings[k] = el.value;
  rl_patchLive(id);
};
CHANGE['rl-shown'] = function(el){
  var d = rl_draft(el.getAttribute('data-id')), pl = el.getAttribute('data-place'), i = d.shownOn.indexOf(pl);
  if(el.checked && i<0) d.shownOn.push(pl); else if(!el.checked && i>=0) d.shownOn.splice(i,1);
  rl_patchLive(el.getAttribute('data-id'));
};
ACT['rl-status'] = function(el){ rl_draft(el.getAttribute('data-id')).status = el.getAttribute('data-v'); rerender(); };
ACT['rl-ai'] = function(el){ var d = rl_draft(el.getAttribute('data-id')); d.ai = !d.ai; rerender(); };
ACT['rl-rm'] = function(el){ var d = rl_draft(el.getAttribute('data-id')); d[el.getAttribute('data-list')].splice(+el.getAttribute('data-i'), 1); rerender(); };
ACT['rl-add'] = function(el){
  var id = el.getAttribute('data-id'), list = el.getAttribute('data-list'), d = rl_draft(id);
  var opts = RL_SCOPES.filter(function(s){ return d.applies.indexOf(s)<0 && d.except.indexOf(s)<0; });
  openModal('<div class="small text2 mb12">'+(list==='applies'?'Where should this rule apply?':'Which items should NOT follow this rule?')+'</div><div class="row wrap" style="gap:8px">'+
    opts.map(function(o){ return '<button class="chip" data-act="rl-addpick" data-id="'+id+'" data-list="'+list+'" data-v="'+esc(o)+'">'+ico('plus',13)+esc(o)+'</button>'; }).join('')+'</div>'+
    '<div class="xs muted mt16">Demo list — in the full build this comes from your ERP categories and collections.</div>', {title:list==='applies'?'Add to “Applies to”':'Add to “Except”'});
};
ACT['rl-addpick'] = function(el){ var d = rl_draft(el.getAttribute('data-id')); d[el.getAttribute('data-list')].push(el.getAttribute('data-v')); closeModal(); rerender(); };
ACT['rl-discard'] = function(el){ delete rl_ui().drafts[el.getAttribute('data-id')]; toast('Changes discarded'); rerender(); };
ACT['rl-fix'] = function(){ var u = rl_ui(); u.conflict = false; toast('Fixed everywhere — the FAQ now says '+SET('exchange','windowHours')+' hours'); rerender(); };
ACT['rl-preview'] = function(el){
  var id = el.getAttribute('data-id'), d = rl_draft(id), r = RULE(id);
  var before = fillRule(r.short, r), after = rl_fill(d.short, d), changed = before!==after || rl_dirty(id);
  var places = rl_places(id, d);
  openModal(
    '<div class="small text2">When you publish, these places update by themselves:</div>'+
    '<div class="rl-places mt12">'+places.map(function(p){ return '<div class="rl-place">'+ico('check',16,'style="color:#1F4E46"')+esc(p)+'</div>'; }).join('')+'</div>'+
    '<div class="xs muted mt8">'+esc(places.join(' · '))+'</div>'+
    '<div class="label mt16">Short text</div>'+
    (before!==after ? '<div class="small"><span class="muted">Now:</span> <s>'+esc(before)+'</s></div><div class="small mt8"><span class="muted">After publish:</span> <b>'+esc(after)+'</b></div>' : '<div class="small">'+esc(after)+'</div>')+
    (d.status==='Draft' ? '<div class="warnbox p16 small mt16">Status is Draft — customers will not see this rule until you set it to Active.</div>' : '')+
    '<div class="row wrap mt24" style="gap:8px"><button class="btn btn-primary btn-sm" data-act="rl-publish" data-id="'+id+'">Publish now</button><button class="btn btn-ghost btn-sm" data-act="close-modal">Keep editing</button></div>'+
    (changed?'':'<div class="xs muted mt12">No changes yet — edit the text or settings to see the difference.</div>'),
    {title:'Preview — '+r.title});
};
ACT['rl-publish'] = function(el){
  var id = el.getAttribute('data-id'), d = rl_draft(id), r = RULE(id), u = rl_ui();
  ST.rulesOverride[id] = {short:d.short, full:d.full, settings:JSON.parse(JSON.stringify(d.settings)), status:d.status, version:(r.version||1)+1, edited:'Today',
    applies:d.applies.slice(), except:d.except.slice(), shownOn:d.shownOn.slice()};
  saveState(); delete u.drafts[id]; u.done = id;
  if(document.querySelector('.modal-back')) closeModal();
  var n = rl_fill(d.short, d).length;
  toast(n > 90 ? 'Published — the shop now uses this rule (short version is '+n+'/90, consider trimming it)' : 'Published — the shop now uses this rule'); rerender();
};
ACT['rl-new'] = function(){
  var topics = rl_topics().concat(['Other']);
  openModal('<form data-submit="rl-new" class="stack s16">'+
    '<div><label class="label" for="rl-n-topic">Topic</label><select id="rl-n-topic" name="topic" class="input">'+topics.map(function(t0){ return '<option>'+esc(t0)+'</option>'; }).join('')+'</select></div>'+
    '<div><label class="label" for="rl-n-title">Title</label><input id="rl-n-title" name="title" class="input" placeholder="e.g. Puja delivery cutoff" required></div>'+
    '<div><label class="label" for="rl-n-short">Short version <span class="muted" style="font-weight:500">· max 90 characters</span></label><input id="rl-n-short" name="short" class="input" maxlength="90" placeholder="One line customers see next to Add to Bag"></div>'+
    '<div><label class="label" for="rl-n-full">Full rule</label><textarea id="rl-n-full" name="full" class="input" rows="4" placeholder="Write it the way you would explain it to a customer. Use {placeholders} for numbers."></textarea></div>'+
    '<div class="rl-ai on" style="margin-top:0"><span class="tag gold">'+ico('spark',11)+'AI</span><div class="xs">Paste your policy in “Full rule” — AI can write the short version and find the numbers. <span class="muted">AI off? Fill these fields yourself — the rule works exactly the same.</span></div></div>'+
    '<div class="row" style="gap:8px"><button class="btn btn-primary btn-sm">Save as draft</button><button type="button" class="btn btn-ghost btn-sm" data-act="close-modal">Cancel</button></div></form>', {title:'New rule'});
  setTimeout(function(){ var e = document.getElementById('rl-n-title'); if(e) e.focus(); }, 30);
};
SUBMIT['rl-new'] = function(f){
  var g = function(n){ return (f.querySelector('[name='+n+']')||{}).value || ''; };
  var title = g('title').trim(); if(!title){ toast('Please give the rule a title'); return; }
  rl_ui().newRules.unshift({topic:g('topic'), title:title, short:g('short').trim() || 'Short version not written yet', full:g('full')});
  closeModal(); toast('Saved as draft'); rerender();
};
