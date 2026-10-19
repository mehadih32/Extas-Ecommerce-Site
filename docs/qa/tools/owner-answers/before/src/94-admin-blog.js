/* =====================================================================
   94-admin-blog.js — দূত Doot A360-06 · Blog & SEO (S12 PR 239–253, 528–530 · S11 PR 220–238)
   #/admin/blog              posts: list, filters, SEO score, index status
   #/admin/blog?tab=seo      sitemaps, indexing, Search Console, AI crawlers
   #/admin/blog/<id|new>     editor: title, slug, meta, focus keyword, language,
                             schedule, body, product link + live SEO checklist
   The shop's journal (#/journal) reads DB.journal: a post published here is
   put into DB.journal by zb_apply() at once; unpublishing never deletes —
   the post goes back to Draft (standing rule).
   DEMO: indexing / Search Console numbers are simulated. Posts are saved in
   this browser (ST.ops.blog). Prefix zb_.
   ===================================================================== */
zo_route(/^\/admin\/blog$/, 'zb-list');
zo_route(/^\/admin\/blog\/([\w-]+)$/, 'zb-edit');
zo_link(['Blog & SEO','#/admin/blog','globe','Blog & SEO']);

var ZB_SNAP = JSON.parse(JSON.stringify(DB.journal || []));
function zb_st(){ var o = zo_ops(); if(!o.blog) o.blog = {posts:{}, idx:{}, sitemapAt:Date.now()-5*3600000, ai:true, gsc:true}; return o.blog; }
function zb_jslug(t){ return typeof hm_journalSlug==='function' ? hm_journalSlug({t:t}) : zo_slug(t); }
/* seed posts = the shop's real journal (published, English) + two Bengali drafts */
function zb_seeds(){
  var D = 86400000, now = Date.now();
  var out = ZB_SNAP.map(function(a, i){ return {id:'j'+i, seed:i, title:a.t, slug:zb_jslug(a.t), slugAuto:true, meta:a.x, kw:'', lang:'en', status:'published', at:now-(ZB_SNAP.length-i)*4*D, sched:'',
    body:a.x, product:a.p, color:a.c, section:String(a.e||'').split(' · ')[0] || 'Style'}; });
  out.push({id:'d-bn-1', title:'ঢাকার গরমে কোন পোলো আরাম দেয়', slug:'dhaka-gorome-polo', slugAuto:false, meta:'ঢাকার গরমে আরামের পোলো বাছাই: কাপড়ের GSM, ফিট আর রং — কোনটা কখন পরবেন, সহজ ভাষায়।', kw:'পোলো', lang:'bn', status:'draft', at:now-D, sched:'',
    body:'পোলো শার্ট কেনার আগে তিনটা জিনিস দেখুন — কাপড়, ফিট আর রং। ঢাকার গরমে ২২০ GSM কটন পিকে সবচেয়ে আরামের।', product:'rl-solid-polo', color:'white', section:'Fabric'});
  out.push({id:'d-bn-2', title:'ঈদে পাঞ্জাবির সাইজ ঠিক করার নিয়ম', slug:'eid-panjabi-size', slugAuto:false, meta:'', kw:'পাঞ্জাবির সাইজ', lang:'bn', status:'scheduled', at:now+3*D, sched:zb_local(now+3*D),
    body:'পাঞ্জাবির সাইজ ঠিক করতে বুক, লম্বা আর হাতা মাপুন।', product:'classic-cotton-panjabi', color:'white', section:'Size guide'});
  return out;
}
function zb_local(ts){ var d = new Date(ts); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0,16); }
function zb_posts(){
  var s = zb_st(), seeds = zb_seeds(), map = {};
  seeds.forEach(function(p){ map[p.id] = p; });
  Object.keys(s.posts).forEach(function(id){ map[id] = Object.assign({}, map[id]||{}, JSON.parse(JSON.stringify(s.posts[id]))); });
  var list = Object.keys(map).map(function(k){ var p = map[k]; if(p.status==='scheduled' && p.at<=Date.now()) p.status = 'published'; return p; });
  return list.sort(function(a,b){ return b.at - a.at; });
}
function zb_get(id){ return zb_posts().filter(function(p){ return p.id===id; })[0] || null; }
function zb_entry(p){
  var o = p.seed!=null ? ZB_SNAP[p.seed] : null, words = zb_words(p.body);
  /* an untouched journal piece keeps its original section line exactly */
  var e = o && p.section===String(o.e||'').split(' · ')[0] && p.body===o.x ? o.e : (p.section||'Style')+' · '+Math.max(2, Math.round(words/200))+' min read';
  return {t:p.title, e:e, x:p.meta || String(p.body||'').slice(0,160), p:p.product || 'essential-pique-polo', c:p.color || '', slug:p.slug, body:p.body, lang:p.lang};
}
/* the shop journal follows the posts (newest last, the home slider shows the last ten) */
function zb_apply(){
  if(!DB.journal) return;
  var posts = zb_posts().filter(function(p){ return p.status==='published'; }).sort(function(a,b){ return a.at - b.at; });
  DB.journal.length = 0;
  posts.forEach(function(p){ DB.journal.push(zb_entry(p)); });
}
ZO_APPLY.push(zb_apply);
function zb_words(t){ return String(t||'').trim().split(/\s+/).filter(Boolean).length; }
function zb_kwIn(kw, t){ kw = String(kw||'').toLowerCase().trim(); return !!kw && String(t||'').toLowerCase().indexOf(kw)>=0; }
function zb_checks(p){
  var kw = String(p.kw||'').trim(), first = String(p.body||'').split(/\n\s*\n/)[0], tl = String(p.title||'').length, ml = String(p.meta||'').length, w = zb_words(p.body);
  return [
    ['kw', !!kw, 'Focus keyword chosen', 'মূল কিওয়ার্ড দেওয়া'],
    ['title', zb_kwIn(kw, p.title), 'Keyword in the title', 'শিরোনামে কিওয়ার্ড'],
    ['slug', !!kw && (zb_kwIn(zo_slug(kw), p.slug) || zb_kwIn(kw, p.slug)), 'Keyword in the link (slug)', 'লিংকে কিওয়ার্ড'],
    ['meta', zb_kwIn(kw, p.meta), 'Keyword in the meta description', 'বর্ণনায় কিওয়ার্ড'],
    ['first', zb_kwIn(kw, first), 'Keyword in the first paragraph', 'প্রথম প্যারায় কিওয়ার্ড'],
    ['tlen', tl>=25 && tl<=60, 'Title 25–60 characters ('+tl+')', 'শিরোনাম ২৫–৬০ অক্ষর'],
    ['mlen', ml>=120 && ml<=160, 'Meta description 120–160 characters ('+ml+')', 'বর্ণনা ১২০–১৬০ অক্ষর'],
    ['words', w>=300, 'At least 300 words ('+w+')', 'অন্তত ৩০০ শব্দ'],
    ['prod', !!p.product, 'Links to a product', 'একটা প্রোডাক্টের লিংক'],
    ['slen', !!p.slug && p.slug.length<=60 && /^[a-z0-9-]+$/.test(p.slug), 'Short, clean link', 'ছোট, পরিষ্কার লিংক']
  ];
}
function zb_score(p){ var c = zb_checks(p); return Math.round(c.filter(function(x){ return x[1]; }).length / c.length * 100); }
function zb_scorePill(n){ return '<span class="zo-pill '+(n>=80?'ok':n>=50?'warn':'bad')+'">SEO '+n+'</span>'; }
function zb_idx(p){
  var s = zb_st(); if(s.idx[p.id]) return s.idx[p.id];
  if(p.status!=='published') return 'none';
  return zs_rnd('idx'+p.id) < .78 ? 'indexed' : 'discovered';
}
var ZB_IDX = {indexed:['Indexed','ok','গুগলে আছে'], discovered:['Found, not indexed yet','warn','গুগল দেখেছে, এখনো তোলেনি'], submitted:['Requested','info','অনুরোধ পাঠানো'], none:['Not live','','এখনো চালু না']};
var ZB_STAT = {published:['Published','ok'], scheduled:['Scheduled','info'], draft:['Draft','']};

