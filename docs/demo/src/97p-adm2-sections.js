/* =====================================================================
   97p-adm2-sections.js — NEW EXTAS ADMIN · the 14 sidebar sections
   (BACKEND-ARCHITECTURE §5.1: DAILY WORK · GROW · BUSINESS, then Settings and
   Help & Build at the bottom). Phase 1 builds Dashboard, Orders, Delivery,
   Customers, Money and Messages; the other eight open a placeholder with
   links to the classic pages until phase 2 replaces them (a2Section with the
   same id keeps the sidebar position).
   ===================================================================== */
function a2Cnt(fn){ return function(){ try{ return fn(); }catch(e){ return 0; } }; }
function a2QN(id){ var q = a2Queues().filter(function(x){ return x.id === id; })[0]; return q ? q.n : 0; }

a2Section({id:'dashboard', en:'Dashboard', bn:'ড্যাশবোর্ড', icon:'grid', group:'daily', base:'/admin', home:'/admin?home=1', perm:'dashboard.read'});
a2Section({id:'orders', en:'Orders', bn:'অর্ডার', icon:'bag', group:'daily', base:'/admin/orders', perm:'orders.read',
  perms:['orders.read', 'orders.packing', 'returns.qc'], home:'/admin/orders',
  badge:a2Cnt(function(){ return a2QN('confirm') + a2QN('risk'); }),
  tabs:[
    {id:'all', en:'All orders', bn:'সব অর্ডার', path:'/admin/orders', perm:'orders.read'},
    {id:'confirm', en:'To confirm', bn:'কনফার্ম বাকি', path:'/admin/orders/confirm', perm:'orders.confirm', count:a2Cnt(function(){ return a2QN('confirm') + a2QN('cancelreq'); })},
    {id:'risk', en:'Risk review', bn:'ঝুঁকি যাচাই', path:'/admin/orders/risk', perm:'orders.risk', count:a2Cnt(function(){ return a2QN('risk'); })},
    {id:'packing', en:'Packing & print', bn:'প্যাকিং আর প্রিন্ট', path:'/admin/orders/packing', perm:'orders.packing'},
    {id:'returns', en:'Returns & exchanges', bn:'ফেরত আর বদল', path:'/admin/orders/returns', perm:['orders.returns', 'returns.qc'], count:a2Cnt(function(){ return a2QN('returns'); })},
    {id:'riskrules', en:'Risk rules', bn:'ঝুঁকির নিয়ম', path:'/admin/orders/risk-rules', perm:'risk.rules', more:true},
    {id:'new', en:'Create order', bn:'অর্ডার বানান', path:'/admin/orders/new', perm:'orders.create', more:true},
    {id:'bulk', en:'Bulk & corporate', bn:'বাল্ক আর কর্পোরেট', path:'/admin/orders/bulk', perm:'orders.bulk', more:true},
    {id:'settings', en:'Order settings', bn:'অর্ডারের সেটিং', path:'/admin/orders/settings', perm:'orders.settings', more:true}
  ]});
a2Section({id:'products', en:'Products', bn:'প্রোডাক্ট', icon:'shirt', group:'daily', base:'/admin/products', perm:'products.read', purpose:'The catalogue the shop sells; stock is read from the ERP.', purposeBn:'দোকানের সব প্রোডাক্ট; স্টক আসে ERP থেকে।',
  tree:'All products · Product editor · Launch queue · Combos & sets · Stock (low stock, counts, movements, sent to ERP, back-in-stock) · Size charts · Reviews · Collections · More: Import from link, Bulk CSV, Product audit, Naming & links, Media library, Colour library, Catalogue setup',
  classic:[['/products', 'Products'], ['/stock', 'Stock & ERP'], ['/size-charts', 'Size charts'], ['/combos', 'Combos & sets'], ['/reviews', 'Reviews'], ['/naming', 'Naming & links']]});
