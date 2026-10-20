/* =====================================================================
   89v-admin-server.js — প্রহরী Prohori · server pages (Version 12)
   CN-001 (owner server spec, approved 19 Oct 23:33 · ROUND15 Note 48)
     #/admin/server        Server page — machine, per-service RAM/CPU, disks,
                           NVMe boot unit, services, cache hit %, CDN traffic,
                           slowest queries, Telegram alert rules
                           (PR 423 · 601 · 603 · 604 · 9)
     #/admin/cache         Four-layer cache, durations, purge rules, Clear all (PR 602)
     #/admin/images        Image sizes, formats, quality, storage, CDN (PR 22 · 24 · 88)
     #/admin/speed         Monthly Dhaka 4G phone measurement (PR 234)
     #/admin/integrations  Keys & connections (vault, PR 493) — Blob key lives here
     #/admin/backup        (re-rendered here) Blob + Google Drive, restore to any
                           minute, monthly restore test (PR 8 · 395 · 507)
   DEMO ONLY: every number is a SAMPLE and is labelled so; state lives in
   ST.srv (and ST.sys.backup for the backup page). No IPs, no keys, nothing
   is sent anywhere. What is typed into a key box is never kept — only
   "connected" is remembered.
   Language: English by default, Bengali when ST.adminLang==='bn'. Every
   label here is written in both (zv_l) so English mode has no Bengali and
   needs no dictionary entry. Nothing here touches the storefront.
   ===================================================================== */

/* ---------- language + small helpers ---------- */
function zv_bn(){ return typeof al_lang==='function' && al_lang()==='bn'; }
function zv_l(en, bn){ return zv_bn() ? bn : en; }
function zv_ago(ts){
  var m = Math.max(0, Math.round((Date.now()-ts)/60000));
  if(m<1) return zv_l('just now','এইমাত্র');
  if(m<60) return zv_l(m+' min ago', m+' মিনিট আগে');
  var h = Math.round(m/60); if(h<48) return zv_l(h+' h ago', h+' ঘণ্টা আগে');
  var d = Math.round(h/24); return zv_l(d+' days ago', d+' দিন আগে');
}
function zv_time(ts){ return typeof zs_time==='function' ? zs_time(ts) : new Date(ts).toLocaleString('en-GB'); }
function zv_pill(kind, txt){ return '<span class="zv-pill '+kind+'">'+(kind==='ok'?ico('check',12):ico('info',12))+esc(txt)+'</span>'; }
function zv_sample(){ return zs_simTag(zv_l('Sample numbers · demo','নমুনা সংখ্যা · ডেমো')); }
function zv_route(re, name){ try{ if(!ROUTES.some(function(r){ return r[1]===name; })) ROUTES.push([re, name]); }catch(e){} }
zv_route(/^\/admin\/server$/, 'admin-server');
zv_route(/^\/admin\/cache$/, 'admin-cache');
zv_route(/^\/admin\/images$/, 'admin-images');
zv_route(/^\/admin\/speed$/, 'admin-speed');
zv_route(/^\/admin\/integrations$/, 'admin-integrations');

/* ---------- admin menu: System group (89 reads ZS_SYS_LINKS on every render) ---------- */
(function(){
  try{
    if(typeof ZS_SYS_LINKS==='undefined') return;
    [['Server','#/admin/server','layers'],['Cache','#/admin/cache','swap'],['Images','#/admin/images','camera'],['Speed','#/admin/speed','clock'],['Keys & connections','#/admin/integrations','lock']].forEach(function(l){
      if(!ZS_SYS_LINKS.some(function(x){ return x[1]===l[1]; })) ZS_SYS_LINKS.push(l);
    });
  }catch(e){}
  /* the Settings page row "Backup destination" said "Google Drive only" — CN-001 adds Azure Blob */
  try{
    (ZS_SETTINGS||[]).forEach(function(r){
      if(r.id!=='inst.backup') return;
      r.bn = 'ব্যাকআপ কোথায় যাবে — Azure Blob আর গুগল ড্রাইভ';
      r.opts = [['both','Azure Blob + Google Drive (fixed)']];
      r.get = function(){ return 'both'; }; r.def = function(){ return 'both'; };
    });
  }catch(e){}
})();

/* the strip of server pages at the top of each one */
var ZV_TABS = [['server','#/admin/server','Server','সার্ভার'],['cache','#/admin/cache','Cache','ক্যাশ'],['images','#/admin/images','Images','ছবি'],['speed','#/admin/speed','Speed','গতি'],['backup','#/admin/backup','Backup','ব্যাকআপ'],['keys','#/admin/integrations','Keys & connections','চাবি ও সংযোগ']];
function zv_tabs(cur){
  return '<nav class="zs-tabs zv-tabs" aria-label="'+esc(zv_l('Server pages','সার্ভারের পাতা'))+'">'+ZV_TABS.map(function(t){
    return '<a class="chip'+(t[0]===cur?' on':'')+'" href="'+t[1]+'"'+(t[0]===cur?' aria-current="page"':'')+'>'+esc(zv_l(t[2], t[3]))+'</a>'; }).join('')+'</nav>';
}

/* ---------- demo state ---------- */
function zv_st(){
  var s = ST.srv;
  if(!s || s.v!==1){
    var now = Date.now(), D = 86400000, H = 3600000;
    s = ST.srv = {v:1, seed:0, nvme:'ok', nvmeAt: now - 3*D - 7*H, prof:'here',
      alerts:{disk:{on:true, v:80}, down:{on:true, v:2}, backup:{on:true, v:1}, slow:{on:true, v:1500}, nvme:{on:true, v:1}},
      log:[{at:now - 3*D - 7*H + 120000, k:'nvme-ok'}, {at:now - 6*D - 4*H, k:'disk-ok'}],
      cache:{cat:5, pdp:5, stock:15, settings:60, areas:24, cleared:now - 9*D},
      img:{q:78, store:'blob', cdn:true},
      speed:{runs:[
        {at:new Date(2026, 9, 1, 3, 0).getTime(), auto:true, v:{lcp:2.2, cls:0.03, inp:150, ttfb:420, cat:1.06, adm:0.7}},
        {at:new Date(2026, 8, 1, 3, 0).getTime(), auto:true, v:{lcp:2.6, cls:0.05, inp:190, ttfb:510, cat:1.24, adm:0.9}},
        {at:new Date(2026, 7, 1, 3, 0).getTime(), auto:true, v:{lcp:2.9, cls:0.08, inp:240, ttfb:560, cat:1.41, adm:1.1}}
      ]},
      keys:{drive:{on:true}, drive2:{on:true}, blob:{on:false}, cf:{on:true}, tg:{on:true}}
    };
  }
  return s;
}
function zv_blobOn(){ return !!zv_st().keys.blob.on; }

/* =====================================================================
   1. SERVER PAGE (PR 423 · 601 · 603 · 604)
   ===================================================================== */
var ZV_SVC = [
  {k:'pg',    en:'Database (PostgreSQL)',    bn:'ডাটাবেস (PostgreSQL)',        ram:12.6, cpu:0.9, cl:3},
  {k:'redis', en:'Cache (Redis)',            bn:'ক্যাশ (Redis)',               ram:3.4,  cpu:0.2, cl:1},
  {k:'meili', en:'Site search (Meilisearch)', bn:'সাইট সার্চ (Meilisearch)',   ram:1.7,  cpu:0.1, cl:null},
  {k:'app',   en:'Website app × 6',          bn:'ওয়েবসাইট অ্যাপ × ৬',          ram:9.6,  cpu:1.2, cl:6},
  {k:'media', en:'Image / video worker',     bn:'ছবি / ভিডিও ওয়ার্কার',       ram:5.3,  cpu:1.4, cl:2},
  {k:'jobs',  en:'Background jobs',          bn:'ব্যাকগ্রাউন্ডের কাজ',          ram:1.1,  cpu:0.3, cl:1},
  {k:'caddy', en:'Web gate (Caddy)',         bn:'ওয়েব গেট (Caddy)',            ram:0.2,  cpu:0.1, cl:1},
  {k:'os',    en:'Operating system & rest',  bn:'অপারেটিং সিস্টেম ও বাকি সব',   ram:4.8,  cpu:0.4, cl:null}
];
/* the hardware-aware profile (PR 604): limits it computes for a machine */
var ZV_PROF = {
  here:{en:'This server · 8 vCPU · 64 GB', bn:'এই সার্ভার · ৮ vCPU · ৬৪ GB', ram:[16,6,4,16,6,4,1,11], cpu:[3,1,null,6,2,1,1,null], app:6},
  small:{en:'If it were 4 vCPU · 16 GB', bn:'যদি ৪ vCPU · ১৬ GB হতো', ram:[4,1.5,1,4,1.5,1,0.5,2.5], cpu:[1,0.5,null,2,1,0.5,0.5,null], app:3}
};
function zv_num(seed, base, amp){ return Math.max(0, base + (zs_rnd('zv'+seed)-0.5)*2*amp); }
function zv_usage(){
  var s = zv_st(), out = [];
  ZV_SVC.forEach(function(x, i){
    var lim = ZV_PROF.here.ram[i], ram = Math.min(lim*0.97, zv_num(x.k+'r'+s.seed, x.ram, x.k==='media'?0.15:x.ram*0.06));
    var cpu = zv_num(x.k+'c'+s.seed, x.cpu, x.cpu*0.15);
    var down = s.nvme==='missing' && (x.k==='redis' || x.k==='pg');
    out.push({x:x, lim:lim, cl:ZV_PROF.here.cpu[i], ram:down?0:ram, cpu:down?0:cpu, down:down});
  });
  return out;
}
function zv_lv(p){ return p>=95 ? 'bad' : p>=85 ? 'warn' : ''; }
function zv_meter(lab, val, txt, pct, lv){
  return '<div class="zv-meter"><div class="zv-mt"><span>'+esc(lab)+'</span><b>'+esc(txt)+'</b></div>'+zs_bar(pct, lv)+'</div>';
}
function zv_svcRows(){
  return zv_usage().map(function(u){
    var rp = u.ram/u.lim*100, cp = u.cl ? u.cpu/u.cl*100 : u.cpu/8*100, lv = zv_lv(Math.max(rp, u.cl ? cp : 0));
    var st = u.down ? zv_pill('bad', zv_l('Down — waiting for NVMe','বন্ধ — NVMe-র অপেক্ষায়')) : lv==='bad' ? zv_pill('bad', zv_l('At the limit','সীমায় পৌঁছে গেছে')) : lv==='warn' ? zv_pill('warn', zv_l('Near limit','সীমার কাছে')) : zv_pill('ok', zv_l('OK','ঠিক আছে'));
    var note = u.x.k==='media' ? zv_l('14 photos in the queue right now','এই মুহূর্তে ১৪টা ছবি লাইনে আছে') : u.x.k==='os' ? zv_l('Reserve — never squeezed','রিজার্ভ — কখনো চাপা হয় না') : u.x.k==='app' ? zv_l('6 copies running together','৬টা কপি একসাথে চলছে') : '';
    return '<div class="zv-svc'+(lv?' '+lv:'')+(u.down?' bad':'')+'">'+
      '<div class="zv-sn"><div class="small bold">'+esc(zv_l(u.x.en, u.x.bn))+'</div>'+(note?'<div class="zs-mini">'+esc(note)+'</div>':'')+'</div>'+
      zv_meter(zv_l('RAM','RAM'), u.ram, u.ram.toFixed(1)+' / '+u.lim+' GB', rp, zv_lv(rp))+
      zv_meter(zv_l('CPU','CPU'), u.cpu, u.cl ? u.cpu.toFixed(1)+' / '+u.cl+' vCPU' : u.cpu.toFixed(1)+' vCPU · '+zv_l('shared','ভাগাভাগি'), cp, u.cl ? zv_lv(cp) : '')+
      '<div class="zv-ss">'+st+'</div></div>';
  }).join('');
}
function zv_profList(){
  var s = zv_st(), p = ZV_PROF[s.prof] || ZV_PROF.here;
  return '<div class="zv-prof">'+ZV_SVC.map(function(x, i){
    var r = p.ram[i], c = p.cpu[i];
    var nm = x.k==='app' ? zv_l('Website app × '+p.app, 'ওয়েবসাইট অ্যাপ × '+p.app) : zv_l(x.en, x.bn);
    return '<div class="zv-pr"><span>'+esc(nm)+'</span><b>'+r+' GB'+(c?' · '+c+' CPU':'')+'</b></div>'; }).join('')+'</div>';
}
var ZV_SLOW = [
  ['Profit by style (report pool, low priority)', 'স্টাইল ধরে লাভের হিসাব (রিপোর্ট পুল, কম অগ্রাধিকার)', 164, 24],
  ['Duplicate name / address match (pg_trgm)', 'নাম / ঠিকানার কাছাকাছি মিল (pg_trgm)', 112, 318],
  ['Order list with filters', 'ফিল্টার দিয়ে অর্ডার লিস্ট', 61, 842],
  ['Category page products', 'ক্যাটাগরি পেজের প্রোডাক্ট', 18, 18420],
  ['Customer order history', 'কাস্টমারের পুরনো অর্ডার', 11, 2210],
  ['Orders by phone number (fraud check)', 'ফোন নম্বরে অর্ডার খোঁজা (ফ্রড চেক)', 6, 1264],
  ['Variant by colour and size', 'রং ও সাইজ ধরে ভ্যারিয়েন্ট', 3, 9930]
];
function zv_slowTable(){
  var hd = [zv_l('Query','কোয়েরি'), zv_l('Average','গড় সময়'), zv_l('Times today','আজ কতবার'), zv_l('Result','ফল')];
  return '<table class="zv-t"><thead><tr><th>'+hd[0]+'</th><th class="n">'+hd[1]+'</th><th class="n">'+hd[2]+'</th><th>'+hd[3]+'</th></tr></thead><tbody>'+
    ZV_SLOW.map(function(q){
      var r = q[2]>100 ? zv_pill('bad', zv_l('Over 100 ms — logged','১০০ ms-এর বেশি — লগে উঠেছে')) : q[2]>=50 ? zv_pill('warn', zv_l('Above target','লক্ষ্যের উপরে')) : zv_pill('ok', zv_l('Under 50 ms','৫০ ms-এর নিচে'));
      return '<tr'+(q[2]>100?' class="bad"':'')+'><td class="h">'+esc(zv_l(q[0], q[1]))+'</td><td class="n" data-l="'+esc(hd[1])+'">'+q[2]+' ms</td><td class="n" data-l="'+esc(hd[2])+'">'+q[3].toLocaleString('en-US')+'</td><td data-l="'+esc(hd[3])+'">'+r+'</td></tr>';
    }).join('')+'</tbody></table>';
}
var ZV_CDN = [41.2, 38.6, 44.9, 47.3, 52.8, 63.1, 49.4];
function zv_cdnChart(){
  var mx = Math.max.apply(null, ZV_CDN), wd = zv_bn() ? ['রবি','সোম','মঙ্গল','বুধ','বৃহঃ','শুক্র','শনি'] : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var today = new Date();
  return '<div class="zv-cdn" role="img" aria-label="'+esc(zv_l('CDN traffic, last 7 days, in GB','গত ৭ দিনের CDN ট্রাফিক, GB-তে'))+'">'+ZV_CDN.map(function(v, i){
    var d = new Date(today.getTime() - (6-i)*86400000);
    return '<div class="c"><span class="v">'+v.toFixed(0)+'</span><span class="b" style="height:'+Math.round(v/mx*100)+'%"></span><span class="d">'+wd[d.getDay()]+'</span></div>'; }).join('')+'</div>';
}
var ZV_ALERTS = [
  ['disk', 'A disk is fuller than', 'কোনো ডিস্ক এর বেশি ভরে গেলে', '%', '%'],
  ['down', 'A service is down for', 'কোনো সার্ভিস এতক্ষণ বন্ধ থাকলে', 'min', 'মিনিট'],
  ['backup', 'Backups fail in a row', 'পরপর এতবার ব্যাকআপ ব্যর্থ হলে', 'times', 'বার'],
  ['slow', 'The site answers slower than', 'সাইট এর চেয়ে ধীরে উত্তর দিলে', 'ms for 5 min', 'ms, ৫ মিনিট ধরে'],
  ['nvme', 'The NVMe is missing after boot for', 'চালু হওয়ার পর NVMe এতক্ষণ না পেলে', 'min', 'মিনিট']
];
var ZV_LOGTXT = {
  'nvme-ok':['Boot unit: NVMe formatted and mounted after restart — services started in order','বুট ইউনিট: রিস্টার্টের পর NVMe ফরম্যাট করে বসানো হয়েছে — সার্ভিসগুলো ঠিক ক্রমে চালু হয়েছে','ok'],
  'disk-ok':['Data disk passed 20% — no alert needed (limit 80%)','ডেটা ডিস্ক ২০% পার হয়েছে — সতর্কবার্তা লাগেনি (সীমা ৮০%)','ok'],
  'nvme-miss':['NVMe missing after boot — Telegram alert sent (demo)','চালু হওয়ার পর NVMe পাওয়া যায়নি — টেলিগ্রামে খবর গেছে (ডেমো)','bad'],
  'nvme-fix':['Boot unit ran again — NVMe mounted, Redis and PostgreSQL started','বুট ইউনিট আবার চলেছে — NVMe বসেছে, Redis আর PostgreSQL চালু হয়েছে','ok'],
  'test':['Test alert sent to Telegram (demo)','টেলিগ্রামে টেস্ট খবর গেছে (ডেমো)','ok'],
  'cache':['All cache cleared by you','আপনি সব ক্যাশ মুছেছেন','ok']
};
function zv_log(k){ var s = zv_st(); s.log.unshift({at:Date.now(), k:k}); s.log = s.log.slice(0, 12); }