/* ---------- list ---------- */
PAGES['zb-list'] = { layout:'admin', title:'Blog & SEO', render:function(params, q){
  var tab = (q && q.tab) || 'posts', all = zb_posts();
  var tabs = zo_tabs('#/admin/blog', [['posts','Posts', all.length],['seo','Sitemap & indexing']], tab);
  return '<div class="zs-page zb-page">'+
    zo_head('Admin · Content '+zs_pr('220–253 · 528–530'), 'Blog & SEO', 'ব্লগ আর SEO — গুগলে খুঁজে পাওয়ার জন্য',
      'লেখা বানান, শিরোনাম আর বর্ণনা ঠিক করুন, কিওয়ার্ড দিন — পাশে SEO চেকলিস্ট বলে দেবে কী বাকি। পাবলিশ করলে দোকানের Journal-এ সাথে সাথে চলে যায়।',
      zs_simTag('Indexing simulated')+'<a class="btn btn-primary" href="#/admin/blog/new" data-testid="zb-new">'+ico('plus',16)+'New post</a>')+
    tabs+(tab==='seo' ? zb_seoTab(all) : zb_postsTab(all))+'</div>';
}};
function zb_postsTab(all){
  var u = ui('zb-list', {st:'all', lang:'all'});
  var list = all.filter(function(p){ return (u.st==='all' || p.status===u.st) && (u.lang==='all' || p.lang===u.lang); });
  var cnt = function(k){ return k==='all' ? all.length : all.filter(function(p){ return p.status===k; }).length; };
  var avg = Math.round(all.reduce(function(s,p){ return s + zb_score(p); }, 0)/Math.max(1,all.length));
  return '<div class="zs-kpis k4">'+
      '<div class="zs-k"><div class="v">'+cnt('published')+'</div><div class="l">Published</div><div class="s">on the shop journal</div></div>'+
      '<div class="zs-k"><div class="v">'+cnt('scheduled')+'</div><div class="l">Scheduled</div><div class="s">goes live by itself</div></div>'+
      '<div class="zs-k"><div class="v">'+cnt('draft')+'</div><div class="l">Drafts</div><div class="s">waiting for you</div></div>'+
      '<div class="zs-k '+(avg>=80?'ok':'warn')+'"><div class="v">'+avg+'</div><div class="l">Average SEO score</div><div class="s">of 100</div></div>'+
    '</div>'+
    '<div class="zs-tabs">'+[['all','All'],['published','Published'],['scheduled','Scheduled'],['draft','Drafts']].map(function(s){ return '<button type="button" class="chip'+(u.st===s[0]?' on':'')+'" data-act="zb-f" data-k="st" data-v="'+s[0]+'">'+s[1]+' <span class="zo-cnt">'+cnt(s[0])+'</span></button>'; }).join('')+
      '<span class="zb-sep"></span>'+[['all','Any language'],['en','English'],['bn','বাংলা']].map(function(s){ return '<button type="button" class="chip'+(u.lang===s[0]?' on':'')+'" data-act="zb-f" data-k="lang" data-v="'+s[0]+'">'+s[1]+'</button>'; }).join('')+'</div>'+
    '<section class="zs-card zb-listcard">'+(list.map(zb_row).join('') || '<div class="zs-empty">No posts here.</div>')+'</section>';
}
function zb_row(p){
  var st = ZB_STAT[p.status] || ZB_STAT.draft, ix = ZB_IDX[zb_idx(p)];
  return '<div class="zb-row" data-testid="zb-row"><div class="zb-main"><a class="zb-t'+(p.lang==='bn'?' za-bn':'')+'" href="#/admin/blog/'+p.id+'">'+esc(p.title || 'Untitled')+'</a>'+
    '<div class="zs-mini zb-m">/'+esc(p.slug||'')+' · '+(p.status==='scheduled' ? 'goes live '+dateTimeStr(p.at) : dateStr(p.at))+'</div>'+
    '<div class="zb-pills"><span class="zo-pill">'+(p.lang==='bn'?'বাংলা':'English')+'</span><span class="zo-pill '+st[1]+'">'+st[0]+'</span>'+zb_scorePill(zb_score(p))+'<span class="zo-pill '+ix[1]+'" title="'+esc(ix[2])+'">'+ix[0]+'</span></div></div>'+
    '<div class="zb-act"><a class="btn btn-sm btn-secondary" href="#/admin/blog/'+p.id+'">'+ico('edit',14)+'Edit</a>'+(p.status==='published' ? '<a class="btn btn-sm btn-ghost" href="#/journal/'+zb_jslug(p.title)+'" aria-label="View '+esc(p.title)+' on the shop">'+ico('eye',14)+'<span class="zo-hide-s">View</span></a>' : '')+'</div></div>';
}
ACT['zb-f'] = function(el){ ui('zb-list',{})[el.getAttribute('data-k')] = el.getAttribute('data-v'); rerender(); };

