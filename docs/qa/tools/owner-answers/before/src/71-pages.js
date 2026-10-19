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
      ['How long does delivery take?', 'Inside Dhaka city, {insideDays} days. Dhaka sub-areas, {subDays} days. Outside Dhaka, {outsideDays} days. You get an SMS with a tracking link as soon as the parcel leaves us.'],
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
    body:'<h2>Charges</h2><ul><li>Dhaka city — ৳{inside}, {insideDays} days</li><li>Dhaka sub-areas — ৳{sub}, {subDays} days</li><li>Outside Dhaka — ৳{outside}, {outsideDays} days</li><li>Free delivery on orders over ৳{freeOver}</li></ul>'
      +'<h2>How it works</h2><p>We pack the same day for orders placed before 5 pm. You get an SMS when the order is confirmed and again when the courier picks it up, with a tracking link.</p>'
      +'<h2>At the door</h2><p>Check the parcel in front of the rider if you want to. If you decide not to take it, you pay only the delivery charge to the rider. If the mistake was ours — wrong item, wrong size sent, damaged — there is no charge at all.</p>'
      +'<h2>Courier partners</h2><p>Steadfast and Pathao, depending on your area.</p>' },
  exchange: { title:'Exchange and returns', lede:'Written plainly, so there are no surprises.',
    body:'<h2>Size exchange</h2><p>You have {windowHours} hours from delivery. The item must be unworn, unwashed and still have its tags. One exchange per item.</p>'
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

function pg_contact(){
  var hot = hotlineNumber();
  return '<div class="pg">'+
    '<h1>Contact</h1><p class="pg-lede">A person answers, 10 am to 10 pm, every day. Orders, sizes, exchanges — anything.</p>'+
    '<div class="pg-contact">'+
      '<div class="card stack s12">'+
        '<div class="h3">Send us a message</div>'+
        '<form data-submit="contact" class="stack s12">'+
          '<div><label class="label" for="ct-name">Your name</label><input id="ct-name" class="input" autocomplete="name"></div>'+
          '<div><label class="label" for="ct-phone">Phone</label><input id="ct-phone" class="input" type="tel" inputmode="tel" placeholder="01XXX-XXXXXX" autocomplete="tel"></div>'+
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

function pg_render(){
  pg_sync();
  var slug = CUR.params[0] || 'faq';
  if(slug==='contact') return pg_contact();
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
  out += '<div class="card mt16 row between wrap" style="gap:10px;align-items:center"><span class="small text2">Still need a hand?</span>'+waButton('Message us on WhatsApp','Hi EXTAS')+'</div>';
  return out+'</div>';
}
ACT['pg-q'] = function(el){ var i = el.getAttribute('data-i'); UI['faq:'+i] = !UI['faq:'+i]; rerender(); };
SUBMIT['contact'] = function(){ toast('Thanks — we will get back to you shortly.'); };
/* R15 wave 1 (nothing hardcoded). Charges, days, the free-delivery amount and
   the exchange window are read from the owner's settings (Smart Rules ›
   Delivery / Exchange) every time a page is drawn — PG holds the wording
   with {placeholders}, PG_TPL keeps that wording, pg_sync() fills PG in
   place, so the help search (07-help-search.js) reads the same live text. */
var PG_TPL = null;
function pg_num(v){ return (typeof v==='number' && v>=1000 && v%1===0) ? String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : String(v==null?'':v); }
function pg_vals(){
  var d = function(k){ return pg_num(SET('delivery', k)); };
  return {inside:d('inside'), sub:d('sub'), outside:d('outside'), freeOver:d('freeOver'), insideDays:d('insideDays'), subDays:d('subDays'), outsideDays:d('outsideDays'),
    insideHours:d('insideHours'), subHours:d('subHours'), outsideHours:d('outsideHours'), windowHours:pg_num(SET('exchange','windowHours'))};
}
function pg_t(str, v){ return String(str).replace(/\{(\w+)\}/g, function(m, k){ return v.hasOwnProperty(k) ? v[k] : m; }); }
function pg_sync(){
  if(!PG_TPL) PG_TPL = JSON.parse(JSON.stringify(PG));
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
  return String(html).replace('{CONTACT}', contact).replace('{LEGAL}', legal.length ? '<h2>Contact</h2><p>'+legal.map(esc).join(' · ')+'</p>' : '');
}
PAGES.page = { title:function(){ var s = CUR.params[0]||'faq'; return s==='contact' ? 'Contact' : ((PG[s]&&PG[s].title)||'Page not found'); }, render:pg_render };