PAGES['admin-server'] = { layout:'admin', title:function(){ return zv_l('Server','সার্ভার'); }, render:function(){
  var s = zv_st(), u = zv_usage(), miss = s.nvme==='missing';
  var ramUsed = u.reduce(function(a, x){ return a + x.ram; }, 0), cpuUsed = u.reduce(function(a, x){ return a + x.cpu; }, 0);
  var cpuP = Math.round(cpuUsed/8*100), ramP = Math.round(ramUsed/64*100), osP = 30, dataP = 21;
  var up = miss ? 4 : 6;
  var machine =
    '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+esc(zv_l('The machine','মেশিন'))+'</h2>'+zv_pill('ok', zv_l('Auto profile detected','নিজে থেকে প্রোফাইল ধরেছে'))+'</div>'+
      '<div class="zs-sub">'+esc(zv_l('Azure · runs all three stores. The ERP is on its own server.','Azure · তিনটা স্টোরই এখানে চলে। ERP আলাদা সার্ভারে।'))+'</div>'+
      '<div class="zv-spec">'+
        [[zv_l('Size','সাইজ'),'E8ds_v6'],['CPU','8 vCPU'],['RAM','64 GB'],[zv_l('Region','রিজিয়ন'), zv_l('Malaysia West (zone 1)','Malaysia West (জোন ১)')],[zv_l('System','সিস্টেম'),'Ubuntu 24.04 LTS'],[zv_l('Disks','ডিস্ক'), zv_l('OS 128 GB · data 1 TB · NVMe 440 GB','OS ১২৮ GB · ডেটা ১ TB · NVMe ৪৪০ GB')]].map(function(r){
          return '<div><span>'+esc(r[0])+'</span><b>'+esc(r[1])+'</b></div>'; }).join('')+
      '</div>'+
      '<div class="zs-note mt12">'+ico('spark',16)+'<div>'+esc(zv_l('The shop read the machine size by itself and set every limit below (PR 604). On a smaller server it sets smaller limits by itself — nothing is changed by hand.','দোকান নিজেই মেশিনের মাপ পড়ে নিচের সব সীমা ঠিক করেছে (PR 604)। ছোট সার্ভারে নিলে নিজেই ছোট সীমা বসাবে — হাতে কিছু বদলাতে হবে না।'))+'</div></div>'+
      '<div class="zs-chipset mt12">'+['here','small'].map(function(k){ return '<button type="button" class="chip'+(s.prof===k?' on':'')+'" data-act="zv-prof" data-v="'+k+'" aria-pressed="'+(s.prof===k)+'">'+esc(zv_l(ZV_PROF[k].en, ZV_PROF[k].bn))+'</button>'; }).join('')+'</div>'+
      '<div class="zs-mini mt8">'+esc(s.prof==='here' ? zv_l('Limits set for this server:','এই সার্ভারের জন্য বসানো সীমা:') : zv_l('Preview only — what the profile would set on a smaller server:','শুধু দেখার জন্য — ছোট সার্ভারে প্রোফাইল যা বসাত:'))+'</div>'+zv_profList()+
    '</section>';
  var disks =
    '<section class="zs-card"><h2>'+esc(zv_l('Disks','ডিস্ক'))+'</h2><div class="zs-sub">'+esc(zv_l('Permanent data lives on the data disk. Photos live in Azure Blob, never on these disks.','স্থায়ী ডেটা থাকে ডেটা ডিস্কে। ছবি থাকে Azure Blob-এ, এই ডিস্কে কখনো না।'))+'</div>'+
      zv_meter(zv_l('OS disk · 128 GB Premium SSD','OS ডিস্ক · ১২৮ GB Premium SSD'), 0, Math.round(128*osP/100)+' GB · '+osP+'%', osP, '')+
      zv_meter(zv_l('Data disk · 1 TB Premium SSD','ডেটা ডিস্ক · ১ TB Premium SSD'), 0, Math.round(1024*dataP/100)+' GB · '+dataP+'%', dataP, '')+
      '<div class="zs-mini mt8">'+esc(zv_l('On the data disk: database, app, Redis save files, logs, settings, SSL. Alert at '+s.alerts.disk.v+'%.','ডেটা ডিস্কে আছে: ডাটাবেস, অ্যাপ, Redis-এর সেভ ফাইল, লগ, সেটিংস, SSL। '+s.alerts.disk.v+'% হলে খবর যাবে।'))+'</div>'+
    '</section>';
  var nv = [['redis', zv_l('Redis cache','Redis ক্যাশ'), 2.1], ['img', zv_l('Image work (temporary)','ছবির কাজ (অস্থায়ী)'), 6.4], ['pg', zv_l('PostgreSQL temp files','PostgreSQL-এর temp ফাইল'), 1.2], ['build', zv_l('Build cache','বিল্ড ক্যাশ'), 18.3], ['bk', zv_l('Backup staging','ব্যাকআপ স্টেজিং'), 0]];
  var nvUsed = nv.reduce(function(a, x){ return a + x[2]; }, 0);
  var nvme =
    '<section class="zs-card zv-nvme'+(miss?' bad':'')+'" id="zv-nvme"><div class="row between wrap" style="gap:8px"><h2>'+esc(zv_l('Local NVMe (temporary disk)','লোকাল NVMe (অস্থায়ী ডিস্ক)'))+'</h2>'+zs_pr('601')+'</div>'+
      '<div class="zs-sub">'+esc(zv_l('Fast, but wiped on every stop or restart. A boot unit formats and mounts it before Redis and PostgreSQL start.','খুব দ্রুত, কিন্তু বন্ধ বা রিস্টার্ট হলেই সব মুছে যায়। Redis আর PostgreSQL চালু হওয়ার আগে একটা বুট ইউনিট এটা ফরম্যাট করে বসিয়ে দেয়।'))+'</div>'+
      (miss ? '<div class="zs-note warn mb16">'+ico('info',17)+'<div><b>'+esc(zv_l('NVMe is missing.','NVMe পাওয়া যাচ্ছে না।'))+'</b> '+esc(zv_l('Redis and PostgreSQL are waiting for it. A Telegram alert was sent (demo).','Redis আর PostgreSQL এর অপেক্ষায় আছে। টেলিগ্রামে খবর গেছে (ডেমো)।'))+'</div></div>' : '')+
      '<div class="zv-spec two">'+
        '<div><span>'+esc(zv_l('Mounted','বসানো আছে'))+'</span><b>'+(miss ? esc(zv_l('No','না')) : esc(zv_l('Yes · /mnt/nvme','হ্যাঁ · /mnt/nvme')))+'</b></div>'+
        '<div><span>'+esc(zv_l('Free space','খালি জায়গা'))+'</span><b>'+(miss ? '—' : Math.round(440-nvUsed)+' / 440 GB')+'</b></div>'+
        '<div><span>'+esc(zv_l('Last formatted at boot','শেষবার চালুর সময় ফরম্যাট'))+'</span><b>'+esc(zv_time(s.nvmeAt))+'</b></div>'+
        '<div><span>'+esc(zv_l('Never kept here','এখানে কখনো থাকে না'))+'</span><b>'+esc(zv_l('database, code, uploads, final backups','ডাটাবেস, কোড, আপলোড, ফাইনাল ব্যাকআপ'))+'</b></div>'+
      '</div>'+
      '<div class="zs-mini mt12 bold">'+esc(zv_l('Who uses it','কে ব্যবহার করছে'))+'</div>'+
      nv.map(function(x){ return '<div class="zv-pr"><span>'+esc(x[1])+'</span><b>'+(miss ? '—' : x[2].toFixed(1)+' GB')+'</b></div>'; }).join('')+
      '<div class="zs-actions mt12">'+(miss
        ? '<button type="button" class="btn btn-sm btn-primary" data-act="zv-nvme-fix">'+ico('swap',14)+esc(zv_l('Run the boot unit again','বুট ইউনিট আবার চালান'))+'</button>'
        : '<button type="button" class="btn btn-sm btn-ghost" data-act="zv-nvme-miss">'+ico('bolt',14)+esc(zv_l('Simulate NVMe missing','NVMe হারানো দেখান (ডেমো)'))+'</button>')+'</div>'+
    '</section>';
  var svcs = [['pg', zv_l('Database','ডাটাবেস'), zv_l('38 connections through PgBouncer','PgBouncer দিয়ে ৩৮টা কানেকশন')], ['redis','Redis', zv_l('hit rate 96%','হিট রেট ৯৬%')], ['app', zv_l('Website app','ওয়েবসাইট অ্যাপ'), zv_l('6 of 6 copies healthy','৬টার ৬টা কপিই ঠিক')], ['meili','Meilisearch', zv_l('search answers in 12 ms','সার্চ ১২ ms-এ উত্তর দেয়')], ['work', zv_l('Workers','ওয়ার্কার'), zv_l('14 photos waiting · 0 failed','১৪টা ছবি লাইনে · ০ ব্যর্থ')], ['caddy','Caddy', zv_l('SSL 63 days left · auto-renew','SSL আর ৬৩ দিন · নিজে নবায়ন')]];
  var svcList =
    '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+esc(zv_l('Services','সার্ভিস'))+'</h2>'+(miss ? zv_pill('bad', zv_l(up+' of 6 running', '৬টার মধ্যে '+up+'টা চালু')) : zv_pill('ok', zv_l('All running','সব চালু')))+'</div><div class="zs-sub">'+esc(zv_l('Up or down, checked every minute.','চালু না বন্ধ — প্রতি মিনিটে দেখা হয়।'))+'</div>'+
      '<div class="zv-up">'+svcs.map(function(x){ var dn = miss && (x[0]==='pg' || x[0]==='redis');
        return '<div class="zv-upi'+(dn?' bad':'')+'"><span class="zs-dot'+(dn?' bad':'')+'"></span><div style="min-width:0"><div class="small bold">'+esc(x[1])+' · '+esc(dn ? zv_l('Down','বন্ধ') : zv_l('Up','চালু'))+'</div><div class="zs-mini">'+esc(dn ? zv_l('waiting for the NVMe','NVMe-র অপেক্ষায়') : x[2])+'</div></div></div>'; }).join('')+'</div>'+
    '</section>';
  var hits = [['Redis', 96], [zv_l('Server page cache','সার্ভারের পেজ ক্যাশ'), 89], ['Cloudflare', 74]];
  var cache =
    '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+esc(zv_l('Cache hit %','ক্যাশ থেকে কত শতাংশ'))+'</h2><a class="zs-link" href="#/admin/cache">'+esc(zv_l('Cache settings','ক্যাশের সেটিংস'))+' →</a></div>'+
      '<div class="zs-sub">'+esc(zv_l('How often an answer came ready-made instead of being worked out again. Higher is faster.','কতবার উত্তর তৈরি অবস্থায় পাওয়া গেছে, আবার হিসাব করতে হয়নি। বেশি মানে দ্রুত।'))+'</div>'+
      hits.map(function(h){ return zv_meter(h[0], h[1], h[1]+'%', h[1], ''); }).join('')+
    '</section>';
  var cdn =
    '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+esc(zv_l('CDN traffic · last 7 days','CDN ট্রাফিক · গত ৭ দিন'))+'</h2><span class="zs-mini">'+ZV_CDN.reduce(function(a, b){ return a + b; }, 0).toFixed(0)+' GB</span></div>'+
      '<div class="zs-sub">'+esc(zv_l('GB sent to customers by Cloudflare from near Dhaka, not from Singapore.','Cloudflare সিঙ্গাপুর না ঘুরে ঢাকার কাছ থেকে কাস্টমারকে কত GB পাঠিয়েছে।'))+'</div>'+zv_cdnChart()+
    '</section>';
  var slow =
    '<section class="zs-card mt24"><div class="row between wrap" style="gap:8px"><h2>'+esc(zv_l('Slowest database queries','সবচেয়ে ধীর ডাটাবেস কোয়েরি'))+'</h2>'+zs_pr('603')+'</div>'+
      '<div class="zs-sub">'+esc(zv_l('Target: a normal query under 50 ms. Anything over 100 ms is logged and flagged here.','লক্ষ্য: সাধারণ কোয়েরি ৫০ ms-এর নিচে। ১০০ ms-এর বেশি লাগলে লগে ওঠে আর এখানে লাল দেখায়।'))+'</div>'+zv_slowTable()+
      '<div class="zs-note mt12">'+ico('info',16)+'<div>'+esc(zv_l('The profit report runs on a separate low-priority pool, so even at 164 ms it never slows a customer.','লাভের রিপোর্ট আলাদা কম-অগ্রাধিকারের পুলে চলে, তাই ১৬৪ ms লাগলেও কোনো কাস্টমারের সাইট ধীর হয় না।'))+'</div></div>'+
    '</section>';
  var alerts =
    '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+esc(zv_l('Telegram alerts','টেলিগ্রাম সতর্কবার্তা'))+'</h2><span class="tag plain">'+ico('chat',13)+esc(zv_l('AI 360 channel','AI 360 চ্যানেল'))+'</span></div>'+
      '<div class="zs-sub">'+esc(zv_l('When to message you. Turn a rule off or change its limit; it is saved at once.','কখন আপনাকে খবর পাঠাবে। নিয়ম বন্ধ করুন বা সীমা বদলান — সাথে সাথে সেভ হয়।'))+'</div>'+
      ZV_ALERTS.map(function(a){ var r = s.alerts[a[0]];
        return '<div class="zs-row"><div class="grow"><div class="small bold">'+esc(zv_l(a[1], a[2]))+'</div>'+
          '<div class="zs-thr mt8"><input class="input zs-in zv-num" type="number" inputmode="numeric" min="1" value="'+esc(r.v)+'" data-input="zv-thr" data-change="zv-thr-done" data-k="'+a[0]+'" aria-label="'+esc(zv_l(a[1], a[2]))+'"'+(r.on?'':' disabled')+'><span class="zs-mini">'+esc(zv_l(a[3], a[4]))+'</span></div></div>'+
          zs_sw(r.on, 'zv-al', zv_l(a[1], a[2]), 'data-k="'+a[0]+'"')+'</div>'; }).join('')+
      '<div class="zs-actions mt12"><button type="button" class="btn btn-sm btn-secondary" data-act="zv-al-test">'+ico('chat',14)+esc(zv_l('Send test alert','টেস্ট খবর পাঠান'))+'</button></div>'+
    '</section>';
  var log =
    '<section class="zs-card"><h2>'+esc(zv_l('Alert log','খবরের তালিকা'))+'</h2><div class="zs-sub">'+esc(zv_l('What was sent before.','আগে কী কী খবর গেছে।'))+'</div><div class="zs-list">'+
      s.log.map(function(l){ var t = ZV_LOGTXT[l.k] || ['','','ok']; return '<div class="zs-li"><div style="min-width:0"><div class="t"><span class="zs-dot'+(t[2]==='bad'?' bad':'')+'" style="margin-right:7px"></span>'+esc(zv_l(t[0], t[1]))+'</div><div class="m">'+esc(zv_time(l.at))+'</div></div></div>'; }).join('')+
    '</div></section>';
  return '<div class="zs-page zv-page">'+
    zs_head(zv_l('Admin · System','অ্যাডমিন · সিস্টেম')+' '+zs_pr('423 · 601 · 603 · 604'), esc(zv_l('Server','সার্ভার')), null,
      esc(zv_l('How the shop\'s server is doing, in plain words: each part\'s memory and processor against its limit, the disks, the fast temporary disk, the cache and the slowest queries. If something goes wrong you get a Telegram message.','দোকানের সার্ভার কেমন চলছে, সহজ ভাষায়: প্রতিটা অংশ কতটা মেমরি আর প্রসেসর নিচ্ছে আর সীমার কতটা কাছে, ডিস্ক, দ্রুত অস্থায়ী ডিস্ক, ক্যাশ আর সবচেয়ে ধীর কোয়েরি। কিছু গোলমাল হলে টেলিগ্রামে খবর যাবে।')),
      zv_sample()+'<button type="button" class="btn btn-secondary" data-act="zv-refresh">'+ico('swap',15)+esc(zv_l('Refresh','আবার দেখুন'))+'</button>')+
    zv_tabs('server')+
    '<div class="zs-kpis k6">'+
      '<div class="zs-k '+(cpuP>=85?'warn':'ok')+'"><div class="v">'+cpuP+'%</div><div class="l">CPU</div><div class="s">'+cpuUsed.toFixed(1)+' '+esc(zv_l('of','/'))+' 8 vCPU</div></div>'+
      '<div class="zs-k '+(ramP>=85?'warn':'ok')+'"><div class="v">'+ramP+'%</div><div class="l">RAM</div><div class="s">'+ramUsed.toFixed(0)+' '+esc(zv_l('of','/'))+' 64 GB</div></div>'+
      '<div class="zs-k ok"><div class="v">'+osP+'%</div><div class="l">'+esc(zv_l('OS disk','OS ডিস্ক'))+'</div><div class="s">128 GB</div></div>'+
      '<div class="zs-k ok"><div class="v">'+dataP+'%</div><div class="l">'+esc(zv_l('Data disk','ডেটা ডিস্ক'))+'</div><div class="s">1 TB</div></div>'+
      '<div class="zs-k '+(miss?'bad':'ok')+'"><div class="v">'+esc(miss ? zv_l('Missing','নেই') : zv_l('Mounted','বসানো'))+'</div><div class="l">NVMe</div><div class="s">'+(miss?'—':Math.round(440-nvUsed)+' GB '+esc(zv_l('free','খালি')))+'</div></div>'+
      '<div class="zs-k '+(miss?'bad':'ok')+'"><div class="v">'+up+' / 6</div><div class="l">'+esc(zv_l('Services up','চালু সার্ভিস'))+'</div><div class="s">'+esc(zv_l('checked every minute','প্রতি মিনিটে দেখা'))+'</div></div>'+
    '</div>'+
    '<section class="zs-card mb16"><div class="row between wrap" style="gap:8px"><h2>'+esc(zv_l('Memory and processor by service','সার্ভিস ধরে মেমরি আর প্রসেসর'))+'</h2>'+zs_pr('604')+'</div>'+
      '<div class="zs-sub">'+esc(zv_l('Each part has its own limit so one can never eat the whole server. Amber = near the limit (85%+), red = at the limit.','প্রতিটা অংশের নিজের সীমা আছে, যাতে একটা অংশ পুরো সার্ভার খেয়ে না ফেলে। হলুদ = সীমার কাছে (৮৫%+), লাল = সীমায় পৌঁছে গেছে।'))+'</div>'+
      '<div class="zv-svch" aria-hidden="true"><span>'+esc(zv_l('Service','সার্ভিস'))+'</span><span>RAM</span><span>CPU</span><span>'+esc(zv_l('Status','অবস্থা'))+'</span></div>'+
      zv_svcRows()+
      '<div class="zs-mini mt8">'+esc(zv_l('Heavy photo and video work runs only in the worker, never in the website app — so ten photo uploads never slow a customer\'s page.','ছবি-ভিডিওর ভারী কাজ শুধু ওয়ার্কারে চলে, ওয়েবসাইট অ্যাপে কখনো না — তাই ১০টা ছবি আপলোড হলেও কাস্টমারের পেজ ধীর হয় না।'))+'</div>'+
    '</section>'+
    '<div class="zs-g2">'+machine+'<div class="stack s16">'+disks+nvme+'</div></div>'+
    '<div class="zs-g2 mt24">'+svcList+cache+'</div>'+
    '<div class="zs-g2 mt24">'+cdn+'<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+esc(zv_l('Last backups','শেষ ব্যাকআপ'))+'</h2><a class="zs-link" href="#/admin/backup">'+esc(zv_l('Backup page','ব্যাকআপ পাতা'))+' →</a></div>'+zv_bkDest(true)+'</section></div>'+
    slow+
    '<div class="zs-g2 mt24">'+alerts+log+'</div>'+
  '</div>';
}};
ACT['zv-refresh'] = function(){ zv_st().seed++; saveState(); rerender(); toast(zv_l('Updated just now (sample numbers)','এইমাত্র নতুন করে দেখা হলো (নমুনা সংখ্যা)')); };
ACT['zv-prof'] = function(el){ var s = zv_st(); s.prof = el.getAttribute('data-v')==='small' ? 'small' : 'here'; saveState(); rerender(); };
ACT['zv-nvme-miss'] = function(){ var s = zv_st(); s.nvme = 'missing'; zv_log('nvme-miss'); saveState(); rerender(); toast(zv_l('NVMe missing — Telegram alert sent (demo)','NVMe নেই — টেলিগ্রামে খবর গেছে (ডেমো)')); };
ACT['zv-nvme-fix'] = function(){ var s = zv_st(); s.nvme = 'ok'; s.nvmeAt = Date.now(); zv_log('nvme-fix'); saveState(); rerender(); toast(zv_l('NVMe mounted again — all services running','NVMe আবার বসেছে — সব সার্ভিস চালু')); };
ACT['zv-al'] = function(el){ var s = zv_st(), k = el.getAttribute('data-k'), r = s.alerts[k]; if(!r) return; r.on = !r.on; saveState(); rerender(); toast(r.on ? zv_l('Alert on — saved','খবর চালু — সেভ হয়েছে') : zv_l('Alert off — saved','খবর বন্ধ — সেভ হয়েছে')); };
INPUT['zv-thr'] = function(el){ var s = zv_st(), r = s.alerts[el.getAttribute('data-k')], n = parseInt(el.value, 10); if(!r || isNaN(n) || n<1) return; r.v = n; saveState(); };
CHANGE['zv-thr-done'] = function(el){ var n = parseInt(el.value, 10); if(isNaN(n) || n<1){ toast(zv_l('Write a number above 0','০-এর বেশি একটা সংখ্যা লিখুন')); return; } toast(zv_l('Limit saved: ','সীমা সেভ হয়েছে: ')+n); };
ACT['zv-al-test'] = function(){
  var s = zv_st();
  var msg = zv_l('Prohori · test alert\nAll is well — this is only a test.\nDisk 30% · NVMe '+(s.nvme==='missing'?'missing':'mounted')+' · 6 services checked',
                 'প্রহরী · টেস্ট খবর\nসব ঠিক আছে — এটা শুধু পরীক্ষা।\nডিস্ক ৩০% · NVMe '+(s.nvme==='missing'?'নেই':'বসানো')+' · ৬টা সার্ভিস দেখা হয়েছে');
  openModal('<div class="zs-tg"><div class="zs-tg-h">'+esc(zv_l('AI 360 · Telegram','AI 360 · টেলিগ্রাম'))+'</div><div class="zs-tg-b">'+esc(msg)+'</div></div><div class="small text2 mt12">'+esc(zv_l('This is what an alert looks like. Demo — nothing is sent.','খবর দেখতে এমন হবে। ডেমো — কিছুই পাঠানো হয়নি।'))+'</div>', {title:zv_l('Test alert','টেস্ট খবর')});
  zv_log('test'); saveState(); rerender();
};

