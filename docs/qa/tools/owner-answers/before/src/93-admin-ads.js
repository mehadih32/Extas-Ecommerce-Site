/* =====================================================================
   93-admin-ads.js — তীরন্দাজ Tirondaj A360-07 · Ads & tracking (S13, PR 256–270, 278, 283, 531, 581)
   #/admin/ads                 overview: guardrails, kill switch, today
   #/admin/ads?tab=campaigns   Meta · Google/YouTube · TikTok campaigns
   #/admin/ads?tab=approvals   budget increases waiting for the owner
   #/admin/ads?tab=delivered   platform purchases vs our orders vs delivered (COD)
   #/admin/ads?tab=tracking    pixel / CAPI, Google tag, TikTok events (PR 257–258)
   #/admin/ads?tab=creatives   creative library from the studio (PR 270)
   #/admin/ads?tab=connect     platform connection checklist
   #/admin/ads?tab=log         every change, before → after
   ONE source of truth: guardrails, campaigns, suggestions and the log are
   the same record the agent profile uses (za_tir() in 89b-admin-agents.js),
   so an approval here shows there and the other way round.
   RULES (enforced here, not by the agent): any budget increase waits for the
   owner; an approval that would cross the daily ceiling is refused; cuts and
   pauses are allowed only when "auto-decrease" is on; kill switch stops all.
   DEMO: every campaign number is simulated — no platform is called.
   Owner-facing text in simple Bengali. Prefix zd_.
   ===================================================================== */
zo_route(/^\/admin\/ads$/, 'zd-page');
zo_link(['Ads & tracking','#/admin/ads','eye','Ads & tracking']);

function zd_st(){ var o = zo_ops(); if(!o.ads) o.ads = {usd:122, tests:{}, conn:{}, cre:{}, pf:'all', paused:{}}; return o.ads; }
function zd_t(){
  if(typeof za_tir==='function') return za_tir();
  var s = zd_st();
  if(!s.tir) s.tir = {guard:{target:600, cpa:180, daily:6000, monthly:150000, autoDown:true, killed:false}, camps:[], sugg:[], log:[], sold:0};
  return s.tir;
}
function zd_pf(c){ return /Facebook|Instagram/i.test(c.pf) ? 'meta' : /TikTok/i.test(c.pf) ? 'tiktok' : 'google'; }
var ZD_PF = {meta:['Meta','Facebook · Instagram'], google:['Google','Search · PMax · YouTube'], tiktok:['TikTok','TikTok']};
/* our side of each campaign: orders we received and how many were truly delivered (COD) */
function zd_ours(c){
  var orders = Math.max(0, Math.round(c.buys * (0.9 + zs_rnd(c.id+'o')*0.12)));
  var refused = Math.round(orders * (0.06 + zs_rnd(c.id+'r')*0.16)), pending = Math.round(orders * 0.12);
  var delivered = Math.max(0, orders - refused - pending);
  return {orders:orders, delivered:delivered, refused:refused, pending:pending, cpaD:c.spend/Math.max(1,delivered), cpaP:c.spend/Math.max(1,c.buys)};
}
function zd_spendToday(t){ return t.camps.reduce(function(s,c){ return s + (c.st==='Paused'||t.guard.killed ? 0 : c.spend); }, 0); }
function zd_budgetToday(t){ return t.camps.reduce(function(s,c){ return s + (c.st==='Paused'||t.guard.killed ? 0 : c.budget); }, 0); }
function zd_usd(n){ var r = +zd_st().usd || 0; return r ? '$'+(n/r).toFixed(n/r<100?1:0) : ''; }
function zd_log(text, src){ var t = zd_t(); t.log.unshift({at:Date.now(), src:src||'Owner', text:text}); t.log = t.log.slice(0, 300); }
function zd_act(c, g){
  if(typeof za_campAct==='function') return za_campAct(c, g);
  var cpa = c.buys ? c.spend/c.buys : c.spend;
  if(g.killed) return ['Stopped by kill switch','none']; if(c.st==='Paused') return ['Paused','none'];
  if(cpa > g.cpa) return ['Cut budget 30%', g.autoDown?'cut':'ask']; return ['Keep','none'];
}
var ZD_ACT_BN = {'Keep':'যেমন আছে রাখুন','Paused':'বন্ধ আছে','Stopped by kill switch':'কিল সুইচে বন্ধ','Wait — still learning':'শিখছে — অপেক্ষা','Raise budget — needs your approval':'বাজেট বাড়ানো যায় — আপনার অনুমতি লাগবে','Cut budget 30% — CPA over cap':'সীমার চেয়ে খরচ বেশি — বাজেট ৩০% কমানো'};
function zd_actBn(a){ return ZD_ACT_BN[a] || (/^Pause/.test(a) ? 'খরচ অনেক বেশি — বন্ধ করা উচিত' : a); }

