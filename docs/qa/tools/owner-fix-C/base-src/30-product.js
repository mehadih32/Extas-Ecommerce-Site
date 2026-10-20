/* ================= EXTAS demo — product page (PDP) · templates T1 Classic / T2 Editorial / T3 Fit-first ================= */

/* ---------- page-only styles (injected once; colours only via theme variables) ---------- */
var PDP_CSS = [
'.pdp-page{position:relative}',
'.pdp-tpl-T2{background:var(--surface)}',
'.pdp-top{padding-top:10px}',
'@media(min-width:1024px){.pdp-top{padding-top:18px}}',
'.pdp-crumbs{margin-bottom:10px}',
'.pdp-grid{display:grid;gap:20px;grid-template-columns:minmax(0,1fr);grid-template-areas:"g" "b" "d"}',
'.pdp-g{grid-area:g;min-width:0}.pdp-b{grid-area:b;min-width:0}.pdp-d{grid-area:d;min-width:0}',
'@media(max-width:1023px){.pdp-g{margin:0 -16px}}',
'@media(min-width:768px) and (max-width:1023px){.pdp-g{margin:0 -24px}}',
'@media(min-width:1024px){.pdp-grid{grid-template-columns:minmax(0,1.12fr) minmax(0,.88fr);grid-template-rows:auto 1fr;grid-template-areas:"g b" "d b";column-gap:56px;row-gap:36px;align-items:start}',
'  .pdp-grid.t2{grid-template-columns:minmax(0,1fr) 410px;column-gap:64px}}',
/* ---- galleries: ONE swipe engine for every template -------------------
   P1. T1 used to be a single still photo with a JavaScript gesture
   recogniser: nothing moved under the finger, and at the end of the drag the
   whole page was re-rendered. T2 was a native scroll-snap strip and felt
   right. Both are now the same native strip (.pdp-trk), so every product
   drags like the panjabi. Nothing re-renders while a finger is down. */
'.pdp-main{position:relative}',
'.pdp-trk{display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;',
'  scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain}',
'.pdp-trk::-webkit-scrollbar{display:none}',
'.pdp-trk>.pdp-tile{flex:0 0 100%;scroll-snap-align:start;position:relative;min-width:0}',
'.pdp-trk.t2{gap:4px}',
'.pdp-trk.t2>.pdp-tile{flex:0 0 86%}',
'.pdp-main .pimg{border-radius:0}',
'@media(min-width:1024px){.pdp-main .pimg{border-radius:var(--card-radius)}}',
'.pdp-thumbs{display:flex;gap:8px;overflow-x:auto;padding:10px 16px 2px;scrollbar-width:none}',
'@media(min-width:768px) and (max-width:1023px){.pdp-thumbs{padding:10px 24px 2px}}',
'.pdp-thumb{flex:0 0 60px;padding:0;border:1px solid var(--line);background:var(--surface);cursor:pointer;border-radius:var(--radius);overflow:hidden;position:relative}',
'.pdp-thumb .pimg{border-radius:0}',
'.pdp-thumb.on{border-color:var(--brand);box-shadow:0 0 0 1px var(--brand)}',
'.pdp-thumb-sun{position:absolute;top:3px;right:3px;background:var(--surface);color:var(--gold);border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center}',
'@media(min-width:1024px){.pdp-galT1.vert{display:grid;grid-template-columns:72px minmax(0,1fr);gap:12px;align-items:start}',
'  .pdp-galT1.vert .pdp-thumbs{flex-direction:column;order:-1;padding:0;overflow:visible}',
'  .pdp-galT1.vert .pdp-thumb{flex:0 0 auto;width:72px}',
'  .pdp-galT1:not(.vert) .pdp-thumbs{padding:12px 0 0;gap:10px}',
'  .pdp-galT1:not(.vert) .pdp-thumb{flex:0 0 88px}}',
'.pdp-arrow{position:absolute;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:50%;border:1px solid var(--line);background:var(--surface);color:var(--ink);display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:.94;z-index:2}',
'.pdp-arrow.l{left:10px}.pdp-arrow.r{right:10px}',
'.pdp-chip-img{position:absolute;left:10px;bottom:26px;background:var(--surface);color:var(--ink);font-size:11.5px;font-weight:600;padding:5px 10px;border-radius:20px;display:inline-flex;gap:6px;align-items:center;box-shadow:0 2px 8px rgba(0,0,0,.08);z-index:1}',
'.pdp-chip-img.tr{left:auto;right:10px;top:10px;bottom:auto}',
'.pdp-chip-img svg{color:var(--gold)}',
/* gallery T2 — the same strip, with a peek of the next photo */
'.pdp-galT2 .pimg{border-radius:0}',
'@media(min-width:1024px){.pdp-galT2{display:grid!important;grid-template-columns:1fr 1fr;gap:12px;overflow:visible}',
'  .pdp-galT2>.pdp-tile{flex:0 0 auto}.pdp-galT2 .pimg{border-radius:var(--card-radius)}',
'  .pdp-galT2w .pdp-thumbs{display:none}}',
'.pdp-flash{animation:pdpflash 1.4s ease}',
'@keyframes pdpflash{0%,60%{box-shadow:0 0 0 3px var(--brand)}100%{box-shadow:0 0 0 0 transparent}}',
/* info column */
'.pdp-b>.pdp-sec+.pdp-sec{margin-top:18px}',
'.pdp-name{margin:4px 0 4px}',
'.pdp-tpl-T2 .pdp-name{font-family:var(--font-display);font-size:32px;line-height:1.04;font-weight:var(--display-weight);letter-spacing:var(--display-track);text-transform:var(--display-case)}',
'@media(min-width:1024px){.pdp-tpl-T2 .pdp-name{font-size:46px}}',
'.pdp-lbl{font-size:13px;font-weight:600;color:var(--ink)}',
'.pdp-tpl-T2 .pdp-lbl{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}',
'.pdp-rating{background:none;border:none;padding:4px 0;display:inline-flex;gap:6px;align-items:center;cursor:pointer;color:var(--ink)}',
'.pdp-ilink{display:inline-flex;align-items:center;gap:6px}',
'.pdp-nudge{display:flex;align-items:center;gap:12px;padding:10px 12px;color:var(--ink)!important;font-size:13.5px;line-height:1.35}',
'.pdp-nudge .ic{width:32px;height:32px;border-radius:50%;background:var(--surface);display:flex;align-items:center;justify-content:center;color:var(--brand);flex-shrink:0}',
':root[data-theme="festive"] .pdp-nudge .ic{color:var(--gold)}',
'.pdp-sw{display:flex;flex-wrap:wrap;gap:12px;padding:4px 2px}',
'.pdp-sw .swatch{width:36px;height:36px}',
'.pdp-sw .swatch.so{opacity:.45}',
'.pdp-fms{display:flex;align-items:center;gap:14px;width:100%;text-align:left;background:var(--brand);color:var(--brand-ink);border:none;border-radius:var(--card-radius);padding:14px 16px;cursor:pointer;font:inherit}',
'.pdp-fms:hover{background:var(--brand-dark)}',
'.pdp-fms .ic{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;flex-shrink:0}',
'.pdp-fms .t{font-weight:700;font-size:15px}.pdp-fms .s{font-size:12.5px;opacity:.85}',
'.pdp-pills{display:flex;flex-wrap:wrap;gap:8px;padding-top:12px}',
'.pdp-pills.err .size-pill:not(.out):not(.on){border-color:var(--sale);box-shadow:0 0 0 1px var(--sale)}',
'.pdp-err{color:var(--sale);display:flex;gap:6px;align-items:center;margin-top:8px;font-weight:600}',
'.pdp-ystag{position:absolute;top:-9px;left:50%;transform:translateX(-50%);background:var(--gold-bg);color:var(--gold);font-size:11px;font-weight:700;line-height:1;padding:3px 7px;border-radius:10px;white-space:nowrap;border:1px solid var(--surface)}',
'.pdp-ystag-in{display:inline-block;background:var(--gold-bg);color:var(--gold);font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;margin-left:4px;vertical-align:middle;text-decoration:none}',
'.pdp-unit{border:1px solid var(--input);background:var(--surface);color:var(--text2);border-radius:12px;font-size:11.5px;font-weight:700;padding:3px 10px;min-height:28px;cursor:pointer;flex-shrink:0}',
'.pdp-stock{display:flex;gap:7px;align-items:center;font-size:13px;color:var(--text2)}',
'.pdp-stock.low{color:var(--warn);font-weight:600}',
'.pdp-ctas{display:flex;gap:10px}',
'.pdp-ctas .btn{flex:1 1 0}',
'.pdp-dk{display:none!important}',
'@media(min-width:1024px){.pdp-dk{display:flex!important}}',
'.pdp-tpl-T2 .pdp-ctas{flex-direction:column}',
'.pdp-trust{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12px;color:var(--text2)}',
'.pdp-trust span{display:inline-flex;gap:6px;align-items:center}',
'.pdp-box{background:var(--surface);border:1px solid var(--line);border-radius:var(--card-radius)}',
'.pdp-tpl-T2 .pdp-d .pdp-box{border-left:0;border-right:0;border-radius:0}',
'.pdp-ric{width:34px;height:34px;border-radius:50%;background:var(--brand-tint);color:var(--brand);display:flex;align-items:center;justify-content:center;flex-shrink:0}',
':root[data-theme="festive"] .pdp-ric{color:var(--gold)}',
'.pdp-acc-h{display:flex;align-items:center;justify-content:space-between;width:100%;padding:16px;min-height:52px;background:none;border:none;cursor:pointer;font-weight:600;font-size:14.5px;text-align:left;color:var(--ink)}',
'.pdp-acc+.pdp-acc{border-top:1px solid var(--line2)}',
'.pdp-acc-b{padding:0 16px 18px;line-height:1.6}',
'.pdp-acc-b ul{margin:4px 0 0;padding-left:18px}',
/* steppers & finder */
'.pdp-step{display:inline-flex;align-items:center;border:1px solid var(--input);border-radius:var(--radius);background:var(--surface)}',
'.pdp-step button{width:44px;height:44px;border:none;background:none;cursor:pointer;color:var(--ink);display:flex;align-items:center;justify-content:center;touch-action:manipulation;user-select:none;-webkit-user-select:none}',
'.pdp-step button:hover{background:var(--line2)}',
'.pdp-step output{min-width:62px;text-align:center;font-family:var(--font-display);font-weight:700;font-size:17px}',
'.pdp-res{border:1px solid var(--brand-line);background:var(--brand-tint);border-radius:var(--card-radius);padding:18px}',
'.pdp-res-size{font-family:var(--font-display);font-weight:800;font-size:52px;line-height:1;color:var(--brand)}',
':root[data-theme="festive"] .pdp-res-size{color:var(--gold)}',
'.pdp-why{list-style:none;padding:0;margin:14px 0 0;display:flex;flex-direction:column;gap:10px}',
'.pdp-why li{display:flex;gap:10px;font-size:13.5px;line-height:1.45}',
'.pdp-why li svg{flex-shrink:0;color:var(--brand);margin-top:2px}',
/* size chart modal */
'.pdp-chart td,.pdp-chart th{padding:12px 6px}',
'.pdp-chart tr.pick{cursor:pointer}',
'.pdp-chart tr.pick:hover td{background:var(--surface2)}',
'.pdp-chart tr.sel td,.pdp-chart tr.sel:hover td{background:var(--brand-tint)}',
'.pdp-chart tr.out td{color:var(--muted)}',
'.pdp-rowbtn{background:none;border:none;padding:4px 2px;font-weight:700;font-size:14.5px;cursor:pointer;color:inherit;min-height:32px}',
'.pdp-chart tr.out .pdp-rowbtn{text-decoration:line-through}',
'.pdp-chart .oos{font-size:10.5px;line-height:1.25;font-weight:500;color:var(--warn)}',
/* T3 */
'.pdp-t3{padding:18px}',
'.pdp-ys{font-family:var(--font-display);font-size:24px;font-weight:700;line-height:1.15}',
'.pdp-meas{display:grid;grid-template-columns:repeat(auto-fit,minmax(68px,1fr));gap:8px;margin-top:10px}',
'.pdp-meas>div{background:var(--surface2);border:1px solid var(--line2);border-radius:var(--radius);padding:9px 10px}',
'.pdp-meas b{display:block;font-family:var(--font-display);font-size:17px}',
'.pdp-fitseg{display:flex;height:8px;border-radius:4px;overflow:hidden;margin:8px 0 6px;gap:2px}',
'.pdp-fitseg span{display:block;height:100%}',
'.pdp-cly{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}',
'.pdp-cly figure{margin:0}',
'.pdp-cly figcaption{margin-top:6px;line-height:1.35}',
'.pdp-hl{animation:pdpflash 1.6s ease}',
/* reviews, lists */
'#pdp-reviews,#pdp-sizes,#pdp-t3,#pdp-pairs,#pdp-qa{scroll-margin-top:84px}',
'.pdp-revgrid{display:grid;gap:16px}',
'@media(min-width:1024px){.pdp-revgrid{grid-template-columns:280px minmax(0,1fr);gap:24px;align-items:start}}',
'.pdp-revlist{display:grid;gap:12px}',
'@media(min-width:768px){.pdp-revlist{grid-template-columns:repeat(3,minmax(0,1fr))}}',
'.pdp-avg{font-family:var(--font-display);font-weight:800;font-size:44px;line-height:1}',
'.pdp-rev-photo{width:84px;margin-top:12px}',
'.pdp-rv{display:flex;gap:12px;overflow-x:auto;scrollbar-width:thin;padding-bottom:4px}',
'.pdp-rv>*{flex:0 0 44%}',
'@media(min-width:768px){.pdp-rv>*{flex-basis:28%}}',
'@media(min-width:1024px){.pdp-rv{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:16px;overflow:visible}}',
/* bag modal */
'.pdp-bagbtns{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
'.pdp-bagbtns .btn-primary{grid-column:1/-1;order:-1}',
'@media(min-width:768px){.pdp-bagbtns{grid-template-columns:auto 1fr 1fr}.pdp-bagbtns .btn-primary{grid-column:auto;order:0}}',
/* phone action bar: replaces the bottom nav on this page */
'.pdp-mbar-in{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
'.pdp-mbar .btn{padding-left:10px;padding-right:10px}',
'@media(max-width:1023px){.has-bnav:has(.pdp-page) .bnav{display:none}.has-bnav:has(.pdp-page){padding-bottom:0}}'
].join('\n');
(function(){ if(document.getElementById('pdp-css')) return; var s = document.createElement('style'); s.id = 'pdp-css'; s.textContent = PDP_CSS; document.head.appendChild(s); })();

/* ---------- helpers ---------- */
var PDP_VIEWS = ['front','back','detail','model','flat'];
/* 25. A product needs at least four photos before the gallery looks right.
   The upload form reads PDP_MIN_IMAGES and shows pdp_imagesNote(n); the page
   itself still draws whatever it is given, even if that is only one. */
var PDP_MIN_IMAGES = 4;
function pdp_imagesNote(n){
  n = n || 0;
  return n >= PDP_MIN_IMAGES ? null
    : 'Add at least '+PDP_MIN_IMAGES+' photos — '+n+' uploaded. Front, back, detail and on-model are the four we need.';
}
function pdp_views(p){
  /* real uploads will arrive on p.images; until then every product has the five demo views */
  var n = (p && p.images && p.images.length) || PDP_VIEWS.length;
  return PDP_VIEWS.slice(0, Math.max(1, Math.min(PDP_VIEWS.length, n)));
}
var PDP_LEN = {polo:.42, tee:.42, shirt:.44, hoodie:.415, panjabi:.6, trouser:.59};
var PDP_NAV = 0;                     // counts real navigations (so ?finder=1 opens once per visit, not on every rerender)
window.addEventListener('hashchange', function(){ PDP_NAV++; });

