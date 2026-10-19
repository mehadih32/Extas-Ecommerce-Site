/* =====================================================================
   R15 · ADDRESS → DELIVERY BAND (PR 550 / 551, the owner's rules §60.5–60.6)
   ---------------------------------------------------------------------
   Reads the WHOLE line (it is only called once the customer has left the
   address box), against the national list in 05-gazetteer.js.
     1. A district or a postcode in the line settles it, silently:
        "Naruamala, Gabtoli, Bogura" → Bogura → outside Dhaka. No question.
     2. Otherwise every place name in the line votes; if a district was
        written, names from other districts are thrown out first
        ("Gabtoli Bus Stand, Dhaka" → the Dhaka Gabtoli → Dhaka city).
     3. Only a line that is STILL ambiguous asks, naming the two places.
   Spelling: English, Bengali and local spellings from the list, plus a
   loose match for the usual o/a, i/ee, sh/s swaps ("Gabtoli" = "Gabtali").
   Returns {zone:'in'|'sub'|'out'|null, sure, both:[a,b]|null, why}.
   ===================================================================== */
var GZ_BANDZONE = ['in', 'sub', 'out'];
var GZ_METRO = { 'Dhaka':1, 'Gazipur':1, 'Narayanganj':1 };   /* a district name that does not settle the band by itself */
function gzNorm(s){
  /* Bengali: ড়/ঢ়/য় are typed either as one letter or as letter + nukta — make them one form */
  return String(s||'').replace(/\u09A1\u09BC/g,'\u09DC').replace(/\u09A2\u09BC/g,'\u09DD').replace(/\u09AF\u09BC/g,'\u09DF').toLowerCase().replace(/&/g,' and ').replace(/'/g,'').replace(/\(.*?\)/g,' ')
    .replace(/[^a-z0-9ঀ-৿]+/g,' ').replace(/\s+/g,' ').trim();
}
function gzFold(k){        /* the loose key: o→a, ee→i, oo→u, y→i, sh→s, ph→f, z→j */
  return k.replace(/sh/g,'s').replace(/ph/g,'f').replace(/z/g,'j').replace(/ee/g,'i').replace(/oo/g,'u')
    .replace(/y/g,'i').replace(/o/g,'a');   /* (double letters are kept: Badda is not Boda) */
}
var GZ_IX = null;
function gzIndex(){
  if(GZ_IX) return GZ_IX;
  var ex = {}, lo = {}, max = 1;
  for(var i=0; i<GZ.length; i++){
    var k = gzNorm(GZ[i][0]); (ex[k] = ex[k] || []).push(GZ[i]);
    var f = gzFold(k); (lo[f] = lo[f] || []).push(GZ[i]);
    max = Math.max(max, k.split(' ').length);
  }
  var pc = {};
  for(var j=0; j<GZ.length; j++){ var p = GZ[j][4]; if(p) (pc[p] = pc[p] || []).push(GZ[j]); }
  return (GZ_IX = {ex:ex, lo:lo, max:Math.min(max, 5), pc:pc});
}
/* every place named in the line, longest names first, no word used twice */
function gzFind(text){
  var ix = gzIndex(), w = gzNorm(text).split(' ').filter(Boolean), used = [], hits = [];
  for(var n = ix.max; n >= 1; n--){
    for(var i = 0; i + n <= w.length; i++){
      var free = true; for(var q=i; q<i+n; q++) if(used[q]) { free = false; break; }
      if(!free) continue;
      var k = w.slice(i, i+n).join(' ');
      if(k.length < 3 || /^\d+$/.test(k)) continue;
      /* exact spelling AND the loose spelling: "Gabtoli" must find both the
         Dhaka Gabtoli and Bogura's Gabtali, so the rest of the line can choose */
      var a1 = ix.ex[k] || [], a2 = ix.lo[gzFold(k)] || [], list = a1.concat(a2.filter(function(e){ return a1.indexOf(e) < 0; }));
      if(list.length){ hits.push({text:k, list:list}); for(var q2=i; q2<i+n; q2++) used[q2] = true; }
    }
  }
  var codes = (String(text||'').match(/\b\d{4}\b/g) || []).filter(function(c){ return ix.pc[c]; });
  return {hits:hits, codes:codes};
}
function gzResolve(text){
  var f = gzFind(text), dName = function(e){ return GZ_DISTRICTS[e[3]] || ''; };
  if(!f.hits.length && !f.codes.length) return {zone:null, sure:false, both:null, matched:0, why:'no place name'};
  /* 1. strong evidence: a district written out, or a postcode */
  var strong = {};
  f.hits.forEach(function(h){ h.list.forEach(function(e){ if(e[2] === 1) strong[dName(e)] = e; }); });
  f.codes.forEach(function(c){ gzIndex().pc[c].forEach(function(e){ strong[dName(e)] = strong[dName(e)] || e; }); });
  var outside = Object.keys(strong).filter(function(d){ return d && !GZ_METRO[d]; });
  if(outside.length){
    return {zone:'out', sure:true, both:null, matched:9, why:'district '+outside[0]};
  }
  var metro = Object.keys(strong).filter(function(d){ return GZ_METRO[d]; });
  /* 2. the place names vote, inside the written district when there is one.
     Each name is one vote: a name that belongs to one band is DECISIVE; a
     name found in two bands (Gabtoli: Dhaka and Bogura) only narrows. When
     decisive names disagree, the more official one wins (upazila/thana over
     a neighbourhood or a landmark): "Savar EPZ" is Savar, not Chattogram EPZ. */
  var votes = [];
  f.codes.forEach(function(c){ var l = gzIndex().pc[c].filter(function(e){ return e[2] >= 2; }); if(l.length) votes.push({text:c, list:l}); });
  f.hits.forEach(function(h){
    var l = h.list.filter(function(e){ return e[2] >= 2; });
    if(metro.length){ var inD = l.filter(function(e){ return metro.indexOf(dName(e)) >= 0; }); if(inD.length) l = inD; }
    if(l.length) votes.push({text:h.text, list:l});
  });
  votes.forEach(function(v){ var b = {}, lv = 9; v.list.forEach(function(e){ b[e[1]] = e; lv = Math.min(lv, e[2]); }); v.bands = b; v.n = Object.keys(b).length; v.lv = lv; });
  var label = function(e){ var d = dName(e); return e[5] + (d && e[5].indexOf(d) < 0 ? ' ('+d+')' : ''); };
  var dec = votes.filter(function(v){ return v.n === 1; });
  if(dec.length){
    var top = Math.min.apply(null, dec.map(function(v){ return v.lv; }));
    var best = dec.filter(function(v){ return v.lv === top; }), bb = {};
    best.forEach(function(v){ var k = Object.keys(v.bands)[0]; bb[k] = v.bands[k]; });
    var bk = Object.keys(bb);
    if(bk.length === 1) return {zone:GZ_BANDZONE[+bk[0]], sure:true, both:null, matched:5, why:'place '+bb[bk[0]][5]};
    return {zone:null, sure:false, both:[label(bb[bk[0]]), label(bb[bk[1]])], bands:bk.map(function(k){ return GZ_BANDZONE[+k]; }), matched:0, why:'two places'};
  }
  if(votes.length){
    /* only colliding names: keep the bands every one of them allows */
    var keep = Object.keys(votes[0].bands).filter(function(k){ return votes.every(function(v){ return v.bands[k]; }); });
    if(keep.length === 1) return {zone:GZ_BANDZONE[+keep[0]], sure:true, both:null, matched:4, why:'names agree'};
    var ks = keep.length ? keep : Object.keys(votes[0].bands);
    return {zone:null, sure:false, both:[label(votes[0].bands[ks[0]]), label(votes[0].bands[ks[1]])], bands:ks.map(function(k){ return GZ_BANDZONE[+k]; }), matched:0, why:'two places'};
  }
  /* 3. only a metro district was written */
  if(metro.length === 1 && metro[0] !== 'Dhaka') return {zone:'sub', sure:true, both:null, matched:3, why:'district '+metro[0]};
  return {zone:null, sure:false, both:null, bands:['in','sub'], matched:0, why:'Dhaka only'};
}
