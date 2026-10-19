/* ================= EXTAS demo — Admin · AI & agents (83) ================= */
(function(){
  var css = `
.aai-page .card{color:var(--ink)}
.aai-top{display:grid;gap:16px;grid-template-columns:minmax(0,1fr)}
@media(min-width:1024px){.aai-top{grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;align-items:start}}
.aai-g2{display:grid;gap:14px;grid-template-columns:minmax(0,1fr)}
@media(min-width:1024px){.aai-g2{grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;align-items:start}}
.aai-in{padding:9px 10px;font-size:14px;min-height:42px}
.aai-master{padding:20px}
@media(min-width:1024px){.aai-master{padding:26px 28px 24px}}
.aai-master.on{border-color:var(--brand-line);box-shadow:inset 4px 0 0 var(--brand)}
.aai-master.off{border-color:#DCC9A2;box-shadow:inset 4px 0 0 var(--warn)}
.aai-mmsg{margin:12px 0 0;font-size:15px;font-weight:500;max-width:640px;line-height:1.45}
@media(min-width:1024px){.aai-mmsg{margin:6px 0 0 60px;font-size:16px}.aai-kpis{margin-left:60px}.aai-master .aai-under{margin-left:60px}}
.aai-mhd{display:flex;gap:16px;align-items:center;justify-content:space-between}
.aai-mico{width:46px;height:46px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:var(--brand-tint);color:var(--brand)}
.aai-master.off .aai-mico{background:var(--warn-bg);color:var(--warn)}
.switch.aai-big{width:64px;height:36px;border-radius:18px}
.switch.aai-big::after{width:28px;height:28px;top:4px;left:4px}
.switch.aai-big.on::after{left:32px}
.aai-reassure{display:flex;gap:10px;align-items:flex-start;background:var(--surface2);border:1px solid var(--line2);border-radius:8px;padding:12px 14px;margin-top:18px;font-size:13.5px;line-height:1.45}
.aai-agent .tag{white-space:nowrap;flex-shrink:0}
.aai-dot{width:7px;height:7px;border-radius:50%;background:currentColor;display:inline-block}
.aai-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--line2)}
.aai-row.first{border-top:0}
.aai-f2{display:grid;gap:12px;grid-template-columns:minmax(0,1fr)}
@media(min-width:640px){.aai-f2{grid-template-columns:150px minmax(0,1fr)}}
.aai-sw{display:flex;flex-direction:column;gap:2px;margin-top:12px;border-top:1px solid var(--line2)}
.aai-sw .aai-row{padding:9px 0}
.aai-set{display:none;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:10px}
.aai-set.open{display:grid}
@media(min-width:1024px){.aai-set{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.aai-setbtn{display:none!important}}
.aai-set .label{font-size:12px;margin-bottom:5px;color:var(--text2)}
.aai-set .full{grid-column:1/-1}
.aai-fb{background:var(--surface2);border:1px solid var(--line2);border-radius:6px;padding:9px 11px;font-size:12.5px;color:var(--text2);margin-top:12px;line-height:1.45}
.aai-agent{padding:16px}
@media(min-width:1024px){.aai-agent{padding:18px 20px}}
.aai-agent.paused .h3{color:var(--text2)}
.aai-warn{display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:var(--warn-bg);color:var(--warn);border-radius:6px;padding:8px 10px;font-size:12.5px;font-weight:600}
.aai-bar{height:8px;border-radius:4px;background:var(--line);overflow:hidden}
.aai-bar>div{height:8px;background:var(--brand);border-radius:4px;transition:width .3s}
.aai-bar.hot>div{background:var(--warn)}
.aai-steps{display:flex;flex-direction:column;gap:14px;margin:6px 0 4px}
.aai-step{display:flex;gap:12px;align-items:center;font-size:14px;color:var(--muted)}
.aai-step.now{color:var(--ink);font-weight:600}
.aai-step.done{color:var(--ink)}
.aai-sdot{width:24px;height:24px;border-radius:50%;border:1.5px solid var(--input);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.aai-step.done .aai-sdot{background:var(--brand);border-color:var(--brand);color:var(--brand-ink)}
.aai-step.now .aai-sdot{border:2.5px solid var(--line);border-top-color:var(--brand);animation:aai-spin .8s linear infinite}
@keyframes aai-spin{to{transform:rotate(360deg)}}
.aai-okc{width:52px;height:52px;border-radius:50%;background:var(--brand-tint);color:var(--brand);display:flex;align-items:center;justify-content:center}
.aai-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:18px}
.aai-kpis>div{background:var(--surface2);border:1px solid var(--line2);border-radius:8px;padding:10px 12px}
.aai-kpis b{display:block;font-family:var(--font-display);font-size:20px;line-height:1.2}
`;
  var s = document.createElement('style'); s.setAttribute('data-mod', 'admin-ai'); s.textContent = css; document.head.appendChild(s);
})();