PAGES['zd-page'] = { layout:'admin', title:'Ads & tracking', render:function(params, q){
  var tab = (q && q.tab) || 'overview', t = zd_t(), wait = t.sugg.filter(function(s){ return s.st==='wait'; }).length;
  var tabs = zo_tabs('#/admin/ads', [['overview','Overview'],['campaigns','Campaigns', t.camps.length],['approvals','Approvals', wait || ''],['delivered','Delivered vs orders'],['tracking','Tracking'],['creatives','Creatives'],['connect','Connections'],['log','Change log']], tab);
  var body = {campaigns:zd_camps, approvals:zd_appr, delivered:zd_deliv, tracking:zd_track, creatives:zd_cre, connect:zd_conn, log:zd_logTab}[tab] || zd_over;
  return '<div class="zs-page zd-page">'+
    zo_head('Admin · Ads '+zs_pr('256–270 · 278 · 283 · 531 · 581'), 'Ads & tracking', 'বিজ্ঞাপন — তীরন্দাজ চালায়, আপনি সীমা ঠিক করেন',
      'ফেসবুক, ইনস্টাগ্রাম, গুগল, ইউটিউব আর টিকটকের অ্যাড তীরন্দাজ (A360-07) নিজে চালায়। খরচ কমাতে পারে, কিন্তু বাজেট বাড়াতে সবসময় আপনার অনুমতি লাগে। আমরা অর্ডার না, আসল ডেলিভারি গুনি — কারণ COD-তে ফেরত পার্সেলে টাকা যায়।',
      zs_simTag('Demo · simulated')+'<a class="btn btn-ghost" href="#/admin/agents/tirondaj">'+ico('user',16)+'Tirondaj</a>')+
    (t.guard.killed ? '<div class="zs-note warn mb16" data-testid="zd-killed">'+ico('info',17)+'<div class="zs-bnp"><b>সব অ্যাড বন্ধ (কিল সুইচ)।</b> কোনো প্ল্যাটফর্মে কোনো খরচ হচ্ছে না। <button type="button" class="zs-link" data-act="zd-kill">আবার চালু করুন</button></div></div>' : '')+
    tabs+body(t)+'</div>';
}};

/* ---------- overview ---------- */
function zd_over(t){
  var g = t.guard, sp = zd_spendToday(t), buys = t.camps.reduce(function(s,c){ return s + c.buys; }, 0);
  var del = t.camps.reduce(function(s,c){ return s + zd_ours(c).delivered; }, 0), wait = t.sugg.filter(function(s){ return s.st==='wait'; });
  var month = Math.round(sp * (new Date().getDate()) * 0.93);
  return '<div class="zs-kpis k6">'+
      '<div class="zs-k '+(sp>g.daily?'bad':'')+'"><div class="v">'+fmt(sp)+'</div><div class="l">আজকের খরচ</div><div class="s">সীমা '+fmt(g.daily)+' · '+zd_usd(sp)+'</div></div>'+
      '<div class="zs-k"><div class="v">'+buys+'</div><div class="l">প্ল্যাটফর্মের হিসাবে বিক্রি</div><div class="s">platform purchases</div></div>'+
      '<div class="zs-k ok"><div class="v">'+del+'</div><div class="l">আসল ডেলিভারি</div><div class="s">COD paid · delivered</div></div>'+
      '<div class="zs-k '+(sp/Math.max(1,del)>g.cpa?'bad':'ok')+'"><div class="v">'+fmt(sp/Math.max(1,del))+'</div><div class="l">ডেলিভারি প্রতি খরচ</div><div class="s">সীমা '+fmt(g.cpa)+'</div></div>'+
      '<div class="zs-k"><div class="v">'+fmt(month)+'</div><div class="l">এই মাসে খরচ</div><div class="s">সীমা '+fmt(g.monthly)+'</div>'+zs_bar(month/Math.max(1,g.monthly)*100, month>g.monthly*.9?'warn':'')+'</div>'+
      '<div class="zs-k"><div class="v">'+t.sold+' / '+g.target+'</div><div class="l">মাসের বিক্রি লক্ষ্য</div>'+zs_bar(t.sold/Math.max(1,g.target)*100)+'</div>'+
    '</div>'+
    '<div class="zs-g2">'+zd_guardCard(t)+
      '<div style="display:flex;flex-direction:column;gap:16px;min-width:0">'+
        '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">অনুমতির অপেক্ষায়</h2><span class="zo-pill '+(wait.length?'warn':'')+'">'+wait.length+'</span></div><div class="zs-sub">Budget increases waiting for you</div>'+
          (wait.length ? '<div class="zs-list">'+wait.map(zd_suggRow).join('')+'</div>' : '<div class="zs-mini za-bn">এখন কিছু নেই।</div>')+'</section>'+
        zd_killCard(t)+
        '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">প্ল্যাটফর্ম অনুযায়ী আজ</h2>'+zs_simTag()+'</div>'+
          Object.keys(ZD_PF).map(function(k){ var cs = t.camps.filter(function(c){ return zd_pf(c)===k; }), s = cs.reduce(function(a,c){ return a + (c.st==='Paused'||g.killed?0:c.spend); }, 0), d = cs.reduce(function(a,c){ return a + zd_ours(c).delivered; }, 0);
            return '<div class="zs-rep-g"><span class="small"><b>'+ZD_PF[k][0]+'</b> <span class="zs-mini">'+plural(cs.length,'campaign')+' · '+d+' delivered</span></span><b class="small">'+fmt(s)+'</b>'+zs_bar(s/Math.max(1,sp)*100)+'</div>'; }).join('')+'</section>'+
      '</div></div>';
}
function zd_guardCard(t){
  var g = t.guard;
  var num = function(k, bn, en, step){ return '<div class="zp-f"><label class="label" for="zd-g-'+k+'"><span class="za-bn">'+bn+'</span> <span class="zs-mini">'+en+'</span></label><input id="zd-g-'+k+'" class="input zs-in" type="number" inputmode="numeric" min="0" step="'+(step||10)+'" value="'+g[k]+'" data-change="zd-guard" data-k="'+k+'" data-testid="zd-g-'+k+'"></div>'; };
  return '<section class="zs-card" data-testid="zd-guard"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">আপনার সীমা (গার্ডরেল)</h2>'+zs_pr('581 · 266 · 267')+'</div>'+
    '<div class="zs-sub za-bn">এই সীমা কোড মেনে চলে — এজেন্ট চাইলেও পার হতে পারে না</div>'+
    '<div class="za-f2">'+num('target','মাসে কয়টা বিক্রি চাই','Sales target', 10)+num('cpa','একটা বিক্রিতে সর্বোচ্চ খরচ (৳)','Max cost per purchase', 5)+num('daily','দিনে সর্বোচ্চ খরচ (৳)','Daily ceiling', 100)+num('monthly','মাসে সর্বোচ্চ খরচ (৳)','Monthly ceiling', 1000)+'</div>'+
    '<div class="zp-f"><label class="label" for="zd-usd"><span class="za-bn">ডলারের রেট (৳ / $)</span> <span class="zs-mini">USD rate · PR 266</span></label><input id="zd-usd" class="input zs-in" type="number" inputmode="decimal" min="1" step="0.5" value="'+esc(zd_st().usd)+'" data-change="zd-usd"></div>'+
    '<div class="zs-row"><div class="grow"><div class="small bold za-bn">নিজে খরচ কমাতে পারবে</div><div class="zs-mini">Auto-decrease · সীমা ছাড়ালে বাজেট কমায় বা থামায়</div></div>'+zs_sw(g.autoDown, 'zd-auto', 'Auto-decrease allowed', 'data-testid="zd-auto"')+'</div>'+
    '<div class="zs-row"><div class="grow"><div class="small bold za-bn">বাজেট বাড়াতে সবসময় আপনার অনুমতি</div><div class="zs-mini">Budget increase only with approval · বদলানো যায় না</div></div><span class="tag">'+ico('lock',12)+'Always</span></div>'+
  '</section>';
}
function zd_killCard(t){
  var k = t.guard.killed;
  return '<section class="zs-card zd-kill'+(k?' on':'')+'"><div class="row between wrap" style="gap:10px"><div style="min-width:0"><h2 class="za-bn">কিল সুইচ</h2><div class="zs-mini za-bn">এক চাপে সব প্ল্যাটফর্মের সব অ্যাড বন্ধ</div></div>'+
    '<button type="button" class="btn '+(k?'btn-secondary':'btn-dark')+'" data-act="zd-kill" data-testid="zd-kill">'+ico(k?'play':'close',16)+(k?'আবার চালু করুন':'সব অ্যাড এখনই বন্ধ')+'</button></div></section>';
}
CHANGE['zd-guard'] = function(el){ var g = zd_t().guard, k = el.getAttribute('data-k'), n = parseInt(el.value, 10); if(isNaN(n) || n<0) return; var b = g[k]; g[k] = n; zd_log('Guardrail '+k+': '+b+' → '+n); saveState(); rerender(); toast('সীমা সেভ হয়েছে — সাথে সাথে চালু'); };
CHANGE['zd-usd'] = function(el){ var n = parseFloat(el.value); if(!(n>0)) return; var b = zd_st().usd; zd_st().usd = n; zd_log('USD rate: ৳'+b+' → ৳'+n); saveState(); rerender(); toast('ডলারের রেট সেভ — সব খরচ নতুন রেটে'); };
ACT['zd-auto'] = function(){ var g = zd_t().guard; g.autoDown = !g.autoDown; zd_log('Auto-decrease '+(g.autoDown?'on':'off')); saveState(); rerender(); toast(g.autoDown ? 'তীরন্দাজ নিজে খরচ কমাতে পারবে' : 'এখন থেকে কমাতেও আপনার অনুমতি লাগবে'); };
ACT['zd-kill'] = function(){
  var g = zd_t().guard;
  if(g.killed){ g.killed = false; zd_log('Kill switch off — ads resumed', 'Owner'); saveState(); rerender(); toast('অ্যাড আবার চালু (ডেমো)'); return; }
  openModal('<div class="zs-bnp" style="font-size:15px">সব প্ল্যাটফর্মের (Meta, Google, YouTube, TikTok) সব অ্যাড এখনই বন্ধ হবে। পরে এক চাপে আবার চালু করা যাবে।</div>'+
    '<div class="zs-actions mt16"><button type="button" class="btn btn-dark" data-act="zd-killgo" data-testid="zd-killgo">'+ico('close',16)+'হ্যাঁ, সব বন্ধ করুন</button><button type="button" class="btn btn-ghost" data-act="close-modal">না</button></div>', {title:'সব অ্যাড বন্ধ করবেন?'});
};
ACT['zd-killgo'] = function(){ var g = zd_t().guard; g.killed = true; zd_log('Kill switch: every ad on every platform stopped', 'Owner'); closeModal(); saveState(); rerender(); toast('সব অ্যাড বন্ধ (ডেমো)'); };

