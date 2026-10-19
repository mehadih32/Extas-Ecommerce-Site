/* ================= EXTAS demo — Admin · Reviews (86) =================
   The owner's own review desk: type one in, paste one a customer sent on
   WhatsApp or Messenger, import a file, moderate what customers submit.
   The stars on the shop are the average of exactly these rows. */
(function(){
  bag_css('css-arv', `
.arv-top{display:grid;gap:12px;margin-bottom:16px}
@media(min-width:900px){.arv-top{grid-template-columns:1.4fr 1fr}}
.arv-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.arv-k{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:12px 13px}
.arv-k .v{font-family:var(--font-display);font-size:24px;font-weight:800;line-height:1.1}
.arv-k .l{font-size:11.5px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;font-weight:700;margin-top:3px}
.arv-form{display:grid;gap:10px}
@media(min-width:620px){.arv-f2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .arv-f3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}}
.arv-list{display:grid;gap:10px}
.arv-r{display:grid;gap:8px;padding:13px 14px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius)}
.arv-r.hid{opacity:.55}
.arv-rh{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.arv-nm{font-weight:700;font-size:14.5px}
.arv-meta{font-size:12px;color:var(--muted)}
.arv-txt{font-size:13.5px;line-height:1.55;color:var(--text2)}
.arv-src{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;border-radius:12px;padding:2px 8px;border:1px solid var(--line2);color:var(--muted)}
.arv-src.whatsapp{color:#136B37;border-color:#C7EBD6;background:#EAF8F0}
.arv-src.site{color:var(--brand-dark);border-color:var(--brand);background:var(--brand-tint)}
.arv-src.messenger{color:#0A5BC4;border-color:#D2E3FC;background:#EFF5FE}
.arv-acts{display:flex;gap:6px;flex-wrap:wrap}
.arv-stars{display:inline-flex;gap:2px;color:var(--brand)}
.arv-pend{border-left:3px solid #C08A3E}
.arv-note{display:flex;gap:10px;align-items:flex-start;background:var(--surface);border:1px solid var(--line);
  border-left:3px solid var(--brand);border-radius:var(--radius);padding:12px 13px;font-size:13px;line-height:1.55;color:var(--text2)}
`);

  /* ---- data ---- */
  if(!DB.reviews) DB.reviews = [
    {id:'rv1', product:'essential-pique-polo', name:'Rakib Hasan', rating:5, size:'L', height:"5'9\"", weight:72,
     text:'Cloth is thick, colour same as the photo. Took L, fits well.', source:'site', verified:true, hidden:false, pending:false, at:'2026-10-02'},
    {id:'rv2', product:'essential-pique-polo', name:'Shamim Ahmed', rating:4, size:'M', height:"5'7\"", weight:66,
     text:'Delivery was next day in Dhaka. M is slightly loose on me but I like it that way.', source:'whatsapp', verified:true, hidden:false, pending:false, at:'2026-09-28'},
    {id:'rv3', product:'essential-pique-polo', name:'Tanvir', rating:5, size:'XL', height:"6'0\"", weight:84,
     text:'Second one I am buying. Collar does not lose shape after wash.', source:'messenger', verified:false, hidden:false, pending:false, at:'2026-09-20'},
    {id:'rv4', product:'essential-pique-polo', name:'Nayeem', rating:3, size:'M', height:"5'8\"", weight:70,
     text:'Good cotton but navy looked darker than the picture on my phone.', source:'site', verified:true, hidden:false, pending:true, at:'2026-10-14'}
  ];
  function RV(){ return DB.reviews; }
  function stars(n){ var h=''; for(var i=1;i<=5;i++) h += ico(i<=n?'star':'star-o', 14); return '<span class="arv-stars">'+h+'</span>'; }
  function avgFor(pid){
    var rs = RV().filter(function(r){ return r.product===pid && !r.hidden && !r.pending; });
    if(!rs.length) return {avg:0, n:0};
    var t = rs.reduce(function(s,r){ return s + (r.rating||0); }, 0);
    return {avg: Math.round(t/rs.length*10)/10, n: rs.length};
  }
  window.reviewAverage = avgFor;   /* the shop reads its stars from here */

  function ui_(){ return ui('admin:reviews', {product:'essential-pique-polo', name:'', rating:5, size:'', text:'', source:'whatsapp', verified:true, filter:'all'}); }

  function form(){
    var u = ui_(), p = P(u.product) || DB.products[0];
    var opts = DB.products.map(function(x){ return '<option value="'+x.id+'"'+(x.id===u.product?' selected':'')+'>'+esc(x.name)+'</option>'; }).join('');
    var sizes = (p.sizes||[]).map(function(s){ return '<option'+(s===u.size?' selected':'')+'>'+esc(s)+'</option>'; }).join('');
    var srcs = [['whatsapp','WhatsApp'],['messenger','Messenger'],['site','Website'],['phone','Phone'],['instore','In person']]
      .map(function(x){ return '<option value="'+x[0]+'"'+(x[0]===u.source?' selected':'')+'>'+x[1]+'</option>'; }).join('');
    return '<div class="card p20"><div class="h3">Add a review</div>'+
      '<p class="xs muted" style="margin:4px 0 12px">Type what the customer told you, or paste it from WhatsApp or Messenger. These rows are what the shop averages into its star rating.</p>'+
      '<div class="arv-form">'+
        '<div><label class="label" for="arv-p">Product</label><select id="arv-p" class="input" data-change="arv-p">'+opts+'</select></div>'+
        '<div class="arv-f3">'+
          '<div><label class="label" for="arv-n">Customer name</label><input id="arv-n" class="input" data-input="arv-n" value="'+esc(u.name)+'" placeholder="Rakib Hasan"></div>'+
          '<div><label class="label" for="arv-r">Rating</label><select id="arv-r" class="input" data-change="arv-r">'+[5,4,3,2,1].map(function(n){ return '<option'+(n===u.rating?' selected':'')+'>'+n+'</option>'; }).join('')+'</select></div>'+
          '<div><label class="label" for="arv-s">Size bought</label><select id="arv-s" class="input" data-change="arv-s"><option value="">—</option>'+sizes+'</select></div>'+
        '</div>'+
        '<div><label class="label" for="arv-t">What they said</label><textarea id="arv-t" class="input" rows="3" data-input="arv-t" placeholder="Paste the message, or type it">'+esc(u.text)+'</textarea></div>'+
        '<div class="arv-f2">'+
          '<div><label class="label" for="arv-src">Where it came from</label><select id="arv-src" class="input" data-change="arv-src">'+srcs+'</select></div>'+
          '<div><label class="label">&nbsp;</label><label class="check" style="min-height:46px"><input type="checkbox" data-change="arv-v"'+(u.verified?' checked':'')+'><span>Verified buyer — matched to a real order</span></label></div>'+
        '</div>'+
        '<div class="row wrap" style="gap:8px"><button class="btn btn-primary" data-act="arv-add">'+ico('plus',16)+'Add review</button>'+
          '<button class="btn btn-secondary" data-act="arv-import">'+ico('doc',16)+'Import a file</button></div>'+
      '</div></div>';
  }

  function row(r){
    var p = P(r.product);
    return '<div class="arv-r'+(r.hidden?' hid':'')+(r.pending?' arv-pend':'')+'">'+
      '<div class="arv-rh"><span class="row" style="gap:8px">'+stars(r.rating)+'<span class="arv-nm">'+esc(r.name)+'</span>'+
        (r.verified?'<span class="tag">'+ico('check',12)+'Verified</span>':'')+
        '<span class="arv-src '+esc(r.source)+'">'+esc(r.source)+'</span>'+
        (r.pending?'<span class="tag" style="background:#FBF0DF;color:#8A5E19">Waiting</span>':'')+'</span>'+
        '<span class="arv-meta">'+esc(r.at)+'</span></div>'+
      '<div class="arv-txt">'+esc(r.text)+'</div>'+
      '<div class="arv-meta">'+esc(p?p.name:r.product)+(r.size?' · size '+esc(r.size):'')+(r.height?' · '+esc(r.height)+', '+esc(r.weight)+' kg':'')+'</div>'+
      '<div class="arv-acts">'+
        (r.pending?'<button class="btn btn-sm btn-primary" data-act="arv-ok" data-id="'+r.id+'">'+ico('check',14)+'Publish</button>':'')+
        '<button class="btn btn-sm btn-secondary" data-act="arv-hide" data-id="'+r.id+'">'+(r.hidden?'Show':'Hide')+'</button>'+
        '<button class="btn btn-sm btn-ghost" data-act="arv-verify" data-id="'+r.id+'">'+(r.verified?'Unmark verified':'Mark verified')+'</button>'+
        '<button class="btn btn-sm btn-ghost" data-act="arv-del" data-id="'+r.id+'">'+ico('trash',14)+'Delete</button>'+
      '</div></div>';
  }

  PAGES['admin-reviews'] = { layout:'admin', title:'Reviews', render:function(){
    var u = ui_(), all = RV();
    var pend = all.filter(function(r){ return r.pending; }).length;
    var live = all.filter(function(r){ return !r.hidden && !r.pending; });
    var avg = live.length ? Math.round(live.reduce(function(s,r){ return s+r.rating; },0)/live.length*10)/10 : 0;
    var shown = all.filter(function(r){
      if(u.filter==='pending') return r.pending;
      if(u.filter==='hidden') return r.hidden;
      if(u.filter==='live') return !r.hidden && !r.pending;
      return true;
    }).slice().sort(function(a,b){ return (b.at||'').localeCompare(a.at||''); });
    var chips = [['all','All ('+all.length+')'],['live','Live ('+live.length+')'],['pending','Waiting ('+pend+')'],['hidden','Hidden']]
      .map(function(x){ return '<button class="chip'+(u.filter===x[0]?' on':'')+'" data-act="arv-filter" data-v="'+x[0]+'">'+esc(x[1])+'</button>'; }).join('');
    return '<div class="arv-page"><h1 class="h1 mb16">Reviews</h1>'+
      '<div class="arv-top">'+form()+
        '<div class="stack s12">'+
          '<div class="arv-kpis">'+
            '<div class="arv-k"><div class="v">'+(avg||'—')+'</div><div class="l">Average</div></div>'+
            '<div class="arv-k"><div class="v">'+live.length+'</div><div class="l">Live</div></div>'+
            '<div class="arv-k"><div class="v">'+pend+'</div><div class="l">Waiting</div></div>'+
          '</div>'+
          '<div class="arv-note">'+ico('info',18)+'<span>The stars on a product page are the average of its live reviews here — nothing else feeds them. Hidden and waiting rows are left out of the average and out of the Google schema.</span></div>'+
          '<div class="arv-note">'+ico('globe',18)+'<span>Every live review is written into the Product and Review schema of its page, so the rating can show in Google results. Only real stored rows are emitted.</span></div>'+
        '</div>'+
      '</div>'+
      '<div class="row wrap mb16" style="gap:8px">'+chips+'</div>'+
      '<div class="arv-list">'+(shown.length ? shown.map(row).join('') : '<div class="empty">Nothing here yet.</div>')+'</div>'+
    '</div>';
  }};

  CHANGE['arv-p'] = function(el){ ui_().product = el.value; rerender(); };
  CHANGE['arv-r'] = function(el){ ui_().rating = +el.value; };
  CHANGE['arv-s'] = function(el){ ui_().size = el.value; };
  CHANGE['arv-src'] = function(el){ ui_().source = el.value; };
  CHANGE['arv-v'] = function(el){ ui_().verified = el.checked; };
  INPUT['arv-n'] = function(el){ ui_().name = el.value; };
  INPUT['arv-t'] = function(el){ ui_().text = el.value; };
  ACT['arv-add'] = function(){
    var u = ui_();
    if(!u.name.trim() || !u.text.trim()){ toast('Add the customer name and what they said'); return; }
    var dup = RV().some(function(r){ return r.product===u.product && r.text.trim().toLowerCase()===u.text.trim().toLowerCase(); });
    if(dup){ toast('That same review is already in the list'); return; }
    RV().unshift({id:uid(), product:u.product, name:u.name.trim(), rating:u.rating, size:u.size,
      text:u.text.trim(), source:u.source, verified:u.verified, hidden:false, pending:false,
      at:new Date().toISOString().slice(0,10)});
    u.name = ''; u.text = ''; saveState(); rerender(); toast('Review added');
  };
  ACT['arv-import'] = function(){ toast('In the full build this reads a CSV or a WhatsApp export'); };
  ACT['arv-filter'] = function(el){ ui_().filter = el.getAttribute('data-v'); rerender(); };
  var find = function(id){ return RV().filter(function(r){ return r.id===id; })[0]; };
  ACT['arv-hide'] = function(el){ var r = find(el.getAttribute('data-id')); if(r){ r.hidden = !r.hidden; saveState(); rerender(); } };
  ACT['arv-verify'] = function(el){ var r = find(el.getAttribute('data-id')); if(r){ r.verified = !r.verified; saveState(); rerender(); } };
  ACT['arv-ok'] = function(el){ var r = find(el.getAttribute('data-id')); if(r){ r.pending = false; saveState(); rerender(); toast('Published'); } };
  ACT['arv-del'] = function(el){
    var r = find(el.getAttribute('data-id')); if(!r) return;
    if(!confirm('Delete this review from '+r.name+'? This cannot be undone.')) return;
    DB.reviews = RV().filter(function(x){ return x.id!==r.id; }); saveState(); rerender(); toast('Deleted');
  };
})();