var AAI_SCHEDULES = ['Always on','On every order','After every chat','Every day 10 pm','Every night 2 am','Every Monday 8 am','Mon & Thu 9 am','When you click Generate','Manual only'];
var AAI_ATLIMIT = [['pause','Pause AI, keep the shop running'],['saver','Switch every agent to its cheapest model'],['kept','Keep only the agents I chose; pause the rest']];
var AAI_TOPIC = {
  blog:'Topic: How to choose a polo size\nKeywords: polo shirt size chart Bangladesh, polo size guide\nLength: about 800 words, friendly tone, link to Essential Piqué Polo',
  research:'Check: polo shirt prices at 5 Dhaka menswear brands this week\nCompare with: Essential Piqué Polo, Textured Knit Polo',
  landing:'Product: Essential Piqué Polo\nOffer: Polo Duo\nGoal: orders from Facebook ads'
};
var AAI_STEPS = {
  blog:['Finding what people in Bangladesh search for','Writing the draft','Checking it against your rules and catalogue'],
  research:['Collecting competitor prices','Comparing with your prices','Writing the report'],
  landing:['Reading the product, reviews and rules','Writing headline, sections and FAQ','Building the page draft']
};
var AAI_WHERE = {blog:'Blog → Drafts', research:'Research → Reports', landing:'Landing pages → Drafts'};

/* ---------- helpers ---------- */
function aai_ensure(){
  var a = ST.ai;
  if(!a.atLimit) a.atLimit = 'pause';
  if(!a.alerts) a.alerts = {at80:true, fallback:true};
  if(!a.runs) a.runs = [];
  return a;
}
function aai_agent(id){ var g = ST.ai.agents; for(var i=0;i<g.length;i++) if(g[i].id===id) return g[i]; return null; }
function aai_prov(id){ var g = ST.ai.providers; for(var i=0;i<g.length;i++) if(g[i].id===id) return g[i]; return null; }
/* effective status: master on → agent switch decides; master off → only agents kept on (and switched on) run */
function aai_running(a){ var m = !!ST.ai.master; return (m && !!a.on) || (!m && !!a.keepOn && !!a.on); }
/* public helper for other admin pages (e.g. landing builder) */
function aai_agentRunning(id){ var a = aai_agent(id); return a ? aai_running(a) : false; }
function aai_runningCount(){ return ST.ai.agents.filter(aai_running).length; }
function aai_pct(used, cap){ return cap>0 ? Math.min(100, Math.round(used/cap*100)) : 100; }
function aai_statusTag(a){
  var run = aai_running(a);
  if(run && ST.ai.master) return '<span class="tag" data-testid="aai-status-'+a.id+'"><span class="aai-dot"></span>Running</span>';
  if(run) return '<span class="tag gold" data-testid="aai-status-'+a.id+'"><span class="aai-dot"></span>Running while AI is off</span>';
  return '<span class="tag plain" data-testid="aai-status-'+a.id+'">Paused</span>';
}
function aai_switch(on, act, label, extra){
  return '<button class="switch'+(on?' on':'')+'" role="switch" aria-checked="'+(on?'true':'false')+'" aria-label="'+esc(label)+'" data-act="'+act+'" '+(extra||'')+'></button>';
}
function aai_lastRun(id){ var r = (ST.ai.runs||[]).filter(function(x){ return x.agent===id; })[0]; return r || null; }
function aai_cost(model){ var m = String(model||''); if(/Opus|Pro|GPT-5$/.test(m)) return 24; if(/Haiku|mini|Flash|Llama|Qwen/.test(m)) return 3; return 9; }

/* ---------- page ---------- */
PAGES['admin-ai'] = { layout:'admin', title:'AI & agents', render:function(params, query){
  aai_ensure();
  /* V12: the AI 360 Control Room has tabs (model picks PR 580, spend caps PR 309,
     data routing PR 310, cost book PR 312–314) — drawn by 89b-admin-agents.js */
  var tab = (query && query.tab) || 'room';
  var head = '<div class="mb24"><div class="eyebrow">Admin · AI 360 Control Room</div><h1 class="h1" style="margin-top:6px">AI &amp; agents</h1>'+
    '<p class="text2 mt8" style="max-width:660px;margin-bottom:0">You decide what AI does, which company and model it uses, when it runs and how much it can spend. Every agent has a plain fallback, so the shop never waits for AI.</p></div>';
  var tabs = typeof za_aiTabs==='function' ? za_aiTabs(tab) : '';
  if(tab!=='room' && typeof za_aiTab==='function') return '<div class="aai-page">'+head+tabs+za_aiTab(tab)+'</div>';
  return '<div class="aai-page">'+head+tabs+
    aai_masterCard()+(typeof za_offProof==='function' ? za_offProof() : '')+
    '<div class="aai-top mt24">'+aai_budgetCard()+aai_providersCard()+'</div>'+
    aai_agentsSection()+
    '<div class="aai-top mt32">'+aai_servicesCard()+aai_alertsCard()+'</div>'+
  '</div>';
}};