/* ---------- approvals ---------- */
function zd_suggRow(s){
  var t = zd_t(), c = t.camps.filter(function(x){ return x.id===s.camp; })[0];
  var after = zd_budgetToday(t) - (c ? c.budget : 0) + s.to, over = after > t.guard.daily;
  return '<div class="zs-li zd-sugg" data-testid="zd-sugg"><div style="min-width:0"><div class="t">'+esc(c ? c.name : s.text)+'</div>'+
    '<div class="zd-ft"><span class="strike">'+fmt(s.from)+'</span> → <b>'+fmt(s.to)+'</b> <span class="zs-mini">/ দিন · +'+fmt(s.to-s.from)+'</span></div>'+
    '<div class="m"><span class="za-bn">কেন:</span> '+esc(s.why)+'</div>'+
    (s.st==='wait' && over ? '<div class="m zd-warn za-bn">অনুমোদন দিলে দিনের মোট বাজেট '+fmt(after)+' — আপনার দিনের সীমা '+fmt(t.guard.daily)+' ছাড়িয়ে যাবে। আগে সীমা বাড়ান।</div>' : '')+'</div>'+
    '<div class="r">'+(s.st==='wait' ? '<button type="button" class="btn btn-sm btn-primary" data-act="zd-sugg" data-id="'+s.id+'" data-v="ok"'+(over?' aria-disabled="true"':'')+'>'+ico('check',14)+'Approve</button><button type="button" class="btn btn-sm btn-ghost" data-act="zd-sugg" data-id="'+s.id+'" data-v="no">Reject</button>'
      : '<span class="zo-pill '+(s.st==='ok'?'ok':'')+'">'+(s.st==='ok'?'Approved':'Rejected')+'</span>')+'</div></div>';
}
function zd_appr(t){
  var wait = t.sugg.filter(function(s){ return s.st==='wait'; }), done = t.sugg.filter(function(s){ return s.st!=='wait'; });
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">বাজেট বাড়ানোর অনুরোধ</h2>'+zs_pr('269 · 581')+'</div>'+
      '<div class="zs-sub za-bn">তীরন্দাজ কারণসহ জানায় — আপনি হ্যাঁ বললেই বাড়ে। টেলিগ্রাম থেকেও অনুমতি দেওয়া যায়।</div>'+
      (wait.length ? '<div class="zs-list">'+wait.map(zd_suggRow).join('')+'</div>' : '<div class="zs-empty za-bn">অপেক্ষায় কিছু নেই। ক্যাম্পেইন ট্যাবে "Ask approval" থেকে নতুন অনুরোধ আসে।</div>')+'</section>'+
    (done.length ? '<section class="zs-card zo-mt"><h2 class="za-bn">আগের সিদ্ধান্ত</h2><div class="zs-list mt8">'+done.map(zd_suggRow).join('')+'</div></section>' : '');
}
ACT['zd-sugg'] = function(el){
  var t = zd_t(), s = t.sugg.filter(function(x){ return x.id===el.getAttribute('data-id'); })[0]; if(!s || s.st!=='wait') return;
  var c = t.camps.filter(function(x){ return x.id===s.camp; })[0];
  if(el.getAttribute('data-v')==='ok'){
    var after = zd_budgetToday(t) - (c ? c.budget : 0) + s.to;
    if(after > t.guard.daily){ toast('দিনের সীমা ছাড়িয়ে যায় — আগে সীমা বাড়ান'); return; }
    s.st = 'ok'; if(c){ var b = c.budget; c.budget = s.to; zd_log('Approved budget increase · '+c.name+': '+fmt(b)+' → '+fmt(s.to)+' / day'); }
    toast('অনুমোদন হয়েছে — বাজেট বাড়ল (ডেমো)');
  } else { s.st = 'no'; zd_log('Rejected budget increase · '+(c?c.name:s.text)+' stays '+fmt(s.from)+' / day'); toast('বাতিল — বাজেট আগের মতোই'); }
  saveState(); rerender();
};

