/* =====================================================================
   96d-site-builder.js — শিল্পী Shilpi A360-05 with সওদাগর Sawdagor A360-04
   PR 598 · SITE BUILDER — the whole site dynamic, with guardrails
   (owner 19 Oct 21:23 "like WordPress + Elementor, nothing fixed"; 21:33
   "everything that doesn't harm style or UX editable"; 22:14 logo image,
   header slogan, footer drag and drop, social / payment libraries, how-to
   panels, Site manual)
   ---------------------------------------------------------------------
   AREAS (each has its own draft, preview, publish, history and undo)
     menus   header nav + mega menu + phone menu + phone bottom bar  (03-layout.js)
     header  announcement bar, icons + order, logo, slogan            (03-layout.js)
     footer  promise strip, join, columns + links, contact, social,
             payment marks, copyright                                 (03-layout.js)
     cats    categories + sub-categories                              (21-category.js)
     pdp     product page block order + per-device visibility         (30-product.js)
     pages   content pages: blocks, FAQ, slug, SEO                    (71-pages.js)
     theme   colour tokens, fonts, radius, spacing (+ AA contrast)    (this file)
   Home and category sections stay in Page layout (PR 595, 96c) and the
   side canvas in its own page (PR 596) — linked, not duplicated.
   ---------------------------------------------------------------------
   DATA
     ST.sitebPub = {area: data}   what the shop shows (PR 597 snapshots carry it:
                                  'sitebPub' is added to LB_SNAP_KEYS of 96c)
     ST.siteb    = {draft:{area: data}, hist:{area:[versions]}, log:[publishes]}
   The shop reads sbArea(area): a preview frame's draft, else the published
   data, else null → each renderer's own defaults (= today's site, gate 0).
   GUARDRAILS (publish is blocked with a message)
     · text colours below AA 4.5:1 (theme tokens, announcement colours)
     · tap targets: bottom bar 3–5 items; links need an address; measured
       44 px check in the phone preview when it is open
     · product page: the buy group cannot be hidden and only first-screen
       blocks may sit above it (D-053)
     · checkout: texts / fields / field order live in Settings; the payment
       steps are locked (status page explains why)
     · blocks snap to the responsive grid — lists and fixed widths, never
       free pixel positions
   Admin words: English by default, Bengali with ST.adminLang — every label
   is a pair sbT(['English','বাংলা']).
   ===================================================================== */

var SB_AREAS = ['menus','header','footer','cats','pdp','pages','theme'];
var SB_CFG = { histMax:20, logMax:30, logoKB:200, iconKB:60, imgKB:400, previewW:[[393,852,'phone'],[820,1180,'tablet'],[1366,768,'desk']] };

/* ---------- capture this page's own source for the preview frames ---------- */
var SB_SRC = '';
try{ if(!window.SB_INJECT && !window.LB_INJECT) SB_SRC = '<!doctype html>' + document.documentElement.outerHTML; }catch(e){}

/* ---------- routes + admin menu ---------- */
(function(){
  var add = function(re, name){ try{ if(!ROUTES.some(function(r){ return r[1]===name; })) ROUTES.push([re, name]); }catch(e){} };
  add(/^\/admin\/site$/, 'sb-admin');
  add(/^\/admin\/manual$/, 'sb-manual');
  try{ if(typeof zo_link==='function'){
    zo_link([{toString:function(){ return sbT(['Site builder','সাইট বিল্ডার']); }}, '#/admin/site', 'layers']);
    zo_link([{toString:function(){ return sbT(['Site manual','সাইট ম্যানুয়াল']); }}, '#/admin/manual', 'doc']);
  } }catch(e){}
  /* PR 597: "Back to launch default" and named snapshots carry the published site */
  try{ if(typeof LB_SNAP_KEYS!=='undefined' && LB_SNAP_KEYS.indexOf('sitebPub') < 0) LB_SNAP_KEYS.push('sitebPub'); }catch(e){}
})();

/* =====================================================================
   1. SMALL HELPERS
   ===================================================================== */