function aai_masterCard(){
  var a = ST.ai, on = !!a.master, n = aai_runningCount(), m = a.agents.length;
  var kept = a.agents.filter(function(g){ return !on && aai_running(g); }).map(function(g){ return esc(g.name); });
  var keepable = a.agents.filter(function(g){ return g.keepOn; }).length;
  var provOn = a.providers.filter(function(p){ return p.connected; }).length;
  return '<section class="card aai-master '+(on?'on':'off')+'" data-testid="aai-master-card">'+
    '<div class="aai-mhd">'+
      '<div class="row top" style="gap:14px"><span class="aai-mico">'+ico('spark',24)+'</span><div>'+
        '<div class="eyebrow">Master switch</div><h2 class="h1" style="font-size:26px;margin-top:2px">EXTAS AI</h2>'+
      '</div></div>'+
      '<div class="stack s6" style="align-items:center">'+aai_switch(on, 'aai-master', 'EXTAS AI master switch', 'data-testid="aai-master"').replace('class="switch', 'class="switch aai-big')+'<span class="xs bold" style="letter-spacing:.08em">'+(on?'ON':'OFF')+'</span></div>'+
    '</div>'+
    '<p class="aai-mmsg" data-testid="aai-master-msg">'+(on?'AI is helping across the shop.':'AI is paused — except the agents you chose to keep on. Orders, payments, delivery, rules and reports keep running.')+'</p>'+
    '<div class="aai-kpis">'+
      '<div><b>'+provOn+'<span class="small muted" style="font-family:var(--font-body)"> / '+a.providers.length+'</span></b><span class="xs muted">companies connected</span></div>'+
      '<div><b>'+keepable+'</b><span class="xs muted">kept on if AI is off</span></div>'+
      '<div><b>'+fmt(a.spent)+'</b><span class="xs muted">spent this month</span></div>'+
    '</div>'+
    '<div class="row wrap mt16 aai-under" style="gap:8px 14px"><span class="bold" data-testid="aai-summary">'+n+' of '+m+' agents running</span>'+
      '<div class="aai-bar grow" style="max-width:280px;min-width:120px"><div style="width:'+aai_pct(n,m)+'%"></div></div>'+
      (kept.length ? '<span class="small text2">Still on: '+kept.join(', ')+'</span>' : '')+
    '</div>'+
    '<div class="aai-reassure aai-under">'+ico('shield',20,'style="color:var(--brand);flex-shrink:0"')+'<div><b>Turning AI off never stops your shop.</b> Everything AI already set up stays saved as normal settings.</div></div>'+
  '</section>';
}

function aai_budgetInner(){
  var a = ST.ai, pct = aai_pct(a.spent, a.monthlyCap);
  return '<div style="font-size:16px" data-testid="aai-budget-line">This month <span class="price" style="font-size:24px">'+fmt(a.spent)+'</span> of '+fmt(a.monthlyCap)+'</div>'+
    '<div class="aai-bar mt12'+(pct>=80?' hot':'')+'"><div style="width:'+pct+'%"></div></div>'+
    '<div class="row between xs muted mt8"><span>'+pct+'% used</span><span>'+fmt(Math.max(0, a.monthlyCap - a.spent))+' left · resets on the 1st</span></div>';
}
function aai_capSumText(){
  var a = ST.ai, sum = a.agents.reduce(function(s,g){ return s + (Number(g.cap)||0); }, 0);
  return 'Agent caps add up to '+fmt(sum)+'. The monthly cap above always wins'+(sum>a.monthlyCap?' — agents stop early if the total is reached.':'.');
}
function aai_budgetCard(){
  var a = ST.ai;
  return '<section class="card p20">'+
    '<div class="row between"><h2 class="h2">AI budget</h2><span class="tag plain">'+ico('wallet',13)+'Monthly</span></div>'+
    '<div class="mt16" id="aai-budget">'+aai_budgetInner()+'</div>'+
    '<div class="aai-f2 mt16">'+
      '<div><label class="label" for="aai-cap">Monthly cap (৳)</label><input id="aai-cap" class="input aai-in" type="number" inputmode="numeric" min="0" step="100" value="'+esc(a.monthlyCap)+'" data-input="aai-cap"></div>'+
      '<div><label class="label" for="aai-atlimit">At the limit</label><select id="aai-atlimit" class="input aai-in" data-change="aai-atlimit">'+
        AAI_ATLIMIT.map(function(o){ return '<option value="'+o[0]+'"'+(a.atLimit===o[0]?' selected':'')+'>'+esc(o[1])+'</option>'; }).join('')+'</select></div>'+
    '</div>'+
    '<div class="aai-row mt12" style="border-top:1px solid var(--line2)"><div><div class="bold small">Cost-saver</div><div class="xs muted">simple jobs use a smaller, cheaper model</div></div>'+aai_switch(a.costSaver, 'aai-saver', 'Cost-saver')+'</div>'+
    '<div class="xs muted" id="aai-capsum" style="margin-top:4px">'+esc(aai_capSumText())+'</div>'+
  '</section>';
}