/* ---------- campaigns ---------- */
function zd_camps(t){
  var s = zd_st(), g = t.guard, pf = s.pf || 'all';
  var list = t.camps.filter(function(c){ return pf==='all' || zd_pf(c)===pf; });
  var rows = list.map(function(c){
    var o = zd_ours(c), a = zd_act(c, g), roas = c.rev/Math.max(1,c.spend), over = o.cpaD > g.cpa, live = !(g.killed || c.st==='Paused');
    var btn = a[1]==='cut' || a[1]==='pause' ? '<button type="button" class="btn btn-sm btn-secondary" data-act="zd-camp" data-id="'+c.id+'" data-v="'+a[1]+'">Apply</button>' : a[1]==='raise' ? '<button type="button" class="btn btn-sm btn-ghost" data-act="zd-camp" data-id="'+c.id+'" data-v="raise">Ask approval</button>' : a[1]==='ask' ? '<span class="zs-mini za-bn">নিজে কমানো বন্ধ — আপনার সিদ্ধান্ত</span>' : '';
    return '<div class="zd-camp" data-testid="zd-camp"><div class="zd-cm"><div class="small bold zd-cn">'+esc(c.name)+'</div><div class="zs-mini">'+esc(c.pf)+' · '+fmt(c.budget)+'/day · <span class="zo-pill '+(g.killed||c.st==='Paused'?'':'ok')+'">'+(g.killed?'Stopped':esc(c.st))+'</span></div></div>'+
      '<div class="zd-nums"><span><i>খরচ</i><b>'+fmt(c.spend)+'</b></span><span><i>প্ল্যাটফর্ম বিক্রি</i><b>'+c.buys+'</b></span><span><i>ডেলিভারি</i><b>'+o.delivered+'</b></span><span><i>ডেলিভারি প্রতি</i><b class="'+(over?'zd-bad':'')+'">'+fmt(o.cpaD)+'</b></span><span><i>ROAS</i><b>'+roas.toFixed(1)+'</b></span></div>'+
      '<div class="zd-do"><div class="zs-mini za-bn">'+esc(zd_actBn(a[0]))+'</div><div class="zs-actions">'+btn+(g.killed ? '' : '<button type="button" class="btn btn-sm btn-ghost" data-act="zd-pause" data-id="'+c.id+'">'+(live?'Pause':'Resume')+'</button>')+'</div></div></div>';
  }).join('');
  return '<div class="zs-tabs">'+[['all','All'],['meta','Meta'],['google','Google · YouTube'],['tiktok','TikTok']].map(function(p){ var n = p[0]==='all' ? t.camps.length : t.camps.filter(function(c){ return zd_pf(c)===p[0]; }).length; return '<button type="button" class="chip'+(pf===p[0]?' on':'')+'" data-act="zd-pf" data-p="'+p[0]+'">'+p[1]+' <span class="zo-cnt">'+n+'</span></button>'; }).join('')+'</div>'+
    '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">ক্যাম্পেইন</h2><span class="row" style="gap:6px">'+zs_pr('256 · 259–261 · 268 · 531')+zs_simTag()+'</span></div>'+
      '<div class="zs-sub za-bn">"ডেলিভারি প্রতি খরচ" = আজকের খরচ ÷ আসল ডেলিভারি। লাল হলে আপনার সীমার উপরে।</div>'+(rows || '<div class="zs-empty">No campaigns on this platform.</div>')+
      '<div class="zs-actions mt12"><button type="button" class="btn btn-sm btn-secondary" data-act="zd-newcamp">'+ico('plus',14)+'New campaign (draft)</button></div></section>';
}
ACT['zd-pf'] = function(el){ zd_st().pf = el.getAttribute('data-p'); saveState(); rerender(); };
ACT['zd-pause'] = function(el){ var t = zd_t(), c = t.camps.filter(function(x){ return x.id===el.getAttribute('data-id'); })[0]; if(!c) return; var b = c.st; c.st = c.st==='Paused' ? 'Active' : 'Paused'; zd_log(c.name+': '+b+' → '+c.st); saveState(); rerender(); toast(c.name+(c.st==='Paused'?' বন্ধ':' চালু')); };
ACT['zd-camp'] = function(el){
  var t = zd_t(), c = t.camps.filter(function(x){ return x.id===el.getAttribute('data-id'); })[0], v = el.getAttribute('data-v'); if(!c) return;
  if((v==='cut' || v==='pause') && !t.guard.autoDown){ toast('নিজে কমানো বন্ধ আছে'); return; }
  if(v==='pause'){ c.st = 'Paused'; zd_log('Paused '+c.name+' — cost per purchase far over the cap · before '+fmt(c.budget)+'/day', 'Tirondaj'); toast(c.name+' বন্ধ করা হল'); }
  else if(v==='cut'){ var b = c.budget; c.budget = Math.round(c.budget*0.7/10)*10; c.spend = Math.round(c.spend*0.7); zd_log('Cut '+c.name+' '+fmt(b)+' → '+fmt(c.budget)+' / day', 'Tirondaj'); toast('বাজেট কমে '+fmt(c.budget)+' / দিন'); }
  else if(v==='raise'){
    if(!t.sugg.some(function(s){ return s.camp===c.id && s.st==='wait'; })){ var to = Math.round(c.budget*1.4/10)*10; t.sugg.unshift({id:'s'+Date.now(), camp:c.id, from:c.budget, to:to, text:c.name+' '+fmt(c.budget)+' → '+fmt(to)+' / day', why:'CPA '+fmt(c.spend/Math.max(1,c.buys))+' vs cap '+fmt(t.guard.cpa)+', ROAS '+(c.rev/Math.max(1,c.spend)).toFixed(1), st:'wait'}); zd_log('Asked approval: '+c.name+' '+fmt(c.budget)+' → '+fmt(to)+' / day', 'Tirondaj'); }
    toast('অনুমতির জন্য পাঠানো হয়েছে (টেলিগ্রামেও)');
  }
  saveState(); rerender();
};
ACT['zd-newcamp'] = function(){
  openModal('<div class="zs-bnp">নতুন ক্যাম্পেইন তীরন্দাজ খসড়া করে — অডিয়েন্স, অফার, ক্রিয়েটিভ, সময়, বাজেট (PR 256)। আপনার সীমার ভিতরে থাকলেও চালুর আগে আপনাকে দেখানো হয়।</div>'+
    '<div class="zo-kv mt12"><span>Platform</span><span>Meta · Advantage+ shopping</span><span>Offer</span><span>Solid Polo 2-piece combo · ৳1,800</span><span>Landing</span><span>#/combos/solid-polo-2</span><span>Audience</span><span>Dhaka + Chattogram, 20–40, excluding refused-parcel list</span><span>Budget</span><span>'+fmt(800)+' / day</span><span>Optimise for</span><span>Delivered purchase (PR 258)</span></div>'+
    '<div class="zs-actions mt16"><button type="button" class="btn btn-primary" data-act="zd-newgo">'+ico('check',15)+'Save as draft</button><button type="button" class="btn btn-ghost" data-act="close-modal">Cancel</button></div>', {title:'New campaign · draft'});
};
ACT['zd-newgo'] = function(){ zd_log('Draft campaign saved: Solid Polo combos · Meta · ৳800/day (not live)', 'Tirondaj'); closeModal(); saveState(); rerender(); toast('খসড়া সেভ — চালু হয়নি'); };

