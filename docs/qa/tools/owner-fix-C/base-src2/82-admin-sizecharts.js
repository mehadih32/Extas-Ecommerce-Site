/* ================= 82-admin-sizecharts.js — owner: size charts  #/admin/size-charts ================= */
(function(){
  if(document.getElementById('sc-css')) return;
  var s = document.createElement('style'); s.id = 'sc-css';
  s.textContent = [
    '.sc-how{display:grid;gap:12px;padding:18px;margin-bottom:18px}',
    '@media(min-width:1024px){.sc-how{grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;padding:20px 24px}}',
    '.sc-step{display:flex;gap:12px;align-items:flex-start}',
    '.sc-num{width:28px;height:28px;border-radius:50%;background:#15302B;color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
    '.sc-grid{display:grid;gap:16px;grid-template-columns:minmax(0,1fr)}',
    '@media(min-width:1024px){.sc-grid{grid-template-columns:340px minmax(0,1fr);grid-template-rows:auto 1fr;gap:22px;align-items:start}',
    '.sc-listw{grid-column:1;grid-row:1}.sc-edw{grid-column:2;grid-row:1 / span 2}.sc-addw{grid-column:1;grid-row:2;align-self:start}}',
    '.sc-list{display:grid;gap:8px}',
    '.sc-item{display:block;width:100%;text-align:left;background:#fff;border:1px solid #E6E3DE;border-radius:8px;padding:12px 14px;cursor:pointer;font:inherit;color:#171715}',
    '.sc-item:hover{background:#FAFAF8}',
    '.sc-item.on{border-color:#1F4E46;box-shadow:inset 0 0 0 1px #1F4E46}',
    '.sc-ed{background:#fff;border:1px solid #E6E3DE;border-radius:8px;padding:18px;scroll-margin-top:16px}',
    '@media(min-width:1024px){.sc-ed{padding:24px}}',
    '.sc-tblw{overflow-x:auto;border:1px solid #E6E3DE;border-radius:6px;margin-top:10px}',
    '.sc-tbl{border-collapse:collapse;width:100%;font-size:13px}',
    '.sc-tbl th{background:#FAFAF8;font-size:11.5px;font-weight:600;color:#54504A;padding:9px 6px;text-align:center;border-bottom:1px solid #E6E3DE;white-space:nowrap}',
    '.sc-tbl td{padding:6px;border-bottom:1px solid #EFEDE8;text-align:center}',
    '.sc-tbl tr:last-child td{border-bottom:0}',
    '.sc-tbl td.sz{font-weight:700;font-family:"Archivo",sans-serif;width:54px}',
    '.sc-in{width:76px;padding:9px 6px;text-align:center;font-size:14px}',
    '.sc-tbl td.sz,.sc-tbl th:first-child{position:sticky;left:0;z-index:1;background:#fff}',
    '.sc-tbl th:first-child{background:#FAFAF8}',
    '@media(max-width:767px){.sc-in{width:54px;padding:9px 3px}.sc-tbl td{padding:5px 3px}.sc-tbl td.sz{width:40px}.sc-tbl th{white-space:normal;padding:8px 3px;line-height:1.2}.sc-tbl th .u{display:block}.sc-rm{width:28px}}',
    '.sc-rm{background:none;border:0;width:32px;height:32px;border-radius:50%;cursor:pointer;color:#6E675E;display:inline-flex;align-items:center;justify-content:center}',
    '.sc-rm:hover{background:#F2F1EE;color:#B4453C}',
    '.sc-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:8px}',
    '.sc-tile{border:1px solid #E6E3DE;background:#fff;border-radius:8px;padding:10px;cursor:pointer;font:inherit;color:#171715;text-align:left}',
    '.sc-tile.on{border-color:#1F4E46;box-shadow:inset 0 0 0 1px #1F4E46;background:#F6F9F8}',
    '.sc-tile svg{width:100%;height:auto;max-height:150px;color:#54504A}',
    '.sc-cov{border-radius:8px;padding:12px 14px;margin-top:8px}',
    '.sc-cov.ok{background:#EEF3F1;border:1px solid #D5E1DC;color:#15302B}',
    '.sc-cov.bad{background:#FBF6EC;border:1px solid #EAD9BC;color:#5E3E14}',
    '.sc-cov .w{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:6px 0}',
    '.sc-cov .w+.w{border-top:1px solid #EAD9BC}',
    '.sc-sec{margin-top:22px}',
    '.sc-plist{display:grid;gap:6px;margin-top:8px}',
    '@media(min-width:640px){.sc-plist{grid-template-columns:repeat(2,minmax(0,1fr))}}',
    '.sc-prod{display:flex;gap:10px;align-items:center;padding:8px;border:1px solid #EFEDE8;border-radius:6px;color:#171715!important;background:#fff}',
    '.sc-prod:hover{border-color:#1F4E46}',
    '.sc-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:22px;padding-top:16px;border-top:1px solid #EFEDE8}',
    '.sc-auto{display:flex;gap:10px;align-items:center;padding:12px;border-radius:6px;background:#EEF3F1;border:1px solid #D5E1DC;margin-top:12px;font-size:13.5px}',
    '.sc-drop{border:2px dashed #CFCAC2;border-radius:8px;padding:28px 16px;text-align:center;background:#FAFAF8}'
  ].join('\n');
  document.head.appendChild(s);
})();

