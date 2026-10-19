/* =====================================================================
   89b-admin-agents.js — জ্ঞানী Gyani · AI 360 additions + the seven agents
   #/admin/ai?tab=models|caps|routing|costbook  (PR 580, 309, 310, 312–314)
   AI-off proof card on the control room (PR 506)
   #/admin/agents            team, org chart, chief (PR 583), Telegram (PR 584)
   #/admin/agents/<id>       360° profile (PR 577), editable by the owner,
                             curriculum (PR 579), reports + appraisal (PR 578),
                             Tirondaj's ads guardrails (PR 581)
   DEMO ONLY — all numbers marked "simulated" are made up for the review;
   the work log, lessons, skills and curriculum come from the real agents/
   library (embedded at build time as ZA_LIB at the end of this file).
   Nothing is sent to Telegram or any AI company.
   ===================================================================== */
(function(){
  var add = function(re, name){ try{ if(!ROUTES.some(function(r){ return r[1]===name; })) ROUTES.push([re, name]); }catch(e){} };
  add(/^\/admin\/agents$/, 'admin-agents');
  add(/^\/admin\/agents\/([\w-]+)$/, 'admin-agent');
})();

var ZA_CODE = {gyani:'A360-01', prohori:'A360-02', bhandari:'A360-03', sawdagor:'A360-04', shilpi:'A360-05', doot:'A360-06', tirondaj:'A360-07'};
var ZA_ORDER = ['gyani','prohori','bhandari','sawdagor','shilpi','doot','tirondaj'];
var ZA_TG_ICON = {gyani:'🧠', prohori:'🛡️', bhandari:'📦', sawdagor:'🛒', shilpi:'🎨', doot:'📣', tirondaj:'🏹'};
var ZA_SHORT = {gyani:'Chief', prohori:'Foundation', bhandari:'Warehouse', sawdagor:'Shop', shilpi:'Design', doot:'Marketing', tirondaj:'Ads'};
var ZA_AVCOLS = ['#2E4A62','#7A5A2E','#1F4E46','#8A3D5A','#2A7AB0','#5B4A8A','#A0522D','#3B3B3B'];
function za_lib(id){ return (typeof ZA_LIB!=='undefined' && ZA_LIB.agents && ZA_LIB.agents[id]) || {role:'', owns:'', never:'', plan:[], has:[], learning:[], profileLog:[], log:[], lessons:[], ext:[], cur:{}, guard:[]}; }
function za_ensure(){
  if(!ST.za) ST.za = {};
  var z = ST.za;
  ['prof','models','caps','routing','rating','warn'].forEach(function(k){ if(!z[k]) z[k] = {}; });
  if(!z.tg) z.tg = [];
  if(!z.inv) z.inv = [];
  return z;
}
function za_prof(id){
  if(!ST) return null;
  var z = za_ensure(), a = zs_agent(id) || {};
  if(!z.prof[id]) z.prof[id] = {name:'', photo:'', avatar:'', bio:'', joined:'2026-10-19', verified:false, rewards:[], tasks:[]};
  return z.prof[id];
}
function za_name(id){ var p = za_prof(id), a = zs_agent(id); return (p && p.name) || (a ? a.en : id); }
function za_code(id){ return ZA_CODE[id] || ''; }
function za_star(id){ var p = za_prof(id); return p && p.verified ? '<span class="za-verified" title="Verified by the owner" aria-label="Verified">'+ico('check',11)+'</span>' : ''; }
function za_chief(){ return '<span class="tag gold" style="white-space:nowrap">Chief · প্রধান এজেন্ট</span>'; }
function za_fmtDate(s){ try{ var d = new Date(s+'T00:00:00'); return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}); }catch(e){ return s; } }
function za_today(){ var d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

/* =====================================================================
   A. AI 360 CONTROL ROOM — tabs
   ===================================================================== */
function za_aiTabs(tab){
  var t = [['room','Control room'],['models','Model picks · free models'],['caps','Spend caps'],['routing','Data routing'],['costbook','Cost book']];
  return '<div class="za-tabs" role="tablist">'+t.map(function(x){ return '<a class="chip'+(tab===x[0]?' on':'')+'" role="tab" aria-selected="'+(tab===x[0])+'" href="#/admin/ai'+(x[0]==='room'?'':'?tab='+x[0])+'">'+esc(x[1])+'</a>'; }).join('')+
    '<a class="chip" href="#/admin/agents">'+ico('user',13)+' The seven agents</a></div>';
}
function za_aiTab(tab){
  if(tab==='models') return za_modelsTab();
  if(tab==='caps') return za_capsTab();
  if(tab==='routing') return za_routingTab();
  if(tab==='costbook') return za_costbookTab();
  return '';
}

/* ---------- AI-off proof (PR 506) ---------- */
var ZA_OFF_STEPS = ['Switching AI off on a test copy of the shop','New customer orders a polo (Cash on Delivery)','Returning customer asks for a size exchange','You confirm an order and print the invoice','A WhatsApp question gets the auto-reply + team inbox','Size finder, delivery band and fraud score run on rules'];
function za_offProof(){
  var z = za_ensure(), p = z.offProof;
  return '<section class="card p20 mt16"><div class="row between wrap" style="gap:10px"><div style="min-width:0"><div class="row wrap" style="gap:8px"><h2 class="h2">Proof: the shop works with AI off</h2>'+zs_pr('506')+'</div>'+
    '<div class="small text2 mt8 za-bn">সব AI বন্ধ করে পুরো দোকান চালিয়ে দেখা হয় — অর্ডার, এক্সচেঞ্জ, ইনভয়েস, সাপোর্ট সব ঠিক চলে কিনা।</div>'+
    '<div class="xs muted mt8">'+(p ? 'Last proven '+esc(zs_time(p))+' · 6 of 6 journeys passed · 0 errors' : 'Not run in this demo yet')+'</div></div>'+
    '<button type="button" class="btn btn-secondary" data-act="za-off-run">'+ico('play',14)+'Run the AI-off test</button></div></section>';
}
function za_offHTML(){
  var u = UI['za-off']; if(!u) return '';
  if(u.phase>ZA_OFF_STEPS.length) return '<div class="stack s16" style="text-align:center"><span class="zs-okc">'+ico('check',26)+'</span><div class="h2">6 of 6 passed with AI off</div><div class="small text2 za-bn">AI বন্ধ থাকলেও দোকান পুরোপুরি চলে। প্রতিটা এজেন্টের নিজের "fallback" কাজ করেছে।</div><div class="xs muted">Simulated for the demo.</div><button type="button" class="btn btn-primary btn-block" data-act="close-modal">Done</button></div>';
  return '<div class="stack s16">'+zs_steps(ZA_OFF_STEPS, u.phase)+zs_bar((u.phase-1)/ZA_OFF_STEPS.length*100)+'</div>';
}
ACT['za-off-run'] = function(){ UI['za-off'] = {phase:1}; openModal(za_offHTML(), {title:'AI-off test', rebuild:za_offHTML, zsKey:'za-off'}); zs_runSteps('za-off', ZA_OFF_STEPS, 500, function(){ za_ensure().offProof = Date.now(); saveState(); rerender(); }); };

/* ---------- B. Model picks with free-model qualification (PR 580) ---------- */
var ZA_MODELS = [
  {m:'Claude Opus 5.5', p:'anthropic', cap:97, c:24, cls:'paid'},
  {m:'Claude Sonnet 5.5', p:'anthropic', cap:94, c:9, cls:'paid'},
  {m:'Claude Haiku 5.5', p:'anthropic', cap:87, c:3, cls:'paid'},
  {m:'GPT-5', p:'openai', cap:96, c:20, cls:'paid'},
  {m:'GPT-5 mini', p:'openai', cap:88, c:2.5, cls:'paid'},
  {m:'Gemini 2.5 Pro', p:'google', cap:94, c:12, cls:'paid'},
  {m:'Gemini 2.5 Flash', p:'google', cap:86, c:0, cls:'freecloud', free:'free tier'},
  {m:'Llama 3.3 70B', p:'local', cap:85, c:0, cls:'own', free:'own server'},
  {m:'Qwen 2.5 32B', p:'local', cap:83, c:0, cls:'own', free:'own server'}
];
var ZA_MCLASS = {paid:'Paid API (no training on your data)', freecloud:'Free cloud tier (may learn from data)', own:'Your own server'};
var ZA_DCLASS = [['public','Public','ক্যাটালগ, ব্লগ — সবাই দেখে'],['business','Business','বিক্রি, খরচ, রিপোর্ট'],['personal','Customer personal','নাম, ফোন, ঠিকানা'],['secret','Payment & secrets','পেমেন্ট, কী — কখনও বাইরে যায় না']];
var ZA_JOBX = [
  {id:'audit', name:'Site audit run', what:'Walks the checklist on every screen', owner:'prohori', model:'Claude Sonnet 5.5'},
  {id:'diag', name:'Server alert diagnosis', what:'Explains a server alert and proposes a fix', owner:'prohori', model:'Claude Sonnet 5.5'},
  {id:'design', name:'Design review of screenshots', what:'Checks pages against the AUTO ADJUST rules', owner:'shilpi', model:'Claude Opus 5.5'},
  {id:'ads', name:'Ad campaign optimiser', what:'Reads campaign numbers and suggests changes', owner:'tirondaj', model:'Claude Opus 5.5'},
  {id:'chief', name:'Chief investigations', what:'Finds why something went wrong and who owns it', owner:'gyani', model:'Claude Opus 5.5'}
];
var ZA_JOBMETA = {
  support:{owner:'gyani', d:.7, s:1, runs:3000, dc:'personal'}, size:{owner:'bhandari', d:.4, s:3, runs:30, dc:'business'}, address:{owner:'bhandari', d:.3, s:.3, runs:900, dc:'personal'},
  reviews:{owner:'doot', d:.25, s:.3, runs:120, dc:'personal'}, seo:{owner:'doot', d:.5, s:1.5, runs:40, dc:'public'}, blog:{owner:'doot', d:.8, s:6, runs:8, dc:'public'},
  research:{owner:'doot', d:.5, s:5, runs:4, dc:'public'}, notes:{owner:'gyani', d:.3, s:.8, runs:600, dc:'personal'}, report:{owner:'gyani', d:.55, s:2, runs:30, dc:'business'},
  fraud:{owner:'gyani', d:.6, s:.5, runs:900, dc:'personal'}, landing:{owner:'tirondaj', d:.65, s:4, runs:6, dc:'public'}, twosize:{owner:'sawdagor', d:.35, s:.8, runs:60, dc:'personal'},
  audit:{d:.45, s:8, runs:4, dc:'public'}, diag:{d:.6, s:2, runs:10, dc:'business'}, design:{d:.7, s:3, runs:20, dc:'public'}, ads:{d:.75, s:2, runs:120, dc:'business'}, chief:{d:.9, s:4, runs:60, dc:'business'}
};
var ZA_ROUTE_DEF = {public:{paid:'allow', freecloud:'allow', own:'allow'}, business:{paid:'allow', freecloud:'block', own:'allow'}, personal:{paid:'mask', freecloud:'block', own:'allow'}, secret:{paid:'block', freecloud:'block', own:'block'}};
function za_route(dc, mc){ var z = za_ensure(), r = z.routing[dc] && z.routing[dc][mc]; return r || ZA_ROUTE_DEF[dc][mc]; }
function za_jobs(){
  var z = za_ensure();
  var list = ST.ai.agents.map(function(g){ var m = ZA_JOBMETA[g.id] || {owner:'gyani', d:.5, s:1, runs:30, dc:'business'}; return {id:g.id, name:g.name, what:g.what, owner:m.owner, model:g.model, real:g}; });
  ZA_JOBX.forEach(function(x){ list.push({id:x.id, name:x.name, what:x.what, owner:x.owner, model:(z.models[x.id] && z.models[x.id].model) || x.model}); });
  list.forEach(function(j){ var m = ZA_JOBMETA[j.id] || {}; j.d = m.d||.5; j.s = m.s||1; j.runs = m.runs||30; var jm = z.models[j.id] || {}; j.dc = jm.dc || m.dc || 'business'; j.bar = jm.bar || 95; j.tested = jm.tested || (Date.now() - (2 + zs_hash(j.id)%5)*86400000); j.seed = jm.seed || 1; });
  return list;
}
function za_M(name){ for(var i=0;i<ZA_MODELS.length;i++) if(ZA_MODELS[i].m===name) return ZA_MODELS[i]; return {m:name, p:'anthropic', cap:90, c:9, cls:'paid'}; }
function za_runCost(j, M){ return M.c * j.s / 30; }
function za_per100(j, M){ return za_runCost(j, M) * 100; }
function za_qual(j){
  var f = 0.15 + 1.6*Math.pow(j.d, 1.5);
  var cands = ZA_MODELS.map(function(M){
    var sc = 100 - (100-M.cap)*f + (zs_rnd(j.id+'|'+M.m+'|'+j.seed)-0.5)*2.4;
    sc = Math.max(40, Math.min(99.5, sc));
    var rt = za_route(j.dc, M.cls);
    return {M:M, score:Math.round(sc*10)/10, route:rt, blocked:rt==='block', per100:za_per100(j, M)};
  });
  var best = Math.max.apply(null, cands.filter(function(c){ return !c.blocked; }).map(function(c){ return c.score; }).concat([0]));
  var bar = Math.round(best * j.bar) / 100;
  cands.forEach(function(c){ c.pass = !c.blocked && c.score >= bar; });
  var ok = cands.filter(function(c){ return c.pass; }).sort(function(a,b){ return a.per100 - b.per100 || b.score - a.score; });
  var sug = ok[0] || null, cur = cands.filter(function(c){ return c.M.m===j.model; })[0] || {M:za_M(j.model), score:0, pass:false, per100:za_per100(j, za_M(j.model))};
  var saving = sug ? Math.max(0, (cur.per100 - sug.per100) * j.runs / 100) : 0;
  return {cands:cands, best:best, bar:bar, sug:sug, cur:cur, saving:saving};
}
function za_freeTag(M){ return M.free ? ' <span class="za-free">FREE</span>' : ''; }
function za_jobCard(j){
  var q = za_qual(j), ag = zs_agent(j.owner), same = q.sug && q.sug.M.m===j.model, open = !!UI['za-job:'+j.id];
  var why = !q.sug ? 'No model passes this job\'s bar with today\'s data routing.' :
    same ? 'Keep '+q.cur.M.m+' — it is already the cheapest model that passes the quality bar.' :
    'For this job use <b>'+esc(q.sug.M.m)+'</b>'+za_freeTag(q.sug.M)+' — because it scores '+q.sug.score+' (bar '+q.bar.toFixed(1)+' = '+j.bar+'% of the best, '+q.best+'), so quality stays the same, and it costs '+fmt(q.sug.per100)+' per 100 runs instead of '+fmt(q.cur.per100)+'.'+(q.cur.pass?'':' Your current model does not pass the bar.')+((function(){ var pv = aai_prov(q.sug.M.p); return pv && !pv.connected ? ' <span class="zs-mini">('+esc(pv.name)+' is not connected yet — connect it in the Control room; until then the job keeps its current model.)</span>' : ''; })());
  var rows = '<div class="za-cand"><span>Model</span><span class="q">Quality</span><span class="c">৳ / 100 runs</span></div>'+
    q.cands.slice().sort(function(a,b){ return b.score - a.score; }).map(function(c){
      var cls = (c.pass?'':' fail')+(c.M.m===j.model?' cur':'')+(q.sug && c.M.m===q.sug.M.m && !same?' sug':'');
      var note = c.blocked ? 'Blocked by data routing ('+ZA_DCLASS.filter(function(d){ return d[0]===j.dc; })[0][1]+' data → '+ZA_MCLASS[c.M.cls]+')' : c.route==='mask' ? 'Allowed with masking (names and phones hidden first)' : '';
      return '<div class="za-cand'+cls+'"><span class="nm">'+esc(c.M.m)+za_freeTag(c.M)+(c.M.m===j.model?' <span class="zs-mini">· current</span>':'')+'</span>'+
        '<span class="q">'+(c.blocked?'—':c.score.toFixed(1))+'<span class="za-pass '+(c.pass?'y':'n')+'">'+(c.blocked?'':c.pass?'pass':'fail')+'</span></span><span class="c">'+(c.M.c? fmt(c.per100) : '৳ 0')+'</span>'+(note?'<span class="why">'+esc(note)+'</span>':'')+'</div>';
    }).join('');
  var opts = q.cands.filter(function(c){ return !c.blocked; }).map(function(c){ return '<option value="'+esc(c.M.m)+'"'+(c.M.m===j.model?' selected':'')+'>'+esc(c.M.m)+(c.M.free?' (FREE)':'')+(c.pass?'':' — fails bar')+'</option>'; }).join('');
  return '<article class="card za-job" data-testid="za-job-'+j.id+'"><div class="za-job-h"><div style="min-width:0"><div class="h3" style="font-size:15.5px">'+esc(j.name)+'</div><div class="zs-mini" style="margin-top:2px">'+esc(j.what)+'</div></div>'+
      '<span class="row" style="gap:6px">'+zs_av(ag)+'<span class="zs-mini">'+esc(za_name(ag.id))+'<br>'+esc(za_code(ag.id))+'</span></span></div>'+
    '<div class="row wrap mt12" style="gap:6px 14px;font-size:13px"><span>Now: <b>'+esc(j.model)+'</b>'+za_freeTag(za_M(j.model))+'</span><span>Suggested: <b>'+(q.sug?esc(q.sug.M.m):'—')+'</b>'+(q.sug?za_freeTag(q.sug.M):'')+'</span><span class="zs-mini">Tested '+esc(zs_time(j.tested))+'</span></div>'+
    '<div class="za-sug'+(same||!q.sug?' same':'')+'">'+ico('spark',16,'style="flex-shrink:0;margin-top:2px;color:var(--brand)"')+'<div>'+why+(q.saving>0?'<div class="small bold mt8">Saves about '+fmt(q.saving)+' a month if accepted ('+j.runs.toLocaleString('en-US')+' runs / month).</div>':'')+'</div></div>'+
    '<div class="zs-actions mt12">'+(q.sug && !same ? '<button type="button" class="btn btn-sm btn-primary" data-act="za-accept" data-id="'+j.id+'">'+ico('check',14)+'Accept</button>' : '')+
      '<label class="row" style="gap:6px;flex:1 1 200px;min-width:0"><span class="zs-mini">Or pick</span><select class="input zs-in" style="min-width:0;flex:1" data-change="za-pick" data-id="'+j.id+'" aria-label="Pick a model for '+esc(j.name)+'">'+opts+'</select></label>'+
      '<button type="button" class="btn btn-sm btn-ghost" data-act="za-retest" data-id="'+j.id+'">'+ico('swap',14)+'Re-test now</button>'+
      '<button type="button" class="btn btn-sm btn-ghost" data-act="za-job-open" data-id="'+j.id+'" aria-expanded="'+open+'">'+ico(open?'up':'down',14)+(open?'Hide scores':'All scores')+'</button></div>'+
    (open ? '<div class="row wrap mt12" style="gap:8px"><span class="zs-mini">Quality bar</span>'+[90,95,98].map(function(b){ return '<button type="button" class="chip'+(j.bar===b?' on':'')+'" data-act="za-bar" data-id="'+j.id+'" data-v="'+b+'">'+b+'% of best</button>'; }).join('')+'</div><div class="za-cands">'+rows+'</div>' : '')+
  '</article>';
}
function za_modelsTab(){
  var jobs = za_jobs(), tot = 0, n = 0;
  jobs.forEach(function(j){ var q = za_qual(j); if(q.sug && q.sug.M.m!==j.model){ tot += q.saving; n++; } });
  return '<div class="zs-page">'+
    '<div class="zs-note mb16">'+ico('spark',17)+'<div class="zs-bnp"><b>প্রতিটা কাজের জন্য সিস্টেম নিজে মডেল সাজেস্ট করে (PR 580)।</b> প্রতিটা কাজের একটা ছোট টেস্ট সেট আছে — পেইড আর ফ্রি সব মডেল সেই টেস্ট দেয়। যে সবচেয়ে সস্তা মডেল মানের সীমা (সেরা মডেলের ৯৫%) পার করে, সেটাই সাজেশন। তাই খরচ কমে শুধু তখনই যখন মান একই থাকে — মান কমিয়ে কখনও না। ফ্রি মডেল <span class="za-free">FREE</span> দিয়ে চেনানো।</div></div>'+
    '<div class="zs-kpis k4"><div class="zs-k"><div class="v">'+jobs.length+'</div><div class="l">Agent jobs</div><div class="s">each with its own test set</div></div>'+
      '<div class="zs-k '+(n?'warn':'ok')+'"><div class="v">'+n+'</div><div class="l">Better picks waiting</div><div class="s">same quality, lower cost</div></div>'+
      '<div class="zs-k ok"><div class="v">'+fmt(tot)+'</div><div class="l">Monthly saving</div><div class="s">if you accept all</div></div>'+
      '<div class="zs-k"><div class="v">'+ZA_MODELS.filter(function(m){ return m.free; }).length+'</div><div class="l">Free models in the pool</div><div class="s">qualified like paid ones</div></div></div>'+
    '<div class="zs-actions mb16">'+(n?'<button type="button" class="btn btn-primary" data-act="za-accept-all">'+ico('check',15)+'Accept all '+n+' suggestions</button>':'')+'<button type="button" class="btn btn-secondary" data-act="za-retest-all">'+ico('swap',15)+'Re-test all</button>'+zs_simTag('Scores simulated')+'</div>'+
    '<div class="zs-g2">'+jobs.map(za_jobCard).join('')+'</div></div>';
}
function za_jobSet(id, model){
  var z = za_ensure(), g = aai_agent(id);
  if(g){ g.model = model; var M = za_M(model); g.provider = M.p; }
  else { z.models[id] = z.models[id] || {}; z.models[id].model = model; }
}
ACT['za-accept'] = function(el){ var id = el.getAttribute('data-id'), j = za_jobs().filter(function(x){ return x.id===id; })[0]; if(!j) return; var q = za_qual(j); if(!q.sug) return; za_jobSet(id, q.sug.M.m); saveState(); rerender(); toast(j.name+' now uses '+q.sug.M.m+(q.saving?' — saves '+fmt(q.saving)+' a month':'')); };
ACT['za-accept-all'] = function(){ var n = 0, t = 0; za_jobs().forEach(function(j){ var q = za_qual(j); if(q.sug && q.sug.M.m!==j.model){ za_jobSet(j.id, q.sug.M.m); n++; t += q.saving; } }); saveState(); rerender(); toast(n+' jobs switched — about '+fmt(t)+' saved a month, same quality'); };
CHANGE['za-pick'] = function(el){ var id = el.getAttribute('data-id'); za_jobSet(id, el.value); saveState(); rerender(); toast('Model changed to '+el.value); };
ACT['za-job-open'] = function(el){ var k = 'za-job:'+el.getAttribute('data-id'); UI[k] = !UI[k]; rerender(); };
ACT['za-bar'] = function(el){ var z = za_ensure(), id = el.getAttribute('data-id'); z.models[id] = z.models[id] || {}; z.models[id].bar = +el.getAttribute('data-v'); saveState(); rerender(); toast('Quality bar: '+el.getAttribute('data-v')+'% of the best model'); };
function za_retest(id){ var z = za_ensure(); z.models[id] = z.models[id] || {}; z.models[id].seed = (z.models[id].seed || 1) + 1; z.models[id].tested = Date.now(); }
ACT['za-retest'] = function(el){
  var id = el.getAttribute('data-id'); el.disabled = true; el.innerHTML = ico('swap',14)+'Testing…';
  setTimeout(function(){ za_retest(id); saveState(); rerender(); toast('Re-tested on the job\'s test set — scores updated'); }, 900);
};
ACT['za-retest-all'] = function(el){ el.disabled = true; el.innerHTML = ico('swap',15)+'Testing all…'; setTimeout(function(){ za_jobs().forEach(function(j){ za_retest(j.id); }); saveState(); rerender(); toast('All jobs re-tested (demo)'); }, 1200); };

/* ---------- C. Spend caps per agent (PR 309) ---------- */
var ZA_CAP_DEF = {gyani:[1500,820], prohori:[300,120], bhandari:[400,335], sawdagor:[200,60], shilpi:[300,140], doot:[900,610], tirondaj:[500,505]};
function za_cap(id){ var z = za_ensure(); if(!z.caps[id]){ var d = ZA_CAP_DEF[id] || [300,0]; z.caps[id] = {cap:d[0], used:d[1], cheaper:true}; } return z.caps[id]; }
function za_capState(c){ var p = c.cap ? c.used/c.cap*100 : 100; return p>=100 ? 'bad' : p>=80 ? 'warn' : 'ok'; }
function za_capsTab(){
  var rows = ZA_ORDER.map(function(id){
    var a = zs_agent(id), c = za_cap(id), p = Math.round(c.cap ? c.used/c.cap*100 : 100), st = za_capState(c);
    var msg = st==='bad' ? 'Paused at 100% — its fallback is running. Raise the cap or wait for the 1st.' : st==='warn' ? 'Over 80% — Telegram warning sent'+(c.cheaper?'; switched to its cheapest model that still passes the quality bar':'')+'.' : 'Within budget.';
    return '<div class="zs-card"><div class="row between top" style="gap:10px"><span class="row" style="gap:10px;min-width:0">'+zs_av(a)+'<span style="min-width:0"><span class="small bold">'+esc(za_name(id))+' · '+esc(a.bn)+'</span><span class="zs-mini" style="display:block">'+esc(za_code(id))+' · '+esc(ZA_SHORT[id])+'</span></span></span>'+
      '<span class="zs-st '+(st==='bad'?'open':st==='warn'?'proposed':'fixed')+'">'+(st==='bad'?'Paused':st==='warn'?'Warning':'OK')+'</span></div>'+
      '<div class="row between mt12 small"><span><b>'+fmt(c.used)+'</b> of '+fmt(c.cap)+'</span><span class="zs-mini">'+p+'%</span></div><div class="mt8">'+zs_bar(p, st==='bad'?'bad':st==='warn'?'warn':'')+'</div>'+
      '<div class="zs-mini mt8">'+esc(msg)+'</div>'+
      '<div class="row wrap mt12" style="gap:8px"><label class="row" style="gap:6px"><span class="zs-mini">Cap ৳</span><input class="input zs-in" style="width:96px" type="number" inputmode="numeric" min="0" step="50" value="'+c.cap+'" data-change="za-cap" data-id="'+id+'" aria-label="'+esc(a.en)+' monthly cap"></label>'+
        '<button type="button" class="btn btn-sm btn-ghost" data-act="za-spend" data-id="'+id+'">+৳50 test spend</button></div>'+
      '<div class="zs-row mt8" style="padding-bottom:0"><span class="zs-mini">At 80%: switch to a cheaper model only if it passes the bar</span>'+zs_sw(c.cheaper, 'za-cheaper', 'Cheaper model at 80%', 'data-id="'+id+'"')+'</div></div>';
  }).join('');
  return '<div class="zs-page"><div class="zs-note mb16">'+ico('wallet',17)+'<div class="zs-bnp"><b>প্রতিটা এজেন্টের মাসিক খরচের সীমা (PR 309)।</b> ৮০% হলে টেলিগ্রামে সতর্কবার্তা যায়; ১০০% হলে এজেন্ট থেমে যায় আর তার সাধারণ (AI ছাড়া) পথ চলে — দোকান থামে না। উপরের মোট মাসিক সীমা সবসময় জেতে।</div></div>'+
    '<div class="zs-actions mb16">'+zs_simTag('Spend simulated')+'<button type="button" class="btn btn-sm btn-ghost" data-act="za-cap-reset">Start a new month (demo)</button></div>'+
    '<div class="zs-g3">'+rows+'</div></div>';
}
CHANGE['za-cap'] = function(el){ var c = za_cap(el.getAttribute('data-id')), n = parseInt(el.value, 10); if(isNaN(n) || n<0) return; c.cap = n; saveState(); rerender(); toast('Cap saved — '+fmt(n)+' a month'); };
ACT['za-spend'] = function(el){ var id = el.getAttribute('data-id'), c = za_cap(id), before = za_capState(c); c.used += 50; var after = za_capState(c); saveState(); rerender();
  toast(after!==before ? (after==='bad' ? za_name(id)+' reached 100% — paused, fallback running' : za_name(id)+' passed 80% — Telegram warning sent (demo)') : '+৳50 spent by '+za_name(id)); };
ACT['za-cheaper'] = function(el){ var c = za_cap(el.getAttribute('data-id')); c.cheaper = !c.cheaper; saveState(); rerender(); };
ACT['za-cap-reset'] = function(){ ZA_ORDER.forEach(function(id){ za_cap(id).used = 0; }); saveState(); rerender(); toast('New month — every agent back to ৳0'); };

/* ---------- D. Data routing (PR 310 / 311) ---------- */
function za_routingTab(){
  var cls = ['paid','freecloud','own'], lab = {allow:'Allowed', mask:'Masked', block:'Blocked'};
  var mx = '<div style="overflow-x:auto;overscroll-behavior-x:contain"><table class="za-mx"><thead><tr><th>Data</th>'+cls.map(function(c){ return '<th>'+esc({paid:'Paid API', freecloud:'Free cloud', own:'Own server'}[c])+'</th>'; }).join('')+'</tr></thead><tbody>'+
    ZA_DCLASS.map(function(d){ return '<tr><td><b>'+esc(d[1])+'</b><div class="zs-mini za-bn">'+esc(d[2])+'</div></td>'+cls.map(function(c){ var v = za_route(d[0], c), lock = d[0]==='secret';
      return '<td><button type="button" class="za-cell '+v+'" data-act="za-route" data-d="'+d[0]+'" data-c="'+c+'"'+(lock?' disabled':'')+' aria-label="'+esc(d[1])+' to '+esc(c)+': '+lab[v]+'">'+(lock?ico('lock',11)+' ':'')+lab[v]+'</button></td>'; }).join('')+'</tr>'; }).join('')+'</tbody></table></div>';
  var jobs = za_jobs().map(function(j){ return '<div class="zs-li"><div style="min-width:0"><div class="t">'+esc(j.name)+'</div><div class="m">'+esc(za_name(j.owner))+' · '+esc(j.model)+'</div></div><div class="r"><select class="input zs-in" data-change="za-dc" data-id="'+j.id+'" aria-label="Data class for '+esc(j.name)+'">'+ZA_DCLASS.filter(function(d){ return d[0]!=='secret'; }).map(function(d){ return '<option value="'+d[0]+'"'+(j.dc===d[0]?' selected':'')+'>'+esc(d[1])+' data</option>'; }).join('')+'</select></div></div>'; }).join('');
  return '<div class="zs-page"><div class="zs-note mb16">'+ico('shield',17)+'<div class="zs-bnp"><b>কোন ধরনের তথ্য কোন মডেলে যেতে পারবে (PR 310)।</b> ঘরে চাপ দিলে বদলায়: Allowed → Masked (নাম-ফোন লুকিয়ে, PR 311) → Blocked। পেমেন্ট আর গোপন কী কখনও বাইরে যায় না — এটা বদলানো যায় না। এখানে বদলালে "Model picks"-এর সাজেশনও সাথে সাথে বদলায়।</div></div>'+
    '<div class="zs-g2"><section class="zs-card"><h2>Who may see what</h2><div class="zs-sub">Rows = kind of data · columns = kind of model</div>'+mx+'</section>'+
    '<section class="zs-card"><h2>Each job\'s data</h2><div class="zs-sub za-bn">প্রতিটা কাজ কোন ধরনের তথ্য পড়ে।</div><div class="zs-list">'+jobs+'</div></section></div></div>';
}
ACT['za-route'] = function(el){ var d = el.getAttribute('data-d'), c = el.getAttribute('data-c'); if(d==='secret') return; var z = za_ensure(), cur = za_route(d, c), nx = {allow:'mask', mask:'block', block:'allow'}[cur];
  z.routing[d] = z.routing[d] || {}; z.routing[d][c] = nx; saveState(); rerender(); toast(d+' data → '+c+': '+nx); };
CHANGE['za-dc'] = function(el){ var z = za_ensure(), id = el.getAttribute('data-id'); z.models[id] = z.models[id] || {}; z.models[id].dc = el.value; saveState(); rerender(); toast('Data class saved — suggestions updated'); };

/* ---------- E. Cost book (PR 312 / 313 / 314) ---------- */
var ZA_BOOK = [
  ['gyani','Answer a WhatsApp question','support',1],['gyani','Answer a site-chat question','support',.8],['gyani','Summarise a chat into a customer note','notes',1],['gyani','Write the 10 pm report comment','report',1],
  ['gyani','Fraud signal check on an order','fraud',1],['gyani','Chief: investigate a drop in sales','chief',1],['gyani','Chief: weekly agent review','chief',.6],['gyani','Translate a reply to Bengali','support',.4],
  ['prohori','Site audit (one group, one screen)','audit',.25],['prohori','Full site audit (all groups)','audit',1],['prohori','Explain a server alert','diag',1],['prohori','Write a deploy note','diag',.5],
  ['bhandari','Read a free-text address','address',1],['bhandari','Tune Find-my-size from reviews','size',1],['bhandari','Courier entry check','address',.8],['bhandari','Draft a product size chart','size',.6],
  ['sawdagor','Two-size follow-up chat','twosize',1],['sawdagor','Combo suggestion for a bag','twosize',.7],['sawdagor','Checkout drop-off note','report',.5],
  ['shilpi','Design review of one page','design',1],['shilpi','Compare two layouts','design',.7],['shilpi','Write Bengali picture labels','design',.3],
  ['doot','Product title + description','seo',1],['doot','Meta title + description','seo',.4],['doot','Blog post (800 words)','blog',1],['doot','Competitor price check','research',1],['doot','Review screening','reviews',1],['doot','Social caption (EN + BN)','seo',.5],
  ['tirondaj','Daily campaign check','ads',1],['tirondaj','Budget suggestion with reason','ads',.6],['tirondaj','Ad copy set (3 versions)','landing',.5],['tirondaj','Landing page draft','landing',1],['tirondaj','Weekly ads report','ads',2]
];
function za_book(){
  var z = za_ensure(), jobs = za_jobs(), jm = {}; jobs.forEach(function(j){ jm[j.id] = j; });
  if(!z.book) z.book = {};
  return ZA_BOOK.map(function(r, i){
    var j = jm[r[2]], key = 'b'+i, model = z.book[key] || (j ? j.model : 'Claude Sonnet 5.5'), M = za_M(model);
    var est = M.c * (j ? j.s : 1) * r[3] / 30, act = est * (0.85 + zs_rnd(key+model)*0.42), runs = Math.max(1, Math.round((j ? j.runs : 10) * (r[3]<1 ? 0.4 : 1)));
    return {key:key, owner:r[0], name:r[1], job:j, model:model, M:M, est:est, act:act, runs:runs, month:act*runs};
  });
}
function za_costbookTab(){
  var rows = za_book(), total = rows.reduce(function(s,r){ return s + r.month; }, 0), q = UI['za-bq'] || '';
  var html = rows.map(function(r){
    var off = r.est ? (r.act - r.est)/r.est*100 : 0, ag = zs_agent(r.owner);
    var jq = r.job ? za_qual(r.job) : null;
    var opts = ZA_MODELS.filter(function(M){ return !r.job || za_route(r.job.dc, M.cls)!=='block'; }).map(function(M){ return '<option value="'+esc(M.m)+'"'+(M.m===r.model?' selected':'')+'>'+esc(M.m)+(M.free?' (FREE)':'')+'</option>'; }).join('');
    return '<div class="za-cbr" data-s="'+esc((r.name+' '+ag.en+' '+ag.bn+' '+r.model).toLowerCase())+'"><div style="min-width:0"><div class="n">'+esc(r.name)+'</div><div class="m">'+esc(za_name(r.owner))+' · '+esc(za_code(r.owner))+' · '+r.runs.toLocaleString('en-US')+' runs / month</div></div>'+
      '<div class="sel"><select class="input" data-change="za-book" data-k="'+r.key+'" aria-label="Model for '+esc(r.name)+'">'+opts+'</select>'+(r.M.free?'<span class="za-free">FREE</span>':'')+'</div>'+
      '<div class="v"><b>'+fmt(r.month)+'</b>/mo<div class="zs-mini">est '+(r.est<1? '৳'+r.est.toFixed(2) : fmt(r.est))+' · actual '+(r.act<1? '৳'+r.act.toFixed(2) : fmt(r.act))+(Math.abs(off)>15?' <span style="color:var(--warn)">('+(off>0?'+':'')+Math.round(off)+'% → estimate corrected)</span>':'')+'</div></div></div>';
  }).join('');
  return '<div class="zs-page"><div class="zs-note mb16">'+ico('doc',17)+'<div class="zs-bnp"><b>খরচের খাতা (PR 312)।</b> প্রতিটা কাজের আনুমানিক আর আসল খরচ পাশাপাশি; অনুমান ভুল হলে সিস্টেম নিজে ঠিক করে নেয় (PR 313)। তিনটা প্রিসেট (PR 314) এক চাপে সব কাজের মডেল বদলায় — Balanced মানে মান ঠিক রেখে সবচেয়ে সস্তা।</div></div>'+
    '<div class="zs-kpis k4"><div class="zs-k"><div class="v">'+rows.length+'</div><div class="l">Job rows</div></div><div class="zs-k"><div class="v">'+fmt(total)+'</div><div class="l">This month (est.)</div></div><div class="zs-k"><div class="v">'+fmt(ST.ai.monthlyCap)+'</div><div class="l">Monthly AI cap</div></div><div class="zs-k '+(total>ST.ai.monthlyCap?'bad':'ok')+'"><div class="v">'+Math.round(total/Math.max(1,ST.ai.monthlyCap)*100)+'%</div><div class="l">Of the cap</div></div></div>'+
    '<div class="zs-sbar"><div class="zs-search">'+ico('search',17)+'<input class="input zs-in" type="search" placeholder="Search jobs — e.g. WhatsApp, blog, audit, Tirondaj" value="'+esc(q)+'" data-input="za-bq" aria-label="Search the cost book"></div>'+
      '<div class="zs-chipset">'+[['economy','Economy'],['balanced','Balanced'],['premium','Premium']].map(function(p){ return '<button type="button" class="chip" data-act="za-preset" data-v="'+p[0]+'">'+p[1]+'</button>'; }).join('')+'</div></div>'+
    '<section class="zs-card"><div class="za-cb" id="za-cb">'+html+'</div><div class="zs-empty zs-nores" id="za-cb-none">No job matches.</div></section></div>';
}
function za_bookFilter(q){ q = String(q||'').toLowerCase().trim(); var n = 0; document.querySelectorAll('#za-cb .za-cbr').forEach(function(r){ var hit = !q || r.getAttribute('data-s').indexOf(q)>=0; r.style.display = hit?'':'none'; if(hit) n++; }); var e = document.getElementById('za-cb-none'); if(e) e.style.display = n?'none':'block'; }
INPUT['za-bq'] = function(el){ UI['za-bq'] = el.value; za_bookFilter(el.value); };
CHANGE['za-book'] = function(el){ var z = za_ensure(); if(!z.book) z.book = {}; z.book[el.getAttribute('data-k')] = el.value; saveState(); rerender(); setTimeout(function(){ za_bookFilter(UI['za-bq']||''); }, 0); toast('Model changed for this job'); };
ACT['za-preset'] = function(el){
  var v = el.getAttribute('data-v'), z = za_ensure(); z.book = {};
  za_book().forEach(function(r){ if(!r.job) return; var j = Object.assign({}, r.job);
    if(v==='premium'){ var best = za_qual(j).cands.filter(function(c){ return !c.blocked; }).sort(function(a,b){ return b.score-a.score; })[0]; if(best) z.book[r.key] = best.M.m; }
    else { j.bar = v==='economy' ? 90 : 95; var q = za_qual(j); if(q.sug) z.book[r.key] = q.sug.M.m; } });
  saveState(); rerender(); toast(v.charAt(0).toUpperCase()+v.slice(1)+' preset applied to every row');
};
PAGES['admin-ai'] && (function(){ var o = PAGES['admin-ai'].after; PAGES['admin-ai'].after = function(p, q){ if(o) o(p, q); if(q && q.tab==='costbook') za_bookFilter(UI['za-bq']||''); }; })();

/* =====================================================================
   F. THE SEVEN AGENTS — team page (org chart, chief, Telegram)
   ===================================================================== */
function za_kpi(id){
  /* the profile's "Work log" bullets and worklog/<id>.log describe the same tasks — count the longer list, not both */
  var L = za_lib(id), done = Math.max(L.log.filter(function(l){ return !/in progress/i.test(l); }).length, L.profileLog.filter(function(l){ return !/in progress/i.test(l); }).length);
  var prog = Math.max(L.profileLog.filter(function(l){ return /in progress/i.test(l); }).length, L.log.filter(function(l){ return /in progress/i.test(l); }).length);
  var tasks = za_prof(id).tasks, open = tasks.filter(function(t){ return t.st!=='done'; }).length, tdone = tasks.filter(function(t){ return t.st==='done'; }).length;
  var ownerBugs = L.lessons.length, selfBugs = 2 + zs_hash(id)%6;
  var ftr = Math.round(72 + zs_rnd(id+'ftr')*20), rework = zs_hash(id+'rw')%4;
  var c = za_cap(id), tasksAll = Math.max(1, done + tdone);
  return {done:done + tdone, prog:prog, open:open, ownerBugs:ownerBugs, selfBugs:selfBugs, ftr:ftr, rework:rework, cost:c.used, perTask:c.used/tasksAll, ext:L.ext.length, has:L.has.length, warn:(za_ensure().warn[id]||[]).length, rewards:za_prof(id).rewards.length};
}
function za_orgChart(){
  var node = function(id){ var a = zs_agent(id); return '<a class="za-org-n" href="#/admin/agents/'+id+'">'+zs_av(a)+'<span class="nm">'+esc(za_name(id))+za_star(id)+'<small>'+esc(za_code(id))+' · '+esc(ZA_SHORT[id])+'</small></span></a>'; };
  return '<section class="zs-card"><div class="row between"><h2>Chain of command</h2>'+zs_pr('583')+'</div><div class="zs-sub za-bn">মালিক → জ্ঞানী (প্রধান এজেন্ট) → বাকি ছয়জন। প্রধান কাজ ভাগ করে দেয়, খোঁজ নেয়, রিভিউ করে — টাকা বা ফেরত না-যাওয়া কিছুতে আপনার অনুমতি লাগে।</div>'+
    '<div class="za-org"><div class="za-org-top"><div class="za-org-n owner"><span class="av" style="background:var(--ink)">'+ico('user',16)+'</span><span class="nm">You · Owner<small>মালিক</small></span></div></div><div class="za-org-line"></div>'+
    '<div class="za-org-top">'+node('gyani')+'</div><div class="za-org-line"></div>'+
    '<div class="za-org-row">'+ZA_ORDER.slice(1).map(node).join('')+'</div></div></section>';
}
function za_card(id){
  var a = zs_agent(id), k = za_kpi(id), p = za_prof(id);
  return '<a class="za-agc" href="#/admin/agents/'+id+'" data-testid="za-card-'+id+'"><div class="row between top" style="gap:10px"><span class="row" style="gap:12px;min-width:0">'+zs_av(a, 'za-av')+'<span style="min-width:0"><span class="h3" style="font-size:16px;display:flex;align-items:center;gap:5px">'+esc(za_name(id))+za_star(id)+'</span><span class="za-bn small text2">'+esc(a.bn)+'</span></span></span><span class="zs-pr">'+esc(za_code(id))+'</span></div>'+
    (id==='gyani'?'<div>'+za_chief()+'</div>':'')+
    '<div class="small text2">'+esc(a.role)+'</div>'+
    '<div class="za-chips"><span>'+plural(k.done,'task')+' done</span><span>'+k.open+' assigned</span><span>'+(k.ext+k.has)+' skills</span><span>Level: none yet</span>'+(k.rewards?'<span>'+k.rewards+' reward'+(k.rewards===1?'':'s')+'</span>':'')+'</div>'+
    '<div class="row between zs-mini"><span>Cost this month '+fmt(k.cost)+' <span class="zs-sim" style="padding:0 6px">sim</span></span><span>'+ico('right',14)+'</span></div></a>';
}
var ZA_ASK = [
  {q:'এই মাসে সেল কম কেন?', find:[['অর্ডার গত মাসের একই সময়ের চেয়ে ১৮% কম (৪১২ বনাম ৫০৩)।','Orders report, 1–19 Oct vs 1–19 Sep'],['১১–১৩ অক্টোবর ৩ দিন ফেসবুক অ্যাডের খরচ বন্ধ ছিল — ওই ৩ দিনে অর্ডার ৬১% কম।','Ads spend log (Meta) · Tirondaj'],['সবচেয়ে বেশি বিকোয় এমন ২টা পোলো (Essential Piqué Polo — Navy, White) M আর L সাইজে ৬ দিন স্টক শূন্য ছিল।','Stock history · Bhandari']],
    resp:[['tirondaj','ad spend paused 3 days (card limit, no alert)'],['bhandari','stock-out of top 2 polos (reorder point not set)']],
    fix:[['tirondaj','Add a "spend stopped" alert to Telegram and a backup payment card'],['bhandari','Set reorder points for the top 10 styles']]},
  {q:'আজ কুরিয়ার এন্ট্রি ভুল হলো কেন?', find:[['আজ ৯টা অর্ডারের মধ্যে ৪টা ভুল জোনে বুক হয়েছে — সবগুলো "Savar" ঠিকানা।','Courier bookings today · Bhandari'],['"Savar" দুই জায়গায় আছে এলাকার তালিকায়: ঢাকা সাব-এরিয়া আর জেলার বাইরে।','data/BD-AREA-MASTER.csv'],['ঠিকানা-পাঠক (Address Reader) "নিশ্চিত না" বললেও অর্ডারে ফ্ল্যাগ বসেনি।','Order flags log · Sawdagor']],
    resp:[['bhandari','duplicate "Savar" row in the area list'],['sawdagor','unsure address did not raise the "Address check" flag']],
    fix:[['bhandari','Merge the two Savar rows and re-run the 62 test addresses'],['sawdagor','Raise the flag whenever the band is unsure']]},
  {q:'ক্যাটাগরি পেজে এই বাগ কেন?', find:[['৩২০ পিক্সেল চওড়া ফোনে ক্যাটাগরি পেজের ফিল্টার বার পাশে সরে যায় (horizontal scroll)।','Site audit L01 · 320×640 · Prohori'],['১৯ অক্টোবর নতুন "All colours" লাইন যোগ হওয়ার পর থেকে শুরু।','Work log · Shilpi · r12-cat.css'],['লাইনটা নিজে ছোট না হয়ে পুরো সারি চওড়া করে দিচ্ছে — AUTO ADJUST নিয়ম ভাঙা।','Lessons: AUTO ADJUST (R14)']],
    resp:[['shilpi','the new colour line does not step down on small phones']],
    fix:[['shilpi','Make the line step down (full → short → icon) and run the 15-size device gate']]}
];
function za_tgId(id){ var a = zs_agent(id); return ZA_TG_ICON[id]+' '+za_name(id)+' '+a.bn+' · '+za_code(id)+' · '+ZA_SHORT[id]; }
var ZA_PERMS = [
  ['research','Research and analysis','খোঁজ নেওয়া, বিশ্লেষণ','free'],['reports','Reports','রিপোর্ট তৈরি','free'],['assign','Assigning tasks to agents','এজেন্টদের কাজ ভাগ করা','free'],['review','Reviewing agents\' work','কাজ রিভিউ করা','free'],['warn','Warnings to agents (written into their appraisal)','এজেন্টকে সতর্ক করা — অ্যাপ্রেইজালে লেখা থাকে','free'],
  ['money','Moving money or refunds','টাকা পাঠানো বা ফেরত','owner'],['cod','Changing the COD amount on an order','অর্ডারের ক্যাশ অন ডেলিভারি টাকা বদলানো','owner'],['price','Prices or discounts','দাম বা ছাড়','owner'],['adbudget','Ad budget increases','অ্যাড বাজেট বাড়ানো','owner'],['block','Blocking anyone','কাউকে ব্লক করা','owner'],['delete','Deleting data','ডেটা মুছে ফেলা','owner'],['irrev','Anything that cannot be undone','যা আর ফেরানো যায় না','owner']
];
function za_perm(k){ var z = za_ensure(); if(!z.perm) z.perm = {}; if(z.perm[k]) return z.perm[k]; var d = ZA_PERMS.filter(function(p){ return p[0]===k; })[0]; return d ? d[3] : 'owner'; }
PAGES['admin-agents'] = { layout:'admin', title:'Agents', render:function(p, query){
  za_ensure();
  var tab = (query && query.tab) || 'team';
  var tabs = '<div class="zs-tabs" role="tablist">'+[['team','Team · '+ZA_ORDER.length+' agents'],['chief','Ask the chief'],['telegram','Telegram']].map(function(t){ return '<a class="chip'+(tab===t[0]?' on':'')+'" href="#/admin/agents'+(t[0]==='team'?'':'?tab='+t[0])+'" role="tab" aria-selected="'+(tab===t[0])+'">'+esc(t[1])+'</a>'; }).join('')+'</div>';
  var body = tab==='chief' ? za_chiefTab() : tab==='telegram' ? za_tgTab() : (za_orgChart()+'<div class="za-ag-grid mt24">'+ZA_ORDER.map(za_card).join('')+'</div>');
  return '<div class="zs-page">'+zs_head('Admin · AI 360 '+zs_pr('577–584'), 'The seven agents', 'সাত এজেন্ট — প্রত্যেকের প্রোফাইল, কাজ, পড়াশোনা আর রিপোর্ট',
    'একই সাতজন এজেন্ট কোড বানায় আর পরে লাইভ ড্যাশবোর্ড চালায় — নতুন করে শেখাতে হয় না। প্রোফাইলে চাপ দিলে তার পুরো ৩৬০° তথ্য, কাজের লগ, পরীক্ষা আর রিপোর্ট দেখবেন। ছবি, নাম, পুরস্কার, কাজ — আপনি বদলাতে পারেন।', zs_simTag('Costs & KPIs simulated'))+tabs+body+'</div>';
}};

/* ---------- chief (PR 583) ---------- */
function za_answerHTML(a){
  return '<div class="za-ans za-bn"><div class="row" style="gap:8px">'+zs_av(zs_agent('gyani'))+'<span class="small bold">'+esc(za_name('gyani'))+' · জ্ঞানী · A360-01</span></div>'+
    '<div class="h3 mt12" style="font-size:15px">যা পেলাম (প্রমাণসহ)</div><ol class="za-find">'+a.find.map(function(f){ return '<li>'+esc(f[0])+'<span class="zs-mini" style="display:block">'+ico('doc',11,'style="vertical-align:-1px"')+' প্রমাণ: '+esc(f[1])+'</span></li>'; }).join('')+'</ol>'+
    '<div class="h3 mt12" style="font-size:15px">দায়ী</div><div class="stack s8">'+a.resp.map(function(r){ var g = zs_agent(r[0]); return '<div class="row" style="gap:8px">'+zs_av(g)+'<span class="small"><b>'+esc(za_name(r[0]))+' '+esc(za_code(r[0]))+'</b> — '+esc(r[1])+'</span></div>'; }).join('')+'</div>'+
    '<div class="h3 mt12" style="font-size:15px">সমাধান দেওয়া হয়েছে → অবস্থা</div><div class="stack s8">'+a.fix.map(function(f){ var t = za_findTask(f[0], f[1]); return '<div class="row between wrap" style="gap:8px"><span class="small"><b>'+esc(za_name(f[0]))+'</b>: '+esc(f[1])+'</span><span class="zs-st '+(t && t.st==='done'?'fixed':t && t.st==='doing'?'approved':'proposed')+'">'+(t ? za_stLabel(t.st) : 'assigned')+'</span></div>'; }).join('')+'</div>'+
    '<div class="zs-actions mt12">'+a.resp.map(function(r){ return '<button type="button" class="btn btn-sm btn-ghost" data-act="za-warn" data-id="'+r[0]+'" data-why="'+esc(r[1])+'">'+ico('info',13)+'Warn '+esc(za_name(r[0]))+' (goes to appraisal)</button>'; }).join('')+'</div></div>';
}
function za_findTask(id, title){ return za_prof(id).tasks.filter(function(t){ return t.title===title; })[0] || null; }
function za_stLabel(s){ return {todo:'To do', doing:'In progress', done:'Done'}[s] || s; }
function za_addTask(id, title, due, src){
  var p = za_prof(id); if(za_findTask(id, title)) return za_findTask(id, title);
  var d = due || (function(){ var x = new Date(Date.now()+2*86400000); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); })();
  var t = {id:'T'+Date.now().toString(36)+Math.floor(Math.random()*99), title:title, due:d, st:'todo', src:src||'Owner', at:Date.now()}; p.tasks.unshift(t); return t;
}
function za_chiefTab(){
  var z = za_ensure(), cur = UI['za-ask'];
  var inv = z.inv.length ? z.inv.map(function(v, i){ return '<div class="zs-li"><div style="min-width:0"><div class="t za-bn">'+esc(v.q)+'</div><div class="m">'+esc(zs_time(v.at))+' · responsible: '+v.resp.map(function(r){ return esc(za_name(r[0])+' '+za_code(r[0])); }).join(', ')+'</div></div><div class="r"><span class="zs-st '+(v.closed?'fixed':'proposed')+'">'+(v.closed?'Closed':'Open')+'</span><button type="button" class="btn btn-sm btn-ghost" data-act="za-inv-open" data-i="'+i+'">Open</button>'+(v.closed?'':'<button type="button" class="btn btn-sm btn-ghost" data-act="za-inv-close" data-i="'+i+'">Close</button>')+'</div></div>'; }).join('') : '<div class="zs-empty">No investigations yet — ask the chief a question.</div>';
  var perms = ['free','owner'].map(function(g){ return '<div class="mt12"><div class="small bold">'+(g==='free'?'The chief may do alone':'Needs your approval')+'</div>'+
    ZA_PERMS.filter(function(p){ return za_perm(p[0])===g; }).map(function(p){ var free = za_perm(p[0])==='free';
      return '<div class="zs-row"><div class="grow"><div class="small">'+esc(p[1])+'</div><div class="zs-mini za-bn">'+esc(p[2])+'</div></div><button type="button" class="chip'+(free?' on':'')+'" data-act="za-perm" data-k="'+p[0]+'">'+(free?'Free':'Ask me')+'</button></div>'; }).join('')+'</div>'; }).join('');
  return '<div class="zs-g2"><div class="stack s16">'+
    '<section class="zs-card"><div class="row between"><h2>Ask the chief</h2>'+zs_pr('583')+'</div><div class="zs-sub za-bn">জ্ঞানী (প্রধান এজেন্ট) খুঁজে বের করবে কী হয়েছে, প্রমাণসহ, কে দায়ী — আর ঠিক করার কাজ সেই এজেন্টকে দিয়ে দেবে।</div>'+
      '<form data-submit="za-ask" class="row" style="gap:8px"><input class="input zs-in grow" name="q" placeholder="প্রশ্ন লিখুন…" aria-label="Ask the chief" style="min-width:0"><button class="btn btn-primary">'+ico('spark',15)+'Ask</button></form>'+
      '<div class="zs-chipset mt12">'+ZA_ASK.map(function(a, i){ return '<button type="button" class="chip za-bn" data-act="za-ask-s" data-i="'+i+'">'+esc(a.q)+'</button>'; }).join('')+'</div>'+
      (cur!=null ? '<div class="mt16" id="za-ans">'+(cur.loading ? zs_steps(['Reading orders, stock, ads and logs','Comparing with last month','Finding who owns it'], cur.phase||1) : za_answerHTML(cur.a))+'</div>' : '')+
    '</section>'+
    '<section class="zs-card"><h2>Open investigations</h2><div class="zs-sub za-bn">যেসব খোঁজ চলছে।</div><div class="zs-list">'+inv+'</div></section></div>'+
    '<section class="zs-card"><div class="row between"><h2>What the chief may do</h2>'+zs_pr('583 · 318')+'</div><div class="zs-sub za-bn">চাপ দিয়ে বদলান। কোড এটা মেনে চলে — প্রধানসহ সব এজেন্টের জন্য।</div>'+perms+
      '<div class="zs-note mt12">'+ico('shield',16)+'<div class="zs-bnp">"Ask me" ঘরের কাজ করতে চাইলে টেলিগ্রামে Approve / Reject / Ask why বাটন আসবে।</div></div></section></div>';
}
function za_doAsk(a){
  var u = UI['za-ask'] = {loading:true, phase:1, a:a}, tok = u.tok = Date.now(); rerender();
  [1,2,3].forEach(function(i){ setTimeout(function(){ if(UI['za-ask']!==u || u.tok!==tok) return; u.phase = i+1;
    if(i===3){ u.loading = false; var z = za_ensure(); a.fix.forEach(function(f){ za_addTask(f[0], f[1], null, 'Chief (Gyani)'); }); z.inv.unshift({q:a.q, at:Date.now(), resp:a.resp, fix:a.fix, find:a.find, closed:false}); z.inv = z.inv.slice(0, 12); saveState(); toast('Chief assigned '+a.fix.length+' fix'+(a.fix.length===1?'':'es')); }
    rerender(); }, i*500); });
}
ACT['za-ask-s'] = function(el){ za_doAsk(ZA_ASK[+el.getAttribute('data-i')]); };
SUBMIT['za-ask'] = function(f){
  var q = (f.querySelector('[name=q]').value || '').trim(); if(!q){ toast('Type a question first'); return; }
  var r = za_routeText(q), who = r.id==='gyani' ? 'gyani' : r.id;
  za_doAsk({q:q, find:[['আপনার প্রশ্ন অনুযায়ী অর্ডার, স্টক, অ্যাড আর কাজের লগ মিলিয়ে দেখা হয়েছে।','Demo answer — the live chief reads the real data'],['গত ৭ দিনের সাথে তুলনায় বড় কোন পরিবর্তন পাওয়া গেছে '+za_name(who)+'-এর এলাকায়।','Usage ledger + work log']], resp:[[who, 'owns this area ('+ZA_SHORT[who]+')']], fix:[[who, 'Look into: '+q.slice(0,60)]]});
};
ACT['za-inv-open'] = function(el){ var v = za_ensure().inv[+el.getAttribute('data-i')]; if(!v) return; openModal(za_answerHTML(v), {title:'Investigation', wide:true}); };
ACT['za-inv-close'] = function(el){ var v = za_ensure().inv[+el.getAttribute('data-i')]; if(!v) return; v.closed = true; saveState(); rerender(); toast('Investigation closed'); };
ACT['za-perm'] = function(el){ var z = za_ensure(), k = el.getAttribute('data-k'), nx = za_perm(k)==='free' ? 'owner' : 'free'; z.perm[k] = nx; saveState(); rerender();
  toast(nx==='free' ? 'The chief may now do this alone' : 'This now needs your approval'); };