/* =====================================================================
   2. CACHE (PR 602)
   ===================================================================== */
var ZV_CDUR = [
  ['cat', 'Category pages', 'ক্যাটাগরি পেজ', [1,2,5,10,15], 'min', 'মিনিট', 'Cloudflare + server page cache', 'Cloudflare + সার্ভারের পেজ ক্যাশ'],
  ['pdp', 'Product pages', 'প্রোডাক্ট পেজ', [1,2,5,10,15], 'min', 'মিনিট', 'Cloudflare + server page cache', 'Cloudflare + সার্ভারের পেজ ক্যাশ'],
  ['stock', 'Stock shown on pages', 'পেজে দেখানো স্টক', [10,15,30], 's', 'সেকেন্ড', 'Redis · display only', 'Redis · শুধু দেখানোর জন্য'],
  ['settings', 'Settings', 'সেটিংস', [15,30,60], 'min (or until changed)', 'মিনিট (বা বদলানো পর্যন্ত)', 'Redis', 'Redis'],
  ['areas', 'Delivery area list (Dhaka 250–300 areas)', 'ডেলিভারি এলাকার তালিকা (ঢাকার ২৫০–৩০০ এলাকা)', [6,12,24], 'hours', 'ঘণ্টা', 'Redis', 'Redis']
];
PAGES['admin-cache'] = { layout:'admin', title:function(){ return zv_l('Cache','ক্যাশ'); }, render:function(){
  var s = zv_st(), c = s.cache;
  var layers = [
    [zv_l('Browser','ব্রাউজার'), zv_l('Images, CSS, JS','ছবি, CSS, JS'), zv_l('A long time — a changed file gets a new name','অনেক দিন — ফাইল বদলালে নাম বদলায়')],
    ['Cloudflare', zv_l('Images and public pages','ছবি আর পাবলিক পেজ'), zv_l('Images long, pages a few minutes','ছবি অনেক দিন, পেজ কয়েক মিনিট')],
    [zv_l('Server page cache','সার্ভারের পেজ ক্যাশ'), zv_l('Built pages (HTML)','তৈরি পেজ (HTML)'), zv_l('Minutes — new the moment something changes','কয়েক মিনিট — কিছু বদলালেই সাথে সাথে নতুন')],
    ['Redis', zv_l('Settings, area list, products, categories, stock display','সেটিংস, এলাকার তালিকা, প্রোডাক্ট, ক্যাটাগরি, স্টক দেখানো'), zv_l('Seconds to hours, by item','জিনিস ভেদে কয়েক সেকেন্ড থেকে কয়েক ঘণ্টা')]
  ];
  var lh = [zv_l('Layer','স্তর'), zv_l('What it keeps','কী জমা রাখে'), zv_l('For how long','কত সময়')];
  var rules = [
    [zv_l('Price changes','দাম বদলালে'), zv_l('That product, its category pages and Cloudflare are cleared at once','ঐ প্রোডাক্ট, তার ক্যাটাগরি পেজ আর Cloudflare — তিন জায়গাতেই সাথে সাথে মুছে যায়')],
    [zv_l('Stock changes','স্টক বদলালে'), zv_l('Cleared instantly — sold out shows sold out','সাথে সাথে মুছে যায় — শেষ হলে শেষই দেখায়')],
    [zv_l('A setting changes','সেটিংস বদলালে'), zv_l('Every place that setting is used is cleared','ঐ সেটিংস যেখানে যেখানে লাগে, সব জায়গায় মুছে যায়')],
    [zv_l('New product','নতুন প্রোডাক্ট'), zv_l('Its category pages and the sitemap are cleared','তার ক্যাটাগরি পেজ আর সাইটম্যাপ মুছে নতুন হয়')]
  ];
  var never = [[zv_l('Bag','ব্যাগ'),'bag'], [zv_l('Checkout','চেকআউট'),'cash'], [zv_l('Account','অ্যাকাউন্ট'),'user'], [zv_l('Admin','অ্যাডমিন'),'settings']];
  return '<div class="zs-page zv-page">'+
    zs_head(zv_l('Admin · System','অ্যাডমিন · সিস্টেম')+' '+zs_pr('602'), esc(zv_l('Cache','ক্যাশ')), null,
      esc(zv_l('The shop keeps ready-made answers for a short time so the same work is not done again and again. Here you set how long, and you can clear everything if something ever looks wrong.','একই কাজ বারবার না করতে দোকান কিছুক্ষণের জন্য তৈরি উত্তর জমা রাখে। কতক্ষণ রাখবে তা এখানে ঠিক করবেন, আর কখনো গোলমাল মনে হলে সব মুছে দিতে পারবেন।')),
      zv_sample()+'<button type="button" class="btn btn-primary" data-act="zv-clear" data-testid="zv-clear">'+ico('trash',15)+esc(zv_l('Clear all cache','সব ক্যাশ মুছে ফেলুন'))+'</button>')+
    zv_tabs('cache')+
    '<div class="zs-kpis k4">'+
      '<div class="zs-k ok"><div class="v">96%</div><div class="l">Redis</div><div class="s">'+esc(zv_l('answers from cache','ক্যাশ থেকে উত্তর'))+'</div></div>'+
      '<div class="zs-k ok"><div class="v">89%</div><div class="l">'+esc(zv_l('Page cache','পেজ ক্যাশ'))+'</div><div class="s">'+esc(zv_l('built pages reused','তৈরি পেজ আবার ব্যবহার'))+'</div></div>'+
      '<div class="zs-k ok"><div class="v">74%</div><div class="l">Cloudflare</div><div class="s">'+esc(zv_l('served near Dhaka','ঢাকার কাছ থেকে গেছে'))+'</div></div>'+
      '<div class="zs-k"><div class="v">'+esc(c.cleared ? zv_ago(c.cleared) : '—')+'</div><div class="l">'+esc(zv_l('Last cleared','শেষবার মোছা'))+'</div><div class="s">'+esc(c.cleared ? zv_time(c.cleared) : '')+'</div></div>'+
    '</div>'+
    '<div class="zs-note mb16">'+ico('shield',16)+'<div><b>'+esc(zv_l('Add to bag and checkout always check live stock.','ব্যাগে যোগ আর চেকআউট সবসময় আসল স্টক দেখে।'))+'</b> '+esc(zv_l('The cached stock number is only for showing on pages, so nothing is ever oversold.','ক্যাশে রাখা স্টক শুধু পেজে দেখানোর জন্য, তাই কখনো বেশি বিক্রি হয় না।'))+'</div></div>'+
    '<div class="zs-g2">'+
      '<section class="zs-card"><h2>'+esc(zv_l('How long things are kept','কতক্ষণ জমা থাকবে'))+'</h2><div class="zs-sub">'+esc(zv_l('These are settings, not code. A change works at once.','এগুলো সেটিংস, কোডে না। বদলালে সাথে সাথে কাজ করে।'))+'</div>'+
        ZV_CDUR.map(function(d){
          return '<div class="zs-row"><div class="grow"><label class="small bold" for="zv-cd-'+d[0]+'">'+esc(zv_l(d[1], d[2]))+'</label><div class="zs-mini">'+esc(zv_l(d[6], d[7]))+'</div></div>'+
            '<select id="zv-cd-'+d[0]+'" class="input zs-in zv-sel" data-change="zv-cdur" data-k="'+d[0]+'">'+d[3].map(function(o){ return '<option value="'+o+'"'+(c[d[0]]===o?' selected':'')+'>'+o+' '+esc(zv_l(d[4], d[5]))+'</option>'; }).join('')+'</select></div>'; }).join('')+
        '<div class="zs-row"><div class="grow"><div class="small bold">'+esc(zv_l('Images, CSS, JS, fonts','ছবি, CSS, JS, ফন্ট'))+'</div><div class="zs-mini">'+esc(zv_l('Browser + Cloudflare · a changed file gets a new name','ব্রাউজার + Cloudflare · ফাইল বদলালে নতুন নাম'))+'</div></div><span class="tag plain">'+esc(zv_l('1 year · fixed','১ বছর · স্থির'))+'</span></div>'+
      '</section>'+
      '<section class="zs-card"><h2>'+esc(zv_l('When the cache is cleared by itself','ক্যাশ নিজে থেকে কখন মোছে'))+'</h2><div class="zs-sub">'+esc(zv_l('A wrong cache shows a wrong price — these rules are always on.','ভুল ক্যাশ ভুল দাম দেখায় — তাই এই নিয়মগুলো সবসময় চালু।'))+'</div>'+
        rules.map(function(r){ return '<div class="zs-row"><div class="grow"><div class="small bold">'+esc(r[0])+'</div><div class="zs-mini">'+esc(r[1])+'</div></div><span class="tag">'+ico('check',12)+esc(zv_l('Always','সবসময়'))+'</span></div>'; }).join('')+
        '<div class="small bold mt16">'+esc(zv_l('Never cached','কখনো জমা থাকে না'))+'</div>'+
        '<div class="zs-chipset mt8">'+never.map(function(n){ return '<span class="zv-never">'+ico('lock',13)+esc(n[0])+'</span>'; }).join('')+'</div>'+
        '<div class="zs-mini mt8">'+esc(zv_l('Every customer always sees their own bag, checkout and account fresh.','প্রত্যেক কাস্টমার সবসময় নিজের ব্যাগ, চেকআউট আর অ্যাকাউন্ট একদম টাটকা দেখে।'))+'</div>'+
      '</section>'+
    '</div>'+
    '<section class="zs-card mt24"><h2>'+esc(zv_l('The four layers','চার স্তর'))+'</h2><div class="zs-sub">'+esc(zv_l('From the customer\'s phone back to the server.','কাস্টমারের ফোন থেকে সার্ভার পর্যন্ত।'))+'</div>'+
      '<table class="zv-t"><thead><tr>'+lh.map(function(h){ return '<th>'+esc(h)+'</th>'; }).join('')+'</tr></thead><tbody>'+
        layers.map(function(l){ return '<tr><td class="h">'+esc(l[0])+'</td><td data-l="'+esc(lh[1])+'">'+esc(l[1])+'</td><td data-l="'+esc(lh[2])+'">'+esc(l[2])+'</td></tr>'; }).join('')+
      '</tbody></table>'+
    '</section>'+
  '</div>';
}};
CHANGE['zv-cdur'] = function(el){ var c = zv_st().cache, k = el.getAttribute('data-k'); c[k] = +el.value; saveState(); toast(zv_l('Saved — ','সেভ হয়েছে — ')+el.options[el.selectedIndex].text); };
function zv_clrHTML(){
  var u = UI['zv-clr']; if(!u) return '';
  var steps = [zv_l('Clearing Redis','Redis মোছা হচ্ছে'), zv_l('Clearing the server page cache','সার্ভারের পেজ ক্যাশ মোছা হচ্ছে'), zv_l('Asking Cloudflare to clear','Cloudflare-কে মুছতে বলা হচ্ছে')];
  if(!u.phase) return '<div class="stack s16"><div class="small text2">'+esc(zv_l('Everything kept in Redis, the server page cache and Cloudflare is removed. Pages are built fresh on the next visit — for a few minutes the site can be a little slower. Nothing is lost: orders, products and settings are not touched.','Redis, সার্ভারের পেজ ক্যাশ আর Cloudflare-এ যা জমা আছে সব মুছে যাবে। পরের ভিজিটে পেজ নতুন করে তৈরি হবে — কয়েক মিনিট সাইট একটু ধীর লাগতে পারে। কিছু হারাবে না: অর্ডার, প্রোডাক্ট, সেটিংস ঠিক থাকবে।'))+'</div>'+
    '<div class="row end" style="gap:8px"><button type="button" class="btn btn-ghost" data-act="close-modal">'+esc(zv_l('Cancel','বাতিল'))+'</button><button type="button" class="btn btn-primary" data-act="zv-clear-go" data-testid="zv-clear-go">'+ico('trash',15)+esc(zv_l('Yes, clear all','হ্যাঁ, সব মুছুন'))+'</button></div></div>';
  if(u.phase>steps.length) return '<div class="stack s16" style="text-align:center"><span class="zs-okc">'+ico('check',26)+'</span><div class="h2">'+esc(zv_l('All cache cleared','সব ক্যাশ মোছা হয়েছে'))+'</div><div class="xs muted">'+esc(zv_l('Demo — nothing real was cleared.','ডেমো — আসলে কিছু মোছা হয়নি।'))+'</div><button type="button" class="btn btn-primary btn-block" data-act="close-modal">'+esc(zv_l('Done','ঠিক আছে'))+'</button></div>';
  return '<div class="stack s16">'+zs_steps(steps, u.phase)+zs_bar((u.phase-1)/steps.length*100)+'</div>';
}
ACT['zv-clear'] = function(){ UI['zv-clr'] = {phase:0}; openModal(zv_clrHTML(), {title:zv_l('Clear all cache?','সব ক্যাশ মুছবেন?'), rebuild:zv_clrHTML, zsKey:'zv-clr'}); };
ACT['zv-clear-go'] = function(){
  zs_runSteps('zv-clr', [1,2,3], 450, function(){ var s = zv_st(); s.cache.cleared = Date.now(); zv_log('cache'); saveState(); rerender(); toast(zv_l('All cache cleared — pages are built fresh','সব ক্যাশ মুছে গেছে — পেজ নতুন করে তৈরি হবে')); });
};

