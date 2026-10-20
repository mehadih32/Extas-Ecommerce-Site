/* =====================================================================
   94-admin-blog.js — দূত Doot A360-06 + জ্ঞানী Gyani A360-01 · Blog & SEO
   S12 PR 239–253, 528–530 · S11 PR 220–238 · PR 591 content pipeline ·
   PR 592 full blog + house ads · PR 593 author team under Doot
   #/admin/blog                 posts: list, filters, SEO score, index status
   #/admin/blog?tab=topics      topic list — agents propose, the owner approves
   #/admin/blog?tab=pipe        pipeline: writing → proof → Doot final → ready → scheduled → published
   #/admin/blog?tab=sched       posts per day, publishing slots, auto-fill
   #/admin/blog?tab=results     per-post numbers + monthly refresh / merge / prune
   #/admin/blog?tab=authors     the five author agents (&a=<id> = profile)
   #/admin/blog?tab=cats        categories (pillars), sub-categories, tags
   #/admin/blog?tab=ads         house ad slots (&ad=<id|new> = editor)
   #/admin/blog?tab=seo         sitemaps, indexing, Search Console, AI crawlers
   #/admin/blog/<id|new>        editor + live SEO checklist + interlinking helper
   SHARED STORES — the shop's blog (73-blog.js) reads these. Add fields, never rename:
     ST.ops.blog.posts (+ seeds) → DB.journal (published only, rebuilt by zb_apply)
     ST.blogPillars · ST.blogAuthors · ST.blogByline · ST.blogAds · ST.blogAdSettings
   Rules in code: the writer never approves its own post; a pipeline post cannot
   be scheduled or published until all seven proofreading checks pass; nothing
   is deleted (unpublish → draft, ads and categories → switched off).
   DEMO: numbers, costs and seed topics are simulated. Prefix zb_.
   BLOG QA FIX ROUND (Gyani, 19 Oct · qa/BLOG-QA-REPORT.md "Fixed (back)") — decisions taken:
     · owner-facing words in simple Bengali; agent NAMES on screen, codes only as grey/tooltip; no PR numbers
     · agent steps (send to proof, ticks, proof pass, Doot final) are read-only status chips with a progress
       bar; the buttons live in a "ডেমো: এজেন্টের ধাপ" strip on each card, shown while the page switch
       "ডেমো নিয়ন্ত্রণ" is on (default on in the demo — tests and the walkthrough use it; off = live view)
     · owner actions: approve topics, publish (with a confirm) / schedule, unpublish, edit
     · ad relevance (zb_adWhy): chosen categories (ad.pillars) decide alone — those categories' posts only.
       With no category: ad.match 'related' (seed + new ads) = only posts whose products or tags match the
       ad's product/category; 'all' = every post (campaigns). Chosen posts (ad.posts) override both. zb_adsFor applies it, so the
       shop and the editor's "which posts" list agree. An empty slot is fine — the shop collapses it.
     · ad dates are whole days in cfg.tz (Asia/Dhaka): live from 00:00 on the start day to 23:59 on the end day
   ===================================================================== */
zo_route(/^\/admin\/blog$/, 'zb-list');
zo_route(/^\/admin\/blog\/([\w-]+)$/, 'zb-edit');
zo_link(['ব্লগ ও SEO','#/admin/blog','globe','Blog & SEO']);

var ZB_SNAP = JSON.parse(JSON.stringify(DB.journal || []));
var ZB_D = 86400000, ZB_H = 3600000;
function zb_clone(o){ return JSON.parse(JSON.stringify(o)); }
function zb_pad(n){ return (n<10?'0':'')+n; }
function zb_bn(n){ return typeof zs_bnNum==='function' ? zs_bnNum(n) : String(n); }

/* ---------- settings: defaults here, the owner's changes in ST.ops.blog.cfg ---------- */
var ZB_CFG_DEF = {
  perDay:{min:3, target:5, max:6},
  slots:['09:00','12:00','15:00','18:00','21:00'],
  head:'doot',                       /* head of content — does the final SEO check */
  dup:{warn:0.5, near:0.34},         /* word-overlap score: warn = too close, near = show */
  links:{min:3, max:5},
  meta:{min:120, max:160},
  qa:{min:40, max:60},
  daysAhead:7, leadMin:15,
  tz:'Asia/Dhaka', tzOffsetMin:360,  /* shop time zone — ad start/end days are whole days here (fallback offset if Intl has no tz data) */
  review:{pruneVisits:60, pruneAgeDays:28, refreshDrop:-15, posFrom:8, posTo:20, mergeScore:0.34},
  jobSize:{write:1.5, proof:0.5, seo:0.3},
  models:{write:'Claude Sonnet 5.5', proof:'Claude Haiku 5.5', seo:'Claude Haiku 5.5'}
};
function zb_st(){
  var o = zo_ops(); if(!o.blog) o.blog = {posts:{}, idx:{}, sitemapAt:Date.now()-5*ZB_H, ai:true, gsc:true};
  var b = o.blog; ['cfg','topics','idx','posts'].forEach(function(k){ if(!b[k]) b[k] = {}; });
  if(!b.mine) b.mine = []; if(b.rot==null) b.rot = 0; return b;
}
function zb_cfg(){ var c = zb_clone(ZB_CFG_DEF), o = zb_st().cfg; Object.keys(o).forEach(function(k){ var v = o[k]; c[k] = (v && typeof v==='object' && !Array.isArray(v)) ? Object.assign(c[k]||{}, v) : v; }); return c; }
function zb_setCfg(k, v){ zb_st().cfg[k] = zb_clone(v); zb_commit(); }
var ZB_V = 0, ZB_MEMO = null;
function zb_commit(){ ZB_V++; ZB_MEMO = null; try{ zb_apply(); }catch(e){} saveState(); }

/* ---------- categories (pillars) + sub-categories — ST.blogPillars ---------- */
var ZB_PILLARS_DEF = [
  {id:'care',   bn:'যত্ন ও ধোয়া', en:'Care & washing', secs:['Care'], subs:[['washing','ধোয়া','Washing'],['storage','রাখা ও ভাঁজ','Storage & folding']]},
  {id:'style',  bn:'স্টাইল', en:'Styling', secs:['Style'], subs:[['office','অফিস','Office'],['casual','ক্যাজুয়াল','Casual']]},
  {id:'fabric', bn:'কাপড়', en:'Fabrics', secs:['Fabric'], subs:[['cotton','কটন','Cotton'],['gsm','GSM ও ওজন','GSM & weight']]},
  {id:'fit',    bn:'ফিট ও সাইজ', en:'Fit & size', secs:['Size guide','Fit guide'], subs:[['size-charts','সাইজ চার্ট','Size charts'],['fit-types','ফিটের ধরন','Fit types']]},
  {id:'season', bn:'উৎসব ও মৌসুম', en:'Occasions & seasons', secs:['Winter'], subs:[['eid','ঈদ','Eid'],['winter','শীত','Winter'],['wedding','বিয়ে','Weddings']]},
  {id:'brand',  bn:'প্রোডাক্ট ও ব্র্যান্ড', en:'Product & brand', secs:['Behind EXTAS'], subs:[['how-we-make','কীভাবে বানাই','How we make it'],['tests','আমাদের টেস্ট','Our tests']]}
];
function zb_pillarsAll(){
  if(!ST.blogPillars || !ST.blogPillars.length) ST.blogPillars = ZB_PILLARS_DEF.map(function(p){ return {id:p.id, bn:p.bn, en:p.en, secs:p.secs.slice(), hidden:false, subs:p.subs.map(function(s){ return {id:s[0], bn:s[1], en:s[2], hidden:false}; })}; });
  return ST.blogPillars;
}
function zb_pillars(){ return zb_pillarsAll().filter(function(p){ return !p.hidden; }); }
function zb_pillar(id){ var l = zb_pillarsAll(); for(var i=0;i<l.length;i++) if(l[i].id===id) return l[i]; return null; }
function zb_pillarOf(p){ if(p && p.pillar && zb_pillar(p.pillar)) return p.pillar; var l = zb_pillarsAll(), s = p && p.section; for(var i=0;i<l.length;i++) if((l[i].secs||[]).indexOf(s)>=0) return l[i].id; return l.length ? l[0].id : ''; }
function zb_pname(id){ var x = zb_pillar(id); return x ? x.bn : (id||'—'); }
function zb_subName(pid, sid){ var x = zb_pillar(pid); if(!x || !sid) return ''; var s = (x.subs||[]).filter(function(y){ return y.id===sid; })[0]; return s ? s.bn : ''; }
function zb_secOf(pid){ var x = zb_pillar(pid); return x ? ((x.secs && x.secs[0]) || x.en) : 'Style'; }

/* ---------- the author team (PR 593) — ST.blogAuthors ---------- */
var ZB_AUTHORS_DEF = [
  {id:'suta',  code:'A360-08', name:'Suta',  bn:'সুতা',  pillars:['fabric','fit'], col:'#6B5B3E'},
  {id:'jotno', code:'A360-09', name:'Jotno', bn:'যত্ন',  pillars:['care'],         col:'#2F6B5E'},
  {id:'rong',  code:'A360-10', name:'Rong',  bn:'রঙ',   pillars:['style'],        col:'#8A3D5A'},
  {id:'ritu',  code:'A360-11', name:'Ritu',  bn:'ঋতু',   pillars:['season'],       col:'#3D5A80'},
  {id:'bazar', code:'A360-12', name:'Bazar', bn:'বাজার', pillars:['brand'],        col:'#7A5A2E'}
];
function zb_authors(){
  if(!ST.blogAuthors || !ST.blogAuthors.length){
    var c = zb_cfg();
    ST.blogAuthors = ZB_AUTHORS_DEF.map(function(a){
      var topics = a.pillars.map(function(p){ var x = zb_pillar(p); return x ? x.en.toLowerCase() : p; }).join(' and ');
      return {id:a.id, code:a.code, name:a.name, bn:a.bn, pillar:a.pillars[0], pillars:a.pillars.slice(), col:a.col,
        bio:'An AI writer on the EXTAS team. Writes about '+topics+' from our product data, size charts and our own photos. Every article is proofread by another writer and checked by our team before it goes live.',
        bioBn:zb_bioBnSeed(a.id, a.pillars), photo:'', reviewer:'', models:zb_clone(c.models)};
    });
  }
  /* F10: every author has a Bengali bio the owner can edit (older saved teams get it once) */
  ST.blogAuthors.forEach(function(a){ if(a.bioBn==null) a.bioBn = zb_bioBnSeed(a.id, a.pillars || [a.pillar]); });
  return ST.blogAuthors;
}
/* the shop's own seed Bengali bio when it has one (73-blog.js), else a plain line from the pillar names */
function zb_bioBnSeed(id, pillars){
  var s = typeof BLOG_AUTHORS_SEED!=='undefined' && Array.isArray(BLOG_AUTHORS_SEED) ? BLOG_AUTHORS_SEED.filter(function(x){ return x.id===id; })[0] : null;
  if(s && s.bioBn) return s.bioBn;
  var t = (pillars||[]).map(function(p){ var x = zb_pillar(p); return x ? x.bn : p; }).join(' আর ');
  return 'EXTAS টিমের একজন AI লেখক। '+(t ? t+' নিয়ে লেখে — ' : '')+'আমাদের প্রোডাক্টের তথ্য, সাইজ চার্ট আর নিজেদের তোলা ছবি দেখে। প্রতিটা লেখা আরেকজন লেখক প্রুফ করে, তারপর আমাদের টিম দেখে প্রকাশ করে।';
}
function zb_author(id){ var l = zb_authors(); for(var i=0;i<l.length;i++) if(l[i].id===id) return l[i]; return null; }
function zb_authorFor(pillar){ var l = zb_authors(); for(var i=0;i<l.length;i++) if((l[i].pillars||[l[i].pillar]).indexOf(pillar)>=0) return l[i].id; return l.length ? l[0].id : zb_cfg().head; }
function zb_byline(){ if(!ST.blogByline) ST.blogByline = {note:'EXTAS-এর AI লেখক দলের লেখা, আমাদের টিম যাচাই করেছে', noteEn:'Written by the EXTAS AI writing team, checked by our team', reviewedBy:''}; return ST.blogByline; }
function zb_code(id){ if(!id) return ''; if(id==='owner') return 'owner'; var a = zb_author(id); if(a) return a.code; return (typeof ZA_CODE!=='undefined' && ZA_CODE[id]) || id; }
function zb_name(id){ if(!id) return '—'; if(id==='owner') return 'মালিক'; var a = zb_author(id); if(a) return a.bn+' · '+a.name; var g = typeof zs_agent==='function' ? zs_agent(id) : null; return g ? g.bn+' · '+g.en : id; }
function zb_avatar(id, cls){
  cls = cls || 'zb-av';
  if(id==='owner') return '<span class="'+cls+'" style="background:var(--ink)">'+ico('user',12)+'</span>';
  var a = zb_author(id);
  if(a){ if(a.photo && /^data:image\//.test(a.photo)) return '<span class="'+cls+'" style="background:'+a.col+' center/cover no-repeat url('+a.photo+')" aria-hidden="true"></span>'; return '<span class="'+cls+'" style="background:'+esc(a.col)+'" aria-hidden="true">'+esc(a.bn.charAt(0))+'</span>'; }
  var g = typeof zs_agent==='function' ? zs_agent(id) : null;
  return g ? '<span class="'+cls+'" style="background:'+g.col+'" aria-hidden="true">'+esc(g.bn.charAt(0))+'</span>' : '<span class="'+cls+'">?</span>';
}
/* the short name the owner reads on screen (UX 2): "যত্ন", "দূত", "মালিক" — the code only as a tooltip / grey text */
function zb_short(id){ if(!id) return '—'; if(id==='owner') return 'মালিক'; var a = zb_author(id); if(a) return a.bn; var g = typeof zs_agent==='function' ? zs_agent(id) : null; return g ? g.bn : id; }
function zb_codeTip(id){ var c = zb_code(id); return c && c!=='owner' ? c : ''; }
function zb_who(id, role){ var tip = zb_codeTip(id); return '<span class="zbp-who" title="'+esc(role+' · '+zb_name(id)+(tip ? ' · '+tip : ''))+'">'+zb_avatar(id)+'<b class="za-bn">'+esc(zb_short(id))+'</b>'+(role ? '<i class="za-bn">'+esc(role)+'</i>' : '')+'</span>'; }
function zb_sign(p){ p.author = zb_code(p.writer); p.reviewer = zb_code(p.proofer); return p; }
function zb_rotProofer(writer){ var s = zb_st(), l = zb_authors().map(function(a){ return a.id; }).filter(function(x){ return x!==writer; }); if(!l.length) return ''; var id = l[s.rot % l.length]; s.rot++; return id; }
function zb_models(){ return typeof ZA_MODELS!=='undefined' ? ZA_MODELS : [{m:'Claude Sonnet 5.5', c:9},{m:'Claude Haiku 5.5', c:3}]; }
function zb_rate(model, job){ var m = zb_models().filter(function(x){ return x.m===model; })[0], c = zb_cfg(); return (m ? m.c : 9) * (c.jobSize[job] || 1); }

/* ---------- text helpers: word overlap for the duplicate check ---------- */
var ZB_STOP = {};
('a an and the of in on for to how what which why when is are with your you our we vs it its from by at or do does without one this that these those than into own can be not no so if as all any more most each every just per ও আর কি কী কোন কোনটা কীভাবে কেন যে এর এবং করে করার হয় নেবেন জন্য দিয়ে থেকে সাথে নিয়ে').split(' ').forEach(function(w){ ZB_STOP[w] = 1; });
function zb_tok(s){
  s = String(s||'').toLowerCase(); try{ s = s.normalize('NFD').replace(/[̀-ͯ]/g,''); }catch(e){}
  s = s.replace(/\bt[\s-]?shirts?\b/g, 'tshirt').replace(/\btees?\b/g, 'tshirt');
  var out = [];
  s.split(/[^0-9a-zঀ-৿]+/).forEach(function(w){
    if(!w || ZB_STOP[w]) return;
    if(/^[a-z]+$/.test(w) && w.length>3 && /s$/.test(w) && !/ss$/.test(w)) w = w.slice(0,-1);
    if((w.length<2 && !/\d/.test(w)) || ZB_STOP[w]) return;
    if(out.indexOf(w)<0) out.push(w);
  });
  return out;
}
function zb_jac(a, b){ if(!a.length || !b.length) return 0; var i = a.filter(function(x){ return b.indexOf(x)>=0; }).length; return i / (a.length + b.length - i); }
function zb_words(t){ return String(t||'').trim().split(/\s+/).filter(Boolean).length; }
function zb_kwIn(kw, t){ kw = String(kw||'').toLowerCase().trim(); return !!kw && String(t||'').toLowerCase().indexOf(kw)>=0; }
/* zo_slug strips accents (Piqué → pique); the journal reads each entry's own slug first (hm_journalSlug) */
function zb_jslug(t){ return typeof zo_slug==='function' ? zo_slug(t) : hm_journalSlug({t:t}); }
function zb_href(p){ return '#/journal/'+(p.slug || zb_jslug(p.title)); }
function zb_local(ts){ var d = new Date(ts); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0,16); }
function zb_dayStart(off){ var d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+off); return d.getTime(); }
function zb_slotTs(off, hm){ var a = String(hm).split(':'); return zb_dayStart(off) + ((+a[0]||0)*60 + (+a[1]||0))*60000; }
function zb_hm(ts){ var d = new Date(ts); return zb_pad(d.getHours())+':'+zb_pad(d.getMinutes()); }
function zb_iso(ts){ var d = new Date(ts); return d.getFullYear()+'-'+zb_pad(d.getMonth()+1)+'-'+zb_pad(d.getDate()); }
/* F8: the calendar day (YYYY-MM-DD) in the shop's time zone, whatever the browser's own zone is */
function zb_tzDay(ts){
  var c = zb_cfg(), d = new Date(ts==null ? Date.now() : ts);
  try{ var s = new Intl.DateTimeFormat('en-CA', {timeZone:c.tz, year:'numeric', month:'2-digit', day:'2-digit'}).format(d); if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; }catch(e){}
  return new Date(d.getTime() + (c.tzOffsetMin||0)*60000).toISOString().slice(0,10);
}
function zb_inDay(ts, off){ var a = zb_dayStart(off), b = zb_dayStart(off+1); return ts>=a && ts<b; }
function zb_dayName(off){ return off===0 ? 'আজ' : off===1 ? 'কাল' : new Date(zb_dayStart(off)).toLocaleDateString('en-GB',{weekday:'short', day:'numeric', month:'short'}); }

/* ---------- seed topics (Demo · simulated) ----------
   [id, title, target query, pillar, link (cat:<id> | prod:<id>), proposed by, status, priority, language] */
var ZB_TOPIC_SEED = [
  ['t01','How to keep a polo shirt in shape','how to keep polo shirt in shape','care','cat:polos','doot','writing',1],
  ['t02','How to wash denim so it lasts','how to wash raw denim','care','cat:trousers','doot','proposed',2],
  ['t03','Washing white T-shirts without yellowing','white t shirt yellow stain remove','care','cat:tshirts','doot','approved',1],
  ['t04','How to stop a polo collar from curling','polo collar curling','care','cat:polos','doot','proof',1],
  ['t05','Hoodie pilling: why it happens and how to stop it','hoodie pilling','care','cat:hoodies','doot','proposed',2],
  ['t06','Winter layering in Dhaka','winter layering men dhaka','season','cat:hoodies','doot','proposed',2],
  ['t07','Polo shirt vs T-shirt: which one, when','polo shirt vs t shirt','style','cat:polos','doot','ready',1],
  ['t08','Five outfits with a navy polo','navy polo outfit','style','prod:essential-pique-polo','doot','approved',2],
  ['t09','Office shirt and chino pairings for men','office outfit men bangladesh','style','cat:shirts','doot','scheduled',2],
  ['t10','What GSM means: 160 vs 180 vs 240 GSM T-shirts','gsm t shirt meaning','fabric','cat:tshirts','doot','proposed',2],
  ['t11','Piqué vs jersey polo: what is the difference','pique vs jersey polo','fabric','cat:polos','doot','proof',2],
  ['t12','French terry vs fleece hoodie for Bangladesh winter','fleece vs french terry hoodie','fabric','cat:hoodies','doot','approved',2],
  ['t13','Twill pants vs jeans in Bangladesh heat','twill pant vs jeans','fabric','cat:trousers','doot','proposed',3],
  ['t14','T-shirt size chart for Bangladesh men: how to measure','t shirt size chart bangladesh men','fit','cat:tshirts','doot','writing',1],
  ['t15','Drop-shoulder vs regular-fit T-shirt: how to pick a size','drop shoulder t shirt size chart','fit','cat:tshirts','doot','ready',2],
  ['t16','পাঞ্জাবির সাইজ চার্ট: কোন সাইজ নেবেন','পাঞ্জাবি সাইজ চার্ট বাংলাদেশ','fit','cat:panjabi','doot','scheduled',1,'bn'],
  ['t17','Eid panjabi 2027: colours and styles','eid panjabi collection','season','cat:panjabi','owner','approved',1],
  ['t18','Winter hoodie guide for Bangladesh','winter hoodies for men bd','season','cat:hoodies','doot','final',1],
  ['t19','What to wear to a winter wedding in Bangladesh','winter wedding outfit men','season','cat:panjabi','owner','approved',2],
  ['t20','How we make our piqué polo: fabric, stitching, QC','extas polo quality','brand','prod:essential-pique-polo','owner','approved',2],
  ['t21','Washed 10 times: our polo colour test','polo colour fade after wash','brand','prod:essential-pique-polo','doot','proposed',2],
  ['t22','Linen shirt care in the monsoon','linen shirt care','care','cat:shirts','doot','rejected',3]
];
/* Doot's next proposals ("দূত আরো টপিক আনুক") */
var ZB_TOPIC_MORE = [
  ['How to iron a panjabi without shine','how to iron panjabi','care','cat:panjabi'],
  ['Slim fit vs regular fit polo: which suits you','slim fit vs regular fit polo','fit','cat:polos'],
  ['What to wear on Pohela Boishakh: a men\'s guide','pohela boishakh dress for men','season','cat:panjabi'],
  ['Cotton vs polyester T-shirts in humid weather','cotton vs polyester t shirt','fabric','cat:tshirts'],
  ['How to fold a hoodie to save space','how to fold hoodie','care','cat:hoodies'],
  ['Best shirt colours for brown skin','best shirt colour for brown skin men','style','cat:shirts']
];
/* seed drafts for topics already in the pipeline: [kw, meta, quick answer, body, checks, proofed, final, comments, hero, tags, sub, slug] */
var ZB_PSEED = {
  t01:['polo shirt in shape','','',
    'A polo shirt loses its shape for three reasons: hot water, hanging it wet and tumble drying. Fix those three and a good piqué polo keeps its collar and hem for years.\n\nWash it cold and inside out. Heat shrinks cotton unevenly, which is why the hem starts to wave.\n\n[still writing: drying, folding, collar care]',
    {}, false, false, [], '', ['polo','care'], 'washing'],
  t14:['t-shirt size chart','','',
    'Lay a T-shirt that fits you well on a flat table. Measure across the chest one inch below the armpits, and from the highest point of the shoulder down to the hem.\n\nDouble the chest number and compare it with the chart on the product page.\n\n[still writing: the chart table, between two sizes, drop-shoulder note]',
    {}, false, false, [], '', ['t-shirt','size chart'], 'size-charts'],
  t04:['polo collar','Why a polo collar curls after a few washes and how to stop it: wash cold, dry flat in the shade, press it once and pick a firm rib collar.',
    'Collars curl when the rib shrinks more than the body fabric. Wash cold and inside out, dry flat in the shade with the collar open, and press the tips while damp. A curled collar can be ironed flat on medium heat through a thin cloth.',
    'A polo collar curls when the rib knit shrinks more than the fabric under it. Heat is the main cause: hot water, a hot iron straight on the tips, or drying in full sun.\n\nWash the polo cold and inside out, then dry it flat in the shade with the collar laid open. While it is still a little damp, press the tips flat with your fingers.\n\nIf a collar has already curled, iron it on medium heat through a thin cloth, from the tips inwards. A firm double-rib collar curls much less in the first place.',
    {facts:true, photo:false, read:true}, false, false, [['proofer','ছবিটা স্টক থেকে নেওয়া। নিজেদের পোলোর ছবি লাগবে — আগে আর পরে।',3],['writer','ঠিক আছে, বৃহস্পতিবারের শুটে তুলে দেব।',2]], '', ['polo','collar','care'], 'washing'],
  t11:['pique vs jersey','Pique vs jersey polo: pique has a textured weave that breathes and hides sweat, jersey is smooth and soft. Which one to pick for office, heat and travel.',
    'Piqué has a small raised texture that breathes and hides sweat, so it suits daily wear in the heat. Jersey is flat and smooth, drapes softer and looks cleaner under a blazer.',
    'Piqué and jersey are two ways of knitting the same cotton. Piqué has a small raised honeycomb texture; jersey is flat and smooth on the outside.\n\nIn Dhaka heat piqué usually feels cooler, because the texture keeps the fabric a little away from the skin and hides sweat marks. Jersey drapes softer and looks dressier under a blazer.\n\nPick piqué for daily wear and heat, jersey for a cleaner, smarter look.',
    {facts:false, photo:true, read:true}, false, false, [['proofer','GSM সংখ্যাটা প্রোডাক্ট ডেটার সাথে মিলিয়ে সূত্র দাও।',1]], 'own:pique-vs-jersey', ['polo','fabric'], 'cotton'],
  t18:['winter hoodie','A winter hoodie guide for Bangladesh: fleece or French terry, zip or pullover, which weight suits Dhaka and which the north, and how to pick a size.',
    'For Dhaka a French terry hoodie is enough most evenings. For the colder north, pick brushed fleece of about 300 GSM or more. Pullovers keep heat in better, zip hoodies layer more easily. Take your usual size.',
    'Bangladesh winters are short and mild in Dhaka but properly cold in the north. That changes which hoodie makes sense.\n\nFor Dhaka, a French terry hoodie is enough on most evenings. For Rangpur, Dinajpur or Sylhet mornings, a brushed fleece of around 300 GSM or more keeps you warm without a jacket.\n\nPullovers keep heat in better; zip hoodies are easier to layer. Take your usual size; size up only if you want a sweater underneath.',
    {facts:true, photo:true, read:true}, true, false, [['proofer','তথ্য, ছবি, ভাষা — সব ঠিক। দূতের শেষ চেকে পাঠালাম।',4]], 'own:winter-hoodie-guide', ['hoodie','winter'], 'winter'],
  t07:['polo shirt vs t-shirt','Polo shirt vs t-shirt: when each one works for office, family visits, the gym and the heat, with the fabric, fit and price differences explained.',
    'Pick a polo when you want to look neat without a formal shirt — office, family visits, dinners. Pick a T-shirt for the gym, travel and very hot days. Polos are usually piqué with a collar; tees are lighter jersey and cost less.',
    'A polo has a collar and a short button placket; a T-shirt has neither. That one detail decides where each one works.\n\nWear a polo when you want to look put together without a shirt: office Fridays, family visits, a dinner out. Wear a T-shirt for the gym, travel, home and hot afternoons.\n\nMost polos are piqué (textured, breathable) and most tees are single jersey (smooth, lighter). A good polo costs a little more because the collar and placket take extra work.',
    {facts:true, photo:true, read:true}, true, true, [['proofer','সব চেক ঠিক আছে। পাস।',6],['head','SEO ঠিক — লিংক ৪টা, বর্ণনা আর slug ঠিক। প্রকাশের জন্য তৈরি।',5]], 'own:polo-vs-tshirt', ['polo','t-shirt'], 'casual'],
  t15:['drop shoulder','Drop shoulder or regular fit? How the shoulder seam changes your T-shirt size, what to measure and when to size down, with a simple chart to check.',
    'On a drop-shoulder tee the shoulder seam falls a few centimetres down the arm. Most people take their usual size and size down only for a less loose look. The chest measurement matters more than the label.',
    'On a regular-fit tee the shoulder seam sits on your shoulder bone. On a drop-shoulder tee it falls a few centimetres down the arm, which gives the loose, relaxed look.\n\nBecause the shoulder is already wide, most people take their usual size in drop-shoulder and size down only if they want it less baggy.\n\nMeasure the chest of a tee you like and compare it with the chart on each product page. The chest number matters more than the label.',
    {facts:true, photo:true, read:true}, true, true, [['proofer','পাস।',8]], 'own:drop-shoulder-fit', ['t-shirt','fit'], 'fit-types'],
  t09:['office shirt','Office shirt and chino pairings for men: six combinations that work in Bangladesh offices, which colours go together, and how to keep the look sharp.',
    'Six pairings cover most office weeks: white or sky oxford with navy or beige chinos, a striped shirt with grey, and a knit polo with chinos on Fridays. Keep shoes and belt the same colour.',
    'Six pairings cover most office weeks. A white oxford goes with navy, beige and grey chinos. A sky-blue oxford works with navy and beige.\n\nOn Fridays a knit polo with slim chinos looks relaxed but still neat.\n\nKeep the belt and shoes the same colour, tuck the shirt in, and roll the sleeves twice at most.',
    {facts:true, photo:true, read:true}, true, true, [['proofer','পাস।',20],['head','শেষ চেক ঠিক।',19]], 'own:office-pairings', ['shirt','chino','office'], 'office'],
  t16:['পাঞ্জাবির সাইজ চার্ট','পাঞ্জাবির সাইজ চার্ট দেখে সহজে সাইজ বাছুন — বুক, লম্বা আর হাতা কীভাবে মাপবেন, কোন উচ্চতায় কোন লম্বা মানায়, আর ঈদের আগে কেনার সময় কী খেয়াল রাখবেন।',
    'নিজের একটা পাঞ্জাবি টেবিলে বিছিয়ে বুক, লম্বা আর হাতা মাপুন। বুকের মাপ দ্বিগুণ করে চার্টের সাথে মেলান। হাঁটুর একটু নিচে লম্বা সবচেয়ে মানায়।',
    'পাঞ্জাবির সাইজ ঠিক করতে তিনটা মাপ লাগে — বুক, লম্বা আর হাতা।\n\nনিজের যে পাঞ্জাবিটা ভালো ফিট হয়, সেটা টেবিলে বিছিয়ে বগলের এক ইঞ্চি নিচে বুকের মাপ নিন, দ্বিগুণ করুন।\n\nলম্বা হাঁটুর একটু নিচে হলে সবচেয়ে মানায়। হাতা কবজির হাড় পর্যন্ত।',
    {facts:true, photo:true, read:true}, true, true, [['proofer','ভাষা সহজ, তথ্য ঠিক। পাস।',22]], 'own:panjabi-size-chart', ['পাঞ্জাবি','সাইজ'], 'size-charts', 'panjabi-size-chart']
};