/* ---------- delivered vs orders ---------- */
function zd_deliv(t){
  var rows = t.camps.map(function(c){ var o = zd_ours(c); return {c:c, o:o}; });
  var T = rows.reduce(function(a,r){ a.sp += r.c.spend; a.b += r.c.buys; a.or += r.o.orders; a.d += r.o.delivered; a.r += r.o.refused; a.p += r.o.pending; return a; }, {sp:0,b:0,or:0,d:0,r:0,p:0});
  var excl = 0; try{ if(typeof zr_all==='function') excl = zr_all().filter(function(c){ return c.ref>0; }).length; }catch(e){}
  var dist = [['Dhaka',92],['Gazipur',88],['Narayanganj',86],['Chattogram',81],['Sylhet',79],['Cumilla',74],['Bogura',70],['Cox\'s Bazar',63]];
  return '<div class="zs-note mb16">'+ico('info',17)+'<div class="zs-bnp">প্ল্যাটফর্ম অর্ডার গোনে, কিন্তু COD-তে কেউ কেউ পার্সেল নেয় না। তাই আমরা <b>আসল ডেলিভারি</b> সার্ভার থেকে প্ল্যাটফর্মে পাঠাই (PR 258) — অ্যাড শেখে কারা সত্যিই নেয়।</div></div>'+
    '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">প্ল্যাটফর্মের বিক্রি বনাম আসল ডেলিভারি</h2><span class="row" style="gap:6px">'+zs_pr('258 · 265 · 267 · 283')+zs_simTag()+'</span></div>'+
      '<div class="zo-tw mt8"><table class="zo-tbl"><thead><tr><th>Campaign</th><th>Spend</th><th>Platform says</th><th>Our orders</th><th>Delivered</th><th>Refused</th><th>On the way</th><th>Cost / platform sale</th><th>Cost / delivery</th></tr></thead><tbody>'+
      rows.map(function(r){ var bad = r.o.cpaD > t.guard.cpa; return '<tr><td>'+esc(r.c.name)+'<div class="zs-mini">'+esc(ZD_PF[zd_pf(r.c)][0])+'</div></td><td>'+fmt(r.c.spend)+'</td><td>'+r.c.buys+'</td><td>'+r.o.orders+'</td><td class="ok">'+r.o.delivered+'</td><td class="bad">'+r.o.refused+'</td><td>'+r.o.pending+'</td><td>'+fmt(r.o.cpaP)+'</td><td class="'+(bad?'bad':'')+'">'+fmt(r.o.cpaD)+'</td></tr>'; }).join('')+
      '<tr class="tot"><td>Total</td><td>'+fmt(T.sp)+'</td><td>'+T.b+'</td><td>'+T.or+'</td><td>'+T.d+'</td><td>'+T.r+'</td><td>'+T.p+'</td><td>'+fmt(T.sp/Math.max(1,T.b))+'</td><td>'+fmt(T.sp/Math.max(1,T.d))+'</td></tr></tbody></table></div>'+
      '<div class="zs-mini mt8">Delivered rate '+Math.round(T.d/Math.max(1,T.or)*100)+'% of our orders · '+Math.round(T.r/Math.max(1,T.or)*100)+'% refused at the door.</div></section>'+
    '<div class="zs-g2 zo-mt">'+
      '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">জেলা অনুযায়ী ডেলিভারি</h2>'+zs_pr('569')+'</div><div class="zs-sub za-bn">যেখানে বেশি পার্সেল নেয় সেখানে বেশি খরচ, যেখানে বেশি ফেরত সেখানে কম</div>'+
        dist.map(function(d){ return '<div class="zs-rep-g"><span class="small">'+esc(d[0])+'</span><b class="small">'+d[1]+'%</b>'+zs_bar(d[1], d[1]<72?'warn':'')+'</div>'; }).join('')+'</section>'+
      '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">বাদ-তালিকা</h2>'+zs_pr('264 · 191')+'</div><div class="zs-sub za-bn">যারা পার্সেল নেয়নি তাদের আর অ্যাড দেখানো হয় না</div>'+
        '<div class="zo-kv"><span>Customers on the list</span><span>'+excl+'</span><span>Sent as</span><span>hashed phone only</span><span>Pushed to</span><span>Meta · Google · TikTok</span><span>Last sync</span><span>today 03:00 (demo)</span></div>'+
        '<div class="zs-mini mt8 za-bn">শুধু অ্যাড দেখানো বন্ধ — কাউকে অর্ডার থেকে ব্লক করা হয় না। <a class="zs-link" href="#/admin/customers">Customers</a></div></section>'+
    '</div>';
}