function pdp_clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function pdp_isOne(p){ return !chartFor(p) || p.sizes.length===1; }
function pdp_sku(p){ return 'EX-'+p.cat.slice(0,3).toUpperCase()+'-'+(1001+DB.products.indexOf(p)); }
function pdp_ftin(h){ return Math.floor(h/12)+'\''+(h%12)+'"'; }
function pdp_noun(p){ var n = (CAT(p.cat)||{name:'item'}).name.toLowerCase(); return n.replace(/s$/,''); }
function pdp_heart(on){ return on ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="var(--sale)" aria-hidden="true"><path d="M12 20s-7-4.6-7-9.5A3.8 3.8 0 0112 7a3.8 3.8 0 017 3.5c0 4.9-7 9.5-7 9.5z"/></svg>' : ico('heart',22); }

/* ---- Desktop Batch B (Sawdagor · Shilpi, 19 Oct): one switch for every
   desktop-only behaviour on the product, combo, bag, checkout and account
   pages. Phone never takes these branches (the owner has signed the phone off). */
var DKB_MQ = (window.matchMedia ? window.matchMedia('(min-width:1024px)') : null);
function dkb_desk(){ return !!(DKB_MQ && DKB_MQ.matches); }
/* paired wording: the phone line stays exactly as it was, the desktop line
   says "click" instead of "tap" (D-051). hide-d / hide-m are the shop's own
   one-breakpoint switches. */
function dkb_pair(phone, desk){ return '<bdi class="hide-d">'+phone+'</bdi><bdi class="hide-m">'+desk+'</bdi>'; }
/* D-033. ONE rating per product. The owner's review desk (Admin › Reviews)
   is the source the shop's stars come from; until a product has approved
   rows there, its catalogue figure is used. The title line, the reviews block
   and the T3 card all read this, so they can never disagree again. */
function pdp_realReviews(p){ return (DB.reviews||[]).filter(function(r){ return r.product===p.id && !r.hidden && !r.pending; }); }
function pdp_rating(p){
  var ra = (typeof reviewAverage==='function') ? reviewAverage(p.id) : {avg:0, n:0};
  return ra && ra.n ? {avg:ra.avg, n:ra.n, real:true} : {avg:p.rating, n:p.reviews, real:false};
}
function pdp_state(p, query){
  var u = ui('pdp:'+p.id, {color:null, size:null, view:'front', cm:false, err:false, qColor:null, fStep:'ask', fH:0, fW:0, t3Edit:false, t3Why:false, acc:{fabric:'peek'}, added:null});
  query = query || {};
  if(query.color && p.colors.indexOf(query.color)>=0 && u.qColor!==query.color){ u.qColor = query.color; u.color = query.color; u.size = null; }
  if(!u.color || p.colors.indexOf(u.color)<0) u.color = p.colors.filter(function(c){ return totalStock(p.id,c)>0; })[0] || p.colors[0];
  if(pdp_isOne(p)) u.size = p.sizes[0];
  else {
    if(u.size && stockOf(p.id, u.color, u.size)<=0) u.size = null;
    if(!u.size){ var ms = mySizeFor(p); if(ms && stockOf(p.id, u.color, ms)>0) u.size = ms; }
  }
  if(!u.fH){ var m = mySize(); u.fH = (m && m.heightIn) || 67; u.fW = (m && m.weightKg) || 66; }
  return u;
}
function pdp_cur(){ var p = P(CUR.params && CUR.params[0]); if(!p || CUR.page!=='product') return null; return {p:p, u:pdp_state(p, CUR.query)}; }

function pdp_saveMySize(p, size, h, w){
  var grp = (CAT(p.cat)||{}).group, acc = currentAccount(), cur = (acc ? acc.mySize : ST.guestSize) || {};
  var n = {top:cur.top||null, bottom:cur.bottom||null, heightIn:h, weightKg:w};
  if(grp==='top') n.top = size; else if(grp==='bottom') n.bottom = size;
  if(acc) acc.mySize = n; else ST.guestSize = n;
  saveState();
}
/* R14 · 14.9. The line carries EVERY field the product's chart has, in the
   chart's own order — a polo shows chest, length, shoulder AND sleeve; a chino
   all five. Each "field value" pair is one unbreakable unit (.pdp-fi), so on a
   narrow phone the line wraps cleanly between pairs, never inside one, and the
   first-screen budget (pdp_budget) measures whatever height that produces. */
function pdp_pickFields(ch){ return ch.fields.map(function(f, i){ return i; }); }
function pdp_fitLine(p, size, cm){
  var ch = chartFor(p); if(!ch || !ch.rows[size]) return '';
  var r = ch.rows[size];
  /* 35. The letter and every number are bold — they are the only part of this
     line anybody actually reads. */
  return pdp_pickFields(ch).map(function(i, k){ var v = '<b>'+esc(fmtMeasure(r[i], cm))+'</b>', f = ch.fields[i].toLowerCase();
    return '<span class="pdp-fi">'+(k===0 ? '<b class="pdp-fsz">'+esc(size)+'</b> fits '+f+' up to '+v : f+' '+v)+'</span>'; }).join('<span class="pdp-fdot">\u00a0· </span>');
}
function pdp_fitPos(p){ var n = String(p.fitNote||'')+' '+String(p.fit||''); if(/small|go up/i.test(p.fitNote||'')) return 24; if(/slim/i.test(n)) return 36; if(/relaxed|size down|roomy|large/i.test(n)) return 72; return 50; }
function pdp_fitWord(pos){ return pos<40 ? 'runs a little small' : pos>60 ? 'runs a little large' : 'true to size'; }
function pdp_fitStats(p){ var pos = pdp_fitPos(p); if(pos<30) return {s:34,t:60,l:6}; if(pos<45) return {s:18,t:76,l:6}; if(pos>60) return {s:6,t:64,l:30}; return {s:9,t:85,l:6}; }

/* two reasons using the chart numbers */
function pdp_reasons(p, rec, hIn, wKg, cm){
  var ch = chartFor(p); if(!ch || !rec || !ch.rows[rec.size]) return [];
  var r = ch.rows[rec.size], f0 = ch.fields[0], body = Math.round((rec.need - ch.ease)*10)/10, out = [];
  if(r[0] >= rec.need) out.push('<b>'+esc(f0)+' '+esc(fmtMeasure(r[0],cm))+'</b> — for '+esc(pdp_ftin(hIn))+' and '+wKg+' kg you need about '+esc(fmtMeasure(rec.need,cm))+' ('+f0.toLowerCase()+' about '+esc(fmtMeasure(body,cm))+' + '+esc(fmtMeasure(ch.ease,cm))+' room for this fit). '+esc(rec.size)+' is the closest size that covers it.');
  else out.push('<b>'+esc(f0)+' '+esc(fmtMeasure(r[0],cm))+'</b> — you need about '+esc(fmtMeasure(rec.need,cm))+'. '+esc(rec.size)+' is our biggest size in this fit, so it may feel close. Message us on WhatsApp and we will help.');
  var li = ch.fields.indexOf('Length');
  if(li>=0){
    var g = (CAT(p.cat)||{}).garment, ratio = PDP_LEN[g] || (ch.type==='bottom' ? .59 : .42), len = r[li], d = len - hIn*ratio;
    var where = {polo:'ends at mid-hip', tee:'ends at mid-hip', shirt:'long enough to stay tucked in', hoodie:'sits just below the waist', panjabi:'falls around the knee', trouser:'full length with a light break at the shoe'}[g] || 'right for your height';
    if(Math.abs(d)<=1) out.push('<b>Length '+esc(fmtMeasure(len,cm))+'</b> — right for '+esc(pdp_ftin(hIn))+': '+where+'.');
    else if(d>1) out.push('<b>Length '+esc(fmtMeasure(len,cm))+'</b> — a little long for '+esc(pdp_ftin(hIn))+(ch.type==='bottom' ? '; any tailor can shorten it.' : '; easy to tuck in or wear loose.'));
    else out.push('<b>Length '+esc(fmtMeasure(len,cm))+'</b> — may sit a bit short for '+esc(pdp_ftin(hIn))+(rec.next!==rec.size ? '; '+esc(rec.next)+' adds about '+esc(fmtMeasure(1,cm))+' more length.' : '.'));
  }
  return out;
}
function pdp_whyList(items){ return '<ul class="pdp-why">'+items.map(function(x){ return '<li>'+ico('check',16)+'<span>'+x+'</span></li>'; }).join('')+'</ul>'; }

/* ---------- gallery ---------- */
function pdp_imgOverlays(p, view, noBadge, low){
  var h = '';
  if(noBadge){}
  else if(p.compareAt) h += '<span class="badge-img sale">−'+Math.round((1-p.price/p.compareAt)*100)+'%</span>';
  else if(p.tag) h += '<span class="badge-img">'+esc(p.tag)+'</span>';
  /* 39. The "only N left" warning used to sit far below the fold. On the photo it
     costs no height at all and it is the first thing the eye lands on. */
  if(low) h += '<span class="pdp-chip-img low" data-testid="low-chip">'+ico('clock',14)+esc(low)+'</span>';
  if(p.hasModel && p.model && (view==='front' || view==='model')) h += '<span class="pdp-chip-img glass">'+ico('user',13)+esc(p.model)+'</span>';
  if(view==='flat') h += '<span class="pdp-chip-img glass tr">'+ico('sun',14)+'True colour · daylight, no filter</span>';
  return h;
}
/* the short urgent line, or '' — shared by the photo chip and the stock row */
function pdp_lowText(p, u){
  if(!u || !u.color) return '';
  var one = pdp_isOne(p), cn = COL(u.color).name;
  if(u.size){
    var n = stockOf(p.id, u.color, u.size);
    if(n>0 && n<=3) return 'Only '+n+' left in '+cn+(one?'':', size '+u.size);
    return '';
  }
  var t = totalStock(p.id, u.color);
  return (t>0 && t<=3) ? 'Only '+t+' left in '+cn : '';
}
/* P2. One thumbnail strip, shared by every template. T2 had none at all, so a
   customer never learnt there were more angles to swipe to; the audit also
   found T1's strip sat on two baselines (the live thumb was lifted 1px). Both
   are fixed here: one function, one row, no lift. */
function pdp_thumbLabel(v){
  return v==='flat' ? 'True colour photo, daylight, no filter'
    : v==='model' ? 'On model photo'
    : v.charAt(0).toUpperCase()+v.slice(1)+' photo';
}
function pdp_thumbs(p, u, views, ratio){
  var html = views.map(function(v){
    var on = u.view===v;
    return '<button type="button" class="pdp-thumb'+(on?' on':'')+'" data-act="pdp-view" data-v="'+v+'" aria-label="'+pdp_thumbLabel(v)+'" aria-pressed="'+on+'">'+
      productImg(p, u.color, {view:v, ratio:ratio, label:false, inner:v==='flat'?'<span class="pdp-thumb-sun">'+ico('sun',13)+'</span>':''})+'</button>';
  }).join('');
  /* 25. flex:1 cells, so 4, 5 or 6 photos fill the strip exactly — no dead end. */
  return '<div class="pdp-thumbs n'+views.length+'" role="group" aria-label="Product photos">'+html+'</div>';
}
/* The strip itself. Every tile is a real photo in a native scroll-snap row, so
   the drag is the browser's own — it follows the finger and costs no render. */
function pdp_track(p, u, views, opts){
  opts = opts || {};
  var low = pdp_lowText(p, u);
  var tiles = views.map(function(v, i){
    var ov = (opts.noModelOnFront && v==='front') ? 'front-nomodel' : v;
    return '<div class="pdp-tile" data-v="'+v+'"'+(v==='flat'?' id="pdp-flat"':'')+dkb_zoomKey(v===u.view || (i===0 && views.indexOf(u.view)<0))+'>'+
      productImg(p, u.color, {view:v, ratio:opts.ratio||'ratio-45', inner:pdp_imgOverlays(p, ov, i!==0, i===0?low:'')})+'</div>';
  }).join('');
  return '<div class="pdp-trk'+(opts.cls?' '+opts.cls:'')+'" id="pdp-trk" role="group" aria-label="Product photos">'+tiles+'</div>';
}
/* A4. 44px, a solid face and a real edge: the old 40px disc at 72% white on a
   light-grey photograph was both under the touch minimum and nearly invisible. */
function pdp_arrows(){
  return '<button type="button" class="pdp-arrow l" data-act="pdp-nav" data-d="-1" aria-label="Previous photo">'+ico('back',20)+'</button>'+
    '<button type="button" class="pdp-arrow r" data-act="pdp-nav" data-d="1" aria-label="Next photo">'+ico('right',20)+'</button>';
}
function pdp_galleryT1(p, u, vertical){
  var views = pdp_views(p);
  return '<div class="pdp-gal pdp-galT1'+(vertical?' vert':'')+'">'+
    '<div class="pdp-main" id="pdp-main">'+pdp_track(p, u, views, {ratio:'ratio-45'})+pdp_arrows()+'</div>'+
    pdp_thumbs(p, u, views, 'ratio-45')+'</div>';
}
function pdp_galleryT2(p, u){
  var views = ['front','model','detail','flat'];
  return '<div class="pdp-gal pdp-galT2w">'+
    '<div class="pdp-main t2" id="pdp-main">'+pdp_track(p, u, views, {ratio:'ratio-34', cls:'t2 pdp-galT2', noModelOnFront:true})+'</div>'+
    pdp_thumbs(p, u, views, 'ratio-34')+'</div>';
}

/* ---------- info column parts ---------- */
/* Free delivery: set per product when it is uploaded, or by a running campaign,
   or reached by the cart threshold. Shown right under the price, highlighted. */
function freeDeliveryFor(p){
  if(p.freeDelivery) return {on:true, why:'Free home delivery', sub:'All over Bangladesh'};
  var camp = SET('delivery','freeCampaign');
  if(camp) return {on:true, why:'Free home delivery', sub:esc(camp)};
  var over = SET('delivery','freeOver');
  if(over) return {on:false, why:'Free delivery over '+fmt(over), sub:''};
  return null;
}
/* Option B, locked: after the price comes a thick bar, then either the free-delivery
   line or — when the product is not free delivery — the payment line. */
/* 27. A discounted product puts the saving on the far side of the bar and drops
   the COD | bKash | Nagad line altogether: two money messages in one row is one
   too many, and the saving is the one that sells. Switchable from the dashboard. */

/* ====== BACK-END HOOK · THE PAYMENT LINE ==============================
   P4. "COD | bKash | Nagad | Card" sits next to the price on every product
   that is not on free delivery, so it is the most-read line on the page after
   the price itself. It used to be four hard-coded words in a hard-coded size.

   EVERYTHING the owner can change about it is in ONE object, so he changes the
   one thing he wants and the rest keeps working. The back end writes:

       ST.pdpPayLine = { size:16, highlight:'tint' }      <-- HERE

   Any key that is not written keeps the default below — a half-filled object
   is a valid object. The dashboard form is one settings group with one field
   per key, in this order:

     on         true | false        show the line at all
     methods    ['COD','bKash',…]   the words, in order. Rename, reorder,
                                    add a new wallet or drop one — the
                                    separators redraw themselves.
     separator  any character between the words ('|', '·', '/')
     size       px for the words. 11–20 is the sane range; the price row has a
                fixed minimum height, so anything up to 18 costs no layout.
     font       'body' | 'display' | any CSS font-family string
     weight     400–900
     highlight  'none'  plain text (today's look)
                'tint'  the words on a soft brand pill
                'box'   a hairline outline round the words
                'ink'   full-strength ink instead of the quieter grey
     shimmer    true | false. The travelling light. It is OFF by default: it
                used to be welded on with no way to stop it. (The free-delivery
                line keeps its own switch at SHOWN.pdpSweep.freeDelivery.)
   ===================================================================== */
/* R15 · 2.6. `text` is the owner's own words for this line, typed in the
   dashboard. When it is set it is shown instead of the method list; pieces
   are split on the separator, so "COD | bKash | Nagad" behaves exactly like
   the list. Whatever it says, the line is ONE line on every phone: the type
   steps down to `minSize`, and only then do the last pieces hide — it never
   wraps and never ends in "…" (pdp_payFit). */
var PDP_PAYLINE_DEFAULT = {
  on:        true,
  text:      '',
  minSize:   11.5,
  methods:   ['COD', 'bKash', 'Nagad', 'Card'],
  separator: '|',
  size:      14,
  font:      'body',
  weight:    700,
  highlight: 'none',
  shimmer:   false
};
function payLineCfg(){
  var w = (typeof ST!=='undefined' && ST && ST.pdpPayLine) || {}, c = {}, k;
  for(k in PDP_PAYLINE_DEFAULT) if(PDP_PAYLINE_DEFAULT.hasOwnProperty(k)) c[k] = (w[k]===undefined || w[k]===null) ? PDP_PAYLINE_DEFAULT[k] : w[k];
  if(!c.methods || !c.methods.length) c.methods = PDP_PAYLINE_DEFAULT.methods;
  return c;
}
function payLineFont(f){
  if(!f || f==='body') return 'var(--font-body)';
  if(f==='display') return 'var(--font-display)';
  return String(f);
}
/* The words themselves. One function, used by the price row and by the
   stand-alone line under it, so the two can never drift apart. */
function pdp_payWords(cfg, cls){
  cfg = cfg || payLineCfg();
  var sep = '<span class="pdp-bar">'+esc(cfg.separator)+'</span>';
  var style = 'font-size:'+Number(cfg.size)+'px;font-weight:'+Number(cfg.weight)+';font-family:'+payLineFont(cfg.font);
  var parts = (cfg.text && String(cfg.text).trim())
    ? String(cfg.text).split(cfg.separator).map(function(x){ return x.trim(); }).filter(Boolean)
    : cfg.methods.map(String);
  return '<span class="pdp-psmall pay-hl-'+esc(cfg.highlight||'none')+(cfg.shimmer?' sweep pay-shim':'')+(cls?' '+cls:'')+'" style="'+style+'" data-size="'+Number(cfg.size)+'" data-min="'+Number(cfg.minSize||11.5)+'" data-testid="pay-line">'
    + parts.map(function(m, i){ return '<span class="pdp-pm">'+(i?sep:'')+esc(m)+'</span>'; }).join('') + '</span>';
}
function pdp_pct(p){ return p.compareAt ? Math.round((1-p.price/p.compareAt)*100) : 0; }
function pdp_discAfter(p){ return !!pdp_pct(p) && SHOW('pdpPrice','discountAfterBar'); }
/* =====================================================================
   R15 · 3.10. THE SECOND BAR. A discounted product reads
       ৳950 | ৳1,190 −20% / Save ৳240 | Free home delivery
   The third part is the owner's: WHEN it shows and WHAT it says are set in
   the dashboard as a short list of rules, first match wins —
     when 'free'      the product has free delivery (product flag or campaign)
     when 'campaign'  a named campaign is running (SET delivery.freeCampaign or ST.campaign)
     when 'products'  the product id is in `ids`;  'categories' by category
   Each rule gives the words twice: one line (text) and a two-line form
   (top / bottom) used when one line does not fit; then a short form; then
   only the first word. It never wraps by itself and never covers anything.
   ===================================================================== */
var PDP_PRICE_EXTRA = [
  {when:'free', icon:'truck', text:'Free home delivery', top:'Free', bottom:'home delivery', short:'delivery'}
];
function pdp_extraFor(p){
  var f = freeDeliveryFor(p), list = (typeof ST!=='undefined' && ST.pdpPriceExtra) || PDP_PRICE_EXTRA;
  for(var i=0; i<list.length; i++){ var r = list[i];
    if(r.on === false) continue;
    if(r.when==='free' && f && f.on) return r;
    if(r.when==='campaign' && (SET('delivery','freeCampaign') || ST.campaign)) return r;
    if(r.when==='products' && (r.ids||[]).indexOf(p.id) >= 0) return r;
    if(r.when==='categories' && (r.cats||[]).indexOf(p.cat) >= 0) return r;
  }
  return null;
}
function pdp_extraHTML(r){
  var sw = SHOW('pdpSweep','freeDelivery') ? ' sweep' : '';
  return '<span class="pdp-pbar pdp-pbar2" aria-hidden="true"></span>'+
    '<span class="pdp-pextra pdp-fx pdp-fitt'+sw+'" data-fx-max="3" data-l="0">'+ico(r.icon||'truck',20)+
      '<span class="pf pf0">'+esc(r.text)+'</span>'+
      '<span class="pf pf1 pdp-px2"><b>'+esc(r.top||r.text)+'</b><span>'+esc(r.bottom||'')+'</span></span>'+
      '<span class="pf pf2 pdp-px2"><b>'+esc(r.top||r.text)+'</b><span>'+esc(r.short||r.bottom||'')+'</span></span>'+
      '<span class="pf pf3"><b>'+esc(r.top||r.text)+'</b></span>'+
    '</span>';
}
function pdp_priceSide(p){
  var f = freeDeliveryFor(p), pct = pdp_pct(p), body;
  /* 29. The truck is sized against the cap height of the F in "Free", not against
     the line box, so the two read as the same weight. */
  if(pdp_discAfter(p)){
    body = '<span class="pdp-pdisc">'+
      '<span class="pdp-pd1"><span class="strike">'+fmt(p.compareAt)+'</span><span class="tag sale pdp-pct">\u2212'+pct+'%</span></span>'+
      '<span class="pdp-pd2"><b class="pdp-saved">Save '+fmt(p.compareAt-p.price)+'</b></span></span>';
    var ex = pdp_extraFor(p);
    if(ex) return '<span class="pdp-pbar" aria-hidden="true"></span><span class="pdp-pside dsc has-x">'+body+'</span>'+pdp_extraHTML(ex);
  } else if(f && f.on){
    body = '<span class="pdp-fd'+(SHOW('pdpSweep','freeDelivery')?' sweep':'')+'">'+ico('truck',25)+'<b class="pdp-fx pdp-fitt" data-fx-max="1" data-l="0"><span class="pf pf0">'+esc(t('Free home delivery'))+'</span><span class="pf pf1">'+esc(t('Free delivery'))+'</span></b></span>';
  } else {
    var pl = payLineCfg();
    if(!pl.on) return '';                       /* P4. the owner can switch the whole line off */
    /* R14. On a narrow phone the four words no longer run under the icon rail:
       level 0 one line; level 1 the same words balanced over two lines inside
       the row's own height (the row never grows and never breaks). */
    /* R15 · 2.6: one line, always — see pdp_payFit (the R14 "two balanced
       lines" step is gone; it broke the owner's rule). */
    body = ico('cash',21)+pdp_payWords(pl, 'pdp-payfit');
  }
  return '<span class="pdp-pbar" aria-hidden="true"></span><span class="pdp-pside'+((f&&f.on)?' free':'')+(pdp_discAfter(p)?' dsc':'')+'">'+body+'</span>';
}
function pdp_freeDel(p){
  var f = freeDeliveryFor(p); if(!f || !f.on) return '';
  return '<div class="pdp-free on">'+ico('truck',17)+'<b>'+esc(f.why)+'</b>'
    +'<span class="pdp-fsep hide-s">|</span><span class="pdp-fsub hide-s">'+esc(f.sub)+'</span>'
    +(SHOW('pdp','payLineWithFree') ? '' : '<span class="pdp-fsep">|</span><span class="pdp-fsub">COD available</span>')
    +'</div>';
}
/* When free delivery is on, the payment line is hidden by default — the owner can
   bring it back from the dashboard. Everything below then moves up. */
function pdp_payLine(p){
  var f = freeDeliveryFor(p), pl = payLineCfg();
  if(!pl.on) return '';
  if(f && f.on && !SHOW('pdp','payLineWithFree')) return '';
  return '<div class="row small text2 mt8 pdp-pay" style="gap:7px;flex-wrap:nowrap">'+ico('cash',17)+pdp_payWords(pl, 'pdp-payfit')+'</div>';
}
function pdp_waNudge(p){ return ''; }
/* A floating WhatsApp button, present from the first screen on phone and desktop.
   Hover or tap-and-hold shows one short line; it never takes layout space. */
function pdp_waFab(p){
  return '<a class="pdp-wafab" href="'+waLink('Hi EXTAS, I have a question about '+p.name+' ('+pdp_sku(p)+')')+'" '
    +'target="_blank" rel="noopener" aria-label="Ask about this item on WhatsApp">'
    +waGlyph(22)+'</a>';
}
function pdp_nameWithHeart(p, wished){
  var name = String(p.name||''), i = name.lastIndexOf(' ');
  var head = i > 0 ? name.slice(0, i+1) : '', last = i > 0 ? name.slice(i+1) : name;
  var heart = SHOW('pdpIcons','wish') ? '<button type="button" class="pdp-wish" data-act="wish" data-id="'+p.id+'" aria-pressed="'+wished+'" aria-label="'+(wished?'Remove from wishlist':'Save to wishlist')+'" title="'+(wished?'Saved to wishlist':'Save to wishlist')+'" data-testid="pdp-wish">'+pdp_heart(wished)+'</button>' : '';
  return esc(head)+'<span class="pdp-nmend">'+esc(last)+heart+'</span>';
}
/* PR 598: the head is two blocks the owner can order — the title row (brand,
   name + heart, share row, rating) and the price row. Together, as by
   default, they are one .pdp-head exactly as before. */
function pdp_header(p, u, tpl){ return '<div class="pdp-sec pdp-head">'+pdp_headTitle(p, u, tpl)+pdp_headPrice(p)+'</div>'; }
function pdp_headPrice(p){
  var pct = p.compareAt ? Math.round((1-p.price/p.compareAt)*100) : 0;
  var fdel = freeDeliveryFor(p), fd = !!(fdel && fdel.on);
  return ''+
    /* 47. Two columns with a fixed minimum height, so the four cases —
       discount or not, free delivery or not — all draw the same single row at
       440px. The struck price, the per-cent badge and the saving stack under
       the price instead of pushing the delivery line off the end. */
    '<div class="pdp-prow'+(pct?' disc':'')+(pdp_discAfter(p)?' dafter':'')+(fd?' freed':'')+'" data-testid="price-row" data-fitrow>'+
      '<span class="pdp-pmain">'+
        '<span class="price pdp-pbig">'+fmt(p.price)+'</span>'+
        ((pct && !pdp_discAfter(p))?'<span class="pdp-psave"><span class="strike">'+fmt(p.compareAt)+'</span>'+
             '<span class="tag sale pdp-pct">−'+pct+'%</span>'+
             '<span class="pdp-saved">Save '+fmt(p.compareAt-p.price)+'</span></span>':'')+
      '</span>'+pdp_priceSide(p)+'</div>'+
    pdp_waNudge(p);
}
function pdp_headTitle(p, u, tpl){
  var wished = ST.wishlist.indexOf(p.id)>=0;
  var ra = pdp_rating(p), rAvg = ra.avg, rN = ra.n;
  return ''+
    /* R15 · 2.3. The heart sits right after the product title: beside the last
       word when the name is one line, at the end of the row when it is two. */
    /* R15 · 3.7. The title fills its first line edge to edge (no balancing);
       what is left goes to the second line, and the heart rides right after
       the LAST word — glued to it, so the two always move together. */
    (typeof nm_brandLine==='function' && nm_brandLine(p)?'<div class="pdp-brand" data-testid="pdp-brand">'+esc(nm_brandLine(p))+'</div>':'')+
    '<div class="pdp-titlerow">'+
      '<h1 class="h1 pdp-name">'+pdp_nameWithHeart(p, wished)+'</h1>'+
    '</div>'+
    /* the old floating column, only when the owner ticks it back on */
    (!SHOW('pdpIcons','panel') ? '' : '<div class="row between top pdp-railrow" style="gap:8px">'+
      '<div class="pdp-acts shrink0">'+
        (SHOW('pdpIcons','share')?'<button class="pdp-act" data-act="pdp-share" aria-label="Share this product" title="Share this product">'+ico('share',24)+'</button>':'')+
        (SHOW('pdpIcons','whatsapp')?'<a class="pdp-act wa" href="'+waLink('Hi EXTAS, I have a question about '+p.name+' ('+pdp_sku(p)+')')+'" target="_blank" rel="noopener" aria-label="Ask about this item on WhatsApp" title="Ask about this item on WhatsApp">'+waGlyph(24)+'</a>':'')+
      '</div>'+
    '</div>')+pdp_shareRow(p)+
    '<button type="button" class="pdp-rating" data-act="pdp-scroll" data-to="pdp-reviews" aria-label="'+rAvg+' out of 5, '+rN+' reviews. Go to reviews">'+starsHTML(rAvg)+'<span class="small bold">'+rAvg.toFixed(1)+'</span><span class="small muted">· '+rN+' reviews</span></button>';
}
function pdp_nudges(p){
  var out = [];
  combos().filter(function(c){ return c.active && c.items.indexOf(p.id)>=0; }).forEach(function(c){
    var reg = c.items.reduce(function(s, id){ var x = P(id); return s + (x ? x.price : 0); }, 0), save = reg - c.price;
    var same = c.items.every(function(x){ return x===p.id; });
    var what = same ? 'any '+c.items.length+' colours' : c.blurb;
    /* D-030: the desktop gets the description and the price in their own parts
       (they step down separately); the phone keeps its one text run */
    var nuBody = dkb_desk()
      ? '<bdi class="pdp-nd"><b>'+esc(c.name)+'</b><bdi class="pdp-ndx">: '+esc(what)+'</bdi></bdi><bdi class="pdp-nw"> for '+fmt(c.price)+(save>0?' · <span class="brandc bold">Save '+fmt(save)+'</span>':'')+'</bdi>'
      : '<b>'+esc(c.name)+'</b>: '+esc(what)+' for '+fmt(c.price)+(save>0?' · <span class="brandc bold">Save '+fmt(save)+'</span>':'');
    out.push('<a class="tint pdp-nudge" href="#/combo/'+c.id+'" data-testid="nudge-combo-'+c.id+'"><span class="ic">'+ico('layers',17)+'</span><span class="grow">'+nuBody+'</span>'+ico('right',16)+'</a>');
  });
  setRules().filter(function(r){ return r.active && r.mode==='category' && r.categories.indexOf(p.cat)>=0; }).forEach(function(r){
    var keys = Object.keys(r.tiers).map(Number).sort(function(a,b){ return a-b; }); if(!keys.length) return;
    var more = keys[1] ? ' · '+keys[1]+' for '+fmt(r.tiers[keys[1]]) : '';
    /* D-030 (desktop): one line; the second tier ("· 3 for ৳2,100") steps out first */
    var stBody = dkb_desk()
      ? '<bdi class="pdp-nd"><b>Build your own set</b> · Any '+keys[0]+' for '+fmt(r.tiers[keys[0]])+'</bdi><bdi class="pdp-nw pdp-ndx"><span class="text2">'+esc(more)+'</span></bdi>'
      : '<b>Build your own set</b> · Any '+keys[0]+' for '+fmt(r.tiers[keys[0]])+'<span class="text2">'+esc(more)+'</span>';
    out.push('<a class="tint pdp-nudge" href="#/set/'+r.id+'" data-testid="nudge-set-'+r.id+'"><span class="ic">'+ico('gift',17)+'</span><span class="grow">'+stBody+'</span>'+ico('right',16)+'</a>');
  });
  /* P3. A product can belong to no combo and no set rule — the panjabi is the
     one that caught it — and the block simply vanished, leaving the owner
     looking at a hole where every other product has an offer. The data is the
     real answer (add a panjabi combo and the rows above appear by themselves),
     but the page must never show nothing: it falls back to the pairings that
     are already at the foot of every product page. */
  if(!out.length){
    var cats = pdp_rowCats(p).map(function(cid){ var c = CAT(cid); return c ? t(c.name) : null; }).filter(Boolean);
    if(!cats.length) return '';
    var with_ = cats.length>1 ? cats[0]+' and '+cats[1] : cats[0];
    out.push('<button type="button" class="tint pdp-nudge pdp-nudge-go" data-act="pdp-scroll" data-to="pdp-pairs" data-testid="nudge-pairs">'+
      '<span class="ic">'+ico('spark',17)+'</span>'+
      '<span class="grow"><b>Complete the look</b>: '+esc(with_)+' picked to go with this '+esc(pdp_noun(p))+'</span>'+
      ico('down',16)+'</button>');
  }
  return '<div class="pdp-sec stack s8 pdp-nudgesec">'+out.join('')+'</div>';
}
var PDP_ALLC_UP_FROM = 6;
function pdp_colour(p, u){
  var c = COL(u.color), note = DB.colorNotes[u.color];
  /* 30. "All N colours" is not pinned to the right edge of the row — it is the
     next cell after the last swatch, so it travels right as colours are added. */
  /* R14 · 14.11. The owner's placement: "All N colours" sits on the "Colour –
     Navy" line, on the right, in the label's own type — the exact mirror of
     "Size – L" with "Size chart" on its right. The line below is then the
     swatches alone, on one row at every width (see r12-pdp.css R14).
     It collapses by itself when the line runs out of room (pdp_fitRows):
       level 0  "All 6 colours ›"   level 1  "6 colours ›"   level 2  [grid] 6
     Same button, same action, same accessible name at every level. */
  var n = p.colors.length;
  var allc = n>1
    ? '<button type="button" class="link pdp-allc pdp-fx'+(SHOW('pdpSweep','allColours')?' sweep':'')+'" data-act="pdp-allcolors" data-fx-max="2" data-l="0" aria-label="See all '+n+' colours">'+
        '<span class="pf pf0">All '+n+' colours</span><span class="pf pf1">'+n+' colours</span><span class="pf pf2">'+ico('grid',16)+n+'</span>'+
        '<span class="pdp-allc-chev">'+ico('right',15)+'</span></button>'
    : '';
  /* R15 · 2.2. THE OWNER'S RULE (R14 put it on the label line for every count —
     that was a misreading of "the colour line"):
       up to 5 colours  -> "All N colours" is the next thing after the last
                           swatch, on the swatch line. It never goes up.
       6 and more       -> it moves up to the right of "Colour – Navy".
     On the swatch line it still steps down by itself if a narrow phone runs
     out of room (All 5 colours -> 5 colours -> [grid] 5); it never wraps.
     PDP_ALLC_UP_FROM is the one number that sets the switch-over. */
  var up = n >= PDP_ALLC_UP_FROM;
  return '<div class="pdp-sec pdp-colsec'+(up?' allc-up':' allc-sw')+'">'+
    '<div class="pdp-lblrow" data-fitrow><span class="pdp-lbl pdp-fitt'+(SHOW('pdpSweep','colourLabel')?' sweep':'')+'">'+esc(t('Colour'))+' <span class="pdp-lblv">'+esc(c.name)+'</span></span>'+(up?allc:'')+'</div>'+
    (n<2 ? '' : '<div class="pdp-sw mt8"'+(up?'':' data-fitrow')+' role="radiogroup" aria-label="Colour" style="--n:'+n+'">'+p.colors.map(function(id){
      var cc = COL(id), on = id===u.color, so = totalStock(p.id, id)<=0;
      return '<button type="button" class="swatch'+(on?' on':'')+(so?' so':'')+'" style="background:'+cc.hex+'" data-act="pdp-color" data-c="'+id+'" role="radio" aria-checked="'+on+'" aria-label="'+esc(cc.name)+(so?' (sold out)':'')+'" title="'+esc(cc.name)+'"></button>';
    }).join('')+(up?'':allc)+'</div>')+
    ((note && SHOW('pdp','colourNote'))?'<div class="xs text2 mt8 pdp-cnote">'+esc(note)+'</div>':'')+
    (SHOW('pdp','trueColourLink')?'<button type="button" class="link pdp-ilink" data-act="pdp-truecol">'+ico('sun',15)+'See true-colour photo</button>':'')+
  '</div>';
}
function pdp_pills(p, u){
  var ms = mySizeFor(p), cn = COL(u.color).name;
  /* 33. One explicit column per size: five or eight, they share the whole width
     and never drop to a second line. */
  /* 22. ...and the boxes get the sweep as a travelling shine (pdpSweep.sizePills),
     which keeps the letters at full contrast — a text sweep would grey them out. */
  return '<div class="pdp-pills'+(u.err?' err':'')+(SHOW('pdpSweep','sizePills')?' shine':'')+'" role="radiogroup" aria-label="Size" '+
    'style="grid-template-columns:repeat('+p.sizes.length+',minmax(0,1fr))" data-n="'+p.sizes.length+'">'+p.sizes.map(function(s){
    var out = stockOf(p.id, u.color, s)<=0, on = u.size===s, tag = ms===s;
    return '<button type="button" class="size-pill'+(on?' on':'')+(out?' out':'')+(tag?' tagged':'')+'" '+(out?'disabled aria-disabled="true" ':'data-act="pdp-size" data-s="'+esc(s)+'" ')+'role="radio" aria-checked="'+on+'" aria-label="Size '+esc(s)+(out?', out of stock in '+esc(cn):'')+(tag?', your size':'')+'">'+esc(s)+(tag?'<span class="pdp-ystag">Your size</span>':'')+'</button>';
  }).join('')+'</div>'+(u.err?'<div class="pdp-err small" role="alert">'+ico('info',15)+'Please choose a size</div>':'')+pdp_mySizeOut(p, u, ms);
}
function pdp_mySizeOut(p, u, ms){
  if(!ms || p.sizes.indexOf(ms)<0 || stockOf(p.id, u.color, ms)>0) return '';
  var alt = p.colors.filter(function(x){ return x!==u.color && stockOf(p.id, x, ms)>0; });
  return '<div class="xs mt8" style="color:var(--warn)">Your size '+esc(ms)+' is sold out in '+esc(COL(u.color).name)+'.'+(alt.length?' In stock in: '+alt.map(function(x){ return '<button type="button" class="link" style="font-size:12px" data-act="pdp-color" data-c="'+x+'">'+esc(COL(x).name)+'</button>'; }).join(', '):'')+'</div>';
}
function pdp_fitLineHTML(p, u){
  /* Inches on the page. Centimetres live inside the size-chart popup, where a
     customer who wants them is already looking for numbers. */
  var body = u.size ? pdp_fitLine(p, u.size, false) : dkb_pair('Tap a size to see its measurements', 'Pick a size to see its measurements');
  return '<div class="row between xs mt12 pdp-fitline" style="gap:10px"><span class="pdp-fitx">'+body+'</span>'+
    (SHOW('pdp','unitToggle') ? '<button type="button" class="pdp-unit" data-act="pdp-unit-toggle" aria-label="'+(u.cm?'Show in inches':'Show in centimetres')+'">'+(u.cm?'inches':'cm')+'</button>' : '')+'</div>';
}
function pdp_fitBar(p){
  var pos = pdp_fitPos(p);
  return '<div class="pdp-fit"><div class="fitbar" role="img" aria-label="Fit: '+esc(pdp_fitWord(pos))+'"><span style="left:calc('+pos+'% - 6px)"></span></div>'+
    '<div class="row between tiny muted mt8"><span>Runs small</span><span>True to size</span><span>Runs large</span></div>'+
    '<div class="xs text2 mt8">'+esc(p.fitNote)+'</div></div>';
}
function pdp_fmsCard(p){
  var ms = mySizeFor(p), m = mySize(), t, s;
  if(ms){ t = 'Your size: '+ms; s = (m && m.heightIn ? 'From '+pdp_ftin(m.heightIn)+' · '+m.weightKg+' kg · ' : '')+'tap to check again'; }
  else { t = 'Find my size'; s = ['Just your height and weight · 20 seconds', 'Your height and weight · 20 sec', 'Height + weight · 20 sec']; }
  /* R14. The subtitle used to be cut off with an ellipsis on a 360px phone.
     It now has shorter wordings that pdp_fitRows steps through instead. */
  if(typeof s === 'string') s = [s, s.replace(/^From /,'').replace(/ · tap to check again$/,' · check again'), s.replace(/ · tap to check again$/,'')];
  return '<button type="button" class="pdp-fms" data-act="pdp-open-finder" data-testid="fms-card"><span class="ic">'+ico('ruler',20)+'</span><span class="grow"><span class="t" style="display:block">'+esc(t)+'</span>'+
    '<span class="s pdp-fx pdp-fitt" style="display:block" data-fitrow data-fx-max="2" data-l="0">'+s.map(function(x, i){ return '<span class="pf pf'+i+'">'+esc(x)+'</span>'; }).join('')+'</span></span>'+ico('right',18)+'</button>';
}
/* 34. Three designs were tried (see the report): v1 a bare underlined link,
   v2 a soft tinted chip, v3 an outlined chip that matches a size pill.
   v2 won — it reads as a control without competing with the pills below it.
   Whichever is used, its right edge lands on the right edge of the last size
   box, which is also the right edge of the content. */
/* 30. Five Add-to-Bag / Order-Now combinations were rendered for the owner in
   shots/cta-options.png. cta1 is shipped: Add to Bag in the brand tint with a
   brand-line edge against the solid-brand Order Now — one family, two weights. */
/* R15 · 3.11. Order Now keeps the brand colour. Add to Bag gets a near shade
   of the SAME colour (mixed from --brand, so every theme follows), so the two
   read as one family but clearly two buttons. 's1' shipped; 's2'/'s3' are the
   other two shown to the owner; 'tint' is the previous look. */
var PDP_ADD_SHADE = 's1';
var PDP_CTA_STYLE = 'cta1 add-' + PDP_ADD_SHADE;
var PDP_CHART_STYLE = 'v2';
function pdp_chartBtn(){
  /* R14 · 14.12. Nothing about this chip is a fixed width any more. As the
     line runs out of room pdp_fitRows steps it down:
       level 0  [ruler] Size chart ›   level 1  [ruler] Size chart   level 2  [ruler]
     and only after that does the label's own prompt shorten (see pdp_sizeHead). */
  return '<button type="button" class="pdp-chartbtn pdp-fx '+PDP_CHART_STYLE+'" data-act="pdp-open-chart" data-testid="open-chart" data-fx-max="2" data-l="0" aria-label="Size chart">'+ico('ruler',16)+'<span class="pdp-cbt">'+esc(t('Size chart'))+'</span><span class="pdp-cbc">'+ico('right',14)+'</span></button>';
}
function pdp_sizeHead(p, u){
  /* 32. The Size label is set in exactly the same type as the Colour label —
     they are a pair and the customer reads them as one step. */
  /* 22. The size label carries the same light sweep as the colour label, on its
     own switch (pdpSweep.sizeLabel). */
  /* R14 · 14.6/14.7. A picked size is bold with a brand-coloured dash; the
     "Choose your size" prompt stays quiet so the change on tapping is obvious.
     The prompt is the last thing to give way: "Choose your size" -> "Choose size". */
  var v = u.size ? '<span class="pdp-lblv on">'+esc(u.size)+'</span>'
    : '<span class="pdp-lblv unset pdp-fx" data-fx-max="1" data-fx-ord="2" data-l="0"><span class="pf pf0">'+esc(t('Choose your size'))+'</span><span class="pf pf1">'+esc(t('Choose size'))+'</span></span>';
  return '<div class="pdp-lblrow" data-fitrow><span class="pdp-lbl pdp-fitt'+(SHOW('pdpSweep','sizeLabel')?' sweep':'')+'">'+esc(t('Size'))+' '+v+'</span>'+pdp_chartBtn()+'</div>';
}
function pdp_sizeBlock(p, u){ return pdp_sizeOnly(p, u)+pdp_sizeHelp(p); }
/* PR 598: the size row and the "Find my size" card are two blocks */
function pdp_sizeOnly(p, u){
  if(pdp_isOne(p)) return '<div class="pdp-sec" id="pdp-sizes"><div class="pdp-lblrow"><span class="pdp-lbl">Size <span class="pdp-lblv">One size</span></span></div>'+
    '<div class="row between xs mt12 pdp-fitline" style="gap:10px"><span><b class="pdp-fsz">One size</b> — '+esc(p.fitNote)+'</span></div></div>';
  return '<div class="pdp-sec" id="pdp-sizes">'+pdp_sizeHead(p,u)+pdp_pills(p,u)+pdp_fitLineHTML(p,u)+
      (SHOW('pdp','fitBar') ? '<div class="mt16">'+pdp_fitBar(p)+'</div>' : '')+'</div>';
}
function pdp_sizeHelp(p){ return pdp_isOne(p) ? '' : '<div class="pdp-sec pdp-fmssec">'+pdp_fmsCard(p)+'</div>'; }
function pdp_stockLine(p, u){
  var cn = COL(u.color).name, one = pdp_isOne(p), low = pdp_lowText(p, u);
  if(u.size && stockOf(p.id, u.color, u.size)<=0) return '<div class="pdp-stock low">'+ico('info',15)+'Out of stock in '+esc(cn)+'</div>';
  if(!u.size && totalStock(p.id, u.color)<=0) return '<div class="pdp-stock low">'+ico('info',15)+'Sold out in '+esc(cn)+' — try another colour</div>';
  /* 39. The urgent line keeps its place here too, but it is already on the photo
     at the top of the page, where it is actually seen. */
  if(low) return '<div class="pdp-stock low" data-testid="stock-line">'+ico('clock',15)+esc(low)+'</div>';
  return '<div class="pdp-stock'+(SHOW('pdpSweep','stock')?' sweep':'')+'" data-testid="stock-line">'+ico('truck',15)+'<span>In stock — ships today if you order before 5 pm</span></div>';
}
function pdp_ctas(){
  /* 30. Combination 1 of the five rendered for the owner (shots/cta-options.png):
     Add to Bag is the brand tint with a brand-line edge, Order Now stays solid
     brand. One family, two weights — the pair reads as a set. */
  return '<div class="pdp-sec pdp-dk pdp-ctas '+PDP_CTA_STYLE+'"><button type="button" class="btn btn-addbag" data-act="pdp-add" data-testid="add-to-bag">'+ico('bag',18)+esc(t('Add to Bag'))+'</button><button type="button" class="btn btn-primary" data-act="pdp-order">'+esc(t('Order Now'))+'</button></div>';
}
function pdp_trust(){
  /* Three promises, three columns, always on one row — the wording is short
     enough that "100% original" never drops to a line of its own. */
  return '<div class="pdp-sec pdp-trust">'+
    '<span>'+ico('swap',16)+'<b>'+esc(SET('exchange','windowHours'))+'-hour</b>'+(dkb_desk() ? '<bdi class="dkb-tw"> size</bdi> swap' : ' size swap')+'</span>'+
    '<span>'+ico('truck',16)+'<b>Free</b> over '+fmt(SET('delivery','freeOver'))+'</span>'+
    '<span>'+ico('shield',16)+'<b>100%</b> original</span></div>';
}
/* =====================================================================
   PR 598 · PRODUCT PAGE BLOCKS (Site builder › Product page, Shilpi).
   Three zones, each in the owner's order, each block with its own
   phone / tablet / desktop switch:
     buy column  title · price · colour · size · size help · stock line ·
                 offers (combo / set nudges) · BUY GROUP · trust promises
     details     delivery-exchange-returns info · description (fabric, fit,
                 details) · care guide link
     below       reviews · questions (FAQ) · goes-well-with rows · recently viewed
   Guardrails: the gallery stays first; the buy group (Add to Bag + Order Now,
   and the phone's sticky bar) can never be hidden, and only the small
   first-screen blocks may sit above it — so it stays in the first window on
   a 1366×768 desktop (D-053). The builder blocks a bad order with a message;
   the page also enforces it. No data published → the original functions,
   untouched.
   ===================================================================== */
var PDP_ZONES = {buy:['title','price','colour','size','sizehelp','stock','offers','buy','trust'], details:['info','desc','care'], below:['reviews','faq','together','related']};
var PDP_ABOVE_BUY = {title:1, price:1, colour:1, size:1, sizehelp:1, stock:1, offers:1};
function pdp_sb(){ return (typeof sbArea==='function') ? sbArea('pdp') : null; }
function pdp_dev(){ var w = window.innerWidth; return w < 768 ? 'phone' : (w < 1024 ? 'tablet' : 'desk'); }
function pdp_blockOn(id){
  if(id==='buy') return true;
  var d = pdp_sb(), v = d && d.vis && d.vis[id]; if(!v) return true;
  if(v.on === false) return false; return v[pdp_dev()] !== false;
}
/* the owner's order for a zone, reconciled with the blocks this page has, and the buy rule enforced */
function pdp_order(zone, native){
  var d = pdp_sb(), o = d && d.order && d.order[zone]; if(!o || !o.length) return native.slice();
  var out = o.filter(function(id){ return native.indexOf(id) >= 0; });
  native.forEach(function(id){ if(out.indexOf(id) < 0) out.push(id); });
  if(zone==='buy'){ var b = out.indexOf('buy');
    if(b >= 0){ var above = out.slice(0, b), bad = above.filter(function(id){ return !PDP_ABOVE_BUY[id]; });
      if(bad.length) out = above.filter(function(id){ return PDP_ABOVE_BUY[id]; }).concat(['buy'], bad, out.slice(b+1)); } }
  return out;
}
function pdp_infoSB(p, u, tpl){
  var one = pdp_isOne(p), t3 = tpl==='T3' && !one;
  var native = t3 ? ['title','price','size','colour','offers','stock','buy','trust'] : (tpl==='T3' ? ['title','price','colour','size','offers','stock','buy','trust'] : PDP_ZONES.buy);
  var d = pdp_sb(), ord = (d && d.order && d.order.buy && d.order.buy.length) ? pdp_order('buy', PDP_ZONES.buy.filter(function(id){ return !(t3 && id==='sizehelp'); })) : native.slice();
  var piece = {
    colour:function(){ return pdp_colour(p,u); },
    size:function(){ return t3 ? pdp_t3Card(p,u) : pdp_sizeOnly(p,u); },
    sizehelp:function(){ return t3 ? '' : pdp_sizeHelp(p); },
    stock:function(){ return '<div class="pdp-sec pdp-stocksec">'+pdp_stockLine(p,u)+'</div>'; },
    offers:function(){ return pdp_nudges(p); }, buy:function(){ return pdp_ctas(); }, trust:function(){ return pdp_trust(); }
  };
  var out = '', i = 0;
  ord = ord.filter(function(id){ return pdp_blockOn(id); });
  while(i < ord.length){
    var id = ord[i];
    if(id==='title' || id==='price'){
      var nx = ord[i+1], both = (id==='title' && nx==='price') || (id==='price' && nx==='title');
      var part = function(k){ return k==='title' ? pdp_headTitle(p,u,tpl) : pdp_headPrice(p); };
      out += '<div class="pdp-sec pdp-head'+(both || id==='title' ? '' : ' pdp-head-p')+'">'+part(id)+(both ? part(nx) : '')+'</div>';
      i += both ? 2 : 1; continue;
    }
    out += piece[id] ? piece[id]() : ''; i++;
  }
  return out+pdp_waFab(p);
}
function pdp_infoT12(p, u, tpl){
  if(pdp_sb()) return pdp_infoSB(p, u, tpl);
  return pdp_header(p,u,tpl)+pdp_colour(p,u)+pdp_sizeBlock(p,u)+'<div class="pdp-sec pdp-stocksec">'+pdp_stockLine(p,u)+'</div>'+pdp_nudges(p)+pdp_ctas()+pdp_trust()+pdp_waFab(p);
}

/* ---------- T3 Fit-first ---------- */
function pdp_stepper(scope, k, val, label){
  return '<div class="pdp-step" role="group" aria-label="'+label+'"><button type="button" data-act="pdp-step" data-scope="'+scope+'" data-k="'+k+'" data-d="-1" aria-label="'+label+' less">'+ico('minus',18)+'</button><output id="pdp-'+scope+'-'+k+'" aria-live="polite">'+val+'</output><button type="button" data-act="pdp-step" data-scope="'+scope+'" data-k="'+k+'" data-d="1" aria-label="'+label+' more">'+ico('plus',18)+'</button></div>';
}
function pdp_stepperBlock(scope, u){
  return '<div class="stack s16">'+
    '<div><div class="label">Your height</div><div class="row wrap" style="gap:10px">'+pdp_stepper(scope,'ft',Math.floor(u.fH/12)+' ft','Height in feet')+pdp_stepper(scope,'in',(u.fH%12)+' in','Height in inches')+'<span class="xs muted" id="pdp-'+scope+'-cm">'+Math.round(u.fH*2.54)+' cm</span></div></div>'+
    '<div><div class="label">Your weight</div><div class="row" style="gap:10px">'+pdp_stepper(scope,'kg',u.fW+' kg','Weight in kg')+'</div></div>'+
  '</div>';
}
function pdp_t3Card(p, u){
  var ch = chartFor(p), ms = mySizeFor(p), m = mySize(), top;
  if(ms && !u.t3Edit){
    var hasHW = m && m.heightIn && m.weightKg, rec = hasHW ? recommendSize(ch, m.heightIn, m.weightKg) : null;
    top = '<div class="row between top"><div><div class="pdp-ys">Your size: <span class="brandc">'+esc(ms)+'</span></div>'+
        (hasHW?'<div class="xs text2">From '+esc(pdp_ftin(m.heightIn))+' · '+m.weightKg+' kg</div>':'')+'</div>'+
        '<button type="button" class="btn btn-ghost btn-sm" data-act="pdp-t3-change">Change</button></div>';
    if(rec && rec.size!==ms) top += '<div class="soft p16 small mt12">For this '+esc(p.fit.toLowerCase())+' we suggest <b>'+esc(rec.size)+'</b>. <button type="button" class="link" data-act="pdp-t3-use" data-size="'+esc(rec.size)+'">Use '+esc(rec.size)+'</button></div>';
    if(rec && u.t3Why) top += pdp_whyList(pdp_reasons(p, rec, m.heightIn, m.weightKg, u.cm))+(rec.next!==rec.size?'<div class="xs text2 mt8">Between sizes or like it roomy? Take <b>'+esc(rec.next)+'</b>.</div>':'');
    else if(rec) top += '<button type="button" class="link" data-act="pdp-t3-why">Why '+esc(rec.size)+'?</button>';
  } else {
    top = '<div class="row between top"><div><div class="eyebrow">Your size</div><div class="h2" style="margin-top:2px">Find my size</div></div>'+(ms?'<button type="button" class="link" data-act="pdp-t3-cancel">Cancel</button>':'')+'</div>'+
      '<div class="xs text2 mb12">Just your height and weight — we match you to the '+esc(ch.name)+' chart.</div>'+
      pdp_stepperBlock('i', u)+
      '<button type="button" class="btn btn-primary btn-block mt16" data-act="pdp-t3-find" data-testid="t3-find">'+ico('ruler',18)+'Show my size</button>';
  }
  var meas = '';
  if(u.size && ch.rows[u.size]){
    meas = '<div class="pdp-meas">'+ch.fields.map(function(f, i){ return '<div><span class="tiny muted">'+esc(f)+'</span><b>'+esc(fmtMeasure(ch.rows[u.size][i], u.cm))+'</b></div>'; }).join('')+'</div>';
  } else meas = '<div class="xs muted mt8">Choose a size to see its measurements.</div>';
  var fs = pdp_fitStats(p);
  /* was `rN`, which never existed here — it threw and took the whole T3 page with it */
  var rN = pdp_rating(p).n;
  var base = (m && m.heightIn) ? {h:m.heightIn, w:m.weightKg} : {h:u.fH, w:u.fW};
  var people = [[-1,-3],[0,2],[2,5]].map(function(d, i){
    var h = base.h + d[0], w = base.w + d[1], r = recommendSize(ch, h, w);
    return '<figure>'+productImg(p, p.colors[(i+1) % p.colors.length], {view:'model', ratio:'ratio-34', labelText:'[ customer photo ]'})+'<figcaption class="xs"><b>'+esc(pdp_ftin(h))+' · '+w+' kg</b><br><span class="text2">wears '+esc(r.size)+' · Just right</span></figcaption></figure>';
  }).join('');
  /* The size row leads in the markup so a phone gets it on the first screen like
     every other template; on a desktop CSS puts the fit card back on top, which
     is the whole point of T3. */
  return '<div class="pdp-sec pdp-t3sec"><div class="pdp-box pdp-t3" id="pdp-t3" data-testid="t3-card">'+
    '<div id="pdp-sizes" class="pdp-t3-sizes">'+pdp_sizeHead(p,u)+pdp_pills(p,u)+pdp_fitLineHTML(p,u)+'</div>'+
    '<div class="pdp-t3-top">'+top+'</div>'+
    '<div class="pdp-t3-rest">'+
    '<div class="row between mt16"><span class="pdp-lbl">Measurements'+(u.size?' · '+esc(u.size):'')+'</span><button type="button" class="pdp-unit" data-act="pdp-unit-toggle" aria-label="'+(u.cm?'Show in inches':'Show in centimetres')+'">'+(u.cm?'inches':'cm')+'</button></div>'+meas+
    '<div class="mt16"><div class="row between"><span class="pdp-lbl">Fit from '+rN+' reviews</span><span class="xs bold">'+fs.t+'% true to size</span></div>'+
      '<div class="pdp-fitseg" role="img" aria-label="'+fs.s+'% small, '+fs.t+'% true to size, '+fs.l+'% large"><span style="width:'+fs.s+'%;background:var(--gold)"></span><span style="width:'+fs.t+'%;background:var(--brand)"></span><span style="width:'+fs.l+'%;background:var(--input)"></span></div>'+
      '<div class="row between tiny muted"><span>Small '+fs.s+'%</span><span>True to size '+fs.t+'%</span><span>Large '+fs.l+'%</span></div>'+
      '<div class="xs text2 mt8">'+esc(p.fitNote)+'</div></div>'+
    '<div class="mt16"><div class="pdp-lbl">Customers like you</div><div class="xs muted">Buyers close to your height and weight</div><div class="pdp-cly">'+people+'</div></div>'+
    '</div>'+
  '</div></div>';
}
function pdp_infoT3(p, u){
  if(pdp_sb()) return pdp_infoSB(p, u, 'T3');
  var one = pdp_isOne(p);
  return pdp_header(p,u,'T3')+(one ? '' : pdp_t3Card(p,u))+pdp_colour(p,u)+(one ? pdp_sizeBlock(p,u) : '')+pdp_nudges(p)+'<div class="pdp-sec pdp-stocksec">'+pdp_stockLine(p,u)+'</div>'+pdp_ctas()+pdp_trust()+pdp_waFab(p);
}

/* ---------- details (rules + accordions) ---------- */
function pdp_acc(u, k, title, body){
  var st = u.acc[k], open = !!st, peek = st==='peek';
  return '<div class="pdp-acc'+(peek?' peek':'')+'"><button type="button" class="pdp-acc-h" data-act="pdp-acc" data-k="'+k+'" aria-expanded="'+open+'">'+esc(title)+ico(open?'minus':'plus',18)+'</button>'+(open?'<div class="pdp-acc-b small text2">'+body+(peek?'<button type="button" class="link pdp-accmore" data-act="pdp-acc" data-k="'+k+'">Read more</button>':'')+'</div>':'')+'</div>';
}
function pdp_details(p, u){
  var one = pdp_isOne(p);
  var fabric = '<div class="acc-first"><span class="bold" style="color:var(--ink)">Fabric</span><br>'+esc(p.fabric)+'</div><div class="mt12"><span class="bold" style="color:var(--ink)">Care</span><ul>'+String(p.care||'').split(' · ').map(function(x){ return '<li>'+esc(x)+'</li>'; }).join('')+'</ul></div>';
  var fit = '<div><span class="bold" style="color:var(--ink)">Fit:</span> '+esc(p.fit)+'</div>'+
    (p.hasModel && p.model ? '<div><span class="bold" style="color:var(--ink)">Model:</span> '+esc(p.model)+'</div>' : '')+
    '<div><span class="bold" style="color:var(--ink)">Note:</span> '+esc(p.fitNote)+'</div>'+
    (one ? '' : '<div class="mt12">'+pdp_fitBar(p)+'</div><div class="row wrap mt12" style="gap:8px"><button type="button" class="btn btn-sm btn-ghost" data-act="pdp-open-chart">'+ico('ruler',15)+'Size chart</button><button type="button" class="btn btn-sm btn-ghost" data-act="pdp-open-finder">Find my size</button></div>');
  var desc = '<p style="margin:0">'+esc(p.desc)+'</p><div class="mt8">Collection: '+esc(p.collection)+' · Made in Bangladesh</div>';
  var piece = {
    info:function(){ return pdp_rulesRow(p); },
    desc:function(){ return '<div class="pdp-box">'+pdp_acc(u,'fabric','Fabric & care',fabric)+pdp_acc(u,'fit','Size & fit',fit)+pdp_acc(u,'desc','Description',desc)+'</div>'; },
    /* Blog QA U3 / PR 591 (Shilpi): "How to care for this" → the matching care guide (73-blog.js) */
    care:function(){ return typeof bfCareLink==='function' ? bfCareLink(p) : ''; }
  };
  /* PR 598: the owner's order and device switches for the details column */
  return '<div class="stack s16">'+pdp_order('details', PDP_ZONES.details).filter(pdp_blockOn).map(function(id){ return piece[id](); }).join('')+'</div>';
}

/* 42. Three columns, and because only one of them can ever be open the detail
   text leaves its column and runs the full width of the box, line by line,
   from under Delivery across to Returns — instead of a tall narrow strip. */
function pdp_rulesRow(p){
  var defs = [['delivery','truck','Delivery'], ['exchange','swap','Exchange'], ['no-return','info','Returns']];
  var openId = null;
  var cells = defs.map(function(d){
    var key = 'rule:'+d[0]+':pdp', open = !!UI[key]; if(open) openId = d[0];
    var v = ruleValue(d[0], p);
    return '<div class="pdp-rule'+(open?' on':'')+'">'+
      '<span class="pdp-ric">'+ico(d[1],17)+'</span>'+
      '<span class="pdp-rule-h">'+esc(d[2])+'</span>'+
      '<span class="pdp-rule-s">'+esc(ruleText(d[0],'short'))+'</span>'+
      '<button class="link rule-v'+(v.hot?' hot':'')+'" data-act="rule-detail" data-key="'+esc(key)+'">'+(open?'Hide':esc(v.text))+'</button>'+
    '</div>';
  }).join('');
  /* P11. The detail text used to be one pre-line block: the left edge lined up
     but the right was ragged to 140px — "Inside Dhaka City: ৳80…" stopped at
     251px while the refusal sentence ran to 392 and spilled a second line back
     to the margin, so the ৳80 / ৳120 / 72-hour lines read as broken prose.
     Each sentence is its own row now, with a marker and a hanging indent, so a
     sentence that needs two lines stays inside its own block instead of
     restarting at the left edge — and .pdp-rule-ln balances the wrap, which
     takes the measured spread from 140px down to about half that. */
  var full = openId ? String(ruleText(openId,'full')).split('\n').filter(function(x){ return x.trim(); }) : [];
  return '<div class="pdp-box pdp-rules" data-testid="pdp-rules">'+cells+
    (openId ? '<div class="pdp-rule-open small" data-testid="rule-open">'+
       full.map(function(l){ return '<span class="pdp-rule-ln">'+esc(l.trim())+'</span>'; }).join('')+'</div>' : '')+
    /* R15 note 23.9: trial at the door — the owner's setting and words */
    (typeof trialLineHTML==='function' ? trialLineHTML('pdp-trial', 'pdp-trial') : '')+'</div>';
}

/* ---------- reviews, Q&A, cross-sell ---------- */
var PDP_REV_BOTTOM = ['Used Find my size and took {s} — perfect waist. Colour is exactly like the daylight photo.', 'Stretch is comfortable for a full office day. Ordering another colour.', 'Good fabric. I have bigger thighs, a bit snug — go up if you like it loose.'];
var PDP_REV_ACC = ['Soft and comfortable. Colours exactly like the photo.', 'Good quality for the price. Ordering another one.', 'Nice, but a little tight after the first wash.'];
function pdp_reviewsSection(p){
  var one = pdp_isOne(p), grp = (CAT(p.cat)||{}).group, fs = pdp_fitStats(p);
  /* 18+44. Five at most, the ones with a photo first — a buyer photo is the
     single most persuasive thing on the page, so it must not sit last. They run
     across in a slider now instead of stacking down the page. */
  var rt = pdp_rating(p), real = rt.real ? pdp_realReviews(p).slice(0,5).map(function(r){
    return {stars:r.rating||0, name:r.name, h:r.height||'', w:r.weight ? r.weight+' kg' : '', size:r.size||'', fit:'', text:r.text||'', photo:false, verified:!!r.verified, own:true};
  }) : null;
  var src = real || DB.reviewsSample.slice(0,5).slice().sort(function(a,b){ return (b.photo?1:0)-(a.photo?1:0); });
  var list = src.map(function(r, i){
    var size = r.size, text = r.text;
    if(r.own){}
    else if(grp==='bottom'){ var map = {S:0, M:0, L:1, XL:2, XXL:3}; size = p.sizes[Math.min(p.sizes.length-1, map[r.size]||0)]; text = PDP_REV_BOTTOM[i % PDP_REV_BOTTOM.length].replace('{s}', size); }
    else if(one) text = PDP_REV_ACC[i % PDP_REV_ACC.length];
    else if(p.cat!=='polos' && i===1) text = 'Keeps its shape after many washes. Ordering another colour.';
    return '<article class="pdp-box p16">'+
      '<div class="row between wrap" style="gap:8px"><div class="row" style="gap:8px">'+starsHTML(r.stars,13)+'<span class="small bold">'+esc(r.name)+'</span></div>'+(r.own && !r.verified ? '' : '<span class="tag">'+ico('check',12)+'Verified buyer</span>')+'</div>'+
      (r.own ? '<div class="row wrap xs text2 mt8" style="gap:6px">'+esc([r.h, r.w, (!one && size) ? 'bought '+size : ''].filter(Boolean).join(' · '))+'</div>'
             : '<div class="row wrap xs text2 mt8" style="gap:6px">'+esc(r.h)+' · '+esc(r.w)+(one?'':' · bought '+esc(size)+' <span class="tag'+(r.fit==='Just right'?'':' warn')+'">'+esc(r.fit)+'</span>')+'</div>')+
      '<p class="small" style="margin:10px 0 0;line-height:1.55">'+esc(text)+'</p>'+
      (r.photo ? '<div class="pdp-rev-photo">'+productImg(p, p.colors[i % p.colors.length], {view:'model', ratio:'ratio-11', labelText:'[ buyer photo ]'})+'</div>' : '')+
    '</article>';
  }).join('');
  var summary = '<div class="pdp-box p20">'+
    '<div class="row" style="gap:14px;align-items:flex-end"><div class="pdp-avg">'+Number(rt.avg).toFixed(1)+'</div><div>'+starsHTML(rt.avg,16)+'<div class="xs muted mt8">'+rt.n+' reviews</div></div></div>'+
    (one ? '' : '<div class="mt16"><div class="row between xs"><span class="bold">Fit from reviews</span><span class="text2">'+fs.t+'% true to size</span></div><div class="mt12">'+pdp_fitBar(p)+'</div></div>')+
    '<p class="xs muted" style="margin:16px 0 0;line-height:1.5">Only buyers can review — from My account after delivery. Reviews appear after our check.</p>'+
  '</div>';
  return '<section class="section" id="pdp-reviews"><div class="container"><div class="sec-hd"><h2 class="h2">Reviews</h2><button type="button" class="link" data-act="pdp-scroll" data-to="pdp-qa">Questions?</button></div>'+
    '<div class="pdp-revgrid">'+summary+
      '<div class="pdp-revlist pdp-slide" id="sl-reviews" data-speed="20" data-testid="reviews-slider">'+list+'</div>'+
    '</div></div></section>';
}
/* ====== P10. THE SECOND QUESTION BLOCK =================================
   The owner asked for a second question on EVERY product, covering the
   questions customers actually ask about THAT garment, with every answer
   inside the one block — not one generic block copied onto fifteen pages.

   The copy below is written per garment and then filled from the product's
   own record: its fabric line, its care line, how many colours it comes in,
   the live exchange window and the live delivery days. So the Oxford shirt
   answers about ironing and tucking in, the panjabi about Eid and voile, the
   hoodie about Bangladeshi winter — and when the owner edits a fabric or a
   delivery charge in the dashboard the answers follow.

   TO ADD A GARMENT: add a key to PDP_QA. The key is the category's `garment`
   (see DB.categories). A garment with no entry falls back to PDP_QA._any, so
   a category that does not exist yet still gets a real block on day one.
   ===================================================================== */
function pdp_qaGsm(p){ var m = String(p.fabric||'').match(/(\d{2,3})\s*GSM/i); return m ? m[1]+' GSM' : ''; }
var PDP_QA = {
  polo: function(p){ return [
    ['Will the collar go soft after a few washes?',
     'No. The collar is knitted separately and ribbed, so it keeps its own edge. Wash cold, dry in shade, and do not press the collar flat — that is what breaks a polo collar, not the washing.'],
    ['Is it comfortable in Dhaka heat?',
     'Yes. '+(/piqu/i.test(p.fabric||'') ? 'Piqué is knitted with tiny air holes, so it breathes' : 'It is a breathable cotton knit')+(pdp_qaGsm(p)?' at '+pdp_qaGsm(p):'')+'. Customers wear this one from March right through October.'],
    ['Does the colour run in the first wash?',
     'The yarn is dyed before it is knitted, so it does not bleed into other clothes. Still wash it on its own the first time — that is good practice with any dark cotton.'],
    ['Can I wear it to the office?',
     'With chinos, yes. '+esc_plain(p.fit)+', so it sits clean under a jacket. With denim it reads as weekend.']
  ]; },
  tee: function(p){ return [
    ['Will it shrink?',
     'The cotton is pre-shrunk, so expect no more than a centimetre in the body after the first wash. Wash cold and dry in shade and it will stay where it is.'],
    ['Is the fabric see-through?',
     (pdp_qaGsm(p) ? 'No — it is '+pdp_qaGsm(p)+', which is a solid everyday weight.' : 'No — it is a solid everyday weight.')+' White is the thinnest of our colours, but still not sheer over a vest.'],
    ['Does the neck lose its shape?',
     'The neck rib is double-stitched and taped across the shoulders. Pull it over your head rather than dragging it off by the collar and it holds.'],
    ['How should I wash it?',
     esc_plain(p.care)+'. No hot water, no dryer.']
  ]; },
  shirt: function(p){ return [
    ['Does it need ironing every time?',
     /oxford/i.test(p.fabric||'') ? 'Oxford weave is forgiving — hang it straight off the line and it drops most of its creases. A medium iron on the collar and cuffs is usually enough.'
       : 'Linen creases, that is the fabric doing its job. Hang it damp and a light press on the collar and cuffs is enough.'],
    ['Is it long enough to stay tucked in?',
     'Yes. The back hem is cut longer than the front, so it stays in through a full day at a desk. It also sits correctly untucked with chinos.'],
    ['Will it be too hot for summer?',
     /linen/i.test(p.fabric||'') ? 'No — '+esc_plain(p.fabric)+' is one of the coolest things you can wear in Dhaka.' : 'It is pure cotton, so it breathes. For the hottest weeks our linen-blend shirt is cooler still.'],
    ['Can I wear it to a wedding or an office meeting?',
     'Office, interviews and dinner — yes. For a wedding most customers go for a panjabi instead.']
  ]; },
  panjabi: function(p){ return [
    ['Is a pyjama included?',
     'No — the panjabi is sold on its own, so you can match it to the pyjama or the trousers you already own. White and off-white pyjamas go with all of our colours.'],
    ['Will it be ready in time for Eid?',
     'Order before the Eid cut-off shown on the home page and it reaches you inside Dhaka within '+esc_plain(SET('delivery','insideHours'))+' hours, outside Dhaka within '+esc_plain(SET('delivery','outsideHours'))+' hours. Closer to Eid, order early — courier queues get long.'],
    ['How do I iron cotton voile?',
     esc_plain(p.care)+'. Press it slightly damp on the reverse side; a hot dry iron will flatten the self-stripe.'],
    ['Where does the hem fall?',
     esc_plain(p.fitNote)+'. On a 5\'9" frame it lands just above the knee. Tap a size above to see the exact length in inches.']
  ]; },
  trouser: function(p){ return [
    ['Can I get the length altered?',
     'Yes, and most customers do. Any tailor can shorten the hem — the fabric is '+esc_plain(p.fabric).toLowerCase()+', which takes a hem cleanly. We do not alter before dispatch.'],
    ['Is the waist true to my usual size?',
     esc_plain(p.fitNote)+'. Measure a pair you already wear across the flat waistband and double it, then match it to the size chart above.'],
    ['Does the stretch fade?',
     /stretch/i.test(p.fabric||'') ? 'The stretch is spun into the yarn, not a coating, so it stays. Avoid hot water and the dryer and it keeps its recovery.' : 'There is no elastane in this one — it is a woven twill that softens with wear rather than stretching out.'],
    ['Are the pockets deep enough for a phone?',
     'Yes. Both front pockets take a large phone, and the back pockets button.']
  ]; },
  hoodie: function(p){ return [
    ['Is it warm enough for a Bangladeshi winter?',
     (pdp_qaGsm(p) ? 'At '+pdp_qaGsm(p)+' it is' : 'It is')+' heavy brushed fleece — right for December and January here, and for an air-conditioned office all year.'],
    ['Does the fleece pill after washing?',
     'Wash it inside out and cold, as the care line says, and it will not. Hot water and a dryer are what raise pills on brushed cotton.'],
    ['Is the hood lined?',
     'Yes, the hood is double-layered, so it keeps its shape instead of collapsing flat on your back.'],
    ['Will it shrink in the body?',
     'The fleece is pre-shrunk. '+esc_plain(p.fitNote)+'. If you want to layer a shirt under it, take one size up.']
  ]; },
  socks: function(p){ return [
    ['What sizes do these fit?', esc_plain(p.fitNote)+'. The ribbed leg stretches, so one pack covers most adult feet.'],
    ['Do they lose elasticity?', 'The cuff is knitted with stretch yarn. Machine wash, no dryer, and they stay up.'],
    ['Which colours are in the pack?', 'A mixed pack of three — the colours are shown in the photos above.'],
    ['Can I exchange a pack?', 'Socks are a hygiene item, so they are not exchangeable once the pack is opened. Unopened packs follow the normal '+esc_plain(SET('exchange','windowHours'))+'-hour rule.']
  ]; },
  belt: function(p){ return [
    ['Which waist does it fit?', esc_plain(p.fitNote)+'. If you are between holes, the strap can be cut shorter at the buckle end.'],
    ['Is it real leather?', 'No — it is '+esc_plain(p.fabric).toLowerCase()+'. It wipes clean and does not crack in humidity, which real leather often does here.'],
    ['Does it go with both chinos and jeans?', 'Yes. The buckle is a plain metal frame, which is why it works with office chinos and with denim.'],
    ['How do I look after it?', esc_plain(p.care)+'. Do not soak it.']
  ]; },
  _any: function(p){ return [
    ['What is it made of?', esc_plain(p.fabric)+'.'],
    ['How do I wash it?', esc_plain(p.care)+'.'],
    ['How does it fit?', esc_plain(p.fit)+'. '+esc_plain(p.fitNote)+'.'],
    ['What if the size is wrong?', 'A '+esc_plain(SET('exchange','windowHours'))+'-hour size swap. Tell us on WhatsApp and we arrange the pickup.']
  ]; }
};
/* the templates above build plain strings; this keeps them readable */
function esc_plain(x){ return String(x==null ? '' : x).replace(/\s+$/,'').replace(/\.$/,''); }

/* the two questions every product answers from its own record, appended to
   the garment list so no block is ever short */
function pdp_qaCommon(p){
  var out = [];
  if(p.colors.length>1) out.push(['Is the colour the same as the photo?',
    'The last photo in the strip above is shot in daylight with no filter, which is the closest we can get to the real thing. '+p.colors.length+' colours in this style — tap "All '+p.colors.length+' colours" to see each one.']);
  out.push(['What if the size is wrong when it arrives?',
    'A '+SET('exchange','windowHours')+'-hour size swap, free inside Dhaka. Message us on WhatsApp with your order number and we send the courier back for it.']);
  out.push(['Is cash on delivery available?',
    'Yes, all over Bangladesh — and bKash, Nagad and card if you prefer. Inside Dhaka ৳'+SET('delivery','inside')+', outside Dhaka ৳'+SET('delivery','outside')+', free over ৳'+SET('delivery','freeOver')+'.']);
  return out;
}
/* the questions only THIS style can answer: its own description, and its own
   fit note when it is not a plain "true to size". This is what keeps six polo
   pages from carrying six identical blocks. */
function pdp_qaSignature(p){
  var out = [], fn = String(p.fitNote||'').replace(/\.$/,'');
  if(!pdp_isOne(p) && /small|size up|size down|roomy|relaxed|slim|knee/i.test(fn)){
    out.push(['Should I take my usual size in this one?',
      fn+'. If you are between two sizes, use Find my size above — it reads your height and weight against this exact chart.']);
  }
  if(p.desc) out.push([p.cat==='extras' ? 'What should I know about this one?'
    : 'What makes this one different from the other '+pdp_noun(p)+'s?', String(p.desc)]);
  return out;
}
function pdp_qaList(p){
  var g = p.garment || (CAT(p.cat)||{}).garment || '';
  var build = PDP_QA[g] || PDP_QA._any;
  var list;
  try{ list = build(p) || []; }catch(e){ list = PDP_QA._any(p); }
  var sig = pdp_qaSignature(p);
  /* garment question first, then what is unique to this style, then the rest */
  return list.slice(0,1).concat(sig, list.slice(1), pdp_qaCommon(p)).slice(0, 6);
}
function pdp_qaSection(p){
  var ch = chartFor(p), q, a;
  if(ch){ var r = recommendSize(ch, 68, 72);
    q = 'I\'m 5\'8" and 72 kg. Which '+(ch.type==='bottom'?'waist size':'size')+' should I take?';
    a = 'In this '+p.fit.toLowerCase()+' we suggest '+r.size+' ('+ch.fields[0].toLowerCase()+' '+ch.rows[r.size][0]+'").'+(r.next!==r.size?' If you like it roomy, take '+r.next+'.':'')+' You can also use Find my size above.';
  } else { q = 'What size is this?'; a = 'One size. '+p.fitNote; }
  /* folded, every one of them: the block above it already shows a full
     question AND its answer, so this reads as a list of six more the
     customer can open — and six closed rows cost the page 55px instead of
     the 300 the six open answers would. The text is in the DOM either way. */
  /* R14 · 14.14. Six questions was too many for the owner: three show, the
     rest wait behind one button. Revealed ones arrive folded like the first
     three — question only, the + opens the answer. All six stay in the DOM
     (hidden ones carry the `hidden` attribute), so nothing is lost to search. */
  var u0 = pdp_state(p, CUR.query), list = pdp_qaList(p), SHOWN_QA = 3;
  var all = !!u0.qaAll || list.length <= SHOWN_QA;
  var more = list.map(function(x, i){
    return '<details class="pdp-qa-i"'+(i>=SHOWN_QA && !all ? ' hidden' : '')+'><summary><span class="pdp-qa-q">'+esc(x[0])+'</span>'+ico('plus',16)+'</summary>'+
      '<div class="pdp-qa-a small text2">'+esc(x[1])+'</div></details>';
  }).join('') + (all ? '' : '<button type="button" class="pdp-qa-all" data-act="pdp-qa-all" data-testid="qa-all" aria-expanded="false">'+
      '<span>'+esc(t('See all questions'))+'</span><span class="pdp-qa-n">'+(list.length-SHOWN_QA)+' more</span>'+ico('down',16)+'</button>');
  return '<section class="section" id="pdp-qa"><div class="container"><div class="sec-hd"><h2 class="h2">Questions & answers</h2></div>'+
    '<div class="split"><div class="pdp-box p20"><div class="row top" style="gap:12px"><span class="tag dark">Q</span><div class="small bold">'+esc(q)+'</div></div>'+
      '<div class="row top mt12" style="gap:12px"><span class="tag">A</span><div><div class="small text2">'+esc(a)+'</div><div class="xs muted mt8">Answered by the EXTAS team · 2 days ago</div></div></div>'+
      '<div class="pdp-qa-wa dkb-qawa hide-m"><p class="xs muted" style="margin:0 0 10px">Not answered here? We reply 10 am – 10 pm.</p>'+waButton('Ask on WhatsApp', 'Hi EXTAS, I have a question about '+p.name+' ('+pdp_sku(p)+')')+'</div></div>'+
    '<div class="pdp-box p20 pdp-qa-more" data-testid="pdp-qa-more"><div class="h3">Common questions about this '+esc(pdp_noun(p))+'</div>'+more+
      '<div class="pdp-qa-wa hide-d"><p class="xs muted" style="margin:0 0 10px">Not answered here? We reply 10 am – 10 pm.</p>'+
      waButton('Ask on WhatsApp', 'Hi EXTAS, I have a question about '+p.name+' ('+pdp_sku(p)+')')+'</div></div></div></div></section>';
}
function pdp_pairs(p){
  var grp = (CAT(p.cat)||{}).group;
  var order = grp==='bottom' ? ['polos','shirts','tshirts','hoodies','panjabi','extras'] : grp==='top' ? ['trousers','polos','shirts','tshirts','hoodies','extras','panjabi'] : ['polos','trousers','tshirts','shirts'];
  order = order.filter(function(c){ return c!==p.cat; });
  var picks = [];
  for(var round=0; round<3 && picks.length<4; round++) order.forEach(function(cid){ if(picks.length>=4) return; var l = productsIn(cid); if(l[round]) picks.push(l[round]); });
  return picks;
}
/* ====== BACK-END HOOK ======================================================
   45. Two rows at the foot of the page, one category each, both sliding on
   their own. These two category ids are the only thing the back end has to
   decide: swap this function for the bought-together / best-seller call and
   everything below keeps working. Return [catId, catId].
   ========================================================================= */
function pdp_rowCats(p){
  var grp = (CAT(p.cat)||{}).group;
  var order = grp==='bottom' ? ['polos','shirts','tshirts','hoodies','panjabi']
            : grp==='top'    ? ['trousers','shirts','polos','tshirts','hoodies']
                             : ['polos','trousers','tshirts','shirts'];
  var out = [];
  order.forEach(function(cid){ if(out.length<2 && cid!==p.cat && productsIn(cid).length) out.push(cid); });
  if(out.length<2 && productsIn(p.cat).length>1) out.push(p.cat);
  return out;
}
function pdp_row(title, link, items, testid, cls){
  if(!items.length) return '';
  return '<div class="pdp-rowblk'+(cls?' '+cls:'')+'"><div class="sec-hd"><h2 class="h2">'+esc(title)+'</h2>'+(link||'')+'</div>'+
    '<div class="pdp-slide pdp-prow-s" id="sl-'+testid+'" data-speed="24" data-testid="'+testid+'" data-n="'+items.length+'">'+
      items.map(function(x){ return productCard(x); }).join('')+'</div></div>';
}
/* D-029 (desktop). A desktop row shows exactly DKB_ROW_COLS cards per view and
   glides when it holds more (R2). A row with fewer cards than that would leave
   an empty strip on the right (R1), so on desktop only:
     1. short rows are merged with the next short row (one heading, both names);
     2. a row that is still short is topped up with other pairings for this
        product that are not on the page yet ("& more" in its heading).
   The phone rows are unchanged; the desktop set is drawn only when it differs. */
var DKB_ROW_COLS = 4;
function pdp_deskRows(p, rows){
  var N = DKB_ROW_COLS, out = [], used = {}, i, r;
  rows.forEach(function(x){ x.items.forEach(function(it){ used[it.id] = 1; }); });
  for(i=0; i<rows.length; i++){
    r = {title:rows[i].title, cids:[rows[i].cid], items:rows[i].items.slice(), first:i};
    while(r.items.length < N && rows[i+1] && rows[i+1].items.length < N){
      i++; r.cids.push(rows[i].cid);
      rows[i].items.forEach(function(it){ if(r.items.indexOf(it)<0) r.items.push(it); });
    }
    out.push(r);
  }
  var changed = out.length !== rows.length;
  out.forEach(function(r){
    var names = r.cids.map(function(cid){ var c = CAT(cid); return c ? t(c.name) : cid; });
    var lead = r.first===0 ? 'Goes well with · ' : 'You may also like · ';
    if(r.cids.length>1) r.title = lead+names.join(' & ');
    if(r.items.length < N){
      var extra = pdp_pairs(p).concat(DB.products.filter(function(x){ return !x.hidden; }))
        .filter(function(x){ return x.id!==p.id && !used[x.id]; });
      while(r.items.length < N && extra.length){ var x = extra.shift(); if(used[x.id]) continue; used[x.id] = 1; r.items.push(x); }
      r.title = lead+names.join(' & ')+' & more'; changed = true;
    }
    r.link = '<a class="link" href="#/c/'+r.cids[0]+'">See all</a>';
  });
  return changed ? out : null;
}
function pdp_pairsSection(p){
  var cats = pdp_rowCats(p), out = '', rows = [];
  cats.forEach(function(cid, i){
    var c = CAT(cid) || {name:cid};
    var items = productsIn(cid).filter(function(x){ return x.id!==p.id; }).slice(0,6);
    if(items.length) rows.push({cid:cid, items:items, title:(i===0 ? 'Goes well with · '+t(c.name) : 'You may also like · '+t(c.name))});
  });
  var desk = pdp_deskRows(p, rows);
  rows.forEach(function(r, i){
    out += pdp_row(r.title, '<a class="link" href="#/c/'+r.cid+'">See all</a>', r.items, 'pairs-row-'+(i+1), desk ? 'hide-d' : '');
  });
  if(desk) desk.forEach(function(r, i){ out += pdp_row(r.title, r.link, r.items, 'pairs-row-d'+(i+1), 'hide-m dkb-row'); });
  if(!out) return '';
  return '<section class="section" id="pdp-pairs" data-testid="pdp-pairs"><div class="container">'+out+'</div></section>';
}
function pdp_recentSection(p){
  var ids = (ST.recent||[]).filter(function(id){ return id!==p.id && P(id); }).slice(0,6);
  if(!ids.length) return '';
  return '<section class="section'+(ids.length < DKB_ROW_COLS ? ' dkb-few' : '')+'"><div class="container"><div class="sec-hd"><h2 class="h2">Recently viewed</h2></div>'+
    '<div class="pdp-rv pdp-slide" id="sl-recent" data-speed="22" data-testid="recent-slider">'+ids.map(function(id){ return productCard(P(id)); }).join('')+'</div></div></section>';
}

/* ---------- modals ---------- */
function pdp_finderHTML(){
  var c = pdp_cur(); if(!c) return ''; var p = c.p, u = c.u, ch = chartFor(p); if(!ch) return '';
  if(u.fStep==='result'){
    var rec = recommendSize(ch, u.fH, u.fW), cn = COL(u.color).name, n = stockOf(p.id, u.color, rec.size);
    var stock = n>0 ? '<div class="xs brandc bold row mt12" style="gap:6px">'+ico('check',14)+esc(rec.size)+' is in stock in '+esc(cn)+'</div>' : (function(){
      var alt = p.colors.filter(function(x){ return x!==u.color && stockOf(p.id, x, rec.size)>0; });
      return '<div class="warnbox p16 small mt12">'+esc(rec.size)+' is out of stock in '+esc(cn)+'.'+(alt.length?' In stock in:<div class="row wrap mt8" style="gap:8px">'+alt.map(function(x){ return '<button type="button" class="chip" data-act="pdp-fcolor" data-c="'+x+'"><span class="swatch sm" style="background:'+COL(x).hex+'"></span>'+esc(COL(x).name)+'</button>'; }).join('')+'</div>':' Message us on WhatsApp — we will tell you when it is back.')+'</div>';
    })();
    return '<div class="pdp-res" data-testid="finder-result"><div class="row between top"><div><div class="eyebrow">Your size · '+esc(ch.name)+'</div><div class="pdp-res-size mt8">'+esc(rec.size)+'</div><div class="small text2 mt8">For '+esc(pdp_ftin(u.fH))+' · '+u.fW+' kg</div></div>'+
        '<button type="button" class="pdp-unit" data-act="pdp-unit-toggle" aria-label="'+(u.cm?'Show in inches':'Show in centimetres')+'">'+(u.cm?'inches':'cm')+'</button></div>'+
        pdp_whyList(pdp_reasons(p, rec, u.fH, u.fW, u.cm))+'</div>'+
      (rec.next!==rec.size ? '<div class="soft p16 small mt12">Between sizes or like it roomy? <button type="button" class="link" data-act="pdp-f-select" data-size="'+esc(rec.next)+'">Take '+esc(rec.next)+'</button></div>' : '<div class="soft p16 small mt12">This is our largest size in this fit. Not sure? Ask us on WhatsApp.</div>')+
      stock+
      '<div class="row mt16" style="gap:10px"><button type="button" class="btn btn-ghost" data-act="pdp-f-change">Change answers</button><button type="button" class="btn btn-primary grow" data-act="pdp-f-select" data-size="'+esc(rec.size)+'" data-testid="finder-select">Select size '+esc(rec.size)+'</button></div>';
  }
  return '<div class="small text2">Two quick questions — we match you to our <b style="color:var(--ink)">'+esc(ch.name)+'</b> size chart.</div>'+
    '<div class="mt16">'+pdp_stepperBlock('m', u)+'</div>'+
    '<button type="button" class="btn btn-primary btn-block mt24" data-act="pdp-f-show" data-testid="finder-show">Show my size</button>'+
    '<div class="xs muted center mt12">Only height and weight. Saved on this phone for next time.</div>';
}
/* 37. Its own, roomier sheet — bigger type and a taller window, because the
   numbers in it are the whole reason the customer opened it. */
function pdp_openFinder(){ var c = pdp_cur(); if(!c || pdp_isOne(c.p)) return; openModal(pdp_finderHTML(), {title:'Find my size', rebuild:pdp_finderHTML, cls:'pdp-sheet'}); }

function pdp_chartHTML(){
  var c = pdp_cur(); if(!c) return ''; var p = c.p, u = c.u, ch = chartFor(p); if(!ch) return '';
  var ms = mySizeFor(p), cn = COL(u.color).name;
  /* Only show a measurement column when this product actually has that measurement.
     A polo with just chest and length shows two columns, not four empty ones. */
  var live = p.sizes.filter(function(s){ return ch.rows[s]; });
  var keep = ch.fields.map(function(f,i){
    return live.some(function(s){ var v = ch.rows[s][i]; return v!==undefined && v!==null && v!=='' && v!==0; }) ? i : -1;
  }).filter(function(i){ return i>=0; });
  var head = '<tr><th scope="col">Size</th>'+keep.map(function(i){ return '<th scope="col">'+esc(ch.fields[i])+'</th>'; }).join('')+'</tr>';
  var rows = p.sizes.filter(function(s){ return ch.rows[s]; }).map(function(s){
    var out = stockOf(p.id, u.color, s)<=0, sel = u.size===s;
    return '<tr class="pick'+(sel?' sel':'')+(out?' out':'')+'" data-act="pdp-chart-pick" data-size="'+esc(s)+'">'+
      '<td><button type="button" class="pdp-rowbtn" data-act="pdp-chart-pick" data-size="'+esc(s)+'" aria-label="'+(out?'Size '+esc(s)+', out of stock in '+esc(cn):'Select size '+esc(s))+'">'+esc(s)+'</button>'+(ms===s?'<div><span class="pdp-ystag-in" style="margin:0">Your size</span></div>':'')+(out?'<div class="oos">out of stock in '+esc(cn)+'</div>':'')+'</td>'+
      keep.map(function(i){ return '<td>'+esc(fmtMeasure(ch.rows[s][i], u.cm))+'</td>'; }).join('')+'</tr>';
  }).join('');
  var HOWTO = {
    chest:'under the arms, around the fullest part of the chest.',
    length:'from the highest point of the shoulder down to the hem.',
    shoulder:'seam to seam across the back.',
    sleeve:'from the shoulder seam to the sleeve end.',
    waist:'around where you wear your trousers.',
    hip:'around the fullest part of your seat.',
    inseam:'from the crotch seam down to the hem.',
    thigh:'around the widest part of the thigh.',
    bottom:'straight across the leg opening.'
  };
  var how = keep.map(function(i){
    var f = ch.fields[i], k = String(f).toLowerCase().replace(/[^a-z]/g,'');
    var tip = HOWTO[k]; return tip ? '<li><b>'+esc(f)+'</b> — '+tip+'</li>' : '';
  }).join('');
  return '<div class="row between wrap" style="gap:10px"><div><div class="h3">'+esc(ch.name)+'</div><div class="xs muted">Garment measurements · stock shown for '+esc(cn)+'</div></div>'+
      '<div class="seg" role="group" aria-label="Units"><button type="button" class="'+(u.cm?'':'on')+'" data-act="pdp-unit" data-v="in" aria-pressed="'+!u.cm+'">inches</button><button type="button" class="'+(u.cm?'on':'')+'" data-act="pdp-unit" data-v="cm" aria-pressed="'+u.cm+'">cm</button></div></div>'+
    '<div class="xs text2 mt12">'+dkb_pair('Tap a size to choose it.', 'Click a size to choose it.')+'</div>'+
    '<div class="tbl-wrap mt8"><table class="tbl pdp-chart" data-testid="chart-table"><thead>'+head+'</thead><tbody>'+rows+'</tbody></table></div>'+
    '<div class="pdp-chartft mt12"><button type="button" class="chart-opt" data-act="pdp-open-finder">'+ico('ruler',18)+'<span><b>Not sure?</b><span>Find my size</span></span></button>'+
    '<a class="chart-opt wa" href="'+waLink('Hi EXTAS, I need size help for '+p.name+' ('+pdp_sku(p)+')')+'" target="_blank" rel="noopener">'+waGlyph(18)+'<span><b>Still unsure?</b><span>Ask on WhatsApp</span></span></a></div>'+
    '<div class="soft p16 mt16 small chart-how"><div class="bold">How to measure</div><ul style="margin:8px 0 0;padding-left:18px;line-height:1.6" class="text2">'+how+'</ul><div class="xs muted mt8">Tip: lay a '+(ch.type==='bottom'?'pair of trousers':'shirt')+' you like flat and compare with the table.</div></div>';
}
function pdp_openChart(){ var c = pdp_cur(); if(!c || !chartFor(c.p)) return; var d = dkb_desk(); openModal(pdp_chartHTML(), {title:'Size chart', rebuild:pdp_chartHTML, wide:d, cls:d ? 'pdp-chartd' : ''}); }

function pdp_duoFor(p){ return combos().filter(function(c){ return c.active && c.items.length>=2 && c.items.every(function(x){ return x===p.id; }); })[0] || null; }
function pdp_lineRow(p, color, size){
  return '<div class="row" style="gap:12px">'+productImg(p, color, {ratio:'ratio-45', label:false, style:'width:60px;flex-shrink:0'})+
    '<div class="grow"><div class="small bold">'+esc(p.name)+'</div><div class="xs text2">'+esc(COL(color).name)+(pdp_isOne(p)?'':' · Size '+esc(size))+'</div></div><div class="price small">'+fmt(p.price)+'</div></div>';
}
function pdp_bagModalHTML(){
  var c = pdp_cur(); if(!c || !c.u.added) return ''; var p = c.p, u = c.u, a = u.added, tot = bagTotals(), noun = pdp_noun(p);
  var rows = '<div class="stack s8">'+pdp_lineRow(p, a.color, a.size)+a.extras.map(function(x){ return pdp_lineRow(p, x, a.size); }).join('')+'</div>';
  var duo = pdp_duoFor(p), duoH = '';
  if(duo && !pdp_isOne(p)){
    var units = ST.bag.reduce(function(s, l){ return s + (l.kind==='item' && l.product===p.id ? l.qty : 0); }, 0);
    var autoN = tot.setDiscounts.filter(function(d){ return d.combo===duo.id; }).length, setN = ST.bag.filter(function(l){ return l.kind==='set' && l.refId===duo.id; }).length;
    var unpaired = units - autoN*duo.items.length;
    if(autoN+setN>0) duoH += '<div class="tint p16 small row" style="gap:10px">'+ico('check',18)+'<span><b>'+esc(duo.name)+' applied</b> — you pay '+fmt(duo.price)+' for '+duo.items.length+' '+noun+'s.</span></div>';
    if(unpaired>0){
      var cols = p.colors.filter(function(x){ return stockOf(p.id, x, a.size)>0; }).sort(function(x, y){ return (x===a.color) - (y===a.color); });
      if(cols.length) duoH += '<div class="tint p16'+(duoH?' mt8':'')+'" data-testid="duo-upsell"><div class="row top" style="gap:10px">'+ico('layers',20)+'<div><div class="bold small">Add one more '+noun+', pay '+fmt(duo.price)+' for both</div><div class="xs text2">'+esc(duo.name)+' · same size '+esc(a.size)+' · '+(dkb_desk() ? 'pick a colour' : 'tap a colour')+'</div></div></div>'+
        '<div class="row wrap mt12" style="gap:8px">'+cols.map(function(x){ return '<button type="button" class="chip" data-act="pdp-duo-add" data-c="'+x+'"><span class="swatch sm" style="background:'+COL(x).hex+'"></span>'+esc(COL(x).name)+'</button>'; }).join('')+'</div></div>';
    }
  }
  var br = bracketPairs().filter(function(b){ return b.product===p.id && b.color===a.color; })[0];
  var brH = br ? '<div class="soft p16 small row top" style="gap:10px" data-testid="bracket-note">'+ico('info',18)+'<div>You have '+esc(br.sizes[0])+' and '+esc(br.sizes[1])+' of the same item — not sure? <button type="button" class="link" data-act="pdp-open-finder">Use Find my size</button></div></div>' : '';
  var pct = tot.free ? Math.min(100, Math.round(tot.total/tot.free*100)) : 100;
  var sum = '<div class="row between small"><span class="text2">Bag · '+plural(tot.count,'item')+'</span><span class="price">'+fmt(tot.total)+'</span></div>'+
    (tot.discount>0 ? '<div class="row between xs brandc bold mt8"><span>Set savings</span><span>'+fmt(-tot.discount)+'</span></div>' : '')+
    ((typeof bag_freeDel==='function' ? !bag_freeDel(tot.total).free : tot.freeLeft>0) ? '<div class="xs text2 mt8">Add '+fmt(tot.freeLeft)+' more for free delivery</div><div class="bar-progress mt8"><div style="width:'+pct+'%"></div></div>' : '<div class="xs brandc bold row mt8" style="gap:6px">'+ico('truck',14)+esc(typeof bag_freeOrderLine==='function' ? bag_freeOrderLine() : 'Free delivery unlocked')+'</div>');
  return '<div class="stack s16" data-testid="bag-modal">'+rows+duoH+brH+'<div class="soft p16">'+sum+'</div>'+
    '<div class="pdp-bagbtns"><button type="button" class="btn btn-ghost" data-act="close-modal">Keep shopping</button><a class="btn btn-secondary" href="#/bag">View bag</a><a class="btn btn-primary" href="#/checkout">'+esc(t('Checkout'))+'</a></div>'+
    (dkb_desk() && typeof dkb_crossSell==='function' ? dkb_crossSell(pdp_pairs(p), 3) : '')+'</div>';
}

/* ---------- 26. the icon rail drifts with the scroll ----------
   It was nailed to the middle of the screen and felt dead. Now it eases about
   an inch (38px) with the direction of travel and settles back to centre a
   moment after scrolling stops. One rAF loop, no library, nothing at all when
   the visitor has asked for reduced motion. */
var PDP_DRIFT_MAX = 38;
/* 19. THE RAIL HAS A CEILING.
   The drift is still free, but the column is clamped between two lines it may
   never cross: the top of the product title (so it never climbs back onto the
   photograph) and a line just above the buy bar. Both are read fresh on every
   paint, so the ceiling travels with the page as it scrolls. */
function pdp_railClamp(off){
  var a = document.querySelector('.pdp-acts'); if(!a) return off;
  var page = document.querySelector('.pdp-page'); if(!page) return off;
  var h = a.offsetHeight; if(!h) return off;
  var base = parseFloat(getComputedStyle(a).top) || 0;   /* top:38%/50% resolved to px */
  var natural = base - h/2;
  /* the ceiling is the title's line: the rail may come down to it but never up
     past it, so it can never sit on the photograph or on the title's own words */
  var title = page.querySelector('.pdp-name');
  var ceil = title ? title.getBoundingClientRect().bottom + 2 : 0;
  var bar = document.querySelector('.pdp-mbar');
  var floor = window.innerHeight - (bar ? bar.offsetHeight : 0) - 10 - h;
  if(ceil > floor) ceil = floor;                          /* a very short screen wins */
  if(natural + off < ceil) off = ceil - natural;
  if(natural + off > floor) off = floor - natural;
  return off;
}
var PDP_RAIL = (function(){
  var cur = 0, target = 0, raf = null, stopT = null, lastY = 0, reduced = false;
  try{ reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }catch(e){}
  function paint(){
    var a = document.querySelector('.pdp-acts'); if(!a) return;
    var v = 'translateY(calc(-50% + '+pdp_railClamp(cur).toFixed(1)+'px))';
    a.style.transform = v;
    var b = document.querySelector('.shr-bar'); if(b) b.style.transform = v;
  }
  function frame(){
    cur += (target - cur) * 0.14;
    if(Math.abs(target - cur) < 0.25){ cur = target; paint(); raf = null; return; }
    paint(); raf = requestAnimationFrame(frame);
  }
  function kick(){ if(raf === null) raf = requestAnimationFrame(frame); }
  window.addEventListener('scroll', function(){
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    var d = y - lastY; lastY = y;
    if(!document.querySelector('.pdp-page')) return;
    if(reduced){ paint(); return; }                       /* no drift, but keep the ceiling */
    /* the drift follows the gesture but is capped, so it never fights the page */
    target = Math.max(-PDP_DRIFT_MAX, Math.min(PDP_DRIFT_MAX, target + d * 0.5));
    kick(); paint();
    clearTimeout(stopT);
    stopT = setTimeout(function(){ target = 0; kick(); }, 170);
  }, {passive:true});
  return {paint:paint};
})();

/* ---------- 44+45. auto-advancing sliders ----------
   Any element with data-autoslide="<ms>" scrolls itself one card along, loops
   back to the start at the end, stops the moment a finger or a mouse is on it
   and stays put for a few seconds after, and never starts under reduced motion. */
/* ---------- 44+45. sliders ----------
   Every track on this page runs on the shared SMOOTH engine from 02-core: a
   continuous glide instead of a card-by-card jump, paused while a finger or a
   mouse is on it, off entirely under reduced motion. */
function pdp_stopSliders(){ try{ SMOOTH.stopAll(); }catch(e){} }
function pdp_initSliders(){
  pdp_stopSliders();
  [].slice.call(document.querySelectorAll('.pdp-page .pdp-slide[id]')).forEach(function(el){
    SMOOTH.start(el.id, {dir:-1, speed:Number(el.getAttribute('data-speed')) || 22});
  });
}

/* ======================================================================
   33. THE FIRST-SCREEN BUDGET — one measured rule for every category.

   Nothing here knows what a polo or a panjabi is. On a phone the page asks
   one question: where does the last block of the buy column end, and how far
   is that from the top of the buy bar? The photograph is the slack in the
   system, so it absorbs the difference. A category that does not exist yet
   — jackets, sarees, anything — obeys it on the first render with no new
   code, whatever its title length, size count or template.

   >>> THE ONE PLACE A FUTURE DEVELOPER CHANGES THIS IS PDP_FIT. <<<
       clear   px of air between the last block and the buy bar
       maxVh / maxPx   the photograph's ceiling
       minPx / minVh   its floor (the smaller of the two, so a short screen
                       — an old 640px Android, a phone on its side — is
                       allowed to shrink the photo further than a tall one)
       deepVh  while the photo stays at least this tall, a deeper anchor
               (the Find-my-size card) is allowed to end the first screen
               instead of the measurement line
       anchors deepest first; the last entry is the compulsory one
   ====================================================================== */
/* P5 + P6. `clear` is the air between the last block of the buy column and the
   top of the buy bar. The owner reported twice that the measurement line was
   touching the bar: at 1.25px it was. It is 2.25px now — the line is lifted a
   full pixel and keeps more than the two pixels he asked for underneath it —
   and the pixel is paid for by the gap ABOVE the line (.pdp-fitline margin-top
   8px -> 7px in r11-pdp.css), which was 28.7px of dead air, so the photograph
   is not asked to give up a single pixel. */
/* R14 · 14.8. The owner asked for the line to rise 2–3px more: 2.25 -> 4.75.
   The engine pays for it out of the photograph, on every phone, by itself. */
var PDP_FIT = { clear:4.75, minPx:150, minVh:0.20, maxVh:0.52, maxPx:500, deepVh:0.345,
                anchors:['.pdp-fmssec', '.pdp-fitline'] };
function pdp_fitPass(page, bar){
  var shot = page.querySelector('.pdp-main .pimg') || page.querySelector('.pdp-galT2 .pimg');
  if(!shot) return true;
  var vh = (PDP_VP && PDP_VP.w === window.innerWidth && Math.abs(window.innerHeight - PDP_VP.h) < 160 ? PDP_VP.h : window.innerHeight) || 956, sy = window.pageYOffset || 0;
  var max = Math.min(PDP_FIT.maxVh*vh, PDP_FIT.maxPx), deep = PDP_FIT.deepVh*vh;
  var min = Math.max(90, Math.min(PDP_FIT.minPx, PDP_FIT.minVh*vh));
  var h0 = shot.getBoundingClientRect().height, want = null, who = '';
  for(var i=0; i<PDP_FIT.anchors.length; i++){
    var a = page.querySelector(PDP_FIT.anchors[i]); if(!a) continue;
    /* R15 · 2.8. When the measurement line ends the first screen it sits in
       the MIDDLE of the room between the size boxes and the buy bar: the air
       under it equals the air above it (its own margin-top, set in CSS). */
    var clear = (PDP_FIT.anchors[i] === '.pdp-fitline') ? (parseFloat(getComputedStyle(a).marginTop) || PDP_FIT.clear) : PDP_FIT.clear;
    var target = vh - bar.offsetHeight - clear;      /* the line the first screen ends on */
    /* document coordinates, so the answer does not depend on where we are scrolled */
    var h = h0 + (target - (a.getBoundingClientRect().bottom + sy));
    var last = (i === PDP_FIT.anchors.length-1);
    if(last){ want = Math.max(min, Math.min(max, h)); who = PDP_FIT.anchors[i]; break; }
    if(h >= deep && h <= max){ want = h; who = PDP_FIT.anchors[i]; break; }
  }
  if(want === null) return true;
  /* R15 wave 1 (tablets). On a tall screen (iPad / Android tab portrait) the
     photograph reaches its ceiling before the measurement line reaches the
     bar, so the line does NOT end the first screen — the room below it is
     just the page continuing. Say so (no anchor), instead of claiming the
     line sits at the screen's end where the centring rule would apply. */
  if(who === '.pdp-fitline' && want >= max - 0.5 && h > max + 1) who = '';
  page.setAttribute('data-fit-anchor', who);
  var done = Math.abs(want - h0) < 0.4;
  page.style.setProperty('--pdp-img', want.toFixed(2)+'px');
  return done;
}
/* ======================================================================
   R14 · AUTO-ADJUST. The owner's rule: nothing is fixed; when a line runs out
   of room its parts step down — full label -> short label -> icon — and the
   line never breaks and nothing covers anything.

   Markup contract (no widths anywhere):
     [data-fitrow]          a line that must stay one line
       .pdp-fitt            text in it that must never be cut off
       .pdp-fx              a part with shorter forms: data-l is its current
                            level, data-fx-max its last one, data-fx-ord the
                            order it gives way in (lower first). CSS shows the
                            .pf<level> child and hides the others.
   Every pass starts from the fullest form, so a wider screen (or a rotation)
   gets the long labels straight back.
   ====================================================================== */
function pdp_rowOver(row){
  var t = row.querySelectorAll('.pdp-fitt');
  for(var i=0; i<t.length; i++){ if(t[i].offsetWidth && t[i].scrollWidth > t[i].clientWidth + 0.5) return true; }
  /* (the row's own scrollWidth is NOT used: the invisible 44px finger pads
     drawn by ::before stick out of a chip by design and would read as overflow) */
  var cs = getComputedStyle(row), kids = [].filter.call(row.children, function(k){ return k.offsetWidth; });
  /* R15: nothing may end past the row's own right edge (the swatch line with
     "All N colours" after the last swatch) */
  if(kids.length){
    var rr = row.getBoundingClientRect(), edge = rr.right - (parseFloat(cs.paddingRight)||0) - (parseFloat(cs.borderRightWidth)||0);
    var far = Math.max.apply(null, kids.map(function(k){ return k.getBoundingClientRect().right; }));
    if(far > edge + 0.5) return true;
  }
  /* a horizontal line: every visible part must share one centre line */
  if(/flex/.test(cs.display) && !/column/.test(cs.flexDirection) && kids.length > 1){
    var mids = kids.map(function(k){ var r = k.getBoundingClientRect(); return r.top + r.height/2; });
    if(Math.max.apply(null, mids) - Math.min.apply(null, mids) > 12) return true;
  }
  return false;
}
function pdp_fitRows(root){
  root = root || document;
  [].slice.call(root.querySelectorAll('.pdp-page [data-fitrow]')).forEach(function(row){
    var fx = (row.classList.contains('pdp-fx') ? [row] : []).concat([].slice.call(row.querySelectorAll('.pdp-fx')).filter(function(e){ return e.closest('[data-fitrow]') === row; }));
    fx.forEach(function(e){ e.setAttribute('data-l', '0'); });
    fx.sort(function(a, b){ return (+a.getAttribute('data-fx-ord')||1) - (+b.getAttribute('data-fx-ord')||1); });
    var k = 0, guard = 12;
    while(k < fx.length && guard-- > 0 && pdp_rowOver(row)){
      var e = fx[k], l = +e.getAttribute('data-l'), max = +e.getAttribute('data-fx-max') || 1;
      if(l < max) e.setAttribute('data-l', String(l+1)); else k++;
    }
    row.setAttribute('data-fit', pdp_rowOver(row) ? 'over' : 'ok');
  });
  pdp_fitLineTrim(root);
  pdp_payFit(root);
}
/* R15 · 2.5. THE MEASUREMENT LINE IS ONE LINE. Every field starts shown; while
   the line is wider than the column the LAST field (and the dot before it)
   hides. "L fits chest up to 42"" always stays. Nothing drops to a second line.
   A wider screen gets the hidden fields straight back on the next pass. */
function pdp_fitLineTrim(root){
  [].slice.call((root||document).querySelectorAll('.pdp-page .pdp-fitx')).forEach(function(x){
    var fi = [].slice.call(x.querySelectorAll('.pdp-fi')), dots = [].slice.call(x.querySelectorAll('.pdp-fdot'));
    fi.forEach(function(e){ e.hidden = false; }); dots.forEach(function(e){ e.hidden = false; });
    var over = function(){ return x.scrollWidth > x.clientWidth + 0.5; };
    for(var k = fi.length-1; k > 0 && over(); k--){ fi[k].hidden = true; if(dots[k-1]) dots[k-1].hidden = true; }
    x.setAttribute('data-shown', String(fi.filter(function(e){ return !e.hidden; }).length));
  });
}
/* R15 · 2.6. THE PRICE LINE IS ONE LINE. The words after the bar first come
   down in half-pixel steps from the dashboard size to its minimum; only if
   they still do not fit do the last pieces hide (Card, then Nagad ...). The
   first piece always stays. Never two lines, never "…". */
function pdp_payFit(root){
  [].slice.call((root||document).querySelectorAll('.pdp-page .pdp-payfit')).forEach(function(t){
    var size = +t.getAttribute('data-size') || 14, min = +t.getAttribute('data-min') || 11.5;
    var pm = [].slice.call(t.querySelectorAll('.pdp-pm'));
    pm.forEach(function(e){ e.hidden = false; });
    t.style.fontSize = size+'px';
    var over = function(){ return t.scrollWidth > t.clientWidth + 0.5; };
    while(over() && size > min){ size = Math.max(min, size - 0.5); t.style.fontSize = size+'px'; }
    for(var k = pm.length-1; k > 0 && over(); k--) pm[k].hidden = true;
    t.setAttribute('data-shown', String(pm.filter(function(e){ return !e.hidden; }).length));
  });
}
function pdp_budget(){
  var page = document.querySelector('.pdp-page'); if(!page) return;
  pdp_fitRows(page.parentNode);
  var bar = document.querySelector('.pdp-mbar');
  if(window.innerWidth >= 1024 || !bar || !bar.offsetHeight){
    page.style.removeProperty('--pdp-img'); page.classList.remove('pdp-tight'); return;
  }
  page.classList.remove('pdp-tight');
  var i;
  for(i=0; i<4; i++){ if(pdp_fitPass(page, bar)) break; }
  /* Last resort for a very tall product on a very short screen: the photo is
     already at its floor, so the column's own gaps give up a few pixels and the
     budget is solved again. */
  var fit = page.querySelector('.pdp-fitline');
  var fitClear = fit ? (parseFloat(getComputedStyle(fit).marginTop) || PDP_FIT.clear) : PDP_FIT.clear;
  if(fit && bar && page.getAttribute('data-fit-anchor') === '.pdp-fitline' && (fit.getBoundingClientRect().bottom + (window.pageYOffset||0)) > window.innerHeight - bar.offsetHeight - fitClear + 0.6){
    page.classList.add('pdp-tight');
    for(i=0; i<4; i++){ if(pdp_fitPass(page, bar)) break; }
  }
  if(typeof PDP_RAIL !== 'undefined') PDP_RAIL.paint();
}
var pdp_fitT = null;
function pdp_budgetSoon(){ clearTimeout(pdp_fitT); pdp_fitT = setTimeout(pdp_budget, 60); }
/* R15 · 7.2. THE JOLT. On a phone the browser's own bars (and the demo
   viewer's header) slide in and out while you scroll, and every slide is a
   "resize" — the first-screen engine re-measured and resized the photo,
   so the whole page jumped a few seconds in. Only a real change re-plans
   the screen now: a new width (rotation, a different window) or a height
   change bigger than any toolbar. */
var PDP_VP = {w:window.innerWidth, h:window.innerHeight};
window.addEventListener('resize', function(){
  var w = window.innerWidth, h = window.innerHeight;
  if(w === PDP_VP.w && Math.abs(h - PDP_VP.h) < 160) return;
  PDP_VP.w = w; PDP_VP.h = h; pdp_budgetSoon();
});
window.addEventListener('orientationchange', pdp_budgetSoon);
try{ if(document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ pdp_budget(); }); }catch(e){}