a2Section({id:'customers', en:'Customers', bn:'কাস্টমার', icon:'users', group:'daily', base:'/admin/customers', perm:'customers.read',
  badge:a2Cnt(function(){ return a2S().appr.filter(function(x){ return x.st === 'waiting' && x.kind === 'codOff'; }).length; }),
  tabs:[
    {id:'all', en:'All customers', bn:'সব কাস্টমার', path:'/admin/customers', perm:'customers.read'},
    {id:'segments', en:'Segments', bn:'সেগমেন্ট', path:'/admin/customers/segments', perm:'customers.read'},
    {id:'loyalty', en:'Loyalty & wallet', bn:'লয়্যালটি আর ওয়ালেট', path:'/admin/customers/loyalty', perm:'customers.read'},
    {id:'review', en:'To review', bn:'যাচাই বাকি', path:'/admin/customers/review', perm:'customers.read', count:a2Cnt(function(){ return a2S().appr.filter(function(x){ return x.st === 'waiting' && x.kind === 'codOff'; }).length + a2MergePairs().length; })},
    {id:'import', en:'Import legacy customers', bn:'পুরনো কাস্টমার ইমপোর্ট', path:'/admin/customers/import', perm:'customers.import', more:true},
    {id:'consent', en:'Consent & data', bn:'সম্মতি আর ডেটা', path:'/admin/customers/consent', perm:'customers.privacy', more:true}
  ]});
a2Section({id:'delivery', en:'Delivery', bn:'ডেলিভারি', icon:'truck', group:'daily', base:'/admin/delivery', perm:'delivery.read', perms:['delivery.read', 'delivery.returned'],
  home:'/admin/delivery', badge:a2Cnt(function(){ return a2QN('book') + a2QN('stuck'); }),
  tabs:[
    {id:'overview', en:'Overview', bn:'সারাংশ', path:'/admin/delivery', perm:'delivery.read'},
    {id:'book', en:'Ready to book', bn:'বুক করা বাকি', path:'/admin/delivery/book', perm:'delivery.book', count:a2Cnt(function(){ return a2QN('book'); })},
    {id:'transit', en:'In transit', bn:'পথে আছে', path:'/admin/delivery/transit', perm:'delivery.read', count:a2Cnt(function(){ return a2QN('stuck'); })},
    {id:'returned', en:'Returned & refused', bn:'ফেরত আর নেয়নি', path:'/admin/delivery/returned', perm:['delivery.read', 'delivery.returned']},
    {id:'couriers', en:'Couriers', bn:'কুরিয়ার', path:'/admin/delivery/couriers', perm:'delivery.read'},
    {id:'zones', en:'Zones & charges', bn:'এলাকা আর চার্জ', path:'/admin/delivery/zones', perm:'delivery.read'},
    {id:'mismatch', en:'Charge mismatch log', bn:'চার্জ গরমিলের খাতা', path:'/admin/delivery/mismatch', perm:'delivery.read', more:true},
    {id:'settings', en:'Delivery settings', bn:'ডেলিভারির সেটিং', path:'/admin/delivery/settings', perm:'delivery.charges', more:true}
  ]});
a2Section({id:'messages', en:'Messages', bn:'মেসেজ', icon:'msg', group:'daily', base:'/admin/messages', home:'/admin/messages/journey', perm:'messages.read',
  badge:a2Cnt(function(){ return a2QN('msgs'); }),
  tabs:[
    {id:'journey', en:'Order journey', bn:'অর্ডারের মেসেজ', path:'/admin/messages/journey', perm:'messages.journey'},
    {id:'campaigns', en:'Campaigns', bn:'ক্যাম্পেইন', path:'/admin/messages/campaigns', perm:'messages.campaigns'},
    {id:'templates', en:'Templates', bn:'টেমপ্লেট', path:'/admin/messages/templates', perm:'messages.templates'},
    {id:'log', en:'Message log', bn:'মেসেজ লগ', path:'/admin/messages/log', perm:'messages.log', count:a2Cnt(function(){ return a2QN('msgs'); })},
    {id:'channels', en:'Channels & limits', bn:'চ্যানেল আর সীমা', path:'/admin/messages/channels', perm:'messages.channels'}
  ]});