/* ---------- sitemap & indexing ---------- */
function zb_seoTab(all){
  var s = zb_st(), pub = all.filter(function(p){ return p.status==='published'; });
  var combos = 0, rules = 0; try{ ca_activeRules().forEach(function(r){ rules++; combos += ca_generate(r).visible.length; }); }catch(e){}
  var maps = [['products.xml','Products', DB.products.length],['categories.xml','Categories', DB.categories.filter(function(c){ return !c.hidden; }).length + (DB.subcats||[]).length],['combos.xml','Combo pages + pairs', rules + combos],['blog.xml','Blog posts', pub.length],['pages.xml','Help pages', 8]];
  var total = maps.reduce(function(a,m){ return a + m[2]; }, 0);
  var ix = pub.map(function(p){ return zb_idx(p); }), nIdx = ix.filter(function(x){ return x==='indexed'; }).length;
  return '<div class="zs-kpis k4">'+
      '<div class="zs-k"><div class="v">'+total+'</div><div class="l">Links in sitemaps</div><div class="s">'+maps.length+' files</div></div>'+
      '<div class="zs-k ok"><div class="v">'+nIdx+' / '+pub.length+'</div><div class="l">Posts on Google</div><div class="s">indexed · simulated</div></div>'+
      '<div class="zs-k"><div class="v">'+(s.gsc?'Connected':'Off')+'</div><div class="l">Search Console</div><div class="s">+ Bing Webmaster</div></div>'+
      '<div class="zs-k"><div class="v">'+esc(zs_time(s.sitemapAt).split(' · ')[1])+'</div><div class="l">Sitemaps rebuilt</div><div class="s">'+esc(zs_time(s.sitemapAt).split(' · ')[0])+' · on every change</div></div>'+
    '</div>'+
    '<div class="zs-g2">'+
      '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Sitemaps</h2><span class="row" style="gap:6px">'+zs_pr('228')+zs_simTag()+'</span></div><div class="zs-sub za-bn">গুগলকে দেওয়া পেজের তালিকা — নতুন কিছু এলে নিজে আপডেট হয়</div>'+
        maps.map(function(m){ return '<div class="zs-row"><div class="grow"><div class="small bold">'+esc(m[1])+'</div><div class="zs-mini mono">/sitemaps/'+m[0]+'</div></div><b class="small">'+m[2]+' links</b></div>'; }).join('')+
        '<div class="zs-actions mt12"><button type="button" class="btn btn-sm btn-secondary" data-act="zb-remap">'+ico('swap',14)+'Rebuild now</button></div></section>'+
      '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Search engines &amp; AI</h2>'+zs_pr('229 · 233')+'</div><div class="zs-sub za-bn">গুগল, বিং আর AI অ্যাসিস্ট্যান্ট যেন দোকান খুঁজে পায়</div>'+
        '<div class="zs-row"><div class="grow"><div class="small bold">Google Search Console</div><div class="zs-mini">Verified · sitemaps sent · demo</div></div>'+zs_sw(s.gsc, 'zb-gsc', 'Search Console connected')+'</div>'+
        '<div class="zs-row"><div class="grow"><div class="small bold">Let AI assistants read the shop</div><div class="zs-mini za-bn">ChatGPT, Claude, Perplexity, Google AI — চালু থাকলে তারা দোকানের কথা বলতে পারে (ডিফল্ট চালু)</div></div>'+zs_sw(s.ai, 'zb-ai', 'AI crawlers allowed')+'</div>'+
        '<div class="zs-row"><div class="grow"><div class="small bold">Out-of-stock pages stay live</div><div class="zs-mini">No product link is ever deleted (PR 527)</div></div><span class="tag">'+ico('lock',12)+'Always</span></div>'+
        '<div class="zs-row"><div class="grow"><div class="small bold">Bengali site (/bn)</div><div class="zs-mini">Built, switched off — English is live (PR 220). Bengali posts still publish on the journal.</div></div><span class="zo-pill">Off</span></div>'+
      '</section></div>'+
    '<section class="zs-card zo-mt"><div class="row between wrap" style="gap:8px"><h2>Indexing — post by post</h2>'+zs_simTag()+'</div><div class="zs-sub za-bn">কোন লেখা গুগলে উঠেছে; না উঠলে "Request indexing" চাপুন</div>'+
      (pub.length ? '<div class="zs-list">'+pub.map(function(p){ var x = ZB_IDX[zb_idx(p)]; return '<div class="zs-li"><div style="min-width:0"><div class="t'+(p.lang==='bn'?' za-bn':'')+'">'+esc(p.title)+'</div><div class="m">/journal/'+esc(zb_jslug(p.title))+' · <span class="za-bn">'+esc(x[2])+'</span></div></div>'+
        '<div class="r"><span class="zo-pill '+x[1]+'">'+x[0]+'</span>'+(zb_idx(p)==='discovered' ? '<button type="button" class="btn btn-sm btn-ghost" data-act="zb-reqidx" data-id="'+p.id+'">Request indexing</button>' : '')+'</div></div>'; }).join('')+'</div>' : '<div class="zs-mini">No published posts.</div>')+'</section>';
}
ACT['zb-remap'] = function(){ zb_st().sitemapAt = Date.now(); saveState(); rerender(); toast('Sitemaps rebuilt and sent to Google and Bing (demo)'); };
ACT['zb-gsc'] = function(){ var s = zb_st(); s.gsc = !s.gsc; saveState(); rerender(); toast(s.gsc ? 'Search Console connected (demo)' : 'Search Console disconnected'); };
ACT['zb-ai'] = function(){ var s = zb_st(); s.ai = !s.ai; saveState(); rerender(); toast(s.ai ? 'AI assistants may read the shop' : 'AI crawlers blocked in robots.txt'); };
ACT['zb-reqidx'] = function(el){ zb_st().idx[el.getAttribute('data-id')] = 'submitted'; saveState(); rerender(); toast('Indexing requested — usually a few days (demo)'); };

