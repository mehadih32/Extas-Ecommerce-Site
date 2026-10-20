/* =====================================================================
   96-admin-register.js — প্রহরী Prohori A360-02 · PR 594 (owner 19 Oct 14:59,
   + 15:00 blueprint & files, + 15:05 automatic new stages / PRs / updates)
   #/admin/register                 PR রেজিস্টার: totals, search, filters,
                                    stages → PRs  (?tab=stages|new|issues|docs)
   #/admin/register/pr/<n>          one PR as a side panel (full screen on a
                                    phone) — a link the owner can share
   #/admin/register/doc/<id>[?h=]   read a blueprint file: contents, search,
                                    section links, download (.md)

   DATA: REGISTER (src/04-register-data.js) and DOCS (src/04b-docs-data.js)
   are written by tools/make-register.py on every build (tools/build.sh), so
   a new stage, a new PR or a grown PR text shows here by itself, dated.
   Nothing here is typed twice.
   Problems reported on a PR live in ST.prIssues (this browser, demo). Each one
   is also put on the owning agent's assignment list through za_addTask
   (89b-admin-agents.js) — routed by the chief, Gyani — and announced in the
   agents' Telegram preview (ST.za.tg). 89b is not edited.
   Prefix zg_. CSS: r12-zreg.css.
   ===================================================================== */

zo_route(/^\/admin\/register$/, 'zg-page');
zo_route(/^\/admin\/register\/pr\/(\d+)$/, 'zg-pr');
zo_route(/^\/admin\/register\/doc\/([\w-]+)$/, 'zg-doc');
zo_link(['PR রেজিস্টার', '#/admin/register', 'doc', null]);

var ZG = {stack:[], cache:{}, openUnseen:null, openSeq:0, keyOn:false};
var ZG_BN_MON = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
var ZG_ST = {built:['তৈরি','Built'], demo:['ডেমোতে আছে','In demo'], parked:['পার্ক করা','Parked'], code:['কোডে','In code'], live:['লাইভ','Live']};
var ZG_PRI = [['high','জরুরি'],['mid','মাঝারি'],['low','কম']];
var ZG_EV_TYPES = {'new-pr':1, 'update':1, 'changed':1, 'new-stage':1};

/* ---------- data access ---------- */
function zg_R(){ return (typeof REGISTER!=='undefined' && REGISTER && REGISTER.prs) ? REGISTER : {prs:{}, stages:{}, order:[], agents:{}, events:[], totals:{}, header:{}, general:[]}; }
function zg_D(){ return (typeof DOCS!=='undefined' && DOCS && DOCS.docs) ? DOCS : {docs:[]}; }
function zg_P(n){ return zg_R().prs[String(n)] || null; }
function zg_S(c){ return zg_R().stages[c] || null; }
function zg_doc(id){ return zg_D().docs.filter(function(d){ return d.id===id; })[0] || null; }
function zg_bn(n){ return typeof zs_bnNum==='function' ? zs_bnNum(n) : String(n); }
function zg_dt(d){ if(!d) return ''; var p = String(d).split('-'); if(p.length<3) return esc(d); return zg_bn(+p[2])+' '+ZG_BN_MON[(+p[1])-1]; }
function zg_ag(id){ var a = zg_R().agents[id] || {}, z = (typeof zs_agent==='function' ? zs_agent(id) : null) || {}; return {id:id, en:a.en || z.en || id, bn:a.bn || z.bn || '', code:a.code || '', col:z.col || '#2E4A62'}; }
function zg_agName(id){ var a = zg_ag(id); return a.bn ? a.bn+' '+a.en : a.en; }
function zg_owner(P){ return (P && P.own && P.own[0]) || 'gyani'; }
function zg_st(){ if(!ST.prIssues) ST.prIssues = []; if(!ST.zgReview) ST.zgReview = {}; return ST; }
function zg_issues(n){ return zg_st().prIssues.filter(function(x){ return n==null || +x.n===+n; }); }
function zg_maxSeq(){ var m = 0; zg_R().events.forEach(function(e){ if(ZG_EV_TYPES[e.type] && e.seq>m) m = e.seq; }); return m; }
function zg_unseen(){ var s = (ST && ST.zgSeenSeq) || 0; return zg_R().events.filter(function(e){ return ZG_EV_TYPES[e.type] && e.seq > s; }).length; }

/* ---------- small renderers ---------- */
function zg_chip(st){ var s = ZG_ST[st] || ZG_ST.built; return '<span class="zg-st zg-st-'+esc(st)+'" title="'+esc(s[1])+'">'+esc(s[0])+'</span>'; }
function zg_av(id){ var a = zg_ag(id); return '<span class="zg-av" style="background:'+esc(a.col)+'" aria-hidden="true">'+esc((a.bn||a.en).charAt(0))+'</span>'; }
function zg_agChip(id){ if(!id) return ''; var a = zg_ag(id); return '<span class="zg-ag">'+zg_av(id)+'<span class="zg-ag-n">'+esc(a.bn || a.en)+'</span></span>'; }
function zg_bell(n){ return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>'+(n ? '<span class="zg-badge">'+zg_bn(n)+'</span>' : ''); }
/* inline markdown: bold, italic, code, strike, links (text only), PR numbers → links */
function zg_inline(s){
  var t = esc(s);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/~~(.+?)~~/g, '<del>$1</del>');
  t = t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  t = t.replace(/(^|[\s(])\*(?!\s)([^*]+?)\*(?=[\s).,;:]|$)/g, '$1<i>$2</i>');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  var max = zg_R().totals.prs || 0;
  t = t.replace(/\bPRs?\s?(\d{1,4}(?:\s?(?:[–\/,-]|and|&amp;)\s?\d{1,4})*)/g, function(m){
    return m.replace(/\d{1,4}/g, function(d){ return (+d>=1 && +d<=max) ? '<a class="zg-prl" href="#/admin/register/pr/'+d+'">'+d+'</a>' : d; });
  });
  return t;
}
function zg_para(s){ return '<p class="zg-tx">'+zg_inline(s)+'</p>'; }

