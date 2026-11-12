/* Admin map (full page in its own window at #map) and the "?" page-guide panel. */
(function () {
  const t = (en, bn) => A.t(en, bn);
  const D = {
    home: ['Your morning screen: money, work waiting, trends, what to do.', 'সকালের স্ক্রিন: টাকা, বাকি কাজ, ধারা, কী করবেন।'],
    'orders.batch': ['Every order since the last courier pickup: what is stuck, what needs a person, what moved on by itself.', 'শেষ কুরিয়ার পিকআপের পর থেকে সব অর্ডার: কী আটকে আছে, কোনটায় মানুষ লাগবে, কোনটা নিজে এগিয়েছে।'],
    'orders.all': ['Every order with the 7 status chips; open one for customer, score, profit and actions.', 'সব অর্ডার, 7টা স্ট্যাটাস চিপ সহ; খুলে দেখুন কাস্টমার, স্কোর, লাভ ও কাজ।'],
    'orders.processing': ['Orders the rules could not confirm: approve, cancel or ask for an advance.', 'যে অর্ডার নিয়ম নিজে কনফার্ম করেনি: অ্যাপ্রুভ, বাতিল বা অ্যাডভান্স চাওয়া।'],
    'orders.ship': ['Confirmed → Book courier, Booked → Print stickers, Packed → waiting for pickup.', 'কনফার্মড → কুরিয়ার বুক, বুকড → স্টিকার প্রিন্ট, প্যাকড → পিকআপের অপেক্ষা।'],
    'couriers.overview': ['All couriers side by side: parcels, COD held, success rate.', 'সব কুরিয়ার পাশাপাশি: পার্সেল, হাতে থাকা COD, সফলতার হার।'],
    'couriers.c360': ['Everything about one courier: parcels, money, payouts, performance, claims, messages, setup.', 'একটা কুরিয়ারের সবকিছু: পার্সেল, টাকা, পেআউট, পারফরম্যান্স, ক্লেইম, মেসেজ, সেটআপ।'],
    'couriers.claims': ['One ledger of every courier claim, plus payouts.', 'সব কুরিয়ার ক্লেইমের একটাই খাতা, সাথে পেআউট।'],
    'couriers.setup': ['Connect and test each courier, rate cards.', 'প্রতিটা কুরিয়ার যুক্ত ও টেস্ট করা, রেট কার্ড।'],
    'finance.couriers': ['Courier money: COD held, payouts, monthly statement, lines that do not match.', 'কুরিয়ারের টাকা: হাতে থাকা COD, পেআউট, মাসের স্টেটমেন্ট, না মেলা লাইন।'],
    'reports.couriers': ['Which courier is better: success, days, returns, cost per parcel.', 'কোন কুরিয়ার ভালো: সফলতা, দিন, ফেরত, পার্সেল-প্রতি খরচ।'],
    'rules.popups': ['Every pop-up and notice in one place: where it shows, on/off, text.', 'সব পপ-আপ ও নোটিশ এক জায়গায়: কোথায় দেখায়, চালু/বন্ধ, লেখা।'],
    'orders.confirm': ['Orders the rules could not confirm: call list with courier score and reason.', 'যে অর্ডার নিয়ম নিজে কনফার্ম করতে পারেনি: কুরিয়ার স্কোর ও কারণসহ কলের তালিকা।'],
    'orders.pack': ['One "Print all": summary, picking list and stickers; printing makes them Packed (after booking).', 'একবার "Print all": সারাংশ, পিকিং লিস্ট ও স্টিকার; প্রিন্ট হলেই প্যাকড।'],
    'orders.courier': ['Parcels the courier has entered, money on the way, and the day-end missing-parcel check.', 'কুরিয়ার যেগুলো এন্ট্রি করেছে, আসছে এমন টাকা, আর দিন শেষে হারানো পার্সেলের চেক।'],
    'orders.returns': ['Exchange requests, partial deliveries, parcels coming back and the 7-day ERP check.', 'এক্সচেঞ্জ রিকোয়েস্ট, আংশিক ডেলিভারি, ফেরত আসা পার্সেল আর 7 দিনের ERP চেক।'],
    'orders.incomplete': ['People who left checkout; remind them, at most two messages each.', 'যারা চেকআউটে এসে চলে গেছেন; মনে করিয়ে দিন, একজনকে সর্বোচ্চ 2 বার।'],
    'products.all': ['All products with price, ERP buying price, stock and sales; drafts show what they still need.', 'সব প্রোডাক্ট: দাম, ERP কেনা দাম, স্টক, বিক্রি; ড্রাফটে কী বাকি তা দেখায়।'],
    'products.add': ['8-step wizard from an ERP style to a live product, with phone preview.', 'ERP স্টাইল থেকে লাইভ প্রোডাক্ট, 8 ধাপে, ফোন প্রিভিউ সহ।'],
    'products.stock': ['Stock from the ERP, low sizes, days of stock left.', 'ERP থেকে আসা স্টক, কম থাকা সাইজ, কত দিন চলবে।'],
    'products.ranking': ['Which products show first on the shop, and why.', 'দোকানে কোন প্রোডাক্ট আগে দেখাবে, আর কেন।'],
    'products.combos': ['Combos built by hand or made automatically, with their prices.', 'হাতে বা অটো বানানো কম্বো, দামসহ।'],
    'products.sets': ['Top + bottom sets sold at one price, sizes chosen per piece.', 'টপ + বটম সেট এক দামে, প্রতিটা পিসের সাইজ আলাদা।'],
    'products.reviews': ['Reviews, customer questions and FAQs; bad reviews are never deleted.', 'রিভিউ, কাস্টমারের প্রশ্ন ও FAQ; খারাপ রিভিউ কখনো মোছা হয় না।'],
    'products.sizecharts': ['Size charts per category, with measuring picture and size finder.', 'ক্যাটাগরি অনুযায়ী সাইজ চার্ট, মাপের ছবি ও সাইজ ফাইন্ডার।'],
    'customers.all': ['Every customer with orders, spend, refused parcels; opens Customer 360.', 'সব কাস্টমার: অর্ডার, খরচ, ফেরত পার্সেল; Customer 360 খোলে।'],
    'customers.groups': ['Groups and priority grades for messages and offers.', 'মেসেজ ও অফারের জন্য গ্রুপ ও প্রায়োরিটি গ্রেড।'],
    'customers.loyalty': ['Points and wallet credit.', 'পয়েন্ট আর ওয়ালেট ক্রেডিট।'],
    'customers.merge': ['Same person saved twice; merge them.', 'একই মানুষ দুবার; মার্জ করুন।'],
    'inbox.chats': ['Messenger, WhatsApp, Instagram and site chat in one list, with the customer’s orders beside.', 'Messenger, WhatsApp, Instagram ও সাইট চ্যাট এক জায়গায়, পাশে কাস্টমারের অর্ডার।'],
    'inbox.replies': ['Ready answers for common questions.', 'সাধারণ প্রশ্নের তৈরি উত্তর।'],
    'inbox.stats': ['How fast the team answers.', 'টিম কত দ্রুত উত্তর দিচ্ছে।'],
    'rules.all': ['Every shop rule as one plain sentence: delivery, COD, order flow, exchange, customers, discounts, messages.', 'দোকানের সব নিয়ম এক লাইনে: ডেলিভারি, COD, অর্ডার ফ্লো, এক্সচেঞ্জ, কাস্টমার, ছাড়, মেসেজ।'],
    'rules.coupons': ['Offers & discounts 360: coupons, free delivery, online-payment reward, points, wallet credit.', 'অফার ও ডিসকাউন্ট 360: কুপন, ফ্রি ডেলিভারি, অনলাইন পেমেন্টের পুরস্কার, পয়েন্ট, ওয়ালেট।'],
    'marketing.overview': ['Ad money to real profit on delivered orders, with the verdict per channel.', 'বিজ্ঞাপনের টাকা থেকে আসল লাভ, ডেলিভারি অর্ডারে, চ্যানেল ধরে পরামর্শ।'],
    'marketing.campaigns': ['Every ad campaign on every platform: spend, delivered sales, Scale / Keep / Fix / Stop.', 'সব প্ল্যাটফর্মের বিজ্ঞাপন: খরচ, ডেলিভারি বিক্রি, বাড়ান / রাখুন / ঠিক করুন / বন্ধ।'],
    'marketing.messages': ['WhatsApp, SMS, email and Messenger campaigns to opted-in customers.', 'রাজি থাকা কাস্টমারদের WhatsApp, SMS, ইমেইল ও Messenger ক্যাম্পেইন।'],
    'marketing.audiences': ['Customer groups for ads and messages, refused-parcel people kept out.', 'বিজ্ঞাপন ও মেসেজের কাস্টমার গ্রুপ, পার্সেল ফেরত দেওয়ারা বাদ।'],
    'marketing.calendar': ['What runs when: sales, festivals, posts, messages.', 'কবে কী চলবে: সেল, উৎসব, পোস্ট, মেসেজ।'],
    'marketing.plan': ['Budget plan, where to spend by district, ideas, proposals waiting for your OK.', 'বাজেট প্ল্যান, কোন জেলায় খরচ, আইডিয়া, আপনার অনুমতির অপেক্ষায় প্রস্তাব।'],
    'marketing.tools': ['Ad accounts, landing pages, referral and Shopping feed.', 'বিজ্ঞাপন অ্যাকাউন্ট, ল্যান্ডিং পেজ, রেফারেল ও Shopping ফিড।'],
    'website.layout': ['Homepage and page sections and their order.', 'হোমপেজ ও পেজের সেকশন ও ক্রম।'],
    'website.text': ['Every word customers see, English and Bengali, searchable by page.', 'কাস্টমার যা পড়েন সব লেখা, ইংরেজি ও বাংলা, পেজ ধরে খোঁজা যায়।'],
    'website.policies': ['Policy pages with "at a glance" boxes; numbers come from Rules.', 'পলিসি পেজ, "এক নজরে" বক্স সহ; সংখ্যা আসে নিয়ম থেকে।'],
    'website.blog': ['Write blog posts with product blocks and an SEO checklist.', 'প্রোডাক্ট ব্লক ও SEO চেকলিস্ট সহ ব্লগ লিখুন।'],
    'website.analytics': ['Visitors, sources, Google search, behaviour and page speed.', 'ভিজিটর, কোথা থেকে আসে, গুগল সার্চ, আচরণ ও পেজের গতি।'],
    'website.seo': ['Google ranking of your keywords, SEO problems to fix.', 'কিওয়ার্ডের গুগল র‍্যাঙ্কিং, ঠিক করার SEO সমস্যা।'],
    'finance.overview': ['Where the money is now: in hand, with couriers, owed to the ERP, and this month vs target.', 'টাকা এখন কোথায়: হাতে, কুরিয়ারের কাছে, ERP-কে দেনা, আর টার্গেটের তুলনায় এই মাস।'],
    'finance.cash': ['Every taka in and out: courier payouts, bKash/Nagad, bank, matched or missing.', 'প্রতিটা টাকার আসা-যাওয়া: কুরিয়ারের টাকা, bKash/Nagad, ব্যাংক, মিলেছে না বাকি।'],
    'finance.pnl': ['Full profit & loss: from sales to net profit, line by line.', 'পুরো লাভ-ক্ষতি: বিক্রি থেকে নিট লাভ, লাইন ধরে।'],
    'finance.costs': ['Rent, salaries and other costs, with monthly budgets.', 'ভাড়া, বেতন ও অন্যান্য খরচ, মাসিক বাজেটসহ।'],
    'finance.erp': ['ERP account: bills at buying price, credits for returns, payments.', 'ERP হিসাব: কেনা দামে বিল, রিটার্নের ক্রেডিট, পেমেন্ট।'],
    'finance.wallet': ['Customer wallet balances and refunds (owner approves).', 'কাস্টমারের ওয়ালেট ব্যালান্স ও রিফান্ড (মালিক অনুমোদন করেন)।'],
    'finance.vat': ['VAT summary — shows only when "Show VAT" is on in Store details.', 'ভ্যাটের সারসংক্ষেপ — দোকানের তথ্যে "ভ্যাট দেখান" চালু থাকলেই দেখায়।'],
    'reports.overview': ['Report library: every report in one list, with favourites and schedules.', 'রিপোর্ট লাইব্রেরি: সব রিপোর্ট এক তালিকায়, পছন্দ ও সময়সূচিসহ।'],
    'reports.sales': ['Sales by day, channel, payment, hour.', 'দিন, চ্যানেল, পেমেন্ট, সময় অনুযায়ী বিক্রি।'],
    'reports.profit': ['Profit by category, channel and week.', 'ক্যাটাগরি, চ্যানেল, সপ্তাহ অনুযায়ী লাভ।'],
    'reports.products': ['Best and worst sellers, sizes, stock cover, returns.', 'সেরা ও দুর্বল প্রোডাক্ট, সাইজ, স্টক, রিটার্ন।'],
    'reports.customers': ['New vs returning, top customers, by district.', 'নতুন বনাম পুরোনো, সেরা কাস্টমার, জেলা।'],
    'reports.delivery': ['Courier success, delays, refused parcels, COD ageing.', 'কুরিয়ারের সাফল্য, দেরি, ফেরত, COD কত দিনের।'],
    'reports.marketing': ['Ad spend vs delivered sales, return per ৳1, coupons.', 'বিজ্ঞাপন খরচ বনাম ডেলিভারি বিক্রি, ৳1-এ ফেরত, কুপন।'],
    'reports.areas': ['Division → district → thana → area: orders, returns, profit, top products per place.', 'বিভাগ → জেলা → থানা → এলাকা: অর্ডার, ফেরত, লাভ, প্রতিটা জায়গার সেরা প্রোডাক্ট।'],
    'reports.team': ['What each staff member did.', 'কে কত কাজ করেছেন।'],
    'reports.review': ['Monthly review: the month in one page with what to do next month.', 'মাসের রিভিউ: পুরো মাস এক পেজে, পরের মাসে কী করবেন।'],
    'ai.approvals': ['One queue of everything the AI proposes — budgets, declines, replies, ideas — with Approve / Reject.', 'AI-এর সব প্রস্তাব এক তালিকায় — বাজেট, বাতিল, উত্তর, আইডিয়া — অনুমোদন / না সহ।'],
    'ai.agents': ['The 7 agents: what each does now, its spend, model and schedule, one-tap pause.', '7টি এজেন্ট: কে এখন কী করছে, খরচ, মডেল ও সময়, এক চাপে পজ।'],
    'ai.costs': ['Monthly ceilings for AI, SMS and WhatsApp, 80% warning, caps per agent, cost-saver mode.', 'AI, SMS ও WhatsApp-এর মাসিক সীমা, 80%-এ সতর্কতা, এজেন্ট ধরে সীমা, খরচ বাঁচানোর মোড।'],
    'ai.train': ['Teach the agents: instructions, examples, documents, forbidden topics, sandbox, versions, ask in Bengali.', 'এজেন্টদের শেখান: নির্দেশনা, উদাহরণ, ডকুমেন্ট, নিষিদ্ধ বিষয়, স্যান্ডবক্স, ভার্সন, বাংলায় প্রশ্ন।'],
    'settings.demo': ['Sample products that fill empty categories: master switch, switches per category, auto-hide, shop pop-up.', 'খালি ক্যাটাগরি ভরানোর নমুনা প্রোডাক্ট: মূল সুইচ, ক্যাটাগরি ধরে সুইচ, নিজে লুকানো, দোকানের পপ-আপ।'],
    'settings.store': ['Shop name, business details, addresses, contact, logos, invoice and sticker, VAT, targets.', 'দোকানের নাম, ব্যবসার তথ্য, ঠিকানা, যোগাযোগ, লোগো, ইনভয়েস ও স্টিকার, ভ্যাট, টার্গেট।'],
    'settings.erp': ['Is the ERP link working? Big status, problems in plain words, what moves each way.', 'ERP সংযোগ চলছে কি? বড় অবস্থা, সহজ কথায় সমস্যা, কোন দিকে কী যায়।'],
    'settings.couriers': ['Courier accounts and fees, the default courier, pickup place and time.', 'কুরিয়ার অ্যাকাউন্ট ও চার্জ, ডিফল্ট কুরিয়ার, পিকআপের জায়গা ও সময়।'],
    'settings.payments': ['bKash, Nagad, cards, and which account the money lands in.', 'bKash, Nagad, কার্ড, আর টাকা কোন অ্যাকাউন্টে আসে।'],
    'settings.messages': ['SMS/WhatsApp texts customers get at each order step.', 'অর্ডারের প্রতি ধাপে কাস্টমার যে SMS/WhatsApp পান।'],
    'settings.team': ['Staff, roles and a tick-box tree of what each role can open.', 'স্টাফ, রোল ও কোন রোল কী খুলতে পারে তার টিক-বক্স ট্রি।'],
    'settings.keys': ['Every outside service key in one locked place.', 'সব বাইরের সার্ভিসের কি এক তালাবদ্ধ জায়গায়।'],
    'settings.backups': ['Backups on the server and Google Drive, restore, monthly drill.', 'সার্ভার ও গুগল ড্রাইভে ব্যাকআপ, রিস্টোর, মাসিক মহড়া।'],
    'settings.health': ['Uptime, speed, errors, nightly page check, AI Diagnose, one-button optimise.', 'চালু থাকা, গতি, সমস্যা, রাতের পেজ চেক, AI দিয়ে খোঁজা, এক বোতামে অপটিমাইজ।'],
    'settings.ai': ['A quick look at AI with a link to AI Center.', 'AI এক নজরে, AI সেন্টারের লিংকসহ।'],
    'settings.updates': ['Version running, what changed, auto-update, go back a version.', 'কোন ভার্সন চলছে, কী বদলেছে, অটো-আপডেট, আগের ভার্সনে ফেরা।'],
    'settings.security': ['2-step login, sessions, blocked addresses.', '2-ধাপের লগইন, সেশন, ব্লক করা ঠিকানা।'],
    'settings.activity': ['Who changed what; who viewed customer data.', 'কে কী বদলেছেন; কে কাস্টমারের তথ্য দেখেছেন।'],
    'settings.privacy': ['Exports, customer copy/erase requests, keep times, import old customers.', 'এক্সপোর্ট, কাস্টমারের কপি/মোছার অনুরোধ, কতদিন রাখা হয়, পুরনো কাস্টমার আনা।'],
    'settings.telegram': ['Telegram bot: 22:00 report, alerts, allowed phones, commands.', 'Telegram বট: রাত 22:00-র রিপোর্ট, অ্যালার্ট, অনুমতিপ্রাপ্ত ফোন, কমান্ড।'],
    'settings.manual': ['Searchable Site Manual and project files.', 'খোঁজা যায় এমন সাইট ম্যানুয়াল ও প্রজেক্ট ফাইল।'],
  };
  const NEW = { 'orders.batch': 1, 'orders.returns': 1, 'products.add': 1, 'products.combos': 1, 'products.sets': 1, 'rules.all': 1, 'marketing.overview': 1, 'website.analytics': 1, 'finance.cash': 1, 'reports.areas': 1, 'reports.review': 1, 'settings.keys': 1, 'settings.ai': 1, 'ai.approvals': 1, 'ai.agents': 1, 'ai.costs': 1, 'ai.train': 1, 'settings.demo': 1 };
  const TASKS = [
    ['Change the delivery charge', 'ডেলিভারি চার্জ বদলানো', 'rules', 'all'], ['Set free delivery above an amount', 'নির্দিষ্ট টাকার উপরে ফ্রি ডেলিভারি', 'rules', 'all'], ['Change the COD limit', 'COD লিমিট বদলানো', 'rules', 'all'],
    ['Decide which orders confirm by themselves', 'কোন অর্ডার নিজে কনফার্ম হবে ঠিক করা', 'rules', 'all'], ['Make a coupon', 'কুপন বানানো', 'rules', 'coupons'], ['See what to do this morning', 'আজ সকালে কী করতে হবে দেখা', 'home', ''],
    ['Call orders that need a person', 'যে অর্ডারে কল লাগবে', 'orders', 'processing'], ['Book the courier for confirmed orders', 'কনফার্ম অর্ডারে কুরিয়ার বুক করা', 'orders', 'ship'], ['Print picking list and stickers', 'পিকিং লিস্ট ও স্টিকার প্রিন্ট', 'orders', 'ship'], ['See where a parcel is with the courier', 'পার্সেল কুরিয়ারের কাছে কোথায় দেখা', 'couriers', 'c360'], ['Ask the courier for my COD money', 'কুরিয়ারের কাছে COD টাকা চাওয়া', 'couriers', 'c360'], ['Raise or follow a courier claim', 'কুরিয়ারের ক্লেইম তোলা বা দেখা', 'couriers', 'claims'], ['Change a pop-up or notice', 'পপ-আপ বা নোটিশ বদলানো', 'rules', 'popups'], ['Make an offer or discount', 'অফার বা ডিসকাউন্ট বানানো', 'rules', 'coupons'], ['Call someone who left checkout', 'চেকআউট ছেড়ে যাওয়া কাউকে কল করা', 'orders', 'incomplete'], ['Find a missing parcel', 'হারানো পার্সেল খোঁজা', 'orders', 'courier'],
    ['Handle an exchange request', 'এক্সচেঞ্জ রিকোয়েস্ট সামলানো', 'orders', 'returns'], ['Remind people who left checkout', 'চেকআউট ছেড়ে যাওয়াদের মনে করানো', 'orders', 'incomplete'], ['Find an order by phone number', 'ফোন নম্বর দিয়ে অর্ডার খোঁজা', 'orders', 'all'],
    ['Add a new product from the ERP', 'ERP থেকে নতুন প্রোডাক্ট যোগ', 'products', 'add'], ['Change a product’s price', 'প্রোডাক্টের দাম বদলানো', 'products', 'all'], ['See which sizes are running out', 'কোন সাইজ শেষ হয়ে যাচ্ছে দেখা', 'products', 'stock'],
    ['Make a combo offer', 'কম্বো অফার বানানো', 'products', 'combos'], ['Answer a customer question', 'কাস্টমারের প্রশ্নের উত্তর', 'products', 'reviews'], ['Make a size chart', 'সাইজ চার্ট বানানো', 'products', 'sizecharts'],
    ['Reply to Messenger and WhatsApp', 'Messenger ও WhatsApp-এর উত্তর', 'inbox', 'chats'], ['See a customer’s whole history', 'কাস্টমারের পুরো ইতিহাস দেখা', 'customers', 'all'], ['Merge a customer saved twice', 'দুবার সেভ হওয়া কাস্টমার মার্জ', 'customers', 'merge'],
    ['Check if my ads make profit', 'বিজ্ঞাপনে লাভ হচ্ছে কিনা দেখা', 'marketing', 'overview'], ['Pause or change an ad budget', 'বিজ্ঞাপন পজ বা বাজেট বদলানো', 'marketing', 'campaigns'], ['Send a WhatsApp or SMS offer', 'WhatsApp বা SMS অফার পাঠানো', 'marketing', 'messages'],
    ['Change homepage banners and sections', 'হোমপেজের ব্যানার ও সেকশন বদলানো', 'website', 'layout'], ['Change a word customers see', 'কাস্টমার যে লেখা দেখেন তা বদলানো', 'website', 'text'], ['Edit the exchange policy page', 'এক্সচেঞ্জ পলিসি পেজ এডিট', 'website', 'policies'],
    ['Write a blog post', 'ব্লগ লেখা', 'website', 'blog'], ['See how many visitors came', 'কতজন ভিজিটর এসেছে দেখা', 'website', 'analytics'], ['See this month’s profit', 'এই মাসের লাভ দেখা', 'finance', 'pnl'],
    ['Record rent or a salary', 'ভাড়া বা বেতন লেখা', 'finance', 'costs'], ['See how much I owe the ERP', 'ERP-কে কত দেনা দেখা', 'finance', 'erp'], ['Check courier cash arrived', 'কুরিয়ারের টাকা এসেছে কিনা দেখা', 'finance', 'cash'],
    ['See which districts return most', 'কোন জেলায় বেশি ফেরত দেখা', 'reports', 'areas'], ['Read the monthly review', 'মাসের রিভিউ পড়া', 'reports', 'review'], ['Change shop address, hotline or logo', 'দোকানের ঠিকানা, হটলাইন বা লোগো বদলানো', 'settings', 'store'],
    ['Turn on VAT and add BIN', 'ভ্যাট চালু ও BIN দেওয়া', 'settings', 'store'], ['Set monthly sales targets', 'মাসিক বিক্রির টার্গেট দেওয়া', 'settings', 'store'], ['Give staff access to a page', 'স্টাফকে কোনো পেজের অ্যাক্সেস দেওয়া', 'settings', 'team'],
    ['Add or replace a key (bKash, Meta…)', 'কি দেওয়া বা বদলানো (bKash, Meta…)', 'settings', 'keys'], ['Back up now or restore', 'এখনই ব্যাকআপ বা রিস্টোর', 'settings', 'backups'], ['Pause an AI agent', 'AI এজেন্ট পজ করা', 'ai', 'agents'], ['Approve what the AI suggests', 'AI-এর প্রস্তাব অনুমোদন', 'ai', 'approvals'], ['Set a monthly AI and SMS limit', 'AI ও SMS-এর মাসিক সীমা দেওয়া', 'ai', 'costs'],
    ['Teach the AI a new rule', 'AI-কে নতুন নিয়ম শেখানো', 'ai', 'train'], ['Ask the AI about a problem in Bengali', 'বাংলায় AI-কে সমস্যার কথা জিজ্ঞেস', 'ai', 'train'], ['Turn demo products on or off', 'ডেমো প্রোডাক্ট চালু বা বন্ধ', 'settings', 'demo'],
    ['Get the daily report on Telegram', 'Telegram-এ দৈনিক রিপোর্ট পাওয়া', 'settings', 'telegram'],
  ];
  const GROUPS = [['Every day', 'প্রতিদিন', ['home', 'orders', 'couriers', 'inbox']], ['Selling', 'বিক্রি', ['products', 'customers', 'marketing', 'website']], ['Money', 'টাকা', ['finance', 'reports']], ['Setup', 'সেটআপ', ['rules', 'ai', 'settings']]];

  A.css('map', `
  .mp{max-width:1180px;margin:0 auto;padding:18px 16px 60px}
  .mp-top{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
  .mp-top h1{font:700 24px var(--f-head);margin:0}
  .mp-q{position:relative;margin-bottom:16px}
  .mp-q input{width:100%;font-size:16px;padding:14px 16px;border-radius:14px}
  .mp-res{display:flex;flex-direction:column;gap:2px;margin-top:6px}
  .mp-res a{display:flex;gap:10px;align-items:center;padding:9px 12px;border-radius:10px;text-decoration:none;color:var(--ink);background:var(--card);border:1px solid var(--line)}
  .mp-res a:hover{border-color:var(--accent)}
  .mp-tasks{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:6px}
  .mp-tasks a{display:flex;flex-direction:column;gap:2px;padding:9px 12px;border-radius:10px;background:var(--card2);color:var(--ink);text-decoration:none;font-size:13.5px}
  .mp-tasks a:hover{background:var(--card);box-shadow:inset 0 0 0 1px var(--accent)}
  .mp-tasks a span{color:var(--muted);font-size:12px;white-space:nowrap}
  .mp-grp{margin-top:22px}
  .mp-grp>h2{font:700 15px var(--f-head);text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 10px}
  .mp-secs{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px}
  .mp-tab{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px dashed var(--line)}
  .mp-tab:first-child{border-top:0}
  .mp-tab b{min-width:128px;font-weight:600;font-size:13.5px}
  .mp-tab .grow{font-size:12.5px;color:var(--muted)}
  .mp-tab .acts{display:flex;gap:6px;flex:none}
  .mp-flow{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  .mp-flow a,.mp-flow span.st{padding:8px 12px;border-radius:999px;background:var(--card2);border:1px solid var(--line);font-size:13px;text-decoration:none;color:var(--ink);font-weight:600}
  .mp-flow i{color:var(--muted);font-style:normal}
  .mp-erp{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;font-size:13px}
  .mp-erp .box{border-radius:12px;padding:12px;background:var(--card2);border:1px solid var(--line)}
  .mp-erp .mid{display:flex;flex-direction:column;gap:6px;text-align:center;color:var(--muted);font-size:12px}
  .hp-flash{outline:3px solid var(--accent)!important;outline-offset:3px;transition:outline-color 1.5s}
  .hp-btns{display:flex;flex-wrap:wrap;gap:6px}
  @media (max-width:640px){.mp-secs{grid-template-columns:1fr}.mp-tab{flex-wrap:wrap}.mp-tab b{min-width:0;width:100%}.mp-erp{grid-template-columns:1fr}}
  `);

  const pur = (k) => { const d = D[k] || ['', '']; return t(d[0], d[1]); };
  const tabsOf = (s) => (s.id === 'settings' && A.SET_ITEMS ? A.SET_ITEMS.map((x) => [x.id, { en: x.en, bn: x.bn }, x.g]) : s.tabs);
  const roles = (s, tab) => {
    if (s.id === 'settings' && tab && tab[2] === 's') return [t('Owner only', 'শুধু মালিক')];
    const acc = (A.D.set && A.D.set.access) || {}; const R = [t('Owner', 'মালিক')];
    for (const r in acc) if (Object.keys(acc[r]).some((k) => (tab ? k === s.id + '.' + tab[0] : k.startsWith(s.id + '.')))) R.push(r);
    return R;
  };
  const go = (sec, tab) => { const h = A.href(sec, tab); if (document.getElementById('map-ov')) { A.closeMap(); if (location.hash === h) A.render(); else location.hash = h; return; } if (window.opener && !window.opener.closed && location.hash === '#map') { try { window.opener.location.hash = h; window.opener.focus(); return; } catch (e) {} } location.hash = h; };
  const guideOf = (sec, tab) => { const m = A.mods[sec] || {}; const h = m[tab || 'main'] || m.main; return h && h.guide ? t(h.guide.en, h.guide.bn) : `<p>${pur(tab ? sec + '.' + tab : sec)}</p>`; };

  A.mapHtml = () => A.NAV.map((s) => `<section class="card tight"><div class="row" style="gap:8px;margin-bottom:6px">${A.icon(s.icon)}<a href="${A.href(s.id)}" data-close style="font-weight:700;text-decoration:none">${A.nm(s.name)}</a></div><div class="list">${(s.tabs.length ? tabsOf(s) : []).map((tb) => `<a class="li" data-close href="${A.href(s.id, tb[0])}" style="text-decoration:none;align-items:flex-start"><b style="min-width:150px;font-weight:600">${A.nm(tb[1])}</b><span class="muted small grow">${pur(s.id + '.' + tb[0])}</span></a>`).join('') || `<div class="muted small">${pur('home')}</div>`}</div></section>`).join('');
  A.openMap = () => {
    const old = document.getElementById('map-ov'); if (old) old.remove();
    const ov = document.createElement('div'); ov.id = 'map-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Admin map');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9000;background:var(--bg);overflow:auto;-webkit-overflow-scrolling:touch';
    ov.innerHTML = '<div id="map-ov-root"></div>'; document.body.appendChild(ov); document.body.style.overflow = 'hidden';
    document.body.classList.toggle('bn', A.lang === 'bn');
    A.renderMapPage(ov.querySelector('#map-ov-root'));
    const esc = (e) => { if (e.key === 'Escape') { A.closeMap(); document.removeEventListener('keydown', esc); } }; document.addEventListener('keydown', esc);
  };
  A.closeMap = () => { const ov = document.getElementById('map-ov'); if (ov) ov.remove(); document.body.style.overflow = ''; };

  let mq = '';
  A.renderMapPage = (root) => {
    const S = A.sec; const s = mq.trim().toLowerCase();
    let res = [];
    if (s) {
      res = TASKS.filter((x) => (x[0] + ' ' + x[1]).toLowerCase().includes(s)).map((x) => ({ l: t(x[0], x[1]), sec: x[2], tab: x[3], k: t('Task', 'কাজ') }));
      A.NAV.forEach((sc) => (sc.tabs.length ? tabsOf(sc) : [['', sc.name]]).forEach((tb) => { const key = tb[0] ? sc.id + '.' + tb[0] : sc.id; const d = D[key] || ['', '']; const g = (A.mods[sc.id] || {})[tb[0] || 'main']; const gt = g && g.guide ? (g.guide.en + g.guide.bn).replace(/<[^>]+>/g, ' ') : ''; if ((A.nm(sc.name) + ' ' + A.nm(tb[1]) + ' ' + d[0] + ' ' + d[1] + ' ' + gt).toLowerCase().includes(s)) res.push({ l: A.nm(sc.name) + (tb[0] ? ' › ' + A.nm(tb[1]) : ''), sec: sc.id, tab: tb[0], k: t('Page', 'পেজ'), sub: t(d[0], d[1]) }); }));
      // word-level fallback: "where do I change the delivery charge?"
      if (!res.length) { const words = s.split(/[^a-zঀ-৿0-9]+/).filter((w) => w.length > 3 && !['where', 'change', 'what', 'which', 'there', 'কোথায়'].includes(w)); res = TASKS.filter((x) => words.some((w) => (x[0] + ' ' + x[1]).toLowerCase().includes(w))).map((x) => ({ l: t(x[0], x[1]), sec: x[2], tab: x[3], k: t('Task', 'কাজ') })); }
    }
    const where = (x) => `${A.nm(S(x[2]).name)}${x[3] ? ' › ' + A.nm((tabsOf(S(x[2])).find((tb) => tb[0] === x[3]) || ['', { en: '', bn: '' }])[1]) : ''}`;
    root.innerHTML = `<div class="mp" id="page">
      <div class="mp-top"><div class="brand-logo">E</div><h1>${t('Admin map', 'অ্যাডমিন ম্যাপ')}</h1><span class="muted small grow">${t('Where everything is, and how to get there.', 'কোথায় কী আছে, আর কীভাবে যাবেন।')}</span>
        <div class="lang" role="group" aria-label="Language"><button class="${A.lang === 'en' ? 'on' : ''}" data-lang="en">EN</button><button class="${A.lang === 'bn' ? 'on' : ''}" data-lang="bn">বাং</button></div>
        <button class="btn" id="mp-pdf">${A.icon('down')} ${t('Download PDF', 'PDF ডাউনলোড')}</button><button class="btn" id="mp-close">${A.icon('x')} ${t('Close', 'বন্ধ')}</button></div>
      <div class="mp-q"><input class="inp" id="mp-q" type="search" placeholder="${t('Ask: where do I change the delivery charge?', 'জিজ্ঞেস করুন: ডেলিভারি চার্জ কোথায় বদলাব?')}" value="${A.esc(mq)}">
        ${s ? `<div class="mp-res">${res.slice(0, 10).map((r) => `<a href="${A.href(r.sec, r.tab)}" data-go="${r.sec}|${r.tab || ''}"><span class="badge">${r.k}</span><span class="grow"><b>${A.esc(r.l)}</b>${r.sub ? `<span class="muted small" style="display:block">${A.esc(r.sub)}</span>` : ''}</span>›</a>`).join('') || `<div class="muted small" style="padding:8px">${t('Nothing found. Try one word, like “coupon” or “backup”.', 'কিছু পাওয়া যায়নি। একটা শব্দ লিখুন, যেমন “কুপন” বা “ব্যাকআপ”।')}</div>`}</div>` : ''}</div>
      ${A.ui.card(t('I want to…', 'আমি করতে চাই…'), `<div class="mp-tasks">${TASKS.map((x) => `<a href="${A.href(x[2], x[3])}" data-go="${x[2]}|${x[3]}">${t(x[0], x[1])}<span>${where(x)}</span></a>`).join('')}</div>`, { sub: t(`${TASKS.length} common jobs — tap to go straight there`, `${TASKS.length}টি সাধারণ কাজ — চাপলেই সেখানে যাবেন`) })}
      <div class="grid g2">
        ${A.ui.card(t('Order journey', 'অর্ডারের যাত্রা'), `<div class="mp-flow">${[['New', 'নতুন', 'orders', 'batch'], ['Processing', 'প্রসেসিং', 'orders', 'processing'], ['Confirmed', 'কনফার্মড', 'orders', 'ship'], ['Booked', 'বুকড', 'orders', 'ship'], ['Packed', 'প্যাকড', 'orders', 'ship'], ['Handed over', 'কুরিয়ারে', 'orders', 'courier'], ['Delivered', 'ডেলিভারড', 'orders', 'all'], ['Paid', 'পেইড', 'finance', 'cash']].map((x, i) => `${i ? '<i>→</i>' : ''}<a href="${A.href(x[2], x[3])}" data-go="${x[2]}|${x[3]}">${t(x[0], x[1])}</a>`).join('')}</div><div class="muted small" style="margin-top:10px">${t('Side paths: refused at the door, partial delivery and exchange all go to Orders › Returns & exchanges.', 'পাশের পথ: দরজায় ফেরত, আংশিক ডেলিভারি ও এক্সচেঞ্জ — সব অর্ডার › রিটার্ন ও এক্সচেঞ্জ-এ যায়।')}</div>`)}
        ${A.ui.card(t('Shop ↔ ERP', 'দোকান ↔ ERP'), `<div class="mp-erp"><div class="box"><b>Extas ERP</b><div class="muted small">${t('stock · buying price · bills · return checks', 'স্টক · কেনা দাম · বিল · রিটার্ন যাচাই')}</div></div><div class="mid"><span>${t('products, stock, prices →', 'প্রোডাক্ট, স্টক, দাম →')}</span><span>${t('← orders, bills, returns, payments', '← অর্ডার, বিল, রিটার্ন, পেমেন্ট')}</span></div><div class="box"><b>${t('Shop', 'দোকান')}</b><div class="muted small">${t('customers · orders · selling price', 'কাস্টমার · অর্ডার · বিক্রির দাম')}</div></div></div><a class="linkbtn small" href="${A.href('settings', 'erp')}" data-go="settings|erp">${t('See it live in Settings › ERP connection', 'সেটিংস › ERP কানেকশনে লাইভ দেখুন')} →</a>`)}
      </div>
      ${GROUPS.map((g) => `<div class="mp-grp"><h2>${t(g[0], g[1])}</h2><div class="mp-secs">${g[2].map((id) => { const sc = S(id); const tabs = sc.tabs.length ? tabsOf(sc) : []; return A.ui.card('', `<div class="row between" style="margin-bottom:6px"><div class="row" style="gap:8px">${A.icon(sc.icon)}<b style="font-size:16px">${A.nm(sc.name)}</b></div><span class="muted small">${roles(sc).join(' · ')}</span></div>${tabs.length ? tabs.map((tb) => `<div class="mp-tab"><b>${A.nm(tb[1])}${NEW[id + '.' + tb[0]] ? ' ' + A.ui.badge(t('New', 'নতুন'), 'accent') : ''}</b><span class="grow">${pur(id + '.' + tb[0])}<br><span style="font-size:11.5px">${t('Who', 'কে')}: ${roles(sc, tb).join(', ')}</span></span><span class="acts"><a class="btn sm" href="${A.href(id, tb[0])}" data-go="${id}|${tb[0]}">${t('Go', 'যান')}</a><button class="btn sm ghost" data-guide="${id}|${tb[0]}">${t('Guide', 'গাইড')}</button></span></div>`).join('') : `<div class="mp-tab"><span class="grow">${pur(id)}</span><span class="acts"><a class="btn sm" href="${A.href(id)}" data-go="${id}|">${t('Go', 'যান')}</a><button class="btn sm ghost" data-guide="${id}|">${t('Guide', 'গাইড')}</button></span></div>`}`); }).join('')}</div></div>`).join('')}
    </div>`;
    const q = root.querySelector('#mp-q'); q.oninput = () => { mq = q.value; const p = q.selectionStart; A.renderMapPage(root); const n = root.querySelector('#mp-q'); n.focus(); try { n.setSelectionRange(p, p); } catch (e) {} };
    q.onkeydown = (e) => { if (e.key === 'Enter') { const f = root.querySelector('[data-go]'); if (f) f.click(); } };
    root.querySelectorAll('[data-go]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); const [sc, tb] = a.dataset.go.split('|'); go(sc, tb); }));
    root.querySelectorAll('[data-guide]').forEach((b) => (b.onclick = () => { const [sc, tb] = b.dataset.guide.split('|'); const T = S(sc); const tab = tabsOf(T).find((x) => x[0] === tb); A.ui.modal(A.nm(T.name) + (tab ? ' › ' + A.nm(tab[1]) : ''), `<div class="stack">${guideOf(sc, tb)}</div>`, { foot: `<button class="btn primary" id="mg-go">${t('Go to this page', 'এই পেজে যান')}</button>` }).parentElement.querySelector('#mg-go').onclick = () => { A.ui.close(); go(sc, tb); }; }));
    root.querySelectorAll('[data-lang]').forEach((b) => (b.onclick = () => { A.setLang(b.dataset.lang); const ov = document.getElementById('map-ov'); if (ov) { document.body.classList.toggle('bn', A.lang === 'bn'); A.renderMapPage(ov.querySelector('#map-ov-root')); } }));
    root.querySelector('#mp-pdf').onclick = () => A.ui.download(t('Admin map PDF', 'অ্যাডমিন ম্যাপ PDF'));
    root.querySelector('#mp-close').onclick = () => { if (document.getElementById('map-ov')) { A.closeMap(); return; } window.close(); setTimeout(() => { if (!window.closed) location.hash = '#home'; }, 150); };
    document.title = t('Admin map · EXTAS', 'অ্যাডমিন ম্যাপ · EXTAS');
  };

  /* ---------------- "?" page guide panel ---------------- */
  A.helpPanel = () => {
    const r = A.route(); const S = A.sec(r.sec); const tabs = tabsOf(S); const tab = tabs.find((x) => x[0] === r.tab);
    const g = guideOf(r.sec, r.tab);
    const hasMore = /mistake|ভুল/i.test(g);
    const key = r.tab ? r.sec + '.' + r.tab : r.sec;
    const extra = hasMore ? '' : `<p><b>${t('Common mistakes:', 'সাধারণ ভুল:')}</b> ${t('changing money or price settings without checking “What changes” first; every such change asks for your PIN.', '“কী বদলাবে” না দেখে টাকা বা দামের সেটিংস বদলানো; এমন প্রতিটা পরিবর্তনে PIN লাগে।')}</p><p><b>${t('What happens next:', 'এরপর কী হয়:')}</b> ${t('every change is saved at once, written in the Activity log and shows on the related pages.', 'প্রতিটা পরিবর্তন সাথে সাথে সেভ হয়, অ্যাক্টিভিটি লগে লেখা থাকে আর সংশ্লিষ্ট পেজে দেখায়।')}</p>`;
    const btns = []; document.querySelectorAll('#page .btn, #page .tabs a, #page .chip').forEach((b) => { const x = (b.textContent || '').trim().replace(/\s+/g, ' '); if (x && x.length < 34 && !btns.some((y) => y[0] === x) && b.offsetParent) btns.push([x, b]); });
    const d = A.ui.drawer(t('Help: ', 'সাহায্য: ') + A.nm(S.name) + (tab ? ' › ' + A.nm(tab[1]) : ''),
      `<div class="card stack small">${pur(key) ? `<div class="guide-note">${pur(key)}</div>` : ''}${g}${extra}</div>
      ${btns.length ? A.ui.card(t('Buttons on this page', 'এই পেজের বোতাম'), `<div class="hp-btns">${btns.slice(0, 16).map((b, i) => `<button class="chip" data-hb="${i}">${A.esc(b[0])}</button>`).join('')}</div><div class="hint">${t('Tap one — “Show me” marks it on the page.', 'একটায় চাপুন — “দেখান” পেজে দাগ দিয়ে দেখাবে।')}</div>`) : ''}
      ${A.ui.card(t('Ask the helper', 'সহকারীকে জিজ্ঞেস করুন'), `<div class="row" style="flex-wrap:nowrap"><input class="inp" id="hp-q" placeholder="${t('e.g. how do I print stickers?', 'যেমন: স্টিকার কীভাবে প্রিন্ট করব?')}"><button class="btn primary sm" id="hp-ask">${t('Ask', 'জিজ্ঞেস')}</button></div><div id="hp-a" class="small" style="margin-top:8px"></div>`)}
      <div class="row"><a class="btn" href="${A.href('settings', 'manual')}" data-close id="hp-man">${A.icon('help')} ${t('Open full manual', 'পুরো ম্যানুয়াল খুলুন')}</a><button class="btn" id="hp-map">${A.icon('map')} ${t('Admin map', 'অ্যাডমিন ম্যাপ')}</button></div>`,
      { onOpen: () => {} });
    d.querySelectorAll('[data-hb]').forEach((c) => (c.onclick = () => { const el = btns[+c.dataset.hb][1]; A.ui.close(); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('hp-flash'); setTimeout(() => el.classList.remove('hp-flash'), 2600); }));
    d.querySelector('#hp-map').onclick = () => A.openMap();
    d.querySelector('#hp-man').onclick = () => { if (A.setManualQuery) A.setManualQuery(''); };
    const ask = () => {
      const q = d.querySelector('#hp-q').value.trim().toLowerCase(); if (!q) return;
      const words = q.split(/[^a-zঀ-৿0-9]+/).filter((w) => w.length > 2);
      const hit = TASKS.map((x) => [x, words.filter((w) => (x[0] + ' ' + x[1]).toLowerCase().includes(w)).length]).filter((x) => x[1]).sort((a, b) => b[1] - a[1])[0];
      const ai = A.D.set && A.D.set.aiOn;
      d.querySelector('#hp-a').innerHTML = hit ? `<div class="guide-note">${t('That is in', 'এটা আছে')} <b>${A.nm(A.sec(hit[0][2]).name)}${hit[0][3] ? ' › ' + A.nm((tabsOf(A.sec(hit[0][2])).find((x) => x[0] === hit[0][3]) || ['', { en: '', bn: '' }])[1]) : ''}</b>. <a class="linkbtn" href="${A.href(hit[0][2], hit[0][3])}" data-close>${t('Show me', 'দেখান')} →</a></div>` : `<div class="muted">${ai ? t('The helper is looking — answer in a moment in the real admin.', 'সহকারী খুঁজছে — আসল অ্যাডমিনে একটু পরেই উত্তর।') : t('Not sure. Try the full manual, or turn on AI in Settings › AI control for written answers.', 'নিশ্চিত নই। পুরো ম্যানুয়াল দেখুন, বা লিখিত উত্তরের জন্য সেটিংস › AI কন্ট্রোলে AI চালু করুন।')}</div>`;
      const a = d.querySelector('#hp-a a'); if (a) a.onclick = () => A.ui.close();
    };
    d.querySelector('#hp-ask').onclick = ask; d.querySelector('#hp-q').onkeydown = (e) => { if (e.key === 'Enter') ask(); };
  };
})();