var SC_FIELDS_LABEL = {top:'Tops: chest / length / shoulder / sleeve', bottom:'Bottoms: waist / hip / thigh / length / leg opening'};
var SC_ORDER = ['XS','S','M','L','XL','XXL','3XL','4XL','5XL'];

function sc_ui(){ return ui('admin-sizecharts', {sel:'polo-regular', drafts:{}, cm:false, cat:'polos', fit:'Regular', manual:null}); }
function sc_ids(){ return Object.keys(DB.sizeCharts); }
function sc_users(id){ return DB.products.filter(function(p){ return p.chart===id; }); }
function sc_draft(id){
  var u = sc_ui();
  if(!u.drafts[id]){ var c = JSON.parse(JSON.stringify(CHART(id))); if(!c.howTo) c.howTo = c.type; u.drafts[id] = c; }
  return u.drafts[id];
}
function sc_dirty(id){ var d = sc_ui().drafts[id]; if(!d) return false; var c = JSON.parse(JSON.stringify(CHART(id))); if(!c.howTo) c.howTo = c.type; return JSON.stringify(d)!==JSON.stringify(c); }
function sc_sortKeys(keys){
  return keys.slice().sort(function(a, b){
    var na = parseFloat(a), nb = parseFloat(b);
    if(!isNaN(na) && !isNaN(nb)) return na-nb;
    var ia = SC_ORDER.indexOf(String(a).toUpperCase()), ib = SC_ORDER.indexOf(String(b).toUpperCase());
    return (ia<0?99:ia) - (ib<0?99:ib);
  });
}
function sc_setRows(d, rows){ var o = {}; sc_sortKeys(Object.keys(rows)).forEach(function(k){ o[k] = rows[k]; }); d.rows = o; }
function sc_missing(d, id){
  var miss = {};
  sc_users(id).forEach(function(p){ p.sizes.forEach(function(s){ if(!d.rows[s]){ (miss[s] = miss[s] || []).push(p); } }); });
  return sc_sortKeys(Object.keys(miss)).map(function(s){ return {size:s, products:miss[s]}; });
}
function sc_r(v){ return Math.round(v*4)/4; }
/* new row = neighbour rows + the chart's own step (last row − the row before it) */
function sc_addRow(d, size){
  var keys = sc_sortKeys(Object.keys(d.rows).concat([size])), i = keys.indexOf(size), n = d.fields.length;
  var prev = keys[i-1] && d.rows[keys[i-1]], prev2 = keys[i-2] && d.rows[keys[i-2]], next = keys[i+1] && d.rows[keys[i+1]], next2 = keys[i+2] && d.rows[keys[i+2]];
  var vals = [];
  for(var f=0; f<n; f++){
    var v;
    if(prev && next) v = (prev[f]+next[f])/2;
    else if(prev) v = prev[f] + (prev2 ? prev[f]-prev2[f] : 1);
    else if(next) v = next[f] - (next2 ? next2[f]-next[f] : 1);
    else v = 0;
    vals.push(sc_r(v));
  }
  var rows = JSON.parse(JSON.stringify(d.rows)); rows[size] = vals; sc_setRows(d, rows);
  return vals;
}
function sc_parse(text, nFields){
  var out = {}, count = 0;
  String(text||'').split(/\r?\n/).forEach(function(line){
    var tk = line.trim().split(/[\s,;\t]+/).filter(Boolean); if(tk.length < 2) return;
    var nums = tk.slice(1).map(function(x){ return parseFloat(x); });
    if(nums.some(function(x){ return isNaN(x); })) return;      // header line like "Size Chest Length"
    if(nums.length < nFields) return;
    var size = /^\d+(\.\d+)?$/.test(tk[0]) ? tk[0] : tk[0].toUpperCase();
    out[size] = nums.slice(0, nFields); count++;
  });
  return {rows:out, count:count};
}
function sc_autoChart(catId, fit){
  var cat = CAT(catId); if(!cat || !cat.chart) return null;
  var key = cat.name+' › '+fit, ids = sc_ids();
  for(var i=0;i<ids.length;i++){ var c = CHART(ids[i]); if((c.defaultFor||[]).indexOf(key)>=0) return ids[i]; }
  return cat.chart;
}

