import sys
p=sys.argv[1]; s=open(p).read()
rep=[
("""  if(!c.oneWord) return '<section class="card co-sec co-soon" data-testid="co-pay">'+co_hd(3,COLBL('payment'))+
    '<div class="co-soonrow">'+['Cash on Delivery','bKash','Nagad','Visa','Mastercard'].map(function(x){ return '<span class="co-badge">'+esc(x)+'</span>'; }).join('')+'</div>'+
    '<p class="co-fdays">'+ico('lock',14)+'<span>'+esc(cot('Opens as you write your address. Cash on Delivery is ready by default.'))+'</span></p></section>';
  var due = fmt(c.grand);""","""  /* K9 (owner, 20 Oct) — ROOT CAUSE of "sometimes one line, sometimes boxes":
     rule 39 drew this block as one row of name tags until the ADDRESS had a
     finished word, and the address itself comes back from this tab's saved
     draft (bug 14) or a logged-in account. So the same page showed the tags
     (nothing to choose) on a fresh visit and the boxes after any earlier
     visit or a refresh. On a desktop the boxes now always show and every
     method can be chosen before the address; the phone keeps rule 39. */
  var soon = !c.oneWord ? '<section class="card co-sec co-soon" data-testid="co-pay">'+co_hd(3,COLBL('payment'))+
    '<div class="co-soonrow">'+['Cash on Delivery','bKash','Nagad','Visa','Mastercard'].map(function(x){ return '<span class="co-badge">'+esc(x)+'</span>'; }).join('')+'</div>'+
    '<p class="co-fdays">'+ico('lock',14)+'<span>'+esc(cot('Opens as you write your address. Cash on Delivery is ready by default.'))+'</span></p></section>' : '';
  var due = fmt(c.grand);"""),
("""  return '<section class="card co-sec co-paysec" data-testid="co-pay">'+co_hd(3,COLBL('payment'))+'<div class="stack s8 mt12">'+""","""  return (soon ? '<div class="hide-d">'+soon+'</div><div class="hide-m">' : '')+'<section class="card co-sec co-paysec" data-testid="'+(soon ? 'co-pay-desk' : 'co-pay')+'">'+co_hd(3,COLBL('payment'))+'<div class="stack s8 mt12">'+"""),
("""      chooser('co-card', u.cardType, [['visa','Visa'],['mastercard','Mastercard'],['amex','Amex'],['bank','Internet banking']])+'<div class="xs muted mt8">Secure payment of '+due+' on the next step. (Demo)</div>')+
  '</div></section>';""","""      chooser('co-card', u.cardType, [['visa','Visa'],['mastercard','Mastercard'],['amex','Amex'],['bank','Internet banking']])+'<div class="xs muted mt8">Secure payment of '+due+' on the next step. (Demo)</div>')+
  '</div></section>'+(soon ? '</div>' : '');"""),
("""  return '<div class="h3" style="margin-bottom:6px">'+esc(cot('Order summary'))+' · '+(ST.lang==='bn' ? tot.count+' '+cot('items') : plural(tot.count,'item'))+'</div>""","""  return '<div class="h3" style="margin-bottom:6px">'+esc(cot('Order summary'))+' · <span class="co-cnt" data-testid="co-count">'+(ST.lang==='bn' ? tot.count+' '+cot('items') : plural(tot.count,'item'))+'</span></div>"""),
("""  var note = '<div class="card co-sec co-notecard">'+(u.noteOpen
    ? '<label class="label" for="co-note">'+esc(COLBL('note'))+'</label><input id="co-note" class="input" data-input="co-note" value="'+esc(u.note)+'" placeholder="e.g. Leave it with the guard if I\\'m out">'
    : '<button type="button" class="co-noteadd" data-act="co-note">'+ico('plus',16)+'<span>'+esc(COLBL('noteAdd'))+'</span></button>')+'</div>';""","""  /* K6 (owner, desktop): the delivery note is always open, in bigger text — the
     phone keeps its "+ Add a delivery note" button (the open box is hide-m) */
  var note = '<div class="card co-sec co-notecard">'+(u.noteOpen
    ? '<label class="label" for="co-note">'+esc(COLBL('note'))+'</label><input id="co-note" class="input" data-input="co-note" value="'+esc(u.note)+'" placeholder="e.g. Leave it with the guard if I\\'m out">'
    : '<button type="button" class="co-noteadd hide-d" data-act="co-note">'+ico('plus',16)+'<span>'+esc(COLBL('noteAdd'))+'</span></button>'+
      '<div class="hide-m co-note-d"><label class="label" for="co-note-d">'+esc(COLBL('note'))+'</label><input id="co-note-d" class="input" data-input="co-note" value="'+esc(u.note)+'" placeholder="e.g. Leave it with the guard if I\\'m out"></div>')+'</div>';"""),
("""  var msgs = '<section class="card co-sec stack s12">'+""","""  var msgs = '<section class="card co-sec stack s12 co-msgs">'+"""),
("""    '<div class="container co-wrap"><div class="split-side">'+""","""    '<div class="container co-wrap co-lay-'+(typeof coC_layout==='function' ? coC_layout() : 'classic')+'"><div class="split-side">'+"""),
("""  if(fl){ fl.style.top = top+'px'; fl.style.maxHeight = 'calc(100vh - '+(top+16)+'px)'; }
}""","""  if(fl){ fl.style.top = top+'px'; fl.style.maxHeight = 'calc(100vh - '+(top+16)+'px)'; }
  if(typeof coC_fitFloat==='function') coC_fitFloat();   /* K4: never clip the card or the help box */
}"""),
]
for o,n in rep:
    assert s.count(o)==1, o[:70]; s=s.replace(o,n)
open(p,'w').write(s); print('ok')