/* =====================================================================
   3. IMAGES (PR 22 · 24 · 88)
   ===================================================================== */
var ZV_SIZES = [['thumb',160,'Bag, search suggestions, order list','ব্যাগ, সার্চ সাজেশন, অর্ডার লিস্ট'],['card',400,'Category grid on a phone','মোবাইলে ক্যাটাগরি গ্রিড'],['card2x',800,'The same grid on a sharper screen','ভালো স্ক্রিনে একই গ্রিড'],['main',1200,'Product page main photo','প্রোডাক্ট পেজের বড় ছবি'],['zoom',2000,'Zoom','জুম করলে']];
function zv_kb(w, q, f){ var base = {thumb:5, card:24, card2x:62, main:112, zoom:260}[w]; var m = {avif:1, webp:1.32, jpeg:1.9}[f]; return Math.round(base*m*(1 + (q-78)*0.06)); }
function zv_imgEst(q){
  return '<div class="zv-est" id="zv-est">'+
    '<div><span>'+esc(zv_l('Category photo (card, AVIF)','ক্যাটাগরির ছবি (card, AVIF)'))+'</span><b>~'+zv_kb('card', q, 'avif')+' KB</b>'+(zv_kb('card', q, 'avif')<=40 ? zv_pill('ok', zv_l('Under 40 KB','৪০ KB-এর নিচে')) : zv_pill('bad', zv_l('Over 40 KB','৪০ KB-এর বেশি')))+'</div>'+
    '<div><span>'+esc(zv_l('Product main photo (main, AVIF)','প্রোডাক্টের বড় ছবি (main, AVIF)'))+'</span><b>~'+zv_kb('main', q, 'avif')+' KB</b>'+(zv_kb('main', q, 'avif')<=150 ? zv_pill('ok', zv_l('Under 150 KB','১৫০ KB-এর নিচে')) : zv_pill('bad', zv_l('Over 150 KB','১৫০ KB-এর বেশি')))+'</div>'+
  '</div>';
}
PAGES['admin-images'] = { layout:'admin', title:function(){ return zv_l('Images','ছবি'); }, render:function(){
  var s = zv_st(), g = s.img, blob = zv_blobOn();
  var hd = [zv_l('Name','নাম'), zv_l('Size (4:5)','মাপ (৪:৫)'), zv_l('Where it is used','কোথায় লাগে'), 'AVIF', 'WebP', 'JPEG'];
  var rows = ZV_SIZES.map(function(z){
    return '<tr><td class="h"><b>'+z[0]+'</b></td><td class="n" data-l="'+esc(hd[1])+'">'+z[1]+' × '+Math.round(z[1]*1.25)+'</td><td data-l="'+esc(hd[2])+'">'+esc(zv_l(z[2], z[3]))+'</td>'+
      ['avif','webp','jpeg'].map(function(f, i){ return '<td class="n" data-l="'+hd[3+i]+'">~'+zv_kb(z[0], g.q, f)+' KB</td>'; }).join('')+'</tr>'; }).join('');
  var steps = [zv_l('Keep the original (archive)','মূল ছবি আলাদা করে রাখে (আর্কাইভ)'), zv_l('Cut 5 sizes at 4:5','৪:৫ অনুপাতে ৫টা মাপ কাটে'), zv_l('Make each in AVIF, WebP and JPEG','প্রতিটা AVIF, WebP আর JPEG-এ বানায়'), zv_l('Send to storage, then the CDN','স্টোরেজে পাঠায়, তারপর CDN-এ'), zv_l('Save the main colour for the loading box','লোড হওয়ার বাক্সের জন্য মূল রংটা রাখে')];
  return '<div class="zs-page zv-page">'+
    zs_head(zv_l('Admin · System','অ্যাডমিন · সিস্টেম')+' '+zs_pr('22 · 24 · 88'), esc(zv_l('Images','ছবি')), null,
      esc(zv_l('Photos are 80% of a page\'s weight. After you upload one, the shop makes every size and format by itself in the background — you never wait. These settings decide how.','পেজের ওজনের ৮০% ছবি। আপনি একটা ছবি আপলোড করলে দোকান ব্যাকগ্রাউন্ডে নিজেই সব মাপ আর ফরম্যাট বানায় — আপনাকে অপেক্ষা করতে হয় না। কীভাবে বানাবে তা এখানে ঠিক হয়।')),
      zv_sample())+
    zv_tabs('images')+
    '<div class="zs-g2">'+
      '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+esc(zv_l('Quality','মান'))+'</h2><span class="tag plain" id="zv-q-tag">'+g.q+'</span></div>'+
        '<div class="zs-sub">'+esc(zv_l('75–80: the eye sees no difference, but files are less than half the size. Default 78.','৭৫–৮০: চোখে পার্থক্য বোঝা যায় না, কিন্তু ফাইল অর্ধেকের কম হয়। ডিফল্ট ৭৮।'))+'</div>'+
        '<label class="small bold" for="zv-q">'+esc(zv_l('Quality','মান'))+' · <span id="zv-q-v">'+g.q+'</span></label>'+
        '<input id="zv-q" class="zv-range mt8" type="range" min="75" max="80" step="1" value="'+g.q+'" data-input="zv-q" data-change="zv-q-done" aria-valuemin="75" aria-valuemax="80">'+
        '<div class="row between zs-mini"><span>75</span><span>80</span></div>'+
        '<div class="small bold mt16">'+esc(zv_l('Targets','লক্ষ্য'))+'</div>'+zv_imgEst(g.q)+
        '<div class="zs-row mt8"><div class="grow"><div class="small bold">'+esc(zv_l('Shape','অনুপাত'))+'</div><div class="zs-mini">'+esc(zv_l('Every size keeps the same shape, so the grid never looks uneven','সব মাপে একই অনুপাত, তাই গ্রিড কখনো এলোমেলো দেখায় না'))+'</div></div><span class="tag plain">4:5 · '+esc(zv_l('fixed','স্থির'))+'</span></div>'+
        '<div class="zs-row"><div class="grow"><div class="small bold">'+esc(zv_l('Restore to default','ডিফল্টে ফেরান'))+'</div></div><button type="button" class="btn btn-sm btn-ghost" data-act="zv-q-reset"'+(g.q===78?' disabled':'')+'>'+esc(zv_l('Back to 78','৭৮-এ ফেরান'))+'</button></div>'+
      '</section>'+
      '<section class="zs-card"><h2>'+esc(zv_l('Where photos are kept','ছবি কোথায় থাকবে'))+'</h2><div class="zs-sub">'+esc(zv_l('The shop works either way — this is what makes a handover to another server easy.','দুইভাবেই দোকান চলে — এতেই অন্য সার্ভারে হ্যান্ডওভার সহজ হয়।'))+'</div>'+
        '<div class="zs-tier" role="group" aria-label="'+esc(zv_l('Storage','স্টোরেজ'))+'">'+[['blob','Azure Blob'],['disk',zv_l('Server disk','সার্ভারের ডিস্ক')]].map(function(o){ return '<button type="button" class="'+(g.store===o[0]?'on':'')+'" data-act="zv-store" data-v="'+o[0]+'" aria-pressed="'+(g.store===o[0])+'">'+esc(o[1])+'</button>'; }).join('')+'</div>'+
        (g.store==='blob' && !blob ? '<div class="zs-note warn mt12">'+ico('info',16)+'<div>'+esc(zv_l('Azure Blob is not connected yet, so new photos stay on the server disk until the key is added.','Azure Blob এখনো সংযুক্ত হয়নি, তাই চাবি না দেওয়া পর্যন্ত নতুন ছবি সার্ভারের ডিস্কেই থাকবে।'))+' <a class="zs-link" href="#/admin/integrations">'+esc(zv_l('Add key in Keys & connections','চাবি ও সংযোগ পাতায় চাবি দিন'))+'</a></div></div>' : '')+
        '<div class="zs-mini mt8">'+esc(g.store==='blob' ? zv_l('Blob is cheap, grows by itself and keeps photos safe when the server changes.','Blob সস্তা, নিজে থেকে বাড়ে, আর সার্ভার বদলালেও ছবি নিরাপদ থাকে।') : zv_l('Photos are kept on the server\'s data disk. Fine for a small shop; move to Blob any time.','ছবি সার্ভারের ডেটা ডিস্কে থাকবে। ছোট দোকানে চলে; যেকোনো সময় Blob-এ নেওয়া যায়।'))+'</div>'+
        '<div class="zs-row mt12"><div class="grow"><div class="small bold">'+esc(zv_l('Send photos through the CDN (Cloudflare)','ছবি CDN (Cloudflare) দিয়ে পাঠান'))+'</div><div class="zs-mini">'+esc(g.cdn ? zv_l('On — photos come from near Dhaka','চালু — ছবি ঢাকার কাছ থেকে যায়') : zv_l('Off — photos come straight from the server. The shop still works.','বন্ধ — ছবি সরাসরি সার্ভার থেকে যায়। দোকান তবুও চলে।'))+'</div></div>'+zs_sw(g.cdn, 'zv-cdn', zv_l('Send photos through the CDN','ছবি CDN দিয়ে পাঠান'))+'</div>'+
        '<div class="small bold mt16">'+esc(zv_l('After every upload','প্রতিটা আপলোডের পর'))+'</div>'+
        '<ol class="zv-ol">'+steps.map(function(x){ return '<li>'+esc(x)+'</li>'; }).join('')+'</ol>'+
        '<div class="zs-mini">'+esc(zv_l('Runs in the background on the fast temporary disk.','দ্রুত অস্থায়ী ডিস্কে ব্যাকগ্রাউন্ডে চলে।'))+'</div>'+
      '</section>'+
    '</div>'+
    '<section class="zs-card mt24"><h2>'+esc(zv_l('The 5 sizes','৫টা মাপ'))+'</h2><div class="zs-sub">'+esc(zv_l('Each size is made in three formats. The phone takes the best one it can read, and a phone never gets the 2000 px file.','প্রতিটা মাপ তিন ফরম্যাটে হয়। ফোন যেটা পড়তে পারে তার মধ্যে সেরাটা নেয়, আর মোবাইলে কখনো ২০০০ px-এর ফাইল যায় না।'))+'</div>'+
      '<table class="zv-t"><thead><tr>'+hd.map(function(h, i){ return '<th'+(i===1||i>2?' class="n"':'')+'>'+esc(h)+'</th>'; }).join('')+'</tr></thead><tbody>'+rows+'</tbody></table>'+
      '<div class="zs-mini mt8">'+esc(zv_l('KB = typical file size at quality '+g.q+'. Width and height are always set, so the page never jumps while photos load.','KB = মান '+g.q+'-এ সাধারণ ফাইলের মাপ। চওড়া আর উচ্চতা সবসময় বলা থাকে, তাই ছবি লোড হওয়ার সময় পেজ লাফায় না।'))+'</div>'+
    '</section>'+
  '</div>';
}};
INPUT['zv-q'] = function(el){ var g = zv_st().img, q = Math.max(75, Math.min(80, parseInt(el.value, 10) || 78)); g.q = q; saveState();
  var v = document.getElementById('zv-q-v'), t = document.getElementById('zv-q-tag'), e = document.getElementById('zv-est'); if(v) v.textContent = q; if(t) t.textContent = q; if(e) e.outerHTML = zv_imgEst(q); };