ACT['za-warn'] = function(el){ var z = za_ensure(), id = el.getAttribute('data-id'); z.warn[id] = z.warn[id] || []; z.warn[id].unshift({at:Date.now(), why:el.getAttribute('data-why'), by:'Gyani (chief)'}); saveState(); if(MODAL) closeModal(); rerender(); toast('Warning written into '+za_name(id)+'\'s appraisal'); };

/* ---------- Telegram (PR 584) ---------- */
var ZA_ROUTE_KW = [[/courier|কুরিয়ার|stock|স্টক|invoice|ইনভয়েস|address|ঠিকানা/i,'bhandari'],[/\bads?\b|budget|বাজেট|অ্যাড|campaign|ক্যাম্পেইন|facebook|tiktok|youtube|google ads/i,'tirondaj'],[/design|ডিজাইন|layout|look|ছবি|photo/i,'shilpi'],[/checkout|cart|bag|combo|কম্বো|order|অর্ডার|price|দাম/i,'sawdagor'],[/server|backup|ব্যাকআপ|সার্ভার|audit|অডিট|bug|বাগ|speed/i,'prohori'],[/seo|blog|ব্লগ|content|social|crm|review|রিভিউ/i,'doot']];
function za_routeText(txt){
  var m = String(txt).match(/A360-0([1-7])/i); if(m){ var id = ZA_ORDER.filter(function(x){ return za_code(x)==='A360-0'+m[1]; })[0]; if(id) return {id:id, how:'code'}; }
  for(var i=0;i<ZA_ORDER.length;i++){ var a = zs_agent(ZA_ORDER[i]), nm = za_name(a.id);
    if(new RegExp('@?('+a.en+(nm && nm!==a.en ? '|'+nm.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') : '')+')\\b', 'i').test(txt) || txt.indexOf(a.bn)>=0) return {id:a.id, how:'name'}; }
  for(var k=0;k<ZA_ROUTE_KW.length;k++) if(ZA_ROUTE_KW[k][0].test(txt)) return {id:'gyani', via:ZA_ROUTE_KW[k][1], how:'chief'};
  return {id:'gyani', via:'gyani', how:'chief'};
}
function za_tgReply(r, txt){
  var target = r.how==='chief' ? r.via : r.id, approve = /increase|raise|বাড়া|budget up|refund|ফেরত|price|দাম|discount|ছাড়/i.test(txt);
  var out = [];
  if(r.how==='chief') out.push({who:'gyani', text: target==='gyani' ? 'কাজটা পেয়েছি — কারো নাম ছিল না, এটা আমি নিজেই দেখছি।' : 'কাজটা পেয়েছি — কারো নাম ছিল না, তাই আমি ঠিক করলাম কে করবে।\n→ '+za_tgId(target).replace(/^\S+ /,'')+'-কে দিলাম।'});
  var body = target==='tirondaj' ? (approve ? 'Polo Duo · Advantage+ দৈনিক বাজেট ৳১,৫০০ → ৳২,২০০ করতে চাই।\nকারণ: CPA ৳১১৪ (সীমা ৳১৮০), ROAS ৪.২, ৩ দিন স্থির।\nবাজেট বাড়াতে আপনার অনুমতি লাগবে।' : 'আজকের বাজেট রিপোর্ট: খরচ ৳৫,১০০ / ৳৬,০০০ · অর্ডার ৩৪ · CPA ৳১৫০ (সীমা ৳১৮০) · ROAS ৩.১\n১টা ক্যাম্পেইন সীমার উপরে — নিজে থেকে বাজেট ৩০% কমিয়েছি।')
    : target==='bhandari' ? 'কুরিয়ার চেক: আজ ১২টা বুকিং · ১০টা ঠিক · ২টা ঠিকানা যাচাই বাকি (Savar)। ঠিক করে আবার জানাব।'
    : target==='prohori' ? 'সার্ভার ঠিক আছে · CPU ১৮% · শেষ ব্যাকআপ রাত ২টায় OK।'
    : target==='shilpi' ? 'ডিজাইন চেক শুরু করেছি — ১৫টা ফোন সাইজে স্ক্রিনশট নিয়ে জানাব।'
    : target==='sawdagor' ? 'অর্ডার/চেকআউট দেখছি — ফলাফল এক ঘণ্টার মধ্যে।'
    : target==='doot' ? 'কাজটা নিয়েছি — খসড়া তৈরি করে অনুমতির জন্য পাঠাব।'
    : 'কাজটা নিয়েছি। ফলাফল আপনার রিপোর্টে আর এখানে জানাব।';
  if(approve && target!=='tirondaj') body = 'এই কাজে টাকা বা দাম বদলায় — আপনার অনুমতি ছাড়া করা যাবে না।';
  out.push({who:target, text:body, buttons:approve});
  return {target:target, msgs:out};
}
function za_tgTab(){
  var z = za_ensure();
  var log = z.tg.length ? z.tg.map(function(m, i){
    if(m.me) return '<div class="za-tg-me"><div class="za-tg-bme">'+esc(m.text)+'</div></div>';
    return '<div class="zs-tg-b mt8"><div class="zs-tg-h">'+esc(za_tgId(m.who))+'</div>'+esc(m.text)+
      (m.buttons ? '<div class="za-tg-btns">'+(m.answer ? '<span class="zs-mini">You tapped: <b>'+esc(m.answer)+'</b></span>' : ['Approve','Reject','Ask why'].map(function(b){ return '<button type="button" data-act="za-tg-btn" data-i="'+i+'" data-v="'+b+'">'+b+'</button>'; }).join(''))+'</div>' : '')+'</div>';
  }).join('') : '<div class="zs-mini" style="text-align:center;padding:20px">Type a command below, or tap a sample.</div>';
  return '<div class="zs-g2"><section class="zs-card"><div class="row between"><h2>Telegram preview</h2>'+zs_pr('584')+'</div><div class="zs-sub za-bn">বটের প্রতিটা মেসেজ শুরু হয় এজেন্টের পরিচয় দিয়ে। কমান্ডে এজেন্টের নাম বা কোড থাকলে কাজটা সরাসরি তার কাছে যায়; না থাকলে জ্ঞানী ঠিক করে কাকে দেবে।</div>'+
    '<div class="zs-tg za-tg" id="za-tg">'+log+'</div>'+
    '<form data-submit="za-tg" class="row mt12" style="gap:8px"><input class="input zs-in grow" name="t" placeholder="e.g. A360-07 budget report" aria-label="Telegram command" style="min-width:0"><button class="btn btn-primary">Send</button></form>'+
    '<div class="zs-chipset mt12">'+['A360-07 budget report','@Bhandari courier check','A360-07 increase Polo Duo budget','আজকের সেল কত?','Shilpi check the category page on small phones'].map(function(s){ return '<button type="button" class="chip" data-act="za-tg-s" data-t="'+esc(s)+'">'+esc(s)+'</button>'; }).join('')+'</div>'+
    '<div class="zs-actions mt12"><button type="button" class="btn btn-sm btn-ghost" data-act="za-tg-clear">Clear chat</button>'+zs_simTag('Nothing is sent')+'</div></section>'+
    '<section class="zs-card"><h2>Employee codes</h2><div class="zs-sub za-bn">প্রতিটা এজেন্টের নিজের কোড — টেলিগ্রামে কোড লিখলেই কাজ তার কাছে যায়।</div><div class="zs-list">'+ZA_ORDER.map(function(id){ var a = zs_agent(id), open = za_prof(id).tasks.filter(function(t){ return t.st!=='done'; }).length; return '<div class="zs-li"><div style="min-width:0"><div class="t">'+esc(za_tgId(id).replace(/^\S+ /,''))+'</div><div class="m">'+esc(a.role)+'</div></div><div class="r"><span class="zs-mini">'+open+' open</span><a class="btn btn-sm btn-ghost" href="#/admin/agents/'+id+'?tab=overview">Profile</a></div></div>'; }).join('')+'</div></section></div>';
}
function za_tgSend(txt){
  var z = za_ensure(), r = za_routeText(txt), rep = za_tgReply(r, txt);
  z.tg.push({me:true, text:txt});
  za_addTask(rep.target, txt.replace(/^@?\S+\s+/, function(m){ return /A360|@/i.test(m) ? '' : m; }).slice(0, 80) || txt, null, 'Telegram'+(r.how==='chief'?' (routed by Gyani)':''));
  rep.msgs.forEach(function(m){ z.tg.push(m); }); z.tg = z.tg.slice(-30); saveState(); rerender();
  var el = document.getElementById('za-tg'); if(el) el.scrollTop = el.scrollHeight;
  toast('Task assigned to '+za_name(rep.target)+' '+za_code(rep.target)+' — on its profile now');
}
SUBMIT['za-tg'] = function(f){ var t = (f.querySelector('[name=t]').value || '').trim(); if(!t){ toast('Type a command'); return; } za_tgSend(t); };
ACT['za-tg-s'] = function(el){ za_tgSend(el.getAttribute('data-t')); };
ACT['za-tg-clear'] = function(){ za_ensure().tg = []; saveState(); rerender(); };
ACT['za-tg-btn'] = function(el){ var z = za_ensure(), m = z.tg[+el.getAttribute('data-i')]; if(!m) return; var v = el.getAttribute('data-v'); m.answer = v;
  z.tg.push({who:m.who, text: v==='Approve' ? 'অনুমতি পেয়েছি — করে দিলাম। আগের আর পরের অবস্থা লগে রাখা আছে।' : v==='Reject' ? 'ঠিক আছে, কিছু বদলাব না।' : 'কেন: খরচের তুলনায় বিক্রি ভাল, CPA সীমার অনেক নিচে, ৩ দিন ধরে স্থির। বাড়ালে আরও অর্ডার আসার সম্ভাবনা।'});
  if(v==='Approve' && m.who==='tirondaj'){ var t = za_tir(); t.camps.forEach(function(c){ if(c.id==='c1') c.budget = 2200; }); }
  saveState(); rerender(); var el2 = document.getElementById('za-tg'); if(el2) el2.scrollTop = el2.scrollHeight; toast('You tapped '+v); };

/* =====================================================================
   G. ONE AGENT — 360° profile, editable (PR 577), curriculum (579),
      reports (578), Tirondaj ads guardrails (581)
   ===================================================================== */
var ZA_TIR_CUR = {g:['marketing fundamentals for paid media','Meta Ads Manager (campaign, ad set, ad)','Google Ads Search and Shopping','YouTube and TikTok ad formats','tracking basics (pixel, conversions API)'],
  p:['bidding and budget pacing under a CPA cap','creative testing at scale','attribution and COD-aware optimisation (delivered purchase, not order)','audiences and exclusion lists (refused parcels)','Performance Max and Advantage+ with catalogue feeds'],
  d:['incrementality and geo experiments','marketing mix modelling basics','budget allocation across platforms','designing EXTAS\'s ads playbook and report standard']};
function za_curOf(id){ var c = za_lib(id).cur; if(id==='tirondaj' && (!c || !c.g)) return {cur:ZA_TIR_CUR, draft:true}; return {cur:c || {}, draft:false}; }
PAGES['admin-agent'] = { layout:'admin', title:function(p){ var a = zs_agent(p[0]); return a ? za_name(a.id)+' · Agent' : 'Agent'; }, render:function(params, query){
  var id = params[0], a = zs_agent(id); if(!a) return '<div class="zs-empty">No such agent. <a class="link" href="#/admin/agents">Back to the agents</a></div>';
  za_ensure(); var p = za_prof(id), k = za_kpi(id), tab = (query && query.tab) || 'overview';
  var tabs = [['overview','360° overview']].concat(id==='tirondaj'?[['ads','Ads guardrails']]:[]).concat([['skills','Skills'],['study','Curriculum'],['work','Work log'],['kpi','KPIs & cost'],['reports','Reports']]);
  var bar = '<div class="zs-tabs" role="tablist">'+tabs.map(function(t){ return '<a class="chip'+(tab===t[0]?' on':'')+'" role="tab" aria-selected="'+(tab===t[0])+'" href="#/admin/agents/'+id+'?tab='+t[0]+'">'+esc(t[1])+'</a>'; }).join('')+'</div>';
  var body = tab==='ads' && id==='tirondaj' ? za_tirCard() : tab==='skills' ? za_skillsTab(id) : tab==='study' ? za_studyTab(id) : tab==='work' ? za_workTab(id) : tab==='kpi' ? za_kpiTab(id, k) : tab==='reports' ? za_reportsTab(id) : za_overTab(id, k);
  return '<div class="zs-page">'+
    '<div class="row mb16"><a class="link small" href="#/admin/agents">'+ico('back',14)+' All agents</a></div>'+
    '<section class="zs-card mb16"><div class="za-hero">'+zs_av(a, 'za-av big')+'<div style="min-width:0;flex:1 1 240px"><div class="row wrap" style="gap:8px"><h1 class="h1">'+esc(za_name(id))+'</h1>'+za_star(id)+'<span class="zs-pr" style="font-size:12px">'+esc(za_code(id))+'</span>'+(id==='gyani'?za_chief():'')+'</div>'+
      '<div class="za-bn text2" style="font-size:16px">'+esc(a.bn)+' · '+esc(ZA_SHORT[id])+'</div><div class="small text2 mt8">'+esc(p.bio || za_lib(id).role || a.role)+'</div>'+
      '<div class="za-chips mt8"><span>Joined '+esc(za_fmtDate(p.joined))+'</span><span>'+plural(k.done,'task')+' done</span><span>'+k.open+' assigned</span>'+(p.rewards.length?'<span>'+p.rewards.length+' reward'+(p.rewards.length===1?'':'s')+'</span>':'')+(k.warn?'<span style="color:var(--warn)">'+plural(k.warn,'warning')+'</span>':'')+'</div></div>'+
      '<div class="zs-actions"><button type="button" class="btn btn-sm btn-secondary" data-act="za-edit" data-id="'+id+'">'+ico('edit',14)+'Edit profile</button><button type="button" class="btn btn-sm btn-ghost" data-act="za-reward" data-id="'+id+'">'+ico('gift',14)+'Give reward</button><button type="button" class="btn btn-sm btn-ghost" data-act="za-task" data-id="'+id+'">'+ico('plus',14)+'Assign task</button></div></div></section>'+
    bar+body+'</div>';
}};
function za_sect(t, inner, extra){ return '<section class="zs-card"><div class="row between"><h2>'+t+'</h2>'+(extra||'')+'</div>'+inner+'</section>'; }
function za_ul(list){ return list && list.length ? '<ul class="za-log">'+list.map(function(x){ return '<li>'+esc(x)+'</li>'; }).join('')+'</ul>' : '<div class="zs-mini">—</div>'; }
function za_tasksHTML(id){
  var p = za_prof(id);
  if(!p.tasks.length) return '<div class="zs-mini">No assignments yet. Tap "Assign task", or send a Telegram command with its code ('+esc(za_code(id))+').</div>';
  return '<div class="zs-list">'+p.tasks.map(function(t){ var late = t.st!=='done' && t.due < za_today();
    return '<div class="zs-li"><div style="min-width:0"><div class="t">'+esc(t.title)+'</div><div class="m">Due '+esc(za_fmtDate(t.due))+(late?' · <b style="color:var(--sale)">late</b>':'')+' · from '+esc(t.src)+'</div></div><div class="r"><span class="zs-st '+(t.st==='done'?'fixed':t.st==='doing'?'approved':'proposed')+'">'+za_stLabel(t.st)+'</span>'+(t.st!=='done'?'<button type="button" class="btn btn-sm btn-ghost" data-act="za-tstep" data-id="'+id+'" data-t="'+t.id+'">'+(t.st==='todo'?'Start':'Mark done')+'</button>':'')+'</div></div>'; }).join('')+'</div>';
}
function za_rewardsHTML(id){
  var p = za_prof(id), w = za_ensure().warn[id] || [];
  var r = p.rewards.map(function(x){ return '<div class="zs-li"><div style="min-width:0"><div class="t">'+ico('star',13,'style="vertical-align:-2px;color:var(--brand)"')+' '+esc(x.label)+'</div><div class="m">'+esc(zs_time(x.at))+(x.note?' · '+esc(x.note):'')+'</div></div></div>'; }).join('');
  var ws = w.map(function(x){ return '<div class="zs-li"><div style="min-width:0"><div class="t" style="color:var(--warn)">'+ico('info',13,'style="vertical-align:-2px"')+' Warning · '+esc(x.why)+'</div><div class="m">'+esc(zs_time(x.at))+' · by '+esc(x.by)+' · written into the appraisal</div></div></div>'; }).join('');
  return (r||ws) ? '<div class="zs-list">'+r+ws+'</div>' : '<div class="zs-mini">No rewards or warnings yet.</div>';
}
function za_overTab(id, k){
  var L = za_lib(id);
  var doot = id==='doot' ? '<div class="zs-note mb16">'+ico('info',16)+'<div class="zs-bnp">অ্যাড এখন তীরন্দাজের (A360-07) কাজ। দূত রাখে SEO, কনটেন্ট, CRM আর সোশ্যাল।</div></div>' : '';
  return doot+(id==='tirondaj' ? za_tirCard(true)+'<div class="mt16"></div>' : '')+'<div class="zs-g2">'+
    '<div class="stack s16">'+za_sect('Role', '<div class="small">'+esc(L.role)+'</div><div class="h3 mt12" style="font-size:14px">Owns</div><div class="small text2">'+esc(L.owns)+'</div><div class="h3 mt12" style="font-size:14px">Never touches</div><div class="small text2">'+esc(L.never)+'</div>')+
      za_sect('Plan', za_ul(L.plan))+
      za_sect('Assignments', za_tasksHTML(id), '<button type="button" class="btn btn-sm btn-ghost" data-act="za-task" data-id="'+id+'">'+ico('plus',13)+'Assign</button>')+'</div>'+
    '<div class="stack s16">'+za_sect('At a glance', '<div class="zs-kpis" style="margin:0"><div class="zs-k"><div class="v">'+k.done+'</div><div class="l">Tasks done</div></div><div class="zs-k"><div class="v">'+(k.ext+k.has)+'</div><div class="l">Skills</div><div class="s">'+k.has+' own · '+k.ext+' imported</div></div><div class="zs-k"><div class="v">'+k.ftr+'%</div><div class="l">First time right</div><div class="s">simulated</div></div><div class="zs-k"><div class="v">'+fmt(k.cost)+'</div><div class="l">Cost this month</div><div class="s">simulated</div></div><div class="zs-k"><div class="v">'+k.ownerBugs+'</div><div class="l">Owner corrections</div><div class="s">each became a lesson</div></div><div class="zs-k"><div class="v">0 / 3</div><div class="l">Levels earned</div><div class="s">exams pending</div></div></div>')+
      za_sect('Rewards & warnings', za_rewardsHTML(id), '<button type="button" class="btn btn-sm btn-ghost" data-act="za-reward" data-id="'+id+'">'+ico('gift',13)+'Give</button>')+
      za_sect('Latest work', za_ul(L.log.slice(-4).reverse()), '<a class="zs-link" href="#/admin/agents/'+id+'?tab=work">All</a>')+'</div></div>';
}
function za_skillsTab(id){
  var L = za_lib(id);
  return '<div class="zs-g2"><div class="stack s16">'+za_sect('Skills it has', za_ul(L.has))+za_sect('Skills it is learning', za_ul(L.learning))+
    za_sect('Lessons (owner corrections)', '<div class="zs-mini mb8 za-bn">মালিকের প্রতিটা সংশোধন একটা নিয়ম হয়ে যায় — কাজের আগে প্রতিবার পড়ে।</div>'+za_ul(L.lessons.concat(ZA_LIB.allLessons.slice(0,4).map(function(x){ return '(all agents) '+x; }))))+'</div>'+
    za_sect('Imported skills', '<div class="zs-mini mb8">'+L.ext.length+' skills in agents/skills/'+id+'/ext — loaded by description at the start of every task.</div><div class="za-chips">'+L.ext.map(function(x){ return '<span>'+esc(x)+'</span>'; }).join('')+'</div>', '<span class="zs-pr">'+L.ext.length+'</span>')+'</div>';
}
function za_studyTab(id){
  var c = za_curOf(id), lv = [['g','Graduate','foundations'],['p','Post-graduate','advanced practice'],['d','PhD level','research-grade judgement']];
  return '<div class="zs-note mb16">'+ico('doc',16)+'<div class="zs-bnp"><b>পড়াশোনার পথ (PR 579):</b> গ্র্যাজুয়েট → পোস্ট-গ্র্যাজুয়েট → পিএইচডি। প্রতিটা মডিউল স্কিল হয়ে লাইব্রেরিতে যায়; স্যান্ডবক্সে পরীক্ষা (১০–২০টা কাজ, পাস ৮৫%) পাস করলে তবেই লেভেল পাওয়া যায়। এখনও কোন লেভেল পাওয়া হয়নি — নিচে পথটা দেখানো হল।'+(c.draft?' <span class="zs-mini">(Tirondaj\'s syllabus is a draft until CURRICULUM.md has its section.)</span>':'')+'</div></div>'+
    '<div class="za-lvl">'+lv.map(function(l, i){ var mods = c.cur[l[0]] || [];
      return '<div class="za-lv"><div class="za-lv-h"><span class="small bold">'+(i+1)+'. '+l[1]+' <span class="zs-mini">· '+l[2]+'</span></span><span class="zs-st '+(i===0?'proposed':'rejected')+'">'+(i===0?'Studying · exam pending':'Locked until level '+i)+'</span></div>'+
        '<div class="mt8">'+mods.map(function(m){ return '<div class="za-mod"><i></i><span>'+esc(m)+'</span></div>'; }).join('')+'</div>'+
        '<div class="row between mt8 zs-mini"><span>Exam score: —</span><span>Pass mark 85%</span></div></div>'; }).join('')+'</div>';
}
function za_workTab(id){
  var L = za_lib(id), t = za_prof(id).tasks.filter(function(x){ return x.st==='done'; });
  return '<div class="zs-g2">'+za_sect('Work log', '<div class="zs-mini mb8">agents/worklog/'+id+'.log — written by the runner after every task; the agent cannot edit it.</div>'+za_ul(L.log.slice().reverse().concat(t.map(function(x){ return dateStr(x.at)+' · '+x.title+' · done (assigned by '+x.src+')'; }))))+
    za_sect('Profile timeline', za_ul(L.profileLog))+'</div>';
}
function za_kpiTab(id, k){
  var row = function(l, v, s){ return '<div class="zs-row"><div class="grow"><div class="small bold">'+l+'</div>'+(s?'<div class="zs-mini">'+s+'</div>':'')+'</div><b>'+v+'</b></div>'; };
  return '<div class="zs-g2">'+za_sect('Performance', row('Tasks done', k.done, 'work log lines + finished assignments (real)')+row('In progress', k.prog + k.open, 'work log "in progress" + open assignments')+row('First-time-right rate', k.ftr+'%', 'simulated until the live dashboard')+row('Rework count', k.rework, 'simulated')+row('Bugs it found itself', k.selfBugs, 'simulated')+row('Bugs the owner found', k.ownerBugs, 'lessons in its file (real)')+row('Last gate / QA result', 'V11 gate 0 of 240', 'qa/v11-final.json · V12 run pending'), zs_simTag('Partly simulated'))+
    za_sect('Cost', row('This month', fmt(k.cost))+row('Monthly cap', fmt(za_cap(id).cap))+row('Cost per task', fmt(k.perTask))+'<div class="mt8">'+zs_bar(k.cost/Math.max(1,za_cap(id).cap)*100, za_capState(za_cap(id))==='bad'?'bad':za_capState(za_cap(id))==='warn'?'warn':'')+'</div><div class="zs-actions mt12"><a class="btn btn-sm btn-ghost" href="#/admin/ai?tab=caps">Spend caps</a><a class="btn btn-sm btn-ghost" href="#/admin/ai?tab=models">Model picks</a></div>')+'</div>';
}

/* ---------- reports (PR 578, APPRAISAL-TEMPLATE.md) ---------- */
function za_reportsTab(id){
  var kind = UI['za-rk'] || 'daily';
  var ks = [['daily','Daily'],['weekly','Weekly'],['monthly','Monthly'],['yearly','Yearly'],['appraisal','Yearly appraisal']];
  return '<div class="zs-chipset mb16">'+ks.map(function(x){ return '<button type="button" class="chip'+(kind===x[0]?' on':'')+'" data-act="za-rk" data-v="'+x[0]+'">'+x[1]+'</button>'; }).join('')+'</div>'+
    '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+esc(ks.filter(function(x){ return x[0]===kind; })[0][1])+' report · '+esc(za_name(id))+'</h2><span class="row" style="gap:8px">'+zs_simTag('Draft · from 1 day of data')+'<button type="button" class="btn btn-sm btn-ghost" data-act="za-rep-tg" data-id="'+id+'">'+ico('chat',13)+'Send to Telegram</button></span></div>'+
    '<div class="za-rep mt12">'+za_report(id, kind)+'</div></section>';
}
function za_li(list, en){ return list.length ? '<ul>'+list.map(function(x){ return '<li'+(en?' class="en"':'')+'>'+esc(x)+'</li>'; }).join('')+'</ul>' : '<div class="zs-mini">কিছু নেই।</div>'; }
function za_report(id, kind){
  var L = za_lib(id), k = za_kpi(id), p = za_prof(id), a = zs_agent(id), w = za_ensure().warn[id] || [];
  var done = L.log.filter(function(l){ return !/in progress/i.test(l); }), prog = L.profileLog.filter(function(l){ return /in progress/i.test(l); }).concat(L.log.filter(function(l){ return /in progress/i.test(l); }));
  var open = p.tasks.filter(function(t){ return t.st!=='done'; }), tdone = p.tasks.filter(function(t){ return t.st==='done'; });
  var B = zs_bnNum, costDay = Math.round(k.cost/19);
  var needs = [];
  if(id==='tirondaj') za_tir().sugg.filter(function(s){ return s.st==='wait'; }).forEach(function(s){ needs.push('বাজেট বাড়ানোর অনুমতি: '+s.text); });
  open.filter(function(t){ return /approv|অনুমতি/i.test(t.title); }).forEach(function(t){ needs.push(t.title); });
  if(!needs.length) needs.push('এখন কোন সিদ্ধান্ত বাকি নেই।');
  if(kind==='daily') return '<h3>আজ যা শেষ করেছে</h3>'+za_li(done.concat(tdone.map(function(t){ return t.title+' (assigned by '+t.src+')'; })), true)+
    '<h3>শুরু করেছে, শেষ হয়নি — কেন</h3>'+(prog.length||open.length ? '<ul>'+prog.map(function(x){ return '<li><span class="en">'+esc(x)+'</span> — কাজ চলছে, পরের রাউন্ডে শেষ হবে।</li>'; }).join('')+open.map(function(t){ return '<li><span class="en">'+esc(t.title)+'</span> — দেওয়া কাজ, শেষ তারিখ '+esc(za_fmtDate(t.due))+'।</li>'; }).join('')+'</ul>' : '<div class="zs-mini">কিছু নেই।</div>')+
    '<h3>বাগ</h3><ul><li>নিজে পেয়েছে: '+B(k.selfBugs)+'টা (নমুনা সংখ্যা)</li><li>মালিক পেয়েছেন: '+B(k.ownerBugs)+'টা — প্রতিটা লেসন হয়ে গেছে</li></ul>'+
    '<h3>ব্যবহার করা স্কিল</h3>'+za_li(L.has.slice(0,3), true)+'<h3>আজ শিখছে</h3>'+za_li(L.learning.slice(0,1), true)+
    '<h3>খরচ আর সময়</h3><ul><li>আজকের খরচ প্রায় ৳'+B(costDay)+' (নমুনা)</li></ul><h3>আগামীকালের পরিকল্পনা</h3>'+za_li(L.plan.slice(0,2).concat(open.map(function(t){ return t.title; })), true);
  var goals = done.length + tdone.length, total = goals + prog.length + open.length, pct = total ? Math.round(goals/total*100) : 100;
  if(kind==='weekly') return '<h3>সপ্তাহের সারাংশ</h3><p>এই সপ্তাহে '+esc(a.bn)+' '+B(goals)+'টা কাজ শেষ করেছে, '+B(prog.length+open.length)+'টা চলছে। লক্ষ্য বনাম শেষ: <b>'+B(pct)+'%</b>।</p>'+
    '<h3>KPI</h3><ul><li>প্রথমবারেই ঠিক: '+B(k.ftr)+'% (নমুনা)</li><li>আবার করতে হয়েছে: '+B(k.rework)+'বার (নমুনা)</li><li>গেট/QA: V11 গেট ২৪০-এ ০ ভুল; V12 চলবে</li><li>নিজে পাওয়া বাগ '+B(k.selfBugs)+' · মালিকের পাওয়া '+B(k.ownerBugs)+'</li><li>প্রতি কাজে খরচ প্রায় ৳'+B(Math.round(k.perTask))+'</li></ul>'+
    '<h3>স্কিল</h3><ul><li>এই সপ্তাহে লাইব্রেরিতে এসেছে: '+B(k.ext)+'টা বাইরের স্কিল</li><li>নিজের স্কিল: '+B(k.has)+'টা · ব্যর্থ সেলফ-টেস্ট: ০</li><li>পড়াশোনা (PR 579): ৩ লেভেলের ০টা পাস — প্রথম পরীক্ষা বাকি</li></ul>'+
    '<h3>ঝুঁকি আর বাধা</h3>'+za_li(prog.length ? prog : ['বড় কোন বাধা নেই।'], !!prog.length)+'<h3>মালিকের কাছে যা দরকার</h3>'+za_li(needs);
  if(kind==='monthly') return '<h3>KPI ট্রেন্ড</h3><p>এই এজেন্ট ১৯ অক্টোবর থেকে কাজ করছে — তাই এখন মাত্র ১ সপ্তাহের ডেটা; ট্রেন্ড পরের মাস থেকে দেখা যাবে।</p>'+
    '<h3>মাসের সেরা কাজ</h3>'+za_li(done.slice(0,1).length ? done.slice(0,1) : ['—'], true)+'<h3>সবচেয়ে দুর্বল জায়গা</h3>'+za_li(L.lessons.slice(0,1).length ? L.lessons.slice(0,1) : (w.length ? [w[0].why] : ['মালিক এখনও কোন ভুল ধরেননি।']), true)+
    '<h3>শেখা লেসন (মালিকের সংশোধন)</h3>'+za_li(L.lessons, true)+'<p>প্রতিটা লেসন কাজের আগে প্রতিবার পড়া হয় — একই ভুল আর না।</p>'+
    '<h3>পড়াশোনা</h3><ul><li>মডিউল শেষ: ০ · পরীক্ষার নম্বর: এখনও নেই</li></ul><h3>পরের মাসের লক্ষ্য</h3>'+za_li(L.plan, true);
  if(kind==='yearly') return '<h3>বছরের সারাংশ ২০২৬</h3><p>'+esc(a.bn)+' ('+esc(za_code(id))+') ১৯ অক্টোবর ২০২৬ যোগ দিয়েছে।</p><h3>মাস ধরে ইতিহাস</h3><ul><li><b>অক্টোবর:</b> '+B(goals)+'টা কাজ শেষ, '+B(k.ownerBugs)+'টা লেসন, '+B(k.ext)+'টা স্কিল যোগ।</li><li><b>নভেম্বর – ডিসেম্বর:</b> এখনও আসেনি।</li></ul>'+
    '<h3>পুরস্কার</h3>'+za_li(p.rewards.map(function(r){ return r.label+(r.note?' — '+r.note:''); }).concat(p.rewards.length?[]:['এখনও নেই।']))+'<h3>সতর্কবার্তা</h3>'+za_li(w.map(function(x){ return x.why+' ('+x.by+')'; }).concat(w.length?[]:['নেই।']));
  /* appraisal */
  var rate = function(v){ v = Math.max(1, Math.min(5, Math.round(v))); return '<span class="za-stars">'+'★★★★★'.slice(0, v)+'<span style="color:var(--line)">'+'★★★★★'.slice(v)+'</span></span> '+B(v)+'/৫'; };
  var comp = [['মান (quality)', 4 - Math.min(2, k.ownerBugs/2) + (w.length?-0.5:0), 'মালিকের ধরা ভুল '+B(k.ownerBugs)+'টা'],['গতি (speed)', 3 + Math.min(2, goals/3), B(goals)+'টা কাজ ১ সপ্তাহে'],['নিজে সমস্যা খোঁজা (ownership)', 3 + (k.selfBugs>3?1:0), 'নিজে পাওয়া বাগ '+B(k.selfBugs)+' (নমুনা)'],['শেখা (learning)', 3 + (k.ext>20?1:0), B(k.ext)+'টা স্কিল লাইব্রেরিতে · লেভেল ০/৩'],['নিয়ম মানা', w.length?3:4, w.length ? 'প্রধানের সতর্কবার্তা '+B(w.length)+'টা' : 'কোন সতর্কবার্তা নেই'],['খরচের শৃঙ্খলা', za_capState(za_cap(id))==='bad'?2:za_capState(za_cap(id))==='warn'?3:4, 'সীমার '+B(Math.round(k.cost/Math.max(1,za_cap(id).cap)*100))+'% খরচ'],['যোগাযোগ (সহজ বাংলা)', 4, 'রিপোর্ট বাংলায়']];
  var or = za_ensure().rating[id] || {stars:0, comment:''};
  return '<h3>১. দায়িত্ব</h3><p class="en">'+esc(L.role)+'</p><p class="en">'+esc(L.owns)+'</p>'+
    '<h3>২. লক্ষ্য বনাম অর্জন</h3>'+(L.plan.length ? '<ul>'+L.plan.map(function(g, i){ return '<li><span class="en">'+esc(g)+'</span> — '+(i===0 && goals ? 'চলছে; প্রমাণ: কাজের লগ' : 'শুরু হয়নি')+'</li>'; }).join('')+'</ul>' : '<div class="zs-mini">—</div>')+
    '<h3>৩. দক্ষতা (১–৫, প্রমাণসহ)</h3>'+comp.map(function(c){ return '<div class="za-comp"><span>'+c[0]+'</span>'+rate(c[1])+'<span class="e">'+esc(c[2])+'</span></div>'; }).join('')+
    '<h3>৪. বড় অর্জন · ভুল আর তার কারণ</h3>'+za_li(done.slice(0,3).concat(p.rewards.map(function(r){ return 'Reward: '+r.label; })), true)+za_li(L.lessons.concat(w.map(function(x){ return 'Warning: '+x.why; })).slice(0,4).concat(L.lessons.length||w.length?[]:['এখনও কোন ভুল ধরা পড়েনি।']), true)+
    '<h3>৫. স্কিল আর সার্টিফিকেট</h3><ul><li>লেভেল: গ্র্যাজুয়েট / পোস্ট-গ্র্যাজুয়েট / পিএইচডি — কোনটাই এখনও পাওয়া হয়নি</li><li>লাইব্রেরিতে স্কিল: '+B(k.ext+k.has)+'টা</li></ul>'+
    '<h3>৬. মালিকের রেটিং আর মন্তব্য</h3><div class="za-rate" role="group" aria-label="Owner rating">'+[1,2,3,4,5].map(function(n){ return '<button type="button" class="'+(or.stars>=n?'on':'')+'" data-act="za-rate" data-id="'+id+'" data-v="'+n+'" aria-label="'+n+' of 5">'+n+'</button>'; }).join('')+'</div>'+
      '<textarea class="input mt8" rows="3" placeholder="আপনার মন্তব্য…" data-input="za-rate-c" data-id="'+id+'" aria-label="Owner comment">'+esc(or.comment)+'</textarea>'+
    '<h3>৭. আগামী বছরের পরিকল্পনা</h3>'+za_li(L.learning.concat(['গ্র্যাজুয়েট লেভেলের পরীক্ষা পাস (৮৫%)']), true)+
    '<h3>৮. ইতিহাস</h3>'+za_li(L.log.concat(L.profileLog).slice(0,8), true);
}
ACT['za-rk'] = function(el){ UI['za-rk'] = el.getAttribute('data-v'); rerender(); };
ACT['za-rate'] = function(el){ var z = za_ensure(), id = el.getAttribute('data-id'); z.rating[id] = z.rating[id] || {stars:0, comment:''}; z.rating[id].stars = +el.getAttribute('data-v'); saveState(); rerender(); toast('Your rating saved: '+el.getAttribute('data-v')+' of 5'); };
INPUT['za-rate-c'] = function(el){ var z = za_ensure(), id = el.getAttribute('data-id'); z.rating[id] = z.rating[id] || {stars:0, comment:''}; z.rating[id].comment = el.value; saveState(); };
ACT['za-rep-tg'] = function(el){ var id = el.getAttribute('data-id'), kind = UI['za-rk'] || 'daily', k = za_kpi(id);
  var txt = za_tgId(id)+'\n'+({daily:'আজকের রিপোর্ট',weekly:'সাপ্তাহিক রিপোর্ট',monthly:'মাসিক রিপোর্ট',yearly:'বার্ষিক রিপোর্ট',appraisal:'বার্ষিক অ্যাপ্রেইজাল'}[kind])+'\nশেষ: '+zs_bnNum(k.done)+' · চলছে: '+zs_bnNum(k.prog+k.open)+' · খরচ: ৳'+zs_bnNum(k.cost)+'\nপুরো রিপোর্ট → ড্যাশবোর্ড › Agents';
  openModal('<div class="zs-tg"><div class="zs-tg-h">EXTAS Owner bot · Telegram</div><div class="zs-tg-b">'+esc(txt)+'</div></div><div class="small text2 mt12">Sent (demo — nothing really sent).</div>', {title:'Report sent'}); };

/* ---------- edit profile, rewards, assignments ---------- */
function za_editHTML(){
  var u = UI['za-ed']; if(!u) return ''; var a = zs_agent(u.id);
  var prev = u.photo ? '<span class="za-av big" style="background:'+a.col+' center/cover no-repeat url('+u.photo+')"></span>' : '<span class="za-av big" style="background:'+(u.avatar||a.col)+'">'+esc((u.name||a.bn).charAt(0))+'</span>';
  return '<form data-submit="za-ed" class="stack s16"><div class="row" style="gap:14px;align-items:center">'+prev+'<div class="stack s8" style="min-width:0"><div class="label" style="margin:0">Photo</div><div class="row wrap" style="gap:6px">'+ZA_AVCOLS.map(function(c){ return '<button type="button" class="za-col'+((u.avatar||a.col)===c && !u.photo?' on':'')+'" style="background:'+c+'" data-act="za-ed-col" data-c="'+c+'" aria-label="Avatar colour"></button>'; }).join('')+'</div>'+
      '<label class="btn btn-sm btn-ghost" style="align-self:flex-start">'+ico('camera',14)+'Upload photo<input type="file" accept="image/*" data-change="za-ed-file" style="display:none"></label>'+(u.photo?'<button type="button" class="zs-link" data-act="za-ed-nophoto" style="align-self:flex-start">Remove photo</button>':'')+'</div></div>'+
    '<div><label class="label" for="za-ed-n">Name</label><input id="za-ed-n" class="input" name="name" value="'+esc(u.name)+'" placeholder="'+esc(a.en)+'" data-input="za-ed-f" data-f="name"></div>'+
    '<div><label class="label" for="za-ed-b">Bio</label><textarea id="za-ed-b" class="input" rows="3" name="bio" data-input="za-ed-f" data-f="bio" placeholder="'+esc(za_lib(u.id).role)+'">'+esc(u.bio)+'</textarea></div>'+
    '<div class="za-f2"><div><label class="label" for="za-ed-j">Joining date</label><input id="za-ed-j" class="input" type="date" name="joined" value="'+esc(u.joined)+'" data-input="za-ed-f" data-f="joined"></div>'+
      '<div><div class="label">Verified</div><div class="row" style="gap:10px">'+zs_sw(u.verified, 'za-ed-ver', 'Verified star')+'<span class="small">'+(u.verified?'Verified '+ico('check',12):'Not verified')+'</span></div></div></div>'+
    '<div class="row end" style="gap:8px"><button type="button" class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary">'+ico('check',15)+'Save profile</button></div></form>';
}
ACT['za-edit'] = function(el){ var id = el.getAttribute('data-id'), p = za_prof(id); UI['za-ed'] = {id:id, name:p.name, bio:p.bio, joined:p.joined, verified:p.verified, photo:p.photo, avatar:p.avatar}; openModal(za_editHTML(), {title:'Edit '+za_name(id), rebuild:za_editHTML}); };
INPUT['za-ed-f'] = function(el){ var u = UI['za-ed']; if(u) u[el.getAttribute('data-f')] = el.value; };
ACT['za-ed-col'] = function(el){ var u = UI['za-ed']; if(!u) return; u.avatar = el.getAttribute('data-c'); u.photo = ''; refreshModal(); };
ACT['za-ed-nophoto'] = function(){ var u = UI['za-ed']; if(!u) return; u.photo = ''; refreshModal(); };
ACT['za-ed-ver'] = function(){ var u = UI['za-ed']; if(!u) return; u.verified = !u.verified; refreshModal(); };
CHANGE['za-ed-file'] = function(el){
  var f = el.files && el.files[0], u = UI['za-ed']; if(!f || !u) return;
  var rd = new FileReader(); rd.onload = function(){ var img = new Image(); img.onload = function(){ var s = 160, c = document.createElement('canvas'); c.width = s; c.height = s; var x = c.getContext('2d'), m = Math.min(img.width, img.height);
    x.drawImage(img, (img.width-m)/2, (img.height-m)/2, m, m, 0, 0, s, s); u.photo = c.toDataURL('image/jpeg', 0.82); refreshModal(); }; img.onerror = function(){ toast('That file is not a picture'); }; img.src = rd.result; };
  rd.readAsDataURL(f);
};
SUBMIT['za-ed'] = function(){ var u = UI['za-ed']; if(!u) return; var p = za_prof(u.id); ['name','bio','joined','verified','photo','avatar'].forEach(function(k){ p[k] = u[k]; }); if(!p.joined) p.joined = '2026-10-19'; saveState(); closeModal(); rerender(); toast('Profile saved'); };
var ZA_REWARDS = ['Star of the week','Zero-bug week','Fastest fix','Owner\'s thanks','Saved money'];
function za_rewHTML(){ var u = UI['za-rw']; if(!u) return '';
  return '<form data-submit="za-rw" class="stack s16"><div><div class="label">Reward</div><div class="zs-chipset">'+ZA_REWARDS.map(function(r){ return '<button type="button" class="chip'+(u.label===r?' on':'')+'" data-act="za-rw-pick" data-v="'+esc(r)+'">'+esc(r)+'</button>'; }).join('')+'</div></div>'+
    '<div><label class="label" for="za-rw-n">Note</label><input id="za-rw-n" class="input" value="'+esc(u.note)+'" data-input="za-rw-note" placeholder="Why — e.g. fixed the courier zones in one day"></div>'+
    '<div class="row end" style="gap:8px"><button type="button" class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary">'+ico('gift',15)+'Give reward</button></div></form>'; }
ACT['za-reward'] = function(el){ UI['za-rw'] = {id:el.getAttribute('data-id'), label:ZA_REWARDS[0], note:''}; openModal(za_rewHTML(), {title:'Give '+za_name(el.getAttribute('data-id'))+' a reward', rebuild:za_rewHTML}); };
ACT['za-rw-pick'] = function(el){ var u = UI['za-rw']; if(u){ u.label = el.getAttribute('data-v'); refreshModal(); } };
INPUT['za-rw-note'] = function(el){ var u = UI['za-rw']; if(u) u.note = el.value; };
SUBMIT['za-rw'] = function(){ var u = UI['za-rw']; if(!u) return; za_prof(u.id).rewards.unshift({at:Date.now(), label:u.label, note:u.note}); saveState(); closeModal(); rerender(); toast('Reward given — it shows on the profile and in the reports'); };
function za_taskHTML(){ var u = UI['za-tk']; if(!u) return '';
  return '<form data-submit="za-tk" class="stack s16"><div><label class="label" for="za-tk-t">Task</label><input id="za-tk-t" class="input" value="'+esc(u.title)+'" data-input="za-tk-f" data-f="title" placeholder="e.g. Check courier zones for Savar"></div>'+
    '<div><label class="label" for="za-tk-d">Due date</label><input id="za-tk-d" class="input" type="date" value="'+esc(u.due)+'" data-input="za-tk-f" data-f="due"></div>'+
    '<div class="row end" style="gap:8px"><button type="button" class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary">'+ico('plus',15)+'Assign</button></div></form>'; }
ACT['za-task'] = function(el){ var x = new Date(Date.now()+3*86400000); UI['za-tk'] = {id:el.getAttribute('data-id'), title:'', due:x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')}; openModal(za_taskHTML(), {title:'Assign a task to '+za_name(el.getAttribute('data-id')), rebuild:za_taskHTML}); setTimeout(function(){ var t = document.getElementById('za-tk-t'); if(t) t.focus(); }, 30); };
INPUT['za-tk-f'] = function(el){ var u = UI['za-tk']; if(u) u[el.getAttribute('data-f')] = el.value; };
SUBMIT['za-tk'] = function(){ var u = UI['za-tk']; if(!u) return; if(!String(u.title).trim()){ toast('Write the task first'); return; } za_addTask(u.id, u.title.trim(), u.due, 'Owner'); saveState(); closeModal(); rerender(); toast('Task assigned — it shows on the profile and in the reports'); };
ACT['za-tstep'] = function(el){ var p = za_prof(el.getAttribute('data-id')), t = p.tasks.filter(function(x){ return x.id===el.getAttribute('data-t'); })[0]; if(!t) return; t.st = t.st==='todo' ? 'doing' : 'done'; saveState(); rerender(); toast('Task: '+za_stLabel(t.st)); };

/* ---------- Tirondaj · ads guardrails (PR 581) ---------- */
function za_tir(){
  var z = za_ensure();
  if(!z.tir) z.tir = {
    guard:{target:600, cpa:180, daily:6000, monthly:150000, autoDown:true, killed:false},
    camps:[
      {id:'c1', pf:'Facebook · Instagram', name:'Polo Duo · Advantage+ shopping', budget:1500, spend:1480, buys:13, rev:6200, st:'Active'},
      {id:'c2', pf:'Facebook', name:'Winter hoodies · retarget', budget:1000, spend:920, buys:4, rev:1750, st:'Active'},
      {id:'c3', pf:'Google Search', name:'"polo shirt bd" · exact', budget:700, spend:640, buys:6, rev:2950, st:'Active'},
      {id:'c4', pf:'Google PMax', name:'Catalogue · all menswear', budget:1200, spend:1100, buys:7, rev:3200, st:'Learning'},
      {id:'c5', pf:'YouTube', name:'Panjabi · Eid teaser', budget:500, spend:400, buys:1, rev:360, st:'Active'},
      {id:'c6', pf:'TikTok', name:'Joggers · Smart+', budget:600, spend:560, buys:3, rev:1180, st:'Active'}
    ],
    sugg:[{id:'s1', camp:'c1', from:1500, to:2200, text:'Polo Duo · Advantage+ ৳১,৫০০ → ৳২,২০০ / দিন', why:'CPA ৳114 vs cap ৳180, ROAS 4.2, steady for 3 days', st:'wait'},
          {id:'s2', camp:'c3', from:700, to:900, text:'"polo shirt bd" ৳৭০০ → ৳৯০০ / দিন', why:'CPA ৳107, impression share lost to budget 34%', st:'wait'}],
    log:[{at:Date.now()-5*3600000, src:'Telegram', text:'Eid panjabi ads only after 25 Oct'},{at:Date.now()-26*3600000, src:'Telegram', text:'No ads to Chattogram hill districts this week (courier delay)'}],
    sold:412
  };
  return z.tir;
}
function za_campAct(c, g){
  var cpa = c.buys ? c.spend/c.buys : c.spend;
  if(g.killed) return ['Stopped by kill switch', 'none'];
  if(c.st==='Paused') return ['Paused', 'none'];
  if(c.st==='Learning') return ['Wait — still learning', 'none'];
  if(cpa > g.cpa*1.8) return ['Pause — CPA '+Math.round(cpa/g.cpa*10)/10+'× the cap', g.autoDown?'pause':'ask'];
  if(cpa > g.cpa) return ['Cut budget 30% — CPA over cap', g.autoDown?'cut':'ask'];
  if(cpa < g.cpa*0.7 && c.rev/c.spend > 3.5) return ['Raise budget — needs your approval', 'raise'];
  return ['Keep', 'none'];
}
function za_tirCard(compact){
  var t = za_tir(), g = t.guard, sp = t.camps.reduce(function(s,c){ return s + (c.st==='Paused'||g.killed?0:c.spend); }, 0), buys = t.camps.reduce(function(s,c){ return s + c.buys; }, 0), rev = t.camps.reduce(function(s,c){ return s + c.rev; }, 0);
  var num = function(k, lab, step){ return '<div><label class="label" for="za-g-'+k+'">'+lab+'</label><input id="za-g-'+k+'" class="input zs-in" type="number" inputmode="numeric" min="0" step="'+(step||10)+'" value="'+g[k]+'" data-change="za-guard" data-k="'+k+'"></div>'; };
  var camps = t.camps.map(function(c){ var cpa = c.buys ? c.spend/c.buys : c.spend, roas = c.rev/Math.max(1,c.spend), a = za_campAct(c, g), over = cpa > g.cpa;
    var btn = a[1]==='cut' || a[1]==='pause' ? '<button type="button" class="btn btn-sm btn-secondary" data-act="za-camp" data-id="'+c.id+'" data-v="'+a[1]+'">Apply (allowed)</button>' : a[1]==='raise' ? '<button type="button" class="btn btn-sm btn-ghost" data-act="za-camp" data-id="'+c.id+'" data-v="raise">Ask approval</button>' : a[1]==='ask' ? '<span class="zs-mini">Auto-decrease off — your call</span>' : '';
    return '<div class="za-cbr za-camp"><div style="min-width:0"><div class="n">'+esc(c.name)+'</div><div class="m">'+esc(c.pf)+' · budget '+fmt(c.budget)+'/day · <span class="zs-st '+(g.killed||c.st==='Paused'?'rejected':c.st==='Learning'?'approved':'fixed')+'">'+(g.killed?'Stopped':esc(c.st))+'</span></div></div>'+
      '<div class="v" style="text-align:left"><span class="zs-mini">Spend</span> <b>'+fmt(c.spend)+'</b> · <span class="zs-mini">Buys</span> <b>'+c.buys+'</b><br><span class="zs-mini">CPA</span> <b style="'+(over?'color:var(--sale)':'')+'">'+fmt(cpa)+'</b> · <span class="zs-mini">ROAS</span> <b>'+roas.toFixed(1)+'</b></div>'+
      '<div class="v"><div class="small">'+esc(a[0])+'</div><div class="mt8">'+btn+'</div></div></div>'; }).join('');
  var sugg = t.sugg.map(function(s){ return '<div class="zs-li"><div style="min-width:0"><div class="t za-bn">'+esc(s.text)+'</div><div class="m">Why: '+esc(s.why)+'</div></div><div class="r">'+(s.st==='wait' ? '<button type="button" class="btn btn-sm btn-primary" data-act="za-sugg" data-id="'+s.id+'" data-v="ok">Approve</button><button type="button" class="btn btn-sm btn-ghost" data-act="za-sugg" data-id="'+s.id+'" data-v="no">Decline</button>' : '<span class="zs-st '+(s.st==='ok'?'fixed':'rejected')+'">'+(s.st==='ok'?'Approved':'Declined')+'</span>')+'</div></div>'; }).join('');
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Ads guardrails</h2><span class="row" style="gap:6px">'+zs_pr('581 · 265–268 · 531')+zs_simTag('Campaigns simulated')+'</span></div>'+
    '<div class="zs-sub za-bn">তীরন্দাজ নিজে ক্যাম্পেইন চালায়, কমাতে পারে — কিন্তু বাজেট বাড়াতে সবসময় আপনার অনুমতি লাগে। এই সীমা কোড মেনে চলে, এজেন্ট না।</div>'+
    (g.killed ? '<div class="zs-note warn mb16">'+ico('info',17)+'<div class="zs-bnp"><b>সব অ্যাড বন্ধ (কিল সুইচ)।</b> আবার চালু করতে নিচের বাটন।</div></div>' : '')+
    '<div class="zs-kpis k4"><div class="zs-k"><div class="v">'+fmt(sp)+'</div><div class="l">Spend today</div><div class="s">of '+fmt(g.daily)+' daily cap</div></div><div class="zs-k"><div class="v">'+buys+'</div><div class="l">Purchases today</div><div class="s">82% delivered (COD)</div></div><div class="zs-k '+(sp/Math.max(1,buys)>g.cpa?'bad':'ok')+'"><div class="v">'+fmt(sp/Math.max(1,buys))+'</div><div class="l">CPA today</div><div class="s">cap '+fmt(g.cpa)+'</div></div><div class="zs-k"><div class="v">'+t.sold+' / '+g.target+'</div><div class="l">Sales target (month)</div>'+zs_bar(t.sold/Math.max(1,g.target)*100)+'</div></div>'+
    '<div class="grid g2" style="gap:10px">'+num('target','Target sales this month (orders)', 10)+num('cpa','Max cost per purchase — CPA cap (৳)', 5)+num('daily','Daily budget ceiling (৳)', 100)+num('monthly','Monthly budget ceiling (৳)', 1000)+'</div>'+
    '<div class="zs-row mt8"><div class="grow"><div class="small bold">Auto-decrease allowed</div><div class="zs-mini za-bn">CPA সীমা ছাড়ালে নিজে বাজেট কমাতে / থামাতে পারবে</div></div>'+zs_sw(g.autoDown, 'za-g-auto', 'Auto-decrease allowed')+'</div>'+
    '<div class="zs-row"><div class="grow"><div class="small bold">Budget increase only with your approval</div><div class="zs-mini za-bn">সবসময় চালু — বদলানো যায় না</div></div><span class="tag">'+ico('lock',12)+'Always</span></div>'+
    '<div class="zs-row"><div class="grow"><div class="small bold">Kill switch</div><div class="zs-mini za-bn">এক চাপে সব প্ল্যাটফর্মের সব অ্যাড বন্ধ</div></div><button type="button" class="btn btn-sm '+(g.killed?'btn-secondary':'btn-dark')+'" data-act="za-kill">'+(g.killed?'Resume ads':'Stop all ads now')+'</button></div>'+
    '<div class="h3 mt16" style="font-size:15px">Budget increase suggestions</div>'+(sugg ? '<div class="zs-list">'+sugg+'</div>' : '<div class="zs-mini">None.</div>')+
    (compact ? '<div class="zs-actions mt12"><a class="btn btn-sm btn-ghost" href="#/admin/agents/tirondaj?tab=ads">Campaigns &amp; instructions</a></div>' :
    '<div class="h3 mt16" style="font-size:15px">Campaigns</div><div class="za-cb">'+camps+'</div>'+
    '<div class="h3 mt16" style="font-size:15px">Instructions</div><form data-submit="za-instr" class="row" style="gap:8px"><input class="input zs-in grow" name="t" placeholder="e.g. No ads after 11 pm" aria-label="Instruction for Tirondaj" style="min-width:0"><button class="btn btn-secondary">Send</button></form>'+
    '<div class="zs-list mt8">'+t.log.map(function(l){ return '<div class="zs-li"><div style="min-width:0"><div class="t">'+esc(l.text)+'</div><div class="m">from '+esc(l.src)+' · '+esc(zs_time(l.at))+'</div></div></div>'; }).join('')+'</div>')+
  '</section>';
}
CHANGE['za-guard'] = function(el){ var g = za_tir().guard, n = parseInt(el.value, 10); if(isNaN(n) || n<0) return; g[el.getAttribute('data-k')] = n; saveState(); rerender(); toast('Guardrail saved — suggestions recalculated'); };
ACT['za-g-auto'] = function(){ var g = za_tir().guard; g.autoDown = !g.autoDown; saveState(); rerender(); toast(g.autoDown ? 'Tirondaj may cut budgets by itself' : 'Every change now waits for you'); };
ACT['za-kill'] = function(){ var g = za_tir().guard; if(!g.killed && !confirm('Stop every ad on every platform now?')) return; g.killed = !g.killed; za_tir().log.unshift({at:Date.now(), src:'Dashboard', text:g.killed?'Kill switch: all ads stopped':'Ads resumed'}); saveState(); rerender(); toast(g.killed ? 'All ads stopped (demo)' : 'Ads resumed (demo)'); };
ACT['za-camp'] = function(el){ var t = za_tir(), c = t.camps.filter(function(x){ return x.id===el.getAttribute('data-id'); })[0], v = el.getAttribute('data-v'); if(!c) return;
  if(v==='pause'){ c.st = 'Paused'; t.log.unshift({at:Date.now(), src:'Tirondaj', text:'Paused '+c.name+' (CPA over cap) — before: '+fmt(c.budget)+'/day'}); toast(c.name+' paused'); }
  else if(v==='cut'){ var b = c.budget; c.budget = Math.round(c.budget*0.7/10)*10; c.spend = Math.round(c.spend*0.7); t.log.unshift({at:Date.now(), src:'Tirondaj', text:'Cut '+c.name+' '+fmt(b)+' → '+fmt(c.budget)+'/day'}); toast('Budget cut to '+fmt(c.budget)+' a day'); }
  else if(v==='raise'){ if(!t.sugg.some(function(s){ return s.camp===c.id && s.st==='wait'; })) t.sugg.unshift({id:'s'+Date.now(), camp:c.id, from:c.budget, to:Math.round(c.budget*1.4/10)*10, text:c.name+' '+fmt(c.budget)+' → '+fmt(Math.round(c.budget*1.4/10)*10)+' / day', why:'CPA '+fmt(c.spend/Math.max(1,c.buys))+' vs cap '+fmt(t.guard.cpa)+', ROAS '+(c.rev/c.spend).toFixed(1), st:'wait'}); toast('Suggestion sent for your approval (also to Telegram)'); }
  saveState(); rerender(); };
ACT['za-sugg'] = function(el){ var t = za_tir(), s = t.sugg.filter(function(x){ return x.id===el.getAttribute('data-id'); })[0]; if(!s) return; s.st = el.getAttribute('data-v')==='ok' ? 'ok' : 'no';
  if(s.st==='ok'){ var c = t.camps.filter(function(x){ return x.id===s.camp; })[0]; if(c) c.budget = s.to; } t.log.unshift({at:Date.now(), src:'Owner', text:(s.st==='ok'?'Approved: ':'Declined: ')+s.text}); saveState(); rerender(); toast(s.st==='ok' ? 'Approved — budget raised (demo)' : 'Declined — budget stays'); };
SUBMIT['za-instr'] = function(f){ var v = (f.querySelector('[name=t]').value||'').trim(); if(!v) return; za_tir().log.unshift({at:Date.now(), src:'Dashboard', text:v}); saveState(); rerender(); toast('Instruction saved — Tirondaj follows it from now'); };

/* ---- the agents' library (agents/NAME.md, worklog, lessons, skills/NAME/ext — embedded at build time) ---- */
var ZA_LIB = {"agents":{"prohori":{"role":"Server, settings framework, security, deploy, backup, site health & audit.","owns":"S0A server · S00 settings/foundation · S17 multi-store · S18 compliance/security · S19 deploy, backup (Google Drive), go-live · S21 site health & audit (incl. PR 570 checklist audit runner)","never":"Customer-facing design","plan":["Finish its open items in review/ROUND15.md and the PRs it owns; every finish measured on the device gate.","Keep its skills below up to date in the Skill Library (PR 321–323) when the live server is up."],"has":["Azure VPS (E8ds v4) hardening, Docker, Caddy, Cloudflare","Next.js / Prisma / PostgreSQL / Redis ops","Encrypted credential vault (PR 493), CI hardcode guard (PR 494)","Google Drive backup + restore drills (PR 395 / 507)","Device-matrix QA gate (qa/device-matrix.js) and Playwright journeys","E-commerce QA checklist (qa/ECOMMERCE-CHECKLIST.md)"],"learning":["Checklist audit runner with grouped/prioritised checks, schedules and Telegram reports (PR 570)","WebKit/iPhone-faithful gesture testing (edge swipe, toolbars, safe areas)"],"profileLog":["19 Oct — built the 250+ point e-commerce checklist and ran full QA across 8 viewports (round 15 note 12) — in progress","19 Oct — device gate updated to the owner's rules (All-colours ≤5/≥6, price line one line, fit line one line + centred); V11 gate 0 of 240","18 Oct — device-matrix gate created after the 413 px footer incident (round 14)"],"guard":[],"log":["2026-10-19 · e-commerce checklist + full QA run (in progress) · qa/ECOMMERCE-CHECKLIST.md","2026-10-19 · QA R15: 405-point checklist, 22 bugs; fix wave 1 started","2026-10-19 · V12 admin demo: Settings #/admin/settings — two tiers installation → store, search, reset to default, own-data lock; edits live on the shop (delivery bands + sub-area mode, hours + promise, payment line, header/floating WhatsApp, hero buttons, invoice words, SMS/WhatsApp rule) (PR 491/492/509/510) · 89-admin-system.js, r12-zadmin.css · 0 JS errors, 5 storefront proofs at 1280 + 393","2026-10-19 · V12 admin demo: Backup #/admin/backup — Google Drive only, schedule, retention, last runs, Back up now, Restore with typed confirm (staging first), restore drill — simulated (PR 395/396/507) · 89-admin-system.js · 0 JS errors at 1280 + 393","2026-10-19 · V12 admin demo: Site audit #/admin/audit — 404-point checklist in 23 groups P1–P3, 1–3 agents, screens, Run now, weekly Fri 09:00 + Telegram, report history, bugs Propose fix → Approve (PR 570, 413–424, gate 420) — simulated · 89-admin-system.js · 0 JS errors at 1280 + 393","2026-10-19 · V12 admin demo: Server health #/admin/health — CPU/RAM/disk/uptime/response, services, Telegram alert thresholds + test alert, spike + AI diagnosis with approval (PR 423) — simulated · 89-admin-system.js · 0 JS errors at 1280 + 393"],"lessons":[],"ext":["accessibility-review","architecture","broken-links","capacity-plan","change-request","code-review","compliance-check","compliance-tracking","debug","deploy-checklist","documentation","incident-response","mcp-builder","risk-assessment","runbook","skill-creator","system-design","tech-debt","technical-seo","testing-strategy","webapp-testing"],"cur":{"g":["operating systems & networks","Linux administration","databases (PostgreSQL)","web architecture (Next.js/Node)","containers (Docker)","DNS/TLS/CDN (Cloudflare)","backups & restore"],"p":["Site Reliability Engineering (SLOs, error budgets, incident response, postmortems)","performance engineering (Core Web Vitals, Lighthouse budgets)","application security (OWASP Top 10/ASVS, secrets management, least privilege)","automated testing & QA (Playwright, device matrix, checklist audits)","CI/CD"],"d":["threat modelling for e-commerce/payment flows","chaos & resilience testing","capacity planning and cost modelling on Azure","security audit methodology","designing the audit standards other agents are measured by"]}},"bhandari":{"role":"Catalogue and images, courier/returns/exchange, ERP sync, documents (invoices, labels).","owns":"S01 catalogue & images · S08 courier, returns, exchange · S09 ERP sync (adapter, ERP optional) · S20 fulfilment & documents (invoice PR 407, template editor PR 409)","never":"Marketing copy, AI prompts","plan":["Finish its open items in review/ROUND15.md and the PRs it owns; every finish measured on the device gate.","Keep its skills below up to date in the Skill Library (PR 321–323) when the live server is up."],"has":["Product data model (colours, sizes S–3XL, stock per colour/size, size charts)","National address gazetteer (data/BD-AREA-MASTER.csv, 1,744 places) and its generator","Garment drawings for demo (polo, tee, shirt, panjabi, trouser, hoodie, tracksuit, jogger, puffer, bomber, sweater, sweatshirt)","Fully customisable invoice (INVOICE_TPL — every word and block)"],"learning":["Courier rate/zone sync per band (PR 550) without per-courier pricing","Photo standard for set composites (PR 575) with the studio (S24)"],"profileLog":["19 Oct — combo test catalogue: 8 products × 6 colours × S–3XL, 7 combos (winter + summer), new garment drawings","19 Oct — invoice made fully editable; \"Get invoice\" fixed for sandboxed viewers; order number clickable + invoice icon; thank-you delivery headline; SMS wording to the two-SMS rule","19 Oct — gazetteer data fixes (Gazipur/Narayanganj district rows, Dinajpur Nawabganj band, Bogra alias)"],"guard":[],"log":["2026-10-19 · combo test catalogue (8 products × 6 colours × S–3XL, 7 combos), garment drawings · files 01z-combo-test.js, 02z-garments.js · bag totals checked","2026-10-19 · invoice fully editable, Get-invoice fix, order number link + invoice icon, thank-you hours headline, SMS wording · 52-thanks.js, 60-account.js · 0 JS errors"],"lessons":[],"ext":["adobe-batch-edit-photos","adobe-resize-photos-and-videos","data-context-extractor","doc-coauthoring","docx","ecommerce-feed-management","ecommerce-returns-management","ecommerce-shipping-rates","inventory-planner","pdf","process-doc","reconciliation","restock","skill-creator","validate-data","vendor-review","xlsx"],"cur":{"g":["product information management","size grading & charts","colour/variant data","image standards; inventory basics; courier operations in Bangladesh; invoices & documents"],"p":["inventory theory (EOQ, safety stock, reorder points, ABC analysis)","demand forecasting","returns/exchange logistics and reverse supply chain","last-mile performance (delivery success vs refusal by district)","ERP integration patterns","data quality"],"d":["stochastic inventory models for seasonal fashion (winter/Eid peaks)","assortment optimisation by colour/size","courier-mix optimisation by band and district","designing the catalogue/data standards for the whole system"]}},"sawdagor":{"role":"The storefront logic: pages, combos, cart, checkout, orders, payments.","owns":"S02 storefront · S03 combos & bundles (PR 89–104, 571–576) · S04 cart, checkout, accounts · S05 order management · S07 payments","never":"Server internals, ERP internals","plan":["Finish its open items in review/ROUND15.md and the PRs it owns; every finish measured on the device gate.","Keep its skills below up to date in the Skill Library (PR 321–323) when the live server is up."],"has":["Combo/set engine, set pricing, auto-apply, tier rules","Bag totals, offers (VIP, set vs other offers — better of the two), stock checks across the bag","Checkout: phone-first, three delivery bands, delivery promise in hours, address resolver (06-resolver.js)","Back/forward trail, scroll restoration, pull-to-refresh, edge swipe (99-boot.js, 09-ptr.js)","Search incl. help/policy answers (07-help-search.js)"],"learning":["Auto colour-pair combos (PR 571) and the combo page/bag templates (PR 572–574)","Owner's \"no single piece in this section\" rule and the 3-piece upsell"],"profileLog":["19 Oct — combo bug fixes (22 audit findings: money, wrong info, UX), image taps no longer leave the combo page, 3–4 alternative combo layouts, Move-to-wishlist with Undo — in progress","19 Oct — auto colour-pair engine + combo category templates L1–L5 + pair page templates — in progress","19 Oct — help search (\"delivery\", \"return policy\", Bengali, misspellings)","19 Oct — address resolver on the national list (62/62 test addresses), three bands, hours promise","19 Oct — back never skips/blank, scroll restored on back, pull-to-refresh, View-bag toast bug"],"guard":[],"log":["2026-10-19 · help search · 07-help-search.js · 10 queries pass","2026-10-19 · address resolver on national list, 3 bands, hours promise · 05-gazetteer.js, 06-resolver.js, 51-checkout.js · 62/62 addresses","2026-10-19 · back trail, scroll restore, pull-to-refresh, View-bag toast · 99-boot.js, 09-ptr.js, styles.css","2026-10-19 · combo audit (22 findings) · review/COMBO-AUDIT.md","2026-10-19 · auto colour-pair combos built (PR 571), verified on 4 viewports"],"lessons":["Set lines store REAL item prices plus one set-discount line; rows must add up (combo audit 1, 7, 8).","Set price and other offers never combine — the better of the two (combo audit 6).","Toast links must be tappable (`.toast a{pointer-events:auto}`) (R15 3.6).","Edge swipe: let the browser's own back land first; never history.back() twice (R15 7.1)."],"ext":["code-review","debug","ecommerce-checkout-optimization","ecommerce-customer-retention","ecommerce-growth-strategy","ecommerce-landing-page","ecommerce-personalization","ecommerce-subscription-model","frontend-design","metrics-review","product-brainstorming","skill-creator","testing-strategy","web-artifacts-builder","webapp-testing","write-spec"],"cur":{"g":["how online stores work end to end; product pages","cart","checkout","payments (COD, bKash, Nagad, cards)","order management"],"p":["conversion-rate optimisation (Baymard-style usability research, form design, checkout friction)","pricing & bundling (anchoring, bundle discount psychology, tiered sets)","A/B testing and statistics","fraud-aware checkout (COD risk)","customer experience metrics"],"d":["experiment design at scale (sequential testing, uplift)","behavioural economics of bundles and price presentation","marketplace/combos theory","designing EXTAS's conversion playbook and proving each rule with data"]}},"shilpi":{"role":"Senior UI/UX. Every customer-facing surface, phone first. Reviews what Sawdagor builds.","owns":"All customer-facing surfaces (design layer); reviews Sawdagor's pages; design options shown to the owner as pictures","never":"Business logic, data model","plan":["Finish its open items in review/ROUND15.md and the PRs it owns; every finish measured on the device gate.","Keep its skills below up to date in the Skill Library (PR 321–323) when the live server is up."],"has":["AUTO ADJUST layouts (step-down: full → short → icon; hide instead of wrap)","Product page first-screen budget (PDP_FIT) and the measured fit-line centring","Header/footer system, WhatsApp header icon with \"bleed\", bag icon prominence","Before/after picture sheets with Bengali labels"],"learning":["Combo templates ranked by a 100-point score (PR 576)","Set photo composition (PR 575)"],"profileLog":["19 Oct — PDP: All-colours ≤5/≥6 rule, heart after title, WhatsApp to header, one-line fit line and price line, +3 px / centred fit line, title fills line one, second price bar, Add-to-Bag shade options, 3XL","19 Oct — footer slogan under the E, Join button, WhatsApp/Hotline buttons; hero buttons configurable","19 Oct — photo zoom viewer (pinch, double-tap, swipe, real image)","19 Oct — combo research: 5 category, 5 product, 5 bag templates (review/COMBO-RESEARCH.md)"],"guard":[],"log":["2026-10-19 · PDP R15 notes 2–3 (All colours rule, heart, WhatsApp header, one-line lines, centred fit line, second bar, shades, 3XL), footer note 1, zoom viewer · 30-product.js, 03-layout.js, r12-*.css, 31-zoom.js · V11 gate 0/240","2026-10-19 · combo research, 15 templates proposed · review/COMBO-RESEARCH.md"],"lessons":["The fit line sits in the middle between size boxes and the buy bar; the next block never peeks above the bar (R15 2.8).","The photo must not resize when the browser bars slide (R15 7.2 jolt)."],"ext":["accessibility-review","adobe-retouch-portraits","brand-guidelines","brand-review","canvas-design","design-critique","design-handoff","design-system","ecommerce-branding","figma-design-to-code","figma-generate-design","figma-use","frontend-design","get-design-feedback","research-synthesis","skill-creator","theme-factory","user-research","ux-copy","web-artifacts-builder"],"cur":{"g":["visual design (type, colour, grid, hierarchy)","interaction design basics","mobile-first layouts","accessibility (WCAG 2.2)","design systems"],"p":["human–computer interaction (cognitive load, Fitts's law, Hick's law, perception)","usability testing methods","information architecture","motion & micro-interaction","e-commerce UX patterns","Bengali typography and low-literacy design"],"d":["research-grade UX (experiment design, heuristic evaluation methodology, quantitative UX metrics)","designing EXTAS's own design language and AUTO ADJUST rules as a measurable standard"]}},"doot":{"role":"SEO, content, non-paid marketing, CRM, social (paid ads moved to Tirondaj A360-07) — and the analytics that feed them.","owns":"S11 SEO · S12 content & blog · S13 marketing (non-ads) · S14 CRM & customers · S23 social & content studio","never":"Checkout, payments, stock","plan":["Finish its open items in review/ROUND15.md and the PRs it owns; every finish measured on the device gate.","Keep its skills below up to date in the Skill Library (PR 321–323) when the live server is up."],"has":["Analytics event layer (PR 338/339) — search, WhatsApp by page×button, bag→purchase, Order Now, removes/re-adds, offer adds, All colours, Size chart, wishlist, logged-in vs guest","Geography analytics (PR 348/568/569)"],"learning":["Combo analytics (PR 104) on auto-pairs: which pairs sell","Telegram/email digests (PR 341)"],"profileLog":["19 Oct — demo analytics layer (88-track.js) and owner page #/admin/analytics"],"guard":[],"log":["2026-10-19 · analytics event layer + owner page · 88-track.js, 87-admin-analytics.js"],"lessons":[],"ext":["ad-manager","adobe-create-social-variations","ai-visibility","analyze","build-dashboard","campaign-plan","competitive-brief","content-brief","content-creation","content-strategy","content-translation","create-viz","crm-autopilot","data-visualization","draft-content","ecommerce-competitor-analysis","ecommerce-content-marketing","ecommerce-email-marketing-builder","ecommerce-keyword-research","ecommerce-marketing-strategy-builder","ecommerce-ppc-strategy-planner","ecommerce-social-media-marketing","ecommerce-video-marketing","email-sequence","internal-linking","keyword-clustering","marketing-monday","on-page-seo","performance-report","reactivate","resize-for-social-media","review-reputation","schema-markup","seo-ai-visibility","seo-audit","skill-creator","social-content-engine","technical-seo"],"cur":{"g":["marketing fundamentals (4Ps, segmentation, positioning)","content and social","SEO basics","Facebook/Instagram/Google ads basics","CRM basics","analytics basics"],"p":["marketing science (how brands grow — mental and physical availability)","performance marketing (bidding, creatives, attribution, MMM basics)","technical SEO and structured data","lifecycle/CRM (RFM, retention, win-back)","analytics & funnels","Bangladesh digital market (Facebook-first, COD)"],"d":["causal measurement (incrementality tests, geo experiments, MMM)","customer lifetime value modelling","geography-led growth (district outcomes)","designing EXTAS's growth model and reporting standard"]}},"gyani":{"role":"**Chief (PR 583):** investigates any \"why\" the owner asks (sales down, a wrong courier entry, a bug), names the responsible agent with evidence, assigns the fix, tracks it, reports back; routes Telegram commands that name no agent (PR 584). Needs owner approval for money movement, refunds, COD changes, prices/discounts, ad budget increases, blocking, deletion, anything irreversible.\n\nOwn stages: Fraud, Smart Rules, AI 360, finance, support, studio, video.","owns":"S06 fraud & duplicates · S10 Smart Rules · S15 AI 360 Control Room (incl. PR 577 agent profiles) · S16 finance · S22 support · S24 virtual photoshoot · S25 video","never":"Storefront layout","plan":["Finish its open items in review/ROUND15.md and the PRs it owns; every finish measured on the device gate.","Keep its skills below up to date in the Skill Library (PR 321–323) when the live server is up."],"has":["Fraud engine rules (no automatic block; approval digest)","Smart Rules text engine","AI master switch, per-agent model/cap/schedule, data-class routing"],"learning":["Agent 360° profiles (this file set) as a live dashboard page","Approval-gated auto-fix flow shared with PR 420/570"],"profileLog":["19 Oct — agent 360° profiles drafted (PR 577)"],"guard":[],"log":["2026-10-19 · agent 360° profiles + memory protocol (PR 577) · agents/","2026-10-19 · V12 admin demo: AI 360 Control Room tabs #/admin/ai — AI-off proof (PR 506), model auto-suggest with free-model qualification (PR 580), per-agent spend caps 80%/100% (PR 309), data-class routing (PR 310/311), cost book + presets (PR 312–314) — simulated · 83-admin-ai.js (tab hook), 89b-admin-agents.js · 0 JS errors at 1280 + 393","2026-10-19 · V12 admin demo: Agents #/admin/agents — seven agents with codes A360-01…07, org chart, Ask the chief + investigations + editable permissions (PR 583), Telegram preview with identity lines and auto-assign by name/code (PR 584) · 89b-admin-agents.js · 0 JS errors at 1280 + 393","2026-10-19 · V12 admin demo: Agent 360° profiles #/admin/agents/<id> — editable (photo, name, bio, joining date, verified, rewards, assignments), skills, curriculum path (PR 579), work log, KPIs & cost, Tirondaj ads guardrails (PR 581) · 89b-admin-agents.js · 0 JS errors at 1280 + 393","2026-10-19 · V12 admin demo: Agent reports — daily / weekly / monthly / yearly + yearly appraisal in simple Bengali per APPRAISAL-TEMPLATE.md, owner rating, send to Telegram (PR 578) · 89b-admin-agents.js · 0 JS errors at 1280 + 393"],"lessons":[],"ext":["adobe-edit-quick-cut","build-agent","business-pulse","cash-flow-snapshot","claude-api","close-management","compliance-check","customer-escalation","customer-research","doc-coauthoring","draft-response","explore-data","financial-statements","internal-comms","journal-entry","kb-article","knowledge-synthesis","legal-risk-assessment","mcp-builder","process-optimization","reconciliation","risk-assessment","skill-creator","sql-queries","statistical-analysis","status-report","ticket-deflector","ticket-triage","variance-analysis"],"cur":{"g":["AI/LLM fundamentals","prompt and agent design","rules engines","accounting basics (P&L, cash flow)","customer support operations"],"p":["machine learning for fraud/risk (features, precision/recall, cost-sensitive decisions, human-in-the-loop review)","AI safety & governance (permissions, data classes, evaluation)","managerial accounting & unit economics (per-style profit, COD refusal cost)","support automation & knowledge bases","image/video generation workflows"],"d":["evaluation methodology for agents (benchmarks, regression tests of skills)","causal fraud analysis without automatic blocking","AI cost optimisation","designing the agents' own curriculum","exams and appraisal system"]}},"tirondaj":{"role":"Bring sales from paid ads at the best cost, inside the owner's guardrails. Plans, builds, launches, tests, scales and cuts campaigns by itself; asks before spending more.","owns":"S13 paid ads — PR 256 campaign model, 257–258 server-side purchase/delivery events (with Prohori), 259–261 platform integrations, 262–264 audiences and the refused-parcel exclusion list, 265–268 spend import and controls, 269 growth agent, 270 creative briefs, 278 YouTube, 283 marketing report, 531 full campaign control, 581.","never":"Checkout, stock, prices, customer data outside the ad platforms' audience rules. Never raises a budget without approval.","plan":["Curriculum: performance marketing degree path (agents/CURRICULUM.md → Tirondaj section) — teaching starts first among all agents.","Playbooks for EXTAS: COD-aware optimisation (optimise for delivered purchase, not order — PR 258), Bangladesh audiences, Eid/winter seasons, combo-led offers.","Creative system with the studio (S24/S25): photo sets, short video cuts, captions in Bengali/English."],"has":["See agents/skills/tirondaj/ext/ (imported) and agents/skills/tirondaj/ (EXTAS playbooks as they are written)."],"learning":["Meta Advantage+ shopping and catalogue ads","Google Performance Max with feeds","TikTok Smart+","creative testing at scale","incrementality and geo tests","budget pacing under CPA caps."],"profileLog":["2026-10-19 — created (PR 581); guardrails defined; skills imported."],"guard":["Target sales (per product / campaign / month) · max cost per purchase (CPA cap, in ৳ or US cents with the owner's USD rate PR 266)","Daily and monthly budget ceilings · auto-decrease allowed · **any increase → suggestion with reason → owner approves** (dashboard or Telegram)","Kill switch · every change logged with before/after · weekly report"],"log":["2026-10-19 · created as the 7th agent (PR 581), guardrails, skills imported"],"lessons":["Optimise for delivered purchases (COD refusals cost money), not orders.","Never raise a budget without the owner's approval."],"ext":["ad-manager","adobe-create-social-variations","adobe-edit-quick-cut","analyze","build-dashboard","campaign-plan","canva-creator","competitive-intelligence","create-viz","draft-content","ecommerce-competitor-analysis","ecommerce-feed-management","ecommerce-growth-strategy","ecommerce-keyword-research","ecommerce-landing-page","ecommerce-personalization","ecommerce-ppc-strategy-planner","ecommerce-social-media-marketing","ecommerce-video-marketing","growth-pulse","marketing-monday","performance-report","resize-for-social-media","statistical-analysis"],"cur":{}}},"allLessons":["AUTO ADJUST: nothing fixed; never wrap to a second line, never cover; step down (full → short → icon) or hide. (R14)","Test on all 15 phone sizes, not one; \"done\" only with the device gate at 0 and screenshots looked at. (R14, the 413 px footer)","A price line, fit line, label line is ONE line on every device. (R15 2.5, 2.6)","\"All N colours\": up to 5 colours after the last swatch; from 6 on the Colour line. Read the owner's words literally (\"colour line\" = the swatches). (R15 2.2)","Never take a customer away from a combo to a single product page. (R15 5.1)","A district or postcode in an address settles the delivery band silently. (R15 Bogura)","Back must go back exactly one page, to the same scroll position; never a blank page, never jump to Home. (R15 7.1, 12.2)","Never stop the browser's own behaviours (pull-to-refresh) without putting them back. (R15 6.1)","Answers and picture labels in simple Bengali. (R15 5.0)","Nothing the owner asks to remove is deleted — it becomes a switch, off by default. (standing)","Nothing hardcoded; the owner's personal data never ships to another installation. (standing)","Fix every bug without asking; for design choices pick one, apply it, keep 2–3 pictures. (R15, 03:34)"]};