function aai_providersCard(){
  var ps = ST.ai.providers, nOn = ps.filter(function(p){ return p.connected; }).length;
  var rows = ps.map(function(p, i){
    var right = p.connected ? '<button class="link" data-act="aai-disconnect" data-id="'+p.id+'" aria-label="Disconnect '+esc(p.name)+'">Disconnect</button>'
                            : '<button class="btn btn-sm btn-secondary" data-act="aai-connect" data-id="'+p.id+'" data-testid="aai-connect-'+p.id+'">Connect</button>';
    var models = p.connected ? esc(p.models.join(' · ')) : 'Models load after you connect (e.g. '+esc(p.models.slice(0,2).join(', '))+')';
    return '<div class="aai-row'+(i===0?' first':'')+'"><div class="grow"><div class="row wrap" style="gap:8px"><span class="bold small">'+esc(p.name)+'</span>'+(p.connected?'<span class="tag">'+ico('check',12)+'Connected</span>':'')+'</div>'+
      '<div class="xs muted" style="margin-top:3px">'+models+'</div></div>'+right+'</div>';
  }).join('');
  return '<section class="card p20">'+
    '<div class="row between"><h2 class="h2">AI companies</h2><span class="xs muted">'+nOn+' of '+ps.length+' connected</span></div>'+
    '<p class="small text2 mt8" style="margin-bottom:6px">Use different companies for different jobs. Model lists load from each company when connected.</p>'+
    rows+
  '</section>';
}

function aai_agentsSection(){
  var a = ST.ai, n = aai_runningCount();
  return '<div class="row between wrap mt32 mb16" style="align-items:flex-end;gap:8px">'+
      '<div><h2 class="h2">Agents</h2><div class="small text2" style="margin-top:4px">Each agent has its own switch, company, model, schedule and budget.</div></div>'+
      '<span class="small bold">'+n+' of '+a.agents.length+' agents running</span></div>'+
    '<div class="aai-g2">'+a.agents.map(aai_agentCard).join('')+'</div>';
}