/* ---------- how-to-measure diagrams ---------- */
function sc_diaTop(){
  var dot = function(x, y, n){ return '<circle cx="'+x+'" cy="'+y+'" r="8" fill="#1F4E46"/><text x="'+x+'" y="'+(y+3.5)+'" font-size="10" font-weight="700" text-anchor="middle" fill="#fff">'+n+'</text>'; };
  return '<svg viewBox="0 0 200 222" aria-hidden="true"><path d="M62 22 L82 12 Q100 28 118 12 L138 22 L178 46 L162 82 L146 74 L146 208 L54 208 L54 74 L38 82 L22 46 Z" fill="#F2F1EE" stroke="currentColor" stroke-width="1.5"/>'+
    '<g stroke="#1F4E46" stroke-width="2" stroke-dasharray="4 3"><line x1="56" y1="92" x2="144" y2="92"/><line x1="122" y1="20" x2="122" y2="206"/><line x1="64" y1="30" x2="136" y2="30"/><line x1="140" y1="28" x2="170" y2="64"/></g>'+
    dot(80,92,1)+dot(122,150,2)+dot(100,30,3)+dot(162,46,4)+'</svg>';
}
function sc_diaBottom(){
  var dot = function(x, y, n){ return '<circle cx="'+x+'" cy="'+y+'" r="8" fill="#1F4E46"/><text x="'+x+'" y="'+(y+3.5)+'" font-size="10" font-weight="700" text-anchor="middle" fill="#fff">'+n+'</text>'; };
  return '<svg viewBox="0 0 200 222" aria-hidden="true"><path d="M58 10 L142 10 L152 212 L112 212 L100 74 L88 212 L48 212 Z" fill="#F2F1EE" stroke="currentColor" stroke-width="1.5"/>'+
    '<g stroke="#1F4E46" stroke-width="2" stroke-dasharray="4 3"><line x1="58" y1="16" x2="142" y2="16"/><line x1="55" y1="48" x2="145" y2="48"/><line x1="53" y1="84" x2="96" y2="84"/><line x1="160" y1="12" x2="160" y2="210"/><line x1="112" y1="204" x2="152" y2="204"/></g>'+
    dot(100,16,1)+dot(80,48,2)+dot(70,84,3)+dot(160,120,4)+dot(132,204,5)+'</svg>';
}
var SC_HOW = {
  top:['Chest — across under the arms, then double it','Length — from the top of the shoulder to the hem','Shoulder — seam to seam across the back','Sleeve — shoulder seam to the cuff'],
  bottom:['Waist — across the waistband, then double it','Hip — widest part, then double it','Thigh — across the leg just under the crotch','Length — outside seam, waistband to hem','Leg opening — across the hem']
};

