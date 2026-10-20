/* ================= EXTAS demo — content pages (71-pages.js) =================
   One generic route for every written page: #/page/:slug
   Everything here is owner-editable copy in the real build. */
bag_css('css-pages', [
  /* R15 wave 1 (bug 15): the 16 px side gutter every phone page has (the help
     pages sit outside .container, so the page keeps its own) */
  '.pg{max-width:760px;margin:0 auto;padding:18px 16px 8px;box-sizing:content-box}',
  '@media(min-width:768px){.pg{padding:28px 24px 12px}}',
  '@media(min-width:1024px){.pg{padding:36px 32px 16px}}',
  '.pg-pay{display:grid;gap:10px;margin:8px 0 4px}','.pg-pay li{list-style:none}','.pg-ul0{padding-left:0!important}',
  '.pg h1{font-family:var(--font-display);font-size:28px;font-weight:800;letter-spacing:-.01em;margin:0 0 6px}',
  '@media(min-width:1024px){.pg h1{font-size:38px}}',
  '.pg .pg-lede{font-size:15px;color:var(--text2);margin:0 0 18px;line-height:1.55}',
  '.pg h2{font-family:var(--font-display);font-size:18px;font-weight:700;margin:22px 0 6px}',
  '.pg p,.pg li{font-size:14.5px;line-height:1.7;color:var(--text2)}',
  '.pg ul{margin:6px 0 0;padding-left:18px}',
  '.pg .card{padding:16px}',
  '.pg-q{border-bottom:1px solid var(--line2)}',
  '.pg-q:last-child{border-bottom:0}',
  '.pg-qh{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;background:none;border:0;'
    +'padding:14px 2px;min-height:52px;text-align:left;cursor:pointer;font-size:14.5px;font-weight:600;color:var(--ink)}',
  '.pg-qb{padding:0 2px 14px;font-size:14px;line-height:1.65;color:var(--text2)}',
  '.pg-contact{display:grid;gap:12px}',
  '@media(min-width:768px){.pg-contact{grid-template-columns:1.1fr .9fr;align-items:start}}',
  '.pg-ch{display:flex;align-items:center;gap:12px;padding:14px;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);min-height:66px}',
  '.pg-ch .ic{width:38px;height:38px;border-radius:50%;background:var(--brand-tint);color:var(--brand);display:flex;align-items:center;justify-content:center;flex-shrink:0}',
  '.pg-ch b{display:block;font-size:14.5px}',
  '.pg-ch span{font-size:12.5px;color:var(--text2)}',
  '.pg-hero{background:var(--surface2);border:1px solid var(--line2);border-radius:var(--card-radius);padding:18px;margin-bottom:18px}'
].join('\n'));