function aai_agentCard(g){
  var run = aai_running(g), p = aai_prov(g.provider) || ST.ai.providers[0];
  var open = !!UI['aai-set:'+g.id];
  var sch = AAI_SCHEDULES.indexOf(g.schedule)>=0 ? AAI_SCHEDULES : [g.schedule].concat(AAI_SCHEDULES);
  var models = p.models.indexOf(g.model)>=0 ? p.models : [g.model].concat(p.models);
  var last = aai_lastRun(g.id);
  var provOpts = ST.ai.providers.map(function(x){ return '<option value="'+x.id+'"'+(x.id===p.id?' selected':'')+'>'+esc(x.name)+(x.connected?'':' — not connected')+'</option>'; }).join('');
  return '<article class="card aai-agent'+(run?'':' paused')+'" data-testid="agent-'+g.id+'">'+
    '<div class="row between top" style="gap:12px"><div class="grow"><h3 class="h3" style="font-size:16px">'+esc(g.name)+'</h3><div class="small text2" style="margin-top:3px">'+esc(g.what)+'</div></div>'+aai_statusTag(g)+'</div>'+
    '<div class="aai-sw">'+
      '<div class="aai-row first"><span class="small bold">'+(g.on?'On':'Off')+'</span>'+aai_switch(g.on, 'aai-agent-on', g.name+' on or off', 'data-id="'+g.id+'" data-testid="aai-on-'+g.id+'"')+'</div>'+
      '<div class="aai-row"><span class="small">Keep on even when AI is off</span>'+aai_switch(g.keepOn, 'aai-agent-keep', 'Keep '+g.name+' on even when AI is off', 'data-id="'+g.id+'" data-testid="aai-keep-'+g.id+'"')+'</div>'+
    '</div>'+
    '<button class="link aai-setbtn row" style="gap:4px;text-decoration:none" data-act="aai-set-toggle" data-id="'+g.id+'" aria-expanded="'+open+'">'+ico(open?'up':'down',15)+(open?'Hide settings':'Company, model &amp; schedule')+'</button>'+
    (!open ? '<div class="xs muted aai-setbtn" style="display:block">'+esc(p.name)+' · '+esc(g.model)+' · '+esc(g.schedule)+' · cap '+fmt(g.cap)+'</div>' : '')+
    '<div class="aai-set'+(open?' open':'')+'">'+
      '<div><label class="label" for="aai-p-'+g.id+'">Company</label><select id="aai-p-'+g.id+'" class="input aai-in" data-change="aai-agent" data-field="provider" data-id="'+g.id+'">'+provOpts+'</select></div>'+
      '<div><label class="label" for="aai-m-'+g.id+'">Model</label><select id="aai-m-'+g.id+'" class="input aai-in" data-change="aai-agent" data-field="model" data-id="'+g.id+'">'+models.map(function(m){ return '<option'+(m===g.model?' selected':'')+'>'+esc(m)+'</option>'; }).join('')+'</select></div>'+
      (!p.connected ? '<div class="full aai-warn">'+ico('info',15)+'<span class="grow">Connect this company first — until then this agent uses its fallback.</span><button class="btn btn-sm btn-secondary" data-act="aai-connect" data-id="'+p.id+'">Connect</button></div>' : '')+
      '<div><label class="label" for="aai-s-'+g.id+'">Schedule</label><select id="aai-s-'+g.id+'" class="input aai-in" data-change="aai-agent" data-field="schedule" data-id="'+g.id+'">'+sch.map(function(s){ return '<option'+(s===g.schedule?' selected':'')+'>'+esc(s)+'</option>'; }).join('')+'</select></div>'+
      '<div><label class="label" for="aai-c-'+g.id+'">Monthly cap (৳)</label><input id="aai-c-'+g.id+'" class="input aai-in" type="number" inputmode="numeric" min="0" step="10" value="'+esc(g.cap)+'" data-input="aai-agent-cap" data-id="'+g.id+'"></div>'+
    '</div>'+
    '<div class="aai-fb"><b style="color:var(--ink)">When off:</b> '+esc(g.fallback)+'</div>'+
    (g.perRun || last ? '<div class="row between wrap mt12" style="gap:8px">'+
      (last ? '<span class="xs muted">Last run: '+esc(last.title)+' · '+esc(timeAgo(last.at))+'</span>' : '<span></span>')+
      (g.perRun ? '<button class="btn btn-sm btn-secondary" data-act="aai-run" data-id="'+g.id+'" data-testid="aai-run-'+g.id+'">'+ico('play',13)+'Run now</button>' : '')+
    '</div>' : '')+
  '</article>';
}

function aai_svcInner(s){
  var pct = aai_pct(s.used, s.cap);
  return '<div class="row between small"><span><b>'+fmt(s.used)+'</b> of '+fmt(s.cap)+' this month</span><span class="xs muted">'+pct+'%</span></div>'+
    '<div class="aai-bar mt8'+(pct>=80?' hot':'')+'"><div style="width:'+pct+'%"></div></div>';
}
function aai_servicesCard(){
  var rows = ST.ai.services.map(function(s, i){
    return '<div class="aai-row'+(i===0?' first':'')+'" style="display:block">'+
      '<div class="row between" style="gap:10px"><span class="bold small">'+esc(s.name)+'</span>'+
        '<label class="row xs muted" style="gap:6px">Cap ৳<input class="input aai-in" style="width:96px" type="number" inputmode="numeric" min="0" step="50" value="'+esc(s.cap)+'" data-input="aai-svc-cap" data-id="'+s.id+'" aria-label="'+esc(s.name)+' monthly cap"></label></div>'+
      '<div class="mt8" id="aai-svc-'+s.id+'">'+aai_svcInner(s)+'</div>'+
      '<div class="xs text2 mt8"><b>At limit:</b> '+esc(s.atLimit)+'</div>'+
    '</div>';
  }).join('');
  return '<section class="card p20">'+
    '<div class="row between"><h2 class="h2">Paid services</h2><span class="xs muted">Not AI — but they cost money too</span></div>'+
    '<div class="mt8">'+rows+
      '<div class="aai-row"><div class="grow"><div class="bold small">Azure server</div><div class="xs muted" style="margin-top:3px">Website, database and backups</div></div><span class="tag">'+ico('shield',12)+'Fixed monthly cost — no surprise bills</span></div>'+
    '</div>'+
  '</section>';
}