/* ---------- 20. one photo index, three ways to change it ----------
   The arrows, the thumbnails and a swipe of the photograph all write the same
   u.view, so they can never disagree. The swipe is bound once on the document,
   which is why it still works after a re-render — the old handler was lost with
   the element it was attached to. */
/* ---------- P1. the strip is the single source of truth ----------
   The arrows and the thumbnails scroll it; scrolling it writes back the live
   view and repaints the thumbnail ring. Nothing here re-renders the page, so a
   drag costs no DOM work at all. */
function pdp_trkEl(){ return document.querySelector('.pdp-page .pdp-trk'); }
function pdp_trkIdx(t){
  var best = 0, bd = Infinity;
  for(var i=0; i<t.children.length; i++){
    var d = Math.abs(t.children[i].offsetLeft - t.scrollLeft);
    if(d < bd - 0.5){ bd = d; best = i; }
  }
  return best;
}
function pdp_trkGo(i, smooth){
  var t = pdp_trkEl(); if(!t) return;
  i = pdp_clamp(i, 0, t.children.length-1);
  var left = t.children[i].offsetLeft;
  try{ t.scrollTo({left:left, behavior: smooth===false ? 'auto' : 'smooth'}); }
  catch(e){ t.scrollLeft = left; }
  if(smooth===false) pdp_trkMark(i);
}
function pdp_trkMark(i){
  var t = pdp_trkEl(); if(!t || !t.children[i]) return;
  var v = t.children[i].getAttribute('data-v'); if(!v) return;
  var c = pdp_cur(); if(c) c.u.view = v;
  for(var z=0; z<t.children.length; z++) if(t.children[z].getAttribute('data-zoomkey')) t.children[z].tabIndex = (z===i ? 0 : -1);
  var thumbs = document.querySelectorAll('.pdp-page .pdp-thumb');
  for(var k=0; k<thumbs.length; k++){
    var on = thumbs[k].getAttribute('data-v')===v;
    thumbs[k].classList.toggle('on', on);
    thumbs[k].setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  var l = document.querySelector('.pdp-page .pdp-arrow.l'), r = document.querySelector('.pdp-page .pdp-arrow.r');
  if(l) l.classList.toggle('off', i<=0);
  if(r) r.classList.toggle('off', i>=t.children.length-1);
  /* Q-013: a faded arrow is also out of the Tab order and says it is disabled */
  [[l, i<=0], [r, i>=t.children.length-1]].forEach(function(x){ if(!x[0]) return; if(x[1]){ x[0].setAttribute('aria-disabled','true'); x[0].tabIndex = -1; } else { x[0].removeAttribute('aria-disabled'); x[0].removeAttribute('tabindex'); } });
  pdp_syncThumbs();
}
function pdp_stepView(d){
  var t = pdp_trkEl(); if(!t) return;
  pdp_trkGo(pdp_trkIdx(t) + d, true);
}
function pdp_viewTo(v, smooth){
  var t = pdp_trkEl(); if(!t) return false;
  for(var i=0; i<t.children.length; i++) if(t.children[i].getAttribute('data-v')===v){ pdp_trkGo(i, smooth); return true; }
  return false;
}
/* scroll does not bubble, so the listener is bound in the capture phase once */
(function(){
  var raf = null;
  document.addEventListener('scroll', function(ev){
    var t = ev.target;
    if(!t || !t.classList || !t.classList.contains('pdp-trk')) return;
    if(raf) return;
    raf = requestAnimationFrame(function(){ raf = null; if(document.body.contains(t)) pdp_trkMark(pdp_trkIdx(t)); });
  }, true);
})();
function pdp_syncThumbs(){
  var on = document.querySelector('.pdp-page .pdp-thumb.on'); if(!on) return;
  var strip = on.parentNode; if(!strip || strip.scrollWidth <= strip.clientWidth + 4) return;
  /* centre the live thumbnail in its strip without touching the page scroll */
  var want = on.offsetLeft - (strip.clientWidth - on.offsetWidth)/2;
  strip.scrollLeft = Math.max(0, Math.min(strip.scrollWidth - strip.clientWidth, want));
}
/* The 34px/900ms gesture recogniser that used to live here is gone: the strip
   is a native scroller now, so the browser handles the drag, the rubber band
   and the snap — and the photograph follows the finger instead of jumping a
   whole frame at the end of it. */

/* ---------- desktop sticky info column: if taller than the screen, stick by its bottom ---------- */
function pdp_fixSticky(){
  var b = document.getElementById('pdp-buy'); if(!b) return;
  if(window.innerWidth < 1024){ b.style.top = ''; return; }
  var h = b.offsetHeight, vh = window.innerHeight;
  b.style.top = (h + 96 + 16 > vh ? Math.min(96, vh - h - 16) : 96) + 'px';
}
window.addEventListener('resize', pdp_fixSticky);

/* A8. ONE MISTAKE, ONE MESSAGE.
   Tapping Add to Bag with no size chosen used to raise two: a red line under
   the size boxes AND a toast at the foot of the screen, both saying the same
   six words. The inline one is kept — it is beside the control the customer
   has to use, it stays until the mistake is fixed, and it reddens the boxes
   themselves. The toast is gone. */
function pdp_needSize(){
  var c = pdp_cur(); if(!c) return; c.u.err = true; rerender();
  var e = document.getElementById('pdp-sizes'); if(e) e.scrollIntoView({block:'center', behavior:'smooth'});
}
function pdp_scrollIfHidden(id){
  var e = document.getElementById(id); if(!e) return; var r = e.getBoundingClientRect();
  if(r.top < 70 || r.bottom > window.innerHeight) e.scrollIntoView({block:'center', behavior:'smooth'});
}

/* ---------- page ---------- */
PAGES.product = {
  layout:'store',
  title:function(params){ var p = P(params[0]); return p ? p.name : 'Product not found'; },
  render:function(params, query){
    var p = P(params[0]);
    if(!p) return '<div class="container empty"><h1 class="h1">Product not found</h1><p class="muted mt12">This product may have sold out or moved.</p><a class="btn btn-primary mt16" href="#/c/new">Shop new in</a></div>';
    var u = pdp_state(p, query), tpl = pdpTemplateFor(p); if(['T1','T2','T3'].indexOf(tpl)<0) tpl = 'T1';
    var cat = CAT(p.cat) || {name:''};
    var crumbs = '<nav class="crumbs pdp-crumbs" aria-label="Breadcrumb"><a href="#/">Home</a><span aria-hidden="true">/</span><a href="#/c/'+p.cat+'">'+esc(t(cat.name))+'</a><span aria-hidden="true">/</span><span aria-current="page" style="color:var(--ink)">'+esc(p.name)+'</span></nav>';
    var gallery = tpl==='T2' ? pdp_galleryT2(p,u) : pdp_galleryT1(p,u, tpl==='T1');
    var info = tpl==='T3' ? pdp_infoT3(p,u) : pdp_infoT12(p,u,tpl);
    return '<div class="pdp-page pdp-tpl-'+tpl+'" data-testid="pdp" data-template="'+tpl+'">'+
      '<div class="container pdp-top">'+crumbs+
        '<div class="pdp-grid'+(tpl==='T2'?' t2':'')+'">'+
          '<div class="pdp-g">'+gallery+'</div>'+
          '<div class="pdp-b sticky-d" id="pdp-buy">'+info+'</div>'+
          '<div class="pdp-d">'+pdp_details(p,u)+'</div>'+
        '</div></div>'+
      pdp_below(p)+
      '<div class="mbar dm-hide pdp-mbar"><div class="pdp-mbar-in '+PDP_CTA_STYLE+'">'
      +'<button type="button" class="btn btn-addbag" data-act="pdp-add" data-testid="bar-add">'+ico('bag',18)+esc(t('Add to Bag'))+'</button><button type="button" class="btn btn-primary" data-act="pdp-order" data-testid="bar-order">'+esc(t('Order Now'))+'</button></div></div>'+
      dkb_barHTML(p, u)+
    '</div>';
  },
  after:function(params, query){
    var p = P(params[0]);
    /* Product markup with this brand (95-admin-naming.js; the real build renders it on the server) */
    if(typeof nm_ldPut==='function') try{ nm_ldPut(p); }catch(e){}
    if(!p) return;
    ST.recent = [p.id].concat((ST.recent||[]).filter(function(x){ return x!==p.id; })).slice(0,8); saveState();
    pdp_fixSticky(); setTimeout(pdp_fixSticky, 400);
    /* put the strip back where the customer left it, with no animation */
    if(!pdp_viewTo(pdp_state(p, query).view, false)) pdp_syncThumbs();
    pdp_budget(); pdp_initSliders(); dkb_after();
    /* a second pass once the web fonts and the SVGs have settled */
    setTimeout(function(){ if(document.querySelector('.pdp-page')){ pdp_budget(); dkb_fit(); var t = pdp_trkEl(); if(t) pdp_trkMark(pdp_trkIdx(t)); else pdp_syncThumbs(); } }, 180);
    if(query && query.finder==='1' && !pdp_isOne(p)){
      setTimeout(function(){
        var u = pdp_state(p, query); if(u.fNav===PDP_NAV || CUR.page!=='product' || CUR.params[0]!==p.id) return; u.fNav = PDP_NAV;
        if(pdpTemplateFor(p)==='T3'){ if(!mySizeFor(p)) u.t3Edit = true; rerender(); var e = document.getElementById('pdp-t3'); if(e && dkb_desk()) e = document.querySelector('.pdp-t3-top') || e; /* desktop: the card is unboxed (D-053) */ if(e){ e.scrollIntoView({block:'center'}); e.classList.add('pdp-hl'); } return; }
        if(!document.querySelector('.modal-back')){ u.fStep = 'ask'; pdp_openFinder(); }
      }, 0);
    }
  }
};

/* PR 598: the sections under the page — reviews, questions, goes-well-with rows, recently viewed — in the owner's order */
function pdp_below(p){
  var piece = {reviews:pdp_reviewsSection, faq:pdp_qaSection, together:pdp_pairsSection, related:pdp_recentSection};
  return pdp_order('below', PDP_ZONES.below).filter(pdp_blockOn).map(function(id){ return piece[id](p); }).join('');
}

/* ---------- actions ---------- */
/* Q-003 (desktop QA, all devices — nothing visible changes). A colour or size
   pick re-renders the page, which threw keyboard focus back to <body> (the
   next Tab started again at "Skip to content"). The control that was used is
   found again in the new page and gets its focus back. */
function pdp_focusSel(el){
  if(!el || !el.getAttribute || document.activeElement!==el) return null;
  var t = el.getAttribute('data-testid'); if(t) return '[data-testid="'+t+'"]';
  var a = el.getAttribute('data-act'); if(!a) return null;
  var s = '.pdp-page [data-act="'+a+'"]';
  ['data-s','data-c','data-v'].forEach(function(k){ var v = el.getAttribute(k); if(v!=null) s += '['+k+'="'+String(v).replace(/"/g,'')+'"]'; });
  return s;
}
function pdp_refocus(sel){ if(!sel) return; var e = document.querySelector(sel); if(e) try{ e.focus({preventScroll:true}); }catch(x){} }
ACT['pdp-color'] = function(el){
  var c = pdp_cur(); if(!c) return; var u = c.u, col = el.getAttribute('data-c'), fs = pdp_focusSel(el);
  if(u.size && !pdp_isOne(c.p) && stockOf(c.p.id, col, u.size)<=0) toast('Size '+u.size+' is out of stock in '+COL(col).name);
  u.color = col; rerender(); pdp_refocus(fs);
};
ACT['pdp-size'] = function(el){ var c = pdp_cur(); if(!c) return; var fs = pdp_focusSel(el); c.u.size = el.getAttribute('data-s'); c.u.err = false; rerender(); pdp_refocus(fs);
  var bar = document.querySelector('.pdp-mbar'); if(bar){ bar.classList.remove('woke'); void bar.offsetWidth; bar.classList.add('woke'); setTimeout(function(){ bar.classList.remove('woke'); }, 1400); } };
ACT['pdp-allcolors'] = function(){
  var c = pdp_cur(); if(!c) return; var p = c.p;
  var build = function(){
    var u = pdp_state(p, CUR.query);
    return '<div class="allc-grid">'+p.colors.map(function(id){
      var cc = COL(id), so = totalStock(p.id, id)<=0, on = id===u.color;
      return '<button type="button" class="allc'+(on?' on':'')+(so?' so':'')+'" data-act="pdp-allpick" data-c="'+id+'"'+(so?' disabled':'')+'>'
        +'<span class="allc-img">'+productImg(p, id, {label:false, ratio:'ratio-45'})+'</span>'
        +'<span class="allc-n">'+esc(cc.name)+'</span>'
        +'<span class="allc-s">'+(so?'Sold out':(on?'Selected':'Choose'))+'</span></button>';
    }).join('')+'</div><div class="xs muted mt12">'+dkb_pair('Tap a colour to choose it — you go straight back to the buy buttons.', 'Click a colour to choose it — you go straight back to the buy buttons.')+'</div>';
  };
  openModal(build(), {title:'All '+p.colors.length+' colours', rebuild:build});
};
ACT['pdp-allpick'] = function(el){
  var c = pdp_cur(); if(!c) return;
  c.u.color = el.getAttribute('data-c');
  closeModal(); rerender();
  var bar = document.querySelector('.pdp-mbar'); if(bar){ bar.scrollIntoView({block:'nearest'}); bar.classList.add('woke'); setTimeout(function(){bar.classList.remove('woke');},1400); }
  toast(COL(c.u.color).name+' selected');
};
ACT['pdp-view'] = function(el){ var c = pdp_cur(); if(!c) return; var v = el.getAttribute('data-v'); if(!pdp_viewTo(v, true)){ c.u.view = v; rerender(); } };
ACT['pdp-nav'] = function(el){ pdp_stepView(Number(el.getAttribute('data-d'))); };
ACT['pdp-truecol'] = function(){
  var c = pdp_cur(); if(!c) return;
  if(pdp_viewTo('flat', true)){
    var f = document.getElementById('pdp-flat');
    if(f){ f.classList.remove('pdp-flash'); void f.offsetWidth; f.classList.add('pdp-flash'); }
    pdp_scrollIfHidden('pdp-main'); return;
  }
  c.u.view = 'flat'; rerender(); pdp_scrollIfHidden('pdp-main');
};
ACT['pdp-acc'] = function(el){ var c = pdp_cur(); if(!c) return; var k = el.getAttribute('data-k');
  var cur = c.u.acc[k];
  c.u.acc[k] = cur==='peek' ? true : (cur ? false : true);
  rerender(); };
ACT['pdp-scroll'] = function(el){ var e = document.getElementById(el.getAttribute('data-to')); if(e) e.scrollIntoView({behavior:'smooth', block:'start'}); };
ACT['pdp-share'] = function(){
  var c = pdp_cur(); if(!c) return; var p = c.p;
  var url = location.href, title = p.name+' — EXTAS';
  var u = encodeURIComponent(url), t = encodeURIComponent(title);
  var opts = [
    ['Facebook','facebook','https://www.facebook.com/sharer/sharer.php?u='+u],
    ['Messenger','chat','https://www.facebook.com/dialog/send?link='+u+'&app_id=0&redirect_uri='+u],
    ['WhatsApp','whatsapp','https://wa.me/?text='+t+'%20'+u],
    ['Instagram','instagram','https://www.instagram.com/'],
    ['Email','mail','mailto:?subject='+t+'&body='+u]
  ];
  pdp_shareStop();                       /* T8/T9: the last opening's timer and listener go first */
  UI.shareOpen = !UI.shareOpen; rerender();
  if(UI.shareOpen && typeof document!=='undefined'){
    PDP_SHARE.t0 = setTimeout(function(){
      PDP_SHARE.close = function(ev){
        if(ev && ev.target && ev.target.closest && (ev.target.closest('.shr-bar') || ev.target.closest('[data-act="pdp-share"]'))) return;
        UI.shareOpen = false; pdp_shareStop(); rerender();
      };
      document.addEventListener('click', PDP_SHARE.close, true);
      /* and it tidies itself away if nobody uses it */
      PDP_SHARE.t = setTimeout(function(){ if(UI.shareOpen){ UI.shareOpen = false; pdp_shareStop(); rerender(); } }, 8000);
    }, 0);
  }
};
/* TA-2 (T8/T9): ONE record for the share row's timer and outside-click
   listener. Every way of closing it (its own button, a share link, Copy link,
   an outside click, the 8 s tidy-up) clears both, so a re-opened row gets its
   full 8 s and no stale listener redraws the page on a later click. */
var PDP_SHARE = {t0:0, t:0, close:null};
function pdp_shareStop(){
  clearTimeout(PDP_SHARE.t0); clearTimeout(PDP_SHARE.t); PDP_SHARE.t0 = PDP_SHARE.t = 0;
  if(PDP_SHARE.close){ document.removeEventListener('click', PDP_SHARE.close, true); PDP_SHARE.close = null; }
}
function pdp_shareRow(p){
  if(!UI.shareOpen) return '';
  var url = location.href, title = p.name+' — EXTAS';
  var u = encodeURIComponent(url), t = encodeURIComponent(title);
  var opts = [
    ['Facebook','facebook','https://www.facebook.com/sharer/sharer.php?u='+u],
    ['Messenger','chat','https://www.facebook.com/dialog/send?link='+u+'&app_id=0&redirect_uri='+u],
    ['WhatsApp','whatsapp','https://wa.me/?text='+t+'%20'+u],
    ['Instagram','instagram','https://www.instagram.com/']
  ];
  return '<div class="shr-wrap"><div class="shr-bar" role="group" aria-label="Share this item">'+
    opts.map(function(o){ return '<a class="shr-b '+o[1]+'" href="'+o[2]+'" target="_blank" rel="noopener" data-act="pdp-shared" title="'+esc(o[0])+'" aria-label="Share on '+esc(o[0])+'">'+ico(o[1],21)+'</a>'; }).join('')+
    '<button type="button" class="shr-b copy" data-act="pdp-copylink" title="Copy link" aria-label="Copy link">'+ico('link',20)+'</button>'+
    '</div></div>';
}
ACT['pdp-shared'] = function(){ UI.shareOpen = false; pdp_shareStop(); setTimeout(rerender, 60); };
ACT['pdp-copylink'] = function(){
  try{ if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(location.href).catch(function(){}); }catch(e){}
  UI.shareOpen = false; pdp_shareStop(); rerender(); toast('Link copied');
};
ACT['pdp-unit-toggle'] = function(){ var c = pdp_cur(); if(!c) return; c.u.cm = !c.u.cm; rerender(); if(MODAL) refreshModal(); };
ACT['pdp-unit'] = function(el){ var c = pdp_cur(); if(!c) return; c.u.cm = el.getAttribute('data-v')==='cm'; rerender(); if(MODAL) refreshModal(); };

/* add / order */
ACT['pdp-add'] = function(){
  var c = pdp_cur(); if(!c) return; var p = c.p, u = c.u;
  if(!u.size) return pdp_needSize();
  if(stockOf(p.id, u.color, u.size)<=0){ toast('Sorry — out of stock in this colour'); return; }
  var res = bagAdd({kind:'item', product:p.id, color:u.color, size:u.size, qty:1}, {dupQty:true});
  if(!res.added){
    if(res.reason==='already') toast('Already in your bag — size '+u.size+' ('+res.qty+'). Change the quantity in your bag.');
    else if(res.reason==='stock' && res.msg) toast(res.msg);
    return;
  }
  /* R15 note 23.13: the owner's 'qty' setting — one more of the same size, said in a toast */
  if(res.qtyUp){ rerender(); bagQtyToast(u.size, res.qty); return; }
  u.added = {color:u.color, size:u.size, extras:[]};
  var desk = dkb_desk(), was = document.activeElement && document.activeElement.getAttribute ? document.activeElement.getAttribute('data-testid') : null;
  rerender();
  /* D-028 / Q-003 focus: the re-render replaced the button that was pressed,
     so the same button is focused again before the sheet/drawer opens — Esc,
     ✕ or a click outside then hand focus straight back to it (99-boot) */
  if(was){ var back = document.querySelector('[data-testid="'+was+'"]'); if(back) try{ back.focus({preventScroll:true}); }catch(e){} }
  openModal(pdp_bagModalHTML(), {title:'Added to bag', rebuild:pdp_bagModalHTML, cls:desk ? 'atb-d' : ''});
};
ACT['pdp-order'] = function(){
  var c = pdp_cur(); if(!c) return; var p = c.p, u = c.u;
  if(!u.size) return pdp_needSize();
  if(stockOf(p.id, u.color, u.size)<=0){ toast('Sorry — out of stock in this colour'); return; }
  bagAdd({kind:'item', product:p.id, color:u.color, size:u.size, qty:1});
  go('#/checkout');
};
ACT['pdp-duo-add'] = function(el){
  var c = pdp_cur(); if(!c || !c.u.added) return; var p = c.p, a = c.u.added, col = el.getAttribute('data-c'), duo = pdp_duoFor(p); if(!duo) return;
  if(duo.autoApply) bagAdd({kind:'item', product:p.id, color:col, size:a.size, qty:1});
  else {
    var line = ST.bag.filter(function(l){ return l.kind==='item' && l.product===p.id && l.color===a.color && l.size===a.size; })[0];
    if(line){ if(line.qty>1){ line.qty--; saveState(); } else bagRemove(line.id); }
    bagAdd({kind:'set', source:'combo', refId:duo.id, name:duo.name, items:[{product:p.id, color:a.color, size:a.size}, {product:p.id, color:col, size:a.size}], price:duo.price});
  }
  a.extras.push(col);
  toast('Added '+COL(col).name+' — '+duo.name+': 2 for '+fmt(duo.price));
  rerender(); refreshModal();
};

/* find my size (modal) */
ACT['pdp-open-finder'] = function(){ var c = pdp_cur(); if(!c) return; if(MODAL) closeModal(); pdp_openFinder(); };
ACT['pdp-f-show'] = function(){ var c = pdp_cur(); if(!c) return; c.u.fStep = 'result'; refreshModal(); };
ACT['pdp-f-change'] = function(){ var c = pdp_cur(); if(!c) return; c.u.fStep = 'ask'; refreshModal(); };
ACT['pdp-fcolor'] = function(el){ var c = pdp_cur(); if(!c) return; c.u.color = el.getAttribute('data-c'); rerender(); refreshModal(); };
ACT['pdp-f-select'] = function(el){
  var c = pdp_cur(); if(!c) return; var p = c.p, u = c.u, s = el.getAttribute('data-size');
  pdp_saveMySize(p, s, u.fH, u.fW);
  closeModal();
  if(stockOf(p.id, u.color, s)>0){ u.size = s; u.err = false; toast('Size '+s+' selected · saved as your size'); }
  else toast('Saved your size '+s+' — out of stock in '+COL(u.color).name+', try another colour');
  rerender();
};
/* steppers: patch numbers in place (no re-render, keeps focus); press and hold repeats */
function pdp_stepApply(el){
  var c = pdp_cur(); if(!c) return; var u = c.u, k = el.getAttribute('data-k'), d = Number(el.getAttribute('data-d')), sc = el.getAttribute('data-scope');
  if(k==='ft') u.fH = pdp_clamp(u.fH + 12*d, 54, 84);
  else if(k==='in') u.fH = pdp_clamp(u.fH + d, 54, 84);
  else u.fW = pdp_clamp(u.fW + d, 35, 150);
  var set = function(id, v){ var e = document.getElementById(id); if(e) e.textContent = v; };
  set('pdp-'+sc+'-ft', Math.floor(u.fH/12)+' ft'); set('pdp-'+sc+'-in', (u.fH%12)+' in'); set('pdp-'+sc+'-kg', u.fW+' kg'); set('pdp-'+sc+'-cm', Math.round(u.fH*2.54)+' cm');
}
ACT['pdp-step'] = function(el){ if(el._pdpRep){ el._pdpRep = false; return; } pdp_stepApply(el); };
(function(){
  var hold = null, rep = null;
  function stop(){ clearTimeout(hold); clearInterval(rep); hold = rep = null; }
  document.addEventListener('pointerdown', function(ev){
    var el = ev.target.closest && ev.target.closest('[data-act="pdp-step"]'); stop(); if(!el) return; el._pdpRep = false;
    hold = setTimeout(function(){ el._pdpRep = true; rep = setInterval(function(){ if(!document.body.contains(el)) return stop(); pdp_stepApply(el); }, 90); }, 450);
  });
  document.addEventListener('pointerup', stop); document.addEventListener('pointercancel', stop);
})();

/* size chart */
ACT['pdp-open-chart'] = function(){ pdp_openChart(); };
/* R14 · 14.14. Reveal the folded questions in place — no re-render, so the page
   does not jump; the state is kept so a later re-render shows them too. */
ACT['pdp-qa-all'] = function(el){
  var c = pdp_cur(); if(c) c.u.qaAll = true;
  var box = el.closest('.pdp-qa-more'); if(!box) return;
  [].slice.call(box.querySelectorAll('.pdp-qa-i[hidden]')).forEach(function(d){ d.hidden = false; });
  var first = box.querySelectorAll('.pdp-qa-i')[3];
  el.parentNode.removeChild(el);
  if(first){ var s = first.querySelector('summary'); if(s) try{ s.focus({preventScroll:true}); }catch(e){} }
};
ACT['pdp-chart-pick'] = function(el){
  var c = pdp_cur(); if(!c) return; var p = c.p, u = c.u, s = el.getAttribute('data-size');
  if(stockOf(p.id, u.color, s)<=0){ toast('Size '+s+' is out of stock in '+COL(u.color).name); return; }
  u.size = s; u.err = false; closeModal(); rerender(); toast('Size '+s+' selected');
};

/* T3 inline finder */
ACT['pdp-t3-find'] = function(){
  var c = pdp_cur(); if(!c) return; var p = c.p, u = c.u, rec = recommendSize(chartFor(p), u.fH, u.fW); if(!rec) return;
  pdp_saveMySize(p, rec.size, u.fH, u.fW);
  u.t3Edit = false; u.t3Why = true;
  if(stockOf(p.id, u.color, rec.size)>0){ u.size = rec.size; u.err = false; toast('Your size: '+rec.size+' — selected'); }
  else toast('Your size: '+rec.size+' — out of stock in '+COL(u.color).name+', try another colour');
  rerender();
};
ACT['pdp-t3-change'] = function(){ var c = pdp_cur(); if(!c) return; c.u.t3Edit = true; rerender(); };
ACT['pdp-t3-cancel'] = function(){ var c = pdp_cur(); if(!c) return; c.u.t3Edit = false; rerender(); };
ACT['pdp-t3-why'] = function(){ var c = pdp_cur(); if(!c) return; c.u.t3Why = true; rerender(); };
ACT['pdp-t3-use'] = function(el){
  var c = pdp_cur(); if(!c) return; var p = c.p, u = c.u, s = el.getAttribute('data-size'), m = mySize() || {};
  pdp_saveMySize(p, s, m.heightIn || u.fH, m.weightKg || u.fW);
  if(stockOf(p.id, u.color, s)>0){ u.size = s; u.err = false; }
  u.t3Why = true; toast('Your size: '+s); rerender();
};

/* =====================================================================
   DESKTOP BATCH B — Sawdagor সওদাগর (A360-04) · Shilpi শিল্পী (A360-05), 19 Oct
   Everything below runs only at 1024 px and wider (dkb_desk()); the markup it
   adds carries hide-m, so a phone draws exactly what it drew before.
   ===================================================================== */

/* D-027 · the slim buy bar. Appears once the buy buttons have scrolled up
   under the header, sits right below the header (never over it), and repeats
   the choice the customer made: photo, name, colour, size, price, Add to Bag,
   Order Now. With no size chosen, Add to Bag does what the main button does —
   takes the customer to the sizes and marks them. */
var DKB_BAR = {on:false};
function dkb_barHTML(p, u){
  if(!p) return '';
  var cc = COL(u.color), one = pdp_isOne(p);
  var size = one ? '<span class="dkb-chip">One size</span>'
    : (u.size ? '<span class="dkb-chip">Size <b>'+esc(u.size)+'</b></span>'
              : '<button type="button" class="dkb-chip dkb-pick" data-act="pdp-scroll" data-to="pdp-sizes">'+esc(t('Choose size'))+'</button>');
  return '<div class="dkb-bar hide-m'+(DKB_BAR.on ? ' on' : '')+'" data-testid="dkb-bar" role="region" aria-label="'+esc('Buy '+p.name)+'"'+(DKB_BAR.on ? '' : ' inert')+'>'+
    '<div class="container dkb-in">'+
      '<div class="dkb-th" aria-hidden="true">'+productImg(p, u.color, {ratio:'ratio-11', label:false})+'</div>'+
      '<div class="dkb-id"><div class="dkb-nm">'+esc(p.name)+'</div>'+
        '<div class="dkb-ch"><span class="dkb-chip"><i style="background:'+cc.hex+'"></i>'+esc(cc.name)+'</span>'+size+'</div></div>'+
      '<div class="dkb-pr"><span class="price">'+fmt(p.price)+'</span>'+(p.compareAt ? '<span class="strike">'+fmt(p.compareAt)+'</span>' : '')+'</div>'+
      '<div class="dkb-btns pdp-ctas '+PDP_CTA_STYLE+'"><button type="button" class="btn btn-addbag" data-act="pdp-add" data-testid="dkb-add">'+ico('bag',18)+esc(t('Add to Bag'))+'</button>'+
        '<button type="button" class="btn btn-primary" data-act="pdp-order" data-testid="dkb-order">'+esc(t('Order Now'))+'</button></div>'+
    '</div></div>';
}
function dkb_barSync(){
  var bar = document.querySelector('.pdp-page .dkb-bar'); if(!bar) return;
  var on = false, hdr = document.querySelector('.hdr'), top = hdr ? Math.max(0, hdr.getBoundingClientRect().bottom) : 0;
  if(dkb_desk()){
    var cta = document.querySelector('.pdp-page .pdp-b .pdp-ctas');
    if(cta && cta.getClientRects().length) on = cta.getBoundingClientRect().bottom < top + 2;
    bar.style.top = Math.round(top)+'px';
  }
  if(on !== bar.classList.contains('on')){
    bar.classList.toggle('on', on);
    if(on) bar.removeAttribute('inert'); else bar.setAttribute('inert', '');
  }
  DKB_BAR.on = on;
}
window.addEventListener('scroll', function(){ if(document.querySelector('.dkb-bar')) dkb_barSync(); }, {passive:true});
window.addEventListener('resize', function(){ if(document.querySelector('.dkb-bar')) dkb_barSync(); if(document.querySelector('.pdp-page')) dkb_fit(); });
window.addEventListener('hashchange', function(){ DKB_BAR.on = false; });

/* D-030 / D-031 · one line, stepping down instead of wrapping (AUTO ADJUST).
   Combo nudge: the description goes first ("Polo + Chino: Essential polo…" →
   "Polo + Chino"), the price and the saving never break or shorten.
   Trust strip: "72-hour size swap" → "72-hour swap" when the column is narrow. */
function dkb_fit(){
  var page = document.querySelector('.pdp-page'); if(!page) return;
  var on = dkb_desk();
  [].forEach.call(page.querySelectorAll('.pdp-nudge'), function(a){
    a.classList.remove('dkb-short'); if(!on) return;
    var g = a.querySelector('.grow'), d = a.querySelector('.pdp-nd');
    if((g && g.scrollWidth > g.clientWidth + 1) || (d && d.scrollWidth > d.clientWidth + 1)) a.classList.add('dkb-short');
  });
  [].forEach.call(page.querySelectorAll('.pdp-trust'), function(tr){
    tr.classList.remove('dkb-short'); if(!on) return;
    var over = [].some.call(tr.children, function(s){ return s.scrollWidth > s.clientWidth + 1; }) || tr.scrollWidth > tr.clientWidth + 1;
    if(over) tr.classList.add('dkb-short');
  });
}
function dkb_after(){
  dkb_fit();
  /* after a re-render the page is scrolled back on the next line of 02-core,
     so the bar is checked once that has happened */
  setTimeout(dkb_barSync, 0);
}

/* D-028 · 2-3 things that go with what was just added, in the desktop drawer
   (and the combo drawer). Never something already in the bag. */
function dkb_crossSell(list, n){
  var inBag = {}; (ST.bag||[]).forEach(function(l){ if(l.kind==='item') inBag[l.product] = 1; else (l.items||[]).forEach(function(it){ inBag[it.product] = 1; }); });
  var seen = {}, picks = (list||[]).concat(typeof ups_picks==='function' ? ups_picks(8) : []).filter(function(x){
    if(!x || x.hidden || inBag[x.id] || seen[x.id]) return false; seen[x.id] = 1; return true; }).slice(0, n||3);
  if(!picks.length) return '';
  return '<div class="atb-x" data-testid="atb-cross"><div class="atb-xh">'+esc(t('Goes well with it'))+'</div>'+picks.map(function(x){
    return '<a class="atb-xi" href="#/p/'+esc(x.id)+'">'+productImg(x, x.colors[0], {ratio:'ratio-11', label:false})+
      '<span class="atb-xn">'+esc(x.name)+'</span><span class="atb-xp price">'+fmt(x.price)+'</span></a>';
  }).join('')+'</div>';
}

/* Q-004 / Q-005 · desktop with a mouse (hover:hover, pointer:fine) only. */
var DKB_FINE = (window.matchMedia ? window.matchMedia('(hover:hover) and (pointer:fine)') : null);
function dkb_fine(){ return dkb_desk() && !!(DKB_FINE && DKB_FINE.matches); }
/* the photo can be reached with Tab and opened with Enter or Space */
/* one photo at a time is a Tab stop (the one on show); the strip moves it along */
function dkb_zoomKey(on){ return dkb_fine() ? ' tabindex="'+(on ? 0 : -1)+'" role="button" aria-label="'+esc(t('Open the photo full screen'))+'" data-zoomkey="1"' : ''; }
document.addEventListener('keydown', function(e){
  var m = e.target; if(!m || !m.getAttribute || m.getAttribute('data-zoomkey')!=='1') return;
  if(e.key!=='Enter' && e.key!==' ') return;
  e.preventDefault(); if(typeof zm_open==='function') zm_open(m.getAttribute('data-v'));
});