/* ---------- posts: the shop's journal + the pipeline ---------- */
function zb_seeds(){
  var now = Date.now(), c = zb_cfg(), out = [];
  ZB_SNAP.forEach(function(a, i){
    var sec = String(a.e||'').split(' · ')[0] || 'Style', at = now-(ZB_SNAP.length-i)*4*ZB_D;
    out.push({id:'j'+i, seed:i, title:a.t, slug:zb_jslug(a.t), slugAuto:true, meta:a.x, kw:'', lang:'en', status:'published', at:at, sched:'',
      body:a.x, product:a.p, products:[a.p], color:a.c, section:sec, pillar:'', sub:'', tags:[], quickAnswer:'', links:[], heroImage:'', writer:'owner', proofer:'', updatedAt:at});
  });
  out.push({id:'d-bn-1', title:'ঢাকার গরমে কোন পোলো আরাম দেয়', slug:'dhaka-gorome-polo', slugAuto:false, meta:'ঢাকার গরমে আরামের পোলো বাছাই: কাপড়ের GSM, ফিট আর রং — কোনটা কখন পরবেন, সহজ ভাষায়।', kw:'পোলো', lang:'bn', status:'draft', at:now-ZB_D, sched:'',
    body:'পোলো শার্ট কেনার আগে তিনটা জিনিস দেখুন — কাপড়, ফিট আর রং। ঢাকার গরমে ২২০ GSM কটন পিকে সবচেয়ে আরামের।', product:'rl-solid-polo', products:['rl-solid-polo'], color:'white', section:'Fabric', pillar:'fabric', tags:['পোলো'], writer:'owner'});
  out.push({id:'d-bn-2', title:'ঈদে পাঞ্জাবির সাইজ ঠিক করার নিয়ম', slug:'eid-panjabi-size', slugAuto:false, meta:'', kw:'পাঞ্জাবির সাইজ', lang:'bn', status:'scheduled', at:now+3*ZB_D, sched:zb_local(now+3*ZB_D),
    body:'পাঞ্জাবির সাইজ ঠিক করতে বুক, লম্বা আর হাতা মাপুন।', product:'classic-cotton-panjabi', products:['classic-cotton-panjabi'], color:'white', section:'Size guide', pillar:'fit', tags:['পাঞ্জাবি'], writer:'owner'});
  /* extra published demo posts written by Shilpi's front-end file (73-blog.js), same post-store shape */
  if(typeof BLOG_EXTRA_SEEDS!=='undefined' && Array.isArray(BLOG_EXTRA_SEEDS)) BLOG_EXTRA_SEEDS.forEach(function(x, i){
    var at = x.at || (now - (i+1)*2*ZB_D), p = {};
    ['id','title','slug','meta','kw','lang','body','product','color','section','pillar','sub','quickAnswer','heroImage','writer','proofer','author','reviewer','combos','featured','guide','brand3p','twin'].forEach(function(k){ p[k] = x[k]!==undefined ? x[k] : ''; });
    p.id = p.id || ('x'+i); p.slugAuto = false; p.status = 'published'; p.at = at; p.sched = ''; p.updatedAt = x.updatedAt || at; p.demo = true;
    p.products = x.products || (x.product ? [x.product] : []); p.tags = x.tags || []; p.links = x.links || [];
    out.push(p);
  });
  /* pipeline drafts (simulated): one per topic already past "approved" */
  var sl = c.slots.length ? c.slots : ['09:00'], nSched = 0, k = 0;
  /* seed proofreaders come from the authors who are busy writing too, so an idle author really shows ৳0 */
  var busy = []; ZB_TOPIC_SEED.forEach(function(t){ var w = zb_authorFor(t[3]); if(ZB_PSEED[t[0]] && busy.indexOf(w)<0) busy.push(w); });
  ZB_TOPIC_SEED.forEach(function(t){
    var d = ZB_PSEED[t[0]]; if(!d) return; k++;
    var stage = t[6], writer = zb_authorFor(t[3]), others = busy.filter(function(x){ return x!==writer; });
    var proofer = stage==='writing' ? '' : (others[k % Math.max(1, others.length)] || ''), pid = t[4].indexOf('prod:')===0 ? t[4].slice(5) : '';
    var catProd = !pid && t[4].indexOf('cat:')===0 ? DB.products.filter(function(x){ return x.cat===t[4].slice(4); })[0] : null;
    var prod = pid || (catProd ? catProd.id : ''), at = now - (k+2)*ZB_H, sched = '';
    var status = 'draft';
    if(stage==='scheduled'){ at = zb_slotTs(1, sl[Math.min(nSched, sl.length-1)]); nSched++; status = 'scheduled'; sched = zb_local(at); }
    var cm = d[7].map(function(x){ return {by:x[0]==='proofer' ? proofer : x[0]==='head' ? c.head : writer, t:x[1], at:now - x[2]*ZB_H}; });
    var p = {id:'pp-'+t[0], topic:t[0], demo:true, title:t[1], slug:d[11] || zb_jslug(t[1]), slugAuto:!d[11], meta:d[1], kw:d[0], lang:t[8]||'en', status:status, at:at, sched:sched,
      body:d[3], quickAnswer:d[2], product:prod, products:prod ? [prod] : [], color:'', section:zb_secOf(t[3]), pillar:t[3], sub:d[10]||'', tags:d[9]||[],
      links:null, heroImage:d[8]||'', pipe:stage, writer:writer, proofer:proofer, checks:zb_clone(d[4]), comments:cm,
      passedBy:d[5] ? proofer : '', finalBy:d[6] ? c.head : '', updatedAt:now - (k+1)*ZB_H};
    out.push(zb_sign(p));
  });
  out.forEach(function(p){ if(p.writer) zb_sign(p); });
  return out;
}
function zb_posts(){
  if(ZB_MEMO && ZB_MEMO.st===ST && ZB_MEMO.v===ZB_V && Date.now()-ZB_MEMO.t < 1500) return ZB_MEMO.list;
  var s = zb_st(), seeds = zb_seeds(), map = {};
  seeds.forEach(function(p){ map[p.id] = p; });
  Object.keys(s.posts).forEach(function(id){ map[id] = Object.assign({}, map[id]||{}, zb_clone(s.posts[id])); });
  var list = Object.keys(map).map(function(k){
    var p = map[k]; if(p.status==='scheduled' && p.at<=Date.now()) p.status = 'published';
    if(!Array.isArray(p.products)) p.products = p.product ? [p.product] : [];
    if(!Array.isArray(p.tags)) p.tags = [];
    if(!p.pillar || !zb_pillar(p.pillar)) p.pillar = zb_pillarOf(p);
    if(p.links===undefined) p.links = [];
    if(!p.writer) p.writer = 'owner';
    return p;
  });
  list.forEach(function(p){ if(p.links===null) p.links = zb_suggest(p, list).slice(0, p.pipe==='writing' ? 2 : 4); });
  list.sort(function(a,b){ return b.at - a.at; });
  ZB_MEMO = {st:ST, v:ZB_V, t:Date.now(), list:list};
  return list;
}
function zb_get(id){ return zb_posts().filter(function(p){ return p.id===id; })[0] || null; }
function zb_prods(p){ return (p.products && p.products.length ? p.products : (p.product ? [p.product] : [])).filter(function(id){ return !!P(id); }); }
function zb_entry(p){
  var o = p.seed!=null ? ZB_SNAP[p.seed] : null, words = zb_words(p.body);
  /* an untouched journal piece keeps its original section line exactly */
  var e = o && p.section===String(o.e||'').split(' · ')[0] && p.body===o.x ? o.e : (p.section||'Style')+' · '+Math.max(2, Math.round(words/200))+' min read';
  var pr = zb_prods(p);
  /* t,e,x,p,c,slug,body,lang are the original journal fields — kept as they were; the rest are added (PR 591–593) */
  return {t:p.title, e:e, x:p.meta || String(p.body||'').slice(0,160), p:pr[0] || p.product || 'essential-pique-polo', c:p.color || '', slug:p.slug, body:p.body, lang:p.lang,
    id:p.id, title:p.title, meta:p.meta||'', status:p.status, at:p.at, date:zb_iso(p.at), updatedAt:p.updatedAt || p.at,
    pillar:zb_pillarOf(p), sub:p.sub||'', tags:(p.tags||[]).slice(), quickAnswer:p.quickAnswer||'', products:pr, links:(p.links||[]).slice(),
    heroImage:p.heroImage||'', writer:p.writer||'owner', proofer:p.proofer||'', author:zb_code(p.writer||'owner'), reviewer:zb_code(p.proofer||''), readMin:Math.max(2, Math.round(words/200))};
}
/* the shop journal follows the posts (newest last, the home slider shows the last ten) */
function zb_apply(){
  if(!ST) return;
  zb_pillarsAll(); zb_authors(); zb_byline(); zb_ads(); zb_adSet();
  if(!DB.journal) return;
  var posts = zb_posts().filter(function(p){ return p.status==='published'; }).sort(function(a,b){ return a.at - b.at; });
  DB.journal.length = 0;
  posts.forEach(function(p){ DB.journal.push(zb_entry(p)); });
}
ZO_APPLY.push(zb_apply);
/* a scheduled post goes live on the shop at its time, without a reload.
   TA-2 (T16): this was a 30 s setInterval running forever on every page (R15
   bug-20 rule: no forever timers). Now: one setTimeout set for the next
   scheduled post's time, only while a page that shows the journal (home,
   journal) is open; it is cleared and set again on every route change, and
   a post that came due while away is picked up on arrival. */
var ZB_LIVE_T = 0;
function zb_liveCheck(){ try{ if(ST && DB.journal){ var n = zb_posts().filter(function(p){ return p.status==='published'; }).length; if(n!==DB.journal.length) zb_apply(); } }catch(e){} }
function zb_liveArm(){
  clearTimeout(ZB_LIVE_T); ZB_LIVE_T = 0;
  try{
    var pg = (typeof CUR!=='undefined' && CUR) ? CUR.page : '';
    if(pg!=='home' && pg!=='journal') return;
    zb_liveCheck();
    var next = Infinity; zb_posts().forEach(function(p){ if(p.status==='scheduled' && p.at < next) next = p.at; });
    if(next===Infinity) return;
    ZB_LIVE_T = setTimeout(function(){ ZB_LIVE_T = 0; zb_liveCheck(); zb_liveArm(); }, Math.min(Math.max(1000, next - Date.now() + 50), 6*3600*1000));
  }catch(e){}
}
window.addEventListener('hashchange', zb_liveArm);
setTimeout(zb_liveArm, 0);   /* the first page, once boot has drawn it */
/* write one post back (pipeline actions + editor) */
function zb_put(p){ p.updatedAt = Date.now(); zb_sign(p); zb_st().posts[p.id] = zb_clone(p); zb_commit(); }
function zb_mut(id, fn){ var p = zb_get(id); if(!p) return null; p = zb_clone(p); var r = fn(p); if(r===false) return null; zb_put(p); return p; }

/* ---------- SEO checklist (editor) ---------- */
function zb_checks(p){
  var kw = String(p.kw||'').trim(), first = String(p.body||'').split(/\n\s*\n/)[0], tl = String(p.title||'').length, ml = String(p.meta||'').length, w = zb_words(p.body), c = zb_cfg();
  return [
    ['kw', !!kw, 'Focus keyword chosen', 'মূল কিওয়ার্ড দেওয়া'],
    ['title', zb_kwIn(kw, p.title), 'Keyword in the title', 'শিরোনামে কিওয়ার্ড'],
    ['slug', !!kw && (zb_kwIn(zo_slug(kw), p.slug) || zb_kwIn(kw, p.slug)), 'Keyword in the link (slug)', 'লিংকে (slug) কিওয়ার্ড'],
    ['meta', zb_kwIn(kw, p.meta), 'Keyword in the meta description', 'গুগলের বর্ণনায় কিওয়ার্ড'],
    ['first', zb_kwIn(kw, first), 'Keyword in the first paragraph', 'প্রথম প্যারায় কিওয়ার্ড'],
    ['tlen', tl>=25 && tl<=60, 'Title 25–60 characters ('+tl+')', 'শিরোনাম ২৫–৬০ অক্ষর (এখন '+zb_bn(tl)+')'],
    ['mlen', ml>=c.meta.min && ml<=c.meta.max, 'Meta description '+c.meta.min+'–'+c.meta.max+' characters ('+ml+')', 'বর্ণনা '+zb_bn(c.meta.min)+'–'+zb_bn(c.meta.max)+' অক্ষর (এখন '+zb_bn(ml)+')'],
    ['words', w>=300, 'At least 300 words ('+w+')', 'অন্তত ৩০০ শব্দ (এখন '+zb_bn(w)+')'],
    ['prod', !!p.product || zb_prods(p).length>0, 'Links to a product', 'একটা প্রোডাক্টের লিংক'],
    ['slen', !!p.slug && p.slug.length<=60 && /^[a-z0-9-]+$/.test(p.slug), 'Short, clean link', 'ছোট, পরিষ্কার লিংক']
  ];
}
function zb_score(p){ var c = zb_checks(p); return Math.round(c.filter(function(x){ return x[1]; }).length / c.length * 100); }
function zb_scorePill(n){ return '<span class="zo-pill '+(n>=80?'ok':n>=50?'warn':'bad')+'">SEO '+n+'</span>'; }

/* ---------- duplicate check (word overlap) ---------- */
function zb_dupFind(title, q, skip, list){
  skip = skip || {}; list = list || zb_posts();
  /* score = the bigger of: title words vs title words, and title+query words vs title+query words */
  var a = zb_tok(title), aq = zb_tok(title+' '+(q||'')), best = {score:0, title:'', kind:''};
  var test = function(t2, q2, kind){ var sc = Math.max(zb_jac(a, zb_tok(t2)), zb_jac(aq, zb_tok(t2+' '+(q2||'')))); if(sc>best.score) best = {score:sc, title:t2, kind:kind}; };
  list.forEach(function(p){ if(p.id===skip.post || (skip.topic && p.topic===skip.topic)) return; test(p.title, p.kw, 'post'); });
  if(!skip.postsOnly) zb_topics(list).forEach(function(t){ if(t.id===skip.topic || t.post || t.st==='rejected' || (skip.post && t.post===skip.post)) return; test(t.t, t.q, 'topic'); });
  return best;
}
function zb_pct(x){ return Math.round(x*100)+'%'; }

/* ---------- topics ---------- */
var ZB_TST = {proposed:['প্রস্তাব',''], approved:['অনুমোদিত','info'], writing:['লেখা হচ্ছে','info'], proof:['প্রুফ চলছে','warn'], waiting:['প্রকাশের অপেক্ষায়','info'], published:['প্রকাশিত','ok'], rejected:['বাদ','']};
var ZB_TORDER = ['proposed','approved','writing','proof','waiting','published','rejected'];
function zb_stage(p){ if(!p) return ''; if(p.status==='published') return 'published'; if(p.status==='scheduled') return 'scheduled'; return p.pipe || ''; }
function zb_tstOf(p){ var s = zb_stage(p); return s==='writing' ? 'writing' : (s==='proof' || s==='final') ? 'proof' : (s==='ready' || s==='scheduled') ? 'waiting' : s==='published' ? 'published' : 'approved'; }
function zb_topics(list){
  list = list || zb_posts();
  var s = zb_st(), byTopic = {}, now = Date.now();
  list.forEach(function(p){ if(p.topic && p.pipe) byTopic[p.topic] = p; });
  var all = ZB_TOPIC_SEED.map(function(a, i){ return {id:a[0], t:a[1], q:a[2], pillar:a[3], link:a[4], by:a[5], st0:a[6], pri:a[7], lang:a[8]||'en', demo:true, kind:'new', at:now - (30-i)*ZB_H}; })
    .concat(s.mine.map(zb_clone));
  all.forEach(function(t){
    var o = s.topics[t.id]; if(o) Object.assign(t, o);
    if(!t.writer || !zb_author(t.writer)) t.writer = zb_authorFor(t.pillar);
    var p = byTopic[t.id]; t.post = p ? p.id : '';
    var base = (o && o.st) || t.st || t.st0;
    t.st = p ? zb_tstOf(p) : (['proposed','approved','rejected'].indexOf(base)>=0 ? base : 'approved');
  });
  return all;
}
function zb_topic(id, list){ return zb_topics(list).filter(function(t){ return t.id===id; })[0] || null; }
function zb_tset(id, patch){ var s = zb_st(), mine = s.mine.filter(function(t){ return t.id===id; })[0]; if(mine) Object.assign(mine, patch); else s.topics[id] = Object.assign(s.topics[id]||{}, patch); zb_commit(); }
function zb_linkLabel(l){ if(!l) return '—'; var a = l.split(':'); if(a[0]==='cat'){ var c = CAT(a[1]); return c ? c.name : a[1]; } var p = P(a[1]); return p ? p.name : a[1]; }
function zb_linkHref(l){ if(!l) return ''; var a = l.split(':'); return a[0]==='cat' ? '#/c/'+a[1] : '#/p/'+a[1]; }

/* ---------- interlinking helper ---------- */
function zb_catFor(p){
  var t = p.topic ? ZB_TOPIC_SEED.filter(function(x){ return x[0]===p.topic; })[0] : null;
  if(t && t[4].indexOf('cat:')===0 && CAT(t[4].slice(4))) return CAT(t[4].slice(4));
  var pr = zb_prods(p)[0]; if(pr && CAT(P(pr).cat)) return CAT(P(pr).cat);
  var w = zb_tok(p.title+' '+(p.kw||'')), hit = null;
  DB.categories.forEach(function(c){ if(hit || c.hidden) return; var ct = zb_tok(c.name+' '+(c.bn||'')+' '+c.garment); if(ct.some(function(x){ return w.indexOf(x)>=0 || w.indexOf(x.replace(/s$/,''))>=0; })) hit = c; });
  return hit;
}
function zb_suggest(p, list){
  list = list || zb_posts();
  var out = [], seen = {}, me = zb_href(p), pil = zb_pillarOf(p), words = zb_tok(p.title+' '+(p.kw||''));
  var add = function(k, h, l){ if(!h || seen[h] || h===me) return; seen[h] = 1; out.push({k:k, h:h, l:l}); };
  var sim = function(x){ return zb_jac(words, zb_tok(x.title+' '+(x.kw||''))); };
  var others = list.filter(function(x){ return x.id!==p.id && x.status==='published'; });
  var same = others.filter(function(x){ return zb_pillarOf(x)===pil; }).sort(function(a,b){ return (sim(b)-sim(a)) || (a.at-b.at); });
  if(same[0]) add('pillar', zb_href(same[0]), same[0].title);
  var cat = zb_catFor(p); if(cat) add('cat', '#/c/'+cat.id, cat.name);
  var prods = zb_prods(p).slice();
  if(prods.length<2){ DB.products.map(function(x){ return [x, zb_jac(words, zb_tok(x.name+' '+(x.fabric||'')))]; }).filter(function(a){ return a[1]>0 && (!cat || a[0].cat===cat.id); }).sort(function(a,b){ return b[1]-a[1] || (b[0].reviews||0)-(a[0].reviews||0); }).forEach(function(a){ if(prods.indexOf(a[0].id)<0) prods.push(a[0].id); }); }
  prods.slice(0,2).forEach(function(id){ var x = P(id); if(x) add('prod', '#/p/'+id, x.name); });
  others.map(function(x){ return [x, sim(x)]; }).filter(function(a){ return a[1]>0; }).sort(function(a,b){ return b[1]-a[1]; }).slice(0,3).forEach(function(a){ add('post', zb_href(a[0]), a[0].title); });
  same.slice(1).forEach(function(x){ if(out.length<5) add('post', zb_href(x), x.title); });
  return out.slice(0,6);
}
function zb_inbound(p, list){ list = list || zb_posts(); var h1 = '#/journal/'+p.slug, h2 = '#/journal/'+zb_jslug(p.title); return list.filter(function(x){ return x.id!==p.id && (x.links||[]).some(function(l){ return l.h===h1 || l.h===h2; }); }); }
var ZB_LK = {pillar:'একই বিভাগের লেখা', cat:'ক্যাটাগরি', prod:'প্রোডাক্ট', post:'জড়িত লেখা'};

/* ---------- the seven proofreading checks ---------- */
function zb_pchecks(p, list){
  var c = zb_cfg(), ck = p.checks || {}, n = (p.links||[]).length, ml = String(p.meta||'').length;
  var dup = zb_dupFind(p.title, p.kw, {post:p.id, topic:p.topic, postsOnly:true}, list);
  var slugOk = !!p.slug && p.slug.length<=60 && /^[a-z0-9-]+$/.test(p.slug) && !(list||zb_posts()).some(function(x){ return x.id!==p.id && x.slug===p.slug; });
  var sents = String(p.body||'').split(/[.!?।]+/).filter(function(x){ return x.trim(); }), avg = sents.length ? Math.round(zb_words(p.body)/sents.length) : 0;
  var mlOk = ml>=c.meta.min && ml<=c.meta.max, kwOk = !p.kw || zb_kwIn(p.kw, p.meta);
  var slugDup = !!p.slug && (list||zb_posts()).some(function(x){ return x.id!==p.id && x.slug===p.slug; });
  return [
    {k:'facts', ok:!!ck.facts, auto:false, who:'proof', short:'তথ্য', bn:'তথ্যের সূত্র আছে', en:'Facts sourced', why:ck.facts ? 'প্রোডাক্ট ডেটা আর নিয়মের সাথে মেলানো' : 'প্রুফের লেখক এখনো মেলায়নি'},
    {k:'photo', ok:!!ck.photo, auto:false, who:'proof', short:'ছবি', bn:'নিজেদের তোলা ছবি', en:'Original photo', why:/^own:/.test(p.heroImage||'') ? 'নিজেদের ছবি দেওয়া আছে' : 'স্টক ছবি চলবে না'},
    {k:'dup', ok:dup.score < c.dup.warn, auto:true, who:'proof', short:'নকল না', bn:'আগের লেখার নকল না', en:'No duplicate', why:dup.score>=c.dup.near ? 'মিল '+zb_pct(dup.score)+': '+dup.title : 'কোনো লেখার সাথে মিল নেই'},
    {k:'read', ok:!!ck.read, auto:false, who:'proof', short:'ভাষা', bn:'পড়তে সহজ', en:'Readability', why:'গড়ে '+zb_bn(avg)+' শব্দের বাক্য'},
    {k:'links', ok:n>=c.links.min && n<=c.links.max, auto:true, who:'final', short:'লিংক', bn:'ভেতরের লিংক '+zb_bn(c.links.min)+'–'+zb_bn(c.links.max)+'টা', en:'Internal links '+c.links.min+'–'+c.links.max, why:'এখন '+zb_bn(n)+'টা'+(n<c.links.min || n>c.links.max ? ' — '+zb_bn(c.links.min)+'–'+zb_bn(c.links.max)+'টা লাগবে' : '')},
    {k:'meta', ok:mlOk && kwOk, auto:true, who:'final', short:'বর্ণনা', bn:'গুগলের বর্ণনা (meta) ঠিক আছে', en:'Meta OK', why:zb_bn(ml)+' অক্ষর'+(mlOk ? '' : ' — '+zb_bn(c.meta.min)+'–'+zb_bn(c.meta.max)+' লাগবে')+(kwOk ? '' : '; "'+p.kw+'" শব্দটা নেই')},
    {k:'slug', ok:slugOk, auto:true, who:'final', short:'লিংক নাম', bn:'লিংক (slug) ঠিক আছে', en:'Slug OK', why:'/'+(p.slug||'—')+(slugOk ? '' : slugDup ? ' — আরেকটা লেখায় একই লিংক' : ' — ছোট হাতের ইংরেজি আর "-" দিয়ে, ৬০ অক্ষরের মধ্যে')}
  ];
}
function zb_proofOK(p, list){ return zb_pchecks(p, list).every(function(x){ return x.ok; }); }
function zb_canPublish(p, list){ if(!p.pipe) return true; return !!p.passedBy && p.passedBy!==p.writer && !!p.finalBy && p.finalBy!==p.writer && zb_proofOK(p, list); }
/* rule in code: the one who approves can never be the writer */
function zb_passProof(p, actor){
  if(!actor) return 'কে প্রুফ করবে ঠিক নেই';
  if(actor===p.writer) return zb_name(actor)+' নিজের লেখা নিজে পাস করতে পারবে না — অন্য লেখক লাগবে';
  var miss = zb_pchecks(p).filter(function(x){ return x.who==='proof' && !x.ok; });
  return miss.length ? 'এখনো বাকি: '+miss.map(function(x){ return x.bn+' ('+x.why+')'; }).join(', ') : '';
}
function zb_passFinal(p, actor){
  if(!actor) return 'শেষ চেক কে করবে ঠিক নেই';
  if(actor===p.writer) return zb_name(actor)+' নিজের লেখার শেষ চেক নিজে করতে পারবে না';
  if(!p.passedBy) return 'আগে প্রুফ পাস লাগবে';
  var miss = zb_pchecks(p).filter(function(x){ return !x.ok; });
  /* #19: say exactly what is wrong; the Doot-fix button can repair links, description and slug */
  return miss.length ? 'এখনো বাকি: '+miss.map(function(x){ return x.bn+' — '+x.why; }).join('; ') : '';
}

/* ---------- schedule ---------- */
function zb_slots(c){ c = c || zb_cfg(); return (c.slots||[]).filter(function(x){ return /^\d{1,2}:\d{2}$/.test(x); }).sort(); }
function zb_dayPosts(off, list){ list = list || zb_posts(); return list.filter(function(p){ return p.status==='scheduled' && zb_inDay(p.at, off); }).sort(function(a,b){ return a.at-b.at; }); }
function zb_pubDay(off, list){ list = list || zb_posts(); return list.filter(function(p){ return p.status==='published' && zb_inDay(p.at, off); }); }
function zb_ready(list){
  list = list || zb_posts(); var tp = {}; zb_topics(list).forEach(function(t){ tp[t.id] = t.pri || 2; });
  return list.filter(function(p){ return zb_stage(p)==='ready'; }).sort(function(a,b){ return ((tp[a.topic]||2)-(tp[b.topic]||2)) || (a.updatedAt||a.at)-(b.updatedAt||b.at); });
}
function zb_free(list, c){
  c = c || zb_cfg(); list = list || zb_posts();
  var out = [], now = Date.now() + c.leadMin*60000, sl = zb_slots(c);
  for(var off=0; off<c.daysAhead; off++){
    var used = zb_dayPosts(off, list).concat(zb_pubDay(off, list)), taken = used.map(function(p){ return zb_hm(p.at); }), n = used.length;
    sl.forEach(function(h){ var ts = zb_slotTs(off, h); if(ts<=now || taken.indexOf(h)>=0 || n>=c.perDay.target) return; out.push(ts); n++; });
  }
  return out;
}
function zb_fill(onlyId){
  var list = zb_posts(), c = zb_cfg(), free = zb_free(list, c), ready = zb_ready(list).filter(function(p){ return !onlyId || p.id===onlyId; }), done = 0, skipped = 0, s = zb_st();
  ready.forEach(function(p){
    if(!free.length) return;
    if(!zb_canPublish(p, list)){ skipped++; return; }
    var ts = free.shift(), q = zb_clone(p);
    q.status = 'scheduled'; q.pipe = 'scheduled'; q.at = ts; q.sched = zb_local(ts); q.updatedAt = Date.now(); zb_sign(q);
    s.posts[q.id] = q; done++;
  });
  if(done) zb_commit();
  return {done:done, skipped:skipped, free:free.length};
}

/* ---------- per-post numbers (simulated) ---------- */
function zb_nums(p){
  var age = Math.max(1, Math.round((Date.now()-p.at)/ZB_D)), r = function(k, a, b){ return zo_rnd(k+p.id, a, b); };
  var visits = Math.round(r('v', 20, 1400) * Math.min(1, age/30));
  var t = p.topic ? ZB_TOPIC_SEED.filter(function(x){ return x[0]===p.topic; })[0] : null;
  return {age:age, visits:visits, trend:r('tr', -45, 60), pos:r('pos', 2, 30), sales:Math.round(visits * r('cv', 0, 25) / 1000), q:p.kw || (t ? t[2] : String(p.title||'').toLowerCase().split(/\s+/).slice(0,4).join(' '))};
}

