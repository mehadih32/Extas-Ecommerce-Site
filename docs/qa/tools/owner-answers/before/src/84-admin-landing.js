/* ================= EXTAS demo — Admin · Landing pages (84) ================= */
(function(){
  var css = `
.alp-page .card{color:var(--ink)}
.alp-page .split-side{grid-template-columns:minmax(0,1fr)}
@media(min-width:1024px){.alp-page .split-side{grid-template-columns:minmax(0,1fr) 380px}}
.alp-d{display:none}
@media(min-width:1024px){.alp-d{display:block}.alp-m{display:none!important}}
.alp-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
@media(min-width:1024px){.alp-kpis{grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}}
.alp-kpis .kpi{background:var(--surface);border-color:var(--line);color:var(--ink)}
.alp-tbl td,.alp-tbl th{text-align:left;vertical-align:middle;padding:12px 10px}
.alp-tbl td.n,.alp-tbl th.n{text-align:right;font-variant-numeric:tabular-nums}
.alp-tbl tr:last-child td{border-bottom:0}
.alp-thumb{width:48px;flex-shrink:0;border-radius:6px;overflow:hidden}
.alp-url{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--text2);background:var(--surface2);border:1px solid var(--line2);border-radius:6px;padding:4px 4px 4px 8px;max-width:100%}
.alp-url span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.alp-url button{background:none;border:none;cursor:pointer;color:var(--brand);padding:4px;display:inline-flex;border-radius:4px}
.alp-url button:hover{background:var(--line2)}
.alp-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}
.alp-stats>div{background:var(--surface2);border-radius:6px;padding:8px 10px}
.alp-stats b{display:block;font-family:var(--font-display);font-size:17px}
/* wizard */
.alp-steps{display:flex;gap:4px;list-style:none;margin:0 0 22px;padding:0;align-items:center}
.alp-steps li{display:flex;align-items:center;flex:1 1 auto;min-width:0}
.alp-steps li+li::before{content:'';flex:1 1 auto;height:2px;background:var(--line);margin:0 6px;min-width:8px}
.alp-steps li.done+li::before,.alp-steps li.done::before{background:var(--brand-line)}
.alp-steps button{display:flex;align-items:center;gap:8px;background:none;border:none;padding:4px 2px;cursor:pointer;font:inherit;color:var(--muted);white-space:nowrap}
.alp-steps button[disabled]{cursor:default}
.alp-sn{width:28px;height:28px;border-radius:50%;border:1.5px solid var(--input);display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:700;flex-shrink:0;background:var(--surface)}
.alp-steps li.done .alp-sn{background:var(--brand);border-color:var(--brand);color:var(--brand-ink)}
.alp-steps li.now .alp-sn{border:2px solid var(--brand);color:var(--brand)}
.alp-steps li.now button{color:var(--ink);font-weight:700}
.alp-steps li.done button{color:var(--ink)}
.alp-sl{font-size:13.5px}
@media(max-width:1023px){.alp-steps .alp-sl{display:none}.alp-steps li{flex:1 1 0}.alp-steps li:first-child{flex:0 0 auto}.alp-steps{margin-bottom:18px}}
.alp-mstep{font-size:13px;font-weight:700;margin-bottom:10px}
@media(min-width:1024px){.alp-mstep{display:none}}
.alp-tiles{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}
@media(min-width:1024px){.alp-tiles{grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}}
.alp-prods{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}
@media(min-width:1024px){.alp-prods{grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}}
.alp-tpls{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}
@media(min-width:1024px){.alp-tpls{grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}}
.alp-pick{display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;width:100%;text-align:left;padding:0;cursor:pointer;overflow:hidden;font:inherit;color:var(--ink);position:relative;transition:border-color .15s,box-shadow .15s}
.alp-pick:hover{border-color:var(--brand-line)}
.alp-pick.on{border-color:var(--brand);box-shadow:0 0 0 1.5px var(--brand)}
.alp-pick[disabled]{cursor:not-allowed;background:var(--surface2)}
.alp-pick .pimg{border-radius:0}
.alp-chk{position:absolute;top:8px;right:8px;width:28px;height:28px;border-radius:50%;background:var(--brand);color:var(--brand-ink);display:flex;align-items:center;justify-content:center;z-index:2}
.alp-soonimg{aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;background:repeating-linear-gradient(135deg,var(--surface2) 0 10px,var(--bg) 10px 20px);color:var(--muted)}
.alp-wf{aspect-ratio:4/5;min-height:0;overflow:hidden;background:var(--surface2);border-bottom:1px solid var(--line2);padding:12px 14px;display:flex;flex-direction:column;gap:5px}
@media(min-width:1024px){.alp-wf{aspect-ratio:5/4;padding:14px 16px}}
.alp-wf i{display:block;background:var(--line);border-radius:2px;flex-shrink:0}
.alp-wf i.b{background:var(--brand);opacity:.85}
.alp-wf i.t{background:var(--brand-tint);border:1px solid var(--brand-line)}
.alp-wf .r{display:flex;gap:5px;align-items:flex-end}
.alp-wf .r>i{flex:1}
.alp-wf .vid{display:flex;align-items:center;justify-content:center;color:var(--surface);background:var(--ink2);opacity:.85;border-radius:2px}
.alp-opt{display:flex;gap:10px;align-items:flex-start;padding:12px;border:1px solid var(--line);border-radius:8px;cursor:pointer;font-size:14px}
.alp-opt.on{border-color:var(--brand);background:var(--brand-tint)}
.alp-opt.dis{opacity:.55;cursor:not-allowed}
.alp-opt input{width:18px;height:18px;accent-color:var(--brand);margin-top:1px;flex-shrink:0}
.alp-up{border:1.5px dashed var(--input);border-radius:8px;padding:18px;text-align:center;background:var(--surface2);cursor:pointer;width:100%;font:inherit;color:var(--text2)}
.alp-note{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;color:var(--text2)}
.alp-warn{background:var(--warn-bg);color:var(--warn);border-radius:6px;padding:9px 11px;font-size:12.5px;font-weight:600;display:flex;gap:8px;align-items:flex-start}
.alp-slugrow{display:flex;align-items:stretch;border:1px solid var(--input);border-radius:var(--radius);overflow:hidden;background:var(--surface)}
.alp-slugrow span{display:flex;align-items:center;padding:0 2px 0 12px;color:var(--muted);font-size:14px;white-space:nowrap;background:var(--surface2);border-right:1px solid var(--line2);padding-right:10px}
.alp-slugrow input{border:0;flex:1;min-width:0;width:100%;padding:12px 10px;font-size:15px;background:transparent;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.alp-cnt{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.alp-cnt.over{color:var(--warn);font-weight:700}
.alp-g{border:1px solid var(--line2);border-radius:8px;padding:12px 14px;background:var(--surface)}
.alp-g .gt{color:#1a0dab;font-size:17px;line-height:1.3}
.alp-g .gu{color:#006621;font-size:12.5px;margin-top:2px}
.alp-g .gd{color:#4d5156;font-size:13px;margin-top:4px;line-height:1.45}
.alp-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px}
.alp-foot{margin:24px -16px 0;display:block}
@media(min-width:1024px){.alp-foot{position:static;margin:28px 0 0;border:1px solid var(--line);border-radius:8px;padding:12px 16px}}
.alp-phone{width:100%;max-width:300px;margin:0 auto;border:9px solid var(--ink);border-radius:28px;overflow:hidden;background:var(--surface);box-shadow:0 18px 40px rgba(0,0,0,.14)}
.alp-pvurl{font-size:10.5px;color:var(--muted);background:var(--surface2);text-align:center;padding:6px 8px;border-bottom:1px solid var(--line2);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.alp-screen{max-height:540px;overflow:hidden;position:relative}
.alp-screen::after{content:'';position:absolute;left:0;right:0;bottom:0;height:40px;background:linear-gradient(transparent,var(--surface))}
.alp-pvh{font-family:var(--font-display);font-weight:800;font-size:17px;line-height:1.2}
.alp-pvsec{display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-top:1px solid var(--line2);font-size:12px;color:var(--text2)}
.alp-pvcta{background:var(--brand);color:var(--brand-ink);text-align:center;font-weight:700;font-size:13px;padding:11px;border-radius:var(--btn-radius);margin-top:10px}
.alp-pst{display:flex;flex-direction:column;gap:14px;margin:6px 0}
.alp-ps{display:flex;gap:12px;align-items:center;font-size:14.5px;color:var(--muted)}
.alp-ps.now{color:var(--ink);font-weight:600}
.alp-ps.done{color:var(--ink)}
.alp-psd{width:24px;height:24px;border-radius:50%;border:1.5px solid var(--input);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.alp-ps.done .alp-psd{background:var(--brand);border-color:var(--brand);color:var(--brand-ink)}
.alp-ps.now .alp-psd{border:2.5px solid var(--line);border-top-color:var(--brand);animation:alp-spin .8s linear infinite}
@keyframes alp-spin{to{transform:rotate(360deg)}}
.alp-okc{flex-shrink:0;width:60px;height:60px;border-radius:50%;background:var(--brand-tint);color:var(--brand);display:flex;align-items:center;justify-content:center}
`;
  var s = document.createElement('style'); s.setAttribute('data-mod', 'admin-landing'); s.textContent = css; document.head.appendChild(s);
})();