function aai_alertsCard(){
  var al = ST.ai.alerts;
  return '<section class="card p20">'+
    '<div class="row between"><h2 class="h2">Alerts</h2><span class="tag plain">'+ico('chat',13)+'Telegram</span></div>'+
    '<p class="small text2 mt8" style="margin-bottom:6px">Sent to your Telegram, the same place as the 10 pm report.</p>'+
    '<div class="aai-row first"><span class="small">Telegram me at 80% of any limit</span>'+aai_switch(al.at80, 'aai-alert', 'Telegram me at 80% of any limit', 'data-k="at80"')+'</div>'+
    '<div class="aai-row"><span class="small">Telegram me when something switches to its fallback</span>'+aai_switch(al.fallback, 'aai-alert', 'Telegram me when something switches to its fallback', 'data-k="fallback"')+'</div>'+
    '<div class="soft p16 xs text2 mt8" style="line-height:1.5">'+ico('info',14,'style="display:inline;vertical-align:-2px;margin-right:4px"')+'Example: "SMS is at 80% of its ৳'+Number(ST.ai.services[0] ? ST.ai.services[0].cap : 0).toLocaleString('en-US')+' cap. Offers will pause at the limit; order SMS keep going."</div>'+
  '</section>';
}

/* ---------- actions ---------- */
ACT['aai-master'] = function(){
  var a = aai_ensure(); a.master = !a.master; saveState(); rerender();
  toast(a.master ? 'EXTAS AI is on — agents are back to work' : 'AI paused — your shop keeps running');
};
ACT['aai-saver'] = function(){ ST.ai.costSaver = !ST.ai.costSaver; saveState(); rerender(); toast(ST.ai.costSaver ? 'Cost-saver on' : 'Cost-saver off'); };
ACT['aai-alert'] = function(el){ var k = el.getAttribute('data-k'); var al = aai_ensure().alerts; al[k] = !al[k]; saveState(); rerender(); toast(al[k] ? 'Alert on' : 'Alert off'); };
ACT['aai-agent-on'] = function(el){
  var g = aai_agent(el.getAttribute('data-id')); if(!g) return; g.on = !g.on; saveState(); rerender();
  var msg = g.name+(g.on?' is on':' is off');
  if(g.on && !ST.ai.master) msg += g.keepOn ? ' — it keeps running while AI is off' : ' — it starts when AI is back on';
  toast(msg);
};
ACT['aai-agent-keep'] = function(el){
  var g = aai_agent(el.getAttribute('data-id')); if(!g) return; g.keepOn = !g.keepOn; saveState(); rerender();
  toast(g.keepOn ? g.name+' stays on even when AI is off' : g.name+' pauses with the master switch');
};
ACT['aai-set-toggle'] = function(el){ var k = 'aai-set:'+el.getAttribute('data-id'); UI[k] = !UI[k]; rerender(); };
CHANGE['aai-agent'] = function(el){
  var g = aai_agent(el.getAttribute('data-id')); if(!g) return; var f = el.getAttribute('data-field'), v = el.value;
  if(f==='provider'){ g.provider = v; var p = aai_prov(v); g.model = p ? p.models[0] : g.model; }
  else if(f==='model') g.model = v;
  else if(f==='schedule') g.schedule = v;
  saveState(); rerender(); toast(g.name+' updated');
};
INPUT['aai-agent-cap'] = function(el){
  var g = aai_agent(el.getAttribute('data-id')); var n = parseInt(el.value, 10); if(!g || isNaN(n) || n<0) return;
  g.cap = n; saveState(); var c = document.getElementById('aai-capsum'); if(c) c.textContent = aai_capSumText();
};
INPUT['aai-cap'] = function(el){
  var n = parseInt(el.value, 10); if(isNaN(n) || n<0) return; ST.ai.monthlyCap = n; saveState();
  var b = document.getElementById('aai-budget'); if(b) b.innerHTML = aai_budgetInner();
  var c = document.getElementById('aai-capsum'); if(c) c.textContent = aai_capSumText();
};
CHANGE['aai-atlimit'] = function(el){ ST.ai.atLimit = el.value; saveState(); toast('Saved — at the limit: '+el.options[el.selectedIndex].text); };
INPUT['aai-svc-cap'] = function(el){
  var id = el.getAttribute('data-id'), n = parseInt(el.value, 10); if(isNaN(n) || n<0) return;
  var s = ST.ai.services.filter(function(x){ return x.id===id; })[0]; if(!s) return; s.cap = n; saveState();
  var b = document.getElementById('aai-svc-'+id); if(b) b.innerHTML = aai_svcInner(s);
};