/* ---------- house ads (PR 592) — ST.blogAds + ST.blogAdSettings ---------- */
var ZB_SLOTS = [
  ['home-top','ব্লগ হোম — ওপরের ব্যানার','Blog home · top'],
  ['home-grid','ব্লগ হোম — কার্ডের মাঝে','Blog home · between cards'],
  ['cat-top','বিভাগ পেজ — ওপরে','Category page · top'],
  ['post-top','লেখার শুরুতে','Post · top'],
  ['post-inline','লেখার ভেতরে (প্যারার পরে)','Post · inside the article'],
  ['post-sidebar','পাশের কলাম (শুধু কম্পিউটারে)','Post · sidebar (desktop)'],
  ['post-end','লেখার শেষে','Post · end'],
  ['post-popup','পপআপ','Post · popup'],
  ['post-bar','চিকন বার — ৬০% পড়ার পর','Post · slim bar']
];
/* the shop reads every key; new keys get their default on old saved settings (zb_adSet) */
var ZB_AD_SET_DEF = {gridEvery:6, inlineAfter:3, maxInline:2, popupOnMobileFromSearch:false, maxPerPostPhone:3, maxPerPostDesktop:3, postTopAfterSection:1, noDuplicate:true};
/* owner-facing number settings: [key, label, help, min, max] — the switches are drawn separately */
var ZB_AD_SET_UI = [
  ['maxPerPostPhone','ফোনে একটা লেখায় সর্বোচ্চ কয়টা বিজ্ঞাপন','সব জায়গা মিলিয়ে — শুরু, ভেতর, শেষ, চিকন বার, পপআপ। বেশি হলে পড়তে বিরক্ত লাগে; ৩ ভালো।',0,10],
  ['maxPerPostDesktop','কম্পিউটারে একটা লেখায় সর্বোচ্চ কয়টা বিজ্ঞাপন','পাশের কলাম সহ সব মিলিয়ে।',0,10],
  ['postTopAfterSection','শুরুর বিজ্ঞাপন কত নম্বর অংশের পরে','০ = সরাসরি উত্তরের ঠিক নিচে। ১ = প্রথম অংশ পড়ার পরে — পাঠক আগে উত্তর পায়, তারপর বিজ্ঞাপন।',0,10],
  ['inlineAfter','লেখার ভেতরের প্রথম বিজ্ঞাপন কত নম্বর প্যারার পরে','এর আগে লেখার ভেতরে কোনো বিজ্ঞাপন বসে না।',1,20],
  ['maxInline','লেখার ভেতরে সর্বোচ্চ কয়টা','শুধু লেখার মাঝের জায়গাগুলো।',1,20],
  ['gridEvery','ব্লগ হোমে কয়টা কার্ড পরপর একটা বিজ্ঞাপন','হোম আর বিভাগ পেজের কার্ডের সারিতে।',1,20]
];
var ZB_POPUP_DEF = {trigger:'scroll', value:50, freq:'session', delay:0};
var ZB_AD_TYPES = [['banner','ব্যানার'],['product','প্রোডাক্ট'],['combo','কম্বো'],['category','ক্যাটাগরি']];
function zb_slotName(id){ var s = ZB_SLOTS.filter(function(x){ return x[0]===id; })[0]; return s ? s[1] : id; }
function zb_combos(){
  var out = (DB.combos||[]).filter(function(c){ return c.active!==false; }).map(function(c){ return {id:c.id, name:c.name, blurb:c.blurb||'', price:c.price, items:c.items}; });
  try{ ca_activeRules().forEach(function(r){ out.push({id:r.id, name:r.name || r.title, blurb:r.label || '', price:0, items:[]}); }); }catch(e){}
  return out;
}
function zb_combo(id){ return zb_combos().filter(function(c){ return c.id===id; })[0] || null; }
/* titleBn / subBn / ctaBn: the Bengali page (/bn) shows these; empty = the English text. match: 'related' | 'all' */
function zb_adNew(o){ return Object.assign({id:'', type:'banner', title:'', sub:'', cta:'', titleBn:'', subBn:'', ctaBn:'', link:'', img:'', productId:'', comboId:'', catId:'', slots:[], pillars:[], posts:[], match:'related', start:'', end:'', active:true, weight:1, popup:zb_clone(ZB_POPUP_DEF)}, o||{}); }
function zb_catBn(c){ return c ? (c.bn || c.name) : ''; }
function zb_adSeed(){
  var hood = CAT('hoodies'), duo = zb_combo('polo-duo'), polo = P('essential-pique-polo'), pj = CAT('panjabi'), jeans = P('lv-slim-jeans') || DB.products.filter(function(x){ return x.cat==='trousers'; })[0];
  var out = [], polos = CAT('polos');
  var from = function(cat){ var pr = DB.products.filter(function(x){ return x.cat===cat.id; }).map(function(x){ return x.price; }); return pr.length ? fmt(Math.min.apply(null, pr)).replace(' ','') : ''; };
  /* relevance (owner review): the hoodie banner belongs on season and care posts (plus any hoodie post); polo ads only on polo posts */
  if(hood) out.push(zb_adNew({id:'ad-winter-hoodie', type:'banner', title:'Winter hoodies are here', sub:hood.blurb, cta:'Shop hoodies', titleBn:'শীতের '+zb_catBn(hood)+' চলে এসেছে', subBn:'নরম ফ্লিস আর ফ্রেঞ্চ টেরি — ঢাকা থেকে উত্তরবঙ্গ', ctaBn:zb_catBn(hood)+' দেখুন', link:'#/c/'+hood.id, catId:hood.id, slots:['home-top','cat-top','post-top'], pillars:['season','care'], weight:5}));
  if(duo) out.push(zb_adNew({id:'ad-polo-duo', type:'combo', title:duo.name, sub:duo.blurb, cta:'Build your duo', titleBn:'দুটো পোলো একসাথে', subBn:'দুটো নিলে কম দামে', ctaBn:'জোড়া বানান', link:'#/combo/'+duo.id, comboId:duo.id, slots:['home-grid','post-inline'], pillars:[], weight:4}));
  if(polo) out.push(zb_adNew({id:'ad-pique-polo', type:'product', title:polo.name, sub:polo.fabric||'', cta:'See colours', titleBn:polo.bn || 'আমাদের সবচেয়ে প্রিয় পিকে পোলো', subBn:'নরম কটন পিকে, অনেক রঙে', ctaBn:'রংগুলো দেখুন', link:'#/p/'+polo.id, productId:polo.id, slots:['post-sidebar','post-end'], weight:3}));
  if(pj) out.push(zb_adNew({id:'ad-cat-panjabi', type:'category', title:pj.name, sub:pj.blurb, cta:'See all', titleBn:zb_catBn(pj), subBn:'ঈদ আর বিয়ের জন্য কটনের '+zb_catBn(pj), ctaBn:'সব দেখুন', link:'#/c/'+pj.id, catId:pj.id, slots:['home-grid','post-end'], pillars:['season','fit'], weight:2}));
  if(jeans) out.push(zb_adNew({id:'ad-denim-popup', type:'product', title:jeans.name, sub:jeans.fabric||'', cta:'See the jeans', titleBn:jeans.bn || 'ধোয়ার পরেও রং ধরে রাখে এমন জিন্স', subBn:'স্লিম ফিট ডেনিম', ctaBn:'জিন্সটা দেখুন', link:'#/p/'+jeans.id, productId:jeans.id, slots:['post-popup'], posts:['how-to-wash-denim'], weight:1, popup:{trigger:'scroll', value:60, freq:'day', delay:10}}));
  if(polos) out.push(zb_adNew({id:'ad-bar-polos', type:'category', title:polos.name+(from(polos) ? ' from '+from(polos) : ''), sub:'', cta:'Shop polos', titleBn:zb_catBn(polos)+(from(polos) ? ' '+from(polos)+' থেকে' : ''), subBn:'', ctaBn:zb_catBn(polos)+' দেখুন', link:'#/c/'+polos.id, catId:polos.id, slots:['post-bar'], pillars:[], weight:1}));
  return out;
}
function zb_ads(){ if(!Array.isArray(ST.blogAds)) ST.blogAds = zb_adSeed(); return ST.blogAds; }
function zb_ad(id){ return zb_ads().filter(function(a){ return a.id===id; })[0] || null; }
function zb_adSet(){ if(!ST.blogAdSettings) ST.blogAdSettings = zb_clone(ZB_AD_SET_DEF); Object.keys(ZB_AD_SET_DEF).forEach(function(k){ if(ST.blogAdSettings[k]===undefined) ST.blogAdSettings[k] = ZB_AD_SET_DEF[k]; }); return ST.blogAdSettings; }
/* F8: whole days in the shop's time zone — live from 00:00 Dhaka on the start day until 23:59:59 on the end day */
function zb_adLive(a, ts){ var t = zb_tzDay(ts); return !!a.active && (!a.start || t>=a.start) && (!a.end || t<=a.end); }