/* ---------- editor ---------- */
function zb_draft(id){
  var key = 'zb-ed:'+id; if(UI[key]) return UI[key];
  var p = id==='new' ? {id:'', title:'', slug:'', slugAuto:true, meta:'', kw:'', lang:'en', status:'draft', at:Date.now(), sched:'', body:'', product:'', color:'', section:'Style'} : zb_get(id);
  if(!p) return null;
  UI[key] = JSON.parse(JSON.stringify(p)); return UI[key];
}
PAGES['zb-edit'] = { layout:'admin', title:function(params){ return params[0]==='new' ? 'New post' : 'Edit post'; }, render:function(params){
  var id = params[0], d = zb_draft(id);
  if(!d) return '<div class="zs-page"><a class="link xs" href="#/admin/blog">'+ico('back',13)+' All posts</a><div class="zs-empty mt16">This post does not exist.</div></div>';
  var prods = DB.products.slice(0, 40);
  var st = ZB_STAT[d.status] || ZB_STAT.draft;
  return '<div class="zs-page zb-page">'+
    '<a class="link xs" href="#/admin/blog">'+ico('back',13)+' All posts</a>'+
    zo_head('Admin · Content '+zs_pr('239–245 · 249 · 528'), id==='new' ? 'New post' : 'Edit post', 'লেখা — শিরোনাম, লিংক, বর্ণনা, কিওয়ার্ড', '', '<span class="zo-pill '+st[1]+'">'+st[0]+'</span>')+
    '<div class="zp-ed">'+
      '<div class="zp-edmain">'+
        '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Post</h2>'+
          '<div class="zs-tier" role="group" aria-label="Language"><button type="button" class="'+(d.lang==='en'?'on':'')+'" data-act="zb-lang" data-v="en">English</button><button type="button" class="'+(d.lang==='bn'?'on':'')+'" data-act="zb-lang" data-v="bn">বাংলা</button></div></div>'+
          '<div class="zp-f mt12"><label class="label" for="zb-title">Title <span class="zs-mini za-bn">শিরোনাম</span> <span class="zs-mini zb-cnt" id="zb-c-title">'+String(d.title).length+' / 60</span></label><input id="zb-title" class="input zs-in'+(d.lang==='bn'?' za-bn':'')+'" type="text" value="'+esc(d.title)+'" data-input="zb-f" data-k="title" placeholder="e.g. How to pick your polo size" data-testid="zb-title"></div>'+
          '<div class="zp-f"><label class="label" for="zb-slug">Link (slug) <span class="zs-mini za-bn">লিংক — ইংরেজিতে</span></label><div class="zb-slug"><span class="zs-mini">/journal/</span><input id="zb-slug" class="input zs-in" type="text" value="'+esc(d.slug)+'" data-input="zb-f" data-k="slug" placeholder="how-to-pick-your-polo-size"></div><div class="zs-mini mt8" id="zb-slugnote">'+(d.slugAuto ? 'Made from the title — type here to set your own.' : 'Your own link. ')+(d.status==='published' ? ' Changing a live link adds a redirect from the old one (PR 235).' : '')+'</div></div>'+
          '<div class="zp-f"><label class="label" for="zb-meta">Meta description <span class="zs-mini za-bn">গুগলে যে লাইন দেখায়</span> <span class="zs-mini zb-cnt" id="zb-c-meta">'+String(d.meta).length+' / 160</span></label><textarea id="zb-meta" class="input zs-in zp-ta'+(d.lang==='bn'?' za-bn':'')+'" rows="2" data-input="zb-f" data-k="meta" placeholder="One or two sentences that make someone click">'+esc(d.meta)+'</textarea></div>'+
          '<div class="za-f2"><div class="zp-f"><label class="label" for="zb-kw">Focus keyword <span class="zs-mini za-bn">মূল কিওয়ার্ড</span></label><input id="zb-kw" class="input zs-in" type="text" value="'+esc(d.kw)+'" data-input="zb-f" data-k="kw" placeholder="e.g. polo size" data-testid="zb-kw"></div>'+
            '<div class="zp-f"><label class="label" for="zb-sec">Section</label><select id="zb-sec" class="input zs-in" data-change="zb-sel" data-k="section">'+['Style','Size guide','Fit guide','Fabric','Care','Winter','Behind EXTAS'].map(function(x){ return '<option'+(d.section===x?' selected':'')+'>'+x+'</option>'; }).join('')+'</select></div></div>'+
          '<div class="zp-f"><label class="label" for="zb-body">Article <span class="zs-mini za-bn">মূল লেখা — প্যারার মাঝে একটা খালি লাইন</span> <span class="zs-mini zb-cnt" id="zb-c-body">'+zb_words(d.body)+' words</span></label><textarea id="zb-body" class="input zs-in zp-ta zb-body'+(d.lang==='bn'?' za-bn':'')+'" rows="10" data-input="zb-f" data-k="body" placeholder="Write the article here…">'+esc(d.body)+'</textarea></div>'+
          '<div class="zp-f"><label class="label" for="zb-prod">Product this post is about <span class="zs-mini za-bn">লেখার সাথে যে প্রোডাক্ট দেখাবে</span></label><select id="zb-prod" class="input zs-in" data-change="zb-sel" data-k="product"><option value="">— none —</option>'+prods.map(function(p){ return '<option value="'+p.id+'"'+(d.product===p.id?' selected':'')+'>'+esc(p.name)+'</option>'; }).join('')+'</select></div>'+
        '</section>'+
        '<section class="zs-card"><h2>Publish</h2><div class="zs-sub za-bn">এখনই, পরে কোনো সময়, না খসড়া</div>'+
          '<div class="zs-pages">'+[['draft','Draft'],['scheduled','Schedule'],['published','Publish now']].map(function(s){ var on = d.status===s[0]; return '<button type="button" class="chip'+(on?' on':'')+'" data-act="zb-status" data-v="'+s[0]+'">'+(on?ico('check',13):'')+s[1]+'</button>'; }).join('')+'</div>'+
          (d.status==='scheduled' ? '<div class="zp-f mt12"><label class="label" for="zb-when">Goes live on</label><input id="zb-when" class="input zs-in" type="datetime-local" value="'+esc(d.sched || zb_local(Date.now()+86400000))+'" data-change="zb-when"></div>' : '')+
          '<div class="zs-mini mt8">'+(d.status==='published' ? 'Live on the shop journal after Save.' : d.status==='scheduled' ? 'Publishes by itself at that time (Asia/Dhaka).' : 'Only you can see a draft.')+' Unpublishing never deletes a post.</div></section>'+
      '</div>'+
      '<aside class="zp-edside">'+
        '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>SEO checklist</h2><span id="zb-score">'+zb_scorePill(zb_score(d))+'</span></div><div class="zs-sub za-bn">সবুজ = ঠিক আছে, ধূসর = বাকি</div><div id="zb-checks">'+zb_checksHTML(d)+'</div></section>'+
        '<section class="zs-card"><h2>Google preview</h2><div class="zs-sub za-bn">সার্চে যেমন দেখাবে</div><div id="zb-prev">'+zb_prevHTML(d)+'</div></section>'+
      '</aside>'+
    '</div>'+
    '<div class="zp-savebar"><div class="zp-savein"><span class="zs-mini zo-hide-s">Saved only when you press Save</span><a class="btn btn-ghost" href="#/admin/blog" data-act="zb-cancel" data-id="'+id+'">Cancel</a><button type="button" class="btn btn-primary" data-act="zb-save" data-id="'+id+'" data-testid="zb-save">'+ico('check',16)+'Save</button></div></div>'+
  '</div>';
}};
function zb_checksHTML(d){ return '<div class="zb-checks">'+zb_checks(d).map(function(c){ return '<div class="zb-ck'+(c[1]?' ok':'')+'"><span class="zb-ckd">'+(c[1]?ico('check',11):'')+'</span><span style="min-width:0"><span class="small">'+esc(c[2])+'</span><span class="zs-mini za-bn" style="display:block">'+esc(c[3])+'</span></span></div>'; }).join('')+'</div>'; }
function zb_prevHTML(d){ return '<div class="zb-g"><div class="zb-gu">extas.com.bd › journal › '+esc(d.slug||'…')+'</div><div class="zb-gt'+(d.lang==='bn'?' za-bn':'')+'">'+esc(d.title || 'Post title')+' | EXTAS</div><div class="zb-gd'+(d.lang==='bn'?' za-bn':'')+'">'+esc((d.meta || String(d.body||'').slice(0,155) || 'The meta description shows here.').slice(0,160))+'</div></div>'; }
function zb_cur(){ var id = CUR.params && CUR.params[0]; return id ? UI['zb-ed:'+id] : null; }
function zb_patch(d){
  var set = function(id, h){ var e = document.getElementById(id); if(e) e.innerHTML = h; };
  set('zb-checks', zb_checksHTML(d)); set('zb-score', zb_scorePill(zb_score(d))); set('zb-prev', zb_prevHTML(d));
  var c = function(id, t){ var e = document.getElementById(id); if(e) e.textContent = t; };
  c('zb-c-title', String(d.title).length+' / 60'); c('zb-c-meta', String(d.meta).length+' / 160'); c('zb-c-body', zb_words(d.body)+' words');
}
INPUT['zb-f'] = function(el){
  var d = zb_cur(); if(!d) return; var k = el.getAttribute('data-k');
  if(k==='slug'){ d.slug = zo_slug(el.value) || ''; d.slugAuto = false; }
  else d[k] = el.value;
  if(k==='title' && d.slugAuto){ d.slug = zb_jslug(d.title); var s = document.getElementById('zb-slug'); if(s) s.value = d.slug; }
  zb_patch(d);
};
CHANGE['zb-sel'] = function(el){ var d = zb_cur(); if(!d) return; d[el.getAttribute('data-k')] = el.value; if(el.getAttribute('data-k')==='product'){ var p = P(el.value); d.color = p ? p.colors[0] : ''; } zb_patch(d); };
ACT['zb-lang'] = function(el){ var d = zb_cur(); if(!d) return; d.lang = el.getAttribute('data-v'); rerender(); };
ACT['zb-status'] = function(el){ var d = zb_cur(); if(!d) return; d.status = el.getAttribute('data-v'); if(d.status==='scheduled' && !d.sched) d.sched = zb_local(Date.now()+86400000); rerender(); };
CHANGE['zb-when'] = function(el){ var d = zb_cur(); if(!d) return; d.sched = el.value; };
ACT['zb-cancel'] = function(el){ delete UI['zb-ed:'+el.getAttribute('data-id')]; go('#/admin/blog'); };
ACT['zb-save'] = function(el){
  var id = el.getAttribute('data-id'), d = UI['zb-ed:'+id]; if(!d) return;
  if(!String(d.title).trim()){ toast('Give the post a title'); var t = document.getElementById('zb-title'); if(t) t.focus(); return; }
  if(!d.slug) d.slug = zb_jslug(d.title) || ('post-'+uid());
  if(d.status==='scheduled'){ var at = new Date(d.sched).getTime(); if(!(at > Date.now())){ toast('Pick a time in the future'); return; } d.at = at; }
  else if(d.status==='published'){ var was = zb_get(d.id); if(!was || was.status!=='published') d.at = Date.now(); }
  if(id==='new') d.id = 'p-'+uid();
  var rec = JSON.parse(JSON.stringify(d));
  zb_st().posts[rec.id] = rec; zb_apply(); saveState();
  delete UI['zb-ed:'+id];
  go('#/admin/blog'); toast(rec.status==='published' ? 'Published — live on the shop journal' : rec.status==='scheduled' ? 'Scheduled for '+dateTimeStr(rec.at) : 'Draft saved');
};