a2Section({id:'support', en:'Support', bn:'সাপোর্ট', icon:'headset', group:'daily', base:'/admin/support', perm:'support.read', purpose:'Answer every customer on every channel; money complaints with proof.', purposeBn:'সব চ্যানেলের কাস্টমারকে উত্তর দেওয়া।',
  tree:'Inbox (All · Open · Waiting · Solved · Mine · Call-backs) · Rider issues · Claims & credits · Saved replies · Support settings', classic:[['/support', 'Support inbox'], ['/review', 'Duplicate & fraud review (old)'], ['/exchanges', 'Exchanges (old)']]});
a2Section({id:'marketing', en:'Marketing', bn:'মার্কেটিং', icon:'mega', group:'grow', base:'/admin/marketing', perm:'marketing.read', purpose:'Ads, offers, coupons and landing pages — budget raises need the owner.', purposeBn:'বিজ্ঞাপন, অফার, কুপন আর ল্যান্ডিং পেজ।',
  tree:'Overview · Campaigns & ads · Approvals · Coupons & offers · Landing pages · Hero & campaigns · Tracking · Creatives', classic:[['/ads', 'Ads & tracking'], ['/coupons', 'Coupons & offers'], ['/landing', 'Landing pages'], ['/hero', 'Hero & campaigns']]});
a2Section({id:'website', en:'Website', bn:'ওয়েবসাইট', icon:'globe', group:'grow', base:'/admin/website', perm:'website.read', purpose:'Menus, pages, blog and how the shop looks.', purposeBn:'মেনু, পেজ, ব্লগ আর দোকানের চেহারা।',
  tree:'Site builder · Page layout · Blog & SEO · Side canvas · Redirects', classic:[['/site', 'Site builder'], ['/layout', 'Page layout'], ['/blog', 'Blog & SEO'], ['/side-canvas', 'Side canvas']]});
a2Section({id:'money', en:'Money', bn:'টাকা', icon:'wallet', group:'business', base:'/admin/money', perm:'money.read', perms:['money.read'],
  badge:a2Cnt(function(){ return a2QN('cod'); }),
  tabs:[
    {id:'pnl', en:'Profit & loss', bn:'লাভ-ক্ষতি', path:'/admin/money', perm:'money.read'},
    {id:'cod', en:'COD reconciliation', bn:'COD মেলানো', path:'/admin/money/cod', perm:'money.cod', count:a2Cnt(function(){ return a2QN('cod'); })},
    {id:'payments', en:'Payments & refunds', bn:'পেমেন্ট আর রিফান্ড', path:'/admin/money/payments', perm:['money.payments', 'money.refunds.request']},
    {id:'expenses', en:'Expenses & salaries', bn:'খরচ আর বেতন', path:'/admin/money/expenses', perm:'money.expenses'},
    {id:'close', en:'Month-end close', bn:'মাস শেষের হিসাব', path:'/admin/money/close', perm:'money.close', count:a2Cnt(function(){ return a2QN('month'); })},
    {id:'costs', en:'Costs & fees', bn:'খরচ আর ফি', path:'/admin/money/costs', perm:'money.costs'}
  ]});
a2Section({id:'reports', en:'Reports', bn:'রিপোর্ট', icon:'chart', group:'business', base:'/admin/reports', perm:'reports.read', purpose:'Sales, delivery & RTO, marketing and product reports from the same metric definitions.', purposeBn:'বিক্রি, ডেলিভারি, মার্কেটিং আর প্রোডাক্টের রিপোর্ট।',
  tree:'Overview · Sales · Delivery & RTO · Products · Customers · Marketing & ads · Messages · Experiments', classic:[['/analytics', 'Analytics'], ['/finance', 'Finance (old)']]});
a2Section({id:'ai', en:'AI Center', bn:'AI সেন্টার', icon:'spark', group:'business', base:'/admin/ai', perm:'ai.read', purpose:'What the AI may do, its approvals and its costs. AI is off until the owner turns it on.', purposeBn:'AI কী করবে, অনুমোদন আর খরচ।',
  tree:'Control room · Approvals · Agents · Model picks · Spend caps · Cost book', classic:[['/ai', 'AI & agents'], ['/agents', 'The seven agents']]});