var PG = {
  faq: { title:'Questions and answers', lede:'The things customers ask us most. Still stuck? Message us on WhatsApp — a person answers, 10 am to 10 pm.',
    qa:[
      ['How long does delivery take?', 'Inside Dhaka city, {insideHours} hours. Dhaka sub-areas, {subHours} hours. Outside Dhaka, {outsideHours} hours. You get an SMS with a tracking link as soon as the parcel leaves us.'],
      ['How much is delivery?', 'Dhaka city ৳{inside}. Dhaka sub-areas ৳{sub}. Outside Dhaka ৳{outside}. Free on orders over ৳{freeOver}.'],
      ['Can I pay cash on delivery?', 'Yes, all over Bangladesh. You can also pay with bKash, Nagad or card if you prefer.'],
      ['Can I change the size after it arrives?', 'Yes. You have {windowHours} hours from delivery to exchange for another size, as long as the item is unworn and unwashed with its tags on.'],
      ['Can I return it for a refund?', 'Items can be exchanged for size, not returned for a refund. If we sent the wrong item or it arrived damaged, we take it back and there is no charge to you.'],
      ['What if I refuse the parcel at the door?', 'You can — just pay the delivery charge to the rider. There is no charge if the mistake was ours.'],
      ['How do I know which size to take?', 'Use Find my size on any product page: give your height and weight and it tells you the size, and why. Every product also has a measurement chart.'],
      ['Are the colours on screen accurate?', 'We photograph every colour in daylight and mark one photo as the true-colour shot. Phone screens still differ, so if a colour matters, ask us on WhatsApp before ordering.'],
      ['Is this original branded stock?', 'Yes. We retail genuine goods and we say plainly which brand each item is.'],
      ['Do you have a shop I can visit?', 'Not yet — we sell online only, all over Bangladesh.']
    ]},
  delivery: { title:'Delivery', lede:'What it costs, how long it takes, and what happens at the door.',
    body:'<h2>Charges</h2><ul><li>Dhaka city — ৳{inside}, {insideHours} hours</li><li>Dhaka sub-areas — ৳{sub}, {subHours} hours</li><li>Outside Dhaka — ৳{outside}, {outsideHours} hours</li><li>Free delivery on orders over ৳{freeOver}</li></ul>'
      +'<h2>How it works</h2><p>We pack the same day for orders placed before 5 pm. You get an SMS when the order is confirmed and again when the courier picks it up, with a tracking link.</p>'
      +'<h2>At the door</h2>{TRIAL}<p>Check the parcel in front of the rider if you want to. If you decide not to take it, you pay only the delivery charge to the rider. If the mistake was ours — wrong item, wrong size sent, damaged — there is no charge at all.</p>'
      +'<h2>Courier partners</h2><p>Steadfast and Pathao, depending on your area.</p>' },
  exchange: { title:'Exchange and returns', lede:'Written plainly, so there are no surprises.',
    body:'{TRIAL}<h2>Size exchange</h2><p>You have {windowHours} hours from delivery. The item must be unworn, unwashed and still have its tags. One exchange per item.</p>'
      +'<h2>What it costs</h2><p>The exchange delivery charge is on us for the first exchange on an order. After that the normal delivery charge applies.</p>'
      +'<h2>Returns for a refund</h2><p>We exchange for size; we do not refund for a change of mind. This is stated at checkout too, before you confirm.</p>'
      +'<h2>If we got it wrong</h2><p>Wrong item, wrong size sent, a fault, or damage in transit — tell us within {windowHours} hours with a photo and we replace it or refund you in full, with no delivery charge to you.</p>'
      +'<h2>How to start one</h2><p>Open the order in your account and tap Exchange, or message us on WhatsApp with your order number.</p>' },
  privacy: { title:'Privacy', lede:'What we keep, why we keep it, and how to get rid of it.',
    body:'<h2>What we collect</h2><ul><li>Your name, phone number and delivery address, so we can deliver the order.</li><li>Your order history, so you can reorder and we can handle exchanges.</li><li>Basic website usage, so we can see which pages are slow or broken.</li></ul>'
      +'<h2>What we do not do</h2><p>We do not sell your details to anyone. We do not share your phone number outside what delivery requires.</p>'
      +'<h2>Who sees it</h2><p>Our own team, and the courier handling your parcel — they get your name, address and phone, nothing else.</p>'
      +'<h2>Messages</h2><p>Order messages are always sent. Marketing messages only go to people who opted in, and every one of them can be stopped.</p>'
      +'<h2>Storage on your phone</h2><p>The shop keeps your bag, wishlist, language and size on your own phone (browser storage) so they are still there next time. Clearing your browser data removes them. Any analytics or advertising tags the shop uses are named on this page.</p>'
      +'<h2>Your data</h2><p>Ask us and we will tell you what we hold about you, correct it, or delete it. Order records we must keep for accounting stay for the period the law requires.</p>'
      +'{CONTACT}' },
  terms: { title:'Terms', lede:'The agreement between you and EXTAS when you order.',
    body:'<h2>Orders</h2><p>An order is confirmed when you receive our confirmation SMS. Until then, prices and stock can change. If an item sells out after you order, we tell you and refund or substitute with your agreement.</p>'
      +'<h2>Prices</h2><p>Prices are in Bangladeshi Taka and include VAT where it applies. Delivery is charged separately and shown before you confirm.</p>'
      +'<h2>Payment</h2><p>Cash on delivery, bKash, Nagad or card. For cash on delivery, payment is due in full to the rider.</p>'
      +'<h2>Exchange and returns</h2><p>As set out on the Exchange and returns page, which forms part of these terms.</p>'
      +'<h2>Our content</h2><p>The photographs, text and design on this site are ours. Please do not copy them.</p>'
      +'<h2>Liability</h2><p>Our responsibility is limited to the value of the order. Nothing here removes rights you have under Bangladeshi consumer law.</p>'
      +'{LEGAL}' },
  /* R15 wave 1 (bug 6): the footer's Ways to pay and Careers had no page of
     their own (they opened Terms and Contact). Owner-editable copy. */
  payment: { title:'Ways to pay', lede:'Cash on delivery, bKash, Nagad, Visa, Mastercard or internet banking — pay the way that suits you. Cash on delivery works all over Bangladesh.',
    body:'<h2>Cash on delivery</h2><p>Pay the rider in cash when the parcel reaches you. Check the parcel first if you want to.</p>'
      +'<h2>bKash</h2><p>Choose Mobile Banking › bKash at checkout and approve the amount in your bKash app.</p>'
      +'<h2>Nagad</h2><p>Choose Mobile Banking › Nagad at checkout and approve the amount in your Nagad app.</p>'
      +'<h2>Card and internet banking</h2><p>Visa, Mastercard, Amex and internet banking, through a secure payment page. We never see or keep your card number.</p>'
      +'<h2>Delivery charge</h2><p>Shown at checkout before you confirm. Free on orders over the free-delivery amount.</p>' },
  careers: { title:'Careers', lede:'We are a small team selling menswear made in Bangladesh. We hire people who care about getting the details right.',
    body:'<h2>Open roles</h2><p>There are no open roles right now. New roles are posted on this page first.</p>'
      +'<h2>Send us your details</h2><p>Message us on WhatsApp with your name, the kind of work you do and a link to your work or CV. We keep it on file and reply when something fits.</p>' },
  story: { title:'Our story', lede:'Menswear made in Bangladesh, sold honestly.',
    body:'<p>EXTAS started with a simple frustration: good menswear is made here, in this country, for the whole world — and yet buying a well-made shirt at home is harder than it should be.</p>'
      +'<h2>What we do</h2><p>We work with the same factories that produce for international labels, on cut-and-make terms, and we retail genuine branded stock alongside our own line.</p>'
      +'<h2>How we sell</h2><p>Every colour photographed in daylight. Real measurements on every product. The exchange rule written out before you pay, not buried in a policy page. No invented discounts.</p>'
      +'<h2>Where we are going</h2><p>More categories, better photography, and faster delivery outside Dhaka.</p>' }
};