/* ---------- search + filters ---------- */
function zg_u(){ return ui('zg', {q:'', stage:'', agent:'', status:'', since:'', dec:false, open:{}, more:{}, pri:'mid'}); }
function zg_active(u){ return !!(u.q.trim() || u.stage || u.agent || u.status || u.since || u.dec); }
function zg_since(code){ var R = zg_R(), ref = R.refDay || R.asOf; if(!code || !ref) return ''; var d = new Date(ref+'T00:00:00'); d.setDate(d.getDate() - (+code - 1)); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function zg_hay(P){
  if(P._hay) return P._hay;
  var S = zg_S(P.s) || {};
  var a = [String(P.n), 'pr '+P.n, P.t, P.x, (P.xs||[]).join(' '), S.name, S.bn, P.s];
  (P.scope||[]).forEach(function(x){ a.push(x.label, x.text); });
  (P.dec||[]).forEach(function(x){ a.push(x.text); });
  (P.own||[]).forEach(function(id){ var g = zg_ag(id); a.push(g.en, g.bn, g.code); });
  P._hay = a.join(' \n ').toLowerCase();
  return P._hay;
}
function zg_match(P, u){
  if(u.stage && P.s!==u.stage) return false;
  if(u.agent && (P.own||[]).indexOf(u.agent)<0 && (P.also||[]).indexOf(u.agent)<0) return false;
  if(u.status && P.st!==u.status) return false;
  if(u.since){ var f = zg_since(u.since); if(!P.upd || P.upd < f) return false; }
  if(u.dec && !(P.dec && P.dec.length)) return false;
  var q = u.q.trim().toLowerCase().replace(/^#/, '');
  if(!q) return true;
  var m = q.match(/^(?:pr\s*)?(\d{1,4})$/);
  if(m) return +m[1]===+P.n;
  var h = zg_hay(P);
  return q.split(/\s+/).every(function(w){ return h.indexOf(w)>=0; });
}
function zg_list(){ var R = zg_R(); return Object.keys(R.prs).map(function(k){ return R.prs[k]; }).sort(function(a, b){ return a.n - b.n; }); }

/* ---------- PR rows ---------- */
function zg_row(P){
  var iss = zg_issues(P.n).filter(function(x){ return x.st!=='done'; }).length;
  return '<a class="zg-row" href="#/admin/register/pr/'+P.n+'">'+
    '<span class="zg-num">'+P.n+'</span>'+
    '<span class="zg-tt">'+esc(P.t)+(P.row ? '' : ' <span class="zg-spec">নির্দেশিকায়</span>')+'</span>'+
    '<span class="zg-meta">'+zg_chip(P.st)+(iss ? '<span class="zg-iss" title="Open problems">'+zg_bn(iss)+' সমস্যা</span>' : '')+zg_agChip(zg_owner(P))+
      '<span class="zg-upd">'+(P.upd ? zg_dt(P.upd) : '—')+'</span></span>'+
  '</a>';
}
function zg_rowsHead(){ return '<div class="zg-rhead" aria-hidden="true"><span>PR</span><span>কী করে</span><span>অবস্থা · দায়িত্বে · শেষ বদল</span></div>'; }

function zg_results(){
  var u = zg_u();
  if(!zg_active(u)) return zg_stages();
  var hits = zg_list().filter(function(P){ return zg_match(P, u); });
  var cap = u.more.res ? hits.length : 60;
  return '<div class="zg-rcount" role="status">'+zg_bn(hits.length)+'টা PR মিলেছে</div>'+
    (hits.length ? '<div class="zg-rows">'+zg_rowsHead()+hits.slice(0, cap).map(zg_row).join('')+'</div>'+
      (hits.length>cap ? '<button type="button" class="btn btn-ghost btn-block mt12 zg-more" data-act="zg-more" data-k="res">আরও দেখুন ('+zg_bn(hits.length-cap)+')</button>' : '')
    : '<div class="zs-empty">কিছু মেলেনি। অন্য শব্দ বা PR নম্বর লিখে দেখুন, অথবা ফিল্টার মুছুন।</div>');
}

/* ---------- stage list ---------- */
function zg_bar(S){
  var tot = Math.max(1, S.count), d = S.inDemo || 0, park = S.parked ? S.count : 0, b = S.count - d - park;
  return '<div class="zs-bar split zg-bar" role="img" aria-label="'+esc(d+' of '+S.count+' in the demo')+'"><i style="width:'+(d/tot*100).toFixed(1)+'%"></i><i class="b" style="width:'+(b/tot*100).toFixed(1)+'%"></i><i class="n" style="width:'+(park/tot*100).toFixed(1)+'%"></i></div>';
}
function zg_stages(){
  var R = zg_R(), u = zg_u();
  return '<div class="zg-stages">'+R.order.map(function(code){
    var S = R.stages[code], open = !!u.open[code];
    var owners = (S.owners||[]).map(zg_agChip).join('') || '<span class="zg-mini">এখনো কেউ না</span>';
    var newS = S.first && S.first >= (R.weekFrom||'9999') && !(S.first==='2026-10-18' && S.tableCount!=null) ? '<span class="zg-new">নতুন সেকশন</span>' : '';
    return '<section class="zg-stage'+(open?' open':'')+'" id="zg-s-'+esc(code)+'">'+
      '<button type="button" class="zg-sh" data-act="zg-stage" data-c="'+esc(code)+'" aria-expanded="'+open+'" aria-controls="zg-sb-'+esc(code)+'">'+
        '<span class="zg-code">'+esc(code)+'</span>'+
        '<span class="zg-sn"><span class="zg-sbn">'+esc(S.bn)+newS+'</span><span class="zg-sen">'+esc(S.name)+'</span></span>'+
        '<span class="zg-scount"><b>'+zg_bn(S.count)+'</b> PR'+(S.range ? '<small>'+esc(S.range)+'</small>' : '')+'</span>'+
        '<span class="zg-sbar">'+zg_bar(S)+'<small>'+(S.parked ? 'পার্ক করা' : 'ডেমোতে '+zg_bn(S.inDemo||0)+'/'+zg_bn(S.count))+'</small></span>'+
        '<span class="zg-sown">'+owners+'</span>'+
        '<span class="zg-caret" aria-hidden="true">'+ico('down',16)+'</span>'+
      '</button>'+
      (open ? '<div class="zg-sb" id="zg-sb-'+esc(code)+'">'+zg_stageBody(S)+'</div>' : '')+
    '</section>';
  }).join('')+'</div>';
}
function zg_stageBody(S){
  var R = zg_R();
  var mem = zg_list().filter(function(P){ return P.s===S.code; });
  var info = [];
  if(S.desc) info.push('<p class="zg-tx">'+zg_inline(S.desc)+'</p>');
  info.push('<div class="zg-kv"><span>অবস্থা</span><b>'+esc(S.status || '—')+'</b></div>');
  if(S.tableCount!=null && S.tableCount!==S.count) info.push('<div class="zg-kv"><span>স্টেজ টেবিলে লেখা</span><b>'+zg_bn(S.tableCount)+' PR · রেজিস্টারে আছে '+zg_bn(S.count)+'</b></div>');
  if(S.park) info.push('<div class="zs-note warn">'+ico('info',16)+'<div><b>'+esc(S.park.what)+'</b><br>'+esc(S.park.why)+'</div></div>');
  (S.notes||[]).forEach(function(nt){ info.push('<div class="zs-note">'+ico('check',16)+'<div><b>মালিকের সিদ্ধান্ত'+(nt.d ? ' · '+zg_dt(nt.d) : '')+'</b><br>'+zg_inline(nt.text)+'</div></div>'); });
  if(S.spec) info.push('<a class="btn btn-sm btn-ghost zg-tap" href="#/admin/register/doc/'+esc(S.spec.doc)+'?h='+esc(S.spec.slug)+'">'+ico('doc',14)+'নির্দেশিকায় দেখুন · '+esc(S.spec.h.slice(0, 48))+'</a>');
  return '<div class="zg-sinfo">'+info.join('')+'</div>'+
    (mem.length ? '<div class="zg-rows">'+zg_rowsHead()+mem.map(zg_row).join('')+'</div>' : '<div class="zs-empty">এই স্টেজে এখনো কোনো PR নম্বর নেই — মালিক অনুমতি দিলে নম্বর পাবে।</div>');
}

/* ---------- page shell ---------- */
function zg_kpis(){
  var T = zg_R().totals || {}, iss = zg_issues().filter(function(x){ return x.st!=='done'; }).length;
  var k = function(v, l, s, cls, href){ return '<'+(href?'a href="'+href+'"':'div')+' class="zs-k zg-k '+(cls||'')+'"><div class="v">'+zg_bn(v==null?'—':v)+'</div><div class="l">'+l+'</div>'+(s?'<div class="s">'+s+'</div>':'')+'</'+(href?'a':'div')+'>'; };
  return '<div class="zg-kpis">'+
    k(T.stages, 'স্টেজ', (T.stagesAll>T.stages ? '+'+zg_bn(T.stagesAll-T.stages)+'টা নম্বর ছাড়া' : 'সব স্টেজ'))+
    k(T.prs, 'মোট PR', zg_bn(T.rows||0)+'টার নিজের লাইন')+
    k(T.built, 'তৈরি', 'রেজিস্টারে লেখা শেষ', 'ok')+
    k(T.parked, 'পার্ক করা', 'হস্তান্তরের দিন হবে')+
    k(T.inDemo, 'ডেমোতে আছে', 'দেখা যায় এমন পেজ', 'ok')+
    k(T.changedWeek, 'এই সপ্তাহে বদল', zg_dt(zg_R().weekFrom)+' থেকে', 'warn', '#/admin/register?tab=new')+
    (iss ? k(iss, 'খোলা সমস্যা', 'জানানো হয়েছে', 'bad', '#/admin/register?tab=issues') : '')+
  '</div>';
}
function zg_tabs(cur){
  var nIss = zg_issues().filter(function(x){ return x.st!=='done'; }).length;
  var t = [['stages','স্টেজ ও PR','',''],['new','নতুন কী', ZG.openUnseen || '',' · What\'s new'],['issues','জানানো সমস্যা', nIss || '',''],['docs','ব্লুপ্রিন্ট ও ফাইল','','']];
  return '<div class="zs-tabs zg-tabs" role="tablist">'+t.map(function(x){
    return '<a class="chip'+(cur===x[0]?' on':'')+'" role="tab" aria-selected="'+(cur===x[0])+'" href="#/admin/register'+(x[0]==='stages'?'':'?tab='+x[0])+'"><span class="zg-tab-l">'+esc(x[1])+(x[3] ? '<span class="zg-tab-en">'+esc(x[3])+'</span>' : '')+'</span>'+(x[2] ? ' <span class="zo-cnt">'+zg_bn(x[2])+'</span>' : '')+'</a>';
  }).join('')+'</div>';
}
function zg_head(){
  var R = zg_R(), n = ZG.openUnseen || 0;
  var bell = '<a class="btn btn-ghost zg-bell" href="#/admin/register?tab=new" aria-label="'+(n ? n+' new or updated items' : 'What\'s new')+'">'+zg_bell(n)+'<span class="zg-bell-t">'+(n ? zg_bn(n)+'টা নতুন' : 'নতুন কী')+'</span></a>';
  return zs_head('প্রহরী · PR 594 · '+esc(R.asOfText || ''), 'PR রেজিস্টার', 'সব স্টেজ আর সব PR এক জায়গায়',
    'কোন PR কী করে, পরে কী যোগ হলো, মালিকের সিদ্ধান্ত, কে দায়িত্বে, ডেমোতে কোথায় দেখা যায়। কোডের সময় কিছু ভাঙলে সেই PR খুলে "সমস্যা জানান" চাপুন।', bell);
}
function zg_tabStages(){
  var u = zg_u(), R = zg_R();
  var opt = function(v, l, cur){ return '<option value="'+esc(v)+'"'+(v===cur?' selected':'')+'>'+esc(l)+'</option>'; };
  var stOpts = '<option value="">সব স্টেজ</option>'+R.order.map(function(c){ return opt(c, c+' · '+R.stages[c].bn, u.stage); }).join('');
  var agOpts = '<option value="">সব এজেন্ট</option>'+Object.keys(R.agents).map(function(id){ return opt(id, zg_agName(id), u.agent); }).join('');
  var sOpts = '<option value="">সব অবস্থা</option>'+['built','demo','parked'].map(function(s){ return opt(s, ZG_ST[s][0]+' · '+ZG_ST[s][1], u.status); }).join('');
  var dOpts = '<option value="">যেকোনো সময়</option>'+[['1','আজ'],['3','শেষ ৩ দিন'],['7','শেষ ৭ দিন'],['30','শেষ ৩০ দিন']].map(function(x){ return opt(x[0], x[1], u.since); }).join('');
  return '<div class="zg-tools zs-card">'+
      '<label class="zg-search"><span class="sr-only">PR খুঁজুন</span>'+ico('search',18)+'<input class="input" type="search" id="zg-q" data-input="zg-q" value="'+esc(u.q)+'" placeholder="নম্বর বা শব্দ লিখুন — যেমন 571, combo, ব্লগ" autocomplete="off" enterkeyhint="search"></label>'+
      '<div class="zg-filters">'+
        '<label class="zg-f"><span>স্টেজ</span><select class="input" data-change="zg-f" data-k="stage">'+stOpts+'</select></label>'+
        '<label class="zg-f"><span>এজেন্ট</span><select class="input" data-change="zg-f" data-k="agent">'+agOpts+'</select></label>'+
        '<label class="zg-f"><span>অবস্থা</span><select class="input" data-change="zg-f" data-k="status">'+sOpts+'</select></label>'+
        '<label class="zg-f"><span>কবে থেকে বদল</span><select class="input" data-change="zg-f" data-k="since">'+dOpts+'</select></label>'+
        '<label class="zg-chk"><input type="checkbox" data-change="zg-f" data-k="dec"'+(u.dec?' checked':'')+'><span>মালিকের সিদ্ধান্ত আছে</span></label>'+
        '<button type="button" class="btn btn-ghost zg-clear" data-act="zg-clear"'+(zg_active(u)?'':' hidden')+'>'+ico('close',14)+'মুছুন</button>'+
      '</div>'+
    '</div>'+
    '<div id="zg-res" class="zg-res">'+zg_results()+'</div>';
}

/* ---------- What's new ---------- */
function zg_evLine(e, seenSeq){
  var R = zg_R(), fresh = ZG_EV_TYPES[e.type] && e.seq > (seenSeq||0);
  var tm = e.tm ? ' · '+zg_bn(e.tm) : '';
  var dot = fresh ? '<span class="zg-dot" aria-label="new"></span>' : '';
  if(e.type==='new-stage') return '<div class="zg-ev">'+dot+'<span class="zg-evt zg-new">নতুন সেকশন</span><div class="zg-evb"><b>'+esc(e.stage)+' · '+esc(e.name)+'</b><div class="zg-mini">'+zg_dt(e.d)+tm+'</div></div></div>';
  var P = zg_P(e.pr); if(!P) return '';
  if(e.type==='new-pr'){
    var al = (e.aligned||[]).slice(0, 3).map(function(x){ return x.n; });
    return '<a class="zg-ev" href="#/admin/register/pr/'+P.n+'">'+dot+'<span class="zg-evt">নতুন PR</span><div class="zg-evb"><b>PR '+P.n+' যোগ হলো'+(al.length ? ' · যুক্ত: '+al.join(', ') : '')+'</b><div class="zg-ell">'+esc(P.t)+'</div><div class="zg-mini">'+esc(P.s||'')+' · '+zg_dt(e.d)+tm+'</div></div></a>';
  }
  if(e.type==='update' || e.type==='changed') return '<a class="zg-ev" href="#/admin/register/pr/'+P.n+'">'+dot+'<span class="zg-evt upd">আপডেট</span><div class="zg-evb"><b>PR '+P.n+'-এ নতুন অংশ যোগ হলো</b><div class="zg-ell2">'+esc(e.added||'')+'</div><div class="zg-mini">'+esc(P.t)+' · '+zg_dt(e.d)+tm+'</div></div></a>';
  if(e.type==='removed') return '<div class="zg-ev"><span class="zg-evt">সরানো</span><div class="zg-evb"><b>PR '+e.pr+' রেজিস্টার থেকে সরে গেছে</b></div></div>';
  return '';
}
function zg_review(){
  var R = zg_R(), st = zg_st().zgReview;
  var w = R.events.filter(function(e){ return e.type==='scope-warn' && !st[e.pr+'-'+e.like]; });
  if(!w.length) return '';
  return '<section class="zs-card zg-review"><div class="row between wrap" style="gap:8px"><h2>জ্ঞানী রিভিউ — নতুন PR, না পুরোনোটার আপডেট?</h2><span class="zg-mini">এজেন্টদের জন্য</span></div>'+
    '<div class="zs-sub">নতুন PR আগের কোনো PR-এর সাথে অনেকটা মিলে গেলে এখানে আসে। মিলিয়ে দেখে প্রধান এজেন্ট ঠিক করবেন — এক করবেন, না আলাদা রাখবেন।</div><div class="zs-list">'+
    w.map(function(e){ var a = zg_P(e.pr), b = zg_P(e.like); if(!a || !b) return '';
      return '<div class="zs-li"><div style="min-width:0"><div class="t"><a href="#/admin/register/pr/'+a.n+'">PR '+a.n+'</a> আর <a href="#/admin/register/pr/'+b.n+'">PR '+b.n+'</a> অনেকটা একই (মিল '+zg_bn(Math.round(e.score*100))+'%)</div><div class="m zg-ell">'+esc(a.t)+' ↔ '+esc(b.t)+'</div></div>'+
        '<div class="r"><button type="button" class="btn btn-sm btn-ghost zg-tap" data-act="zg-rv" data-k="'+e.pr+'-'+e.like+'" data-v="keep">আলাদাই থাক</button><button type="button" class="btn btn-sm btn-secondary zg-tap" data-act="zg-rv" data-k="'+e.pr+'-'+e.like+'" data-v="merge" data-a="'+a.n+'" data-b="'+b.n+'">জ্ঞানীকে দিন</button></div></div>';
    }).join('')+'</div></section>';
}
function zg_tabNew(){
  var R = zg_R(), u = zg_u(), seen = ZG.openSeq;
  var evs = R.events.filter(function(e){ return e.type!=='scope-warn'; }).slice().sort(function(a, b){ return (b.d||'').localeCompare(a.d||'') || (b.tm||'').localeCompare(a.tm||'') || b.seq - a.seq; });
  var byDay = {}, days = [];
  evs.forEach(function(e){ if(!byDay[e.d]){ byDay[e.d] = []; days.push(e.d); } byDay[e.d].push(e); });
  var notes = days.length ? days.map(function(d){
    var list = byDay[d], k = 'ev'+d, cap = u.more[k] ? list.length : 40;
    return '<div class="zg-day"><div class="zg-dayh">'+zg_dt(d)+' · '+zg_bn(list.length)+'টা</div>'+list.slice(0, cap).map(function(e){ return zg_evLine(e, seen); }).join('')+
      (list.length>cap ? '<button type="button" class="btn btn-ghost btn-block zg-more" data-act="zg-more" data-k="'+k+'">আরও দেখুন ('+zg_bn(list.length-cap)+')</button>' : '')+'</div>';
  }).join('') : '<div class="zs-empty">এখনো কোনো খবর নেই।</div>';
  /* every PR touched in the last 7 days, by day */
  var from = R.weekFrom || '', per = {}, pdays = [];
  zg_list().forEach(function(P){
    var seenDay = {};
    (P.hist||[]).concat(P.scope||[]).forEach(function(h){
      if(!h.d || h.d < from || seenDay[h.d]) return; seenDay[h.d] = 1;
      if(!per[h.d]){ per[h.d] = []; pdays.push(h.d); }
      per[h.d].push({P:P, h:h});
    });
  });
  pdays.sort().reverse();
  var week = pdays.map(function(d){
    var list = per[d], k = 'wk'+d, cap = u.more[k] ? list.length : 15;
    return '<div class="zg-day"><div class="zg-dayh">'+zg_dt(d)+' · '+zg_bn(list.length)+'টা PR</div><div class="zg-rows">'+list.slice(0, cap).map(function(x){
      var what = x.h.type==='filed' ? 'রেজিস্টারে যোগ' : x.h.type==='scope' || x.h.label ? 'নতুন অংশ' : x.h.type==='update' ? 'আপডেট' : x.h.type==='plan' ? 'পরিকল্পনায় আছে' : 'নোটে এসেছে';
      return '<a class="zg-row zg-row2" href="#/admin/register/pr/'+x.P.n+'"><span class="zg-num">'+x.P.n+'</span><span class="zg-tt">'+esc(x.P.t)+'</span><span class="zg-meta"><span class="zg-what">'+what+'</span>'+zg_chip(x.P.st)+'</span></a>';
    }).join('')+'</div>'+(list.length>cap ? '<button type="button" class="btn btn-ghost btn-block zg-more" data-act="zg-more" data-k="'+k+'">আরও দেখুন ('+zg_bn(list.length-cap)+')</button>' : '')+'</div>';
  }).join('');
  var gen = (R.general||[]).filter(function(g){ return g.d && g.d >= from; });
  return zg_review()+
    '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>খবর — নতুন PR, আপডেট, নতুন সেকশন</h2>'+(ZG.openUnseen ? '<span class="zg-new">'+zg_bn(ZG.openUnseen)+'টা আপনি আগে দেখেননি</span>' : '')+'</div>'+
      '<div class="zs-sub">রেজিস্টারে নতুন কিছু এলে বিল্ডের সময় নিজে নিজে এখানে আসে — তারিখসহ।</div>'+notes+'</section>'+
    (gen.length ? '<section class="zs-card mt16"><h2>সাধারণ সিদ্ধান্ত</h2><div class="zs-sub">কোনো একটা PR-এর নামে নয়</div>'+gen.map(function(g){ return '<div class="zs-note mt8">'+ico('check',16)+'<div><b>'+zg_dt(g.d)+(g.tm?' · '+zg_bn(g.tm):'')+'</b> — '+zg_inline(g.text)+'</div></div>'; }).join('')+'</section>' : '')+
    '<section class="zs-card mt16"><h2>শেষ ৭ দিনে যেসব PR-এ কিছু হয়েছে</h2><div class="zs-sub">'+zg_dt(from)+' থেকে '+zg_dt(R.refDay)+' — দিন অনুযায়ী</div>'+(week || '<div class="zs-empty">এই সপ্তাহে কিছু বদলায়নি।</div>')+'</section>';
}

/* ---------- reported problems ---------- */
function zg_issueLi(x, withPr){
  var P = zg_P(x.n), pri = ZG_PRI.filter(function(p){ return p[0]===x.pri; })[0] || ZG_PRI[1];
  var task = (typeof za_findTask==='function' && x.task) ? za_findTask(x.agent, x.task) : null;
  var st = x.st==='done' ? ['fixed','সমাধান হয়েছে'] : x.st==='doing' ? ['approved','কাজ চলছে'] : ['proposed','খোলা'];
  return '<div class="zs-li zg-isli"><div style="min-width:0">'+
      '<div class="t">'+(withPr && P ? '<a href="#/admin/register/pr/'+x.n+'">PR '+x.n+'</a> · ' : '')+esc(x.what)+'</div>'+
      '<div class="m">'+zg_dt(new Date(x.at).toISOString().slice(0,10))+' · <span class="zg-pri zg-pri-'+esc(x.pri)+'">'+pri[1]+'</span> · জ্ঞানী দিলেন → '+esc(zg_agName(x.agent))+(x.page ? ' · পেজ: '+esc(x.page) : '')+(task ? ' · এজেন্টের তালিকায়: '+esc(typeof za_stLabel==='function' ? za_stLabel(task.st) : task.st) : '')+'</div>'+
    '</div><div class="r"><span class="zs-st '+st[0]+'">'+st[1]+'</span>'+
      (x.st==='open' ? '<button type="button" class="btn btn-sm btn-ghost zg-tap" data-act="zg-ist" data-id="'+esc(x.id)+'" data-v="doing">কাজ চলছে</button>' : '')+
      (x.st!=='done' ? '<button type="button" class="btn btn-sm btn-ghost zg-tap" data-act="zg-ist" data-id="'+esc(x.id)+'" data-v="done">সমাধান হয়েছে</button>' : '<button type="button" class="btn btn-sm btn-ghost zg-tap" data-act="zg-ist" data-id="'+esc(x.id)+'" data-v="open">আবার খুলুন</button>')+
    '</div></div>';
}
function zg_tabIssues(){
  var all = zg_issues().slice().sort(function(a, b){ return (a.st==='done') - (b.st==='done') || b.at - a.at; });
  return '<section class="zs-card"><h2>জানানো সমস্যা</h2><div class="zs-sub">যেকোনো PR খুলে "এই PR-এ সমস্যা জানান" চাপলে এখানে আসে। প্রধান এজেন্ট জ্ঞানী কাজটা সেই PR-এর দায়িত্বে থাকা এজেন্টকে দেন।</div>'+
    (all.length ? '<div class="zs-list">'+all.map(function(x){ return zg_issueLi(x, true); }).join('')+'</div>' : '<div class="zs-empty">এখনো কোনো সমস্যা জানানো হয়নি। কোনো PR খুলে নিচের ফর্ম থেকে জানাতে পারবেন।</div>')+
    '<div class="zg-mini mt12">ডেমো: সব এই ব্রাউজারে রাখা আছে। আসল সিস্টেমে টেলিগ্রামে আর এজেন্টের প্রোফাইলে যাবে।</div></section>';
}

/* ---------- docs list ---------- */
function zg_kb(b){ return b>1048576 ? (b/1048576).toFixed(1)+' MB' : Math.max(1, Math.round(b/1024))+' KB'; }
function zg_tabDocs(){
  var D = zg_D();
  if(!D.docs.length) return '<div class="zs-empty">ফাইলের তালিকা পাওয়া যায়নি — বিল্ড আবার চালান।</div>';
  return '<div class="zs-note mb16">'+ico('shield',16)+'<div><b>সব সময় সর্বশেষ কপি।</b> প্রতিটা বিল্ডে ফাইলগুলো এখানে নতুন করে আসে — GitHub-এ যেতে হবে না। প্রতি রাতে Google Drive-এ এনক্রিপ্ট করা ব্যাকআপ হয় (PR 395 / 507) — <a href="#/admin/backup">ব্যাকআপ দেখুন</a>। ফোন নম্বর, ইমেইল, চাবি এখানে রাখা হয় না।</div></div>'+
    '<div class="zg-docs">'+D.docs.map(function(d){
      return '<section class="zs-card zg-dc"><div class="zg-dch"><span class="zg-dico">'+ico('doc',18)+'</span><div style="min-width:0"><h2 class="zg-ell">'+esc(d.name)+'</h2>'+
          '<div class="zg-mini">'+(d.ver ? esc(d.ver)+' · ' : '')+zg_kb(d.size)+' · '+zg_dt(d.d)+' · #'+esc(d.hash.slice(0,7))+'</div></div>'+(d.latest ? '<span class="zg-new">সর্বশেষ / latest</span>' : '')+'</div>'+
        '<p class="zg-dbn">'+esc(d.bn)+'</p>'+
        '<div class="zg-dact">'+(d.embedded ? '<a class="btn btn-sm btn-secondary zg-tap" href="#/admin/register/doc/'+esc(d.id)+'">'+ico('eye',14)+'পড়ুন</a><button type="button" class="btn btn-sm btn-ghost zg-tap" data-act="zg-dl" data-id="'+esc(d.id)+'">'+ico('down',14)+'ডাউনলোড (.md)</button>' : '<span class="zg-mini">ফাইল সার্ভারে থাকবে</span>')+
          '<span class="zg-mini">'+zg_bn((d.hist||[]).length)+'টা সংস্করণ</span></div>'+
      '</section>';
    }).join('')+'</div><div id="zg-dlnote" class="zg-mini mt12" role="status"></div>';
}

/* ---------- PR detail panel ---------- */
function zg_sec(title, body, id){ return body ? '<section class="zg-psec"'+(id?' id="'+id+'"':'')+'><h3>'+title+'</h3>'+body+'</section>' : ''; }
function zg_panel(n){
  var P = zg_P(n), R = zg_R();
  if(!P) return '<div class="zg-back" data-act="zg-close"></div><aside class="zg-panel" role="dialog" aria-modal="true" aria-labelledby="zg-pt"><div class="zg-ph"><button type="button" class="btn btn-ghost zg-x" data-act="zg-close" aria-label="Close">'+ico('close',20)+'</button></div><div class="zg-pb"><h2 id="zg-pt">PR '+esc(n)+' পাওয়া যায়নি</h2><p class="text2">রেজিস্টারে এই নম্বর নেই। মোট PR '+zg_bn(R.totals.prs||0)+'টা।</p></div></aside>';
  var S = zg_S(P.s) || {}, u = zg_u();
  var demo = (P.demo||[]).map(function(d){ return '<a class="btn btn-sm btn-secondary zg-tap" href="'+esc(d.h)+'">'+ico('eye',14)+'ডেমোতে দেখুন'+((P.demo.length>1) ? ' · '+esc(d.h.replace(/^#\//,'/').split('?')[0]) : '')+'</a>'; }).join('');
  var spec = P.spec ? '<a class="btn btn-sm btn-ghost zg-tap" href="#/admin/register/doc/'+esc(P.spec.doc)+'?h='+esc(P.spec.slug)+'">'+ico('doc',14)+'নির্দেশিকায় দেখুন</a>' : '';
  var full = P.row ? zg_para(P.x)+(P.xs||[]).map(zg_para).join('') :
    '<div class="zg-specbox"><div class="zg-mini"><b>Details in the specification</b> — এই PR-এর নিজের লাইন রেজিস্টারে নেই; স্টেজের বিবরণ আর নির্দেশিকার অংশ নিচে।</div>'+
      (S.desc ? zg_para(S.desc) : '')+
      (S.park ? '<div class="zs-note warn mt8">'+ico('info',16)+'<div><b>'+esc(S.park.what)+'</b><br>'+esc(S.park.why)+'</div></div>' : '')+
      (S.spec ? '<div class="zg-spech">'+esc(S.spec.h)+'</div><div class="zg-specx">'+zg_mdBlock(S.spec.ex, {lv:4, noIds:true})+'</div>' : '<p class="text2">নির্দেশিকায় এই স্টেজের আলাদা অংশ এখনো নেই।</p>')+
    '</div>';
  var scope = (P.scope||[]).map(function(s){ return '<div class="zg-tl"><div class="zg-tld">'+(s.d ? zg_dt(s.d) : '—')+(s.tm ? '<small>'+zg_bn(s.tm)+'</small>' : '')+'</div><div class="zg-tlb"><b>'+esc(s.label)+'</b><div>'+zg_inline(s.text)+'</div><div class="zg-mini">'+esc(s.src)+'</div></div></div>'; }).join('');
  var dec = (P.dec||[]).map(function(s){ return '<div class="zs-note mt8">'+ico('check',16)+'<div>'+(s.d ? '<b>'+zg_dt(s.d)+(s.tm ? ' · '+zg_bn(s.tm) : '')+'</b> — ' : '')+zg_inline(s.text)+'</div></div>'; }).join('');
  var why = {named:'লেখায় নাম আছে', stage:'একই স্টেজ', words:'বিষয় মেলে'};
  var al = (P.aligned||[]).map(function(x){ var o = zg_P(x.n); if(!o) return ''; return '<a class="zg-rel" href="#/admin/register/pr/'+x.n+'"><b>PR '+x.n+'</b><span class="zg-ell">'+esc(o.t)+'</span><small>'+why[x.why]+(x.score!=null && x.why!=='named' ? ' · '+zg_bn(Math.round(x.score*100))+'%' : '')+'</small></a>'; }).join('');
  var typ = {filed:'রেজিস্টারে যোগ', scope:'নতুন অংশ', update:'আপডেট হয়েছে', note:'মালিকের নোট / কাজ', plan:'পরিকল্পনা'};
  var hist = (P.hist||[]).slice().reverse().map(function(h){ return '<div class="zg-tl"><div class="zg-tld">'+(h.d ? zg_dt(h.d) : '—')+(h.tm ? '<small>'+zg_bn(h.tm)+'</small>' : '')+'</div><div class="zg-tlb"><span class="zg-tlt zg-tlt-'+esc(h.type)+'">'+(typ[h.type]||h.type)+'</span> '+zg_inline(h.note||'')+'<div class="zg-mini">'+esc(h.src)+'</div></div></div>'; }).join('');
  if(P.first) hist += '<div class="zg-tl"><div class="zg-tld">'+zg_dt(P.first)+(P.firstTm ? '<small>'+zg_bn(P.firstTm)+'</small>' : '')+'</div><div class="zg-tlb"><span class="zg-tlt">প্রথম দেখা</span> রেজিস্টারে প্রথম এসেছে'+(P.n<=490 && !P.firstTm ? ' (শুরুর পরিকল্পনা)' : '')+'</div></div>';
  var rel = (P.rel||[]).map(function(x){ return '<a class="chip zg-tap" href="#/admin/register/pr/'+x+'">PR '+x+'</a>'; }).join('');
  var iss = zg_issues(P.n).map(function(x){ return zg_issueLi(x, false); }).join('');
  var own = (P.own||[]).map(function(id){ var a = zg_ag(id); return '<span class="zg-ag">'+zg_av(id)+'<span class="zg-ag-n">'+esc(zg_agName(id))+(a.code?' · '+esc(a.code):'')+'</span></span>'; }).join('');
  var form = '<form class="zg-form" data-submit="zg-report" data-n="'+P.n+'">'+
      '<label class="label" for="zg-what">কী সমস্যা হয়েছে?</label><textarea class="input" id="zg-what" name="what" rows="3" required placeholder="যেমন: ফোনে চেকআউটে ডেলিভারি চার্জ ভুল দেখাচ্ছে"></textarea>'+
      '<label class="label" for="zg-pg">কোন পেজে?</label><input class="input" id="zg-pg" name="page" value="'+esc((P.demo && P.demo[0] && P.demo[0].h) || '')+'" placeholder="পেজের লিংক বা নাম (না জানলে ফাঁকা রাখুন)">'+
      '<fieldset class="zg-pri-f"><legend class="label">কতটা জরুরি?</legend><div class="zg-pris">'+ZG_PRI.map(function(p){ return '<label class="zg-pri-o"><input type="radio" name="pri" value="'+p[0]+'"'+(p[0]===u.pri?' checked':'')+'><span>'+p[1]+'</span></label>'; }).join('')+'</div></fieldset>'+
      '<div class="zg-mini">জমা দিলে প্রধান এজেন্ট জ্ঞানী কাজটা '+esc(zg_agName(zg_owner(P)))+'-কে দেবেন।</div>'+
      '<button type="submit" class="btn btn-primary btn-block zg-tap">সমস্যা জানান</button></form>';
  return '<div class="zg-back" data-act="zg-close"></div>'+
    '<aside class="zg-panel" role="dialog" aria-modal="true" aria-labelledby="zg-pt">'+
      '<div class="zg-ph"><button type="button" class="btn btn-ghost zg-x" data-act="zg-close" aria-label="Close">'+ico('close',20)+'</button>'+
        '<span class="zg-phn">PR '+P.n+'</span>'+
        '<span class="zg-phnav">'+(zg_P(P.n-1) ? '<a class="btn btn-ghost zg-x" href="#/admin/register/pr/'+(P.n-1)+'" aria-label="Previous PR">'+ico('back',18)+'</a>' : '')+(zg_P(P.n+1) ? '<a class="btn btn-ghost zg-x" href="#/admin/register/pr/'+(P.n+1)+'" aria-label="Next PR">'+ico('right',18)+'</a>' : '')+
        '<button type="button" class="btn btn-ghost zg-x" data-act="zo-copy" data-text="'+esc(zo_shopUrl('#/admin/register/pr/'+P.n))+'" data-msg="লিংক কপি হয়েছে" aria-label="Copy link">'+ico('link',18)+'</button></span></div>'+
      '<div class="zg-pb" tabindex="-1">'+
        '<div class="zg-pmeta"><a class="zg-code" href="#/admin/register" data-act="zg-gostage" data-c="'+esc(P.s||'')+'">'+esc(P.s||'—')+'</a><span class="zg-sbn">'+esc(S.bn||'')+'</span>'+zg_chip(P.st)+'</div>'+
        '<h2 id="zg-pt" class="zg-pt">'+esc(P.t)+'</h2>'+
        '<div class="zg-own">'+own+(P.also && P.also.length ? '<span class="zg-mini">সাথে: '+P.also.map(function(id){ return esc(zg_ag(id).bn || id); }).join(', ')+'</span>' : '')+'</div>'+
        '<div class="zg-pact">'+demo+spec+'<a class="btn btn-sm btn-ghost zg-tap" href="#zg-report" data-act="zg-toform">'+ico('info',14)+'সমস্যা জানান</a></div>'+
        zg_sec('পুরো লেখা', full)+
        zg_sec('পরে যোগ হওয়া অংশ', scope)+
        zg_sec('মালিকের সিদ্ধান্ত', dec)+
        zg_sec('যে PR-গুলোর সাথে যুক্ত', al ? '<div class="zg-rels">'+al+'</div>' : '')+
        zg_sec('ইতিহাস', hist ? '<div class="zg-tls">'+hist+'</div>' : '')+
        zg_sec('সম্পর্কিত PR', rel ? '<div class="zg-chips">'+rel+'</div>' : '')+
        zg_sec('এই PR-এ সমস্যা জানান · Report a problem on this PR', (iss ? '<div class="zs-list mb12">'+iss+'</div>' : '')+form, 'zg-report')+
      '</div>'+
    '</aside>';
}

/* ---------- markdown blocks (documents) ---------- */
function zg_slug(s){ return String(s).replace(/~~.*?~~/g,'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/\*\*/g,'').replace(/`/g,'').replace(/(^|[^\w*])\*(?!\s)([^*]+?)\*(?!\w)/g,'$1$2').replace(/\s+/g,' ').trim().toLowerCase().replace(/[^a-z0-9ঀ-৿]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80); }
function zg_cells(l){ var s = l.trim(); if(s.charAt(0)==='|') s = s.slice(1); if(s.charAt(s.length-1)==='|') s = s.slice(0,-1); return s.split(/\s\|\s|\|(?=\s)|(?<=\s)\|/).map(function(c){ return c.trim(); }); }
/* long unbroken tokens (paths, slugs, URLs) get soft break points so a cell never pushes the page wider */
function zg_wbr(html){ return html.replace(/>([^<]+)</g, function(m, t){ return '>'+t.replace(/[^\s]{18,}/g, function(w){ return w.replace(/([\/_.\-–=&?·])/g, '$1<wbr>'); })+'<'; }).replace(/^([^<]+)/, function(m, t){ return t.replace(/[^\s]{18,}/g, function(w){ return w.replace(/([\/_.\-–=&?·])/g, '$1<wbr>'); }); }); }
function zg_mdBlock(md, opt){
  opt = opt || {};
  var lines = String(md||'').split('\n'), out = [], i = 0, seen = {}, toc = [], lv0 = opt.lv || 2;
  var para = [];
  var flush = function(){ if(para.length){ out.push('<p>'+zg_inline(para.join(' '))+'</p>'); para = []; } };
  while(i < lines.length){
    var l = lines[i];
    if(/^```/.test(l)){ flush(); var code = []; i++; while(i < lines.length && !/^```/.test(lines[i])){ code.push(lines[i]); i++; } i++; out.push('<pre class="zg-pre"><code>'+esc(code.join('\n'))+'</code></pre>'); continue; }
    var h = l.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if(h){ flush(); var sl = zg_slug(h[2]) || 'section'; if(seen[sl]){ seen[sl]++; sl = sl+'-'+seen[sl]; } else seen[sl] = 1;
      var lv = Math.min(6, h[1].length - 1 + lv0); toc.push({lv:h[1].length, t:h[2], id:sl});
      out.push('<h'+lv+(opt.noIds ? '' : ' id="zgh-'+sl+'"')+' class="zg-mh">'+zg_inline(h[2])+(opt.noIds ? '' : '<button type="button" class="zg-anc" data-act="zg-anc" data-id="'+sl+'" aria-label="Copy link to this section">#</button>')+'</h'+lv+'>'); i++; continue; }
    if(/^\s*\|/.test(l) && i+1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i+1])){
      flush(); var head = zg_cells(l); i += 2; var rows = [];
      while(i < lines.length && /^\s*\|/.test(lines[i])){ rows.push(zg_cells(lines[i])); i++; }
      var nc = rows.reduce(function(m, r){ return Math.max(m, r.length); }, head.length), cls = nc>=7 ? ' zg-stk zg-c7' : nc>=5 ? ' zg-stk zg-c5' : nc>=3 ? ' zg-stk zg-c3' : '';
      var hl = head.map(function(c){ return esc(c.replace(/[*`~]/g, '')); });
      out.push('<div class="zg-tw"><table class="zg-tb'+cls+'"><thead><tr>'+head.map(function(c){ return '<th>'+zg_wbr(zg_inline(c))+'</th>'; }).join('')+'</tr></thead><tbody>'+rows.map(function(r){ return '<tr>'+r.map(function(c, ci){ return '<td data-l="'+(hl[ci]||'')+'"><span class="zg-tdv">'+zg_wbr(zg_inline(c))+'</span></td>'; }).join('')+'</tr>'; }).join('')+'</tbody></table></div>');
      continue;
    }
    if(/^\s*([-*+]|\d+[.)])\s+/.test(l)){
      flush(); var ord = /^\s*\d+[.)]/.test(l), items = [];
      while(i < lines.length && (/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))){
        if(/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) items.push({d:(lines[i].match(/^\s*/)[0].length>1), t:lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, '')});
        else items[items.length-1].t += ' '+lines[i].trim();
        i++;
      }
      out.push('<'+(ord?'ol':'ul')+' class="zg-ul">'+items.map(function(it){ return '<li'+(it.d?' class="sub"':'')+'>'+zg_inline(it.t)+'</li>'; }).join('')+'</'+(ord?'ol':'ul')+'>');
      continue;
    }
    if(/^>\s?/.test(l)){ flush(); var q = []; while(i < lines.length && /^>\s?/.test(lines[i])){ q.push(lines[i].replace(/^>\s?/, '')); i++; } out.push('<blockquote class="zg-bq">'+zg_inline(q.join(' '))+'</blockquote>'); continue; }
    if(/^\s*(-{3,}|\*{3,})\s*$/.test(l)){ flush(); out.push('<hr class="zg-hr">'); i++; continue; }
    if(!l.trim()){ flush(); i++; continue; }
    para.push(l.trim()); i++;
  }
  flush();
  if(opt.toc) opt.toc.push.apply(opt.toc, toc);
  return out.join('');
}

/* ---------- document reader ---------- */
function zg_docPage(id, q){
  var d = zg_doc(id);
  if(!d) return '<div class="zs-page zg-page">'+zs_head('PR রেজিস্টার · ব্লুপ্রিন্ট ও ফাইল', 'ফাইল পাওয়া যায়নি', '', '')+'<a class="btn btn-secondary zg-tap" href="#/admin/register?tab=docs">'+ico('back',14)+'সব ফাইল</a></div>';
  if(!d.embedded) return '<div class="zs-page zg-page">'+zs_head('PR রেজিস্টার · ব্লুপ্রিন্ট ও ফাইল', esc(d.name), esc(d.bn), 'ফাইল সার্ভারে থাকবে — এই ডেমোতে রাখা হয়নি।')+'<a class="btn btn-secondary zg-tap" href="#/admin/register?tab=docs">'+ico('back',14)+'সব ফাইল</a></div>';
  if(!ZG.cache[id]){ var toc = []; ZG.cache[id] = {html:zg_mdBlock(d.md, {lv:2, toc:toc}), toc:toc}; }
  var C = ZG.cache[id], u = ui('zgdoc:'+id, {q:'', hist:false});
  var tocHtml = C.toc.filter(function(t){ return t.lv>=2 && t.lv<=3; }).map(function(t){ return '<button type="button" class="zg-toci l'+t.lv+'" data-act="zg-jump" data-id="'+esc(t.id)+'">'+zg_inline(t.t).replace(/<a [^>]*>|<\/a>/g,'')+'</button>'; }).join('');
  var hist = (d.hist||[]).slice().reverse().map(function(h, i){ return '<div class="zs-li"><div style="min-width:0"><div class="t">'+zg_dt(h.d)+(i===0 ? ' · <span class="zg-new">এখনকার</span>' : '')+'</div><div class="m">'+zg_kb(h.size)+' · #'+esc(h.hash.slice(0,7))+'</div></div></div>'; }).join('');
  return '<div class="zs-page zg-page zg-reader">'+
    '<div class="zg-crumb"><a class="btn btn-ghost btn-sm zg-tap" href="#/admin/register?tab=docs">'+ico('back',14)+'সব ফাইল</a></div>'+
    zs_head('PR রেজিস্টার · ব্লুপ্রিন্ট ও ফাইল', esc(d.name), esc(d.bn), (d.ver ? esc(d.ver)+(d.latest?' · সর্বশেষ':'')+' · ' : '')+zg_kb(d.size)+' · '+zg_dt(d.d)+' · #'+esc(d.hash.slice(0,7))+(d.redacted ? ' · '+zg_bn(d.redacted)+'টা ব্যক্তিগত তথ্য সরানো' : ''),
      '<button type="button" class="btn btn-secondary zg-tap" data-act="zg-dl" data-id="'+esc(d.id)+'">'+ico('down',16)+'ডাউনলোড (.md)</button>')+
    '<div id="zg-dlnote" class="zg-mini" role="status"></div>'+
    '<div class="zg-dtools zs-card"><label class="zg-search"><span class="sr-only">এই ফাইলে খুঁজুন</span>'+ico('search',18)+'<input class="input" type="search" data-input="zg-dq" data-id="'+esc(id)+'" value="'+esc(u.q)+'" placeholder="এই ফাইলে খুঁজুন — যেমন combo, courier" autocomplete="off"></label>'+
      '<button type="button" class="btn btn-ghost zg-tap" data-act="zg-dhist" data-id="'+esc(id)+'" aria-expanded="'+u.hist+'">'+ico('clock',14)+'সংস্করণ ('+zg_bn((d.hist||[]).length)+')</button></div>'+
    (u.hist ? '<section class="zs-card mt12"><h2>সংস্করণের ইতিহাস</h2><div class="zs-sub">প্রতিবার বিল্ডে ফাইল বদলালে একটা লাইন যোগ হয়। পুরোনো কপি Google Drive ব্যাকআপে থাকে (PR 395 / 507)।</div><div class="zs-list">'+hist+'</div></section>' : '')+
    '<div id="zg-dres" class="zg-dres">'+zg_docHits(id, u.q)+'</div>'+
    '<div class="zg-dwrap">'+
      '<nav class="zg-toc" aria-label="সূচিপত্র"><details class="zg-tocd"'+(window.innerWidth>=1024?' open':'')+'><summary>সূচিপত্র · '+zg_bn(C.toc.length)+'টা অংশ</summary><div class="zg-tocl">'+tocHtml+'</div></details></nav>'+
      '<article class="zg-md" id="zg-md">'+C.html+'</article>'+
    '</div></div>';
}
function zg_docHits(id, q){
  q = String(q||'').trim().toLowerCase(); if(q.length < 2) return '';
  var d = zg_doc(id); if(!d || !d.md) return '';
  var lines = d.md.split('\n'), cur = {t:d.name, id:''}, hits = [], per = {}, seen = {};
  lines.forEach(function(l){
    var h = l.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if(h){ var sl = zg_slug(h[2]) || 'section'; if(seen[sl]){ seen[sl]++; sl = sl+'-'+seen[sl]; } else seen[sl] = 1; cur = {t:h[2], id:sl}; }
    var low = l.toLowerCase(), k = low.indexOf(q);
    if(k>=0){ if(!per[cur.id]){ per[cur.id] = {c:cur, n:0, snip:''}; hits.push(per[cur.id]); } var p = per[cur.id]; p.n++;
      if(!p.snip){ var a = Math.max(0, k-24), raw = l.replace(/[*`|#]/g,' '); var s0 = raw.slice(a, k+q.length+70); var j = s0.toLowerCase().indexOf(q); p.snip = esc(s0.slice(0, j))+'<mark>'+esc(s0.slice(j, j+q.length))+'</mark>'+esc(s0.slice(j+q.length)); } }
  });
  if(!hits.length) return '<div class="zs-empty">"'+esc(q)+'" এই ফাইলে নেই।</div>';
  var tot = hits.reduce(function(s, h){ return s + h.n; }, 0);
  return '<section class="zs-card zg-hits"><div class="zg-mini" role="status">'+zg_bn(tot)+' বার পাওয়া গেছে · '+zg_bn(hits.length)+'টা অংশে</div>'+hits.slice(0, 40).map(function(h){
    return '<button type="button" class="zg-hit" data-act="zg-jump" data-id="'+esc(h.c.id)+'"><b class="zg-ell">'+esc(h.c.t.replace(/[*`]/g,''))+'</b><span class="zg-ell">…'+h.snip+'…</span><small>'+zg_bn(h.n)+'</small></button>'; }).join('')+'</section>';
}
function zg_jump(sl, smooth){
  var el = sl ? document.getElementById('zgh-'+sl) : null;
  if(!el){ return false; }
  var y = el.getBoundingClientRect().top + window.pageYOffset - 70;
  window.scrollTo({top:Math.max(0, y), behavior: (smooth && Math.abs(y - window.pageYOffset) < 2500) ? 'smooth' : 'auto'});
  el.classList.add('zg-flash'); setTimeout(function(){ el.classList.remove('zg-flash'); }, 1600);
  try{ var base = location.hash.split('?')[0]; history.replaceState(history.state, '', location.href.split('#')[0] + base + '?h=' + sl); }catch(e){}
  return true;
}

/* ---------- download ---------- */
function zg_dlNote(msg){ var n = document.getElementById('zg-dlnote'); if(n) n.textContent = msg; }
function zg_download(id){
  var d = zg_doc(id); if(!d || !d.md){ toast('এই ফাইল ডেমোতে রাখা হয়নি'); return; }
  var name = d.name;
  var blobDl = function(){
    try{
      var blob = new Blob([d.md], {type:'text/markdown;charset=utf-8'});
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
      document.body.appendChild(a); a.click();
      setTimeout(function(){ try{ URL.revokeObjectURL(url); a.remove(); }catch(e){} }, 1500);
      toast('ডাউনলোড শুরু হয়েছে: '+name);
      zg_dlNote('ডাউনলোড না হলে: প্রিভিউ উইন্ডোতে ডাউনলোড বন্ধ থাকতে পারে — ডেমো ফাইলটা সাধারণ ব্রাউজারে খুলে আবার চাপুন।');
    }catch(e){ zg_dlNote('এই প্রিভিউতে ডাউনলোড বন্ধ আছে। ডেমো ফাইলটা সাধারণ ব্রাউজারে খুলে আবার চেষ্টা করুন।'); }
  };
  try{
    var c = window.claude;
    if(c && typeof c.use==='function'){
      var done = false;
      var tm = setTimeout(function(){ if(!done){ done = true; blobDl(); } }, 4000);
      c.use('downloads').then(function(ns){
        if(done) return; done = true; clearTimeout(tm);
        if(!ns || typeof ns.save!=='function'){ blobDl(); return; }
        ns.save({filename:name, data:new Blob([d.md], {type:'text/markdown'})}).then(function(){ toast('সেভ হয়েছে: '+name); }, function(err){
          var code = err && err.code;
          if(code==='declined') zg_dlNote('ডাউনলোড বাতিল করা হয়েছে।'); else blobDl();
        });
      }, function(){ if(!done){ done = true; clearTimeout(tm); blobDl(); } });
      return;
    }
    if(c && c.downloads && typeof c.downloads.save==='function'){
      Promise.resolve(c.downloads.save({filename:name, data:d.md})).then(function(){ toast('সেভ হয়েছে: '+name); }, blobDl);
      return;
    }
  }catch(e){}
  blobDl();
}

/* ---------- notifications: seen marker, sidebar badge, Telegram preview ---------- */
function zg_markOpen(){
  if(!ST) return;
  if(ZG.openUnseen===null){ ZG.openSeq = ST.zgSeenSeq || 0; ZG.openUnseen = zg_unseen(); }
  var m = zg_maxSeq(); if((ST.zgSeenSeq||0) < m){ ST.zgSeenSeq = m; saveState(); }
}
function zg_tgSync(){
  try{
    if(!ST || typeof za_ensure!=='function') return;
    var R = zg_R(), last = ST.zgTgSeq || 0, m = zg_maxSeq();
    if(m <= last) return;
    var evs = R.events.filter(function(e){ return ZG_EV_TYPES[e.type] && e.seq > last; });
    var nNew = evs.filter(function(e){ return e.type==='new-pr'; }).length, nUp = evs.filter(function(e){ return e.type==='update' || e.type==='changed'; }).length, nSt = evs.filter(function(e){ return e.type==='new-stage'; }).length;
    var lines = ['📚 Register update · রেজিস্টারে খবর', (nNew ? zg_bn(nNew)+'টা নতুন PR' : '')+(nUp ? (nNew?', ':'')+zg_bn(nUp)+'টা PR-এ আপডেট' : '')+(nSt ? ', '+zg_bn(nSt)+'টা নতুন সেকশন' : '')];
    evs.slice(-3).forEach(function(e){
      if(e.type==='new-pr'){ var al = (e.aligned||[]).slice(0,3).map(function(x){ return x.n; }); lines.push('PR '+e.pr+' যোগ হলো'+(al.length ? ' · যুক্ত: '+al.join(', ') : '')); }
      else if(e.type==='new-stage') lines.push('নতুন সেকশন: '+e.stage+' · '+e.name);
      else lines.push('PR '+e.pr+'-এ নতুন অংশ যোগ হলো');
    });
    lines.push('→ ড্যাশবোর্ড › PR রেজিস্টার › নতুন কী');
    var z = za_ensure(); z.tg.push({who:'prohori', text:lines.join('\n')}); z.tg = z.tg.slice(-30);
    ST.zgTgSeq = m; saveState();
  }catch(e){}
}
(function(){
  try{
    var orig = window.adminShell; if(typeof orig!=='function' || orig._zg) return;
    var w = function(body, cur){
      var out = orig.apply(this, arguments);
      try{
        zg_tgSync();
        /* Interim fix (found 19 Oct, reported to the owner of 03-layout.js): since the
           "In the full build" list became empty, the desktop sidebar lost its anchor, so
           89's System group and 90's Operations group (Settings … PR রেজিস্টার) were never
           inserted — only the phone chips had them. Put them back before "Back to the shop"
           with the same markup; does nothing once either group is present again. */
        if(out.indexOf('<aside class="admin-side"')>=0 && out.indexOf('data-zo-grp')<0 && out.indexOf('data-zs-sys')<0){
          var p0 = (cur && cur.path) || '';
          var on = function(h){ var x = h.slice(1); return p0===x || p0.indexOf(x+'/')===0; };
          var lk = function(l, mk){ return '<a class="'+(on(l[1])?'on':'')+'" href="'+l[1]+'" '+mk+'>'+ico(l[2],18)+esc(l[0])+'</a>'; };
          var grp = (typeof ZS_SYS_LINKS!=='undefined' ? '<div class="zs-sidegrp" data-zs-sys>System</div>'+ZS_SYS_LINKS.map(function(l){ return lk(l, 'data-zs'); }).join('') : '')+
                    (typeof ZO_LINKS!=='undefined' ? '<div class="zs-sidegrp" data-zo-grp>Operations</div>'+ZO_LINKS.map(function(l){ return lk(l, 'data-zo'); }).join('') : '');
          out = out.replace('<a href="#/" style="margin-top:auto">', grp+'<a href="#/" style="margin-top:auto">');
        }
        var n =(cur && /^\/admin\/register/.test(cur.path||'')) ? 0 : zg_unseen();
        if(n){
          var b = '<span class="zg-sbadge" aria-label="'+n+' new">'+zg_bn(n)+'</span>';
          out = out.replace(/(<a class="[^"]*" href="#\/admin\/register" data-zo>[\s\S]*?)(<\/a>)/g, '$1'+b+'$2');
        }
      }catch(e){}
      return out;
    };
    w._zg = true; window.adminShell = w;
  }catch(e){}
})();
/* keep a small record of the register's own history entries, so "close" can step back exactly */
window.addEventListener('hashchange', function(){
  var h = location.hash || '#/', s = ZG.stack;
  if(s.length>1 && s[s.length-2]===h) s.pop(); else if(s[s.length-1]!==h) s.push(h);
  if(s.length>60) s.splice(0, s.length-60);
});
document.addEventListener('keydown', function(ev){ if(ev.key==='Escape' && document.querySelector('.zg-panel') && !document.querySelector('.modal-back')) zg_close(); });

function zg_close(){
  var s = ZG.stack, depth = 0;
  for(var i = s.length-1; i>=0 && /^#\/admin\/register\/pr\//.test(s[i]); i--) depth++;
  var base = s[s.length-1-depth];
  if(depth && base && /^#\/admin\/register(\?|$)/.test(base)){ history.go(-depth); return; }
  go('#/admin/register');
}

/* ---------- pages ---------- */
function zg_main(tab){
  var body = tab==='new' ? zg_tabNew() : tab==='issues' ? zg_tabIssues() : tab==='docs' ? zg_tabDocs() : zg_tabStages();
  return '<div class="zs-page zg-page">'+zg_head()+zg_kpis()+zg_tabs(tab)+'<div class="zg-body">'+body+'</div></div>';
}
function zg_tab(q){ var t = (q && q.tab) || ''; return ['stages','new','issues','docs'].indexOf(t)>=0 ? t : (ZG.lastTab || 'stages'); }
PAGES['zg-page'] = {layout:'admin', title:'PR রেজিস্টার',
  render:function(p, q){ zg_markOpen(); var t = (q && q.tab) || 'stages'; ZG.lastTab = t; return zg_main(t); },
  after:function(){ var u = zg_u(); if(u.focusQ){ u.focusQ = false; ZG.from = null; var i = document.getElementById('zg-q'); if(i){ i.focus(); try{ i.setSelectionRange(i.value.length, i.value.length); }catch(e){} } }
    else zg_focusBack(); }
};
/* TA-2 (T15): closing the PR side panel (✕, Esc, Back) puts focus back on the
   row link that opened it — it used to drop to <body>. The opener is noted on
   the click; the panel is its own route, so the list page's after() restores it. */
document.addEventListener('click', function(ev){
  var a = ev.target && ev.target.closest && ev.target.closest('a[href^="#/admin/register/pr/"]');
  if(a && !a.closest('.zg-panel')) ZG.from = {href:a.getAttribute('href'), cls:String(a.className||'').split(' ')[0]};
}, true);
function zg_focusBack(){
  var f = ZG.from, s = ZG.stack; ZG.from = null; if(!f) return;
  if(!/^#\/admin\/register\/pr\//.test(s[s.length-1] || '')) return;   /* only when coming straight back from the panel */
  var q = 'a[href="'+f.href.replace(/"/g,'')+'"]', a = (f.cls && document.querySelector('a.'+f.cls.replace(/[^\w-]/g,'')+q.slice(1))) || document.querySelector(q);
  if(a) try{ a.focus({preventScroll:true}); }catch(e){}
}
PAGES['zg-pr'] = {layout:'admin', title:function(p){ return 'PR '+p[0]+' · PR রেজিস্টার'; },
  render:function(p, q){ zg_markOpen(); return zg_main(ZG.lastTab || 'stages')+zg_panel(+p[0]); },
  after:function(){ var h = document.getElementById('zg-pt'); if(h){ h.setAttribute('tabindex','-1'); try{ h.focus({preventScroll:true}); }catch(e){} } }
};
PAGES['zg-doc'] = {layout:'admin', title:function(p){ var d = zg_doc(p[0]); return (d ? d.name : 'File')+' · PR রেজিস্টার'; },
  render:function(p, q){ zg_markOpen(); return zg_docPage(p[0], q); },
  after:function(p, q){ if(q && q.h) setTimeout(function(){ zg_jump(q.h, false); }, 30); }
};

/* ---------- actions ---------- */
INPUT['zg-q'] = function(el){
  var u = zg_u(); u.q = el.value;
  var r = document.getElementById('zg-res'); if(r) r.innerHTML = zg_results();
  var c = document.querySelector('.zg-clear'); if(c) c.hidden = !zg_active(u);
};
CHANGE['zg-f'] = function(el){
  var u = zg_u(), k = el.getAttribute('data-k');
  u[k] = el.type==='checkbox' ? el.checked : el.value;
  u.more.res = false;
  var r = document.getElementById('zg-res'); if(r) r.innerHTML = zg_results();
  var c = document.querySelector('.zg-clear'); if(c) c.hidden = !zg_active(u);
};
ACT['zg-clear'] = function(){ var u = zg_u(); u.q = ''; u.stage = ''; u.agent = ''; u.status = ''; u.since = ''; u.dec = false; rerender(); };
ACT['zg-stage'] = function(el){
  var u = zg_u(), c = el.getAttribute('data-c'); u.open[c] = !u.open[c];
  var sec = document.getElementById('zg-s-'+c); if(!sec){ rerender(); return; }
  var tmp = document.createElement('div'); var S = zg_S(c);
  if(u.open[c]){ tmp.innerHTML = '<div class="zg-sb" id="zg-sb-'+c+'">'+zg_stageBody(S)+'</div>'; sec.appendChild(tmp.firstChild); sec.classList.add('open'); }
  else { var b = document.getElementById('zg-sb-'+c); if(b) b.remove(); sec.classList.remove('open'); }
  el.setAttribute('aria-expanded', String(!!u.open[c]));
};
ACT['zg-gostage'] = function(el){ var u = zg_u(), c = el.getAttribute('data-c'); if(c){ u.open[c] = true; u.q = ''; u.stage = ''; u.agent = ''; u.status = ''; u.since = ''; u.dec = false; } ZG.lastTab = 'stages'; zg_close(); setTimeout(function(){ var s = document.getElementById('zg-s-'+c); if(s) s.scrollIntoView({block:'start'}); }, 120); };
ACT['zg-more'] = function(el){ zg_u().more[el.getAttribute('data-k')] = true; if(el.getAttribute('data-k')==='res'){ var r = document.getElementById('zg-res'); if(r){ r.innerHTML = zg_results(); return; } } rerender(); };
ACT['zg-close'] = function(){ zg_close(); };
ACT['zg-toform'] = function(){ var f = document.getElementById('zg-report'); if(f){ f.scrollIntoView({behavior:'smooth', block:'start'}); var t = document.getElementById('zg-what'); if(t) setTimeout(function(){ try{ t.focus({preventScroll:true}); }catch(e){} }, 350); } };
SUBMIT['zg-report'] = function(f){
  var n = +f.getAttribute('data-n'), P = zg_P(n); if(!P) return;
  var what = (f.querySelector('[name=what]').value || '').trim();
  if(!what){ toast('কী সমস্যা হয়েছে লিখুন'); f.querySelector('[name=what]').focus(); return; }
  var page = (f.querySelector('[name=page]').value || '').trim().slice(0, 200);
  var pr = f.querySelector('[name=pri]:checked'); var pri = pr ? pr.value : 'mid';
  var ag = zg_owner(P), title = 'PR '+n+': '+what.slice(0, 120);
  var x = {id:'R'+Date.now().toString(36), n:n, what:what.slice(0, 600), page:page, pri:pri, at:Date.now(), agent:ag, via:'gyani', st:'open', task:null};
  try{ if(typeof za_addTask==='function'){ var due = null; if(pri==='high'){ var d = new Date(); due = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); } var t = za_addTask(ag, title, due, 'Chief (Gyani) · PR register'); if(t) x.task = t.title; } }catch(e){}
  try{ if(typeof za_ensure==='function'){ var z = za_ensure(); z.tg.push({who:'gyani', text:'📌 PR '+n+'-এ সমস্যা জানানো হয়েছে ('+(ZG_PRI.filter(function(p){ return p[0]===pri; })[0]||ZG_PRI[1])[1]+')\n"'+what.slice(0, 140)+'"\n→ '+zg_agName(ag)+(zg_ag(ag).code ? ' · '+zg_ag(ag).code : '')+'-কে দিলাম।'}); z.tg = z.tg.slice(-30); } }catch(e){}
  zg_st().prIssues.unshift(x); zg_u().pri = pri; saveState();
  toast('জানানো হয়েছে — জ্ঞানী কাজটা '+(zg_ag(ag).bn || zg_ag(ag).en)+'-কে দিলেন');
  rerender();
};
ACT['zg-ist'] = function(el){
  var x = zg_issues().filter(function(i){ return i.id===el.getAttribute('data-id'); })[0]; if(!x) return;
  x.st = el.getAttribute('data-v');
  try{ if(x.task && typeof za_findTask==='function'){ var t = za_findTask(x.agent, x.task); if(t) t.st = x.st==='open' ? 'todo' : x.st; } }catch(e){}
  saveState(); rerender(); toast(x.st==='done' ? 'সমাধান হয়েছে বলে রাখা হলো' : x.st==='doing' ? 'কাজ চলছে' : 'আবার খোলা হলো');
};
ACT['zg-rv'] = function(el){
  var k = el.getAttribute('data-k'), v = el.getAttribute('data-v'); zg_st().zgReview[k] = v;
  if(v==='merge'){ try{ if(typeof za_addTask==='function') za_addTask('gyani', 'Register: PR '+el.getAttribute('data-a')+' vs PR '+el.getAttribute('data-b')+' — merge as a scope update?', null, 'PR register review'); }catch(e){} toast('জ্ঞানীর তালিকায় দেওয়া হলো'); }
  else toast('আলাদা থাকবে');
  saveState(); rerender();
};
ACT['zg-dl'] = function(el){ zg_download(el.getAttribute('data-id')); };
ACT['zg-jump'] = function(el){ if(!zg_jump(el.getAttribute('data-id'), true)) toast('এই অংশটা পাওয়া যায়নি'); if(window.innerWidth<1024){ var d = document.querySelector('.zg-tocd'); if(d && el.closest('.zg-tocd')) d.open = false; } };
ACT['zg-anc'] = function(el){ var base = location.hash.split('?')[0]; zo_copy(zo_shopUrl(base+'?h='+el.getAttribute('data-id')), 'এই অংশের লিংক কপি হয়েছে'); };
ACT['zg-dhist'] = function(el){ var u = ui('zgdoc:'+el.getAttribute('data-id'), {q:'', hist:false}); u.hist = !u.hist; rerender(); };
INPUT['zg-dq'] = function(el){ var id = el.getAttribute('data-id'), u = ui('zgdoc:'+id, {q:'', hist:false}); u.q = el.value; var r = document.getElementById('zg-dres'); if(r) r.innerHTML = zg_docHits(id, u.q); };