a2Section({id:'settings', en:'Settings', bn:'সেটিংস', icon:'sliders', group:'bottom', base:'/admin/settings', perm:'settings.read', purpose:'Store-wide things only; everything else sits in its own section.', purposeBn:'শুধু পুরো দোকানের সেটিং।',
  tree:'Settings home · Store details · Checkout & payments · Policies & texts · Team & roles · Keys & connections · ERP connection · System (backups, cache, images, data purge)',
  classic:[['/settings', 'Settings'], ['/rules', 'Smart Rules'], ['/team', 'Team & audit log'], ['/integrations', 'Keys & connections'], ['/backup', 'Backup'], ['/server', 'Server'], ['/health', 'Server health'], ['/audit', 'Site audit']]});
a2Section({id:'help', en:'Help & Build', bn:'সাহায্য আর অগ্রগতি', icon:'help', group:'bottom', base:'/admin/help', perm:'help.read', purpose:'The Bengali manual for every section, and the build progress.', purposeBn:'প্রতিটা সেকশনের বাংলা গাইড আর কাজের অগ্রগতি।',
  tree:'Help & manual · Build progress (Stages & PRs, What’s new, Reported problems, Blueprint & files, Smoke runs)', classic:[['/manual', 'Site manual'], ['/register', 'PR register & build progress']]});

/* quick actions for the search palette (">") */
a2RegAction('Create order', 'অর্ডার বানান', '#/admin/orders/new', 'orders.create', 'new order phone chat walk-in');
a2RegAction('Book ready parcels', 'তৈরি পার্সেল বুক করুন', '#/admin/delivery/book', 'delivery.book', 'courier booking');
a2RegAction('Add expense', 'খরচ যোগ করুন', '#/admin/money/expenses?add=1', 'money.expenses', 'expense cost bill');
a2RegAction('New campaign', 'নতুন ক্যাম্পেইন', '#/admin/messages/campaigns/new', 'messages.campaigns', 'sms whatsapp blast');
a2RegAction('Match a payout file', 'পেআউট ফাইল মেলান', '#/admin/money/cod/match', 'money.cod', 'cod courier statement');
a2RegAction('Receive & QC a return', 'ফেরত মাল চেক', '#/admin/orders/returns/qc', 'returns.qc', 'return scan qc');
a2RegAction('Open the classic admin', 'পুরনো অ্যাডমিন', '#/admin-classic', 'dashboard.read', 'old classic');

/* ---------- Bengali guides (same panel as the classic admin's "এই সেকশনে কী করা যায়") ---------- */
A2_GUIDE.dashboard = {t:'ড্যাশবোর্ড', kaj:['সকালে এক নজরে দোকানের অবস্থা: ডেলিভারি হওয়া বিক্রি, অর্ডার, ডেলিভারির সফলতা আর আনুমানিক লাভ।', '“এখনই করতে হবে” তালিকায় যেসব কাজ অপেক্ষা করছে — প্রতিটা সারিতে চাপ দিলে সেই কাজের তালিকা খোলে।'],
  menu:['উপরে সময়: আজ, 7 দিন, 30 দিন', 'চারটা বড় সংখ্যা (KPI), বিক্রির গ্রাফ, এখনই করতে হবে, অর্ডারের ধাপ, সেরা প্রোডাক্ট, কুরিয়ার অনুযায়ী সফলতা', 'Customize — কোন কার্ড দেখাবেন বাছা; All waiting work — সব অপেক্ষার কাজ'],
  kora:['সারিতে চাপ দিয়ে সরাসরি কাজের তালিকায় যাওয়া', 'Download দিয়ে সারাংশ নামানো', 'প্রতিদিনের সারাংশ Telegram-এ পাঠানো চালু করা'],
  sw:['বিক্রি মানে শুধু ডেলিভারি হওয়া অর্ডার (D3); অর্ডার করা টাকা আলাদা দেখায়', 'আনুমানিক লাভ (Contribution) শুধু মালিক দেখেন — ডিফল্ট', 'Telegram-এ দৈনিক সারাংশ — ডিফল্ট বন্ধ, সময় 21:00'],
  next:['প্রতিটা সংখ্যার পাশে লেখা থাকে সেটা অস্থায়ী (provisional) না মেলানো (reconciled)।', 'কাজ শেষ হলে সারি নিজেই সরে যায়।']};