/* ---------- connect a company (demo) ---------- */
function aai_connectHTML(){
  var u = UI['aai-connect'] || {}, p = aai_prov(u.id); if(!p) return '';
  var local = p.id==='local';
  return '<form data-submit="aai-connect" class="stack s16">'+
    '<p class="small text2" style="margin:0">'+(local ? 'Enter the address of your own AI server. Nothing leaves your server.' : 'Paste your API key from <b>'+esc(p.name)+'</b>. It is stored encrypted on your server and only used for the jobs you choose.')+'</p>'+
    '<div><label class="label" for="aai-key">'+(local?'Server address':'API key')+'</label>'+
      '<input id="aai-key" name="key" class="input" '+(local?'type="text" placeholder="http://your-server:11434"':'type="password" autocomplete="off" placeholder="Paste key here"')+'>'+
      (u.err ? '<div class="xs mt8" style="color:var(--sale)">'+esc(u.err)+'</div>' : '<div class="xs muted mt8">Demo: type anything.</div>')+'</div>'+
    '<div class="soft p16 xs text2">After connecting, EXTAS loads the model list from '+esc(p.name)+' (for example '+esc(p.models.join(', '))+'). You can then pick it for any agent.</div>'+
    '<div class="row end"><button type="button" class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-testid="aai-connect-save">'+ico('link',16)+'Connect</button></div>'+
  '</form>';
}
ACT['aai-connect'] = function(el){
  var id = el.getAttribute('data-id'), p = aai_prov(id); if(!p) return;
  var back = MODAL && MODAL.opts && MODAL.opts.aaiRun ? UI['aai-run'] : null;
  UI['aai-connect'] = {id:id, err:'', back:back};
  openModal(aai_connectHTML(), {title:'Connect '+p.name, rebuild:aai_connectHTML});
  setTimeout(function(){ var k = document.getElementById('aai-key'); if(k) k.focus(); }, 30);
};
SUBMIT['aai-connect'] = function(f){
  var u = UI['aai-connect'] || {}, p = aai_prov(u.id); if(!p) return;
  var v = (f.querySelector('[name=key]').value || '').trim();
  if(!v){ u.err = p.id==='local' ? 'Enter your server address to continue.' : 'Paste the API key to continue.'; refreshModal(); return; }
  p.connected = true; saveState(); closeModal(); rerender();
  toast(p.name+' connected — '+plural(p.models.length, 'model')+' loaded');
  if(u.back){ UI['aai-run'] = u.back; u.back.phase = 0; aai_openRun(); }
};
ACT['aai-disconnect'] = function(el){
  var p = aai_prov(el.getAttribute('data-id')); if(!p) return;
  var using = ST.ai.agents.filter(function(g){ return g.provider===p.id; }).length;
  p.connected = false; saveState(); rerender();
  toast(p.name+' disconnected'+(using ? ' — '+plural(using,'agent')+' will use '+(using===1?'its':'their')+' fallback' : ''));
};