CHANGE['zv-q-done'] = function(){ rerender(); toast(zv_l('Quality saved: ','মান সেভ হয়েছে: ')+zv_st().img.q); };
ACT['zv-q-reset'] = function(){ zv_st().img.q = 78; saveState(); rerender(); toast(zv_l('Quality back to 78','মান আবার ৭৮')); };
ACT['zv-store'] = function(el){ var g = zv_st().img; g.store = el.getAttribute('data-v')==='disk' ? 'disk' : 'blob'; saveState(); rerender(); toast(g.store==='blob' ? zv_l('Photos: Azure Blob','ছবি: Azure Blob') : zv_l('Photos: server disk','ছবি: সার্ভারের ডিস্ক')); };
ACT['zv-cdn'] = function(){ var g = zv_st().img; g.cdn = !g.cdn; saveState(); rerender(); toast(g.cdn ? zv_l('CDN on','CDN চালু') : zv_l('CDN off — photos from the server','CDN বন্ধ — ছবি সার্ভার থেকে')); };

/* =====================================================================
   4. SPEED RESULTS (PR 234)
   ===================================================================== */
var ZV_SPD = [
  ['lcp', 'First big thing on screen (LCP)', 'প্রথম বড় জিনিস চোখে পড়া (LCP)', 2.5, function(v){ return v.toFixed(1)+' s'; }, '< 2.5 s'],
  ['cls', 'Page jumping (CLS)', 'পেজ লাফালাফি (CLS)', 0.1, function(v){ return v.toFixed(2); }, '< 0.1'],
  ['inp', 'Answer to a tap (INP)', 'চাপ দিলে সাড়া (INP)', 200, function(v){ return Math.round(v)+' ms'; }, '< 200 ms'],
  ['ttfb', 'First answer from the server (TTFB)', 'সার্ভারের প্রথম উত্তর (TTFB)', 600, function(v){ return Math.round(v)+' ms'; }, '< 600 ms'],
  ['cat', 'Category page total weight', 'ক্যাটাগরি পেজের মোট ওজন', 1, function(v){ return v.toFixed(2)+' MB'; }, '< 1 MB'],
  ['adm', 'Admin page open', 'অ্যাডমিনের পাতা খোলা', 1, function(v){ return v.toFixed(1)+' s'; }, '< 1 s']
];
function zv_month(ts){ var d = new Date(ts), en = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], bn = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর']; return zv_l(en[d.getMonth()]+' '+d.getFullYear(), bn[d.getMonth()]+' '+d.getFullYear()); }
PAGES['admin-speed'] = { layout:'admin', title:function(){ return zv_l('Speed','গতি'); }, render:function(){
  var s = zv_st(), runs = s.speed.runs, cur = runs[0], prev = runs[1];
  var hd = [zv_l('What','কী'), zv_l('Target','লক্ষ্য'), zv_l('This time','এবার'), zv_l('Before','আগেরবার'), zv_l('Result','ফল')];
  var pass = 0;
  var rows = ZV_SPD.map(function(m){
    var v = cur.v[m[0]], ok = v < m[3]; if(ok) pass++;
    return '<tr'+(ok?'':' class="bad"')+'><td class="h">'+esc(zv_l(m[1], m[2]))+'</td><td class="n" data-l="'+esc(hd[1])+'">'+esc(m[5])+'</td><td class="n" data-l="'+esc(hd[2])+'"><b>'+esc(m[4](v))+'</b></td><td class="n" data-l="'+esc(hd[3])+'">'+(prev ? esc(m[4](prev.v[m[0]])) : '—')+'</td><td data-l="'+esc(hd[4])+'">'+(ok ? zv_pill('ok', zv_l('Pass','পাস')) : zv_pill('bad', zv_l('Fail','ফেল')))+'</td></tr>'; }).join('');
  var hist = runs.map(function(r){ var p = ZV_SPD.filter(function(m){ return r.v[m[0]] < m[3]; }).length;
    return '<div class="zs-li"><div style="min-width:0"><div class="t">'+esc(zv_month(r.at))+' · '+esc(zv_time(r.at))+'</div><div class="m">'+esc(r.auto ? zv_l('Automatic monthly run','মাসের স্বয়ংক্রিয় মাপ') : zv_l('Measured by you','আপনি মেপেছেন'))+'</div></div><div class="r">'+(p===6 ? zv_pill('ok', zv_l('6 of 6 pass','৬টার ৬টাই পাস')) : zv_pill('bad', zv_l(p+' of 6 pass','৬টার মধ্যে '+p+'টা পাস')))+'</div></div>'; }).join('');
  var nx = new Date(); nx = new Date(nx.getFullYear(), nx.getMonth()+1, 1, 3, 0);
  var catBad = cur.v.cat >= 1;
  return '<div class="zs-page zv-page">'+
    zs_head(zv_l('Admin · System','অ্যাডমিন · সিস্টেম')+' '+zs_pr('234'), esc(zv_l('Speed','গতি')), null,
      esc(zv_l('Measured once a month from Dhaka, on a mid-range phone over 4G — not office Wi-Fi. If a target is not met, the work is not finished.','মাসে একবার ঢাকা থেকে, মাঝারি দামের ফোনে, ৪G-তে মাপা হয় — অফিসের ওয়াইফাইতে না। কোনো লক্ষ্য না ছুঁলে কাজ শেষ হয়নি ধরা হয়।')),
      zv_sample()+'<button type="button" class="btn btn-primary" data-act="zv-measure">'+ico('play',14)+esc(zv_l('Measure now','এখনই মাপুন'))+'</button>')+
    zv_tabs('speed')+
    '<div class="zs-kpis k4">'+
      '<div class="zs-k '+(pass===6?'ok':'warn')+'"><div class="v">'+pass+' / 6</div><div class="l">'+esc(zv_l('Targets met','লক্ষ্য ছুঁয়েছে'))+'</div><div class="s">'+esc(zv_month(cur.at))+'</div></div>'+
      '<div class="zs-k"><div class="v">'+esc(zv_time(cur.at).split(' · ')[0])+'</div><div class="l">'+esc(zv_l('Last measured','শেষ মাপা'))+'</div><div class="s">'+esc(zv_ago(cur.at))+'</div></div>'+
      '<div class="zs-k"><div class="v">'+esc(zv_time(nx.getTime()).split(' · ')[0])+'</div><div class="l">'+esc(zv_l('Next automatic','পরের স্বয়ংক্রিয়'))+'</div><div class="s">03:00</div></div>'+
      '<div class="zs-k"><div class="v">4G</div><div class="l">'+esc(zv_l('Dhaka · phone','ঢাকা · ফোন'))+'</div><div class="s">'+esc(zv_l('mid-range Android','মাঝারি Android'))+'</div></div>'+
    '</div>'+
    '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+esc(zv_l('Results','ফলাফল'))+' · '+esc(zv_month(cur.at))+'</h2>'+(pass===6 ? zv_pill('ok', zv_l('All targets met','সব লক্ষ্য ছুঁয়েছে')) : zv_pill('bad', zv_l((6-pass)+' not met','৬টার মধ্যে '+(6-pass)+'টা ছোঁয়নি')))+'</div>'+
      '<div class="zs-sub">'+esc(zv_l('Home, a category, a product and checkout are measured; the slowest page counts.','হোম, একটা ক্যাটাগরি, একটা প্রোডাক্ট আর চেকআউট মাপা হয়; সবচেয়ে ধীর পাতাটা ধরা হয়।'))+'</div>'+
      '<table class="zv-t"><thead><tr>'+hd.map(function(h, i){ return '<th'+(i>0&&i<4?' class="n"':'')+'>'+esc(h)+'</th>'; }).join('')+'</tr></thead><tbody>'+rows+'</tbody></table>'+
      (catBad ? '<div class="zs-note warn mt12">'+ico('info',16)+'<div>'+esc(zv_l('Category page is '+cur.v.cat.toFixed(2)+' MB: the top banner photo is 380 KB. Prohori suggests making it smaller with the image settings — low risk.','ক্যাটাগরি পেজ '+cur.v.cat.toFixed(2)+' MB: উপরের ব্যানারের ছবিটা ৩৮০ KB। প্রহরীর প্রস্তাব: ছবির সেটিংস দিয়ে ছোট করা — ঝুঁকি কম।'))+' <a class="zs-link" href="#/admin/images">'+esc(zv_l('Image settings','ছবির সেটিংস'))+' →</a></div></div>' : '')+
    '</section>'+
    '<section class="zs-card mt24"><h2>'+esc(zv_l('Earlier measurements','আগের মাপ'))+'</h2><div class="zs-sub">'+esc(zv_l('One row per measurement, newest first.','প্রতিটা মাপের একটা লাইন, নতুনটা আগে।'))+'</div><div class="zs-list">'+hist+'</div></section>'+
  '</div>';
}};
function zv_msHTML(){
  var u = UI['zv-ms']; if(!u) return '';
  var steps = [zv_l('Opening Home on a 4G phone from Dhaka','ঢাকা থেকে ৪G ফোনে হোম খোলা হচ্ছে'), zv_l('Opening a category','একটা ক্যাটাগরি খোলা হচ্ছে'), zv_l('Opening a product and tapping a size','একটা প্রোডাক্ট খুলে সাইজে চাপ দেওয়া হচ্ছে'), zv_l('Opening checkout and admin','চেকআউট আর অ্যাডমিন খোলা হচ্ছে')];
  if(u.phase>steps.length) return '<div class="stack s16" style="text-align:center"><span class="zs-okc">'+ico('check',26)+'</span><div class="h2">'+esc(zv_l('Measured','মাপা হয়েছে'))+'</div><div class="xs muted">'+esc(zv_l('Demo — sample numbers.','ডেমো — নমুনা সংখ্যা।'))+'</div><button type="button" class="btn btn-primary btn-block" data-act="close-modal">'+esc(zv_l('See the results','ফলাফল দেখুন'))+'</button></div>';
  return '<div class="stack s16">'+zs_steps(steps, u.phase)+zs_bar((u.phase-1)/steps.length*100)+'</div>';
}
ACT['zv-measure'] = function(){
  UI['zv-ms'] = {phase:1}; openModal(zv_msHTML(), {title:zv_l('Measuring speed','গতি মাপা হচ্ছে'), rebuild:zv_msHTML, zsKey:'zv-ms'});
  zs_runSteps('zv-ms', [1,2,3,4], 500, function(){ var s = zv_st(); s.speed.runs.unshift({at:Date.now(), auto:false, v:{lcp:2.1, cls:0.03, inp:140, ttfb:400, cat:0.84, adm:0.6}}); s.speed.runs = s.speed.runs.slice(0, 8); saveState(); rerender(); toast(zv_l('Speed measured — 6 of 6 targets met (sample)','গতি মাপা হয়েছে — ৬টার ৬টাই পাস (নমুনা)')); });
};

/* =====================================================================
   5. KEYS & CONNECTIONS (vault, PR 493)
   ===================================================================== */