/* ---------- editor ---------- */
function sc_editor(id){
  var u = sc_ui(), d = sc_draft(id), users = sc_users(id), dirty = sc_dirty(id), sizes = Object.keys(d.rows);
  var head = '<tr><th>Size</th>'+d.fields.map(function(f){ return '<th>'+esc(f)+' <span class="u" style="font-weight:400;color:#8A857D">in</span></th>'; }).join('')+'<th><span class="sr">Remove</span></th></tr>';
  var body = sizes.map(function(s){
    return '<tr><td class="sz">'+esc(s)+'</td>'+d.rows[s].map(function(v, i){ return '<td><input class="input sc-in" type="number" step="0.25" inputmode="decimal" value="'+esc(v)+'" data-input="sc-cell" data-id="'+id+'" data-size="'+esc(s)+'" data-i="'+i+'" aria-label="'+esc(s)+' '+esc(d.fields[i])+' in inches"></td>'; }).join('')+
      '<td><button class="sc-rm" data-act="sc-rmrow" data-id="'+id+'" data-size="'+esc(s)+'" aria-label="Remove size '+esc(s)+'" title="Remove row">'+ico('trash',16)+'</button></td></tr>';
  }).join('');
  var cmTbl = u.cm ? '<div class="sc-tblw" style="background:#FAFAF8"><table class="sc-tbl"><thead><tr><th>Size</th>'+d.fields.map(function(f){ return '<th>'+esc(f)+' cm</th>'; }).join('')+'</tr></thead><tbody>'+
    sizes.map(function(s){ return '<tr><td class="sz">'+esc(s)+'</td>'+d.rows[s].map(function(v){ return '<td class="muted">'+inchToCm(v)+'</td>'; }).join('')+'</tr>'; }).join('')+'</tbody></table></div>' : '';
  var miss = sc_missing(d, id);
  var cov = miss.length
    ? '<div class="sc-cov bad">'+miss.map(function(m){ var p0 = m.products[0]; return '<div class="w"><span class="small row" style="gap:8px">'+ico('info',16)+'<span><b>'+esc(p0.name)+'</b>'+(m.products.length>1?' and '+(m.products.length-1)+' more':'')+' '+(m.products.length>1?'have':'has')+' <b>'+esc(m.size)+'</b> in ERP — add a row</span></span>'+
        '<button class="btn btn-sm btn-secondary" data-act="sc-addrow" data-id="'+id+'" data-size="'+esc(m.size)+'">'+ico('plus',14)+'Add row</button></div>'; }).join('')+'</div>'
    : '<div class="sc-cov ok small row" style="gap:8px">'+ico('check',16)+'<span>All sizes covered — every ERP size of the '+plural(users.length,'product')+' using this chart has measurements.<span class="xs" style="display:block;opacity:.8;margin-top:2px">If ERP adds a new size (say 3XL) to one of them, a warning with an “Add row” button shows up here.</span></span></div>';
  var how = d.howTo || d.type;
  var plist = users.length ? '<div class="sc-plist">'+users.map(function(p){ return '<a class="sc-prod" href="#/p/'+p.id+'"><div style="width:40px;flex-shrink:0">'+productImg(p, p.colors[0], {ratio:'ratio-11', label:false})+'</div><div class="grow"><div class="small bold">'+esc(p.name)+'</div><div class="xs muted">ERP sizes: '+esc(p.sizes.join(' · '))+'</div></div>'+ico('right',15)+'</a>'; }).join('')+'</div>' : '<div class="xs muted mt8">No products use this chart yet.</div>';
  return '<div class="sc-ed" id="sc-editor" data-chart="'+id+'">'+
    '<div class="row between wrap top" style="gap:12px"><div class="grow" style="min-width:220px"><label class="label" for="sc-name">Chart name</label><input id="sc-name" class="input" value="'+esc(d.name)+'" data-input="sc-name" data-id="'+id+'" style="max-width:360px"></div>'+
      '<div><div class="label">Type</div><span class="tag plain" style="font-size:12.5px;padding:6px 10px">'+esc(SC_FIELDS_LABEL[d.type]||d.type)+'</span></div></div>'+
    '<div class="sc-sec"><div class="row between wrap" style="gap:8px"><div class="label" style="margin:0">Measurements <span class="muted" style="font-weight:500">· sizes come from ERP</span></div>'+
      '<div class="row wrap" style="gap:8px"><button class="btn btn-sm btn-ghost" data-act="sc-paste" data-id="'+id+'">'+ico('doc',15)+'Paste from Excel</button>'+
      '<button class="btn btn-sm btn-ghost" data-act="sc-photo" data-id="'+id+'">'+ico('camera',15)+'Read from spec sheet photo <span class="tag gold" style="margin-left:2px">'+ico('spark',10)+'AI</span></button></div></div>'+
      '<div class="sc-tblw"><table class="sc-tbl"><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div>'+
      '<div class="row between wrap mt8" style="gap:8px"><span class="xs muted row" style="gap:6px">'+ico('info',14)+'Type inches only — cm is worked out automatically</span><label class="check xs"><input type="checkbox" data-change="sc-cm"'+(u.cm?' checked':'')+'> Show cm</label></div>'+cmTbl+'</div>'+
    '<div class="sc-sec"><label class="label" for="sc-ease">Find my size ease</label><div class="row small" style="gap:8px">body + <input id="sc-ease" class="input sc-in" type="number" step="0.5" value="'+esc(d.ease)+'" data-input="sc-ease" data-id="'+id+'" style="width:72px"> in</div>'+
      '<div class="xs muted mt8">How much room the garment has over the body. Find my size uses this to pick the size.</div></div>'+
    '<div class="sc-sec"><div class="label">How to measure <span class="muted" style="font-weight:500">· shown to customers under the size chart</span></div><div class="sc-tiles">'+
      ['top','bottom'].map(function(t){ return '<button class="sc-tile'+(how===t?' on':'')+'" data-act="sc-howto" data-id="'+id+'" data-v="'+t+'" aria-pressed="'+(how===t)+'">'+(t==='top'?sc_diaTop():sc_diaBottom())+'<div class="small bold mt8">'+(t==='top'?'Tops':'Bottoms')+'</div></button>'; }).join('')+'</div>'+
      '<ol class="small text2" style="margin:10px 0 0;padding-left:20px;line-height:1.7">'+SC_HOW[how].map(function(x){ return '<li>'+esc(x)+'</li>'; }).join('')+'</ol></div>'+
    '<div class="sc-sec"><div class="label">Coverage check</div>'+cov+'</div>'+
    '<div class="sc-actions"><button class="btn btn-primary btn-sm" data-act="sc-save" data-id="'+id+'" data-testid="sc-save">'+ico('check',15)+'Save</button>'+
      '<span class="sc-dirty row" style="gap:8px">'+sc_dirtyHTML(id)+'</span>'+
      '<button class="btn btn-sm btn-ghost" data-act="sc-copy" data-id="'+id+'" style="margin-left:auto">'+ico('layers',15)+'Copy for a style that fits differently</button></div>'+
    '<div class="sc-sec"><div class="label">Products using this chart <span class="muted" style="font-weight:500">· open one to see its size chart</span></div>'+plist+'</div>'+
  '</div>';
}