A2_GUIDE.orders = {t:'অর্ডার', kaj:['অর্ডার আসা থেকে শেষ পর্যন্ত — কনফার্ম, ঝুঁকি যাচাই, প্যাকিং, ফেরত আর বদল।', 'প্রতিটা অর্ডারে চারটা আলাদা অবস্থা: অর্ডার, কুরিয়ার, পেমেন্ট আর ফেরত/রিফান্ড।'],
  menu:['All orders, To confirm, Risk review, Packing & print, Returns & exchanges', 'More-এ: Risk rules, Create order, Bulk & corporate, Order settings'],
  kora:['কল করে কনফার্ম, অগ্রিম চাওয়া, হোল্ড, বাতিল (কারণসহ)', 'বুক হওয়ার পর বদল চাইলে: Cancel after booking → কুরিয়ার বাতিল নিশ্চিত হলে → নতুন (replacement) অর্ডার', 'একসাথে অনেক অর্ডার কনফার্ম বা প্রিন্ট — কোনগুলো বাদ যাবে আর কেন, আগে দেখায়'],
  sw:['প্রিপেইড অর্ডার কখনো কল-কিউতে যায় না', 'সফট লেভেল = ডেলিভারি চার্জ অগ্রিম; হার্ড লেভেল = পুরো টাকা অগ্রিম', 'ফেরতের সময় — ডেলিভারির পর 72 ঘণ্টা (বদলানো যায়)', 'WhatsApp self-confirm, প্যাকিংয়ের ছবি, এক যাত্রায় সাইজ বদল — সব ডিফল্ট বন্ধ'],
  next:['কনফার্ম হলে অর্ডার প্যাকিংয়ে যায়, তারপর ডেলিভারিতে বুক হয়।', 'ফেরত মাল চেক করে বিক্রি করা যাবে হলে ERP-তে যায়; ERP নিশ্চিত করলে তবেই স্টক বাড়ে। বিক্রি করা যাবে না হলে লসের খাতায় যায়।']};
A2_GUIDE.delivery = {t:'ডেলিভারি', kaj:['পার্সেল বুক, ট্র্যাক আর শেষ করা; এলাকা আর চার্জ ঠিক রাখা।'],
  menu:['Overview, Ready to book, In transit, Returned & refused, Couriers, Zones & charges', 'More-এ: Charge mismatch log, Delivery settings'],
  kora:['এক চাপে সব তৈরি পার্সেল বুক — হোল্ড, অগ্রিম বাকি, ঝুঁকি যাচাই আর পুরনো পার্সেল বাতিলের অপেক্ষার অর্ডার বাদ যায়, কারণসহ', 'আটকে থাকা আর সমস্যার পার্সেলে কাস্টমারকে মেসেজ বা কুরিয়ারে ক্লেইম', 'ফেরত পার্সেল দোকানে এলে চেক (QC)-এ পাঠানো'],
  sw:['নড়ছে না ধরা হয় — 48 ঘণ্টা', 'প্যাকিংয়ের পরে বুক — চালু', 'কাস্টমারের ডেলিভারি চার্জ আসে আপনার তিন ব্যান্ড থেকে; কুরিয়ার বদলালেও চার্জ বদলায় না'],
  next:['ডেলিভারি হলে বিক্রি হিসেবে গোনা হয়; COD-র টাকা Money → COD reconciliation-এ মেলানো হয়।']};