var ZV_KEYS = [
  ['blob', 'Azure Blob storage', 'Azure Blob স্টোরেজ', 'Photos, media and backups (fast restore to any minute)', 'ছবি, মিডিয়া আর ব্যাকআপ (যেকোনো মিনিটে দ্রুত ফেরানো)', 'Connection string', 'কানেকশন স্ট্রিং'],
  ['drive', 'Google Drive', 'গুগল ড্রাইভ', 'Daily encrypted backup copy', 'প্রতিদিনের এনক্রিপ্ট করা ব্যাকআপ কপি', 'Google sign-in', 'গুগল সাইন-ইন'],
  ['drive2', 'Second Google Drive (add-only)', 'দ্বিতীয় গুগল ড্রাইভ (শুধু যোগ করা যায়)', 'A third backup copy that cannot be deleted', 'ব্যাকআপের তৃতীয় কপি, যা মোছা যায় না', 'Google sign-in', 'গুগল সাইন-ইন'],
  ['cf', 'Cloudflare', 'Cloudflare', 'CDN, cache clearing, protection', 'CDN, ক্যাশ মোছা, সুরক্ষা', 'API token', 'API টোকেন'],
  ['tg', 'Telegram (AI 360 channel)', 'টেলিগ্রাম (AI 360 চ্যানেল)', 'Server and backup alerts', 'সার্ভার আর ব্যাকআপের খবর', 'Bot token', 'বট টোকেন']
];
PAGES['admin-integrations'] = { layout:'admin', title:function(){ return zv_l('Keys & connections','চাবি ও সংযোগ'); }, render:function(){
  var s = zv_st();
  return '<div class="zs-page zv-page">'+
    zs_head(zv_l('Admin · System','অ্যাডমিন · সিস্টেম')+' '+zs_pr('493'), esc(zv_l('Keys & connections','চাবি ও সংযোগ')), null,
      esc(zv_l('Every key the shop needs lives here, encrypted — never in the code. A new owner or a new server only needs new keys here.','দোকানের যত চাবি লাগে সব এখানে, এনক্রিপ্ট করা — কোডে কখনো না। নতুন মালিক বা নতুন সার্ভারে শুধু এখানে নতুন চাবি দিলেই চলে।')),
      zv_sample())+
    zv_tabs('keys')+
    '<section class="zs-card"><h2>'+esc(zv_l('Connections','সংযোগ'))+'</h2><div class="zs-sub">'+esc(zv_l('A saved key is never shown again.','সেভ করা চাবি আর কখনো দেখানো হয় না।'))+'</div>'+
      ZV_KEYS.map(function(k){ var on = s.keys[k[0]] && s.keys[k[0]].on;
        return '<div class="zs-row" id="zv-key-'+k[0]+'"><div class="grow"><div class="small bold"><span class="zs-dot'+(on?'':' off')+'" style="margin-right:7px"></span>'+esc(zv_l(k[1], k[2]))+'</div><div class="zs-mini">'+esc(zv_l(k[3], k[4]))+'</div>'+
          '<div class="zs-mini">'+(on ? ico('lock',11)+' '+esc(zv_l('Saved in the vault · ••••','ভল্টে সেভ করা · ••••')) : esc(zv_l('Not connected','সংযুক্ত নয়')))+'</div></div>'+
          (on ? '<button type="button" class="btn btn-sm btn-ghost" data-act="zv-key-off" data-k="'+k[0]+'">'+esc(zv_l('Remove','সরান'))+'</button>'
              : '<button type="button" class="btn btn-sm btn-primary" data-act="zv-key-add" data-k="'+k[0]+'">'+ico('plus',14)+esc(zv_l('Add key','চাবি দিন'))+'</button>')+'</div>'; }).join('')+
    '</section>'+
    '<div class="zs-note mt16">'+ico('shield',16)+'<div>'+esc(zv_l('Demo: what you type here is not kept anywhere — only "connected" is remembered. Never paste a real key into this demo.','ডেমো: এখানে যা লিখবেন তা কোথাও রাখা হয় না — শুধু "সংযুক্ত" কথাটা মনে রাখে। এই ডেমোতে কখনো আসল চাবি দেবেন না।'))+'</div></div>'+
  '</div>';
}};
function zv_keyHTML(){
  var u = UI['zv-key']; if(!u) return ''; var k = ZV_KEYS.filter(function(x){ return x[0]===u.k; })[0]; if(!k) return '';
  return '<div class="stack s16"><div class="small text2">'+esc(zv_l(k[3], k[4]))+'</div>'+
    '<div><label class="label" for="zv-key-in">'+esc(zv_l(k[5], k[6]))+'</label><input id="zv-key-in" class="input" type="password" autocomplete="off" spellcheck="false" data-input="zv-key-in" placeholder="'+esc(zv_l('Paste the key','চাবিটা পেস্ট করুন'))+'"></div>'+
    '<div class="zs-mini">'+ico('lock',11)+' '+esc(zv_l('Kept encrypted in the vault, never shown again. Demo: nothing is stored.','ভল্টে এনক্রিপ্ট করে রাখা হয়, আর কখনো দেখানো হয় না। ডেমো: কিছুই রাখা হয় না।'))+'</div>'+
    '<div class="row end" style="gap:8px"><button type="button" class="btn btn-ghost" data-act="close-modal">'+esc(zv_l('Cancel','বাতিল'))+'</button><button type="button" class="btn btn-primary" id="zv-key-go" data-act="zv-key-save" disabled>'+ico('check',15)+esc(zv_l('Save and test','সেভ করে পরীক্ষা করুন'))+'</button></div></div>';
}
ACT['zv-key-add'] = function(el){ UI['zv-key'] = {k:el.getAttribute('data-k')}; var k = ZV_KEYS.filter(function(x){ return x[0]===UI['zv-key'].k; })[0]; openModal(zv_keyHTML(), {title:zv_l('Connect ','সংযোগ: ')+(k ? zv_l(k[1], k[2]) : ''), rebuild:zv_keyHTML}); };
INPUT['zv-key-in'] = function(el){ var b = document.getElementById('zv-key-go'); if(b) b.disabled = el.value.trim().length<8; };
ACT['zv-key-save'] = function(){
  var u = UI['zv-key']; if(!u) return; var inp = document.getElementById('zv-key-in'); if(inp) inp.value = '';   /* never kept */
  var s = zv_st(); s.keys[u.k] = {on:true, at:Date.now()};
  if(u.k==='blob'){ var b = zv_bkx(); b.blobFrom = Date.now(); b.runs.unshift({id:'BK-'+((+String((b.runs[0]||{}).id||'BK-2410').replace(/\D/g,''))+1), at:Date.now(), kind:'First copy to Azure Blob', size:(b.runs[0]?b.runs[0].size:1.84), mins:4, st:'ok', blob:true, note:'Database, uploads, settings, agent library · checksum verified'}); }
  closeModal(); saveState(); rerender();
  toast(u.k==='blob' ? zv_l('Azure Blob connected — first full copy sent (demo)','Azure Blob সংযুক্ত — প্রথম পূর্ণ কপি গেছে (ডেমো)') : zv_l('Connected (demo)','সংযুক্ত হয়েছে (ডেমো)'));
};
ACT['zv-key-off'] = function(el){
  var k = el.getAttribute('data-k'), s = zv_st();
  if(k==='drive'){ toast(zv_l('Google Drive is required for backups — it cannot be removed','ব্যাকআপের জন্য গুগল ড্রাইভ লাগবেই — সরানো যাবে না')); return; }
  s.keys[k] = {on:false}; saveState(); rerender(); toast(zv_l('Removed from the vault','ভল্ট থেকে সরানো হয়েছে'));
};

/* =====================================================================
   6. BACKUP — Azure Blob + Google Drive (PR 8 · 395 · 507), re-rendered
      Keeps every earlier behaviour (Back up now, Restore with a typed
      RESTORE, staging first, the drill, schedule, what is included).
   ===================================================================== */