function sc_dirtyHTML(id){ return sc_dirty(id) ? '<span class="tag gold">Unsaved changes</span><button class="link" data-act="sc-discard" data-id="'+id+'">Discard</button>' : '<span class="xs muted">All changes saved</span>'; }
function sc_patchDirty(id){ var e = document.querySelector('#sc-editor .sc-dirty'); if(e) e.innerHTML = sc_dirtyHTML(id); }

/* ---------- page ---------- */
PAGES['admin-sizecharts'] = {
  layout:'admin',
  title:'Size charts',
  render:function(){
    var u = sc_ui(), ids = sc_ids(); if(ids.indexOf(u.sel)<0) u.sel = ids[0];
    var html = '<div style="margin-bottom:16px"><h1 class="h1">Size charts</h1><div class="small text2" style="margin-top:4px">Sizes (M, L, XL) come from ERP; measurements live here.</div></div>';
    html += '<div class="card sc-how">'+[
      ['One chart per product type & fit','e.g. Polo · Regular fit. Every polo in that fit shares it.'],
      ['Set a default for a category','New products in that category get it automatically — nothing to do.'],
      ['A style fits differently?','Copy the chart and change only what differs.']
    ].map(function(st, i){ return '<div class="sc-step"><span class="sc-num">'+(i+1)+'</span><div><div class="small bold">'+esc(st[0])+'</div><div class="xs text2" style="margin-top:2px">'+esc(st[1])+'</div></div></div>'; }).join('')+'</div>';
    var list = '<div class="sc-list">'+ids.map(function(id){
      var c = CHART(id), n = sc_users(id).length, on = id===u.sel, dirty = sc_dirty(id);
      return '<button class="sc-item'+(on?' on':'')+'" data-act="sc-sel" data-id="'+id+'" aria-pressed="'+on+'"><span class="row between" style="gap:8px"><span class="bold small">'+esc(c.name)+'</span>'+(dirty?'<span class="tag gold">Unsaved</span>':'')+'</span>'+
        '<span class="xs muted" style="display:block;margin-top:2px">'+esc(c.fields.join(' · '))+'</span>'+
        '<span class="row wrap" style="gap:6px;margin-top:8px">'+(c.defaultFor||[]).map(function(x){ return '<span class="tag">Default for '+esc(x)+'</span>'; }).join('')+'<span class="xs text2">Used by '+plural(n,'product')+'</span></span></button>';
    }).join('')+'</div>';
    var cats = DB.categories.filter(function(c){ return !c.hidden && c.chart; });
    var auto = sc_autoChart(u.cat, u.fit), chosen = u.manual || auto, cc = chosen && CHART(chosen);
    var add = '<div class="card p16"><div class="h3">When you add a product</div><div class="xs text2" style="margin-top:2px">Pick category and fit — the size chart is chosen for you.</div>'+
      '<div class="grid g2 mt12" style="gap:10px"><div><label class="label" for="sc-cat">Category</label><select id="sc-cat" class="input" data-change="sc-cat">'+cats.map(function(c){ return '<option value="'+c.id+'"'+(c.id===u.cat?' selected':'')+'>'+esc(c.name)+'</option>'; }).join('')+'</select></div>'+
      '<div><label class="label" for="sc-fit">Fit</label><select id="sc-fit" class="input" data-change="sc-fit">'+['Regular','Slim','Relaxed','Classic'].map(function(f){ return '<option'+(f===u.fit?' selected':'')+'>'+f+'</option>'; }).join('')+'</select></div></div>'+
      '<div class="sc-auto">'+ico('ruler',18)+'<span>Size chart: <b>'+esc(cc?cc.name:'—')+'</b> <span class="muted">('+(u.manual?'chosen by you':'auto')+')</span></span></div>'+
      '<div class="row wrap mt8" style="gap:14px"><button class="link" data-act="sc-change">Change chart</button><button class="link" data-act="sc-custom">Make custom for this style</button>'+(u.manual?'<button class="link" data-act="sc-auto">Back to auto</button>':'')+'</div></div>';
    html += '<div class="sc-grid"><div class="sc-listw"><div class="label">Charts <span class="muted" style="font-weight:500">· '+ids.length+'</span></div>'+list+'</div>'+
      '<div class="sc-edw">'+sc_editor(u.sel)+'</div><div class="sc-addw">'+add+'</div></div>';
    return html;
  }
};