/* ---------- tracking ---------- */
var ZD_TRACK = [
  {k:'meta', name:'Meta Pixel + Conversions API', bn:'ফেসবুক/ইনস্টাগ্রাম — ব্রাউজার আর সার্ভার দুই দিক থেকেই', parts:[['Pixel on every page','ok'],['Conversions API (server)','ok'],['Same event ID on both (no double count)','ok'],['Delivered event (custom)','ok'],['Event match quality','7.8 / 10']]},
  {k:'google', name:'Google tag + offline conversions', bn:'গুগল অ্যাড আর ইউটিউব — এনহ্যান্সড কনভার্শন সহ', parts:[['Google tag (gtag) on every page','ok'],['Enhanced conversions (hashed phone)','ok'],['Delivered upload (offline conversion)','warn'],['Merchant Center feed','ok']]},
  {k:'tiktok', name:'TikTok Pixel + Events API', bn:'টিকটক — ব্রাউজার আর সার্ভার', parts:[['TikTok Pixel','ok'],['Events API (server)','todo'],['Delivered event','todo']]}
];
var ZD_EVENTS = [['ViewContent','প্রোডাক্ট দেখা'],['AddToCart','ব্যাগে রাখা'],['InitiateCheckout','চেকআউট শুরু'],['Purchase','অর্ডার'],['Delivered','আসল ডেলিভারি (COD পেইড)']];
function zd_track(t){
  var s = zd_st();
  return '<div class="zs-g3">'+ZD_TRACK.map(function(p){
      var ok = p.parts.filter(function(x){ return x[1]==='ok' || /\//.test(x[1]); }).length, test = s.tests[p.k];
      return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+esc(p.name)+'</h2><span class="zo-pill '+(ok===p.parts.length?'ok':'warn')+'">'+ok+'/'+p.parts.length+'</span></div><div class="zs-sub za-bn">'+esc(p.bn)+'</div>'+
        p.parts.map(function(x){ var st = x[1]; return '<div class="zs-row"><div class="grow small">'+esc(x[0])+'</div>'+(st==='ok' ? '<span class="zo-pill ok">'+ico('check',11)+'Working</span>' : st==='warn' ? '<span class="zo-pill warn">Needs a look</span>' : st==='todo' ? '<span class="zo-pill">To set up</span>' : '<span class="zo-pill info">'+esc(st)+'</span>')+'</div>'; }).join('')+
        '<div class="zs-actions mt12"><button type="button" class="btn btn-sm btn-secondary" data-act="zd-test" data-k="'+p.k+'">'+ico('bolt',14)+'Send test event</button>'+(test?'<span class="zs-mini">Received · '+esc(zs_time(test))+'</span>':'')+'</div></section>';
    }).join('')+'</div>'+
    '<section class="zs-card zo-mt"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">কোন ইভেন্ট কোথায় যায়</h2><span class="row" style="gap:6px">'+zs_pr('257 · 258')+zs_simTag()+'</span></div>'+
      '<div class="zo-tw mt8"><table class="zo-tbl"><thead><tr><th>Event</th><th>Meta</th><th>Google</th><th>TikTok</th><th>Last seen</th></tr></thead><tbody>'+
      ZD_EVENTS.map(function(e, i){ var dot = function(st){ return st==='ok' ? '<span class="zo-pill ok">browser + server</span>' : st==='b' ? '<span class="zo-pill warn">browser only</span>' : st==='s' ? '<span class="zo-pill info">server upload</span>' : '<span class="zo-pill">—</span>'; };
        var tk = i<4 ? 'b' : 'none', gg = i===4 ? 's' : 'ok';
        return '<tr><td><b>'+e[0]+'</b><div class="zs-mini za-bn">'+e[1]+'</div></td><td>'+dot('ok')+'</td><td>'+dot(gg)+'</td><td>'+dot(tk)+'</td><td>'+(i===4?'today 02:10':(2+i*3)+' min ago')+'</td></tr>'; }).join('')+'</tbody></table></div>'+
      '<div class="zs-mini mt8">Personal data is hashed on our server before it leaves (PR 311). The Delivered event fires when the courier pays the COD, not when the order is placed.</div></section>';
}
ACT['zd-test'] = function(el){ var k = el.getAttribute('data-k'); zd_st().tests[k] = Date.now(); zd_log('Test event sent to '+k); saveState(); rerender(); toast('টেস্ট ইভেন্ট পৌঁছেছে (ডেমো)'); };

/* ---------- creatives ---------- */
function zd_creList(){
  var out = [];
  try{
    ['solid-polo-2','hoodie-jogger','hoodie-2'].forEach(function(rid, i){ var r = ca_rule(rid); if(!r) return; var L = ca_generate(r).visible[0]; if(L) out.push({id:'cr-'+rid, kind:'combo', L:L, title:L.name, fmt:['4:5','1:1','9:16 video'][i], cap:['২টা পোলো ৳১,৮০০ — রং মিলিয়ে নিন','Hoodie + jogger set · winter ready','২টা হুডি একসাথে, শীতের অফার'][i], ctr:[2.4,1.9,2.1][i], st:['live','ready','approval'][i]}); });
  }catch(e){}
  [['heavyweight-hoodie','black','1:1','320 GSM hoodie — built for Dhaka winters',1.6,'live'],['classic-cotton-panjabi','white','9:16 video','ঈদের পাঞ্জাবি — ২৫ অক্টোবরের পরে চালু',0,'approval'],['oxford-cotton-shirt','sky','4:5','অফিসের অক্সফোর্ড শার্ট ৳১,২৫০',1.3,'ready']].forEach(function(x){ var p = P(x[0]); if(p) out.push({id:'cr-'+x[0], kind:'product', p:p, color:x[1], title:p.name, fmt:x[2], cap:x[3], ctr:x[4], st:x[5]}); });
  var s = zd_st(); out.forEach(function(c){ if(s.cre[c.id]) c.st = s.cre[c.id]; });
  return out;
}
var ZD_CRE_ST = {live:['চলছে','ok'], ready:['তৈরি','info'], approval:['আপনার অনুমতি লাগবে','warn'], off:['বন্ধ','']};
function zd_cre(t){
  var list = zd_creList();
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><div style="min-width:0"><h2 class="za-bn">ক্রিয়েটিভ লাইব্রেরি</h2><div class="zs-sub za-bn">স্টুডিও থেকে আসা ছবি আর ভিডিও — প্রতিটা ফরম্যাটে</div></div>'+
      '<button type="button" class="btn btn-sm btn-primary" data-act="zd-brief">'+ico('spark',14)+'New creative brief</button></div>'+
    '<div class="zd-cres">'+list.map(function(c){ var st = ZD_CRE_ST[c.st] || ZD_CRE_ST.ready;
      var img = c.kind==='combo' ? ca_setPhoto(c.L.pieces, {layout:'card'}) : productImg(c.p, c.color, {ratio:'ratio-45', label:false});
      return '<div class="zd-cre" data-testid="zd-cre"><div class="zd-cimg">'+img+'<span class="zd-fmt">'+esc(c.fmt)+'</span></div><div class="zd-ci"><div class="small bold zd-ct">'+esc(c.title)+'</div><div class="zs-mini za-bn zd-ct">'+esc(c.cap)+'</div>'+
        '<div class="row between" style="gap:6px;margin-top:6px"><span class="zo-pill '+st[1]+'">'+st[0]+'</span><span class="zs-mini">'+(c.ctr ? 'CTR '+c.ctr+'%' : 'not run')+'</span></div>'+
        '<div class="zs-actions mt8">'+(c.st==='approval' ? '<button type="button" class="btn btn-sm btn-primary" data-act="zd-cre" data-id="'+c.id+'" data-v="ready">Approve</button>' : c.st==='live' ? '<button type="button" class="btn btn-sm btn-ghost" data-act="zd-cre" data-id="'+c.id+'" data-v="off">Stop</button>' : '<button type="button" class="btn btn-sm btn-secondary" data-act="zd-cre" data-id="'+c.id+'" data-v="live">Use in ads</button>')+'</div></div></div>'; }).join('')+'</div>'+
    '<div class="zs-mini mt8">'+zs_simTag('Demo · simulated')+' Pictures are drawn from the product and combo photos; the studio (S24/S25) makes the real sets and video cuts.</div></section>';
}
ACT['zd-cre'] = function(el){ var id = el.getAttribute('data-id'), v = el.getAttribute('data-v'); zd_st().cre[id] = v; zd_log('Creative '+id.replace('cr-','')+' → '+v); saveState(); rerender(); toast(v==='live' ? 'অ্যাডে যোগ হল (ডেমো)' : v==='off' ? 'বন্ধ হল' : 'অনুমোদন হল — এখন ব্যবহার করা যাবে'); };
ACT['zd-brief'] = function(){
  openModal('<div class="zs-bnp">তীরন্দাজ প্রোডাক্ট আর অফার থেকে ব্রিফ লেখে (PR 270)। স্টুডিও সেটা দিয়ে ছবি/ভিডিও বানায়।</div>'+
    '<div class="zd-brief mt12"><b>Brief · Solid Polo 2-piece combo</b><ul><li>Offer: 2 pcs ৳2,200 → ৳1,800, 6 colours</li><li>Formats: 4:5 photo, 1:1 carousel of the 4 best-selling pairs, 9:16 video 8–12 s</li><li>Hook (Bengali): “২টা পোলো, ৳১,৮০০ — রং মিলিয়ে নিন”</li><li>Hook (English): “Two polos, one price — pick your colours”</li><li>Show: the pair side by side on the house background, no text baked in (PR 575)</li><li>Landing: #/combos/solid-polo-2 · optimise for delivered purchase</li></ul></div>'+
    '<div class="zs-actions mt16"><button type="button" class="btn btn-primary" data-act="zd-briefgo">'+ico('check',15)+'Send to the studio</button><button type="button" class="btn btn-ghost" data-act="close-modal">Close</button></div>', {title:'New creative brief'});
};
ACT['zd-briefgo'] = function(){ zd_log('Creative brief sent to the studio: Solid Polo 2-piece combo', 'Tirondaj'); closeModal(); saveState(); toast('ব্রিফ স্টুডিওতে গেছে (ডেমো)'); };

/* ---------- connections checklist ---------- */
var ZD_CONN = [
  {pf:'Meta', items:[['meta-bm','Business Manager made, page and Instagram added','বিজনেস ম্যানেজারে পেজ আর ইনস্টাগ্রাম যোগ করা',true],['meta-verify','Business verification (trade licence, phone, website)','ব্যবসা ভেরিফাই — ট্রেড লাইসেন্স আর ওয়েবসাইট লাগবে',false],['meta-app','App review for ads_management + Marketing API','অ্যাপ রিভিউ — মেটা দেখে অনুমতি দেয়, কয়েক দিন লাগে',false],['meta-dataset','Pixel / dataset + Conversions API token','পিক্সেল আর CAPI টোকেন',true],['meta-pay','Payment card added, spending limit set','পেমেন্ট কার্ড আর খরচের সীমা',true]]},
  {pf:'Google · YouTube', items:[['g-ads','Google Ads account (manager account)','গুগল অ্যাড অ্যাকাউন্ট',true],['g-token','Developer token — apply for Basic access','ডেভেলপার টোকেন — Basic access এর আবেদন',false],['g-oauth','OAuth consent screen verified','লগইন অনুমতির স্ক্রিন ভেরিফাই',false],['g-mc','Merchant Center + product feed','মার্চেন্ট সেন্টার আর প্রোডাক্ট ফিড',true],['g-yt','YouTube channel linked','ইউটিউব চ্যানেল যুক্ত',true]]},
  {pf:'TikTok', items:[['tt-ads','TikTok Ads Manager account','টিকটক অ্যাড অ্যাকাউন্ট',true],['tt-api','Marketing API app approved','মার্কেটিং API অ্যাপের অনুমোদন',false],['tt-auth','Advertiser authorised the app','অ্যাড অ্যাকাউন্ট থেকে অ্যাপকে অনুমতি',false],['tt-events','Events API access token','ইভেন্টস API টোকেন',false]]}
];
function zd_conn(t){
  var s = zd_st();
  return '<div class="zs-note mb16">'+ico('info',17)+'<div class="zs-bnp">তীরন্দাজ সরাসরি অফিসিয়াল API দিয়ে চালায় — বাইরের কোনো টুল লাগে না। কিন্তু প্রতিটা প্ল্যাটফর্ম আগে আপনার ব্যবসা যাচাই করে। নিচের কাজগুলো আপনার অ্যাকাউন্ট দিয়ে একবারই করতে হয় — শেষ হলে টিক দিন।</div></div>'+
    '<div class="zs-g3">'+ZD_CONN.map(function(g){
      var done = g.items.filter(function(i){ return s.conn[i[0]]!=null ? s.conn[i[0]] : i[3]; }).length;
      return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+esc(g.pf)+'</h2><span class="zo-pill '+(done===g.items.length?'ok':'warn')+'">'+done+'/'+g.items.length+'</span></div>'+zs_bar(done/g.items.length*100)+
        '<div class="mt8">'+g.items.map(function(i){ var on = s.conn[i[0]]!=null ? s.conn[i[0]] : i[3];
          return '<button type="button" class="zd-ci'+(on?' on':'')+'" data-act="zd-conn" data-k="'+i[0]+'" aria-pressed="'+on+'"><span class="zs-cb">'+ico('check',13)+'</span><span style="min-width:0"><span class="small bold" style="display:block">'+esc(i[1])+'</span><span class="zs-mini za-bn">'+esc(i[2])+'</span></span></button>'; }).join('')+'</div></section>';
    }).join('')+'</div>';
}
ACT['zd-conn'] = function(el){ var s = zd_st(), k = el.getAttribute('data-k'), def = false; ZD_CONN.forEach(function(g){ g.items.forEach(function(i){ if(i[0]===k) def = i[3]; }); }); var cur = s.conn[k]!=null ? s.conn[k] : def; s.conn[k] = !cur; saveState(); rerender(); toast(!cur ? 'হয়ে গেছে বলে টিক দেওয়া হল' : 'বাকি হিসেবে রাখা হল'); };

/* ---------- change log ---------- */
function zd_logTab(t){
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">সব বদলের হিসাব</h2>'+zs_pr('581 · 413')+'</div><div class="zs-sub za-bn">কে কখন কী বদলেছে — আগে আর পরে</div>'+
    (t.log.length ? '<div class="zs-list">'+t.log.map(function(l){ return '<div class="zs-li"><div style="min-width:0"><div class="t" style="font-weight:500">'+esc(l.text)+'</div><div class="m">'+esc(l.src)+' · '+esc(zs_time(l.at))+'</div></div><div class="r"><span class="zo-pill '+(l.src==='Owner'?'info':l.src==='Tirondaj'?'ok':'')+'">'+esc(l.src)+'</span></div></div>'; }).join('')+'</div>' : '<div class="zs-mini">Nothing yet.</div>')+'</section>';
}