/* ---------- ad relevance: which posts an ad belongs on ---------- */
function zb_comboCats(id){ var c = (DB.combos||[]).filter(function(x){ return x.id===id; })[0] || zb_combo(id); return ((c && c.items) || []).map(function(i){ var p = P(typeof i==='string' ? i : (i && (i.id || i.p))); return p ? p.cat : ''; }).filter(Boolean); }
/* the shop categories an ad sells (product → its category, combo → its items' categories, category / banner → the category or the link) */
function zb_adCats(a){
  var out = [], add = function(c){ if(c && out.indexOf(c)<0) out.push(c); };
  if(a.type==='product'){ var p = P(a.productId); if(p) add(p.cat); }
  else if(a.type==='combo') zb_comboCats(a.comboId).forEach(add);
  else if(a.catId) add(a.catId);
  var m = String(a.link||'').match(/^#\/(c|p|combo)\/([\w-]+)/);
  if(m){ if(m[1]==='c') add(m[2]); else if(m[1]==='p'){ var q = P(m[2]); if(q) add(q.cat); } else zb_comboCats(m[2]).forEach(add); }
  return out;
}
function zb_catWords(ids){ var w = []; ids.forEach(function(id){ var c = CAT(id); zb_tok(id+' '+(c ? c.name+' '+(c.bn||'')+' '+(c.garment||'') : '')).forEach(function(x){ if(w.indexOf(x)<0) w.push(x); }); }); return w; }
function zb_postCats(p){ var out = []; zb_prods(p).forEach(function(id){ var x = P(id); if(x && out.indexOf(x.cat)<0) out.push(x.cat); }); return out; }
/* why an ad shows on a post ('' = it does not). Same rule for the shop (zb_adsFor) and the editor list. */
function zb_adWhy(a, p){
  if(!p) return '';
  var pil = zb_pillarOf(p);
  if(a.posts && a.posts.length) return a.posts.indexOf(p.slug)>=0 ? 'বাছাই করা লেখা' : '';
  /* chosen categories decide alone: the ad shows on those categories' posts and nowhere else */
  if(a.pillars && a.pillars.length) return a.pillars.indexOf(pil)>=0 ? 'বিভাগ: '+zb_pname(pil) : '';
  if(a.match!=='related') return 'সব লেখায়';
  var cats = zb_adCats(a), pc = zb_postCats(p), same = cats.filter(function(c){ return pc.indexOf(c)>=0; })[0];
  if(same){ var k = CAT(same); return 'একই প্রোডাক্ট: '+(k ? (k.bn || k.name) : same); }
  var words = zb_catWords(cats), tag = (p.tags||[]).filter(function(t){ return zb_tok(t).some(function(x){ return words.indexOf(x)>=0; }); })[0];
  if(tag) return 'ট্যাগ: #'+tag;
  return '';
}
function zb_postBySlug(slug){ if(!slug) return null; var l = zb_posts().filter(function(p){ return p.slug===slug && p.status==='published'; }); return l.filter(function(p){ return p.lang==='en'; })[0] || l[0] || null; }
/* which ads fill a slot now — the shop calls this (ctx: {pillar, slug}; or ctx.post) */
function zb_adsFor(slot, ctx){
  ctx = ctx || {}; var isPost = /^post-/.test(slot), post = isPost ? (ctx.post || zb_postBySlug(ctx.slug)) : null;
  return zb_ads().filter(function(a){
    if(!zb_adLive(a) || (a.slots||[]).indexOf(slot)<0) return false;
    if(isPost){
      if(post) return !!zb_adWhy(a, post);
      if(a.posts && a.posts.length) return !!ctx.slug && a.posts.indexOf(ctx.slug)>=0;
      if(a.pillars && a.pillars.length && ctx.pillar && a.pillars.indexOf(ctx.pillar)<0) return false;
      return a.match!=='related' || (!!ctx.pillar && (a.pillars||[]).indexOf(ctx.pillar)>=0);
    }
    if(slot==='cat-top' && ctx.pillar){
      if(a.pillars && a.pillars.length) return a.pillars.indexOf(ctx.pillar)>=0;
      /* a related ad shows on a category page when at least one live post there matches it */
      if(a.match==='related') return zb_posts().some(function(p){ return p.status==='published' && zb_pillarOf(p)===ctx.pillar && !!zb_adWhy(a, p); });
    }
    return true;
  }).sort(function(x, y){ return (y.weight||1) - (x.weight||1); });
}
/* the live posts an ad would appear on (editor + list) */
function zb_adReach(a, all){ all = all || zb_posts(); return all.filter(function(p){ return p.status==='published'; }).map(function(p){ return [p, zb_adWhy(a, p)]; }).filter(function(x){ return !!x[1]; }); }
function zb_adNums(a, slot){
  var r = function(k, lo, hi){ return zo_rnd(k+a.id+slot, lo, hi); }, w = Math.max(1, a.weight||1);
  var views = a.active ? Math.round(r('av', 300, 3200) * (0.6 + w/10)) : 0, clicks = Math.round(views * r('ac', 6, 38) / 1000), atb = Math.round(clicks * r('ab', 5, 22) / 100), sales = Math.round(atb * r('as', 20, 55) / 100);
  return {views:views, clicks:clicks, atb:atb, sales:sales};
}
function zb_adPrice(a){ if(a.type==='product'){ var p = P(a.productId); return p ? p.price : 0; } if(a.type==='combo'){ var c = zb_combo(a.comboId); return c ? c.price : 0; }
  var ps = DB.products.filter(function(x){ return x.cat===a.catId; }); return ps.length ? Math.round(ps.reduce(function(s, x){ return s + x.price; }, 0) / ps.length) : 0; }

/* =====================================================================
   PAGE — tabs
   ===================================================================== */
var ZB_STAT = {published:['প্রকাশিত','ok'], scheduled:['সময় দেওয়া','info'], draft:['খসড়া','']};
var ZB_IDX = {indexed:['গুগলে আছে','ok','গুগলে উঠেছে'], discovered:['গুগলে ওঠেনি','warn','গুগল দেখেছে, এখনো তোলেনি'], submitted:['অনুরোধ পাঠানো','info','গুগলকে তুলতে বলা হয়েছে'], none:['চালু না','','এখনো প্রকাশ হয়নি']};
function zb_idx(p){ var s = zb_st(); if(s.idx[p.id]) return s.idx[p.id]; if(p.status!=='published') return 'none'; return zs_rnd('idx'+p.id) < .78 ? 'indexed' : 'discovered'; }
PAGES['zb-list'] = { layout:'admin', title:'ব্লগ ও SEO', render:function(params, q){
  q = q || {}; var tab = q.tab || 'posts', all = zb_posts(), tps = zb_topics(all);
  var nProp = tps.filter(function(t){ return t.st==='proposed'; }).length, nPipe = all.filter(function(p){ return ['writing','proof','final','ready'].indexOf(zb_stage(p))>=0; }).length;
  var tabs = zo_tabs('#/admin/blog', [['posts','সব পোস্ট', all.length],['topics','টপিক তালিকা', nProp || ''],['pipe','কাজের ধারা', nPipe],['sched','সময়সূচি'],['results','ফলাফল'],['authors','লেখক দল', zb_authors().length],['cats','বিভাগ ও ট্যাগ'],['ads','বিজ্ঞাপন', zb_ads().filter(function(a){ return zb_adLive(a); }).length],['seo','গুগল ও sitemap']], tab);
  var body = tab==='seo' ? zb_seoTab(all) : tab==='topics' ? zb_topicsTab(all) : tab==='pipe' ? zb_pipeTab(all) : tab==='sched' ? zb_schedTab(all) : tab==='results' ? zb_resultsTab(all)
    : tab==='authors' ? zb_authorsTab(all, q.a) : tab==='cats' ? zb_catsTab(all) : tab==='ads' ? zb_adsTab(all, q.ad) : zb_postsTab(all);
  return '<div class="zs-page zb-page">'+
    zo_head('অ্যাডমিন · কনটেন্ট', 'ব্লগ ও SEO', 'গুগল থেকে কাস্টমার আনার লেখা',
      'এজেন্টরা টপিক আনে, আপনি হ্যাঁ বলেন। একজন লেখক লেখে, আরেকজন প্রুফ করে, দূত শেষ চেক করে — সব চেক ঠিক না হলে কিছুই প্রকাশ হয় না। আপনার কাজ শুধু: টপিকে হ্যাঁ/না, আর চাইলে নিজে প্রকাশ বা সময় ঠিক করা। দিনে কমপক্ষে '+zb_bn(zb_cfg().perDay.min)+'টা, লক্ষ্য '+zb_bn(zb_cfg().perDay.target)+'টা।',
      zs_simTag('ডেমো')+'<a class="btn btn-primary" href="#/admin/blog/new" data-testid="zb-new">'+ico('plus',16)+'নতুন লেখা</a>')+
    tabs+zb_queueWarn(all, tab)+body+'</div>';
}};
function zb_queueWarn(all, tab){
  if(['posts','pipe','sched','topics'].indexOf(tab)<0) return '';
  var c = zb_cfg(), n = zb_dayPosts(1, all).length + zb_pubDay(1, all).length; if(n >= c.perDay.min) return '';
  var r = zb_ready(all).length;
  return '<div class="zs-note warn mb16" data-testid="zb-qwarn">'+ico('info',16)+'<div class="zs-bnp grow"><b>কালকের জন্য মাত্র '+zb_bn(n)+'টা লেখা — কমপক্ষে '+zb_bn(c.perDay.min)+'টা লাগবে।</b> '+(r ? 'প্রকাশের জন্য তৈরি '+zb_bn(r)+'টা আছে — খালি সময়ে বসিয়ে দিন।' : 'তৈরি কোনো লেখা নেই — টপিক তালিকায় হ্যাঁ দিন, লেখকরা লিখবে।')+'</div>'+
    (r ? '<button type="button" class="btn btn-sm btn-secondary" data-act="zb-s-fill">'+ico('swap',14)+'খালি সময়ে বসান</button>' : '<a class="btn btn-sm btn-secondary" href="#/admin/blog?tab=topics">টপিক দেখুন</a>')+'</div>';
}

/* ---------- posts tab ---------- */
function zb_postsTab(all){
  var u = ui('zb-list', {st:'all', lang:'all'});
  var list = all.filter(function(p){ return (u.st==='all' || p.status===u.st) && (u.lang==='all' || p.lang===u.lang); });
  var cnt = function(k){ return k==='all' ? all.length : all.filter(function(p){ return p.status===k; }).length; };
  var avg = Math.round(all.reduce(function(s,p){ return s + zb_score(p); }, 0)/Math.max(1,all.length)), nReady = zb_ready(all).length;
  return '<div class="zs-kpis k4">'+
      '<div class="zs-k"><div class="v">'+cnt('published')+'</div><div class="l">প্রকাশিত</div><div class="s">দোকানের জার্নালে</div></div>'+
      '<div class="zs-k"><div class="v">'+cnt('scheduled')+'</div><div class="l">সময় দেওয়া</div><div class="s">সময় হলে নিজে প্রকাশ হবে</div></div>'+
      '<div class="zs-k '+(nReady?'warn':'')+'"><div class="v">'+nReady+'</div><div class="l">প্রকাশের জন্য তৈরি</div><div class="s">সব চেক পাস — আপনি চাইলে প্রকাশ করুন</div></div>'+
      '<div class="zs-k '+(avg>=80?'ok':'warn')+'"><div class="v">'+avg+'</div><div class="l">গড় SEO স্কোর</div><div class="s">১০০-র মধ্যে</div></div>'+
    '</div>'+
    '<div class="zs-tabs">'+[['all','সব'],['published','প্রকাশিত'],['scheduled','সময় দেওয়া'],['draft','খসড়া']].map(function(s){ return '<button type="button" class="chip za-bn'+(u.st===s[0]?' on':'')+'" data-act="zb-f" data-k="st" data-v="'+s[0]+'">'+s[1]+' <span class="zo-cnt">'+cnt(s[0])+'</span></button>'; }).join('')+
      '<span class="zb-sep"></span>'+[['all','সব ভাষা'],['en','ইংরেজি'],['bn','বাংলা']].map(function(s){ return '<button type="button" class="chip za-bn'+(u.lang===s[0]?' on':'')+'" data-act="zb-f" data-k="lang" data-v="'+s[0]+'">'+s[1]+'</button>'; }).join('')+'</div>'+
    '<section class="zs-card zb-listcard">'+(list.map(function(p){ return zb_row(p, all); }).join('') || '<div class="zs-empty za-bn">এখানে কোনো লেখা নেই।</div>')+'</section>';
}
var ZB_SG = {writing:'লেখা হচ্ছে', proof:'প্রুফ চলছে', final:'দূতের শেষ চেক', ready:'প্রকাশের জন্য তৈরি'};
function zb_row(p, all){
  var st = ZB_STAT[p.status] || ZB_STAT.draft, ix = ZB_IDX[zb_idx(p)], sg = zb_stage(p), orphan = p.status==='published' && !zb_inbound(p, all).length;
  var pub = sg==='ready' && zb_canPublish(p, all);
  return '<div class="zb-row" data-testid="zb-row"><div class="zb-main"><a class="zb-t'+(p.lang==='bn'?' za-bn':'')+'" href="#/admin/blog/'+p.id+'">'+esc(p.title || 'শিরোনাম নেই')+'</a>'+
    '<div class="zs-mini zb-m za-bn">/'+esc(p.slug||'')+' · '+(p.status==='scheduled' ? 'প্রকাশ হবে '+esc(dateTimeStr(p.at)) : esc(dateStr(p.at)))+'</div>'+
    '<div class="zb-pills za-bn"><span class="zo-pill">'+(p.lang==='bn'?'বাংলা':'ইংরেজি')+'</span><span class="zo-pill">'+esc(zb_pname(zb_pillarOf(p)))+'</span><span class="zo-pill '+st[1]+'">'+st[0]+'</span>'+(ZB_SG[sg] ? '<span class="zo-pill '+(sg==='ready'?'ok':'info')+'">'+ZB_SG[sg]+'</span>' : '')+zb_scorePill(zb_score(p))+'<span class="zo-pill '+ix[1]+'" title="'+esc(ix[2])+'">'+ix[0]+'</span>'+(orphan ? '<span class="zo-pill warn" title="অন্য কোনো লেখা এটার দিকে লিংক করেনি — গুগল খুঁজে পেতে দেরি করে">কেউ লিংক করেনি</span>' : '')+'</div></div>'+
    '<div class="zb-act">'+(pub ? '<button type="button" class="btn btn-sm btn-primary" data-act="zb-p-pub" data-id="'+p.id+'" data-testid="zb-row-pub">'+ico('check',14)+'প্রকাশ করুন</button>' : '')+'<a class="btn btn-sm btn-secondary" href="#/admin/blog/'+p.id+'">'+ico('edit',14)+'এডিট</a>'+(p.status==='published' ? '<a class="btn btn-sm btn-ghost" href="'+zb_href(p)+'" aria-label="দোকানে দেখুন: '+esc(p.title)+'">'+ico('eye',14)+'<span class="zo-hide-s">দেখুন</span></a>' : '')+'</div></div>';
}
ACT['zb-f'] = function(el){ ui('zb-list',{})[el.getAttribute('data-k')] = el.getAttribute('data-v'); rerender(); };

/* ---------- topic list (PR 591) ---------- */
function zb_linkOpts(sel){
  return '<optgroup label="ক্যাটাগরি">'+DB.categories.filter(function(c){ return !c.hidden; }).map(function(c){ return '<option value="cat:'+c.id+'"'+(sel==='cat:'+c.id?' selected':'')+'>'+esc(c.name)+'</option>'; }).join('')+'</optgroup>'+
    '<optgroup label="প্রোডাক্ট">'+DB.products.map(function(p){ return '<option value="prod:'+p.id+'"'+(sel==='prod:'+p.id?' selected':'')+'>'+esc(p.name)+'</option>'; }).join('')+'</optgroup>';
}
function zb_pillarOpts(sel, any){ return (any ? '<option value="">'+esc(any)+'</option>' : '')+zb_pillars().map(function(p){ return '<option value="'+p.id+'"'+(sel===p.id?' selected':'')+'>'+esc(p.bn)+'</option>'; }).join(''); }
function zb_authorOpts(sel, extra){ return (extra||'')+zb_authors().map(function(a){ return '<option value="'+a.id+'"'+(sel===a.id?' selected':'')+' title="'+esc(a.code)+'">'+esc(a.bn+' · '+a.name)+'</option>'; }).join(''); }
function zb_topicsTab(all){
  var c = zb_cfg(), tps = zb_topics(all), u = ui('zb-topics', {f:'open'}), f = ui('zb-tf', {t:'', q:'', pillar:(zb_pillars()[0]||{}).id || '', link:'cat:polos', pri:2});
  var cnt = function(k){ return tps.filter(function(t){ return k==='open' ? ['proposed','approved'].indexOf(t.st)>=0 : k==='all' ? true : k==='busy' ? ['writing','proof','waiting'].indexOf(t.st)>=0 : t.st===k; }).length; };
  var list = tps.filter(function(t){ return u.f==='all' || (u.f==='open' ? ['proposed','approved'].indexOf(t.st)>=0 : u.f==='busy' ? ['writing','proof','waiting'].indexOf(t.st)>=0 : t.st===u.f); })
    .sort(function(a,b){ return (ZB_TORDER.indexOf(a.st)-ZB_TORDER.indexOf(b.st)) || ((a.pri||2)-(b.pri||2)) || (a.at-b.at); });
  var nAp = cnt('approved'), days = Math.floor(nAp / Math.max(1, c.perDay.target)*10)/10;
  return '<div class="zs-kpis k4">'+
      '<div class="zs-k '+(cnt('proposed')?'warn':'ok')+'"><div class="v">'+cnt('proposed')+'</div><div class="l">প্রস্তাব</div><div class="s">আপনার হ্যাঁ/না লাগবে</div></div>'+
      '<div class="zs-k"><div class="v">'+nAp+'</div><div class="l">অনুমোদিত</div><div class="s">লাইনে আছে · প্রায় '+zb_bn(days)+' দিনের</div></div>'+
      '<div class="zs-k"><div class="v">'+cnt('busy')+'</div><div class="l">কাজ চলছে</div><div class="s">লেখা, প্রুফ, অপেক্ষা</div></div>'+
      '<div class="zs-k ok"><div class="v">'+cnt('published')+'</div><div class="l">প্রকাশিত</div><div class="s">এই তালিকা থেকে</div></div></div>'+
    '<div class="zs-g2 zb-tg">'+
      '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">নিজের টপিক যোগ করুন</h2></div><div class="zs-sub za-bn">আপনার দেওয়া টপিক সাথে সাথে অনুমোদিত হয়। বিভাগ দেখে লেখক নিজে ঠিক হয় — চাইলে বদলাতে পারবেন।</div>'+
        '<div class="zp-f"><label class="label" for="zb-tf-t">টপিক</label><input id="zb-tf-t" class="input zs-in" type="text" value="'+esc(f.t)+'" data-input="zb-tf" data-k="t" placeholder="যেমন: How to wash raw denim" data-testid="zb-tf-t"></div>'+
        '<div class="zp-f"><label class="label" for="zb-tf-q">মানুষ গুগলে যা লিখে খোঁজে</label><input id="zb-tf-q" class="input zs-in" type="text" value="'+esc(f.q)+'" data-input="zb-tf" data-k="q" placeholder="how to wash raw denim"></div>'+
        '<div class="za-f2"><div class="zp-f"><label class="label" for="zb-tf-p">বিভাগ</label><select id="zb-tf-p" class="input zs-in" data-change="zb-tfc" data-k="pillar">'+zb_pillarOpts(f.pillar)+'</select></div>'+
          '<div class="zp-f"><label class="label" for="zb-tf-l">কোন ক্যাটাগরি/প্রোডাক্টে লিংক</label><select id="zb-tf-l" class="input zs-in" data-change="zb-tfc" data-k="link">'+zb_linkOpts(f.link)+'</select></div></div>'+
        '<div class="zp-f"><span class="label">গুরুত্ব</span><div class="zs-tier" role="group" aria-label="গুরুত্ব">'+[[1,'জরুরি'],[2,'সাধারণ'],[3,'পরে']].map(function(x){ return '<button type="button" class="'+(+f.pri===x[0]?'on':'')+'" data-act="zb-tf-pri" data-v="'+x[0]+'">'+x[1]+'</button>'; }).join('')+'</div></div>'+
        '<div id="zb-tdup">'+zb_tdupHTML(f, all)+'</div>'+
        '<div class="zs-actions mt12"><button type="button" class="btn btn-primary" data-act="zb-t-add" data-testid="zb-t-add">'+ico('plus',15)+'টপিক যোগ করুন</button></div></section>'+
      '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">কীভাবে চলে</h2>'+zs_simTag('ডেমো টপিক')+'</div>'+
        '<ol class="zb-how za-bn"><li>দূত গুগলের আসল সার্চ থেকে টপিক আনে — প্রতিটায় মানুষ কী লিখে খোঁজে আর কোন পেজে লিংক যাবে।</li><li>আপনি হ্যাঁ বা না দেন, গুরুত্ব ঠিক করেন। "সব অনুমোদন" মিল-থাকা টপিক বাদ রেখে বাকি সব পাস করে।</li><li>ওই বিভাগের লেখক লেখে, অন্য লেখক প্রুফ করে, দূত শেষ চেক করে — এগুলো এজেন্টদের কাজ, আপনাকে কিছু চাপতে হবে না।</li><li>একই রকম টপিক এলে সিস্টেম সাবধান করে — শব্দের মিল '+zb_pct(c.dup.warn)+' বা বেশি হলে।</li></ol>'+
        '<div class="zs-actions mt12"><button type="button" class="btn btn-secondary" data-act="zb-t-all" data-testid="zb-t-all">'+ico('check',15)+'সব অনুমোদন</button><button type="button" class="btn btn-ghost" data-act="zb-t-more">'+ico('plus',15)+'দূত আরো টপিক আনুক</button></div></section></div>'+
    '<div class="zs-tabs mt16">'+[['open','খোলা'],['proposed','প্রস্তাব'],['approved','অনুমোদিত'],['busy','কাজ চলছে'],['published','প্রকাশিত'],['rejected','বাদ'],['all','সব']].map(function(s){ return '<button type="button" class="chip za-bn'+(u.f===s[0]?' on':'')+'" data-act="zb-tff" data-v="'+s[0]+'">'+s[1]+' <span class="zo-cnt">'+cnt(s[0])+'</span></button>'; }).join('')+'</div>'+
    '<section class="zs-card zb-listcard" data-testid="zb-topics">'+(list.map(function(t){ return zb_trow(t, all); }).join('') || '<div class="zs-empty za-bn">এখানে কিছু নেই।</div>')+'</section>';
}
function zb_tdupHTML(f, all){
  if(!String(f.t||'').trim()) return '';
  var d = zb_dupFind(f.t, f.q, {}, all), c = zb_cfg();
  if(d.score < c.dup.near) return '<div class="zs-mini za-bn mt8">'+ico('check',12)+' আগের কোনো লেখা বা টপিকের সাথে মিল নেই।</div>';
  return '<div class="zs-note '+(d.score>=c.dup.warn?'warn':'')+' mt8" data-testid="zb-tdup-warn">'+ico('info',15)+'<div class="za-bn"><b>'+(d.score>=c.dup.warn ? 'খুব কাছাকাছি' : 'কিছুটা মিল')+' ('+zb_pct(d.score)+')</b> — '+(d.kind==='post'?'লেখা':'টপিক')+': "'+esc(d.title)+'"</div></div>';
}
function zb_trow(t, all){
  var c = zb_cfg(), st = ZB_TST[t.st] || ZB_TST.proposed, d = (t.st==='proposed' || t.st==='approved') && t.kind==='new' ? zb_dupFind(t.t, t.q, {topic:t.id}, all) : {score:0};
  var href = zb_linkHref(t.link), pr = +t.pri || 2;
  var acts = t.st==='proposed' ? '<button type="button" class="btn btn-sm btn-primary" data-act="zb-t-ok" data-id="'+t.id+'">'+ico('check',14)+'হ্যাঁ</button><button type="button" class="btn btn-sm btn-ghost" data-act="zb-t-no" data-id="'+t.id+'">না</button>'
    : t.st==='approved' ? '<button type="button" class="btn btn-sm btn-secondary" data-act="zb-p-start" data-id="'+t.id+'">'+ico('edit',14)+'এখনই লেখান</button>'
    : t.st==='rejected' ? '<button type="button" class="btn btn-sm btn-ghost" data-act="zb-t-re" data-id="'+t.id+'">আবার ভাবুন</button>'
    : t.post ? '<a class="btn btn-sm btn-ghost" href="#/admin/blog/'+t.post+'">'+ico('eye',14)+'লেখা দেখুন</a>' : '';
  var canEdit = ['proposed','approved'].indexOf(t.st)>=0;
  return '<div class="zb-trow" data-testid="zb-trow"><div class="zb-main"><div class="zb-tt'+(t.lang==='bn'?' za-bn':'')+'">'+esc(t.t)+'</div>'+
    '<div class="zs-mini zb-m">'+ico('search',12)+' '+esc(t.q||'—')+'</div>'+
    '<div class="zb-pills"><span class="zo-pill '+st[1]+' za-bn">'+st[0]+'</span><span class="zo-pill za-bn">'+esc(zb_pname(t.pillar))+'</span>'+(href ? '<a class="zo-pill" href="'+href+'">'+esc(zb_linkLabel(t.link))+'</a>' : '')+
      '<span class="zo-pill za-bn" title="কে প্রস্তাব দিয়েছে'+(zb_codeTip(t.by) ? ' · '+esc(zb_codeTip(t.by)) : '')+'">'+esc(zb_short(t.by))+'র প্রস্তাব</span>'+(t.demo ? '<span class="zo-pill za-bn">ডেমো</span>' : '')+
      (d.score>=c.dup.warn ? '<span class="zo-pill bad za-bn" title="'+esc(d.title)+'">মিল '+zb_pct(d.score)+': '+esc(d.title.slice(0,40))+'</span>' : d.score>=c.dup.near ? '<span class="zo-pill warn za-bn" title="'+esc(d.title)+'">কিছুটা মিল '+zb_pct(d.score)+'</span>' : '')+'</div></div>'+
    '<div class="zb-tact">'+(canEdit ? '<label class="zb-mini-sel"><span class="zs-mini za-bn">লেখক</span><select class="input zs-in" data-change="zb-t-wr" data-id="'+t.id+'" aria-label="লেখক">'+zb_authorOpts(t.writer)+'</select></label>'+
      '<label class="zb-mini-sel"><span class="zs-mini za-bn">গুরুত্ব</span><select class="input zs-in" data-change="zb-t-pri" data-id="'+t.id+'" aria-label="গুরুত্ব">'+[[1,'জরুরি'],[2,'সাধারণ'],[3,'পরে']].map(function(x){ return '<option value="'+x[0]+'"'+(pr===x[0]?' selected':'')+'>'+x[1]+'</option>'; }).join('')+'</select></label>'
      : zb_who(t.writer, 'লেখক'))+
      '<div class="zb-tbtn">'+acts+'</div></div></div>';
}
INPUT['zb-tf'] = function(el){ var f = ui('zb-tf', {}); f[el.getAttribute('data-k')] = el.value; f.force = false; var d = document.getElementById('zb-tdup'); if(d) d.innerHTML = zb_tdupHTML(f, zb_posts()); };
CHANGE['zb-tfc'] = function(el){ var f = ui('zb-tf', {}); f[el.getAttribute('data-k')] = el.value; };
ACT['zb-tf-pri'] = function(el){ ui('zb-tf', {}).pri = +el.getAttribute('data-v'); rerender(); };
ACT['zb-tff'] = function(el){ ui('zb-topics', {}).f = el.getAttribute('data-v'); rerender(); };
ACT['zb-t-add'] = function(){
  var f = ui('zb-tf', {}), t = String(f.t||'').trim(), c = zb_cfg();
  if(!t){ toast('টপিকটা লিখুন'); var e = document.getElementById('zb-tf-t'); if(e) e.focus(); return; }
  var d = zb_dupFind(t, f.q, {});
  if(d.score>=c.dup.warn && !f.force){ f.force = true; toast('খুব কাছাকাছি টপিক আছে: "'+d.title+'" — তবুও যোগ করতে আবার চাপুন'); return; }
  var pil = f.pillar || (zb_pillars()[0]||{}).id;
  zb_st().mine.push({id:'u-'+uid(), t:t, q:String(f.q||'').trim(), pillar:pil, link:f.link||'', by:'owner', st:'approved', pri:+f.pri||2, lang:/[ঀ-৿]/.test(t)?'bn':'en', kind:'new', at:Date.now(), writer:zb_authorFor(pil)});
  UI['zb-tf'] = {t:'', q:'', pillar:pil, link:f.link, pri:2}; zb_commit(); rerender(); toast('টপিক যোগ হলো — অনুমোদিত, '+zb_name(zb_authorFor(pil))+' লিখবে');
};
ACT['zb-t-ok'] = function(el){ zb_tset(el.getAttribute('data-id'), {st:'approved'}); rerender(); toast('অনুমোদিত'); };
ACT['zb-t-no'] = function(el){ zb_tset(el.getAttribute('data-id'), {st:'rejected'}); rerender(); toast('বাদ দেওয়া হলো — মুছে যায়নি, "বাদ" তালিকায় আছে'); };
ACT['zb-t-re'] = function(el){ zb_tset(el.getAttribute('data-id'), {st:'proposed'}); rerender(); };
CHANGE['zb-t-pri'] = function(el){ zb_tset(el.getAttribute('data-id'), {pri:+el.value}); rerender(); };
CHANGE['zb-t-wr'] = function(el){ zb_tset(el.getAttribute('data-id'), {writer:el.value}); rerender(); toast('লেখক বদলানো হলো: '+zb_name(el.value)); };
ACT['zb-t-all'] = function(){
  var all = zb_posts(), c = zb_cfg(), ok = 0, held = 0, s = zb_st();
  zb_topics(all).filter(function(t){ return t.st==='proposed'; }).forEach(function(t){
    if(t.kind==='new' && zb_dupFind(t.t, t.q, {topic:t.id}, all).score >= c.dup.warn){ held++; return; }
    var mine = s.mine.filter(function(x){ return x.id===t.id; })[0]; if(mine) mine.st = 'approved'; else s.topics[t.id] = Object.assign(s.topics[t.id]||{}, {st:'approved'}); ok++;
  });
  zb_commit(); rerender(); toast(zb_bn(ok)+'টা অনুমোদিত'+(held ? ', মিল থাকায় '+zb_bn(held)+'টা আপনার জন্য রাখা হলো' : ''));
};
ACT['zb-t-more'] = function(){
  var s = zb_st(), have = zb_topics().map(function(t){ return t.t; }), n = 0;
  ZB_TOPIC_MORE.forEach(function(m){ if(n>=3 || have.indexOf(m[0])>=0) return; s.mine.push({id:'d-'+uid(), t:m[0], q:m[1], pillar:m[2], link:m[3], by:zb_cfg().head, st:'proposed', pri:2, lang:'en', kind:'new', demo:true, at:Date.now()+n, writer:zb_authorFor(m[2])}); n++; });
  zb_commit(); rerender(); toast(n ? 'দূত '+zb_bn(n)+'টা নতুন টপিক আনল (ডেমো)' : 'এখন আর নতুন টপিক নেই (ডেমো)');
};

/* ---------- pipeline board (PR 591 + 593) ----------
   UX 4: agent steps are status chips with a progress bar; the owner's buttons are only his own
   (edit, publish with a confirm, schedule, unpublish). The agent-step buttons sit in a small
   "ডেমো: এজেন্টের ধাপ" strip, shown while the page switch is on (tests + the demo use them). */
var ZB_COLS = [
  ['writing','লেখা হচ্ছে','writer','লেখক লিখছে'],
  ['proof','প্রুফ ও তথ্য যাচাই','proofer','অন্য একজন লেখক দেখছে'],
  ['final','দূতের শেষ চেক','head','দূত SEO আর লিংক দেখছে'],
  ['ready','প্রকাশের জন্য তৈরি','','সব চেক পাস — আপনি চাইলে প্রকাশ করুন'],
  ['scheduled','সময় দেওয়া','','সময় হলে নিজে প্রকাশ হবে'],
  ['published','প্রকাশিত','','দোকানে চালু']
];
var ZB_STEPS = ['writing','proof','final','ready','published'];
function zb_demoOn(){ return ui('zb-pipe', {demo:true}).demo !== false; }
function zb_progress(stage){
  var i = ZB_STEPS.indexOf(stage==='scheduled' ? 'ready' : stage); if(i<0) i = 0;
  var lab = ['লেখা','প্রুফ','দূত','তৈরি','প্রকাশ'];
  return '<div class="zbp-prog" role="img" aria-label="'+esc('ধাপ '+(i+1)+' / '+ZB_STEPS.length+' — '+lab[i])+'">'+ZB_STEPS.map(function(s, j){ return '<span class="'+(j<i?'done':j===i?'now':'')+'"><i></i><b class="za-bn">'+lab[j]+'</b></span>'; }).join('')+'</div>';
}
/* one status line in plain words — who is doing what now */
function zb_status(p, stage, ck){
  var c = zb_cfg(), okN = ck.filter(function(x){ return x.ok; }).length, miss = ck.filter(function(x){ return !x.ok; });
  if(stage==='writing') return [ico('edit',12)+' '+esc(zb_short(p.writer))+' লিখছে', 'info'];
  if(stage==='proof') return [ico('eye',12)+' '+esc(zb_short(p.proofer))+' প্রুফ করছে · চেক '+zb_bn(okN)+'/'+zb_bn(ck.length), 'warn'];
  if(stage==='final') return [ico('search',12)+' '+esc(zb_short(c.head))+' শেষ চেক করছে'+(miss.length ? ' · বাকি '+zb_bn(miss.length)+'টা' : ' · সব ঠিক'), miss.length ? 'warn' : 'info'];
  if(stage==='ready') return [ico('check',12)+' সব চেক পাস — প্রকাশের জন্য তৈরি', 'ok'];
  if(stage==='scheduled') return [ico('info',12)+' প্রকাশ হবে '+esc(dateTimeStr(p.at)), 'info'];
  return [ico('check',12)+' দোকানে চালু', 'ok'];
}
function zb_pipeTab(all){
  var c = zb_cfg(), by = {}, demo = zb_demoOn();
  ZB_COLS.forEach(function(k){ by[k[0]] = []; });
  all.forEach(function(p){ var s = zb_stage(p); if(by[s]) by[s].push(p); });
  by.published.sort(function(a,b){ return b.at-a.at; }); by.scheduled.sort(function(a,b){ return a.at-b.at; });
  var nAp = zb_topics(all).filter(function(t){ return t.st==='approved'; }).length, today = zb_pubDay(0, all).length;
  var showPub = 6;
  return '<div class="zs-note mb16">'+ico('lock',16)+'<div class="zs-bnp"><b>লেখা, প্রুফ আর শেষ চেক এজেন্টদের কাজ — আপনাকে কিছু চাপতে হবে না।</b> লেখক কখনো নিজের লেখা পাস করতে পারে না: প্রুফ করে অন্য লেখক (পালা করে), শেষ চেক করে '+esc(zb_short(c.head))+'। সাতটা চেক সব ঠিক না হলে লেখা প্রকাশ হয় না। আপনি চাইলে "প্রকাশের জন্য তৈরি" লেখা নিজে প্রকাশ করতে বা সময় দিতে পারেন।</div></div>'+
    '<div class="zs-kpis k4">'+
      '<div class="zs-k '+(today>=c.perDay.min?'ok':'warn')+'"><div class="v">'+today+' / '+c.perDay.target+'</div><div class="l">আজ প্রকাশ</div><div class="s">কমপক্ষে '+zb_bn(c.perDay.min)+'</div></div>'+
      '<div class="zs-k"><div class="v">'+(by.writing.length+by.proof.length+by.final.length)+'</div><div class="l">এজেন্টদের হাতে</div><div class="s">লেখা · প্রুফ · শেষ চেক</div></div>'+
      '<div class="zs-k '+(by.ready.length?'warn':'')+'"><div class="v">'+by.ready.length+'</div><div class="l">প্রকাশের জন্য তৈরি</div><div class="s">আপনার এক চাপে প্রকাশ</div></div>'+
      '<div class="zs-k"><div class="v">'+nAp+'</div><div class="l">অনুমোদিত টপিক</div><div class="s">লেখা শুরু হয়নি</div></div></div>'+
    '<div class="zs-actions mb16 zb-pipeact"><button type="button" class="btn btn-secondary" data-act="zb-s-fill">'+ico('swap',15)+'তৈরি লেখা খালি সময়ে বসান</button>'+
      '<span class="zb-demosw za-bn">'+zs_sw(demo, 'zb-p-demo', 'ডেমো নিয়ন্ত্রণ দেখান')+'<span>ডেমো: এজেন্টের ধাপ নিজে চালান</span></span>'+
      (demo ? '<button type="button" class="btn btn-sm btn-ghost zb-demob" data-act="zb-p-start" data-testid="zb-p-start"'+(nAp?'':' aria-disabled="true"')+'>'+ico('edit',14)+'ডেমো: পরের টপিক লেখা শুরু</button>' : '')+'</div>'+
    '<div class="zb-board" data-testid="zb-board">'+ZB_COLS.map(function(k){
      var items = by[k[0]], more = k[0]==='published' && items.length>showPub ? items.length-showPub : 0;
      return '<section class="zb-col" data-col="'+k[0]+'"><div class="zb-colh"><div style="min-width:0"><div class="zb-colt za-bn">'+k[1]+' <span class="zo-cnt">'+items.length+'</span></div><div class="zs-mini za-bn zb-colsub">'+k[3]+'</div></div></div>'+
        (items.slice(0, k[0]==='published' ? showPub : 99).map(function(p){ return zb_card(p, k[0], all, demo); }).join('') || '<div class="zs-mini za-bn zb-empty">খালি</div>')+
        (more ? '<a class="zs-link small za-bn" href="#/admin/blog">আরো '+zb_bn(more)+'টা — সব পোস্ট</a>' : '')+'</section>';
    }).join('')+'</div>';
}
function zb_card(p, stage, all, demo){
  var c = zb_cfg(), ck = zb_pchecks(p, all), cm = p.comments||[], last = cm[cm.length-1], st = zb_status(p, stage, ck);
  var ag = p.pipe ? zb_who(p.writer, 'লেখক')+(p.proofer ? zb_who(p.proofer, 'প্রুফ') : '')+(stage==='final' || p.finalBy ? zb_who(c.head, 'শেষ চেক') : '') : zb_who(p.writer||'owner', 'লেখক');
  var h = '<article class="zbp-card" data-testid="zbp-card" data-id="'+p.id+'"><a class="zbp-t'+(p.lang==='bn'?' za-bn':'')+'" href="#/admin/blog/'+p.id+'">'+esc(p.title)+'</a>'+
    '<div class="zbp-meta"><span class="zo-pill za-bn">'+esc(zb_pname(zb_pillarOf(p)))+'</span>'+(p.demo ? '<span class="zo-pill za-bn">ডেমো</span>' : '')+'</div>'+
    (p.pipe || stage!=='published' ? zb_progress(stage) : '')+
    '<div class="zbp-st '+st[1]+' za-bn" data-testid="zbp-status">'+st[0]+'</div>'+
    '<div class="zbp-ag">'+ag+'</div>';
  if(stage==='proof' || stage==='final'){
    /* read-only: the owner sees what the agents checked; nothing here is his job */
    h += '<div class="zbp-cks">'+ck.map(function(x){
      return '<div class="zbp-ck'+(x.ok?' ok':'')+'" title="'+(x.auto?'সিস্টেম নিজে দেখে':'প্রুফের লেখক দেখে')+'"><span class="zb-ckd">'+(x.ok?ico('check',10):'')+'</span><span class="zbp-ckl za-bn">'+esc(x.bn)+'<small>'+esc(x.why)+'</small></span></div>';
    }).join('')+'</div>';
  }
  if(stage==='published'){ var n = zb_nums(p); h += '<div class="zbp-nums za-bn"><span><b>'+n.visits+'</b> ভিজিট</span><span><b>'+n.sales+'</b> বিক্রিতে সাহায্য</span></div><div class="zs-mini zbp-q">'+ico('search',11)+' '+esc(n.q)+'</div>'; }
  if(last) h += '<div class="zbp-cm za-bn"><b>'+esc(zb_short(last.by))+':</b> '+esc(last.t)+'</div>';
  /* the owner's own buttons */
  var btn = '';
  if(stage==='ready') btn = '<button type="button" class="btn btn-sm btn-primary" data-act="zb-p-pub" data-id="'+p.id+'" data-testid="zb-card-pub">'+ico('check',13)+'প্রকাশ করুন</button><button type="button" class="btn btn-sm btn-secondary" data-act="zb-p-slot" data-id="'+p.id+'">সময় দিন</button>';
  else if(stage==='scheduled') btn = '<button type="button" class="btn btn-sm btn-secondary" data-act="zb-p-pub" data-id="'+p.id+'">এখনই প্রকাশ</button><button type="button" class="btn btn-sm btn-ghost" data-act="zb-p-unslot" data-id="'+p.id+'">সময় সরান</button>';
  else if(stage==='published') btn = '<a class="btn btn-sm btn-ghost" href="'+zb_href(p)+'">'+ico('eye',13)+'দেখুন</a>'+(p.pipe ? '<button type="button" class="btn btn-sm btn-ghost" data-act="zb-p-unpub" data-id="'+p.id+'">প্রকাশ বন্ধ</button>' : '');
  else btn = '<a class="btn btn-sm btn-ghost" href="#/admin/blog/'+p.id+'">'+ico('edit',13)+'এডিট</a>';
  h += '<div class="zbp-btns">'+btn+'<button type="button" class="btn btn-sm btn-ghost" data-act="zb-p-cm" data-id="'+p.id+'" aria-label="মন্তব্য ('+cm.length+')">'+ico('chat',13)+cm.length+'</button></div>';
  /* demo-only: simulate the agent's step */
  if(demo && (stage==='writing' || stage==='proof' || stage==='final')){
    var d = '';
    if(stage==='writing') d = '<button type="button" class="zbp-db" data-act="zb-p-submit" data-id="'+p.id+'">প্রুফে পাঠান</button>';
    if(stage==='proof') d = ck.filter(function(x){ return !x.auto; }).map(function(x){ return '<button type="button" class="zbp-db'+(x.ok?' on':'')+'" data-act="zb-p-ck" data-id="'+p.id+'" data-k="'+x.k+'" aria-pressed="'+x.ok+'">'+(x.ok?ico('check',11):'')+esc(x.short)+'</button>'; }).join('')+
      '<button type="button" class="zbp-db go" data-act="zb-p-pass" data-id="'+p.id+'" data-testid="zb-p-pass">প্রুফ পাস</button><button type="button" class="zbp-db" data-act="zb-p-back" data-id="'+p.id+'">ফেরত</button>';
    if(stage==='final') d = (ck.some(function(x){ return !x.ok && x.who==='final'; }) ? '<button type="button" class="zbp-db" data-act="zb-p-autolink" data-id="'+p.id+'">লিংক দিন</button><button type="button" class="zbp-db" data-act="zb-p-fix" data-id="'+p.id+'">দূত ঠিক করুক</button>' : '')+
      '<button type="button" class="zbp-db go" data-act="zb-p-final" data-id="'+p.id+'">শেষ চেক পাস</button><button type="button" class="zbp-db" data-act="zb-p-back" data-id="'+p.id+'">ফেরত</button>';
    h += '<div class="zbp-demo" data-testid="zbp-demo"><span class="zbp-dl za-bn">'+ico('info',11)+' ডেমো: এজেন্টের ধাপ</span><div class="zbp-dbs za-bn">'+d+'</div></div>';
  }
  return h+'</article>';
}
function zb_toastErr(m){ toast(m); return false; }
ACT['zb-p-start'] = function(el){
  var id = el.getAttribute('data-id'), all = zb_posts(), c = zb_cfg();
  var t = id ? zb_topic(id, all) : zb_topics(all).filter(function(x){ return x.st==='approved'; }).sort(function(a,b){ return ((a.pri||2)-(b.pri||2)) || (a.at-b.at); })[0];
  if(!t || t.st!=='approved'){ toast('অনুমোদিত কোনো টপিক নেই — আগে টপিক তালিকায় হ্যাঁ দিন'); return; }
  var pid = String(t.link||'').indexOf('prod:')===0 ? t.link.slice(5) : '', cp = !pid && String(t.link||'').indexOf('cat:')===0 ? DB.products.filter(function(x){ return x.cat===t.link.slice(4); })[0] : null, prod = pid || (cp ? cp.id : '');
  var p = {id:'pp-'+uid(), topic:t.id, title:t.t, slug:/[a-z]/i.test(t.t) ? zb_jslug(t.t) : zo_slug(t.q) || 'post-'+uid(), slugAuto:true, meta:'', kw:t.q, lang:t.lang||'en', status:'draft', at:Date.now(), sched:'',
    body:t.t+'\n\n[খসড়া · ডেমো — '+zb_name(t.writer)+' লিখছে: সরাসরি উত্তর, ধাপ, "আমরা কীভাবে জানি", প্রোডাক্ট ব্লক, প্রশ্নোত্তর]', quickAnswer:'', product:prod, products:prod?[prod]:[], color:'', section:zb_secOf(t.pillar), pillar:t.pillar, sub:'', tags:[],
    links:[], heroImage:'', pipe:'writing', writer:t.writer, proofer:'', checks:{}, comments:[{by:t.writer, t:'লেখা শুরু করলাম।', at:Date.now()}], passedBy:'', finalBy:''};
  p.links = zb_suggest(p, all).slice(0, c.links.min);
  zb_put(p); rerender(); toast(zb_name(t.writer)+' লেখা শুরু করল: '+t.t);
};
ACT['zb-p-submit'] = function(el){
  var p = zb_mut(el.getAttribute('data-id'), function(p){
    if(zb_words(p.body)<20 || !String(p.title).trim()) return zb_toastErr('লেখা এখনো খুব ছোট — আগে খসড়া শেষ হোক');
    p.proofer = zb_rotProofer(p.writer);
    if(!p.proofer || p.proofer===p.writer) return zb_toastErr('প্রুফ করার মতো অন্য লেখক নেই');
    p.pipe = 'proof'; p.passedBy = ''; p.finalBy = ''; p.comments = (p.comments||[]).concat({by:p.writer, t:'প্রুফে পাঠালাম।', at:Date.now()});
  });
  if(p){ rerender(); toast('প্রুফে গেল — প্রুফ করবে '+zb_name(p.proofer)); }
};
ACT['zb-p-ck'] = function(el){
  var k = el.getAttribute('data-k'), p = zb_mut(el.getAttribute('data-id'), function(p){
    if(p.pipe!=='proof') return false;
    if(!p.proofer || p.proofer===p.writer) return zb_toastErr('লেখক নিজের লেখায় টিক দিতে পারবে না');
    p.checks = p.checks || {}; p.checks[k] = !p.checks[k];
  });
  if(p) rerender();
};
ACT['zb-p-pass'] = function(el){
  var p = zb_mut(el.getAttribute('data-id'), function(p){
    var err = zb_passProof(p, p.proofer); if(err) return zb_toastErr(err);
    p.passedBy = p.proofer; p.pipe = 'final'; p.comments = (p.comments||[]).concat({by:p.proofer, t:'প্রুফ পাস — দূতের শেষ চেকে পাঠালাম।', at:Date.now()});
  });
  if(p){ rerender(); toast('প্রুফ পাস — এখন দূতের শেষ চেক'); }
};
ACT['zb-p-autolink'] = function(el){
  var all = zb_posts(), c = zb_cfg(), p = zb_mut(el.getAttribute('data-id'), function(p){
    var have = (p.links||[]).map(function(l){ return l.h; });
    zb_suggest(p, all).forEach(function(l){ if(p.links.length<c.links.min+1 && have.indexOf(l.h)<0){ p.links.push(l); have.push(l.h); } });
  });
  if(p){ rerender(); toast('দূত '+zb_bn(p.links.length)+'টা ভেতরের লিংক দিল'); }
};
ACT['zb-p-final'] = function(el){
  var c = zb_cfg(), p = zb_mut(el.getAttribute('data-id'), function(p){
    var err = zb_passFinal(p, c.head); if(err) return zb_toastErr(err);
    p.finalBy = c.head; p.pipe = 'ready'; p.comments = (p.comments||[]).concat({by:c.head, t:'শেষ SEO চেক পাস — প্রকাশের জন্য তৈরি।', at:Date.now()});
  });
  if(p){ rerender(); toast('শেষ চেক পাস — প্রকাশের জন্য তৈরি'); }
};
/* #19 "দূত ঠিক করুক": Doot repairs what it can — internal links, the meta description (length + keyword), the slug */
function zb_autoMeta(p){
  var c = zb_cfg(), kw = String(p.kw||'').trim(), base = String(p.quickAnswer || String(p.body||'').split(/\n\s*\n/)[0] || p.title || '').replace(/\s+/g,' ').trim();
  if(kw && !zb_kwIn(kw, base)) base = kw.charAt(0).toUpperCase()+kw.slice(1)+': '+base;
  var pad = p.lang==='bn' ? ' সহজ ভাষায় EXTAS-এর গাইড।' : ' A simple guide from EXTAS.';
  while(base.length < c.meta.min) base += pad;
  if(base.length > c.meta.max){ base = base.slice(0, c.meta.max-1).replace(/\s+\S*$/, ''); base = base.replace(/[,;:—-]+$/,'')+'.'; }
  if(kw && !zb_kwIn(kw, base)) base = (kw+' — '+base).slice(0, c.meta.max);
  return base;
}
ACT['zb-p-fix'] = function(el){
  var all = zb_posts(), c = zb_cfg(), fixed = [], p = zb_mut(el.getAttribute('data-id'), function(p){
    var ck = zb_pchecks(p, all), bad = function(k){ return ck.some(function(x){ return x.k===k && !x.ok; }); };
    if(bad('links')){ var have = (p.links||[]).map(function(l){ return l.h; }); p.links = (p.links||[]).slice(0, c.links.max); zb_suggest(p, all).forEach(function(l){ if(p.links.length<c.links.min && have.indexOf(l.h)<0){ p.links.push(l); have.push(l.h); } }); fixed.push('লিংক'); }
    if(bad('meta')){ p.meta = zb_autoMeta(p); fixed.push('বর্ণনা'); }
    if(bad('slug')){ var sl = zo_slug(p.kw || p.title) || ('post-'+uid()); var n = 2, base = sl; while(all.some(function(x){ return x.id!==p.id && x.slug===sl; })) sl = base+'-'+(n++); p.slug = sl; p.slugAuto = false; fixed.push('লিংক নাম'); }
    if(!fixed.length) return zb_toastErr('দূতের ঠিক করার মতো কিছু নেই — বাকিটা প্রুফের লেখকের কাজ');
    p.comments = (p.comments||[]).concat({by:c.head, t:'ঠিক করলাম: '+fixed.join(', ')+'।', at:Date.now()});
  });
  if(p){ rerender(); toast(zb_short(c.head)+' ঠিক করল: '+fixed.join(', ')); }
};
ACT['zb-p-slot'] = function(el){ var r = zb_fill(el.getAttribute('data-id')); rerender(); toast(r.done ? 'সময় দেওয়া হলো — সময় হলে নিজে প্রকাশ হবে' : 'সামনের '+zb_bn(zb_cfg().daysAhead)+' দিনে খালি সময় নেই — সময়সূচিতে সময় বাড়ান'); };
ACT['zb-p-unslot'] = function(el){ var p = zb_mut(el.getAttribute('data-id'), function(p){ if(!p.pipe) return zb_toastErr('এটা লেখক দলের লেখা না — এডিটরে বদলান'); p.status = 'draft'; p.pipe = 'ready'; p.sched = ''; }); if(p){ rerender(); toast('সময় সরানো হলো — "প্রকাশের জন্য তৈরি"-তে ফিরল'); } };
/* UX 5: publish by hand = "প্রকাশ করুন" on a ready card or row → one confirm. Never without all checks. */
ACT['zb-p-pub'] = function(el){
  var id = el.getAttribute('data-id'), all = zb_posts(), p = zb_get(id); if(!p) return;
  if(!zb_canPublish(p, all)){ toast('সব চেক আর দুই ধাপের পাস ছাড়া প্রকাশ হবে না'); return; }
  openModal('<div class="zs-bnp"><b class="'+(p.lang==='bn'?'za-bn':'')+'">'+esc(p.title)+'</b></div><div class="zs-bnp mt8">এখনই দোকানের জার্নালে প্রকাশ হবে। প্রুফ, দূতের শেষ চেক আর সাতটা চেক — সব পাস হয়েছে। পরে চাইলে "প্রকাশ বন্ধ" করা যায়, মুছে যায় না।</div>'+
    '<div class="zs-actions mt12"><button type="button" class="btn btn-primary" data-act="zb-p-pubok" data-id="'+esc(id)+'" data-testid="zb-pubok">'+ico('check',15)+'হ্যাঁ, প্রকাশ করুন</button><button type="button" class="btn btn-ghost" data-act="close-modal">না, এখন না</button></div>', {title:'প্রকাশ করবেন?'});
};
ACT['zb-p-pubok'] = function(el){
  var all = zb_posts(), p = zb_mut(el.getAttribute('data-id'), function(p){
    if(!zb_canPublish(p, all)) return zb_toastErr('সব চেক আর দুই ধাপের পাস ছাড়া প্রকাশ হবে না');
    p.status = 'published'; if(p.pipe) p.pipe = 'published'; p.at = Date.now(); p.sched = '';
  });
  closeModal(); if(p){ rerender(); toast('প্রকাশ হলো — দোকানের জার্নালে এখনই দেখা যাচ্ছে'); }
};
ACT['zb-p-unpub'] = function(el){
  var p = zb_mut(el.getAttribute('data-id'), function(p){ p.status = 'draft'; p.sched = ''; if(p.pipe) p.pipe = p.passedBy && p.finalBy ? 'ready' : 'proof'; });
  if(p){ rerender(); toast('প্রকাশ বন্ধ — মুছে যায়নি, "প্রকাশের জন্য তৈরি"-তে আছে'); }
};
ACT['zb-p-demo'] = function(){ var u = ui('zb-pipe', {demo:true}); u.demo = !zb_demoOn(); rerender(); toast(u.demo ? 'ডেমো নিয়ন্ত্রণ চালু — এজেন্টের ধাপ নিজে চালাতে পারবেন' : 'ডেমো নিয়ন্ত্রণ বন্ধ — আসল দোকানে যেমন দেখাবে'); };
ACT['zb-p-back'] = function(el){
  var id = el.getAttribute('data-id');
  openModal('<div class="zs-bnp">লেখককে কী ঠিক করতে হবে লিখুন — লেখাটা "লেখা হচ্ছে" কলামে ফিরে যাবে।</div><textarea id="zb-back-t" class="input mt12" rows="3" placeholder="যেমন: দামের তথ্যের সূত্র দাও"></textarea><div class="zs-actions mt12"><button type="button" class="btn btn-primary" data-act="zb-p-back2" data-id="'+esc(id)+'">ফেরত পাঠান</button></div>', {title:'ফেরত পাঠান'});
};
ACT['zb-p-back2'] = function(el){
  var t = (document.getElementById('zb-back-t')||{}).value || '', c = zb_cfg();
  if(!t.trim()){ toast('কারণটা লিখুন'); return; }
  var p = zb_mut(el.getAttribute('data-id'), function(p){ var by = p.pipe==='final' ? c.head : (p.proofer || 'owner'); p.pipe = 'writing'; p.passedBy = ''; p.finalBy = ''; p.comments = (p.comments||[]).concat({by:by, t:t.trim(), at:Date.now()}); });
  closeModal(); if(p){ rerender(); toast('লেখকের কাছে ফেরত গেল'); }
};
function zb_cmHTML(p){
  var cm = p.comments||[];
  return '<div class="zb-cms">'+(cm.length ? cm.map(function(x){ return '<div class="zb-cmi">'+zb_avatar(x.by)+'<div style="min-width:0"><div class="small bold">'+esc(zb_name(x.by))+' <span class="zs-mini">'+esc(zs_time(x.at))+'</span></div><div class="small za-bn">'+esc(x.t)+'</div></div></div>'; }).join('') : '<div class="zs-mini za-bn">এখনো কোনো মন্তব্য নেই।</div>')+'</div>'+
    '<textarea id="zb-cm-t" class="input mt12" rows="2" placeholder="আপনার মন্তব্য…"></textarea><div class="zs-actions mt8"><button type="button" class="btn btn-primary" data-act="zb-p-cmsend" data-id="'+esc(p.id)+'">পাঠান</button></div>';
}
ACT['zb-p-cm'] = function(el){ var p = zb_get(el.getAttribute('data-id')); if(!p) return; openModal(zb_cmHTML(p), {title:'মন্তব্য · '+p.title}); };
ACT['zb-p-cmsend'] = function(el){
  var t = (document.getElementById('zb-cm-t')||{}).value || ''; if(!t.trim()){ toast('কিছু লিখুন'); return; }
  var p = zb_mut(el.getAttribute('data-id'), function(p){ p.comments = (p.comments||[]).concat({by:'owner', t:t.trim(), at:Date.now()}); });
  if(p){ openModal(zb_cmHTML(p), {title:'মন্তব্য · '+p.title}); rerender(); }
};

/* ---------- schedule (PR 591) ---------- */
function zb_schedTab(all){
  var c = zb_cfg(), sl = zb_slots(c), tom = zb_dayPosts(1, all).length + zb_pubDay(1, all).length, rd = zb_ready(all).length;
  var slotWarn = sl.length < c.perDay.target ? '<div class="zs-note warn mt12">'+ico('info',15)+'<div class="za-bn">প্রকাশের সময় '+zb_bn(sl.length)+'টা, কিন্তু লক্ষ্য দিনে '+zb_bn(c.perDay.target)+'টা — আরো সময় যোগ করুন।</div></div>' : '';
  var num = function(k, lab, sub){ return '<div class="zp-f"><label class="label" for="zb-n-'+k+'">'+lab+'</label><input id="zb-n-'+k+'" class="input zs-in" type="number" min="1" max="24" inputmode="numeric" value="'+c.perDay[k]+'" data-change="zb-s-num" data-k="'+k+'" data-testid="zb-n-'+k+'"></div>'; };
  return '<div class="zs-kpis k4">'+
      '<div class="zs-k '+(tom>=c.perDay.min?'ok':'warn')+'"><div class="v">'+tom+' / '+c.perDay.min+'</div><div class="l">কালকের জন্য</div><div class="s">কমপক্ষে '+zb_bn(c.perDay.min)+'</div></div>'+
      '<div class="zs-k"><div class="v">'+rd+'</div><div class="l">প্রকাশের জন্য তৈরি</div><div class="s">সময়ের অপেক্ষায়</div></div>'+
      '<div class="zs-k"><div class="v">'+sl.length+'</div><div class="l">প্রতিদিন প্রকাশের সময়</div><div class="s">'+esc(sl.join(' · ') || '—')+'</div></div>'+
      '<div class="zs-k"><div class="v">'+zb_free(all, c).length+'</div><div class="l">খালি সময়</div><div class="s">সামনের '+zb_bn(c.daysAhead)+' দিন</div></div></div>'+
    '<div class="zs-g2">'+
      '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">দিনে কয়টা লেখা</h2></div><div class="zs-sub za-bn">কমপক্ষে, লক্ষ্য আর সর্বোচ্চ — আপনি বদলাতে পারবেন। সংখ্যার চেয়ে মান জরুরি; চেক পাস না করলে সংখ্যা পূরণের জন্য কিছু প্রকাশ হবে না।</div>'+
        '<div class="zb-n3">'+num('min','কমপক্ষে','')+num('target','লক্ষ্য','')+num('max','সর্বোচ্চ','')+'</div>'+
        '<h3 class="h3 mt16 za-bn" style="font-size:14px">প্রকাশের সময়</h3><div class="zs-sub za-bn">সারাদিনে ছড়িয়ে — বাংলাদেশ সময়।</div>'+
        '<div class="zb-slots">'+sl.map(function(h, i){ return '<div class="zb-slot"><input class="input zs-in" type="time" value="'+esc(h)+'" data-change="zb-s-slot" data-i="'+i+'" aria-label="সময় '+(i+1)+'"><button type="button" class="iconbtn" data-act="zb-s-slotdel" data-i="'+i+'" aria-label="সময় বাদ দিন '+esc(h)+'">'+ico('close',15)+'</button></div>'; }).join('')+'</div>'+
        '<div class="zs-actions mt12"><button type="button" class="btn btn-sm btn-secondary" data-act="zb-s-slotadd">'+ico('plus',14)+'সময় যোগ</button><button type="button" class="btn btn-sm btn-ghost" data-act="zb-s-reset">আগের মতো করুন</button></div>'+slotWarn+'</section>'+
      '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">সামনের দিনগুলো</h2><button type="button" class="btn btn-sm btn-primary" data-act="zb-s-fill" data-testid="zb-s-fill">'+ico('swap',14)+'তৈরি লেখা খালি সময়ে বসান</button></div><div class="zs-sub za-bn">প্রকাশের জন্য তৈরি লেখাগুলো গুরুত্ব অনুযায়ী খালি সময়ে বসে, দিনে লক্ষ্যের বেশি না। এটা ঐচ্ছিক — না চাপলেও এজেন্টরা নিজে বসায়।</div>'+
        [0,1,2].map(function(off){ return zb_dayHTML(off, all, c); }).join('')+'</section></div>';
}
function zb_dayHTML(off, all, c){
  var posts = zb_dayPosts(off, all).concat(zb_pubDay(off, all)).sort(function(a,b){ return a.at-b.at; }), sl = zb_slots(c), now = Date.now(), rows = [];
  var taken = {}; posts.forEach(function(p){ taken[zb_hm(p.at)] = 1; rows.push([p.at, p]); });
  sl.forEach(function(h){ if(!taken[h]) rows.push([zb_slotTs(off, h), null]); });
  rows.sort(function(a,b){ return a[0]-b[0]; });
  var n = posts.length, low = off>0 && n < c.perDay.min;
  return '<div class="zb-day"><div class="row between" style="gap:8px"><b class="za-bn">'+esc(zb_dayName(off))+'</b><span class="zo-pill '+(low?'warn':n>=c.perDay.target?'ok':'')+'">'+n+' / '+c.perDay.target+(low?' · কম':'')+'</span></div>'+
    rows.map(function(r){ var p = r[1]; return '<div class="zb-dr'+(p?'':' free')+'"><span class="mono">'+zb_hm(r[0])+'</span>'+(p ? '<a class="zb-dt'+(p.lang==='bn'?' za-bn':'')+'" href="#/admin/blog/'+p.id+'">'+esc(p.title)+'</a><span class="zo-pill '+(p.status==='published'?'ok':'info')+'">'+(p.status==='published'?'প্রকাশিত':'সময় দেওয়া')+'</span>' : '<span class="zs-mini za-bn">'+(r[0]<now ? 'পার হয়ে গেছে' : 'খালি')+'</span>')+'</div>'; }).join('')+'</div>';
}
CHANGE['zb-s-num'] = function(el){
  var c = zb_cfg(), pd = Object.assign({}, c.perDay), k = el.getAttribute('data-k'), v = Math.max(1, Math.min(24, zo_int(el.value)));
  pd[k] = v;
  if(pd.min>pd.target){ if(k==='min') pd.target = pd.min; else pd.min = pd.target; }
  if(pd.target>pd.max){ if(k==='max') pd.target = pd.max; else pd.max = pd.target; }
  if(pd.min>pd.target) pd.min = pd.target;
  zb_setCfg('perDay', pd); rerender(); toast('কমপক্ষে '+zb_bn(pd.min)+' · লক্ষ্য '+zb_bn(pd.target)+' · সর্বোচ্চ '+zb_bn(pd.max));
};
CHANGE['zb-s-slot'] = function(el){ var sl = zb_slots(), i = +el.getAttribute('data-i'); if(!/^\d{1,2}:\d{2}$/.test(el.value)) return; sl[i] = el.value; sl = sl.filter(function(x, j){ return sl.indexOf(x)===j; }).sort(); zb_setCfg('slots', sl); rerender(); };
ACT['zb-s-slotdel'] = function(el){ var sl = zb_slots(); if(sl.length<=1){ toast('অন্তত একটা প্রকাশের সময় লাগবে'); return; } sl.splice(+el.getAttribute('data-i'), 1); zb_setCfg('slots', sl); rerender(); };
ACT['zb-s-slotadd'] = function(){ var sl = zb_slots(), last = sl.length ? sl[sl.length-1].split(':') : ['8','00'], h = Math.min(23, (+last[0]||8)+2), v = zb_pad(h)+':'+last[1]; if(sl.indexOf(v)>=0) v = zb_pad(Math.max(0, h-1))+':30'; if(sl.indexOf(v)<0) sl.push(v); zb_setCfg('slots', sl.sort()); rerender(); };
ACT['zb-s-reset'] = function(){ var s = zb_st(); delete s.cfg.slots; delete s.cfg.perDay; zb_commit(); rerender(); toast('সময় আর সংখ্যা আগের মতো'); };
ACT['zb-s-fill'] = function(){ var r = zb_fill(); rerender(); toast(r.done ? zb_bn(r.done)+'টা লেখা খালি সময়ে বসল'+(r.skipped ? ', '+zb_bn(r.skipped)+'টা চেক পাস না করায় বাদ' : '') : (zb_ready().length ? 'খালি সময় নেই' : 'প্রকাশের জন্য তৈরি কোনো লেখা নেই')); };

/* ---------- results (simulated) + monthly refresh / merge / prune ---------- */
function zb_resultsTab(all){
  var c = zb_cfg(), r = c.review, pub = all.filter(function(p){ return p.status==='published'; });
  var rows = pub.map(function(p){ return [p, zb_nums(p)]; }).sort(function(a,b){ return b[1].visits-a[1].visits; });
  var tot = rows.reduce(function(a, x){ return [a[0]+x[1].visits, a[1]+x[1].sales]; }, [0,0]);
  var refresh = rows.filter(function(x){ return x[1].trend<=r.refreshDrop || (x[1].pos>=r.posFrom && x[1].pos<=r.posTo && x[1].age>=14); });
  var prune = rows.filter(function(x){ return x[1].visits<r.pruneVisits && x[1].age>=r.pruneAgeDays; });
  var merge = []; pub.forEach(function(a, i){ pub.slice(i+1).forEach(function(b){ var s = Math.max(zb_jac(zb_tok(a.title), zb_tok(b.title)), a.kw && b.kw ? zb_jac(zb_tok(a.kw), zb_tok(b.kw)) : 0); if(s>=r.mergeScore) merge.push([a, b, s]); }); });
  var li = function(kind, title, sub, key){ return '<div class="zs-li"><div style="min-width:0"><div class="t'+(/[ঀ-৿]/.test(title)?' za-bn':'')+'">'+esc(title)+'</div><div class="m za-bn">'+sub+'</div></div><div class="r"><button type="button" class="btn btn-sm btn-ghost" data-act="zb-r-topic" data-kind="'+kind+'" data-t="'+esc(key)+'">টপিক তালিকায় দিন</button></div></div>'; };
  return '<div class="zs-kpis k4">'+
      '<div class="zs-k"><div class="v">'+tot[0].toLocaleString('en-US')+'</div><div class="l">ভিজিট · ৩০ দিন</div><div class="s">সব লেখা মিলে · আনুমানিক</div></div>'+
      '<div class="zs-k ok"><div class="v">'+tot[1]+'</div><div class="l">বিক্রিতে সাহায্য</div><div class="s">লেখা পড়ে কেনা</div></div>'+
      '<div class="zs-k"><div class="v">'+pub.length+'</div><div class="l">লাইভ লেখা</div><div class="s">জার্নালে</div></div>'+
      '<div class="zs-k '+(refresh.length+prune.length+merge.length?'warn':'ok')+'"><div class="v">'+(refresh.length+prune.length+merge.length)+'</div><div class="l">এ মাসের কাজ</div><div class="s">আপডেট · জোড়া · ছাঁটাই</div></div></div>'+
    '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">প্রতিটা লেখার ফল</h2>'+zs_simTag('ডেমো · আনুমানিক')+'</div><div class="zs-sub za-bn">গুগল থেকে ভিজিট, যে সার্চে সবচেয়ে বেশি আসে, আর লেখা পড়ে কতজন কিনেছে</div>'+
      '<div class="zo-tw mt8"><table class="zo-tbl"><thead><tr><th>লেখা</th><th>ভিজিট</th><th>বদল</th><th>গড় অবস্থান</th><th>বিক্রিতে সাহায্য</th><th>টপ সার্চ</th></tr></thead><tbody>'+
      rows.map(function(x){ var p = x[0], n = x[1]; return '<tr><td><a class="link'+(p.lang==='bn'?' za-bn':'')+'" href="#/admin/blog/'+p.id+'">'+esc(p.title)+'</a></td><td>'+n.visits+'</td><td class="'+(n.trend<0?'bad':'ok')+'">'+(n.trend>0?'+':'')+n.trend+'%</td><td>'+n.pos+'</td><td>'+n.sales+'</td><td style="text-align:left">'+esc(n.q)+'</td></tr>'; }).join('')+'</tbody></table></div></section>'+
    '<section class="zs-card zo-mt"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">মাসিক তালিকা — আপডেট, জোড়া, ছাঁটাই</h2>'+zs_simTag('ডেমো')+'</div><div class="zs-sub za-bn">দূত প্রতি মাসে দেখে। কিছুই মুছে যায় না — ছাঁটাই মানে উন্নত করা বা গুগল থেকে সরানো (noindex)।</div>'+
      '<div class="zb-rv"><div><h3 class="h3 za-bn">আপডেট করুন <span class="zo-cnt">'+refresh.length+'</span></h3><div class="zs-list">'+(refresh.map(function(x){ return li('refresh', x[0].title, 'ভিজিট '+(x[1].trend>0?'+':'')+x[1].trend+'% · অবস্থান '+x[1].pos+' — একটু উন্নত করলে প্রথম পাতায় আসতে পারে', x[0].title); }).join('') || '<div class="zs-mini za-bn">এ মাসে কিছু নেই।</div>')+'</div></div>'+
        '<div><h3 class="h3 za-bn">জোড়া লাগান <span class="zo-cnt">'+merge.length+'</span></h3><div class="zs-list">'+(merge.map(function(m){ return li('merge', m[0].title+' + '+m[1].title, 'মিল '+zb_pct(m[2])+' — দুটো লেখা একই সার্চের জন্য লড়ছে', m[0].title+' + '+m[1].title); }).join('') || '<div class="zs-mini za-bn">এ মাসে কিছু নেই।</div>')+'</div></div>'+
        '<div><h3 class="h3 za-bn">ছাঁটাই ভাবুন <span class="zo-cnt">'+prune.length+'</span></h3><div class="zs-list">'+(prune.map(function(x){ return li('prune', x[0].title, zb_bn(x[1].age)+' দিনে মাত্র '+zb_bn(x[1].visits)+' ভিজিট — উন্নত করুন, নইলে noindex', x[0].title); }).join('') || '<div class="zs-mini za-bn">এ মাসে কিছু নেই।</div>')+'</div></div></div></section>';
}
ACT['zb-r-topic'] = function(el){
  var kind = el.getAttribute('data-kind'), t = el.getAttribute('data-t'), pre = {refresh:'Refresh: ', merge:'Merge: ', prune:'Improve or noindex: '}[kind] || '';
  var s = zb_st(); if(s.mine.some(function(x){ return x.t===pre+t; })){ toast('আগেই তালিকায় আছে'); return; }
  var src = zb_posts().filter(function(p){ return p.title===t.split(' + ')[0]; })[0], pil = src ? zb_pillarOf(src) : (zb_pillars()[0]||{}).id;
  s.mine.push({id:'r-'+uid(), t:pre+t, q:src ? (src.kw||'') : '', pillar:pil, link:src && src.product ? 'prod:'+src.product : '', by:zb_cfg().head, st:'proposed', pri:kind==='refresh'?1:2, lang:'en', kind:kind, at:Date.now(), writer:zb_authorFor(pil)});
  zb_commit(); rerender(); toast('টপিক তালিকায় গেল — আপনার হ্যাঁ লাগবে');
};

/* ---------- author team (PR 593) ---------- */
function zb_aStats(id, all){
  var c = zb_cfg(), a = zb_author(id), m = (a && a.models) || c.models;
  var writes = all.filter(function(p){ return p.pipe && p.writer===id; }), proofs = all.filter(function(p){ return p.pipe && p.passedBy===id; }), finals = all.filter(function(p){ return p.pipe && p.finalBy===id; });
  var jobs = writes.length + proofs.length + finals.length;
  var cost = writes.length*zb_rate(m.write, 'write') + proofs.length*zb_rate(m.proof, 'proof') + finals.length*zb_rate(m.seo, 'seo');
  return {writes:writes, proofs:proofs, finals:finals, jobs:jobs, cost:Math.round(cost), ontime:jobs ? 78 + zo_rnd('ot'+id, 0, 22) : null};
}
function zb_authorsTab(all, sel){
  var c = zb_cfg(), bl = zb_byline(), head = zb_aStats(c.head, all), au = zb_authors();
  if(sel && zb_author(sel)) return zb_authorPage(sel, all);
  var tot = au.reduce(function(s, a){ return s + zb_aStats(a.id, all).cost; }, 0) + head.cost;
  return '<div class="zs-note mb16">'+ico('info',16)+'<div class="zs-bnp"><b>বসে থাকা লেখকের খরচ ৳০।</b> খরচ হয় শুধু কাজ চললে — লেখা × দৈর্ঘ্য × মডেল। লেখকের সংখ্যা দেখে গুগল র‍্যাংক করে না; আসল জ্ঞান আর সৎ বাইলাইন জরুরি। তাই কোনো বানানো মানুষ বা নকল ছবি নেই — অক্ষরের অ্যাভাটার।</div></div>'+
    '<div class="zs-kpis k4"><div class="zs-k"><div class="v">'+(au.length+1)+'</div><div class="l">দলে</div><div class="s">দূত + '+zb_bn(au.length)+' লেখক</div></div>'+
      '<div class="zs-k"><div class="v">'+au.reduce(function(s, a){ return s + zb_aStats(a.id, all).writes.length; }, 0)+'</div><div class="l">লেখা চলছে/হয়েছে</div><div class="s">লেখক দলের</div></div>'+
      '<div class="zs-k"><div class="v">'+fmt(tot)+'</div><div class="l">মোট খরচ</div><div class="s">যা কাজ চলেছে · আনুমানিক</div></div>'+
      '<div class="zs-k"><div class="v">'+au.filter(function(a){ return !zb_aStats(a.id, all).jobs; }).length+'</div><div class="l">বসে আছে</div><div class="s">খরচ ৳০</div></div></div>'+
    '<section class="zs-card zb-org" data-testid="zb-org"><h2 class="za-bn">লেখক দল</h2><div class="zs-sub za-bn">দূত কনটেন্টের প্রধান — শেষ SEO চেক করে। নিচে পাঁচ লেখক, প্রতিটা বিভাগের একজন। একজন লেখে, আরেকজন প্রুফ করে।</div>'+
      '<div class="zb-orghead">'+zb_avatar(c.head, 'zb-av lg')+'<div style="min-width:0"><div class="bold za-bn" title="এজেন্ট কোড: '+esc(zb_codeTip(c.head))+'">'+esc(zb_name(c.head))+'</div><div class="zs-mini za-bn">কনটেন্টের প্রধান · শেষ চেক '+zb_bn(head.finals.length)+'টা · খরচ '+fmt(head.cost)+'</div></div>'+(typeof zs_agent==='function' && zs_agent(c.head) ? '<a class="btn btn-sm btn-ghost" href="#/admin/agents/'+c.head+'">প্রোফাইল</a>' : '')+'</div>'+
      '<div class="zb-orgline" aria-hidden="true"></div>'+
      '<div class="zb-agrid">'+au.map(function(a){ var s = zb_aStats(a.id, all);
        return '<div class="zb-acard" data-testid="zb-acard"><div class="row" style="gap:10px;min-width:0">'+zb_avatar(a.id, 'zb-av lg')+'<div style="min-width:0"><div class="bold za-bn" title="এজেন্ট কোড: '+esc(a.code)+'">'+esc(a.bn)+' · '+esc(a.name)+'</div><div class="zs-mini"><span class="za-bn">'+esc((a.pillars||[a.pillar]).map(zb_pname).join(', '))+'</span></div></div></div>'+
          '<div class="zb-astats za-bn"><span><b>'+s.writes.length+'</b> লেখা</span><span><b>'+s.proofs.length+'</b> প্রুফ</span><span><b>'+(s.ontime==null?'—':s.ontime+'%')+'</b> সময়মতো</span><span><b>'+fmt(s.cost)+'</b> খরচ</span></div>'+
          '<div class="zs-actions"><a class="btn btn-sm btn-secondary" href="#/admin/blog?tab=authors&a='+a.id+'">'+ico('user',13)+'প্রোফাইল</a></div></div>'; }).join('')+'</div></section>'+
    '<section class="zs-card zo-mt"><h2 class="za-bn">বাইলাইন — সৎভাবে</h2><div class="zs-sub za-bn">প্রতিটা লেখা আর লেখকের পেজে এটা দেখায়। আপনার টিমের আসল কেউ যাচাই করলে নাম দিন — খালি থাকলে লাইনটা দেখাবে না।</div>'+
      '<div class="zp-f"><label class="label za-bn" for="zb-bl-n">বাংলা পেজে</label><input id="zb-bl-n" class="input zs-in za-bn" type="text" value="'+esc(bl.note)+'" data-change="zb-bl" data-k="note"></div>'+
      '<div class="zp-f"><label class="label za-bn" for="zb-bl-e">ইংরেজি পেজে</label><input id="zb-bl-e" class="input zs-in" type="text" value="'+esc(bl.noteEn)+'" data-change="zb-bl" data-k="noteEn"></div>'+
      '<div class="zp-f"><label class="label za-bn" for="zb-bl-r">যাচাই করেছেন (আসল মানুষের নাম, ঐচ্ছিক)</label><input id="zb-bl-r" class="input zs-in" type="text" value="'+esc(bl.reviewedBy)+'" data-change="zb-bl" data-k="reviewedBy" placeholder="যেমন: আপনার নাম — কাপড় আর ফিটে বায়িং হাউসের অভিজ্ঞতা"></div></section>';
}
function zb_authorPage(id, all){
  var a = zb_author(id), s = zb_aStats(id, all), c = zb_cfg(), m = a.models || c.models, M = zb_models();
  var sel = function(job, lab){ return '<div class="zp-f"><label class="label za-bn" for="zb-am-'+job+'">'+lab+' <span class="zs-mini">'+fmt(zb_rate(m[job], job))+' / কাজ</span></label><select id="zb-am-'+job+'" class="input zs-in" data-change="zb-a-model" data-id="'+id+'" data-k="'+job+'">'+M.map(function(x){ return '<option'+(x.m===m[job]?' selected':'')+'>'+esc(x.m)+'</option>'; }).join('')+'</select></div>'; };
  var pl = function(list, empty){ return list.length ? '<div class="zs-list">'+list.map(function(p){ return '<div class="zs-li"><div style="min-width:0"><a class="t link'+(p.lang==='bn'?' za-bn':'')+'" href="#/admin/blog/'+p.id+'">'+esc(p.title)+'</a><div class="m za-bn">'+esc(ZB_SG[zb_stage(p)] || (zb_stage(p)==='scheduled'?'সময় দেওয়া':'প্রকাশিত'))+'</div></div></div>'; }).join('')+'</div>' : '<div class="zs-mini za-bn">'+empty+'</div>'; };
  var seedBn = zb_bioBnSeed(id, a.pillars || [a.pillar]);
  return '<a class="link xs za-bn zb-back" href="#/admin/blog?tab=authors">'+ico('back',13)+' লেখক দল</a>'+
    '<section class="zs-card mt12"><div class="zb-ahero">'+zb_avatar(id, 'zb-av xl')+'<div style="min-width:0;flex:1 1 220px"><div class="row wrap" style="gap:8px"><h2 class="za-bn" title="এজেন্ট কোড: '+esc(a.code)+'">'+esc(a.bn)+' · '+esc(a.name)+'</h2></div><div class="zs-mini za-bn">'+esc(zb_short(c.head))+'-এর দলে · '+esc((a.pillars||[a.pillar]).map(zb_pname).join(', '))+'</div></div>'+
      '<div class="zb-astats za-bn"><span><b>'+s.writes.length+'</b> লেখা</span><span><b>'+s.proofs.length+'</b> প্রুফ</span><span><b>'+(s.ontime==null?'—':s.ontime+'%')+'</b> সময়মতো</span><span><b>'+fmt(s.cost)+'</b> খরচ · আনুমানিক</span></div></div></section>'+
    '<div class="zs-g2 zo-mt">'+
      '<section class="zs-card" data-testid="zb-a-profile"><h2 class="za-bn">প্রোফাইল (এডিট করা যায়)</h2><div class="zs-sub za-bn">দোকানে লেখার বাইলাইনে আর লেখকের পেজে দেখায়। ঘরের বাইরে চাপলেই সেভ হয়। নকল মানুষের ছবি দেবেন না — লোগো বা আঁকা ছবি চলবে।</div>'+
        '<div class="za-f2"><div class="zp-f"><label class="label za-bn" for="zb-a-bn">নাম (বাংলা)</label><input id="zb-a-bn" class="input zs-in za-bn" type="text" value="'+esc(a.bn)+'" data-change="zb-a-f" data-id="'+id+'" data-k="bn"></div><div class="zp-f"><label class="label za-bn" for="zb-a-nm">নাম (ইংরেজি)</label><input id="zb-a-nm" class="input zs-in" type="text" value="'+esc(a.name)+'" data-change="zb-a-f" data-id="'+id+'" data-k="name"></div></div>'+
        '<div class="zp-f"><label class="label za-bn" for="zb-a-biobn">পরিচয় (বাংলা) <span class="zs-mini">বাংলা পেজে দেখায়</span></label><textarea id="zb-a-biobn" class="input zs-in zp-ta za-bn" rows="4" data-change="zb-a-f" data-id="'+id+'" data-k="bioBn" data-testid="zb-a-biobn">'+esc(a.bioBn!=null ? a.bioBn : seedBn)+'</textarea></div>'+
        '<div class="zp-f"><label class="label za-bn" for="zb-a-bio">পরিচয় (ইংরেজি) <span class="zs-mini">ইংরেজি পেজে দেখায়</span></label><textarea id="zb-a-bio" class="input zs-in zp-ta" rows="4" data-change="zb-a-f" data-id="'+id+'" data-k="bio">'+esc(a.bio)+'</textarea>'+
          '<div class="zs-mini za-bn mt8">একটা বদলালে অন্যটাও মিলিয়ে নিন — দুই ভাষার পাঠক আলাদা লেখা পড়ে।</div></div>'+
        '<div class="zp-f"><label class="label za-bn" for="zb-a-rv">এই লেখকের লেখা যাচাই করেন (আসল মানুষ, ঐচ্ছিক)</label><input id="zb-a-rv" class="input zs-in" type="text" value="'+esc(a.reviewer||'')+'" data-change="zb-a-f" data-id="'+id+'" data-k="reviewer" placeholder="খালি থাকলে দোকানের সাধারণ লাইন দেখায়"></div>'+
        '<div class="zp-f"><span class="label za-bn">ছবি / অ্যাভাটার</span><div class="row wrap" style="gap:8px;align-items:center">'+zb_avatar(id, 'zb-av lg')+'<label class="btn btn-sm btn-secondary zb-file">'+ico('plus',13)+'ছবি দিন<input type="file" accept="image/*" data-change="zb-a-photo" data-id="'+id+'" aria-label="ছবি দিন"></label>'+(a.photo ? '<button type="button" class="btn btn-sm btn-ghost" data-act="zb-a-nophoto" data-id="'+id+'">অক্ষরে ফিরুন</button>' : '')+'<label class="zb-colw"><input class="zb-col" type="color" value="'+esc(a.col)+'" data-change="zb-a-f" data-id="'+id+'" data-k="col" aria-label="অ্যাভাটারের রং"><span class="zs-mini za-bn">রং</span></label></div></div></section>'+
      '<section class="zs-card"><h2 class="za-bn">কোন কাজে কোন মডেল</h2><div class="zs-sub za-bn">খরচ শুধু কাজ চললে। মডেল বদলালে পরের কাজ থেকে নতুন রেট।</div>'+sel('write','লেখা')+sel('proof','প্রুফ')+sel('seo','SEO সাহায্য')+'</section></div>'+
    '<div class="zs-g2 zo-mt"><section class="zs-card"><h2 class="za-bn">লিখেছে</h2>'+pl(s.writes, 'এখনো কিছু লেখেনি — খরচ ৳০।')+'</section><section class="zs-card"><h2 class="za-bn">প্রুফ করেছে</h2>'+pl(s.proofs, 'এখনো কিছু প্রুফ করেনি।')+'</section></div>';
}
CHANGE['zb-bl'] = function(el){ zb_byline()[el.getAttribute('data-k')] = el.value.trim(); zb_commit(); toast('বাইলাইন সেভ হলো'); };
CHANGE['zb-a-f'] = function(el){ var a = zb_author(el.getAttribute('data-id')), k = el.getAttribute('data-k'); if(!a) return; var v = el.value.trim(); if((k==='bn' || k==='name') && !v){ toast('নাম খালি রাখা যাবে না'); rerender(); return; } a[k] = v; zb_commit(); rerender(); toast(k==='bioBn' ? 'বাংলা পরিচয় সেভ হলো — বাংলা পেজে দেখাবে' : k==='bio' ? 'ইংরেজি পরিচয় সেভ হলো — ইংরেজি পেজে দেখাবে' : 'সেভ হলো'); };
CHANGE['zb-a-model'] = function(el){ var a = zb_author(el.getAttribute('data-id')); if(!a) return; a.models = Object.assign({}, zb_cfg().models, a.models||{}); a.models[el.getAttribute('data-k')] = el.value; zb_commit(); rerender(); toast('মডেল বদলানো হলো: '+el.value); };
CHANGE['zb-a-photo'] = function(el){
  var a = zb_author(el.getAttribute('data-id')), f = el.files && el.files[0]; if(!a || !f) return;
  var rd = new FileReader(); rd.onload = function(){ var img = new Image(); img.onload = function(){ var cv = document.createElement('canvas'), sz = 160, k = Math.min(sz/img.width, sz/img.height, 1); cv.width = Math.round(img.width*k); cv.height = Math.round(img.height*k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); a.photo = cv.toDataURL('image/jpeg', .85); zb_commit(); rerender(); toast('ছবি সেভ হলো'); }; img.src = rd.result; }; rd.readAsDataURL(f);
};
ACT['zb-a-nophoto'] = function(el){ var a = zb_author(el.getAttribute('data-id')); if(!a) return; a.photo = ''; zb_commit(); rerender(); };

/* ---------- categories (pillars), sub-categories, tags (PR 592) ---------- */
function zb_catsTab(all){
  var pl = zb_pillarsAll(), tags = {}, u = ui('zb-cats', {bn:'', en:''});
  all.forEach(function(p){ (p.tags||[]).forEach(function(t){ tags[t] = (tags[t]||0)+1; }); });
  var tk = Object.keys(tags).sort(function(a,b){ return tags[b]-tags[a] || a.localeCompare(b); });
  return '<div class="zs-note mb16">'+ico('info',16)+'<div class="zs-bnp">প্রতিটা বিভাগের নিজের পেজ আছে দোকানে। নাম বদলালে লিংক বদলায় না। কিছু মুছে যায় না — লুকিয়ে রাখা যায়; লুকানো বিভাগের লেখাগুলো দোকানে থাকে।</div></div>'+
    '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">বিভাগ ও উপ-বিভাগ</h2></div>'+
      pl.map(function(p, i){ var n = all.filter(function(x){ return zb_pillarOf(x)===p.id; }).length;
        return '<div class="zb-pl'+(p.hidden?' off':'')+'" data-testid="zb-pl"><div class="zb-plh"><div class="zb-ord"><button type="button" class="iconbtn" data-act="zb-pl-mv" data-id="'+p.id+'" data-d="-1" aria-label="ওপরে নিন"'+(i===0?' aria-disabled="true"':'')+'>'+ico('back',14,'style="transform:rotate(90deg)"')+'</button><button type="button" class="iconbtn" data-act="zb-pl-mv" data-id="'+p.id+'" data-d="1" aria-label="নিচে নিন"'+(i===pl.length-1?' aria-disabled="true"':'')+'>'+ico('back',14,'style="transform:rotate(-90deg)"')+'</button></div>'+
          '<input class="input zs-in za-bn" type="text" value="'+esc(p.bn)+'" data-change="zb-pl-nm" data-id="'+p.id+'" data-k="bn" aria-label="বাংলা নাম"><input class="input zs-in" type="text" value="'+esc(p.en)+'" data-change="zb-pl-nm" data-id="'+p.id+'" data-k="en" aria-label="ইংরেজি নাম">'+
          '<span class="zs-mini zb-plid za-bn" title="দোকানের লিংক: /journal/topic/'+esc(p.id)+'">'+zb_bn(n)+'টা লেখা</span>'+zs_sw(!p.hidden, 'zb-pl-hide', 'দেখাবে: '+p.bn, 'data-id="'+p.id+'"')+'</div>'+
          '<div class="zb-subs">'+(p.subs||[]).map(function(s, j){ return '<div class="zb-sb'+(s.hidden?' off':'')+'"><div class="zb-ord"><button type="button" class="iconbtn" data-act="zb-sb-mv" data-id="'+p.id+'" data-s="'+s.id+'" data-d="-1" aria-label="ওপরে নিন"'+(j===0?' aria-disabled="true"':'')+'>'+ico('back',13,'style="transform:rotate(90deg)"')+'</button><button type="button" class="iconbtn" data-act="zb-sb-mv" data-id="'+p.id+'" data-s="'+s.id+'" data-d="1" aria-label="নিচে নিন"'+(j===(p.subs.length-1)?' aria-disabled="true"':'')+'>'+ico('back',13,'style="transform:rotate(-90deg)"')+'</button></div>'+
              '<input class="input zs-in za-bn" type="text" value="'+esc(s.bn)+'" data-change="zb-sb-nm" data-id="'+p.id+'" data-s="'+s.id+'" data-k="bn" aria-label="বাংলা নাম"><input class="input zs-in" type="text" value="'+esc(s.en)+'" data-change="zb-sb-nm" data-id="'+p.id+'" data-s="'+s.id+'" data-k="en" aria-label="ইংরেজি নাম">'+zs_sw(!s.hidden, 'zb-sb-hide', 'দেখাবে: '+s.bn, 'data-id="'+p.id+'" data-s="'+s.id+'"')+'</div>'; }).join('')+
            '<div class="zb-sbadd"><input class="input zs-in" type="text" placeholder="নতুন উপ-বিভাগ (ইংরেজিতে)" data-input="zb-sb-new" data-id="'+p.id+'" aria-label="নতুন উপ-বিভাগ"><button type="button" class="btn btn-sm btn-ghost" data-act="zb-sb-add" data-id="'+p.id+'">'+ico('plus',13)+'যোগ</button></div></div></div>'; }).join('')+
      '<div class="zb-pladd"><h3 class="h3 za-bn" style="font-size:14px">নতুন বিভাগ</h3><div class="za-f2"><input class="input zs-in za-bn" type="text" placeholder="বাংলা নাম" value="'+esc(u.bn)+'" data-input="zb-pl-new" data-k="bn" aria-label="বাংলা নাম"><input class="input zs-in" type="text" placeholder="ইংরেজি নাম" value="'+esc(u.en)+'" data-input="zb-pl-new" data-k="en" aria-label="ইংরেজি নাম"></div><div class="zs-actions mt8"><button type="button" class="btn btn-sm btn-secondary" data-act="zb-pl-add">'+ico('plus',13)+'বিভাগ যোগ</button></div></div></section>'+
    '<section class="zs-card zo-mt"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">ট্যাগ</h2><span class="zs-mini">'+tk.length+'</span></div><div class="zs-sub za-bn">এডিটরে প্রতিটা লেখায় ট্যাগ দিন (কমা দিয়ে)। এখানে সব ট্যাগ আর কয়টা লেখায় আছে।</div>'+
      (tk.length ? '<div class="zb-tags">'+tk.map(function(t){ return '<span class="zo-pill'+(/[ঀ-৿]/.test(t)?' za-bn':'')+'">#'+esc(t)+' <b>'+tags[t]+'</b></span>'; }).join('')+'</div>' : '<div class="zs-mini za-bn">এখনো কোনো ট্যাগ নেই।</div>')+'</section>';
}
function zb_plFind(id){ return zb_pillar(id); }
ACT['zb-pl-mv'] = function(el){ var l = zb_pillarsAll(), i = l.indexOf(zb_plFind(el.getAttribute('data-id'))), j = i + (+el.getAttribute('data-d')); if(i<0 || j<0 || j>=l.length) return; var t = l[i]; l[i] = l[j]; l[j] = t; zb_commit(); rerender(); };
CHANGE['zb-pl-nm'] = function(el){ var p = zb_plFind(el.getAttribute('data-id')), v = el.value.trim(); if(!p) return; if(!v){ toast('নাম খালি রাখা যাবে না'); rerender(); return; } p[el.getAttribute('data-k')] = v; zb_commit(); toast('নাম সেভ হলো — লিংক বদলায়নি'); };
ACT['zb-pl-hide'] = function(el){ var p = zb_plFind(el.getAttribute('data-id')); if(!p) return; if(!p.hidden && zb_pillars().length<=1){ toast('অন্তত একটা বিভাগ চালু রাখতে হবে'); return; } p.hidden = !p.hidden; zb_commit(); rerender(); var nP = zb_posts().filter(function(x){ return zb_pillarOf(x)===p.id && x.status==='published'; }).length; toast(p.hidden ? 'লুকানো হলো — মুছে যায়নি'+(nP ? '। এর '+zb_bn(nP)+'টা লেখা দোকানে থাকবে, বিভাগের জায়গায় “Journal” দেখাবে' : '') : 'আবার দেখাচ্ছে'); };
function zb_sbFind(el){ var p = zb_plFind(el.getAttribute('data-id')); return p ? [p, (p.subs||[]).filter(function(s){ return s.id===el.getAttribute('data-s'); })[0]] : [null, null]; }
ACT['zb-sb-mv'] = function(el){ var r = zb_sbFind(el); if(!r[1]) return; var l = r[0].subs, i = l.indexOf(r[1]), j = i + (+el.getAttribute('data-d')); if(j<0 || j>=l.length) return; l[i] = l[j]; l[j] = r[1]; zb_commit(); rerender(); };
CHANGE['zb-sb-nm'] = function(el){ var r = zb_sbFind(el), v = el.value.trim(); if(!r[1]) return; if(!v){ toast('নাম খালি রাখা যাবে না'); rerender(); return; } r[1][el.getAttribute('data-k')] = v; zb_commit(); toast('সেভ হলো'); };
ACT['zb-sb-hide'] = function(el){ var r = zb_sbFind(el); if(!r[1]) return; r[1].hidden = !r[1].hidden; zb_commit(); rerender(); };
INPUT['zb-sb-new'] = function(el){ ui('zb-sbnew', {})[el.getAttribute('data-id')] = el.value; };
ACT['zb-sb-add'] = function(el){ var id = el.getAttribute('data-id'), p = zb_plFind(id), v = String(ui('zb-sbnew', {})[id]||'').trim(); if(!p) return; if(!v){ toast('নামটা লিখুন'); return; } var sid = zo_slug(v) || 'sub-'+uid(); if((p.subs||[]).some(function(s){ return s.id===sid; })){ toast('এই নামে আগেই আছে'); return; } p.subs = (p.subs||[]).concat({id:sid, bn:v, en:v, hidden:false}); ui('zb-sbnew', {})[id] = ''; zb_commit(); rerender(); toast('উপ-বিভাগ যোগ হলো'); };
INPUT['zb-pl-new'] = function(el){ ui('zb-cats', {})[el.getAttribute('data-k')] = el.value; };
ACT['zb-pl-add'] = function(){ var u = ui('zb-cats', {}), en = String(u.en||'').trim(), bn = String(u.bn||'').trim() || en; if(!en){ toast('ইংরেজি নামটা লিখুন — লিংক এটা থেকে হবে'); return; } var id = zo_slug(en); if(!id || zb_pillar(id)){ toast('এই নামে আগেই বিভাগ আছে'); return; } zb_pillarsAll().push({id:id, bn:bn, en:en, secs:[en], hidden:false, subs:[]}); UI['zb-cats'] = {bn:'', en:''}; zb_commit(); rerender(); toast('বিভাগ যোগ হলো — লেখক দলের কাউকে এর দায়িত্ব দিন'); };

/* ---------- house ad slots (PR 592) ---------- */
function zb_adWhere(a, all){
  var post = (a.slots||[]).some(function(s){ return /^post-/.test(s); });
  if(!post) return 'ব্লগ হোম আর বিভাগ পেজে';
  if(a.posts && a.posts.length) return 'বাছাই করা '+zb_bn(a.posts.length)+'টা লেখায়';
  var n = zb_adReach(a, all).length;
  return a.match==='related' ? 'মিলে যাওয়া '+zb_bn(n)+'টা লেখায়' : (a.pillars && a.pillars.length ? zb_bn(n)+'টা লেখায় (বাছাই করা বিভাগ)' : 'সব লেখায়');
}
function zb_adStatus(a){ return zb_adLive(a) ? '<span class="zo-pill ok za-bn">চালু</span>' : a.active ? '<span class="zo-pill warn za-bn">তারিখের বাইরে</span>' : '<span class="zo-pill za-bn">বন্ধ</span>'; }
function zb_adsTab(all, edit){
  var set = zb_adSet(), ads = zb_ads();
  if(edit) return zb_adEditor(edit, all);
  var live = ads.filter(function(a){ return zb_adLive(a); });
  var rep = ads.map(function(a){ var t = {views:0, clicks:0, atb:0, sales:0}; (a.slots||[]).forEach(function(s){ var n = zb_adNums(a, s); Object.keys(t).forEach(function(k){ t[k] += n[k]; }); }); return [a, t]; });
  return '<div class="zs-note mb16">'+ico('info',16)+'<div class="zs-bnp">শুধু <b>আমাদের নিজেদের</b> ব্যানার, প্রোডাক্ট, কম্বো আর ক্যাটাগরি — বাইরের কোনো বিজ্ঞাপন নেটওয়ার্ক না। প্রতিটা বিজ্ঞাপন শুধু সেই লেখাগুলোয় বসে যার প্রোডাক্ট, বিভাগ বা ট্যাগ মেলে; কিছু না মিললে জায়গাটা দোকানে লুকিয়ে যায়।</div></div>'+
    '<div class="zs-kpis k4"><div class="zs-k ok"><div class="v">'+live.length+'</div><div class="l">চালু বিজ্ঞাপন</div><div class="s">মোট '+zb_bn(ads.length)+'টা</div></div>'+
      '<div class="zs-k"><div class="v">'+rep.reduce(function(s, x){ return s + x[1].clicks; }, 0)+'</div><div class="l">ক্লিক · ৩০ দিন</div><div class="s">আনুমানিক</div></div>'+
      '<div class="zs-k"><div class="v">'+rep.reduce(function(s, x){ return s + x[1].atb; }, 0)+'</div><div class="l">ব্যাগে যোগ</div><div class="s">আনুমানিক</div></div>'+
      '<div class="zs-k"><div class="v">'+rep.reduce(function(s, x){ return s + x[1].sales; }, 0)+'</div><div class="l">বিক্রি</div><div class="s">আনুমানিক</div></div></div>'+
    '<section class="zs-card"><h2 class="za-bn">কোথায় কোন বিজ্ঞাপন — নকশা</h2><div class="zs-sub za-bn">ব্লগের হোম আর একটা লেখার পেজ — প্রতিটা জায়গায় এখন কোন বিজ্ঞাপন বসতে পারে</div>'+zb_slotMap()+'</section>'+
    '<section class="zs-card zo-mt"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">সব বিজ্ঞাপন</h2><a class="btn btn-sm btn-primary" href="#/admin/blog?tab=ads&ad=new" data-testid="zb-ad-new">'+ico('plus',14)+'নতুন বিজ্ঞাপন</a></div>'+
      '<div class="zs-list">'+ads.map(function(a){ var ty = ZB_AD_TYPES.filter(function(t){ return t[0]===a.type; })[0];
        return '<div class="zs-li zb-adrow" data-testid="zb-ad-row"><div style="min-width:0"><div class="t">'+esc(a.title || '(শিরোনাম নেই)')+'</div>'+(a.titleBn ? '<div class="m za-bn">'+esc(a.titleBn)+'</div>' : '')+'<div class="m za-bn zb-adpills"><span class="zo-pill">'+(ty?ty[1]:a.type)+'</span>'+(a.slots||[]).map(function(s){ return '<span class="zo-pill">'+esc(zb_slotName(s))+'</span>'; }).join('')+'</div>'+
          '<div class="m za-bn">কোথায়: '+esc(zb_adWhere(a, all))+' · কতবার দেখাবে '+zb_bn(a.weight||1)+(a.start||a.end ? ' · '+esc(a.start||'…')+' → '+esc(a.end||'…') : '')+'</div></div>'+
          '<div class="r">'+zb_adStatus(a)+zs_sw(a.active, 'zb-ad-on', 'বিজ্ঞাপন চালু: '+a.title, 'data-id="'+a.id+'"')+'<a class="btn btn-sm btn-secondary" href="#/admin/blog?tab=ads&ad='+a.id+'">'+ico('edit',13)+'এডিট</a></div></div>'; }).join('')+'</div></section>'+
    '<div class="zs-g2 zo-mt"><section class="zs-card" data-testid="zb-ad-rules"><h2 class="za-bn">সাধারণ নিয়ম</h2><div class="zs-sub za-bn">দোকানের ব্লগ এই নিয়মগুলো মেনে বিজ্ঞাপন বসায়</div>'+
      ZB_AD_SET_UI.map(function(x){ return '<div class="zb-set"><div class="grow"><label class="small bold za-bn" for="zb-as-'+x[0]+'">'+esc(x[1])+'</label><div class="zs-mini za-bn">'+esc(x[2])+'</div></div><input id="zb-as-'+x[0]+'" class="input zs-in" type="number" inputmode="numeric" min="'+x[3]+'" max="'+x[4]+'" value="'+esc(set[x[0]])+'" data-change="zb-as" data-k="'+x[0]+'" data-testid="zb-as-'+x[0]+'"></div>'; }).join('')+
      '<div class="zb-set"><div class="grow"><div class="small bold za-bn">একই বিজ্ঞাপন একটা পেজে একবারই</div><div class="zs-mini za-bn">চালু থাকলে একই বিজ্ঞাপন দুই জায়গায় বসে না — অন্য কিছু না মিললে জায়গাটা লুকিয়ে যায়।</div></div>'+zs_sw(set.noDuplicate, 'zb-as-dup', 'একই বিজ্ঞাপন একবারই', 'data-testid="zb-as-dup"')+'</div>'+
      '<div class="zb-set"><div class="grow"><div class="small bold za-bn">গুগল থেকে আসা ফোনের ভিজিটরকে ঢুকেই পপআপ দেখাবেন?</div><div class="zs-mini za-bn">বন্ধ রাখুন — গুগল ঢুকেই চোখ ঢেকে দেওয়া পপআপ পছন্দ করে না, র‍্যাংক কমতে পারে।</div></div>'+zs_sw(set.popupOnMobileFromSearch, 'zb-as-mob', 'গুগল থেকে আসা ফোনে পপআপ')+'</div></section>'+
      '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">জায়গা অনুযায়ী ফল</h2>'+zs_simTag('আনুমানিক')+'</div><div class="zo-tw mt8"><table class="zo-tbl"><thead><tr><th>জায়গা</th><th>দেখা</th><th>ক্লিক</th><th>ব্যাগে</th><th>বিক্রি</th></tr></thead><tbody>'+
        ZB_SLOTS.map(function(s){ var t = {views:0, clicks:0, atb:0, sales:0}; ads.forEach(function(a){ if((a.slots||[]).indexOf(s[0])<0) return; var n = zb_adNums(a, s[0]); Object.keys(t).forEach(function(k){ t[k] += n[k]; }); }); return '<tr><td><span class="za-bn">'+esc(s[1])+'</span></td><td>'+t.views+'</td><td>'+t.clicks+'</td><td>'+t.atb+'</td><td>'+t.sales+'</td></tr>'; }).join('')+'</tbody></table></div></section></div>'+
    '<section class="zs-card zo-mt"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">বিজ্ঞাপন অনুযায়ী ফল</h2>'+zs_simTag('ডেমো · আনুমানিক')+'</div><div class="zo-tw mt8"><table class="zo-tbl"><thead><tr><th>বিজ্ঞাপন</th><th>দেখা</th><th>ক্লিক</th><th>ক্লিক রেট</th><th>ব্যাগে</th><th>বিক্রি</th><th>টাকা</th></tr></thead><tbody>'+
      rep.map(function(x){ var a = x[0], t = x[1]; return '<tr><td>'+esc(a.title)+'</td><td>'+t.views+'</td><td>'+t.clicks+'</td><td>'+(t.views ? (t.clicks/t.views*100).toFixed(1) : '0.0')+'%</td><td>'+t.atb+'</td><td>'+t.sales+'</td><td>'+fmt(t.sales*zb_adPrice(a))+'</td></tr>'; }).join('')+'</tbody></table></div></section>';
}
function zb_slotBox(id, cls){
  var ads = zb_ads().filter(function(a){ return zb_adLive(a) && (a.slots||[]).indexOf(id)>=0; });
  return '<div class="zb-sm-slot '+(cls||'')+(ads.length?' has':'')+'" data-slot="'+id+'"><span class="za-bn zb-sm-n">'+esc(zb_slotName(id))+'</span><small>'+(ads.length ? ads.map(function(a){ return esc(a.title); }).join(' · ') : '<span class="za-bn">খালি — দোকানে লুকিয়ে যায়</span>')+'</small></div>';
}
function zb_slotMap(){
  var set = zb_adSet(), cards = function(n){ var h = ''; for(var i=0;i<n;i++) h += '<div class="zb-sm-card"></div>'; return h; };
  return '<div class="zb-sm" data-testid="zb-slotmap">'+
    '<div class="zb-sm-page"><div class="zb-sm-h za-bn">ব্লগ হোম / বিভাগ পেজ</div>'+zb_slotBox('home-top')+zb_slotBox('cat-top')+
      '<div class="zb-sm-grid">'+cards(Math.min(set.gridEvery, 6))+zb_slotBox('home-grid', 'wide')+cards(3)+'</div><div class="zs-mini za-bn">'+zb_bn(set.gridEvery)+'টা কার্ডের পরে একটা বিজ্ঞাপন কার্ড</div></div>'+
    '<div class="zb-sm-page"><div class="zb-sm-h za-bn">একটা লেখার পেজ</div>'+
      '<div class="zb-sm-post"><div class="zb-sm-art"><i></i><i></i>'+(set.postTopAfterSection>0 ? '' : zb_slotBox('post-top'))+'<i></i>'+(set.postTopAfterSection>0 ? zb_slotBox('post-top') : '')+'<i></i>'+zb_slotBox('post-inline')+'<i></i><i></i>'+zb_slotBox('post-end')+'</div><div class="zb-sm-side">'+zb_slotBox('post-sidebar')+'</div></div>'+
      zb_slotBox('post-bar')+zb_slotBox('post-popup', 'pop')+'<div class="zs-mini za-bn">শুরুর বিজ্ঞাপন '+(set.postTopAfterSection>0 ? zb_bn(set.postTopAfterSection)+' নম্বর অংশের পরে' : 'সরাসরি উত্তরের নিচে')+' · ভেতরে '+zb_bn(set.inlineAfter)+' নম্বর প্যারার পরে, সর্বোচ্চ '+zb_bn(set.maxInline)+'টা · একটা লেখায় সব মিলিয়ে ফোনে '+zb_bn(set.maxPerPostPhone)+'টা, কম্পিউটারে '+zb_bn(set.maxPerPostDesktop)+'টা</div></div></div>';
}
ACT['zb-ad-on'] = function(el){ var a = zb_ad(el.getAttribute('data-id')); if(!a) return; a.active = !a.active; zb_commit(); rerender(); toast(a.active ? 'বিজ্ঞাপন চালু' : 'বিজ্ঞাপন বন্ধ — মুছে যায়নি'); };
CHANGE['zb-as'] = function(el){ var k = el.getAttribute('data-k'), d = ZB_AD_SET_UI.filter(function(x){ return x[0]===k; })[0] || [k,'','',1,20]; zb_adSet()[k] = Math.max(d[3], Math.min(d[4], zo_int(el.value))); zb_commit(); rerender(); toast('সেভ হলো'); };
ACT['zb-as-mob'] = function(){ var s = zb_adSet(); s.popupOnMobileFromSearch = !s.popupOnMobileFromSearch; zb_commit(); rerender(); };
ACT['zb-as-dup'] = function(){ var s = zb_adSet(); s.noDuplicate = !s.noDuplicate; zb_commit(); rerender(); toast(s.noDuplicate ? 'একই বিজ্ঞাপন একটা পেজে একবারই' : 'একই বিজ্ঞাপন একাধিক জায়গায় বসতে পারবে'); };
/* the ad editor */
function zb_adDraft(id){ var k = 'zb-ad:'+id; if(UI[k]) return UI[k]; var a = id==='new' ? zb_adNew({type:'product', productId:(DB.products[0]||{}).id || '', slots:['post-end']}) : zb_ad(id); if(!a) return null; UI[k] = zb_adNew(zb_clone(a)); if(!a.match) UI[k].match = 'all'; if(!UI[k].popup) UI[k].popup = zb_clone(ZB_POPUP_DEF); return UI[k]; }
function zb_adAuto(d){
  if(d.type==='product'){ var p = P(d.productId); d.link = p ? '#/p/'+p.id : ''; }
  else if(d.type==='combo'){ var c = zb_combo(d.comboId); d.link = c ? '#/combo/'+c.id : ''; }
  else if(d.type==='category'){ var k = CAT(d.catId); d.link = k ? '#/c/'+k.id : ''; }
}
function zb_adFill(d){ /* fill title / sub (both languages) from the picked item */
  if(d.type==='product'){ var p = P(d.productId); if(p){ d.title = p.name; d.sub = p.fabric || ''; d.titleBn = p.bn || p.name; d.subBn = p.fabric || ''; } }
  if(d.type==='combo'){ var c = zb_combo(d.comboId); if(c){ d.title = c.name; d.sub = c.blurb; d.titleBn = c.bn || c.name; d.subBn = c.blurbBn || ''; } }
  if(d.type==='category'){ var k = CAT(d.catId); if(k){ d.title = k.name; d.sub = k.blurb || ''; d.titleBn = k.bn || k.name; d.subBn = ''; } }
}
/* preview as the shop shows it; lang 'bn' = the /bn page (Bengali text, English where it is empty) */
function zb_adPreview(d, lang){
  var bn = lang==='bn', T = function(k){ return bn && String(d[k+'Bn']||'').trim() ? d[k+'Bn'] : d[k]; };
  var cta = '<span class="zb-ap-cta'+(bn?' za-bn':'')+'">'+esc(T('cta') || (bn ? 'এখনই দেখুন' : 'Shop now'))+'</span>', img = '', price = '', lab = '<span class="zb-ap-ad'+(bn?' za-bn':'')+'">'+(bn ? 'EXTAS অফার' : 'EXTAS offer')+'</span>';
  if(d.type==='product'){ var p = P(d.productId); if(p){ img = productImg(p, null, {ratio:'ratio-11', label:false}); price = fmt(p.price); } }
  if(d.type==='combo'){ var c = zb_combo(d.comboId); if(c && c.items && c.items.length){ img = setImg(c.items, {ratio:'ratio-11'}); } if(c && c.price) price = fmt(c.price); }
  if(d.type==='category'){ var k = CAT(d.catId), fp = k ? DB.products.filter(function(x){ return x.cat===k.id; })[0] : null; if(fp) img = productImg(fp, null, {ratio:'ratio-11', label:false}); }
  if(d.type==='banner') return '<div class="zb-ap ban'+(bn?' za-bn':'')+'"'+(d.img && /^data:image\//.test(d.img) ? ' style="background-image:url('+d.img+')"' : '')+'><div class="zb-ap-t">'+esc(T('title') || (bn ? 'ব্যানারের শিরোনাম' : 'Banner title'))+'</div><div class="zb-ap-s">'+esc(T('sub') || '')+'</div>'+cta+lab+'</div>';
  return '<div class="zb-ap card'+(bn?' za-bn':'')+'"><div class="zb-ap-img">'+(img || '<div class="pimg ratio-11"></div>')+'</div><div class="zb-ap-b"><div class="zb-ap-t">'+esc(T('title') || '—')+'</div><div class="zb-ap-s">'+esc(T('sub') || '')+'</div>'+(price ? '<div class="zb-ap-p">'+price+'</div>' : '')+cta+'</div>'+lab+'</div>';
}
function zb_adPrevBoth(d){ return '<div class="zs-mini za-bn">ইংরেজি পেজে</div>'+zb_adPreview(d, 'en')+'<div class="zs-mini za-bn mt12">বাংলা পেজে (/bn)</div>'+zb_adPreview(d, 'bn'); }
/* which live posts this ad will appear on, with the reason (relevance) */
function zb_adReachHTML(d, all){
  var postSlots = (d.slots||[]).filter(function(s){ return /^post-/.test(s); });
  if(!postSlots.length) return '<div class="zs-mini za-bn">লেখার পেজের কোনো জায়গা বাছা হয়নি — এটা শুধু ব্লগ হোম আর বিভাগ পেজে দেখাবে।</div>';
  var r = zb_adReach(d, all), show = r.slice(0, 12);
  return '<div class="zb-reach-n za-bn"><span class="zo-pill '+(r.length?'ok':'warn')+'">'+zb_bn(r.length)+'টা লেখায় দেখাবে</span></div>'+
    (r.length ? '<div class="zb-reach">'+show.map(function(x){ var p = x[0]; return '<div class="zb-reach-i"><a class="link'+(p.lang==='bn'?' za-bn':'')+'" href="'+zb_href(p)+'">'+esc(p.title)+'</a><span class="zo-pill za-bn">'+esc(x[1])+'</span></div>'; }).join('')+(r.length>show.length ? '<div class="zs-mini za-bn">আরো '+zb_bn(r.length-show.length)+'টা</div>' : '')+'</div>'
      : '<div class="zs-note warn mt8">'+ico('info',14)+'<div class="za-bn">এখন কোনো লেখার সাথে মেলে না — দোকানে জায়গাটা লুকিয়ে যাবে। বিভাগ বাছুন, অথবা "সব লেখায়" দিন।</div></div>');
}
function zb_adEditor(id, all){
  var d = zb_adDraft(id);
  if(!d) return '<a class="link xs za-bn zb-back" href="#/admin/blog?tab=ads">'+ico('back',13)+' বিজ্ঞাপন</a><div class="zs-empty mt16 za-bn">এই বিজ্ঞাপন নেই।</div>';
  zb_adAuto(d);
  var pub = all.filter(function(p){ return p.status==='published'; }), pp = d.popup || ZB_POPUP_DEF, isPop = (d.slots||[]).indexOf('post-popup')>=0, tz = zb_cfg().tz;
  var pick = d.type==='product' ? '<select id="zb-ad-pick" class="input zs-in" data-change="zb-adc" data-k="productId">'+DB.products.map(function(p){ return '<option value="'+p.id+'"'+(d.productId===p.id?' selected':'')+'>'+esc(p.name)+' · '+fmt(p.price)+'</option>'; }).join('')+'</select>'
    : d.type==='combo' ? '<select id="zb-ad-pick" class="input zs-in" data-change="zb-adc" data-k="comboId"><option value="">—</option>'+zb_combos().map(function(c){ return '<option value="'+c.id+'"'+(d.comboId===c.id?' selected':'')+'>'+esc(c.name)+(c.price?' · '+fmt(c.price):'')+'</option>'; }).join('')+'</select>'
    : d.type==='category' ? '<select id="zb-ad-pick" class="input zs-in" data-change="zb-adc" data-k="catId"><option value="">—</option>'+DB.categories.filter(function(c){ return !c.hidden; }).map(function(c){ return '<option value="'+c.id+'"'+(d.catId===c.id?' selected':'')+'>'+esc(c.name)+'</option>'; }).join('')+'</select>'
    : '<input id="zb-ad-pick" class="input zs-in" type="text" value="'+esc(d.link)+'" data-input="zb-adf" data-k="link" placeholder="#/c/hoodies">';
  var fld = function(k, idp, lab, bn, ph){ return '<div class="zp-f"><label class="label za-bn" for="zb-ad-'+idp+'">'+lab+'</label><input id="zb-ad-'+idp+'" class="input zs-in'+(bn?' za-bn':'')+'" type="text" value="'+esc(d[k]||'')+'" data-input="zb-adf" data-k="'+k+'"'+(ph ? ' placeholder="'+esc(ph)+'"' : '')+(k==='title' ? ' data-testid="zb-ad-title"' : k==='titleBn' ? ' data-testid="zb-ad-titlebn"' : '')+'></div>'; };
  return '<a class="link xs za-bn zb-back" href="#/admin/blog?tab=ads" data-act="zb-ad-cancel" data-id="'+esc(id)+'">'+ico('back',13)+' বিজ্ঞাপন</a>'+
    '<div class="zp-ed mt12"><div class="zp-edmain">'+
      '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">'+(id==='new'?'নতুন বিজ্ঞাপন':'বিজ্ঞাপন এডিট')+'</h2><span class="row zb-actsw" style="gap:8px"><span class="zs-mini za-bn">চালু</span>'+zs_sw(d.active, 'zb-ad-act', 'বিজ্ঞাপন চালু')+'</span></div>'+
        '<div class="zp-f mt12"><span class="label za-bn">ধরন</span><div class="zs-tier" role="group" aria-label="ধরন">'+ZB_AD_TYPES.map(function(t){ return '<button type="button" class="za-bn'+(d.type===t[0]?' on':'')+'" data-act="zb-ad-type" data-v="'+t[0]+'">'+t[1]+'</button>'; }).join('')+'</div></div>'+
        '<div class="zp-f"><label class="label za-bn" for="zb-ad-pick">'+(d.type==='banner'?'কোথায় নিয়ে যাবে (দোকানের লিংক)':'দোকান থেকে বাছুন')+'</label>'+pick+'</div>'+
        '<div class="zb-adlang"><h3 class="h3 za-bn">ইংরেজি পেজের লেখা</h3>'+fld('title','t','শিরোনাম')+fld('sub','s','ছোট লাইন')+fld('cta','c','বোতামের লেখা',false,'Shop now')+'</div>'+
        '<div class="zb-adlang" data-testid="zb-ad-bn"><h3 class="h3 za-bn">বাংলা পেজের লেখা (/bn)</h3><div class="zs-mini za-bn">খালি রাখলে বাংলা পেজে ইংরেজি লেখাটাই দেখাবে।</div>'+fld('titleBn','tbn','শিরোনাম (বাংলা)',true)+fld('subBn','sbn','ছোট লাইন (বাংলা)',true)+fld('ctaBn','cbn','বোতামের লেখা (বাংলা)',true,'এখনই দেখুন')+'</div>'+
        '<div class="zp-f"><label class="label za-bn" for="zb-ad-w">কতবার দেখাবে (১–১০)</label><input id="zb-ad-w" class="input zs-in zb-num" type="number" inputmode="numeric" min="1" max="10" value="'+esc(d.weight||1)+'" data-change="zb-adc" data-k="weight"><div class="zs-mini za-bn mt8">একই জায়গায় কয়েকটা বিজ্ঞাপন থাকলে বড় নম্বর বেশিবার দেখায়।</div></div>'+
        (d.type==='banner' ? '<div class="zp-f"><span class="label za-bn">ব্যানারের ছবি (ঐচ্ছিক)</span><div class="row wrap" style="gap:8px"><label class="btn btn-sm btn-secondary zb-file">'+ico('plus',13)+'ছবি দিন<input type="file" accept="image/*" data-change="zb-ad-img" aria-label="ব্যানারের ছবি"></label>'+(d.img ? '<button type="button" class="btn btn-sm btn-ghost" data-act="zb-ad-noimg">ছবি সরান</button>' : '<span class="zs-mini za-bn">না দিলে ব্র্যান্ড রঙে দেখাবে</span>')+'</div></div>' : '')+
        '<div class="za-f2"><div class="zp-f"><label class="label za-bn" for="zb-ad-st">শুরুর দিন</label><input id="zb-ad-st" class="input zs-in" type="date" value="'+esc(d.start)+'" data-change="zb-adc" data-k="start"></div><div class="zp-f"><label class="label za-bn" for="zb-ad-en">শেষের দিন</label><input id="zb-ad-en" class="input zs-in" type="date" value="'+esc(d.end)+'" data-change="zb-adc" data-k="end"></div></div>'+
        '<div class="zs-mini za-bn" data-testid="zb-ad-tz">বাংলাদেশ সময় ('+esc(tz)+'): শুরুর দিনের রাত ১২টা থেকে শেষের দিনের রাত ১১:৫৯ পর্যন্ত চলে। তারিখ খালি = সবসময়।</div></section>'+
      '<section class="zs-card"><h2 class="za-bn">কোথায় দেখাবে</h2><div class="zs-sub za-bn">আগে জায়গা বাছুন, তারপর কোন লেখায়</div>'+
        '<div class="zb-chips">'+ZB_SLOTS.map(function(s){ var on = (d.slots||[]).indexOf(s[0])>=0; return '<button type="button" class="chip'+(on?' on':'')+'" data-act="zb-ad-slot" data-v="'+s[0]+'" aria-pressed="'+on+'">'+(on?ico('check',12):'')+'<span class="za-bn">'+esc(s[1])+'</span></button>'; }).join('')+'</div>'+
        '<h3 class="h3 mt16 za-bn" style="font-size:14px">কোন লেখায়</h3><div class="zs-tier zb-match" role="group" aria-label="কোন লেখায়">'+[['related','শুধু মিলে যাওয়া লেখায়'],['all','সব লেখায়']].map(function(t){ return '<button type="button" class="za-bn'+(d.match===t[0]?' on':'')+'" data-act="zb-ad-match" data-v="'+t[0]+'" data-testid="zb-ad-match-'+t[0]+'">'+t[1]+'</button>'; }).join('')+'</div>'+
        '<div class="zs-mini za-bn mt8">'+(d.match==='related' ? 'নিচে বিভাগ বাছলে শুধু সেই বিভাগের লেখায়। বিভাগ না বাছলে যে লেখার প্রোডাক্ট এই বিজ্ঞাপনের প্রোডাক্ট/ক্যাটাগরির সাথে মেলে, বা যার ট্যাগ মেলে।' : 'সব লেখায় (নিচে বিভাগ বাছলে শুধু সেই বিভাগের লেখায়) — অফার বা ক্যাম্পেইনের জন্য।')+'</div>'+
        '<h3 class="h3 mt16 za-bn" style="font-size:14px">বিভাগ</h3><div class="zb-chips">'+zb_pillars().map(function(p){ var on = (d.pillars||[]).indexOf(p.id)>=0; return '<button type="button" class="chip za-bn'+(on?' on':'')+'" data-act="zb-ad-pil" data-v="'+p.id+'" aria-pressed="'+on+'">'+esc(p.bn)+'</button>'; }).join('')+'</div>'+
        '<h3 class="h3 mt16 za-bn" style="font-size:14px">নির্দিষ্ট লেখা</h3><div class="zb-chips">'+(d.posts||[]).map(function(s){ var pp2 = zb_postBySlug(s); return '<span class="zo-pill">'+esc(pp2 ? pp2.title : s)+' <button type="button" class="zb-x" data-act="zb-ad-postdel" data-v="'+esc(s)+'" aria-label="বাদ দিন: '+esc(s)+'">'+ico('close',11)+'</button></span>'; }).join('')+'</div>'+
        '<select class="input zs-in mt8 za-bn" data-change="zb-ad-postadd" aria-label="একটা লেখা যোগ করুন"><option value="">'+((d.posts||[]).length ? '+ আরেকটা লেখা' : 'শুধু কয়েকটা লেখায় চাইলে এখানে বাছুন (ঐচ্ছিক)')+'</option>'+pub.map(function(p){ return '<option value="'+esc(p.slug)+'">'+esc(p.title)+'</option>'; }).join('')+'</select>'+
        '<h3 class="h3 mt16 za-bn" style="font-size:14px">এই বিজ্ঞাপন যে লেখাগুলোয় দেখাবে</h3><div id="zb-ad-reach" data-testid="zb-ad-reach">'+zb_adReachHTML(d, all)+'</div></section>'+
      (isPop ? '<section class="zs-card" data-testid="zb-ad-popup"><h2 class="za-bn">পপআপ</h2><div class="zs-sub za-bn">কখন খুলবে আর কতবার — সহজে বন্ধ করা যায়, বারবার বিরক্ত করে না</div>'+
        '<div class="zp-f"><span class="label za-bn">কখন খুলবে</span><div class="zs-tier zb-tierw" role="group" aria-label="কখন খুলবে">'+[['scroll','লেখার কিছুটা পড়লে'],['time','কিছু সময় পরে'],['exit','চলে যেতে চাইলে']].map(function(t){ return '<button type="button" class="za-bn'+(pp.trigger===t[0]?' on':'')+'" data-act="zb-adp-tr" data-v="'+t[0]+'">'+t[1]+'</button>'; }).join('')+'</div></div>'+
        (pp.trigger!=='exit' ? '<div class="zp-f"><label class="label za-bn" for="zb-adp-v">'+(pp.trigger==='scroll' ? 'লেখার কত % পড়লে' : 'ঢোকার কত সেকেন্ড পরে')+'</label><input id="zb-adp-v" class="input zs-in" type="number" min="1" max="'+(pp.trigger==='scroll'?100:600)+'" value="'+esc(pp.value)+'" data-change="zb-adp" data-k="value"></div>' : '<div class="zs-mini za-bn">মাউস পেজ থেকে বের হতে গেলে (কম্পিউটারে)। ফোনে "চলে যাওয়া" ধরা যায় না, তাই ফোনে খুলবে না।</div>')+
        '<div class="za-f2"><div class="zp-f"><label class="label za-bn" for="zb-adp-f">কতবার</label><select id="zb-adp-f" class="input zs-in za-bn" data-change="zb-adp" data-k="freq">'+[['session','একবার ভিজিটে একবার'],['day','দিনে একবার'],['week','সপ্তাহে একবার']].map(function(f){ return '<option value="'+f[0]+'"'+(pp.freq===f[0]?' selected':'')+'>'+f[1]+'</option>'; }).join('')+'</select></div>'+
          /* F7: the label says exactly what the shop does — a minimum wait counted from arrival, then open on the trigger */
          '<div class="zp-f"><label class="label za-bn" for="zb-adp-d">ঢোকার পর অন্তত কত সেকেন্ড অপেক্ষা</label><input id="zb-adp-d" class="input zs-in" type="number" min="0" max="600" value="'+esc(pp.delay)+'" data-change="zb-adp" data-k="delay" data-testid="zb-adp-delay"></div></div>'+
        '<div class="zs-mini za-bn" data-testid="zb-adp-help">'+(+pp.delay>0 ? 'পাঠক লেখায় ঢোকার পর অন্তত '+zb_bn(+pp.delay)+' সেকেন্ড অপেক্ষা করবে, তারপর ওপরের শর্ত পূরণ হলেই খুলবে। শর্ত আগে পূরণ হলে বাকি সময়টুকু শেষ হলে খুলবে।' : '০ = কোনো অপেক্ষা নেই, ওপরের শর্ত পূরণ হলেই খুলবে।')+'</div>'+
        '<div class="zs-note warn mt12">'+ico('info',15)+'<div class="za-bn">'+(zb_adSet().popupOnMobileFromSearch ? '<b>সাবধান:</b> সাধারণ নিয়মে "গুগল থেকে আসা ফোনের ভিজিটরকে ঢুকেই পপআপ" এখন চালু করা আছে। বন্ধ রাখাই ভালো — ' : 'গুগল থেকে ফোনে কেউ ঢুকলে সাথে সাথে পপআপ খুলবে না (সাধারণ নিয়মে বন্ধ)। ')+'ঢুকেই পুরো স্ক্রিন ঢেকে দিলে গুগল র‍্যাংক কমায়।</div></div></section>' : '')+
    '</div><aside class="zp-edside"><section class="zs-card"><h2 class="za-bn">দেখতে যেমন হবে</h2><div class="zs-sub za-bn">দোকানে যেমন দেখাবে (আনুমানিক) — দুই ভাষায়</div><div id="zb-ad-prev" data-testid="zb-ad-prev">'+zb_adPrevBoth(d)+'</div><div class="zs-mini mt8 mono zb-adlink">'+esc(d.link||'—')+'</div></section>'+
      '<section class="zs-card"><h2 class="za-bn">জায়গাগুলো</h2>'+(d.slots||[]).map(function(s){ var n = zb_adNums(d, s); return '<div class="zs-row"><div class="grow"><div class="small za-bn">'+esc(zb_slotName(s))+'</div></div><span class="zs-mini za-bn">'+n.views+' দেখা · '+n.clicks+' ক্লিক</span></div>'; }).join('')+((d.slots||[]).length ? '' : '<div class="zs-mini za-bn">কোনো জায়গা বাছা হয়নি — দেখাবে না।</div>')+zs_simTag('আনুমানিক')+'</section></aside></div>'+
    '<div class="zp-savebar"><div class="zp-savein"><span class="zs-mini zo-hide-s za-bn">সেভ চাপলে তবেই সেভ হবে</span><a class="btn btn-ghost" href="#/admin/blog?tab=ads" data-act="zb-ad-cancel" data-id="'+esc(id)+'">বাতিল</a><button type="button" class="btn btn-primary" data-act="zb-ad-save" data-id="'+esc(id)+'" data-testid="zb-ad-save">'+ico('check',16)+'সেভ</button></div></div>';
}
function zb_adCur(){ var q = CUR.query || {}; return q.ad ? UI['zb-ad:'+q.ad] : null; }
INPUT['zb-adf'] = function(el){ var d = zb_adCur(); if(!d) return; d[el.getAttribute('data-k')] = el.value; var p = document.getElementById('zb-ad-prev'); if(p) p.innerHTML = zb_adPrevBoth(d); if(el.getAttribute('data-k')==='link'){ var r = document.getElementById('zb-ad-reach'); if(r) r.innerHTML = zb_adReachHTML(d, zb_posts()); } };
CHANGE['zb-adc'] = function(el){ var d = zb_adCur(); if(!d) return; var k = el.getAttribute('data-k'); d[k] = k==='weight' ? Math.max(1, Math.min(10, zo_int(el.value))) : el.value; if(/Id$/.test(k)){ zb_adFill(d); zb_adAuto(d); } rerender(); };
ACT['zb-ad-type'] = function(el){ var d = zb_adCur(); if(!d) return; d.type = el.getAttribute('data-v'); if(d.type==='product' && !P(d.productId)) d.productId = (DB.products[0]||{}).id || ''; if(d.type==='combo' && !zb_combo(d.comboId)) d.comboId = (zb_combos()[0]||{}).id || ''; if(d.type==='category' && !CAT(d.catId)) d.catId = (DB.categories[0]||{}).id || ''; if(d.type!=='banner'){ zb_adFill(d); zb_adAuto(d); } rerender(); };
ACT['zb-ad-slot'] = function(el){ var d = zb_adCur(); if(!d) return; var v = el.getAttribute('data-v'), i = d.slots.indexOf(v); if(i>=0) d.slots.splice(i,1); else d.slots.push(v); rerender(); };
ACT['zb-ad-pil'] = function(el){ var d = zb_adCur(); if(!d) return; var v = el.getAttribute('data-v'), i = d.pillars.indexOf(v); if(i>=0) d.pillars.splice(i,1); else d.pillars.push(v); rerender(); };
ACT['zb-ad-match'] = function(el){ var d = zb_adCur(); if(!d) return; d.match = el.getAttribute('data-v')==='all' ? 'all' : 'related'; rerender(); };
CHANGE['zb-ad-postadd'] = function(el){ var d = zb_adCur(); if(!d || !el.value) return; if(d.posts.indexOf(el.value)<0) d.posts.push(el.value); rerender(); };
ACT['zb-ad-postdel'] = function(el){ var d = zb_adCur(); if(!d) return; d.posts = d.posts.filter(function(s){ return s!==el.getAttribute('data-v'); }); rerender(); };
ACT['zb-ad-act'] = function(){ var d = zb_adCur(); if(!d) return; d.active = !d.active; rerender(); };
ACT['zb-adp-tr'] = function(el){ var d = zb_adCur(); if(!d) return; d.popup = Object.assign({}, ZB_POPUP_DEF, d.popup||{}, {trigger:el.getAttribute('data-v')}); if(d.popup.trigger==='scroll' && d.popup.value>100) d.popup.value = 50; rerender(); };
CHANGE['zb-adp'] = function(el){ var d = zb_adCur(); if(!d) return; var k = el.getAttribute('data-k'); d.popup = Object.assign({}, ZB_POPUP_DEF, d.popup||{}); d.popup[k] = k==='freq' ? el.value : Math.max(0, zo_int(el.value)); if(k==='delay') rerender(); };
CHANGE['zb-ad-img'] = function(el){ var d = zb_adCur(), f = el.files && el.files[0]; if(!d || !f) return; var rd = new FileReader(); rd.onload = function(){ var img = new Image(); img.onload = function(){ var cv = document.createElement('canvas'), k = Math.min(1200/img.width, 1); cv.width = Math.round(img.width*k); cv.height = Math.round(img.height*k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); d.img = cv.toDataURL('image/jpeg', .8); rerender(); }; img.src = rd.result; }; rd.readAsDataURL(f); };
ACT['zb-ad-noimg'] = function(){ var d = zb_adCur(); if(!d) return; d.img = ''; rerender(); };
ACT['zb-ad-cancel'] = function(el, ev){ if(ev) ev.preventDefault(); delete UI['zb-ad:'+el.getAttribute('data-id')]; go('#/admin/blog?tab=ads'); };
ACT['zb-ad-save'] = function(el){
  var id = el.getAttribute('data-id'), d = UI['zb-ad:'+id]; if(!d) return;
  zb_adAuto(d);
  if(!String(d.title).trim()){ toast('শিরোনাম দিন'); return; }
  if(!/^#\//.test(d.link||'')){ toast('দোকানের ভেতরের লিংক দিন (#/ দিয়ে শুরু) — বাইরের বিজ্ঞাপন চলবে না'); return; }
  if(!d.slots.length){ toast('অন্তত একটা জায়গা বাছুন'); return; }
  if(d.start && d.end && d.end < d.start){ toast('শেষের দিন শুরুর আগে হতে পারে না'); return; }
  var rec = zb_adNew(zb_clone(d)); if(id==='new') rec.id = 'ad-'+uid();
  ['titleBn','subBn','ctaBn'].forEach(function(k){ rec[k] = String(rec[k]||'').trim(); });
  var ads = zb_ads(), i = ads.map(function(a){ return a.id; }).indexOf(rec.id); if(i>=0) ads[i] = rec; else ads.push(rec);
  var n = zb_adReach(rec).length, post = rec.slots.some(function(s){ return /^post-/.test(s); });
  delete UI['zb-ad:'+id]; zb_commit(); go('#/admin/blog?tab=ads'); toast('বিজ্ঞাপন সেভ হলো'+(post ? ' — '+zb_bn(n)+'টা লেখায় দেখাবে' : ''));
};

/* ---------- sitemap & indexing ---------- */
function zb_seoTab(all){
  var s = zb_st(), pub = all.filter(function(p){ return p.status==='published'; });
  var combos = 0, rules = 0; try{ ca_activeRules().forEach(function(r){ rules++; combos += ca_generate(r).visible.length; }); }catch(e){}
  var maps = [['products.xml','প্রোডাক্ট', DB.products.length],['categories.xml','ক্যাটাগরি', DB.categories.filter(function(c){ return !c.hidden; }).length + (DB.subcats||[]).length],['combos.xml','কম্বো পেজ আর জোড়া', rules + combos],['blog.xml','ব্লগের লেখা আর বিভাগ', pub.length + zb_pillars().length],['pages.xml','সাহায্যের পেজ', 8]];
  var total = maps.reduce(function(a,m){ return a + m[2]; }, 0);
  var ix = pub.map(function(p){ return zb_idx(p); }), nIdx = ix.filter(function(x){ return x==='indexed'; }).length;
  return '<div class="zs-kpis k4">'+
      '<div class="zs-k"><div class="v">'+total+'</div><div class="l">sitemap-এ লিংক</div><div class="s">'+zb_bn(maps.length)+'টা ফাইল</div></div>'+
      '<div class="zs-k ok"><div class="v">'+nIdx+' / '+pub.length+'</div><div class="l">গুগলে থাকা লেখা</div><div class="s">আনুমানিক</div></div>'+
      '<div class="zs-k"><div class="v">'+(s.gsc?'যুক্ত':'বন্ধ')+'</div><div class="l">Search Console</div><div class="s">+ Bing Webmaster</div></div>'+
      '<div class="zs-k"><div class="v">'+esc(zs_time(s.sitemapAt).split(' · ')[1])+'</div><div class="l">sitemap শেষ বানানো</div><div class="s">'+esc(zs_time(s.sitemapAt).split(' · ')[0])+' · প্রতিটা বদলে নিজে</div></div>'+
    '</div>'+
    '<div class="zs-g2">'+
      '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">Sitemap</h2>'+zs_simTag('ডেমো')+'</div><div class="zs-sub za-bn">গুগলকে দেওয়া পেজের তালিকা — নতুন কিছু এলে নিজে আপডেট হয়</div>'+
        maps.map(function(m){ return '<div class="zs-row"><div class="grow"><div class="small bold za-bn">'+esc(m[1])+'</div><div class="zs-mini mono">/sitemaps/'+m[0]+'</div></div><b class="small za-bn">'+m[2]+'টা লিংক</b></div>'; }).join('')+
        '<div class="zs-actions mt12"><button type="button" class="btn btn-sm btn-secondary" data-act="zb-remap">'+ico('swap',14)+'এখনই আবার বানান</button></div></section>'+
      '<section class="zs-card"><h2 class="za-bn">গুগল, বিং আর AI</h2><div class="zs-sub za-bn">গুগল, বিং আর AI অ্যাসিস্ট্যান্ট যেন দোকান খুঁজে পায়</div>'+
        '<div class="zs-row"><div class="grow"><div class="small bold">Google Search Console</div><div class="zs-mini za-bn">যাচাই করা · sitemap পাঠানো · ডেমো</div></div>'+zs_sw(s.gsc, 'zb-gsc', 'Search Console যুক্ত')+'</div>'+
        '<div class="zs-row"><div class="grow"><div class="small bold za-bn">AI অ্যাসিস্ট্যান্টরা দোকান পড়তে পারবে</div><div class="zs-mini za-bn">ChatGPT, Claude, Perplexity, Google AI — চালু থাকলে তারা দোকানের কথা বলতে পারে (শুরুতে চালু)</div></div>'+zs_sw(s.ai, 'zb-ai', 'AI পড়তে পারবে')+'</div>'+
        '<div class="zs-row"><div class="grow"><div class="small bold za-bn">স্টক শেষ হলেও পেজ থাকে</div><div class="zs-mini za-bn">কোনো প্রোডাক্টের লিংক কখনো মোছে না</div></div><span class="tag za-bn">'+ico('lock',12)+'সবসময়</span></div>'+
        '<div class="zs-row"><div class="grow"><div class="small bold za-bn">বাংলা সাইট (/bn)</div><div class="zs-mini za-bn">তৈরি আছে, বন্ধ — এখন ইংরেজি সাইট চালু। বাংলা লেখা তবুও জার্নালে প্রকাশ হয়।</div></div><span class="zo-pill za-bn">বন্ধ</span></div>'+
      '</section></div>'+
    '<section class="zs-card zo-mt"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">গুগলে উঠেছে কি না — লেখা ধরে</h2>'+zs_simTag('ডেমো')+'</div><div class="zs-sub za-bn">কোন লেখা গুগলে উঠেছে; না উঠলে "গুগলকে তুলতে বলুন" চাপুন</div>'+
      (pub.length ? '<div class="zs-list">'+pub.map(function(p){ var x = ZB_IDX[zb_idx(p)]; return '<div class="zs-li"><div style="min-width:0"><div class="t'+(p.lang==='bn'?' za-bn':'')+'">'+esc(p.title)+'</div><div class="m">'+esc(zb_href(p).slice(1))+' · <span class="za-bn">'+esc(x[2])+'</span></div></div>'+
        '<div class="r"><span class="zo-pill za-bn '+x[1]+'">'+x[0]+'</span>'+(zb_idx(p)==='discovered' ? '<button type="button" class="btn btn-sm btn-ghost za-bn" data-act="zb-reqidx" data-id="'+p.id+'">গুগলকে তুলতে বলুন</button>' : '')+'</div></div>'; }).join('')+'</div>' : '<div class="zs-mini za-bn">কোনো প্রকাশিত লেখা নেই।</div>')+'</section>';
}
ACT['zb-remap'] = function(){ zb_st().sitemapAt = Date.now(); saveState(); rerender(); toast('sitemap আবার বানিয়ে গুগল আর বিং-এ পাঠানো হলো (ডেমো)'); };
ACT['zb-gsc'] = function(){ var s = zb_st(); s.gsc = !s.gsc; saveState(); rerender(); toast(s.gsc ? 'Search Console যুক্ত হলো (ডেমো)' : 'Search Console বিচ্ছিন্ন'); };
ACT['zb-ai'] = function(){ var s = zb_st(); s.ai = !s.ai; saveState(); rerender(); toast(s.ai ? 'AI অ্যাসিস্ট্যান্টরা দোকান পড়তে পারবে' : 'AI-কে robots.txt-এ আটকানো হলো'); };
ACT['zb-reqidx'] = function(el){ zb_st().idx[el.getAttribute('data-id')] = 'submitted'; saveState(); rerender(); toast('গুগলকে বলা হলো — সাধারণত কয়েক দিন লাগে (ডেমো)'); };

/* =====================================================================
   EDITOR
   ===================================================================== */
function zb_draft(id){
  var key = 'zb-ed:'+id; if(UI[key]) return UI[key];
  var p = id==='new' ? {id:'', title:'', slug:'', slugAuto:true, meta:'', kw:'', lang:'en', status:'draft', at:Date.now(), sched:'', body:'', product:'', products:[], color:'', section:zb_secOf((zb_pillars()[0]||{}).id), pillar:(zb_pillars()[0]||{}).id || '', sub:'', tags:[], quickAnswer:'', links:[], heroImage:'', writer:'owner', proofer:''} : zb_get(id);
  if(!p) return null;
  UI[key] = zb_clone(p); return UI[key];
}
var ZB_STAGE_BN = {writing:'লেখা হচ্ছে', proof:'প্রুফ চলছে', final:'দূতের শেষ চেক', ready:'প্রকাশের জন্য তৈরি', scheduled:'সময় দেওয়া', published:'প্রকাশিত'};
PAGES['zb-edit'] = { layout:'admin', title:function(params){ return params[0]==='new' ? 'নতুন লেখা' : 'লেখা এডিট'; }, render:function(params){
  var id = params[0], d = zb_draft(id);
  if(!d) return '<div class="zs-page zb-page"><a class="link xs za-bn zb-back" href="#/admin/blog">'+ico('back',13)+' সব পোস্ট</a><div class="zs-empty mt16 za-bn">এই লেখাটা নেই।</div></div>';
  var prods = DB.products.slice(0, 40), c = zb_cfg();
  var st = ZB_STAT[d.status] || ZB_STAT.draft, pil = zb_pillar(d.pillar) || zb_pillars()[0] || {subs:[]}, locked = d.pipe && !zb_canPublish(d);
  var extra = (d.products||[]).filter(function(x){ return x && x!==d.product; }), bnc = d.lang==='bn' ? ' za-bn' : '';
  var lab = function(f, t, hint, cnt){ return '<label class="label za-bn" for="'+f+'">'+t+(hint ? ' <span class="zs-mini">'+hint+'</span>' : '')+(cnt ? ' <span class="zs-mini zb-cnt" id="'+cnt[0]+'">'+cnt[1]+'</span>' : '')+'</label>'; };
  return '<div class="zs-page zb-page">'+
    '<a class="link xs za-bn zb-back" href="#/admin/blog">'+ico('back',13)+' সব পোস্ট</a>'+
    zo_head('অ্যাডমিন · ব্লগ', id==='new' ? 'নতুন লেখা' : 'লেখা এডিট', 'শিরোনাম, লিংক, গুগলের বর্ণনা আর মূল লেখা', '', '<span class="zo-pill za-bn '+st[1]+'">'+st[0]+'</span>'+(d.pipe ? '<span class="zo-pill info za-bn">'+esc(ZB_STAGE_BN[zb_stage(d)]||'')+'</span>' : ''))+
    '<div class="zp-ed">'+
      '<div class="zp-edmain">'+
        '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">লেখা</h2>'+
          '<div class="zs-tier" role="group" aria-label="ভাষা"><button type="button" class="za-bn'+(d.lang==='en'?' on':'')+'" data-act="zb-lang" data-v="en">ইংরেজি</button><button type="button" class="za-bn'+(d.lang==='bn'?' on':'')+'" data-act="zb-lang" data-v="bn">বাংলা</button></div></div>'+
          '<div class="zp-f mt12">'+lab('zb-title','শিরোনাম','',['zb-c-title', String(d.title).length+' / 60'])+'<input id="zb-title" class="input zs-in'+bnc+'" type="text" value="'+esc(d.title)+'" data-input="zb-f" data-k="title" placeholder="যেমন: How to pick your polo size" data-testid="zb-title"></div>'+
          '<div class="zp-f">'+lab('zb-slug','লিংক (slug)','ইংরেজিতে')+'<div class="zb-slug"><span class="zs-mini">/journal/</span><input id="zb-slug" class="input zs-in" type="text" value="'+esc(d.slug)+'" data-input="zb-f" data-k="slug" placeholder="how-to-pick-your-polo-size"></div><div class="zs-mini za-bn mt8" id="zb-slugnote">'+(d.slugAuto ? 'শিরোনাম থেকে নিজে তৈরি — নিজের লিংক চাইলে এখানে লিখুন।' : 'আপনার দেওয়া লিংক।')+(d.status==='published' ? ' চালু লেখার লিংক বদলালে পুরোনো লিংক নতুনটায় নিয়ে যাবে।' : '')+'</div></div>'+
          '<div class="zp-f">'+lab('zb-meta','গুগলের বর্ণনা (meta)','সার্চে শিরোনামের নিচে যে লাইন দেখায়',['zb-c-meta', String(d.meta).length+' / '+c.meta.max])+'<textarea id="zb-meta" class="input zs-in zp-ta'+bnc+'" rows="2" data-input="zb-f" data-k="meta" placeholder="এক-দুই লাইনে — পড়ে যেন ক্লিক করতে ইচ্ছে হয়">'+esc(d.meta)+'</textarea></div>'+
          '<div class="za-f2"><div class="zp-f">'+lab('zb-kw','মূল কিওয়ার্ড','মানুষ গুগলে যা লেখে')+'<input id="zb-kw" class="input zs-in" type="text" value="'+esc(d.kw)+'" data-input="zb-f" data-k="kw" placeholder="যেমন: polo size" data-testid="zb-kw"></div>'+
            '<div class="zp-f">'+lab('zb-tags','ট্যাগ','কমা দিয়ে')+'<input id="zb-tags" class="input zs-in" type="text" value="'+esc((d.tags||[]).join(', '))+'" data-input="zb-tags" placeholder="polo, care"></div></div>'+
          '<div class="za-f2"><div class="zp-f">'+lab('zb-pil','বিভাগ')+'<select id="zb-pil" class="input zs-in za-bn" data-change="zb-sel" data-k="pillar" data-testid="zb-pil">'+zb_pillarOpts(d.pillar)+'</select></div>'+
            '<div class="zp-f">'+lab('zb-sub','উপ-বিভাগ')+'<select id="zb-sub" class="input zs-in za-bn" data-change="zb-sel" data-k="sub"><option value="">—</option>'+(pil.subs||[]).filter(function(s){ return !s.hidden; }).map(function(s){ return '<option value="'+s.id+'"'+(d.sub===s.id?' selected':'')+'>'+esc(s.bn)+'</option>'; }).join('')+'</select></div></div>'+
          '<div class="zp-f">'+lab('zb-qa','সরাসরি উত্তর','ওপরের বক্সে দেখায় — '+zb_bn(c.qa.min)+'–'+zb_bn(c.qa.max)+' শব্দ',['zb-c-qa', zb_bn(zb_words(d.quickAnswer))+' শব্দ'])+'<textarea id="zb-qa" class="input zs-in zp-ta'+bnc+'" rows="3" data-input="zb-f" data-k="quickAnswer" placeholder="দুই-তিন লাইনে সরাসরি উত্তর">'+esc(d.quickAnswer||'')+'</textarea></div>'+
          '<div class="zp-f">'+lab('zb-body','মূল লেখা','প্যারার মাঝে একটা খালি লাইন',['zb-c-body', zb_bn(zb_words(d.body))+' শব্দ'])+'<textarea id="zb-body" class="input zs-in zp-ta zb-body'+bnc+'" rows="10" data-input="zb-f" data-k="body" placeholder="এখানে লেখা লিখুন…">'+esc(d.body)+'</textarea></div>'+
          '<div class="zp-f">'+lab('zb-prod','যে প্রোডাক্টের কথা','লেখার সাথে দেখাবে')+'<select id="zb-prod" class="input zs-in" data-change="zb-sel" data-k="product"><option value="">— কোনোটা না —</option>'+prods.map(function(p){ return '<option value="'+p.id+'"'+(d.product===p.id?' selected':'')+'>'+esc(p.name)+'</option>'; }).join('')+'</select></div>'+
          '<div class="zp-f"><span class="label za-bn">আরো প্রোডাক্ট <span class="zs-mini">"এই লেখার প্রোডাক্ট" ব্লকে দেখায়</span></span><div class="zb-chips">'+extra.map(function(x){ var p = P(x); return p ? '<span class="zo-pill">'+esc(p.name)+' <button type="button" class="zb-x" data-act="zb-prod-del" data-v="'+x+'" aria-label="বাদ দিন: '+esc(p.name)+'">'+ico('close',11)+'</button></span>' : ''; }).join('')+'</div>'+
            '<select class="input zs-in mt8 za-bn" data-change="zb-prod-add" aria-label="প্রোডাক্ট যোগ করুন"><option value="">+ প্রোডাক্ট যোগ করুন</option>'+DB.products.filter(function(p){ return p.id!==d.product && extra.indexOf(p.id)<0; }).map(function(p){ return '<option value="'+p.id+'">'+esc(p.name)+'</option>'; }).join('')+'</select></div>'+
          '<div class="za-f2"><div class="zp-f">'+lab('zb-wr','লেখক')+'<select id="zb-wr" class="input zs-in za-bn" data-change="zb-who" data-k="writer"'+(d.pipe && d.passedBy ? ' disabled' : '')+'>'+zb_authorOpts(d.writer, '<option value="owner"'+(d.writer==='owner'?' selected':'')+'>মালিক / EXTAS টিম</option>')+'</select></div>'+
            '<div class="zp-f">'+lab('zb-rv','প্রুফ করবে','লেখক নিজে না')+'<select id="zb-rv" class="input zs-in za-bn" data-change="zb-who" data-k="proofer"'+(d.pipe && d.passedBy ? ' disabled' : '')+'>'+zb_authorOpts(d.proofer, '<option value="">—</option>')+'</select></div></div>'+
          '<div class="zp-f">'+lab('zb-hero','মূল ছবি','নিজেদের তোলা ছবি ভালো')+'<select id="zb-hero" class="input zs-in za-bn" data-change="zb-sel" data-k="heroImage"><option value="">প্রোডাক্টের ছবি (নিজে বসে)</option><option value="own:'+esc(d.slug||'post')+'"'+(/^own:/.test(d.heroImage||'')?' selected':'')+'>নিজেদের ফটোশুট (ডেমো)</option></select></div>'+
        '</section>'+
        '<section class="zs-card"><h2 class="za-bn">প্রকাশ</h2><div class="zs-sub za-bn">এখনই, পরে কোনো সময়ে, নাকি খসড়া — বেছে সেভ চাপুন</div>'+
          '<div class="zs-pages">'+[['draft','খসড়া'],['scheduled','সময় দিন'],['published','এখনই প্রকাশ']].map(function(s){ var on = d.status===s[0]; return '<button type="button" class="chip za-bn'+(on?' on':'')+'" data-act="zb-status" data-v="'+s[0]+'">'+(on?ico('check',13):(locked && s[0]!=='draft' ? ico('lock',12) : ''))+s[1]+'</button>'; }).join('')+'</div>'+
          (d.status==='scheduled' ? '<div class="zp-f mt12"><label class="label za-bn" for="zb-when">কখন প্রকাশ হবে</label><input id="zb-when" class="input zs-in" type="datetime-local" value="'+esc(d.sched || zb_local(Date.now()+ZB_D))+'" data-change="zb-when"></div>' : '')+
          '<div class="zs-mini za-bn mt8">'+(d.status==='published' ? 'সেভ চাপলে দোকানের জার্নালে চালু হবে।' : d.status==='scheduled' ? 'ওই সময়ে নিজে প্রকাশ হবে (বাংলাদেশ সময়)।' : 'খসড়া শুধু আপনি দেখতে পান।')+' প্রকাশ বন্ধ করলেও লেখা মুছে যায় না।</div>'+
          (locked ? '<div class="zs-note warn mt12">'+ico('lock',15)+'<p class="za-bn">এটা লেখক দলের লেখা — প্রুফ (অন্য লেখক) আর দূতের শেষ চেক পাস না করা পর্যন্ত সময় দেওয়া বা প্রকাশ হবে না। <a class="zb-inl" href="#/admin/blog?tab=pipe">কাজের ধারা দেখুন</a></p></div>' : '')+'</section>'+
      '</div>'+
      '<aside class="zp-edside">'+
        '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">SEO চেকলিস্ট</h2><span id="zb-score">'+zb_scorePill(zb_score(d))+'</span></div><div class="zs-sub za-bn">সবুজ = ঠিক আছে, ধূসর = বাকি</div><div id="zb-checks">'+zb_checksHTML(d)+'</div></section>'+
        '<section class="zs-card"><h2 class="za-bn">গুগলে যেমন দেখাবে</h2><div class="zs-sub za-bn">সার্চের ফলাফলে</div><div id="zb-prev">'+zb_prevHTML(d)+'</div></section>'+
        '<section class="zs-card" data-testid="zb-links"><h2 class="za-bn">ভেতরের লিংক</h2><div class="zs-sub za-bn">বিভাগ আর কিওয়ার্ড দেখে সাজেশন — '+zb_bn(c.links.min)+'–'+zb_bn(c.links.max)+'টা দিন</div><div id="zb-links">'+zb_linksHTML(d)+'</div></section>'+
        (d.pipe ? '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">প্রুফ চেক</h2><a class="zs-link small za-bn" href="#/admin/blog?tab=pipe">কাজের ধারা</a></div><div class="zs-sub za-bn">লেখক '+esc(zb_short(d.writer))+' · প্রুফ '+esc(d.proofer ? zb_short(d.proofer) : '—')+' · শেষ চেক '+esc(zb_short(c.head))+'</div><div id="zb-pck">'+zb_pckHTML(d)+'</div></section>' : '')+
      '</aside>'+
    '</div>'+
    '<div class="zp-savebar"><div class="zp-savein"><span class="zs-mini zo-hide-s za-bn">সেভ চাপলে তবেই সেভ হবে</span><a class="btn btn-ghost" href="#/admin/blog" data-act="zb-cancel" data-id="'+id+'">বাতিল</a><button type="button" class="btn btn-primary" data-act="zb-save" data-id="'+id+'" data-testid="zb-save">'+ico('check',16)+'সেভ</button></div></div>'+
  '</div>';
}};
function zb_checksHTML(d){ return '<div class="zb-checks">'+zb_checks(d).map(function(c){ return '<div class="zb-ck'+(c[1]?' ok':'')+'"><span class="zb-ckd">'+(c[1]?ico('check',11):'')+'</span><span class="small za-bn" style="min-width:0">'+esc(c[3])+'</span></div>'; }).join('')+'</div>'; }
function zb_pckHTML(d){ return '<div class="zb-checks">'+zb_pchecks(d).map(function(x){ return '<div class="zb-ck'+(x.ok?' ok':'')+'"><span class="zb-ckd">'+(x.ok?ico('check',11):'')+'</span><span style="min-width:0"><span class="small za-bn">'+esc(x.bn)+'</span><span class="zs-mini za-bn" style="display:block">'+esc(x.why)+'</span></span></div>'; }).join('')+'</div>'; }
function zb_prevHTML(d){ return '<div class="zb-g"><div class="zb-gu">extas.com.bd › journal › '+esc(d.slug||'…')+'</div><div class="zb-gt'+(d.lang==='bn'?' za-bn':'')+'">'+esc(d.title || 'লেখার শিরোনাম')+' | EXTAS</div><div class="zb-gd za-bn">'+esc((d.meta || String(d.body||'').slice(0,155) || 'গুগলের বর্ণনা এখানে দেখাবে।').slice(0,160))+'</div></div>'; }
function zb_linksHTML(d){
  var all = zb_posts(), c = zb_cfg(), sug = zb_suggest(d, all), have = (d.links||[]).map(function(l){ return l.h; }), n = have.length;
  var rows = (d.links||[]).concat(sug.filter(function(l){ return have.indexOf(l.h)<0; })).slice(0, Math.max(c.links.max, n)+2);
  var inb = d.id ? zb_inbound(d, all) : [];
  return '<div class="zb-lk-n"><span class="zo-pill za-bn '+(n>=c.links.min && n<=c.links.max ? 'ok' : 'warn')+'">'+n+' / '+c.links.min+'–'+c.links.max+'টা</span></div>'+
    '<div class="zb-lks">'+(rows.map(function(l){ var on = have.indexOf(l.h)>=0; return '<button type="button" class="zb-lk'+(on?' on':'')+'" data-act="zb-ln-tg" data-h="'+esc(l.h)+'" data-k="'+esc(l.k)+'" data-l="'+esc(l.l)+'" aria-pressed="'+on+'"><span class="zb-ckd">'+(on?ico('check',10):ico('plus',10))+'</span><span style="min-width:0"><span class="small'+(/[ঀ-৿]/.test(l.l)?' za-bn':'')+'">'+esc(l.l)+'</span><span class="zs-mini za-bn" style="display:block">'+esc(ZB_LK[l.k]||l.k)+' · '+esc(l.h)+'</span></span></button>'; }).join('') || '<div class="zs-mini za-bn">শিরোনাম আর কিওয়ার্ড দিলে সাজেশন আসবে।</div>')+'</div>'+
    (d.id && (d.status!=='draft' || ['final','ready'].indexOf(d.pipe)>=0) ? (inb.length ? '<div class="zs-mini za-bn mt8">'+ico('check',12)+' '+zb_bn(inb.length)+'টা লেখা এখানে লিংক করেছে</div>' : '<div class="zs-note warn mt8" data-testid="zb-orphan">'+ico('info',14)+'<div class="za-bn"><b>কেউ লিংক করেনি</b> — অন্য কোনো লেখা এটার দিকে লিংক করেনি। জড়িত লেখায় একটা লিংক দিন, নইলে গুগল খুঁজে পেতে দেরি করে।</div></div>') : '');
}
function zb_cur(){ var id = CUR.params && CUR.params[0]; return id ? UI['zb-ed:'+id] : null; }
function zb_patch(d){
  var set = function(id, h){ var e = document.getElementById(id); if(e) e.innerHTML = h; };
  set('zb-checks', zb_checksHTML(d)); set('zb-score', zb_scorePill(zb_score(d))); set('zb-prev', zb_prevHTML(d)); set('zb-links', zb_linksHTML(d)); if(d.pipe) set('zb-pck', zb_pckHTML(d));
  var c = function(id, t){ var e = document.getElementById(id); if(e) e.textContent = t; };
  c('zb-c-title', String(d.title).length+' / 60'); c('zb-c-meta', String(d.meta).length+' / '+zb_cfg().meta.max); c('zb-c-body', zb_bn(zb_words(d.body))+' শব্দ'); c('zb-c-qa', zb_bn(zb_words(d.quickAnswer))+' শব্দ');
}
INPUT['zb-f'] = function(el){
  var d = zb_cur(); if(!d) return; var k = el.getAttribute('data-k');
  if(k==='slug'){ d.slug = zo_slug(el.value) || ''; d.slugAuto = false; }
  else d[k] = el.value;
  if(k==='title' && d.slugAuto){ d.slug = zb_jslug(d.title); var s = document.getElementById('zb-slug'); if(s) s.value = d.slug; }
  zb_patch(d);
};
INPUT['zb-tags'] = function(el){ var d = zb_cur(); if(!d) return; d.tags = el.value.split(',').map(function(t){ return t.trim(); }).filter(function(t, i, a){ return t && a.indexOf(t)===i; }); };
CHANGE['zb-sel'] = function(el){
  var d = zb_cur(); if(!d) return; var k = el.getAttribute('data-k'), v = el.value;
  if(k==='product'){ var old = d.product; d.product = v; var rest = (d.products||[]).filter(function(x){ return x && x!==v && x!==old; }); d.products = v ? [v].concat(rest) : rest; var p = P(v); d.color = p ? p.colors[0] : ''; zb_patch(d); return; }
  d[k] = v;
  if(k==='pillar'){ var pl = zb_pillar(v); if(pl && (pl.secs||[]).indexOf(d.section)<0) d.section = zb_secOf(v); d.sub = ''; rerender(); return; }
  zb_patch(d);
};
CHANGE['zb-prod-add'] = function(el){ var d = zb_cur(); if(!d || !el.value) return; d.products = (d.products||[]).filter(Boolean); if(!d.product){ d.product = el.value; var p = P(el.value); d.color = p ? p.colors[0] : ''; d.products.unshift(el.value); } else if(d.products.indexOf(el.value)<0) d.products.push(el.value); rerender(); };
ACT['zb-prod-del'] = function(el){ var d = zb_cur(); if(!d) return; d.products = (d.products||[]).filter(function(x){ return x!==el.getAttribute('data-v'); }); rerender(); };
ACT['zb-ln-tg'] = function(el){
  var d = zb_cur(); if(!d) return; var h = el.getAttribute('data-h'); d.links = d.links || [];
  var i = d.links.map(function(l){ return l.h; }).indexOf(h);
  if(i>=0) d.links.splice(i,1); else d.links.push({k:el.getAttribute('data-k'), h:h, l:el.getAttribute('data-l')});
  zb_patch(d);
};
CHANGE['zb-who'] = function(el){
  var d = zb_cur(); if(!d) return; var k = el.getAttribute('data-k'), v = el.value;
  if(v && ((k==='proofer' && v===d.writer) || (k==='writer' && v===d.proofer))){ toast('লেখক আর প্রুফ একই জন হতে পারবে না'); el.value = d[k] || ''; return; }
  d[k] = v; zb_sign(d); if(d.pipe) zb_patch(d);
};
ACT['zb-lang'] = function(el){ var d = zb_cur(); if(!d) return; d.lang = el.getAttribute('data-v'); rerender(); };
ACT['zb-status'] = function(el){
  var d = zb_cur(); if(!d) return; var v = el.getAttribute('data-v');
  if(v!=='draft' && d.pipe && !zb_canPublish(d)){ toast('প্রুফ আর দূতের শেষ চেক পাস না করলে '+(v==='published'?'প্রকাশ':'সময় দেওয়া')+' হবে না'); return; }
  d.status = v; if(d.status==='scheduled' && !d.sched) d.sched = zb_local(Date.now()+ZB_D); rerender();
};
CHANGE['zb-when'] = function(el){ var d = zb_cur(); if(!d) return; d.sched = el.value; };
ACT['zb-cancel'] = function(el){ delete UI['zb-ed:'+el.getAttribute('data-id')]; go('#/admin/blog'); };
ACT['zb-save'] = function(el){
  var id = el.getAttribute('data-id'), d = UI['zb-ed:'+id]; if(!d) return;
  if(!String(d.title).trim()){ toast('লেখার একটা শিরোনাম দিন'); var t = document.getElementById('zb-title'); if(t) t.focus(); return; }
  if(!d.slug) d.slug = zb_jslug(d.title) || ('post-'+uid());
  if(d.proofer && d.proofer===d.writer){ toast('লেখক নিজের লেখা প্রুফ করতে পারবে না — অন্য কাউকে দিন'); return; }
  var was = id==='new' ? null : zb_get(d.id), reproof = false;
  /* a passed pipeline post whose words change goes back to proofreading (quality is the system's job) */
  /* (a live post the owner edits stays live — his own edit is his call; the change is noted in the comments) */
  if(d.pipe && was && was.status==='published' && (d.title!==was.title || d.body!==was.body || d.meta!==was.meta)) d.comments = (d.comments||[]).concat({by:'owner', t:'মালিক লাইভ লেখাটা বদলেছেন।', at:Date.now()});
  else if(d.pipe && was && d.passedBy && (d.title!==was.title || d.body!==was.body || d.meta!==was.meta || d.quickAnswer!==was.quickAnswer)){
    d.passedBy = ''; d.finalBy = ''; d.pipe = 'proof'; if(d.status!=='published') d.status = 'draft';
    d.comments = (d.comments||[]).concat({by:'owner', t:'লেখা বদলানো হয়েছে — আবার প্রুফ লাগবে।', at:Date.now()});
    reproof = true;   /* F11: told in the final message below, not overwritten */
  }
  if(d.pipe && d.status!=='draft' && !(was && was.status==='published' && d.status==='published') && !zb_canPublish(d)){ toast(reproof ? 'লেখা বদলেছে, তাই আবার প্রুফে যাবে — প্রুফ আর দূতের শেষ চেক পাস না করলে প্রকাশ হবে না। খসড়া বেছে সেভ করুন।' : 'প্রুফ আর দূতের শেষ চেক পাস না করলে প্রকাশ হবে না'); return; }
  if(d.status==='scheduled'){ var at = new Date(d.sched).getTime(); if(!(at > Date.now())){ toast('সামনের কোনো সময় বাছুন'); return; } d.at = at; if(d.pipe) d.pipe = 'scheduled'; }
  else if(d.status==='published'){ if(!was || was.status!=='published') d.at = Date.now(); if(d.pipe) d.pipe = 'published'; }
  else if(d.pipe==='scheduled' || d.pipe==='published'){ d.pipe = d.passedBy && d.finalBy ? 'ready' : 'proof'; }
  if(id==='new') d.id = 'p-'+uid();
  d.products = (d.products||[]).filter(function(x, i, a){ return x && P(x) && a.indexOf(x)===i; }); if(d.product && d.products.indexOf(d.product)<0) d.products.unshift(d.product);
  if(!d.product && d.products.length) d.product = d.products[0];
  var rec = zb_clone(d); rec.updatedAt = Date.now(); zb_sign(rec);
  zb_st().posts[rec.id] = rec; zb_commit();
  delete UI['zb-ed:'+id];
  go('#/admin/blog');
  toast(reproof ? 'সেভ হলো — লেখা বদলেছে, তাই আবার প্রুফে গেল (অন্য লেখক দেখবে, তারপর দূত)' : rec.status==='published' ? 'প্রকাশ হলো — দোকানের জার্নালে চালু' : rec.status==='scheduled' ? 'সময় দেওয়া হলো: '+dateTimeStr(rec.at) : 'খসড়া সেভ হলো');
};

/* =====================================================================
   BLOCKS FOR THE AGENTS AREA. 89b-admin-agents.js prints them itself
   (za_overTab → zb_dootNote on Doot's profile, admin-agents → zb_authorsOrg
   after the org chart) — integrated by Sawdagor, 19 Oct; no wrappers left.
   ===================================================================== */
function zb_dootNote(){
  if(!ST) return '';
  var all = zb_posts(), c = zb_cfg(), today = zb_pubDay(0, all).length, later = zb_dayPosts(0, all).length, tom = zb_dayPosts(1, all).length + zb_pubDay(1, all).length;
  var busy = all.filter(function(p){ return ['writing','proof','final'].indexOf(zb_stage(p))>=0; }).length, ready = zb_ready(all).length;
  var wk = 0; for(var i=0;i<7;i++) wk += zb_pubDay(-i, all).length;
  return '<section class="zs-card mb16 zb-dnote" data-testid="zb-doot-note"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">ব্লগ — আজকের লক্ষ্য বনাম কাজ</h2>'+zs_simTag('শুধু দেখার জন্য · ডেমো')+'</div>'+
    '<div class="zs-sub za-bn">দূত কনটেন্টের প্রধান — পাঁচ লেখক লেখে, দূত শেষ চেক করে। এখানে বদলানো যায় না; বদলাতে <a class="link" href="#/admin/blog?tab=sched">সময়সূচি</a>।</div>'+
    '<div class="zs-kpis k4" style="margin:0"><div class="zs-k '+(today>=c.perDay.min?'ok':'warn')+'"><div class="v">'+today+' / '+c.perDay.target+'</div><div class="l">আজ প্রকাশ</div><div class="s">কমপক্ষে '+c.perDay.min+' · আরো '+later+'টা সময়ে আছে</div></div>'+
      '<div class="zs-k '+(tom>=c.perDay.min?'ok':'warn')+'"><div class="v">'+tom+' / '+c.perDay.min+'</div><div class="l">কালকের লাইন</div><div class="s">'+(tom>=c.perDay.min?'ঠিক আছে':'কম — স্লট ভরতে হবে')+'</div></div>'+
      '<div class="zs-k"><div class="v">'+busy+' · '+ready+'</div><div class="l">চলছে · তৈরি</div><div class="s">লেখা/প্রুফ/চেক · প্রকাশের অপেক্ষায়</div></div>'+
      '<div class="zs-k"><div class="v">'+wk+' / '+(c.perDay.target*7)+'</div><div class="l">গত ৭ দিন</div><div class="s">প্রকাশ বনাম লক্ষ্য</div></div></div>'+
    '<div class="zs-actions mt12"><a class="btn btn-sm btn-secondary" href="#/admin/blog?tab=pipe">'+ico('eye',13)+'কাজের ধারা</a><a class="btn btn-sm btn-ghost" href="#/admin/blog?tab=authors">লেখক দল</a></div></section>';
}
function zb_authorsOrg(){
  if(!ST) return '';
  var c = zb_cfg();
  return '<section class="zs-card mt16 zb-aorg" data-testid="zb-authors-org"><div class="row between wrap" style="gap:8px"><h2 class="za-bn">দূতের লেখক দল</h2></div><div class="zs-sub za-bn">'+esc(zb_short(c.head))+'-এর অধীনে পাঁচ জুনিয়র লেখক — শুধু ব্লগ লেখা আর ব্লগের SEO-তে সাহায্য। বসে থাকলে খরচ ৳০।</div>'+
    '<div class="zb-aorg-row">'+zb_authors().map(function(a){ return '<a class="za-org-n" href="#/admin/blog?tab=authors&a='+a.id+'">'+zb_avatar(a.id, 'av')+'<span class="nm"><span class="za-bn">'+esc(a.bn)+'</span> · '+esc(a.name)+'<small title="এজেন্ট কোড: '+esc(a.code)+'"><span class="za-bn">'+esc((a.pillars||[a.pillar]).map(zb_pname).join(', '))+'</span></small></span></a>'; }).join('')+'</div></section>';
}