/* ---------- interactions ---------- */
ACT['sc-sel'] = function(el){
  sc_ui().sel = el.getAttribute('data-id'); rerender();
  if(window.innerWidth < 1024){ var e = document.getElementById('sc-editor'); if(e) e.scrollIntoView({block:'start', behavior:'smooth'}); }
};
INPUT['sc-cell'] = function(el){ var d = sc_draft(el.getAttribute('data-id')), s = el.getAttribute('data-size'), i = +el.getAttribute('data-i'); var v = parseFloat(el.value); if(!isNaN(v) && d.rows[s]) d.rows[s][i] = v; sc_patchDirty(el.getAttribute('data-id')); };
INPUT['sc-name'] = function(el){ sc_draft(el.getAttribute('data-id')).name = el.value; sc_patchDirty(el.getAttribute('data-id')); };
INPUT['sc-ease'] = function(el){ var v = parseFloat(el.value); if(!isNaN(v)) sc_draft(el.getAttribute('data-id')).ease = v; sc_patchDirty(el.getAttribute('data-id')); };
CHANGE['sc-cm'] = function(el){ sc_ui().cm = el.checked; rerender(); };
CHANGE['sc-cat'] = function(el){ var u = sc_ui(); u.cat = el.value; u.manual = null; rerender(); };
CHANGE['sc-fit'] = function(el){ var u = sc_ui(); u.fit = el.value; u.manual = null; rerender(); };
ACT['sc-howto'] = function(el){ sc_draft(el.getAttribute('data-id')).howTo = el.getAttribute('data-v'); rerender(); };
ACT['sc-rmrow'] = function(el){ var d = sc_draft(el.getAttribute('data-id')), s = el.getAttribute('data-size'); if(Object.keys(d.rows).length<=1){ toast('A chart needs at least one size'); return; } delete d.rows[s]; toast('Row '+s+' removed — Save to apply'); rerender(); };
ACT['sc-addrow'] = function(el){ var d = sc_draft(el.getAttribute('data-id')), s = el.getAttribute('data-size'); var v = sc_addRow(d, s); toast('Row '+s+' added ('+v.join(' / ')+') — check and Save'); rerender(); };
ACT['sc-discard'] = function(el){ delete sc_ui().drafts[el.getAttribute('data-id')]; toast('Changes discarded'); rerender(); };
ACT['sc-save'] = function(el){
  var id = el.getAttribute('data-id'), d = sc_draft(id), n = sc_users(id).length;
  var bad = Object.keys(d.rows).some(function(s){ return d.rows[s].some(function(v){ return typeof v!=='number' || isNaN(v) || v<=0; }); });
  if(bad){ toast('Some boxes are empty or zero — please fill every measurement'); return; }
  ST.chartsOverride[id] = JSON.parse(JSON.stringify(d)); saveState();
  delete sc_ui().drafts[id];
  toast('Saved — '+plural(n,'product')+' updated'); rerender();
};
ACT['sc-paste'] = function(el){
  var id = el.getAttribute('data-id'), d = sc_draft(id);
  var cur = Object.keys(d.rows).map(function(s){ return [s].concat(d.rows[s]).join('\t'); }).join('\n');
  openModal('<form data-submit="sc-paste" data-id="'+id+'"><div class="small text2">Copy the rows from Excel or Google Sheets and paste them here. One size per line — the size first, then the numbers in this order:</div>'+
    '<div class="row wrap mt8" style="gap:6px"><span class="tag dark">Size</span>'+d.fields.map(function(f){ return '<span class="tag plain">'+esc(f)+'</span>'; }).join('')+'</div>'+
    '<textarea name="rows" class="input mt12" rows="8" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px" aria-label="Pasted rows">'+esc(cur)+'</textarea>'+
    '<div class="xs muted mt8">Example: <code>S 38 27 16.5 7.5</code> · tabs, spaces or commas all work · a header line is skipped.</div>'+
    '<div class="row mt16" style="gap:8px"><button class="btn btn-primary btn-sm">Use these rows</button><button type="button" class="btn btn-ghost btn-sm" data-act="close-modal">Cancel</button></div></form>', {title:'Paste from Excel'});
};
SUBMIT['sc-paste'] = function(f){
  var id = f.getAttribute('data-id'), d = sc_draft(id), r = sc_parse(f.querySelector('[name=rows]').value, d.fields.length);
  if(!r.count){ toast('No rows found — each line needs a size and '+d.fields.length+' numbers'); return; }
  sc_setRows(d, r.rows); closeModal(); toast(plural(r.count,'row')+' pasted — check them, then Save'); rerender();
};
ACT['sc-photo'] = function(){
  openModal('<div class="row" style="gap:8px"><span class="tag gold">'+ico('spark',11)+'AI</span><span class="small text2">Take a photo of the buyer\'s spec sheet — AI reads the measurements into the grid for you to check.</span></div>'+
    '<div class="sc-drop mt16">'+ico('camera',28,'style="margin:0 auto;color:#6E675E"')+'<div class="small bold mt8">Drop a photo here</div><div class="xs muted">JPG or PNG · a clear, straight photo works best</div>'+
    '<button class="btn btn-secondary btn-sm mt12" data-act="sc-photo-demo">Choose photo</button></div>'+
    '<div class="xs muted mt12">AI off? Type or paste — works the same.</div>', {title:'Read from spec sheet photo'});
};
ACT['sc-photo-demo'] = function(){ closeModal(); toast('Demo: AI would read the photo and fill the grid here'); };
ACT['sc-copy'] = function(el){ var c = CHART(el.getAttribute('data-id')); toast('Demo: “'+c.name+'” copied — change only what differs, then link the style'); };
ACT['sc-change'] = function(){
  var u = sc_ui();
  openModal('<div class="small text2 mb12">Use a different chart for this product:</div><div class="stack s8">'+sc_ids().map(function(id){ var c = CHART(id); return '<button class="sc-item" data-act="sc-pick" data-id="'+id+'"><span class="bold small">'+esc(c.name)+'</span><span class="xs muted" style="display:block">'+esc(c.fields.join(' · '))+'</span></button>'; }).join('')+'</div>', {title:'Change chart'});
};
ACT['sc-pick'] = function(el){ sc_ui().manual = el.getAttribute('data-id'); closeModal(); rerender(); };
ACT['sc-auto'] = function(){ sc_ui().manual = null; rerender(); };
ACT['sc-custom'] = function(){ var u = sc_ui(), c = CHART(u.manual || sc_autoChart(u.cat, u.fit)); toast('Demo: a copy of “'+(c?c.name:'chart')+'” is made for this style — change only what differs'); };
