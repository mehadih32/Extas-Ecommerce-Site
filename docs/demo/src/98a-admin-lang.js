/* =====================================================================
   98a-admin-lang.js — প্রহরী Prohori A360-02 (wording: দূত Doot A360-06)
   PR 503 scope "Admin" · owner decision 19 Oct 19:53
   ---------------------------------------------------------------------
   The backend speaks SIMPLE ENGLISH by default, with a switch to Bengali.
   The admin files were written by several agents with many Bengali lines;
   none of them is edited. This file is a layer on top:

     * ST.adminLang  'en' (default) | 'bn'.
     * A switch "English | বাংলা" in the admin sidebar (desktop) and the
       admin top bar (phone/tablet) — added by wrapping adminShell(), the
       same pattern 87 / 89 / 90 / 96 use.
     * After every admin render (and after any click / typing / timer that
       redraws part of a page, a popup, a toast or a confirm box) ONE pass
       walks the text nodes and the placeholder / title / aria-label /
       button-value attributes and swaps Bengali for English through the
       dictionary in 98b-admin-dict.js (ADMIN_DICT). No MutationObserver.
       Order of lookup for a piece of text:
         1. the exact sentence;
         2. the same sentence with its numbers changed (৩টা → {#}টা);
         3. a pattern with placeholders ("{0}টা লেখা" → "{0} posts");
         4. Bengali runs inside mostly-English text ("প্রহরী Prohori").
       Bengali digits become 0–9. Results are cached.
       A dictionary value '' hides a Bengali line that only repeated the
       English label beside it; '#keep' marks a string never shown (left).
     * In Bengali mode nothing is touched — every screen is exactly as
       authored, so the existing Bengali tests pass with ST.adminLang='bn'.
     * Only #/admin… and #/preview… are translated. The shop's own Bengali
       (customer side, /bn) is never touched.
     * Never translated: what people typed (input values, textareas,
       contenteditable), anything marked translate="no" (the switch itself).
   ===================================================================== */
var AL = {idx:null, cache:Object.create(null), miss:Object.create(null), raf:0,
  BN:/[\u0980-\u09F2\u09F4-\u09FF]/,                                  /* Bengali script, not the taka sign (U+09F3) */
  BNL:/[\u0980-\u09E5\u09F0-\u09F2\u09F4-\u09FF]/,                     /* Bengali letters (digits alone just become 0-9) */
  RUN:/[\u0980-\u09E5\u09F0-\u09F2\u09F4-\u09FF](?:[\u0980-\u09F2\u09F4-\u09FF\s,;:!?\-\u2013\u2014\/+%0-9.]*[\u0980-\u09E5\u09F0-\u09F2\u09F4-\u09FF])?/g,
  KNUM:/\{[a-z]\}|[0-9\u09E6-\u09EF]+(?:[.,][0-9\u09E6-\u09EF]+)*/g,
  DIG:/[\u09E6-\u09EF]/g, NUM:/[0-9\u09E6-\u09EF]+(?:[.,][0-9\u09E6-\u09EF]+)*/g,
  /* .zg-md = the owner's own documents in the Blueprint & files reader: shown exactly as written
     (word-by-word swaps inside a Bengali paragraph only garbled it: "PM2 বা Nginx No") */
  SKIP:'textarea,script,style,[translate="no"],[contenteditable="true"],[contenteditable=""],.zg-md'};