function zv_bkx(){
  var b = zs_bk();
  if(b.walDays==null) b.walDays = 14;
  if(b.softDays==null) b.softDays = 30;
  if(!b.tests){ var now = Date.now(), D = 86400000;
    b.tests = [{at:b.lastDrill || now - 12*D, src:'drive', ok:true, mins:18, orders:12431}, {at:(b.lastDrill || now - 12*D) - 31*D, src:'drive', ok:true, mins:19, orders:11902}, {at:(b.lastDrill || now - 12*D) - 61*D, src:'drive', ok:true, mins:17, orders:11388}]; }
  return b;
}
function zv_runDest(r){ var b = zv_bkx(); return {drive:true, blob: zv_blobOn() && (r.blob || !b.blobFrom || r.at>=b.blobFrom)}; }
function zv_lastBlob(){ var b = zv_bkx(); for(var i=0;i<b.runs.length;i++) if(zv_runDest(b.runs[i]).blob) return b.runs[i]; return null; }
/* the two destinations (the Server page shows a short form) */
function zv_bkDest(short){
  var b = zv_bkx(), last = b.runs[0], blob = zv_blobOn(), lb = zv_lastBlob(), s = zv_st();
  var stat = function(r){ return r ? (r.st==='bad' ? zv_pill('bad', zv_l('Failed','ব্যর্থ')) : zv_pill('ok', 'OK')) : ''; };
  var line = function(lab, r){ return '<div class="zv-pr"><span>'+esc(lab)+'</span><b>'+(r ? esc(zv_time(r.at))+' · '+r.size.toFixed(2)+' GB ' : '— ')+stat(r)+'</b></div>'; };
  if(short) return '<div class="zs-sub">'+esc(zv_l('Every night to two places.','প্রতি রাতে দুই জায়গায়।'))+'</div>'+
    line(zv_l('Google Drive','গুগল ড্রাইভ'), last)+
    (blob ? line('Azure Blob', lb) : '<div class="zv-pr"><span>Azure Blob</span><b><a class="zs-link" href="#/admin/integrations">'+esc(zv_l('Not connected — add key','সংযুক্ত নয় — চাবি দিন'))+'</a></b></div>')+
    '<div class="zv-pr"><span>'+esc(zv_l('Monthly restore test','মাসিক ফেরানোর পরীক্ষা'))+'</span><b>'+esc(zv_ago(b.tests[0].at))+' '+(b.tests[0].ok ? zv_pill('ok', zv_l('Passed','পাস')) : zv_pill('bad', zv_l('Failed','ব্যর্থ')))+'</b></div>';
  var drive =
    '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+esc(zv_l('Google Drive','গুগল ড্রাইভ'))+'</h2><span class="row" style="gap:6px"><span class="tag plain">'+esc(zv_l('Required','বাধ্যতামূলক'))+'</span><span class="tag">'+ico('check',12)+esc(zv_l('Connected','সংযুক্ত'))+'</span></span></div>'+
      '<div class="zs-sub">'+esc(zv_l('A full copy every night, encrypted before it leaves the server. A different company from Azure, so it is safe even if Azure has a problem.','প্রতি রাতে পুরো একটা কপি, সার্ভার থেকে বের হওয়ার আগেই এনক্রিপ্ট করা। Azure থেকে আলাদা কোম্পানি, তাই Azure-এ সমস্যা হলেও নিরাপদ।'))+'</div>'+
      line(zv_l('Last backup','শেষ ব্যাকআপ'), last)+
      '<div class="zs-row"><div class="grow"><label class="small bold" for="zs-bk-f">'+esc(zv_l('Folder name','ফোল্ডারের নাম'))+'</label><input id="zs-bk-f" class="input zs-in mt8" style="width:100%" value="'+esc(b.folder)+'" data-input="zv-bk-folder"></div></div>'+
      '<div class="zs-row"><div class="grow"><div class="small bold">'+esc(zv_l('Encrypted before upload','আপলোডের আগে এনক্রিপ্ট'))+'</div><div class="zs-mini">'+esc(zv_l('The key lives in the vault (PR 493), not on Drive','চাবি থাকে ভল্টে (PR 493), ড্রাইভে না'))+'</div></div>'+zs_sw(b.encrypt, 'zv-bk-tog', zv_l('Encrypt backups','ব্যাকআপ এনক্রিপ্ট'), 'data-k="encrypt"')+'</div>'+
      '<div class="zs-row"><div class="grow"><div class="small bold">'+esc(zv_l('Second Drive · add-only','দ্বিতীয় ড্রাইভ · শুধু যোগ করা যায়'))+'</div><div class="zs-mini">'+esc(s.keys.drive2.on ? zv_l('A third copy. Files can be added but never deleted or changed — safe from mistakes and ransomware.','তৃতীয় কপি। ফাইল যোগ করা যায়, কিন্তু মোছা বা বদলানো যায় না — ভুল আর র‍্যানসমওয়্যার থেকে নিরাপদ।') : zv_l('Not connected','সংযুক্ত নয়'))+'</div></div>'+(s.keys.drive2.on ? stat(last) : '<a class="zs-link" href="#/admin/integrations">'+esc(zv_l('Add','যোগ করুন'))+'</a>')+'</div>'+
      '<div class="zs-actions mt12"><button type="button" class="btn btn-sm btn-secondary" data-act="zv-bk-test">'+ico('link',14)+esc(zv_l('Test connection','সংযোগ পরীক্ষা'))+'</button></div>'+
    '</section>';
  var from = new Date(Date.now() - b.walDays*86400000);
  var az = blob
    ? '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Azure Blob</h2><span class="tag">'+ico('check',12)+esc(zv_l('Connected','সংযুক্ত'))+'</span></div>'+
        '<div class="zs-sub">'+esc(zv_l('Same region as the server, so restoring is fast. A full copy every night plus every change, minute by minute.','সার্ভারের একই রিজিয়নে, তাই ফেরানো দ্রুত। প্রতি রাতে পুরো কপি, আর প্রতি মিনিটের প্রতিটা বদল।'))+'</div>'+
        line(zv_l('Last full copy','শেষ পূর্ণ কপি'), lb)+
        '<div class="zv-pr"><span>'+esc(zv_l('Changes saved minute by minute','প্রতি মিনিটের বদল সেভ'))+'</span><b>'+esc(zv_l('1 min ago','১ মিনিট আগে'))+' '+zv_pill('ok', 'OK')+'</b></div>'+
        '<div class="zv-pr"><span>'+esc(zv_l('Restore to any minute','যেকোনো মিনিটে ফেরানো'))+'</span><b>'+esc(zv_l('from ','')+zv_time(Math.max(from.getTime(), b.blobFrom||0))+zv_l(' to now',' থেকে এখন পর্যন্ত'))+'</b></div>'+
        '<div class="zs-row"><div class="grow"><label class="small bold" for="zv-soft">'+esc(zv_l('Deleted backups can be brought back for','মুছে ফেলা ব্যাকআপ ফেরানো যাবে'))+'</label><div class="zs-mini">'+esc(zv_l('Soft delete + versioning — a mistake or ransomware cannot wipe it','সফট ডিলিট + ভার্শনিং — ভুল বা র‍্যানসমওয়্যার মুছে দিতে পারবে না'))+'</div></div>'+
          '<select id="zv-soft" class="input zs-in zv-sel" data-change="zv-bk-sel" data-k="softDays">'+[7,14,30].map(function(o){ return '<option value="'+o+'"'+(b.softDays===o?' selected':'')+'>'+o+' '+esc(zv_l('days','দিন'))+'</option>'; }).join('')+'</select></div>'+
      '</section>'
    : '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Azure Blob</h2><span class="tag plain">'+esc(zv_l('Not connected','সংযুক্ত নয়'))+'</span></div>'+
        '<div class="zs-note warn mt8" data-testid="zv-blob-off">'+ico('info',16)+'<div><b>'+esc(zv_l('Not connected — add key in Integrations.','সংযুক্ত নয় — Integrations-এ চাবি দিন।'))+'</b> <a class="zs-link" href="#/admin/integrations">'+esc(zv_l('Open Keys & connections','চাবি ও সংযোগ খুলুন'))+' →</a></div></div>'+
        '<div class="small bold mt16">'+esc(zv_l('Once the key is added','চাবি দেওয়ার পর'))+'</div>'+
        '<ul class="zv-ol">'+[zv_l('A full copy every night','প্রতি রাতে পুরো একটা কপি'), zv_l('Every change saved minute by minute','প্রতি মিনিটের প্রতিটা বদল সেভ'), zv_l('Restore to any minute — fast, same region','যেকোনো মিনিটে ফেরানো — দ্রুত, একই রিজিয়ন'), zv_l('Deleted backups can be brought back for '+b.softDays+' days','মুছে ফেলা ব্যাকআপ '+b.softDays+' দিন পর্যন্ত ফেরানো যাবে')].map(function(x){ return '<li>'+esc(x)+'</li>'; }).join('')+'</ul>'+
        '<div class="zs-mini">'+esc(zv_l('Until then every backup goes to Google Drive only.','ততদিন সব ব্যাকআপ শুধু গুগল ড্রাইভে যাবে।'))+'</div>'+
      '</section>';
  return '<div class="zs-g2">'+drive+az+'</div>';
}
var ZV_INC = [['db','Database','ডাটাবেস','Orders, customers, products, all accounts','অর্ডার, কাস্টমার, প্রোডাক্ট, সব হিসাব'],['uploads','Uploads','আপলোড','Photos, invoices, files','ছবি, ইনভয়েস, ফাইল'],['config','Settings & configuration','সেটিংস ও কনফিগারেশন','Every setting and rule','সব সেটিংস আর নিয়ম'],['library','Agent library','এজেন্টদের লাইব্রেরি','The seven agents\' skills, lessons and work log','সাত এজেন্টের স্কিল, লেসন, ওয়ার্ক লগ']];
PAGES['admin-backup'] = { layout:'admin', title:function(){ return zv_l('Backup','ব্যাকআপ'); }, render:function(){
  var b = zv_bkx(), last = b.runs[0], blob = zv_blobOn(), t0 = b.tests[0];
  var nx = zs_bkNext(b);
  var sel = function(id, k, opts){ return '<select id="'+id+'" class="input zs-in" data-change="zv-bk-sel" data-k="'+k+'">'+opts.map(function(o){ return '<option value="'+o[0]+'"'+(String(b[k])===String(o[0])?' selected':'')+'>'+esc(o[1])+'</option>'; }).join('')+'</select>'; };
  var runs = b.runs.slice(0, 10).map(function(r){ var d = zv_runDest(r);
    return '<div class="zs-li"><div style="min-width:0"><div class="t"><span class="zs-dot'+(r.st==='warn'?' warn':r.st==='bad'?' bad':'')+'" style="margin-right:7px"></span>'+esc(zv_time(r.at))+' <span class="zs-mini" style="font-weight:500">· '+r.size.toFixed(2)+' GB · '+r.mins+' '+esc(zv_l('min','মিনিট'))+'</span></div>'+
      '<div class="m">'+esc(r.id)+' · '+esc(/Manual/.test(r.kind) ? zv_l('By you','আপনি নিজে') : /First/.test(r.kind) ? zv_l('First copy to Azure Blob','Azure Blob-এ প্রথম কপি') : zv_l('Scheduled','নির্ধারিত সময়ে'))+(r.st==='warn' ? ' · '+esc(zv_l('2 files were busy — retried and saved','২টা ফাইল ব্যস্ত ছিল — আবার চেষ্টা করে সেভ হয়েছে')) : '')+'</div>'+
      '<div class="zv-dst"><span class="on">'+ico('check',11)+'Drive</span><span class="'+(d.blob?'on':'')+'">'+(d.blob?ico('check',11):'')+'Blob'+(d.blob?'':' —')+'</span></div></div>'+
      '<div class="r"><button type="button" class="btn btn-sm btn-ghost" data-act="zs-bk-restore" data-id="'+r.id+'">'+ico('swap',14)+esc(zv_l('Restore','ফেরান'))+'</button></div></div>'; }).join('');
  var inc = ZV_INC.map(function(x){ return '<div class="zs-row"><div class="grow"><div class="small bold">'+esc(zv_l(x[1], x[2]))+'</div><div class="zs-mini">'+esc(zv_l(x[3], x[4]))+'</div></div>'+zs_sw(b.include[x[0]], 'zv-bk-inc', zv_l(x[1], x[2]), 'data-k="'+x[0]+'"')+'</div>'; }).join('');
  var tests = b.tests.slice(0, 4).map(function(t){
    return '<div class="zs-li"><div style="min-width:0"><div class="t">'+esc(zv_time(t.at))+'</div><div class="m">'+esc(zv_l('From ','')+(t.src==='blob'?'Azure Blob':zv_l('Google Drive','গুগল ড্রাইভ'))+zv_l(' to the test server · '+t.mins+' min · '+t.orders.toLocaleString('en-US')+' orders match',' থেকে টেস্ট সার্ভারে · '+t.mins+' মিনিট · '+t.orders.toLocaleString('en-US')+'টা অর্ডার মিলেছে'))+'</div></div><div class="r">'+(t.ok ? zv_pill('ok', zv_l('Passed','পাস')) : zv_pill('bad', zv_l('Failed','ব্যর্থ')))+'</div></div>'; }).join('');
  return '<div class="zs-page zv-page">'+
    zs_head(zv_l('Admin · Foundation','অ্যাডমিন · ভিত্তি')+' '+zs_pr('8 · 395 · 396 · 507'), esc(zv_l('Backup','ব্যাকআপ')), null,
      esc(zv_l('The whole shop (database, photos, settings and the agents\' library) is copied every night to two places: Azure Blob for a fast restore to any minute, and Google Drive as an encrypted copy with another company. Restoring always goes to the test server first.','পুরো দোকান (ডাটাবেস, ছবি, সেটিংস আর এজেন্টদের লাইব্রেরি) প্রতি রাতে দুই জায়গায় কপি হয়: যেকোনো মিনিটে দ্রুত ফেরানোর জন্য Azure Blob, আর অন্য কোম্পানির কাছে এনক্রিপ্ট করা কপি হিসেবে গুগল ড্রাইভ। ফেরানো সবসময় আগে টেস্ট সার্ভারে হয়।')),
      zv_sample()+'<button type="button" class="btn btn-primary" data-act="zs-bk-now" data-testid="zs-bk-now">'+ico('shield',16)+esc(zv_l('Back up now','এখনই ব্যাকআপ নিন'))+'</button>')+
    zv_tabs('backup')+
    '<div class="zs-kpis k4">'+
      '<div class="zs-k '+(last.st==='bad'?'bad':'ok')+'"><div class="v">'+(last.st==='bad'?esc(zv_l('Failed','ব্যর্থ')):'OK')+'</div><div class="l">'+esc(zv_l('Last backup','শেষ ব্যাকআপ'))+'</div><div class="s">'+esc(zv_time(last.at))+'</div></div>'+
      '<div class="zs-k"><div class="v">'+esc(zv_time(nx).split(' · ')[1])+'</div><div class="l">'+esc(zv_l('Next backup','পরের ব্যাকআপ'))+'</div><div class="s">'+esc(zv_time(nx).split(' · ')[0])+'</div></div>'+
      '<div class="zs-k '+(blob?'ok':'warn')+'"><div class="v">'+esc(blob ? zv_l('Any minute','যেকোনো মিনিট') : zv_l('Nightly only','শুধু রাতের কপি'))+'</div><div class="l">'+esc(zv_l('Restore point','কোথায় ফেরানো যায়'))+'</div><div class="s">'+esc(blob ? zv_l('last '+b.walDays+' days','গত '+b.walDays+' দিন') : zv_l('needs Azure Blob','Azure Blob লাগবে'))+'</div></div>'+
      '<div class="zs-k '+(t0.ok?'ok':'bad')+'"><div class="v">'+esc(t0.ok ? zv_l('Passed','পাস') : zv_l('Failed','ব্যর্থ'))+'</div><div class="l">'+esc(zv_l('Restore test','ফেরানোর পরীক্ষা'))+'</div><div class="s">'+esc(zv_ago(t0.at))+'</div></div>'+
    '</div>'+
    zv_bkDest(false)+
    '<div class="zs-g2 mt24">'+
      '<section class="zs-card"><div class="row between"><h2>'+esc(zv_l('Schedule & retention','সময় ও কত দিন রাখবে'))+'</h2>'+zs_pr('507')+'</div>'+
        '<div class="zs-sub">'+esc(zv_l('These are settings — change them any time.','এগুলো সেটিংস — যেকোনো সময় বদলানো যায়।'))+'</div>'+
        '<div class="grid g2 zv-g2" style="gap:10px">'+
          '<div><label class="label" for="zs-bk-s">'+esc(zv_l('How often','কতবার'))+'</label>'+sel('zs-bk-s', 'schedule', [['daily',zv_l('Every night','প্রতি রাতে')],['twice',zv_l('Twice a day (2 am + 2 pm)','দিনে দুইবার (রাত ২টা + দুপুর ২টা)')],['weekly',zv_l('Every Friday','প্রতি শুক্রবার')]])+'</div>'+
          '<div><label class="label" for="zs-bk-t">'+esc(zv_l('Time','সময়'))+'</label>'+sel('zs-bk-t', 'time', ['01:00','02:00','03:00','04:00'].map(function(o){ return [o, o]; }))+'</div>'+
          '<div><label class="label" for="zs-bk-kd">'+esc(zv_l('Keep daily copies','রোজের কপি রাখবে'))+'</label>'+sel('zs-bk-kd', 'keepDaily', [7,14,30].map(function(o){ return [o, o+' '+zv_l('days','দিন')]; }))+'</div>'+
          '<div><label class="label" for="zs-bk-kw">'+esc(zv_l('Keep weekly / monthly','সাপ্তাহিক / মাসিক রাখবে'))+'</label>'+sel('zs-bk-kw', 'keepWeekly', [[4,zv_l('4 weeks · 3 months','৪ সপ্তাহ · ৩ মাস')],[8,zv_l('8 weeks · 6 months','৮ সপ্তাহ · ৬ মাস')],[12,zv_l('12 weeks · 12 months','১২ সপ্তাহ · ১২ মাস')]])+'</div>'+
          '<div><label class="label" for="zv-wal">'+esc(zv_l('Keep minute-by-minute changes','প্রতি মিনিটের বদল রাখবে'))+'</label>'+sel('zv-wal', 'walDays', [7,14,30].map(function(o){ return [o, o+' '+zv_l('days','দিন')]; }))+'</div>'+
        '</div>'+
        '<div class="zs-row mt8"><div class="grow"><div class="small bold">'+esc(zv_l('Telegram me if a backup fails','ব্যাকআপ ব্যর্থ হলে টেলিগ্রামে জানাবে'))+'</div></div>'+zs_sw(b.tgFail, 'zv-bk-tog', zv_l('Telegram on failure','ব্যর্থ হলে টেলিগ্রাম'), 'data-k="tgFail"')+'</div>'+
        '<div class="zs-row"><div class="grow"><div class="small bold">'+esc(zv_l('Telegram me every morning it worked','প্রতি সকালে সফল হলে জানাবে'))+'</div></div>'+zs_sw(b.tgOk, 'zv-bk-tog', zv_l('Telegram on success','সফল হলে টেলিগ্রাম'), 'data-k="tgOk"')+'</div>'+
        '<div class="zs-note mt12">'+ico('info',16)+'<div>'+esc(zv_l('The zip is made on the fast temporary disk (NVMe), uploaded, then deleted there.','জিপ হয় দ্রুত অস্থায়ী ডিস্কে (NVMe), আপলোড হয়, তারপর সেখান থেকে মুছে যায়।'))+'</div></div>'+
      '</section>'+
      '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+esc(zv_l('Monthly restore test','মাসিক ফেরানোর পরীক্ষা'))+'</h2>'+zs_sw(b.drill, 'zv-bk-tog', zv_l('Monthly restore test','মাসিক ফেরানোর পরীক্ষা'), 'data-k="drill"')+'</div>'+
        '<div class="zs-sub">'+esc(zv_l('Once a month the shop restores last night\'s copy on the test server by itself and checks it opens. A backup never restored is not a backup.','মাসে একবার দোকান নিজেই শেষ রাতের কপি টেস্ট সার্ভারে ফিরিয়ে দেখে, ঠিকমতো খোলে কি না। যে ব্যাকআপ কখনো ফিরিয়ে দেখা হয়নি, সেটা ব্যাকআপ না।'))+'</div>'+
        '<div class="zs-list">'+tests+'</div>'+
        '<div class="zs-actions mt12"><button type="button" class="btn btn-sm btn-secondary" data-act="zs-bk-drill">'+ico('play',13)+esc(zv_l('Run restore test now','এখনই পরীক্ষা চালান'))+'</button></div>'+
      '</section>'+
    '</div>'+
    '<div class="zs-g2 mt24">'+
      '<section class="zs-card"><div class="row between"><h2>'+esc(zv_l('Last runs','শেষ কয়েকটা ব্যাকআপ'))+'</h2><span class="zs-mini">'+b.runs.length+'</span></div><div class="zs-sub">'+esc(zv_l('Restore from any copy — you choose Blob or Drive, and the minute.','যেকোনো কপি থেকে ফেরানো যায় — Blob না ড্রাইভ, আর কোন মিনিট, আপনি বাছবেন।'))+'</div><div class="zs-list">'+runs+'</div></section>'+
      '<section class="zs-card"><h2>'+esc(zv_l('What is in each backup','প্রতিটা ব্যাকআপে কী থাকে'))+'</h2><div class="zs-sub">'+esc(zv_l('Choose what goes in.','কী কী যাবে বাছুন।'))+'</div>'+inc+
        '<div class="zs-note mt12">'+ico('shield',16)+'<div>'+esc(zv_l('Even if the server breaks, nothing is lost: restore the last copy on a new server and the shop runs as before (PR 396).','সার্ভার নষ্ট হলেও কিছু হারাবে না: নতুন সার্ভারে শেষ কপি ফিরিয়ে আনলেই দোকান আগের মতো চলবে (PR 396)।'))+'</div></div>'+
      '</section>'+
    '</div>'+
  '</div>';
}};
ACT['zv-bk-tog'] = function(el){ var b = zv_bkx(), k = el.getAttribute('data-k'); b[k] = !b[k]; saveState(); rerender(); toast(b[k] ? zv_l('On — saved','চালু — সেভ হয়েছে') : zv_l('Off — saved','বন্ধ — সেভ হয়েছে')); };
ACT['zv-bk-inc'] = function(el){ var b = zv_bkx(), k = el.getAttribute('data-k'); if(k==='db' && b.include.db){ toast(zv_l('The database is always backed up','ডাটাবেসের ব্যাকআপ সবসময় হয়')); return; } b.include[k] = !b.include[k]; saveState(); rerender(); toast(b.include[k] ? zv_l('Included in the next backup','পরের ব্যাকআপে থাকবে') : zv_l('Left out of the next backup','পরের ব্যাকআপে থাকবে না')); };
CHANGE['zv-bk-sel'] = function(el){ var b = zv_bkx(), k = el.getAttribute('data-k'), v = el.value; b[k] = /^(keep|wal|soft)/.test(k) ? +v : v; if(k==='keepWeekly') b.keepMonthly = {4:3, 8:6, 12:12}[+v] || 3; saveState(); rerender(); toast(zv_l('Saved — ','সেভ হয়েছে — ')+el.options[el.selectedIndex].text); };
INPUT['zv-bk-folder'] = function(el){ var b = zv_bkx(); b.folder = el.value.trim() || 'EXTAS-Backups'; saveState(); };
ACT['zv-bk-test'] = function(){ toast(zv_l('Google Drive reachable · folder ','গুগল ড্রাইভ পাওয়া গেছে · ফোল্ডার ')+zv_bkx().folder+zv_l(' · write test OK (demo)',' · লেখার পরীক্ষা ঠিক (ডেমো)')); };