/* ---------- helpers ---------- */
var ALP_STEPS = ['Category','Product','Template','Build','Link & publish'];
var ALP_SECTIONS = {
  'offer-first':['Offer & order form','Photos in every colour','Size chart','Reviews','FAQ'],
  'fit-first':['Find my size','Fit reviews','Offer','Order form','FAQ'],
  'story':['Short video','Fabric close-ups','Styling looks','Order form','FAQ'],
  'combo-push':['1 · 2 · 3-pack price ladder','Pick your colours','Order form','Reviews','FAQ']
};
function alp_cat(id){ for(var i=0;i<DB.landingCategories.length;i++) if(DB.landingCategories[i].id===id) return DB.landingCategories[i]; return null; }
function alp_group(catId){ var c = alp_cat(catId); return c ? c.group : 'top'; }
function alp_tpl(group, id){ var l = DB.landingTemplates[group] || []; for(var i=0;i<l.length;i++) if(l[i].id===id) return l[i]; return null; }
function alp_tplName(lp){ var t = alp_tpl(alp_group(lp.cat), lp.template); return t ? t.name : (lp.template || '—'); }
function alp_conv(lp){ return lp.visits ? (Math.round(lp.orders/lp.visits*1000)/10).toFixed(1)+'%' : '—'; }
function alp_short(slug){ return 'extas.com.bd/l/'+slug; }
function alp_slugify(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
function alp_slugCap(s, max){ max = max||40; if(s.length<=max) return s; var cut = s.slice(0, max); var i = cut.lastIndexOf('-'); return (i>12 ? cut.slice(0,i) : cut).replace(/-+$/,''); }
function alp_slugTaken(slug){ return ST.landingPages.some(function(lp){ return lp.slug===slug; }); }
function alp_copy(text){ try{ if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(function(){}); }catch(e){} }
function alp_page(id){ for(var i=0;i<ST.landingPages.length;i++) if(ST.landingPages[i].id===id) return ST.landingPages[i]; return null; }
function alp_status(st){ return st==='Live' ? '<span class="tag"><span style="width:7px;height:7px;border-radius:50%;background:currentColor;display:inline-block"></span>Live</span>' : (st==='Draft' ? '<span class="tag warn">Draft</span>' : '<span class="tag plain">'+esc(st||'Paused')+'</span>'); }
function alp_aiOn(){ return typeof aai_agentRunning==='function' ? aai_agentRunning('landing') : !!(ST.ai && ST.ai.master); }
function alp_utm(slug, campaign){
  if(!campaign) return '';
  var src = 'facebook', med = 'paid_social';
  if(/^tiktok/i.test(campaign)){ src = 'tiktok'; med = 'paid_social'; }
  else if(/^google/i.test(campaign)){ src = 'google'; med = 'cpc'; }
  return 'https://extas.com.bd/l/'+slug+'?utm_source='+src+'&utm_medium='+med+'&utm_campaign='+alp_slugify(campaign);
}

/* ================= list ================= */
PAGES['admin-landing'] = { layout:'admin', title:'Landing pages', render:function(){
  var list = ST.landingPages.slice().reverse();
  var visits = 0, orders = 0, live = 0;
  list.forEach(function(lp){ visits += lp.visits||0; orders += lp.orders||0; if(lp.status==='Live') live++; });
  var head = '<div class="row between wrap mb24" style="align-items:flex-end;gap:14px"><div><div class="eyebrow">Admin · Ads</div><h1 class="h1" style="margin-top:6px">Landing pages</h1>'+
      '<p class="text2 mt8" style="max-width:620px;margin-bottom:0">Pages for your Facebook/TikTok/Google ads — one product, one goal, order form on the page.</p></div>'+
      '<a class="btn btn-primary" href="#/admin/landing/new" data-act="alp-create" data-testid="alp-create">'+ico('plus',17)+'Create landing page</a></div>';
  var kpis = '<div class="alp-kpis mb24">'+
      '<div class="kpi"><div class="xs muted">Live pages</div><div class="v">'+live+'</div></div>'+
      '<div class="kpi"><div class="xs muted">Visits</div><div class="v">'+visits.toLocaleString('en-US')+'</div></div>'+
      '<div class="kpi"><div class="xs muted">Orders</div><div class="v">'+orders.toLocaleString('en-US')+'</div></div>'+
      '<div class="kpi"><div class="xs muted">Conversion</div><div class="v">'+(visits ? (Math.round(orders/visits*1000)/10).toFixed(1)+'%' : '—')+'</div></div></div>';
  if(!list.length) return '<div class="alp-page">'+head+'<div class="card empty">'+ico('bolt',28,'style="margin:0 auto 10px"')+'<div class="h2" style="color:var(--ink)">No landing pages yet</div><p class="small">Make one in about a minute — pick a product and a tested template.</p></div></div>';
  return '<div class="alp-page">'+head+kpis+alp_table(list)+alp_cards(list)+
    '<p class="xs muted mt16">Visits and orders come from the page\'s own tracking. Copy the tracking link into your ad so each campaign is counted separately.</p></div>';
}};

function alp_urlChip(lp){
  return '<span class="alp-url"><span>'+esc(alp_short(lp.slug))+'</span><button data-act="alp-copy" data-slug="'+esc(lp.slug)+'" aria-label="Copy link '+esc(alp_short(lp.slug))+'">'+ico('link',15)+'</button></span>';
}
function alp_abSwitch(lp){
  return '<button class="switch'+(lp.ab?' on':'')+'" role="switch" aria-checked="'+(lp.ab?'true':'false')+'" aria-label="A/B test for '+esc(lp.title)+'" data-act="alp-ab" data-id="'+esc(lp.id)+'"></button>';
}
function alp_abNote(lp){
  if(!lp.ab) return '';
  var other = (DB.landingTemplates[alp_group(lp.cat)]||[]).filter(function(t){ return t.id!==lp.template; })[0];
  return other ? '<div class="xs muted" style="margin-top:3px">vs '+esc(other.name)+'</div>' : '';
}
function alp_table(list){
  var rows = list.map(function(lp){
    var p = P(lp.product);
    return '<tr data-testid="alp-row-'+esc(lp.slug)+'">'+
      '<td><div class="row" style="gap:12px;align-items:center">'+(p?'<div class="alp-thumb">'+productImg(p, p.colors[0], {ratio:'ratio-11', label:false})+'</div>':'')+
        '<div style="min-width:0"><div class="bold" style="line-height:1.3">'+esc(lp.title)+'</div><div class="xs muted" style="margin-top:2px">'+esc(p?p.name:lp.product)+' · '+esc(alp_tplName(lp))+(lp.ai?' · AI-written':'')+'</div>'+
        '<div style="margin-top:8px">'+alp_urlChip(lp)+'</div></div></div></td>'+
      '<td class="small" style="min-width:120px">'+(lp.campaign ? esc(lp.campaign) : '<span class="muted">No campaign</span>')+'</td>'+
      '<td class="n">'+(lp.visits||0).toLocaleString('en-US')+'</td>'+
      '<td class="n">'+(lp.orders||0).toLocaleString('en-US')+'</td>'+
      '<td class="n bold">'+alp_conv(lp)+'</td>'+
      '<td>'+alp_status(lp.status)+'</td>'+
      '<td style="min-width:110px"><div class="row" style="gap:8px">'+alp_abSwitch(lp)+'<span class="xs">A/B test</span></div>'+alp_abNote(lp)+'</td>'+
      '<td><div class="stack s6" style="align-items:stretch"><a class="btn btn-sm btn-secondary" href="#/l/'+esc(lp.slug)+'">'+ico('eye',15)+'Open page</a><button class="btn btn-sm btn-ghost" data-act="alp-copy" data-slug="'+esc(lp.slug)+'">'+ico('link',14)+'Copy link</button></div></td>'+
    '</tr>';
  }).join('');
  return '<div class="alp-d"><div class="tbl-wrap" style="background:var(--surface)"><table class="tbl alp-tbl"><thead><tr>'+
    '<th style="min-width:320px">Page &amp; short link</th><th>Campaign</th><th class="n">Visits</th><th class="n">Orders</th><th class="n">Conv.</th><th>Status</th><th>Test</th><th>Actions</th>'+
    '</tr></thead><tbody>'+rows+'</tbody></table></div></div>';
}
function alp_cards(list){
  return '<div class="alp-m stack s16">'+list.map(function(lp){
    var p = P(lp.product);
    return '<article class="card p16" data-testid="alp-card-'+esc(lp.slug)+'">'+
      '<div class="row top" style="gap:12px">'+(p?'<div class="alp-thumb" style="width:56px">'+productImg(p, p.colors[0], {ratio:'ratio-11', label:false})+'</div>':'')+
        '<div class="grow"><div class="row between top" style="gap:8px"><div class="bold" style="line-height:1.3">'+esc(lp.title)+'</div>'+alp_status(lp.status)+'</div>'+
        '<div class="xs muted" style="margin-top:3px">'+esc(p?p.name:lp.product)+' · '+esc(alp_tplName(lp))+'</div></div></div>'+
      '<div class="mt12">'+alp_urlChip(lp)+'</div>'+
      '<div class="alp-stats"><div><span class="xs muted">Visits</span><b>'+(lp.visits||0).toLocaleString('en-US')+'</b></div><div><span class="xs muted">Orders</span><b>'+(lp.orders||0).toLocaleString('en-US')+'</b></div><div><span class="xs muted">Conversion</span><b>'+alp_conv(lp)+'</b></div></div>'+
      '<div class="small mt12">'+ico('bolt',14,'style="display:inline;vertical-align:-2px;margin-right:4px;color:var(--muted)"')+(lp.campaign ? esc(lp.campaign) : '<span class="muted">No campaign yet</span>')+'</div>'+
      '<div class="row between mt12" style="border-top:1px solid var(--line2);padding-top:12px"><div><div class="row" style="gap:8px">'+alp_abSwitch(lp)+'<span class="small">A/B test</span></div>'+alp_abNote(lp)+'</div>'+
        '<div class="row" style="gap:6px"><button class="btn btn-sm btn-ghost" data-act="alp-copy" data-slug="'+esc(lp.slug)+'">Copy link</button><a class="btn btn-sm btn-secondary" href="#/l/'+esc(lp.slug)+'">Open page</a></div></div>'+
    '</article>';
  }).join('')+'</div>';
}

ACT['alp-copy'] = function(el){ var slug = el.getAttribute('data-slug'); alp_copy('https://'+alp_short(slug)); toast('Link copied: '+alp_short(slug)); };
ACT['alp-copy-text'] = function(el){ alp_copy(el.getAttribute('data-text')); toast(el.getAttribute('data-msg') || 'Copied'); };
ACT['alp-ab'] = function(el){
  var lp = alp_page(el.getAttribute('data-id')); if(!lp) return; lp.ab = !lp.ab; saveState(); rerender();
  toast(lp.ab ? 'A/B test on — half of visitors see the other template' : 'A/B test off');
};
ACT['alp-create'] = function(){ delete UI['lpnew']; go('#/admin/landing/new'); };

/* ================= wizard ================= */
function alp_u(){ return ui('lpnew', {step:1, max:1, cat:null, product:null, template:null, ai:true, offer:'none', media:'mine', headline:'', sub:'', hEdited:false, hVar:0,
  slug:'', slugEdited:false, seoTitle:'', seoDesc:'', seoEdited:false, campaign:'', custom:false, code:'', publishing:false, pphase:0, done:null}); }

function alp_offers(p){
  var list = [{id:'none', label:'No offer'}];
  if(p) combos().forEach(function(c){
    if(!c.active || c.items.indexOf(p.id)<0) return;
    var same = c.items.every(function(x){ return x===p.id; });
    list.push({id:'combo:'+c.id, combo:c, same:same, label: same ? c.name+' — '+c.items.length+' for '+fmt(c.price) : c.name+' — set of '+c.items.length+' for '+fmt(c.price)});
  });
  list.push({id:'pct10', label:'10% off'});
  list.push({id:'freedel', label:'Free delivery'});
  return list;
}
function alp_offer(u){ var p = P(u.product); var l = alp_offers(p); for(var i=0;i<l.length;i++) if(l[i].id===u.offer) return l[i]; return l[0]; }
function alp_catWord(p){ var c = CAT(p.cat); return c ? c.name.replace(/s$/,'').toLowerCase() : 'piece'; }
function alp_headline(u, variant){
  var p = P(u.product); if(!p) return ''; var o = alp_offer(u), v = (variant||0) % 3, w = alp_catWord(p);
  var fab = String(p.fabric||'').split('·')[0].trim();
  var opts;
  if(o.combo){
    var c = o.combo;
    opts = o.same ? [c.name+' — any '+c.items.length+' colours for '+fmt(c.price), 'Pick any '+c.items.length+' '+w+'s for '+fmt(c.price), c.items.length+' '+p.name+'s, one price: '+fmt(c.price)]
                  : [c.name+' — '+c.items.map(function(x){ return P(x).name; }).join(' + ')+' for '+fmt(c.price), 'The full look for '+fmt(c.price)+' — '+c.name, c.name+': '+c.items.length+' pieces, one easy price'];
  } else if(o.id==='pct10'){
    var np = Math.round(p.price*0.9/10)*10;
    opts = [p.name+' — 10% off, now '+fmt(np), 'Now '+fmt(np)+': '+p.name, '10% off our '+p.name+' this week'];
  } else if(o.id==='freedel'){
    opts = [p.name+' — '+fmt(p.price)+', free delivery', 'Free delivery on the '+p.name, p.name+' at your door — delivery on us'];
  } else {
    opts = [p.name+' — '+fmt(p.price), p.name+' in '+fab, 'The '+w+' you will wear every week'];
  }
  return opts[v];
}
function alp_sub(u){
  var p = P(u.product); if(!p) return ''; var fab = String(p.fabric||'').split('·')[0].trim();
  var ex = 'Size exchange in '+SET('exchange','windowHours')+' hours, Cash on Delivery all over Bangladesh.';
  return u.ai && alp_aiOn() ? fab+'. Rated '+p.rating+' by '+p.reviews+' buyers. '+ex : fab+'. '+p.colors.length+' colours. '+ex;
}
function alp_autoSlug(u){
  var p = P(u.product); if(!p) return ''; var o = alp_offer(u), base = alp_slugify(p.name), s;
  if(o.combo){
    var cs = alp_slugify(o.combo.name), cw = cs.split('-');
    var extra = base.split('-').filter(function(w){ return cw.indexOf(w)<0 && w.length>2; }).slice(0,2).join('-');
    s = cs + (extra ? '-'+extra : '');
  } else if(o.id==='pct10') s = alp_slugCap(base, 32)+'-10-off';
  else if(o.id==='freedel') s = alp_slugCap(base, 26)+'-free-delivery';
  else s = base;
  s = alp_slugCap(s, 40);
  if(alp_slugTaken(s)){ var n = 2; while(alp_slugTaken(alp_slugCap(s, 37)+'-'+n)) n++; s = alp_slugCap(s, 37)+'-'+n; }
  return s;
}
function alp_seoT(u){
  var p = P(u.product); if(!p) return ''; var o = alp_offer(u);
  if(o.combo) return o.combo.name+': '+(o.same ? o.combo.items.length+' '+p.name+'s' : 'the set')+' '+fmt(o.combo.price)+' | EXTAS';
  if(o.id==='pct10') return p.name+' — 10% off | EXTAS';
  return p.name+' — '+fmt(p.price)+' | EXTAS';
}
function alp_seoD(u){
  var p = P(u.product); if(!p) return ''; var o = alp_offer(u);
  var lead = o.combo ? o.combo.name+': '+(o.same ? 'any '+o.combo.items.length+' colours' : o.combo.items.length+' pieces')+' for '+fmt(o.combo.price)+'.' : (o.id==='pct10' ? '10% off this week.' : (o.id==='freedel' ? 'Free delivery.' : ''));
  var first = String(p.desc||'').split('. ')[0].replace(/\.?$/, '.');
  var parts = [lead, first, 'Cash on Delivery all over Bangladesh.', 'Size exchange in '+SET('exchange','windowHours')+' hours.', p.fitNote].filter(Boolean);
  var d = '';
  parts.forEach(function(x){ var n = d ? d+' '+x : x; if(n.length<=155) d = n; });
  return d;
}
/* fill text that the owner has not edited yet */
function alp_fill(u){
  if(!u.hEdited){ u.headline = alp_headline(u, u.hVar); u.sub = alp_sub(u); }
  if(!u.slugEdited) u.slug = alp_autoSlug(u);
  if(!u.seoEdited){ u.seoTitle = alp_seoT(u); u.seoDesc = alp_seoD(u); }
}
function alp_valid(u, step){
  if(step===1) return !!u.cat;
  if(step===2) return !!u.product;
  if(step===3) return !!u.template;
  if(step===4) return !!String(u.headline).trim();
  if(step===5) return u.slug.length>=3 && !alp_slugTaken(u.slug);
  return true;
}
var ALP_HINT = {1:'Pick a category to continue', 2:'Pick a product to continue', 3:'Pick a template to continue', 4:'Add a headline to continue', 5:'Fix the page address to publish'};

PAGES['admin-landing-new'] = { layout:'admin', title:'Create landing page', render:function(){
  var u = alp_u();
  var head = '<div class="row between wrap mb24" style="align-items:flex-end;gap:12px"><div><a class="small row" style="gap:4px;color:var(--muted)" href="#/admin/landing">'+ico('back',14)+'Landing pages</a>'+
    '<h1 class="h1" style="margin-top:6px">Create landing page</h1></div>'+
    (u.done ? '' : '<span class="xs muted">About a minute · nothing goes live until you press Generate &amp; publish</span>')+'</div>';
  if(u.done) return '<div class="alp-page">'+head+alp_success(u)+'</div>';
  var body = u.step===1 ? alp_step1(u) : u.step===2 ? alp_step2(u) : u.step===3 ? alp_step3(u) : u.step===4 ? alp_step4(u) : alp_step5(u);
  return '<div class="alp-page" data-testid="alp-wizard">'+head+alp_stepsHd(u)+body+alp_foot(u)+'</div>';
}};

function alp_stepsHd(u){
  return '<div class="alp-mstep" aria-hidden="true">Step '+u.step+' of 5 · '+esc(ALP_STEPS[u.step-1])+'</div><ol class="alp-steps" aria-label="Steps">'+ALP_STEPS.map(function(s, i){
    var n = i+1, st = n<u.step ? 'done' : (n===u.step ? 'now' : ''), can = n<=u.max && n!==u.step;
    return '<li class="'+st+'"'+(n===u.step?' aria-current="step"':'')+'><button aria-label="Step '+n+': '+esc(s)+(st==='done'?' (done)':'')+'" '+(can?'data-act="alp-step" data-n="'+n+'"':'disabled')+'><span class="alp-sn">'+(st==='done'?ico('check',14):n)+'</span><span class="alp-sl">'+esc(s)+'</span></button></li>';
  }).join('')+'</ol>';
}
function alp_foot(u){
  var ok = alp_valid(u, u.step);
  var next = u.step===5
    ? '<button class="btn btn-primary" id="alp-next" data-act="alp-publish" data-testid="alp-publish"'+(ok?'':' disabled')+'>'+ico('bolt',17)+'Generate &amp; publish</button>'
    : '<button class="btn btn-primary" id="alp-next" data-act="alp-next" data-testid="alp-next"'+(ok?'':' disabled')+'><span>Next<span class="hide-m">: '+esc(ALP_STEPS[u.step])+'</span></span>'+ico('right',16)+'</button>';
  return '<div class="mbar alp-foot"><div class="row between" style="gap:10px">'+
    (u.step>1 ? '<button class="btn btn-ghost" data-act="alp-prev">'+ico('back',16)+'Back</button>' : '<a class="btn btn-ghost" href="#/admin/landing">Cancel</a>')+
    '<div class="row" style="gap:14px"><span class="small muted alp-d" id="alp-hint">'+(ok?'':esc(ALP_HINT[u.step]))+'</span>'+next+'</div></div></div>';
}

/* step 1 — category */
function alp_step1(u){
  return '<h2 class="h2">Which category is this ad for?</h2><p class="small text2 mt8 mb16">Each category has its own tested templates — tops and bottoms are laid out differently.</p>'+
    '<div class="alp-tiles">'+DB.landingCategories.map(function(c){
      var prods = productsIn(c.id), tpls = DB.landingTemplates[c.group] || [];
      if(c.soon || !prods.length){
        return '<button class="card alp-pick" disabled aria-disabled="true" data-testid="alp-cat-'+c.id+'"><div class="alp-soonimg">'+ico('layers',30)+'</div>'+
          '<div class="p16"><div class="h3" style="color:var(--text2)">'+esc(c.name)+'</div><div class="xs mt8" style="color:var(--warn);font-weight:600">Templates ready — add products first</div></div></button>';
      }
      var on = u.cat===c.id, p0 = prods[0];
      return '<button class="card alp-pick'+(on?' on':'')+'" data-act="alp-cat" data-id="'+c.id+'" aria-pressed="'+on+'" data-testid="alp-cat-'+c.id+'">'+
        productImg(p0, p0.colors[0], {ratio:'ratio-wide', label:false, inner: on?'<span class="alp-chk">'+ico('check',16)+'</span>':''})+
        '<div class="p16"><div class="h3">'+esc(c.name)+'</div><div class="xs muted" style="margin-top:3px">'+plural(prods.length,'product')+' · '+plural(tpls.length,'template')+'</div></div></button>';
    }).join('')+'</div>';
}
/* step 2 — product */
function alp_step2(u){
  var c = alp_cat(u.cat), prods = productsIn(u.cat);
  return '<h2 class="h2">Pick the product for this page</h2><p class="small text2 mt8 mb16">One product, one goal. '+esc(c?c.name:'')+' · '+plural(prods.length,'product')+'</p>'+
    '<div class="alp-prods">'+prods.map(function(p){
      var on = u.product===p.id, inCombo = combos().filter(function(cb){ return cb.active && cb.items.indexOf(p.id)>=0; })[0];
      return '<button class="card alp-pick'+(on?' on':'')+'" data-act="alp-prod" data-id="'+p.id+'" aria-pressed="'+on+'" data-testid="alp-prod-'+p.id+'">'+
        productImg(p, p.colors[0], {ratio:'ratio-45', label:false, inner: on?'<span class="alp-chk">'+ico('check',16)+'</span>':''})+
        '<div class="p16" style="padding:12px 14px 14px"><div class="small bold" style="line-height:1.3">'+esc(p.name)+'</div><div class="row mt8" style="gap:7px;align-items:baseline">'+priceHTML(p.price, p.compareAt)+'</div>'+
        '<div class="row wrap mt8" style="gap:5px"><span class="xs muted">'+plural(p.colors.length,'colour')+'</span>'+(inCombo?'<span class="tag gold">'+esc(inCombo.name)+'</span>':'')+'</div></div></button>';
    }).join('')+'</div>';
}
/* step 3 — template */
function alp_wire(id){
  var b = function(h, cls, extra){ return '<i class="'+(cls||'')+'" style="height:'+h+'px'+(extra?';'+extra:'')+'"></i>'; };
  var lines = b(4,'','width:90%')+b(4,'','width:70%');
  var inner;
  if(id==='offer-first') inner = b(22,'b')+'<div class="r">'+b(54)+b(54,'t')+'</div>'+lines+b(4,'','width:80%')+b(12,'b','width:60%;margin-top:auto');
  else if(id==='fit-first') inner = b(40)+'<div class="r">'+b(12,'t')+b(12,'t')+b(12,'t')+b(12,'t')+'</div>'+b(6,'','width:50%')+lines+b(16,'t')+b(12,'b','width:60%;margin-top:auto');
  else if(id==='story') inner = '<div class="vid" style="height:56px">'+ico('play',18)+'</div><div class="r">'+b(22)+b(22)+b(22)+'</div>'+lines+b(26,'t')+b(12,'b','width:60%;margin-top:auto');
  else inner = b(6,'','width:70%')+'<div class="r" style="height:58px">'+b(26,'t')+b(40,'t')+b(56,'b')+'</div>'+lines+b(22,'t')+b(12,'b','width:60%;margin-top:auto');
  return '<div class="alp-wf" aria-hidden="true">'+inner+'</div>';
}
function alp_recommended(u){
  var g = alp_group(u.cat), inCombo = combos().some(function(c){ return c.active && c.items.indexOf(u.product)>=0; });
  return inCombo && alp_tpl(g, 'combo-push') ? 'combo-push' : 'offer-first';
}
function alp_step3(u){
  var g = alp_group(u.cat), tpls = DB.landingTemplates[g] || [], rec = alp_recommended(u);
  return '<h2 class="h2">Choose a template</h2><p class="small text2 mt8 mb16">Every template is A/B tested on real ad traffic. You can switch on a test later from the list.</p>'+
    '<div class="alp-tpls">'+tpls.map(function(t){
      var on = u.template===t.id;
      return '<button class="card alp-pick'+(on?' on':'')+'" data-act="alp-tpl" data-id="'+t.id+'" aria-pressed="'+on+'" data-testid="alp-tpl-'+t.id+'">'+
        alp_wire(t.id)+(on?'<span class="alp-chk">'+ico('check',16)+'</span>':'')+
        '<div class="p16"><div class="row between top" style="gap:6px"><div class="h3">'+esc(t.name)+'</div>'+(t.id===rec?'<span class="tag gold">Recommended</span>':'')+'</div>'+
        '<div class="xs text2" style="margin-top:4px;line-height:1.45">'+esc(t.note)+'</div>'+
        '<div class="row wrap mt12" style="gap:6px"><span class="tag">'+ico('check',12)+'A/B tested</span><span class="xs bold brandc">'+esc(t.score)+'</span></div></div></button>';
    }).join('')+'</div>';
}
/* live preview (desktop sidebar) */
function alp_preview(u){
  var p = P(u.product); if(!p) return ''; var o = alp_offer(u);
  var secs = ALP_SECTIONS[u.template] || ALP_SECTIONS['offer-first'];
  var badge = o.id==='none' ? '' : '<span class="badge-img sale" style="z-index:2">'+esc(o.combo ? o.combo.name : o.label)+'</span>';
  return '<div class="xs muted center mb8">Live preview · phone</div><div class="alp-phone"><div class="alp-pvurl" id="alp-pv-url">'+esc(alp_short(u.slug || alp_slugify(p.name)))+'</div><div class="alp-screen">'+
    productImg(p, p.colors[0], {ratio:'ratio-11', label:false, inner:badge})+
    '<div style="padding:12px 14px 16px"><div class="alp-pvh" id="alp-pv-h">'+esc(u.headline || 'Your headline')+'</div>'+
    '<div class="xs text2" style="margin-top:6px;line-height:1.45" id="alp-pv-s">'+esc(u.sub)+'</div>'+
    '<div class="row mt8" style="gap:4px">'+p.colors.map(function(c){ return '<span class="swatch sm" style="background:'+COL(c).hex+'"></span>'; }).join('')+'</div>'+
    '<div class="alp-pvcta">Order Now · Cash on Delivery</div>'+
    '<div class="mt12">'+secs.map(function(s){ return '<div class="alp-pvsec"><span>'+esc(s)+'</span>'+ico('right',12)+'</div>'; }).join('')+'</div></div></div></div>'+
    '<div class="xs muted center mt12">'+esc((alp_tpl(alp_group(u.cat), u.template)||{}).name || '')+' template'+(u.ai && alp_aiOn() ? ' · AI fills every section' : ' · you fill the sections')+'</div>';
}
function alp_twoCol(u, left){
  return '<div class="split-side"><div class="stack s16">'+left+'</div><aside class="alp-d"><div style="position:sticky;top:24px">'+alp_preview(u)+'</div></aside></div>';
}
/* step 4 — build */
function alp_step4(u){
  var p = P(u.product), aiAvail = alp_aiOn(), aiOn = u.ai && aiAvail, offers = alp_offers(p);
  var media = [
    ['mine','Use my product photos', p.colors.length+' colours from the product page, front, back and detail', false],
    ['ai','AI makes extra images and a short video', 'Made only from your own product photos', !aiOn],
    ['upload','Ask me to upload', 'You add your own photos or video', false]
  ];
  return alp_twoCol(u,
    '<section class="card p20"><div class="row between top" style="gap:14px"><div><h2 class="h3" style="font-size:16px">'+ico('spark',16,'style="display:inline;vertical-align:-3px;margin-right:6px;color:var(--brand)"')+'Let AI write the page</h2>'+
      '<div class="small text2" style="margin-top:4px">AI writes the headline, sections and FAQ from your product, reviews and rules</div></div>'+
      '<button class="switch'+(aiOn?' on':'')+'" role="switch" aria-checked="'+aiOn+'" aria-label="Let AI write the page" data-act="alp-ai"'+(aiAvail?'':' disabled style="opacity:.5;cursor:not-allowed"')+' data-testid="alp-ai"></button></div>'+
      (!aiAvail ? '<div class="alp-warn mt12" data-testid="alp-ai-off">'+ico('info',15)+'<span>AI is off — you\'ll fill the text yourself. <a href="#/admin/ai" style="color:inherit;text-decoration:underline">Change in AI &amp; agents</a></span></div>' :
        (aiOn ? '<div class="xs muted mt12">Uses the Landing Page Builder agent · '+esc(((typeof aai_agent==='function' && aai_agent('landing'))||{}).model||'')+'</div>' : '<div class="xs muted mt12">AI is off for this page — the template shows placeholders you fill in.</div>'))+
    '</section>'+
    '<section class="card p20"><label class="label" for="alp-offer">Offer</label><select id="alp-offer" class="input" data-change="alp-offer" data-testid="alp-offer">'+
      offers.map(function(o){ return '<option value="'+o.id+'"'+(o.id===u.offer?' selected':'')+'>'+esc(o.label)+'</option>'; }).join('')+'</select>'+
      '<div class="xs muted mt8">Combo offers use the price from Combos &amp; sets, so the page and the bag always match.</div></section>'+
    '<section class="card p20"><div class="label">Photos &amp; video</div><div class="stack s8">'+
      media.map(function(m){ var on = u.media===m[0];
        return '<label class="alp-opt'+(on?' on':'')+(m[3]?' dis':'')+'"><input type="radio" name="alp-media" value="'+m[0]+'" data-change="alp-media"'+(on?' checked':'')+(m[3]?' disabled':'')+'><span><span class="bold">'+esc(m[1])+'</span><br><span class="xs muted">'+esc(m[3]?'Needs AI to be on':m[2])+'</span></span></label>'; }).join('')+
      (u.media==='upload' ? '<button class="alp-up" data-act="alp-upload">'+ico('camera',26,'style="margin:0 auto 6px"')+'<span class="bold small" style="color:var(--ink)">Tap to add photos or a short video</span><br><span class="xs">JPG, PNG or MP4 · up to 30 MB each</span></button>' : '')+
      '<div class="alp-note mt8">'+ico('shield',15,'style="flex-shrink:0;color:var(--brand);margin-top:1px"')+'<span>AI never copies photos from other websites.</span></div>'+
    '</div></section>'+
    '<section class="card p20"><div class="row between"><label class="label" for="alp-h" style="margin:0">Headline</label>'+(aiOn?'<button class="link row" style="gap:4px;text-decoration:none" data-act="alp-rewrite">'+ico('spark',14)+'Try another</button>':'')+'</div>'+
      '<input id="alp-h" class="input mt8" value="'+esc(u.headline)+'" data-input="alp-text" data-k="headline" maxlength="90" data-testid="alp-headline">'+
      '<label class="label mt16" for="alp-s">Subheadline</label><textarea id="alp-s" class="input" rows="3" data-input="alp-text" data-k="sub" placeholder="One line on fabric, fit and delivery">'+esc(u.sub)+'</textarea>'+
      '<div class="xs muted mt8">Made from the product and your Smart Rules. Change anything — your words are kept.</div></section>'
  );
}
/* step 5 — link & publish */
function alp_slugWarn(u){
  if(u.slug.length<3) return '<div class="alp-warn mt8">'+ico('info',15)+'<span>Use at least 3 letters or numbers.</span></div>';
  if(alp_slugTaken(u.slug)) return '<div class="alp-warn mt8" data-testid="alp-dup">'+ico('info',15)+'<span>extas.com.bd/l/'+esc(u.slug)+' is already used by another page. Try adding a colour or month, e.g. '+esc(alp_slugCap(u.slug,34))+'-oct.</span></div>';
  return '<div class="xs mt8 brandc bold row" style="gap:5px">'+ico('check',14)+'Address is free</div>';
}
function alp_utmBlock(u){
  if(!u.campaign) return '<div class="xs muted mt8">Pick a campaign to get a tracking link for your ad.</div>';
  var link = alp_utm(u.slug, u.campaign);
  return '<div class="soft p16 mt12"><div class="xs bold mb8">Tracking link for this campaign</div><div class="row top" style="gap:8px"><code class="alp-code grow" style="word-break:break-all;line-height:1.5" data-testid="alp-utm">'+esc(link)+'</code>'+
    '<button class="btn btn-sm btn-secondary" data-act="alp-copy-text" data-text="'+esc(link)+'" data-msg="Tracking link copied">Copy</button></div>'+
    '<div class="xs muted mt8">Paste this as the website link in your ad. utm_source, utm_medium and utm_campaign tell you which ad brought each order.</div></div>';
}
function alp_cnt(n, max){ return '<span class="alp-cnt'+(n>max?' over':'')+'">'+n+' / '+max+(n>max?' · Google may cut this off':'')+'</span>'; }
function alp_step5(u){
  return alp_twoCol(u,
    '<section class="card p20"><label class="label" for="alp-slug">Page address</label>'+
      '<div class="alp-slugrow"><span>extas.com.bd/l/</span><input id="alp-slug" value="'+esc(u.slug)+'" data-input="alp-slug" data-change="alp-slug-done" autocapitalize="off" autocomplete="off" spellcheck="false" maxlength="40" data-testid="alp-slug" aria-describedby="alp-slug-pv"></div>'+
      '<div class="row wrap mt12" style="gap:8px"><span class="alp-url"><span id="alp-slug-pv">'+esc(alp_short(u.slug))+'</span><button data-act="alp-copy-slug" aria-label="Copy page address">'+ico('link',15)+'</button></span></div>'+
      '<div id="alp-slug-warn">'+alp_slugWarn(u)+'</div>'+
      '<div class="xs muted mt8">Short, lowercase, words joined with hyphens — easy to read in an ad and good for Google.</div></section>'+
    '<section class="card p20"><div class="row between"><label class="label" for="alp-st" style="margin:0">SEO title</label><span id="alp-cnt-t">'+alp_cnt(u.seoTitle.length, 60)+'</span></div>'+
      '<input id="alp-st" class="input mt8" value="'+esc(u.seoTitle)+'" data-input="alp-seo" data-k="seoTitle">'+
      '<div class="row between mt16"><label class="label" for="alp-sd" style="margin:0">Meta description</label><span id="alp-cnt-d">'+alp_cnt(u.seoDesc.length, 155)+'</span></div>'+
      '<textarea id="alp-sd" class="input mt8" rows="3" data-input="alp-seo" data-k="seoDesc">'+esc(u.seoDesc)+'</textarea>'+
      '<div class="xs bold mt16 mb8">Google preview</div><div class="alp-g"><div class="gt" id="alp-g-t">'+esc(u.seoTitle)+'</div><div class="gu" id="alp-g-u">https://'+esc(alp_short(u.slug))+'</div><div class="gd" id="alp-g-d">'+esc(u.seoDesc)+'</div></div></section>'+
    '<section class="card p20"><label class="label" for="alp-camp">Connect to campaign</label><select id="alp-camp" class="input" data-change="alp-campaign" data-testid="alp-campaign">'+
      '<option value="">No campaign yet</option>'+DB.campaigns.map(function(c){ return '<option'+(c===u.campaign?' selected':'')+'>'+esc(c)+'</option>'; }).join('')+'</select>'+
      '<div id="alp-utm">'+alp_utmBlock(u)+'</div></section>'+
    '<section class="card p20"><button class="row between" style="width:100%;background:none;border:0;padding:0;cursor:pointer;font:inherit;color:var(--ink);text-align:left" data-act="alp-custom" aria-expanded="'+(u.custom?'true':'false')+'">'+
      '<span><span class="h3" style="font-size:15px">Custom code instead</span><br><span class="xs muted">Paste HTML from an open-source landing template</span></span>'+ico(u.custom?'up':'down',18)+'</button>'+
      (u.custom ? '<textarea class="input alp-code mt12" rows="7" data-input="alp-code" placeholder="&lt;section class=&quot;hero&quot;&gt; … &lt;/section&gt;" aria-label="Custom HTML">'+esc(u.code)+'</textarea>'+
        '<div class="alp-warn mt8">'+ico('shield',15)+'<span>Checked for speed and safety before it goes live. Scripts from unknown sites are removed; your order form and tracking are added automatically.</span></div>' : '')+
    '</section>'
  );
}
/* success */
function alp_success(u){
  var lp = alp_page(u.done); if(!lp) return '';
  var link = alp_utm(lp.slug, lp.campaign);
  return '<section class="card p24" style="max-width:720px" data-testid="alp-success"><div class="row top" style="gap:16px"><span class="alp-okc">'+ico('check',30)+'</span><div class="grow">'+
    '<div class="eyebrow" style="color:var(--brand)">Live now</div><h2 class="h2" style="margin-top:4px">Your landing page is live</h2>'+
    '<div class="small text2 mt8">'+esc(lp.title)+'</div>'+
    '<div class="row wrap mt12" style="gap:8px">'+alp_urlChip(lp)+alp_status(lp.status)+(lp.ai?'<span class="tag plain">'+ico('spark',12)+'AI-written</span>':'')+'</div>'+
    (link ? '<div class="soft p16 mt16"><div class="xs bold mb8">Tracking link · '+esc(lp.campaign)+'</div><code class="alp-code" style="word-break:break-all">'+esc(link)+'</code><div class="mt8"><button class="btn btn-sm btn-secondary" data-act="alp-copy-text" data-text="'+esc(link)+'" data-msg="Tracking link copied">Copy tracking link</button></div></div>' : '<div class="xs muted mt12">Tip: connect a campaign later to count orders per ad.</div>')+
    '<div class="row wrap mt24" style="gap:10px"><a class="btn btn-primary" href="#/l/'+esc(lp.slug)+'" data-testid="alp-open">'+ico('eye',16)+'Open landing page</a><button class="btn btn-ghost" data-act="alp-back-list" data-testid="alp-back">Back to list</button><button class="link" data-act="alp-create">Create another</button></div>'+
    '</div></div></section>';
}

/* ---------- wizard actions ---------- */
ACT['alp-step'] = function(el){ var u = alp_u(), n = +el.getAttribute('data-n'); if(n<=u.max){ u.step = n; if(n>=4) alp_fill(u); render(); } };
ACT['alp-prev'] = function(){ var u = alp_u(); if(u.step>1){ u.step--; render(); } };
ACT['alp-next'] = function(){
  var u = alp_u(); if(!alp_valid(u, u.step)) return;
  u.step = Math.min(5, u.step+1); u.max = Math.max(u.max, u.step);
  if(u.step>=4) alp_fill(u);
  render();
};
ACT['alp-cat'] = function(el){
  var u = alp_u(), id = el.getAttribute('data-id'); if(u.cat!==id){ u.cat = id; u.product = null; u.template = null; u.max = 1; u.hEdited = false; u.slugEdited = false; u.seoEdited = false; }
  rerender();
};
ACT['alp-prod'] = function(el){
  var u = alp_u(), id = el.getAttribute('data-id');
  if(u.product!==id){
    u.product = id; u.template = null; u.max = 2; u.hEdited = false; u.slugEdited = false; u.seoEdited = false; u.hVar = 0;
    var o = alp_offers(P(id)); u.offer = o.length>3 ? o[1].id : 'none';
  }
  rerender();
};
ACT['alp-tpl'] = function(el){ var u = alp_u(); u.template = el.getAttribute('data-id'); rerender(); };
ACT['alp-ai'] = function(){ var u = alp_u(); if(!alp_aiOn()) return; u.ai = !u.ai; if(!u.ai && u.media==='ai') u.media = 'mine'; if(!u.hEdited) u.sub = alp_sub(u); rerender(); toast(u.ai ? 'AI will write this page' : 'You\'ll fill the text yourself'); };
CHANGE['alp-offer'] = function(el){ var u = alp_u(); u.offer = el.value; alp_fill(u); rerender(); };
CHANGE['alp-media'] = function(el){ var u = alp_u(); u.media = el.value; rerender(); };
ACT['alp-upload'] = function(){ toast('Demo: in the full build this opens your photos'); };
ACT['alp-rewrite'] = function(){ var u = alp_u(); u.hVar = (u.hVar+1)%3; u.headline = alp_headline(u, u.hVar); u.hEdited = false; rerender(); };
INPUT['alp-text'] = function(el){
  var u = alp_u(), k = el.getAttribute('data-k'); u[k] = el.value; u.hEdited = true;
  var t = document.getElementById(k==='headline' ? 'alp-pv-h' : 'alp-pv-s'); if(t) t.textContent = el.value || (k==='headline' ? 'Your headline' : '');
  var nx = document.getElementById('alp-next'); if(nx) nx.disabled = !alp_valid(u, u.step);
  var h = document.getElementById('alp-hint'); if(h) h.textContent = alp_valid(u, u.step) ? '' : ALP_HINT[u.step];
};
function alp_cleanSlug(v, typing){
  var s = String(v||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[\s_]+/g,'-').replace(/[^a-z0-9-]/g,'').replace(/-{2,}/g,'-');
  if(!typing) s = s.replace(/^-+|-+$/g,'');
  return s.slice(0, 40);
}
function alp_patchSlug(u){
  var set = function(id, html){ var e = document.getElementById(id); if(e) e.innerHTML = html; };
  set('alp-slug-pv', esc(alp_short(u.slug)));
  set('alp-slug-warn', alp_slugWarn(u));
  set('alp-utm', alp_utmBlock(u));
  set('alp-pv-url', esc(alp_short(u.slug)));
  set('alp-g-u', 'https://'+esc(alp_short(u.slug)));
  var nx = document.getElementById('alp-next'); if(nx) nx.disabled = !alp_valid(u, 5);
  var h = document.getElementById('alp-hint'); if(h) h.textContent = alp_valid(u, 5) ? '' : ALP_HINT[5];
}
INPUT['alp-slug'] = function(el){ var u = alp_u(); u.slug = alp_cleanSlug(el.value, true).replace(/^-+/,''); u.slugEdited = true; alp_patchSlug(u); };
CHANGE['alp-slug-done'] = function(el){ var u = alp_u(); u.slug = alp_cleanSlug(el.value, false); el.value = u.slug; alp_patchSlug(u); };
ACT['alp-copy-slug'] = function(){ var u = alp_u(); alp_copy('https://'+alp_short(u.slug)); toast('Link copied: '+alp_short(u.slug)); };
INPUT['alp-seo'] = function(el){
  var u = alp_u(), k = el.getAttribute('data-k'); u[k] = el.value; u.seoEdited = true;
  var isT = k==='seoTitle';
  var c = document.getElementById(isT ? 'alp-cnt-t' : 'alp-cnt-d'); if(c) c.innerHTML = alp_cnt(el.value.length, isT ? 60 : 155);
  var g = document.getElementById(isT ? 'alp-g-t' : 'alp-g-d'); if(g) g.textContent = el.value;
};
CHANGE['alp-campaign'] = function(el){ var u = alp_u(); u.campaign = el.value; var b = document.getElementById('alp-utm'); if(b) b.innerHTML = alp_utmBlock(u); };
ACT['alp-custom'] = function(){ var u = alp_u(); u.custom = !u.custom; rerender(); };
INPUT['alp-code'] = function(el){ alp_u().code = el.value; };
ACT['alp-back-list'] = function(){ delete UI['lpnew']; go('#/admin/landing'); };

/* ---------- generate & publish (demo progress) ---------- */
function alp_pubSteps(u){
  var custom = u.custom && String(u.code).trim();
  var first = custom ? 'Checking your code for safety' : (u.ai && alp_aiOn() ? 'Writing copy' : 'Filling your text into the template');
  return [[first+'…', first], ['Building sections…', 'Building sections'], ['Running speed check…', 'Speed check passed']];
}
function alp_pubHTML(){
  var u = alp_u(), steps = alp_pubSteps(u);
  return '<div class="stack s16" data-testid="alp-progress"><div class="small text2">Publishing <b>'+esc(alp_short(u.slug))+'</b></div>'+
    '<div class="alp-pst">'+steps.map(function(s, i){
      var n = i+1, st = n<u.pphase ? 'done' : (n===u.pphase ? 'now' : '');
      return '<div class="alp-ps '+st+'"><span class="alp-psd">'+(st==='done'?ico('check',14):'')+'</span><span>'+esc(st==='done' ? s[1] : s[0])+'</span></div>';
    }).join('')+'</div>'+
    '<div class="xs muted">Mobile speed, image sizes and the order form are checked before the page goes live.</div></div>';
}
ACT['alp-publish'] = function(){
  var u = alp_u(); if(u.publishing || !alp_valid(u, 5)) return;
  u.publishing = true; u.pphase = 1;
  openModal(alp_pubHTML(), {title:'Generate & publish', rebuild:alp_pubHTML, alpPub:true});
  [1,2,3].forEach(function(i){
    setTimeout(function(){
      if(UI['lpnew']!==u) return;
      u.pphase = i+1;
      if(MODAL && MODAL.opts && MODAL.opts.alpPub) refreshModal();
      if(i===3) setTimeout(function(){ alp_finishPublish(u); }, 450);
    }, i*650);
  });
};
function alp_finishPublish(u){
  if(UI['lpnew']!==u || u.done) return;
  if(alp_slugTaken(u.slug)) u.slug = alp_slugCap(u.slug, 37)+'-'+(ST.landingPages.length+1);
  var lp = {id:'lp-'+Date.now(), slug:u.slug, product:u.product, template:u.template, cat:u.cat, title:String(u.headline).trim(), visits:0, orders:0,
    campaign:u.campaign || '', status:'Live', ai:!!(u.ai && alp_aiOn()), created:'Today',
    sub:u.sub, offer:u.offer, media:u.media, seoTitle:u.seoTitle, seoDesc:u.seoDesc, customCode:!!(u.custom && String(u.code).trim())};
  ST.landingPages.push(lp); saveState();
  u.done = lp.id; u.publishing = false;
  if(MODAL && MODAL.opts && MODAL.opts.alpPub) closeModal();
  if(CUR.page==='admin-landing-new') render();
  toast('Your landing page is live');
}