function al_lang(){ return (typeof ST !== 'undefined' && ST && ST.adminLang === 'bn') ? 'bn' : 'en'; }
function al_route(){ return /^#\/(admin|preview)(?:[\/?]|$)/.test(location.hash || ''); }
function al_on(){ return al_lang() === 'en' && al_route(); }
function al_digits(s){ return String(s).replace(AL.DIG, function(c){ return String(c.charCodeAt(0) - 0x09E6); }); }
function al_norm(s){ return String(s).replace(/\s+/g, ' ').trim(); }

/* ---------- the dictionary index (built once, on first use) ---------- */
function al_index(){
  if(AL.idx) return AL.idx;
  var D = (typeof ADMIN_DICT !== 'undefined' && ADMIN_DICT) || {};
  var idx = {exact:Object.create(null), loose:Object.create(null), num:Object.create(null), pat:[]};
  var LEAD = /^[\s·—–\-(“"'‘,;:|]+/, TRAIL = /[\s)”"'’:;,.।|]+$/;
  Object.keys(D).forEach(function(k){
    var en = D[k], key = al_norm(k);
    if(en === '#keep') return;                       /* not shown on screen (a word list in code): left alone */
    if(/\{\d+\}/.test(key)){
      /* a pattern: literal pieces + placeholders */
      var parts = key.split(/\{(\d+)\}/), src = '^', order = [], longest = '';
      for(var i = 0; i < parts.length; i++){
        if(i % 2){ src += '([\\s\\S]*?)'; order.push(+parts[i]); }
        else { src += parts[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); if(parts[i].length > longest.length) longest = parts[i]; }
      }
      idx.pat.push({re:new RegExp(src + '$'), order:order, en:en, lit:longest.trim()});
      return;
    }
    idx.exact[key] = en;
    /* the same words without the dash / dot / brackets around them ("· সর্বশেষ" → "সর্বশেষ") */
    var core = key.replace(LEAD, '').replace(TRAIL, '');
    if(core && core !== key && AL.BNL.test(core)) idx.loose[core] = idx.loose[core] || en.replace(LEAD, '').replace(TRAIL, '');
    /* numbers — and one-letter slots like {w} that a page fills with a number — can change */
    var nums = key.match(AL.KNUM);
    if(nums) idx.num[key.replace(AL.KNUM, '\uE002')] = {en:en, nums:nums.map(al_digits)};
  });
  /* Settings rows carry their own pair {en, bn}. Rows built at run time from
     data ("Any polos — ধাপ 1: কয়টা …", the shimmer items) cannot be in the
     dictionary, so their Bengali line maps to the row's own English label
     (and is then hidden as a repeat of it). The dictionary still wins. */
  if(typeof ZS_SETTINGS !== 'undefined' && ZS_SETTINGS && ZS_SETTINGS.forEach) ZS_SETTINGS.forEach(function(r){
    if(!r || typeof r.bn !== 'string' || typeof r.en !== 'string' || !AL.BNL.test(r.bn) || AL.BN.test(r.en)) return;
    var key = al_norm(r.bn); if(idx.exact[key] == null) idx.exact[key] = r.en;
  });
  /* longer literal first: the most specific pattern wins */
  idx.pat.sort(function(a, b){ return b.lit.length - a.lit.length; });
  AL.idx = idx; return idx;
}

/* the same sentence with other numbers: put the new numbers where the old ones were */
function al_numSwap(hit, nums){
  var en = hit.en, out = '', pos = 0;
  for(var i = 0; i < hit.nums.length; i++){
    var j = en.indexOf(hit.nums[i], pos);
    if(j < 0) continue;
    out += en.slice(pos, j) + nums[i]; pos = j + hit.nums[i].length;
  }
  return out + en.slice(pos);
}
/* a known piece: exact, then without punctuation around it, then with other numbers */
function al_word(s){
  var I = al_index();
  if(I.exact[s] != null) return I.exact[s];
  if(I.loose[s] != null) return I.loose[s];
  var nums = s.match(AL.NUM);
  if(nums){ var h = I.num[s.replace(AL.NUM, '\uE002')]; if(h) return al_numSwap(h, nums.map(al_digits)); }
  return null;
}
function al_whole(s, depth){
  var w = al_word(s); if(w != null) return w;
  if(depth > 3) return null;
  var I = al_index();
  for(var i = 0; i < I.pat.length; i++){
    var p = I.pat[i]; if(p.lit && s.indexOf(p.lit) < 0) continue;
    var m = p.re.exec(s); if(!m) continue;
    var vals = {}; p.order.forEach(function(n, k){ vals[n] = m[k + 1]; });
    return p.en.replace(/\{(\d+)\}/g, function(_, n){
      var v = vals[n]; if(v == null) return '';
      return AL.BNL.test(v) ? al_full(v, depth + 1) : al_digits(v);
    });
  }
  return null;
}
/* text glued from two or more known pieces ("PR 597 যোগ হলো · যুক্ত: 595",
   "এখন ২টা — ৩–৫টা লাগবে"): split at · — ; , | and match the longest runs of pieces */
var AL_SEP = /(\s+[·—–|→+]\s+|\s*;\s+|,\s+)/;
function al_split(s, depth){
  var parts = s.split(AL_SEP); if(parts.length < 3) return null;   /* [piece, sep, piece, sep, piece …] */
  var out = [], i = 0, n = parts.length;
  var useSep = function(t){ var sep = out.pop(); out.push(/^\s*/.exec(sep)[0]); out.push(t); };   /* the key carried the dash itself */
  var trAt = -1;   /* where in out the last translated piece sits */
  /* "প্রহরী Prohori": the English already follows the Bengali start — say it once */
  var glue = function(h, rest){ var a = String(h).trim().toLowerCase(), b = rest.trim().toLowerCase();
    return (a && b.indexOf(a) === 0 && !/[a-z0-9]/.test(b.charAt(a.length))) ? rest.replace(/^\s+/, '') : h + rest; };
  /* more English than Bengali: a sentence with a Bengali word in it, not a Bengali label */
  var latinHeavy = function(t){ return (t.match(/[A-Za-z]/g) || []).length > (t.match(/[ঀ-৥ৰ-৲৴-৿]/g) || []).length; };
  while(i < n){
    if(!AL.BNL.test(parts[i])){
      out.push(al_digits(parts[i]));
      /* "ঋতু · Ritu" → "Ritu · Ritu": the English twin of the piece just translated is said once */
      if(trAt >= 0 && trAt === out.length - 3 && al_key(out[out.length - 1]) && al_key(out[out.length - 1]) === al_key(out[trAt])) out.splice(out.length - 2, 2);
      if(i + 1 < n) out.push(parts[i + 1]); i += 2; continue; }
    var hit = null, end = -1, sp = i > 0 ? parts[i - 1].trim() : '';
    for(var j = n - 1; j >= i; j -= 2){                               /* the longest run of pieces first */
      var txt = parts.slice(i, j + 1).join('');
      if(sp && (hit = al_whole(sp + ' ' + txt, depth + 1)) != null){ end = j; useSep(hit); break; }
      if((hit = al_whole(txt, depth + 1)) != null){ end = j; out.push(hit); break; }
    }
    if(hit == null){
      /* "যুক্ত: 595" — a known Bengali start, the rest has no Bengali */
      var m = /^([\s\S]*[ঀ-৥ৰ-৲৴-৿][:।]?)([^ঀ-৥ৰ-৲৴-৿]*)$/.exec(parts[i]);
      if(m && m[2] && !latinHeavy(m[1])){
        if(sp && (hit = al_whole(sp + ' ' + m[1], depth + 1)) != null) useSep(glue(hit, al_digits(m[2])));
        else if((hit = al_whole(m[1], depth + 1)) != null) out.push(glue(hit, al_digits(m[2])));
      }
      if(hit == null) return null;
      end = i;
    }
    trAt = out.length - 1;
    /* "Sawdagor · সওদাগর" — the English already stands beside it: keep one */
    if(out.length >= 3 && al_key(out[out.length - 1]) && al_key(out[out.length - 1]) === al_key(out[out.length - 3])) out.splice(out.length - 2, 2);
    if(end + 1 < n) out.push(parts[end + 1]);
    i = end + 2;
  }
  out = out.join('').replace(/^\s+/, '');
  /* "সওদাগর · Sawdagor" — the same the other way round */
  return out.replace(/^(.+?)(\s+[·—–|]\s+)(.+)$/, function(m, a, sep, b){ return al_key(a) === al_key(b) ? b : m; });
}
/* Bengali runs inside English text: translate each run; a run whose English
   repeats the word right next to it ("প্রহরী Prohori") is dropped */
function al_runs(s, depth){
  var left = false;
  var out = s.replace(AL.RUN, function(run, at, all){
    var r = al_norm(run), t = al_word(r);
    if(t == null && (depth || 0) < 3) t = al_whole(r, (depth || 0) + 1);
    if(t == null){
      /* a label that starts with an English word ("AI দিয়ে পোজ/ভিডিও বানান"): the run plus the word before it */
      var pw = /([A-Za-z§][A-Za-z0-9+.\-]*)(\s*)$/.exec(all.slice(0, at));   /* "AI দিয়ে …", "V2.1-এ …", "§ক" */
      if(pw && (t = al_word(pw[1] + (pw[2] ? ' ' : '') + r)) != null) return '\uE005' + t;
      if(AL.BNL.test(r)) left = true; return run; }
    var after = all.slice(at + run.length).replace(/^[\s"'“”‘’(·|—–:\-]+/, ''), before = all.slice(0, at).replace(/[\s"'“”‘’)·|—–:\-]+$/, '');
    var tl = t.toLowerCase();
    if(tl && after.toLowerCase().indexOf(tl) === 0) return '\uE003';                                      /* "প্রহরী · Prohori" */
    if(tl && before.length >= tl.length && before.toLowerCase().slice(-tl.length) === tl) return '\uE004';  /* "Prohori · প্রহরী" */
    return t;
  });
  out = out.replace(/[A-Za-z§][A-Za-z0-9+.\-]*\s*\uE005/g, '').replace(/\uE005/g, '');
  out = out.replace(/\uE003[\s"'“”‘’(·|—–:\-]*/g, '').replace(/[\s"'“”‘’)·|—–:\-]*\uE004/g, '').replace(/^\s+|\s+$/g, '');
  if(left) AL.miss[al_norm(s)] = 1;
  return al_digits(out);
}
function al_full(s, depth){
  s = al_norm(s);
  var t = al_whole(s, depth);
  if(t == null) t = al_split(s, depth);
  return t == null ? al_runs(s, depth) : al_digits(t);
}
/* one piece of text → English (or the same text if nothing is known) */
function al_tr(raw){
  if(!AL.BNL.test(raw)) return al_digits(raw);
  var s = al_norm(raw);
  var c = AL.cache[s]; if(c != null) return c;
  var t = al_full(s, 0);
  AL.cache[s] = t; return t;
}
/* keep the spaces around the text as they were */
function al_trKeep(v){
  /* a message preview with line breaks (Telegram, SMS) is translated line by line */
  if(v.indexOf('\n') >= 0 && /\S\s*\n\s*\S/.test(v)) return v.split('\n').map(function(l){ return AL.BN.test(l) ? al_trKeep(l) : l; }).join('\n');
  var lead = /^\s*/.exec(v)[0], trail = /\s*$/.exec(v)[0];
  return lead + al_tr(v) + trail;
}

/* ---------- the pass ---------- */
var AL_ATTRS = ['placeholder', 'title', 'aria-label'];
function al_pass(root){
  if(!root || !al_on()) return;
  var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n, touched = [], nodes = [];
  while((n = w.nextNode())){
    var v = n.nodeValue; if(!AL.BN.test(v)) continue;
    var p = n.parentElement; if(!p || p.closest(AL.SKIP)) continue;
    var t = al_trKeep(v); if(t !== v){ n.nodeValue = t; touched.push(p); nodes.push(n); }
    /* '' in the dictionary = this Bengali line only repeated the English
       label next to it: in English it is hidden */
    if(!t.trim() && !p.textContent.trim()){
      p.classList.add('al-dup');
      var ps = p.previousSibling; if(ps && ps.nodeType === 3) ps.nodeValue = ps.nodeValue.replace(/\s*[·|—–]\s*$/, '');   /* no dangling " · " */
    }
  }
  var sel = '[placeholder],[title],[aria-label],input[type=button][value],input[type=submit][value],input[type=reset][value]';
  var els = root.querySelectorAll ? root.querySelectorAll(sel) : [];
  for(var i = 0; i < els.length; i++){
    var e = els[i];
    if(e.closest('[translate="no"]')) continue;
    for(var a = 0; a < AL_ATTRS.length; a++){ var x = e.getAttribute(AL_ATTRS[a]); if(x && AL.BN.test(x)) e.setAttribute(AL_ATTRS[a], al_tr(x)); }
    if(e.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(e.type) && AL.BN.test(e.value || '')) e.value = al_tr(e.value);
  }
  al_dedupe(touched);
  al_dedupeNodes(nodes);
}
/* A Bengali line that only repeated the English label next to it would now
   say the same thing twice ("Price" / "Price"): hide the copy. */
function al_key(s){ return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
function al_sameish(me, k){
  if(!me || !k) return false;
  if(k === me) return true;
  /* the label says it and a bit more: "Old price (৳, optional)" / "Old price" */
  if(me.length >= 3 && k.length < 60 && (k.indexOf(me) === 0 || k.slice(-me.length) === me)) return true;
  /* the copy says the label and one short word more: "Sub-category" / "Sub-category / style" */
  return k.length >= 3 && me.indexOf(k) === 0 && me.length - k.length <= 12;
}
function al_textOf(node){ return node ? node.textContent : ''; }
function al_dedupe(list){
  for(var i = 0; i < list.length; i++){
    var el = list[i]; if(!el || el.classList.contains('al-dup') || el.children.length) continue;
    var me = al_key(el.textContent); if(!me) continue;
    var pv = el.previousSibling; while(pv && pv.nodeType === 3 && !pv.nodeValue.trim()) pv = pv.previousSibling;
    var nx = el.nextSibling; while(nx && nx.nodeType === 3 && !nx.nodeValue.trim()) nx = nx.nextSibling;
    var par = el.parentElement;
    var before = pv ? al_textOf(pv) : (par && par.previousElementSibling ? par.previousElementSibling.textContent : '');
    if(al_sameish(me, al_key(before))){ el.classList.add('al-dup'); continue; }
    /* the English twin right after it ("Server foundation" / "Server foundation"): hide the twin */
    if(nx && nx.nodeType === 1 && al_key(nx.textContent) === me) nx.classList.add('al-dup');
  }
}
/* The same name twice across neighbouring nodes once translated:
   <span>সুতা</span> · Suta  →  Suta        You · মালিক<small>Owner</small>  →  You<small>Owner</small> */
var AL_DSEP = /^\s*[·|—–:]\s*/;
function al_dedupeNodes(nodes){
  for(var i = 0; i < nodes.length; i++){
    var n = nodes[i], p = n.parentElement; if(!p) continue;
    var me = al_key(n.nodeValue);
    /* a whole element translated, and the text right after/before it repeats it */
    if(me && p.childNodes.length === 1 && !p.classList.contains('al-dup')){
      var nx = p.nextSibling, pv = p.previousSibling;
      if(nx && nx.nodeType === 3 && AL_DSEP.test(nx.nodeValue) && al_key(nx.nodeValue.split(/\s[·|—–]\s/)[1] || nx.nodeValue) === me){ p.classList.add('al-dup'); nx.nodeValue = nx.nodeValue.replace(AL_DSEP, ''); continue; }
      if(pv && pv.nodeType === 3 && /\s*[·|—–:]\s*$/.test(pv.nodeValue) && al_key(pv.nodeValue.split(/\s[·|—–]\s/).pop()) === me){ p.classList.add('al-dup'); pv.nodeValue = pv.nodeValue.replace(/\s*[·|—–:]\s*$/, ''); continue; }
      /* "You · Owner<small>মালিক</small>": the English is already the last word before it */
      if(pv && pv.nodeType === 3 && al_key(pv.nodeValue.split(/\s[·|—–]\s/).pop()) === me){ p.classList.add('al-dup'); continue; }
    }
    /* "What's new<span> · What's new</span>": the element after it only echoes it */
    var ne = n.nextSibling;
    if(me && ne && ne.nodeType === 1 && !ne.children.length && al_key(ne.textContent.replace(AL_DSEP, '')) === me){ ne.classList.add('al-dup'); continue; }
    /* the last / first part of this text is what the element beside it says */
    var parts = n.nodeValue.split(/(\s+[·|—–]\s+)/); if(parts.length < 3) continue;
    var nxe = n.nextSibling, pve = n.previousSibling;
    if(nxe && nxe.nodeType === 1 && al_key(nxe.textContent) && al_key(nxe.textContent) === al_key(parts[parts.length - 1])){ n.nodeValue = parts.slice(0, -2).join(''); continue; }
    if(pve && pve.nodeType === 1 && al_key(pve.textContent) && al_key(pve.textContent) === al_key(parts[0])){ n.nodeValue = parts.slice(2).join(''); }
  }
}
function al_all(){
  if(!al_on()) return;
  al_pass(document.getElementById('app'));
  var m = document.querySelector('.modal-back'); if(m) al_pass(m);
  var t = document.querySelector('.toast'); if(t) al_pass(t);
  var dp = document.querySelector('.demo-panel'); if(dp) al_pass(dp);
}
function al_schedule(){
  if(AL.raf || !al_on()) return;
  AL.raf = (window.requestAnimationFrame || setTimeout)(function(){ AL.raf = 0; al_all(); });
}

/* ---------- hooks: render, popups, toasts, browser boxes, events, timers ---------- */
(function(){
  if(typeof render === 'function' && !render._al){
    var r0 = render;
    render = function(){ var x = r0.apply(this, arguments); try{ al_all(); }catch(e){ console.error(e); } return x; };
    render._al = true;
  }
  if(typeof drawModal === 'function' && !drawModal._al){
    var d0 = drawModal;
    drawModal = function(){ var x = d0.apply(this, arguments); try{ if(al_on()) al_pass(document.querySelector('.modal-back')); }catch(e){} return x; };
    drawModal._al = true;
  }
  if(typeof toast === 'function' && !toast._al){
    var t0 = toast;
    toast = function(msg){ var a = [].slice.call(arguments); if(al_on() && typeof msg === 'string') a[0] = al_tr(msg); return t0.apply(this, a); };
    toast._al = true;
  }
  ['confirm', 'alert', 'prompt'].forEach(function(k){
    var f = window[k]; if(typeof f !== 'function' || f._al) return;
    var w = function(msg){ var a = [].slice.call(arguments); if(al_on() && typeof msg === 'string') a[0] = msg.split('\n').map(al_tr).join('\n'); return f.apply(window, a); };
    w._al = true; window[k] = w;
  });
  ['click', 'input', 'change', 'submit', 'keyup', 'focusout'].forEach(function(ev){ document.addEventListener(ev, al_schedule); });
  window.addEventListener('hashchange', al_schedule);
  /* a demo step that finishes later (Run now, simulated progress) redraws from a timer */
  var st0 = window.setTimeout;
  if(st0 && !st0._al){
    var stw = function(fn){
      if(typeof fn !== 'function') return st0.apply(window, arguments);
      var a = [].slice.call(arguments); a[0] = function(){ var x = fn.apply(this, arguments); if(AL.idx) al_schedule(); return x; };
      return st0.apply(window, a);
    };
    stw._al = true; window.setTimeout = stw;
  }
})();

/* ---------- the switch ---------- */
function al_switch(where){
  var en = al_lang() === 'en';
  var b = function(v, full, short, on){ return '<button type="button" class="al-b'+(on?' on':'')+'" data-act="al-lang" data-v="'+v+'" aria-pressed="'+(on?'true':'false')+'" aria-label="'+full+'" lang="'+v+'"><span class="al-f" aria-hidden="true">'+full+'</span><span class="al-s" aria-hidden="true">'+short+'</span></button>'; };
  return '<div class="al-sw al-'+where+'" translate="no" role="group" aria-label="Admin language · অ্যাডমিনের ভাষা">'+b('en', 'English', 'EN', en)+b('bn', 'বাংলা', 'বাং', !en)+'</div>';
}
ACT['al-lang'] = function(el){
  var v = el.getAttribute('data-v') === 'bn' ? 'bn' : 'en';
  if(al_lang() === v) return;
  ST.adminLang = v; saveState();
  if(document.querySelector('.modal-back') && typeof refreshModal === 'function'){ try{ refreshModal(); }catch(e){} }
  rerender();
  var f = document.querySelector('.al-sw .al-b.on'); if(f){ try{ f.focus({preventScroll:true}); }catch(e){} }
};
(function(){
  try{
    var orig = window.adminShell; if(typeof orig !== 'function' || orig._al) return;
    var w = function(body, cur){
      var out = orig.apply(this, arguments);
      try{
        if(out.indexOf('al-sw') < 0){
          /* desktop sidebar: right under the EXTAS · Admin mark */
          out = out.replace(/(<aside class="admin-side"><div class="row"[^>]*>[\s\S]*?<\/div>)/, function(m){ return m + al_switch('side'); });
          /* phone / tablet top bar: between the mark and "Shop →" */
          out = out.replace(/(<div class="admin-top">[\s\S]*?<\/span><\/span>)/, function(m){ return m + al_switch('top'); });
          /* a small phone has no room in the top bar: the switch moves to the top of the page instead */
          out = out.replace(/(<main class="admin-main"[^>]*>)/, function(m){ return m + al_switch('main'); });
        }
      }catch(e){}
      return out;
    };
    w._al = true; window.adminShell = w;
  }catch(e){}
})();

/* the switch's look — #app weight because page modules inject CSS late */
(function(){
  var css = [
    '#app .al-sw{display:inline-flex;align-items:center;gap:2px;padding:2px;border-radius:999px;background:rgba(255,255,255,.12);flex:0 0 auto}',
    '#app .al-sw .al-b{appearance:none;border:0;background:transparent;color:#DDE8E4;font-family:inherit;font-weight:600;font-size:12.5px;line-height:1;padding:0 12px;min-height:30px;border-radius:999px;cursor:pointer;white-space:nowrap}',
    '#app .al-sw .al-b.on{background:#fff;color:#15302B}',
    '#app .al-sw .al-b:focus-visible{outline:2px solid #9FBDB4;outline-offset:1px}',
    '#app .al-sw .al-s{display:none}',
    '#app .al-side{margin:0 12px 14px;align-self:flex-start}',
    /* phone/tablet top bar: kept to the right, next to "Shop →", so the free middle stays free (the demo gear sits there) */
    '#app .admin-top .al-top{margin:0 12px 0 auto;min-width:0}',
    '#app .admin-top .al-top .al-b{min-height:32px;min-width:30px;padding:0 8px;font-size:12px}',
    /* AUTO ADJUST: the top bar always shows the short EN | বাং (full words in the sidebar) */
    '#app .admin-top .al-top .al-f{display:none}#app .admin-top .al-top .al-s{display:inline}',
    '#app .al-main{display:none}',
    '@media (max-width:379px){#app .admin-top .al-top{display:none}#app .al-main{display:flex;width:max-content;margin:0 0 12px auto;background:#E9E5DF}#app .al-main .al-b{color:#15302B;min-height:32px;min-width:30px;padding:0 10px}#app .al-main .al-b.on{background:#15302B;color:#fff}#app .al-main .al-f{display:none}#app .al-main .al-s{display:inline}}',
    '#app .al-dup{display:none!important}'
  ].join('\n');
  var s = document.createElement('style'); s.id = 'al-css'; s.textContent = css; document.head.appendChild(s);
})();