/* Back up now — both destinations */
function zv_bkSteps(){ var st = [zv_l('Dumping the database','ডাটাবেসের কপি নেওয়া হচ্ছে'), zv_l('Collecting uploads','আপলোড জড়ো করা হচ্ছে'), zv_l('Adding settings and the agent library','সেটিংস আর এজেন্টদের লাইব্রেরি যোগ হচ্ছে'), zv_l('Zipping and encrypting on the NVMe','NVMe-তে জিপ আর এনক্রিপ্ট হচ্ছে')];
  if(zv_blobOn()) st.push(zv_l('Uploading to Azure Blob','Azure Blob-এ পাঠানো হচ্ছে'));
  st.push(zv_l('Uploading to Google Drive','গুগল ড্রাইভে পাঠানো হচ্ছে'), zv_l('Checking the copy (checksum)','কপি ঠিক আছে কি না দেখা হচ্ছে (checksum)'));
  return st; }
function zv_bkNowHTML(){
  var u = UI['zs-bk']; if(!u) return ''; var steps = zv_bkSteps();
  if(u.phase>steps.length) return '<div class="stack s16" style="text-align:center"><span class="zs-okc">'+ico('check',26)+'</span><div><div class="h2">'+esc(zv_blobOn() ? zv_l('Backup saved to Google Drive and Azure Blob','গুগল ড্রাইভ আর Azure Blob-এ ব্যাকআপ সেভ হয়েছে') : zv_l('Backup saved to Google Drive','গুগল ড্রাইভে ব্যাকআপ সেভ হয়েছে'))+'</div><div class="small text2 mt8">'+esc(u.id)+' · '+u.size+' GB</div></div><div class="xs muted">'+esc(zv_l('Demo — nothing was really uploaded.','ডেমো — আসলে কিছু আপলোড হয়নি।'))+'</div><button type="button" class="btn btn-primary btn-block" data-act="close-modal">'+esc(zv_l('Done','ঠিক আছে'))+'</button></div>';
  return '<div class="stack s16"><div class="small text2">'+esc(zv_l('A copy of the whole shop is on its way. The shop keeps running.','পুরো দোকানের একটা কপি যাচ্ছে। দোকান চালু থাকবে।'))+'</div>'+zs_steps(steps, u.phase)+zs_bar((u.phase-1)/steps.length*100)+'</div>';
}
ACT['zs-bk-now'] = function(){
  UI['zs-bk'] = {phase:1}; openModal(zv_bkNowHTML(), {title:zv_l('Back up now','এখনই ব্যাকআপ'), rebuild:zv_bkNowHTML, zsKey:'zs-bk'});
  zs_runSteps('zs-bk', zv_bkSteps(), 480, function(u){
    var b = zv_bkx(), n = b.runs.length ? +String(b.runs[0].id).replace(/\D/g,'')+1 : 2411;
    u.id = 'BK-'+n; u.size = Math.round((b.runs[0] ? b.runs[0].size + 0.01 : 1.85)*100)/100;
    b.runs.unshift({id:u.id, at:Date.now(), kind:'Manual (you)', size:u.size, mins:3, st:'ok', blob:zv_blobOn(), note:'Database, uploads, settings, agent library · checksum verified'});
    saveState(); rerender(); toast(zv_l('Backup saved — ','ব্যাকআপ সেভ হয়েছে — ')+u.id);
  });
};
/* Restore — pick Blob (fast) or Drive (fallback), a point in time, staging first, typed RESTORE */
function zv_pad(n){ return (n<10?'0':'')+n; }
function zv_dtl(ts){ var d = new Date(ts); return d.getFullYear()+'-'+zv_pad(d.getMonth()+1)+'-'+zv_pad(d.getDate())+'T'+zv_pad(d.getHours())+':'+zv_pad(d.getMinutes()); }
function zv_rsHTML(){
  var u = UI['zs-rs']; if(!u) return ''; var b = zv_bkx(), r = b.runs.filter(function(x){ return x.id===u.id; })[0]; if(!r) return '';
  var blob = zv_blobOn(), src = u.src==='blob' && blob ? 'blob' : 'drive', minute = src==='blob' && u.pit==='minute';
  if(minute && !u.when) u.when = zv_dtl(Date.now()-3600000);
  var point = minute && u.when ? new Date(u.when).getTime() : r.at, pointTxt = zv_time(point);
  var steps = [src==='blob' ? zv_l('Taking the copy from Azure Blob','Azure Blob থেকে কপি আনা হচ্ছে') : zv_l('Downloading '+r.id+' from Google Drive','গুগল ড্রাইভ থেকে '+r.id+' নামানো হচ্ছে'), zv_l('Decrypting','এনক্রিপশন খোলা হচ্ছে'), minute ? zv_l('Restoring the database to '+pointTxt,'ডাটাবেস '+pointTxt+'-এর অবস্থায় ফেরানো হচ্ছে') : zv_l('Restoring the database','ডাটাবেস ফেরানো হচ্ছে'), zv_l('Restoring uploads and settings','আপলোড আর সেটিংস ফেরানো হচ্ছে'), zv_l('Opening the site and checking it','সাইট খুলে দেখা হচ্ছে')];
  if(u.phase>steps.length){
    var en = 'Restored to '+(u.where==='staging'?'the test server':'the live shop'), bn = u.where==='staging' ? 'টেস্ট সার্ভারে ফেরানো হয়েছে' : 'লাইভ দোকানে ফেরানো হয়েছে';
    return '<div class="stack s16" style="text-align:center"><span class="zs-okc">'+ico('check',26)+'</span><div><div class="h2">'+esc(zv_l(en, bn))+'</div><div class="small text2 mt8">'+esc(u.where==='staging' ? zv_l('Open the test server and check everything, then press "Make live".','টেস্ট সার্ভারে খুলে দেখুন সব ঠিক আছে কি না, তারপর "লাইভ করুন" চাপুন।') : zv_l('The shop is back to how it was at '+pointTxt+'.','দোকান '+pointTxt+'-এর অবস্থায় ফিরে গেছে।'))+'</div></div>'+
      '<div class="xs muted">'+esc(zv_l('Demo — nothing was really restored.','ডেমো — আসলে কিছু ফেরানো হয়নি।'))+'</div>'+
      '<div class="row" style="gap:10px">'+(u.where==='staging' ? '<button type="button" class="btn btn-ghost grow" data-act="close-modal">'+esc(zv_l('Later','পরে'))+'</button><button type="button" class="btn btn-primary grow" data-act="zv-rs-live">'+esc(zv_l('Make live','লাইভ করুন'))+'</button>' : '<button type="button" class="btn btn-primary btn-block" data-act="close-modal">'+esc(zv_l('Done','ঠিক আছে'))+'</button>')+'</div></div>';
  }
  if(u.phase>0) return '<div class="stack s16">'+zs_steps(steps, u.phase)+zs_bar((u.phase-1)/steps.length*100)+'<div class="xs muted">'+esc(zv_l('The live shop keeps running while this works.','এটা চলার সময়ও লাইভ দোকান চালু থাকে।'))+'</div></div>';
  var ok = String(u.typed||'').trim().toUpperCase()==='RESTORE';
  var chip = function(k, v, lab, dis){ return '<button type="button" class="chip'+(u[k]===v || (k==='src' && v===src) ? ' on' : '')+'" data-act="zs-rs-opt" data-k="'+k+'" data-v="'+v+'"'+(dis?' disabled':'')+'>'+esc(lab)+'</button>'; };
  return '<div class="stack s16">'+
    '<div class="zs-note warn">'+ico('info',17)+'<div><b>'+esc(zv_l('Careful:','সাবধান:'))+'</b> '+esc(zv_l('restoring the live shop removes orders and changes made after '+pointTxt+'. Restore on the test server first.','লাইভে ফেরালে '+pointTxt+'-এর পরের অর্ডার আর বদল চলে যাবে। তাই আগে টেস্ট সার্ভারে ফেরান।'))+'</div></div>'+
    '<div><div class="label">'+esc(zv_l('Restore from','কোথা থেকে ফেরাবেন'))+'</div><div class="zs-chipset">'+chip('src', 'blob', blob ? zv_l('Azure Blob · fast','Azure Blob · দ্রুত') : zv_l('Azure Blob · not connected','Azure Blob · সংযুক্ত নয়'), !blob)+chip('src', 'drive', zv_l('Google Drive · fallback','গুগল ড্রাইভ · বিকল্প'))+'</div></div>'+
    '<div><div class="label">'+esc(zv_l('Point in time','কোন সময়ে'))+'</div><div class="zs-chipset">'+chip('pit', 'backup', zv_l('This backup · ','এই ব্যাকআপ · ')+zv_time(r.at))+chip('pit', 'minute', zv_l('A chosen minute','নির্দিষ্ট মিনিট'), src!=='blob')+'</div>'+
      (src!=='blob' ? '<div class="zs-mini mt8">'+esc(zv_l('Any minute needs Azure Blob; Drive has the nightly copies.','যেকোনো মিনিটে ফেরাতে Azure Blob লাগে; ড্রাইভে শুধু রাতের কপি থাকে।'))+'</div>' : '')+
      (minute ? '<label class="label mt8" for="zv-rs-when">'+esc(zv_l('Date and minute','তারিখ আর মিনিট'))+'</label><input id="zv-rs-when" class="input" type="datetime-local" data-input="zv-rs-when" min="'+zv_dtl(Date.now()-b.walDays*86400000)+'" max="'+zv_dtl(Date.now())+'" value="'+esc(u.when||zv_dtl(Date.now()-3600000))+'">' : '')+'</div>'+
    '<div><div class="label">'+esc(zv_l('What to bring back','কী ফেরাবেন'))+'</div><div class="zs-chipset">'+chip('what', 'all', zv_l('Everything','সব'))+chip('what', 'db', zv_l('Database only','শুধু ডাটাবেস'))+chip('what', 'config', zv_l('Settings only','শুধু সেটিংস'))+'</div></div>'+
    '<div><div class="label">'+esc(zv_l('Where','কোথায়'))+'</div><div class="zs-chipset">'+chip('where', 'staging', zv_l('Test server first (recommended)','আগে টেস্ট সার্ভারে (ভালো)'))+chip('where', 'live', zv_l('Live shop','লাইভ দোকান'))+'</div></div>'+
    '<div><label class="label" for="zs-rs-type">'+esc(zv_l('Type RESTORE to confirm','নিশ্চিত করতে RESTORE লিখুন'))+'</label><input id="zs-rs-type" class="input" autocomplete="off" value="'+esc(u.typed||'')+'" data-input="zs-rs-type" placeholder="RESTORE"></div>'+
    '<div class="row end" style="gap:8px"><button type="button" class="btn btn-ghost" data-act="close-modal">'+esc(zv_l('Cancel','বাতিল'))+'</button><button type="button" class="btn btn-primary" id="zs-rs-go" data-act="zs-rs-go"'+(ok?'':' disabled')+'>'+ico('swap',15)+esc(zv_l('Restore','ফেরান'))+' '+esc(r.id)+'</button></div>'+
  '</div>';
}
ACT['zs-bk-restore'] = function(el){ UI['zs-rs'] = {id:el.getAttribute('data-id'), src:zv_blobOn()?'blob':'drive', pit:'backup', when:'', what:'all', where:'staging', typed:'', phase:0}; openModal(zv_rsHTML(), {title:zv_l('Restore a backup','ব্যাকআপ ফেরান'), rebuild:zv_rsHTML, zsKey:'zs-rs'}); };
ACT['zs-rs-opt'] = function(el){ var u = UI['zs-rs']; if(!u || el.disabled) return; u[el.getAttribute('data-k')] = el.getAttribute('data-v'); if(u.src==='drive') u.pit = 'backup'; refreshModal(); };
INPUT['zv-rs-when'] = function(el){ var u = UI['zs-rs']; if(u) u.when = el.value; };
ACT['zs-rs-go'] = function(){ var u = UI['zs-rs']; if(!u || String(u.typed).trim().toUpperCase()!=='RESTORE') return; zs_runSteps('zs-rs', [1,2,3,4,5], 600, function(){ toast(zv_l('Restore finished (demo)','ফেরানো শেষ (ডেমো)')); }); };
ACT['zv-rs-live'] = function(){ closeModal(); toast(zv_l('Test copy made live (demo) — the shop is back to that backup','টেস্ট কপি লাইভ হয়েছে (ডেমো) — দোকান ঐ ব্যাকআপে ফিরেছে')); };
/* Monthly restore test, run by hand */
ACT['zs-bk-drill'] = function(){
  var src = zv_blobOn() ? 'blob' : 'drive';
  var steps = [src==='blob' ? zv_l('Taking last night\'s copy from Azure Blob','Azure Blob থেকে শেষ রাতের কপি আনা হচ্ছে') : zv_l('Taking last night\'s copy from Drive','ড্রাইভ থেকে শেষ রাতের কপি আনা হচ্ছে'), zv_l('Restoring on the test server','টেস্ট সার্ভারে ফেরানো হচ্ছে'), zv_l('Opening Home, a product and checkout','হোম, একটা প্রোডাক্ট আর চেকআউট খোলা হচ্ছে'), zv_l('Comparing order counts','অর্ডারের সংখ্যা মেলানো হচ্ছে')];
  UI['zs-dr'] = {phase:1};
  var html = function(){ var u = UI['zs-dr']; if(u.phase>steps.length) return '<div class="stack s16" style="text-align:center"><span class="zs-okc">'+ico('check',26)+'</span><div class="h2">'+esc(zv_l('Restore test passed','ফেরানোর পরীক্ষা পাস'))+'</div><div class="small text2">'+esc(zv_l('Last night\'s copy opens the shop correctly.','শেষ রাতের কপি দিয়ে দোকান ঠিকঠাক খোলে।'))+'</div><button type="button" class="btn btn-primary btn-block" data-act="close-modal">'+esc(zv_l('Done','ঠিক আছে'))+'</button></div>'; return zs_steps(steps, u.phase); };
  openModal(html(), {title:zv_l('Restore test','ফেরানোর পরীক্ষা'), rebuild:html, zsKey:'zs-dr'});
  zs_runSteps('zs-dr', steps, 500, function(){ var b = zv_bkx(); b.lastDrill = Date.now(); b.tests.unshift({at:Date.now(), src:src, ok:true, mins:src==='blob'?9:18, orders:(b.tests[0]?b.tests[0].orders:12431)+7}); b.tests = b.tests.slice(0, 12); saveState(); rerender(); });
};