function sbLang(){ try{ return (ST && ST.adminLang==='bn') ? 'bn' : 'en'; }catch(e){ return 'en'; } }
/* an admin word: ['English','বাংলা'] → the admin's language */
function sbT(pair, vars){
  var s = Array.isArray(pair) ? (sbLang()==='bn' ? (pair[1] || pair[0]) : pair[0]) : String(pair);
  if(vars) s = s.replace(/\{(\w+)\}/g, function(m, k){ return vars.hasOwnProperty(k) ? String(vars[k]) : m; });
  return s;
}
function sbE(pair, vars){ return esc(sbT(pair, vars)); }
function sbClone(o){ return o == null ? o : JSON.parse(JSON.stringify(o)); }
function sbId(p){ return (p||'x')+'-'+Math.random().toString(36).slice(2, 8); }
function sbSame(a, b){ return JSON.stringify(a) === JSON.stringify(b); }
function sbSlug(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48); }
function sbHrefOk(h){ return /^(#\/|https?:\/\/|mailto:|tel:)/i.test(String(h||'').trim()); }

/* =====================================================================
   2. STATE · DRAFT → PUBLISH → HISTORY → UNDO
   ===================================================================== */
function sbS(){
  if(!ST.siteb || typeof ST.siteb !== 'object') ST.siteb = {draft:{}, hist:{}, log:[]};
  var S = ST.siteb; S.draft = S.draft || {}; S.hist = S.hist || {}; S.log = S.log || [];
  if(!ST.sitebPub || typeof ST.sitebPub !== 'object') ST.sitebPub = {};
  return S;
}
/* what the SHOP reads */
function sbArea(area){
  try{
    var I = window.SB_INJECT; if(I && I.areas && I.areas[area]) return I.areas[area];
    var P0 = ST && ST.sitebPub; return (P0 && P0[area]) || null;
  }catch(e){ return null; }
}
function sbCatsDefault(){
  var list = (typeof CAT_SEED!=='undefined' ? CAT_SEED : DB.categories).map(function(c){ return {id:c.id, name:c.name, bn:c.bn || '', garment:c.garment, blurb:c.blurb || '', seoTitle:'', seoMeta:'', menu:true, hidden:!!c.hidden, unlisted:false, img:null}; });
  return {list:list, subs:{}, subsNew:[]};
}
function sbDefault(area){
  switch(area){
    case 'menus': return menuDefault();
    case 'header': return hdrDefault();
    case 'footer': return ftrDefault();
    case 'cats': return sbCatsDefault();
    case 'pdp': return {order:{buy:PDP_ZONES.buy.slice(), details:PDP_ZONES.details.slice(), below:PDP_ZONES.below.slice()}, vis:{}};
    case 'pages': return {list:pg_default()};
    case 'theme': return {tokens:{}, fontBody:'', fontDisplay:'', radius:'', space:''};
  }
  return {};
}
/* the full data of an area as the shop has it now (published over defaults) */
function sbLive(area){
  var d = sbDefault(area), p = (ST.sitebPub||{})[area];
  if(!p) return sbFix(area, d);
  var o = sbClone(p); for(var k in d) if(o[k] === undefined) o[k] = d[k];
  return sbFix(area, o);
}
/* keep an area's data complete: every category has its menu item, every list item an id */
function sbFix(area, d){
  if(area==='menus'){
    var it = d.items = d.items || [], have = {}, last = -1;
    it.forEach(function(x, i){ if(x.kind==='cat'){ have[x.cat] = 1; last = i; } });
    (DB.categories||[]).forEach(function(c){ if(!have[c.id]){ last = last < 0 ? 0 : last + 1; it.splice(last, 0, {id:c.id, kind:'cat', cat:c.id, on:true, desk:true, phone:true}); } });
  }
  if(area==='pages') sbPagesFix(d);
  if(area==='cats'){ var ids = {}; (d.list||[]).forEach(function(c){ ids[c.id] = 1; }); (DB.categories||[]).forEach(function(c){ if(!ids[c.id]) d.list.push({id:c.id, name:c.name, bn:c.bn||'', garment:c.garment, blurb:c.blurb||'', menu:true, hidden:!!c.hidden, unlisted:false, img:null}); }); d.subs = d.subs || {}; d.subsNew = d.subsNew || []; }
  return d;
}
/* the draft the admin edits (made from the live data on first change) */
function sbDraft(area){ var S = sbS(); if(!S.draft[area]) S.draft[area] = sbClone(sbLive(area)); return S.draft[area]; }
function sbCur(area){ var S = sbS(); return S.draft[area] || sbLive(area); }
function sbHasDraft(area){ var S = sbS(); return !!S.draft[area] && !sbSame(S.draft[area], sbLive(area)); }
function sbIsCustom(area){ return !!(ST.sitebPub||{})[area]; }
function sbHist(area){ var S = sbS(); return S.hist[area] || (S.hist[area] = []); }
function sbVersion(area, label, data){
  var h = sbHist(area); h.push({id:sbId('v'), at:Date.now(), label:label, data:sbClone(data)});
  if(h.length > SB_CFG.histMax) h.splice(0, h.length - SB_CFG.histMax);
}
function sbSetLive(area, data, label){
  var S = sbS(), before = ST.sitebPub[area] ? sbClone(ST.sitebPub[area]) : null;
  if(data) ST.sitebPub[area] = sbClone(data); else delete ST.sitebPub[area];
  S.log.push({id:sbId('p'), area:area, at:Date.now(), label:label, before:before});
  if(S.log.length > SB_CFG.logMax) S.log.splice(0, S.log.length - SB_CFG.logMax);
  sbVersion(area, label, data || sbDefault(area));
  sbAfterLive(area);
}
/* after the live data changed: caches that read it */
function sbAfterLive(area){
  if(area==='cats' && typeof cat_srcApply==='function'){ try{ CAT_SIG = null; cat_srcApply(); }catch(e){} }
  if(area==='pages'){ try{ PG_TSIG = null; pg_sync(); }catch(e){} }
  if(area==='theme') sbThemeApply();
}
function sbPublish(area){
  var d = sbS().draft[area]; if(!d){ toast(sbT(['Nothing to publish — no changes yet','প্রকাশ করার কিছু নেই — এখনো কিছু বদলাননি'])); return false; }
  var errs = sbCheck(area, d);
  if(errs.length){ UI.sbErr = {area:area, list:errs}; rerender(); toast(sbT(['Not published — fix the red items first','প্রকাশ হয়নি — আগে লাল লেখাগুলো ঠিক করুন'])); return false; }
  UI.sbErr = null;
  sbSetLive(area, d, sbT(['Published','প্রকাশ করা হলো']));
  delete sbS().draft[area];
  saveState(); rerender(); toast(sbT(['Published — the shop shows it now','প্রকাশ হয়েছে — দোকানে এখন এটাই দেখাচ্ছে']));
  return true;
}
function sbDiscard(area){ delete sbS().draft[area]; UI.sbErr = null; saveState(); rerender(); toast(sbT(['Draft discarded — nothing on the shop changed','খসড়া বাদ — দোকানে কিছুই বদলায়নি'])); }
function sbUndo(area){
  var S = sbS(), i = -1; for(var k = S.log.length - 1; k >= 0; k--) if(S.log[k].area===area && !S.log[k].undone){ i = k; break; }
  if(i < 0){ toast(sbT(['Nothing to undo','ফেরানোর মতো কিছু নেই'])); return false; }
  var e = S.log[i]; e.undone = true;
  if(e.before) ST.sitebPub[area] = sbClone(e.before); else delete ST.sitebPub[area];
  sbVersion(area, sbT(['Undo of a publish','প্রকাশ ফেরানো হলো']), e.before || sbDefault(area));
  sbAfterLive(area); saveState(); rerender(); toast(sbT(['The last publish is undone','শেষ প্রকাশটা ফেরানো হলো']));
  return true;
}
function sbRestore(area, vid){
  var v = sbHist(area).filter(function(x){ return x.id===vid; })[0]; if(!v) return false;
  sbSetLive(area, v.data, sbT(['Restored version of {d}','{d}-এর ভার্সন ফেরানো হলো'], {d:dateTimeStr(v.at)}));
  delete sbS().draft[area];
  saveState(); rerender(); toast(sbT(['Version restored — it is live now (Undo brings back what was before)','ভার্সন ফেরানো হলো — এখন দোকানে এটাই (Undo চাপলে আগেরটা ফিরবে)']));
  return true;
}
/* back to the shop's own defaults (kept as a version, so it can be undone) */
function sbFactory(area){ sbSetLive(area, null, sbT(['Back to the built-in default','শুরুর ডিফল্টে ফেরানো'])); delete sbS().draft[area]; saveState(); rerender(); toast(sbT(['Back to the default — Undo brings back what was before','ডিফল্টে ফিরল — Undo চাপলে আগেরটা ফিরবে'])); }

/* =====================================================================
   3. CHECKS (publish is blocked while any fails)
   ===================================================================== */
function sbHex(c){ c = String(c||'').trim(); var m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i); if(!m) return null; var h = m[1]; if(h.length===3) h = h.split('').map(function(x){ return x+x; }).join(''); return '#'+h.toLowerCase(); }
function sbLum(hex){ hex = sbHex(hex); if(!hex) return null; var c = [1,3,5].map(function(i){ var v = parseInt(hex.substr(i,2),16)/255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }); return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]; }
function sbRatio(a, b){ var x = sbLum(a), y = sbLum(b); if(x==null || y==null) return null; var hi = Math.max(x,y), lo = Math.min(x,y); return Math.round((hi+0.05)/(lo+0.05)*100)/100; }
/* the theme's own token values, read from the style sheet (nothing typed twice) */
var SB_BASE = {};
function sbThemeBase(theme){
  theme = theme || ST.theme || 'classic';
  if(SB_BASE[theme]) return SB_BASE[theme];
  var root = {}, own = {};
  try{
    [].forEach.call(document.styleSheets, function(sh){ var rules; try{ rules = sh.cssRules; }catch(e){ return; } if(!rules) return;
      [].forEach.call(rules, function(r){ if(!r.selectorText || !r.style) return; var sel = r.selectorText;
        var isRoot = /^:root(,\s*:root\[data-theme="classic"\])?$/.test(sel), isOwn = sel === ':root[data-theme="'+theme+'"]';
        if(!isRoot && !isOwn) return;
        for(var i = 0; i < r.style.length; i++){ var k = r.style[i]; if(k.indexOf('--')!==0) continue; (isOwn ? own : root)[k.slice(2)] = r.style.getPropertyValue(k).trim(); } }); });
  }catch(e){}
  var o = {}; for(var a in root) o[a] = root[a]; for(var b in own) o[b] = own[b];
  return (SB_BASE[theme] = o);
}
var SB_TOKENS = [
  ['bg', ['Page background','পেজের ব্যাকগ্রাউন্ড']], ['surface', ['Cards and boxes','কার্ড আর বক্স']], ['ink', ['Main text','মূল লেখা']], ['text2', ['Second text','দ্বিতীয় লেখা']],
  ['muted', ['Small grey text','ছোট ধূসর লেখা']], ['brand', ['Brand colour (buttons, links)','ব্র্যান্ডের রং (বাটন, লিংক)']], ['brand-ink', ['Text on brand buttons','ব্র্যান্ড বাটনের লেখা']],
  ['brand-tint', ['Brand tint (soft boxes)','হালকা ব্র্যান্ড রং (নরম বক্স)']], ['sale', ['Sale price','সেলের দাম']], ['announce', ['Announcement bar','ঘোষণার বার']], ['announce-ink', ['Announcement text','ঘোষণার লেখা']],
  ['hero', ['Banner background','ব্যানারের ব্যাকগ্রাউন্ড']], ['hero-ink', ['Banner text','ব্যানারের লেখা']], ['footer', ['Footer background','ফুটারের ব্যাকগ্রাউন্ড']], ['footer-ink', ['Footer text','ফুটারের লেখা']], ['line', ['Lines and borders','লাইন আর বর্ডার']]
];
var SB_PAIRS = [
  ['ink','bg',['Main text on the page','পেজে মূল লেখা']], ['ink','surface',['Main text on cards','কার্ডে মূল লেখা']], ['text2','surface',['Second text on cards','কার্ডে দ্বিতীয় লেখা']],
  ['muted','bg',['Small grey text on the page','পেজে ছোট ধূসর লেখা']], ['muted','surface',['Small grey text on cards','কার্ডে ছোট ধূসর লেখা']], ['brand-ink','brand',['Button text','বাটনের লেখা']],
  ['brand','surface',['Links on cards','কার্ডে লিংক']], ['sale','surface',['Sale price','সেলের দাম']], ['announce-ink','announce',['Announcement bar','ঘোষণার বার']],
  ['hero-ink','hero',['Banner text','ব্যানারের লেখা']], ['footer-ink','footer',['Footer text','ফুটারের লেখা']]
];
function sbTok(th, k){ var v = (th && th.tokens && th.tokens[k]) || sbThemeBase()[k]; return sbHex(v) || v; }
function sbContrast(th){
  return SB_PAIRS.map(function(p){ var fg = sbTok(th, p[0]), bg = sbTok(th, p[1]), r = sbRatio(fg, bg); return {fg:p[0], bg:p[1], label:p[2], fgv:fg, bgv:bg, ratio:r, ok:r==null || r >= 4.5}; });
}
var SB_FONTS_BODY = [['', ['Theme default','থিমের ডিফল্ট']], ["'Instrument Sans','Hind Siliguri',system-ui,sans-serif", ['Instrument Sans','Instrument Sans']], ["'Hind Siliguri','Instrument Sans',system-ui,sans-serif", ['Hind Siliguri (Bengali first)','হিন্দ শিলিগুড়ি (বাংলা আগে)']], ["'Archivo','Hind Siliguri',system-ui,sans-serif", ['Archivo','Archivo']]];
var SB_FONTS_DISPLAY = [['', ['Theme default','থিমের ডিফল্ট']], ["'Archivo','Hind Siliguri',system-ui,sans-serif", ['Archivo (bold, modern)','Archivo (মোটা, আধুনিক)']], ["'Cormorant Garamond','Archivo',serif", ['Cormorant Garamond (classic)','Cormorant Garamond (ক্লাসিক)']], ["'Instrument Sans','Hind Siliguri',system-ui,sans-serif", ['Instrument Sans (calm)','Instrument Sans (শান্ত)']]];
var SB_RADII = [['', ['Theme default','থিমের ডিফল্ট']], ['0', ['Square','চৌকো']], ['2', ['Almost square','প্রায় চৌকো']], ['6', ['Soft','নরম']], ['10', ['Round','গোল']]];
var SB_SPACES = [['', ['Theme default','থিমের ডিফল্ট']], ['compact', ['Compact','ঘন']], ['roomy', ['Roomy','খোলামেলা']]];
function sbCheck(area, d){
  var E = [], add = function(pair, vars){ E.push(sbT(pair, vars)); };
  if(area==='theme'){
    sbContrast(d).forEach(function(c){ if(!c.ok) add(['{l}: contrast {r}:1 is below 4.5:1 — pick a darker or lighter colour','{l}: কনট্রাস্ট {r}:1, দরকার অন্তত 4.5:1 — আরও গাঢ় বা হালকা রং বাছুন'], {l:sbT(c.label), r:c.ratio}); });
    Object.keys(d.tokens||{}).forEach(function(k){ if(d.tokens[k] && !sbHex(d.tokens[k])) add(['{k}: "{v}" is not a colour code like #1F4E46','{k}: "{v}" রঙের কোড না (যেমন #1F4E46)'], {k:k, v:d.tokens[k]}); });
  }
  if(area==='header'){
    var a = d.announce || {};
    if(a.bg || a.fg){ var r = sbRatio(a.fg || sbTok(null,'announce-ink'), a.bg || sbTok(null,'announce')); if(r != null && r < 4.5) add(['Announcement bar colours: contrast {r}:1 is below 4.5:1','ঘোষণার বারের রং: কনট্রাস্ট {r}:1, দরকার অন্তত 4.5:1'], {r:r}); }
    (a.msgs||[]).forEach(function(m, i){ if(m.on !== false && !(m.text || m.bn)) add(['Message {n} is empty — write it or switch it off','মেসেজ {n} খালি — লিখুন অথবা বন্ধ করুন'], {n:i+1}); if(m.href && !sbHrefOk(m.href)) add(['Message {n}: the link must start with #/ or https://','মেসেজ {n}: লিংক #/ বা https:// দিয়ে শুরু হতে হবে'], {n:i+1}); if(m.start && m.end && m.end < m.start) add(['Message {n}: the end date is before the start date','মেসেজ {n}: শেষের তারিখ শুরুর আগে'], {n:i+1}); });
    var lg = d.logo || {}; if(!lg.img && !String(lg.text||'').trim()) add(['The logo needs a text or an image','লোগোর জন্য লেখা বা ছবি দরকার']);
  }
  if(area==='menus'){
    var on = (d.bottom||[]).filter(function(x){ return x.on !== false; }).length;
    if(on < 3 || on > 5) add(['Phone bottom bar: keep 3 to 5 items switched on (now {n}) — each stays a big enough tap','ফোনের নিচের বার: ৩ থেকে ৫টা চালু রাখুন (এখন {n}) — যাতে প্রতিটা আঙুলে চাপার মতো বড় থাকে'], {n:on});
    (d.bottom||[]).forEach(function(x){ if(x.on !== false && !String(x.label||'').trim()) add(['Bottom bar: an item has no name','নিচের বার: একটা আইটেমের নাম নেই']); if(x.on !== false && x.id!=='account' && !sbHrefOk(x.href)) add(['Bottom bar "{l}": the link must start with #/ or https://','নিচের বার "{l}": লিংক #/ বা https:// দিয়ে শুরু হতে হবে'], {l:x.label}); });
    (d.items||[]).forEach(function(x){
      if(x.kind==='link' && x.on !== false){ if(!String(x.label||'').trim()) add(['Menu: a custom item has no name','মেনু: নিজের একটা আইটেমের নাম নেই']); if(!sbHrefOk(x.href)) add(['Menu "{l}": the link must start with #/ or https://','মেনু "{l}": লিংক #/ বা https:// দিয়ে শুরু হতে হবে'], {l:x.label||'?'}); }
      (x.cols||[]).forEach(function(c){ (c.links||[]).forEach(function(l){ if(l.on !== false && (!String(l.label||'').trim() || !sbHrefOk(l.href))) add(['Menu "{l}": every column link needs a name and a link (#/ or https://)','মেনু "{l}": কলামের প্রতিটা লিংকে নাম আর ঠিকানা (#/ বা https://) লাগবে'], {l:x.label||x.id}); }); });
    });
  }
  if(area==='footer'){
    (d.cols||[]).forEach(function(c){ if(c.on===false || c.removed) return; if(!String(c.label||'').trim()) add(['Footer: a column has no title','ফুটার: একটা কলামের শিরোনাম নেই']);
      (c.links||[]).forEach(function(l){ if(l.on===false || l.removed || l.cat) return; if(!String(l.label||'').trim() || !sbHrefOk(l.href)) add(['Footer "{c}": every link needs a name and a link (#/ or https://)','ফুটার "{c}": প্রতিটা লিংকে নাম আর ঠিকানা (#/ বা https://) লাগবে'], {c:c.label}); }); });
    (d.social||[]).forEach(function(x){ if(x.on !== false && !x.removed && x.url && !/^https?:\/\//.test(x.url)) add(['Social "{l}": the address must start with https://','সোশ্যাল "{l}": ঠিকানা https:// দিয়ে শুরু হতে হবে'], {l:x.label || x.id}); });
  }
  if(area==='pdp'){
    var b = d.order && d.order.buy || [], bi = b.indexOf('buy');
    if(bi < 0) add(['The buy buttons cannot be removed from the product page','প্রোডাক্ট পেজ থেকে কেনার বাটন সরানো যাবে না']);
    b.slice(0, bi).forEach(function(id){ if(!PDP_ABOVE_BUY[id]) add(['"{b}" cannot sit above the buy buttons — they must stay in the first screen (rule D-053)','"{b}" কেনার বাটনের উপরে রাখা যাবে না — বাটন প্রথম স্ক্রিনেই থাকবে (নিয়ম D-053)'], {b:sbT(SB_PDP_NAMES[id]||[id])}); });
    if(d.vis && d.vis.buy && (d.vis.buy.on===false || d.vis.buy.phone===false || d.vis.buy.tablet===false || d.vis.buy.desk===false)) add(['The buy buttons cannot be hidden','কেনার বাটন লুকানো যাবে না']);
  }
  if(area==='pages'){
    var seen = {};
    (d.list||[]).forEach(function(pg){
      if(!pg.slug || !/^[a-z0-9-]+$/.test(pg.slug)) add(['Page "{t}": the address may use only a–z, 0–9 and -','পেজ "{t}": ঠিকানায় শুধু a–z, 0–9 আর - চলবে'], {t:pg.title||'?'});
      if(seen[pg.slug]) add(['Two pages have the address "{s}"','দুটো পেজের একই ঠিকানা "{s}"'], {s:pg.slug}); seen[pg.slug] = 1;
      if(!String(pg.title||'').trim()) add(['A page has no title','একটা পেজের শিরোনাম নেই']);
      (pg.blocks||[]).forEach(function(b0){ if(b0.t==='btn' && b0.on !== false && (!b0.label || !sbHrefOk(b0.href))) add(['Page "{t}": a button needs a word and a link (#/ or https://)','পেজ "{t}": বাটনে লেখা আর লিংক (#/ বা https://) লাগবে'], {t:pg.title}); });
    });
  }
  if(area==='cats'){
    var ids = {};
    (d.list||[]).forEach(function(c){ if(!String(c.name||'').trim()) add(['A category has no name','একটা ক্যাটাগরির নাম নেই']); if(ids[c.id]) add(['Two categories share the address "{s}"','দুটো ক্যাটাগরির একই ঠিকানা "{s}"'], {s:c.id}); ids[c.id] = 1; });
    if(!(d.list||[]).some(function(c){ return !c.unlisted && c.menu !== false; })) add(['At least one category must stay in the menu','অন্তত একটা ক্যাটাগরি মেনুতে রাখতে হবে']);
  }
  /* the measured tap check from the phone preview, when it is open */
  var tp = SB_TAP[area]; if(tp && tp.fails && tp.fails.length) tp.fails.forEach(function(f){ add(['Too small to tap on a phone: "{t}" is {w}×{h} px (needs 44×44)','ফোনে চাপার জন্য ছোট: "{t}" {w}×{h} px (দরকার 44×44)'], f); });
  return E;
}
var SB_TAP = {};

/* =====================================================================
   4. THEME ON THE SHOP (only when the owner set something)
   ===================================================================== */
function sbThemeCSS(th){
  if(!th) return '';
  var v = [], tk = th.tokens || {};
  Object.keys(tk).forEach(function(k){ var h = sbHex(tk[k]); if(h && /^[a-z0-9-]+$/.test(k)) v.push('--'+k+':'+h); });
  if(th.fontBody) v.push('--font-body:'+th.fontBody);
  if(th.fontDisplay) v.push('--font-display:'+th.fontDisplay);
  if(th.radius !== '' && th.radius != null){ var r = parseInt(th.radius, 10); if(!isNaN(r)){ v.push('--radius:'+r+'px'); v.push('--card-radius:'+(r ? Math.max(r, 2) : 0)+'px'); v.push('--btn-radius:'+r+'px'); } }
  var css = v.length ? ':root,:root[data-theme]{'+v.join(';')+'}' : '';
  if(th.space==='compact') css += '.section{padding-top:20px}@media(min-width:1024px){.section{padding-top:40px}}';
  if(th.space==='roomy') css += '.section{padding-top:38px}@media(min-width:1024px){.section{padding-top:72px}}';
  return css;
}
function sbThemeApply(){
  var css = sbThemeCSS(sbArea('theme')), el = document.getElementById('sb-theme');
  if(!css){ if(el) el.remove(); return; }
  if(!el){ el = document.createElement('style'); el.id = 'sb-theme'; document.head.appendChild(el); }
  if(el.textContent !== css) el.textContent = css;
}

/* =====================================================================
   5. SHOP HOOKS — every page draw
   ===================================================================== */
var SB_META0 = null;
function sbMeta(){
  var m = document.querySelector('meta[name="description"]'); if(!m) return;
  if(SB_META0 === null) SB_META0 = m.getAttribute('content') || '';
  var want = '';
  try{
    if(CUR.page==='category'){ var c = CAT(CUR.params[0]); if(c && c.seoMeta) want = c.seoMeta; }
    if(CUR.page==='page'){ var pg = pg_find(CUR.params[0]||'faq'); if(pg && pg.seoMeta) want = pg.seoMeta; }
  }catch(e){}
  m.setAttribute('content', want || SB_META0);
}
var SB_ANN = {t:0};
function sbAnnStart(){
  clearInterval(SB_ANN.t);
  var bar = document.querySelector('.announce.sb-ann'); if(!bar) return;
  var secs = Math.max(3, +bar.getAttribute('data-rot') || 5);
  SB_ANN.t = setInterval(function(){
    var b = document.querySelector('.announce.sb-ann'); if(!b){ clearInterval(SB_ANN.t); return; }
    if(document.hidden || b.matches(':hover') || b.contains(document.activeElement)) return;   /* a pause for a reader resumes on its own next tick */
    var it = b.querySelectorAll('.sb-ann-i'), i = 0; [].forEach.call(it, function(x, k){ if(x.classList.contains('on')) i = k; });
    it[i].classList.remove('on'); it[i].setAttribute('aria-hidden','true'); var n = it[(i+1) % it.length]; n.classList.add('on'); n.removeAttribute('aria-hidden');
  }, secs * 1000);
}
/* the category tile picture the owner chose (home "Shop by category") */
function sbTileImg(html){
  var d = sbArea('cats'); if(!d) return html;
  (d.list||[]).forEach(function(c){
    if(!c.img || !c.img.product) return; var p = P(c.img.product); if(!p) return;
    var col = (c.img.color && p.colors.indexOf(c.img.color) >= 0) ? c.img.color : p.colors[0];
    var mark = 'data-testid="cat-tile-'+c.id+'">', i = html.indexOf(mark); if(i < 0) return;
    var j = html.indexOf('<div class="hm-cat-name">', i); if(j < 0) return;
    html = html.slice(0, i + mark.length) + productImg(p, col, {label:false, ratio:'ratio-34'}) + html.slice(j);
  });
  return html;
}
(function(){
  try{ var r0 = render; if(r0 && !r0._sb){
    render = function(){ try{ sbThemeApply(); }catch(e){} var x = r0.apply(this, arguments); try{ sbMeta(); sbAnnStart(); sbFrameAfter(); }catch(e){ console.error(e); } return x; };
    render._sb = true; } }catch(e){}
  try{ if(typeof hm_cats==='function' && !hm_cats._sb){ var h0 = hm_cats; hm_cats = function(){ return sbTileImg(h0.apply(this, arguments)); }; hm_cats._sb = true; } }catch(e){}
  /* product page device switches: a phone ↔ tablet change redraws (1024 is redrawn by 97-desk-a.js) */
  try{ var mq = window.matchMedia('(min-width:768px)'); var on = function(){ var d = sbArea('pdp'); if(d && d.vis && Object.keys(d.vis).length && CUR && (CUR.page==='product' || CUR.page==='page')) rerender(); };
    if(mq.addEventListener) mq.addEventListener('change', on); else if(mq.addListener) mq.addListener(on); }catch(e){}
})();

/* =====================================================================
   6. PREVIEW FRAMES — the same shop inside the admin, showing the DRAFT
   ===================================================================== */
var SB_FRAMES = {};
function sbFrameBoot(el, w, h, state){
  if(!el || !SB_SRC) return;
  var fid = el.getAttribute('data-fid') || sbId('f'); el.setAttribute('data-fid', fid);
  state.fid = fid; SB_FRAMES[fid] = {el:el, w:w, h:h, state:state};
  var head = '<base href="about:srcdoc"><script>window.SB_INJECT='+JSON.stringify(state).replace(/</g, '\\u003c')+';try{location.hash=SB_INJECT.hash||"#/";}catch(e){}<\/script>';
  var ifr = el.querySelector('iframe'); if(!ifr) return;
  ifr.style.width = w+'px'; ifr.style.height = h+'px';
  sbFrameScale(el);
  ifr.srcdoc = SB_SRC.replace(/<head([^>]*)>/i, function(m){ return m + head; });
}
function sbFrameScale(el){
  var ifr = el.querySelector('iframe'), f = SB_FRAMES[el.getAttribute('data-fid')]; if(!ifr || !f) return;
  var box = el.clientWidth || 300, s = Math.min(1, box / f.w);
  ifr.style.transform = 'scale('+s+')'; el.style.height = Math.round(f.h * s)+'px';
}
window.addEventListener('resize', function(){ Object.keys(SB_FRAMES).forEach(function(k){ var f = SB_FRAMES[k]; if(f.el && f.el.isConnected) sbFrameScale(f.el); else delete SB_FRAMES[k]; }); });
window.addEventListener('message', function(ev){
  var d = ev.data; if(!d || d.sb!=='tap') return;
  var f = SB_FRAMES[d.fid]; if(!f) return;
  SB_TAP[f.state.area] = {fails:d.fails, at:Date.now()};
  var box = document.getElementById('sb-tapres'); if(box) box.innerHTML = sbTapLine(f.state.area);
});
function sbTapLine(area){
  var t = SB_TAP[area]; if(!t) return '<span class="xs muted">'+sbE(['The 44 px tap check runs in the phone preview.','৪৪ px চাপার মাপ ফোনের প্রিভিউতে মাপা হয়।'])+'</span>';
  return t.fails.length ? '<span class="sb-bad">'+ico('info',14)+sbE(['{n} tap target(s) under 44 px on a phone','ফোনে {n}টা জায়গা ৪৪ px-এর চেয়ে ছোট'], {n:t.fails.length})+'</span>'
    : '<span class="sb-ok">'+ico('check',14)+sbE(['Every tap target on the phone is 44 px or more','ফোনে চাপার সব জায়গা ৪৪ px বা বড়'])+'</span>';
}
/* inside a frame: after each draw, open what the tab is about and measure the taps */
function sbFrameAfter(){
  var I = window.SB_INJECT; if(!I) return;
  document.documentElement.classList.add('sb-pvmode');
  setTimeout(function(){
    try{
      if(I.open==='menu' && window.innerWidth < 1024 && !document.querySelector('.modal-back')) ACT['open-menu']();
      if(I.open==='footer'){ var f = document.querySelector('.ftr'); if(f) window.scrollTo(0, f.getBoundingClientRect().top + window.pageYOffset - 40); }
      if(I.open && I.open.indexOf('mega:')===0 && window.innerWidth >= 1024 && typeof megaOpen==='function'){ var it = document.querySelector('.hdr .nav-d .nav-i[data-nav="'+I.open.slice(5)+'"]'); if(it) megaOpen(it, 'key'); }
      if(I.open && I.open.indexOf('sel:')===0){ var el = document.querySelector(I.open.slice(4)); if(el) window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.pageYOffset - 90)); }
      if(I.tap && window.innerWidth < 768){
        var fails = [], seen = {};
        [].forEach.call(document.querySelectorAll('.hdr a, .hdr button, .bnav a, .modal .mn-row, .modal .mn-q, .announce a'), function(a){
          if(!a.getClientRects().length) return; var r = a.getBoundingClientRect(); if(!r.width) return;
          if(r.width < 43.5 || r.height < 43.5){ var t = (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 30); if(seen[t]) return; seen[t] = 1; fails.push({t:t, w:Math.round(r.width), h:Math.round(r.height)}); }
        });
        parent.postMessage({sb:'tap', fid:I.fid, fails:fails}, '*');
      }
    }catch(e){}
  }, 420);
}
/* boot: inside a frame never save, never greet */
(function(){
  try{
    if(!window.SB_INJECT) return;
    var oS = window.saveState; window.saveState = function(){};
    var oL = window.loadState;
    window.loadState = function(){ var r = oL.apply(this, arguments); try{ ST.seenIntro = true; if(SB_INJECT.lang) ST.lang = SB_INJECT.lang; if(SB_INJECT.theme) ST.theme = SB_INJECT.theme; }catch(e){} return r; };
    window.maybeIntro = function(){};
  }catch(e){}
})();

/* =====================================================================
   7. ADMIN · paths into the draft, fields, lists (drag + ↑↓)
   A path is "area/seg/seg…": a key, a number, or "#id" (the list item with that id).
   ===================================================================== */
function sbSeg(o, k){ if(o == null) return undefined; if(k.charAt(0)==='#' && Array.isArray(o)){ var id = decodeURIComponent(k.slice(1)); for(var i = 0; i < o.length; i++) if(o[i] && (o[i].id===id || (o[i].id==null && o[i].slug===id))) return o[i]; return undefined; } return o[decodeURIComponent(k)]; }
function sbGet(path, from){ var s = path.split('/'), o = from || sbCur(s[0]); for(var i = 1; i < s.length; i++){ o = sbSeg(o, s[i]); if(o === undefined) return undefined; } return o; }
function sbSet(path, v){
  var s = path.split('/'), o = sbDraft(s[0]);
  for(var i = 1; i < s.length - 1; i++){ var n = sbSeg(o, s[i]); if(n === undefined || n === null){ if(s[i].charAt(0)==='#') return; n = /^\d+$/.test(s[i+1]) ? [] : {}; o[decodeURIComponent(s[i])] = n; } o = n; }
  var last = s[s.length-1]; if(last.charAt(0)==='#') return; o[decodeURIComponent(last)] = v;
}
function sbList(path){ var a = sbGet(path, sbDraft(path.split('/')[0])); if(!Array.isArray(a)){ sbSet(path, []); a = sbGet(path, sbDraft(path.split('/')[0])); } return a; }
function sbTouch(){ saveState(); var b = document.getElementById('sb-flow'); if(b && CUR.query){ b.outerHTML = sbFlowHTML(sbTabArea(CUR.query.tab)); } }
var SB_FID = 0;
function sbFid(){ return 'sbf' + (++SB_FID); }
/* a "?" next to a field: a native disclosure, 44 px to tap */
function sbQ(pair){ return pair ? '<details class="sb-q"><summary aria-label="'+sbE(['Help','সাহায্য'])+'"><span aria-hidden="true">?</span></summary><div class="sb-qt">'+sbE(pair)+'</div></details>' : ''; }
function sbLab(id, label, help){ return '<div class="sb-fl"><label for="'+id+'">'+sbE(label)+'</label>'+sbQ(help)+'</div>'; }
function sbIn(path, label, help, o){
  o = o || {}; var id = sbFid(), v = sbGet(path); if(v == null) v = '';
  var tag = o.area ? '<textarea class="input sb-in" rows="'+(o.rows||3)+'" id="'+id+'" data-input="sb-f" data-p="'+esc(path)+'"'+(o.ph?' placeholder="'+esc(o.ph)+'"':'')+'>'+esc(o.lines && Array.isArray(v) ? v.join('\n') : v)+'</textarea>'
    : '<input class="input sb-in" id="'+id+'" type="'+(o.type||'text')+'" value="'+esc(v)+'" data-input="sb-f" data-p="'+esc(path)+'"'+(o.ph?' placeholder="'+esc(o.ph)+'"':'')+(o.lines?' data-lines="1"':'')+(o.num?' data-num="1" inputmode="numeric"':'')+(o.min!=null?' min="'+o.min+'"':'')+(o.max!=null?' max="'+o.max+'"':'')+(o.step?' step="'+o.step+'"':'')+'>';
  if(o.lines && o.area) tag = tag.replace('data-input="sb-f"', 'data-input="sb-f" data-lines="1"');
  return '<div class="sb-f'+(o.cls?' '+o.cls:'')+'">'+sbLab(id, label, help)+tag+'</div>';
}
function sbSw(path, label, o){
  o = o || {}; var v = sbGet(path), on = o.invert ? v === true : v !== false;
  if(o.locked) return '<span class="sb-sw locked" title="'+sbE(o.lockWhy||['Locked','লক করা'])+'">'+ico('lock',14)+'<span>'+sbE(label)+'</span></span>';
  return '<button type="button" class="sb-sw'+(on?' on':'')+'" role="switch" aria-checked="'+on+'" data-act="sb-sw" data-p="'+esc(path)+'"'+(o.invert?' data-inv="1"':'')+'><i aria-hidden="true"></i><span>'+sbE(label)+'</span></button>';
}
function sbSel(path, label, opts, help, o){
  o = o || {}; var id = sbFid(), v = sbGet(path); if(v == null) v = '';
  return '<div class="sb-f'+(o.cls?' '+o.cls:'')+'">'+sbLab(id, label, help)+'<select class="input sb-in" id="'+id+'" data-change="sb-sel" data-p="'+esc(path)+'">'+opts.map(function(x){ return '<option value="'+esc(x[0])+'"'+(String(x[0])===String(v)?' selected':'')+'>'+esc(Array.isArray(x[1]) ? sbT(x[1]) : x[1])+'</option>'; }).join('')+'</select></div>';
}
function sbColor(path, label, base, help){
  var id = sbFid(), v = sbGet(path) || '', show = sbHex(v) || sbHex(base) || '#000000';
  return '<div class="sb-f sb-colf">'+sbLab(id, label, help)+'<div class="sb-colrow"><input type="color" aria-label="'+sbE(label)+'" value="'+show+'" data-input="sb-col" data-p="'+esc(path)+'"><input class="input sb-in" id="'+id+'" value="'+esc(v)+'" placeholder="'+esc(base||'')+'" data-input="sb-f" data-p="'+esc(path)+'">'+
    (v ? '<button type="button" class="btn btn-ghost btn-sm" data-act="sb-clr" data-p="'+esc(path)+'">'+sbE(['Reset','ফেরান'])+'</button>' : '')+'</div></div>';
}
function sbFile(path, label, kb, accept, help){
  var id = sbFid();
  return '<div class="sb-f sb-filef">'+sbLab(id, label, help)+'<input class="sb-file" id="'+id+'" type="file" accept="'+esc(accept)+'" data-change="sb-up" data-p="'+esc(path)+'" data-kb="'+kb+'"></div>';
}
function sbMv(path, i, n){
  return '<span class="sb-mv"><button type="button" class="sb-ib" data-act="sb-mv" data-p="'+esc(path)+'" data-i="'+i+'" data-d="-1"'+(i===0?' disabled':'')+' aria-label="'+sbE(['Move up','উপরে নিন'])+'">'+ico('up',16)+'</button>'+
    '<button type="button" class="sb-ib" data-act="sb-mv" data-p="'+esc(path)+'" data-i="'+i+'" data-d="1"'+(i===n-1?' disabled':'')+' aria-label="'+sbE(['Move down','নিচে নিন'])+'">'+ico('down',16)+'</button></span>';
}
function sbGrip(){ return '<button type="button" class="sb-grip" data-sb-drag aria-label="'+sbE(['Drag to move (or use the arrows)','টেনে সরান (অথবা তীর চাপুন)'])+'"><svg width="14" height="20" viewBox="0 0 14 20" aria-hidden="true"><g fill="currentColor"><circle cx="4" cy="4" r="1.6"/><circle cx="10" cy="4" r="1.6"/><circle cx="4" cy="10" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="4" cy="16" r="1.6"/><circle cx="10" cy="16" r="1.6"/></g></svg></button>'; }
function sbIco(name, size){ return ico(name, size||16); }
var SB_ICONS = ['home','grid','layers','bag','user','heart','search','tag','spark','star','truck','swap','info','chat','phone','doc','box','cash','lock','shield','gift','clock','globe','ruler','link','eye','play','sun','camera','wallet'];
function sbIconSel(path, label){ return sbSel(path, label, SB_ICONS.map(function(n){ return [n, n]; }), ['The small picture before the words.','লেখার আগের ছোট ছবি।'], {cls:'sb-short'}); }

/* ---------- actions on fields ---------- */
INPUT['sb-f'] = function(el){
  var p = el.getAttribute('data-p'), v = el.value;
  if(el.getAttribute('data-lines')) v = v.split('\n').map(function(x){ return x.trim(); }).filter(Boolean);
  else if(el.getAttribute('data-num')) v = v === '' ? '' : Number(v);
  sbSet(p, v); sbTouch(); sbLiveBits(p);
};
INPUT['sb-col'] = function(el){ var p = el.getAttribute('data-p'); sbSet(p, el.value); var t = el.parentElement.querySelector('input.sb-in'); if(t) t.value = el.value; sbTouch(); sbLiveBits(p); };
CHANGE['sb-sel'] = function(el){ sbSet(el.getAttribute('data-p'), el.value); saveState(); rerender(); };
ACT['sb-sw'] = function(el){ var p = el.getAttribute('data-p'), v = sbGet(p), inv = el.getAttribute('data-inv'); sbSet(p, inv ? !(v === true) : v === false); saveState(); rerender(); };
ACT['sb-clr'] = function(el){ sbSet(el.getAttribute('data-p'), ''); saveState(); rerender(); };
CHANGE['sb-up'] = function(el){
  var f = el.files && el.files[0], p = el.getAttribute('data-p'), kb = +el.getAttribute('data-kb') || 200; if(!f) return;
  if(!/^image\/(png|jpe?g|svg\+xml|webp)$/.test(f.type)){ toast(sbT(['Use a JPG, PNG, SVG or WebP picture','JPG, PNG, SVG বা WebP ছবি দিন'])); el.value = ''; return; }
  if(f.size > kb * 1024){ toast(sbT(['This picture is {s} KB — keep it under {k} KB so the shop stays fast','ছবিটা {s} KB — দোকান দ্রুত রাখতে {k} KB-এর কম রাখুন'], {s:Math.round(f.size/1024), k:kb})); el.value = ''; return; }
  var r = new FileReader(); r.onload = function(){ sbSet(p, String(r.result)); saveState(); rerender(); toast(sbT(['Picture added to the draft','ছবি খসড়ায় যোগ হলো'])); }; r.readAsDataURL(f);
};
/* small live parts that follow typing without a redraw */
function sbLiveBits(path){
  if(/^theme\//.test(path) || /^header\/announce\/(bg|fg)/.test(path)){ var c = document.getElementById('sb-contrast'); if(c) c.innerHTML = sbContrastHTML(sbCur('theme')); var a = document.getElementById('sb-anncon'); if(a) a.innerHTML = sbAnnContrast(); }
  if(/^header\/(logo|slogan)/.test(path)){ var l = document.getElementById('sb-logopv'); if(l) l.innerHTML = sbLogoPreview(); }
}
/* move inside a list, or between two lists (drag between footer columns) */
function sbMoveItem(fromP, fi, toP, ti){
  var a = sbList(fromP), b = sbList(toP); if(!a[fi]) return false;
  var x = a.splice(fi, 1)[0]; if(toP === fromP && ti > fi) ti--;
  b.splice(Math.max(0, Math.min(ti, b.length)), 0, x);
  return true;
}
/* a move that breaks a guardrail is undone with the reason */
function sbGuardMove(path){
  if(/^pdp\/order\/buy$/.test(path)){ var errs = sbCheck('pdp', sbDraft('pdp')); if(errs.length) return errs[0]; }
  return '';
}
ACT['sb-mv'] = function(el){
  var p = el.getAttribute('data-p'), i = +el.getAttribute('data-i'), d = +el.getAttribute('data-d'), a = sbList(p), j = i + d;
  if(j < 0 || j >= a.length) return;
  var before = sbClone(a); var t = a[i]; a[i] = a[j]; a[j] = t;
  var bad = sbGuardMove(p); if(bad){ a.length = 0; before.forEach(function(x){ a.push(x); }); toast(bad); UI.sbBlocked = bad; rerender(); return; }
  UI.sbBlocked = null; saveState(); rerender();
  setTimeout(function(){ var b = document.querySelector('[data-act="sb-mv"][data-p="'+p+'"][data-i="'+j+'"][data-d="'+d+'"]') || document.querySelector('[data-act="sb-mv"][data-p="'+p+'"][data-i="'+j+'"]'); if(b) try{ b.focus({preventScroll:true}); }catch(e){} }, 0);
};
/* drag with a finger or a mouse: the row follows the pointer between rows (and
   between lists of the same group); dropping writes the new order */
var SB_DRAG = null;
document.addEventListener('pointerdown', function(ev){
  var g = ev.target.closest && ev.target.closest('[data-sb-drag]'); if(!g) return;
  var row = g.closest('.sb-row'), list = row && row.parentElement; if(!row || !list || !list.hasAttribute('data-sb-list')) return;
  ev.preventDefault();
  SB_DRAG = {row:row, from:list, fromP:list.getAttribute('data-sb-list'), fi:[].indexOf.call(list.querySelectorAll(':scope > .sb-row'), row), group:list.getAttribute('data-sb-group') || list.getAttribute('data-sb-list'), id:ev.pointerId};
  row.classList.add('sb-dragging'); document.documentElement.classList.add('sb-isdrag');
  try{ g.setPointerCapture(ev.pointerId); }catch(e){}
});
document.addEventListener('pointermove', function(ev){
  var D = SB_DRAG; if(!D || ev.pointerId !== D.id) return;
  ev.preventDefault();
  D.row.style.visibility = 'hidden'; var under = document.elementFromPoint(ev.clientX, ev.clientY); D.row.style.visibility = '';
  var list = under && under.closest && under.closest('[data-sb-list]');
  if(!list || (list.getAttribute('data-sb-group') || list.getAttribute('data-sb-list')) !== D.group) return;
  var rows = [].filter.call(list.querySelectorAll(':scope > .sb-row'), function(r){ return r !== D.row; }), before = null;
  for(var i = 0; i < rows.length; i++){ var r = rows[i].getBoundingClientRect(); if(ev.clientY < r.top + r.height / 2){ before = rows[i]; break; } }
  var addBtn = list.querySelector(':scope > .sb-listend');
  list.insertBefore(D.row, before || addBtn || null);
  var vh = window.innerHeight; if(ev.clientY < 60) window.scrollBy(0, -12); else if(ev.clientY > vh - 60) window.scrollBy(0, 12);
}, {passive:false});
function sbDragEnd(ev){
  var D = SB_DRAG; if(!D || (ev && ev.pointerId !== D.id)) return; SB_DRAG = null;
  D.row.classList.remove('sb-dragging'); document.documentElement.classList.remove('sb-isdrag');
  var list = D.row.parentElement, toP = list.getAttribute('data-sb-list'), ti = [].indexOf.call(list.querySelectorAll(':scope > .sb-row'), D.row);
  if(toP === D.fromP && ti === D.fi) return;
  var area = D.fromP.split('/')[0], snap = sbClone(sbDraft(area));
  sbMoveItem(D.fromP, D.fi, toP, ti);
  var bad = sbGuardMove(toP);
  if(bad){ sbS().draft[area] = snap; toast(bad); UI.sbBlocked = bad; } else UI.sbBlocked = null;
  saveState(); rerender();
}
document.addEventListener('pointerup', sbDragEnd);
document.addEventListener('pointercancel', sbDragEnd);

/* add / remove (remove = switched off and kept in "Removed" with Restore; nothing is deleted) */
ACT['sb-add'] = function(el){
  var p = el.getAttribute('data-p'), kind = el.getAttribute('data-kind'), a = sbList(p), x = null;
  var L = sbLang()==='bn';
  switch(kind){
    case 'menu': x = {id:sbId('m'), kind:'link', label:L ? 'নতুন আইটেম' : 'New item', href:'#/c/new', on:true, desk:true, phone:true}; break;
    case 'mcol': x = {id:sbId('c'), label:L ? 'নতুন কলাম' : 'New column', links:[]}; break;
    case 'mlink': case 'flink': case 'help': x = {id:sbId('l'), label:L ? 'নতুন লিংক' : 'New link', href:'#/', icon:'right', on:true}; break;
    case 'fcat': var cs = (DB.categories||[]).filter(function(c){ return !c.unlisted; }); x = {id:sbId('l'), cat:(cs[0]||{}).id, on:true}; break;
    case 'bottom': x = {id:sbId('b'), label:L ? 'নতুন' : 'New', href:'#/c/new', icon:'tag', on:false}; break;
    case 'msg': x = {id:sbId('a'), text:L ? 'নতুন ঘোষণা' : 'New announcement', bn:'', href:'', start:'', end:'', on:true}; break;
    case 'fcol': x = {id:sbId('fc'), label:L ? 'নতুন কলাম' : 'New column', on:true, links:[]}; break;
    case 'promise': x = {id:sbId('p'), icon:'check', text:L ? 'নতুন প্রতিশ্রুতি' : 'New promise', on:true}; break;
    case 'qa': x = [L ? 'নতুন প্রশ্ন?' : 'New question?', L ? 'উত্তর লিখুন।' : 'Write the answer.']; break;
    case 'social': var sid = el.closest('.sb-addrow').querySelector('select').value; if(!sid) return; if(a.some(function(y){ return y.id===sid && !y.removed; })){ toast(sbT(['Already in the list','তালিকায় আগেই আছে'])); return; } a.forEach(function(y, k){ if(y.id===sid && y.removed){ delete y.removed; y.on = true; x = 'done'; } }); if(!x) x = {id:sid, on:true, url:''}; break;
    case 'pay': var pid = el.closest('.sb-addrow').querySelector('select').value; if(!pid) return; if(a.some(function(y){ return y.id===pid && !y.removed; })){ toast(sbT(['Already in the list','তালিকায় আগেই আছে'])); return; } a.forEach(function(y){ if(y.id===pid && y.removed){ delete y.removed; y.on = true; x = 'done'; } }); if(!x) x = {id:pid, on:true}; break;
    case 'block': x = sbNewBlock(el.getAttribute('data-t')); break;
    case 'cat': var nm = prompt(sbT(['Name of the new category','নতুন ক্যাটাগরির নাম'])); if(!nm || !nm.trim()) return; var id0 = sbSlug(nm) || sbId('cat'), id = id0, k2 = 2; while(CAT(id) || a.some(function(c){ return c.id===id; })) id = id0+'-'+(k2++);
      x = {id:id, name:nm.trim(), bn:'', garment:'tee', blurb:'', seoTitle:'', seoMeta:'', menu:true, hidden:false, unlisted:false, img:null, isNew:true}; break;
    case 'sub': var pr = el.getAttribute('data-parent'), sn = prompt(sbT(['Name of the new sub-category','নতুন সাব-ক্যাটাগরির নাম'])); if(!sn || !sn.trim()) return;
      x = {id:pr+'/'+(sbSlug(sn) || sbId('s')), name:sn.trim(), parent:pr}; break;
    case 'page': var tt = prompt(sbT(['Title of the new page','নতুন পেজের শিরোনাম'])); if(!tt || !tt.trim()) return; var sl0 = sbSlug(tt).replace(/[^a-z0-9-]/g,'') || 'page', sl = sl0, k3 = 2; while(a.some(function(q){ return q.slug===sl; }) || (typeof PG!=='undefined' && PG[sl])) sl = sl0+'-'+(k3++);
      x = {slug:sl, title:tt.trim(), lede:'', custom:true, seoTitle:'', seoMeta:'', blocks:[{t:'p', text:sbLang()==='bn' ? 'এখানে লিখুন।' : 'Write here.'}]}; UI.sbPage = sl; break;
  }
  if(!x) return; if(x !== 'done') a.push(x);
  saveState(); rerender(); toast(sbT(['Added to the draft','খসড়ায় যোগ হলো']));
};
ACT['sb-rm'] = function(el){ var p = el.getAttribute('data-p'), x = sbGet(p, sbDraft(p.split('/')[0])); if(!x || Array.isArray(x)) return; x.removed = true; x.on = false; saveState(); rerender(); toast(sbT(['Removed — it stays in "Removed" below, one tap brings it back','সরানো হলো — নিচে "সরানো" তালিকায় থাকল, এক চাপে ফেরানো যায়'])); };
ACT['sb-unrm'] = function(el){ var p = el.getAttribute('data-p'), x = sbGet(p, sbDraft(p.split('/')[0])); if(!x) return; delete x.removed; x.on = true; saveState(); rerender(); };
ACT['sb-open'] = function(el){ var k = el.getAttribute('data-k'); UI['sbo:'+k] = !UI['sbo:'+k]; rerender(); };
ACT['sb-x'] = function(el){
  var a = el.getAttribute('data-a'), area = el.getAttribute('data-area');
  if(a==='publish') sbPublish(area);
  if(a==='discard' && confirm(sbT(['Throw away the draft? The shop does not change.','খসড়া বাদ দেবেন? দোকানে কিছু বদলাবে না।']))) sbDiscard(area);
  if(a==='undo' && confirm(sbT(['Undo the last publish of this part?','এই অংশের শেষ প্রকাশটা ফেরাবেন?']))) sbUndo(area);
  if(a==='restore' && confirm(sbT(['Put this version live now?','এই ভার্সনটা এখনই দোকানে দেবেন?']))) sbRestore(area, el.getAttribute('data-v'));
  if(a==='factory' && confirm(sbT(['Go back to the built-in default for this part? (Undo is possible.)','এই অংশ শুরুর ডিফল্টে ফেরাবেন? (Undo করা যাবে।)']))) sbFactory(area);
  if(a==='pv'){ UI.sbPv = !UI.sbPv; rerender(); }
  if(a==='pvr') sbBootFrames();
  if(a==='hist'){ UI.sbHist = !UI.sbHist; rerender(); }
};

/* =====================================================================
   8. ADMIN · the editors, one per area
   ===================================================================== */
var SB_TABS = [
  ['menus', ['Menus','মেনু'], 'menu'], ['header', ['Header','হেডার'], 'home'], ['footer', ['Footer','ফুটার'], 'layers'], ['cats', ['Categories','ক্যাটাগরি'], 'grid'],
  ['pdp', ['Product page','প্রোডাক্ট পেজ'], 'tag'], ['pages', ['Pages','পেজ'], 'doc'], ['theme', ['Theme','থিম'], 'sun'], ['status', ['What can change','কী কী বদলানো যায়'], 'info']
];
function sbTabArea(tab){ return SB_AREAS.indexOf(tab) >= 0 ? tab : (tab==='status' ? 'status' : 'menus'); }
function sbRmd(list, path, name){
  var r = list.map(function(x, i){ return x && x.removed ? {x:x, i:i} : null; }).filter(Boolean); if(!r.length) return '';
  return '<div class="sb-rmd"><span class="xs bold">'+sbE(['Removed (kept, not deleted)','সরানো (রাখা আছে, মোছা হয়নি)'])+'</span>'+r.map(function(o){ return '<span class="sb-rmi"><span>'+esc(name(o.x))+'</span><button type="button" class="btn btn-sm btn-ghost" data-act="sb-unrm" data-p="'+esc(path+'/#'+o.x.id)+'">'+sbE(['Restore','ফেরান'])+'</button></span>'; }).join('')+'</div>';
}
function sbRow(inner, o){ o = o || {}; return '<div class="sb-row'+(o.cls?' '+o.cls:'')+'"'+(o.key?' data-sb-key="'+esc(o.key)+'"':'')+'>'+(o.nodrag?'<span class="sb-grip sb-nogrip" aria-hidden="true"></span>':sbGrip())+'<div class="sb-rowb">'+inner+'</div>'+(o.mv||'')+'</div>'; }
function sbCard(title, body, o){ o = o || {}; return '<section class="sb-card card'+(o.cls?' '+o.cls:'')+'"'+(o.id?' id="'+o.id+'"':'')+'><div class="sb-cardh"><h2 class="h3">'+(o.icon?ico(o.icon,17):'')+sbE(title)+'</h2>'+(o.right||'')+'</div>'+(o.lead?'<p class="xs muted sb-lead">'+sbE(o.lead)+'</p>':'')+body+'</section>'; }
function sbAddBtn(path, kind, label, extra){ return '<button type="button" class="btn btn-sm btn-secondary sb-listend" data-act="sb-add" data-p="'+esc(path)+'" data-kind="'+kind+'"'+(extra||'')+'>'+ico('plus',15)+sbE(label)+'</button>'; }
function sbDevSw(path){ return sbSw(path+'/phone', ['Phone','ফোন'])+sbSw(path+'/tablet', ['Tablet','ট্যাবলেট'])+sbSw(path+'/desk', ['Desktop','ডেস্কটপ']); }
function sbProdOpts(){ return [['', ['— none —','— নেই —']]].concat(DB.products.map(function(p){ return [p.id, p.name]; })); }
function sbColOpts(pid){ var p = P(pid); return [['', ['First colour','প্রথম রং']]].concat(p ? p.colors.map(function(c){ return [c, COL(c).name]; }) : []); }

/* ---------- MENUS ---------- */
function sbMenuName(x){
  var c = x.kind==='cat' && CAT(x.cat);
  var dflt = {new:'New in', more:'More', combos:'Combos', sets:'Sets', setsPhone:'Sets & combos', journal:'Journal'}[x.kind];
  return x.label || (c ? c.name : dflt) || x.id;
}
var SB_KIND = {new:['New arrivals','নতুন'], cat:['Category','ক্যাটাগরি'], more:['"More" (hidden categories)','"More" (লুকানো ক্যাটাগরি)'], combos:['Combos page','কম্বো পেজ'], sets:['Build your own set','নিজের সেট'], setsPhone:['Sets & combos (phone)','সেট ও কম্বো (ফোন)'], journal:['Journal (blog)','জার্নাল (ব্লগ)'], link:['Your own link','নিজের লিংক']};
function sbMenusEd(){
  var P0 = 'menus/items', dl = sbL(P0);
  var rows = dl.map(function(x, i){
    if(x.removed) return '';
    var c = x.kind==='cat' && CAT(x.cat), path = P0+'/#'+x.id, open = UI['sbo:'+path];
    if(x.kind==='cat' && !c) return '';
    var note = c && c.unlisted ? '<span class="sb-pill warn">'+sbE(['Category not listed','ক্যাটাগরি তালিকায় নেই'])+'</span>' : (c && c.menu===false ? '<span class="sb-pill warn">'+sbE(['Category set to "not in menus"','ক্যাটাগরি "মেনুতে না"'])+'</span>' : '');
    var canCols = ['cat','link','sets','journal'].indexOf(x.kind) >= 0;
    var body = '<div class="sb-rowtop"><span class="sb-kind">'+sbE(SB_KIND[x.kind]||[x.kind])+'</span>'+note+'</div>'+
      '<div class="sb-grid2">'+sbIn(path+'/label', ['Name in the menu','মেনুতে নাম'], ['Leave empty to use the category or page name. Renaming here changes the header, mega menu and phone menu together.','খালি রাখলে ক্যাটাগরি বা পেজের নামই থাকবে। এখানে নাম বদলালে হেডার, মেগা মেনু আর ফোন মেনু একসাথে বদলায়।'], {ph:sbMenuName(Object.assign({}, x, {label:''}))})+
        sbIn(path+'/bn', ['Name in Bengali (optional)','বাংলায় নাম (ইচ্ছা হলে)'], ['Shown when the shopper picks বাং.','কাস্টমার বাং বাছলে দেখাবে।'], {ph:c ? (c.bn||'') : ''})+'</div>'+
      (x.kind==='link' ? sbIn(path+'/href', ['Link','লিংক'], ['A page of this shop starts with #/ (for example #/c/polos), another site with https://','এই দোকানের পেজ #/ দিয়ে শুরু (যেমন #/c/polos), অন্য সাইট https:// দিয়ে'], {ph:'#/c/new'}) : '')+
      (x.kind==='sets' ? sbIn(path+'/phoneLabel', ['Name in the phone menu','ফোন মেনুতে নাম'], null, {ph:'Build your own set'}) : '')+
      '<div class="sb-sws">'+sbSw(path+'/on', ['Shown','দেখাবে'])+sbSw(path+'/desk', ['Desktop row','ডেস্কটপ সারি'])+sbSw(path+'/phone', ['Phone menu','ফোন মেনু'])+
        (canCols ? '<button type="button" class="btn btn-sm btn-ghost" data-act="sb-open" data-k="'+esc(path)+'" aria-expanded="'+!!open+'">'+ico('grid',15)+sbE(['Columns & featured tile','কলাম আর ফিচার্ড টাইল'])+'</button>' : '')+
        (x.kind==='link' ? '<button type="button" class="btn btn-sm btn-ghost" data-act="sb-rm" data-p="'+esc(path)+'">'+ico('trash',15)+sbE(['Remove','সরান'])+'</button>' : '')+'</div>'+
      (open && canCols ? sbMegaEd(path, x) : '');
    return sbRow(body, {key:x.id, mv:sbMv(P0, i, dl.length)});
  }).join('');
  var main = sbCard(['Header menu, mega menu and phone menu','হেডার মেনু, মেগা মেনু আর ফোন মেনু'],
    '<div class="sb-list" data-sb-list="'+P0+'">'+rows+sbAddBtn(P0, 'menu', ['Add your own menu item','নিজের মেনু আইটেম যোগ করুন'])+'</div>'+sbRmd(dl, P0, sbMenuName),
    {icon:'menu', lead:['One list for every menu. The order here is the order on the desktop row and in the phone menu. Categories come in by themselves; add your own links too.','সব মেনুর জন্য একটাই তালিকা। এখানের ক্রমই ডেস্কটপ সারি আর ফোন মেনুর ক্রম। ক্যাটাগরি নিজে থেকেই আসে; নিজের লিংকও যোগ করা যায়।']});
  var Q0 = 'menus/quick', ql = sbL(Q0), qn = {search:['Search','সার্চ'], bag:['Bag','ব্যাগ'], wish:['Wishlist','উইশলিস্ট'], account:['Account','অ্যাকাউন্ট']};
  var quick = sbCard(['Phone menu: the quick row','ফোন মেনু: উপরের চারটা বোতাম'], '<div class="sb-list" data-sb-list="'+Q0+'">'+ql.map(function(x, i){ return sbRow('<div class="sb-inline"><b>'+sbE(qn[x.id]||[x.id])+'</b>'+sbSw(Q0+'/#'+x.id+'/on', ['Shown','দেখাবে'])+'</div>', {key:x.id, mv:sbMv(Q0, i, ql.length)}); }).join('')+'</div>', {icon:'grid'});
  var H0 = 'menus/help', hl = sbL(H0);
  var help = sbCard(['Phone menu: Help links','ফোন মেনু: সাহায্যের লিংক'], sbIn('menus/helpTitle', ['Title of the list','তালিকার শিরোনাম'])+'<div class="sb-list" data-sb-list="'+H0+'">'+hl.map(function(x, i){ if(x.removed) return ''; var hp = H0+'/#'+x.id;
      return sbRow('<div class="sb-grid3">'+sbIn(hp+'/label', ['Name','নাম'])+sbIn(hp+'/href', ['Link','লিংক'])+sbIconSel(hp+'/icon', ['Icon','আইকন'])+'</div><div class="sb-sws">'+sbSw(hp+'/on', ['Shown','দেখাবে'])+'<button type="button" class="btn btn-sm btn-ghost" data-act="sb-rm" data-p="'+esc(hp)+'">'+ico('trash',15)+sbE(['Remove','সরান'])+'</button></div>', {key:x.id, mv:sbMv(H0, i, hl.length)}); }).join('')+sbAddBtn(H0, 'help', ['Add a help link','সাহায্যের লিংক যোগ করুন'])+'</div>'+sbRmd(hl, H0, function(x){ return x.label; }), {icon:'info'});
  var B0 = 'menus/bottom', bl = sbL(B0), bon = bl.filter(function(x){ return x.on !== false; }).length;
  var bottom = sbCard(['Phone bottom bar','ফোনের নিচের বার'], '<p class="xs '+(bon<3||bon>5?'sb-bad':'muted')+'">'+sbE(['{n} items on. Keep 3 to 5, so every button stays big enough for a thumb (at least 64 px wide on the smallest phone).','{n}টা চালু। ৩ থেকে ৫টা রাখুন, যাতে সবচেয়ে ছোট ফোনেও প্রতিটা বোতাম আঙুলে চাপার মতো বড় থাকে (অন্তত ৬৪ px চওড়া)।'], {n:bon})+'</p>'+
    '<div class="sb-list" data-sb-list="'+B0+'">'+bl.map(function(x, i){ if(x.removed) return ''; var bp = B0+'/#'+x.id, fixed = x.id==='bag' || x.id==='account';
      return sbRow('<div class="sb-grid3">'+sbIn(bp+'/label', ['Name','নাম'])+sbIn(bp+'/bn', ['Bengali','বাংলা'])+sbIconSel(bp+'/icon', ['Icon','আইকন'])+'</div>'+
        (fixed ? '<p class="xs muted">'+sbE(x.id==='bag' ? ['Opens the bag and shows how many items are in it.','ব্যাগ খোলে আর কয়টা আছে দেখায়।'] : ['Opens the account, or Log in when nobody is logged in.','অ্যাকাউন্ট খোলে, লগইন না থাকলে লগইন পেজ।'])+'</p>' : sbIn(bp+'/href', ['Link','লিংক']))+
        '<div class="sb-sws">'+sbSw(bp+'/on', ['Shown','দেখাবে'])+(fixed ? '' : '<button type="button" class="btn btn-sm btn-ghost" data-act="sb-rm" data-p="'+esc(bp)+'">'+ico('trash',15)+sbE(['Remove','সরান'])+'</button>')+'</div>', {key:x.id, mv:sbMv(B0, i, bl.length)}); }).join('')+sbAddBtn(B0, 'bottom', ['Add a bar item (starts switched off)','বারে আইটেম যোগ করুন (বন্ধ অবস্থায় আসবে)'])+'</div>'+sbRmd(bl, B0, function(x){ return x.label; }), {icon:'home'});
  var lb = '<p class="sb-links xs">'+ico('link',14)+sbE(['Home and category page sections are in','হোম আর ক্যাটাগরি পেজের সেকশন আছে'])+' <a href="#/admin/layout">'+sbE(['Page layout','পেজ সাজান'])+'</a> · '+sbE(['the side gutters in','দুই পাশের জায়গা আছে'])+' <a href="#/admin/side-canvas">'+sbE(['Side canvas','দুই পাশের জায়গা'])+'</a></p>';
  return main+'<div class="sb-cols2">'+quick+help+'</div>'+bottom+lb;
}
function sbMegaEd(path, x){
  var C0 = path+'/cols', cl = sbL(C0);
  var cols = cl.map(function(c, ci){
    var cp = C0+'/#'+c.id, L0 = cp+'/links', ll = sbL(L0);
    return '<div class="sb-sub"><div class="sb-grid2">'+sbIn(cp+'/label', ['Column title','কলামের শিরোনাম'])+sbIn(cp+'/bn', ['Bengali','বাংলা'])+'</div>'+
      '<div class="sb-list" data-sb-list="'+esc(L0)+'" data-sb-group="mlinks">'+ll.map(function(l, li){ if(l.removed) return ''; var lp = L0+'/#'+l.id;
        return sbRow('<div class="sb-grid2">'+sbIn(lp+'/label', ['Link name','লিংকের নাম'])+sbIn(lp+'/href', ['Link','লিংক'])+'</div><div class="sb-sws">'+sbSw(lp+'/on', ['Shown','দেখাবে'])+'<button type="button" class="btn btn-sm btn-ghost" data-act="sb-rm" data-p="'+esc(lp)+'">'+ico('trash',15)+sbE(['Remove','সরান'])+'</button></div>', {key:l.id, mv:sbMv(L0, li, ll.length)}); }).join('')+sbAddBtn(L0, 'mlink', ['Add a link','লিংক যোগ করুন'])+'</div>'+sbRmd(ll, L0, function(l){ return l.label; })+
      '<div class="sb-sws">'+sbMv(C0, ci, cl.length)+'</div></div>';
  }).join('');
  var fp = path+'/feat', fd = sbGet(fp) || {};
  return '<div class="sb-mega">'+
    (x.kind==='cat' ? sbSel(path+'/colsMode', ['Your columns','আপনার কলাম'], [['add', ['Add after the automatic columns','স্বয়ংক্রিয় কলামের পরে যোগ']], ['replace', ['Replace the automatic columns','স্বয়ংক্রিয় কলামের বদলে']]], ['The automatic columns list sub-categories, fits and popular styles. Your columns can sit after them or take their place.','স্বয়ংক্রিয় কলামে সাব-ক্যাটাগরি, ফিট আর জনপ্রিয় স্টাইল থাকে। আপনার কলাম তাদের পরে বা বদলে বসতে পারে।']) : '')+
    cols+sbAddBtn(C0, 'mcol', ['Add a column (max 4 shown)','কলাম যোগ করুন (৪টা পর্যন্ত দেখায়)'])+
    '<div class="sb-sub"><div class="sb-sws">'+sbSw(fp+'/on', ['Featured tile','ফিচার্ড টাইল'], {invert:true})+'</div>'+
      (fd.on ? '<div class="sb-grid2">'+sbSel(fp+'/product', ['Product photo','প্রোডাক্টের ছবি'], sbProdOpts())+sbSel(fp+'/color', ['Colour','রং'], sbColOpts(fd.product))+sbIn(fp+'/title', ['Words under the photo','ছবির নিচের লেখা'])+sbIn(fp+'/href', ['Link (empty = the product)','লিংক (খালি = প্রোডাক্ট)'])+'</div>' : '')+
    '</div></div>';
}

/* ---------- HEADER ---------- */
function sbLogoPreview(){
  var h = sbCur('header'), save = window.SB_INJECT; window.SB_INJECT = {areas:{header:h}};
  var out = '';
  try{ out = '<div class="sb-hdrpv"><div class="sb-hdrpv-l"><span class="xs muted">'+sbE(['Desktop','ডেস্কটপ'])+'</span><div class="sb-hdrpv-bar d"><span class="logo">'+sbLogo('desk')+'</span><span class="xs muted sb-pvslog">'+esc(hdrSlogan('desk') ? sbSlogan('header') : '')+'</span></div></div>'+
    '<div class="sb-hdrpv-l"><span class="xs muted">'+sbE(['Phone','ফোন'])+'</span><div class="sb-hdrpv-bar m">'+ico('menu',20)+'<span class="sb-pvlg"><span class="logo">'+sbLogo('phone')+'</span><span class="xs muted">'+esc(hdrSlogan('phone') ? sbSlogan('header') : '')+'</span></span>'+ico('search',19)+ico('bag',20)+'</div></div></div>'; }
  finally{ window.SB_INJECT = save; }
  return out;
}
function sbAnnContrast(){ var a = sbCur('header').announce || {}; if(!a.bg && !a.fg) return ''; var r = sbRatio(a.fg || sbTok(null,'announce-ink'), a.bg || sbTok(null,'announce')); return r==null ? '' : '<span class="'+(r>=4.5?'sb-ok':'sb-bad')+'">'+sbE(['Contrast {r}:1 (needs 4.5:1)','কনট্রাস্ট {r}:1 (দরকার 4.5:1)'], {r:r})+'</span>'; }
function sbHeaderEd(){
  var h = sbCur('header'), lg = 'header/logo', sl = 'header/slogan';
  var logo = sbCard(['Logo','লোগো'],
    '<div id="sb-logopv">'+sbLogoPreview()+'</div>'+
    '<div class="sb-grid2">'+sbIn(lg+'/text', ['Logo text (used when there is no picture)','লোগোর লেখা (ছবি না থাকলে)'], ['Also the name in social links and picture descriptions.','সোশ্যাল লিংক আর ছবির বর্ণনাতেও এই নাম।'])+sbIn(lg+'/alt', ['Picture description (for screen readers)','ছবির বর্ণনা (স্ক্রিন রিডারের জন্য)'])+'</div>'+
    '<div class="sb-grid2">'+sbFile(lg+'/img', ['Logo picture (JPG, PNG, SVG or WebP, up to 200 KB)','লোগোর ছবি (JPG, PNG, SVG বা WebP, ২০০ KB পর্যন্ত)'], SB_CFG.logoKB, 'image/png,image/jpeg,image/svg+xml,image/webp', ['A wide logo with a clear background works best. It is fitted to the header height on every screen.','পরিষ্কার ব্যাকগ্রাউন্ডের চওড়া লোগো সবচেয়ে ভালো। প্রতিটা স্ক্রিনে হেডারের উচ্চতায় মানিয়ে বসে।'])+
      sbFile(lg+'/imgPhone', ['Small version for phones (optional)','ফোনের জন্য ছোট লোগো (ইচ্ছা হলে)'], SB_CFG.logoKB, 'image/png,image/jpeg,image/svg+xml,image/webp', ['For example just the mark. Without it, phones show the main picture.','যেমন শুধু চিহ্নটা। না দিলে ফোনেও মূল ছবি দেখাবে।'])+'</div>'+
    (h.logo && (h.logo.img || h.logo.imgPhone) ? '<div class="sb-grid3">'+sbIn(lg+'/hDesk', ['Height on desktop (px, 20–60)','ডেস্কটপে উচ্চতা (px, ২০–৬০)'], null, {type:'range', num:1, min:20, max:60, step:1})+sbIn(lg+'/hPhone', ['Height on phones (px, 18–44)','ফোনে উচ্চতা (px, ১৮–৪৪)'], null, {type:'range', num:1, min:18, max:44, step:1})+sbIn(lg+'/hFooter', ['Height in the footer (px)','ফুটারে উচ্চতা (px)'], null, {type:'range', num:1, min:20, max:60, step:1})+'</div>'+
      '<div class="sb-sws">'+(h.logo.img?'<button type="button" class="btn btn-sm btn-ghost" data-act="sb-clr" data-p="'+lg+'/img">'+sbE(['Use the text logo again','আবার লেখার লোগো'])+'</button>':'')+(h.logo.imgPhone?'<button type="button" class="btn btn-sm btn-ghost" data-act="sb-clr" data-p="'+lg+'/imgPhone">'+sbE(['Remove the phone version','ফোনের লোগো সরান'])+'</button>':'')+'</div>' : ''),
    {icon:'star', lead:['Text or a picture. The picture never grows past the header: it is fitted to the height you set, and to the space beside the menu and icons on a phone.','লেখা বা ছবি। ছবি কখনো হেডারের বাইরে যায় না: আপনার দেওয়া উচ্চতায় আর ফোনে মেনু-আইকনের মাঝের জায়গায় মানিয়ে বসে।']});
  var slog = sbCard(['Slogan','স্লোগান'],
    '<div class="sb-sws">'+sbSw(sl+'/on', ['Slogan on','স্লোগান চালু'])+sbSw(sl+'/header', ['Under the logo in the header','হেডারে লোগোর নিচে'])+sbSw(sl+'/phone', ['On phones','ফোনে'])+sbSw(sl+'/desk', ['On desktop','ডেস্কটপে'])+'</div>'+
    '<div class="sb-grid2">'+sbIn(sl+'/text', ['Slogan (shared by header and footer)','স্লোগান (হেডার আর ফুটারে একই)'], ['Change it once here — the header and the footer both follow. Each place can have its own text below.','এখানে একবার বদলালেই হেডার আর ফুটার দুটোই বদলায়। নিচে প্রতিটা জায়গার আলাদা লেখাও দেওয়া যায়।'])+sbIn(sl+'/bn', ['Slogan in Bengali','বাংলায় স্লোগান'])+
      sbIn(sl+'/short', ['Short slogan for small phones','ছোট ফোনের জন্য ছোট স্লোগান'], ['On the narrowest phones the full slogan steps down to this, and hides only if even this cannot fit.','সবচেয়ে সরু ফোনে পুরো স্লোগানের বদলে এটা দেখায়; এটাও না ধরলে তবেই লুকায়।'])+sbIn(sl+'/shortBn', ['Short slogan in Bengali','বাংলায় ছোট স্লোগান'])+
      sbIn(sl+'/headerText', ['Header only: own text (optional)','শুধু হেডারে: আলাদা লেখা (ইচ্ছা হলে)'])+sbIn(sl+'/headerBn', ['Header only: own Bengali text','শুধু হেডারে: আলাদা বাংলা লেখা'])+'</div>'+
    '<p class="xs muted">'+sbE(['The footer\'s own text is in Footer › Brand.','ফুটারের আলাদা লেখা আছে ফুটার › ব্র্যান্ডে।'])+'</p>', {icon:'doc'});
  var A0 = 'header/announce', ml = sbL(A0+'/msgs');
  var ann = sbCard(['Announcement bar','ঘোষণার বার'],
    '<div class="sb-sws">'+sbSw(A0+'/on', ['Bar on','বার চালু'])+'</div>'+
    '<div class="sb-grid3">'+sbColor(A0+'/bg', ['Bar colour','বারের রং'], sbTok(null,'announce'))+sbColor(A0+'/fg', ['Text colour','লেখার রং'], sbTok(null,'announce-ink'))+sbIn(A0+'/rotate', ['Seconds per message','প্রতি মেসেজ কত সেকেন্ড'], ['With two or more live messages they take turns.','দুই বা বেশি মেসেজ চালু থাকলে পালা করে দেখায়।'], {type:'number', num:1, min:3, max:30})+'</div><div id="sb-anncon">'+sbAnnContrast()+'</div>'+
    '<div class="sb-list" data-sb-list="'+A0+'/msgs">'+ml.map(function(m, i){ if(m.removed) return ''; var mp = A0+'/msgs/#'+m.id;
      return sbRow('<div class="sb-grid2">'+sbIn(mp+'/text', ['Message','মেসেজ'], ['{freeOver} becomes the free-delivery amount from Smart Rules.','{freeOver} লিখলে স্মার্ট রুলসের ফ্রি ডেলিভারির টাকা বসে।'])+sbIn(mp+'/bn', ['Message in Bengali','বাংলায় মেসেজ'], ['{freeOverBn} = the amount in Bengali digits.','{freeOverBn} = বাংলা অঙ্কে টাকা।'])+'</div>'+
        '<div class="sb-grid3">'+sbIn(mp+'/href', ['Link (optional)','লিংক (ইচ্ছা হলে)'])+sbIn(mp+'/start', ['From (Dhaka day)','শুরু (ঢাকার দিন)'], null, {type:'date'})+sbIn(mp+'/end', ['Until','শেষ'], null, {type:'date'})+'</div>'+
        '<div class="sb-sws">'+sbSw(mp+'/on', ['Shown','দেখাবে'])+'<button type="button" class="btn btn-sm btn-ghost" data-act="sb-rm" data-p="'+esc(mp)+'">'+ico('trash',15)+sbE(['Remove','সরান'])+'</button></div>', {key:m.id, mv:sbMv(A0+'/msgs', i, ml.length)}); }).join('')+sbAddBtn(A0+'/msgs', 'msg', ['Add a message','মেসেজ যোগ করুন'])+'</div>'+sbRmd(ml, A0+'/msgs', function(m){ return m.text; }),
    {icon:'bolt', lead:['The Eid cut-off banner (Smart Rules › Festive) still takes over the bar while it is on.','ঈদের কাট-অফ ব্যানার (স্মার্ট রুলস › উৎসব) চালু থাকলে বারটা সেটাই দেখায়।']});
  var I0 = 'header/icons', il = sbL(I0), inames = {whatsapp:['WhatsApp','WhatsApp'], search:['Search','সার্চ'], wish:['Wishlist (heart)','উইশলিস্ট (হার্ট)'], account:['Account (desktop)','অ্যাকাউন্ট (ডেস্কটপ)'], bag:['Bag','ব্যাগ']};
  var icons = sbCard(['Header icons and their order','হেডারের আইকন আর ক্রম'], '<div class="sb-list" data-sb-list="'+I0+'">'+il.map(function(x, i){
      return sbRow('<div class="sb-inline"><b>'+sbE(inames[x.id]||[x.id])+'</b>'+(x.id==='bag' ? sbSw(I0+'/#bag/on', ['Always shown','সবসময় দেখাবে'], {locked:true, lockWhy:['Every order starts at the bag, so it stays.','প্রতিটা অর্ডার ব্যাগ থেকে শুরু, তাই এটা থাকবে।']}) : sbSw(I0+'/#'+x.id+'/on', ['Shown','দেখাবে']))+'</div>', {key:x.id, mv:sbMv(I0, i, il.length)}); }).join('')+'</div>'+
    '<p class="xs muted">'+sbE(['On a narrow phone the heart steps aside by itself so the logo keeps clear air. The WhatsApp number and its pages are in Settings.','সরু ফোনে লোগোর চারপাশে জায়গা রাখতে হার্ট নিজে থেকেই সরে যায়। WhatsApp নম্বর আর কোন পেজে দেখাবে তা সেটিংসে।'])+' <a href="#/admin/settings">'+sbE(['Settings','সেটিংস'])+'</a></p>', {icon:'search'});
  return logo+slog+ann+icons;
}

/* ---------- FOOTER ---------- */
function sbL(path){ var a = sbGet(path); return Array.isArray(a) ? a : []; }
function sbK(id){ return encodeURIComponent(id); }
function sbFtrLinkName(l){ if(l.cat){ var c = CAT(l.cat); return l.label || (c ? c.name : l.cat); } return l.label || l.href || ''; }
function sbFooterEd(){
  var F0 = 'footer', d = sbCur('footer');
  var pr = sbL('footer/promise/items');
  var promise = sbCard(['Promise strip (top of the footer)','প্রতিশ্রুতির সারি (ফুটারের উপরে)'], '<div class="sb-sws">'+sbSw('footer/promise/on', ['Strip on','সারি চালু'])+'</div>'+
    '<div class="sb-list" data-sb-list="footer/promise/items">'+pr.map(function(x, i){ if(x.removed) return ''; var pp = 'footer/promise/items/#'+x.id;
      return sbRow('<div class="sb-grid3">'+sbIn(pp+'/text', ['Words','লেখা'], ['A | marks where the line breaks on a phone. {windowHours} = the exchange hours, {freeOver} = the free-delivery amount.','| দিলে ফোনে ওখানে লাইন ভাঙে। {windowHours} = এক্সচেঞ্জের ঘণ্টা, {freeOver} = ফ্রি ডেলিভারির টাকা।'])+sbIn(pp+'/bn', ['Bengali','বাংলা'])+sbIconSel(pp+'/icon', ['Icon','আইকন'])+'</div>'+
        '<div class="sb-sws">'+sbSw(pp+'/on', ['Shown','দেখাবে'])+'<button type="button" class="btn btn-sm btn-ghost" data-act="sb-rm" data-p="'+esc(pp)+'">'+ico('trash',15)+sbE(['Remove','সরান'])+'</button></div>', {key:x.id, mv:sbMv('footer/promise/items', i, pr.length)}); }).join('')+sbAddBtn('footer/promise/items', 'promise', ['Add a promise','প্রতিশ্রুতি যোগ করুন'])+'</div>'+sbRmd(pr, 'footer/promise/items', function(x){ return x.text; }), {icon:'shield'});
  var brand = sbCard(['Brand and newsletter','ব্র্যান্ড আর নিউজলেটার'],
    '<div class="sb-grid2">'+sbIn('footer/slogan', ['Footer only: own slogan (empty = the shared one)','শুধু ফুটারে: আলাদা স্লোগান (খালি = সবার একটা)'], ['The shared slogan is in Header › Slogan.','সবার স্লোগান আছে হেডার › স্লোগানে।'], {ph:sbSlogan('header')})+sbIn('footer/sloganBn', ['Footer slogan in Bengali','ফুটারের স্লোগান বাংলায়'])+'</div>'+
    '<div class="sb-sws">'+sbSw('footer/join/on', ['Newsletter box on','নিউজলেটার বক্স চালু'])+'</div>'+
    '<div class="sb-grid2">'+sbIn('footer/join/label', ['Box title','বক্সের শিরোনাম'])+sbIn('footer/join/ph', ['Field hint','ঘরের ভেতরের লেখা'])+sbIn('footer/join/btn', ['Button','বাটন'])+sbIn('footer/join/note', ['Small note','ছোট লেখা'])+'</div>', {icon:'mail'});
  var cl = sbL('footer/cols');
  var cols = sbCard(['Columns and links','কলাম আর লিংক'],
    '<div class="sb-board sb-list" data-sb-list="footer/cols" data-sb-group="fcols">'+cl.map(function(c, ci){ if(c.removed) return ''; var cp = 'footer/cols/#'+c.id, L0 = cp+'/links', ll = sbL(L0);
      return '<div class="sb-row sb-colcard" data-sb-key="'+esc(c.id)+'">'+sbGrip()+'<div class="sb-rowb">'+
        '<div class="sb-grid2">'+sbIn(cp+'/label', ['Column title','কলামের শিরোনাম'])+sbIn(cp+'/bn', ['Bengali','বাংলা'])+'</div>'+
        '<div class="sb-sws">'+sbSw(cp+'/on', ['Shown','দেখাবে'])+sbSel(cp+'/dev', ['Where','কোথায়'], [['', ['Phone and desktop','ফোন আর ডেস্কটপ']], ['phone', ['Phone only','শুধু ফোন']], ['desk', ['Desktop only','শুধু ডেস্কটপ']]], null, {cls:'sb-short'})+sbMv('footer/cols', ci, cl.length)+'<button type="button" class="btn btn-sm btn-ghost" data-act="sb-rm" data-p="'+esc(cp)+'">'+ico('trash',15)+sbE(['Remove column','কলাম সরান'])+'</button></div>'+
        '<div class="sb-list sb-links" data-sb-list="'+esc(L0)+'" data-sb-group="flinks">'+ll.map(function(l, li){ if(l.removed) return ''; var lp = L0+'/#'+l.id;
          var body = l.cat ? '<div class="sb-grid2">'+sbSel(lp+'/cat', ['Category','ক্যাটাগরি'], (DB.categories||[]).map(function(cc){ return [cc.id, cc.name]; }))+sbIn(lp+'/label', ['Own name (optional)','আলাদা নাম (ইচ্ছা হলে)'], null, {ph:sbFtrLinkName(Object.assign({}, l, {label:''}))})+'</div>'
            : '<div class="sb-grid3">'+sbIn(lp+'/label', ['Name','নাম'])+sbIn(lp+'/href', ['Link','লিংক'])+sbIconSel(lp+'/icon', ['Icon','আইকন'])+'</div>';
          return sbRow(body+'<div class="sb-sws">'+sbSw(lp+'/on', ['Shown','দেখাবে'])+sbSel(lp+'/dev', ['Where','কোথায়'], [['', ['Phone and desktop','ফোন আর ডেস্কটপ']], ['phone', ['Phone only','শুধু ফোন']], ['desk', ['Desktop only','শুধু ডেস্কটপ']]], null, {cls:'sb-short'})+'<button type="button" class="btn btn-sm btn-ghost" data-act="sb-rm" data-p="'+esc(lp)+'">'+ico('trash',15)+sbE(['Remove','সরান'])+'</button></div>', {key:l.id, mv:sbMv(L0, li, ll.length)}); }).join('')+
          '<span class="sb-listend sb-addrow">'+sbAddBtn(L0, 'flink', ['Add a link','লিংক যোগ']).replace(' sb-listend','')+sbAddBtn(L0, 'fcat', ['Add a category','ক্যাটাগরি যোগ']).replace(' sb-listend','')+'</span></div>'+sbRmd(ll, L0, sbFtrLinkName)+
      '</div></div>'; }).join('')+sbAddBtn('footer/cols', 'fcol', ['Add a column','কলাম যোগ করুন'])+'</div>'+sbRmd(cl, 'footer/cols', function(c){ return c.label; }),
    {icon:'layers', lead:['Drag a column by its handle to reorder; drag a link into another column to move it there. The arrows do the same with a keyboard.','হ্যান্ডেল ধরে টেনে কলামের ক্রম বদলান; লিংক টেনে অন্য কলামে নিন। কীবোর্ডে তীর দিয়েও একই কাজ।']});
  var K0 = 'footer/contact';
  var contact = sbCard(['Contact block','যোগাযোগের অংশ'], '<div class="sb-sws">'+sbSw(K0+'/wa', ['WhatsApp button','WhatsApp বাটন'])+sbSw(K0+'/hot', ['Hotline button','হটলাইন বাটন'])+sbSw(K0+'/hours', ['Opening hours line','খোলা থাকার সময়'])+'</div>'+
    '<div class="sb-grid2">'+sbIn(K0+'/waLabel', ['WhatsApp button words','WhatsApp বাটনের লেখা'])+sbIn(K0+'/waBn', ['Bengali','বাংলা'])+sbIn(K0+'/hotLabel', ['Hotline button word','হটলাইন বাটনের লেখা'])+sbIn(K0+'/hotBn', ['Bengali','বাংলা'])+'</div>'+
    '<p class="xs muted">'+sbE(['The numbers, hours and e-mail come from Settings, so they are typed in one place only.','নম্বর, সময় আর ই-মেইল আসে সেটিংস থেকে — একবারই লিখতে হয়।'])+' <a href="#/admin/settings">'+sbE(['Settings','সেটিংস'])+'</a></p>', {icon:'phone'});
  var so = sbL('footer/social');
  var soc = sbCard(['Social icons','সোশ্যাল আইকন'], '<div class="sb-list" data-sb-list="footer/social">'+so.map(function(x, i){ if(x.removed) return ''; var sp = 'footer/social/#'+x.id, L = SOC_LIB[x.id];
      return sbRow('<div class="sb-inline sb-socrow"><span class="sb-socic">'+(x.img ? '<img src="'+esc(x.img)+'" alt="" width="18" height="18">' : (L ? L.icon() : ''))+'</span><b>'+esc(x.label || (L ? L.label : x.id))+'</b></div>'+
        '<div class="sb-grid2">'+sbIn(sp+'/url', ['Address (https://…)','ঠিকানা (https://…)'], ['Facebook, Instagram, YouTube and TikTok use the address in Settings when this is empty; WhatsApp uses the shop number.','খালি থাকলে Facebook, Instagram, YouTube আর TikTok সেটিংসের ঠিকানা নেয়; WhatsApp দোকানের নম্বর নেয়।'], {ph:(SITE('social')||{})[x.id] || ''})+(x.img ? sbIn(sp+'/label', ['Name','নাম']) : '')+'</div>'+
        '<div class="sb-sws">'+sbSw(sp+'/on', ['Shown','দেখাবে'])+'<button type="button" class="btn btn-sm btn-ghost" data-act="sb-rm" data-p="'+esc(sp)+'">'+ico('trash',15)+sbE(['Remove','সরান'])+'</button></div>', {key:x.id, mv:sbMv('footer/social', i, so.length)}); }).join('')+'</div>'+
    '<div class="sb-addrow"><select class="input sb-in" aria-label="'+sbE(['Network to add','কোন নেটওয়ার্ক যোগ করবেন'])+'"><option value="">'+sbE(['Choose a network…','নেটওয়ার্ক বাছুন…'])+'</option>'+Object.keys(SOC_LIB).filter(function(k){ return !so.some(function(y){ return y.id===k && !y.removed; }); }).map(function(k){ return '<option value="'+k+'">'+esc(SOC_LIB[k].label)+'</option>'; }).join('')+'</select>'+sbAddBtn('footer/social', 'social', ['Add','যোগ করুন']).replace(' sb-listend','')+'</div>'+
    sbUpRow('footer/social', 'social')+sbRmd(so, 'footer/social', function(x){ return x.label || (SOC_LIB[x.id]||{}).label || x.id; }), {icon:'globe', lead:['A network shows only when it has an address.','ঠিকানা থাকলে তবেই নেটওয়ার্ক দেখায়।']});
  var pl = sbL('footer/pay');
  var pay = sbCard(['Payment marks','পেমেন্টের চিহ্ন'], '<div class="sb-list sb-paylist" data-sb-list="footer/pay">'+pl.map(function(x, i){ if(x.removed) return ''; var pp = 'footer/pay/#'+x.id, L = PAY_LIB[x.id];
      return sbRow('<div class="sb-inline"><span class="sb-paymk">'+(x.img ? '<img src="'+esc(x.img)+'" alt="">' : (L ? '<svg viewBox="0 0 64 22" width="64" height="22" aria-hidden="true">'+L.svg.replace(/extas-ngd/g, 'sb-ngd-'+i)+'</svg>' : ''))+'</span><b>'+esc(x.label || (L ? L.label : x.id))+'</b>'+sbSw(pp+'/on', ['Shown','দেখাবে'])+'<button type="button" class="btn btn-sm btn-ghost" data-act="sb-rm" data-p="'+esc(pp)+'">'+ico('trash',15)+sbE(['Remove','সরান'])+'</button></div>', {key:x.id, mv:sbMv('footer/pay', i, pl.length)}); }).join('')+'</div>'+
    '<div class="sb-addrow"><select class="input sb-in" aria-label="'+sbE(['Mark to add','কোন চিহ্ন যোগ করবেন'])+'"><option value="">'+sbE(['Choose a mark…','চিহ্ন বাছুন…'])+'</option>'+Object.keys(PAY_LIB).filter(function(k){ return !pl.some(function(y){ return y.id===k && !y.removed; }); }).map(function(k){ return '<option value="'+k+'">'+esc(PAY_LIB[k].label)+'</option>'; }).join('')+'</select>'+sbAddBtn('footer/pay', 'pay', ['Add','যোগ করুন']).replace(' sb-listend','')+'</div>'+
    sbUpRow('footer/pay', 'pay')+sbRmd(pl, 'footer/pay', function(x){ return x.label || (PAY_LIB[x.id]||{}).label || x.id; }), {icon:'cash', lead:['Five marks fill one row; more marks make two rows by themselves.','পাঁচটা চিহ্ন এক সারিতে; বেশি হলে নিজে থেকেই দুই সারি।']});
  var legal = sbCard(['Bottom line','নিচের লাইন'], '<div class="sb-grid2">'+sbIn('footer/copy', ['Copyright','কপিরাইট'])+sbIn('footer/copyBn', ['Bengali','বাংলা'])+sbIn('footer/note', ['Extra words (optional)','বাড়তি লেখা (ইচ্ছা হলে)'])+sbIn('footer/noteBn', ['Bengali','বাংলা'])+'</div>'+
    '<div class="sb-sws">'+sbSw('footer/ids', ['Trade licence and DBID (from Settings)','ট্রেড লাইসেন্স আর DBID (সেটিংস থেকে)'], {locked:!!(SITE('dbid') || SITE('tradeLicence')), lockWhy:['The law asks for these to be shown once they exist.','এগুলো থাকলে দেখানো আইনে বাধ্যতামূলক।']})+'</div>', {icon:'doc'});
  return promise+brand+cols+'<div class="sb-cols2">'+contact+legal+'</div>'+'<div class="sb-cols2">'+soc+pay+'</div>';
}
/* add an own icon / mark with a name, a link (social) and a picture */
function sbUpRow(path, kind){
  var k = 'sbup:'+kind, u = UI[k] = UI[k] || {label:'', url:'', img:''};
  return '<details class="sb-upd"><summary>'+ico('plus',14)+sbE(kind==='social' ? ['Upload your own icon (SVG or PNG)','নিজের আইকন আপলোড (SVG বা PNG)'] : ['Upload a new payment mark','নতুন পেমেন্ট চিহ্ন আপলোড'])+'</summary>'+
    '<div class="sb-grid3"><div class="sb-f"><label class="sb-fl" for="'+k+'-n">'+sbE(['Name','নাম'])+'</label><input class="input sb-in" id="'+k+'-n" data-input="sb-upf" data-k="'+kind+'" data-f="label" value="'+esc(u.label)+'"></div>'+
      (kind==='social' ? '<div class="sb-f"><label class="sb-fl" for="'+k+'-u">'+sbE(['Address (https://…)','ঠিকানা (https://…)'])+'</label><input class="input sb-in" id="'+k+'-u" data-input="sb-upf" data-k="'+kind+'" data-f="url" value="'+esc(u.url)+'"></div>' : '')+
      '<div class="sb-f"><label class="sb-fl" for="'+k+'-f">'+sbE(['Picture (up to 60 KB)','ছবি (৬০ KB পর্যন্ত)'])+'</label><input class="sb-file" id="'+k+'-f" type="file" accept="image/svg+xml,image/png,image/webp" data-change="sb-upic" data-k="'+kind+'"></div></div>'+
    (u.img ? '<p class="xs">'+sbE(['Picture ready.','ছবি তৈরি।'])+' <img src="'+esc(u.img)+'" alt="" height="20" style="vertical-align:middle"></p>' : '')+
    '<button type="button" class="btn btn-sm btn-secondary" data-act="sb-upadd" data-p="'+esc(path)+'" data-k="'+kind+'">'+ico('plus',15)+sbE(['Add to the list','তালিকায় যোগ'])+'</button></details>';
}
INPUT['sb-upf'] = function(el){ var u = UI['sbup:'+el.getAttribute('data-k')] = UI['sbup:'+el.getAttribute('data-k')] || {}; u[el.getAttribute('data-f')] = el.value; };
CHANGE['sb-upic'] = function(el){
  var f = el.files && el.files[0], k = el.getAttribute('data-k'); if(!f) return;
  if(!/^image\/(png|svg\+xml|webp)$/.test(f.type)){ toast(sbT(['Use an SVG, PNG or WebP picture','SVG, PNG বা WebP ছবি দিন'])); el.value = ''; return; }
  if(f.size > SB_CFG.iconKB * 1024){ toast(sbT(['Keep the icon under {k} KB','আইকন {k} KB-এর কম রাখুন'], {k:SB_CFG.iconKB})); el.value = ''; return; }
  var r = new FileReader(); r.onload = function(){ var u = UI['sbup:'+k] = UI['sbup:'+k] || {}; u.img = String(r.result); rerender(); }; r.readAsDataURL(f);
};
ACT['sb-upadd'] = function(el){
  var k = el.getAttribute('data-k'), u = UI['sbup:'+k] || {}, p = el.getAttribute('data-p');
  if(!u.img || !String(u.label||'').trim()){ toast(sbT(['Give it a name and a picture first','আগে নাম আর ছবি দিন'])); return; }
  if(k==='social' && !/^https?:\/\//.test(u.url||'')){ toast(sbT(['The address must start with https://','ঠিকানা https:// দিয়ে শুরু হতে হবে'])); return; }
  var x = {id:sbId(k==='social' ? 'so' : 'pm'), label:u.label.trim(), img:u.img, on:true}; if(k==='social') x.url = u.url;
  sbList(p).push(x); UI['sbup:'+k] = null; saveState(); rerender(); toast(sbT(['Added to the draft','খসড়ায় যোগ হলো']));
};

/* ---------- CATEGORIES ---------- */
var SB_GARMENTS = ['polo','tee','shirt','panjabi','trouser','hoodie','socks','belt'];
function sbCatsEd(){
  var cl = sbL('cats/list');
  var rows = cl.map(function(c, i){
    var cp = 'cats/list/#'+sbK(c.id), open = UI['sbo:'+cp], live = CAT(c.id), n = productsIn(c.id).length;
    var state = c.unlisted ? '<span class="sb-pill warn">'+sbE(['Not listed — page still live','তালিকায় নেই — পেজ খোলা আছে'])+'</span>' : (c.menu===false ? '<span class="sb-pill">'+sbE(['Not in menus','মেনুতে নেই'])+'</span>' : (c.hidden ? '<span class="sb-pill">'+sbE(['Only under "More"','শুধু "More"-এর ভেতরে'])+'</span>' : '<span class="sb-pill ok">'+sbE(['In the menu','মেনুতে আছে'])+'</span>'));
    var subs = (DB.subcats||[]).filter(function(s){ return s.id.indexOf(c.id+'/')===0; });
    var body = '<div class="sb-rowtop"><span class="sb-catic">'+catIcon(c.garment, 18)+'</span><b>'+esc(c.name||'')+'</b>'+state+'<span class="xs muted">'+sbE(['{n} styles · address #/c/{id}','{n}টা স্টাইল · ঠিকানা #/c/{id}'], {n:n, id:c.id})+'</span></div>'+
      '<div class="sb-grid2">'+sbIn(cp+'/name', ['Name','নাম'], ['Renaming changes the name everywhere. The address #/c/'+c.id+' and every product link stay the same.','নাম বদলালে সব জায়গায় বদলায়। ঠিকানা #/c/'+c.id+' আর প্রতিটা প্রোডাক্টের লিংক একই থাকে।'])+sbIn(cp+'/bn', ['Name in Bengali','বাংলায় নাম'])+'</div>'+
      '<div class="sb-sws">'+sbSw(cp+'/menu', ['In menus','মেনুতে'])+sbSw(cp+'/unlisted', ['Not listed','তালিকায় নেই'], {invert:true})+sbSel(cp+'/hidden', ['Desktop row','ডেস্কটপ সারি'], [['false', ['In the main row','মূল সারিতে']], ['true', ['Under "More"','"More"-এর ভেতরে']]], null, {cls:'sb-short'}).replace('data-change="sb-sel"', 'data-change="sb-selb"')+
        '<a class="btn btn-sm btn-ghost" href="#/c/'+esc(c.id)+'" target="_blank" rel="noopener">'+ico('eye',15)+sbE(['Open page','পেজ দেখুন'])+'</a>'+
        '<button type="button" class="btn btn-sm btn-ghost" data-act="sb-open" data-k="'+esc(cp)+'" aria-expanded="'+!!open+'">'+ico('edit',15)+sbE(['Intro, picture, SEO, sub-categories','পরিচিতি, ছবি, SEO, সাব-ক্যাটাগরি'])+'</button></div>'+
      (open ? '<div class="sb-sub">'+sbIn(cp+'/blurb', ['Intro text (under the title)','পরিচিতি (শিরোনামের নিচে)'], null, {area:1, rows:2})+
        '<div class="sb-grid3">'+sbSel(cp+'/garment', ['Garment drawing and icon','পোশাকের ছবি আর আইকন'], SB_GARMENTS.map(function(g){ return [g, g]; }))+sbSel(cp+'/img/product', ['Tile picture (home)','টাইলের ছবি (হোম)'], sbProdOpts())+sbSel(cp+'/img/color', ['Colour','রং'], sbColOpts(c.img && c.img.product))+'</div>'+
        '<div class="sb-grid2">'+sbIn(cp+'/seoTitle', ['SEO title (Google)','SEO শিরোনাম (Google)'], ['About 50–60 letters. Empty = the category name.','৫০–৬০ অক্ষরের মতো। খালি = ক্যাটাগরির নাম।'])+sbIn(cp+'/seoMeta', ['SEO description','SEO বর্ণনা'], ['About 150 letters that make someone click.','১৫০ অক্ষরের মতো, যা পড়ে ক্লিক করতে ইচ্ছা হয়।'], {area:1, rows:2})+'</div>'+
        '<div class="sb-subs"><b class="xs">'+sbE(['Sub-categories','সাব-ক্যাটাগরি'])+'</b>'+subs.map(function(s, si){ var sp = 'cats/subs/'+sbK(s.id), so = sbGet(sp) || {};
          return '<div class="sb-subrow"><span class="xs muted">'+esc(s.id)+'</span>'+sbIn(sp+'/name', ['Name','নাম'], null, {ph:(s._sb0||s).name})+sbSw(sp+'/unlisted', ['Not listed','তালিকায় নেই'], {invert:true})+sbIn(sp+'/order', ['Order','ক্রম'], null, {type:'number', num:1, cls:'sb-tiny', ph:String(si+1)})+'</div>'; }).join('')+
          sbAddBtn('cats/subsNew', 'sub', ['Add a sub-category','সাব-ক্যাটাগরি যোগ'], ' data-parent="'+esc(c.id)+'"')+'</div></div>' : '');
    return sbRow(body, {key:c.id, mv:sbMv('cats/list', i, cl.length)});
  }).join('');
  return sbCard(['Categories','ক্যাটাগরি'], '<div class="sb-list" data-sb-list="cats/list">'+rows+sbAddBtn('cats/list', 'cat', ['Add a category','ক্যাটাগরি যোগ করুন'])+'</div>',
    {icon:'grid', lead:['Order here = order in every menu, the footer and the home tiles. Nothing is deleted: "Not listed" takes a category out of menus, tiles and search, but its page and product links keep working (a short note shows on its page).','এখানের ক্রমই সব মেনু, ফুটার আর হোমের টাইলের ক্রম। কিছু মোছা হয় না: "তালিকায় নেই" দিলে মেনু, টাইল আর সার্চ থেকে সরে যায়, কিন্তু পেজ আর প্রোডাক্টের লিংক চালু থাকে (পেজে ছোট একটা নোট দেখায়)।']})+
    '<p class="sb-links xs">'+ico('link',14)+sbE(['Products and their category are edited in','প্রোডাক্ট আর তার ক্যাটাগরি বদলানো যায়'])+' <a href="#/admin/products">'+sbE(['Products','প্রোডাক্ট'])+'</a> · '+sbE(['category page sections in','ক্যাটাগরি পেজের সেকশন'])+' <a href="#/admin/layout">'+sbE(['Page layout','পেজ সাজান'])+'</a></p>';
}
CHANGE['sb-selb'] = function(el){ sbSet(el.getAttribute('data-p'), el.value === 'true'); saveState(); rerender(); };

/* ---------- PRODUCT PAGE ---------- */
var SB_PDP_NAMES = {title:['Title row (brand, name, heart, rating)','শিরোনাম (ব্র্যান্ড, নাম, হার্ট, রেটিং)'], price:['Price row (+ second price bar)','দামের সারি (+ দ্বিতীয় দামের বার)'], colour:['Colour','রং'], size:['Size','সাইজ'], sizehelp:['Size help (Find my size)','সাইজ সাহায্য (আমার সাইজ)'],
  stock:['Stock line','স্টকের লাইন'], offers:['Offers (combo and set deals)','অফার (কম্বো আর সেট)'], buy:['Buy buttons (Add to Bag + Order Now)','কেনার বাটন (ব্যাগে রাখুন + এখনই অর্ডার)'], trust:['Promises (swap, delivery, original)','প্রতিশ্রুতি (এক্সচেঞ্জ, ডেলিভারি, আসল)'],
  info:['Delivery · Exchange · Returns info','ডেলিভারি · এক্সচেঞ্জ · রিটার্ন তথ্য'], desc:['Description (fabric, fit, details)','বর্ণনা (কাপড়, ফিট, বিস্তারিত)'], care:['Care guide link','যত্নের গাইডের লিংক'],
  reviews:['Reviews','রিভিউ'], faq:['Questions (FAQ)','প্রশ্ন-উত্তর'], together:['Goes well with (buy together)','একসাথে মানায়'], related:['Recently viewed','সম্প্রতি দেখা']};
function sbPdpEd(){
  var zone = function(z, title, lead){
    var L0 = 'pdp/order/'+z, ol = sbL(L0);
    return sbCard(title, '<div class="sb-list" data-sb-list="'+L0+'">'+ol.map(function(id, i){
      var vp = 'pdp/vis/'+id, buy = id==='buy';
      return sbRow('<div class="sb-inline"><b>'+sbE(SB_PDP_NAMES[id]||[id])+'</b>'+(buy ? '<span class="sb-pill ok">'+ico('lock',12)+sbE(['Always shown · first screen','সবসময় দেখাবে · প্রথম স্ক্রিন'])+'</span>' : '')+'</div>'+
        (buy ? '' : '<div class="sb-sws">'+sbSw(vp+'/on', ['Shown','দেখাবে'])+sbDevSw(vp)+'</div>'), {key:id, mv:sbMv(L0, i, ol.length)});
    }).join('')+'</div>', {icon:z==='buy'?'bag':(z==='details'?'doc':'star'), lead:lead});
  };
  var blocked = UI.sbBlocked ? '<div class="sb-err" role="alert">'+ico('lock',16)+esc(UI.sbBlocked)+'</div>' : '';
  return blocked+'<p class="sb-note xs">'+ico('lock',14)+sbE(['The photo gallery stays first, and the buy buttons can never be hidden: only the title, price, colour, size, size help, stock line and offers may sit above them, so they stay in the first screen on every device (rule D-053). The phone keeps its sticky buy bar.','ছবির গ্যালারি সবার আগে থাকে, আর কেনার বাটন কখনো লুকানো যায় না: শুধু শিরোনাম, দাম, রং, সাইজ, সাইজ সাহায্য, স্টক লাইন আর অফার বাটনের উপরে থাকতে পারে — যাতে প্রতিটা ডিভাইসে বাটন প্রথম স্ক্রিনেই থাকে (নিয়ম D-053)। ফোনের নিচের কেনার বার সবসময় থাকে।'])+'</p>'+
    zone('buy', ['Buy column (next to the photos)','কেনার কলাম (ছবির পাশে)'], ['Drag or use the arrows. Every product page follows this order.','টেনে বা তীর দিয়ে সাজান। সব প্রোডাক্ট পেজ এই ক্রম মানে।'])+
    '<div class="sb-cols2">'+zone('details', ['Details column','বিস্তারিত কলাম'])+zone('below', ['Under the page','পেজের নিচে'])+'</div>'+
    '<p class="sb-links xs">'+ico('link',14)+sbE(['Product page templates T1–T3, switches like the colour note or the light sweep are in','প্রোডাক্ট পেজের টেমপ্লেট T1–T3 আর রঙের নোট বা আলোর ঝলকের মতো সুইচ আছে'])+' <a href="#/admin/settings">'+sbE(['Settings','সেটিংস'])+'</a></p>';
}

/* ---------- PAGES ---------- */
var SB_BLOCKS = {h:['Heading','শিরোনাম'], p:['Paragraph','অনুচ্ছেদ'], ul:['List','তালিকা'], img:['Picture','ছবি'], call:['Callout box','নজর কাড়া বক্স'], btn:['Button','বাটন'], tok:['Shop details','দোকানের তথ্য'], html:['Kept as written','যেমন লেখা তেমন']};
var SB_TOK = {TRIAL:['Trial-at-the-door line (from Settings)','দরজায় ট্রায়ালের লাইন (সেটিংস থেকে)'], CONTACT:['Contact line (from Settings)','যোগাযোগের লাইন (সেটিংস থেকে)'], LEGAL:['Company details (from Settings)','কোম্পানির তথ্য (সেটিংস থেকে)']};
function sbNewBlock(t){
  var L = sbLang()==='bn', b = {id:sbId('b'), t:t};
  if(t==='h') b.text = L ? 'নতুন শিরোনাম' : 'New heading';
  if(t==='p') b.text = L ? 'এখানে লিখুন।' : 'Write here.';
  if(t==='ul') b.items = [L ? 'প্রথম কথা' : 'First point', L ? 'দ্বিতীয় কথা' : 'Second point'];
  if(t==='img'){ b.product = (DB.products[0]||{}).id; b.w = 'full'; b.cap = ''; }
  if(t==='call'){ b.text = L ? 'গুরুত্বপূর্ণ কথা।' : 'Something important.'; b.tone = 'info'; }
  if(t==='btn'){ b.label = L ? 'এখনই দেখুন' : 'Shop now'; b.href = '#/c/new'; b.style = 'primary'; }
  return b;
}
function sbPagesFix(d){ (d.list||[]).forEach(function(pg){ if(!pg.id) pg.id = pg.slug; (pg.blocks||[]).forEach(function(b){ if(!b.id) b.id = sbId('b'); }); }); return d; }
function sbPagesEd(){
  var d = sbCur('pages'), list = d.list || [], sel = UI.sbPage && list.some(function(x){ return x.slug===UI.sbPage; }) ? UI.sbPage : (list[0]||{}).slug;
  var pick = '<div class="sb-pagepick" role="tablist">'+list.map(function(pg){ return '<button type="button" role="tab" class="chip'+(pg.slug===sel?' on':'')+'" aria-selected="'+(pg.slug===sel)+'" data-act="sb-page" data-s="'+esc(pg.slug)+'">'+esc(pg.title||pg.slug)+(pg.custom?' <span class="sb-pill">'+sbE(['new','নতুন'])+'</span>':'')+'</button>'; }).join('')+
    '<button type="button" class="chip" data-act="sb-add" data-p="pages/list" data-kind="page">'+ico('plus',14)+sbE(['New page','নতুন পেজ'])+'</button></div>';
  var pg = list.filter(function(x){ return x.slug===sel; })[0]; if(!pg) return sbCard(['Pages','পেজ'], pick);
  var pp = 'pages/list/#'+sbK(pg.id || pg.slug);
  var head = '<div class="sb-grid2">'+sbIn(pp+'/title', ['Title','শিরোনাম'])+(pg.builtin ? '' : sbIn(pp+'/lede', ['Intro (under the title)','পরিচিতি (শিরোনামের নিচে)'], null, {area:1, rows:2}))+'</div>'+
    (pg.builtin ? sbIn(pp+'/lede', ['Intro (under the title)','পরিচিতি (শিরোনামের নিচে)'], null, {area:1, rows:2})+'<p class="sb-note xs">'+ico('lock',14)+sbE(['The contact form keeps its fields — the words above it are yours.','যোগাযোগের ফর্মের ঘরগুলো একই থাকে — উপরের লেখা আপনার।'])+'</p>' : '')+
    '<div class="sb-grid3">'+(pg.custom ? sbIn(pp+'/slug', ['Address','ঠিকানা'], ['The page opens at #/page/ + this. Use a–z, 0–9 and -. Change it before you link to the page.','পেজটা খোলে #/page/ + এটা দিয়ে। শুধু a–z, 0–9 আর - চলবে। লিংক দেওয়ার আগে ঠিক করে নিন।']) : '<div class="sb-f"><div class="sb-fl"><span>'+sbE(['Address','ঠিকানা'])+'</span>'+sbQ(['Built-in pages keep their address, so every old link keeps working.','শুরুর পেজগুলোর ঠিকানা বদলায় না, তাই পুরনো সব লিংক চালু থাকে।'])+'</div><a class="xs" href="#/page/'+esc(pg.slug)+'" target="_blank" rel="noopener">#/page/'+esc(pg.slug)+'</a></div>')+
      sbIn(pp+'/seoTitle', ['SEO title','SEO শিরোনাম'], ['Empty = the page title.','খালি = পেজের শিরোনাম।'])+sbIn(pp+'/seoMeta', ['SEO description','SEO বর্ণনা'], null, {area:1, rows:2})+'</div>';
  var bl = pg.blocks || [], B0 = pp+'/blocks';
  var blocks = pg.builtin ? '' : '<div class="sb-list" data-sb-list="'+esc(B0)+'">'+bl.map(function(b, i){
    if(b.removed) return ''; var bp = B0+'/#'+b.id, ed = '';
    if(b.t==='h') ed = sbIn(bp+'/text', ['Heading','শিরোনাম']);
    if(b.t==='p') ed = sbIn(bp+'/text', ['Paragraph','অনুচ্ছেদ'], ['**words** = bold · [words](#/page/delivery) = a link · {insideHours}, {freeOver}, {windowHours} … = the numbers from your settings.','**লেখা** = মোটা · [লেখা](#/page/delivery) = লিংক · {insideHours}, {freeOver}, {windowHours} … = সেটিংসের সংখ্যা।'], {area:1, rows:3});
    if(b.t==='ul') ed = sbIn(bp+'/items', ['One point per line','প্রতি লাইনে একটা কথা'], null, {area:1, rows:4, lines:1});
    if(b.t==='call') ed = sbIn(bp+'/text', ['Words','লেখা'], null, {area:1, rows:2})+sbSel(bp+'/tone', ['Colour','রং'], [['info', ['Brand','ব্র্যান্ড']], ['warn', ['Warning','সতর্কতা']]], null, {cls:'sb-short'});
    if(b.t==='btn') ed = '<div class="sb-grid3">'+sbIn(bp+'/label', ['Button words','বাটনের লেখা'])+sbIn(bp+'/href', ['Link','লিংক'])+sbSel(bp+'/style', ['Look','ধরন'], [['primary', ['Solid','ভরাট']], ['secondary', ['Outline','বর্ডার']]])+'</div>';
    if(b.t==='img') ed = '<div class="sb-grid3">'+sbSel(bp+'/product', ['Product photo','প্রোডাক্টের ছবি'], sbProdOpts())+sbSel(bp+'/color', ['Colour','রং'], sbColOpts(b.product))+sbSel(bp+'/w', ['Width (snaps to the column)','চওড়া (কলামে মানিয়ে)'], [['full', ['Full','পুরো']], ['half', ['Half','অর্ধেক']], ['third', ['One third','এক-তৃতীয়াংশ']]])+'</div>'+
      '<div class="sb-grid2">'+sbFile(bp+'/src', ['…or upload a picture (up to 400 KB)','…অথবা ছবি আপলোড (৪০০ KB পর্যন্ত)'], SB_CFG.imgKB, 'image/png,image/jpeg,image/webp,image/svg+xml')+sbIn(bp+'/cap', ['Caption','ক্যাপশন'])+sbIn(bp+'/alt', ['Picture description','ছবির বর্ণনা'])+'</div>'+(b.src ? '<button type="button" class="btn btn-sm btn-ghost" data-act="sb-clr" data-p="'+esc(bp)+'/src">'+sbE(['Use the product photo instead','বদলে প্রোডাক্টের ছবি'])+'</button>' : '');
    if(b.t==='tok') ed = '<p class="xs muted">'+sbE(SB_TOK[b.v]||[b.v])+'</p>';
    if(b.t==='html') ed = '<p class="xs muted">'+sbE(['This part is kept exactly as it was written.','এই অংশটা যেমন লেখা ছিল তেমনই রাখা আছে।'])+'</p>';
    return sbRow('<div class="sb-rowtop"><span class="sb-kind">'+sbE(SB_BLOCKS[b.t]||[b.t])+'</span></div>'+ed+'<div class="sb-sws">'+sbSw(bp+'/on', ['Shown','দেখাবে'])+sbDevSw(bp)+(b.t==='tok' ? '' : '<button type="button" class="btn btn-sm btn-ghost" data-act="sb-rm" data-p="'+esc(bp)+'">'+ico('trash',15)+sbE(['Remove','সরান'])+'</button>')+'</div>', {key:b.id, mv:sbMv(B0, i, bl.length)});
  }).join('')+'<div class="sb-listend sb-addblocks">'+['h','p','ul','img','call','btn'].map(function(t){ return '<button type="button" class="btn btn-sm btn-secondary" data-act="sb-add" data-p="'+esc(B0)+'" data-kind="block" data-t="'+t+'">'+ico('plus',14)+sbE(SB_BLOCKS[t])+'</button>'; }).join('')+'</div></div>'+sbRmd(bl, B0, function(b){ return b.text || sbT(SB_BLOCKS[b.t]||[b.t]); });
  var qa = pg.qa ? '<div class="sb-sub"><b>'+sbE(['Questions and answers','প্রশ্ন আর উত্তর'])+'</b>'+pg.qa.map(function(q, i){ var qp = pp+'/qa/'+i;
      return '<div class="sb-qarow">'+sbIn(qp+'/0', ['Question','প্রশ্ন'])+sbIn(qp+'/1', ['Answer','উত্তর'], ['{insideHours}, {inside}, {freeOver} … fill in from your settings.','{insideHours}, {inside}, {freeOver} … সেটিংস থেকে বসে।'], {area:1, rows:2})+sbMv(pp+'/qa', i, pg.qa.length)+'<button type="button" class="btn btn-sm btn-ghost" data-act="sb-qarm" data-p="'+esc(pp)+'" data-i="'+i+'">'+ico('trash',15)+sbE(['Remove','সরান'])+'</button></div>'; }).join('')+
    sbAddBtn(pp+'/qa', 'qa', ['Add a question','প্রশ্ন যোগ করুন'])+((pg.qaRemoved||[]).length ? '<div class="sb-rmd"><span class="xs bold">'+sbE(['Removed (kept, not deleted)','সরানো (রাখা আছে, মোছা হয়নি)'])+'</span>'+pg.qaRemoved.map(function(q, i){ return '<span class="sb-rmi"><span>'+esc(q[0])+'</span><button type="button" class="btn btn-sm btn-ghost" data-act="sb-qaun" data-p="'+esc(pp)+'" data-i="'+i+'">'+sbE(['Restore','ফেরান'])+'</button></span>'; }).join('')+'</div>' : '')+'</div>' : '';
  var legal = (pg.slug==='privacy' || pg.slug==='terms') ? '<p class="sb-note xs">'+ico('lock',14)+sbE(['A legal page: you can edit every word, but it always stays published and linked from the footer.','আইনি পেজ: প্রতিটা শব্দ বদলানো যায়, কিন্তু পেজটা সবসময় প্রকাশিত থাকে আর ফুটারে লিংক থাকে।'])+'</p>' : '';
  return sbCard(['Pages','পেজ'], pick, {icon:'doc'})+sbCard([pg.title || pg.slug, pg.title || pg.slug], legal+head+blocks+qa, {icon:'edit', right:'<a class="btn btn-sm btn-ghost" href="#/page/'+esc(pg.slug)+'" target="_blank" rel="noopener">'+ico('eye',15)+sbE(['Open live page','লাইভ পেজ দেখুন'])+'</a>'});
}
ACT['sb-page'] = function(el){ UI.sbPage = el.getAttribute('data-s'); rerender(); };
ACT['sb-qarm'] = function(el){ var pg = sbGet(el.getAttribute('data-p'), sbDraft('pages')); var i = +el.getAttribute('data-i'); if(!pg || !pg.qa) return; (pg.qaRemoved = pg.qaRemoved || []).push(pg.qa.splice(i, 1)[0]); saveState(); rerender(); };
ACT['sb-qaun'] = function(el){ var pg = sbGet(el.getAttribute('data-p'), sbDraft('pages')); var i = +el.getAttribute('data-i'); if(!pg || !pg.qaRemoved) return; pg.qa.push(pg.qaRemoved.splice(i, 1)[0]); saveState(); rerender(); };

/* ---------- THEME ---------- */
function sbContrastHTML(th){
  var rows = sbContrast(th);
  return '<table class="tbl sb-ctbl"><thead><tr><th>'+sbE(['Where','কোথায়'])+'</th><th>'+sbE(['Sample','নমুনা'])+'</th><th>'+sbE(['Contrast','কনট্রাস্ট'])+'</th></tr></thead><tbody>'+rows.map(function(r){
    return '<tr class="'+(r.ok?'':'sb-badrow')+'"><td>'+sbE(r.label)+'</td><td><span class="sb-swatch" style="background:'+esc(r.bgv)+';color:'+esc(r.fgv)+'">Aa অ</span></td><td>'+(r.ratio==null ? '—' : '<b>'+r.ratio+':1</b> '+(r.ok ? '<span class="sb-ok">'+ico('check',13)+'AA</span>' : '<span class="sb-bad">'+sbE(['too low','খুব কম'])+'</span>'))+'</td></tr>'; }).join('')+'</tbody></table>';
}
function sbThemeEd(){
  var th = sbCur('theme'), base = sbThemeBase();
  var tok = sbCard(['Colours','রং'], '<p class="xs muted">'+sbE(['Starting point: the "{t}" theme (Demo controls › Theme). Change only what you want; the rest follows the theme.','শুরু: "{t}" থিম (ডেমো কন্ট্রোল › থিম)। যেটা চান শুধু সেটা বদলান; বাকিটা থিম মেনে চলে।'], {t:ST.theme})+'</p>'+
    '<div class="sb-tokgrid">'+SB_TOKENS.map(function(t){ return sbColor('theme/tokens/'+t[0], t[1], base[t[0]] || ''); }).join('')+'</div>', {icon:'sun'});
  var type = sbCard(['Fonts, corners and spacing','ফন্ট, কোনা আর ফাঁকা জায়গা'], '<div class="sb-grid2">'+sbSel('theme/fontBody', ['Body font','লেখার ফন্ট'], SB_FONTS_BODY, ['Only fonts that carry Bengali well and load fast are offered.','শুধু বাংলা ভালো দেখায় আর দ্রুত লোড হয় এমন ফন্টই আছে।'])+sbSel('theme/fontDisplay', ['Headings font','শিরোনামের ফন্ট'], SB_FONTS_DISPLAY)+
    sbSel('theme/radius', ['Corners','কোনা'], SB_RADII)+sbSel('theme/space', ['Space between sections','সেকশনের মাঝের জায়গা'], SB_SPACES)+'</div>', {icon:'ruler'});
  var con = sbCard(['Contrast check (AA)','কনট্রাস্ট চেক (AA)'], '<div id="sb-contrast">'+sbContrastHTML(th)+'</div>', {icon:'eye', lead:['Every text colour must reach 4.5:1 against its background, or Publish stays blocked. That keeps the shop readable in sunlight on a phone.','প্রতিটা লেখার রং ব্যাকগ্রাউন্ডের সাথে অন্তত 4.5:1 হতে হবে, নইলে প্রকাশ বন্ধ থাকে। এতে রোদে ফোনেও দোকান পড়া যায়।']});
  return tok+'<div class="sb-cols2">'+type+con+'</div>';
}

/* =====================================================================
   9. ADMIN · the workflow bar, how-to, previews, history
   ===================================================================== */
function sbFlowHTML(area){
  if(area==='status') return '<div id="sb-flow"></div>';
  var dr = sbHasDraft(area), live = sbIsCustom(area), h = sbHist(area), lastPub = h.length ? h[h.length-1] : null;
  var canUndo = sbS().log.some(function(e){ return e.area===area && !e.undone; });
  return '<div class="sb-flow" id="sb-flow" role="region" aria-label="'+sbE(['Draft and publish','খসড়া আর প্রকাশ'])+'">'+
    '<div class="sb-flowst"><span class="sb-pill '+(dr?'warn':'ok')+'">'+(dr ? sbE(['Draft — not on the shop yet','খসড়া — দোকানে এখনো নেই']) : sbE(['No changes waiting','অপেক্ষায় কোনো বদল নেই']))+'</span>'+
      '<span class="xs muted">'+(live ? sbE(['Live: your version from {d}','লাইভ: আপনার {d}-এর ভার্সন'], {d:lastPub ? dateTimeStr(lastPub.at) : '—'}) : sbE(['Live: the built-in default','লাইভ: শুরুর ডিফল্ট']))+'</span></div>'+
    '<div class="sb-flowb">'+
      '<button type="button" class="btn btn-sm btn-secondary" data-act="sb-x" data-a="pv" aria-pressed="'+!!UI.sbPv+'">'+ico('eye',15)+(UI.sbPv ? sbE(['Hide preview','প্রিভিউ বন্ধ']) : sbE(['Preview phone · tablet · desktop','প্রিভিউ ফোন · ট্যাবলেট · ডেস্কটপ']))+'</button>'+
      '<button type="button" class="btn btn-sm btn-primary" data-act="sb-x" data-a="publish" data-area="'+area+'"'+(dr?'':' disabled')+'>'+ico('check',15)+sbE(['Publish','প্রকাশ করুন'])+'</button>'+
      '<button type="button" class="btn btn-sm btn-ghost" data-act="sb-x" data-a="discard" data-area="'+area+'"'+(dr?'':' disabled')+'>'+ico('close',15)+sbE(['Discard draft','খসড়া বাদ'])+'</button>'+
      '<button type="button" class="btn btn-sm btn-ghost" data-act="sb-x" data-a="undo" data-area="'+area+'"'+(canUndo?'':' disabled')+'>'+ico('back',15)+sbE(['Undo last publish','শেষ প্রকাশ ফেরান'])+'</button>'+
      '<button type="button" class="btn btn-sm btn-ghost" data-act="sb-x" data-a="hist" aria-expanded="'+!!UI.sbHist+'">'+ico('clock',15)+sbE(['Versions ({n})','ভার্সন ({n})'], {n:h.length})+'</button>'+
    '</div></div>';
}
function sbHistHTML(area){
  if(!UI.sbHist) return '';
  var h = sbHist(area).slice().reverse();
  return sbCard(['Versions of this part','এই অংশের ভার্সন'], (h.length ? '<ul class="sb-hist">'+h.map(function(v, i){ return '<li><span><b>'+esc(dateTimeStr(v.at))+'</b> · '+esc(v.label)+(i===0 ? ' <span class="sb-pill ok">'+sbE(['live','লাইভ'])+'</span>' : '')+'</span>'+(i===0 ? '' : '<button type="button" class="btn btn-sm btn-secondary" data-act="sb-x" data-a="restore" data-area="'+area+'" data-v="'+esc(v.id)+'">'+sbE(['Restore','ফেরান'])+'</button>')+'</li>'; }).join('')+'</ul>' : '<p class="xs muted">'+sbE(['No versions yet — each publish is kept here.','এখনো ভার্সন নেই — প্রতিটা প্রকাশ এখানে থাকবে।'])+'</p>')+
    '<div class="sb-sws"><button type="button" class="btn btn-sm btn-ghost" data-act="sb-x" data-a="factory" data-area="'+area+'"'+(sbIsCustom(area)?'':' disabled')+'>'+sbE(['Back to the built-in default','শুরুর ডিফল্টে ফেরান'])+'</button>'+
    '<a class="btn btn-sm btn-ghost" href="#/admin/settings">'+ico('layers',15)+sbE(['Launch default and snapshots (whole site)','লঞ্চ ডিফল্ট আর স্ন্যাপশট (পুরো সাইট)'])+'</a></div>', {icon:'clock', lead:['Every publish is a version. Restore puts one live at once; Undo brings back what was live before.','প্রতিটা প্রকাশ একটা ভার্সন। ফেরান চাপলে সেটা সাথে সাথে লাইভ; Undo আগেরটা ফেরায়।']});
}
var SB_HOWTO = {
  menus:[['Rename, hide or reorder an item: type a new name, use the switches, drag the handle or tap the arrows.','নাম বদলান, লুকান বা ক্রম বদলান: নতুন নাম লিখুন, সুইচ চাপুন, হ্যান্ডেল টানুন বা তীর চাপুন।'], ['Add your own link with "Add your own menu item". "Columns & featured tile" builds the big desktop menu.','"নিজের মেনু আইটেম" দিয়ে নিজের লিংক যোগ করুন। "কলাম আর ফিচার্ড টাইল" দিয়ে ডেস্কটপের বড় মেনু সাজান।'], ['Check the preview on phone, tablet and desktop, then Publish.','ফোন, ট্যাবলেট আর ডেস্কটপে প্রিভিউ দেখে প্রকাশ করুন।']],
  header:[['Logo: type the name or upload a picture; set its height.','লোগো: নাম লিখুন বা ছবি আপলোড করে উচ্চতা ঠিক করুন।'], ['Slogan: one text for header and footer; switch it off or give each place its own words.','স্লোগান: হেডার আর ফুটারে একটাই লেখা; বন্ধ করা যায় বা প্রতিটা জায়গায় আলাদা লেখা দেওয়া যায়।'], ['Announcement bar: add messages with dates; two or more take turns.','ঘোষণার বার: তারিখসহ মেসেজ দিন; দুই বা বেশি হলে পালা করে দেখায়।']],
  footer:[['Drag columns to reorder; drag links between columns.','কলাম টেনে ক্রম বদলান; লিংক এক কলাম থেকে আরেক কলামে টেনে নিন।'], ['Add social networks and payment marks from the list, or upload your own icon.','তালিকা থেকে সোশ্যাল নেটওয়ার্ক আর পেমেন্ট চিহ্ন যোগ করুন, বা নিজের আইকন আপলোড করুন।'], ['Remove only switches a thing off — it waits under "Removed" to be restored.','সরান চাপলে শুধু বন্ধ হয় — "সরানো" তালিকায় থাকে, ফেরানো যায়।']],
  cats:[['Rename a category — its address and product links never change.','ক্যাটাগরির নাম বদলান — ঠিকানা আর প্রোডাক্টের লিংক কখনো বদলায় না।'], ['"Not listed" takes it out of menus and search; the page stays open.','"তালিকায় নেই" দিলে মেনু আর সার্চ থেকে সরে; পেজ খোলা থাকে।'], ['Open "Intro, picture, SEO" for the text under the title, the home tile picture and Google words.','"পরিচিতি, ছবি, SEO" খুলে শিরোনামের নিচের লেখা, হোমের টাইলের ছবি আর Google-এর লেখা দিন।']],
  pdp:[['Drag the blocks into the order you want, inside each column.','প্রতিটা কলামের ভেতরে ব্লক টেনে পছন্দের ক্রমে সাজান।'], ['Use Phone / Tablet / Desktop to show a block only where it helps.','ফোন / ট্যাবলেট / ডেস্কটপ দিয়ে ব্লক শুধু দরকারি জায়গায় দেখান।'], ['The buy buttons are locked in the first screen — a move that breaks this is stopped with a message.','কেনার বাটন প্রথম স্ক্রিনে লক করা — এটা ভাঙে এমন সরানো থামিয়ে মেসেজ দেখায়।']],
  pages:[['Pick a page or make a new one.','একটা পেজ বাছুন বা নতুন বানান।'], ['Edit the blocks: heading, paragraph, list, picture, callout, button. {insideHours} and friends fill in from your settings.','ব্লক বদলান: শিরোনাম, অনুচ্ছেদ, তালিকা, ছবি, বক্স, বাটন। {insideHours} এর মতো লেখা সেটিংস থেকে বসে।'], ['Give it Google words (SEO), preview, Publish. Link it from the footer.','Google-এর লেখা (SEO) দিন, প্রিভিউ দেখে প্রকাশ করুন। ফুটারে লিংক দিন।']],
  theme:[['Pick a colour with the colour box or type a code like #1F4E46.','রঙের বাক্স থেকে রং বাছুন বা #1F4E46 এর মতো কোড লিখুন।'], ['Watch the contrast table — red rows block publishing.','কনট্রাস্ট টেবিল দেখুন — লাল সারি থাকলে প্রকাশ বন্ধ।'], ['Fonts, corners and spacing come from a safe short list.','ফন্ট, কোনা আর ফাঁকা জায়গা নিরাপদ ছোট তালিকা থেকে।']]
};
/* the small picture in each how-to: a phone and a desktop with the edited part in the brand colour */
function sbPic(area){
  var hi = 'var(--brand)', lo = 'var(--line)', box = function(x, y, w, h, on){ return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="2" fill="'+(on?hi:lo)+'"'+(on?'':' opacity=".9"')+'/>'; };
  var ph = '<rect x="8" y="6" width="58" height="104" rx="9" fill="none" stroke="currentColor" stroke-width="1.5"/>', dk = '<rect x="84" y="14" width="150" height="90" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"/>';
  var on = function(k){ return area===k; };
  var m = box(14, 14, 46, 5, on('header'))+box(14, 22, 46, 6, on('header')||on('menus'))+box(14, 32, 46, 28, on('pdp')||on('theme'))+box(14, 64, 46, 22, on('pages')||on('cats')||on('theme'))+box(14, 90, 46, 9, on('footer'))+box(14, 101, 46, 5, on('menus'));
  var d = box(90, 20, 138, 5, on('header'))+box(90, 28, 138, 8, on('header')||on('menus'))+box(90, 40, 66, 38, on('pdp')||on('theme'))+box(160, 40, 68, 38, on('pdp')||on('cats')||on('pages'))+box(90, 82, 138, 16, on('footer'));
  return '<svg class="sb-pic" viewBox="0 0 242 116" width="242" height="116" role="img" aria-label="'+sbE(['Where this part sits on a phone and a desktop','ফোন আর ডেস্কটপে এই অংশ কোথায়'])+'">'+ph+m+dk+d+'</svg>';
}
function sbHowTo(area){
  var st = SB_HOWTO[area]; if(!st) return '';
  return '<details class="sb-howto card"'+(UI.sbHowClosed ? '' : ' open')+'><summary>'+ico('info',16)+sbE(['How to','কীভাবে করবেন'])+'</summary><div class="sb-howb">'+sbPic(area)+'<ol>'+st.map(function(x){ return '<li>'+sbE(x)+'</li>'; }).join('')+
    '<li>'+sbE(['Nothing changes on the shop until you press Publish. Undo and Versions bring anything back.','প্রকাশ না চাপা পর্যন্ত দোকানে কিছুই বদলায় না। Undo আর ভার্সন দিয়ে সব ফেরানো যায়।'])+'</li></ol>'+
    '<a class="xs" href="#/admin/manual?q='+encodeURIComponent(area)+'">'+ico('doc',13)+sbE(['More in the Site manual','আরও আছে সাইট ম্যানুয়ালে'])+'</a></div></details>';
}
/* what each preview shows */
function sbPvTarget(area){
  var firstCat = (DB.categories||[]).filter(function(c){ return !c.unlisted && productsIn(c.id).length; })[0];
  switch(area){
    case 'menus': return {hash:'#/', open:{phone:'menu', tablet:'menu', desk:'mega:'+(firstCat ? firstCat.id : 'new')}};
    case 'footer': return {hash:'#/', open:{phone:'footer', tablet:'footer', desk:'footer'}};
    case 'cats': return {hash:'#/c/'+(firstCat ? firstCat.id : 'new'), open:{}};
    case 'pdp': return {hash:'#/p/essential-pique-polo', open:{}};
    case 'pages': return {hash:'#/page/'+(UI.sbPage || 'faq'), open:{}};
    default: return {hash:'#/', open:{}};
  }
}
function sbPreviewHTML(area){
  if(!UI.sbPv || area==='status') return '';
  var t = sbPvTarget(area);
  return '<section class="sb-pv card" aria-label="'+sbE(['Preview of the draft','খসড়ার প্রিভিউ'])+'"><div class="sb-cardh"><h2 class="h3">'+ico('eye',17)+sbE(['Preview of the draft','খসড়ার প্রিভিউ'])+'</h2>'+
    '<button type="button" class="btn btn-sm btn-ghost" data-act="sb-x" data-a="pvr">'+ico('swap',15)+sbE(['Refresh','রিফ্রেশ'])+'</button></div>'+
    '<p class="xs muted">'+sbE(['The real shop with your draft, at three sizes ({h}). Customers still see the live version.','আপনার খসড়াসহ আসল দোকান, তিন মাপে ({h})। কাস্টমার এখনো লাইভ ভার্সনই দেখছে।'], {h:t.hash})+' <span id="sb-tapres">'+sbTapLine(area)+'</span></p>'+
    '<div class="sb-frames">'+SB_CFG.previewW.map(function(w){ return '<figure class="sb-fr sb-fr-'+w[2]+'"><figcaption class="xs">'+sbE(w[2]==='phone' ? ['Phone 393','ফোন ৩৯৩'] : (w[2]==='tablet' ? ['Tablet 820','ট্যাবলেট ৮২০'] : ['Desktop 1366','ডেস্কটপ ১৩৬৬']))+'</figcaption><div class="sb-frbox" data-dev="'+w[2]+'"><iframe title="'+esc(w[2])+' preview" loading="lazy" tabindex="-1"></iframe></div></figure>'; }).join('')+'</div></section>';
}
function sbBootFrames(){
  var area = sbTabArea(CUR.query && CUR.query.tab); if(area==='status') return;
  var t = sbPvTarget(area), areas = {}; areas[area] = sbCur(area);
  SB_TAP[area] = null;
  SB_CFG.previewW.forEach(function(w){
    var el = document.querySelector('.sb-frbox[data-dev="'+w[2]+'"]'); if(!el) return;
    sbFrameBoot(el, w[0], w[1], {areas:areas, hash:t.hash, open:t.open[w[2]] || '', tap:w[2]==='phone', area:area, theme:ST.theme, lang:ST.lang});
  });
}

/* =====================================================================
   10. STATUS PAGE — "What can change · কী কী বদলানো যায়"
   Every part of the site, where to edit it, and the short locked list
   (owner 21:33: lock only what would break layout, conversion or payment
   safety — each with its reason).
   ===================================================================== */
var SB_STATUS = [
  [['Announcement bar','ঘোষণার বার'], ['Messages, Bengali text, links, dates, colours, turns','মেসেজ, বাংলা লেখা, লিংক, তারিখ, রং, পালা করে দেখানো'], '#/admin/site?tab=header'],
  [['Logo and slogan','লোগো আর স্লোগান'], ['Text or picture, phone version, heights; one slogan for header and footer','লেখা বা ছবি, ফোনের লোগো, উচ্চতা; হেডার-ফুটারে একটা স্লোগান'], '#/admin/site?tab=header'],
  [['Header icons','হেডারের আইকন'], ['On/off and order (WhatsApp, search, heart, account)','চালু/বন্ধ আর ক্রম (WhatsApp, সার্চ, হার্ট, অ্যাকাউন্ট)'], '#/admin/site?tab=header'],
  [['Menus (desktop row, mega menu, phone menu)','মেনু (ডেস্কটপ সারি, মেগা মেনু, ফোন মেনু)'], ['Add, rename, reorder, hide, own links, columns, featured tile, phone/desktop','যোগ, নাম বদল, ক্রম, লুকানো, নিজের লিংক, কলাম, ফিচার্ড টাইল, ফোন/ডেস্কটপ'], '#/admin/site?tab=menus'],
  [['Phone bottom bar','ফোনের নিচের বার'], ['Items, names, icons, order, on/off (3–5 items)','আইটেম, নাম, আইকন, ক্রম, চালু/বন্ধ (৩–৫টা)'], '#/admin/site?tab=menus'],
  [['Footer','ফুটার'], ['Promises, newsletter, columns and links (drag), contact, social, payment marks, bottom line','প্রতিশ্রুতি, নিউজলেটার, কলাম আর লিংক (টেনে), যোগাযোগ, সোশ্যাল, পেমেন্ট চিহ্ন, নিচের লাইন'], '#/admin/site?tab=footer'],
  [['Categories and sub-categories','ক্যাটাগরি আর সাব-ক্যাটাগরি'], ['Create, rename, reorder, in menus or not, not listed, intro, picture, SEO','বানানো, নাম বদল, ক্রম, মেনুতে কি না, তালিকায় নেই, পরিচিতি, ছবি, SEO'], '#/admin/site?tab=cats'],
  [['Home and category page sections','হোম আর ক্যাটাগরি পেজের সেকশন'], ['Add, move, hide, dates, phone/desktop, new offers','যোগ, সরানো, লুকানো, তারিখ, ফোন/ডেস্কটপ, নতুন অফার'], '#/admin/layout'],
  [['Side canvas (desktop gutters)','দুই পাশের জায়গা (ডেস্কটপ)'], ['Zones, banners, ads, animations, master switch','জোন, ব্যানার, বিজ্ঞাপন, অ্যানিমেশন, মূল সুইচ'], '#/admin/side-canvas'],
  [['Product page','প্রোডাক্ট পেজ'], ['Order and phone/tablet/desktop of every block','প্রতিটা ব্লকের ক্রম আর ফোন/ট্যাবলেট/ডেস্কটপ'], '#/admin/site?tab=pdp'],
  [['Products, colours, sizes, stock, photos','প্রোডাক্ট, রং, সাইজ, স্টক, ছবি'], ['Everything about each product','প্রতিটা প্রোডাক্টের সব কিছু'], '#/admin/products'],
  [['Product names and links','প্রোডাক্টের নাম আর লিংক'], ['Name pattern, brand line, old links forwarded','নামের ধরন, ব্র্যান্ড লাইন, পুরনো লিংক ফরোয়ার্ড'], '#/admin/naming'],
  [['Content pages','লেখার পেজ'], ['Help, delivery, exchange, payment, privacy, terms, story, careers, contact words, new pages','সাহায্য, ডেলিভারি, এক্সচেঞ্জ, পেমেন্ট, প্রাইভেসি, শর্তাবলি, গল্প, চাকরি, যোগাযোগের লেখা, নতুন পেজ'], '#/admin/site?tab=pages'],
  [['Blog (Journal)','ব্লগ (জার্নাল)'], ['Posts, categories, tags, authors, house ads','লেখা, ক্যাটাগরি, ট্যাগ, লেখক, নিজের বিজ্ঞাপন'], '#/admin/blog'],
  [['Theme','থিম'], ['Colours, fonts, corners, spacing (with contrast check)','রং, ফন্ট, কোনা, ফাঁকা জায়গা (কনট্রাস্ট চেকসহ)'], '#/admin/site?tab=theme'],
  [['Delivery, exchange, COD and other rules','ডেলিভারি, এক্সচেঞ্জ, COD আর অন্য নিয়ম'], ['Charges, hours, windows, texts — every page reads them','চার্জ, ঘণ্টা, সময়সীমা, লেখা — সব পেজ এগুলো পড়ে'], '#/admin/rules'],
  [['Shop details, checkout words and fields','দোকানের তথ্য, চেকআউটের লেখা আর ঘর'], ['Numbers, hours, offer ticks, checkout texts, fields on/off and order','নম্বর, সময়, অফারের টিক, চেকআউটের লেখা, ঘর চালু/বন্ধ আর ক্রম'], '#/admin/settings'],
  [['Combos and sets','কম্বো আর সেট'], ['Ready sets, auto colour pairs, build-your-own rules','তৈরি সেট, অটো রঙের জোড়া, নিজের সেটের নিয়ম'], '#/admin/combos'],
  [['Size charts','সাইজ চার্ট'], ['Every chart and its measurements','প্রতিটা চার্ট আর মাপ'], '#/admin/size-charts'],
  [['Landing pages for ads','বিজ্ঞাপনের ল্যান্ডিং পেজ'], ['Templates, offers, texts','টেমপ্লেট, অফার, লেখা'], '#/admin/landing']
];
var SB_LOCKED = [
  [['Checkout payment steps','চেকআউটের পেমেন্টের ধাপ'], ['Choosing a payment, paying through bKash / Nagad / card and confirming the order are tested flows tied to the payment companies. A change here could take money and lose the order. (Checkout words, fields on/off and field order are editable in Settings.)','পেমেন্ট বাছাই, bKash / Nagad / কার্ডে টাকা দেওয়া আর অর্ডার কনফার্ম — এগুলো পেমেন্ট কোম্পানির সাথে পরীক্ষা করা ধাপ। এখানে বদল হলে টাকা কাটতে পারে অথচ অর্ডার হারাতে পারে। (চেকআউটের লেখা, ঘর চালু/বন্ধ আর ঘরের ক্রম সেটিংসে বদলানো যায়।)']],
  [['Buy buttons on the product page','প্রোডাক্ট পেজের কেনার বাটন'], ['Always shown and always in the first screen (rule D-053). Every sale starts here.','সবসময় দেখায় আর প্রথম স্ক্রিনেই থাকে (নিয়ম D-053)। প্রতিটা বিক্রি এখান থেকেই শুরু।']],
  [['The bag icon in the header','হেডারের ব্যাগ আইকন'], ['It can move, but not disappear — a shopper must always reach the bag.','সরানো যায়, কিন্তু লুকানো যায় না — কাস্টমার যেন সবসময় ব্যাগে যেতে পারে।']],
  [['Legal minimum','আইনের ন্যূনতম'], ['Privacy and Terms pages stay published (every word is editable); trade licence and DBID show in the footer once they are set.','প্রাইভেসি আর শর্তাবলি পেজ সবসময় প্রকাশিত থাকে (প্রতিটা শব্দ বদলানো যায়); ট্রেড লাইসেন্স আর DBID দেওয়া থাকলে ফুটারে দেখায়।']],
  [['Free pixel dragging','পিক্সেল ধরে ইচ্ছামতো টানা'], ['Blocks snap to the shop\'s grid (lists, set widths). Free positions look right on one screen and break on phones.','ব্লক দোকানের গ্রিডে বসে (তালিকা, নির্দিষ্ট চওড়া)। ইচ্ছামতো জায়গা এক স্ক্রিনে ঠিক দেখায়, ফোনে ভেঙে যায়।']],
  [['Hard-to-read colours and tiny buttons','পড়তে কষ্ট এমন রং আর ছোট বাটন'], ['Publishing stops below 4.5:1 contrast or 44 px taps — the shop must work in sunlight and for every thumb.','কনট্রাস্ট 4.5:1-এর কম বা চাপার জায়গা ৪৪ px-এর কম হলে প্রকাশ বন্ধ — রোদেও আর সবার আঙুলেই দোকান চলবে।']]
];
function sbStatusHTML(){
  var rows = SB_STATUS.map(function(r){ return '<tr><td><b>'+sbE(r[0])+'</b></td><td>'+sbE(r[1])+'</td><td><a class="btn btn-sm btn-secondary" href="'+r[2]+'">'+ico('edit',14)+sbE(['Edit','বদলান'])+'</a></td></tr>'; }).join('');
  var lk = SB_LOCKED.map(function(r){ return '<li><b>'+ico('lock',14)+sbE(r[0])+'</b><span>'+sbE(r[1])+'</span></li>'; }).join('');
  return sbCard(['What can change · কী কী বদলানো যায়','কী কী বদলানো যায়'], '<div class="tbl-wrap"><table class="tbl sb-status"><thead><tr><th>'+sbE(['Part of the site','সাইটের অংশ'])+'</th><th>'+sbE(['What you can change','কী বদলানো যায়'])+'</th><th>'+sbE(['Where','কোথায়'])+'</th></tr></thead><tbody>'+rows+'</tbody></table></div>',
      {icon:'info', lead:['Everything below is yours to change from this backend — no coder needed. Every change is a draft first, with a preview, and can be undone.','নিচের সব কিছু এই ব্যাকএন্ড থেকেই বদলানো যায় — কোডার লাগবে না। প্রতিটা বদল আগে খসড়া হয়, প্রিভিউ দেখা যায়, আর ফেরানো যায়।']})+
    sbCard(['Locked on purpose (and why)','ইচ্ছা করে লক করা (আর কেন)'], '<ul class="sb-locked">'+lk+'</ul>', {icon:'lock', lead:['Only what would break the layout, sales or payment safety is locked.','শুধু যা লেআউট, বিক্রি বা পেমেন্টের নিরাপত্তা ভাঙতে পারে সেটাই লক করা।']});
}

/* =====================================================================
   11. THE ADMIN PAGE  #/admin/site?tab=…
   ===================================================================== */
var SB_ED = {menus:sbMenusEd, header:sbHeaderEd, footer:sbFooterEd, cats:sbCatsEd, pdp:sbPdpEd, pages:sbPagesEd, theme:sbThemeEd};
PAGES['sb-admin'] = {
  layout:'admin',
  title:function(){ return sbT(['Site builder','সাইট বিল্ডার']); },
  render:function(params, q){
    var tab = sbTabArea(q && q.tab), err = UI.sbErr && UI.sbErr.area===tab ? UI.sbErr.list : null;
    if(!(UI.sbBlocked && tab==='pdp')) UI.sbBlocked = tab==='pdp' ? UI.sbBlocked : null;
    var tabs = '<nav class="sb-tabs" role="tablist" aria-label="'+sbE(['Parts of the site','সাইটের অংশ'])+'">'+SB_TABS.map(function(t){ var on = t[0]===tab, dr = SB_AREAS.indexOf(t[0])>=0 && sbHasDraft(t[0]);
      return '<a class="chip'+(on?' on':'')+'" role="tab" aria-selected="'+on+'" href="#/admin/site?tab='+t[0]+'">'+ico(t[2],14)+sbE(t[1])+(dr ? '<span class="sb-dot" title="'+sbE(['Draft waiting','খসড়া অপেক্ষায়'])+'"></span>' : '')+'</a>'; }).join('')+'</nav>';
    var body = '';
    try{ body = tab==='status' ? sbStatusHTML() : SB_ED[tab](); }catch(e){ console.error(e); body = '<div class="sb-err">'+esc(e.message)+'</div>'; }
    return '<div class="sb-adm" data-tab="'+tab+'">'+
      '<div class="sb-hd"><div><h1 class="h1">'+sbE(['Site builder','সাইট বিল্ডার'])+'</h1><p class="small text2">'+sbE(['Change menus, header, footer, categories, product page, pages and theme. Draft → preview → publish; every publish can be undone.','মেনু, হেডার, ফুটার, ক্যাটাগরি, প্রোডাক্ট পেজ, পেজ আর থিম বদলান। খসড়া → প্রিভিউ → প্রকাশ; প্রতিটা প্রকাশ ফেরানো যায়।'])+'</p></div>'+
        '<a class="btn btn-sm btn-ghost" href="#/admin/manual">'+ico('doc',15)+sbE(['Site manual','সাইট ম্যানুয়াল'])+'</a></div>'+
      tabs+sbFlowHTML(tab)+
      (err ? '<div class="sb-err" role="alert"><b>'+sbE(['Not published. Please fix:','প্রকাশ হয়নি। ঠিক করুন:'])+'</b><ul>'+err.map(function(x){ return '<li>'+esc(x)+'</li>'; }).join('')+'</ul></div>' : '')+
      sbHowTo(tab)+sbHistHTML(tab)+body+sbPreviewHTML(tab)+'</div>';
  },
  after:function(){ if(UI.sbPv) setTimeout(sbBootFrames, 40); var h = document.querySelector('.sb-howto'); if(h) h.addEventListener('toggle', function(){ UI.sbHowClosed = !h.open; }); }
};

/* =====================================================================
   12. SITE MANUAL  #/admin/manual — for a new owner taking over
   The outline is every admin page of this build (ROUTES); each has its own
   plain-language section. A page without a section still gets a line (so
   the manual can never miss an area). review/USER-MANUAL.md is made from
   this same text (sbManualMD).
   ===================================================================== */
var SB_MAN = [
  {id:'start', t:['Start here: running the shop from this backend','এখান থেকে শুরু: এই ব্যাকএন্ড দিয়ে দোকান চালানো'], what:['Everything a customer sees — and every rule behind it — is set in this backend. No code is needed. The sidebar groups the pages: daily work (orders, customers, couriers), the shop window (products, combos, Site builder, Page layout, blog), money and marketing (rules, ads, analytics) and the system (settings, backup, audit, health, AI agents).','কাস্টমার যা দেখে আর তার পেছনের সব নিয়ম এই ব্যাকএন্ডেই ঠিক হয়। কোনো কোড লাগে না। সাইডবারে পেজগুলো ভাগ করা: রোজের কাজ (অর্ডার, কাস্টমার, কুরিয়ার), দোকানের সাজ (প্রোডাক্ট, কম্বো, সাইট বিল্ডার, পেজ সাজান, ব্লগ), টাকা আর মার্কেটিং (নিয়ম, বিজ্ঞাপন, অ্যানালিটিক্স) আর সিস্টেম (সেটিংস, ব্যাকআপ, অডিট, হেলথ, AI এজেন্ট)।'],
    steps:[['Switch the backend language at the top of the sidebar (English | বাংলা).','সাইডবারের উপরে ব্যাকএন্ডের ভাষা বদলান (English | বাংলা)।'], ['Look changes (menus, footer, pages, theme) are drafts until you press Publish; check the preview first.','দেখতে কেমন তার বদল (মেনু, ফুটার, পেজ, থিম) প্রকাশ না চাপা পর্যন্ত খসড়া; আগে প্রিভিউ দেখুন।'], ['Before a big change, save a snapshot in Settings (Launch default and snapshots). One button brings the whole look back.','বড় বদলের আগে সেটিংসে স্ন্যাপশট রাখুন (লঞ্চ ডিফল্ট আর স্ন্যাপশট)। এক বোতামে পুরো লুক ফেরে।']]},
  {id:'handover', t:['Handing the shop to a new owner','নতুন মালিকের হাতে দোকান দেওয়া'], what:['The shop is built so that a new owner can take over without a programmer. Every default is data; the old owner\'s personal data never ships to another installation.','দোকানটা এমনভাবে বানানো যে প্রোগ্রামার ছাড়াই নতুন মালিক চালাতে পারেন। প্রতিটা ডিফল্ট ডেটা; পুরনো মালিকের ব্যক্তিগত তথ্য অন্য ইনস্টলেশনে যায় না।'],
    steps:[['Settings: change the shop name, numbers, address, trade licence, payment accounts.','সেটিংস: দোকানের নাম, নম্বর, ঠিকানা, ট্রেড লাইসেন্স, পেমেন্ট অ্যাকাউন্ট বদলান।'], ['Site builder › Header: logo and slogan; › Footer: links, social, payment marks; › Theme: colours.','সাইট বিল্ডার › হেডার: লোগো আর স্লোগান; › ফুটার: লিংক, সোশ্যাল, পেমেন্ট চিহ্ন; › থিম: রং।'], ['Backup: connect the new Google Drive and run a restore drill.','ব্যাকআপ: নতুন Google Drive যুক্ত করে একবার রিস্টোর ড্রিল চালান।'], ['AI agents: check each agent\'s spend cap and permissions.','AI এজেন্ট: প্রতিটা এজেন্টের খরচের সীমা আর অনুমতি দেখে নিন।']]},
  {id:'site', route:'#/admin/site', t:['Site builder','সাইট বিল্ডার'], what:['Menus, header, footer, categories, product page blocks, content pages and theme. Each tab: edit → preview on phone 393, tablet 820, desktop 1366 → Publish. Versions and Undo keep every change reversible. The "What can change" tab lists every part of the site and what is locked on purpose.','মেনু, হেডার, ফুটার, ক্যাটাগরি, প্রোডাক্ট পেজের ব্লক, লেখার পেজ আর থিম। প্রতিটা ট্যাবে: বদলান → ফোন ৩৯৩, ট্যাবলেট ৮২০, ডেস্কটপ ১৩৬৬-এ প্রিভিউ → প্রকাশ। ভার্সন আর Undo দিয়ে সব বদল ফেরানো যায়। "কী কী বদলানো যায়" ট্যাবে সাইটের প্রতিটা অংশ আর কী ইচ্ছা করে লক করা তা আছে।'],
    steps:[['Menus: rename (the header, mega menu and phone menu change together), hide, reorder by dragging or arrows, add your own links and mega-menu columns, set the phone bottom bar (3–5 items).','মেনু: নাম বদলান (হেডার, মেগা মেনু আর ফোন মেনু একসাথে বদলায়), লুকান, টেনে বা তীরে ক্রম বদলান, নিজের লিংক আর মেগা মেনুর কলাম যোগ করুন, ফোনের নিচের বার ঠিক করুন (৩–৫টা)।'], ['Header: logo text or picture (with a phone version), the shared slogan, announcement messages with dates.','হেডার: লোগোর লেখা বা ছবি (ফোনের আলাদা), সবার একটা স্লোগান, তারিখসহ ঘোষণা।'], ['Footer: drag columns and links, add social networks and payment marks or upload your own.','ফুটার: কলাম আর লিংক টেনে সাজান, সোশ্যাল নেটওয়ার্ক আর পেমেন্ট চিহ্ন যোগ করুন বা নিজেরটা আপলোড করুন।'], ['Categories: rename, reorder, "Not listed" (page stays open), intro, tile picture, SEO.','ক্যাটাগরি: নাম বদল, ক্রম, "তালিকায় নেই" (পেজ খোলা থাকে), পরিচিতি, টাইলের ছবি, SEO।'], ['Product page: order and devices of every block; the buy buttons stay in the first screen.','প্রোডাক্ট পেজ: প্রতিটা ব্লকের ক্রম আর ডিভাইস; কেনার বাটন প্রথম স্ক্রিনেই থাকে।'], ['Pages: blocks, FAQ, address, SEO; numbers like {insideHours} come from your settings.','পেজ: ব্লক, প্রশ্ন-উত্তর, ঠিকানা, SEO; {insideHours} এর মতো সংখ্যা সেটিংস থেকে আসে।'], ['Theme: colours, fonts, corners, spacing — red contrast rows block publishing.','থিম: রং, ফন্ট, কোনা, ফাঁকা জায়গা — লাল কনট্রাস্ট সারি থাকলে প্রকাশ বন্ধ।']]},
  {id:'layout', route:'#/admin/layout', t:['Page layout (home and category sections)','পেজ সাজান (হোম আর ক্যাটাগরির সেকশন)'], what:['Add, move, hide and date the sections of the home page and every category page: banners, offer strips, product rows, combo rows, category tiles, reviews, journal, text.','হোম পেজ আর প্রতিটা ক্যাটাগরি পেজের সেকশন যোগ, সরানো, লুকানো আর তারিখ দেওয়া: ব্যানার, অফারের সারি, প্রোডাক্টের সারি, কম্বোর সারি, ক্যাটাগরি টাইল, রিভিউ, জার্নাল, লেখা।'], steps:[['Pick the page, press "Add section", choose a type, set dates and phone/desktop.','পেজ বাছুন, "সেকশন যোগ" চাপুন, ধরন বাছুন, তারিখ আর ফোন/ডেস্কটপ দিন।']]},
  {id:'side', route:'#/admin/side-canvas', t:['Side canvas (desktop gutters)','দুই পাশের জায়গা (ডেস্কটপ)'], what:['Banners, ads, popups and animations in the empty left and right space of wide desktop screens. Off until you switch it on; phones never load it.','চওড়া ডেস্কটপের বাম-ডানের ফাঁকা জায়গায় ব্যানার, বিজ্ঞাপন, পপআপ আর অ্যানিমেশন। আপনি চালু না করা পর্যন্ত বন্ধ; ফোনে কখনো লোড হয় না।']},
  {id:'orders', route:'#/admin/orders', t:['Orders','অর্ডার'], what:['Every order with its status, flags (duplicate, risk, address), courier and timeline. Confirm, pack, ship and follow up from here.','প্রতিটা অর্ডার — স্ট্যাটাস, ফ্ল্যাগ (ডুপ্লিকেট, ঝুঁকি, ঠিকানা), কুরিয়ার আর টাইমলাইনসহ। এখান থেকে কনফার্ম, প্যাক, পাঠানো আর ফলো-আপ।']},
  {id:'rules', route:'#/admin/rules', t:['Smart Rules','স্মার্ট রুলস'], what:['Delivery charges and hours, free delivery, exchange window, festive cut-off and the texts built from them. Every page and message reads these numbers — change them once here.','ডেলিভারি চার্জ আর ঘণ্টা, ফ্রি ডেলিভারি, এক্সচেঞ্জের সময়, উৎসবের কাট-অফ আর সেগুলো থেকে তৈরি লেখা। সব পেজ আর মেসেজ এই সংখ্যা পড়ে — এখানে একবার বদলালেই হয়।']},
  {id:'charts', route:'#/admin/size-charts', t:['Size charts','সাইজ চার্ট'], what:['The measurements behind "Find my size" and every size chart.','"আমার সাইজ" আর প্রতিটা সাইজ চার্টের মাপ।']},
  {id:'products', route:'#/admin/products', t:['Products','প্রোডাক্ট'], what:['Names, prices, colours, sizes, stock, photos, category and sub-category, combo use. A product link never changes when it is renamed.','নাম, দাম, রং, সাইজ, স্টক, ছবি, ক্যাটাগরি আর সাব-ক্যাটাগরি, কম্বোতে ব্যবহার। নাম বদলালেও প্রোডাক্টের লিংক বদলায় না।']},
  {id:'naming', route:'#/admin/naming', t:['Naming and links','নাম আর লিংক'], what:['The naming pattern, brand line, and forwarding of old links after a rename.','নামের ধরন, ব্র্যান্ড লাইন আর নাম বদলের পর পুরনো লিংক ফরোয়ার্ড।']},
  {id:'combos', route:'#/admin/combos', t:['Combos and sets','কম্বো আর সেট'], what:['Ready-made sets, automatic colour-pair combos and build-your-own-set price rules.','তৈরি সেট, অটো রঙের জোড়া কম্বো আর নিজের সেটের দামের নিয়ম।']},
  {id:'reviews', route:'#/admin/reviews', t:['Reviews','রিভিউ'], what:['Approve, hide and answer customer reviews and photos.','কাস্টমারের রিভিউ আর ছবি অনুমোদন, লুকানো আর উত্তর।']},
  {id:'landing', route:'#/admin/landing', t:['Landing pages','ল্যান্ডিং পেজ'], what:['One-product pages for ads, from templates, with their own offer and order form.','বিজ্ঞাপনের জন্য এক-প্রোডাক্টের পেজ, টেমপ্লেট থেকে, নিজের অফার আর অর্ডার ফর্মসহ।']},
  {id:'customers', route:'#/admin/customers', t:['Customers and CRM','কাস্টমার আর CRM'], what:['Customer list, history, tiers, messages and follow-ups.','কাস্টমারের তালিকা, ইতিহাস, স্তর, মেসেজ আর ফলো-আপ।']},
  {id:'couriers', route:'#/admin/couriers', t:['Couriers','কুরিয়ার'], what:['Courier accounts, areas and bands, booking and tracking.','কুরিয়ার অ্যাকাউন্ট, এলাকা আর ব্যান্ড, বুকিং আর ট্র্যাকিং।']},
  {id:'ads', route:'#/admin/ads', t:['Ads and tracking','বিজ্ঞাপন আর ট্র্যাকিং'], what:['Ad platforms, tracking events and the guardrails for paid ads (budgets never rise without your approval).','বিজ্ঞাপনের প্ল্যাটফর্ম, ট্র্যাকিং ইভেন্ট আর পেইড বিজ্ঞাপনের সীমা (আপনার অনুমতি ছাড়া বাজেট কখনো বাড়ে না)।']},
  {id:'analytics', route:'#/admin/analytics', t:['Analytics','অ্যানালিটিক্স'], what:['What shoppers search, tap and buy; WhatsApp taps by page; bag to purchase.','কাস্টমার কী খোঁজে, কোথায় চাপে, কী কেনে; পেজ অনুযায়ী WhatsApp চাপ; ব্যাগ থেকে কেনা।']},
  {id:'blog', route:'#/admin/blog', t:['Blog and SEO','ব্লগ আর SEO'], what:['Journal posts, categories, tags, authors, house ads and SEO checks.','জার্নালের লেখা, ক্যাটাগরি, ট্যাগ, লেখক, নিজের বিজ্ঞাপন আর SEO চেক।']},
  {id:'ai', route:'#/admin/ai', t:['AI and agents','AI আর এজেন্ট'], what:['The AI master switch, models, spend caps and the media library. The shop works with AI off.','AI-এর মূল সুইচ, মডেল, খরচের সীমা আর মিডিয়া লাইব্রেরি। AI বন্ধ থাকলেও দোকান চলে।']},
  {id:'agents', route:'#/admin/agents', t:['AI agents (the team)','AI এজেন্ট (টিম)'], what:['The seven agents, their duties, permissions, reports and the chief who routes your requests.','সাতজন এজেন্ট, তাদের কাজ, অনুমতি, রিপোর্ট আর প্রধান এজেন্ট যিনি আপনার অনুরোধ ভাগ করেন।']},
  {id:'settings', route:'#/admin/settings', t:['Settings','সেটিংস'], what:['Shop details, delivery bands, checkout words and fields, offer ticks, trial at the door, invoice words — and the Launch default and snapshots for the whole look.','দোকানের তথ্য, ডেলিভারি ব্যান্ড, চেকআউটের লেখা আর ঘর, অফারের টিক, দরজায় ট্রায়াল, ইনভয়েসের লেখা — আর পুরো লুকের লঞ্চ ডিফল্ট ও স্ন্যাপশট।']},
  {id:'backup', route:'#/admin/backup', t:['Backup','ব্যাকআপ'], what:['Nightly encrypted backup to Google Drive, retention and restore (staging first).','প্রতি রাতে Google Drive-এ এনক্রিপ্টেড ব্যাকআপ, কতদিন রাখা হবে আর রিস্টোর (আগে স্টেজিং)।']},
  {id:'audit', route:'#/admin/audit', t:['Site audit','সাইট অডিট'], what:['The weekly checklist run over the whole shop, with fixes proposed for your approval.','পুরো দোকানে সাপ্তাহিক চেকলিস্ট, ঠিক করার প্রস্তাব আপনার অনুমোদনের জন্য।']},
  {id:'health', route:'#/admin/health', t:['Server health','সার্ভার হেলথ'], what:['Speed, memory, disk and alerts to Telegram.','গতি, মেমরি, ডিস্ক আর টেলিগ্রামে সতর্কবার্তা।']},
  {id:'register', route:'#/admin/register', t:['PR register and documents','PR রেজিস্টার আর ডকুমেন্ট'], what:['The full list of planned and built features (PRs) and the blueprint documents, including this manual.','পরিকল্পিত আর তৈরি সব ফিচারের (PR) তালিকা আর ব্লুপ্রিন্ট ডকুমেন্ট, এই ম্যানুয়ালসহ।']}
];
function sbManSections(){
  /* the outline: the written sections, then any admin page of this build they do not cover yet */
  var have = {}; SB_MAN.forEach(function(s){ if(s.route) have[s.route] = 1; });
  var extra = [];
  try{ ROUTES.forEach(function(r){ var src = r[0].source; if(!/^\^\\\/admin\\\/[a-z-]+\$$/.test(src)) return; var path = '#'+src.slice(1, -1).replace(/\\\//g, '/'); if(path==='#/admin/manual' || have[path]) return; have[path] = 1;
    extra.push({id:path.slice(9), route:path, t:[path.slice(9).replace(/-/g,' '), path.slice(9).replace(/-/g,' ')], what:['A backend page of this shop. Open it to see what it controls.','দোকানের একটা ব্যাকএন্ড পেজ। খুলে দেখুন কী নিয়ন্ত্রণ করে।']}); }); }catch(e){}
  return SB_MAN.concat(extra);
}
function sbManText(s){ return [sbT(s.t), sbT(s.what)].concat((s.steps||[]).map(function(x){ return sbT(x); })).join(' ').toLowerCase(); }
PAGES['sb-manual'] = {
  layout:'admin',
  title:function(){ return sbT(['Site manual','সাইট ম্যানুয়াল']); },
  render:function(params, q){
    var qv = (q && q.q) || '', secs = sbManSections();
    var toc = '<nav class="sb-mantoc" aria-label="'+sbE(['Contents','সূচি'])+'">'+secs.map(function(s){ return '<a href="#/admin/manual?s='+esc(s.id)+'" data-act="sb-mango" data-id="'+esc(s.id)+'">'+sbE(s.t)+'</a>'; }).join('')+'</nav>';
    var body = secs.map(function(s){
      return '<section class="sb-mansec card" id="man-'+esc(s.id)+'" data-text="'+esc(sbManText(s))+'"><h2 class="h2">'+sbE(s.t)+'</h2><p>'+sbE(s.what)+'</p>'+
        (s.steps ? '<ol>'+s.steps.map(function(x){ return '<li>'+sbE(x)+'</li>'; }).join('')+'</ol>' : '')+
        (s.route ? '<a class="btn btn-sm btn-secondary" href="'+s.route+'">'+ico('right',14)+sbE(['Open this page','এই পেজ খুলুন'])+'</a>' : '')+'</section>';
    }).join('');
    return '<div class="sb-adm sb-man"><div class="sb-hd"><div><h1 class="h1">'+sbE(['Site manual','সাইট ম্যানুয়াল'])+'</h1><p class="small text2">'+sbE(['How to run every part of the shop from this backend — written for a new owner taking over.','এই ব্যাকএন্ড দিয়ে দোকানের প্রতিটা অংশ কীভাবে চালাবেন — নতুন মালিকের জন্য লেখা।'])+'</p></div></div>'+
      '<div class="sb-mansearch"><label class="sr" for="sb-manq">'+sbE(['Search the manual','ম্যানুয়ালে খুঁজুন'])+'</label><input id="sb-manq" class="input" type="search" value="'+esc(qv)+'" placeholder="'+sbE(['Search: logo, delivery, backup…','খুঁজুন: লোগো, ডেলিভারি, ব্যাকআপ…'])+'" data-input="sb-manq"><span class="xs muted" id="sb-mann"></span></div>'+
      '<div class="sb-manwrap">'+toc+'<div class="sb-manbody">'+body+'<p class="sb-mannone xs muted" hidden>'+sbE(['Nothing found — try another word.','কিছু পাওয়া যায়নি — অন্য শব্দে খুঁজুন।'])+'</p></div></div></div>';
  },
  after:function(params, q){ sbManFilter((q && q.q) || ''); if(q && q.s){ var el = document.getElementById('man-'+q.s); if(el) el.scrollIntoView(); } }
};
function sbManFilter(v){
  v = String(v||'').toLowerCase().trim(); var n = 0;
  var alias = {menus:'menu', header:'logo', footer:'footer', cats:'categor', pdp:'product page', pages:'pages', theme:'theme'};
  if(alias[v]) v = alias[v];
  [].forEach.call(document.querySelectorAll('.sb-mansec'), function(s){ var hit = !v || s.getAttribute('data-text').indexOf(v) >= 0; s.hidden = !hit; if(hit) n++; });
  var c = document.getElementById('sb-mann'); if(c) c.textContent = v ? sbT(['{n} sections','{n}টা অংশ'], {n:n}) : '';
  var none = document.querySelector('.sb-mannone'); if(none) none.hidden = n > 0;
}
INPUT['sb-manq'] = function(el){ sbManFilter(el.value); };
ACT['sb-mango'] = function(el){ var s = document.getElementById('man-'+el.getAttribute('data-id')); if(s){ s.hidden = false; s.scrollIntoView({block:'start'}); } };
/* the same manual as Markdown (review/USER-MANUAL.md is written from this) */
function sbManualMD(){
  var L0 = ST.adminLang, out = [];
  try{
    ST.adminLang = 'en'; var en = sbManSections(); ST.adminLang = 'bn'; var bn = sbManSections();
    out.push('# EXTAS shop — Site manual', '', '*For the owner and for a new owner taking over. Every part of the shop is run from the backend; no code is needed. Generated from the Site manual page (#/admin/manual).*', '', '## Contents', '');
    en.forEach(function(s, i){ ST.adminLang = 'en'; out.push((i+1)+'. ['+sbT(s.t)+'](#'+s.id+')'); });
    en.forEach(function(s, i){
      ST.adminLang = 'en'; out.push('', '<a id="'+s.id+'"></a>', '## '+(i+1)+'. '+sbT(s.t), '', sbT(s.what));
      if(s.steps){ out.push(''); s.steps.forEach(function(x, k){ out.push((k+1)+'. '+sbT(x)); }); }
      if(s.route) out.push('', 'Backend page: `'+s.route+'`');
      ST.adminLang = 'bn'; out.push('', '**বাংলায় — '+sbT(s.t)+'**', '', sbT(s.what));
      if(s.steps){ out.push(''); s.steps.forEach(function(x, k){ out.push((k+1)+'. '+sbT(x)); }); }
    });
    ST.adminLang = 'en'; out.push('', '## What can change, and what is locked', '', '| Part of the site | What you can change | Where |', '|---|---|---|');
    SB_STATUS.forEach(function(r){ out.push('| '+sbT(r[0])+' | '+sbT(r[1])+' | `'+r[2]+'` |'); });
    out.push('', '**Locked on purpose:**', ''); SB_LOCKED.forEach(function(r){ out.push('- **'+sbT(r[0])+'** — '+sbT(r[1])); });
  } finally { ST.adminLang = L0; }
  return out.join('\n')+'\n';
}