A2_GUIDE.customers = {t:'কাস্টমার', kaj:['প্রতিটা মানুষের সব তথ্য ফোন নম্বর দিয়ে — অর্ডার, ডেলিভারি, ফেরত, ওয়ালেট আর নোট।'],
  menu:['All customers, Segments, Loyalty & wallet, To review', 'More-এ: Import legacy customers, Consent & data'],
  kora:['ফোনের পুরো ইতিহাস দেখা (কতবার নিয়েছে, ফেরত দিয়েছে, ফোন ধরেনি)', 'এই নম্বরে COD বন্ধের প্রস্তাব দেওয়া — মালিক অনুমোদন দিলে তবেই চালু', 'একই মানুষের দুই প্রোফাইল একসাথে করা'],
  sw:['প্রোফাইল খোলা আর ফোন কপি — প্রতিবার লগ হয়', 'অফারের SMS টিক — চেকআউটে আগে থেকে দেওয়া; WhatsApp মার্কেটিং আলাদা, টিক ছাড়া', 'নির্দিষ্ট ভূমিকার জন্য ফোন নম্বর লুকানো — ডিফল্ট বন্ধ'],
  next:['সেগমেন্ট দিয়ে Messages → Campaigns-এ মেসেজ পাঠানো যায় (যারা না চেয়েছে তারা বাদ)।']};
A2_GUIDE.money = {t:'টাকা', kaj:['দোকানের কাজের টাকার হিসাব — আসল খাতা ERP-তে থাকে।', 'প্রতিটা সংখ্যায় লেখা থাকে: আনুমানিক, অস্থায়ী, মেলানো বা চূড়ান্ত।'],
  menu:['Profit & loss, COD reconciliation, Payments & refunds, Expenses & salaries, Month-end close, Costs & fees'],
  kora:['কুরিয়ারের পেআউট ফাইল মেলানো — টাকা কীভাবে এসেছে (ব্যাংক, বিকাশ, কুরিয়ার অফিসে ক্যাশ) দেখা', 'রিফান্ড: অনুরোধ → মালিকের অনুমোদন → হিসাব বিভাগ টাকা দেয়', 'খরচ লেখা আর মাস শেষে ERP-তে পাঠানো'],
  sw:['ERP-তে খরচ (cost) না থাকা প্রোডাক্ট লাভের হিসাব থেকে বাদ — 0 ধরা হয় না, কত শতাংশ ঢাকা আছে দেখায়', 'বিক্রি না করা যায় এমন ফেরত মাল = ফেরতের লস লাইন', 'VAT — বন্ধ'],
  next:['মাস শেষে প্রতিটা খরচের ধরনে একটা ডকুমেন্ট ERP-তে যায়; ব্যর্থ হলে একই চাবিতে আবার পাঠানো যায় — দুবার হয় না।']};
A2_GUIDE.messages = {t:'মেসেজ', kaj:['কাস্টমারকে যত মেসেজ যায় — অর্ডারের ধাপের মেসেজ আর ক্যাম্পেইন — সব এক জায়গায় ঠিক করা আর দেখা।'],
  menu:['Order journey, Campaigns, Templates, Message log, Channels & limits'],
  kora:['কোন ধাপে কোন চ্যানেলে মেসেজ যাবে ঠিক করা, ফোনে দেখতে কেমন লাগবে দেখা', 'ক্যাম্পেইন বানানো: কাকে, কোন চ্যানেলে, কী লেখা, কখন — কতজন পাবে আর খরচ আগে দেখায়', 'যে মেসেজ যায়নি সেটা আবার পাঠানো'],
  sw:['মেইন সুইচ বন্ধ থাকলে কিছুই যায় না', 'প্রতি অর্ডারে সর্বোচ্চ 2টা SMS আর 1টা WhatsApp', 'Day-1 খোঁজ আর Day-3 রিভিউ — চালু, প্রোভাইডার যুক্ত হলে তবেই যায়', 'রাত 22:00 থেকে সকাল 08:00 চুপ'],
  next:['টাকার অংক সবসময় “বাকি টাকা” (মোট − দেওয়া); পুরো টাকা দেওয়া থাকলে অংক দেখায় না।']};