/* ---------- run an agent once (per-run company & model) ---------- */
function aai_runHTML(){
  var u = UI['aai-run']; if(!u) return ''; var g = aai_agent(u.agent); if(!g) return '';
  var p = aai_prov(u.provider) || ST.ai.providers[0];
  var steps = AAI_STEPS[g.id] || ['Getting ready','Working','Saving the result'];
  var where = AAI_WHERE[g.id] || 'Reports';
  if(u.phase===4){
    return '<div class="stack s16" style="align-items:center;text-align:center;padding:8px 0" data-testid="aai-run-done">'+
      '<span class="aai-okc">'+ico('check',26)+'</span>'+
      '<div><div class="h2">Draft saved</div><div class="small text2 mt8">Saved to <b>'+esc(where)+'</b>. Nothing goes live until you approve it.</div></div>'+
      '<div class="soft p16 xs text2" style="width:100%;text-align:left;line-height:1.7"><b>'+esc(u.title)+'</b><br>Made with '+esc(p.name)+' · '+esc(u.model)+' · about '+fmt(u.cost)+' of your AI budget</div>'+
      '<div class="row" style="width:100%;gap:10px"><button class="btn btn-ghost grow" data-act="close-modal">Close</button><button class="btn btn-primary grow" data-act="aai-run-again">Run again</button></div>'+
    '</div>';
  }
  if(u.phase>0){
    return '<div class="stack s16">'+
      '<div class="small text2">'+esc(g.name)+' is working with <b>'+esc(p.name)+' · '+esc(u.model)+'</b>…</div>'+
      '<div class="aai-steps">'+steps.map(function(s, i){ var n = i+1, st = n<u.phase ? 'done' : (n===u.phase ? 'now' : '');
        return '<div class="aai-step '+st+'"><span class="aai-sdot">'+(st==='done'?ico('check',14):'')+'</span><span>'+esc(s)+(st==='now'?'…':'')+'</span></div>'; }).join('')+'</div>'+
      '<div class="aai-bar"><div style="width:'+Math.round((u.phase-1)/3*100+12)+'%"></div></div>'+
      '<div class="xs muted">You can close this window — the result will still be saved.</div>'+
    '</div>';
  }
  var connected = !!p.connected, run = aai_running(g);
  return '<div class="stack s16">'+
    '<p class="small text2" style="margin:0">'+esc(g.what)+'. Pick the company and model for <b>this run only</b> — the agent\'s normal settings stay the same.</p>'+
    (!run ? '<div class="soft p16 xs text2">'+ico('info',14,'style="display:inline;vertical-align:-2px;margin-right:4px"')+'This agent is paused right now. Running it once is fine — it stays paused afterwards.</div>' : '')+
    '<div class="grid g2" style="gap:10px">'+
      '<div><label class="label" for="aai-rp">Company</label><select id="aai-rp" class="input aai-in" data-change="aai-run-prov">'+ST.ai.providers.map(function(x){ return '<option value="'+x.id+'"'+(x.id===p.id?' selected':'')+'>'+esc(x.name)+(x.connected?'':' — not connected')+'</option>'; }).join('')+'</select></div>'+
      '<div><label class="label" for="aai-rm">Model</label><select id="aai-rm" class="input aai-in" data-change="aai-run-model">'+p.models.map(function(m){ return '<option'+(m===u.model?' selected':'')+'>'+esc(m)+'</option>'; }).join('')+'</select></div>'+
    '</div>'+
    (!connected ? '<div class="aai-warn">'+ico('info',15)+'<span class="grow">Connect this company first</span><button class="btn btn-sm btn-secondary" data-act="aai-connect" data-id="'+p.id+'">Connect</button></div>' : '')+
    '<div><label class="label" for="aai-topic">Topic and instructions</label><textarea id="aai-topic" class="input" rows="4" data-input="aai-run-topic">'+esc(u.topic)+'</textarea>'+
      '<div class="xs muted mt8">About '+fmt(aai_cost(u.model))+' with this model · result is saved to '+esc(where)+'</div></div>'+
    '<div class="row end"><button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="aai-run-start" data-testid="aai-run-start"'+(connected?'':' disabled')+'>'+ico('play',14)+'Start</button></div>'+
  '</div>';
}
function aai_openRun(){
  var u = UI['aai-run'], g = u && aai_agent(u.agent); if(!g) return;
  openModal(aai_runHTML(), {title:'Run '+g.name+' now', rebuild:aai_runHTML, aaiRun:true});
}
ACT['aai-run'] = function(el){
  var g = aai_agent(el.getAttribute('data-id')); if(!g) return;
  UI['aai-run'] = {agent:g.id, provider:g.provider, model:g.model, topic:AAI_TOPIC[g.id] || '', phase:0, token:0};
  aai_openRun();
};
CHANGE['aai-run-prov'] = function(el){ var u = UI['aai-run']; if(!u) return; u.provider = el.value; var p = aai_prov(el.value); u.model = p ? p.models[0] : u.model; refreshModal(); };
CHANGE['aai-run-model'] = function(el){ var u = UI['aai-run']; if(!u) return; u.model = el.value; refreshModal(); };
INPUT['aai-run-topic'] = function(el){ var u = UI['aai-run']; if(u) u.topic = el.value; };
ACT['aai-run-again'] = function(){ var u = UI['aai-run']; if(!u) return; u.phase = 0; refreshModal(); };
ACT['aai-run-start'] = function(){
  var u = UI['aai-run']; if(!u || u.phase) return;
  var p = aai_prov(u.provider); if(!p || !p.connected){ toast('Connect this company first'); return; }
  var tok = u.token = Date.now(); u.phase = 1; refreshModal();
  [1,2,3].forEach(function(i){
    setTimeout(function(){
      if(UI['aai-run']!==u || u.token!==tok) return;
      u.phase = i+1;
      if(u.phase===4) aai_finishRun(u);
      if(MODAL && MODAL.opts && MODAL.opts.aaiRun) refreshModal();
    }, i*700);
  });
};
function aai_finishRun(u){
  var g = aai_agent(u.agent), where = AAI_WHERE[u.agent] || 'Reports';
  var first = String(u.topic||'').split('\n')[0].replace(/^\s*(topic|check|product)\s*:\s*/i, '').trim();
  u.title = first || (g.name+' draft');
  u.cost = aai_cost(u.model);
  var a = aai_ensure(); a.spent += u.cost;
  a.runs.unshift({agent:u.agent, title:u.title, where:where, provider:u.provider, model:u.model, at:Date.now(), cost:u.cost});
  a.runs = a.runs.slice(0, 20);
  saveState(); rerender();
  toast('Draft saved — '+where);
}