/* =====================================================================
   PR 598 · CONTENT PAGES FROM DATA (Site builder › Pages, Shilpi).
   Every written page is a list of simple blocks the owner edits:
     heading · paragraph · list · image (a product photo or an upload, full /
     half / third width — snapped to the text column) · callout · button ·
     a shop-details token ({TRIAL} trial-at-the-door line, {CONTACT}, {LEGAL})
   plus the questions list on the FAQ page, a title and intro, a URL slug and
   SEO title / description. Inline: **bold** and [words](#/link).
   Settings tokens like {insideHours} or {freeOver} keep working — pg_sync()
   fills them on every draw, as before. The defaults are read from PG above
   (the same wording) and turned back into exactly the same HTML, so with
   nothing published every page is unchanged. New pages: #/page/<slug>.
   The contact page keeps its form (structure locked); its title and intro
   are editable.
   ===================================================================== */
var PG_DEF = JSON.parse(JSON.stringify(PG));
var PG_CONTACT_DEF = {title:'Contact', lede:'A person answers, 10 am to 10 pm, every day. Orders, sizes, exchanges — anything.'};
var PG_ORDER = ['faq','delivery','exchange','payment','privacy','terms','story','careers','contact'];
function pg_unesc(x){ return String(x).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&'); }
/* body HTML → blocks (the default pages; anything unknown is kept as it is) */
function pg_parse(html){
  var out = [], rest = String(html||''), m;
  var re = /^(?:<h2>([\s\S]*?)<\/h2>|<p>([\s\S]*?)<\/p>|<ul>([\s\S]*?)<\/ul>|\{(TRIAL|CONTACT|LEGAL)\})/;
  while(rest.length){
    m = rest.match(re);
    if(!m){ var nx = rest.slice(1).search(/<h2>|<p>|<ul>|\{(?:TRIAL|CONTACT|LEGAL)\}/); var cut = nx < 0 ? rest.length : nx + 1; out.push({t:'html', html:rest.slice(0, cut)}); rest = rest.slice(cut); continue; }
    if(m[1] != null) out.push({t:'h', text:pg_unesc(m[1])});
    else if(m[2] != null) out.push({t:'p', text:pg_unesc(m[2])});
    else if(m[3] != null) out.push({t:'ul', items:(m[3].match(/<li>[\s\S]*?<\/li>/g)||[]).map(function(li){ return pg_unesc(li.slice(4, -5)); })});
    else out.push({t:'tok', v:m[4]});
    rest = rest.slice(m[0].length);
  }
  return out;
}
/* inline text: escaped, with **bold** and [words](safe link) */
function pg_inl(x){
  return esc(x).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function(m, l, h){
    h = pg_unesc(h); if(!/^(#\/|https?:\/\/|mailto:|tel:)/i.test(h)) return l; return '<a class="pg-in" href="'+esc(h)+'"'+(/^https?:/i.test(h) ? ' target="_blank" rel="noopener"' : '')+'>'+l+'</a>'; });
}
function pg_blockHTML(b){
  if(!b || b.on === false) return '';
  var dev = function(h){ var c = (b.phone===false?' sb-x-phone':'')+(b.tablet===false?' sb-x-tablet':'')+(b.desk===false?' sb-x-desk':''); return c ? '<div class="'+c.trim()+'">'+h+'</div>' : h; };
  switch(b.t){
    case 'h': return dev('<h2>'+pg_inl(b.text)+'</h2>');
    case 'p': return dev('<p>'+pg_inl(b.text)+'</p>');
    case 'ul': return dev('<ul>'+(b.items||[]).map(function(x){ return '<li>'+pg_inl(x)+'</li>'; }).join('')+'</ul>');
    case 'tok': return '{'+b.v+'}';
    case 'html': return b.html || '';
    case 'call': return dev('<div class="sb-call tone-'+(b.tone==='warn'?'warn':'info')+'">'+pg_inl(b.text)+'</div>');
    case 'btn': return (b.label && /^(#\/|https?:\/\/|mailto:|tel:)/i.test(b.href||'')) ? dev('<div class="sb-pbtn"><a class="btn '+(b.style==='secondary'?'btn-secondary':'btn-primary')+'" href="'+esc(b.href)+'">'+esc(b.label)+'</a></div>') : '';
    case 'img':
      var w = b.w==='half' ? 'half' : (b.w==='third' ? 'third' : 'full'), pp = b.product && P(b.product), inner = '';
      if(b.src) inner = '<img src="'+esc(b.src)+'" alt="'+esc(b.alt||'')+'" loading="lazy">';
      else if(pp) inner = productImg(pp, (b.color && pp.colors.indexOf(b.color)>=0) ? b.color : pp.colors[0], {label:false, ratio:'ratio-wide'});
      if(!inner) return '';
      return dev('<figure class="sb-pimg w-'+w+'">'+inner+(b.cap ? '<figcaption>'+esc(b.cap)+'</figcaption>' : '')+'</figure>');
  }
  return '';
}
function pg_blocksHTML(list){ return (list||[]).map(pg_blockHTML).join(''); }
/* the page list: published (Site builder) or the defaults read from PG */
function pg_default(){
  return PG_ORDER.map(function(slug){
    if(slug==='contact') return {slug:'contact', builtin:'contact', title:PG_CONTACT_DEF.title, lede:PG_CONTACT_DEF.lede, seoTitle:'', seoMeta:''};
    var d = PG_DEF[slug] || {}, o = {slug:slug, title:d.title, lede:d.lede, seoTitle:'', seoMeta:''};
    if(d.qa) o.qa = d.qa.map(function(q){ return [q[0], q[1]]; });
    if(d.body != null) o.blocks = pg_parse(d.body);
    return o;
  });
}
function pg_list(){ var d = (typeof sbArea==='function') ? sbArea('pages') : null; return (d && d.list) || pg_default(); }
function pg_find(slug){ var l = pg_list(); for(var i = 0; i < l.length; i++) if(l[i].slug===slug) return l[i]; return null; }
function pg_contact(){
  var hot = hotlineNumber(), cd = pg_find('contact') || PG_CONTACT_DEF;
  return '<div class="pg">'+
    '<h1>'+esc(cd.title || PG_CONTACT_DEF.title)+'</h1><p class="pg-lede">'+esc(cd.lede || '')+'</p>'+
    '<div class="pg-contact">'+
      '<div class="card stack s12">'+
        '<div class="h3">Send us a message</div>'+
        '<form data-submit="contact" class="stack s12">'+
          '<div><label class="label" for="ct-name">Your name</label><input id="ct-name" class="input" autocomplete="name"></div>'+
          '<div><label class="label" for="ct-phone">Phone</label><input id="ct-phone" class="input" type="tel" inputmode="tel" placeholder="01XXX-XXXXXX" autocomplete="tel" data-change="ct-phone" aria-describedby="ct-phone-msg"><div id="ct-phone-msg" class="xs" aria-live="polite"></div></div>'+
          '<div><label class="label" for="ct-order">Order number (if you have one)</label><input id="ct-order" class="input" placeholder="EX-1043"></div>'+
          '<div><label class="label" for="ct-msg">How can we help?</label><textarea id="ct-msg" class="input" rows="4"></textarea></div>'+
          '<button class="btn btn-primary btn-block" type="submit">Send message</button>'+
          '<div class="xs muted">We reply on WhatsApp or by phone, usually within an hour during opening times.</div>'+
        '</form>'+
      '</div>'+
      '<div class="stack s12">'+
        '<a class="pg-ch" href="'+waLink('Hi EXTAS')+'" target="_blank" rel="noopener"><span class="ic">'+ico('chat',19)+'</span><span><b>WhatsApp</b><span>Fastest — 10 am to 10 pm</span></span></a>'+
        '<a class="pg-ch" href="tel:'+esc(hot)+'"><span class="ic">'+ico('phone',19)+'</span><span><b>'+esc(hot)+'</b><span>Hotline · 10 am to 10 pm</span></span></a>'+
        (SITE('supportEmail') ? '<a class="pg-ch" href="mailto:'+esc(SITE('supportEmail'))+'"><span class="ic">'+ico('mail',19)+'</span><span><b>'+esc(SITE('supportEmail'))+'</b><span>We reply within a day</span></span></a>' : '')+
        (SITE('address') ? '<div class="pg-ch"><span class="ic">'+ico('home',19)+'</span><span><b>'+esc(SITE('address'))+'</b><span>Our office</span></span></div>' : '')+
        '<a class="pg-ch" href="#/account/orders"><span class="ic">'+ico('truck',19)+'</span><span><b>Track an order</b><span>Open your account</span></span></a>'+
        '<div class="card"><div class="h3">Before you message</div><p class="xs text2" style="margin:6px 0 0">Size question? <a class="pg-in" href="#/size-guide" data-act="size-guide">Find my size</a> answers most of them in two taps. Delivery and exchange rules are on their own pages.</p></div>'+
      '</div>'+
    '</div></div>';
}

/* =====================================================================
   Desktop A · D-017. THE HELP PAGES BECOME A HELP CENTRE ON A DESKTOP.
   A sticky topic list on the left, the page in the middle with a breadcrumb
   (Home / Help / Topic), and a "Still stuck?" WhatsApp + hotline card on the
   right. Only when the screen is 1024 px or wider — the phone page is the
   same string as before. PG_TOPICS is the owner's list (a setting later).
   ===================================================================== */
var PG_TOPICS = [['#/account/orders','Track my order','truck'],['#/page/delivery','Delivery','box'],['#/page/exchange','Exchange & returns','swap'],
  ['#/page/payment','Ways to pay','cash'],['#/page/faq','Questions & answers','info'],['#/size-guide','Size guide','ruler'],['#/page/contact','Contact us','phone']];
var PG_DESK = { on:true };
function pg_desk(html, slug, title){
  if(!PG_DESK.on || typeof deskOn!=='function' || !deskOn()) return html;
  var rail = '<nav class="pg-rail" aria-label="Help topics"><div class="pg-rail-h">'+esc(t('Help centre'))+'</div>'+PG_TOPICS.map(function(x){
    var on = x[0]==='#/page/'+slug;
    return '<a class="pg-rail-a'+(on?' on':'')+'" href="'+x[0]+'"'+(x[0]==='#/size-guide'?' data-act="size-guide"':'')+(on?' aria-current="page"':'')+'>'+ico(x[2],17)+'<span>'+esc(t(x[1]))+'</span></a>'; }).join('')+'</nav>';
  var crumbs = '<nav class="crumbs pg-crumbs" aria-label="Breadcrumb"><a href="#/">Home</a><span aria-hidden="true">/</span><a href="#/page/faq">'+esc(t('Help'))+'</a><span aria-hidden="true">/</span><span aria-current="page">'+esc(title)+'</span></nav>';
  var aside = '<aside class="pg-aside"><div class="card pg-stuck"><div class="h3">'+esc(t('Still stuck?'))+'</div><p class="small text2">A person answers on WhatsApp, '+esc(SITE('hours')||'every day')+'.</p>'+
    waButton('Message us on WhatsApp','Hi EXTAS')+'<a class="btn btn-ghost btn-block mt8" href="'+telLink()+'">'+ico('phone',16)+'Hotline '+esc(hotlineNumber())+'</a></div></aside>';
  return '<div class="pg-d">'+rail+'<div class="pg-mid">'+html.replace('<div class="pg">', '<div class="pg">'+crumbs)+'</div>'+aside+'</div>';
}
function pg_render(){
  pg_sync();
  var slug = CUR.params[0] || 'faq';
  if(slug==='contact') return pg_desk(pg_contact(), 'contact', (pg_find('contact')||PG_CONTACT_DEF).title || 'Contact');
  var d = PG[slug];
  if(!d) return '<div class="pg"><h1>'+esc(t('Page not found'))+'</h1><p class="pg-lede">That page does not exist.</p><a class="btn btn-primary" href="#/">'+esc(t('Go to home'))+'</a></div>';
  var out = '<div class="pg"><h1>'+esc(d.title)+'</h1><p class="pg-lede">'+esc(d.lede)+'</p>';
  if(d.qa){
    out += '<div class="card" style="padding:4px 14px">'+d.qa.map(function(q,i){
      var open = !!UI['faq:'+i];
      return '<div class="pg-q"><button type="button" class="pg-qh" data-act="pg-q" data-i="'+i+'" aria-expanded="'+open+'">'+esc(q[0])+ico(open?'minus':'plus',17)+'</button>'+
        (open?'<div class="pg-qb">'+esc(q[1])+'</div>':'')+'</div>';
    }).join('')+'</div>';
  }
  if(d.body) out += '<div class="card">'+pg_fill(d.body)+'</div>';
  out += '<div class="card mt16 row between wrap pg-hand" style="gap:10px;align-items:center"><span class="small text2">Still need a hand?</span>'+waButton('Message us on WhatsApp','Hi EXTAS')+'</div>';
  return pg_desk(out+'</div>', slug, d.title);
}
ACT['pg-q'] = function(el){ var i = el.getAttribute('data-i'); UI['faq:'+i] = !UI['faq:'+i]; rerender(); };
/* QA V12b · K10 (owner 20 Oct, "all phone inputs"): the contact form sent any
   number (or none) and an empty message. It now uses the ONE shared helper:
   the number is cleaned and said back; only an impossible number is refused. */
function ct_phoneMsg(text, bad){
  var inp = document.getElementById('ct-phone'), m = document.getElementById('ct-phone-msg');
  if(inp){ if(bad) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
  if(m){ m.textContent = text || ''; m.style.color = bad ? 'var(--sale)' : ''; }
}
CHANGE['ct-phone'] = function(el){
  if(typeof phoneNormalizeBD!=='function') return;
  var r = phoneNormalizeBD(el.value); if(r.empty){ ct_phoneMsg('', false); return; }
  el.value = r.digits; ct_phoneMsg(r.ok ? 'We\'ll call '+r.nice : r.msg, !r.ok);
};
SUBMIT['contact'] = function(f){
  var inp = document.getElementById('ct-phone'), msg = document.getElementById('ct-msg');
  var r = (typeof phoneNormalizeBD==='function') ? phoneNormalizeBD(inp ? inp.value : '') : {ok:true, nice:''};
  if(r.empty){ ct_phoneMsg(t('Enter your mobile number, like 01712345678.'), true); if(inp) inp.focus(); return; }
  if(!r.ok){ if(inp) inp.value = r.digits; ct_phoneMsg(r.msg, true); if(inp) inp.focus(); return; }
  if(msg && !msg.value.trim()){ toast('Please write your message first.'); msg.focus(); return; }
  ct_phoneMsg('', false);
  toast('Thanks — we will get back to you shortly on '+r.nice+'.'); if(f && f.reset) f.reset();
};
/* R15 wave 1 (nothing hardcoded). Charges, days, the free-delivery amount and
   the exchange window are read from the owner's settings (Smart Rules ›
   Delivery / Exchange) every time a page is drawn — PG holds the wording
   with {placeholders}, PG_TPL keeps that wording, pg_sync() fills PG in
   place, so the help search (07-help-search.js) reads the same live text. */
var PG_TPL = null;
function pg_num(v){ return (typeof v==='number' && v>=1000 && v%1===0) ? String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : String(v==null?'':v); }
function pg_vals(){
  var d = function(k){ return pg_num(SET('delivery', k)); };
  /* the sub-area charge follows its mode (own / city / outside), as checkout does */
  return {inside:d('inside'), sub:(typeof zoneFee==='function' ? pg_num(zoneFee('sub')) : d('sub')), outside:d('outside'), freeOver:d('freeOver'), insideDays:d('insideDays'), subDays:d('subDays'), outsideDays:d('outsideDays'),
    insideHours:d('insideHours'), subHours:d('subHours'), outsideHours:d('outsideHours'), windowHours:pg_num(SET('exchange','windowHours'))};
}
function pg_t(str, v){ return String(str).replace(/\{(\w+)\}/g, function(m, k){ return v.hasOwnProperty(k) ? v[k] : m; }); }
var PG_TSIG = null;
function pg_sync(){
  /* PR 598: the wording comes from the page list (published or default) */
  var L = pg_list(), sig = JSON.stringify(L);
  if(sig !== PG_TSIG){
    PG_TSIG = sig; PG_TPL = {};
    L.forEach(function(x){ if(x.builtin) return; var o = {title:x.title, lede:x.lede}; if(x.qa) o.qa = x.qa; if(x.blocks) o.body = pg_blocksHTML(x.blocks); PG_TPL[x.slug] = o; });
    Object.keys(PG).forEach(function(k){ if(!PG_TPL[k]) delete PG[k]; });
  }
  var v = pg_vals();
  Object.keys(PG_TPL).forEach(function(slug){
    var T0 = PG_TPL[slug], d = PG[slug] || (PG[slug] = {});
    ['title','lede'].forEach(function(k){ if(T0[k] != null) d[k] = pg_t(T0[k], v); });
    if(T0.body != null) d.body = pg_fill(pg_t(T0.body, v));
    if(T0.qa) d.qa = T0.qa.map(function(q){ return [pg_t(q[0], v), pg_t(q[1], v)]; });
  });
}
/* shop details go into the pages from the settings; empty ones drop out */
function pg_fill(html){
  var bits = [SITE('supportEmail'), hotlineNumber()].filter(Boolean);
  var contact = bits.length ? '<h2>Contact</h2><p>'+bits.map(esc).join(' · ')+'</p>' : '';
  var legal = [SITE('registeredName'), SITE('address'), SITE('tradeLicence') ? 'Trade licence '+SITE('tradeLicence') : '', SITE('dbid') ? 'DBID '+SITE('dbid') : ''].filter(Boolean);
  /* R15 note 23.9: trial at the door, from the owner's settings (08-shop-opts.js); off → nothing */
  html = String(html).replace(/\{TRIAL\}/g, typeof trialHelpHTML==='function' ? trialHelpHTML() : '');
  return String(html).replace('{CONTACT}', contact).replace('{LEGAL}', legal.length ? '<h2>Contact</h2><p>'+legal.map(esc).join(' · ')+'</p>' : '');
}
PAGES.page = { title:function(){ var s = CUR.params[0]||'faq', x = pg_find(s); if(x && x.seoTitle) return x.seoTitle; return s==='contact' ? ((x && x.title) || 'Contact') : ((PG[s]&&PG[s].title)||'Page not found'); }, render:pg_render };
