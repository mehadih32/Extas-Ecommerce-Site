# EXTAS — E-commerce platform

> **বাংলায় সংক্ষেপে:** এটা EXTAS-এর নতুন অনলাইন দোকানের পুরো কোড আর কাগজপত্রের ঘর। নিচে এক নজরে দেখা যায়: কোন ধাপ
> কতটা শেষ (৬৪৪টা PR-এর মধ্যে ৫২৮টা), কী চালু হয়েছে, কী বাকি, আর আপনার কোন সিদ্ধান্ত লাগবে। প্রতিটা PR মার্জের পর এই
> পাতা আপডেট হয়। কোড পড়তে হবে না — শুধু বাংলা লাইনগুলো পড়লেই চলবে।

**EXTAS** is a Bangladeshi menswear brand (polos, T-shirts, shirts, denim, trousers, panjabi and more). This private
repository builds its new online shop: a phone-first storefront, a full admin backend, and the server it runs on.
The owner's **EXTAS ERP** stays the master for SKUs, stock and accounts; this shop reads from it and sends business
documents to it ([how](#how-it-is-built)).

| | |
|---|---|
| **Preview (the build)** | **new.extas.com.bd** — password-protected and `noindex`. Every merge to `main` deploys here by itself. The password is never written anywhere; the owner reads it on the server ([`docs/owner/PREVIEW-LOGIN.md`](docs/owner/PREVIEW-LOGIN.md)). Today the home address opens the Bengali progress page (`/status`); the admin is at `/admin`. |
| **The old shop** | **extas.com.bd** (WordPress) stays live and untouched until go-live day. Then the main domain is switched and every old address gets a 301 redirect (S19, PR 587) — only on the owner's explicit word. |
| **Specification** | [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md) (V2.1 final + change notes) · [`docs/MASTER-REGISTER.md`](docs/MASTER-REGISTER.md) (653 PRs, 28 stages) · UI truth: [`docs/demo/EXTAS-demo-V12.2.html`](docs/demo/EXTAS-demo-V12.2.html) (V12.1 and V12 kept as history) |
| **Every session starts with** | [`CLAUDE.md`](CLAUDE.md) → [`docs/START-HERE.md`](docs/START-HERE.md) → [`PROGRESS.md`](PROGRESS.md) and [`BLOCKED.md`](BLOCKED.md) |

**Contents:** [Status](#status-dashboard) · [How it is built](#how-it-is-built) ·
[Local setup](#local-setup-and-useful-commands) · [The server](#the-server) · [Folder structure](#folder-structure) ·
[Features by area](#features-by-area) · [PR log](#pr-log) · [Change notes](#change-notes) · [Docs map](#docs-map) ·
[For a future developer](#for-a-future-developer)

---


## Running problems (CN-015)
> বাংলায়: কাস্টমারের সাইট ব্যবহারের সময় যে সমস্যাগুলো ধরা পড়ে, সেগুলো নিজে থেকেই এখানে উঠবে, পাশে লেখা থাকবে ঠিক হয়েছে কিনা।

| Date | Problem | Visitors hit | Status |
|---|---|---|---|
| 20 Oct | Admin: right after signing in, the page said "This page couldn't load". Cause: a fresh installation had no mother store, and every admin page works on it | The owner (first sign-in) | **Fixed** in #19 (PR 508: the migrate step makes the mother store; PR 4: CI signs in end to end before every deploy) |
| 20 Oct | Admin: the owner could not sign in with his own password, and the browser's "Sign in" box kept coming up. Cause: the sign-in request went out without the preview login, so the preview gate asked again and the form said "not right" | The owner | **Fixed** in #19 (PR 7: the preview login is asked once, then a cookie; PR 15: a new first password from the server when he cannot sign in, `owner-reset.yml`) |
| — | Customer problems fill this list automatically once the shop's checkout is live on new.extas.com.bd. | — | — |

## Status dashboard

> **বাংলায় সংক্ষেপে:** সার্ভার (S0A), ভিত্তি (S00), পণ্য-ছবি-ক্যাটালগ (S01), স্টক-ERP (S09) আর স্মার্ট নিয়ম (S10) — এই পাঁচটা ধাপ পুরো শেষ।
> এখন দোকানের সামনের অংশ (S02), কম্বো (S03), ব্যাগ, চেকআউট আর কাস্টমার অ্যাকাউন্ট (S04), অর্ডারের হিসাব (S05), ডেলিভারি এলাকা ও ঝুঁকির স্কোর (S06) পেমেন্ট (S07) আর কুরিয়ার (S08: কাঠামো, Steadfast, Pathao, প্যাকিং) তৈরি হচ্ছে। কাস্টমারের সেকশন (S14: তালিকা, একজন কাস্টমারের পাতা, একই মানুষের প্রোফাইল একসাথে করা) আর মেসেজের ব্যবস্থাও (SMS, WhatsApp, "বন্ধ" লিখলে মেসেজ বন্ধ, মেসেজের লেখা বদলানোর পাতা) তৈরি। অর্ডারের ইনভয়েস (S20) আর সাপোর্ট ইনবক্সের মূল অংশ (S22) তৈরি। ERP-এর সাথে টাকার হিসাব মেলানোর খাতা (S16: ERP অ্যাকাউন্ট, প্রতিদিনের মিল, মাস বন্ধ, ERP-তে দিনের হিসাব পাঠানো, মাসের স্থির খরচ) আর ERP দিয়ে ফেরত ও বদলের নতুন ব্যবস্থা (S08) তৈরি। ERP থেকে স্টাইল কোড ধরে পণ্য আনা (S01 শেষ) আর ERP-র সই করা প্রশ্নের উত্তর (S18) তৈরি। প্রতিটা দোকানের নিজের ERP সংযোগের পাতা, নতুন ERP চুক্তিতে যাওয়ার ব্যবস্থা আর পুরো ERP-র শেষ পরীক্ষা (S19) তৈরি। পুরোনো লিংক ঠিক পাতায় পাঠানো আর ৪০৪-এর তালিকা, বিক্রি শেষ হওয়া পণ্যের পাতা না হারানো, ডেমোর # লিংক আসল পাতায় নেওয়া (S11); নিরাপত্তার পাহারা, বট ধরার নীরব ব্যবস্থা, অ্যাডমিনের সাইন-ইন নিয়ম আর প্যাকেজের দুর্বলতা খোঁজা (S18); টেলিগ্রাম সতর্কবার্তা, এক ক্লিকে Google Drive ব্যাকআপ আর প্রতি মাসে ব্যাকআপ ফিরিয়ে দেখা (S19) তৈরি। প্রাইভেসি আর তথ্য মোছা, দোকানের আইনি নম্বর, হেল্প পাতার লেখা, ব্যাকআপ লকের ব্যবস্থা আর Cloudflare সুরক্ষা (S18); Cloudflare ক্যাশের নিয়ম (S17); সাইটের অবস্থা এক পাতায় (S21); Blob আর Drive ব্যাকআপ চালু, দোকান ফেরানো, 'চালুর আগে' তালিকা, চালুর দিনের গাইড আর প্রথম সপ্তাহের নজর (S19); টাকার সারসংক্ষেপ (S16) তৈরি, এগুলো এখন new.extas.com.bd-তে চালু। নতুন: Google-এর জন্য বাকি সব কাজ — কালেকশনের সার্চের লেখা, sitemap, robots.txt, ছবির বিবরণ, Search Console আর Bing, আসল কাস্টমারের গতি, বাংলা-ইংরেজি পাতার জোড়া আর বাংলা পাতা 'তৈরি' চিহ্ন (S11); Meta, Google আর TikTok-কে সার্ভার থেকে কেনাকাটার খবর (S13, শুরুতে বন্ধ); খরচের খাতা, খুচরা খরচ, খরচ ও ফি-র ঘর আর মাস শেষের হিসাব (S16); নিজে থেকে চলা ব্রাউজার পরীক্ষা আর কাস্টমারের সমস্যার তালিকা (S21); Messenger, WhatsApp আর সাইটের চ্যাট সাপোর্ট ইনবক্সে (S22)। **চালুর তালিকার বানানোর মতো সব কাজ শেষ।** পুরো সাইটের প্রথম দফা যাচাইয়ে পাওয়া ভুলগুলো ঠিক হয়েছে (#71): কুপনের ব্যবহারের সীমা এখন সত্যিই মানা হয়, পরীক্ষার পেমেন্ট শুরুতে বন্ধ, টাকা না আসা অনলাইন অর্ডার কনফার্ম হয় না, ফেরতের টাকা পাওয়া টাকার বেশি হয় না, অস্পষ্ট ঠিকানার অর্ডারে 'ডেলিভারি এলাকা ঠিক করুন' বোতাম, বাংলা পাতা আবার পুরো বাংলায়, ব্যাকআপ-ডিপ্লয়-নজরদারির ফাঁক বন্ধ, আর staging সবসময় পাসওয়ার্ডে বন্ধ। মূল ডোমেইন খোলার আলাদা সুইচ তৈরি (PR 403), সুইচটা খোলা হবে শুধু আপনার বলা দিনে (BLOCKED 25)। চালুর তালিকায় বাকি শুধু মূল ডোমেইন বদল (PR 587)। নতুন (#73): আসল অর্ডারের আগের পরীক্ষায় (গো-লাইভ গেট) পাওয়া ১৩টা সমস্যা ঠিক হয়েছে — ধন্যবাদ পাতায় শুধু সত্যি কথা, কাস্টমার যে ভাষায় অর্ডার দিলেন সেই ভাষায় মেসেজ, ফেরত পার্সেলের টাকা ফেরতের অনুরোধ আর "টাকা ফেরত আর ওয়ালেট" পাতা, কাস্টমারের ওয়ালেট ট্যাব, বুকিংয়ের পরে টাকা বদলালে আবার বুক, "শুধু প্রথম অর্ডার" কুপন, সেট ভাঙা যাবে কি না, "আমাকে কল করুন", মুখে বলে ঠিকানা, জেলা অনুযায়ী ডেলিভারির সময়, স্টিকারে ইংরেজি অক্ষরে ঠিকানা, ঈদের শেষ দিন আর আরও চারটা মেসেজ (সব নতুন সুবিধা শুরুতে বন্ধ)। চালুর পরের ৩০টা PR-ও তৈরি: ঝুঁকির ইঞ্জিনের বাকি অংশ (S06: ব্লক তালিকা, বারবার না নেওয়া কাস্টমারের শর্ত, ফ্রড রিপোর্ট, আজকের সারাংশ, নতুন কাস্টমারকে কল), নগদ আর কার্ড (S07 শেষ), কম খরচের কুরিয়ার, অ্যাকাউন্ট থেকে সাইজ বদল, কুরিয়ারের রিপোর্ট, ছুটির মোড (S08 শেষ), সাইট ম্যানুয়াল (S18 শেষ) আর সাইটের অবস্থার বাকি পাতা ও টেলিগ্রাম সতর্কবার্তা (S21)। নতুন (#78): চালুর পরের আরও ৪৩টা PR তৈরি — ঝুঁকির ইঞ্জিনের শেষ পাঁচটা (S06 শেষ: রাস্তায় থাকা একই পণ্যের নোটিশ, অন্য সাইজ হলে বদলের প্রস্তাব, ফোন নম্বর লেখার সময় কুরিয়ারের ফ্রড তথ্য, অগ্রিম চাওয়ার ফলাফলের রিপোর্ট), লাভ-ক্ষতির হিসাব (S16 শেষ: খরচের রিপোর্ট, প্রতি অর্ডারের লাভ, লাভ-ক্ষতি, VAT, টেলিগ্রামে টাকার রিপোর্ট, টিমের ব্যাজ, এলাকা আর চ্যানেল ধরে বিক্রি ও লাভ), প্যাকিংয়ের বাকি পাতা (S20 শেষ: প্রিন্ট, পিকিং লিস্ট, হ্যান্ডওভার, ইনভয়েসের ডিজাইন), ব্যাকএন্ডে PR রেজিস্টার আর ফাইল (S21 শেষ), ল্যান্ডিং পেজ, ক্যাম্পেইন আর Meta, TikTok, Google-এর বিজ্ঞাপন পড়া (S13), কাস্টমারের দল, জার্নি, অটোমেশন আর ই-মেইল (S14), আর সাপোর্ট চ্যাটে কাস্টমার চেনা, পণ্য পাঠানো ও চ্যাট থেকেই অর্ডার (S22)। নতুন (#83): দোকানের ব্লগ/জার্নাল (S12: লেখা, এডিটর, বিষয়ের পরিকল্পনা, ব্রিফ, AI দিয়ে প্রথম খসড়া, মাস ধরে অনুমোদন, প্রকাশের ক্যালেন্ডার); অসম্পূর্ণ অর্ডারের তালিকা, চেকআউট বা ব্যাগ ছেড়ে যাওয়া কাস্টমারকে সর্বোচ্চ দুইটা মেসেজ, দলকে একসাথে মেসেজ, YouTube আর SEO outreach (S13)। নতুন (#84): ঈদ-শীত-পূজার স্থায়ী পেজ, "পেমেন্টের উপায়" পাতায় শুধু চেকআউটে যা চালু, হেল্প পাতা সার্চে আসল নিয়মের লাইনসহ, জার্নালের লেখা Google-এর জন্য তৈরি আর কোন লেখা পাঠক ও অর্ডার আনে তার রিপোর্ট (S12); সময় ধরে মৌসুমি হোম পেজ, উৎসবের আগে অর্ডারের শেষ সময় দোকানে দেখানো, মার্কেটিং ক্যালেন্ডার, মার্কেটিং রিপোর্ট আর অনুমোদন নিয়ে নতুন বিজ্ঞাপন ক্যাম্পেইন, কুরিয়ারের ফল আর কাস্টমারের আগ্রহসহ বিজ্ঞাপনের প্ল্যাটফর্মে অর্ডারের খবর (S13); ফুটারে শুধু চালু থাকা পেমেন্টের চিহ্ন। নতুন (#85): হোম, ক্যাটাগরি, পণ্য আর ব্যাগের পাতার অংশগুলো টেনে সাজানো আর ফোন বা কম্পিউটারে দেখানো-লুকানো (S02); পুরনো সাইটের লিংক নতুন পাতায় পাঠানোর তালিকা পুরনো sitemap থেকে, আর বন্ধ স্টেজের আধা-বানানো অংশ সুইচ দিয়ে লুকানো (S19)। নতুন (#86): অ্যাডমিনের নতুন চেহারা Lumen-এর ভিত্তি — হালকা রং আসল, চাঁদ বাটনে প্রত্যেকের নিজের রাতের রং, নতুন পাশের মেনু আর ঘণ্টা, প্রধান রং (coral) সেটিং থেকে; আর দোকানের প্রতিটা লেখা অ্যাডমিন থেকে বা দোকানের পাতাতেই বদলানো, দুই ভাষায় (S02); ৭০টা অর্ডারের পরীক্ষা আর লাইভের আগের শেষ যাচাই এখন সার্ভারে এক চাপে চলে (S21, S19)। নতুন (#87): দোকানের প্রতিটা অংশ দেখানো-লুকানোর সব সুইচ এক তালিকায়, আর লেখা ও দেখানো-লুকানো অংশের A/B পরীক্ষা — দাম, অফার, পেমেন্ট বা ডেলিভারি কখনো নয় (S02); জার্নালে মন্তব্য, সোশ্যালের সাথে এক ক্যালেন্ডার আর কোন লেখা পড়ে কী বিক্রি হলো (S12)। নতুন (#89): অ্যাডমিনের Today, Orders, Products, Customers আর Delivery এখন নতুন Lumen চেহারায় (রাতের রংসহ, সব কাজ আগের মতো) (S00); হোম আর ক্যাটাগরি পাতায় নিজের সেকশন বসানো, কম্পিউটারের দুই পাশের খালি জায়গা, পুরো দোকানের চেহারা সেভ করে এক চাপে ফেরানো, ঝিলিকের গতি আর ব্যাগের ধাপের বক্স, আর "নতুন সুবিধা চাই" অনুরোধের পাতা (S02); মৌসুমি পাতা প্রতি বছর নিজে ফিরে আসা আর জার্নালের লেখার ছবি দোকানের নিজের ছবি থেকে (S12)। নতুন (#91): অ্যাডমিনের Marketing, Messages, Website, Support, Money, Reports, Settings আর Help — সব এখন নতুন Lumen চেহারায় (শুধু AI Center বাকি, S15 বন্ধ বলে) (S00); দোকানের পাতাতেই সরাসরি এডিট — আগে খসড়া, তারপর পাবলিশ, ফোনে ভাঙে কি না আগে পরীক্ষা, আর এক চাপে ফেরানো (S02 শেষ); জার্নালে নিজের বিজ্ঞাপন আর লেখার গতি-স্বাস্থ্যের পাতা (S12); কোন জেলায় বিজ্ঞাপন দিলে ভালো তার পরামর্শ আর Google Merchant Center-এর জন্য পণ্যের তালিকা (S13)। নতুন (#92): শুধু আগের কাজের উন্নতি — অ্যাডমিনের সব লেখা পড়ার মতো বড় (14 px) আর রঙ যথেষ্ট গাঢ়, কাস্টমারের তালিকা আর একজনের পাতা পাশাপাশি (S00); লেখা ও ভাষার পাতায় কোন লেখা কবে বদলেছে, সংখ্যা বা তারিখ থাকলে মনে করিয়ে দেওয়া, পাতার নিজের স্ন্যাপশট (S02); জার্নালে ট্যাগ, লেখকের পাতা, খোঁজা আর RSS, বিজ্ঞাপন কতবার দেখা হলো (S12); উৎসবের শেষ সময় এখন অর্ডারের দেরির হিসাব, রসিদ আর ব্যাগেও, মার্কেটিং রিপোর্টের CSV, ক্যালেন্ডারে মাসের ছক, Merchant feed-এ সাইজ-রং আলাদা আইটেম (S13)। নতুন (#93): আবারও শুধু আগের কাজের উন্নতি — ব্যাগের "সাইজ বেছে দিন" থেকে সরাসরি সাইজ খোঁজা, খোঁজার তালিকায় উপর-নিচ তীর, খোঁজার ফলাফলে ক্যাটাগরির মতো কার্ড, ডেমোর বাকি চোখ-সুইচের অংশ নিজের নিজের সুইচে, কম্বোর লিংক বদলালেও পুরোনো লিংক কাজ করে (S02, S03); "এখনই দেখুন"-এ অগ্রিমের অপেক্ষার অর্ডার, "২ সাইজ — দেখুন" আর উত্তরের অপেক্ষায় থাকা কাস্টমার, বাতিল অর্ডারের পাতায় কারণ, ধরে রাখা বা বাতিলের কারণ নিজে বেছে নিতে হয় (S05, S08, S22); অর্ডারের পাতা থেকে ইনভয়েস প্রিন্ট (S20); দামের নিচের সীমা নিয়ে আগাম লেখা আর ERP v6-এর কয়েকটা ফাঁক বন্ধ (S01, S05, S08, S16, S18)। নতুন (#94): আবারও শুধু আগের কাজের উন্নতি — পণ্যের পাতা থেকে "উপহার হিসেবে পাঠান", My account-এর অর্ডারে "লুক পূর্ণ করুন" আর ডেলিভারি হওয়া অর্ডারে "রিভিউ দিন", কম্বোর পাতায় মালিকের সেটের ছবি, সাইজ চার্টের লেখা সার্চ ইঞ্জিনের জন্য পাতায় (S02, S03, S04, S11); অ্যাডমিনে অর্ডারে নতুন লাইন যোগ বা সরানো, উপহারের তথ্য, ফেরত পার্সেলের কারণ বদলানো, কাস্টমার তালিকায় জেলা ফিল্টার, সার্চ আর শুরুর পাতার সেটিংস (S00, S05, S08, S14); ERP সুইচের রান আর গো-লাইভের আগে ERP পরীক্ষা, খরচের লাইনের আলাদা অনুমতি (S16, S19); বিজ্ঞাপনের ইভেন্ট ঠিক সময়ে, রোজকার কাজগুলো এখন প্রতিদিনই চলে (আগে প্রথম দিনের পরে থেমে যেত), ভুল পাসওয়ার্ডে শুধু সেই নেটওয়ার্ক আটকানোর সুইচ (S0A, S13, S18, S21)। নতুন (#96): আবারও শুধু আগের কাজের উন্নতি — পণ্যের পাতায় "প্রশ্ন করুন" আর রিভিউয়ের নিচে দোকানের উত্তর, পুরনো রিভিউ CSV থেকে আনা, কার্ড আর সেট বানানোয় "আপনার সাইজ" আগে থেকে চিহ্নিত, সেট বানানোর জায়গা হোম পেজ, ক্যাটাগরি আর পণ্যের পাতায় (S02, S03); অ্যাডমিনে সার্চের রিপোর্ট আর অর্ডারের রিপোর্ট, অর্ডার তালিকা আরও হালকা আর তাতে ডকুমেন্টের কলাম, বাছাই করা অর্ডারের CSV আর ইনভয়েস, প্রিন্টের ফিল্টার, হ্যান্ডওভারের অপেক্ষার লাইন আর কুরিয়ারের পিক-আপের সাথে মিলানো, "দোকানে ফেরত এসেছে", প্যাকিং কার্ড অর্ডারের পাতায় আর "এখনই দেখুন"-এ, জায়গা মার্জ আনডু (S05, S06, S08, S14); Steadfast আর Pathao-র নিজের স্ট্যাটাস কল সরাসরি নেওয়ার সুইচ (S08); কাস্টমারের পাঠানো ছবি আর ফাইল দোকানের নিজের স্টোরেজে কপি (S22); বইয়ের হিসাবের হ্যাশ সংস্করণ, স্টেটমেন্টের খরচ নিজে থেকে খরচের লাইনে (শুধু রেকর্ড), হ্যান্ডব্যাকে কোন পিস ফেরত এল তা টিক দেওয়া (S16)। সব নতুন সুবিধা শুরুতে বন্ধ। মোট ৬৪৪টা PR-এর মধ্যে ৫১৩টা মার্জ হয়েছে।

| Item | Now |
|---|---|
| Launch | **Launch 329/331** · **6 Nov (CN-036):** 26 Launch rows added — the new default admin look Lumen, PR [625–648](docs/stages/S00.md) (the owner wants it before go-live), and PR [652](docs/stages/S19.md#pr-652) (closed stages hidden by a switch) and 653 (redirect import from the old public sitemap); PR [649–651](docs/stages/S00.md) (three further looks) parked. every buildable Launch row is built (#70); PR [403](docs/stages/S19.md#pr-403) built in #71: the main domain's own switch, shipped closed (opening it on go-live day stays the owner's step, BLOCKED 25). Review round 1 (#71) and round 2 (#72) fixes merged. 1 left: PR [587](docs/stages/S19.md#pr-587) (the main-domain switch, after the CN-013 go-live gate). Batch 4 (#73): the 13 go-live gate fixes (SIM-F-004, 019, 025, 031, 041, 046, 047, 048, 050, 051, 052, 053, 054) as follow-ups on built Launch rows, with the review round 3 fixes folded in. The go-live gate journeys (#74, PR [414](docs/stages/S21.md#pr-414) follow-up): CN-013 phase 2 runs on new.extas.com.bd as the journeys workflow's `go-live-gate` group, ordering and changing nothing; of its 38 live checks 8 are proved by the journeys, 24 by CI tests and 6 need a real test order. The After-launch list runs meanwhile, by priority (CN-031): #73 built 30 rows (S06 9, S07 2, S08 5, S18 4, S21 10); S07 and S08 are done (S18 was done until CN-034 added PR [623](docs/stages/S18.md#pr-623)). The go-live gate test orders and customer 360° runs (#75, PR [414](docs/stages/S21.md#pr-414) follow-ups): two by-hand workflows on the preview, 18 test-order scenarios and one customer's whole life cycle; four customer gaps they found are fixed (PR [257](docs/stages/S13.md#pr-257), 144, 75, 425 follow-ups) and three more are filed as After-launch PR [622–624](docs/stages/README.md) (CN-034). Batch 5 (#78) built 43 After-launch rows (S06 5, S13 7, S14 5, S16 13, S20 8, S21 1, S22 4) and follow-ups on PR [417](docs/stages/S21.md#pr-417), 559 and 562; S06, S16, S20 and S21 are done; Launch is unchanged. Batch 6 (#80) built 19 After-launch rows (S13 3, S14 8, S22 8) and a follow-up on PR [293](docs/stages/S14.md#pr-293); S22 is done; Launch is unchanged. Batch 7 (#81) built 10 After-launch rows (S04 1, S13 5, S14 3, S18 1) and the CN-035 follow-ups; S04 and S18 are done. Batch 8 (#82) built 13 After-launch rows (S11 8, S13 4, S14 1); S11 and S14 are done; PR [587](docs/stages/S19.md#pr-587) is **prepared, waits for the owner's go-live word** (the read-only go-live check and the typed-word switch tool; the main-domain switch itself is not done), so Launch stays 304/305. Batch 9 (#83) built 14 After-launch rows (S12 8, S13 6); no stage completes; Launch is unchanged. Batch 10 (#84) built 11 After-launch rows (S12 5, S13 6) and a follow-up on PR [40](docs/stages/S02.md#pr-40) (the footer's payment marks); no stage completes; Launch is unchanged (304/331). Batch 11 (#85) built the Launch rows PR [652](docs/stages/S19.md#pr-652) (closed stages hidden by a switch) and 653 (redirect import from the old public sitemap) → **Launch 306/331**, plus S02 · PR [76](docs/stages/S02.md#pr-76), 77 (the page builder) and follow-ups on PR [378](docs/stages/S18.md#pr-378), 401 and 414. Batch 12 (#86) built the Lumen foundation PR [625–630](docs/stages/S00.md) (Launch rows: the theme layer, the shell, the shared patterns, Settings › Admin look) → **Launch 312/331**, plus S02 · PR [78](docs/stages/S02.md#pr-78), 79 (words and language, edit on the shop) and follow-ups on PR [414](docs/stages/S21.md#pr-414) (the 70-order simulation on the runner) and 393 (the acceptance run on the runner). Batch 13 (#87) adds no Launch row (S02 · PR [80](docs/stages/S02.md#pr-80), 81, 83 and S12 · PR [251–253](docs/stages/S12.md) are After launch) and carries the PR [626](docs/stages/S00.md#pr-626) follow-up that fixes batch 12's red device gate. Batch 14 (#89) builds the first Lumen sections PR [631–637](docs/stages/S00.md) (Launch rows: Today, Orders 1 and 2, Products 1 and 2, Customers, Delivery) → **Launch 319/331**, plus S02 · PR [595–599](docs/stages/S02.md) and S12 · PR [530](docs/stages/S12.md#pr-530), 547 (After launch) and two PR [414](docs/stages/S21.md#pr-414) follow-ups that fix the 7 failed rows of the first simulation run. Batch 15 (#91) builds the Lumen sections PR [638–645](docs/stages/S00.md), 647, 648 (Launch rows: Marketing 1 and 2, Website, Support, Money 1 and 2, Reports 1 and 2, Settings, Help) → **Launch 329/331**; left: PR [646](docs/stages/S00.md#pr-646) (the AI Center in Lumen: all AI, waits for S15, which is closed) and PR [587](docs/stages/S19.md#pr-587) (the owner's "go live"); plus S02 · PR [600](docs/stages/S02.md#pr-600) (S02 done), S12 · PR [591](docs/stages/S12.md#pr-591), 592, S13 · PR [569](docs/stages/S13.md#pr-569), 589 (After launch), the PR [633](docs/stages/S00.md#pr-633) and 634 follow-ups that make batch 14's smoke checks true for the read-only check account, and lane B's follow-ups. Batch 16 (#92) is follow-ups only (46 commits on built rows: the Lumen gaps, Words & language, the festive cut-off, the deep conversion feed, the journal, the Merchant feed); Launch unchanged. Batch 17 (#93) is follow-ups only too (38 commits on built rows: the shop's smaller gaps and the computer nav beside a long slogan, the order and Support queues, the invoice print, the selling-price floor lines and the ERP v6 gaps, the eye-toggle parts); Launch unchanged. Batch 18 (#94) is follow-ups only too (47 commits on built rows: the gift, look and review links in the shop, the admin order lines and gift, Start & search settings, the ERP switch runs and acceptance gate, the tracking sweep and purchase timing, the daily jobs' run keys, the network lockout switch); Launch unchanged. Batch 19 (#96) is follow-ups only too (46 commits on built rows: product questions and review replies, "Your size" on cards and in the set builder, the search and order reports, the lighter order list with documents and bulk files, the courier webhooks switch, the handover check, packing cards, customer file copies, versioned books hashes and statement costs); Launch unchanged |
| Stages | **S0A 12/12 · S00 42/43 · S01 23/23 · S09 19/19** (wave 1; S00 reopened by CN-036) · **S10 12/12** · **S02 58/58** · **S03 22/22** · **S06 33/33** (wave 2) · **S04 42/42** · **S05 21/21** · **S07 10/10** · **S08 26/26** (wave 3) · **S11 22/22** · **S12 20/22** · **S13 34/35** (wave 5) · **S16 22/22** · **S21 14/14** · **S15 7/48** (wave 6; reopened by CN-039) · **S17 1/24** · **S18 15/15** · **S19 18/19** (wave 8) · **S14 24/24** · **S20 9/9** · **S22 14/14** (wave 4) · **S23 4/7** (reopened, CN-039) · **S24 1/38** (wave 7; reopened by CN-039) · **S25 3/10** (wave 7; reopened by CN-039) · total **528/644** active PRs |
| Open / closed | **11 Nov (CN-039 update, after PR [304–310](docs/stages/S15.md), 437–440, 444, 481, 482 and 483):** CN-039 reopened S15, S23, S24, S25 (S17 stays closed). Open stages 620 active PRs · 527 built · **93 to build** (S00 1 — PR [646](docs/stages/S00.md#pr-646), the AI Center in Lumen; S12 2 — PR [529](docs/stages/S12.md#pr-529), 593; S13 1 — PR [548](docs/stages/S13.md#pr-548); S15 41 — PR [304–310](docs/stages/S15.md) built, 311–341, 506, 577–585 remain; S19 1 — PR [587](docs/stages/S19.md#pr-587), the switch on the owner's "go live"; S23 3 (437–440 built), S24 37 (444 built), S25 7 (481, 482, 483 built)) · **closed:** S17 — 24 active PRs, 1 built (PR [362](docs/stages/S17.md#pr-362), kept), **23 closed** · **parked:** S26, S27 — 9. Half-built parts of a reopened-but-unfinished stage stay hidden by a switch (PR [652](docs/stages/S19.md#pr-652)) until that stage is done. বাংলায়: S15, S23, S24, S25 আবার খোলা (CN-039); S17 বন্ধ আছে। |
| Live on the preview | Bengali progress page (`/status`), admin sign-in, Keys & connections, products (list, new, edit, publish queue, import from a link, audit, back-in-stock), size charts, stock and ERP pages (practice ERP until the owner adds the ERP keys), Smart Rules (`/admin/rules`, notices and pop-ups); since 31 Oct 17:25 (#68) also Website › SEO › Redirects & 404, Settings › Sign-in & security and Settings › System › Backups; since 31 Oct 19:14 (#69) also Settings › Store details, Privacy & data, Policies & texts, Cloudflare protection, Settings › System › Go-live (restore, first-week watch), Reports › Site health and Money › Overview; since 31 Oct 22:46 (#70) also Website › SEO (collection pages, sitemaps, robots.txt, photo descriptions, Search Console and Bing, real visitors' speed, language pairs, Bengali pages), Marketing › Tracking, Money › Cost ledger, Expenses, Costs & fees and Month-end, Reports › Site health › Customer problems and journeys, and the Support channels; since 1 Nov 02:36 (#71) also the review round 1 fixes (Set delivery area on an order, test payments off by default, staging always on its own locked block); since 1 Nov 04:21 (#72) also the review round 2 fixes (`/status` on the preview host only, the unpaid hold's end, the Caddy body limits); since 1 Nov 10:43 (#73) also batch 4 (Refunds & wallet, the Wallet tab, Fraud & RTO, Today's digest, Calls to make, Stopped by the engine, Decisions & learning, Delivery & RTO, Rider issues, Delivery › Settings, Eid order-by dates, the Site manual, Speed, Smoke runs, Run history, Fixes to approve, Checklist audit); since 1 Nov 16:37 (#75) also "Cancel this order" on the customer's order page, the UTM tags kept on the order and Bengali digits in the inbox search; since 1 Nov 19:02 (#76) also the go-live gate's own practice payments. #77 (the gate runs' safety net) and batch 5 (#78: Reports › Flag outcomes, Sales by area and Team; Money › Profit & loss, Profit by group and by channel, VAT, the Costs report; Orders › Packing print run, picking list, handover and invoice designs; Marketing › Landing pages, Templates, Campaigns and Ad platforms; Customers › Segments and Customer settings, the Journey tab; Messages › Automations and E-mail; Help & Build › Build progress, Reported problems, Blueprint & files; the Support chat's Same person, Customer, Products and Chat bag cards — every new switch off) are live since the 6 Nov 08:27 deploy. Batch 6 (#80: Marketing › Audiences; Customers › Loyalty & wallet, tags and notes, export; Messages › Campaigns; Products › Reviews; My account › Rewards and Birthday; Support tickets, AI drafts, follow-ups, block list, the support app, Support analytics, escalation and desk hours; the shop's Messenger button — every new switch off) is live since the 6 Nov 08:27 deploy. Batch 7 (#81: Reports › Customers; the customer history and grade on Orders › To confirm; customer grades on Customer settings, the list and the customer page; Marketing › Ad platforms' spend import, dollar rate, cost per order and alerts, campaign controls and the Growth agent; "Buy again" on the shop and its card on Customer settings; "Your data" on My account › Profile; the go-live page in "Needed before" and "Soon after" groups — every new switch off) is live since the 6 Nov 08:27 deploy. Batch 8 (#82: Customers › Import old customers and the customer page's "Old shop orders"; Website › SEO's summary for AI assistants (`/llms.txt`), links between pages, SEO health and the Organic report; review and FAQ data for search engines; Marketing › Ad platforms › Creative briefs, coupon shapes, links and single-use codes, Marketing › Referrals and the invite code on My account › For you — every new switch off) is live since the 6 Nov 08:27 deploy. Batch 9 (#83: Website › Blog & journal with the editor, Categories & authors, Topic plan, Brief, AI first draft and Calendar, and the shop's journal at `/journal`; Orders › Incomplete orders with the checkout follow-up and left-bag cards; Messages › Campaigns' "a campaign to a group"; Marketing › YouTube and Marketing › SEO outreach — every new switch off) is live since the 6 Nov 12:57 deploy. Batch 10 (#84: Marketing › Landing pages › Seasonal pages and the shop's seasonal pages at `/collections/<link>`; "Ways to pay" at `/help/payment` and its tab on Settings › Policies & texts; help pages found in search by their live rules; the journal's search-engine kind, article data, sitemap and "Read next"; Website › Blog & journal › Performance; Marketing › Seasonal home, Festive cut-off, Calendar and Report; Marketing › Ad platforms › New campaigns; Marketing › Tracking's deep conversion feed card; the footer's payment marks only for the methods the checkout offers — every new switch off) is live since the 6 Nov 16:20 deploy. Batch 11 (#85: Website › Page layouts for the home, category, product and bag pages; the closed stages' switch, so the AI Center leaves the menu; quiet 204 for over-limit browser reports in enforce; the redirect-import workflow) is live since the 6 Nov 17:03 deploy. Batch 12 (#86: the Lumen admin look's foundation — light as shipped, the moon for dark per person, the floating sidebar, glass top bar, bell panel and phone bottom bar, Settings › Admin look; Website › Words & language and "Edit on the shop", off as shipped; the simulation and acceptance workflows and their evidence on the go-live page) is live since the 6 Nov 21:45 deploy. Batch 13 (#87: Website › More › Eye-toggles, Reports › More › Experiments, the journal's Comments, Shared calendar and What articles sold, every switch off as shipped; and the sidebar label fix that turned batch 12's device gate green) is live since the same deploy (smoke test 21:26, 480 page views, 0 failed, 19 minutes; its first deploy at 20:30 rolled back because the smoke test ran past its 30-minute limit — the PR [4](docs/stages/S0A.md#pr-4) follow-up times every page view and allows 45). Batch 14 (#89: Today, Orders, Products, Customers and Delivery in the Lumen look; Website › Page layouts with the owner's own sections, Side canvas and Launch default; Settings › Shimmer; Products › Combos › Bag tier box; Help & Build › Feature requests; seasonal pages that come back each year; the journal's main photo from the shop's own pictures — every new switch off; and the simulation fixes) is not live yet: its deploys at 23:50 (`5f36db1`) and 7 Nov 00:56 (`09b0afd`, with the PR [632](docs/stages/S00.md#pr-632) follow-up) rolled back by themselves, because smoke checks of PR [632](docs/stages/S00.md#pr-632), then 633 and 634, waited for marks the server's read-only check account never sees (every page loaded; 504 page views, 0 failed). Batch 15 (#91: Marketing, Messages, Website, Support, Money, Reports, Settings and Help in the Lumen look; Website › More › On-page edit and the owner's bar on the shop; Website › Blog & journal › House ads and Content pipeline; Marketing › Where to advertise and Merchant feed; the shop's own 404 page drawn on the server; the closed-stage notice — every new switch off) carries the PR [633](docs/stages/S00.md#pr-633) and 634 fixes and a guard test; **batches 14 and 15 are live since the 7 Nov 02:52 deploy of `6309ce1`** (smoke 516 page views, 0 failed; the simulation at 02:52 PASS — 42 passed, 0 failed, 28 skipped; the go-live check at 03:06 READY except the owner's steps). Batch 16 (#92: follow-ups only — the admin's text at 14 px and AA contrast for every accent swatch, Customers as list + detail, Words & language's "last changed", the admin's words and the number-or-date check, "Snapshots of this page", the seasonal-home bell notes, the festive cut-off in the late flag, receipt and bag, the marketing report's CSV and the calendar's month grid, the journal's tags, author pages, search and RSS, house ad views, the Merchant feed's variants, struck price, gender and age group, the deep feed's refund on a return and shared event ids — every new switch off) **is live since the 7 Nov 05:51 deploy of `8fa0474`** (smoke 518 page views, 0 failed). Batch 17 (#93: follow-ups only — "Help me pick my size" opens Find My Size, ↑ / ↓ through the search suggestions, the search results with the cards' back view and Quick add, the slim bar's rating, size words that take two lines, a renamed combo link that forwards, the bag tier box to its set builder; the eye-toggle parts behind their own switches; "Needs you now" rows for orders awaiting their advance, "2 sizes — check" and customers waiting in Support; the order timers on the worker; Print invoice on the order page; a chat's subject and order link; "Why it was cancelled" on his order page; Hold and Cancel start on "Pick a reason"; the floor lines in the simulator, the offer editor and the ERP import; the ERP's replay refusal and held-orders alert — every new switch off) **is live since the 7 Nov 08:58 deploy of `296dbff`** (smoke 518 page views, 0 failed). Batch 18 (#94: follow-ups only — "Send as a gift" on the product page; "Complete your look" on his order page; "Rate & review" on delivered orders with the photo reward's figure; the owner's set photo on the combo page; the size chart text in the product page's HTML; Bengali "coming soon" on the language switch while the Bengali gate is on; "Add a line" / "Remove" and the gift on the admin order screen; "Change the reason" on a returned parcel; a district filter on Customers; Settings › More › Start & search with the palette's recent pages and key jumps; the ERP link page's switch runs, the kept-at-switch row, the ERP acceptance line on /status and its go-live row; the daily cost lines' own permission; the hourly tracking sweep and the purchase event at the right time; the daily audience, ad spend and money report runs every day again; the network lockout and problem re-open switches — every new switch off) **is live since the 7 Nov 12:42 deploy of `6851b27`** (with the #95 no-transform fix; smoke 534 page views, 0 failed). Batch 19 (#96: follow-ups only — "Ask a question" on the product page and the shop's reply under a review; Products › Reviews › Questions and the review CSV import; "Your size" from his own orders, on Quick add and in the set builder, and the set builder's home row, category banner and product page line; Reports › Searches and Reports › Orders; popular search words from real searches; the lighter order list with its Documents column, Export and Print invoices for ticked orders; the print run's filters; the courier's own steps in "What happened", the shared location on the order page and sticker, the lost Pathao booking closed from the panel, "Back at the shop"; the handover waiting line and the pick-up check; packing cards on the order page and in "Needs you now"; undoing a place merge; Customer settings cards; the Server page's cache card; the courier webhooks; the seasonal look's preview for staff; a customer's chat files copied to the shop's storage; the exchange retry and its settings card; the hand-back piece ticks, versioned books hashes and statement cost entries — every new switch off) goes live with the next deploy |
| Last deploy | 7 Nov 2026, 12:42 (Dhaka) · commit `6851b27` (batch 18, #94, with the #95 fix) · **success**, smoke test 534 page views OK (signed out and as the admin, phone and desktop; report 12:51). Batch 19 (#96) and batch 20 (#97) go live with the next deploy. Before: 7 Nov 2026, 11:31 (Dhaka) · commit `31c0299` (batch 18, #94) · **failed, rolled back**: Cloudflare injected its Web Analytics beacon into every page and the runner could not load it (518 of 524 smoke views); fixed in #95 (the preview's pages say no-transform). Before: 7 Nov 2026, 08:58 (Dhaka) · commit `296dbff` (batch 17, #93) · **success**, smoke test 518 page views OK (signed out and as the admin, phone and desktop; report 09:07). Before: 7 Nov 2026, 05:51 (Dhaka) · commit `8fa0474` (batch 16, #92) · **success**, smoke test 518 page views OK (signed out and as the admin, phone and desktop; report 05:59). Before: 7 Nov 2026, 02:52 (Dhaka) · commit `6309ce1` (batch 15, #91, with batch 14) · **success**, smoke test 516 page views OK (signed out and as the admin, phone and desktop); then the simulation (02:52, PASS 42/0/28) and the go-live check (03:06, READY except the owner's steps, 6/16). Before: 6 Nov 2026, 21:45 (Dhaka) · commit `4689df6` (the PR [4](docs/stages/S0A.md#pr-4) follow-up, #88, on top of batch 13) · **success**, smoke test 480 page views OK (started 21:26, 19 minutes); batches 5–13 (#78–#87) are live (batch 10 since 16:20, batch 11 since 17:03, batches 12 and 13 since 21:45); the 20:30 deploy of `4e537e7` (batch 13) rolled back — its smoke test ran past the 30-minute limit; the PR [4](docs/stages/S0A.md#pr-4) follow-up times every page view, logs a slow one at once and allows 45 minutes. The batch 14 deploys at 23:50 (`5f36db1`) and 7 Nov 00:56 (`09b0afd`, the PR [632](docs/stages/S00.md#pr-632) follow-up) rolled back (smoke checks of PR [632](docs/stages/S00.md#pr-632), then 633 and 634, timed out for the read-only check account; the run itself took about 9.5 minutes); batch 15 (#91) carries the fixes, and batches 14 and 15 go live with the next deploy |
| Smoke test | Every built page, phone and desktop, as a customer and as the admin, after every deploy and every night: [latest result](docs/reports/smoke/latest/README.md) (CN-016) |
| Waiting on the owner | CN-036 (6 Nov) adds no question: every new switch ships off, policy numbers are backend settings, and only the final "go live" (BLOCKED 25) and his own go-live steps (Cloudflare Origin certificate, SSL Full strict, his own 2FA, runbook sign-off, a real iPhone and Android test, Search Console DNS) stay his. 15 items open in [`BLOCKED.md`](BLOCKED.md) (13, 14, 15, 17–28); none stops the build ([table below](#what-waits-on-the-owner)). Batch 5 (#78), batch 6 (#80), batch 7 (#81), batch 8 (#82), batch 9 (#83), batch 10 (#84), batch 11 (#85), batch 12 (#86), batch 13 (#87), batch 14 (#89), batch 15 (#91), batch 16 (#92), batch 17 (#93), batch 18 (#94), batch 19 (#96) and batch 20 (#97) add none (batch 6: every new switch off; the Messenger Page name, desk hours and the Telegram bot are owner data typed in later; batch 7: the ad controls and the growth agent ship off with practice copies only, and every budget raise waits for his approval; batch 8: every coupon, code and referral ships off with no amount, switching one on is his OK, and PR [587](docs/stages/S19.md#pr-587)'s main-domain switch waits for his go-live word, BLOCKED 25): its new switches ship off and the VAT rates, ad keys and courier fraud-check keys are the owner's own data, typed in later. 28 whether a repeat refuser's delivery-charge advance is given back when his parcel comes back, or kept (today kept, `payments.refunds.rtoAdvance`; a money decision; PR [163](docs/stages/S06.md#pr-163), 542). 27 whether typing a phone number at checkout may keep showing that customer's saved area, or only after the SMS code (review round 1; PR [555](docs/stages/S06.md#pr-555)). 26 whether old customer-problem records may ever be cleaned up (deleting data needs his OK; PR [423](docs/stages/S21.md#pr-423)). For go-live: 22 lock the Blob backups (cannot be undone, a cost; PR [385](docs/stages/S18.md#pr-385)), 23 connect Azure Blob and Google Drive (PR [391](docs/stages/S19.md#pr-391)), 24 type his own store data (PR [399](docs/stages/S19.md#pr-399)), 25 the day and time to switch extas.com.bd (PR [403](docs/stages/S19.md#pr-403)). 21 asks whether an outside security expert (a cost) checks the site before real money (PR [381](docs/stages/S18.md#pr-381)); 18 and 19 are money questions from follow-ups 39 (a set's price in the free-delivery limit) and 121 (the band charge in the COD limit); nothing changes until he says so |
| Next | **Stopped at the go-live gate (CN-037), 7 Nov 2026.** Every MUST item (3/3) is built, merged (PR [#96](https://github.com/mehadih32/Extas-Ecommerce-Site/pull/96), [#97](https://github.com/mehadih32/Extas-Ecommerce-Site/pull/97)) and gate-verified live on new.extas.com.bd: CI, deploy (blue/green + smoke, 546 page views, 0 failed), device gate (390/768/1366/1920, light/dark, en/bn), journeys, the 70-order simulation and acceptance are all green. `golive-check`: 7/17 green, 10/17 red and every one of the 10 is purely the owner's own remaining step (Cloudflare origin cert + SSL strict, Google Search Console, the main-domain indexing switch held off on purpose until go-live day, one staff member's 2FA, the runbook read, a person's press on the QA gate/acceptance/simulation confirmations, a real iPhone and Android test) — no code is left to build for any of them. **Ready for go-live from the project's side: Yes.** Full detail: [`PROGRESS.md`](PROGRESS.md)'s "Stopped at the go-live gate" row. **As of now this session's own automation (30-minute check-ins, usage-limit auto-continue, the CN-031 never-idle rule) is switched off** — no new PR, lane or builder starts until the owner types "go live" (switches the domain) or asks to resume the CAN-wait / After-launch / closed-stage work (switches the automation back on, CN-037 Step 6). ~~**Batch 20 (#97) merged: every CN-037 go-live MUST item is now built, merged and gate-verified** (the journey-page 320 px fix, the phone bottom bar fix, both confirmed with the full device gate signed in, 0 fails), plus 12 follow-ups from the three lanes. Next: the full check set CN-037 asks for (smoke, device gate at 390/768/1366/1920, journeys, the 70-order simulation, acceptance, go-live check) on new.extas.com.bd after the next deploy; once green, `PROGRESS.md` gets "Stopped at the go-live gate (CN-037)" and the automation stops itself until the owner's word.~~ ~~**CN-037 (7 Nov, owner): finish only what go-live needs, then stop and wait for "go live".** MUST before go-live: 2 (both phone-width findings, fixed in batch 20); CAN wait: 676 (Follow-ups, After-launch, closed/parked stages, BLOCKED.md) — [`docs/reports/2026-11-07-golive-must-list.md`](docs/reports/2026-11-07-golive-must-list.md). The Follow-ups table in PROGRESS.md takes no new rows; a new idea goes in [`docs/after-golive-notes.md`](docs/after-golive-notes.md). Batch 20 finishes, then the full check set runs again; once green, the automation stops itself until the owner's word.~~ **Now (after batch 19):** every buildable row of the open stages is built; left are PR [646](docs/stages/S00.md#pr-646), 529, 593 and 548 (AI work, they wait for S15, which is closed) and PR [587](docs/stages/S19.md#pr-587) (the owner's "go live"). Next come the open follow-ups in [`PROGRESS.md`](PROGRESS.md) (714, 715, 718, 719, 724, 726 and the older ones; batches 17, 18 and 19 noted on each open row whether it needs the owner, its own register row or a design), then the After-launch list. **After the next deploy (batch 19):** the smoke test, then `simulation.yml` and `golive-check.yml` again. Batch 18 deployed at 12:42 with the #95 fix (smoke 534 OK). ~~**After the next deploy (batch 18):** the smoke test, then `simulation.yml` and `golive-check.yml` again.~~ Batch 17 deployed at 08:58 (smoke 518 OK). ~~**After the next deploy (batch 17):** the smoke test, then `simulation.yml` and `golive-check.yml` again.~~ Batch 16 deployed at 05:51 (smoke 518 OK). ~~**After the next deploy (batch 16):** the smoke test, then `simulation.yml` and `golive-check.yml` again.~~ Done after the 7 Nov 02:52 deploy (batches 14 and 15): the simulation PASS (42 passed, 0 failed, 28 skipped — the 7 rows that failed at 21:45 pass) and the go-live check READY except the owner's steps (6/16). ~~**After the next deploy (batches 14 and 15):** `simulation.yml` again (orders all, allow_cod false) — the two PR [414](docs/stages/S21.md#pr-414) follow-ups fix the 7 failed rows of the 21:45 run (6 × IN_REVIEW, row 15) — then `golive-check.yml`.~~ Done after batch 13's deploy: the redirect import (45 old links, off until go-live), request limits in enforce, the first simulation run (35 pass, 7 fail, 28 skipped), the acceptance run (21:59, all 4 parts passed) and the go-live check (6 of 16, the rest are the owner's steps). **CN-036 update (6 Nov, 14:55):** the Lumen foundation and S02 in parallel → S12 → S13 → the other open stages by the [LAUNCH-TRACK](docs/LAUNCH-TRACK.md) priority; S15, S17, S23, S24, S25, S26, S27 closed until the owner says so. **CN-036 (6 Nov, 08:31):** running work finishes first; then Lane A builds the admin look Lumen (625–630 alone, then 631–648 section by section), Lane B the S02 storefront, Lane C the go-live gate (652, 653, rate limits, full gate, simulation); go-live on the owner's "go live" once the look is merged and the check is green; then ~~S12 → S13 → S15 → S25 → S24; S17, S23, S26, S27 closed~~ (replaced at 14:55). Size report: [`docs/reports/2026-11-06-admin-look-size.md`](docs/reports/2026-11-06-admin-look-size.md). Earlier: The CN-022 foundation items (worker PR [6](docs/stages/S0A.md#pr-6), ERP webhook PR [196](docs/stages/S09.md#pr-196), one "Sales" KPI PR [155](docs/stages/S05.md#pr-155), append-only audit log PR [139](docs/stages/S05.md#pr-139)) are live (deploy 23 Oct 17:35); the back-office follow-ups 80, 82, 92, 93, 54, 16 and 14 (ERP webhook through the preview gate, worker on rollback, KPI report views, band charge in the rules engine, shortage cards, hardcode-guard cases) go live with the next deploy; the new 14-section admin shell (PR 12: sidebar, tabs, search palette, guide panel, the Dashboard with Delivered sales / Ordered value and Needs you now, role start pages; with the V12.4 look, Settings › Admin look and the V12.4 Dashboard on real data, CN-025) is built and goes live with the next deploy, and the first S05 order screens sit on it (PR [140](docs/stages/S05.md#pr-140), 141, 152, 154: the order list with its views and search, one order with every command, the To confirm call queue, and Confirm / Hold / Release on many orders at once); next the duplicate review, packing and order settings tabs and the rest of S05 (PR [142](docs/stages/S05.md#pr-142), 143, 146, 148–151); S02 continues (templates T2 / T3, Find my size, its learning and the product-page reviews built: PR [50–52](docs/stages/S02.md), 58, 59, 65; next PR [67](docs/stages/S02.md#pr-67) …; the reviews queue and the size report go on the new admin shell, follow-ups 230, 231); S04 after checkout: customer accounts built (PR [129–135](docs/stages/S04.md), 137; the live SMS sender waits for its key); "Add to this parcel", "Complete your look", the address rules and gift mode built (PR [127](docs/stages/S04.md#pr-127), 128, 561, 563, 565, 605); next PR [566](docs/stages/S04.md#pr-566) and 606; refunds and returns come with S07 and S08 (BACKEND-ARCHITECTURE, approved in CN-022); S03: the shop's combo pages are built (PR [91–95](docs/stages/S03.md), 102, 103: the combo page, the sets landing page, the set offer on the product page); next the set builder (PR [98](docs/stages/S03.md#pr-98), 100) and the templates 572–574, 576 |
| Last update | 7 Nov 2026 |

The truth for these numbers is the **Progress** line and the **Build status** table of
[`docs/MASTER-REGISTER.md`](docs/MASTER-REGISTER.md#build-status). Keep the "Stages" row above identical to it.

### All 28 stages

States: **Done** = every PR merged · **In progress** = work started · **Not started** · **Parked** = waits for the
owner's word (handover pack) · **Closed (owner, 6 Nov)** = closed until the owner says so (CN-036 update); built parts stay. Waves are the build order from Blueprint
[E3](docs/BLUEPRINT.md#e3-order-of-work); 2–3 agents build at once.

| Stage | Name | Wave | PR numbers | Done / total | State |
|---|---|:-:|---|:-:|---|
| [S0A](docs/stages/S0A.md) | [Server foundation](docs/stages/S0A.md) | [0](docs/stages/README.md#wave-0) | [1–10](docs/stages/S0A.md), [601](docs/stages/S0A.md#pr-601), [604](docs/stages/S0A.md#pr-604) | 12 / 12 | **Done** (all live on the server) |
| [S00](docs/stages/S00.md) | [Foundation — repo, CI, schema, auth, settings framework](docs/stages/S00.md) | [1](docs/stages/README.md#wave-1) | [11–18](docs/stages/S00.md), [491–496](docs/stages/S00.md), [500](docs/stages/S00.md#pr-500), [508–510](docs/stages/S00.md), [603](docs/stages/S00.md#pr-603), [625–651](docs/stages/S00.md) | 42 / 43 | In progress (CN-036: the admin look Lumen — foundation 625–630 and sections 631–645, 647, 648 built; 646, the AI Center, waits for S15; 649–651 wait in the parking lot) |
| [S01](docs/stages/S01.md) | [Catalog, media & images](docs/stages/S01.md) | [1](docs/stages/README.md#wave-1) | [19–39](docs/stages/S01.md), [590](docs/stages/S01.md#pr-590), [609](docs/stages/S01.md#pr-609) | 23 / 23 | **Done** |
| [S02](docs/stages/S02.md) | [Storefront](docs/stages/S02.md) | [2](docs/stages/README.md#wave-2) | [40–88](docs/stages/S02.md), [501](docs/stages/S02.md#pr-501), [503](docs/stages/S02.md#pr-503), [595–600](docs/stages/S02.md), [602](docs/stages/S02.md#pr-602) | 58 / 58 | **Done** |
| [S03](docs/stages/S03.md) | [Combo & bundles](docs/stages/S03.md) | [2](docs/stages/README.md#wave-2) | [89–104](docs/stages/S03.md), [571–576](docs/stages/S03.md) | 22 / 22 | **Done** |
| [S04](docs/stages/S04.md) | [Cart, checkout, accounts](docs/stages/S04.md) | [3](docs/stages/README.md#wave-3) | [105–137](docs/stages/S04.md), [558](docs/stages/S04.md#pr-558), [560](docs/stages/S04.md#pr-560), [561](docs/stages/S04.md#pr-561), [563](docs/stages/S04.md#pr-563), [565](docs/stages/S04.md#pr-565), [566](docs/stages/S04.md#pr-566), [605](docs/stages/S04.md#pr-605), [606](docs/stages/S04.md#pr-606), [622](docs/stages/S04.md#pr-622) | 42 / 42 | **Done** |
| [S05](docs/stages/S05.md) | [Order management](docs/stages/S05.md) | [3](docs/stages/README.md#wave-3) | [138–155](docs/stages/S05.md), [541](docs/stages/S05.md#pr-541), [546](docs/stages/S05.md#pr-546), [610](docs/stages/S05.md#pr-610) | 21 / 21 | **Done** |
| [S06](docs/stages/S06.md) | [Fraud & location](docs/stages/S06.md) | [4](docs/stages/README.md#wave-4) | [156–164](docs/stages/S06.md), [502](docs/stages/S06.md#pr-502), [519–524](docs/stages/S06.md), [540](docs/stages/S06.md#pr-540), [542–545](docs/stages/S06.md), [549–557](docs/stages/S06.md), [559](docs/stages/S06.md#pr-559), [562](docs/stages/S06.md#pr-562), [567](docs/stages/S06.md#pr-567) | 33 / 33 | **Done** |
| [S07](docs/stages/S07.md) | [Payments & wallet](docs/stages/S07.md) | [3](docs/stages/README.md#wave-3) | [165–174](docs/stages/S07.md) | 10 / 10 | **Done** |
| [S08](docs/stages/S08.md) | [Courier, returns, exchange](docs/stages/S08.md) | [3](docs/stages/README.md#wave-3) | [175–193](docs/stages/S08.md), [525–526](docs/stages/S08.md), [564](docs/stages/S08.md#pr-564), [611–614](docs/stages/S08.md) | 26 / 26 | **Done** |
| [S09](docs/stages/S09.md) | [Inventory & ERP sync](docs/stages/S09.md) | [1](docs/stages/README.md#wave-1) | [194–207](docs/stages/S09.md), [497–499](docs/stages/S09.md), [607–608](docs/stages/S09.md) | 19 / 19 | **Done** |
| [S10](docs/stages/S10.md) | [Smart Rules](docs/stages/S10.md) | [2](docs/stages/README.md#wave-2) | [208–219](docs/stages/S10.md) | 12 / 12 | **Done** |
| [S11](docs/stages/S11.md) | [SEO engine](docs/stages/S11.md) | [5](docs/stages/README.md#wave-5) | [220–238](docs/stages/S11.md), [527](docs/stages/S11.md#pr-527), [586](docs/stages/S11.md#pr-586), [588](docs/stages/S11.md#pr-588) | 22 / 22 | **Done** |
| [S12](docs/stages/S12.md) | [Content & blog](docs/stages/S12.md) | [5](docs/stages/README.md#wave-5) | [239–253](docs/stages/S12.md), [528–530](docs/stages/S12.md), [547](docs/stages/S12.md#pr-547), [591–593](docs/stages/S12.md) | 20 / 22 | In progress (529, 593: AI writing, now that S15 is reopened) |
| [S13](docs/stages/S13.md) | [Marketing & ads](docs/stages/S13.md) | [5](docs/stages/README.md#wave-5) | [254–283](docs/stages/S13.md), [531–532](docs/stages/S13.md), [548](docs/stages/S13.md#pr-548), [569](docs/stages/S13.md#pr-569), [589](docs/stages/S13.md#pr-589) | 34 / 35 | In progress (548: AI study of outside pages, now that S15 is reopened) |
| [S14](docs/stages/S14.md) | [CRM & customers](docs/stages/S14.md) | [4](docs/stages/README.md#wave-4) | [284–303](docs/stages/S14.md), [505](docs/stages/S14.md#pr-505), [533–535](docs/stages/S14.md) | 24 / 24 | **Done** |
| [S15](docs/stages/S15.md) | [AI 360 Control Room](docs/stages/S15.md) | [6](docs/stages/README.md#wave-6) | [304–341](docs/stages/S15.md), [506](docs/stages/S15.md#pr-506), [577–585](docs/stages/S15.md) | 7 / 48 | In progress — **reopened (owner, 11 Nov; CN-039)**; hidden behind `stages.closedShown` until finished |
| [S16](docs/stages/S16.md) | [Finance, costs & reports](docs/stages/S16.md) | [6](docs/stages/README.md#wave-6) | [342–355](docs/stages/S16.md), [504](docs/stages/S16.md#pr-504), [536–537](docs/stages/S16.md), [568](docs/stages/S16.md#pr-568), [615–618](docs/stages/S16.md) | 22 / 22 | **Done** |
| [S17](docs/stages/S17.md) | [Multi-store](docs/stages/S17.md) | [8](docs/stages/README.md#wave-8) | [356–377](docs/stages/S17.md), [511–512](docs/stages/S17.md) | 1 / 24 | **Closed (owner, 6 Nov)** — 1 built part stays (PR 362) |
| [S18](docs/stages/S18.md) | [Compliance, security, manual](docs/stages/S18.md) | [8](docs/stages/README.md#wave-8) | [378–390](docs/stages/S18.md), [620](docs/stages/S18.md#pr-620), [623](docs/stages/S18.md#pr-623) | 15 / 15 | **Done** |
| [S19](docs/stages/S19.md) | [Deploy, backup, go-live](docs/stages/S19.md) | [8](docs/stages/README.md#wave-8) | [391–403](docs/stages/S19.md), [507](docs/stages/S19.md#pr-507), [587](docs/stages/S19.md#pr-587), [619](docs/stages/S19.md#pr-619), [621](docs/stages/S19.md#pr-621), [652–653](docs/stages/S19.md) | 18 / 19 | In progress |
| [S20](docs/stages/S20.md) | [Fulfilment & documents](docs/stages/S20.md) | [4](docs/stages/README.md#wave-4) | [404–412](docs/stages/S20.md) | 9 / 9 | **Done** |
| [S21](docs/stages/S21.md) | [Site Health & Audit](docs/stages/S21.md) | [6](docs/stages/README.md#wave-6) | [413–424](docs/stages/S21.md), [570](docs/stages/S21.md#pr-570), [594](docs/stages/S21.md#pr-594) | 14 / 14 | **Done** |
| [S22](docs/stages/S22.md) | [Support (all-in-one)](docs/stages/S22.md) | [4](docs/stages/README.md#wave-4) | [425–436](docs/stages/S22.md), [538](docs/stages/S22.md#pr-538), [624](docs/stages/S22.md#pr-624) | 14 / 14 | **Done** |
| [S23](docs/stages/S23.md) | [Social & content studio](docs/stages/S23.md) | [5](docs/stages/README.md#wave-5) | [437–443](docs/stages/S23.md) | 4 / 7 | In progress — **reopened (owner, 11 Nov; CN-039)** |
| [S24](docs/stages/S24.md) | [Virtual Photoshoot Studio](docs/stages/S24.md) | [7](docs/stages/README.md#wave-7) | [444–480](docs/stages/S24.md), [539](docs/stages/S24.md#pr-539) | 1 / 38 | In progress — **reopened (owner, 11 Nov; CN-039)** |
| [S25](docs/stages/S25.md) | [Video & Campaign Creative Studio](docs/stages/S25.md) | [7](docs/stages/README.md#wave-7) | [481–490](docs/stages/S25.md) | 3 / 10 | In progress — **reopened (owner, 11 Nov; CN-039)** |
| [S26](docs/stages/S26.md) | [Installation, documentation & distribution](docs/stages/S26.md) | [—](docs/stages/README.md#parked) | [513–518](docs/stages/S26.md) | — / 6 | **Parked** (handover pack) · **Closed (owner, 6 Nov)** |
| [S27](docs/stages/S27.md) | [No-ERP stock module](docs/stages/S27.md) | [—](docs/stages/README.md#parked) | not numbered yet | — | **Parked** (handover pack) · **Closed (owner, 6 Nov)** |
| | **Total** | | **653 PRs** | **528 / 644 active** | 9 parked · open stages 93 to build · closed stage (S17) 23 |

> যেকোনো স্টেজ বা PR নম্বরে ক্লিক করলে তার বাংলা সারাংশ আর পুরো বিস্তারিত দেখবেন — [সব স্টেজ আর wave এক পাতায়](docs/stages/README.md)।

### What waits on the owner

From [`BLOCKED.md`](BLOCKED.md) (the Bengali questions live there). Every open item has a safe default, so the build
never stops. Owner data (delivery charges, prices, COD, area lists, photos …) is never a blocker: the owner types it
in the backend later (CN-009).

| # | What | State |
|---|---|---|
| 4 | Read the new preview password on the server (Azure → Run command → `extas-preview-login`) | Done (CN-009): the owner has read it |
| 12 | ERP address, API key and webhook secret on Keys & connections, and which ERP warehouse is the shared one | Owner data, not a question: he types it in Keys & connections; the practice ERP runs meanwhile |
| 13 | Which locations count as sellable online stock (main warehouse only, or showrooms too) | Open — default: main warehouse only |
| 14 | Should stock-count differences ever be sent to the ERP as a correction by themselves? | Open — default: report only, nothing sent |
| 15 | Block, warn or ignore when publishing a product with no ERP stock | Open — default: check off |
| 17 | "Build your own set" price style on the desktop home tile: the owner picks style 1, 2 or 3 (Note 58) | Open — default: "None" until he picks |
| 18 | Free-delivery limit for a set: count the set price or the pieces' own prices (today: the pieces' prices); a money decision (follow-up 39) | Open — default: unchanged |
| 19 | COD limit: add the band's delivery charge the customer pays (follow-up 121) | Open — default: unchanged |
| 20 | Two orders of one customer sent as one parcel: should the system propose giving back the second delivery charge (a refund request he approves)? (PR 145) | Open — default: both orders keep their charges, nothing is given back |
| 21 | Before real money: should an outside security expert check the site (it costs money), or is our own separate review plus the automated scans enough? (PR 381) | Open — default: our own review (`docs/security/REVIEW.md`) and the nightly dependency scan; nothing stops |
| 22 | Lock the Azure Blob backups (immutability, 35 days): nobody, not even someone who takes over the server, can delete a copy, but the lock cannot be shortened or removed and Azure charges for the space (PR 385) | Open — default: no lock (`BACKUP_IMMUTABLE="no"`); the steps are in `docs/security/BREAK-GLASS-RESTORE.md` §1 |
| 23 | Make the Azure storage account and the `extas-backups` container, enter them in Keys & connections → Azure Blob and press Test; connect Google Drive once on the Backups page (PR 391) | Owner step: the server's own nightly backup runs meanwhile; the go-live list shows both as not ready until then |
| 24 | Each live store's own data before go-live: phone, address, registered name, trade licence (Settings → Store details) and the delivery charges (PR 399) | Owner data, not a question: the go-live list names what is still empty; an empty field never shows on the shop |
| 26 | Customer-problem records (PR 423) are kept for ever: may a clean-up job ever delete old ones (the number of days would be his setting), or never? | Open — default: nothing is deleted; the records hold no name, phone or address |
| 27 | Checkout's phone-first area fill (PR 555, `delivery.phoneFirst.enabled`, on) shows the saved area to anyone who types a customer's phone number: keep it, or show the area only after the SMS code check (review round 1, security m3)? | Open — default: unchanged (on, at most 10 lookups per 10 minutes per address); no name, phone or full address is ever shown |
| 28 | A repeat refuser's delivery-charge advance (PR 163 terms, PR 542 advance) when his parcel comes back: give it back, or keep it? A money decision (review round 3, money M3) | Open — default: kept (`payments.refunds.rtoAdvance` KEEP, changeable in the money rules); a person can still ask its refund by hand |
| 25 | Go-live day: the day and time the password and noindex come off extas.com.bd (the main domain only; staging stays closed) (PR 403) | Open — the switch is built and ships closed (`EXTAS_MAIN_OPEN="no"`, #71); nothing changes on the main domain until he names the day; the steps are in `docs/golive/RUNBOOK.md` |
| Sim 1–9 | The nine questions of the 50-order simulation (prepaid reward, risky customers, delivery-day and Day-1 messages, sets, exchange charge, Eid pre-order, rider overcharge, apology credit, coupons) | Answered (CN-018); questions 3 and 9 decided in CN-019 (Messages control centre) |
| 16 | Who receives low-stock alerts, and from how many pieces | Owner data, not a question: set in the backend; default 2 pieces, shown in the admin, no message sent |
| 5 | The admin login e-mail | Answered (CN-009/CN-010): the owner account is opened on the server by `owner-account.yml`; he reads the first password with `extas-owner-login` ([steps in Bengali](docs/owner/OWNER-LOGIN.md)); never committed |
| 6 | Delivery charges, free-delivery limit, COD, exchange limit, AI budget | Answered (CN-009): owner data, entered later in the backend |
| 7 | Watermark text on downloaded photos | Answered (CN-009): www.extas.com.bd, set in the live store by `store-settings.yml` (not in Git) |
| 8 | May unused photos ever be deleted? | Answered (CN-009): never — archive only |
| 10 | Where the struck-through "was" price comes from | Answered (CN-009): the real MRP where it exists; combos = sum of separate prices; never invented; store value set by `store-settings.yml` |
| 1, 2, 3 | Runner on the server · Cloudflare `new` record · 4-piece prices | Done (20 Oct) |

---

## How it is built

> **বাংলায় সংক্ষেপে:** দোকানটা একটাই সার্ভারে চলে (Azure, মালয়েশিয়া)। কোড GitHub-এ মার্জ হলে সার্ভারের ভেতরের "রানার"
> নিজে থেকে নতুন সংস্করণ বসায়, পুরোনোটা না থামিয়ে; সমস্যা হলে আগেরটায় ফিরে যায়। স্টক আর হিসাবের আসল খাতা আপনার ERP।

### The stack

Blueprint [A3.1](docs/BLUEPRINT.md#a31-the-stack) and [A2.9](docs/BLUEPRINT.md#a29-server-specification--v21--19-oct-2333-owner-cn-001--locked).

| Layer | What we use |
|---|---|
| App | Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · zod |
| Data | PostgreSQL 17 behind PgBouncer (transaction pool) · Prisma 6 (one schema, 333 models, `storeId` on every store table) |
| Queues and cache | Redis, split in two: an LRU cache (on the fast NVMe) and a no-eviction queue store (AOF, data disk) for BullMQ |
| Search | Meilisearch (PostgreSQL `pg_trgm` only for fuzzy matching such as fraud checks) |
| Images | sharp: 5 sizes × AVIF / WebP / JPEG at 4:5 |
| Web server | Caddy (automatic HTTPS, HTTP/3, password + `noindex` on the preview) behind Cloudflare |
| Runtime | Docker Compose; every container's RAM and CPU from one auto profile ([`infra/config/server.conf`](infra/config/server.conf), PR 604) |
| Media storage | Storage adapter: local disk on the media volume (default today), Azure Blob or S3-compatible once their keys are in |
| Backups | Data disk + Azure Blob (WAL, point in time) + Google Drive (encrypted daily dump) — Blob and Drive switch on when their keys are entered |
| Package manager | pnpm 10 workspace, Node 22 |

### Architecture overview

```
           Cloudflare  ──►  Caddy (HTTPS, preview password)  ──►  app: Next.js, blue/green, 6 replicas
                                                                     │  apps/web (pages + /api routes)
                                                                     │  uses packages/*  (domain logic)
                      ┌──────────────────────┬──────────────────────┼───────────────────┬────────────────┐
                 PostgreSQL 17          Redis cache /         Meilisearch        media volume /      EXTAS ERP
                 (via PgBouncer)        Redis queue                              Blob / S3           (HTTP API, CN-005)
```

- **`apps/web`** is the only app: the storefront (from S02), the admin (`/admin/*`), the admin API
  (`/api/admin/*`), the public API (`/api/back-in-stock`, `/api/health`, media) and the status page. Route handlers
  are thin: they check the session and permission, then call a package.
- **`packages/*`** hold all business logic, each with its own tests: `settings`, `vault`, `auth`, `db`, `adapters`,
  `media`, `catalogue`, `inventory`, `jobs`, `seed` ([folder list](#folder-structure)). Long jobs are job functions
  run by the background worker (`packages/jobs`, PR 6: BullMQ on the queue Redis, one scheduler leader, a `JobRun`
  row per attempt, retries and a dead letter); a few (image sizes) still run inline right after the answer.
- **`infra/`** is the server as code: S0A setup scripts, the Docker stack, the deploy script and the backup, restore
  and monitor tools.
- **Settings, not code.** Every name, number, text and limit is a declared setting (store → installation → default),
  every key is in the encrypted vault, every integration is an adapter that runs on a mock until its key arrives
  (Blueprint [A1.3](docs/BLUEPRINT.md#a13-nothing-is-ever-blocked-waiting-for-a-credential), [A7](docs/BLUEPRINT.md#a7-settings-framework-and-handover-ready-rules-v2--s00-additions-approved-18-oct)).
- **Multi-store ready.** One server, one codebase, up to three stores (Blueprint [A4](docs/BLUEPRINT.md#a4-multi-store--three-stores-one-server-one-codebase)); every store table carries `storeId`. The store switcher comes with S17.

### The ERP is the master

Blueprint [A3](docs/BLUEPRINT.md#a3-architecture--the-erp-is-the-master) and the contract
[`docs/ERP-API-CONTRACT.md`](docs/ERP-API-CONTRACT.md) (CN-005).

- **The ERP owns** variants and SKUs, stock on hand, goods receiving, purchasing, suppliers, production and all the
  accounting. **The shop owns** the storefront, presentation and SEO, content, customer accounts, cart and checkout,
  payments, combos, fraud and location checks, CRM and marketing, the AI agents and the reports.
- **ERP → shop:** variants and stock (pulled into a local mirror for fast pages). **Shop → ERP:** confirmed orders,
  payments, shipments, returns and ad spend — always as **business documents, never journal lines**.
- Cart holds stay local and are never pushed; after the order is confirmed the ERP's own reservation takes over.
- Every call carries the company; a key for the wrong company stops the sync.
- **The ERP is optional** (PR 497–499): each store runs on our ERP, another ERP, or no ERP; every ERP-dependent path
  has a written behaviour for each case. The endpoints on the ERP side are built in the owner's ERP project.

### Deploy: the runner on the VM (CN-003)

Cloud build sessions cannot open SSH to the VM. Instead a **GitHub Actions self-hosted runner** lives on the VM
(label `extas-vm`), installed once by the owner through Azure *Run command*
([`docs/owner/RUNNER-SETUP.md`](docs/owner/RUNNER-SETUP.md), [`infra/bootstrap/install-runner.sh`](infra/bootstrap/install-runner.sh)).
No SSH key is exchanged.

| Workflow | Runs on | When | What it does |
|---|---|---|---|
| [`ci.yml`](.github/workflows/ci.yml) | GitHub-hosted | every pull request and every push to `main` (and called by `nightly.yml`) | CN-023: one **build** (both Docker images; the standalone app copied out for the other jobs) and, in parallel: **lint and type-check** (hardcode guard, owner-data check, generated docs, lint, type-check) · **unit tests** · **sign-in end to end** on the built images · **device gate** on 4 runners · **Lighthouse** (one page list, `tools/lh-pages.mjs`: the core set plus the touched pages on a pull request, every page on `main`; one runner per shard; page and image weights) · **db:** migrations on PostgreSQL 17 with a drift check, every package's database tests, settings / auth / sample sync run twice (second run must change nothing), installation export / import · **infra**. `web` and `device-gate` are the gates over their parts. Caches: pnpm store, Next.js build cache, Playwright's Chromium |
| [`nightly.yml`](.github/workflows/nightly.yml) | GitHub-hosted | every night at 02:00 Dhaka, and by hand | the whole `ci.yml` on `main` with every Lighthouse page; never deploys |
| [`deploy.yml`](.github/workflows/deploy.yml) | `extas-vm` | after `ci` passes on `main` (or by hand, with a "rollback" switch) | builds the app and migrate images on the VM, then [`infra/deploy/deploy.sh`](infra/deploy/deploy.sh): migrate the database (schema, settings sync, auth sync, default pack), start the new colour beside the old, smoke-test it, switch Caddy gracefully, keep the old colour on any failure; writes `state/last-deploy.json` |
| [`smoke.yml`](.github/workflows/smoke.yml) | `extas-vm` | every night at 03:30 Dhaka, and by hand | the smoke test (below) on the live version; commits the report to [`docs/reports/smoke/latest/`](docs/reports/smoke/latest/README.md) |
| [`server-setup.yml`](.github/workflows/server-setup.yml) | `extas-vm` | by hand, or when `infra/server`, `infra/stack` or `infra/config` change | runs [`infra/server/setup.sh`](infra/server/setup.sh) (idempotent), commits the machine report to [`docs/reports/server/`](docs/reports/server/latest.md); inputs: only some steps, data-disk override, k6 re-measure, rotate the preview password |

Migrations only add (expand first, contract later), so the old colour keeps working while the new one starts and a
rollback needs no down-migration.

**Smoke test (CN-016).** After every deploy and every night, [`infra/deploy/smoke.sh`](infra/deploy/smoke.sh) opens
every built storefront page signed out and every admin page signed in, on a phone (390×844) and a desktop (1366×900)
screen, through Cloudflare like a visitor ([`tools/smoke.mjs`](tools/smoke.mjs), page list in
[`docs/qa/smoke.json`](docs/qa/smoke.json)). It signs in with a read-only check account (`smoke-check` role, read
permissions only) whose password and two-step seed are made fresh on the server each run and never leave it. A page
fails on a 5xx, the error screen, a console or page error, or a failed request. After a deploy, a failure puts the
previous version back by itself and the run goes red; the fix comes before any new PR. The report and one picture per
page and screen go to [`docs/reports/smoke/latest/`](docs/reports/smoke/latest/README.md); the result is on `/status`
and in the deploy report. Settings: `SMOKE_*` in [`infra/config/server.conf`](infra/config/server.conf). CI runs the
same journey on the production images before every merge (sign-in end to end, PR 4).

### Staging now, go-live later

- **Now:** every merge goes live on **new.extas.com.bd** (password + `noindex`). The owner follows progress there.
  Staging stays locked for good, also after go-live: since #71 (PR 403) it has its own Caddy block with the gate and
  `noindex`, and the main domain opens only on its own switch (`EXTAS_MAIN_OPEN`, ships `"no"`), flipped on go-live day
  on the owner's word (BLOCKED 25). Since #72 a gated host never lets Cloudflare keep a page (PR 602), and `/status`
  with the health detail answers only on the preview host (PR 12).
- **Go-live gate** (Blueprint [E3](docs/BLUEPRINT.md#e3-order-of-work), START-HERE): Blob and Drive backups with the
  first restore test, Telegram alerts, every server item of A2.9 (Server page, monthly speed check, report
  pre-computation) and the Appendix C QA gate green.
- **Go-live day** (S19, PR 587): extas.com.bd switches to the new shop, every old WordPress address 301-redirects.
  This needs the owner's explicit go-ahead. The domain is a setting, never code.

---

## Local setup and useful commands

> **বাংলায় সংক্ষেপে:** এই অংশ ডেভেলপারের জন্য — নিজের কম্পিউটারে কোড চালানোর নিয়ম।

Requires **Node.js 22** and **pnpm 10** (through corepack). Docker for a local PostgreSQL.

```bash
corepack enable
pnpm install                 # installs every workspace package; @extas/db generates the Prisma client
pnpm status:gen              # builds the status page data from the register and BLOCKED.md
pnpm dev                     # the web app on http://localhost:3000 (redirects to /status)
```

For anything that touches the database, start a PostgreSQL 17 and set `DATABASE_URL` and `DATABASE_DIRECT_URL`
(PgBouncer and direct; both the same locally), then `pnpm --filter @extas/db migrate:deploy`,
`pnpm --filter @extas/settings sync`, `pnpm --filter @extas/auth sync` and, for demo data,
`pnpm --filter @extas/seed sample`. Database tests need `TEST_DATABASE_ADMIN_URL` (a user who may create
databases); **without it they are skipped silently**, so check the test count. The vault needs `VAULT_MASTER_KEY`
(generated on the server; use any throwaway value locally). Never commit an `.env`.

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server for `apps/web` |
| `pnpm build` | status data, then every package's build |
| `pnpm lint` | ESLint in every package (`eslint-config-next` in the app, `typescript-eslint` in packages; Prisma validate + format check in `db`) |
| `pnpm typecheck` | `tsc --noEmit` everywhere |
| `pnpm test` | vitest in every package |
| `pnpm guard` | the hardcode guard ([`tools/hardcode-guard.mjs`](tools/hardcode-guard.mjs)) |
| `pnpm check` | guard + lint + typecheck + test — run before every push |
| `pnpm status:gen` | [`tools/make-status.mjs`](tools/make-status.mjs): register + BLOCKED.md → `apps/web/src/generated/status.json` |
| `pnpm --filter @extas/db migrate:deploy` · `migrate:diff` · `validate` · `format` | Prisma through `packages/db/scripts/prisma.mjs` |
| `pnpm --filter @extas/settings sync` | write the settings declarations to the database (idempotent, locked) |
| `pnpm --filter @extas/auth sync` · `create-owner` | permission catalogue + owner role; the first owner (on the server only) |
| `pnpm --filter @extas/seed pack:apply` · `sample` · `owner-data:check` · `export:installation` · `import:installation` | default pack, sample catalogue, owner-data check, installation export / import |
| `pnpm --filter @extas/media render-pending` | make the missing photo sizes |
| `infra/tests/run.sh` | infra unit tests (no root, no real disks) |

> The machine that builds the app needs memory: a type-check of the full Prisma client takes about 3 GB of heap
> (`NODE_OPTIONS=--max-old-space-size=4096`, as CI and the Dockerfile set).

---

## The server

> **বাংলায় সংক্ষেপে:** সার্ভার পুরো তৈরি আর পরীক্ষা করা (S0A, ১২/১২)। প্রতিদিন ব্যাকআপ হয়, প্রতি মিনিটে নজরদারি চলে,
> ব্যাকআপ থেকে ফেরানোর পরীক্ষাও পাস। Azure Blob, Google Drive আর টেলিগ্রাম চালু হবে আপনি অ্যাডমিনে কী বসালে।
> সহজ বাংলায় পুরো বিবরণ: [`docs/SERVER.md`](docs/SERVER.md)।

Latest machine report: **[`docs/reports/server/latest.md`](docs/reports/server/latest.md)** (written by every
`server-setup` run; overall PASS). Specification: Blueprint
[A2.9](docs/BLUEPRINT.md#a29-server-specification--v21--19-oct-2333-owner-cn-001--locked).

**The machine.** Azure **E8ds_v6** (8 vCPU, 64 GB), Malaysia West zone 1 (CN-002), Ubuntu Server 24.04 LTS.
OS disk 128 GB; a separate **1 TB data disk** in LVM; a **440 GB local NVMe** that is blank on every boot. Inbound
22 / 80 / 443 only.

**What `infra/server/setup.sh` sets up (S0A), step by step** — each step is idempotent and checks before it changes:

| Step file | PR | What it does |
|---|---|---|
| `01-specs.sh` | 1 | Records size, CPU, RAM, disks, region (read-only) into the report |
| `02-os.sh` | 2 | Verifies Ubuntu 24.04 and applies every update |
| `03-harden.sh` | 3 | SSH keys only, no root login, fail2ban, unattended security updates, UFW 22/80/443, Asia/Dhaka time zone; an optional Cloudflare-only mode |
| `04-nvme.sh` | 601 | Installs `extas-nvme.service`: at every boot, before Docker, the NVMe is prepared and mounted at `/mnt/nvme` (temp files, Redis cache, backup staging); OS-disk fallback with an alert |
| `05-datadisk.sh` | 1, 3 | LVM on the data disk: separate volumes for base, PostgreSQL (250 GB), Redis, search, media (100 GB), backups (150 GB), logs, Docker, plus 16 GB swap; room left to grow |
| `06-kernel.sh` | 3, 5 | Network and kernel tuning (backlog, BBR, swappiness 10, huge pages off, file limits) |
| `07-docker.sh` | 4 | Docker Engine + Compose, log rotation, live-restore, boot order NVMe → data disk → Docker |
| `08-profile.sh` | 604 | Auto profile: reads CPU and RAM and computes every container limit (on this box: 6 app replicas, PostgreSQL 16 GB, Redis 4 + 2 GB, Meilisearch 4 GB, image worker 6 GB, 11 GB kept for the OS) |
| `09-stack.sh` | 5, 6, 7 | PostgreSQL 17 tuned from the profile with PgBouncer, temp files on NVMe, WAL archive, slow-query log over 100 ms; Redis cache + queue; Meilisearch; Caddy with HTTPS, HTTP/3, the preview password and `noindex`. Secrets are generated on the server (`/srv/extas/config/secrets`, mode 600) |
| `10-backup.sh` | 8 | Backup timers, the first backup and the first restore test |
| `11-monitor.sh` | 9 | The monitor timer |
| `12-k6.sh` | 10 | k6 load baseline (recorded: p95 about 7 ms at about 15,000 requests a second on the plain page) |

**Server tools** (installed to `/usr/local/sbin`, sources in [`infra/server/bin/`](infra/server/bin)):

- **`extas-backup`** (PR 8) — `daily` at 02:30: base backup for point-in-time restore + logical dump + config,
  staged on NVMe, kept on the data disk, uploaded to Azure Blob and, encrypted, to Google Drive. `wal` every minute
  pushes WAL to Blob. `prune` keeps the retention. Blob and Drive say "not connected" until their keys are in the
  vault; local backups run regardless. Product photos go in too (a full archive every
  `BACKUP_MEDIA_FULL_EVERY_DAYS`, only changes in between, a checksum list; `BACKUP_MEDIA="no"` switches it off), and
  a dated docs bundle (README, blueprint, register, all of docs/, with the commit hash; CN-011). **Since 31 Oct (PR 8
  follow-up, the backup disk had reached 100%):** each archived WAL segment is gzipped and kept on the disk only
  `BACKUP_KEEP_LOCAL_WAL_DAYS`; each base backup carries the WAL it needs (`-X stream`); before each backup the disk is
  pruned until `BACKUP_MIN_FREE_PCT` is free (oldest WAL, then oldest base, never the newest); a failed day names its
  step and leaves no half-written folder; every PostgreSQL tool runs as the server's own version. The times, days kept
  and free share are set in the admin (Settings › System › Backups, PR 507) and reach the timers at once.
- **`extas-restore`** (PR 8) — `test` restores the newest base backup + WAL into a throwaway PostgreSQL on the NVMe
  and checks it (run after every setup; ~~monthly by timer later, PR 395/507~~ `drill` every month since PR 507: the
  server's own copy, then Blob's and Drive's, each into a throw-away database). `--from local|blob|drive
  [--at "YYYY-MM-DD HH:MM"] [--target staging|production]` — production needs the typed word RESTORE and keeps the old
  data. The test also restores one sample photo (checksum) and unpacks the newest docs bundle (commit must match).
  `media --from local|blob|drive [--into live]` brings all photos back; into live it only adds missing ones. Last
  test: 336 tables restored, matching live.
- **`extas-monitor`** (PR 9) — every minute: disks (alert at 80%), services, NVMe, backups, speed → writes
  `state/health.json` (read by the status page now, by the admin Server page later). Sends to Telegram once the bot
  key is in Keys & connections (PR 392: `extas-vault-sync` hands the key to the server); until then to the log.
- **`extas-profile`** (PR 604), **`extas-nvme-prepare`** (PR 601), **`extas-find-data-disk`** (finds the 1 TB disk
  safely), **`extas-preview-login`** (the owner reads the preview password; CN-007).

**The admin Server page** `/admin/server` (permission `system.read`) — **first part built** with the background
worker (PR 6, 23 Oct): a verdict (ok · stale · stopped · never started), the leader, jobs waiting / running / failed
in the last hours, the failed jobs with their reason and next try, and every worker's last heartbeat. The rest
(plain-language CPU, RAM, disks, services, cache hit, slow queries, last backups, speed) is **planned** — S21, PR 423
(with 601, 602, 603, 604); the demo shows it at `#/admin/server`. Until then that state is on `/status` and in the
committed server reports. Guide: [docs/admin-guide/server.md](docs/admin-guide/server.md).

---

## Folder structure

> **বাংলায় সংক্ষেপে:** কোন ফোল্ডারে কী আছে, এক লাইনে।

```
.
├── CLAUDE.md                 owner's standing rules for every build session (read first)
├── PROGRESS.md               the exact stopping point, one line per merged PR group
├── BLOCKED.md                questions only the owner can answer (Bengali), newest first
├── README.md                 this page: the live front page
├── package.json              root scripts (dev, build, lint, typecheck, test, guard, check, status:gen)
├── pnpm-workspace.yaml       workspace = apps/* + packages/*
├── lighthouserc.json         the Lighthouse speed budget and the pages it measures
├── .github/
│   ├── workflows/            ci.yml · nightly.yml · deploy.yml · smoke.yml · server-setup.yml · owner-*.yml · store-settings.yml · golive-check.yml · golive-domain.yml
│   ├── actions/              CI's shared steps: pnpm-install · playwright · seeded-app
│   └── pull_request_template.md
├── .claude/agents/           build-agent roles: stage-builder, qa-gate, infra-prohori
├── apps/
│   └── web/                  the Next.js app (storefront from S02, admin, API, status page)
│       ├── src/app/          pages and route handlers: admin/*, api/admin/*, api/*, media/*, status
│       ├── src/components/   admin/ (frame, products, stock, size charts, integrations) and media/ (ResponsiveImage)
│       ├── src/lib/          thin glue: admin auth, API handlers per area, i18n, settings, status, nav
│       ├── src/fonts/        self-hosted fonts (Hind Siliguri, Instrument Sans, Archivo; OFL-1.1)
│       ├── messages/         every visible text, English + Bengali JSON per screen
│       └── Dockerfile        app image + one-shot migrate image
├── packages/
│   ├── db/                   Prisma schema (333 models), migrations, client, schema tests
│   ├── settings/             settings registry, resolver, sync, owner-data register, admin settings API
│   ├── vault/                encrypted credential vault
│   ├── auth/                 staff and customer sign-in, sessions, 2FA, permissions, roles, audit log
│   ├── adapters/             adapter framework (mock / sandbox / live), storage, ERP, page reader
│   ├── media/                image pipeline, watermark, delivery, media library
│   ├── catalogue/            products, variants, categories, colours, fabrics, naming, publish, size charts, CSV …
│   ├── inventory/            ERP mode and guard, sync, stock pull, holds, pushes, counts, reports, ERP webhooks
│   ├── jobs/                 background worker: BullMQ queues, scheduler leader, JobRun per attempt, heartbeat
│   ├── metrics/              the one KPI definition: Sales (delivered) and Ordered value for every report
│   └── seed/                 default pack, sample catalogue, owner-data check, installation export / import
├── infra/
│   ├── bootstrap/            install-runner.sh (one-time runner install by the owner)
│   ├── config/server.conf    the one server config file (no secrets)
│   ├── server/               setup.sh, lib.sh, steps/01–12, bin/ (server tools), files/ (systemd units)
│   ├── stack/                compose.yml (database, cache, search, Caddy), app.yml (blue/green app), Caddyfile, PgBouncer image
│   ├── deploy/deploy.sh      zero-downtime deploy with automatic rollback
│   ├── deploy/app-role.sh    the app's own database role (extas_app), its login and the append-only check
│   └── tests/                infra unit tests and fixtures
├── tools/                    hardcode guard (+ rules JSON), status generator, their tests
└── docs/                     blueprint, register, demo, owner notes, QA, agents, reports — see docs/README.md
```

Every package's `src/index.ts` starts with a short comment saying what the package is for; its `package.json`
`description` says the same in one line.

---

## Features by area

> **বাংলায় সংক্ষেপে:** প্রতিটা ধাপে কী কী তৈরি হয়েছে — কোন পাতা, কোন বোতাম, পেছনে কী হয়। যেগুলো এখনো হয়নি, সেখানে
> শুধু লেখা আছে কোন PR-এ আসবে।

Areas are in build order (waves). Built areas list their screens, API routes, settings, permissions and tests; each
PR's full scope is its row in the register's **Build status** table.

### S0A · Server foundation — Done (12/12, live)

> **বাংলায়:** সার্ভার কোড দিয়ে তৈরি — নিরাপত্তা, ডিস্ক, ডাটাবেস, ব্যাকআপ, নজরদারি, গতি মাপা। সব চালু।

PR 1–10, 601, 604. Everything is described under [The server](#the-server). Highlights: idempotent setup as code,
NVMe boot unit (601), hardware-aware auto profile (604), tuned PostgreSQL + PgBouncer, split Redis, Caddy with the
preview password (PR 7; the password is generated on the server, rotatable, never in chat — CN-007), backups with a
tested restore (8), monitoring every minute (9), k6 baseline (10). **Background worker (PR 6, CN-022, 23 Oct):**
`packages/jobs` runs every long job off the web process — BullMQ on the no-eviction queue Redis, one scheduler leader
(a Redis lock), a `JobRun` row per attempt (status, tries, next try, reason), backoff and a dead letter, a run that
already succeeded is never repeated, a dead worker's run is closed as `WORKER_LOST` and taken over; heartbeats in
`WorkerHeartbeat` (migration `0008_worker`). It runs as the `worker` service of each deploy colour
([`infra/stack/app.yml`](infra/stack/app.yml), from the migrate image, sized by `extas-profile`); settings `jobs.*`
(registry v22, group system); the admin Server page shows it; the smoke test checks its heartbeat. A rollback starts the previous good
version's worker too: the deploy record keeps `worker_image` / `previous_worker`, and the image clean-up never removes
an image a record still needs ([`infra/deploy/images.sh`](infra/deploy/images.sh), follow-up 82). **Preview gate and
the ERP (PR 7, follow-up 80):** only `POST /api/erp/webhook` passes without the preview login (the message proves
itself with its signature, PR 196); every other method and path still asks; a smoke check sends an anonymous POST and
expects the app's own answer, not the login box. Deploys (PR 4) now commit their result back to
[`docs/reports/server/deploy-latest.md`](docs/reports/server/) with a history line (`[skip ci]`, no loop). **Review round 1 (31 Oct, #71):** deploy, setup, ERP acceptance and smoke
have their own queues, so nothing cancels a waiting deploy; an older commit never deploys over a newer one; a second
rollback is refused; the image store reset never takes the app down; admin smoke pictures stay on the server, never in
Git (PR 4); the WAL archive never sticks and one backup runs at a time, each with a time limit (PR 8); the monitor alerts on
error answers, a stuck worker, stuck WAL archiving, a failed smoke test or vault sync and an old backup (PR 9); a hung job
try ends after `jobs.attemptTimeoutSeconds` (PR 6). **Review round 2 (31 Oct, #72):** every deploy and setup run is its own
queue group, so a newer commit's waiting deploy or a waiting rollback is never cancelled; four more admin pages in the
smoke test (PR 4). Tests: shellcheck and
[`infra/tests/run.sh`](infra/tests/run.sh) in CI. Register: [S0A](docs/MASTER-REGISTER.md#s0a--server-foundation--pr-110) ·
report: [`docs/reports/2026-10-20-S0A.md`](docs/reports/2026-10-20-S0A.md).

**PR 4 follow-up (#91, follow-up 691): the deploy warms the new version.** Before traffic moves, `tools/warm.mjs` opens
each smoke page once, signed out, inside every new web replica (`DEPLOY_WARM_SECONDS` 240 in `infra/config/server.conf`)
and logs the slowest pages, so the first visitors and the smoke test no longer pay a page's first load.
> বাংলায়: নতুন ভার্সন চালুর আগে সার্ভার নিজেই প্রতিটা পাতা একবার খুলে গরম করে নেয়, তাই প্রথম কাস্টমারকে ধীর পাতা দেখতে হয় না।
- **Follow-ups (#94):** the smoke test opens My orders, the bulk-order page and the bag's test page in both languages
  (the two a switch closes are on `mayBeOff`), and a test fails when a static shop page is neither opened nor skipped (4,
  follow-up 611); the daily audience refresh, ad spend import and money report put their day in the run key — with
  slot 0 every day after the first was skipped (6, follow-up 722); a worker that does not know a job's name puts it back
  on the queue and gives it up only after `jobs.retry.maxAttempts` takings (6, follow-up 613).
> নতুন (#94): রোজকার বিজ্ঞাপন-অডিয়েন্স, বিজ্ঞাপনের খরচ আর টাকার রিপোর্ট এখন প্রতিদিনই চলে (আগে প্রথম দিনের পরে থেমে যেত)।

### S00 · Foundation — In progress (42/43)

> **বাংলায়:** কোডের ভিত্তি: সেটিংস, কী রাখার ভল্ট, লগইন আর অনুমতি, পুরো ডাটাবেসের নকশা, "কিছুই কোডে লেখা নয়" পাহারা,
> অ্যাডমিনে ঢোকা আর "Keys & connections" পাতা।

PR 11–18, 491–496, 500, 508–510, 603. Register: [S00](docs/MASTER-REGISTER.md#s00--foundation--pr-1118) ·
report: [`docs/reports/2026-10-20-S00.md`](docs/reports/2026-10-20-S00.md).

~~Planned (CN-036, 6 Nov): the admin look Lumen, PR 625–648 — theme layer and self-hosted fonts, the shell, the shared patterns, Settings › Admin look (four looks, only Lumen selectable), then one PR per section; three further looks parked (649–651). Size report: [`docs/reports/2026-11-06-admin-look-size.md`](docs/reports/2026-11-06-admin-look-size.md).~~ The foundation 625–630 is built (#86, below), the sections 631–637 (#89) and 638–645, 647, 648 (#91, below) too; 646 (the AI Center, all AI) waits for S15, which is closed.

**Built (PR 625–630; 6 Nov, #86, CN-036, Launch rows): the admin look Lumen — the foundation.**
> **বাংলায়:** অ্যাডমিনের নতুন চেহারা "Lumen"-এর ভিত্তি তৈরি: হালকা রং আসল, ওপরের চাঁদ বাটনে রাতের রং — প্রত্যেকের নিজের পছন্দ;
> ভাসমান পাশের মেনু (চারটা দল), ঘণ্টায় নোটিফিকেশন, ফোনে নিচের বার; প্রধান রং (coral) সেটিং থেকে বদলানো যায়।
> Settings › Admin look-এ চারটা চেহারা — Lumen চালু, ক খ গ "Planned"। AI Center মেনুতে নেই যতদিন S15 বন্ধ। পুরনো পাতাগুলো
> এক এক করে নতুন চেহারায় আসবে (PR 631–648); ততদিন রাতের রঙে সেগুলো হালকা থাকে।
- **Theme layer (625):** `app/admin/theme/lumen.css` — every admin colour, radius, font, shadow and motion time is a
  `--lm-*` token. **Light is the default**; dark is each person's own choice with the **moon** button in the top bar
  (kept on their staff account, `StaffUser.adminPrefs.theme`, never a team setting). The **accent is a setting**
  (`admin.theme`, registry v234: look `lumen`, accent coral, reduce motion off); every accent colour is mixed from it so
  text on it stays readable. Plus Jakarta Sans and Bricolage Grotesque are self-hosted. The hardcode guard now reads
  `.css` too and fails a colour or font family written in an admin page outside the theme folder (rule
  `admin-style-literal`, a per-file ratchet that each section PR lowers).
- **Shell (626):** a floating sidebar in four groups (Daily, Grow, Business, System) with the current section's submenu,
  collapsible to icons; a glass top bar (search, To do, the page's guide, EN | বাং, the moon, the bell); the bell opens
  the notifications panel with "Mark all read"; a bottom bar on phones. The **AI Center is hidden while S15 is closed**
  (PR 652's `stages.closedShown`, plus `ai.enabled`). Pages not yet moved into the look stay light "islands" in dark
  mode until their section PR (631–648). **Follow-up (6 Nov, #87):** a long sidebar label wraps to a second line
  (token `--lm-lh-tight`) instead of being cut off; batch 12's push CI had failed the device gate on iPad Pro 12.9
  portrait (1024 px, Bengali "সাহায্য আর অগ্রগতি").
- **Shared patterns (627–629):** summary tiles with a count-up number, the hero chart (plain SVG, hover and keyboard
  read-out, range switch), the one toast with **Undo only for reversible actions** (money, refunds, COD, prices,
  discounts, blocking and deleting never get Undo; the clock pauses while mouse, touch or keyboard is on it), empty state,
  skeleton; queue, list with filter chips, search, "Show more" and bulk bar, list + detail split; form with a readiness
  checklist and live shop preview, settings switch cards that fold out their numbers. `admin.patterns` (registry v236):
  Undo 5 seconds, "Show more" 12 rows.
- **Settings › Admin look (630, `/admin/settings/look`):** the four looks of ADMIN-LOOKS-V1 — ঘ Lumen in use, ক খ গ
  shown as **"Planned"** (not selectable; parked as PR 649–651); light or dark; accent swatches or any colour, per person
  (a person's accent wins over the team's); Reduce motion per person; the team's accent and reduce motion with
  `settings.write`. Guide [settings/look](docs/admin-guide/pages/settings/look.md).
- Tests: `lib/admin-look/theme.test.ts`, `lib/admin-shell/lumen-nav.test.ts`, `components/admin/lumen/patterns*.test.tsx`,
  `components/admin/look/ThemeChooser.test.tsx`, `registry-admin-theme.test.ts`, `registry-admin-patterns.test.ts`; smoke
  checks the shell's Lumen look and the closed bell; device gate 0 fails light and dark.

**Built (PR 631–637; 6 Nov, #89, CN-036, Launch rows): the first Lumen sections — Today, Orders, Products, Customers,
Delivery.**
> **বাংলায়:** অ্যাডমিনের পাঁচটা অংশ এখন নতুন Lumen চেহারায়: Today (আগের Dashboard — আজকের বিক্রি, "আপনার কাজ" তালিকা, অর্ডারের
> ধাপ, লাইভ খবর, মাসের লক্ষ্য — শুরুতে বন্ধ), Orders (নিশ্চিত করা, প্যাকিং, ফেরত), Products (প্রোডাক্ট, স্টক, কম্বো, সাইজ চার্ট,
> রিভিউ), Customers আর Delivery। রাতের রঙেও ঠিক দেখায়; সব কাজ, অনুমতি আর লিংক আগের মতোই। টাকা, ফেরত, COD বা ব্লকের কাজে Undo নেই।
- **Today (631):** the Dashboard in the Lumen patterns with real data: hero sales with the range switch, "Needs you"
  (confirm-ready orders, risky COD, parcels needing a call), summary tiles, the order pipeline, the live feed and the
  monthly goal ring — `admin.today` (registry v237: the live feed's 6 rows, the goal ring off as shipped with amount 0). Every card and permission
  of the old Dashboard kept; the standard look is design B (A kept). The section is called Today / আজ.
- **Orders (632, 633):** To confirm and the call queue, incomplete orders, the digest, All orders, Order view, the risk
  rules, Packing & print (pack, picking, invoices, print run, handover) and Returns (board, QC, hand-back, refused, the
  ERP lists): 18 pages, KPI tiles, every message through the one toast; the invoice preview stays a light island.
- **Products (634, 635):** All products, Add product, the product page, import from a link and from the ERP, the publish
  queue, the audit, Stock (counts, movements), Combos & sets, Size charts, Back in stock and Reviews; bulk Undo only for
  publish, take off, archive and restore (a review reward is money: no Undo).
- **Customers (636) and Delivery (637):** All customers, the customer page, segments, loyalty & wallet, to review, import
  and the customer settings; Zones & charges, Couriers, one courier and the delivery settings. Blocking keeps its confirm.
- Each page marks itself ready for dark (`data-lm-ready`); the colour literals of these sections moved to `--lm-*`
  tokens, so their hardcode-guard baselines are gone (products, combos, size charts, reviews, returns, settings cards).
  Checked at 390, 768, 1366 and 1920 px, light and dark, English and Bengali; device gate 0 fails on every page.
- **Follow-ups (#91):** PR 633 — Returns › QC and Hand-back, PR 634 — Add product, Import from a link and Import from
  the ERP draw their no-access state with the marks their smoke checks wait for (the server's check account is
  read-only, and the batch 14 deploys rolled back on these checks); `lib/admin-lumen/readonly-smoke.test.ts` now fails CI
  for any Lumen smoke check on a page behind a permission the check account lacks, unless its no-access state carries
  what the check waits for.

**Built (PR 638–645, 647, 648; 6 Nov, #91, CN-036, Launch rows): the other Lumen sections — Marketing, Messages,
Website, Support, Money, Reports, Settings, Help.**
> **বাংলায়:** অ্যাডমিনের বাকি অংশগুলোও এখন নতুন Lumen চেহারায়: Marketing (কুপন-অফার, নোটিশ, ক্যাম্পেইন, বিজ্ঞাপন,
> ল্যান্ডিং পেজ …), Messages, Website (পেজ সাজানো, লেখা, SEO, ব্লগ), Support, Money (সারসংক্ষেপে আসা টাকার ছোট চার্টসহ,
> খরচ, VAT, ফেরত, লাভ-ক্ষতি, ERP-র খাতা), Reports, Settings আর Help। রাতের রঙেও ঠিক দেখায়; সব কাজ, অনুমতি আর লিংক
> আগের মতোই। শুধু AI Center বাকি — পুরোটা AI-র, S15 বন্ধ বলে এখন নয়।
- **Marketing (638, 639):** Smart Rules, Notices, Eid dates, Campaigns, Audiences, Ad platforms, Tracking, Landing pages,
  Seasonal pages, Referrals, YouTube, Outreach, Seasonal home, Festive cut-off, the calendar, the report, and the
  customer messages (order journey, automations, campaigns, e-mail, templates, the log, channels, consent): 33 pages.
- **Website (640) and Support (641):** Page layouts, Words & language, Eye toggles, SEO, Blog & journal (16 pages); the
  inbox, a conversation, analytics, the support app, rider issues and the support settings (6 pages). The article and
  landing previews stay light islands (they show the shop).
- **Money (642, 643):** Overview with three received-money tiles and a chart of cash received day by day (7 days with
  the 7 before dashed, or 30 days), Cashbook, costs, the cost ledger and report, fees, VAT, Refunds & wallet, the profit
  pages; the books (ERP account, the day's check, match, differences, closes) and the month end. Every figure keeps its
  "explain this number" view; no Undo on money (confirm ticks, reasons and second presses kept).
- **Reports (644, 645), Settings (647), Help (648):** team, delivery, customers, stopped, fraud, areas, flags, learning,
  Experiments; Site health and its pages; store details, policies, privacy, security, Cloudflare, the ERP link, System,
  Keys & connections, Server; Help & manual, Build progress, a PR's card, problems, Blueprint & files.
- Every page and its no-access state carry `data-lm-ready` (the server's smoke account is read-only); done lines go to
  the one toast, refusals stay beside their field. Colour literals moved to `--lm-*` tokens: the hardcode-guard
  baselines of rules, campaigns, landing, messages, blog, support, build, manual and settings CSS are gone. Checked at
  390, 768, 1366 and 1920 px, light and dark, English and Bengali; device gate 0 fails on every page.
- **Follow-ups (#92):** card text at 14 px everywhere it was smaller (Admin look pills 630, the live preview's badge
  627, Side canvas's map 596, Launch default's tags 597, the Shared calendar 252) and the section check catches rem/em
  sizes; the report and Site health figure rows are the shared summary tiles (644, 645); a settings card's "saved" goes
  to the one toast (647); the blog pages' back link is a 44 px tap (640); Customers as a list + detail split from 1280 px
  (636); the old toast styles are gone (625). **Contrast AA (625, 628, 632, 634):** every ready accent swatch reaches AA
  in light and dark (the light accent is a little darker), chip and tab counts at full strength, placeholders in the
  quieter ink; `theme/lumen-contrast.test.ts` checks every token pair and that no Lumen text is faded. The dark
  submenu (7.28:1) and the Bengali sidebar at 1024 px were measured fine. An accent typed in by hand is not checked yet
  (follow-up 718).

**Repository, CI and deploy (PR 11, 12, 17).** pnpm workspace, Next.js 16 + TypeScript strict + Tailwind 4,
[`docs/CONVENTIONS.md`](docs/CONVENTIONS.md), the PR template, CI and the blue/green deploy
([above](#deploy-the-runner-on-the-vm-cn-003)). The Lighthouse gate measures real paint under 4G + 4× CPU
throttling, median of 3, on every page listed in [`lighthouserc.json`](lighthouserc.json), on the sample data.
**CI under 25 minutes (PR 17, updated 24 Oct, CN-023):** the app and its images are built once and the gates run
beside each other on that build: lint and type-check, unit tests, the sign-in end to end, the device gate on 4
runners (`tools/device-gate.mjs --shard=k/n`) and Lighthouse, one runner per shard of pages. One page list
(`lighthouserc.json`, with every budget as before); [`tools/lh-pages.mjs`](tools/lh-pages.mjs) picks the core set
(home, category, product, combo, bag, checkout, in both languages) plus the pages a pull request touches, and every
page on `main`, every night ([`nightly.yml`](.github/workflows/nightly.yml)) and by hand, so a failing page still
blocks the deploy. pnpm, the Next.js build cache and Playwright's Chromium are cached. Time: before about 115
minutes a run; after: measured on the first run (`PROGRESS.md`). Tests: `tools/lh-pages.test.mjs`,
`tools/device-gate.test.mjs`.

**Status page (`/status`).** Bengali progress page: stages and PRs done (from the register), the last good deploy,
server health and the last backups (from the server's `state/` files: `last-good-deploy.json`, `health.json`,
`backup-daily-*.json`), and what waits for the owner (from BLOCKED.md). **Preview host only (31 Oct, #72, PR 12
follow-up):** `/status` and the health detail (commit, colour) answer only on the preview host (`system.stagingHost`) and
the server's own addresses; on the main domain or a store's own domain `/status` is 404 and `/api/health` a bare
`{"ok":true}` (`apps/web/src/lib/status-host.ts`).
`noindex`. The home address `/` redirects here until the storefront exists.

**Database (PR 13, 603) — `packages/db`.** The full Prisma schema for all 28 stages in one pass: 333 models,
`storeId` on every store table (exceptions listed and guarded by a test), settings, vault, roles. Index pack:
category page, variant by colour/size, order by phone, history, list filters, style hierarchy; `pg_trgm` GIN
indexes; 4 report materialized views. Migrations: `0001_init`, `0002_archived_links` (columns only). CI applies them
to PostgreSQL 17 and fails on any drift.

**Hardcode guard (PR 494) — `tools/hardcode-guard.mjs`.** First CI step. Rules are data
([`tools/hardcode-guard.json`](tools/hardcode-guard.json)): secrets, owner data (brand, domain, phones, e-mails), ৳
amounts, business numbers, visible JSX text, and since 23 Oct (follow-up 14, SIM-F-033, F-031) reply hours, promises
to the customer and fixed calendar dates written into code; the simulation's hard-coded texts are its test cases. An
opt-out needs a written reason.

**Credential vault (PR 493) — `packages/vault`.** Envelope encryption: server master key → HKDF → wrapped data keys
→ AES-256-GCM per secret, bound to its name and store. Every read is logged; revoke without delete; data-key and
master-key rotation; tamper is refused.

**Settings framework (PR 491, 492, 496, 510) — `packages/settings`.** Every setting is declared once (key, zod
schema, default, scope, who may change it, Bengali/English label) in `registry*.ts`. `settings sync` writes the
declarations to the database on every deploy. Resolver: store value → installation value → declared default,
cached and refreshed when any setting changes. Changes are validated, versioned and logged (who, when, old → new);
reset to default goes one level up. Owner data has no default. API: `GET /api/admin/settings` (read-only list of
keys, effective values and their source; needs `settings.read`; never owner data or vault entries).

**Adapter framework (PR 18) — `packages/adapters`.** Every integration is one adapter with mock / sandbox / live,
chosen per store or installation from its connection row. The Test button records each run; a connection leaves
mock only after a passing test (audited); keys come from the vault, cached briefly, scrubbed from messages. Storage
adapter: local disk (default, on the media volume), Azure Blob, S3-compatible — tested against Azurite and an S3
server in CI.

**Sign-in, permissions, roles (PR 15, 16, 495) — `packages/auth`.** Staff login (e-mail + password, scrypt,
wrong-try pause, login alerts) and customer password login per store; opaque session tokens stored hashed in
`__Host-` cookies with idle and total limits; device list and "log out everywhere"; optional 2FA by authenticator
app (seed in the vault). Every admin action is permission-checked on the server. Role builder: the permission
catalogue is code ([`packages/auth/src/catalogue.ts`](packages/auth/src/catalogue.ts)), roles are data; the owner
role always holds every permission; nobody grants more than they hold; the last owner cannot be paused or removed;
roles are archived, never deleted; every staff/role change goes to the append-only audit log.
The first owner account is opened on the server by [`owner-account.yml`](.github/workflows/owner-account.yml)
(e-mail masked, first password made on the VM, read with `/usr/local/sbin/extas-owner-login`; a second run refuses). When the owner cannot
sign in, [`owner-reset.yml`](.github/workflows/owner-reset.yml) gives his account a new first password the same way
(`infra/server/bin/extas-owner-reset`: sessions ended, a wrong-try wait lifted, two-step login kept) and its report
says why the sign-ins failed (counts only).

| Route | Purpose |
|---|---|
| `POST /api/admin/auth/login` · `/2fa` · `/logout` | sign in (then the 2-step code if on), sign out |
| `GET /api/admin/auth/me` | who is signed in and what they may do |
| `POST /api/admin/auth/password` · `/totp` | change own password (other sessions end) · set up / switch 2FA |
| `GET/POST /api/admin/auth/sessions` | device list, log out everywhere |
| `GET/POST /api/admin/staff` · `PATCH …/[id]` · `POST …/[id]/roles` | staff accounts; give or take a role per store or all stores |
| `GET/POST /api/admin/roles` · `PATCH …/[id]` · `GET /api/admin/permissions` | role builder and its catalogue |

Permissions so far: `settings.read/write`, `vault.read/write`, `roles.read/manage`, `staff.read/manage`,
`audit.read`, `security.read`, plus the media, catalogue and inventory keys listed in their areas below.

**Owner data, default pack, sample catalogue (PR 509, 508, 14) — `packages/seed` + `packages/settings/src/owner-data.ts`.**
The "my own data" register (owner settings, 5 key prefixes, 23 tables, 2 columns, all media) with a CI check
(`owner-data:check`) and an installation export / import that leaves all of it out and refuses on any owner value.
The general default pack (`packages/seed/data/default-pack.json`): garment types, 7 hidden categories, 3 delivery
bands switched off with no charge, 14 SMS / WhatsApp / e-mail templates in Bengali + English; applied add-only on
every deploy. The sample catalogue (`sample`): the demo's 17 products, 227 variants, size charts, collections, tags
and one demo order in a "Sample" store; a second run changes nothing.
The owner's own values reach the live store only from the server: [`store-settings.yml`](.github/workflows/store-settings.yml)
runs `settings cli.ts set` with the live migrate image (validated, logged with the reason, owner-OK flag for money
settings; the log names keys only).

**Admin frame and Keys & connections (PR 500).**

| Screen | What it does |
|---|---|
| `/admin/login` | sign in, the 2FA step and the first-password step; English / বাংলা switch; an e-mail without "@" gets "write the full e-mail address" and is not sent (owner, 20 Oct; smoke-checked) |
| ~~admin frame~~ | ~~sidebar grouped Catalogue / Inventory / System from [`apps/web/src/lib/admin-nav.ts`](apps/web/src/lib/admin-nav.ts) (only pages that exist); `/admin` opens the first page~~ replaced by the admin shell below (PR 12, 23 Oct) |
| `/admin/integrations` — **Keys & connections** | every declared connection with its state; save a key → it goes into the vault → it is tested → the connection leaves mock only on a pass; remove = revoke, nothing deleted; every step audited; a saved key is never shown again. The connection list is data ([`packages/adapters/src/catalogue.ts`](packages/adapters/src/catalogue.ts)); "Our ERP" and the page reader are on it |

API: `GET /api/admin/integrations`, `POST /api/admin/integrations/[id]` (save / test / remove). Screenshots:
[`docs/qa/screenshots/pr-500/`](docs/qa/screenshots/pr-500). Guides: [docs/admin-guide/login.md](docs/admin-guide/login.md) (sign-in and the frame),
[docs/admin-guide/integrations.md](docs/admin-guide/integrations.md) (Keys & connections).

**The new admin shell (PR 12, updated 23 Oct, CN-018 / CN-022; demo V12.3 `#/admin`).**

> **বাংলায়:** অ্যাডমিনের নতুন কাঠামো: বাঁ পাশে ১৪টা সেকশন চার ভাগে, প্রতিটার পাশে অপেক্ষার কাজের সংখ্যা; ট্যাবলেটে শুধু আইকন,
> ফোনে পাশ থেকে খোলা মেনু আর নিচে বার। Ctrl K বা "/" চাপলে সব খোঁজা যায়। প্রতিটা পাতায় "এই সেকশনে কী করা যায়" চাপলে
> বাংলা গাইড পাশে খোলে। নতুন ড্যাশবোর্ড: বিক্রি আর অর্ডারের মূল্য আলাদা ঘরে, আর "এখনই করতে হবে"। যে সেকশন এখনো তৈরি
> হয়নি, সেখানে সৎভাবে "পরের ধাপে আসছে" লেখা। সব পাতার ঠিকানা আগের মতো; শুধু ডেলিভারি এখন `/admin/delivery/zones`।

| Screen / part | What it does |
|---|---|
| sidebar, top bar | 14 sections in four groups (daily work: Dashboard, Orders, Products, Customers, Delivery, Messages, Support · grow: Marketing, Website · business: Money, Reports, AI Center · bottom: Settings, Help & Build) from [`apps/web/src/lib/admin-shell/sections.ts`](apps/web/src/lib/admin-shell/sections.ts); shown by permission, AI Center to owners only; waiting-work badges (`GET /api/admin/shell/badges`, cached `admin.shell.badgeCacheSeconds` 30 s); icon rail at 768–1023 px; drawer and bottom bar (Home · Orders · Support · Search · More) on a phone; search, bell, EN \| বাং, account menu (open the shop, sign out) |
| section tabs | each section's built pages as tabs, the rest under "More ▾"; "Section › Tab" breadcrumb and the guide button on every page |
| search palette | Ctrl K / ⌘ K / "/": pages, settings, products, orders, customers (`GET /api/admin/search?q=`); `>` actions, `#` order numbers, `?` guides; Bengali words and digits; limits `admin.shell.searchPerGroup` 5, `searchMinChars` 2 |
| guide panel (SH-05, follow-up 84) | the section's or tab's Bengali guide beside the page, read from the deployed docs copy (`GET /api/admin/help/<slug>`); `/admin/help` lists every section with its guide |
| notifications | the person's own (`GET /api/admin/notifications`); none are made yet, so it says so |
| `/admin` — Dashboard (DSH-01) | greeting, date, store; **Delivered sales** (M1, provisional) and **Ordered value** (final) for today / 7 / 30 days through `@extas/metrics` with ▲/▼ and a small line (PR 155, follow-up 90; `metrics.read`); **Needs you now** from the real queues (`GET /api/admin/dashboard/queues`); a role with a start page (`admin.startPages`, PR 495, empty) opens there instead; `?home=1` always shows the Dashboard |
| unbuilt sections | `/admin/orders`, `/admin/customers`, `/admin/messages`, `/admin/support`, `/admin/website`, `/admin/money`, `/admin/reports`, `/admin/ai`, `/admin/settings`: an honest placeholder with the coming pages and links to what exists |
| states (SH-07) | not found (HTTP 404), no permission (names the permission), error with retry and an error id, all inside the shell |
| blank-page safety net (CN-032) | browser translation off site-wide; any page that would go blank shows a Bengali/English screen instead, which first clears this site's cache and stored values by itself (sign-in kept) and reloads once; then **Start fresh** / **Try again**. `/fresh-start` (`/bn/fresh-start?to=admin`) clears only this site's data in this browser, preview cookie kept (`POST /api/fresh-start`, soft or full) |
| moved | `/admin/delivery` → `/admin/delivery/zones` (308); every other URL kept |

Permissions `dashboard.read`, `metrics.read`, `help.read`. Settings registry v33 (`registry-admin-shell.ts`): `admin.shell`,
`admin.dashboard` {ranges [1, 7, 30], afternoonHour 12, eveningHour 17, sparkDays 14}, `admin.startPages` {}. No migration.
Smoke: every admin page and placeholder (`docs/qa/smoke.json` `admin`), the endpoints, the palette, the 404 and the states;
device gate: Dashboard, Help, a placeholder, the not-found state. Guides: [dashboard](docs/admin-guide/dashboard.md),
[sign-in and the shell](docs/admin-guide/login.md). Screenshots: [`docs/qa/screenshots/pr-12/`](docs/qa/screenshots/pr-12).

**The admin look and the V12.4 Dashboard (PR 12, updated 24 Oct, CN-025 / CN-026 (b) / CN-027; demo V12.4 `#/admin`).**
*6 Nov (#86, CN-036): the default look is now **Lumen** (S00 · PR 625–630, above): light by default, the moon for dark per person, the coral accent as a setting, Settings › Admin look with ক খ গ "Planned". The page designs below stay as a light island on Settings › Admin look until their sections move.*

> **বাংলায়:** অ্যাডমিনের নতুন চেহারা (ডেমো V12.4): নতুন রঙ আর কার্ড, বাঁ পাশে "করতে হবে" ড্রয়ার, আর নতুন ড্যাশবোর্ড — শুধু
> ডেলিভারড অর্ডারের বিক্রির বড় গ্রাফ, নিচে আলাদা লাইনে অর্ডারের মোট দাম, অর্ডার এখন কোথায়, কুরিয়ার, সেরা প্রোডাক্ট আর কম স্টক।
> সব সংখ্যা আসল ডেটা থেকে; যে হিসাব এখনো তৈরি হয়নি, সেখানে কোন ধাপে আসবে লেখা। সেটিংস › অ্যাডমিনের চেহারা-তে প্রতিটা পাতার
> ডিজাইন বাছা যায় (টিমের জন্য বা নিজের জন্য) আর গাইড কোথায় খুলবে। লঞ্চের জন্য প্রতিটা পাতার একটাই ডিজাইন; বাকিগুলো লঞ্চের পরে।

| Screen / part | What it does |
|---|---|
| the V12.4 shell | the demo's new tokens and cards (`app/admin/look.css`, scoped to the admin; the shell's AA-safe greys kept); the rail can stay open (cookie); the "To do" drawer lists every queue the person may open, "Mine" first (`admin.todo.mine` by role, else the role's start section), "Later" hides a list for `admin.todo.laterHours` 3 h |
| `/admin` — Dashboard, design A "Calm overview" (the V12.4 default; demo key B) | greeting, date, live time; the **Delivered sales** chart (delivered orders only, on the delivered day, provisional) with the previous period dashed and smoothed `smoothDays` 3, a tip with each day's own figure; **Ordered value** on its own line, never called sales; tiles Orders / Delivery success / Returned parcels; "Where orders are now" (new, confirmed, packed, with the courier, delivered today) with order → courier hours against `targetHours` 24; Best products (by delivered sales, with photos), Couriers, Running low, Needs a look; range Today / 7 / 30 days / custom dates (`?from=&to=`, at most `customMaxDays` 366, compared with the same span before); CSV of the main figures; `?view=money`: the Money & marketing view, where every figure not built yet names its stage (S08, S13, S16) and only the delivered-sales bars are real |
| one loader | `lib/admin-look/dashboard-data.ts`: a design lists its parts (money, stages, delivery, top, lowStock, queues); the loader reads only those, and only the ones the person may see (`metrics.read`, `orders.read`, `delivery.read`, `inventory.read`); money only through `@extas/metrics` |
| `/admin/settings/look` — Settings › Admin look | each page's designs as cards with a sketch: In use, Team default, Use (just for me), Preview (`?design=`), Make team default (`settings.write`), Use team default; one design per page for launch ("One design for now"); where the guide opens (side panel / small window / its own page; a phone always full screen), for the team and for me |
| the registry | `components/admin/look/registry.ts`: a design = one module + one registry line; `pnpm admin:design <page> <KEY>` writes both ([HOW-TO-ADD-A-DESIGN](docs/admin-guide/HOW-TO-ADD-A-DESIGN.md)); the person's choice in `StaffUser.adminPrefs` |

API: `PUT /api/admin/look` (`{scope: me|team, page, design}` or `{scope, guide}`; the team needs `settings.write`, every change in the
settings history). Settings registry v51 (`registry-admin-look.ts`): `admin.look` {pages {}, perPerson on}, `admin.guideOpens`
{desktop panel, phone sheet, perPerson on}, `admin.todo` {laterHours 3, mine {}}, `admin.dashboardDesigns` {targetHours 24,
chartMinDays 14, smoothDays 3, topProducts 5, lowStockRows 5, courierDays 30, customMaxDays 366, sparkWeeks 8}. Migration
`0042_admin_prefs` (one nullable column). Device gate and Lighthouse: the Dashboard, its money view, a custom range,
Settings › Admin look; smoke `figures` read `.a3-num`. Guides: [dashboard](docs/admin-guide/dashboard.md),
[admin look](docs/admin-guide/admin-look.md). After launch (CN-027): Dashboard designs B and C and the other sections'
redesigns (follow-ups 380–388), ~~the guide opening where `admin.guideOpens` says (389)~~ the guide's small-window and own-page modes (389). With PR 594 (CN-026) the help icon in the V12.4 top bar opens the page's guide where `admin.guideOpens` says: the side panel (from 1280 px the page and the top bar move over) or, on a phone, the full-screen sheet; page guides [Dashboard](docs/admin-guide/pages/dashboard/home.md) and [Settings › Admin look](docs/admin-guide/pages/settings/look.md). On a touch screen every admin
control takes a 44 px tap (the drawing stays the demo's) and the faint grey is darkened to AA. Screenshots:
[`docs/qa/screenshots/pr-12-look/`](docs/qa/screenshots/pr-12-look).
- **Follow-ups (#94):** the palette's recent pages per person and the "g d / g o" key jumps (12; registry v263
  `admin.shell`, both off); Settings › More › Start & search (`/admin/settings/shell`) for the start page per role,
  search and badges, the Dashboard cards and those two helpers (495; settings.read to see, settings.write to save,
  audited); with `security.loginLockoutByNetwork` on (registry v271, off) wrong admin passwords pause the e-mail only
  for the network they came from, under a higher per-e-mail ceiling (15).

### S01 · Catalog, media & images — Done (23/23)

> **বাংলায়:** পণ্য রাখা, সাজানো আর ছবির পুরো ব্যবস্থা: রং-সাইজ-SKU, ক্যাটাগরি, কাপড়, নাম-লিংক, ছবি (৫ সাইজ), চালুর আগে
> যাচাই, সাইজ চার্ট, কালেকশন, CSV, লিংক থেকে পণ্য, "আবার এলে জানাবেন", অডিট।

PR 19–39, 590. Register: [S01](docs/MASTER-REGISTER.md#s01--catalog-media--images--pr-1939) · report:
[`docs/reports/2026-10-20-S01.md`](docs/reports/2026-10-20-S01.md). Packages: `@extas/catalogue`, `@extas/media`.

**Catalogue domain (PR 19, 20, 30, 31, 590).** Products and variants keyed by the **ERP SKU** (format setting,
unique per store, never changed, a retired SKU never reused, one variant per colour × size). Prices need
`catalogue.prices` and every change writes PriceHistory. Category tree with sub-categories and inherited garment
types; a changed category link forwards 301. Colour library (one hex, bilingual names and synonyms, family,
"similar shade" note, true-colour photo). Structured fabric and care from owner-editable bilingual dictionaries
(GSM optional, never invented); plain product facts in en/bn for the page and the AI. Naming and links: a real
brand field, shop-wide templates with `{brand} {name} {style} {type} {cat} {colour} {price} {fit} {shop}…`, changed
links forward without chains, every rename kept with a before/after orders report, bulk rename and template apply
with preview + hash.

**Image pipeline and media library (PR 22, 23, 24, 25, 37).** Upload → the original archived byte for byte → 5
sizes (thumb 160, card 400, card2x 800, main 1200, zoom 2000) at 4:5, each AVIF + WebP + JPEG, quality 78, dominant
colour stored, hashed names, reuse by checksum. The watermark is only on the download copy
(`/api/media/<id>/download`); shop images stay clean. `<ResponsiveImage>` serves `<picture>` with srcset (a phone
never gets the 2000 size), width/height always set, colour box, eager first screen. Photo minimum: front, back,
detail, on-model. Media library: search, "where used", orphan archive only by an explicit, logged admin action;
nothing is removed from storage. 26 `media.*` settings.

**Product admin and publishing (PR 21, 26, 29, 35).**

| Screen | What it does |
|---|---|
| `/admin/products` | list with search (name, colour, SKU), status and category chips, counters, issue chips, health score; bulk publish / unpublish / recheck / archive / restore |
| `/admin/products/new` | create a draft |
| `/admin/products/[id]` | edit basics, category, fabric, style, descriptions, care, link and Google fields (with preview), colours, sizes, the SKU × price × stock grid (prices only with `catalogue.prices`, never filled in for the owner), photo slots; one ordered save |
| `/admin/products/queue` | the publish queue: waiting / ready, a Fix link per product; publish refuses until every switched-on check passes |

The publish checklist is a set of switchable checks (`catalogue.publish.checks`); failing checks are named in
Bengali and English; a 0–100 health score with owner-set weights and bands. Screenshots:
[`docs/qa/screenshots/pr-21/`](docs/qa/screenshots/pr-21). Guides: [docs/admin-guide/products.md](docs/admin-guide/products.md) (list, queue, import, audit,
back in stock), [docs/admin-guide/size-charts.md](docs/admin-guide/size-charts.md).

**Size charts (PR 27, 28) — `/admin/size-charts`.** Per garment type and fit; inches stored, cm shown; ease;
how-to-measure drawing; default per category + fit, a product can carry its own; coverage check against the
product's ERP sizes; paste from Excel, add row, copy for another fit, "back to auto"; archived, never deleted.
Screenshots: [`docs/qa/screenshots/pr-28/`](docs/qa/screenshots/pr-28).

**Collections and tags (PR 32).** Manual or rule-based, seasonal (upcoming / live / ended), changed link forwards
301; bilingual tags with a per-product limit. Taking a product out of a collection, a tag off, or a size chart back
to auto **archives the link** (`archivedAt`), never deletes it.

**CSV export and import (PR 34).** Export has no cost, ERP or owner data. Import: preview with row-level errors and a
hash, then apply the same file; never deletes; prices only with `catalogue.prices`.

**Honest "was" price (PR 38).** Source per category: none / MRP / price history / combo sum; shown only from a real,
recorded price. Off everywhere until set (owner answer in CN-009: real MRP where it exists, combos = sum of separate
prices).

**Import from a link (PR 33) — `/admin/products/import`.** Reads a supplier or brand page through the page-reader
adapter (on its mock until switched on); private addresses refused on every hop; makes exactly **one DRAFT** —
never published, a price on the page is never copied, photos not copied.

**Ghost archive and back-in-stock (PR 36) — `/admin/products/back-in-stock`.** A once-live product keeps its page as
out of stock with alternatives (the storefront page comes with S02/S03). Customers leave a phone or e-mail through
the public `POST /api/back-in-stock`; counts need `catalogue.read`, contacts need `catalogue.interest`.

**Product audit (PR 39) — `/admin/products/audit`.** Every incomplete product with its failing checks, live-but-
blocked first; a Fix link opens the right section; stale health rechecked in batches. Screenshots:
[`docs/qa/screenshots/pr-39/`](docs/qa/screenshots/pr-39).

| API (all under `/api/admin/catalogue/`) | Purpose |
|---|---|
| `products` (GET/POST), `products/[id]` (GET/PATCH), `products/bulk`, `products/[id]/form`, `…/publish`, `…/readiness`, `…/colours`, `…/tags`, `…/naming`, `…/facts` | products, the edit form's save, publishing, checklist, colours, tags, names, plain facts |
| `variants`, `variants/[id]`, `sizes`, `sizes/[id]` | variants by SKU or product; sizes |
| `categories`, `garment-types`, `colours`, `fabrics`, `brands` (+ `/[id]`) | the libraries |
| `naming`, `naming/preview`, `naming/templates`, `naming/bulk-rename`, `naming/renames(/[id])`, `naming/redirects(/[id])` | names, links, 301s, rename history |
| `publish-queue`, `audit` | publish queue, audit report |
| `size-charts(/[id])`, `size-charts/[id]/copy`, `size-charts/assign`, `size-charts/unassign`, `size-charts/resolve` | size charts |
| `collections(/[id])`, `collections/[id]/products`, `tags(/[id])`, `tags/[id]/products` | collections and tags |
| `csv/export`, `csv/import` | catalogue CSV |
| `was-price`, `was-price/resolve` | "was" price sources |
| `link-import` | import from a link |
| `back-in-stock`, `back-in-stock/requests` | interest counts; contacts and marking |

Media API: `/api/admin/media` (search, upload), `/api/admin/media/[id]`, `/orphans`, `/regenerate`,
`/products/[productId]`; public `/media/<key>` and `/api/media/<id>/download`.

Permissions: `media.read/upload/manage`, `catalogue.read/write/prices/publish/import/export/interest`. Settings:
`catalogue.*`, `naming.*`, `media.*`. Tests: package tests in `packages/catalogue/test` and `packages/media/test`
(pure + PostgreSQL), API tests in `apps/web/src/lib/*.db.test.ts`, UI model tests beside the components.

**Built (PR 609): import from the ERP by style code, the buying price and the selling-price floor** (CN-028, CN-029
Phase 1; only for a store on ERP contract v6, behind `erp.model`; no migration).

> নতুন (PR 609): ERP-র স্টাইল কোড লিখলে সব SKU খসড়ায় চলে আসে; ERP থেকে কেনা দাম রাখা হয়, বদলালে জানায়; মালিক সবচেয়ে কম মার্জিন দিলে তার নিচে দাম, কম্বো বা ছাড় যায় না (খালি = বন্ধ)।

- **Screen:** `/admin/products/erp-import` (Products › more ▾ › Import from ERP; `catalogue.import`; guide
  [`docs/admin-guide/pages/products/erp-import.md`](docs/admin-guide/pages/products/erp-import.md)). Type a style code →
  preview of every SKU (colour, size, barcode, grade, buying price) read with the store's own ERP key → import as drafts
  grouped into one product. A missing colour or nothing new is refused; on the practice ERP it previews only; a store on
  contract v5 is refused. At switch-over a product made before the ERP that holds the style's SKUs is adopted (it gets
  the style code); SKUs in other products or rows the shop cannot take are listed and stop the import before anything is
  written; the whole import is one transaction. A re-import never turns a variant back on.
- **B grade** is its own listing when `catalogue.bGrade.listing` is on (off), named with `catalogue.bGrade.nameSuffix`
  (registry v65, `registry-bhandari-p1.ts`).
- **Buying price** ("bought from ERP at", `ProductVariant.shopPriceMinor`, never shown to customers) from the import,
  `variant.changed` and `shop-price.changed`; a change is listed under "Buying prices that changed" until marked seen
  (`catalogue.shopPrice.changesShown` at once). A late, older price never replaces a newer one. The shop never changes a
  selling price by itself.
- **Floor** (`catalogue.floor.minMarginPercent`, the owner's own number, empty = off): a variant price or a combo set
  price below buying price + margin is refused (`BELOW_FLOOR`); the CSV preview shows it as an issue; in the bag, at
  checkout and on the product page every discount, coupon and set tier stops at the floor (`Quote.floorHeld`).
- API: `GET/POST /api/admin/inventory/erp/style`, `GET /api/admin/inventory/shop-prices`, `POST …/shop-prices/seen`.
  Tests: `packages/inventory/test/erp-import.db.test.ts` (store A and B never touch each other), rules, combos and
  catalogue floor tests.

**Left for later stages:** the image worker on BullMQ (inline until then), zoom viewer and storefront pages (S02),
storefront size chart / collection pages and "was" price display (S02), AI spec-sheet reading (AI stage), sending
back-in-stock messages (notifications).

- **Follow-ups (#93, PR 609):** the selling-price floor, display only — the rules simulator prices with the floor and
  says how often an offer stopped at it, the offer editor says so beforehand (while `catalogue.floor.minMarginPercent`
  is set), and "Buying prices that changed" names the fixed-price sets now below the floor. Nothing changes a price.
- **Follow-up (#96, PR 609):** the order keeps what its offers held back at the price floor (`Order.floorHeldMinor`,
  migration 0178) and the admin order page says "Offer stopped at the lowest price (held back)" with the amount
  (display only).

### S09 · Inventory & ERP sync — Done (19/19)

> **বাংলায়:** স্টক আসে ERP থেকে। ব্যাগে রাখা পিস আটকে রাখা, অর্ডার ERP-তে কাগজ হিসেবে পাঠানো, কম স্টকের সতর্কতা,
> বারকোডে গোনা, সিঙ্ক ঠিক চলছে কিনা দেখার পাতা, আর স্টকের আসা-যাওয়ার রিপোর্ট। আসল ERP-এর কী না বসানো পর্যন্ত
> "প্র্যাকটিস ERP" চলে — আসল স্টকে কিছু বদলায় না।
> নতুন (PR 607, 608): ERP-এর নতুন চুক্তি (v6) তৈরি, সুইচ `erp.model` দিয়ে — এখন সব দোকান আগের মতো v5-এ চলে। প্রতিটা দোকানের
> নিজের ERP চাবি; এক দোকানের চাবি দিয়ে অন্য দোকানের কিছু দেখা বা লেখা যায় না। ERP-এর প্রতিটা খবর একবারই, চিরকাল রাখা হয়।
> নতুন (PR 610, 611, শুধু v6 দোকানে): অর্ডার প্রতিটা পিস আলাদা লাইনে পুরো টাকার দামে ERP-তে যায়; ERP "এখন না" বললে অর্ডার
> অপেক্ষা করে আর নিজে থেকেই আবার যায় (অ্যাকাউন্ট হোল্ডে থাকলে চেকআউট বন্ধ)। কুরিয়ার পার্সেল নিলে শিপমেন্ট, প্রতিটা ডেলিভারির
> ফল ERP-তে যায়; অর্ডারের পাতায় "ERP অর্ডার" কার্ড, শর্ট লাইনের সিদ্ধান্ত আর আংশিক ডেলিভারির বক্স।

PR 194–207, 497–499, 607, 608, 610, 611. Register: [S09](docs/MASTER-REGISTER.md#s09--inventory--erp-sync--pr-194207). Packages:
`@extas/inventory`, the ERP adapter in `@extas/adapters`.

- **ERP adapter (PR 498).** One contract (health, variants, stock, stock for one SKU; stable error codes), an HTTP
  client for [`docs/ERP-API-CONTRACT.md`](docs/ERP-API-CONTRACT.md) (Bearer key, timeout, Retry-After, rows checked
  one by one), webhook signature check (HMAC-SHA256, age limit), and a practice ERP with sample companies and
  warehouses. A second ERP is one more adapter.
- **ERP mode and guard (PR 497, 499).** Per store: our ERP · another ERP · no ERP. Every ERP-dependent path has a
  written behaviour for no ERP / practice / not usable / connected (`ERP_DEPENDENT_PATHS`).
- **Sync layer (PR 194).** Timeouts, retry with backoff and jitter, Retry-After honoured, AUTH and bad requests never
  retried; errors in plain words on ErpSyncRun / ErpSyncState; a key never appears in an error.
- **Stock pull (PR 195).** Per SKU / colour / size into StockLevel (variant × location), incremental, paged,
  resumable; one idempotent StockMovement per change; unknown SKUs counted, never guessed.
- **Company and warehouse mapping (PR 196).** The key decides the company, checked before every sync
  (`COMPANY_MISMATCH` stops it); local warehouses link one-to-one to ERP warehouses.
- **ERP webhooks (PR 196, CN-022, 23 Oct).** `POST /api/erp/webhook` takes the ERP's `stock.changed` and
  `variant.changed`: signed with the webhook secret from the vault (no secret → every request refused with 401),
  timestamp window, stored once in `WebhookEvent` (a retry within `erp.webhook.dedupeHours` is the same event),
  applied by the background worker; a change older than the shop's copy is ignored, and the poll afterwards adds no
  second movement. `variant.changed` refreshes the ERP mirror (barcode, ERP price, average cost), never the sale price.
  The poll stays the fallback; the practice ERP makes signed test events. Answers in [`docs/ERP-API-CONTRACT.md`](docs/ERP-API-CONTRACT.md).
- **Warehouses and locations (PR 201).** Warehouse, showroom, in transit, damaged; every warehouse keeps a damaged
  bin; damaged stock is never sellable; nothing deleted.
- **Cart holds (PR 197, 198).** One shared stock pool across stores, so two stores never sell the last piece twice;
  row locks in id order, retried; holds expire and are swept; never pushed to the ERP. Callers arrive with S04.
  **Review round 2 (31 Oct, #72):** an unpaid order's hold (payment pending or failed, or waiting for an advance) ends
  after `inventory.reservation.unpaidHoldHours` (v121, 24 h, 0 = keep while open); an open order's hold is renewed half
  its time before expiry, so there is no gap where a piece sells twice.
- **Order push (PR 199, 200).** A business document through a transactional outbox, never journal lines; relay with
  backoff, a dead state after the set tries, "send again" by hand; a deterministic idempotency key, so a retry never
  moves stock twice.
- **Low stock (PR 202).** Per variant on the shared sellable number; threshold 2 by default with per-SKU overrides;
  raises once, clears on restock. Messages wait for the notification stage (BLOCKED 16).
- **Oversold stock is never hidden (follow-up 16, SIM-F-006).** The shared balance is never clipped: −1 shows as −1
  on the stock answer, the colour × size grid (`balance`, totals `short`) and the low-stock alert. Every open order
  still waiting to be packed with a short SKU gets one shortage card (`PackingIssue` kind `SHORTAGE`, after every
  stock change and in the low-stock sweep); booking with a courier is refused while it is open (`assertBookable`,
  `SHORTAGE_OPEN`); a person with `inventory.audit` decides — swap the size, ship the rest, cancel the line, or the
  piece was found (`decideShortage`, audited; the order flow carries it out). Cards never close by themselves. The
  packing screen that shows them comes with S08 (follow-up 123).
- **Stock count (PR 203).** By barcode or SKU, one open count per location, a reason for each difference; a report
  only — the ERP's stock is never changed (BLOCKED 14).
- **Publish by real stock (PR 204).** Check `sellableStock`, off by default (BLOCKED 15); "find new styles in the ERP".
- **Sync health, re-sync, movement report (PR 205, 206, 207).**

| Screen | What it does |
|---|---|
| `/admin/stock` | sync health verdict (ok · practice · late · failing · down · off), last pull and its age, ERP connection and mode, documents waiting / failed / dead with "send again", pieces held in checkout, low stock, publish queue with real stock, recent runs; "sync all stock now" and one product. Opens even when the ERP is down |
| `/admin/stock/counts` · `/admin/stock/counts/[id]` | start a count of a location; scan + quantity (Enter keeps the field ready for a scanner), compare with the ERP, reasons, finish or cancel |
| `/admin/stock/movements` | per SKU and location: opening, in, out, closing, a mark where the ledger does not add up; reconcile with the ERP |

Guide: [docs/admin-guide/stock.md](docs/admin-guide/stock.md).

| API (all under `/api/admin/inventory/`) | Purpose |
|---|---|
| `erp` (GET/PUT), `erp/verify`, `erp/warehouses`, `erp/styles` | mode and mapping; which company a key belongs to; ERP warehouses; ERP styles not in the shop |
| `stock`, `low-stock`, `health`, `publish-queue` | stock per SKU or grid; alerts; health panel; queue with real stock |
| `warehouses(/[id])`, `warehouses/[id]/locations`, `locations/[id]` | warehouses and locations |
| `pushes`, `pushes/retry` | documents sent to the ERP; send again |
| `resync`, `reconcile`, `movements` | re-sync now; check against the ERP (changes nothing); movement report |
| `audits(/[id])`, `audit-lines/[id]` | stock counts |

Public (no session, signed): `POST /api/erp/webhook` — the ERP's webhooks (PR 196).

Permissions: `inventory.read/locations/erp/sync/audit`. Settings: `erp.*`, `inventory.*` (registry v11; `erp.webhook.*` v22). Tests in
`packages/inventory/test` and `packages/adapters/test` (pure + PostgreSQL, including two carts racing for the last
piece). Screenshots: [`docs/qa/screenshots/pr-205/`](docs/qa/screenshots/pr-205). No schema change in S09 before PR 607.

**Built (PR 607, 608): ERP contract v6, one ERP company per store, and the event ledger** (CN-028, CN-029 Phase 0; backend only, no
admin screen). Migration `0049_erp_v6` (additive), settings registry v62 (`packages/settings/src/registry-erp-v6.ts`), new package
`@extas/erp-types`.
- **The switch (607):** `erp.model` per store, empty (= `v5`) by default, so nothing changes until the ERP announces its switch date.
  In v6 the shop never reads the ERP's retail price or average cost, and the retired v5 calls (returns, delivered / returned
  statuses) are kept as RETIRED rows, never sent. The switch is one-way, so it needs the owner's written OK and only PR 619's
  switch-over sets it. The practice ERP speaks all of v6, so every flow runs with no real key.
- **One store = one ERP company (§16):** each store talks to the ERP through its own connection, with its own key and secrets in the
  vault under its id; on the practice ERP each store gets its own sample company and key (`SAMPLE-CO-<storeId>`). Store A's key can
  never read or write store B (test on PostgreSQL). A store with only a shared connection keeps working in v5 and is refused in v6
  (`SHARED_LINK`); a key of a company another store's link holds is refused (`SHARED_COMPANY`), also by the database.
- **Event ledger (608):** every v6 event is kept once by its eventId on the store's own ERP link (`ErpStoreLink`), forever; the body
  of a stored event can never change (a database trigger). Webhook and hourly pull (`erp.events.pullMinutes`, resuming from its
  cursor when `erp.sync.maxPagesPerRun` stops it) are one ledger; a correction that arrives first waits for its original (failed
  after `erp.events.correctionWaitHours`) and undoes only what was applied; a missing or damaged piece becomes one courier claim.
  The event belongs to the store whose secret signed it; two stores sharing a secret are refused (`SHARED_SECRET`). A broken event
  or a known eventId with another body is kept, never applied, and shown on Stock → ERP connection.
- **Shared foundation for PR 609–618:** every new table (orders and lines, delivery results, account and its ledger, payments, the
  return pipeline, return lists, exchanges, daily summaries, fixed costs, books runs, closes, differences and adjustments) with
  storeId and the store's link (a composite key, so a row can never hang on another store's link); lump-sum money as BIGINT;
  ten of them append-only for the app's role, one reversal per entry. Every §11 setting (`erp.hold.*`, `erp.account.*`,
  `erp.summary.*`, `erp.fixedCosts.*`, `books.*`, `exchange.*`, `returns.handback.photo`, `catalogue.bGrade.listing`,
  `catalogue.floor.minMarginPercent`) and every §12 permission (`returns.handback`, `exchange.approve`, `books.*`,
  `erp.account.read`, `erp.payments.record`, `fixedcosts.write`).
- **Tests:** contract and practice ERP (`packages/adapters/test/erp-v6*.test.ts`), the shared helpers and their database enums
  (`packages/erp-types`), the ledger and the §16 isolation on PostgreSQL (`packages/inventory/test/erp-v6.db.test.ts`), the
  append-only ledgers (`packages/db/test/append-only.db.test.ts`), the settings (`packages/settings/test/registry-erp-v6.test.ts`).

**Built (PR 610, 611): orders, shipments and delivery results to the ERP v6** (CN-028, CN-029 Phase 1). Only for a store whose
`erp.model` is v6; in v5 nothing changes and the order page's ERP card draws nothing. Migration `0053_erp_orders_v6` (additive:
`ErpPush.keyRound`, `heldReason`), settings registry v66 (`packages/settings/src/registry-erp-orders-v6.ts`).
- **The order (610):** one line per piece (`lineId` `<order number>-<n>`, quantity 1), its `customerPrice` in whole taka (the
  order's discount spread over the lines by value, a combo's remainder on its last piece: 1600 over 3 → 533, 533, 534), with
  `deliveryCharge`, `advancePaid` (paid online + wallet) and `grade`. The pieces are ErpOrder / ErpOrderLine rows kept with the order
  (their ids stay the same across revisions); the ERP's `erpTotal`, each line's `shopPrice` and `fromReturnStock` are stored.
- **"Not now" from the ERP (610):** a 409 the ERP keeps against its Idempotency-Key is HELD with its reason and goes again by itself
  under a new key round (`<key>:k<n>`): `ACCOUNT_ON_HOLD` (checkout pauses with `PAUSED` while `erp.hold.pauseCheckout` is on, the bag
  kept, until `account.released` or the account check says released), `INSUFFICIENT_STOCK` (when the ERP has the stock, at the
  latest after `erp.orders.refusedRetryMinutes`), `NO_SHOP_PRICE` (that SKU is not sold until the ERP takes it), and a shipment's
  `LINE_WAITING`. An order cancelled in the shop before the ERP had it is never sent (FAILED `ORDER_CANCELLED_BEFORE_SENT`).
- **Short lines (610):** `order.line.short` (a Return-stock piece failed the packing check) makes the line SHORT; the order page
  offers WAIT, REPLACE (another SKU) or CANCEL (`orders.lines`, audited, `PATCH /orders/{id}/lines/{lineId}`); `order.line.filled`
  opens it again and the held shipment goes. The order check job `inventory.erp.checkOrders` (every `erp.account.checkMinutes`) reads
  the account and the ERP's own copy of the open orders of the last `erp.orders.catchUpDays`, so a lost webhook or answer is
  caught up (follow-up 490).
- **B-grade lines closed (610, CN-033, 31 Oct; #69):** `erp.orders.bGradeOpen` (v72, off as shipped): while off a B-grade
  piece is not sold on a v6 store and no B-grade REPLACE is asked for; an order the ERP refuses with `422` naming `bGradeSkus` is
  HELD as `B_GRADE_CLOSED` with an admin message (not failed) and goes again once the switch is on.
- **Shipment and results (611):** `POST /shipments` when the courier confirms pickup (that is when the ERP bills; never at booking),
  every courier result (DELIVERED, PARTIAL, RETURNED) by `PUT /orders/{id}/delivery` once, with what was collected; a "Delivered"
  a true-delivery check (PR 525) holds waits, and the resolved truth goes. The **Partial delivery** box on the order page (kept lines,
  amount paid, discount promised by phone, phone-confirmed, note; `delivery.outcomes`) is required when the courier says partial,
  sent again whenever it changes, and closed once the parcel is handed back. The ERP's identification (green, yellow, orange) shows
  on the order page. The delivery charge and underpaid amounts stay in Retail's own books.
- **Screens:** the ERP card on `/admin/orders/<id>` (state and why it waits, the hold band, ERP total and shop prices with
  `erp.account.read`, "From ERP return stock", the line decision, the identification, the Partial delivery box), the hold warning and
  "held by the ERP" count on Stock → ERP connection. Routes: `GET /api/admin/orders/:id/erp`, `POST …/erp/lines/:lineId`,
  `POST …/erp/partial-delivery`. Guide: [`docs/admin-guide/pages/orders/order.md`](docs/admin-guide/pages/orders/order.md).
- **Tests:** whole-taka pieces (`packages/inventory/test/erp-orders-v6.test.ts`); the holds, the catch-up, the handlers and store
  isolation on PostgreSQL (`packages/inventory/test/erp-orders-v6.db.test.ts`); the whole journey through the real checkout and the
  courier (`packages/shipping/src/erp-v6.db.test.ts`); the routes (`apps/web/src/lib/orders-api.db.test.ts`), the card's words
  (`apps/web/src/lib/admin-orders/erp.test.ts`), the settings (`packages/settings/test/registry-erp-orders-v6.test.ts`).

### S02 · Storefront — Done (58/58)

> **বাংলায়:** দোকানের কাঠামো (হেডার, মেনু, ফুটার, নিচের বার), চারটা থিম, লোগো, বাংলা আর ইংরেজি, হোম পেজ (হিরোর চলন্ত ছবি, ক্যাটাগরি, নতুন পণ্য, রিভিউ, ঘড়িসহ ফ্ল্যাশ সেল — মালিক সেল দিলে তবেই দেখায়) ক্যাটাগরি পেজ (ফিল্টার, সাজানো, আটকে থাকা বার, প্রশ্ন-উত্তর), পণ্যের পাতা (ছবি আর জুম, প্রতিটা রঙের নিজের লিংক, সাইজ, সাইজ চার্ট, স্টক, দাম, এক্সচেঞ্জ-ডেলিভারির কথা Smart Rules থেকে, কাপড় ও যত্ন, ব্যাগে রাখুন, নিচে "এর সাথে পরুন" আর "আগে দেখা" সারি; তিনটা টেমপ্লেট T1, T2, T3; "আমার সাইজ খুঁজুন" — উচ্চতা আর ওজন দিলে প্রোডাক্টের নিজের চার্ট থেকে সাইজ, কারণসহ), ক্রেতাদের রিভিউ (ছবিসহ রিভিউ আগে, অনুমোদনের পরেই দেখা যায়), উইশলিস্ট, ফোনের মেনুতে সাব-ক্যাটাগরি, সাহায্যের পাতা (প্রশ্ন-উত্তর, এক্সচেঞ্জ, যোগাযোগ …) আর সার্চ (হেডারের খোঁজার জানালা, লিখতে লিখতে পরামর্শ, ফলাফলের পাতা ফিল্টার আর সাজানো সহ, বাংলা শব্দেও) তৈরি — ডেমো V12.2-এর মতো। পাতাগুলো এখন আরও তাড়াতাড়ি হাতে সাড়া দেয় (পণ্যের পাতায় আটকে থাকার সময় 263 থেকে 24 ms), দেখতে একদম আগের মতো।

**Built (PR 82, 501, 503, 84, 42, 40, 85, 41, 43, 45, 46, 47, 48, 54, 55, 56, 57, 60, 61, 62, 63, 64, 49, 53, 67, 68, 69, 70, 71, 74, 75, 72, 73, 52, 50, 58, 51, 88, 66, 87, 86, 59, 65, 44), matched to demo V12.2 (CN-012).**
- **Screens / routes:** `/` and `/bn` (home), `/collections/<slug>` and `/bn/collections/<slug>` (category pages; `new-in` = the newest styles of every category), `/p/<product>` and `/p/<product>/<colour>` with `/bn/…` (product pages; the prefix is the setting `naming.productPathPrefix`), `/account/wishlist` (wishlist), `/help/faq`, `/help/delivery`, `/help/exchange`, `/help/privacy`, `/help/terms`, `/help/story`, `/help/contact` (help pages), `/search?q=` and `/bn/search?q=` (search results; `GET /search/suggest` answers the header panel), `/checkout` (empty checkout with the slim header), the shop 404; every
  storefront route not built yet shows "Coming soon" in the shell (CN-010). `/status` is the progress page.
- **Shell (40):** announcement bar, header, phone menu, bottom bar, footer (phone bands with the social row incl.
  WhatsApp; desktop: the owner's reference layout with link icons, WhatsApp and Hotline boxes, social tiles); the
  "Get new drops first" form waits for the sign-up list (PR 123 / 298; CN-017).
- **Footer payment marks (6 Nov, #84, PR 40 follow-up):** the footer's "Payment methods we accept" marks come from the
  checkout's own live payment offer (`lib/shop/pay-offer`, shared with "Ways to pay" at `/help/payment`): a mark shows only
  while the owner keeps it on and the checkout offers its method now, so at go-live (Cash on Delivery only) bKash, Nagad,
  Visa and Mastercard no longer show; phone, classic and reference footers alike.
- **Themes, brand, language (82, 501, 503, 84):** four themes on one token set (contrast tested), the 11 logo styles,
  English at `/` and Bengali at `/bn` with a language gate test (CN-017). **Bengali pages fixed (31 Oct, #71, PR 84
  follow-up):** on the production server `/bn`, `/bn/bag`, `/bn/help` and `/bn/help/faq` came out in English; the
  rewrite now carries the server's own mark, so every `/bn` page stays Bengali; smoke check: `/bn/bag` has `lang="bn"`.
- **Home (41, 43):** sections in the owner's order, hero text panel, the hero's sliding pictures with fitted pins,
  category tiles, new in, reviews; one slider engine with separate touch / mouse / keyboard pauses, each with a
  tested resume (42). The hero's default words make no count, season or year claim; a test keeps every shop word
  and setting default free of such claims (CN-017).
- **Flash sale (44):** two rows gliding opposite ways on the one slider engine (each pause with its resume; a short
  sale repeats its cards, hidden from screen readers and Tab) and a countdown that ticks after the first paint, stops
  at zero and hides the section. The sale is the owner's (`home.flashSale`, empty: nothing is drawn until he sets
  one): on, start and end, and the owner's products, a collection or every real markdown. A sale never changes a
  price: the struck price and "Up to N% off" come only from the PR 38 rule. The section is laid out only as it
  nears the screen (TBT). `/?try=flash` fills a sample sale on test servers only; screenshots
  [`docs/qa/screenshots/pr-44/`](docs/qa/screenshots/pr-44/README.md); the admin page is follow-up 310.
- **Category page (45–48):** crumbs, title and blurb, the grid with "Showing X of Y" and Show more (24 a page), the
  no-match state, the SEO block and questions (general ones only when their rule is on); filters built from the
  category's own products with live counts (a sold-out size is crossed out, never hidden), price bands from its own
  prices, the owner's quick chips; the sort as a real listbox; the phone's sticky Filter · Sort · On sale row and
  the desktop's active filters. Every choice is in the address, so a shared link opens the same page.
- **Product page (49, 54–57, 60–64):** template T1. Phone: photos, the buy column and the buy bar held at the bottom;
  computer: photos left, a sticky buy column right, the breadcrumb, and a slim bar under the header once the buttons
  have scrolled away. Photos: one swipe strip per colour, arrows, thumbnails, a full-screen zoom (pinch, double tap,
  keyboard), on a computer a slightly shorter photo with at most 5 thumbnails, the last "+N". Colours: swatches, each
  colour its own address (a shared link opens that colour), "All N colours" and its sheet. Sizes on one row from S to
  4XL, a size sold out everywhere crossed out and never hidden (SIM-F-035), the chosen size's measurements, the size
  chart popup in inches or cm; "Tell me when it is back" is built and off until the alert is sent (PR 71). Stock line
  and "Only N left"; price block (struck price only by the honesty rule; the ৳ never split from its number); the
  promise row and Delivery · Exchange · Returns from the live Smart Rules (the same exchange window and free-delivery
  limit as the bag; nothing said without a live rule); Fabric & care and the details. "Add to Bag" and the
  added-to-bag panel are the bag's own (S04); "Order Now" goes to checkout. A product taken off sale keeps its page,
  all sold out.
- **Product page extras (53, 67–70):** the first-screen budget (`pdp.fit`: on a phone the sizes and the
  measurement line always end above the buy bar; the device gate checks it on every product page); "Wear it with" and
  "You may also like" rows by category and "Recently viewed" from this browser, each sliding with its own touch /
  mouse / keyboard pauses; the floating rail (heart, WhatsApp) and the share tiles (Facebook, Messenger, WhatsApp,
  Instagram, copy link), the rail off by default as in the demo; the site-wide floating WhatsApp button is a switch,
  off (the header's icon does the job), with a choice per kind of page.
- **Templates and Find My Size (50–52, 58):** a product page uses the product's own template (chosen at upload), else
  its category's (the nearest up the tree), else the shop's default T1; `?template=T2` previews another (never
  indexed). T2 Editorial: on a phone the next photo peeks in, on a computer every photo stacked two across beside a
  410 px buy column, a white page and a larger title. T3 Fit-first: the sizes, the finder and the chosen size's
  measurements in one card (no frame on a phone; on a computer the finder box after the buttons), thumbnails under the
  photo. Find My Size: height and weight give a size from the product's own size chart and its ease, with the reasons
  in plain English and Bengali (what the chest or waist needs, the room this fit gives, the length for the height),
  never offered without a chart; the card under the sizes (T1, T2) opens a popup with hold-to-repeat steppers; the
  answer is kept on the phone (a small cookie, 365 days), so the size opens chosen and tagged "Your size"; "Not sure?
  Find my size" in the size chart; `?finder=1` opens it. Each answer is kept for the size reports (PR 59) with no name
  or phone, worked out again on the server (`POST`/`PATCH /api/size-finder`). The SIM-F-012 test checks that a size
  question in chat gets the same size (`answerSizeText`).
- **Wishlist (71):** hearts kept for this browser on the server (no login), the wishlist page with Add to bag (the
  saved size), Choose a size and Remove, the empty list with the newest products on a computer, the bag's "Move to
  wishlist" with Undo; "Tell me when it is back" waits for a real sender (follow-up 70).
- **"Send us a message" on the contact page (1 Nov, #75, PR 75 follow-up, go-live gate customer 360°):** `/help/contact`
  has the demo's form (name, phone, order number, message); it lands in Support › Inbox as a conversation from his number,
  linked to the order he names only when it was placed with that number. The same form twice is one message; one number
  may send `perPhonePerDay` a day; a message is at most `maxChars`. Off as shipped (`pages.contactForm`, registry v231);
  the switch and both numbers are on Settings › Policies & texts › Contact. Nothing is sent to the customer and nothing
  changes an order. Guide `pages/settings/policies.md`; tests on PostgreSQL (support, shop API, admin API) and the form.
- **Menu and help pages (74, 75):** the phone menu opens a category's sub-categories in place ("View all" first, a
  count on each row); help pages from the live Smart Rules' texts, the owner's own words and the store's details —
  privacy, terms and our story wait for the owner's words and say "Coming soon" until then (CN-017); on a computer a
  help centre with the topic list and "Still stuck?". The phone header keeps a two-word store name on one line with
  the WhatsApp disc on (follow-up 59).
- **Search (72, 73):** the header's search icon and the phone menu's "Search" open the demo's window on a phone and
  the panel under the header on a computer (D-014); while typing it suggests help pages ("delivery", "exchange",
  Bengali words; a page still "Coming soon" is never offered), categories and products, with "See all N results".
  One index across products, categories and help pages with prefix, typo and synonym matching and Bengali keywords
  (sample lists in `search.words`, the owner adds his own later); Meilisearch when its URL and key are set on the
  server and its index is current, otherwise PostgreSQL, so search always works (`@extas/search`); the worker's
  `search.index` job indexes once per catalogue version. Only live, sellable products appear. The results page
  (noindex) shows the help answers, the categories found and the category page's own listing (filters, "Best match"
  sort, Show more; a size sold out in every colour crossed out, never hidden: SIM-F-035); when nothing is found it
  says so and offers "Did you mean …", popular words or categories, WhatsApp (only with the store's number) and the
  products with some of the words. A misspelt general word ("shrit" for "shirt") is dropped on Meilisearch as on
  PostgreSQL, so "pollo shrit" finds the polo (follow-up after the go-live gate's third live run, #79).
- **Speed (88):** the first load no longer blocks the phone: every script chunk carries V8's compile hint, so Chrome 136+
  compiles the code on a background thread while it downloads (`tools/compile-hints.mjs` runs after `next build`); the
  size chart, the Find My Size window and the photo viewer load only when opened (fetched once the page is idle, so a tap
  opens them at once); every heart reads one shared copy of the wishlist; the product page re-fits only when its fonts
  arrive late. Seeded Lighthouse blocking time (median), before → after: product page T1 263 → 24 ms in English and
  254 → 80 ms in Bengali, T2 and T3 at most 110 ms, every other storefront page 24–122 ms; the look is pixel for pixel the
  same. The register's weights (a category page under 1 MB, a category image under 40 KB, a product image under 150 KB)
  are checked on the seeded runs in CI (`docs/qa/page-weight.json`, `tools/page-weight.mjs`); with the real photos on the
  preview and from Dhaka over 4G later (follow-ups 160, 161).
- **Questions, celebration, sweeps (66, 87, 86):** "Questions & answers" under the product page shows only the
  questions the shop answered and approved (`ProductQuestion`, APPROVED, answered, not archived; never one made up): the
  newest open in its own box with who answered and when, the others folded, 3 at first and "See all questions · N more",
  then "Not answered here?" with the WhatsApp button and the hours; with no answered question only the WhatsApp ask, and
  without a WhatsApp number no block (`pdp.qa`, on; drawn on the server with the browser's own `<details>`, no script).
  The thank-you page's celebration (`thanks.celebrate`, off): balloons or light streaks with the owner's words for an
  occasion's days, at most 2.5 s, any tap skips it, never blocking the page, never on a slow or low-end phone, the still
  words for reduced motion, `?celebrate=preview` to see it first. The light sweeps: one place knows every sweep of the
  shop, a master switch and one switch per sweep (`shop.sweep`; Add to Bag off as designed), written as one small
  stylesheet only when the owner changes something; the checkout and Order Now buttons keep theirs when "all other green
  buttons" is off; reduced motion always wins. Screenshots: [`docs/qa/screenshots/pr-136/`](docs/qa/screenshots/pr-136).
- **Reviews and size learning (65, 59):** the product page shows the buyers' own reviews above the questions — the
  summary box (the average, the stars, how many), the rating line under the title that jumps down to them, and up to
  3 cards in one sliding row with the photo reviews first, each card carrying only what its review really has (his
  words, "Verified buyer" from the order, "5'9" · 72 kg · bought M", how the size felt, his photo); the row uses the
  one slider engine, so its mouse, touch and keyboard pauses each have a tested resume; a product with no approved
  review shows no block and no rating at all (`pdp.reviews`, on; max 3, photos first). A review can only come from a
  buyer, from My account, about a line of his own **delivered** order, within 90 days, one per line
  (`reviews.submit`; he may give how the size felt, his height, his weight and one photo up to 8 MB). Every review
  waits as PENDING: it is in no page, no average and no search-engine rating until staff approve it through
  `/api/admin/reviews` (permissions `reviews.read`, `reviews.moderate`, `reviews.write`: approve, hide, reject, put
  back, the verified mark, and the shop's own reviews from WhatsApp), and hiding it takes it off the page again.
  Nothing is ever deleted. The photo-review reward is **off with no amount**: when the owner switches it on and types
  his own figure it is credited once, at approval, as one entry in his wallet ledger, keyed by the review, at most
  one per order (`reviews.photoReward`; CLAUDE.md rule 6, CN-018). SIM-F-008 is checked end to end as a test: review
  submitted → in the shop → approved → on the page → wallet credited. Find My Size now learns from real answers
  (`catalogue.sizeAdvice`, 59): the report groups every recorded answer by garment type and fit — followed, went up,
  went down, with the exchanges and the approved reviews behind them — and flags a chart that keeps running tight or
  loose; it can train a new ease per group, which **arrives switched off** until the owner turns it on
  (`/api/admin/size-advice`, permission `catalogue.sizeAdvice`). Neither has an admin screen yet: the moderation
  queue and the size report go on the new 14-section admin shell (follow-ups 230, 231).
- **Follow-ups (23 Oct; 41, 40, 45, 56, 74, 222):** on a computer a card shows its back view and Quick add with the
  size buttons on mouse hover or keyboard focus (`card.desk`, on; `GET /api/shop/card/<id>`; the bag's own added panel,
  also on the home and category pages), and the home page's cards fit like the category page's; the phone slogan steps
  to its short form, then out, and the footer's slogan wraps; BreadcrumbList and ItemList JSON-LD on category pages and
  Product, Offer and BreadcrumbList JSON-LD on product pages from their own price and stock, no rating
  (`seo.structuredData`, on; Organization is still to come, follow-up 110); the owner's word under each size box
  (`pdp.sizeWords`, empty = off) and "Your size" on the size this browser last put in the bag (`pdp.usualSize`, off);
  a sample sub-category so the gate measures the menu accordion.
- **Settings:** `theme.*`, `brand.*`, `shell.*`, `language.*`, `slider.engine`, `home.*` (registry v16; `home.hero` v17; `home.flashSale`, `home.flashRows` v45), `category.*` (registry v17), `pdp.*` (registry v19: page, gallery, colour, size, chart, stock, price, trust, rules, details, buy, sweep; no admin screen yet, CN-019); registry v23: `pdp.fit`, `pdp.rows`, `pdp.icons`, `pdp.share`, `shell.fab`, `shell.menuSubs`, `wish.list`, `pages.help`, `pages.text` (owner data); registry v28: `pdp.templates` (default T1, per category, T2 and T3 options), `pdp.finder` (the body estimate, tolerance, length check, stepper range, keep and record switches); registry v24: `search.engine`, `search.match`, `search.words`, `search.help`,
  `search.panel`, `search.results`. No schema change, no new permission.
- **Settings (66, 86, 87):** `pdp.qa` in `registry-product.ts` and `shop.sweep`, `thanks.celebrate` in
  `packages/settings/src/registry-motion.ts` (registry v31), labels in `packages/settings/messages/storefront.*.json`; the
  words in `apps/web/messages/shop-more.*.json` (`qa.*`, `celebrate.*`). No schema change, no admin screen (CN-019).
- **Settings (59, 65):** `catalogue.sizeAdvice`, `pdp.reviews`, `reviews.submit`, `reviews.moderation`,
  `reviews.photoReward` in `packages/settings/src/registry-reviews.ts` (registry v35, group `reviews`), labels in
  `packages/settings/messages/reviews.*.json`; the words in `apps/web/messages/shop-more.*.json` (`reviews.*`) and
  `shop-account.*.json` (`account.review.*`); permissions `catalogue.sizeAdvice`, `reviews.read`, `reviews.moderate`,
  `reviews.write`; migration `0021_reviews` (additive: the review's order line, source, the buyer's fit, height and
  weight, who checked it and when, and what the reward paid). No admin screen (CN-019, follow-ups 230, 231).
- **Settings (follow-ups):** `card.desk`, `seo.structuredData`, `pdp.sizeWords`, `pdp.usualSize`, `thanks.page` in
  `packages/settings/src/registry-storefront-fu.ts` (registry v25), labels in `packages/settings/messages/storefront-fu.*.json`.
- **Tests and gates:** unit tests beside the code (`apps/web/src/lib/shop/*.test.ts`, `packages/settings/test`),
  device gate 0 fails in 372 storefront checks and 124 product-page checks (2077 checks with T1, T2 and T3 in both languages, PR 50–58), storefront pages in the Lighthouse budget
  (TBT under 200 ms; the product page T1 and T3 in both languages and T2 on the sample data, `lighthouserc.json` (one list since CN-023); page and image weights, `tools/page-weight.mjs`) and in the
  smoke test (`docs/qa/smoke.json`; product pages are found from New in, never named). Screenshots:
  `docs/qa/screenshots/pr-40/`, `pr-41/`, `pr-43/`, `pr-45/` … `pr-48/`, `pr-49/`, `pr-53/` (PR 53, 67–71, 74, 75), `pr-72/` (PR 72, 73), `pr-65/` (PR 59, 65).
  The reviews journey itself is a test (`apps/web/src/lib/reviews-journey.db.test.ts`, SIM-F-008) and the smoke list
  checks that the review API refuses a request with no account.

**Built (PR 602): the four-layer cache and its invalidation.** New package `@extas/cache`; no migration; settings registry v53.
- **The layers:** the browser keeps hashed files a year; Cloudflare keeps files, and category and product pages only with `cache.pages.cdn`
  (off until a Cloudflare cache rule is set, follow-up 401); the server keeps built category and product pages a few minutes; Redis carries
  every clear to every process. The bag, the checkout, the account, the admin and the API are never kept (proxy headers and Caddy
  `cache_headers`; `/api/internal/*` answers 404 from outside).
- **What clears what:** a price or stock change clears that product, its category pages and Cloudflare at once; a setting clears every page;
  a new product its categories. The stock shown is kept 15 s; adding to the bag and the checkout always read live stock with a row lock.
- **Screens / routes:** Settings › System › Cache (`/admin/settings/system/cache`, permission `system.cache`): the layers, hit counts, how long
  each keeps, "Clear all" with a confirmation and a reason (audited). API `/api/admin/cache/*`; the deploy's hook `/api/internal/cache/deployed`
  (token `CACHE_HOOK_TOKEN`, made by `09-stack.sh`; best effort, never fails a deploy).
- **Settings:** `cache.pages` {server on, cdn off, category 5 min, product 5 min}, `cache.stockDisplaySeconds` 15, `cache.tuning` {1000 pages,
  repeat 2 s, stats 7 days} in `registry-cache.ts`. Cloudflare purge adapter in `@extas/adapters` (on its mock until the owner's token
  passes the Test in Keys & connections). Guide: [cache.md](docs/admin-guide/cache.md).
- **Gated hosts (31 Oct, #72, PR 602 follow-up):** on the staging host and a locked extra host Caddy's `gated_cache` sends
  `private, no-store` and CDN no-store on every answer but Next's hashed files, whatever `cache.pages.cdn` says, so a page
  kept for a signed-in team member never reaches anyone without the password; an opened main domain keeps the app's headers.
- **Tests and gates:** see the S04 block below (one run for PR 602, 558 and 560).

> **বাংলায়:** চার স্তরের ক্যাশ তৈরি: দাম, স্টক বা সেটিং বদলালে সেই পাতা সাথে সাথে নতুন হয়; ব্যাগ, চেকআউট আর অ্যাকাউন্ট কখনো জমা থাকে না।

**Built (PR [76](docs/stages/S02.md#pr-76), [77](docs/stages/S02.md#pr-77); 6 Nov, #85, After launch): the page builder.**
Website › Page layouts (`/admin/website/layouts`, the Website section's first tab; `website.read` to see,
`website.layout.write` to save) — pick a page (home, category, product, bag), move its sections with ▲▼ or by dragging
on a computer, show or hide each one, choose its screens (both, phone only, desktop only), then Save, Discard, "Back to
default" or "Open the page". The shop draws those pages in that order; a one-screen section is hidden by CSS on the
other screen (1024 px). Locked parts always show (category: the heading and the listing; bag: its lines; the product
page's first screen stays fixed for the phone gate). Settings registry v240 (`layout.category`; `home.sections`
entries gain an optional screen) and v241 (`layout.product`, `layout.bag`); every save audited (`website.layout.save`)
with a version check. Account, checkout, the thank-you page, header and footer keep their own switches for now
(follow-up 666); the page is in the old look until Lane A moves Website (PR 640). Guide
[website/layouts](docs/admin-guide/pages/website/layouts.md); tests `lib/shop/layouts.test.ts`,
`lib/website/layouts-admin.db.test.ts`, `registry-layouts.test.ts`.
> নতুন (#85): হোম, ক্যাটাগরি, পণ্য আর ব্যাগের পাতায় কোন অংশ আগে-পরে, কোনটা দেখাবে আর কোনটা শুধু ফোনে বা শুধু কম্পিউটারে — সব
> অ্যাডমিনের Website › Page layouts থেকে টেনে সাজানো যায়; দরকার হলে এক চাপে আগের মতো।

**Built (PR 78, 79; 6 Nov, #86, After launch): words and language, and editing them on the shop.**
Website › Words & language (`/admin/website/words`; `website.read` to see, the new `website.words.write` to save) lists
every word the shop shows (2254, English and Bengali) with the shop's word and the owner's: search, 50 named places,
"Changed by you" and "Bengali still in English", 40 per page; Change or "Back to the shop's word" per row; CSV export and
import. The words live in `language.labels` (the owner's word wins); a save checks the {slots}, 300 letters and unknown
words, refuses a stale version and is audited (`website.words.save`). **Edit on the shop (79):** the card "Edit on the
shop page" (`language.frontEdit`, registry v242, off as shipped) and "Edit on the shop" open the shop with a small panel
for a signed-in admin: tap a word on the page, see it at once, Publish, or go back to the shop's word; a customer never
sees it. Guide [website/words](docs/admin-guide/pages/website/words.md); tests `lib/website/words.test.ts`,
`words-admin.db.test.ts`, `words-match.test.ts`, `front-edit.db.test.ts`, `registry-front-edit.test.ts`.
> নতুন (#86): দোকানের প্রতিটা লেখা (2254টা) ইংরেজি আর বাংলায় অ্যাডমিন থেকে বদলানো যায়, খোঁজা যায়, CSV-তে নামানো-তোলা যায়;
> সুইচ চালু করলে দোকানের পাতাতেই লেখায় চাপ দিয়ে বদলে Publish। শুরুতে বন্ধ।

**Built (PR 80, 81, 83; 6 Nov, #87, After launch): eye-toggles and A/B tests.**
> নতুন (#87): দোকানের প্রতিটা অংশ দেখানো বা লুকানোর 104টা সুইচ এখন এক জায়গায় (Website › More › Eye-toggles) — খোঁজা যায়, এক চাপে
> সব সেভ, এক চাপে আগের মতো। আর A/B পরীক্ষা (Reports › More › Experiments): অর্ধেক কাস্টমার এক লেখা বা অংশ দেখে, বাকিরা অন্যটা —
> কোনটায় বেশি ব্যাগে যোগ বা অর্ডার হয়। দাম, অফার, পেমেন্ট বা ডেলিভারি কখনো পরীক্ষায় নয়। শুরুতে বন্ধ।
- **Eye-toggles (80):** `packages/settings/src/eye-toggles.ts` lists 104 eye-toggles in 11 places (header and menu,
  footer, home, product cards, category, product page, reviews, bag, checkout and thank-you, my account, search). An
  eye-toggle is not a new setting: it points at the yes/no value inside the setting the shop already reads, so the shop,
  the section's own card and the list always agree, and its default is the registry's. A guard test fails when a yes/no
  value of the shop page settings is neither an eye-toggle nor named with its reason (behaviour, offer, template, effect,
  own editor).
- **Eye-toggle dashboard (81):** Website › More › Eye-toggles (`/admin/website/eye-toggles`; `website.read` to see, the
  new `website.eye.write` to save): every switch by place with its screens and shipped value, live search, place and
  Shown / Hidden / Not as shipped filters, "Save all", "Discard" and "Back to as shipped"; a save writes only those yes/no
  values, refuses a stale version and is audited (`website.eye.save`). Hiding deletes nothing.
- **A/B tests (83):** `experiments.module` (registry v243, off; how sure a winner must be 95 %, 100 visitors per version,
  30 days a visitor keeps his version). Reports › More › Experiments (`/admin/reports/experiments`, one test `/<id>`,
  `new`; permissions `reports.experiments.read` / `.write`): version A is the shop as it is, version B changes
  eye-toggles and shop words (English and Bengali); **never prices, offers, payment or delivery** — those switches are
  left out and money words are refused. Goal: added to the bag or ordered. Start (module on, a confirm press, refused
  beside a test that changes the same part), pause, end, keep B or A only once the result reaches the owner's
  confidence (keeping B writes its words and switches into the shop's settings), archive and restore; every step
  audited. On the shop a new visitor (never a bot) keeps one version by a hash and is counted once (`AbAssignment`,
  append-only); `?abPreview=<id>.a` or `.b` previews a version without counting. Migration `0163_ab_test_winner`. The
  page is in the older admin look for now and moves into Lumen with the Reports section.
- Guides: [website/eye-toggles](docs/admin-guide/pages/website/eye-toggles.md),
  [reports/experiments](docs/admin-guide/pages/reports/experiments.md), [reports/experiment](docs/admin-guide/pages/reports/experiment.md);
  tests `packages/settings/test/eye-toggles.test.ts`, `lib/website/eye-admin.db.test.ts`, `eye-labels.test.ts`,
  `lib/experiments/model.test.ts`, `admin.db.test.ts`, `registry-experiments.test.ts`.

**Built (PR 595–599; 6 Nov, #89, After launch): the owner's own sections, side canvas, launch default, shimmer and bag
tier box, feature requests.** All five pages are in the Lumen look; every new switch ships off.
> নতুন (#89): হোম আর ক্যাটাগরি পাতায় নিজের সেকশন যোগ করা (ব্যানার, অফারের লেখা — দাম কখনো নয়, প্রোডাক্টের সারি, রিভিউ, নিজের লেখা
> …), একটা ক্যাটাগরির নিজের সাজানো; কম্পিউটারে দুই পাশের খালি জায়গায় ছবি বা অফার বোতাম; পুরো দোকানের চেহারা সেভ করে এক চাপে
> ফেরানো (আগেরটা সবসময় আগে সেভ হয়, Undo আছে); প্রতিটা ঝিলিকের গতি আর জোর; ব্যাগে ধাপের অফার বক্সের লেখা আর কোন নিয়ম দেখাবে;
> আর অ্যাডমিন থেকে "নতুন সুবিধা চাই" অনুরোধ — কোড বদলায় না, PR তালিকায় যায়।
- **Page layout builder (595):** Website › Page layouts (`/admin/website/layouts`) now adds the owner's own sections to
  the home and category pages — ten types: banner, offer strip (words only, never a price), product row or grid, set row,
  category tiles, reviews, journal, own text (the journal's safe format, never HTML) and spacer — each with its switch
  (new ones and copies start hidden), whole days, screens and place; edit, duplicate, hidden never deleted. One category
  can have its own order (`?page=category&cat=`). Phone and computer preview. `layout.blocks` and `layout.categoryOwn`
  (registry v244, both empty: the shop draws today's pages exactly). Audited `website.layout.save`.
- **Side canvas (596):** Website › Side canvas: zones in the empty left and right gutters on desktop (home, categories or
  chosen categories; days; fixed, sticky or float; a product's or category's picture, an image or a small offer button).
  The approval map at 1440 and 1920 px uses the shop's real widths, and the shop uses the same fit rule: scaled to the
  room, hidden when it would cover content, mouse computers only, no HTML at all while the switch is off.
  `layout.sideCanvas` (registry v245, off) and `layout.sideZones`.
- **Launch default (597):** Website › More › Launch default (`/admin/website/launch-default`): save the whole shop look
  (layouts, own sections, category orders, side canvas, sweeps, which house ads are on — never prices, offers, delivery
  or COD) as the launch default or a named look; restore, rename, set aside and bring back (never deleted). Every restore
  saves the current look first, keeps newer sections switched off and can be undone; back to launch default pauses
  running A/B tests. Audited `website.look.*`.
- **Shimmer and bag tier box (598, the two V2.1 items):** Settings › More › Shimmer (`/admin/settings/shimmer`): speed
  and strength of each of the 14 shimmers (`shop.shimmer`, registry v246; none with reduced motion). Products › Combos ›
  Bag tier box (`/admin/combos/bag-box`): the box's switch, days, 1–4 tiers, which set-tier rules show and the words per
  tier (`bag.tiers.rules`, registry v247); prices only read from Smart Rules. The rest of 598 stays paused.
- **Feature requests (599):** Help & Build › Feature requests (`/admin/build/requests`): "can it be done already?" first,
  then the ask (name, what, section, soon or later); the build team answers with a register PR, built, already possible
  (where) or declined (why); never deleted, audited, a Markdown list for the build team. Migration `0164_feature_requests`.
- Guides: [website/layouts](docs/admin-guide/pages/website/layouts.md), [website/side-canvas](docs/admin-guide/pages/website/side-canvas.md),
  [website/launch-default](docs/admin-guide/pages/website/launch-default.md), [settings/shimmer](docs/admin-guide/pages/settings/shimmer.md),
  [products/bag-box](docs/admin-guide/pages/products/bag-box.md), [help/build-requests](docs/admin-guide/pages/help/build-requests.md);
  tests `registry-layout-blocks.test.ts`, `lib/shop/layout-blocks.test.ts`, `layouts-blocks.db.test.ts`, `look-model.test.ts`,
  `launch-default.db.test.ts`, `shimmer-bag-box.db.test.ts`, `feature-requests.db.test.ts`.

**Built (PR 600; 6 Nov, #91, After launch): on-page edit mode — S02 is done.** Stage report:
[`docs/reports/2026-11-06-S02.md`](docs/reports/2026-11-06-S02.md).
> নতুন (#91): দোকানের পাতাতেই সরাসরি এডিট — শুধু আপনি (মালিক), আর সুইচ চালু থাকলে। একটা অংশে Edit চাপলে পাশে তার
> সেটিংস; বদল আগে খসড়া হয়ে শুধু আপনার কাছে দেখায়, পাবলিশ করলে সবাই দেখে, এক চাপে ফেরানো যায়। কম্পিউটারে বদলালে
> "ফোনেও দিই?" — বাংলাদেশে বেশি চলা 10টা ফোনের মাপে আগে পরীক্ষা হয়। দাম, অফার, ব্যাগ আর চেকআউট এখানে বদলানো যায় না।
- **The bar and Edit mode:** only the signed-in owner with `website.layout.write`, only while `shop.pageEdit` is on
  (registry v248, off). Every section of home, category and product pages gets an outline and an Edit button (mouse) and
  a Sections list (phone and keyboard). The side panel holds that section's own settings; money is never a field —
  prices, offers, sets, flash sale and the bag tier box are links; the bag and checkout are locked.
- **Draft → Publish → undo:** the draft is a LayoutSnapshot of scope `edit-draft` (no migration) laid over the page for
  the owner only; Publish goes through Launch default's path (the look before it saved first, all or nothing, STALE when
  someone changed a drafted setting) and is undone from the bar or on Launch default; thrown-away drafts are set aside.
- **"Apply to phone too?":** the device gate's checks (sideways scroll, cut off, tap sizes, buy button above the fold)
  run in the owner's browser on the 10 phone screens most used in Bangladesh (`docs/qa/devices.json`); publish only when
  all pass and he ticks OK; No keeps the change to computers. Website › More › On-page edit (`/admin/website/page-edit`,
  Lumen) holds the switch, the phone options and the publishes. Not built: a real-phone device farm, the AI reviewer
  (S15 closed), drag to move, "+" between sections. Guide [website/page-edit](docs/admin-guide/pages/website/page-edit.md).
- **Follow-ups (#91):** PR 40 — an address the shop has no page for answers HTTP 404 with the shop's own "page not
  found" drawn on the server, in English and Bengali (`lib/shop/unknown-address`, `NotFoundView`); PR 597 — the shop's
  hash-forward script no longer makes React warn (`HashForwardScript`).
- **Follow-ups (#92):** Words & language (78) says when each word last changed, lists the admin's own words (read only)
  and marks an owner's word with a number or a time claim "Check: number or date" (a warning, the save stands); Edit on
  the shop (79) previews words with {slots} at once; Page layouts (77) picks the product its previews show; Page layouts
  and Side canvas get "Snapshots of this page" (597); the old LayoutEditor is marked unused with a guard test (595);
  the eye-toggles' account switches checked against D4.1 (80); an A/B test counts a raised quantity as "added to the
  bag" (83, migration 0175); a local gate run at 127.0.0.1 runs the shop's scripts and reports NO-SCRIPTS (85).
- **Follow-ups (#93):** the search results page draws the cards' back view and Quick add and the added-to-bag panel (41);
  ↑ / ↓ through the search suggestions, Enter opens (72); the computer's slim buy bar shows the rating (49; the delivery
  days stay open); a long size word steps down, then takes two lines (56); the device gate measures the hero pins after
  the slider fits them (43) and the header slogan and footer with a long sample slogan (85); the demo's eye-toggle parts
  behind their own switches (80, registry v265: "Ordered before? Log in", the door note, the computer's checkout help
  strip, "Send my bag on WhatsApp" as a preview and a wa.me link, the thank-you "You may also like" row — all off — and
  the bag's set line, on as before); with a long slogan the computer's nav folds categories into More first, then the
  slogan steps down, and the gate's new NAV-WORDS-SQUEEZED verdict catches nav words running together (40).
- **Follow-ups (#94):** the device gate measures search's delivery answer and /help/delivery with a sample delivery
  rule (72); "Rate & review" on delivered order cards and a delivered order's thank-you page, with the photo reward's
  figure by the form's own rule (65).
- **Follow-ups (#96):** "Ask a question" on the product page (66; registry v280, off; migration 0183) and Products ›
  Reviews › Questions (66); the shop's public reply under a review (65; registry v281, off) and the older reviews'
  CSV import (65); "Your size" from a signed-in buyer's own orders (56) and on a card's Quick add (41); Reports ›
  Searches (72; registry v282, off; migration 0176) and popular words from real searches (72; registry v283, off); the
  Server page's "Cache today" card (602).

Next: "Goes well with" and the rest of the product page rows (67 …). The CI device gate itself (PR 85, CI part) runs on every pull
request: 15 phones, 10 tablets and 6 desktop sizes (`tools/device-gate.mjs`, `docs/qa/device-gate.json`). Since 23 Oct it
also signs in on the sample data, so admin controls that only show with data are checked at 44 × 44 too (0 fails in
620 checks). Register:
[S02](docs/MASTER-REGISTER.md#s02--storefront--pr-4088).

### S03 · Combo & bundles — Done (22/22)

> **বাংলায় সংক্ষেপে:** অ্যাডমিনে "কম্বো" পেজে নির্দিষ্ট কম্বো বানানো, রঙের জোড়ার রুল দিলে নিজে থেকে কম্বো, সেটের দাম আর কত বাঁচে, পিসের ছবি দিয়ে সেটের ছবি, আর কম্বো রিপোর্ট। সেটের দাম আপনি নিজে বসাবেন। ~~দোকানের কম্বো পাতা পরে আসবে (S02/S03-এর বাকি PR)।~~ দোকানের কম্বো পাতা এখন তৈরি (২৩ অক্টোবর): কাস্টমার প্রতিটা পিসের রং আর সাইজ বেছে পুরো সেট এক দামে ব্যাগে নেয়; সব সেটের একটা পাতা `/combos`, আর প্রোডাক্ট পাতায় "এটা দিয়ে সেট"। ~~নিজের মতো সেট বানানোর পাতা পরে আসবে।~~ নিজের মতো সেট বানানোর পাতাও তৈরি (২৪ অক্টোবর): যেকোনো 2 বা 3 পিস বাছলে সেটের দাম নিজে বসে; আপনি সুইচ চালু না করা পর্যন্ত পাতাটা "এখন বিরতিতে" দেখায়। কম্বোর তালিকা, জোড়ার পাতা আর ব্যাগ — প্রতিটার ৫ রকম সাজ তৈরি (২৪ অক্টোবর), আর সব সাজ ১০০ নম্বরে মাপা হয়েছে; এখনকার চেহারাই থাকে, আপনি একটা সেটিং বদলালে তবে অন্য সাজ আসে।

**Combo core (PR 89, 90, 571, 99, 101, 96, 97, 575, 104, `@extas/combos`, migration `0004_combos`).**
- **Model (89):** pieces, set price, saving against buying separately, active window.
- **Admin `/admin/combos` (90, 571):** fixed combos with a price box and switches and a live editor; auto colour-pair rules with an 8-step wizard, a rules tab and archive (nothing deleted).
- **Set tiers (99):** "any 2 for X, any 3 for Y" read from Smart Rules (S10 PR 212).
- **Validation, summary, bag (101, 96, 97):** what is still missing before adding; set summary and price (a struck price only from a real "was" price); `addSetToBag` adds one set with its price locked, guarded against double adds, overselling, stale and above-regular prices.
- **Set photo (575):** composed from the piece photos with sharp; "Make set photo" in the admin.
- **Report (104):** `?tab=report` — which sets sell, which colour pairs get picked. Since PR 155 it shows "Ordered value" (placed orders) and "Sales (delivered)" as separate figures from `@extas/metrics`.
- **Permissions:** `combos.read`, `combos.write`, `combos.publish`, `combos.prices` (owner only, CLAUDE.md rule 6). Guide: [docs/admin-guide/combos.md](docs/admin-guide/combos.md).
- **Settings:** registry v14, `registry-combos.ts`. ~~Still planned: 91–95, 98, 100, 102, 103, 572–574, 576 (storefront combo pages and the rest).~~ ~~Still planned: 98, 100, 572–574, 576 (the set builder and the page templates).~~ ~~Still planned: 572–574, 576 (the page templates).~~ All 22 built (24 Oct).

**Combo storefront (PR 91, 92, 93, 94, 95, 102, 103; demo V12.2 `40-combo.js`, `42-combo-auto.js`; 23 Oct).**
- **Combo page `/combo/<link>`, `/bn/combo/<link>` (91):** template C1 (one card per piece) with the crumbs, the picked colours, the price box from `@extas/combos` only (set price, separately, the saving, each piece's regular price on a computer), the rules card (each line only when its rule is on), set summary, "Add set to Bag" / "Order Now", WhatsApp only with the shop's number, the phone's bar. A phone shows a toast with "View bag" (touch, mouse and keyboard pause it separately); a computer opens the added panel. An ended combo keeps its page with "Buy them separately". Noindex unless the combo is featured. The bag's set links and "Change" open this page.
- **C2 step by step (92):** `combos.page.layout` = C2: one piece at a time, "Next: <piece>", then a review.
- **Gallery (93):** the set picture of the picked colours, a tab per piece, front / back / detail / true colour.
- **Popular pairs (94):** one tap sets every colour; a pair not made in the size already picked is greyed; learned from real picks.
- **Each piece's colour and size (95):** sizes not made or sold out struck, "Same size as item 1", measurements in inches or cm, "Only N left", the reason a pick cannot go in the bag; "Update set in bag" changes the set in place.
- **Set offer on the product page (102):** under the stock line, each running set that holds the product, with its price and saving.
- **More sets and the landing page `/combos` (103):** rows of 2-piece packs, 3-piece packs and top + bottom sets, season tabs, four columns shared on a computer; off shows "Coming soon".
- **API:** `POST /api/bag/sets` (add, one tap one add), `PATCH /api/bag/sets` (change a set in the bag), `POST /api/shop/combo` (view and colour-pick counts, the price of exact picks). Same-site only.
- **Settings (registry v30, `registry-combo-pages.ts`, no admin screen, CN-019):** `combos.page.layout` (C1), `combos.page.popularPairs` (on, 6, learn after 3 picks), `combos.page.parts` (summary, WhatsApp, rules card, item prices on; the whole-set exchange promise off), `combos.page.moreSets` (on, 12), `combos.landing` (on, season tabs, 8 a row), `combos.pdpOffer` (on, 2). Words: `apps/web/messages/shop-combo.<lang>.json`.
- **Tests and gates:** engine tests (`page-model`, `page.db`), web model and API tests on PostgreSQL; device gate 0 fails on the new pages; seeded Lighthouse on the combo page and `/combos` in both languages; smoke opens `/combos` and the combo pages its cards link to.

**Build your own set (PR 98, 100; demo V12.2 `41-set.js`; 24 Oct).**
- **Engine (98, `@extas/combos` `builder.ts`, `builder-model.ts`, migration `0022_set_builder`):** each live Smart Rules set tier rule (`setTier`, S10 PR 212) with priced tiers is a set group; its styles are the published, priced products in the rule's scope. `checkBuild` refuses too few, too many, outside the group, no price, sold out and more than the stock (the bag counted). "Add set to Bag" puts the picks in as ordinary bag lines, so the bag's rules engine charges exactly the builder's tier price and the bag tier box, bag and checkout show the same numbers (V2.1). One tap is one add (`SetBuilderAdd`).
- **Page `/combos/build-your-own`, `/combos/build-your-own/<rule key>`, `/bn/…` (100):** the tier cards, the set's slots with remove, a card per style (picture tap turns front → back → detail, colours, sizes, its own price, Add), the summary beside on a computer and the bar at the bottom of a phone, the next-tier nudge, a tab per group. The struck regular price only behind `rules.discount.showWasPrice` (CN-009). While off, a "taking a break" page with the ready-made sets. Noindex for the group, preview and off pages.
- **Entries (follow-up 174):** a "Build your own" row and card on `/combos` and a link under "More sets", each only while the builder is open and `entries` is on.
- **API:** `POST /api/bag/built-sets` (same-site only, one tap one add); admin `GET /api/admin/combos/builder?days=` (`combos.read`: settings, the set tier rules, adds, pieces and money per rule) and `POST /api/admin/combos/builder` (`combos.publish`: the options). The admin screen comes with the new admin shell (follow-up 240).
- **Settings (registry v36, `registry-set-builder.ts`, no admin screen, CN-019):** `combos.builder` — off; `rules` [] (all), `categories` [] (all), `maxStyles` 24, `perItem` on, `entries` on. Words: `apps/web/messages/shop-build.<lang>.json`.
- **Tests and gates:** engine tests (`builder-model`, `builder.db`), the bag endpoint and admin API on PostgreSQL, the page model; device gate and seeded Lighthouse on the test server's preview (`?try=1`) of the sample draft rule in both languages; smoke opens `/combos/build-your-own` in both languages.

**Combo templates and their ranking (PR 572, 573, 574, 576; demo V12.2 / V12.3 `42-combo-auto.js`; 24 Oct).** The current look stays the default everywhere, so nothing a customer sees changes until the owner picks a template (one setting each).
- **A rule's own page `/combos/<rule key>`, `/bn/…` (572):** each auto colour-pair rule's list in its template (rule, else `combos.template.list`, L1): L1 pair grid (offer strip, 2 / 3 piece switch, "Has:" colour chips, "My size", order, count, "See all", a pick-your-own card, singles), L2 style cards, L3 season hub, L4 big cards with the size for both and "Add both to bag" right in the list, L5 2 or 3 pieces first. Every filter is in the link (filtered pages noindex); an off, ended or future rule keeps its page with a note and the sets on sale now. `/combos` rule cards open it (follow-up 173).
- **The pair page (573):** `combos.template.page` = current (the C1/C2 page above, ~~auto~~), or P1 pair page (2 taps to bag, "Size for both", "Make it 3 pcs", "Add both to bag · ৳…", sticky phone bar), P2 pick colours, P3 top + bottom, P4 mixed set, P5 fixed pack. The button always says what is still missing. A pair changed while editing takes the old set's place (`replaceGroupKey`, lines archived).
- **The set in the bag (574):** `combos.template.bag` = current (~~B5~~), or B1 one card with each piece's picture, B2 sizes changed in the bag (`PATCH /api/bag/sets`, re-checked and re-priced), B3 B2 + "Add 1 more → 3 for ৳…", B4 each piece's own price + one "Combo discount" line, B5 one short row per set once the bag holds `combos.bag.compactFrom` (3) sets, opening to B2. The bag engine's money in every template.
- **Previews:** `?tpl=L1…L5 / P1…P5` and `/bag?btpl=B1…B5` with a template bar while `combos.template.preview` is on (noindex); the test server's `POST /api/bag/try?sets=N` fills sample sets.
- **The ranking (576, QA tool, no admin screen):** `tools/combo-matrix.mjs` plays every template on the sample sets at 360, 393, 430 and 1280 px; `tools/combo-ranking.mjs` scores 100 points (taps to bag, first-screen completeness, words, layout, tap targets) and knocks out any template that shows another total than the current look. Config `docs/qa/combo-matrix.json`, results `docs/qa/combo-ranking/latest.json`, report [docs/qa/COMBO-TEMPLATE-MATRIX.md](docs/qa/COMBO-TEMPLATE-MATRIX.md). Nothing is switched by it.
- **Settings (registry v39, no admin screen, CN-019):** `combos.list` (seeAllOver 15, firstShown 8, bigListShown 6, builderCard on), `combos.template.preview` (on), `combos.pairPage` (otherPairs 14, packSwatches 4, upsell on), `combos.template.page` and `combos.template.bag` default current, `combos.bag.compactFrom` 3. No migration. Guide: [docs/admin-guide/combos.md](docs/admin-guide/combos.md).
- **Tests and gates:** engine tests (`rule-page-model`, `rule-page.db`, `summary-model`), cart view, the web models and bag/combo APIs on PostgreSQL, the matrix and ranking tools; device gate 0 fails in 4192 checks (the rule pages, every P and B template, both languages); seeded Lighthouse: the rule pages, `/combos` and the bag pass, the Bengali rule page at the edge, the P1 preview misses LCP (2.7 s) like the route's existing combo page on the same box (follow-ups 358, 359).

- **Go-live gate (1 Nov, #73; PR 89 follow-up, SIM-F-051, CN-018 (4)):** sets Fixed or Flexible (`combos.split`, off; migration `0073_combo_split`): a fixed set never splits at the door or on a return, a flexible set's split-price rule, the rider told on the sticker and booking note.
- **Follow-ups (#93):** a combo whose link changes keeps its old link as a permanent forward (91; Redirect source
  `combo-slug`, no chains); the bag's "Take 2 │ Take 3" box links to its rule's own set builder page while the builder
  is open (98).
- **Follow-ups (#94):** the combo page's set picture is the owner's set photo while the picked colours are exactly its
  own (93); a replaced set keeps its place in the bag (574); the combo matrix measures taps by hit area (576).
- **Follow-ups (#96):** the set page's rules card reads the delivery bands and the payment methods the checkout offers
  now (91); the set builder rings each style card's usual size and can pick it in advance, and gets a home row, a
  category banner and a product page line, each its own switch (100; registry v284, off); an indexed combo rule page
  carries its trail and its pairs as JSON-LD (572).

### S10 · Smart Rules — Done (12/12)

> **বাংলায়:** দোকানের সব নিয়ম (ডেলিভারি, এক্সচেঞ্জ, সেট-কম্বো, ছাড়, কুপন, উৎসবের শেষ সময়, নোটিশ-পপআপ) এক জায়গায়।
> একবার বদলালে পণ্যের পাতা, ব্যাগ, চেকআউট আর মেসেজে লেখা নিজে থেকে বদলায়। টাকার নিয়ম মালিকের অনুমতি ছাড়া চালু হয় না।

PR 208–219. Register: [S10](docs/MASTER-REGISTER.md#s10--smart-rules--pr-208219). Package: `@extas/rules`.

- **Engine (PR 208).** One rule = kind (delivery · exchange · setTier · discount · festive · payment · policy ·
  fulfilment), typed params, scope, conditions, priority and an active window; drafts, versions and archive, never
  deleted. A broken rule never runs on a guess.
- **Rule admin with live preview (PR 209).** "Customers see" line changes as you type; preview of every place the text
  changes, before and after, and what changes in money. Money changes need the owner's OK (`rules.approve`).
- **Delivery, exchange, set tiers (PR 210, 211, 212).** Charges per band and a free-delivery threshold (empty and off
  until the owner sets them); exchange window (default text "Exchange within 72 hours for size or fault", 72 hours is a
  setting); any 2 for X, any 3 for Y, best price worked out in the bag (`quoteCart`).
- **Discounts and coupons (PR 213).** Coupons start off and need the owner's OK. The "was" price follows CN-009: the
  real MRP, combos = sum of separate prices, never invented (`discountWasFor`, switch off).
- **Festive cut-offs (PR 214)** stop by themselves when the date passes. **Eid order-by dates (23 Oct, CN-014 g):** a
  date per delivery band and per district (a district's own date wins), cut-off time in the store's time zone, a banner
  from `rules.eid.showDaysBefore` days before, and "may arrive after Eid" once a place has closed; pre-order with a fixed
  or percentage advance, where the amount due on delivery is the total minus the advance. Everything is off and empty
  (`rules.eid.*`); switching on is refused while anything is missing (`EID_INVALID`), and the pre-order needs the owner's
  OK (`rules.approve`). Engine, settings and `/api/admin/rules/eid` only: the screen comes under Marketing → Campaigns
  after the owner approves `docs/ADMIN-ARCHITECTURE.md`; the storefront banner and checkout lines come with S02/S04.
- **Rule text everywhere (PR 215).** `ruleTextsFor`, `RuleText`, `NoticeBar`, `RulePopup` for S02 to place.
- **Notices and pop-ups (PR 216).** Bar, in-page note, pop-up; never on arrival, capped per visitor, pause and resume
  tested; all start off.
- **Conflicts, history, simulation (PR 217, 218, 219).** Old text found elsewhere (e.g. "7 days" in an FAQ) with "fix
  everywhere"; who changed what and when, restore; what past orders would have cost under a draft.

| Screen | What it does |
|---|---|
| `/admin/rules` | rule list, editor with the live line, preview, approval, history and restore, simulation, coupons |
| `/admin/rules/notices` | notices and pop-ups: placement, timing, frequency cap |

Guide: [docs/admin-guide/rules.md](docs/admin-guide/rules.md).

API: one catch-all `/api/admin/rules/[[...path]]`. Permissions: `rules.read/write/publish/approve`. Settings:
`rules.*` (registry v13, 16 keys). Schema migration `0003_smart_rules`. Tests in `packages/rules/test` (59, 18 on
PostgreSQL) and the web rules API (10 + 3 on PostgreSQL). Screenshots:
[`docs/qa/screenshots/pr-209/`](docs/qa/screenshots/pr-209). Report: [S10](docs/reports/2026-10-20-S10.md). Left for
S02/S04: placing the storefront pieces and the bag's use of `quoteCart` / `discountWasFor`.

- **Go-live gate (1 Nov, #73; PR 213 follow-up, SIM-F-050):** a "first order only" coupon is checked on the order history by phone number and account; "guests only" says what it checks.

### S04 · Cart, checkout, accounts — Done (42/42)

> **বাংলায়:** ব্যাগ তৈরি — পণ্য রাখা, রং-সাইজ-সংখ্যা বদলানো, পরে কেনার জন্য রাখা, সরানো আর ফিরিয়ে আনা, সেট, অফারের ঘর, দুই সাইজের প্রশ্ন, অর্ডারের হিসাব, কোড, ফ্রি ডেলিভারির অগ্রগতি আর "আপনার পছন্দ হতে পারে"; "ব্যাগে রাখা হয়েছে" শিট। চেকআউটও তৈরি — নাম-ফোন-ঠিকানা, ঠিকানা থেকে এলাকা আর চার্জ (না বুঝলে জিজ্ঞেস করে), পেমেন্টের উপায়, ওয়ালেট, অফারের টিক, কনফার্ম বোতাম, একবার চাপলে একটাই অর্ডার, আর ধন্যবাদ পাতা। কার্ড/মোবাইল পেমেন্ট এখন টেস্ট পাতায়, কোনো টাকা নড়ে না। ডেমো V12.2-এর মতো, বাংলা আর ইংরেজি দুটোতেই। অর্ডারের পাতায় এখন "কেন অগ্রিম, কেন এই চার্জ" কার্ড, আর বাল্ক-কর্পোরেট অর্ডারের অনুরোধ (ডিফল্ট বন্ধ)।

**Built (PR 105, 106, 108, 109, 110, 111, 112, 113, 114, 107), matched to demo V12.2 (CN-012).** Package `@extas/cart`, migration `0006_bag`.
- **Screens / routes:** `/bag` and `/bn/bag` (out of "Coming soon"; noindex); `/bag/try` (test page, only with `EXTAS_SHOP_TEST_PAGES=1`).
- **The bag (105):** one bag per visitor (HttpOnly `__Host-extas_bag` cookie, SameSite=Lax, kept `bag.keepDays` days), lines and quantities, colour and size changed in place, save for later, take out = archived with Undo (nothing deleted); a double tap is one add; the piece count glows on the header bag and the bottom bar.
- **Added-to-bag panel (106):** phone sheet or desktop drawer (`bag.panel.style`), "Just added" first, the bag's count and total, a COD / exchange line when delivery is not free (only what is switched on; never "add ৳X more"), "Complete the look" by the fill rule (`bag.panel.fill`, `bag.panel.gapPx`). The product page (PR 49) mounts the same `<AddToBag>` and `<AddedPanel>`.
- **Lines, sets, two sizes (107, 108, 110):** each set one line with its pieces linking to their own products; the two-sizes notice asked once ("one is for someone else" never flags a family, SIM-F-036).
- **Offers and totals (109, 111, 112, 113, 114):** one offer slot under the lines, never empty; the tier box (full on a computer, a preview on the phone); the order summary with "You save" in sale red; the discount code with the engine's reason in words (a member-only code says so; a public code works for guests, SIM-F-009); free-delivery progress; "You may also like" from the bag's own categories. Every amount comes from the rules engine in minor units.
- **API:** `/api/bag/lines` (POST), `/api/bag/lines/<id>` (PATCH, DELETE), `/api/bag/lines/<id>/restore`, `/api/bag/sizes` (PUT), `/api/bag/code` (POST, DELETE), `/api/bag/try` (test servers only); same-site requests only, bodies up to 2 KB.
- **Settings:** `bag.*` in `packages/settings/src/registry-bag.ts` (registry v18), labels in `packages/settings/messages/bag.*.json`; every claim off unless backed (`bag.trust.*`, `bag.upsell.originalLine`). No admin screen yet (CN-019); no new permission.
- **Tests and gates:** `packages/cart` (pure and PostgreSQL), `apps/web/src/lib/shop/bag-*.test.ts`, the coupon audience in `packages/rules`; device gate 0 fails in 775 checks including the filled bag (`docs/qa/device-gate.json` `filled`); `/bag` and `/bn/bag` in the Lighthouse budget and the smoke test. Screenshots: `docs/qa/screenshots/pr-107/`.

**Built (PR 115–126): the checkout, matched to demo V12.2 (CN-012).** Package `@extas/checkout`, migration `0007_checkout` (payment methods Rocket, Upay, Online).
- **Screens / routes:** `/checkout` and `/bn/checkout`; `/checkout/pay/<number>` ("Pay" opens the connected gateway, S07 PR 170; until then the test payment page, which answers only while `payments.testPayments` is on and no real gateway is connected: follow-up 50, the go-live guard) and `/checkout/thanks/<number>` (both noindex, only for the browser that placed the order).
- **Form (115, 116, 124):** the steps header, the phone's order-summary bar and sticky Confirm, the desktop side summary; name, phone, address in the owner's order (`checkout.fieldOrder`) with one set of checks for browser and server; Confirm never looks off: it shows the first missing field with a Bengali line in its box (`checkout.confirm.style`).
- **Address and charge (117, 118, 119):** the S06 gazetteer reads the address on the server (longest name first); an unclear line asks "Where is this address?" with each band's charge and hours, never guesses; the charge is the owner's band figure (never from text), "+ delivery" while a band has no charge, the rules only decide free delivery. Since follow-up 54 the rules engine uses the same band figure, so the rule admin's preview and simulation say what the checkout charges (the COD limit check is unchanged; follow-up 121 waits for the owner).
- **Payment, wallet, opt-in, items (120–123):** COD only when the owner's switch, the COD rule and the band's limit allow it; mobile banking, card & bank, Pay online; the prepaid reward system (off, no value; the owner sets it); "Use my wallet" for signed-in customers; SMS offers ticked, WhatsApp not, each a dated consent; quantity and Remove with Undo in the summary.
- **Placing the order (125):** one transaction, one order per press (order key), the bag locked, stock held, order number under a lock (`checkout.order.numberPrefix`, `numberStart`), the money shown is the money stored (SIM-F-003) or PRICE_CHANGED with the new figures; unclear address or unset charge = the order flagged with a call task. The order is created in its first state only; order states, refunds and returns wait for the owner (CN-022). Failed payments are kept with a call task and "Try again" (SIM-F-026); unfinished checkouts are kept only with `checkout.capture.enabled` (off). **Coupons enforced (31 Oct, #71):** the code is redeemed in the order's own transaction (usage limit, per-customer limit by phone or account, start and end; the coupon row is locked, so two orders at once cannot both pass a limit of 1); a refused code rolls the order back and shows the new total before he places again; a per-customer limit shows in the bag too. **Order key (31 Oct, #72):** the key replays only the checkout it placed (same fingerprint); a new bag in the same tab gets `IDEMPOTENCY`, and the form drops the key and asks him to press Confirm again.
- **Thank-you page (126):** first name, promise in hours, order number with Copy, COD due / paid / Pay now / Try again, items and totals as stored, WhatsApp with the order number. Since 23 Oct (follow-up 58): the delivery note he wrote said back (`thanks.page`, on), the trial-at-the-door line while that service is on, and "What happens next" (off, as in the demo).
- **Address suggestions (117, follow-up 57):** the matching places drop down under the address box while he types (`delivery.suggest.enabled`, `delivery.suggest.minChars`): arrows, Enter, Escape and tap, read at once on a pick; a band's charge shows only once the owner priced it.
- **API:** `POST /api/checkout/quote`, `/api/checkout/orders`, `/api/checkout/payments` (test payments only), `/api/checkout/draft`; same-site only, the bag cookie decides whose order it is.
- **Settings:** `checkout.*` in `packages/settings/src/registry-checkout.ts` (registry v20), labels in `packages/settings/messages/checkout.*.json`; optional features off. No admin screen yet (CN-019).
- **Tests and gates:** `packages/checkout` (43, on PostgreSQL: SIM-F-003 and SIM-F-026, one press one order, receipt), `apps/web/src/lib/shop/checkout-api.db.test.ts`; device gate 0 fails on every storefront and checkout page; checkout pages in the Lighthouse budget and the smoke test. Screenshots: [`docs/qa/screenshots/pr-115/`](docs/qa/screenshots/pr-115).

**Built (PR 129–135, 137): customer accounts, matched to demo V12.2 (CN-012).** Package `@extas/accounts`; no migration (the S00 schema holds it all).
> **বাংলায়:** প্রথম অর্ডারেই অ্যাকাউন্ট তৈরি হয়, কোনো পাসওয়ার্ড ছাড়া; লগইন মোবাইল নম্বর আর এসএমএস কোডে (এসএমএস এখন টেস্ট মোডে, চাবি এলে আসল)। আমার অ্যাকাউন্টে অর্ডার, পার্সেল কোথায়, দেরি হলে সেটাও, ওয়ালেট, পছন্দের তালিকা, প্রোফাইল-ঠিকানা; অর্ডারের পুরো পাতা; চেকআউট নিজে থেকেই নাম-নম্বর-ঠিকানা বসিয়ে দেয়। অফার ব্যানার, ছবি আর "ঠিক কত টাকা" লাইন শুরুতে বন্ধ।
- **Screens / routes:** `/account/login`, `/account` (orders), `/account/foryou`, `/account/rewards`, `/account/wallet`, `/account/wishlist`, `/account/profile`, `/account/orders/<number>` (+ `/bn/…`, all noindex; old names like `/account/addresses` redirect); a signed-out visitor sees the log-in prompt.
- **The account from the first order (129):** the order's phone finds or makes the customer (`account.autoCreate.enabled`), never with a password (SIM-F-039 test: the phone number as the password opens nothing); the thank-you card says the number he logs in with (`account.thanksCard.enabled`).
- **Log in (130, follow-up 18):** a one-time SMS code (`account.code.limits`, `account.code.text`), stored only as salted hashes, rate-limited per phone and per IP; an own password if he sets one, with the code on a new device (`account.login`); the SMS goes through the mock sender until the gateway key arrives (A1.3) and no code is ever shown on production. The browser's wishlist joins the account at sign-in (follow-up 71). **Atomic tries (31 Oct, #72):** a try is taken before the compare in one conditional update, so parallel guesses never get more than the set tries.
- **My account (131–133):** header with orders, wallet and saved; the sections the owner shows (`account.tabs`); order cards with the parcel's journey as stored (CN-022: nothing moves an order here) and a "Late" tag; For you, Rewards, the wallet ledger; Profile with up to `account.addresses.max` addresses, password, SMS / WhatsApp consent rows; the offer banner (`account.offerBanner`, off: only his real wallet balance or the owner's offers whose coupon works for him); the profile photo (`account.photo`, off: cropped and kept only in his browser).
- **Order page and tracking (134, 135):** every line with its picture, add-on and set marks, the money as stored and how it is paid; the steps with their times and the band's promise in hours; the courier and tracking code once booked; past the promise "Late — we are chasing the courier" with WhatsApp (`account.track.late`, SIM-F-018 test); "Track your order" on the thank-you page opens it with the welcome panel (`account.track.welcome`: his account, log in by SMS code, never a password); the exact amount for the rider with a report link (`account.track.exactAmount`, off; CN-014 idea 10).
- **Checkout fills itself (137):** a signed-in customer's name, number and address (`checkout.autofill.account`); the browser's autofill read on the first touch (C6.4); the browser's memory of the last order only with `checkout.autofill.browserDays` above 0 (off).
- **API:** `POST /api/account/<action>`: `code`, `login`, `password`, `logout`, `profile`, `consent` (`test-code` and `try` only on test servers with the mock SMS); same-site only, small bodies, no answer says whether a number has an account.
- **Settings:** `account.*` and `checkout.autofill` in `packages/settings/src/registry-accounts.ts` (registry v29), labels in `packages/settings/messages/accounts.*.json`; the words in `apps/web/messages/shop-account.*.json`. No admin screen (CN-019); no new permission.
- **Tests and gates:** `packages/accounts` (PostgreSQL: codes and limits, login, SIM-F-039, the dashboard, the late card, offers, the checkout prefill; pure: steps, SIM-F-018, the rider amount), the receipt in `packages/checkout`, `apps/web/src/lib/shop/account-api.test.ts`, `draft.test.ts`; the device gate opens every account page signed in (the sample account fill `/api/account/try`); the account pages are in the Lighthouse budget and the smoke test (signed out).

**Built (PR 136): the invoice of an order (with follow-up 147).** No migration.
- **Screens / routes:** `/account/orders/<number>/invoice` and `/bn/…` (noindex): the printable invoice, with "Download
  invoice" (`…/invoice/file`, one self-contained HTML file that opens and prints anywhere) and "Print or save as PDF"
  (the browser's own print). "Get invoice" on the order page, an invoice icon on each My orders card, a button on the
  thank-you page.
- **What it shows:** everything as stored on the order — each line's unit price, its discount, the wallet, the delivery
  charge (or "charged on the call" / free), the total and what is still due (COD due / paid / failed); never
  recomputed. The shop's name, slogan, WhatsApp or phone, address and e-mail, and the registered name, trade licence,
  DBID and BIN only when the owner has filled them (`legal.bin` new, owner data, empty); the bill-to, address and the
  courier and tracking code once booked; the exchange summary while exchange is on.
- **Who sees it:** the customer whose order it is, the browser that placed it, or staff with the new `orders.invoice`
  permission; anyone else gets the order page's log-in prompt.
- **Settings:** `account.invoice` (registry v31; on; number `INV-{digits}`, each block on a switch, SKU off, the owner's
  note and footer empty, download on) and `legal.bin` in `packages/settings/src/registry-accounts.ts`. No admin screen
  (CN-019): the staff's "Get invoice" button is on the admin order page (`/admin/orders/<id>`) for anyone with
  `orders.invoice` (follow-up 180, built 23 Oct with S05).
- **Tests and gates:** `apps/web/src/lib/shop/invoice.test.ts`, the receipt's stored line figures and the staff read in
  `packages/checkout` (`place.db.test.ts`); device gate 2642 checks with 0 new fails (the invoice page filled and
  signed in, English and Bengali; the 25 known `/admin/size-charts` tap-target fails aside); both invoice paths in the Lighthouse budget, the seeded budget and the smoke test.

**Built (PR 563, 565, 561, 127, 128, 605): the rest of the customer checkout.** Migration `0020_gift_mode` (additive); permission `orders.lines`.
> **বাংলায়:** ঠিকানার জন্য কোনো অর্ডার আটকে থাকে না — অর্ডার হয়, টিম একবার ফোন করে; ফ্রি ডেলিভারিতে এলাকা নিয়ে কোনো প্রশ্ন নেই; চেনা নম্বরে অসম্পূর্ণ ঠিকানা জিজ্ঞেস করে না (শুরুতে বন্ধ); কুরিয়ার বুকের আগে "এই পার্সেলে যোগ করুন" আর ধন্যবাদ পাতায় "লুক পূর্ণ করুন" (দুটোই শুরুতে বন্ধ); উপহার মোড — প্রাপকের ঠিকানায় পার্সেল, নোট, তারিখ, দাম লুকানো ইনভয়েস, টাকা আগে (শুরুতে বন্ধ)।
- **No order held over an address (563, SIM-F-030):** an address nothing settles is placed like any order (PLACED, confirmable), flagged with one call task (the weightiest reason); a landmark-only line ("bazar er pashe, Kurigram") gets ADDRESS_CHECK (`checkout.address.check`, on, its words editable); the call queue backend and `GET /api/admin/orders/calls` (`orders.read`). **Set delivery area (31 Oct, #71):** on such an order staff pick one of the store's switched-on bands under More actions (`orders.edit`, a reason); the charge is the band's own from Delivery (0 under free delivery), never typed; totals recomputed, the flags cleared, the call closed, the ERP order resent; never automatic, refused once the checkout fixed the charge (guide `docs/admin-guide/pages/orders/order.md`). **Priced with the order's facts (31 Oct, #72):** the band's charge uses the order's payment method, customer, source and its own redeemed code, and an order paid ahead gets the prepaid free-delivery reward; on a non-COD order past PLACED a band that would make money due is refused (`PAYMENT_DUE`).
- **Free delivery is band-exempt (565):** no band question, flag, call, band name or band message; the order is marked `bandExempt` (`@extas/delivery`), the check every later band fix and message asks first.
- **Silent address backfill (561):** with `checkout.address.backfill` on (off by default; orders off / delivered / placed), a known number's line with no place is not asked; the band comes from the address the shop holds, never shown; that full address goes to packing in `Order.backfilledAddress`.
- **Add to this parcel (127, SIM-F-004):** with `orders.addOn` on (off; until confirmed, minutes, lines, pieces), a customer adds a piece to his COD order from the thank-you or order page: a real order line, priced as its product page, held from stock, the money moving by exactly that line; refused once a courier is booked. API: `POST /api/account/parcel`, `/parcel-add`, `/parcel-remove`; staff `POST /api/admin/orders/<id>/lines` and `/lines/<lineId>/remove` (`orders.lines`).
- **Complete your look (128):** with `thanks.look` on (off, max 3), the thank-you page offers only pieces a running combo pairs with the order, at their live price, added through 127; no honest pick, no block. Test servers: `POST /api/shop/try-look`.
- **Gift mode (605, SIM-F-007):** with `checkout.gift` on (off; advance required: full, fixed or percent; note 200 characters; date up to 30 days; hide prices ticked), "Send as a gift" sits under the bag's Checkout and opens `/checkout?gift=1`: the sender's name and a phone of any country or an e-mail (updates only), the gift note and "deliver on or after"; the name, phone and address are the receiver's. Full advance = no Cash on Delivery; a part = the flag GIFT_ADVANCE, `advanceRequiredMinor` and a call task until S07's part payment. No account is made for the receiver. The thank-you page thanks the sender; the invoice hides every price. `deliveryTarget()` in `@extas/orders` is what the sticker and the booking read. Test servers: `POST /api/shop/try-gift`.
- **Why an advance, why this charge (566):** on an order's admin page (`/admin/orders/<id>`, orders.read) the card "Why an advance, why this delivery charge" (`orders.explain`, on; the risk line on) reads the order's own records — the placed event (now with `codOff`), the advance requests, the checkout flag and its layer, the risk assessment, the band and area kept on the order — and gives the reasons in words (team-only lines marked) and ready "what to say" lines in Bengali and English with Copy. Read only.
- **Bulk / corporate lane (606, SIM-F-023):** with `orders.bulkLane` on (off; menu row on; the bag's card at the owner's number of pieces, empty, or when a line can take no more; contact shown; minimum empty, maximum 100000; 3 a day per number or browser; note 1000; prefix BQ-; logo offered, its price empty; advance none) the phone menu and the bag lead to `/bulk-order` (noindex; "page not found" while off): name, mobile, company, e-mail, what, how many, logo, needed by, note, with the bag's pieces and never a price. Migration `0023_bulk_enquiry`; `POST /api/shop/bulk`, `GET /api/admin/bulk-enquiries` (orders.read), `POST /api/admin/bulk-enquiries/:id/status` (orders.notes, audited), `POST /api/shop/try-bulk` (test servers only). The ORD-09 screen and the quote are follow-up 270.
- **Settings:** registry v34 (`registry-checkout-more.ts`, labels in `checkout-more.*.json`) and v38 (`registry-support-lane.ts`, labels in `support-lane.*.json`); no new admin section (CN-019). Guides: `docs/admin-guide/orders.md`, `delivery.md`, `combos.md`.
- **Tests and gates:** guard 0; lint, format and typecheck clean; tests settings 2364, checkout 57, orders 337, db 133, delivery 207, combos 99, web 663 and the rest, all pass; device gate 0 fails in 2146 checks; seeded Lighthouse medians inside the budget; checked in a browser at 390 and 1366 px in English and Bengali.

**Built (PR 558, 560): the checkout's advance (Parameter for Checkout and the advance-payment checkout mode, SIM-F-016).** Migration
`0036_checkout_advance` (additive); settings registry v53 (`registry-advance.ts`).
- **The panel (558):** Orders › Risk rules › Checkout advance (`/admin/orders/risk-rules/checkout`, a "More" tab; `risk.rules.read`,
  saving `risk.rules.write`). One switch `checkout.advance` {off, at most 5 layers: 3/5/10}. Each layer: what counts as a flag (a risk
  score at least, a risk band, a signal; any one; a layer with none is refused), what it asks (nothing, the delivery charge, a part 1–99 %,
  the full amount). Tried from the top; the first switched-on match wins. Saved all at once with its version and one audit row; switching on
  asks for a confirmation; a layer taken off is archived, never deleted. API `GET/PUT /api/admin/risk/checkout-layers`.
- **The checkout (560):** only while the switch is on, only once he has filled in his name, a real mobile number and an address that settled,
  only where Cash on Delivery would show, never on a gift, and only with a prepaid method open. Flagged: the same page, the payment section
  swapped: no Cash on Delivery, bKash, Nagad and card, and one neutral line ("pay ৳X now, the rest ৳Y at your door"). Never a score, a band or
  a reason. A part or the delivery charge ahead is a COD order priced as COD with that much paid now; the full amount is an ordinary prepaid
  order. The order waits in "advance due" and comes back to the queue when it is paid; nothing is cancelled, blocked or repriced.
- **Settings:** `checkout.advance` (labels in `checkout-more.*.json`); the layers are rows (`CheckoutParameterLayer`). Guide:
  [checkout-advance.md](docs/admin-guide/checkout-advance.md).
- **Tests and gates:** Gates on this box: guard 0 findings (1214 files); lint and format clean; typecheck clean (whole workspace, and the web build's own check); tests on PostgreSQL and Redis — db 143, settings 2701, adapters 125, cache 19, checkout 71, catalogue 153, orders 565 (the SIM-F-016 journey included), web 879 in 135 files, all pass; `infra/tests/run.sh` 191 PASS (the Caddy cache headers, the internal addresses 404 from outside, the deploy's cache hook, the setup's cache hook token); web build clean; device gate **PASS, 0 fails in 310 checks** (home, checkout, a category and a product page in en and bn, Settings › System › Cache and Orders › Risk rules › Checkout advance signed in; the first round's 50 tap-size fails on the two admin pages fixed: the switch is a 44 px tap box, the chips and tick boxes 44 px); seeded Lighthouse medians of 3: `/checkout` perf 0.98 / a11y 1 / LCP 1.96 s / TBT 12 ms, `/bn/checkout` 0.97 / 1 / 2.10 s / 30 ms, `/collections/polos` 0.98 / 1 / 1.90 s / 45 ms, `/bn/collections/polos` 0.97 / 1 / 2.09 s / 89 ms, `/p/essential-pique-polo` 0.95 / 1 / 2.31 s / 47 ms, CLS ≤ 0.049; `/bn/p/essential-pique-polo` over the LCP budget on this loaded box (0.86 / 1 / 2.71 s / 240 ms), and the base 44bdd80 measured the same in interleaved runs (follow-up 408); the server page cache answered 96% of page reads as hits. Checked in a real browser at 390 and 1366 px in English and Bengali: the owner adds a layer and switches the panel on behind its confirm; a flagged customer sees nothing until name, phone and address are done, then COD goes and one neutral line says what to pay now and what is left; no score, layer or risk word on the page, no sideways scroll, no console error.

> **বাংলায়:** চেকআউটে অগ্রিম তৈরি: আপনি ঠিক করেন কাকে আগে টাকা দিতে বলা হবে। চিহ্নিত কাস্টমার একই পেজে ক্যাশ অন ডেলিভারি ছাড়া bKash, Nagad আর কার্ড দেখেন, সাথে একটা সাধারণ লাইন। শুরুতে বন্ধ।

~~S04 is complete (41/41)~~ S04 was complete (41/41) on 24 Oct; ~~since 1 Nov it is 41/42 with PR 622 (Buy again, CN-034, After launch, not built)~~ PR 622 built in #81 (below): S04 is done (42/42); stage reports [2026-10-24-S04](docs/reports/2026-10-24-S04.md), [2026-11-06-S04](docs/reports/2026-11-06-S04.md). ~~Next: PR 558 and 560 (the checkout's advance rules), the rest of S04.~~ Register: [S04](docs/MASTER-REGISTER.md#s04--cart-checkout-accounts--pr-105137).

**Built (PR [622](docs/stages/S04.md#pr-622); 6 Nov, #81, After launch, CN-034): Buy again.** `account.reorder` (v220)
ships off (delivered orders only, also on My orders when `inList`); migration `0131_buy_again`.
> নতুন (#81): আগের অর্ডারের পাতায় "আবার কিনুন" — জিনিসগুলো আজকের দামে আর স্টকে ব্যাগে যায়, যে সাইজ নেই তা নাম ধরে বলে আর কোন সাইজ আছে দেখায়; চাপলে অর্ডার হয় না, চেকআউট আগের মতোই।
- **Shop:** "Buy again" under the lines of a past order (and on My orders cards): each line through the bag's own add at
  today's price and stock; a sold-out size named with that colour's sizes in stock, never swapped; a product off sale
  named and left out; a set comes back as a set while offered; add-ons, gifts and the old delivery charge not copied;
  two taps are one. `POST /api/bag/reorder` (same site, signed-in owner of the order or the placing browser).
- **Order:** an order placed from that bag carries `Order.reorderOfOrderId`; staff see "Bought again from #…" on the
  order page.
- **Admin:** the Buy again card (states, words in both languages) and the orders from it in the last 30 days on
  Customers › Customer settings — no separate page. Guide [customers/settings](docs/admin-guide/pages/customers/settings.md).
- **Tests:** cart pure and DB (off, state not offered, someone else's order, sold-out size, product off sale, two taps,
  sets), checkout place DB (the tag), web notice and the card.

- **Go-live gate (1 Nov, #73):** "Call me" at checkout (PR 124 follow-up, SIM-F-046; `checkout.callMe`, off): after refused tries or a long pause one tap leaves a call-back in the Support inbox; voice address (PR 117 follow-up, SIM-F-047; `checkout.voice`, off; migration `0074`): the order marked voice-entered with its recording, an unsure reading flagged for a call, Google Speech-to-Text on its mock until the key, the recording cleared by an erasure.
- **Follow-up (#93, PR 110):** "Help me pick my size" in the bag offers Find My Size on the product (`?finder=1`)
  while the finder is on.
- **Follow-ups (#94):** "Send as a gift" on the product page (605; the piece into the bag, the checkout opened as a gift,
  while `checkout.gift` is on); "Complete your look" on his order page while the add-on window is open (128); "paid
  ahead" on the thank-you page and his order page of a COD order (560, display only); "Add a line" and "Remove" on the
  admin order screen (127, the existing lines command, `orders.lines`); the gift on the admin order screen and its
  receipt fields in the ERP order document behind `erp.push.gift` (605; registry v264, off).
- **Follow-ups (#96):** a test server's gift trial reaches the checkout's own requests (605; the live shop unchanged);
  Settings › Policies › Privacy names what the checkout keeps, with a suggested line for his notice (137); the checkout
  advance page shows per layer how many were asked, paid and walked away (558, display only).

### S05 · Order management — Done (21/21)

Stage report (Bengali): [`docs/reports/2026-10-24-S05.md`](docs/reports/2026-10-24-S05.md).

> **বাংলায়:** "বিক্রি" এখন একটাই হিসাব — শুধু ডেলিভারি হওয়া অর্ডার, ডেলিভারির দিনে গোনা; "অর্ডারের মূল্য" (সব দেওয়া অর্ডার) আলাদা করে পাশে দেখায়। সব রিপোর্ট একই হিসাব থেকে নেয়। অডিট লগ আর অন্য ইতিহাস এখন ডাটাবেসেই আটকানো: ওয়েবসাইট নতুন লাইন লিখতে পারে, কিন্তু বদলাতে বা মুছতে পারে না, কেউই পারে না। অর্ডারের ধাপ এখন একটাই নিয়মে চলে: ভুল ধাপ আটকে যায়, প্রতিটা বদল টাইমলাইনে লেখা থাকে; কারণসহ বাতিল আর হোল্ড, টাকা দেওয়া অর্ডার বাতিলে শুধু রিফান্ডের অনুরোধ (টাকা যায় না), ডুপ্লিকেট অর্ডারের যাচাই-তালিকা, নোট আর ফ্ল্যাগ। অর্ডারের অ্যাডমিন পাতাও এখন তৈরি: অর্ডারের তালিকা (কোন অর্ডার কোন অবস্থায় আছে তার ভিউ, খোঁজা, ফিল্টার, ফোনে এক অর্ডার এক কার্ড), এক অর্ডারের পুরো পাতা (সব তথ্য, টাইমলাইন, আর এখন যে কাজগুলো করা যায় শুধু সেগুলোর বাটন — প্রতিটায় "কী হবে" লেখা থাকে), কনফার্ম করার লাইন, আর একসাথে অনেক অর্ডার কনফার্ম / হোল্ড / ছাড়া। টাকা, দাম বা ডিসকাউন্ট কোনো পাতা বদলায় না; টাকা দেওয়া অর্ডার বাতিলে শুধু রিফান্ডের অনুরোধ জমা হয়। রিফান্ড আর রিটার্ন পরের ধাপে। অর্ডার এডিটও এখন তৈরি: কাস্টমার ফোন করলে টিম অর্ডারের পাতা থেকেই নাম, ফোন (লগসহ), ঠিকানা, একই দামে অন্য সাইজ বা একটা পণ্য বাদ দিতে পারে — কারণ আর মাধ্যমসহ টাইমলাইনে লেখা থাকে; কাস্টমারের নিজের এডিট আর "দুই সাইজ" প্রশ্ন (S আর M একসাথে নিলে কোনটা রাখবেন; পরিবারের জন্য হলে শুধু নোট) — দুটোই শুরুতে বন্ধ। কুরিয়ার বুক হলে কোনো এডিট হয় না। কাস্টমারের "আমার অর্ডার" এখন পুরো ইতিহাস রাখে: পাতা পাতা করে সব অর্ডার, অর্ডার বেশি হলে "সব · পথে আছে · ডেলিভারি হয়েছে · বাতিল ও ফেরত" বাছাই, আর প্রতিটা অর্ডারের পাতায় ভাঁজ করা "যা যা হয়েছে" — কখন কী হলো, কে কী বদলাল (টিমের নোট বা ফ্ল্যাগ কখনো না)। অর্ডারের পাতায় কাস্টমারের নিজের এডিটের কার্ড আর "দুই সাইজ" প্রশ্নের কার্ডও এখন আছে — সুইচ চালু করলেই দেখা যাবে।

**Built (PR 610): orders to the ERP v6** (CN-029 Phase 1; only for a store on ERP contract v6) — one line per piece in whole taka,
the ERP's "not now" answers held and sent again by themselves, checkout paused while the ERP account is on hold, short lines decided
on the order page (WAIT, REPLACE, CANCEL), and the order page's ERP card. Details under S09 · Inventory & ERP sync, "Built (PR 610, 611)".

**Built (PR 541, with follow-up 295): the risk-sectioned order list.** Registry v46 (`risk.sections` in `packages/settings/src/registry-risk-more.ts`, on), no migration, no new admin section (the `/admin/orders` list and the order page, demo V12.3). Marking is instant; the decision never is.
- **Sections (541):** the moment an order lands (after the duplicate check and the score) it is placed in **one** section with a note on its timeline: possible duplicate, re-order, new identity, high risk, watch, prepaid or clear (command `riskSection`, the status untouched). Re-order, new identity and high risk **wait for a person**: a "Risk review · <section>" card on `/admin/orders/<id>` says why and lists the matched orders, with Looks fine · Hold (a reason) · Ask the customer (a `RISK_CHECK` call task) · One parcel · Decline (`RISK_DECLINED`, never a block). Re-placed after an edit or "Score again".
- **SIM-F-014:** an order in review is never confirmed or booked — the order machine's new `book` command refuses `IN_REVIEW`, `bookWith` is the one booking entry and `readyToBook` the one list for S08.
- **SIM-F-015:** new signals `identityMatch` (the same name and an alike address under another number, the earlier refusal named) and `orderPieces` (many pieces on a first order), both off.
- **SIM-F-020:** "To confirm" is the COD call queue only; prepaid orders wait in their own **Prepaid** view (and the Dashboard row "Prepaid orders to confirm"); a flagged prepaid order goes to review.
- **The list (follow-up 295):** a Risk column (band · score, section), filters by band and section, and "Highest risk first". API `GET /api/admin/orders?risk=&section=&sort=risk`, `GET /api/admin/orders/reviews?section=`.
- **Tests and gates:** pure `sectionOf` and the machine's `book` guard; PostgreSQL sections (clear, off, prepaid vs COD, SIM-F-014, SIM-F-015, re-order, decisions, list band/sort with cursor pages); the web list chips, filters and timeline words. Guide: [docs/admin-guide/orders.md](docs/admin-guide/orders.md).

**Built (PR 150, with follow-ups 260 and 261): the customer's whole order history and "What happened".** Registry v44 (`account.history` in `packages/settings/src/registry-accounts.ts`: `filters` and `timeline`, both on), no migration, no admin screen (follow-up 302). Matched to demo V12.2 `60-account.js` on the phone; the desktop keeps its own two-column layout.
- **My orders keeps every order (150):** `/account` and `/account/orders` (+ `/bn/…`) list all of his orders, newest first, `account.lists.orders` (20) a page, with Newer / Older and "Page 1 of 3" (`?page=`). Once he has more than a page, the groups **All · On the way · Delivered · Cancelled & returned** show as chips with their counts (`?show=`), and a group with nothing in it says so with a link back to all. `@extas/accounts` `orderHistory` (counts by one grouped read).
- **"What happened" (150):** on `/account/orders/<n>`, folded shut under the items: placed, advance waited for and paid, confirmed, packed, with the courier, delivered (or part), returned or cancelled, each with its stored time, and what he or the shop changed — which fields (never the old or new text), a size from → to, a piece added or taken out, the two-size answer, a cancel asked or kept. Notes, flags, holds, checks and staff names are never shown. `orderLifecycle` reads only the customer-visible event types (`LIFE_EVENT_TYPES`) of his own order (account or this browser), `lifecycleOf` is pure.
- **The edit card (follow-up 260, `orders.edit.customer`, off):** "Change address, phone or size" under the items with how long he may edit and "Edit order (2 left)"; the form opens in place — the address, the mobile number (any way it is typed; the stored one is never re-checked) and, for each piece, the sizes of the same colour at the same price (`CustomerEditState.lines[].choices`). Saved through `/api/account/edit`, then "Order updated · 1 edit left". Closed, it says why (work started, time up, all edits used, with the courier, a cancel asked); no card at all while the switch is off or on a cancelled or returned order.
- **The two-size question (follow-up 261, `orders.twoSize`, off):** "You ordered two sizes" under the order's head with the piece, colour and sizes, "With no answer, we send them all", and **Keep all · Only S · Only M**, answered through `/api/account/two-size-answer`.
- **Test servers only:** `POST /api/account/try-cards` (EXTAS_SHOP_TEST_PAGES=1, mock SMS) signs in as the sample customer, makes the sample order TRY-146 (two neighbouring sizes of one piece, checked by the two-size check) and sets a cookie under which that browser reads both switches as on — nothing is written to settings; the live shop answers 404 and never reads the cookie.
- **Tests and gates:** `lifecycle.test.ts` (pure), `history.db.test.ts` (pages, groups, two customers, hidden internal rows), the edit choices in `edit.db.test.ts`, `try-cards.db.test.ts` (racing fills, nothing written to settings), the registry test; device gate **0 fails in 3231 checks** (100 pages, every size) with the cards, the chips and "What happened" opened; seeded Lighthouse signed in (mobile, 4× CPU, median of 3): My account, one group, the order page and TRY-146 with both cards in both languages — performance 97–98, accessibility 100, TBT 2–130 ms, LCP 1.8–2.1 s, CLS 0.001. Guides: [customers](docs/admin-guide/customers.md), [orders](docs/admin-guide/orders.md).

**Built (PR 142, 143, 146): order edits and the two-size follow-up.** Registry v37 (`packages/settings/src/registry-order-edit.ts`, group `orders`), no migration; every change is a command of the one order service (row lock, version, timeline with who / when / why / where the customer asked, audit before → after), refused once a courier is booked (SIM-F-004).
- **The team's edit (142, `orders.edit`):** "Edit items & address" and "Correct phone (logged)" in More on `/admin/orders/<id>` with the what-will-happen dialog; name, phone (any way it is typed, stored as +880…; SIM-F-037), address, the parcel note, each line kept, changed to another size or colour of the same piece at the same price, or taken out. Never a price, discount, delivery charge or COD change: a size that costs another price now is refused, a set's piece or an offer order's piece is never taken out, the last piece neither (cancel instead); taking a piece out lowers the total and the amount to collect by exactly that line, and a paid order's overpaid part becomes a refund **request**. The stock is re-held, the duplicate check runs again after a phone or line change, the ERP gets the order again. `POST /api/admin/orders/:id/edit`.
- **Real-life reason lists (SIM-F-038):** `orders.edit.reasons`, `orders.edit.channels` (phone call, WhatsApp, Messenger, in the shop …), `orders.refusal.reasons` (bought elsewhere, arrived after Eid …; the courier outcome takes `refusalKey`), and the cancel reason "Did not order (someone else used the number)", never a risk signal.
- **The customer's own edit (143, `orders.edit.customer`, off):** his phone, address and a size in the same colour at the same price, until the owner's step (new only, or until picking starts), an optional time window and a cap (2 saves per order); checked again under the lock so a booking in the same second wins; an address change leaves an ADDRESS_CHANGED call task. `POST /api/account/edit-state`, `/api/account/edit`; the card on the shop's order page is built (follow-up 260, above).
- **The two-size follow-up (146, `orders.twoSize`, off):** right after placing, the same piece in the same colour in neighbouring sizes (the bag's own grouping; S, M, L is one group) flags the order "2 sizes — check", asks on his order page and leaves the caller a TWO_SIZE call task; a group the customer called "for different people" in the bag is only a note, "2 sizes — for someone else" (SIM-F-036). The order page's band answers Keep all / Only S / Only M; "only M" takes the other sizes out through the edit (money and stock consistent), an offer piece waits for a person. `POST /api/admin/orders/:id/two-size`, `POST /api/account/two-size`, `/two-size-answer` (the shop card: follow-up 261, above); WhatsApp and SMS template `order.twoSize` in the default pack, off until the messages are switched on (follow-up 262).
- **Tests:** the machine table with the new commands; PostgreSQL tests through the real checkout for SIM-F-037, SIM-F-038, SIM-F-004 (team, customer and two-size answer after booking), SIM-F-036, sizes at the same price, pieces taken out, the paid-order refund request, STALE, keys, caps and windows; the dialogs and band specs without a browser. Guide: [orders](docs/admin-guide/orders.md).

**Built (PR 138, 144, 145, 147, 153): the order core.** Package `@extas/orders`, migration `0018_order_core`, settings group `orders` (registry v32); its screens are PR 140–154 below.
- **One order service (138):** the states DRAFT, PLACED, AWAITING_ADVANCE, CONFIRMED, ON_HOLD, PROCESSING, PACKED, HANDED_OVER, IN_TRANSIT, DELIVERED, PARTIALLY_DELIVERED, RETURNED, CANCELLED and every command's from → to in `src/pure.ts`; `execute()` runs each command with the order's row lock, the screen's `version` (STALE), the plan (ILLEGAL_TRANSITION with the commands open now), its effects, an OrderEvent (who, when, from, to, reason) and an AuditLog row in one transaction, and an `Idempotency-Key` (a repeat gets the first answer). Flags cancelPending and customerWantsChange; courier, payment and return statuses stay their own records, moved only through the hooks (`awaitAdvance`, `recordAdvance`, `orderStep`) S06–S08 will call. A guard test fails when any other code writes Order.status.
- **Cancel (144):** nine fixed reason codes with the owner's words in both languages (`orders.cancel.reasons`; "Other" needs a note). The cancel releases the order's stock holds, closes a payment still waiting, closes call tasks and reviews, queues the CANCELLED status for the ERP when it had the order, and for anything paid (online or wallet) records a refund **request** only — no money moves (SIM-F-041). A booked order is never cancelled in one step: cancel after booking, then the courier's answer (confirmed → cancelled; refused → the parcel goes on, "customer wants a change", never a risk signal; SIM-F-004). The customer's own cancel (CN-020 (5), SIM-F-056): one tap until the cut-off (`orders.cancel.customer`: off / never / until confirmed (default) / until packed), then a request the team approves or refuses, until booking; `POST /api/account/cancel` and `cancel-state` (no shop button yet, follow-up 190).
- **"Cancel this order" for the customer (1 Nov, #75, PR 144 follow-up, go-live gate customer 360°):** the order page
  `/account/orders/<n>` now draws the cancel card as `orders.cancel.customer` allows it for that order (one tap until the
  cut-off, then a request the team answers, never once a courier is booked): one of the owner's reasons, an optional note,
  then a clear "Yes"; it goes through the one order service, which checks the window again under the order's lock. A
  paid order's cancel records a refund request for the approval queue only, and the card says so. Words `account.cancel.*`.
- **Duplicate defence (145):** the checkout's one-press key and the converted bag; then, when the order lands, other open orders of the same customer or phone in `orders.duplicates.lookbackDays` (5) days, high (same SKU, or same product and colour), medium (same product, other colour) or low (same category); from `reviewFrom` (medium) the order waits in the review queue and cannot be confirmed; decisions not a duplicate / cancel as duplicate / hold / ask the customer (a call task) / one parcel (an OrderGroup, money untouched), each with a FraudDecision, audit and timeline row; auto-hold of a high match off by default.
- **Notes and flags (147):** internal notes (archived, never deleted; `orders.notes.maxChars`), internal flags from `orders.flags.list`.
- **Hold and release (153):** a reason from `orders.hold.reasons` (support reads it on the order), release back to where it was held from; `orderFollowUps` makes one call task for a hold older than `orders.hold.reviewHours` or an advance past `orders.advance.waitHours` (both 0 = off) and never cancels (SIM-F-043).
- **Admin API:** `GET /api/admin/orders` (views new, awaiting advance, on hold, cancel requests, cancel pending, in review, finished, with counts; search; cursor), `/reasons`, `/reviews`, `/reviews/:id`, `/merge`, `/:id`, `/:id/confirm|hold|release|cancel|cancel-request/approve|cancel-request/refuse|cancel-after-booking|courier-cancel|flags|notes`. Permissions `orders.read`, `orders.confirm`, `orders.hold`, `orders.cancel`, `orders.cancelAfterBooking`, `orders.cancelRequests`, `orders.notes`, `orders.risk.read`, `orders.risk.decide`, `orders.merge`.
- **Tests:** every legal and illegal (command, state) pair against a table written from §6.5.1; PostgreSQL tests with orders placed through the real checkout: two commands at once (one wins, one refused), STALE, idempotent replay and mismatch, the append-only timeline and decision log, every cancel effect, SIM-F-041, F-043, F-056, F-004, hold and release, notes and flags, every duplicate decision; the admin API end to end (login, same site, a reader gets 403). Guide: [orders](docs/admin-guide/orders.md).

**Built (PR 140, 141, 152, 154): the admin order screens** on the new shell (demo V12.3 `#/admin/orders`, ORD-01 / ORD-02 / ORD-07), with follow-ups 200 and 180. No new setting, no migration, no new permission; the order state machine and its commands are untouched (the screens only read and call the admin API).
- **The order list (`/admin/orders`, 140, `orders.read`):** the order service's own views as chips with their counts — all, to confirm, awaiting advance, on hold, cancel requests, cancel pending courier, duplicate review, open, finished — the search box (PR 154), and the status / payment method / channel filters kept in the address, so a view is a link a person can bookmark or send. Each row carries the four separate status chips (order, courier, payment, return or refund), the courier with its tracking code, the pieces, the flags and how long ago it was placed; a table on a computer, one card per order on a phone, the order number as the link for the keyboard. "Orders today" for anyone with `metrics.read`. Tick boxes when the person's keys allow a bulk command.
- **One order (`/admin/orders/<id>`, 141, ORD-07):** the records on ⅔ — items with their stored prices, the customer with their other orders by account or phone, delivery and courier, the duplicate reviews, payments and refund requests — and the timeline with the notes on ⅓; on a phone "Details · Timeline" tabs. A button for every command the order service says is open **now** and the person's keys allow: confirm, hold and release with a reason, cancel with its reason code, cancel after booking with the courier's yes or no, the customer's cancel request approved or refused, flags, notes, and the duplicate review's decisions. Each goes through the admin API with the order's `version` and an `Idempotency-Key`, behind a dialog that first says what will happen; when someone else changed the order meanwhile the answer is STALE, the page reloads it and says so. A paid order's cancel states the refund **request** it records — no money moves, no price or discount changes, nobody is blocked. `?do=<command>` opens a dialog straight from a link, and shows the honest denied state when the person has not got that key. "Get invoice" for `orders.invoice` (follow-up 180).
- **The To confirm call queue (`/admin/orders/confirm`, 141, `orders.confirm`, ORD-02):** the oldest order waiting to be confirmed with its whole card and its command buttons, the number still waiting, and the list behind it.
- **Many orders at once (152):** Confirm, Hold (a reason from the owner's list) and Release from the list, each only with its key. The bar says how many of the ticked orders the command can run on and why the others are skipped (the machine's own plan: a status that does not allow it, an open cancel request, an open duplicate review …), the dialog repeats it with "what will happen", then each order runs on its own with its own `Idempotency-Key` and the version it was ticked at, and the dialog lists what was not done and why, each with a link back to the order.
- **One order search (154):** `orderSearchWhere` in `@extas/orders` — the order number, the customer's name, the courier's tracking code, and for anything that looks like a phone the stored +880 number containing the typed digits (01…, +880…, spaces, dashes, part of a number, Bengali digits ০১৭…). The list and the Ctrl K palette's `#` jump use the same condition; from the palette an order opens its admin page with `orders.read`, or its invoice with `orders.invoice`.
- **The shell (follow-up 200):** the Orders section is its built pages — All orders and To confirm — instead of a placeholder; the sidebar badge counts the orders to confirm plus the open duplicate reviews; "Needs you now" on the Dashboard carries four order rows (to confirm, duplicate review, cancel requests, cancel pending courier) with the oldest one's age, each shown only to the keys that open its list.
- **Routes and permissions:** `/admin/orders`, `/admin/orders/<id>`, `/admin/orders/confirm`; `orders.read` to open the list and an order, and then each button by its own key (`orders.confirm`, `orders.hold`, `orders.cancel`, `orders.cancelAfterBooking`, `orders.cancelRequests`, `orders.notes`, `orders.risk.read`, `orders.risk.decide`, `orders.merge`, `orders.invoice`, `metrics.read` for the figures).
- **Tests and gates:** the screens' data helpers tested without a browser (`apps/web/src/lib/admin-orders/*.test.ts`: the rows and chips, the detail view, the command specs, the bulk plan and its skip reasons) and the read helpers on PostgreSQL (`packages/orders/src/admin-read.db.test.ts`, `search.test.ts`); device gate signed in **0 fails in 124 checks** on the three pages and a sample order page; the smoke test opens both new pages and, through its new `adminDiscover` step, one order page found on the list; signed-in Lighthouse (mobile, 4× CPU): the order page performance 97, accessibility 100, TBT 160 ms, LCP 1.8 s, the list accessibility 100 and CLS 0 with TBT 1,520 ms at the default 50 rows (120 ms with one row: follow-up 223). Guide: [orders](docs/admin-guide/orders.md).
- **Planned:** the duplicate / risk review queue, packing, returns and the order settings tabs (follow-up 221), the confirm queue's own tick boxes, call script and WhatsApp self-confirm (220), and Book courier / Print / Tag / Export in the bulk bar (222).

**Built (PR 148, 149, 151): the customer's order messages, their log, and the order export** (backend and admin API; the Messages pages are follow-up 280). Package `@extas/messages`, migrations `0025_message_journey` and `0026_notification_attempts`, settings group `messages` (registry v40, v41) and `orders.export.*` (v42).
- **The order journey (148, CN-019 Messages control centre, MSG-01):** each step — placed, self-confirm, confirmed, packed, booked, out for delivery, delivery day, delivered, Day-1 care, Day-3 review, and the notices cancelled, on hold, advance requested, gift receiver — has its on/off, channel (SMS, WhatsApp, e-mail), fallback, template, delay and audience in `messages.journey` (the owner's send rule: placed SMS + e-mail, confirmed SMS, one WhatsApp when packed, Day-1 and Day-3 WhatsApp on; the rest off). The worker job `messages.run` turns the order timeline (`OrderEvent`) into one queued `NotificationLog` row per step and channel with the dedupe key `order:<id>:<step>:<channel>`; a step once planned is never planned again on any channel (the no-double-send guard), and a step older than the look-back (`messages.engine`, 180 minutes) is never sent late.
- **Before each send:** the master switch (`messages.enabled`, on), quiet hours (`messages.quietHours`, off; the order-placed and self-confirm messages never wait), the caps per order (`messages.caps`: SMS 2, WhatsApp 1; Day-1, Day-3 and the notices outside them), the recipient (a gift's updates go to the sender who paid, never the receiver), and the render rules: no link, no unknown token, and a money line only from the order's own due amount (SIM-F-001: a fully paid order is never asked to pay; the exact-amount line, `messages.exactAmount`, follows `account.track.exactAmount`, CN-014 idea 10). A channel that cannot reach the number falls back (WhatsApp → SMS).
- **Texts:** every template in English and Bengali in the default pack (v2, 74 templates); the language follows the store (`messages.language`).
- **Providers:** SMS, WhatsApp and e-mail go through the connection layer; until the owner types a key in Keys & connections every message goes to the mock and nothing leaves the server (A1.3).
- **WhatsApp self-confirm (148, CN-014 idea 5, off):** a cash-on-delivery order gets "reply 1 to send it, 2 to change it, 3 to cancel it" (`messages.selfConfirm`: wait 3 hours, all orders, the order's one WhatsApp). His 1 confirms the order through the order service with a staff confirm's guards (`confirmOnYes`, on; an open duplicate review, cancel request, advance or hold leaves it for the team); 2 or 3 make a call task and change nothing; no reply in the wait makes one call task. Until the WhatsApp webhook exists (follow-up 282) staff record the reply.
- **The log with retries (149):** every try is a `NotificationAttempt` row (append-only, locked at the database like the audit log) with provider, mode, error and cost; a failed send waits and tries again (`messages.retry`: 3 tries, after 5 and 30 minutes), then is FAILED with its reason and the fallback channel runs. Staff see the log with filters and counts per status (`messages.log.pageSize` 50) and one message's tries, and retry a FAILED message by hand (audited; not when the step already went by another channel).
- **Order export (151):** the list's filters or up to 1,000 ticked orders as one CSV file, newest first; the owner's columns and order (`orders.export.columns`, 31) and separator (`orders.export.delimiter`, comma); more than `orders.export.maxRows` (5,000) is refused with the count, never cut. The customer's name, phone, e-mail and address only with `orders.exportPersonal`; cost, ERP figures, IP and device never. BOM for spreadsheets, times in the store's zone, a leading `'` on a cell a spreadsheet would run as a formula. Each export is an ExportJob and an audit row; the file is not kept.
- **Admin API and permissions:** `GET|PUT /api/admin/messages/journey`, `POST /api/admin/messages/self-confirm`, `GET /api/admin/messages/log`, `GET /api/admin/messages/log/:id`, `POST /api/admin/messages/log/:id/retry`, `GET|POST /api/admin/orders/export`; `messages.journey.read`, `messages.journey.write`, `messages.selfConfirm.reply`, `messages.log.view`, `messages.log.retry`, `orders.export`, `orders.exportPersonal`.
- **Tests:** the pure rules (steps, render rules, answers), the journey on PostgreSQL with orders placed through the real checkout (never twice, caps, look-back, quiet hours, the master switch, fallback, gift sender, self-confirm answers and timer, the yes-confirm and its guards, retries and the log), the export (permissions, personal columns, filters, ticked orders, limit, formula guard) and the admin API end to end. Guides: [comms](docs/admin-guide/comms.md), [orders](docs/admin-guide/orders.md).
- **Planned:** the Messages pages (280), live WhatsApp and e-mail providers (281; SMS is follow-up 140), the WhatsApp reply webhook (282), ~~the out-for-delivery event from S08 (283)~~ (built with PR 184), promotions (284), the Export button (222).

**Built (PR 546, follow-up 287): the cancellation notice (SIM-F-013)** (backend and admin API, on the PR 148 journey; registry v45, default pack v3, no migration).
- **Why, in plain words:** the journey's "cancelled" step (off by default, outside the caps, never twice) fills `{cancelReason}` from `messages.cancelNotice` — short words per cancel code in English and Bengali ("The item ran out of stock. Sorry!"); the team's own note is never sent.
- **Silent reasons:** a fake order (RISK_DECLINED) and "someone else used his number" (NOT_ORDERED) send nothing and the log says `REASON_SILENT`; the list is a setting.
- **Duplicates:** a duplicate cancelled while his other order goes ahead gets `order.cancelledDuplicate` with that order's number and tracking link (`{keptOrderNumber}`, `{keptOrderLink}`): the duplicate review's match, else his other open order by phone or account; with none, the plain notice. A kept-order token without such an order is refused, never sent empty.
- **Cancel request refused (follow-up 287):** its own step `cancelRefused` (off, SMS, `order.cancelRefused`), started by the refusal's timeline row; only while the order still goes ahead.
- **Admin API:** `GET|PUT /api/admin/messages/journey` reads and saves `cancelNotice` too. Guide: [comms](docs/admin-guide/comms.md).
- **Tests:** the words and refusals, the pack, and on PostgreSQL through the real checkout: off by default, one notice with the reason and the link, the one-tap cancel, a duplicate declined in review and one cancelled by hand, the silent reasons, outside the caps, the refused request.

**Built (PR 155): one KPI definition (CN-022, owner 23 Oct).** Package `@extas/metrics`.
- **The rule, once (`src/pure.ts`):** Sales = orders in DELIVERED, counted on the delivered day (`deliveredAt`); Ordered value = every placed order (all but DRAFT, cancelled and returned too), counted on the placed day; archived orders count in neither; days are shop days in `store.timeZone`. Until the order state machine exists nothing reaches DELIVERED, so Sales shows 0.
- **Functions (`src/metrics.ts`):** `kpi` (the headline pair), `kpiByDay` (every day filled), `kpiByZone`, `kpiByPaymentMethod`, `lines` / `linesBoth` with `sumLines` / `groupLines` for one product's or combo's own lines.
- **Views on it:** the combo report `/admin/combos?tab=report` (tiles "Ordered value" and "Sales (delivered)" side by side, sets ordered, per-combo ordered and sales; it showed ordered value labelled as sales before) and the rename before/after report (PR 590).
- **Guard:** `packages/metrics/src/guard.test.ts` fails on an ad-hoc sum of order or line money, or a read of the PR 603 `mv_` views, anywhere else in the app.
- **Tests and gates:** pure tests and PostgreSQL tests with orders in every state (PLACED never in Sales), two stores, zones, payment methods, a late-evening delivery; smoke `figures` check on the combo report (`docs/qa/smoke.json`); device gate on the report page (0 fails). Guides: [combos](docs/admin-guide/combos.md), [analytics](docs/admin-guide/analytics.md).
- **Report views (follow-ups 92, 93):** migration `0012_kpi_report_views` — `mv_kpi_daily` (per store, basis and shop day) and `mv_kpi_lines_monthly` (per product, category, style group, district, upazila), counted exactly like the package; refreshed by `extas_refresh_kpi_views()` (`refreshKpiViews`, the app role may run it); read only through `kpiByDayFromView` / `linesByMonthFromView`, which answer live when the asked zone is not the views' zone; the four PR 603 `mv_` views are kept and marked superseded; index `idx_order_sales_delivered` on Order (storeId, status, deliveredAt). PostgreSQL tests: view = live, another zone answers live, the time-zone setting moves the views.
- **Dashboard tiles (follow-up 90, built 23 Oct):** Delivered sales and Ordered value on `/admin` (the new admin shell, S00), today / 7 / 30 days, each with its status; smoke `figures` reads them.
- **Planned:** the order analytics screen (follow-up 91).

**Built (PR 139): the audit log and the history tables are append-only at the database (CN-022).** Migration `0010_append_only`.
- **Two guards:** the app connects as its own role `extas_app`, which may insert and read but has no UPDATE, DELETE or TRUNCATE on AuditLog, SecurityEvent, SettingChange, SecretAccessLog, OrderEvent, StockMovement, WalletEntry, RewardEntry, PriceHistory, ProductRename, SmartRuleVersion, CheckoutFlagEvent, FraudDecision and ShipmentEvent; and a trigger on each refuses those for every role, the owner included. A correction is a new row.
- **Which models:** `packages/db/src/schema-meta.ts` lists the locked ones and every other `@append-only` model with its reason; the schema guard fails when a new one is in neither list.
- **Server:** server setup makes the role's password (`APP_DB_PASSWORD`, never in Git) and PgBouncer's login; the deploy, after the migrations, gives the role its login and points `DATABASE_URL` and `REPORT_DATABASE_URL` at it (`infra/deploy/app-role.sh`; it never fails a deploy and puts the old settings back when a run fails). Migrations, the settings sync, the seed, backups and the owner scripts keep the owner role. The smoke test checks every guard after each deploy and every night.
- **Retention:** how a purge would work is documented in the migration (owner role, an audit row, trigger off for one transaction); not built (follow-up 95). Guide: [team](docs/admin-guide/team.md).

Register: [S05](docs/MASTER-REGISTER.md#s05--order-management--pr-138155).

- **Orders › Incomplete orders (6 Nov, #83; S13 · PR [274](docs/stages/S13.md#pr-274)–276):** checkouts typed and left,
  failed prepaid orders and left bags, with the follow-up and left-bag cards; All orders ends its views with an
  "Incomplete" chip. Details under S13 · Marketing & ads. Guide [orders/incomplete](docs/admin-guide/pages/orders/incomplete.md).

- **Go-live gate (1 Nov, #73; PR 148 follow-up, SIM-F-052/F-053):** four more journey notices, each off: refund paid with the amount, exchange approved with the new parcel and what its rider collects, a failed delivery try, the late apology.
- **Follow-ups (#93):** "Needs you now" rows and the Orders badge for orders awaiting their advance (140) and "2 sizes
  — check" (146, also an order-list view `twoSizes`); the order timers run on the worker once an hour per store while
  one is above 0 (153; only a call task and a timeline line); My account's history names the pieces in Bengali, a
  test-server fill makes its pager measurable, and `account.history` is a card on Customer settings (150); his
  cancelled order's page says why and names the order that goes ahead (546); `shop-price.changed` lets a SKU sell again
  and sends the orders held for its price, and orders the ERP keeps refusing raise one alert after
  `erp.orders.heldAlertAfterHours` (610; registry v239, empty = off).
- **Follow-ups (#94, PR 541):** a paid prepaid order nothing flagged confirms by itself (`orders.prepaid.selfConfirm`,
  registry v266, off; it only confirms); the list, the order page and the bulk skip name what the review is.
- **Follow-ups (#96):** a cheaper order list — the server draws the rows, one listener reads taps and ticks (140); the
  bulk bar's Export (CSV) and Print invoices for the ticked orders (152; Tag and Book courier are left); Reports ›
  Orders by day, zone and payment method on the one KPI (155); "What happened" adds the courier's own steps (150); ERP
  orders and lines are foreign keys (610, migration 0177).

### S07 · Payments & wallet — Done (10/10)

> **বাংলায় সংক্ষেপে:** প্রতিটা পেমেন্টের অবস্থা আর টাকার হিসাব এখন এক জায়গায়; গরমিল হলে সবসময় কারণসহ দেখায়। টাকা দেওয়া কাস্টমারকে
> রাইডার আর টাকা চাইবে না। কুরিয়ারের হিসাব (CSV) মিলিয়ে দেখা যায়। বিকাশ যুক্ত করার ব্যবস্থা তৈরি, চাবি না দেওয়া পর্যন্ত অনুশীলন মোডে।
> পেমেন্ট ব্যর্থ হলে বা ফেরার পথে নেট গেলেও অর্ডার একটাই থাকে, টাকা এলে সার্ভার নিজে খুঁজে লিখে রাখে। ~~ফেরত (রিফান্ড) আর ওয়ালেট পরে আসবে।~~
> কাস্টমারের ওয়ালেট এখন একটা খাতা (ভুল হলে উল্টো এন্ট্রি, কিছু মোছা হয় না); রিফান্ড আপনার অনুমোদন ছাড়া কখনো যায় না; প্রি-অর্ডারে
> সীমার মধ্যে অগ্রিম চাওয়া যায়; বিকাশ/নগদ/কার্ডের স্টেটমেন্ট মিলিয়ে রিপোর্ট, প্রতিটা অমিল কারণসহ। সব নতুন সুবিধা বন্ধ অবস্থায় আসে।
> নতুন (#73): নগদ আর কার্ডে (SSLCommerz) পেমেন্ট, চাবি না দেওয়া পর্যন্ত প্র্যাকটিস মোডে — S07 শেষ। ফেরত আসা অগ্রিম পার্সেলের টাকা ফেরতের অনুরোধ নিজে থেকে হয়, "টাকা ফেরত আর ওয়ালেট" পাতায় একজন মেনে নেন; কাস্টমারের পাতায় ওয়ালেট ট্যাব।

**Built (PR 165, 166, 167, 170, package `@extas/payments`, migration `0030_payments`, registry v47).** No refund, wallet, COD rule, price, charge or discount changed; no money moves by itself.
- **Payment model (165):** payment states INITIATED → PENDING → AUTHORIZED → PAID / FAILED / CANCELLED through one outcome writer; money status ESTIMATED → PROVISIONAL → RECONCILED → FINAL, only forward; the amount due and what the rider collects; every mismatch has a reason code (SIM-F-028). Staff-recorded money is off by default (`payments.manual`), needs `payments.record`, one per Idempotency-Key, audited.
- **COD after the door (166):** a paid customer is never asked again (SIM-F-001); the rider's outcome per parcel — delivered, partial, charge paid and returned, refused (SIM-F-005), once per parcel (`payments.door`); a partial waits for approval (`payments.cod.partialNeedsApproval`, on; `payments.partials`); courier statements by CSV or lines (`payments.settle`), each line matched with its reason, a checked line resolved with a note; the cash with the courier and on the road.
- **Gateways (167):** one gateway contract for bKash, Nagad and card in `@extas/adapters` with the practice gateway; bKash tokenized checkout behind it, keys only in Keys & connections, on the practice gateway until the Test passes.
- **Callbacks (170, SIM-F-026):** `GET|POST /api/payments/callback/<provider>` checks our signed address, stores each callback once (a repeat is one payment, a forged one is never processed) and asks the gateway before writing money; "Pay" opens the gateway; the worker's `payments.pending.sweep` asks about unanswered payments after 10 minutes and marks them abandoned only when the owner sets a time (off); failed, abandoned and waiting payments for the team.
- **Go-live guard (PR 125, follow-up 50):** the test payment page answers only while `payments.testPayments` is on (switched off on go-live day) and no real gateway is connected.
  **Test payments off by default (31 Oct, #71):** `payments.testPayments` now ships off (the sample seed turns it on for
  the sample store only); while off the checkout offers no online method still on the practice gateway and every
  practice-gateway callback is refused; a callback whose payment id differs from the one stored at start is refused;
  the go-live list's `testPayments` item stays red while a live store has it on. A staging store that was not
  sample-seeded switches it on in Settings → Payments to try practice checkouts.
  **The go-live gate's own run (1 Nov, #76, PR 170 follow-up):** a gate run (gate-orders, gate-c360) opens a grant for
  itself — an `IdempotencyKey` row, scope `gate-run.mock-pay`: the SHA-256 of a random token, the preview host, a short
  expiry, audit lines by the system. While it is open, the checkout and the shop's payments read `payments.testPayments`
  as on only for a request on that host carrying the run's cookie `extas_gate_run` (`lib/shop/gate-run.ts`); never on a
  host the shop sells on. The shop never sets that cookie, and the admin's payments are never wrapped.
- **Review round 1 (31 Oct, #71):** an online order whose money has not come in is never confirmed (`PAYMENT_DUE`; PR 138)
  and the Prepaid view leaves it out; refunds made by the system never add up to more than came in (`OVER_REFUNDABLE`;
  PR 172); a partial delivery's COD counts only active lines (PR 166); a percent discount is rounded to a step a rider
  can collect (`checkout.money.roundingStepMinor`, ৳1; PR 208); a payment retry asks for what is due now.
- **Review round 2 (31 Oct, #72):** the selling-price floor rounds up to the same money step, so a cut held at the floor
  leaves no paisa (PR 208); "Set delivery area" never makes money due on a paid-ahead order past PLACED (PR 563).
- **Admin API:** `/api/admin/payments/` — `orders/:id` (money), `orders/:id/payments` (record), `orders/:id/door`, `door/:id/decide`, `cod`, `settlements`, `settlements/:id`, `settlements/lines/:id/resolve`, `issues`. Permissions `payments.view`, `payments.record`, `payments.door`, `payments.partials`, `payments.settle`. No admin page yet (follow-up 333); guide `docs/admin-guide/integrations.md`.
- **Settings:** group `payment` — `payments.manual`, `payments.mismatch.reasons`, `payments.cod`, `payments.cod.statement`, `payments.pending`, `payments.testPayments`; every number editable, new features off.
- **Tests:** the pure model, matching and statements; PostgreSQL money, door, statements, callbacks, the sweep and SIM-F-001/005/026/028; the bKash adapter against a fake bKash; the admin API, the shop's callback journey and the guard; the worker's job and planner.
**Built (PR 171, 172, 173, 174, migration `0038_wallet_refunds_statements`, registry v55 `registry-wallet.ts`).** Every new feature is off; nothing pays out by itself.
- **Wallet (171):** one ledger writer (made on first use, one entry per key, never below zero, the balance after each entry; append-only at the database); a correction is a new entry the other way, once; a person's own credit / debit off until `payments.wallet.manual` (limit, reason, [confirm], audited; `payments.wallet`); the late-delivery apology credit (CN-018 #8) off until `payments.wallet.apology` — per order or by rule (an amount or a % of the goods, only when late past the promise), once per order, to the wallet (`payments.apology`).
- **Refunds (172):** asked within `payments.refunds` (to the wallet off; none after delivery except the rider's overcharge, never more than he over-collected; a returned prepaid parcel gives everything back or keeps the delivery charge; four eyes off), never more than the money not yet held by another refund; the owner approves or rejects with [confirm]; paid out to the wallet through the ledger, or by a person who sends the money back and records the reference; the payment becomes partly or fully refunded; the money owed to customers is always on the list (`@extas/metrics`). Permissions `payments.refunds.request`, `.approve`, `.execute`.
- **Partial payment (173):** a pre-order's advance on a COD order within `payments.partial` (off; cap 10% of the total; no minimum; the whole order in advance off), paid online by the customer; only money that came in lowers what the rider collects (`payments.advance`).
- **Reconciliation (174, SIM-F-028):** a gateway's statement file (`payments.statement` column names) imported once per file and reference, each line matched by its transaction ID with a reason code on every mismatch (`payments.statement.reasons` words), a checked line resolved with a note, the practice gateway's own statement; the report of a period — ours against each gateway's statements and fees, every open mismatch (gateway, courier COD, payment rows, missing) with its reason, the COD position, money owed to customers, paid cancelled or returned orders with no refund asked (SIM-F-041), the wallet ledger check.
- **Admin API (171–174):** `wallets/:customerId`, `wallets/:id/entries`, `wallets/entries/:id/reverse`, `apology`, `orders/:id/apology`, `refunds`, `orders/:id/refunds`, `refunds/:id/approve|reject|complete|fail`, `orders/:id/advance`, `statements`, `statements/:id`, `statements/lines/:id/resolve`, `statements/practice`, `reconciliation?from=&to=`. No admin page yet (follow-up 422); guide `docs/admin-guide/finance.md`.
- **Settings (v55):** `payments.wallet.manual`, `payments.wallet.apology`, `payments.refunds`, `payments.partial`, `payments.statement`, `payments.statement.reasons`.
- **Tests:** the ledger, refund, advance and statement rules; PostgreSQL wallet, refunds, advance, statements and the SIM-F-028 acceptance test (no open mismatch without its reason and words); the metrics money figures; the admin API.
- ~~Still planned in S07 (after launch): Nagad (168), card (169).~~ Built in #73 (below).
**Built (PR [168](docs/stages/S07.md#pr-168), 169; 1 Nov, #73, After launch): Nagad and card on the gateway contract.**
- **Nagad (168):** `packages/adapters/src/payment/nagad.ts` — initialize and complete with the merchant's signed, encrypted
  data; only Nagad's own verify is trusted; keys only in Keys & connections; the practice gateway until the Test passes.
- **Card and bank (169):** `packages/adapters/src/payment/sslcommerz.ts` (SSLCommerz) — every card type and Pay online on
  it; only its VALID answer is trusted; a callback must name its payment's own session.
**Go-live gate (1 Nov, #73): refunds and the wallet on screen.** Nothing pays out by itself; every refund is a request a
person approves (hard rule 6).
- **Returned prepaid parcel (PR 172 follow-up, SIM-F-041):** the `returned` and `deliveryCorrected` steps ask the refund in
  the same transaction, once per order, capped by what is left; a partly delivered paid parcel asks for the pieces that
  came back (review round 3); a re-ship exchange takes back what its new parcel uses; a repeat refuser's delivery-charge
  advance is kept unless `payments.refunds.rtoAdvance` says ASK (BLOCKED 28). Money › Refunds & wallet
  (`/admin/money/refunds`, `payments.view`): the money owed, views, approve (tick), reject with a reason, mark paid with
  the payout reference, payout failed, the money rules under "More options". The customer's order page shows each
  refund's state. Guide [money/refunds](docs/admin-guide/pages/money/refunds.md).
- **Wallet tab (PR 171 follow-up, SIM-F-054):** Customers › the customer › Wallet: balance, a drift warning, the newest
  ledger lines with why and who, "Put right" once, "Add or take money by hand" behind `payments.wallet.manual` (off), his
  late orders' apology credit; store credit only, never changed or removed.
Register: [S07](docs/MASTER-REGISTER.md#s07--payments--wallet--pr-165174).
- **Follow-up (#94, PR 167):** the courier and gateway adapters and the messages turn minor units into amounts with the
  currency's own fraction digits (`@extas/adapters/money`); taka amounts unchanged.

### S08 · Courier, returns, exchange — Done (26/26)

> **বাংলায় সংক্ষেপে:** কুরিয়ারের কাঠামো তৈরি: Steadfast আর Pathao একই নিয়মে চলে, চাবি না দেওয়া পর্যন্ত প্র্যাকটিস মোডে।
> বদল, ফেরত মাল চেক আর দরজায় ফেরতের পাতা তৈরি: যে পিস আসলে ফেরত আসে স্টকে সেটাই ফেরে; নিজের সাইজ বাছাইয়ে দ্বিতীয় ডেলিভারি কাস্টমার দেন, আমাদের ভুলে ফ্রি;
> দোকানের দোষে দরজায় ফেরত কখনো গোনা হয় না; দরজায় ফেরতের তালিকা শুধু প্রস্তাব করে, একজন মানুষ ঠিক করেন, কাউকে আটকায় না।
> বুকিং সবসময় একজন মানুষ করেন; বাতিল, হোল্ড বা রিভিউতে থাকা অর্ডার কখনো বুক হয় না; গিফট যায় যে পাবেন তার কাছে, তার দিনের আগে না।
> কুরিয়ারের সমস্যা (ডেলিভারি ব্যর্থ, ঠিকানায় সমস্যা, হারানো, নষ্ট) কারণসহ দেখা যায়; ফেরত পার্সেলের খরচ শুধু আসল পার্সেল থেকে। টাকা এখান থেকে কখনো নড়ে না।
> নতুন: অর্ডার → প্যাকিং আর প্রিন্ট — স্টিকার (বারকোড, আসল COD, গিফট হলে যে পাবেন), আবার প্রিন্ট করলে কারণ লেখা থাকে; দৈনিক পিকিং লিস্ট (ক্যাটাগরি → স্টাইল → রং → সাইজ, কম স্টক দাগানো, হোল্ডের অর্ডার আলাদা); রাইডারের হ্যান্ডওভার শিট আর "হ্যান্ডওভার হয়েছে"।
> নতুন: কুরিয়ারের খবরে অর্ডার নিজে এগোয় (নিয়ম মেনে); কুরিয়ার "পৌঁছেছে" বললেও আমাদের হিসাবে ফেরত মনে হলে একজন যাচাই করেন; পার্সেল কেন ফেরত এলো — রাইডারের কথা আর মালিকের তালিকা থেকে কারণ। সব নতুন সুইচ শুরুতে বন্ধ।
> নতুন: প্যাক পাতা — পিক, প্রতিটা পিস স্ক্যান, সব মিললে তবেই "প্যাক হয়েছে", তারপর কুরিয়ার বুক আর হ্যান্ডওভার; প্যাকিংয়ের ছবি আর ওজন মেলানো (দুটোই শুরুতে বন্ধ)। পিস ভাঙা বা পাওয়া না গেলে কার্ড খোলে, অর্ডার হোল্ডে যায়; একজন মানুষ ঠিক করেন — পাওয়া গেছে, অন্য সাইজ, বাকিটা পাঠান, ফোন বা বাতিল। নিজে থেকে কিছু বাতিল হয় না, টাকা ফেরত শুধু মালিকের কাছে অনুরোধ।
> নতুন (PR 612–614, ERP-র নতুন নিয়মে — সুইচ চালু হলে): কুরিয়ার ফেরত দেওয়া পার্সেল গুনে ERP-তে তালিকা যায়, গুনতিতে না মিললে কুরিয়ারের কাছে দাবি; ফেরতের নতুন পাতায় সাতটা ট্যাব, প্রতিটা পার্সেলের পুরো ঘটনা, ক্ষতির হিসাব আর প্রতি রাতে ERP-র সাথে মেলানো; বদল ERP দিয়ে, ডেলিভারির 72 ঘণ্টার মধ্যে, আগে স্টক দেখে। পিস আবার বিক্রি হবে কিনা মালিক ERP-তে ঠিক করেন। ডেলিভারির পর কোনো টাকা ফেরত নেই। এখন সব দোকান আগের নিয়মেই চলে।
> নতুন (#73): সবচেয়ে কম খরচের কুরিয়ার আগে বাছাই, অ্যাকাউন্ট থেকে সাইজ বদলের অনুরোধ, কুরিয়ারের রিপোর্ট আর ক্লেইম, রাইডারের বেশি টাকা নেওয়ার রেকর্ড, ছুটির মোড আর ঈদের শেষ দিন, চার্জের অমিলের খাতা — S08 শেষ। বুকিংয়ের পরে টাকা বদলালে লাল লাইন আর আবার বুক; স্টিকারে ইংরেজি অক্ষরে ঠিকানা (শুরুতে বন্ধ)।

**Built (PR 611): the shipment at pickup and every delivery result to the ERP v6** (CN-029 Phase 1; v6 stores only) — the shipment
goes when the courier confirms pickup (the ERP's bill), every courier result by `PUT /orders/{id}/delivery` (held while a PR 525
check is open), the order page's Partial delivery box and the ERP's identification colour. Details under S09 · Inventory & ERP
sync, "Built (PR 610, 611)".

**Built (PR 175, 176, 177): couriers behind one adapter.** New package `@extas/shipping`; the courier contract in `@extas/adapters` (`src/courier/`); migration `0033_courier` (additive: parcel mode, try, reference, receiver, note, exception, tracking time; event id, reason, source); settings registry v50 (`packages/settings/src/registry-shipping.ts`, group `delivery`); backend and admin API only — the Delivery screens come on the new admin shell (follow-up 370).
- **The contract (175):** one `CourierApi` — book, find by the shop's reference, track, health — with the shop's own parcel states and the courier exceptions of SIM-F-017 (a failed try, an address problem, lost, damaged), each with a reason. A courier word the table does not know is stored raw and flagged, never guessed. A courier never invents money: a charge or a collected amount is only what the courier itself said.
- **Practice first (A1.3):** every courier runs on its practice world until the owner types its keys into Keys & connections and the Test passes — deterministic `MOCK-` ids, scripted lives (delivered, review, failed try, address problem, lost, damaged, partial, refused) in the courier's own words, planned failures and timeouts, no money ever (SIM-F-027).
- **Parcels (175):** courier accounts (`/api/admin/delivery/couriers`: add, switch off, archive — never deleted); events stored once per courier event id, the state from the newest understood event (out-of-order safe, finished stays finished); staff record what the courier said on the phone (`POST …/parcels/:id/exception`, audited); the parcel list by view and one parcel with every event (`/api/admin/delivery/parcels`).
- **RTO cost book (175, SIM-F-027):** `GET /api/admin/delivery/rto-cost` — the shop's own returned parcels only, both courier legs (the courier's report, else the owner's rate card by weight slab), packaging, handling and the ad share from `delivery.courier.rtoCost` (owner figures empty; a missing part named, never counted as zero); practice parcels never real cost.
- **Booking (176):** always a person's press — one order, the ticked ones or "Book all" (`GET/POST /api/admin/delivery/bookings`) — through the order service's `bookWith` and its `readyToBook` view, so a cancelled, held, unconfirmed or in-review order is never booked (SIM-F-002, SIM-F-014). The parcel goes to `deliveryTarget()` (a gift's receiver, the owner's gift line, held until its booking day; SIM-F-007), carries the live amount due, and the order refuses every edit once booked (SIM-F-004); the weight is the pieces' own, unknown never guessed (SIM-F-029). Refused → `BOOKING_FAILED` with the reason, ready again; no answer → "Try again" asks the courier by reference first (`POST …/parcels/:id/retry`), never booked twice.
- **Tracking (176):** the worker job `courier.track` (queue `courier`) reads the parcels the couriers hold per store and slot; staff read one now (`POST …/parcels/:id/track`).
- **Steadfast (176) and Pathao (177):** Steadfast — API key and secret key; its `hold` is a failed try. Pathao — client id and secret, merchant login, Pathao store id; Sandbox/Live addresses; zone ids from the area mapping, weight in kg, its own fee recorded as the courier's charge; it charges by weight, so a parcel without one is never sent (`NO_WEIGHT`); no lookup by reference, so a lost answer is never booked again by guess.
- **Settings (v50):** `delivery.courier.rtoCost`; `delivery.courier.booking` (gift lead days 0, gift line en/bn, note language en, piece names on, 100 per press); `delivery.courier.tracking` (on, every 60 minutes, 200 a run). Permissions `delivery.parcels`, `delivery.book`, `delivery.exceptions`, `delivery.couriers`.
- **Tests:** the contract and both clients against stand-in servers (no real keys); booking, tracking and the RTO book on PostgreSQL (every SIM finding above); the routes; the job and its planner; every state, reason, outcome and courier labelled in both languages. Guides: [couriers](docs/admin-guide/couriers.md), [Keys & connections](docs/admin-guide/integrations.md).

**Built (PR 179, 180, 181): Orders → Packing & print.** New package `@extas/documents` (pure: data in, PDF bytes out — each page one greyscale picture at the printer's dpi, so Bengali prints right on any printer; Code 128; text shaped by the server's fonts); migration `0043_courier_zones_print` (additive); settings registry v56. Three pages on the new admin shell, each with its Bengali guide.
- **Print run (179) — `/admin/orders/packing/print`:** the booked parcels still with us, in packing order. The sticker: shop and courier, the consignment id as a barcode with the tracking code, the receiver (a gift's receiver, sender and day; SIM-F-007), the live amount to collect on a black band or "collect nothing", every piece in a box (no prices), REPRINT n; too many pieces → smaller type, then a second sticker (2/2). A parcel not booked, already picked up, with a COD that is not the live due or a receiver changed after booking is refused as a whole (SIM-F-004). API `/api/admin/packing/stickers`.
- **Print queue and reprint safety (180):** every press is one print job (which parcels, who, when); the same press sent twice prints once; a reprint is the same parcel with its reason ("Recent prints" on the page). Nothing books, re-books or changes COD.
- **Picking list (181) — `/admin/orders/packing/picking`:** every order still with us and not with the courier, however many days (Blueprint B1.6); held and problem orders listed apart and never counted; category → style → colour → size, most pieces first, a tick box per size and SHORT n against the shop's stock; the summary line (orders and pieces apart, line items, categories, shortages, held; B1.7); each print kept as a PickingList. API `/api/admin/packing/picking`.
- **Handover (180) — `/admin/orders/packing/handover`:** per courier the printed parcels waiting, the rider's sheet (one open batch per courier, A4 on the letterhead, ticks, COD total, signatures) and "Handed over" with the receiver's name (every order HANDED_OVER through the order service, audited). API `/api/admin/packing/handover`.
- **Settings (v56):** `delivery.sticker.layout` (100x150 mm, 203 dpi, en, type 100 %, smallest 80 %, shop name on, 100 per print), `delivery.sticker.exactAmount` (off), `delivery.sticker.queue` (reason asked on, 20 recent prints), `delivery.handover.sheet` (A4, 150 dpi, en, receiver name, signatures and pack on handover on), `delivery.picking.list` (A4, 150 dpi, en, mark shortages on) — shown read-only on the pages until the settings editor (follow-up 431). Permissions `fulfilment.read`, `fulfilment.print`, `fulfilment.handover`.
- **Tests:** the PDF writer, Code 128 (a scanner round trip), the layout and both PDFs (en/bn, opened and checked); print, reprint, replay, handover and picking on PostgreSQL; the routes; device gate on the three pages. Guides: [print](docs/admin-guide/pages/orders/print.md), [picking](docs/admin-guide/pages/orders/picking.md), [handover](docs/admin-guide/pages/orders/handover.md).
- **Not here (their own PRs):** COD collection and the courier's money (S07, 525–526), ~~the packing step and the weight check (182; follow-ups 433, 434)~~ (built: PR 182, 183, below), returns and refused parcels (189, 191), the order's status from the parcel and courier webhooks (184), the courier choice by real cost (178), the rest of S08.

**Built (PR 182, 183): Orders → Packing & print → Pack.** One page, `/admin/orders/packing` (the tab's first page), on the order service (`@extas/orders`) and `@extas/shipping` (`packing.ts`, `packing-pure.ts`, `packing-issues.ts`); migration `0046_packing` (additive: PackingScan, append-only and locked; PackingPhoto; PackingCheck); settings registry v59 (`packages/settings/src/registry-fulfilment.ts`, group `delivery`); permissions `fulfilment.pack`, `fulfilment.photoWaive`.
- **Four steps (182):** Pick (confirmed) → Pack (picking) → Ready for courier (packed) → Handed over (today and the days set), each with its count; every list and "Start picking for all" share one filter, so a cancelled, archived, in-review or cancel-asked order never shows (SIM-F-002). The screen shows the order number, pieces, SKUs and the courier — no customer name, phone or address.
- **Every piece checked (182):** scanned (SKU or barcode), typed when the scanner is off, or ticked in tick mode; a code not on the order or a line already checked is refused and nothing stored. "Mark packed" goes through the order service under the order's lock only when every line matches, no packing card is open, the owner's required photo is there and the weight is near the pieces' weight.
- **Packing photo (182, SIM-F-010):** from the phone camera, location and metadata stripped; "required" stops packing and booking (`PHOTO_REQUIRED`), "remind" only reminds; the owner's waiver with a reason (`fulfilment.photoWaive`); the nightly job `packing.photos.expire` archives records past the days to keep (files are never removed; follow-up 463).
- **Weight check (182, follow-up 434):** the scale reading against the pieces' weight; a gap over both the percentage and the grams asks to weigh again or confirm (`WEIGHT_GAP`).
- **Book and hand over (182, follow-up 433):** a packed order is booked from the screen with every booking rule; the handover now needs packed parcels (`packOnHandover` off).
- **Defect or missing piece (183, SIM-F-006):** "Report defect / out of stock" on a line opens a packing card (the stock sync's shortage card shows the same way) and holds the order, from confirmed or from picking. Any open card stops packing and booking. A person decides each card through the order service: found / fine (a shortage card needs `inventory.audit`), another size or colour at the same price (`orders.edit`), send the rest (`orders.edit`; a paid order gets a refund **request**, PR 172), cancel as out of stock (`orders.cancel`), or "Call the customer" (one call task). The last decided card releases the hold. Nothing is cancelled or refunded by itself; a card past the hours is only marked late; a booked parcel is not edited.
- **Settings (v59):** `fulfilment.packing.check` (scan, typed on), `fulfilment.packing.photo` (off; required, 1 photo, 30 days), `fulfilment.packing.weight` (off; 15 %, 100 g, reading not required), `fulfilment.packing.queue` (1 day, 200 a list), `fulfilment.packing.issues` (hold on, defective-item / waiting-stock, 48 hours to decide, edit reason customer-asked) — read-only chips on the page until the settings editor (follow-up 462).
- **API:** `GET /api/admin/packing/orders?step=`, `GET …/orders/{id}`, `POST …/orders/pick-all`, `…/{id}/start`, `…/{id}/piece`, `…/{id}/pack` (Idempotency-Key), `…/{id}/photo`, `…/{id}/waive`, `…/{id}/issue`, `…/{id}/issues/{issueId}/resolve`, `…/{id}/issues/{issueId}/call`.
- **Tests:** the pure checks, packing and the cards on PostgreSQL (SIM-F-002, SIM-F-006, SIM-F-010; swap, send the rest with the refund request, cancel, the hold released), the order machine's hold from picking, the routes; device gate 0 fails on the four packing pages; the card pressed in a real browser. Guides: [pack](docs/admin-guide/pages/orders/pack.md), [orders](docs/admin-guide/orders.md).
- **Not here (their own PRs):** the bad-stock push to the ERP (follow-up 461), the settings editor (462), packing cards on the Dashboard (468), the rest of S08.


**Built (PR 184, 525, 526): what the courier tells us after booking.** Migration `0045_delivery_check` (additive: one DeliveryCheck per parcel); settings registry v58 (`packages/settings/src/registry-courier-sync.ts`; `orders.refusal.reasons` moved to v58); permission `delivery.outcomes`; backend, admin API and small additions to the order pages.
- **The order follows its parcel (184):** after every read the courier's word moves the order through the one order service (`@extas/orders`, never around it) — picked up → in transit (the new `courierPickedUp` step, so a forgotten hand-over press does not stall it), delivered, partly delivered once the kept pieces are named, returned; an order on hold or waiting for a cancel answer is left and caught up on the next run. "Out for delivery" goes on the timeline once per trip (the customer's message starts from it, when on). Failed tries, address problems, lost and damaged change nothing on the order and show with their reason. The parcel list has `view=late` (past the band's promise; SIM-F-018).
- **The order page (184):** the courier card shows where the parcel is now, the courier's problem in words, when it was picked, delivered or returned and when we last read it; the timeline names the courier as the actor.
- **The customer's order page (184):** one plain line under the steps — out for delivery, a try failed, the rider is looking for the address, we are checking with the courier — behind `account.track.courier` (off; problems shown when on); English and Bengali, phone and desktop.
- **True-delivery check (525, SIM-F-005):** with `delivery.truthCheck` on, a "Delivered" that our own records contradict — the courier collected only the delivery charge on a COD parcel, a door record says it came back, the courier's statement pays it as a return, the parcel was received back — opens one check per parcel (late signs are swept on every tracking run, back `lookbackDays`). While it is open the order is not marked delivered ("hold the order", on). A person with `delivery.outcomes` resolves it on the order page's red band: really delivered, came back with the charge paid, came back (an order already delivered is corrected by the new `deliveryCorrected` step). What really happened is kept beside the courier's claim on the parcel's one return record. `GET /api/admin/delivery/checks`, `POST /api/admin/delivery/checks/:id/resolve`. No money moves, no COD changes, no door record is written.
- **Why it came back (526, SIM-F-038):** the courier's note on a return, a partial delivery or a failed try is kept as the rider's note; a person records the reason from the owner's list — now with "didn't like it" and "ordered by mistake" beside size, not as in the picture, bought elsewhere and the rest — with the rider's words (`POST /api/admin/delivery/parcels/:id/return-reason`). It goes on the parcel's one return record (refused at the door, or charge-paid when the courier collected money), the timeline and the phone history (PR 521). The order page shows "Why it came back" and the rider's note, with a band while no reason is recorded.
- **Reports (525, 526):** `@extas/metrics` `deliveryTruth` (courier-delivered beside what really happened) and `returnReasons` (by reason and by kind), store-wide or for one customer; counts only.
- **Settings (v58):** `account.track.courier` {off, problems shown}; `delivery.truthCheck` {off, hold the order, 30 days back (1–180)}; `orders.refusal.reasons` (13 reasons + "other", the owner edits them in both languages).
- **Tests:** the sync, the check and the return reasons on PostgreSQL (SIM-F-005 and SIM-F-038 journeys on the practice courier), the order state machine's new steps, the routes, the order-page buttons, every word in both languages. Guides: [couriers](docs/admin-guide/couriers.md), [one order](docs/admin-guide/pages/orders/order.md).
- **Not here (their own PRs):** COD collection and the courier's money (S07), receiving returns and refused parcels (189, 191; follow-ups 450, 451), the courier webhooks (follow-up 372), the Delivery screens (follow-ups 370, 452), the sticker (179), the courier choice by real cost (178), the rest of S08.


**Built (PR 185, 187, 188, 189, 190, 191): exchanges, returns and refused parcels.** Package `@extas/orders` (`exchange.ts`, `exchange-pure.ts`, `exchange-switch.ts`, `exchange-charge.ts`, `returns.ts`, `return-cases.ts`, `refused.ts`); migration `0044_exchange_returns` (additive: exchanges and their pieces, returns and their pieces, the refused-parcel list); settings registry v57 (`packages/settings/src/registry-returns.ts`, group `orders`); permissions `returns.view`, `returns.decide`, `returns.qc`, `returns.waive`, `returns.claims.decide`. Every step is an order command (`returnCase` and the exchange / return events on the order's timeline), audited, version-checked (an older screen is refused with STALE). Nothing moves money: the refund due and the credit are only noted (S07, follow-up 440).
- **Exchange engine (185):** four tiers — the same piece in another size, the same colour, the same product, the same price band — and the first tier with stock is offered, each choice with its money box (difference, credit, the second delivery charge, what the rider takes at the door). The window counts from delivery (`orders.exchange.engine`). Approving books the linked exchange order with its stock held and opens the pick-up of the old piece. A wrong item restocks the piece that went out, never the ordered one (SIM-F-022).
- **Receive & QC (187):** `/admin/orders/returns/qc`, made for a phone — each piece scanned; sellable → the ERP `return.create` document, RESTOCKED only on the ERP's answer; not sellable → a loss with its reason (`orders.returns.lossReasons`; photo when `orders.returns.qc.photoForLoss`, off) in the loss book, never ERP stock; another SKU than expected only with a note (`acceptOtherSku`, on).
- **Size switcher (188):** another size of the same product and colour at the same price, stock-checked under checkout's row lock, until the courier has it.
- **Returns (189):** the courier's returned / partly delivered step opens the return of the pieces not kept (refused at the door, with the reason). A return after receipt only when the owner's policy allows it (`policy.returns.afterDelivery` off = no returns after receipt; `orders.returns.handling`: our-fault returns off, window empty); otherwise it is shown and refused. A return closes after QC, or with a note.
- **Who pays the second delivery (190, CN-018 (5)):** the customer for his own size choice (the exchange rule's band charge, else `fallbackMinor`, empty = nothing), never for our mistake; a waiver with a logged reason (`returns.waive`); his "your mistake" claim with a note and photo, decided by `returns.claims.decide`; the one-trip size swap (CN-014e, `orders.exchange.swap`, off); a re-ship after a try-on linked to the refused order, the old piece covering only what was paid, the refusal not counted (SIM-F-021).
- **Refused parcels (191):** `/admin/orders/returns/refused` — the parcels refused at the door with their reasons, the shop's own fault marked and never counted (SIM-F-044), the delivery charge paid at the door kept (`CHARGE_PAID_RETURN`). The refused-parcel list (`orders.refused.list`, off; proposed after 2 counted refusals): a person lists a number, dismisses it, or takes it off with a note; a try-on or a re-shipped refusal is not counted. Nothing blocks an order or turns COD off; PR 264 will read the listed numbers for the ad audiences.
- **Routes:** `/api/admin/returns` — the board, one exchange, choices, open, approve, refuse, complete, sizes, switch, waive, claim, claim decision; parcels (by status, kind or order), one parcel, receive, QC, close; an order's return choices and return; the refused list and its decision.
- **Settings (v57):** `orders.exchange.engine`, `orders.exchange.tiers`, `orders.exchange.charge` (customer pays his size choice, fallback empty, claim photo on, re-ship reason size-fit, re-ship free off), `orders.exchange.swap` (off, charge empty, areas empty), `orders.returns.qc`, `orders.returns.lossReasons`, `orders.returns.handling` (our-fault returns off, window empty), `orders.refused.list` (off, 2).
- **Tests:** on PostgreSQL — the four tiers and their money boxes, SIM-F-022 (the scanned piece restocks), SIM-F-021 (the try-on re-ship), the switcher under the row lock, the return policy, the waiver and the claim, the refused list from proposal to a person's decision; the admin API; every word in both languages. Guides: [returns](docs/admin-guide/pages/orders/returns.md), [Receive & QC](docs/admin-guide/pages/orders/returns-qc.md), [refused parcels](docs/admin-guide/pages/orders/returns-refused.md), [orders](docs/admin-guide/orders.md).

**Built (PR 612, 613, 614): returns and exchanges through the ERP** (CN-028, CN-029 Phase 1). They run only when a store's `erp.model` is `v6`; until the switch-over (PR 619) every store keeps the flow above. Migration `0054_returns_v6` (additive), settings registry v67 (`packages/settings/src/registry-returns-v6.ts`, group `orders`), the ERP calls in `@extas/inventory` (`erp-returns-v6.ts`), the services in `@extas/orders` (`handback.ts`, `legacy.ts`, `returns-erp.ts`, `exchange-v6.ts`).
- **Hand-back desk (612):** `/admin/orders/returns/handback` (`returns.handback`) — scan each consignment the courier hands back (a showroom return: courier `HAND`, by order number), count the pieces, a short condition note (a photo of the sealed bag with `returns.handback.photo`), close and send `POST /return-lists`. The ERP's answer per parcel is kept (return stock, hold, refused with its reason); a count that differs starts the courier claim at once; a refused parcel is fixed and sent on a new list; while the ERP is down the list waits and the job `orders.returns.erp` sends it again. The shop never decides whether a piece sells again.
- **The old paths as switches (612):** `returns.legacy.shopQc`, `.restock`, `.writeOff`, `.creditDue` — per store, on (= today) while v5; in v6 they never run, no return opens after delivery. PR 619 turns them off; nothing is deleted.
- **Returns section (613):** `/admin/orders/returns/erp` (`returns.view`, read-only) — seven tabs (Partial deliveries · Handed back · On hold in ERP · In ERP return stock, with the countdown to the owner's check `returns.erpCheck.days` 7 · Exchanges · Approved · Declined (our loss)); each parcel's timeline; losses by month (`returns.losses.months` 6) at the price paid to the ERP, plus billed exchanges, delivery charges of returned parcels and underpayments; courier claims; the compare with `GET /returns/summary` every night after `returns.compare.runAt` (01:15) and on demand, kept as append-only rows — a difference is fixed only by pulling again.
- **Exchange through the ERP (614):** approve only within `policy.exchange.windowHours` (72) of the courier's "delivered"; the old lines marked; a live ERP stock check with regular orders first (`exchange.erp.keepForOrders` 1) — short stock waits, the admin is told, the job retries with a new idempotency key; the new order `<old>-X<n>` names the old order and line; a dearer piece is paid by the customer when `exchange.passPriceRiseToCustomer` is on; no money goes back; the original sale stands. The case card shows the ERP box (state, deadline, value at risk, what the customer pays) and the **late-return mark** (`POST /api/admin/returns/exchanges/:id/late-return`, `exchange.approve` or `returns.handback`); the Exchanges tab lists the exchanges at risk from `GET /exchanges?status=pending` (the 4-day watch).
- **A refused exchange parcel (614, CN-033, 31 Oct; #69):** the new piece waits like a delivered one (`WAITING_RETURN`): not back by the deadline, it is billed in full the night after; back later and approved, it is credited. The risk list and the Exchanges tab say "New piece not back (parcel refused)"; the practice ERP follows the same rule (its old "cancelled, no bill" behind its own switch).
- **Safe to press twice (qa-gate):** a return list goes to the ERP once even when the desk, the close and the hourly job send it at the same moment; a second "Approve" or "Old piece came back late" returns the first answer. A refused exchange frees its line and can be approved again; an exchange that found the ERP unreachable is sent again by a person ("Send to the ERP again" on the case card). The exchange order's pickup, courier result and cancel reach the ERP like any order's (PR 610, 611).
- **Routes:** `/api/admin/returns/handback/*`, `/api/admin/returns/erp` (the tabs) and `erp/{timeline,losses,claims,compare,watch}`.
- **Tests:** on PostgreSQL with the practice ERP — the hand-back desk, the legacy switches, the Returns section (full flow, reversal, hold, losses, nightly compare and pull-again, ERP down) and the exchange (window, stock wait and new key, price rise on and off, refusals, cancel, deadline, late return, billed); every one with a store-isolation test. Page guides: [returns-handback](docs/admin-guide/pages/orders/returns-handback.md), [returns-erp](docs/admin-guide/pages/orders/returns-erp.md).

**Built (PR [178](docs/stages/S08.md#pr-178), 186, 192, 193, 564; 1 Nov, #73, After launch).** Every new feature is off;
no charge, COD or price changes, and booking stays a person's press.
- **Courier by real cost (178):** `delivery.courier.selection` (off) — each courier's cost from its own rate card for the
  band and weight plus the COD fee, cheapest first, a courier with no card says why (NO_BAND, NO_RATE, NO_WEIGHT); Orders
  › Packing "Book courier" preselects the cheapest; `GET /api/admin/delivery/courier-choice`, `POST …/bookings/cheapest`.
- **Exchange from the account (186):** `/account/orders/<number>/exchange` (`orders.exchange.account`, off) through the
  staff engine's checks; a REQUESTED exchange only, a person approves; the "you sent the wrong size" claim with a photo
  (CN-018 (5)); a try-on refusal re-shipped in another size (SIM-F-021). Guide [orders/returns](docs/admin-guide/pages/orders/returns.md).
- **Courier performance, claims, rider issues (192):** Reports › Delivery & RTO (`/admin/reports/delivery`, REP-06) per
  courier, zone and district for 7, 30 or 90 days, parcels past their promise (SIM-F-018), the RTO cost book
  (`delivery.courier.rtoBook`, SIM-F-027); claims for lost or damaged parcels (`delivery.claims`, SIM-F-017), a record
  only; Support › Rider issues (`/admin/support/rider-issues`) with photo proof and a second person's approval, the
  extra's refund only as a request (migration `0071`). Guides [reports/delivery](docs/admin-guide/pages/reports/delivery.md),
  [support/rider-issues](docs/admin-guide/pages/support/rider-issues.md).
- **Holiday mode and Eid (193):** `delivery.holiday` (off) — the notice on the home and bag, the checkout and thank-you
  lines after a district's Eid cut-off (SIM-F-019), Eid pre-order through the advance path; Delivery › Settings
  (`/admin/delivery/settings`) and `/admin/rules/eid`. Guides [delivery/settings](docs/admin-guide/pages/delivery/settings.md),
  [marketing/eid](docs/admin-guide/pages/marketing/eid.md).
- **Charge mismatch log (564):** `delivery.chargeMismatch` (off; migration `0072_charge_mismatch`, append-only) — the
  courier's charge read against its rate cards, the other band recorded once; nothing changed or messaged.
- **Go-live gate (1 Nov, #73):** a parcel whose amount went stale after booking shows a red line and "Re-book with the
  courier" (PR 176 follow-up, SIM-F-004; the old consignment is still cancelled at the courier by hand); the sticker
  prints a Bengali address again in Latin letters with its English area and district (`delivery.sticker.latin`, off;
  PR 179 follow-up, SIM-F-048).
- **Follow-ups (#93):** the Hold and Cancel reasons start on an empty "Pick a reason" and a reason is required (526); the
  Partial delivery box starts from the shop's door record, read only (611); an exchange's replacing piece goes to the
  ERP with its own grade (614).
- **Follow-ups (#94):** "Change the reason" on a returned parcel whose reason is recorded (526); "A reason is needed"
  says what to do on the screen it shows on (180).
- **Follow-ups (#96):** the orders list's Documents column (179); a "Needs you now" line for printed parcels waiting
  for the handover, and each handed-over sheet checked against the courier's pick-up (180; registry v275, off); the
  print run's courier and category filters and ticks (181); a lost Pathao booking closed from the panel (177); the
  practice courier's parcels in the database (176, migration 0167) and Steadfast's and Pathao's own status calls
  (176; `delivery.courier.webhooks`, registry v269, off; POST only, the typed-in token or secret, the preview gate lets
  exactly those two paths through); "Back at the shop" on a returning parcel (184); open packing cards on the order
  page and in "Needs you now" (183); an exchange the ERP could not take is sent again (614; registry v272, off).

### S06 · Fraud & location — Done (33/33)

> **বাংলায় সংক্ষেপে:** ঠিকানা থেকে দোকান নিজে ডেলিভারি এলাকা আর চার্জ বের করে, আন্দাজে কখনো না; না বুঝলে কাস্টমারকে জিজ্ঞেস করে। অ্যাডমিনে "ডেলিভারি" পেজে তিনটা ব্যান্ড, আপনার সাব-এরিয়ার তালিকা, আর একটা ঠিকানা দিয়ে পরীক্ষা। চার্জ আপনি নিজে বসাবেন; শুরুতে সব বন্ধ।
> নতুন: চেকআউটে "রাইডারের জন্য আমার লোকেশন দিন" বাটন; IP, ডিভাইস কোড আর লোকেশন 180 দিন পরে নিজে থেকে মুছে যায়।
> নতুন: কাস্টমার নম্বর বদলালেও একটাই পরিচয়ে চেনা যায়; ডুপ্লিকেট আর আবার অর্ডারের আলাদা নিয়ম (A–E, H, I), প্রতিটার নিজের সুইচ; যাচাই কার্ডে এক ক্লিকে "কেন এই সতর্কতা"; সব নিয়মের সুইচ এক তালিকায়। নিয়ম শুধু প্রস্তাব করে, সিদ্ধান্ত আপনার; শুরুতে বন্ধ।
> নতুন: ঝুঁকির প্রতিটা ভাগে কী হবে (নজরে রাখা, হোল্ড, কল, আগে কত টাকা চাওয়ার প্রস্তাব) — শুরুতে বন্ধ; অর্ডার থেকে এক ক্লিকে "অগ্রিম চান": পে লিংক, SMS/WhatsApp আর কল একসাথে, টাকা এলে অর্ডার নিজে ফেরে। ডেলিভারি পাতা নতুন অ্যাডমিনে: প্রতিটা ব্যান্ডে ক্যাশ অন ডেলিভারির সীমা, সাব-এরিয়ার নিজের সুইচ, আর এলাকার নাম বদল, বানান, নতুন এলাকা, এক করা ও সরানো — কিছুই মোছে না।
> প্রতিটা অর্ডারের একটা ঝুঁকির স্কোর (০–১০০) — নম্বরের আগের অর্ডার আর ঠিকানা দেখে, আপনার ঠিক করা সংকেত আর নম্বরে। অর্ডারের পাতায় "ঝুঁকি" কার্ড বলে কেন এই স্কোর। শুধু জানায়, কিছু আটকায় না; আমাদের দোষে ফেরত গোনা হয় না। শুরুতে বন্ধ।
> নতুন (#73): ব্লক তালিকা (কারণসহ, ফেরানো যায়), বারবার পার্সেল না নেওয়া নম্বরের শর্ত, ব্লকের প্রস্তাব, ভালো কাস্টমার কখনো নিজে থেকে আটকায় না, আজকের সারাংশ, সিদ্ধান্ত থেকে শেখা, নতুন কাস্টমারকে একটা কল, ফ্রড ও RTO রিপোর্ট — সব শুরুতে বন্ধ, কাউকে নিজে থেকে ব্লক বা বাতিল করা হয় না। জেলা অনুযায়ী ডেলিভারির সময় (শুরুতে বন্ধ)।
> নতুন (#78, S06 শেষ): কাস্টমারের একই পণ্য আগের অর্ডারে রাস্তায় থাকলে চেকআউটে মনে করিয়ে দেওয়া ("দরকার নেই — সরিয়ে দিন" বা "আরেকটা চাই"), অন্য সাইজ হলে পৌঁছানোর পর বদলের প্রস্তাব, ফোন নম্বর লেখার সময়েই পেছনে কুরিয়ারের ফ্রড তথ্য দেখা (Steadfast, Pathao আর আরেকটা সার্ভিস; সবচেয়ে খারাপটা ধরা হয়) আর "ভুল নয়, অভ্যাস" সংকেত, আর কাদের কাছে অগ্রিম চাওয়া হলো তাদের কতজন দিল আর কতজন চলে গেল তার রিপোর্ট। সব শুরুতে বন্ধ; কিছুই নিজে বাতিল বা ব্লক হয় না।

**Delivery-zone engine (PR 549–553, 555, `@extas/delivery`).**
- **Gazetteer (549):** division → district → upazila/thana → area with Bengali, English and Banglish names; importer and a shared index. A public **sample** list ships; the national list comes later.
- **Bands (550):** Dhaka City = the DNCC + DSCC map; the owner's sub-area list; one flat outside band. Bands ship **off with no charge** (owner data).
- **Resolver (551) and guard (553):** the whole line decides, after a pause or leaving the field; still ambiguous → "Where is this address?". A charge only ever comes from a resolved place; the collision suite fails the build.
- **Autocomplete (552):** `GET /api/delivery/suggest`, each row with its district and charge.
- **Phone-first (555):** `POST /api/delivery/phone-area` fills the area only, limited per IP; the full address needs a login or an SMS code.
- **Admin:** ~~`/admin/delivery`~~ `/admin/delivery/zones` (Delivery › Zones in the new admin shell; the old address redirects) — three bands (charge, hours, on/off), the sub-area list (add, remove, put back), Try an address. Permissions `delivery.read`, `delivery.charges`, `delivery.areas`. Guide: [docs/admin-guide/delivery.md](docs/admin-guide/delivery.md).
- **Zone, charge and area admin (502):** the page on the new admin shell (demo V12.3: the band cards in a row, then Areas and Try an address).
  - **Bands:** each card shows and edits the **COD limit** (`codLimitMinor`, empty = no limit, owner data). The sub-area band has **its own switch** (its `enabled`, off by default): while off, the list stays but its places go by the map and checkout never offers it; "same as Dhaka City / outside" needs no charge of its own.
  - **Areas:** open any place — rename (the old name kept as a spelling by default), alternate spellings (40 at most), move to another band or back to the map, merge a duplicate of the same level (archived, never deleted: its names become spellings, children and saved customer addresses move, past orders stay as they were), and **add a place** under a parent. Refusals `DUPLICATE_PLACE`, `LEVEL_MISMATCH`, `BAND_CONFLICT` (409). A later import keeps the owner's names and spellings and never brings a merged place back.
  - **API:** `POST /api/admin/delivery/places`, `GET/PATCH /api/admin/delivery/places/:id`, `POST /api/admin/delivery/places/:id/merge` (`delivery.areas`); every change in the audit log. No setting, no migration.
  - **Tests:** places on PostgreSQL (rename, spellings, add, merge with children and addresses, refusals, import after edits), the switch in the band map, the API, the form model; device gate 0 fails. Page guide: [docs/admin-guide/pages/delivery/zones.md](docs/admin-guide/pages/delivery/zones.md).
- **Settings:** registry v15, group `delivery` (suggestions, phone-first limits, resolver waits) — every number editable.
- **Tests:** gazetteer, bands, resolver, suggest, phone helper, collision suite; device gate 0 fails.
**Risk score (PR 157, 158, 156, 160, `@extas/orders`).** Off until the owner switches it on; it only informs — nothing is blocked, held, asked in advance or changed by it.
- **Phone history (157):** a number's other orders in any stored form (the one BD phone helper), each with what became of it — delivered, refused and why, cancelled and the code, open, with the courier, unanswered calls, returns after delivery. Refusals the shop caused (late, wrong item, damaged, after Eid, did not order) are shown and never counted (SIM-F-044). `GET /api/admin/orders/:id/phone-history` (`orders.read`).
- **Address and zone checks (158):** read from the place the checkout stored, never the text again — no place, place not sure, no house details, another district than the number is known by (saved address, else latest delivered order), one of the owner's places, refusals at the same place.
- **The model (156):** 14 signals, each with its own switch, weight (0–100) and limits, and three bands (low 0, medium 35, high 65); one pure scoring function; scored **once** when the order lands and stored append-only with every reason (RiskAssessment, `riskScore` / `riskBand`, a timeline and audit row through the order service's `riskAssess` command, the status untouched); scored again only after the team's edit or "score again", as a new dated line.
- **The panel (160):** a read-only **Risk** card on `/admin/orders/<id>` (demo V12.3) — the band and score, each signal with its +weight and what it saw, the history line, earlier scores, "the rules changed since", and **Score again** (`orders.risk.decide`). `GET /api/admin/orders/:id/risk` (`orders.risk.read`), `POST /api/admin/orders/:id/risk/assess`. Guide: [docs/admin-guide/orders.md](docs/admin-guide/orders.md).
- **Settings:** registry v43, group `orders` — `risk.history` (200 orders, the our-fault list, unanswered call outcomes), `risk.score` (off; after an edit on; card on), `risk.signals`, `risk.bands`; `orders.refusal.reasons` gains three reasons.
- **Tests:** the pure history, checks and model per signal; PostgreSQL history, address facts, scoring once, after an edit, SIM-F-044, the panel; the routes; the checkout end to end; the card's words in both languages.
**IP, device and GPS, with the 180-day rule (PR 159).** Registry v46 (`risk.capture`), no migration (the Order's `ip`, `deviceId`, `gpsLat`, `gpsLng`, `piiExpiresAt` are used).
- **What the checkout keeps:** the connection (IP), the shop's own random device id (an HttpOnly first-party cookie, never a fingerprint) and, only when the customer taps **"Share my location for the rider"** under the address (on by default, never on a gift, 44 px), the point rounded to 3 decimals — each by its own switch, with the day it is cleared.
- **Signals:** `deviceMatch` (the same device under another number, +20, 90 days) and `ipPhones` (3 other numbers from one connection in 24 h, +15), both off; they put an order in "new identity".
- **The 180-day rule:** the worker job `orders.pii.purge` (queue `privacy`, every 60 minutes) clears those four fields once the owner's days have passed; the order and its money stay.
- **Tests:** the capture on PostgreSQL (rounded, switched off, refused point), the API's device cookie, the signals on PostgreSQL, the purge (once, a shorter rule, through the catalogue and planner); the worker started once with the new queue.
**Order Identity Graph (PR 519).** Registry v48 (`risk.identity`, off), no migration (IdentityCluster / IdentityLink).
- **One identity per customer:** the phone (any stored form), the shop's own device id, and a name and an address alike (pg_trgm, PR 603: spelling a little off still matches), transitively; two identities that meet merge into the older (the newer is marked, never deleted); the IP is linked and counted, never joins two people.
- **When:** each order is linked when it lands (before the duplicate check) and again after the team edits its phone, name or address; the matched history is linked in the same step, so the graph fills the day it is switched on.
- **Read by:** the risk score's `identityMatch` and `deviceMatch` (SIM-F-015) and the duplicate rules ("the same customer"). Device and IP links are cleared with the order's kept facts (`orders.pii.purge`). Timeline line "the same person as 1001 (same phone)"; `GET /api/admin/orders/:id/identity` (`orders.risk.read`).
- **Settings:** window 365 days, name 0.7, address 0.6, the device joins, 200 orders per step.

**Duplicate & re-order rules (PR 520).** Registry v48 (`risk.duplicateRules`, master off), no migration.
- **Scenarios as separate rules:** A the same items again before the courier (cancel), B different items (warn), C a parcel of his with the courier (hold), D an alike address under a new phone (off), E the same style in another size (off), H a blocked number, account, identity or address (off; the block list is only read), I bulk-looking from 10 pieces (off). Each has its own switch, window in minutes, confidence and proposal: cancel · hold · warn · allow — **no block action**.
- **What happens:** cancel or hold opens the same review as PR 145 (confirm and booking wait for a person, who decides); warn and allow are a timeline note. Off: the PR 145 look-back exactly as before.

**Alert summary card (PR 521).** In each review card on `/admin/orders/<id>`, one click on "Why this alert, and the options": the rules that fired with how sure, the earlier orders that matched (how alike, which rule, how it is the same person), what the riders wrote on his parcels, his number's and identity's history, and the decisions open to this person with the proposed one first. `GET /api/admin/orders/reviews/:alertId` (`orders.risk.read`).

**Rule master switches (PR 544).** One list of every fraud and duplicate rule — the duplicate check, the rules master and A–I, two sizes, the identity, the score and each signal, the sections — with on, active (on and everything above on) and the default; defaults unchanged. `GET/PUT /api/admin/risk/rules` (`risk.rules.read` / `risk.rules.write`; versioned, all-or-nothing, the settings change log and an audit row). The Risk rules screen (ORD-06) comes with the new admin shell.
- **Tests:** the identity graph and the rules engine (pure and on PostgreSQL, each scenario, off = as before), the alert summary, the switches, the routes, the card's words in both languages; device gate 0 fails on the order page signed in. Guide: [docs/admin-guide/orders.md](docs/admin-guide/orders.md).
**Actions per risk level (PR 161).** Registry v54 (`risk.levels`, master **off**), no migration. Each band (low, medium, high) has its own steps — watch (a RISK_WATCH flag and chip), hold (reason `risk-check`, through the order service's own hold, so a held order is never confirmed or booked: SIM-F-014), a confirmation call task, and the ask to propose (none, delivery charge, a part with the owner's percent, the whole amount, no COD for this order) — all off; the suggested set is one tap, never the default. They run once per band after a stored score, with one timeline row; the ask is only a proposal a person sends (PR 542). Orders › Risk rules `/admin/orders/risk-rules` on the new shell with the Levels card; `GET/PUT /api/admin/risk/levels` (`risk.rules.read` / `risk.rules.write`, versioned). Never blocks anyone or changes COD, a price or a charge. Page guide: [docs/admin-guide/pages/orders/risk-rules.md](docs/admin-guide/pages/orders/risk-rules.md).

**One-click advance request (PR 542).** Registry v54 (`orders.advanceRequest`: auto **off**, SMS and call ticked first, bKash for the link), migration `0037` (Payment.linkToken; a part asked uses the PART_ADVANCE purpose from 0036), permission `orders.advance.request` (CN-018, SIM-F-016).
- **On the order:** "Request advance" asks the delivery charge, a part, the whole amount or no COD for this order; one command makes the order wait (AWAITING_ADVANCE), a pay link `/pay/<token>` (an earlier unpaid link replaced), the SMS / WhatsApp through the message engine (template `order.advanceRequest`, quiet hours) and a call task. "Send again" resends the same link. Paying brings the order back to "new · to confirm".
- **The customer's page:** `/pay/<token>` and `/bn/pay/<token>` — no login, noindex, the order number and amount only; `POST /api/pay/link`; the practice gateway until the owner's keys pass.
- **Advance request card** on Risk rules (`GET/PUT /api/admin/risk/advance`): the auto option, the ways ticked first, the payment service. No money moves by itself; no COD rule or price changes. Page guide: [docs/admin-guide/pages/orders/advance-request.md](docs/admin-guide/pages/orders/advance-request.md).
- **Tests:** the plan (pure), the request and the link on PostgreSQL, the payments hook, the routes, the card and dialog words in both languages; device gate 0 fails on the order page, Risk rules and `/pay`.

**Courier zone sync (PR 554, `@extas/shipping`).** Migration `0043_courier_zones_print` (additive), registry v56 (`delivery.courier.zoneSync`: on, every 7 days, 600 calls a run, areas, exact names, hold only when the courier needs ids).
- **Each courier's own list:** city → zone → area read in steps from where the last run stopped (Pathao; the practice courier; Steadfast reads the address and needs none), paired with the gazetteer by exact names inside the right district only; unclear names left for a person. A place the courier drops is archived with its pair, never deleted, and comes back when listed again. Staff pair or unpair by hand; a sync never touches a person's pair.
- **Booking:** a courier that needs its ids never gets a parcel to an unpaired area — `AREA_UNMAPPED`, one note on the order's timeline (SIM-F-017). Worker job `courier.zones`.
- **Admin:** Delivery → Couriers (`/admin/delivery/couriers`: accounts, practice or live, the area list summary, "Read the list now") and one courier's page (parcels waiting, not paired with candidates, paired, dropped). Guides: [couriers](docs/admin-guide/pages/delivery/couriers.md), [one courier](docs/admin-guide/pages/delivery/courier.md).
**Built (PR [162](docs/stages/S06.md#pr-162), 163, 164, 522, 523, 524, 540, 543, 545; 1 Nov, #73, After launch): the rest
of the fraud engine.** Every switch is off; the engine marks, proposes or holds for a person, never blocks, cancels or
changes COD, a price or a charge by itself (CN-018). Migrations `0080`–`0082` (no DELETE or TRUNCATE for the app role).
- **Blocklist (162):** `risk.blocklist` (off, "mark" or "hold") — Orders › Risk rules card and "Add number to blocklist"
  on an order (`risk.block`, `risk.unblock`); a listed number or identity is marked once or held; Undo keeps who and why.
- **Repeat refusers (163):** `risk.refusers` (off) — the owner's terms per number (nothing, the delivery charge first,
  the full amount first, no COD) become the order's "Request advance" proposal (PR 542), which a person sends.
- **Fraud & RTO report (164):** Reports › Fraud & RTO (`/admin/reports/fraud`, `risk.report`) — caught, wrong, missed,
  stopped, the cost probably saved (an estimate) and the RTO cost book in taka. Guide [reports/fraud](docs/admin-guide/pages/reports/fraud.md).
- **One parcel per person (522), block proposals (523), good customers (524):** `risk.bundling`, `risk.blockProposal`,
  `risk.goodCustomer`, `risk.stopReport` (all off); Reports › Stopped by the engine (`/admin/reports/stopped`).
- **Approval digest and gate (540):** Orders › Today's digest (`/admin/orders/digest`); with `risk.approval` on every
  engine hold becomes a proposed hold a person decides.
- **Learning loop (543):** `risk.learning` (off) — every decision kept with its note (`FraudDecision`, append-only);
  Reports › Decisions & learning (`/admin/reports/learning`) suggests only.
- **New-customer call (545):** `risk.newCustomer` (off) — one NEW_CUSTOMER call task and a mark, never a hold or a
  score; Orders › To confirm › Calls to make (`/admin/orders/confirm/calls`) with "Record call" and the owner's outcomes.
- **Go-live gate (1 Nov, #73):** a district's own delivery hours at checkout, on the thank-you and order pages and for the
  late flag (`delivery.promise.districts`, off; PR 550 follow-up, SIM-F-048).
- Guides: [orders/risk-rules](docs/admin-guide/pages/orders/risk-rules.md), [orders/digest](docs/admin-guide/pages/orders/digest.md),
  [orders/calls](docs/admin-guide/pages/orders/calls.md), [reports/stopped](docs/admin-guide/pages/reports/stopped.md),
  [reports/learning](docs/admin-guide/pages/reports/learning.md); smoke checks for each page.
- ~~Still planned in S06: 556–557, 559, 562, 567.~~ Built in #78 (below); S06 is done.

**Built (PR [556](docs/stages/S06.md#pr-556), 557, 559, 562, 567; 1 Nov, #78, After launch): the duplicate notice, the
phone-entry check, the flag report and the courier fraud data.** Every switch is off; nothing is cancelled, blocked or
charged by itself, and no price or COD changes.
- **Parcel already on its way (556):** `checkout.transitDuplicate` (v109, off) — once a whole number is typed, this
  customer's order on its way (the number in any form plus the account, the bag and the device, never the number alone;
  SIM-F-015) holding the same piece shows its picture, order number and tracking link: "No need - take it out" (the bag's
  Remove with Undo) or "No, I want another one". Each firing and answer kept once (`DuplicateNoticeEvent`) with the
  visit's campaign; Orders › Risk rules card (`risk.rules.write`) and the report by campaign (`risk.report`).
- **Another size on its way (557):** `sizeExchange` on the same card (off) — "Not sure about the size?", both sizes,
  "Exchange on arrival — take this out"; an `order.exchangeIntent` line on the earlier order's timeline.
- **Phone-entry check and the pattern signal (559):** `checkout.phoneRisk` (off) — one background ping per number
  (`/api/checkout/phone-risk`, always `{ok: true}`, the form never waits), the courier sources asked within a time budget
  and kept for `cacheHours` (`CourierFraudCheck`), rate limited per IP; `risk.signals.pattern` (off) — the
  recency-weighted share of failed parcels over his orders, device and identity graph and each courier's answer; two
  Risk rules cards; the order page explains the pattern.
- **Courier fraud data (567):** Steadfast, Pathao and an aggregator behind one `FraudCheckApi` adapter, their own rows
  and keys in Keys & connections (never the courier connection's); only a connection switched on and past its Test is
  asked; each source kept apart, the highest failed share counts.
- **Flag outcomes (562, SIM-F-016):** `risk.flagReport` (off) — Reports › Flag outcomes (`/admin/reports/flags`,
  `risk.report`): at checkout per layer and after ordering per way asked, who paid, still waits, left, cancelled unpaid
  or ordered without the ask, the advance collected, a layer losing customers pointed out; reads only.
- Guides: [orders/risk-rules](docs/admin-guide/pages/orders/risk-rules.md), [reports/flags](docs/admin-guide/pages/reports/flags.md),
  [settings/keys](docs/admin-guide/pages/settings/keys.md); tests on PostgreSQL (SIM-F-015 and SIM-F-016 acceptance), the
  adapters against stand-in servers, the checkout API.
- **Follow-up (#94, PR 502):** the owner's names and merges of a place are columns on GeoArea (migration
  `0165_geo_owner_columns`, additive, filled from his audit rows), set with each change and read by the import.
- **Follow-ups (#96):** the location a customer shared for the rider — a map link on the order page and the point on
  the sticker (159; registry v268, off); a place merge keeps a record and can be undone (502, migration 0166), and a
  merged place lends its courier zone pair until then (502).

### S14 · CRM & customers — Done (24/24)

> **বাংলায় সংক্ষেপে:** কাস্টমারের সেকশন তৈরি: সব কাস্টমারের তালিকা (ফোন দিয়ে প্রতিটা মানুষের এক সারি, ভাগ, খোঁজা), একজন
> কাস্টমারের নিজের পাতা (সব অর্ডার, বিক্রি শুধু ডেলিভারি হওয়া, বদল, সাপোর্ট) আর "যাচাই বাকি" — একই মানুষের দুইটা প্রোফাইল একজন
> মানুষ দেখে একসাথে করেন, কিছু মোছে না, আবার আলাদা করা যায়। পুরো নম্বর শুধু অনুমতিতে; কে পাতা খুলেছেন বা নম্বর কপি করেছেন, লগে থাকে।
> এছাড়া কাস্টমারকে SMS আর WhatsApp পাঠানোর ব্যবস্থা তৈরি। চাবি (key) না দেওয়া পর্যন্ত সব অনুশীলন মোডে, কোনো আসল নম্বরে
> কিছু যায় না। কেউ "বন্ধ" লিখলে তাকে আর মেসেজ যায় না, "চালু" লিখলে আবার যায়; সব হিসাব থাকে। মেসেজের লেখা এখন অ্যাডমিন থেকেই
> বদলানো যায়, বাংলা-ইংরেজি পাশাপাশি, নমুনা অর্ডারে সাথে সাথে দেখা যায়। কোন ঘটনায় কোন মেসেজ যায়, সেটাও এক পাতায়। নতুন সব সুবিধা বন্ধ অবস্থায় আসে।

**Built (PR 284, 285, 286): the customers section on the new admin shell.** New package `@extas/customers`; migration
`0047_customer_merge` (additive: `Customer.mergedIntoId` / `mergedAt`, `CustomerMerge`); settings registry v60
(`packages/settings/src/registry-customers.ts`); `@extas/metrics` `customerKpis`, `customerFiguresSql`, `customerOrdersSql`.
- **The person by phone (284):** a profile, its merged profiles and every number they ordered with are one person; any
  written form of a number finds him. Lifetime value from `@extas/metrics`: **Sales** = delivered orders only, beside
  **Ordered value** (CN-022); refusals never count the shop's own mistakes.
- **Merges (284):** the merge rules suggest "Same person?" pairs (same e-mail, a WhatsApp number that is the other's
  phone, the same name and address, the same identity on an order); a person decides — Merge (with an Idempotency-Key),
  Not the same person, or Split later with a note. A merge only points one profile at the other: nothing moves, nothing
  is deleted, every decision is audited.
- **Personal data:** every read checks `customers.read`; the full number needs `customers.phone` (otherwise masked,
  `customers.phoneMask`); opening a customer and every Copy or Call is written to "Who looked at this customer" first
  (shown with `audit.read`); `customers.merge` for decisions. No export anywhere here (PR 299 brings its own key).
- **Screens:** Customers → **All customers** (`/admin/customers`: four numbers, eight views with counts, search, source
  filter, sorts, a table on a desktop and cards on a phone), **one customer** (`/admin/customers/<id>`: Overview ·
  Orders · Exchanges · Support, consent, wallets, "Who looked", "Merge with…"), **To review** (`/admin/customers/review`).
  The command palette's customer results open the customer's page. Guides:
  [all customers](docs/admin-guide/pages/customers/all.md), [one customer](docs/admin-guide/pages/customers/customer.md),
  [to review](docs/admin-guide/pages/customers/review.md).
- **Settings (v60):** `customers.merge` {suggest on, four rules on, 20 a page, note off}; `customers.phoneMask`
  {first 3, last 3}; `customers.list` {50 a page, returning from 2 orders, at risk after 60 days, VIP figure empty};
  `customers.profile` {20 orders a page, 10 exchanges and support lines, 10 lines of "Who looked"}.
- **API:** `/api/admin/customers` — the list, `by-phone`, `<id>` (the single view), `<id>/orders`, `<id>/exchanges`,
  `<id>/support`, `<id>/looks`, `<id>/access`, `merge-suggestions`, `merge-preview`, `merges`, `merge`, `not-same`,
  `merges/<id>/undo`.
- **Tests:** merges, the single view, the list's views and the customer page on PostgreSQL; the API with the owner and
  a read-only reader (masked numbers, refusals); the settings; every word in both languages. Smoke and device gate open
  the list, To review and the first customer page.

**Built (PR 291, 292, 298, 505; migration `0048_message_channels`, additive; registry v61 `registry-message-channels.ts`).** Every channel stays on its mock until the owner types its key in Keys & connections; no test or CI run sends to a real number.
- **SMS (291):** the SMS contract and the BulkSMSBD gateway in `@extas/adapters` (one form POST per SMS, unicode for Bengali, its answer codes as words, the credit left for "Test"), its Keys & connections row (API key, sender id); the masking name only when it is approved and wanted; the parts of every SMS (GSM 160/153, unicode 70/67) and its cost (the provider's price, else the owner's part price) in the log.
- **WhatsApp (292, SIM-F-011):** Meta's Cloud API `whatsappCloud`; a live send the shop starts goes only as a Meta-approved template (else skipped with `WA_TEMPLATE_NOT_APPROVED` and the step's fallback channel); template list, sync and submit for approval; the signed webhook `GET|POST /api/whatsapp/webhook` (X-Hub-Signature-256) records receipts and the customer's 1 / 2 / 3 self-confirm answer by itself; the Caddy preview gate lets only that address through.
- **Consent (298):** the engine checks consent before every send (a stopped number is skipped as `OPTED_OUT`, an offer step needs a yes); every answer is an append-only ConsentRecord (every message / offers only); stop and start words by WhatsApp; the team records an answer at the customer's request (audited).
- **Templates (505, SIM-F-001, SIM-F-025, SIM-F-031):** every SMS, WhatsApp and e-mail template, English and Bengali side by side with a live preview on a cash, prepaid and part-paid sample order; where each is used; only known {tokens}; warnings for English words in Bengali, an amount to pay on a paid order and a link promise; Save over the version, Reset to default, a missing language added; an edited approved WhatsApp template goes back for approval; the auto-reply.
- **Admin pages (Messages section, demo V12.4):** Order journey `/admin/messages/journey`, Templates `/admin/messages/templates`, Message log `/admin/messages/log` (counts, filters, parts, cost, Try again), Channels & limits `/admin/messages/channels` (each channel's provider and mode, the credit, the last 7 days, caps, quiet hours, masking, part prices, the WhatsApp templates card) and Consent `/admin/messages/consent`. Bengali guides in `docs/admin-guide/pages/messages/`.
- **Admin API:** `/api/admin/messages/` — `channels`, `whatsapp/templates` (+ `sync`, `:id/submit`), `consent`, `consent/record`, `templates`, `templates/:id`, `templates/:id/reset`, `templates/auto-reply`. Permissions `messages.channels.read/write`, `messages.consent.view/write`, `messages.templates.read/write`.
- **Settings (v61):** `messages.sms.masking` and `messages.sms.rates` (owner data, empty); `messages.whatsapp` (language codes en / bn, category UTILITY, webhook 256 KB, reply window 168 hours); `messages.consent` (stop words STOP, UNSUBSCRIBE, বন্ধ; start words START, চালু; confirm reply off); `messages.autoReply` (off; once in 24 hours per number; always, or outside 10 to 22).
- **Tests:** PostgreSQL (the SIM-F-011 live path, webhook signatures, receipts and replies, consent on every channel, SIM-F-001 / 025 / 031, template save, version, re-approval, reset and the auto-reply), the pure rules, the SMS gateway against a stand-in fetch, the web API, the page drafts and words; smoke and device gate.
- ~~Still planned in S14 (after launch): segments, the journey view and builder, e-mail, AI helpers, reviews, rewards, tags, export, win-back, birthdays and retention (287–290, 293–297, 299–303, 533–535).~~ ~~287–290 and 293 built in #78 (below); still planned: the other AI helpers, reviews, rewards, tags, export, win-back, birthdays and retention (294–297, 299–303, 533–535).~~ ~~294–297 and 299–302 built in #80 (below); still planned: 303 and 533–535.~~ 303, 533 and 534 built in #81 (below); still planned: 535.

**Built (PR [287](docs/stages/S14.md#pr-287), 288, 289, 290, 293; 1 Nov, #78, After launch): segments, the journey,
automations and e-mail.** Every switch is off; settings registry v190–v194 (`registry-crm.ts`).
> নতুন (#78): কাস্টমারদের আসল কেনাকাটা দেখে দল বানানো (সংখ্যা সাথে সাথে), একজন কাস্টমারের পুরো যাত্রা এক তালিকায়, নিজে থেকে চলা মেসেজ (পণ্য পুরোনো হলে মনে করানো, অনেকদিন না কিনলে ফিরিয়ে আনা, নতুনকে স্বাগত), অফারের ই-মেইল (কে খুলল, কে ক্লিক করল, কে অর্ডার দিল) আর AI দিয়ে ই-মেইলের লেখা। সব শুরুতে বন্ধ; কাস্টমারের "হ্যাঁ" ছাড়া কোনো অফার যায় না।
- **Segments (287):** Customers › Segments (`/admin/customers/segments`, `customers.segments`) — conditions joined with
  "and", the live count with the first people, the list's views as built-in segments, `?segment=` on the Customers list;
  `customers.segments.write`; archive and restore, nothing deleted.
- **Journey view (288):** the customer page's Journey tab (`customers.journey`; migration `0140` read indexes) — every
  touch newest first, no phone number in any row; Customers › More › Customer settings (`/admin/customers/settings`,
  `customers.settings`) holds the CRM cards.
- **Automations (289):** Messages › Automations (`/admin/messages/automations`, `customers.journeys`, migration `0141`,
  `messages.automations.write`) — product-life reminder (SIM-F-032), win-back and welcome; waits, a segment check, a
  template message; every message an offer (his yes, quiet hours, the weekly cap, the stop line).
- **E-mail (290):** Messages › E-mail (`/admin/messages/email`, `customers.email`, migration `0142`,
  `messages.email.write`, `messages.email.send`) — templates, sends to a saved segment at a throttle, per-send results,
  one-click unsubscribe and `/email/unsubscribe/[id]`; opens and clicks counted only while their switches are on.
- **AI campaign writer (293):** `customers.aiWriter` (off, also needs `ai.enabled`) — "Write with AI" on the e-mail
  forms, 2 or 3 versions in the owner's voice; the practice writer until an AI key; nothing saved or sent by itself.
- Guides: [customers/segments](docs/admin-guide/pages/customers/segments.md), [customers/segment](docs/admin-guide/pages/customers/segment.md),
  [customers/settings](docs/admin-guide/pages/customers/settings.md), [messages/automations](docs/admin-guide/pages/messages/automations.md),
  [messages/email](docs/admin-guide/pages/messages/email.md); DB tests in customers, messages and the web API.

**Built (PR [294](docs/stages/S14.md#pr-294)–297, 299–302; 5 Nov, #80, After launch): who and when, reviews, points,
tags and notes, export, win-back, birthdays and retention.** Every switch is off; settings registry v195–v200
(`registry-crm.ts`, `registry-reviews.ts`); migrations `0143_reward_points`, `0144_customer_tags_notes`,
`0145_winback_campaigns`; permissions `customers.notes`, `customers.export`, `messages.campaigns.write`,
`messages.campaigns.send`.
> নতুন (#80): কাকে আর কখন অফার পাঠালে ভালো তার পরামর্শ, ডেলিভারির পর রিভিউ চাওয়া আর রিভিউ সামলানোর পাতা, পয়েন্ট থেকে ওয়ালেট ক্রেডিট, কাস্টমারের পাতায় নোট আর #ট্যাগ, কারণ লিখে কাস্টমার তালিকা ডাউনলোড, অনেক দিন অর্ডার না করা কাস্টমারকে ফেরানোর ক্যাম্পেইন, জন্মদিন রাখা — সব সুইচ বন্ধ অবস্থায়। কাস্টমার কখনো নিজে থেকে মোছা হয় না।
- **Who and when (294):** `customers.sendAdvice` — on a draft e-mail send, the saved segments ranked by recent buyers who
  can get offers and the busiest order hour and weekday outside quiet hours, with the reasoning; "Use this segment",
  "Send at that time".
- **Reviews (295):** `reviews.requests` — the Day-3 request skipped while reviews are off or all reviewed, one
  `ReviewRequest` per request; Products › Reviews (`/admin/products/reviews`): to check, published, hidden, refused,
  with photo; the average and the requests answered by channel.
- **Points (296):** `customers.points` (every number 0) — points for delivered orders after the exchange window, turned
  into wallet credit by the customer at the owner's rate (My account › Rewards, audited); job `customers.points.run`;
  Customers › Loyalty & wallet (`/admin/customers/loyalty`).
- **Tags and notes (297):** one "Note or #tag" box on the customer page; pin, put away; erasure clears notes.
- **Export (299):** `customers.export` (5,000 rows) — "Export" on the list with a reason; never erased or archived
  people, no address, IP or location; audited.
- **Win-back (300):** `customers.winback` — Messages › Campaigns (`/admin/messages/campaigns`): the rule, the shop's SMS or
  WhatsApp template, reach and estimated cost first, scheduled by a person; consent, quiet hours, the weekly cap.
- **Birthday (301):** `customers.birthday` — day and month on My account › Profile (the year only when asked); nothing
  sent or given (C6.6 parked).
- **Retention (302):** customers are never deleted by themselves; `orders.pii.purge` also clears old IPs of sign-ins,
  codes, bulk enquiries and consent answers; a "What the shop keeps" card on Settings › Privacy & data.
- Guides: [products/reviews](docs/admin-guide/pages/products/reviews.md), [customers/loyalty](docs/admin-guide/pages/customers/loyalty.md),
  [messages/campaigns](docs/admin-guide/pages/messages/campaigns.md), [messages/campaign](docs/admin-guide/pages/messages/campaign.md),
  [customers/settings](docs/admin-guide/pages/customers/settings.md); DB tests in customers, messages, jobs and the web API.

**Built (PR [303](docs/stages/S14.md#pr-303), 533, 534; 6 Nov, #81, After launch): the CRM report, the customer
history at approval and customer grading.** Every switch is off; settings registry v201–v203 (`registry-crm.ts`); no
migration; job `customers.grades.run`.
> নতুন (#81): রিপোর্টে নতুন, আবার কেনা আর চুপ হয়ে যাওয়া ক্রেতার হিসাব; কনফার্মের সময় একই নম্বরের আগের অর্ডারের ইতিহাস; আর আপনার নিজের নিয়মে কাস্টমারের গ্রেড — সব বন্ধ অবস্থায় আসে।
- **CRM report (303):** `customers.report` (quiet after 60 days, 10 segments) — Reports › Customers
  (`/admin/reports/customers`): new, returning and quiet buyers and the repeat rate over 7, 30 or 90 days, overall and per
  saved segment; counts only, `reports.read`.
- **History at approval (533):** `customers.approvalHistory` (5 orders, 5 reasons) — a "Customer history" card under the
  call card on Orders › To confirm: true deliveries, being checked (not counted), refusals, charge-paid returns with their
  reasons, our fault (shown, never counted), cancels, exchanges, calls not answered; it never confirms, holds or blocks.
- **Customer grading (534):** `customers.grades` (no mark, 6 grades at most) — the owner's own grades from true
  deliveries and refusals not by the shop's fault, and a verified mark; "Your grades" on Customer settings (add, change,
  archive, "Grade everyone now"); a grade pill on the list, the customer page and the To confirm card; his "good customer
  from" grade feeds the good-customer override only while it is on; never blocks or changes COD.
- Guides: [reports/customers](docs/admin-guide/pages/reports/customers.md), [orders/confirm](docs/admin-guide/pages/orders/confirm.md),
  [customers/settings](docs/admin-guide/pages/customers/settings.md); DB tests in customers, orders and the web API.

**Built (PR [535](docs/stages/S14.md#pr-535); 6 Nov, #82, After launch): the legacy customer import.** S14 is done
(24/24, [report](docs/reports/2026-11-06-S14.md)). `customers.legacyImport` (v204, `registry-crm.ts`) ships off (5,000 rows
at most); migration `0146_legacy_customer_import`; new permission `customers.import`.
> নতুন (#82): পুরোনো দোকানের অর্ডারের তালিকা (CSV) আগে দেখে নিয়ে, আপনি নিশ্চিত করলে শুধু ইতিহাস হিসেবে আনা হয়; কোনো কাস্টমার বা অর্ডার বদলায় না, কাউকে মেসেজ যায় না, ফিরিয়ে নিলে আর্কাইভ হয়, মোছে না। শুরুতে বন্ধ।
- **Import (Customers › More › Import old customers, `/admin/customers/import`):** choose the old shop's order list as a
  CSV; the preview (nothing saved) guesses the columns, the status meanings and the date order from the admin's own words,
  reads Bengali digits and BD numbers, and counts new people, people already here by phone, the same old order twice,
  orders brought in before and bad numbers; "Bring in" only after a confirm.
- **What it writes:** old orders as `LegacyOrderRecord` history (never an `Order`: no stock, no money, never in Sales); new
  profiles marked as imported with no consent; an existing customer is never overwritten; no message goes. An import's
  undo archives its records and the profiles it made, never deletes; every step audited.
- **Customer page:** an "Old shop orders" card with the counts (delivered, returned, cancelled); a card on Customer settings.
- Guides: [customers/import](docs/admin-guide/pages/customers/import.md), [customers/settings](docs/admin-guide/pages/customers/settings.md),
  [customers/customer](docs/admin-guide/pages/customers/customer.md); tests: the pure CSV reader, DB import and undo, the API.
Register: [S14](docs/MASTER-REGISTER.md#s14--crm--customers--pr-284303).

- **Go-live gate (1 Nov, #73; PR 505 follow-up, SIM-F-031, F-025/F-047):** the thank-you page says "Order placed" until the shop confirms; `Order.lang` (migration `0083`) and `messages.language` "customer" (the new default) send each order's messages in the language it was placed in.
- **Follow-ups (#94):** a district filter on the Customers list (285); "Who looked at this customer" folds repeated
  opens into one line with a count (286; `customers.looksFold`, registry v267, off); the sample seed gives the sample
  customer a "Same person?" pair and a merged profile (284).
- **Follow-up (#96, PR 284):** Customer settings gets cards for the merge rules, the phone mask, the customer list and
  one customer's page.

### S20 · Fulfilment & documents — Done (9/9)

> **বাংলায় সংক্ষেপে:** প্রতিটা অর্ডারের ইনভয়েস নিজে থেকে তৈরি হয়ে থাকে — একটা অর্ডারে একটাই নম্বর; অর্ডার বদলালে একই নম্বরে "সংশোধিত"।
> অর্ডার → প্যাকিং আর প্রিন্ট → ইনভয়েস: সবগুলো একসাথে কাগজে বা থার্মাল রোলে, একটা অর্ডারের চ্যাটের ছবি (JPG)। ইনভয়েসে শুধু অর্ডারে যা আছে তাই।

**Built (PR 407): the customer invoice.** Migration `0050_invoice_support` (additive: `GeneratedDocument` number, fingerprint,
data, checked time); settings registry v63 (`packages/settings/src/registry-invoice.ts`, group `orders`); code in
`packages/orders/src/invoice.ts`, the PDF and picture in `packages/documents/src/invoice.ts`, the job in
`packages/jobs/src/invoices.ts`.
- **Issued and kept:** every placed order's invoice is issued once and kept (`GeneratedDocument`, kind `INVOICE`): one number per
  order for life (the `account.invoice` pattern), a new version with the same number ("Revised 2") only when the order's content
  changes — lines, money, names, address. Payments, confirms and status steps never make one. The worker job `invoices.issue`
  issues new and edited orders; an older order gets its invoice when it is opened or printed. The invoice only shows what the
  order holds: no price, discount or total is worked out again (CN-022).
- **Orders → Packing & print → Invoices** (`/admin/orders/packing/invoices`): counts, views (all, revised, waiting), search by order or
  invoice number; one PDF of many on paper (A4/A5) or the thermal roll (80/58 mm); per order paper, roll or the chat picture (JPG).
  The letterhead and column names on every page, a row never split over two pages, the courier's consignment barcode once booked.
  The customer's own invoice page shows the same number, "Revised n" and the barcode.
- **Settings (v63), as cards on the page:** `account.invoice` (PR 248); `documents.invoice.print` — A4, roll 80 mm, 203 dpi, English,
  barcode on, logo on, 100 per print (1–500); under More options `documents.invoice.image` — JPG, 1240 px (600–2400), quality 85
  (50–100) and `documents.invoice.issue` — on, every 10 minutes (1–1440), 200 a run (1–5000), 30 days back (1–3650). The shop's legal
  name, address and VAT/BIN come from the store profile settings and ship empty.
- **Permissions:** `fulfilment.read` to see, `orders.invoice` to print, new `orders.invoiceSettings` to change the cards.
- **API:** `GET /api/admin/invoices` (list), `POST /api/admin/invoices/file` (PDF or JPG), `GET/PUT /api/admin/invoices/settings`.
- **Tests:** issue, revise and keep on PostgreSQL; the PDF and the picture; the job; the settings. Guide:
  [Invoices](docs/admin-guide/pages/orders/invoices.md) and the [Orders guide](docs/admin-guide/orders.md).

~~Still planned in S20: register PRs 404–406, 408–412.~~ Built in #78 (below); S20 is done.

**Built (PR [404](docs/stages/S20.md#pr-404)–406, 408–412; 1 Nov, #78, After launch): the packing room.** Settings
registry v150–v154 (`registry-print-run.ts`); migrations `0110_picking_ticks`, `0111_shelf_bins`; permissions
`fulfilment.printSettings`, `fulfilment.bins`.
> নতুন (#78, S20 শেষ): প্রিন্টের পাতায় কী ছাপা হবে আর স্টিকারের মাপ, পিকিং লিস্টে ট্যাপ করে "তোলা হয়েছে" দাগ আর তাক ধরে সাজানো, হ্যান্ডওভারের ইতিহাস আর কপি প্রিন্ট, ছাপার মান যাচাই, ইনভয়েসের সাতটা ডিজাইন আর প্রতিটা শব্দ বদলানো, প্যাক পাতায় প্রতিটা অর্ডারের কাগজপত্র আর কয়েকটা অর্ডার বেছে একসাথে বুক বা প্রিন্ট।
- **Print run (404):** Orders › Packing › Print — the queue preview with each parcel's pieces under its category, what
  one press prints (stickers, sticker + invoice, invoices) and the sticker size (`fulfilment.printRun`, stickers only).
- **Picking list (405, 412):** tap a size line to mark it pulled, "more to pull" when a new order comes after (marks
  append-only); each style's shelf set on the page (`fulfilment.bins`, audited) and the sort as a card
  (`fulfilment.picking.sort`, by category as shipped, or shelf by shelf, also on the PDF).
- **Handover (406):** the "Handed over" history per courier with "Print copy" (`fulfilment.handover.history`).
- **Print quality (408, B2.4):** every document checked on what was drawn; "Print check" draws every document at every
  size the owner set; the shop's logo on the picking list and the handover sheet (`documents.printQuality`).
- **Invoice designs (409, ORD-04d):** seven designs with a live preview (`documents.invoice.design`, classic) and every
  word the invoice prints editable in English and Bengali.
- **Pack page (410, 411):** each order's documents (sticker ×n, invoice, picking lists, handover sheet) and the day's
  summary line; filter by date or a missing document, tick orders, "Book selected" (through the Delivery booking's
  checks) and "Print selected" (a reprint asks its reason).
- Guides: [print](docs/admin-guide/pages/orders/print.md), [picking](docs/admin-guide/pages/orders/picking.md),
  [handover](docs/admin-guide/pages/orders/handover.md), [invoices](docs/admin-guide/pages/orders/invoices.md),
  [pack](docs/admin-guide/pages/orders/pack.md).
- **Follow-ups (#93, PR 407):** "Print invoice" on the order page (paper, roll or the chat picture, through the Invoices
  page's file route); a settings card's refused save says "no permission", "not there any more" or "signed out".

### S22 · Support (all-in-one) — Done (14/14)

> **বাংলায় সংক্ষেপে:** সাপোর্ট ইনবক্স তৈরি: সব চ্যানেলের কথোপকথন এক তালিকায়, কে উত্তর দিয়েছেন নামসহ, টিমের ভেতরের নোট, ফাইল, দায়িত্ব আর
> "কে কী করেছে"-র লগ (কেউ মুছতে পারে না)। চ্যানেল (WhatsApp, Messenger, সাইটের চ্যাট) যুক্ত হবে PR 426-এ; ততদিন উত্তর রাখা হয়, "পাঠানো হয়নি" লেখা থাকে।

**Built (PR 425): the support core.** New package `@extas/support`; migration `0050_invoice_support` (additive; the
who-did-what log `ConversationEvent` is append-only at the database); settings registry v63
(`packages/settings/src/registry-support.ts`, group `support`).
- **Conversations:** one per person per channel, with a reference code; the customer's messages, the shop's replies and internal
  notes in one thread, oldest first. Every message keeps the sender's name as it was. A message that arrives twice is kept once; a
  solved conversation reopens when the customer writes; a contact whose phone matches a customer is linked to him.
- **Replies:** a press sent twice is one message (request key); a screen that missed a change is refused (`STALE`) and the words stay.
  Files (image, video, PDF) are checked by their contents, not their names, and kept in our storage. OPEN → WAITING after a reply
  (setting), back to OPEN when the customer writes, SOLVED by a person.
- **Channels plug in later (PR 426):** a channel kind (`whatsapp`, `messenger`, `livechat`, `instagram`, `email`) and an adapter
  (`SupportChannelAdapter.send`); a channel's webhook calls `receiveMessage`. None is connected yet, so a reply is kept as
  NOT_SENT with the reason `CHANNEL_NOT_CONNECTED`, never lost.
- **Pages:** Support → Inbox (`/admin/support`: views open, waiting, mine, not taken, solved, all, with counts; search; channel);
  one conversation (`/admin/support/c/[id]`: the thread, the reply / note box with files, status, take / let go / give, customer
  and order, the log; two tabs on the phone); Support settings (`/admin/support/settings`).
- **Settings (v63):** `support.inbox` — 50 a page (10–200), 2000 characters (100–4000), take it on reply off, waiting after a reply
  on; under More options `support.attachments` — on, 4 a message (1–10), 10 MB (1–50), image / video / PDF on. A customer's
  number is masked the shop's one way (`customers.phoneMask`, PR 284) and shown whole only with `customers.phone`.
- **Permissions:** `support.read`, `support.reply`, `support.assign`, `support.settings`.
- **API:** `/api/admin/support` — the inbox, `c/:id`, `c/:id/messages`, `c/:id/assign`, `c/:id/status`, `files`, `files/:id`,
  `staff`, `settings`.
- **Tests:** the package on PostgreSQL (receive, reply, note, files, assign, status, the log, settings); the API on PostgreSQL; the
  words in both languages; the sample seed's three sample conversations. Guides: [Inbox](docs/admin-guide/pages/support/inbox.md),
  [Conversation](docs/admin-guide/pages/support/conversation.md), [Support settings](docs/admin-guide/pages/support/settings.md),
  [Support](docs/admin-guide/support.md).

- **Bengali digits in the inbox search (1 Nov, #75, PR 425 follow-up, go-live gate customer 360°):** `inboxPhoneDigits`
  (`search-pure.ts`) reads ০–৯ as 0–9 and drops +880 / 880 / 00880 and the leading 0, so a number finds the same
  conversations however it is typed. Unit test beside it; the inbox DB test searches in Bengali digits.
- **The contact form lands here (1 Nov, #75, PR 75 follow-up):** a "Send us a message" from `/help/contact` becomes a
  conversation on the store's own hidden "Contact form" channel (never a sending channel), tagged `contact-form`.

~~Still planned in S22: register PRs 427–436, 538 and, since 1 Nov, 624 (a Messenger button on the shop, CN-034, After launch).~~ ~~427–430 built in #78 (below); still planned: 431–436, 538 and 624 (a Messenger button on the shop, CN-034, After launch).~~ 431–436, 538 and 624 built in #80 (below); S22 is done.

**Built (PR [426](docs/stages/S22.md#pr-426); 31 Oct, CN-031 lane A; not deployed yet): the channels come in.**

> নতুন (PR 426): Messenger, WhatsApp আর সাইটের চ্যাটের মেসেজ এখন সাপোর্ট ইনবক্সে আসে, উত্তরও সেখান থেকে যায়। নতুন চ্যানেল যোগ করলে শুরুতে বন্ধ থাকে; Meta-র উত্তরের সময়সীমা পার হলে উত্তর যায় না, কারণসহ লেখা থাকে। সাইটের চ্যাট শুরুতে বন্ধ।

- **Channels:** Facebook Messenger Page (new adapter, mock until its keys; a Keys & connections row), WhatsApp Business
  (inbound now carries the phone number id, the profile name and files, and reaches the inbox before any automatic answer)
  and the site's live chat. A message is taken only from a channel added and switched on in that store; the same message
  twice is one. Support settings lists the channels: add (off), rename, switch, put away; never deleted; audited.
- **Replies:** Messenger and WhatsApp only inside `support.channels.replyWindowHours` (Meta's window, kept on the
  conversation), words only; the site chat while it is on. A refused reply is kept as NOT_SENT with its reason.
- **Site chat:** `/api/shop/support-chat` with a visitor token in an httpOnly cookie (only its hash stored), a per-minute and
  a length limit; the visitor sees sent answers only, never a note. The shop's chat button is drawn only while
  `support.liveChat` is on (off as it ships).
- **Webhook:** `/api/messenger/webhook` (verify token, signed posts, size limit); the preview gate (v6) and the edge gate
  let it through as signed.
- **Settings:** registry v72 (`registry-support-channels.ts`): `support.channels`, `support.liveChat` (off). No migration.
- **Guides:** [Support settings](docs/admin-guide/pages/support/settings.md), [Inbox](docs/admin-guide/pages/support/inbox.md),
  [Conversation](docs/admin-guide/pages/support/conversation.md), [Keys & connections](docs/admin-guide/pages/settings/keys.md).
- **Tests:** `packages/adapters/test/messenger.test.ts`, `whatsapp.test.ts`, `packages/support/src/connectors.db.test.ts`,
  `packages/messages/src/whatsapp.db.test.ts`, `apps/web/src/lib/support-connect.db.test.ts`, `support-api.db.test.ts`,
  `edge-gate.test.ts`, the settings test; checked in a real browser at 390, 768, 1366 and 1920 px in English and Bengali.

**Built (PR [427](docs/stages/S22.md#pr-427)–430; 1 Nov, #78, After launch): knowing the person and selling from the
chat.** Settings registry v155–v158; migrations `0112_support_identity`, `0113_support_product_share`; permissions
`support.identity`, `support.order`.
> নতুন (#78): সাপোর্ট চ্যাটে কে লিখছেন তা নম্বর দিয়ে চেনা (WhatsApp, Messenger আর সাইটের চ্যাটে একই মানুষ এক জায়গায়), চ্যাটের পাশে কাস্টমারের অর্ডার, ঝুঁকি আর রাস্তায় থাকা পার্সেল, চ্যাটে পণ্যের কার্ড পাঠানো আর চ্যাট থেকেই অর্ডার (ঝুঁকি থাকলে আগে অগ্রিম)। দাম, ছাড় বা COD নিজে বদলায় না।
- **Who is writing (427):** `support.identity` (off) — the number from the channel or the chat's words links the
  customer and joins his chats across channels as one person; the "Same person" card; set by hand, "Not this customer",
  "Not the same person" (`support.identity`, audited); erasure clears his chat contacts.
- **Customer card (428):** `support.context` (on as it ships, B4.5 locked) — his orders and shares over every profile and
  number, the latest risk band, parcels on their way, latest orders; counts and risk only with `customers.read`.
- **Products in the chat (429):** `support.catalogue` (off) — "Products" (or "/") sends a product card with a reference
  link; an order through it within the credit days is credited to the chat once (`Order.supportRefCode`), never changing
  the price, a discount, COD, the total or the source.
- **Chat bag and one-press order (430, SIM-F-024):** `support.cart` (off) — a bag priced by the shop's own engines;
  "Create order" runs the checkout's stock and delivery checks and keeps the chat's channel as the source; a checkout the
  owner's Parameter for Checkout flags gets "Take advance" and its pay link in the chat, never a COD order.
- Guides: [support/conversation](docs/admin-guide/pages/support/conversation.md), [support/settings](docs/admin-guide/pages/support/settings.md),
  [orders/all](docs/admin-guide/pages/orders/all.md).

**Built (PR [431](docs/stages/S22.md#pr-431)–436, 538, 624; 5 Nov, #80, After launch): tickets, AI drafts, follow-ups,
privacy, the support app, analytics, escalation and the Messenger button.** Every switch is off; settings registry
v159, v180–v189; migrations `0114_support_tickets` – `0119_support_escalation`, `0130_support_channel_taps`; permission
`support.block`.
> নতুন (#80): সাপোর্টে টিকিট আর দেরির হিসাব, AI-এর খসড়া উত্তর (পাঠান মানুষ), অর্ডার না হওয়া চ্যাটে একবার মনে করানো, ব্লক তালিকা আর শুধু-নিজের-চ্যাট, ফোনে সাপোর্ট অ্যাপ, সাপোর্টের হিসাব, কেউ উত্তর না দিলে Telegram-এ খবর, আর দোকানে Messenger বাটন — সব সুইচ বন্ধ অবস্থায়।
- **Tickets (431):** `support.tickets` — first-answer and solution timers, reopen, the inbox's Late view, late chats in
  the bell.
- **AI drafts (432, SIM-F-012):** `support.drafts`, `support.draftWords`, `support.draftKeywords` — the message sorted,
  an answer drafted from the order, parcel and Find My Size; "Use draft", a person sends; complaints and bulk go to a person.
- **Follow-ups (433):** `support.followUp` — chats with a bag or products and no order get one rule-capped follow-up; a
  Follow-ups view; a person sends or skips.
- **Block list and privacy (434):** `support.block` (owner only, nothing deleted, a Blocked view), own chats only, numbers
  in messages masked.
- **Support app (435):** `support.app` — `/admin/support/app`, an installable support-only shell with push (Web Push on
  its mock until the key).
- **Analytics (436):** `/admin/support/analytics` — per channel, person and AI: answers, timers, late tickets, chat →
  order and delivered Sales; the team view with `support.assign`.
- **Escalation, desk hours, link safety (538):** `support.deskHours`, `support.escalation`, `support.linkSafety` — the
  owner told on Telegram once per unanswered wait (job `support.escalate`); risky links shown as struck words with a mark.
- **Messenger button (624, CN-034):** `contact.messenger` (owner data), `support.messengerButton` — an m.me link to the
  store's Page beside WhatsApp, with where it was tapped; taps counted per day and place on Support settings.
- Guides: [support/inbox](docs/admin-guide/pages/support/inbox.md), [support/conversation](docs/admin-guide/pages/support/conversation.md),
  [support/settings](docs/admin-guide/pages/support/settings.md), [support/app](docs/admin-guide/pages/support/app.md),
  [support/analytics](docs/admin-guide/pages/support/analytics.md). Report: [S22 done](docs/reports/2026-11-05-S22.md).
- **Follow-ups (#93, PR 425):** chat files (the support folder) stay out of the media library, the pickers and the
  orphan clean-up; the customer card beside a chat shows his exchanges and the team's notes; a chat's subject and order
  link can be edited, each logged; "Needs you now" and the Support badge count customers waiting for an answer
  (longest first) and late chats.
- **Follow-ups (#96, PR 425):** the channels' media download adapters behind an SSRF guard, and a customer's Messenger
  or WhatsApp file copied to the shop's own storage after the webhook (`support.fileCopy`, registry v273, off).

### S11 · SEO engine — Done (22/22)

> **বাংলায়:** দোকানের ঠিকানার নিয়ম, প্রতিটা পাতার সার্চের শিরোনাম আর বিবরণ, আর Google-এর জন্য পাতার তথ্য (দাম, স্টক, পথ, দোকানের পরিচয়) তৈরি। আপনি চালু না করা পর্যন্ত Google-এ দোকান আসে না, AI খসড়াও বন্ধ।

Built (PR [220](docs/stages/S11.md#pr-220), 221, 222; 29 Oct; not deployed yet):

- **Addresses and canonicals (PR 220):** English at `/`, Bengali at `/bn/` with the same slug. Every page names itself, in
  its own language, as its canonical on the shop's own origin (the store's primary domain, else `system.stagingHost`, else
  the request host). hreflang en/bn/x-default only where the Bengali twin passed the translation gate (PR 588). A page
  that says no (filtered list, preview, set builder, search) is `noindex,follow` without hreflang. Capitals in a public
  address 301 to lower case.
- **Search titles and descriptions (PR 221):** one template per page kind (`seo.titles`: home, category, combo, combo
  list, combos page, help, en and bn, each with its own tokens; the product templates stay in `naming.*`). The page's own
  text first, then an accepted AI draft, then the template (cut to `naming.seoTitleMaxChars` /
  `naming.metaDescriptionMaxChars`), then the page's own words. og:title, og:description and og:url (= canonical) too.
- **AI drafts (PR 221):** `seo.aiDrafts` (off; 20 per press; products and categories) works only while AI is on
  (CN-026), on the practice AI writer until the real one (PR 306). A draft waits for a person; accepted, it fills only
  empty fields. Audited (`seo.drafts.create`, `accept`, `discard`).
- **Structured data (PR 222):** Product, Offer / AggregateOffer and BreadcrumbList on product pages, BreadcrumbList and
  ItemList on category pages, Organization (only what the owner filled in) and WebSite on the home page, a set as a
  Product with one Offer at its set price, in stock only while every piece can be sold. The struck price only where the
  page shows it. Never a rating before real reviews (PR 223). `seo.structuredData` (all parts on).
- **Admin:** Website › SEO (`/admin/website/seo`): search engines, titles and descriptions with a live preview, data for
  search engines, AI drafts. Permissions `seo.read` (the check account has it) and `seo.manage`. API
  `/api/admin/seo` (GET/PUT) and `/api/admin/seo/drafts`. Guide: [`docs/admin-guide/seo.md`](docs/admin-guide/seo.md).
- **Settings:** registry v64 (`registry-seo.ts`: `seo.indexing`, `seo.titles`, `seo.aiDrafts`; `seo.structuredData`
  extended). Search engines off until go-live, so the preview always stays noindex.
- **Tests:** settings (registry), the URL and indexing rules, the title templates, the structured data, the practice
  AI writer, and DB tests for the SEO API and the AI drafts.

**Built (PR [235](docs/stages/S11.md#pr-235), 527, 586; 31 Oct, CN-031 lane A; live since 31 Oct 17:25, #68): old links never die.**

> নতুন (PR 235, 527, 586): পুরোনো বা ভুল লিংক ঠিক পাতায় যায় (WordPress-এর লিংক চালুর দিনে), না-পাওয়া পাতার তালিকা এক ক্লিকে ঠিক; বিক্রি শেষ বা সরানো পণ্যের পাতা থেকে যায়, পাশে "এখন পাওয়া যাচ্ছে"; ডেমোর পুরোনো # লিংক নিজে আসল পাতায় চলে যায়।

- **Redirects (PR 235):** the proxy forwards every enabled Redirect row with `naming.redirectStatusCode` (301 as shipped),
  for the `/bn` twins too, the query kept; never the home page or a private family; the table is re-read every 30 s.
  WordPress map rows forward only while `seo.redirects.wordpressMapLive` is on (off; switched on go-live day, PR 587).
  Import by paste or file with a dry check first. No chains: a new target that is itself redirected is followed to its
  end and older rows are repointed. A target is never another site. A redirect is only switched off, never deleted. A
  combo asked for with its colours in another order forwards to the real combo.
- **404 report (PR 235):** path, count, last seen and the referring page (origin and path only), capped at
  `seo.notFound.maxRows`; the closest live product or category is suggested; **Fix** saves a redirect, **Set aside** hides
  the row. Migration `0058_seo_redirects` (`NotFoundHit.ignoredAt`).
- **Pages that stay (PR 527):** a sold-out, taken-off or archived product page keeps answering 200 and shows "Available
  now" (in-stock products of its category first, then the shop's best-ranked, never itself; up to
  `seo.urlPolicy.alternativesMax`, 4). A restock makes it a normal page again. Sold-out and retired pages stay listed for
  search engines (both switches on, so ranks are kept); an archived product's offer is schema.org `Discontinued`, a
  sold-out one `OutOfStock`. An archived collection that once had a product on the shop shows a resting page (its
  parent, New in, live collections, what can be bought now); a hidden or never-public one still says "page not found",
  so no unreleased name shows. A guard test: the web app never deletes a product, category or redirect.
- **Demo links (PR 586):** a tiny script first in every shop page turns an old demo `#/…` link (product, category,
  combo, sets, bag, checkout, account, order, journal, size guide, admin …) into its live address with
  `location.replace`, so Back never returns to the dead link; the query is kept, a Bengali page stays Bengali, an
  anchor such as `#top` is left alone, an unknown `#/` route goes to the same path, and it never sends anyone to
  another site. The tests run the shipped script against every route of `docs/demo/src/02-core.js`.
- **Admin:** Website › SEO › **Redirects & 404** (`/admin/website/seo/redirects`, `seo.read`; changes need
  `seo.manage`) and the **Pages that stay** card on Website › SEO; the hash switch under More options. Guides:
  [`docs/admin-guide/pages/website/redirects.md`](docs/admin-guide/pages/website/redirects.md),
  [`docs/admin-guide/seo.md`](docs/admin-guide/seo.md).
- **Settings:** registry v71 / v72 (`registry-seo-reach.ts`): `seo.redirects` (`wordpressMapLive` off, `keepMonths` 12),
  `seo.notFound`, `seo.urlPolicy` (`alternatives`, `alternativesMax` 4, `soldOutIndexed`, `retiredIndexed`,
  `retiredCategoryPage`, all on), `seo.hashLinks.forward` (on).
- **Tests:** `apps/web/src/lib/seo/redirects.test.ts`, `redirects-admin.db.test.ts`, `url-policy.test.ts`,
  `hash-forward.test.ts`, `packages/settings/test/registry-seo-reach.test.ts`; checked in a real browser at 390, 768,
  1366 and 1920 px in English and Bengali.

**Built (PR [227](docs/stages/S11.md#pr-227), 228, 229, 232, 233, 234, 236, 588; 31 Oct, CN-031 lanes A and B; not deployed yet): everything Google needs before go-live.**

> নতুন (PR 227–236, 588): কালেকশনের নিজের সার্চের লেখা আর আপনার নাম দেওয়া ফিল্টার পাতা; ভাগ করা sitemap; সেটিংস থেকে robots.txt আর AI রোবটের সুইচ; ছবির বিবরণ নিজে থেকে লেখা; Search Console আর Bing-এর সংযোগ; আসল কাস্টমারের ফোনে পাতার গতি আর মাসে একবার ধীর 4G-তে পরীক্ষা; বাংলা-ইংরেজি পাতার জোড়া প্রতিটা ডিপ্লয়ে পরীক্ষা; বাংলা পাতা 'তৈরি' চিহ্ন দেওয়ার পাতা। চালুর আগে দোকান Google-এ যায় না।

- **Collection pages (PR 227):** Website › SEO › Collection pages (`/admin/website/seo/categories`): each collection's and
  sub-collection's own search title, search line, heading and text (`category.seo`, both languages or neither). A filtered
  page is its own search page only when the owner named it (one size, colour or fit, one value, its own name in both
  languages) and it shows at least `minProducts` styles (`seo.filterPages`, off and empty); every other combination points
  to the clean collection page.
- **Sitemaps (PR 228):** `/sitemap.xml` is an index of `/sitemaps/<kind>-<n>.xml` (pages, collections, products, combos),
  only pages that may be listed, split at `seo.sitemaps.perFile` (5,000) and capped at `maxUrls` (50,000); a Bengali twin
  once marked ready; kept for `cacheMinutes` (60) and purged at the CDN when a product goes on or off the shop. Card with
  the files, the counts and "Make the sitemaps now" (audited).
- **robots.txt (PR 229):** every robot kept out while the shop is closed to search engines or the request is not on the
  store's primary domain; open, the admin, the API, the ERP's calls, a customer's own pages and unlisted search results stay
  out, then the sitemap's address. AI robots (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) welcome as shipped, one
  switch keeps them out (`seo.robots`). Card "Robots and AI assistants" with the live text.
- **Photo descriptions (PR 232):** the English alt text of a photo that has none is written from the product's name, the
  photo's colour and kind in the dictionary's words, on adding a photo or with "Write them now" (`seo.altText`, on, 125
  letters); a typed description is never changed; Bengali pages build their own from the Bengali words.
- **Search Console and Bing (PR 233):** the verification codes (`seo.verification`, owner data, empty) as meta tags on every
  shop page; two Keys & connections rows (Google service account key, Bing API key), on the mock until a key passes its
  Test; "Send the sitemap" once the shop has its own domain (audited).
- **Real visitors' speed (PR 234):** shop pages report LCP, CLS, INP, TTFB and FCP to `/api/shop/vitals`; only daily counts
  per metric, kind of page and phone/desktop are kept (`WebVitalDay`, migration `0066_web_vitals`), never a visitor,
  address or time (`seo.vitals`, targets from PR 10, every number editable). The SEO card and the Server page show the 75th
  percentile against the targets. `vitals-monthly.yml` runs the monthly lab on the VM (`tools/vitals-lab.mjs`: home,
  category and product on a phone over slow 4G, the admin on desktop) into `state/vitals-lab.json`.
- **Language pairs (PR 236):** hreflang in the HTML head only (Blueprint C12.1); the sitemaps still list both twins, the
  pairs in them only behind `seo.hreflang.inSitemaps` (off). Card "Language pairs (hreflang)". Every deploy's smoke test
  runs `tools/hreflang-check.mjs`: exactly en and bn plus x-default = English, absolute addresses on one host, its own
  canonical, a twin that answers 200 and names the same pair back.
- **Bengali pages (PR 588):** Website › SEO › Bengali pages (`/admin/website/seo/bengali`): every page that could be listed,
  whether its main content has Bengali text and whether it is marked ready; coverage by kind; "Mark ready" / "Not ready"
  per page or for a page of the list (`seo.manage`, audited), only with Bengali text, never by itself.
  `language.bengali.readyPages` still drives hreflang, robots and the sitemap. A not-ready Bengali page is kept out of
  search (`language.bengali.gate` = `unlisted`, as shipped) or sent to its English twin (`english`, an uncached 307;
  bag, checkout, account and search never move).
- **Settings:** registry v72 (`registry-seo-reach.ts`: `seo.filterPages`, `seo.sitemaps`, `seo.robots`, `seo.altText`,
  `seo.verification`, `seo.vitals`, `seo.hreflang`; `registry-category.ts`: `category.seo`) and v84
  (`registry-bengali.ts`: `language.bengali.gate`).
- **Guides:** [SEO](docs/admin-guide/pages/website/seo.md), [Collection pages](docs/admin-guide/pages/website/seo-categories.md),
  [Bengali pages](docs/admin-guide/pages/website/seo-bengali.md), [Server](docs/admin-guide/pages/reports/server.md),
  [Keys & connections](docs/admin-guide/pages/settings/keys.md).
- **Tests:** `apps/web/src/lib/seo/` — `filter-pages`, `category-seo-words`, `sitemap`, `sitemap-data.db`, `robots`,
  `alt-text`, `alt-text-data.db`, `verification`, `search-engines.db`, `vitals`, `vitals-data.db`, `hreflang`,
  `bengali-gate`, `bengali.db`, `admin-api.db`; `packages/adapters/test/search-console.test.ts`,
  `tools/vitals-lab.test.mjs`, `tools/hreflang-check.test.mjs`, `packages/settings/test/registry-seo-reach.test.ts`;
  checked in a real browser at 390, 768, 1366 and 1920 px in English and Bengali.

~~Planned — see register PRs 223–226, 230, 231, 237, 238~~ Built in #82 (below); S11 is done ([report](docs/reports/2026-11-06-S11.md)):
[S11](docs/MASTER-REGISTER.md#s11--seo-engine--pr-220238).

**Built (PR [223](docs/stages/S11.md#pr-223)–226, 230, 231, 237, 238; 6 Nov, #82, After launch): data for search
engines from real rows, the AI-assistant summary, links between pages, SEO health and the Organic report.** Settings
registry v205–v209 (`registry-storefront-fu.ts`, `registry-seo-reach.ts`); no migration.
> নতুন (#82): সার্চ ইঞ্জিনকে রেটিং আর প্রশ্নোত্তর শুধু আসল রিভিউ আর প্রশ্ন থেকে; পণ্যের পাতার সব লেখা প্রথম থেকেই পাতায়; AI সহকারীর জন্য দোকানের সারাংশ (/llms.txt); কালেকশনের নিচে "আরও কালেকশন"; SEO-তে কী বাকি তার তালিকা আর সার্চ থেকে বিক্রির রিপোর্ট। নতুন সুইচ শুরুতে বন্ধ।
- **Review data (223):** the `reviews` part of `seo.structuredData` (v205, off) — a product page sends its star rating and reviews only
  from its approved, published reviews and only what its reviews block shows; no review or a bad number sends nothing,
  never a made-up rating.
- **FAQ data (224, 226):** the `faq` part of `seo.structuredData` (v206, off) — the product's answered questions, the FAQ page's and a
  collection's shown questions as FAQPage data; the admin says plainly that Google shows no FAQ rich result since 7 May
  2026.
- **Page words in the HTML (225, 226):** the product page's folded words (Fabric & care, Size & fit, Description, the
  delivery, exchange and returns rules) and each collection's own heading, text and questions are in the first response,
  only hidden while closed; nothing loads on a tap.
- **Summary for AI assistants (230):** `seo.answerPack` (v207: on, summary empty) — `/llms.txt`: the shop's name, the
  owner's own summary, the collections with their search lines, the rule pages and the contact details filled in;
  answered only while the shop is open to search engines on its own domain.
- **Links between pages (231):** `seo.internalLinks` (v208: off, 6 at most) — "More collections" under a collection page
  (its sub- or sister collections, then the other main ones; only shown ones with styles).
- **SEO health (237):** Website › SEO › SEO health (`/admin/website/seo/health`): what is missing page by page (a product
  with no description or photo description, a collection with no text, search line or style), counted per issue with
  filters and "Open"; every deploy's smoke test also checks the canonical's language and no `#` links.
- **Organic report (238):** `seo.organic` (v209: 28 days, target 50%, 10 searches) — Website › SEO › Organic report
  (`/admin/website/seo/organic`): the share of Sales from search engines, YouTube and AI assistants against the owner's
  target, by site, and with Search Console or Bing connected the clicks, times shown, position and top searches; an
  untagged visit from a listed site is kept as its source (an ad click is never replaced).
- Guides: [website/seo](docs/admin-guide/pages/website/seo.md), [website/seo-categories](docs/admin-guide/pages/website/seo-categories.md),
  [website/seo-health](docs/admin-guide/pages/website/seo-health.md), [website/seo-organic](docs/admin-guide/pages/website/seo-organic.md),
  [products/reviews](docs/admin-guide/pages/products/reviews.md), [marketing/tracking](docs/admin-guide/pages/marketing/tracking.md);
  tests beside the code (structured data, llms.txt, links, health, organic sources).

**PR 235 follow-up (#91): the 404 report counts only real misses.** Only an address a shop page really answered "not
found" for is counted (`shopNotFound` at the 16 places that miss; a guard test keeps it so) — before, Next drew the
not-found page with every shop page and every visit was counted.
> বাংলায়: "৪০৪" তালিকায় এখন শুধু সত্যিই না-পাওয়া ঠিকানা আসে; আগে প্রতিটা ভিজিট ভুল করে গোনা হতো।
- **Follow-ups (#94):** the shop's own test browsers send a check header and their speed readings are counted apart
  (234); while the Bengali gate sends visitors to English, a not-ready page's language switch marks Bengali "coming
  soon" and the "Bengali pages ready" figure opens Website › SEO › Bengali pages (588); the size chart's sizes and
  measurements are in the product page's first HTML, hidden (225).

### S12 · Content & blog — In progress (20/22)

> **বাংলায়:** দোকানের নিজের ব্লগ (জার্নাল) তৈরি: বাংলা বা ইংরেজিতে লেখা, তিন ধাপের যাচাই, লেখার এডিটর আর দোকানের মতোই প্রিভিউ,
> কোন লেখা লিখবেন আর কোনটা কোনটাকে লিংক করবে তার পরিকল্পনা, লেখার আগে ব্রিফ, ব্রিফ থেকে AI দিয়ে প্রথম খসড়া (মানুষ ঠিক করে),
> লেখকদের বিষয় মাস ধরে একবারে অনুমোদন আর প্রকাশের ক্যালেন্ডার। সব শুরুতে বন্ধ; কোনো লেখা মোছা হয় না।

**Built (PR [239](docs/stages/S12.md#pr-239)–245, 528; 6 Nov, #83, After launch): the journal — articles, the editor,
the shop's pages, the topic plan, the approval queue, the brief, the AI first draft and the publish calendar.** Every
switch ships off; settings registry v222–v227 (`registry-journal.ts`: `blog.journal`, `blog.clusters`, `blog.approval`,
`blog.brief`, `blog.aiDraft`, `blog.schedule`); migrations `0147_blog_posts`, `0148_content_clusters`, `0149_blog_briefs`;
permissions `blog.read`, `blog.write`, `blog.publish`.
> নতুন (#83): Website › Blog & journal-এ লেখার বোর্ড, এডিটর, ভাগ ও লেখক, বিষয়ের পরিকল্পনা, ব্রিফ আর ক্যালেন্ডার; দোকানে `/journal`।
- **Articles (239):** English or Bengali, each with its own link, category (two levels), author (an AI author always shown
  as one), search description, focus keyword, one-line answer, main photo and product block; idea → writing → proofread →
  business facts → SEO check → scheduled or published; taken down, put away and restored, never deleted; every review pass
  kept with who passed it; an edit under review sends it back to writing. API `/api/admin/blog/{posts,categories,authors}`,
  every change audited.
- **Admin (240):** Website › Blog & journal (`/admin/website/blog`): the board by step with counts and the journal's card;
  the editor (`/admin/website/blog/<id>`: the writing format, words and reading time as you type, up to 8 products) with
  a preview drawn by the shop's own article component and the review history; Categories & authors
  (`/admin/website/blog/shelves`).
- **Shop pages (241):** `/journal` and `/bn/journal` (live articles of the page's language, featured first, topic chips),
  `/journal/topic/<link>` and `/journal/<link>` (one-line answer, honest byline, reading time, dates, contents, live
  product cards); "Coming soon" while `blog.journal` is off; not listed by search engines until PR 249.
- **Topic plan (242, 244):** Website › Blog & journal › Topic plan (`/admin/website/blog/plan`): clusters with a pillar,
  supporting articles and the shop page they lead to, the links each article still lacks, the topics still to write (a
  very close one needs a second press); "Waiting for your yes" by month with "Approve the whole month" and the digest of
  what was decided by itself (`blog.approval`: the owner decides as shipped).
- **Brief and AI first draft (528, 243):** Brief (`/admin/website/blog/briefs/<id>`, `new`): topic, language, words and at
  least one keyword before a word is written; one brief per topic, versioned. "Write the first draft with AI" (only while
  `ai.enabled` and `blog.aiDraft` are on, at most 6 a day) writes from the brief alone in its language, marked AI-assisted;
  a person edits it and it passes the review steps. No AI key yet, so the practice writer answers and says so.
- **Calendar (245):** Website › Blog & journal › Calendar (`/admin/website/blog/calendar`): publishing times (09:00–21:00),
  at least 3 / target 5 / most 6 a day, the month view, the finished articles waiting with what stops them and "Fill the
  free times"; an unfinished article never gets a time; a full day refuses a hand-set time.
- Guides: [website/blog](docs/admin-guide/pages/website/blog.md), [website/blog-editor](docs/admin-guide/pages/website/blog-editor.md),
  [website/blog-shelves](docs/admin-guide/pages/website/blog-shelves.md), [website/blog-plan](docs/admin-guide/pages/website/blog-plan.md),
  [website/blog-brief](docs/admin-guide/pages/website/blog-brief.md), [website/blog-calendar](docs/admin-guide/pages/website/blog-calendar.md);
  tests: the journal models, DB tests for posts, clusters, briefs and the calendar, the shop pages.

**Built (PR [246](docs/stages/S12.md#pr-246)–250; 6 Nov, #84, After launch): seasonal pages, the structured help pages
with "Ways to pay", help pages in search, the journal's search-engine side and the content performance report.** Every
switch ships off; settings registry v228 (`registry-seasonal.ts`: `marketing.seasonal`), v229 (`seo.indexing` journal
kind, `seo.structuredData.article`, `blog.journal.relatedArticles`) and v233 (`blog.performance`); migration
`0150_content_performance`.
> নতুন (#84): ঈদ-শীত-পূজার স্থায়ী পেজ (প্রতি বছর আবার লাইভ, লিংক কখনো ভাঙে না); "পেমেন্টের উপায়" পাতায় শুধু চেকআউটে যা চালু;
> হেল্প পাতা সার্চে আসল নিয়মের লাইনসহ; জার্নালের লেখা Google-এর জন্য তৈরি (বিবরণ, sitemap, "এরপর পড়ুন");
> কোন লেখা পাঠক আনে আর কোন লেখা অর্ডার আনে তার রিপোর্ট।
- **Seasonal pages (246):** `marketing.seasonal` (v228, off; occasions Eid, winter, Puja; 24 products, 3 guides) —
  Marketing › Landing pages › Seasonal pages (`/admin/marketing/landing/seasonal`, editor `…/seasonal/<id>`, `new`):
  one page per occasion at `/collections/<link>` (refused when a category or "New in" answers there), parts in a fixed
  order each switchable (headline and intro, the Eid order-by line from Rules › Eid, a countdown, the seasonal
  collection's products at their live prices, the owner's reasons, the newest journal guides); going live needs its
  collection; taken down, archived and restored, never deleted; a page that was live once rests with "<name> is coming
  back" while `offSeason` is on, so its link never 404s. API `/api/admin/marketing/seasonal-pages`.
- **"Ways to pay" and structured help (247):** every help page is the same parts (title, line, questions, rule sections,
  the owner's words, details, ways to reach us); `/help/payment` lists exactly the methods the checkout offers now, read
  through the checkout's own payment settings (a method switched off, or on practice with test payments off, never
  shows), then the rules ticked for it; nothing on: "Coming soon". Settings › Policies & texts gets the "Ways to pay"
  tab with "On the shop now". The pay marks' CSS moved to `paymark.css`; the payment search words moved from Terms to
  "Ways to pay".
- **Help pages in search (248):** each help page is also found by the keys of the live rules it shows ("festive",
  "delivery fee"), and its one-line answer is the live rule's own line the query names (`@extas/search` `pickHelpLine`);
  no setting.
- **Article SEO (249):** Website › SEO's page-kind tick "Journal" (off) lets the journal list, topics with live
  articles and live articles be listed; each article's own description, canonical, its twin in hreflang, Open Graph as
  an article; BlogPosting JSON-LD (an AI author sent as the shop) behind `seo.structuredData.article` (off) with
  BreadcrumbList; the journal and live articles in the sitemap (`bnPath`, Bengali-only under `/bn`); "Read next" under
  an article (`blog.journal.relatedArticles`, 0 = none as shipped, up to 6).
- **Content performance (250):** `blog.performance` (v233, counting off; credit the last article read within 30 days) —
  Website › Blog & journal › Performance (`/admin/website/blog/performance`): each article's readers over 7/30/90 days
  by where they came from (search engines, video sites, AI assistants, the shop's own pages) and the orders placed by a
  browser that read it — Ordered value beside Sales (delivered only), through `@extas/metrics` (`kpiByArticle`), money
  only with `reports.read`; "Readers, no orders yet" flags articles that need better product links. While counting is
  on, the article page sends one quiet beacon (`/api/shop/journal-read`) and the checkout credits the article in
  `BlogOrderRead` (append-only), never holding or changing the order.
- Guides: [marketing/seasonal](docs/admin-guide/pages/marketing/seasonal.md), [marketing/seasonal-editor](docs/admin-guide/pages/marketing/seasonal-editor.md),
  [settings/policies](docs/admin-guide/pages/settings/policies.md), [website/seo](docs/admin-guide/pages/website/seo.md),
  [website/blog](docs/admin-guide/pages/website/blog.md), [website/blog-performance](docs/admin-guide/pages/website/blog-performance.md); tests: the seasonal model and DB, help pages and search
  models, `pickHelpLine`, article data, sitemap and the journal DB.

**Built (PR [251](docs/stages/S12.md#pr-251)–253; 6 Nov, #87, After launch): comments, the shared calendar and what
articles sold.** All three pages are in the Lumen look; `blog.read` to see.
> নতুন (#87): জার্নালের লেখার নিচে মন্তব্য (চাইলে মন্তব্য ছাড়াই — শুরুতে বন্ধ; প্রতিটা মন্তব্য আপনি দেখানোর পরেই দেখা যায়);
> সোশ্যাল আর মার্কেটিংয়ের সাথে একটাই ক্যালেন্ডার; আর কোন লেখা পড়ে কাস্টমার কোন প্রোডাক্ট কিনল।
- **Comments (251):** `blog.comments` (registry v250, off = the journal runs without comments; signed-in customers only
  as shipped, 600 letters, 3 a day, 20 listed); migration `0170_blog_comments`. Under a live article the comments a
  person has shown and the box (saved waiting, the same words twice are one). Website › Blog & journal › Comments
  (`/admin/website/blog/comments`): counts, the waiting queue with Show, Show all and Undo, every comment by chip with
  Show / Hide, the switch card; `blog.publish` to act; every change audited; nothing deleted, nothing shown by itself.
- **Shared calendar (252):** Website › Blog & journal › Shared calendar (`/admin/website/blog/shared`): the same calendar
  as Marketing › Calendar — articles beside plan lines, campaigns, ads, message sends, seasonal windows and festive
  cut-offs, day by day, with lane chips and search; social posts only while the social studio (S23, closed by the owner)
  is shown. Read-only.
- **What articles sold (253):** `@extas/metrics` `linesByArticle` — the order lines of the orders that read each article,
  Ordered value and Sales (delivered only), never added up across articles. Website › Blog & journal › What articles
  sold (`/admin/website/blog/sold`): 7/30/90 days, counts, the list by article with chips and search, a drawer with the
  products in the article or bought besides; amounts only with `reports.read`. Read-only.
- Guides: [website/blog-comments](docs/admin-guide/pages/website/blog-comments.md), [website/blog-shared](docs/admin-guide/pages/website/blog-shared.md),
  [website/blog-sold](docs/admin-guide/pages/website/blog-sold.md); tests `lib/journal/comments-model.test.ts`,
  `comments.db.test.ts`, `shared-calendar.db.test.ts`, `sold.db.test.ts`, `packages/metrics/src/article-lines.db.test.ts`.

**Built (PR 530, 547; 6 Nov, #89, After launch): seasonal pages that come back each year, the journal's main photo.**
Both pages are in the Lumen look; both switches ship off.
> নতুন (#89): মৌসুমি পাতা (ঈদ, পূজা, শীত …) প্রতি বছর নিজের তারিখে নিজে ফিরে আসে, তারপর আবার বিশ্রামে যায় — তারিখ আপনার; আর জার্নালের
> লেখার মূল ছবি দোকানের নিজের ছবি থেকে: আগে লেখার প্রোডাক্টের ছবি, তারপর ছবির লাইব্রেরি। ইন্টারনেটের ছবি কখনো নয়।
- **Each year (530):** Marketing › Landing pages › Seasonal pages › Each year (`/admin/marketing/landing/seasonal/yearly`):
  a "comes back each year" tick per seasonal page, the occasions' dates (this year's for Eid or Puja, every year for a
  season) and the switch card — `marketing.seasonalReturn` (registry v251, off; 14 days before, 2 days after). The shop
  shows a ticked, taken-down page live only inside its window; its resting page says when it is back. Nothing is written
  on a page's state; switch off or untick and every returned page rests again at once.
- **Main photo (547):** an article's Main photo page (`/admin/website/blog/<id>/photo`, the editor's "Main photo"
  button): the article's own product photographs first, then the photo library; no picture from a web address; a studio
  (AI-made) picture only while allowed and always labelled — `blog.images` (registry v252, off). Free-licence libraries
  (keys) and AI generation (S15, closed) are not built.
- Guides: [marketing/seasonal-yearly](docs/admin-guide/pages/marketing/seasonal-yearly.md),
  [website/blog-photo](docs/admin-guide/pages/website/blog-photo.md); tests `registry-seasonal-return.test.ts`,
  `seasonal-return-model.test.ts`, `seasonal-return.db.test.ts`, `registry-blog-images.test.ts`, `images.db.test.ts`.
- **Follow-up on PR 251 (#89):** the comment form's "limit" and "length" messages say "for now" and "between {min} and
  {n} characters" (slots), so no stale claim is left and the two copy-claims exceptions are gone.

**Built (PR 591, 592; 6 Nov, #91, After launch): house ads on the journal and the content pipeline.** Both pages are in
the Lumen look; both switches ship off.
> নতুন (#91): জার্নালে দোকানের নিজের বিজ্ঞাপন — ব্যানার, পণ্য, সেট বা ক্যাটাগরি — কোথায় দেখাবে (তালিকার উপরে, লেখার মাঝে,
> শেষে, পপআপ …), কত ক্লিক আর কত অর্ডার এল; Google থেকে আসা পাঠককে পপআপ দেখায় না। আর লেখার পাইপলাইন: আজ কতটা লেখা
> দরকার, কোনটা কোন ধাপে আটকে আছে, কোনটা হালনাগাদ দরকার। AI দিয়ে লেখা S15 খুললে।
- **House ads (592):** Website › Blog & journal › House ads (`/admin/website/blog/ads`, one ad at `…/ads/<id>`): banner,
  product, set or category ads in both languages with dates and weight; places — list top, topic, between cards, after
  paragraph N, article end, popup (trigger and cap), slim bar, sidebar; new ones start off, set aside never deleted.
  Clicks through `/api/shop/house-ad` (nofollow sponsored); an order within the credit window is credited to the place
  (`kpiByHouseAdPlace`). `blog.houseAds` (registry v253), migration `0171_house_ads`. ~~Not built: tags, author pages,
  search, RSS, impression counts.~~ Views counted per place since #92 (below).
- **Content pipeline (591):** Website › Blog & journal › Content pipeline (`/admin/website/blog/pipeline`): today's pace
  and why, the journal's health, where every topic and article is, days ready ahead, what to write next, stuck steps
  (a writer never passes his own), articles due a refresh; while on, the calendar fills at the start pace, then the full
  pace only while healthy. `blog.pipeline` (registry v254). AI writing waits for S15.
- **PR 251 follow-ups (#91):** erasing a customer clears his journal comments (name and words gone, the row archived);
  a shown or hidden comment reaches the article on its next view (no page cache keeps an article; a test guards it);
  the Comments page's back link is a 44 px tap at every width.
- Guides [website/blog-ads](docs/admin-guide/pages/website/blog-ads.md), [website/blog-ad](docs/admin-guide/pages/website/blog-ad.md),
  [website/blog-pipeline](docs/admin-guide/pages/website/blog-pipeline.md).

- **Follow-ups (#92):** the journal as a full section (592) — tags with their own pages, author and reviewer pages,
  the journal's search and its RSS feed (`blog.journal` v257, each off; migration `0172_blog_reviewer_tags`); house ad
  views per place and the click rate (v258 `countViews`, off; migration `0173_house_ad_views`); the House ads pages'
  card text at 14 px. The article's language switch lands on the twin article's own link (249).

Planned — see register PRs ~~239–253~~ ~~246–253~~ ~~251–253~~ ~~530, 547~~ ~~591, 592~~ 529, 593 (AI writing, wait for S15): [S12](docs/MASTER-REGISTER.md#s12--content--blog--pr-239253).

### S13 · Marketing & ads — In progress (34/35)

**Built (PR [257](docs/stages/S13.md#pr-257); 31 Oct, CN-031 lane B; not deployed yet): server-side event tracking.**

> নতুন (PR 257): দোকানের সার্ভার নিজে Meta, Google আর TikTok-কে জানায় কে পণ্য দেখল, ব্যাগে নিল, চেকআউট খুলল আর অর্ডার দিল — বিজ্ঞাপন ঠিক মানুষের কাছে যায়। চাবি দিয়ে পরীক্ষা পাস না হওয়া পর্যন্ত কিছু বাইরে যায় না; কারো নাম, ঠিকানা বা ফোন খোলা অবস্থায় যায় না। শুরুতে বন্ধ।

- **Events:** a product page seen and the checkout opened (a same-site beacon, `/api/shop/track`, counted in the proxy's
  report bucket), an item put in the bag and an order placed (event id `purchase-<number>`, never counted twice on a
  replay). Prices, value, category, colour and size are read on the server, never from the browser; every hook is quiet
  (one cached setting read while off, errors caught, the send after the answer).
- **Privacy:** `TrackedEvent` (migration `0067_tracked_events`), one row per event id per store with the delivery state per
  platform. Only hashes leave: the visitor/customer id; the order's phone and e-mail only while customer matching is on
  (off), a gift's receiver never. No name, address or IP address.
- **Platforms:** Meta Conversions API, Google Analytics 4 Measurement Protocol and TikTok Events API (`packages/adapters/src/ads`),
  each a Keys & connections row with its Test; on the mock until a key is in and its test passes; no key in any address or
  error. A failed send is tried again with the next event, up to the owner's number of attempts.
- **Screen:** **Marketing › Tracking** (`/admin/marketing/tracking`; `ads.tracking.read`, changes `ads.tracking.manage`):
  each platform's connection, recorded counts for 7 and 30 days, sent per event and platform, waiting events with "Send
  waiting now", "Send test event" (each platform's test mode, never counted), the newest events and the settings card;
  audited.
- **Settings:** registry v85 (`registry-tracking.ts`): `ads.tracking` — the switch (off), the events, the platforms (none
  ticked), customer matching (off), attempts.
- **Guide:** [`docs/admin-guide/pages/marketing/tracking.md`](docs/admin-guide/pages/marketing/tracking.md).
- **Tests:** `packages/adapters/test/ads.test.ts`, `apps/web/src/lib/tracking/model.test.ts`, `tracking.db.test.ts`
  (PostgreSQL), `edge-gate.test.ts`; smoke check and device gate. Later: the delivered-order event (PR 258), the richer
  stage events (PR 532), the masking layer (PR 311) and a browser pixel sharing the event ids.
- **Where an order came from (1 Nov, #75, PR 257 follow-up, go-live gate customer 360°):** UTM tags and fbclid / gclid /
  ttclid of a tagged shop page are kept in one first-party HttpOnly cookie (`__Host-extas_src`; only the link's tags and
  the referring site, no personal data) and written on the order (`utmSource`, `utmMedium`, `utmCampaign`, `adPlatform`);
  price, discount and COD unchanged; a Facebook click without the pixel's `_fbc` still reaches the Conversions API with
  its click id. Setting `ads.attribution` (registry v230, on as shipped, B3.10): days a visit counts (30, 1–90), the
  latest or the first visit; card "Where an order came from" on Marketing › Tracking (audited). Tests: the cookie and
  visit rules, the proxy, the checkout row, the checkout API on and off, the admin card, the fbc on PostgreSQL.

**Built (PR [254](docs/stages/S13.md#pr-254)–256, 258–261; 1 Nov, #78, After launch): landing pages, campaigns,
delivered purchases and the ad platforms read.** No money moves, no ad budget changes, no price, discount or order is
written here; `marketing.landing` (v168) and `ads.deliveredPurchase` (v169) ship off; migrations `0120_landing_pages`,
`0121_campaigns`; permissions `marketing.landing.read/write`, `marketing.campaigns.read/write`.
> নতুন (#78): বিজ্ঞাপনের জন্য ল্যান্ডিং পেজ (একটা পণ্য, অফার আর পাতাতেই অর্ডার; তৈরি টেমপ্লেট থেকে শুরু), ক্যাম্পেইনের খাতা (বাজেট শুধু পরিকল্পনা, শুরু হলে লক), ডেলিভারি হওয়া অর্ডার বিজ্ঞাপনের প্ল্যাটফর্মকে জানানো, আর Meta, TikTok, Google-এর বিজ্ঞাপন শুধু পড়া (চাবি না দেওয়া পর্যন্ত অনুশীলন)। কিছুই বন্ধ বা বাজেট বদল হয় না।
- **Landing pages (254, 255):** Marketing › Landing pages (`/admin/marketing/landing`), the builder with the eight parts
  of demo V12.4 in a fixed order, Templates (four ready-made and the owner's own) and the parts library; Publish behind a
  confirm, archive and restore; the shop page `/l/<link>` (noindex, an order box); an order keeps the page and the
  source LANDING_PAGE.
- **Campaigns (256):** Marketing › Campaigns (`/admin/marketing/campaigns`) — audience, offer, creative, window, the
  planned budget (locked once started; a live change goes through PR 268), its landing pages and the orders they brought.
- **Delivered purchases (258):** each order's confirmation and delivery go once to Meta, Google and TikTok, valued at the
  pieces kept; the owner may say a purchase means the delivery; a card on Marketing › Tracking.
- **Ad platforms (259–261):** Marketing › Ad platforms (`/admin/marketing/ad-platforms`) reads Meta, TikTok and Google
  ads (accounts, campaigns, ad sets / ad groups), kept and tied to our campaigns; a practice account until each key's
  Test passes; read only.
- Guides: [landing](docs/admin-guide/pages/marketing/landing.md), [landing-builder](docs/admin-guide/pages/marketing/landing-builder.md),
  [landing-templates](docs/admin-guide/pages/marketing/landing-templates.md), [campaigns](docs/admin-guide/pages/marketing/campaigns.md),
  [campaign](docs/admin-guide/pages/marketing/campaign.md), [ad-platforms](docs/admin-guide/pages/marketing/ad-platforms.md),
  [tracking](docs/admin-guide/pages/marketing/tracking.md).

**Built (PR [262](docs/stages/S13.md#pr-262)–264; 5 Nov, #80, After launch): audiences.** Nothing is sent to an ad
platform while `ads.audiences` (v170) is off, and then only practice copies until each key passes its Test; no budget or
campaign is touched; `ads.refusedExclude` and `ads.audienceRefresh` (v171) off; migrations
`0122_audience_sync_lookalike`, `0123_audience_exclusion_one`; permissions `marketing.audiences.read/write`.
> নতুন (#80): আসল কেনাকাটা দেখে বিজ্ঞাপনের অডিয়েন্স বানানো (সংখ্যা সাথে সাথে), ডেলিভারি হওয়া বিক্রি থেকে lookalike, আর পার্সেল ফেরত দেওয়া মানুষদের বিজ্ঞাপন থেকে বাদ রাখার তালিকা — সব সুইচ বন্ধ অবস্থায়।
- **Audience Builder (262):** Marketing › Audiences (`/admin/marketing/audiences`) — conditions from real behaviour, kept
  or left out, the live count, saved, archived and restored; a campaign picks one.
- **Lookalikes (263):** the seed is everyone delivered in the owner's last N days, weighed by delivered sales; "Send now"
  sends hashed phone numbers to Meta, TikTok and Google.
- **Refused-parcel exclusion (264):** one "Refused a parcel (leave out)" audience per store, sent as a list to leave out,
  never a block; every live audience refreshed once a day (job `audiences.refresh`).
- Guides: [marketing/audiences](docs/admin-guide/pages/marketing/audiences.md), [marketing/audience](docs/admin-guide/pages/marketing/audience.md).

**Built (PR [265](docs/stages/S13.md#pr-265)–269; 6 Nov, #81, After launch): ad spend, cost per order, campaign
controls and the growth agent.** Every switch is off; settings registry v172–v175 (`registry-ads-spend.ts`,
`registry-ads-alerts.ts`, `registry-ads-control.ts`, `registry-ads-growth.ts`); no migration; permissions
`marketing.ads.control`, `marketing.ads.approve`; job `ads.spend.import`. Practice copies only: no real budget or campaign
is changed.
> নতুন (#81): Meta, TikTok আর Google-এর প্রতিদিনের খরচ আনা, ডলারের খরচ আপনার রেটে টাকায়, প্রতি অর্ডার আর প্রতি ডেলিভারির খরচ আর তার সতর্কবার্তা, ক্যাম্পেইন থামানো বা বাজেট বদল (বাড়ানো শুধু আপনার অনুমতিতে), আর AI growth agent-এর প্রস্তাব — সব বন্ধ অবস্থায় আসে।
- **Spend import (265):** `ads.spendImport` (3 days) — each campaign's spend, views, clicks and the platform's purchases per
  day into `AdSpendDaily`, a day replaced when read again; "Import spend now" and a spend column on Marketing › Ad
  platforms; a daily import at the owner's hour.
- **USD rate (266):** the rate typed on Money › Costs & fees turns dollar spend into taka with that day's rate
  (`lib/exchange-rate.ts`); Ad platforms shows the rate or that none is typed.
- **Cost per order and alerts (267):** `ads.costAlerts` — cost per order placed and per delivered order for the shop, each
  platform and campaign; the owner's rules (off when added, never deleted) sent to his Telegram after the daily import.
- **Campaign controls (268):** `ads.campaignControl` (48 hours) — a "Change" fold per campaign; pause or lower after a
  confirm box; resume or raise waits for a person with "Approve ad budget increases".
- **Growth agent (269):** `ads.growthAgent` (every proposal kind off at 0) — Marketing › Ad platforms › Growth agent
  (`/admin/marketing/ad-platforms/growth`): delivered ROAS by campaign, product and district, campaigns spending with no
  delivered order, and proposals waiting once for approval.
- Guides: [marketing/ad-platforms](docs/admin-guide/pages/marketing/ad-platforms.md), [marketing/ad-growth](docs/admin-guide/pages/marketing/ad-growth.md),
  [money/fees](docs/admin-guide/pages/money/fees.md).

**Built (PR [270](docs/stages/S13.md#pr-270)–273; 6 Nov, #82, After launch): creative briefs, the coupon engine,
coupon distribution and the referral programme.** Every switch is off and no amount is set anywhere; settings registry
v176–v178 (`registry-ads-brief.ts`, `registry-coupons-distribution.ts`, `registry-referrals.ts`); migration
`0124_referral_uses`.
> নতুন (#82): পণ্য থেকে বিজ্ঞাপনের ব্রিফ; কুপন এখন যেকোনো অফারের রূপে (টাকা বা শতাংশ ছাড়, ফ্রি ডেলিভারি, একটা কিনলে একটা); কুপনের সীমা, লিংকে কুপন আর একবার-ব্যবহারের কোড; বন্ধুকে আমন্ত্রণ কোড আর ডেলিভারির পরে আপনার অনুমতিতে পুরস্কার। সব শুরুতে বন্ধ, কোনো টাকার অঙ্ক বসানো নেই।
- **Creative briefs (270):** `ads.creativeBrief` (v176, off) — Marketing › Ad platforms › Creative briefs (`/admin/marketing/ad-platforms/briefs`): a brief
  from a product (and a campaign): the offer from live prices, the formats (4:5, 1:1, 9:16), a hook in Bengali and English,
  the landing page and what the ads brought back; an approved growth-agent "refresh the creative" proposal is written up
  once; "Send to the studio" or "Set aside" after a confirm; no price, budget or campaign changes.
- **Coupon engine (271):** a code unlocks any offer shape that asks for one — fixed or percentage off, free delivery, buy
  some get some, a percentage from a few pieces, a set price — each a rule template (templates v2), so a new shape needs
  no new code; who may use it stays per coupon; the bag says "add N more pieces" and "free delivery" in words (SIM-F-009:
  a guest's public codes work, a members-only one refuses him in words).
- **Distribution and limits (272):** `rules.coupons.distribution` (v177, both parts off) — limits, who and the window
  changed from the coupon's row (never below the uses made; while on, that is the owner's OK); a code in a link
  (`/bag?code=…`, "Copy link"); "Make single-use codes" in a batch, all off, switched on together with his OK and
  downloaded as a CSV.
- **Referral programme (273):** `referrals.programme` (v178, off, no rule, no reward) — a signed-in customer's invite code on
  My account › For you (Copy, Share on WhatsApp); a friend's first order gets the Smart Rule the owner picks; a number that
  ordered before and the customer's own code are refused in words; Marketing › Referrals (`/admin/marketing/referrals`):
  codes, friends' orders, delivered, and "Give reward" into the sharer's wallet once after a confirm, only with the wallet
  permission.
- Guides: [marketing/ad-briefs](docs/admin-guide/pages/marketing/ad-briefs.md), [marketing/rules](docs/admin-guide/pages/marketing/rules.md),
  [marketing/referrals](docs/admin-guide/pages/marketing/referrals.md); DB tests in rules, the bag and checkout, the web API.

**Built (PR [274](docs/stages/S13.md#pr-274)–279; 6 Nov, #83, After launch): incomplete orders, the two follow-up
ladders, the campaign to a group, YouTube and SEO outreach.** Every switch ships off and no offer or code is chosen;
settings registry v179, v210–v214 (`registry-incomplete.ts`, `registry-follow-up.ts`, `registry-cart-recovery.ts`,
`registry-blast.ts`, `registry-youtube.ts`, `registry-outreach.ts`); migrations `0125_checkout_draft_follow_up` –
`0129_outreach_pipeline`.
> নতুন (#83): অসম্পূর্ণ অর্ডারের তালিকা; চেকআউট বা ব্যাগ ছেড়ে যাওয়া কাস্টমারকে সর্বোচ্চ দুইটা মেসেজ; দলকে একসাথে মেসেজ; YouTube আর SEO outreach।
- **Incomplete orders (274):** `orders.incomplete` (v179, keeping off, left after 30 minutes) — Orders › Incomplete orders
  (`/admin/orders/incomplete`): checkouts with a typed number and no order, hottest first, with the bag and its worth and
  the visit's campaign tags; WhatsApp or call, "Given to me", handled with a note and reopened (audited); failed or
  unanswered prepaid orders beside them; bags with no number only counted; All orders' "Incomplete" chip; the nightly
  privacy run wipes the typed words after the kept days. Nothing messages anyone.
- **Checkout follow-up (275):** `orders.followUp` (v210, off) — one reminder about an hour later by WhatsApp or SMS, only
  on a way he said yes to offers on, with a link that puts his exact bag back (`/api/bag/back/<code>`); then one offer only
  when the owner picks a live code (`rules.approve`); two messages per checkout, ever; never after an order, a stop or
  "handled". Templates `checkout.followUp`, `checkout.followUpOffer` in the default pack.
- **Left-bag recovery (276):** `orders.cartRecovery` (v211, off) — a signed-in customer's left bag: one reminder about two
  hours later and, with the owner's live code, one offer under the offer rules (the bag's minimum, one recovery offer per
  customer in the days, the code's own checks); two messages per bag, one ladder per number across both follow-ups;
  templates `cart.recovery`, `cart.recoveryOffer`; the left-bag card on Orders › Incomplete.
- **Campaign to a group (277):** `customers.blast` (v212, off; everyone not allowed) — Messages › Campaigns › "a campaign
  to a group": one SMS or WhatsApp from a shop template to a saved segment, the reach shown step by step with the
  estimated cost, scheduled only by a person with `messages.campaigns.send`; the shared throttle and every offer rule
  (yes, stop, quiet hours, weekly cap); "E-mail campaign" opens Messages › E-mail.
- **YouTube (278):** `marketing.youtube` (v213, off) — Marketing › YouTube (`/admin/marketing/youtube`): the channel and
  videos by their links, the products each video shows with a tracked link for its description, and the orders each video
  brought (placed, delivered, delivered value); set aside, never deleted; nothing is posted to YouTube; views and uploads
  wait for the YouTube key.
- **SEO outreach (279):** `marketing.outreach` (v214, off, follow-up after 7 days) — Marketing › SEO outreach
  (`/admin/marketing/outreach`, More options): the websites asked for a link, found → asked → answered → link live or said
  no, "follow up due" on top; "Write to them" is only a mailto: link from the owner's pitch, nothing is sent or fetched by
  the shop.
- Guides: [orders/incomplete](docs/admin-guide/pages/orders/incomplete.md), [orders/all](docs/admin-guide/pages/orders/all.md),
  [messages/campaigns](docs/admin-guide/pages/messages/campaigns.md), [messages/campaign](docs/admin-guide/pages/messages/campaign.md),
  [marketing/youtube](docs/admin-guide/pages/marketing/youtube.md), [marketing/outreach](docs/admin-guide/pages/marketing/outreach.md);
  DB tests in orders, messages, cart and the web API.

**Built (PR [280](docs/stages/S13.md#pr-280)–283, 531, 532; 6 Nov, #84, After launch): the seasonal home page, festive
cut-off words, the marketing calendar, the marketing report, new ad campaigns with the owner's approval and the deep
conversion feed.** Every switch ships off; settings registry v215–v219 (`registry-seasonal-home.ts`,
`registry-festive-cutoff.ts`, `registry-marketing-calendar.ts`, `registry-marketing-report.ts`, `registry-ads-builder.ts`)
and v232 (`registry-conversion-feed.ts`); migrations
`0160_seasonal_home`, `0161_marketing_calendar`, `0162_campaign_builder`.
> নতুন (#84): সময় ধরে মৌসুমি হোম পেজ (শেষে নিজে ফেরে); উৎসবের আগে অর্ডারের শেষ সময় হোম, পণ্য আর চেকআউটে; এক ক্যালেন্ডারে সব মার্কেটিং;
> কত খরচ আর কত বিক্রি (চ্যানেল আর ক্যাম্পেইন ধরে); নতুন বিজ্ঞাপন ক্যাম্পেইন — চালু হয় শুধু আপনার অনুমোদনে;
> বিজ্ঞাপনের প্ল্যাটফর্মে পাঠানো অর্ডারের খবরে কুরিয়ারের ফল আর কাস্টমারের আগ্রহ (কারো নাম-ফোন-ঠিকানা কখনো না)।
- **Seasonal home (280):** `marketing.seasonalHome` (v215, off) — Marketing › Seasonal home (`/admin/marketing/seasonal`):
  save the home page as a named look ("Eid 2027"), change its sections, hero lines and hero collection, and schedule it
  for a window on the shop's clock (no overlaps); inside the window the home page draws with the look, after it (or
  "Stop") the owner's own home settings again, which are never written; looks set aside, never deleted.
- **Festive cut-off (281):** `marketing.festiveCutoff` (v216, off; home, product and checkout ticked) — Marketing ›
  Festive cut-off (`/admin/marketing/festive`): the festive Smart Rules' "order by … for delivery before the festival"
  words on the home page (with a clock), under the product's stock line and at checkout and the thank-you page, where a
  band past its time shows the "after" words in place of the usual hours; dates and words stay in Smart Rules.
- **Marketing calendar (282):** `marketing.calendar` (v217, off, 60 days) — Marketing › Calendar
  (`/admin/marketing/calendar`, More options): one day-by-day calendar of campaigns, landing pages, ad campaigns,
  message sends, seasonal home windows, festive cut-offs, blog and social posts, with lane chips and "At a glance" bars
  (also a card on Marketing › Campaigns); it never starts, sends or changes any of them; the owner's own plan lines are
  the only thing written, never deleted.
- **Marketing report (283):** `marketing.report` (v218, off; up to 366 days, results within 7 days) — Marketing › Report
  (`/admin/marketing/report`, More options): for any period, Ordered value and Sales (delivered) apart, by channel with
  each ad platform's spend and delivered ROAS, by campaign, and per message send with its cost and the orders it
  brought; every figure from `@extas/metrics` `marketingReport`; read-only.
- **New campaigns (531):** `ads.campaignBuilder` (v219, off; only `marketing.ads.approve` changes it) — Marketing › Ad
  platforms › New campaigns (`/admin/marketing/ad-platforms/campaigns`): write a platform campaign as a draft (account,
  campaign, objective, daily budget, start and end), duplicate one, set drafts aside; "Launch…" only asks — the owner
  approves it in his queue, then the platform's writer creates it (the practice writer sends nothing until a key with
  campaign-write rights); each campaign's "Change" fold gains "Schedule" (waits for the owner too) and "Duplicate".
- **Deep conversion feed (532):** `ads.conversionFeed` (v232, off; rides on `ads.tracking` and `ads.deliveredPurchase`) —
  new server events from the order timeline: shipped and returned to every ticked platform, and the "qualified sale"
  (delivered, or with the courier untouched for the owner's hours, held back when cancelled, flagged or blocked) as the
  purchase on the platforms ticked as generous (Meta as shipped), so one order is never two purchases; every order event
  carries the courier outcome and the visitor's intent (channel, campaign, landing page, products seen, bag adds), never a
  name, address, phone or e-mail; the "Deep conversion feed" card on Marketing › Tracking.
- Guides: [marketing/seasonal-home](docs/admin-guide/pages/marketing/seasonal-home.md), [marketing/festive](docs/admin-guide/pages/marketing/festive.md),
  [marketing/calendar](docs/admin-guide/pages/marketing/calendar.md), [marketing/report](docs/admin-guide/pages/marketing/report.md),
  [marketing/ad-campaigns](docs/admin-guide/pages/marketing/ad-campaigns.md), [marketing/tracking](docs/admin-guide/pages/marketing/tracking.md); DB tests for the seasonal home, festive
  cut-offs, the calendar, the report, the campaign builder, the conversion feed and `@extas/metrics` `marketingReport`.

**Built (PR 569, 589; 6 Nov, #91, After launch): where to advertise, and the Merchant Center feed.** Both pages are in
the Lumen look; both switches ship off; neither spends or changes anything on an ad platform.
> নতুন (#91): কোন জেলায় বিজ্ঞাপন বাড়ানো ভালো, কোথায় কমানো — আসল ডেলিভারি আর ফেরতের হিসাব থেকে পরামর্শ, ইংরেজি আর বাংলায়
> তালিকা কপি করে বিজ্ঞাপনে বসানো যায় (নিজে থেকে কিছু বদলায় না)। আর Google Merchant Center-এর জন্য পণ্যের তালিকা (feed) —
> ঠিকানাটা Merchant Center-এ বসালেই হয়; বাংলাদেশে পরীক্ষাটা লাইভের পরে আপনার কাজ।
- **Where to advertise (569):** Marketing › Where to advertise (`/admin/marketing/geo-guide`, More options): for the last
  N shop days, the shop or one category, each district's delivered and returned orders, return rate and (with
  `books.read`) sales; with the card on, a word per district (more, hold, less, too few) and the more / less lists in
  English and Bengali. Advice only (hard rule 6). `ads.geoGuide` (registry v255).
- **Merchant feed (589):** `/feeds/merchant.xml`, only while on and only on the shop's own domain: every published product
  of a shown category with Google's fields; products without photo, price or description are left out and counted.
  Marketing › Merchant feed (`/admin/marketing/merchant-feed`): the address, counts, reasons, the first products, the
  Bangladesh test steps. ~~One item per product (no per-size or colour items yet).~~ Items per size and colour since #92 (below). `ads.merchantFeed` (registry v256).
- Guides [marketing/geo-guide](docs/admin-guide/pages/marketing/geo-guide.md), [marketing/merchant-feed](docs/admin-guide/pages/marketing/merchant-feed.md).

- **Follow-ups (#92):** Seasonal home (280) — bell notes when a window starts or ends (v249, off), one locked
  transaction per save, home looks never handled by Launch default; the festive cut-off (281) reaches the order's late
  flag, the receipt's promise and the bag (an order past the cut-off is never late, so it is not an apology-credit
  candidate either, as after Eid; no money moves); the marketing report's CSV, the spend over every send, the sends
  paged (283; the split by product or district stays open); the calendar names a plan line's campaign and has a month
  grid (282); the deep conversion feed (532) reads the whole window, keeps an event's extra data from its first send
  (migration 0174), withdraws GA4's purchase on a return (v261, off) and can share its event ids with a browser pixel
  (v262, off); the delivered-purchase run reads the whole window too (258); the Merchant feed (589) lists items per
  size and colour (v259, off), the struck price, gender and age group (v260, off and empty).
- **Follow-ups (#93):** the festive cut-off line never names another area's later time — the short words only when they
  name every band the line speaks for (281; words only); the calendar's bars view at 14 px (282).
- **Follow-ups (#94):** the worker sweeps tracked events still waiting once an hour, a real event never goes to a
  platform unticked since, and the purchase event goes at placement only for cash on delivery with nothing to pay
  first, else from the gateway callback that makes the order PAID (257); the bag is read for the signed-in customer
  (273); a link preview robot on the bag-back link gets no bag, and the unfinished checkout's offer goes only while its
  code is usable now (275).
- **Follow-ups (#96):** a saved seasonal look previewed on the home page for staff before its window, and a look brings
  only what its editor changes (280); a payment recorded by a person or found by the sweep sends the purchase event
  once (257, follow-up 723).

Planned — see register PRs ~~254–256, 258–283~~ ~~262–283~~ ~~265–283~~ ~~270–283~~ ~~274–283~~ ~~280–283, 531–532~~ ~~569, 589~~ 548 (AI study of outside pages, waits for S15): [S13](docs/MASTER-REGISTER.md#s13--marketing--ads--pr-254283).

### S23 · Social & content studio — In progress (4/7, reopened CN-039)

> **খোলা হয়েছে (CN-039, ১১ নভেম্বর):** owner-এর go-live নোট এই স্টেজের বন্ধ রাখা তুলে দিয়েছে। পর্যায়ক্রমে, এক PR করে করে বানানো হচ্ছে।

> নতুন (PR 437): সোশ্যাল পেজ/চ্যানেল যুক্ত করার জায়গা তৈরি — ফেসবুক, ইনস্টাগ্রাম, টিকটক, ইউটিউব পেজ যুক্ত করা যায়, নাম বদল, চালু/বন্ধ, দৈনিক পোস্ট সীমা, আর্কাইভ/ফেরানো। নতুন পেজ সবসময় বন্ধ থাকে আর অনুমোদন লাগবে — কিছুই নিজে থেকে পোস্ট হয় না। কোনো রো কখনো মোছা হয় না; প্রতিটা বদল লগ হয়।

> নতুন (PR 438): স্টুডিওর প্রথম অ্যাডমিন পেজ (`/admin/marketing/studio`) — PR 437-এর সোশ্যাল অ্যাকাউন্ট এখন দেখা আর বদলানো যায়, সাথে নতুন **ব্র্যান্ড অ্যাসেট লাইব্রেরি** (লোগো, ওভারলে, ইন্ট্রো/আউট্রো, গান — প্রোডাক্টের ছবি থেকে আলাদা, কখনো মেশে না) আর **টেমপ্লেট** (পোস্টের গঠন: ধরন, আকার, লম্বা কত সেকেন্ড)। পাতাটা মালিকের মেনুতে এখনো দেখানো হয় না (পুরো স্টেজ শেষ না হওয়া পর্যন্ত), কিন্তু ঠিকানা সরাসরি খুললে কাজ করে।

> নতুন (PR 439): পাতায় চতুর্থ অংশ **"তৈরি হওয়া কনটেন্ট"** — একটা টেমপ্লেট আর কিছু প্রোডাক্টের আইডি দিয়ে একটা তৈরির কাজ জমা দেওয়া যায়, তারপর **তৈরি করুন** চেপে চালানো যায়। আজকের ফল সৎভাবে একটা **প্রিভিউ মাত্র**: প্রোডাক্টের নিজের আগের ছবিটাই দেখায়, নতুন কোনো ছবি/ভিডিও এখনও বানানো হয় না (আসল ওভারলে-ক্যাপশন বসানো আর ভিডিও বানানো পরের PR-এ আসবে, যখন সার্ভারে আসল রেন্ডার ইঞ্জিন বসবে)। কোনো প্রোডাক্টের ছবি না থাকলে কাজটা "তৈরি করা যায়নি" দেখায়, মিথ্যা সাফল্য দেখায় না।

> নতুন (PR 440): ফেসবুক পেজ আর ইনস্টাগ্রামে পোস্ট করার প্রথম ভাগ — পাতায় পঞ্চম অংশ **"পোস্ট"**। তৈরি হওয়া কাজ আর অ্যাকাউন্ট বেছে পোস্ট জমা দেওয়া যায়; নতুন অ্যাকাউন্টে এটা **অনুমোদনের অপেক্ষায়** থাকে (কিছুই নিজে থেকে পোস্ট হয় না), আর অ্যাকাউন্টটা "নিজে নিজে চলতে" দেওয়া থাকলে সরাসরি **পোস্ট করুন** চেপে পাঠানো যায়। আসল পোস্ট পাঠাতে Keys & connections-এ আসল টোকেন বসিয়ে টেস্ট পাস করতে হয় — তার আগে সবকিছু নকল মোডে চলে। টিকটক/ইউটিউব অ্যাকাউন্টে পোস্ট করা এখনও সাপোর্ট করে না (পরের PR)।

**Built (PR 437): the studio core — social accounts.** New package `@extas/studio`; no migration (the `SocialAccount`
table has been in the schema since S00's full skeleton); settings registry v281 (`packages/settings/src/registry-studio.ts`,
group `marketing`, scope `store`).
- **Accounts:** one row per platform (`facebook`, `instagram`, `tiktok`, `youtube`) and its page/channel id, unique per
  store; added always `enabled: false`, `requireApproval: true`, `directPostApproved: false`, no daily limit. Rename,
  switch on/off, set a daily limit (1–500 or none), archive/restore — archiving also switches a page off. A stale save
  (wrong version) is refused; nothing is ever hard-deleted.
- **Settings (v281):** `studio.content` — daily posts (0–20) and reels (0–10), active weekdays, all off/empty by
  default (CN-018: nothing is generated until the owner sets a number); `studio.voice` — tone, hashtag set, blocked
  words, all empty; `studio.ai.captions` off.
- **Permissions:** `studio.read`, `studio.write`, `studio.generate`, `studio.approve`, `studio.publish` — nothing posts
  to a real account or spends anything without them.
- **Tests:** the package on PostgreSQL (add, duplicate refused per platform, switch/rename/limit/archive/restore,
  stale save, unknown id, reader-vs-writer-vs-no-permission, input validation); the settings registry's own test.

**Built (PR 438): the studio's first admin page, templates and the brand asset library.**
- **Templates** (`@extas/studio/templates.ts`, the `StudioTemplate` table already in the schema): kind (image post,
  story, reel, short), name, a spec (aspect ratio, a reel/short's length, up to 10 brand-asset ids each checked
  against the library), versioned (bumped on every change so a later render job can pin the exact shape it used),
  archive/restore, never deleted.
- **Brand asset library** (`assets.ts`): reuses the shared Media library's own files, now filed under a new private
  folder `studio` (added to `@extas/media`'s `PRIVATE_MEDIA_FOLDERS`) — a brand asset never shows as a product photo
  and a product photo never shows here. Naming a file's kind (logo, overlay, brand frame, intro, outro, royalty-free
  track) is `studio.write`; archiving/restoring one goes through the Media library's own functions, so it also needs
  `media.manage`; uploading one goes through the shared `/api/admin/media` (so also needs `media.upload`).
- **Admin page** `/admin/marketing/studio` (tab `marketing.studio`; `studio.read` to see, `studio.write` to change):
  the social accounts from PR 437 alongside the new templates and brand assets, one page. Hidden from the admin menu
  by `stages.closedShown.S23` until the whole stage is finished (built pages still work at their address).
- **Tests:** `templates.db.test.ts` and `assets.db.test.ts` on PostgreSQL (version bumps, archive/restore never
  deletes, an unknown brand asset in a spec is refused, a reader cannot write), plus `studio.db.test.ts` in the web
  app exercising the whole page end to end through its API.

**Built (PR 439): the video assembly engine.** `@extas/studio/render.ts` (no migration — `SocialRenderJob` and
`BackgroundStatus` were already in the full S00 schema).
- **Queueing (`studio.generate`):** `queueSocialRender` turns a template plus a chosen, ordered list of products into
  a pure `RenderPlan` — scene order, the template's own brand assets grouped by kind, the owner's own caption — and
  saves a `SocialRenderJob` row (`QUEUED`). Refuses up front: an empty product list (`NO_PRODUCTS`), an archived
  template (`TEMPLATE_ARCHIVED`), or a product/template not in this store (`NOT_FOUND`).
- **Running:** `runSocialRenderJob` runs a `QUEUED` job once (`WRONG_STATE` refuses a second run). Honest scope per
  Blueprint C5.2 ("not by generating footage with a video model … template-based assembly from our own photos"):
  there is no video provider to mock here, because this is the server's own future compositor, not a keyed
  third-party integration. Until that compositor exists, every job finishes as a **preview** — its output is simply
  the first featured product's own live lead photo (`ProductMedia.isPrimary`) — a real asset, never a fabricated
  one — or `FAILED` with a plain reason when none of the chosen products has a photo yet.
- **Admin page:** a fourth section, "Generated content" (`StudioRenderForm`: pick a template, paste product ids,
  write a caption) plus a "Generate it" button per queued job and a thumbnail once it succeeds. `studioHandler`'s
  POST now needs `studio.write` for account/template/asset actions and `studio.generate` for `render.*`.
- **Tests:** `render.test.ts` (5, pure plan-builder — scene order, brand-asset grouping, duration only for
  reel/short) and `render.db.test.ts` (5, PostgreSQL — queue → run → preview output, a second run refused, no-photo
  failure, guard refusals, permission check), plus a new case in `studio.db.test.ts` exercising queue/run through
  the page's own API.

**Built (PR 440): publishing adapters — Facebook Page and Instagram, part 1.** New `@extas/adapters/src/social-publish`
(`defineAdapter`, kind `META`, modes `['LIVE']`, secrets `['pageAccessToken']`) plus `@extas/studio/publish.ts` and
`runtime.ts` (`studioPublisher()`, mirrors `@extas/media`'s own `createConnections` wiring).
- **Catalogue:** two new Keys & connections rows, `facebookPagePublish` and `instagramPublish` (both kind `META`,
  sharing it with the existing Conversions API and Ads rows, `exclusive: false`), each needing a Page access token
  plus a page id or IG business account id. Every account runs on the shared mock outbox until its own token passes
  a Test.
- **Queue/run (two-step, like PR 439's render job):** `queueSocialPost` (`studio.generate`) never calls the adapter —
  it only creates a `SocialPost` row at `PENDING_APPROVAL` (the owner's approval-first default) or `PUBLISHING` when
  the account is set to run free (needs `studio.publish` too). Refuses an unfinished render job, an off account, a
  TikTok/YouTube account (`NOT_SUPPORTED` — PR 441), or an empty caption. `runSocialPost` (`studio.publish`) actually
  posts the render job's photo — Facebook's single `/photos` call, Instagram's two-step container → publish — and
  sets `SUCCEEDED`/`FAILED` with the platform's own words on failure.
- **Admin page:** a fifth section, "Posts" (`StudioPostForm`: pick a finished render job and an account, an optional
  caption) with status pills and a "Post now" button shown only for a free account's `PUBLISHING` row.
- **Honest scope:** every post still only ever carries the one real photo PR 439's render job already produces — no
  fabricated image or video yet.
- **Tests:** `social-publish.test.ts` (4, adapter + catalogue), `publish.db.test.ts` (5, PostgreSQL — approval-first
  default, free-account run, adapter-failure wording, guard refusals, permission checks), plus a new case in
  `studio.db.test.ts` exercising queue/run through the page's own API.

Planned — see register PRs 441–443: [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604).

### S15 · AI 360 Control Room — In progress (7/48)

> **আবার খোলা (১১ নভেম্বর, CN-039):** ৬ নভেম্বর বন্ধ করা এই স্টেজ আবার খোলা হয়েছে (S17 ছাড়া)। যা বানানো আছে তা থাকবে; আধা-বানানো অংশ একটা সুইচ দিয়ে (Settings, `stages.closedShown`, শুরুতে বন্ধ) মেনু, sitemap, সার্চ আর robots থেকে লুকানো থাকে যতদিন পুরো স্টেজ শেষ না হয়।
> Reopened (owner, CN-039, 11 Nov 2026): built parts stay; half-built parts stay hidden by the `stages.closedShown` switch until the stage finishes.

**Built (PR 304; 11 Nov): AI 360 home screen.** AI › Control room (`/admin/ai`, `ai.read`/`ai.control`): the seven fixed agents (জ্ঞানী Gyani, প্রহরী Prohori, ভান্ডারী Bhandari, সওদাগর Sawdagor, শিল্পী Shilpi, দূত Doot, তীরন্দাজ Tirondaj) each as a card — on/off, working now (only once the master switch `ai.enabled` is also on), today's and this month's cost summed from `AiUsageLedger` in the store's own day/month, last activity from `AiDiaryEntry`; four summary tiles (running now, today's cost, this month's cost, the monthly cap); a pause/resume switch per agent, audited and reversible with Undo. No AI provider is wired yet, so cost and activity are honestly zero/empty, never invented.

**Built (PR 305; 11 Nov): master switch and per-agent keep-on.** The same screen now turns the business-wide `ai.enabled` master switch itself on or off (one tap, Undo, a money-safety note while no monthly cap is set), and each agent card gets its own "keep running even when AI is off" switch (`AiAgent.keepOnWhenMasterOff`) — a property of every agent, confirmed for Photoshoot but true for all seven. An agent works whenever it is on AND (the master is on OR it is kept on).

> **বাংলায়:** AI কন্ট্রোল রুম (`/admin/ai`): সাতটা নির্দিষ্ট এজেন্টের কার্ড — চালু/বন্ধ, কাজ করছে কি না, আজ-এই মাসের খরচ, সবশেষ কাজ, পজ বোতাম। চাবি না আসা পর্যন্ত খরচ সৎভাবে শূন্য। নতুন (PR 305): মেইন সুইচ এখান থেকেই চালু-বন্ধ, আর প্রতিটা এজেন্টের "AI বন্ধ থাকলেও চালু রাখুন" সুইচ।

**Built (PR 306; 11 Nov): multi-provider adapter.** The AI writer's practice-only adapter gets its first four live providers — Anthropic, OpenAI, Google and OpenRouter (`packages/adapters/src/ai-writer/`), one API key + one model id each in Keys & connections (several may be connected at once, like the payment gateways; no model name trusted as current — the owner types it). Every provider answers the exact same contract through one shared prompt-and-parse layer, so a draft reads the same whichever company wrote it; falls back to practice text until a connection's key and model are in and its Test passes. Free / OpenRouter-style models stay a hard no in production until PR 580 qualifies one; per-agent/per-job model choice is PR 307.

> **বাংলায়:** নতুন (PR 306): AI 360-এর লেখায় এখন চারটা সত্যিকার সেবা জুড়লো — Anthropic, OpenAI, Google আর OpenRouter — চাবি ও সংযোগ পাতায় একটা করে সারি। চাবি ও model না দেওয়া পর্যন্ত আগের মতোই অনুশীলনের লেখা হয়; ফ্রি model লাইভে ব্যবহার হয় না।

**Built (PR 307; 11 Nov): per-agent model selection.** Each agent card gets its own model picker (`AiAgent.selectedProvider`) — the practice writer plus the four PR 306 connections; a connection not yet keyed and Tested is listed but disabled, never pickable. Claude's own pick (the first ready provider, Anthropic first) is recommended by default with a "Recommended" pill; the note beside the select always says the true effect — matches the recommendation, or says honestly that cost/quality comparisons wait for the AI Cost Book (PR 312), never a number not yet measured. A stale pick whose connection goes dark or un-Tested quietly falls back to the practice writer, with its own note.

> **বাংলায়:** নতুন (PR 307): প্রতিটা এজেন্টের নিজের মডেল বাছাইয়ের ড্রপডাউন — প্র্যাকটিস রাইটার বা টেস্ট-পাস-করা একটা সরবরাহকারী। ক্লডের সুপারিশ করা পছন্দ একটা পিল দিয়ে দেখানো থাকে; বাছাই বদলালে নিচে সৎ নোট থাকে।

**Built (PR 308; 11 Nov): per-agent schedule.** Each agent card gets its own schedule (`AiAgent.schedule`, already in the schema, now wired): "always" (no time restriction, the default; most agents only act on their own event triggers, which this does not touch), "daily" at a chosen clock time, or "weekly" on chosen weekdays, all read in the store's own time zone. A plain next-run preview (`nextRunAt`) shows when a daily/weekly schedule would next fire; "always" honestly shows nothing to preview. No AI job runner reads a schedule yet — this is a preview only, built so it is ready the moment one exists, the same honestly-inert shape the master switch and model pick had before any AI key existed.

> **বাংলায়:** নতুন (PR 308): প্রতিটা এজেন্টের নিজের সময়সূচি — সব সময়, প্রতিদিন একটা সময়ে, বা সপ্তাহে কিছু দিনে। নিচে পরেরবার কবে চলবে তার একটা আন্দাজ দেখায়; সত্যিকারের চালানোর ব্যবস্থা এখনো আসেনি, তাই এটা শুধু একটা প্রিভিউ।

**Built (PR 309; 11 Nov): per-agent monthly spend cap, with the 80% warning and the 100% pause.** Each agent card gets its own monthly spend cap (`AiAgent.monthlyCapMinor`, already in the schema, now wired) — a plain amount in the store's own currency, empty is "no cap" (off, the default). A status pill shows none/ok/warned (80%+)/paused (100%+), compared with whole-number math so the 80% line is exact, never a float. Crossing 80% or 100% sends the owner's Telegram warning in Bengali (CLAUDE.md: the owner reads only চলতি বাংলা) the moment the Control room is next read — real and live, deduplicated through the audit log so a crossing is announced once per month, never once per page view; a Telegram hiccup never breaks the screen. At 100% new generations would pause (already-approved output stays live, the shop unaffected) — the worked example the Blueprint gives for Photoshoot, now true for all seven, the same widening PR 305 did for keep-on. The enforcement primitives (`agentCapState`, `wouldExceedCap`) are pure and tested, ready for the job dispatcher to call — none exists yet, the same honest gap PR 306/307/308 already note.

> **বাংলায়:** নতুন (PR 309): প্রতিটা এজেন্টের নিজের মাসিক খরচের সীমা — খালি রাখলে সীমা নেই। সীমার ৮০% ছুঁলে মালিকের Telegram-এ বাংলায় সতর্কতা যায়, ১০০%-এ নতুন কাজ থামার কথা পিলে দেখা যায় (এখনো কোনো জব-রানার না থাকায় বাস্তব কাজ থামার কিছু নেই, কিন্তু সতর্কতা সত্যিকারের পাঠানো, আন্দাজ নয়)।

**Built (PR 310; 11 Nov): data-class routing.** The Locked Blueprint A5.2 policy, in code (`apps/web/src/lib/admin-ai/data-classes.ts`): three data classes (personal, business, public/draft) and each fixed agent's own class. Personal and business work never effectively reaches OpenRouter (the one connection that can carry a free-tier model) even when the owner picks it and it is Tested-ready — the screen quietly routes to the cheapest ready paid connection instead and says why under that agent's model; public/draft work may use it as picked. Each agent card now shows its data-class pill, and a new "Which data may reach which model" card states the policy itself, read-only. Per-job tagging (finer than per-agent) arrives with the AI Cost Book (PR 312).

> **বাংলায়:** নতুন (PR 310): কোন তথ্য কোন AI মডেল পর্যন্ত যাবে তার নির্দিষ্ট নিয়ম। ব্যক্তিগত বা ব্যবসার তথ্য কখনো ফ্রি-সক্ষম সংযোগে যায় না — এজেন্ট তা বাছলেও পাতা নিজে থেকেই টাকা-দেওয়া সংযোগ ব্যবহার করে আর কারণ লেখে; প্রকাশ্য/খসড়া লেখায় ফ্রি-সক্ষম সংযোগ চলে।

Planned — see register PRs 311–341, 506, 577–585: [S15](docs/MASTER-REGISTER.md#s15--ai-360-control-room--pr-304341).

### S16 · Finance, costs & reports — Done (22/22)

~~Planned — see register PRs 347–355, 504, 536–537, 568~~ (built in #78, below; S16 is done) and, from CN-028, 615–618 (the ERP account ledger, the books match engine, the daily summary, fixed costs; design in [`docs/RETAIL-ERP-MODEL.md`](docs/RETAIL-ERP-MODEL.md)): [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604).

> **বাংলায়:** নতুন (PR 615): রিটেইল ERP-কে কত টাকা দেবে, তার নিজের খাতা — কোনো এন্ট্রি বদলায় না বা মোছে না, ERP-র হিসাবের
> সাথে এক টাকাও এদিক-ওদিক না; ERP-কে দেওয়া টাকা শুধু লিখে রাখা হয় (কোনো টাকা নড়ে না); পাইপলাইনে কত টাকার পিস, দোকানের নিজের রেকর্ড থেকে।

**Built (PR 615): Retail's ERP account ledger and the pipeline stock** (CN-028, CN-029 Phase 1; screen Money → Books →
ERP account, `/admin/money/books`; no migration, settings registry v68 `packages/settings/src/registry-books.ts`).
- **The ledger:** `ErpAccountEntry`, one entry per ERP event on the store's own link, append-only at the database and
  hash-chained (`verifyAccountChain` names the first changed entry): the bill when the parcel leaves (`ship:<consignment>`,
  once per order, at `erpTotal`; `recordBill` for PR 611, the account check books any billed order without one), return
  credits at the price paid, exchange extra / adjustment / bill / credit, payments, the switch transfer (`recordSwitchTransfer`
  for PR 619) and the opening balance (`importOpeningBalance`, once per link). A correction from the ERP is a REVERSAL entry plus
  the new effect (`<eventId>:new`), never an edit; an original already undone (`reversedBy`) is respected. The shop's balance
  (`balanceOn`, `ledgerBalance`) equals the ERP's with zero tolerance (tests on PostgreSQL).
- **The pipeline stock:** `ErpPipelinePiece` / `ErpPipelineMove` from the shop's own records — bill → courier result (PARTIAL:
  the ERP's identification, a correction moves it again) → hand-back → the ERP's check or the Hold resolution
  (WAITING_CHECK → DELIVERED when the customer kept it, PARCEL_MISSING → DECLINED). `pipelineOn(day)` reads any past day;
  `pipelineFlows` gives the books match (PR 616) goods and return losses.
- **Paid to ERP:** Accounts or the owner (`erp.payments.record`) record a payment already made — nothing is sent, no money
  moves; a wrong record is reversed by a new one; each is matched to the ERP's payment (amount, reference,
  `books.payments.matchDays` = 2). The form sends one `Idempotency-Key` per opening: a double tap or a retry is one record
  (`ErpPaymentRecord.requestKey`, unique per link; follow-up 551). The money box takes 1,000 / 1,00,000 and Bengali digits and
  refuses a third decimal (never cuts it off).
- **Account check (follow-up 490):** job `inventory.books.checkAccount` every `erp.account.checkMinutes` per v6 store: the
  shop's side, then `GET /account` for `books.account.lookbackDays` (7) — a payment whose webhook was lost is written from the
  statement, and the hold and the ERP's numbers go into `ErpAccountState` through PR 610's `noteHold` (one writer). ERP amounts
  are read exactly (`moneyMinor`: a third decimal or words are refused, never rounded or read as 0). In v5 nothing runs.
- **The store:** the page shows `?storeId=` (as the books API takes it), else the mother store; its key is checked there.
- **Tests:** `packages/inventory/test/erp-account.db.test.ts` (11, PostgreSQL), `packages/settings/test/registry-books.test.ts`.

> **বাংলায়:** নতুন (PR 616): প্রতি রাতে দোকানের খাতা ERP-র খাতার সাথে দিন ধরে মেলানো হয়, এক পয়সাও ছাড় নেই; গরমিল ঠিক হয়
> শুধু উল্টো এন্ট্রি আর নতুন এন্ট্রি দিয়ে, মালিকের PIN দিয়ে; সব দিন মিললে তবেই মাস বন্ধ, নাহলে মালিকের কারণসহ সিদ্ধান্তে।

**Built (PR 616): the books match engine** (CN-028, CN-029 Phase 1; screens Money → Books → Match `/admin/money/books/match`,
Differences `/admin/money/books/differences`, Closes `/admin/money/books/closes`; migration `0055_books_pin`, settings
registry v68 `registry-books.ts`).
- **Checks A–F** (`runBooksMatch`, `packages/inventory/src/books-match.ts`), per store link, zero tolerance: A every ERP statement
  row against the shop's entries by row group (credit, exchange, payment, other; the opening on the books' first day; each
  "paid to ERP" record against the ERP's payments), B the tie formula of §3.4 (`tieRemainder`), C returns handed back,
  approved and their credit, and what waits for the ERP's check, D the stored daily summary, E the month's fixed costs, F every
  billed order. A difference is kept once per (day, class, key) in `BooksDifference`; a missing ERP event waits
  `books.timing.maxMinutes` (PENDING) before it is a MISMATCH. A check v6 cannot make yet is PARTIAL.
- **Closes:** job `inventory.books.close` every `books.close.checkMinutes` (15) runs once a night after `books.close.runAt`
  (01:30) through yesterday, rechecking `books.recheck.days` (7) closed days. Each day writes an append-only, hash-chained
  `BooksDayClose` (a new version only when its figures change; ~~a matched day that moves raises HISTORY_CHANGED~~ a matched day
  whose OWN money moves — its ledger entries, the shop's corrections left out, or the ERP's rows — raises HISTORY_CHANGED in the
  same locked transaction as its close, and a later run that finds the day matched clears it); a run also goes back to the
  first day whose books moved since its close (a correction, a late entry, fixed costs or a summary entered later), however far
  back; one run at a time per link (`books.run.staleMinutes` 60; a manual run meanwhile answers BUSY). Check A also compares each
  day's closing balances, less what open differences explain (`A:closing`). Weeks and the lifetime check are built from the
  day closes (`BooksPeriodClose`). A month (`closeMonth`) closes with `books.close` and the
  owner's PIN only when every day matched (`books.close.requireMatched`) and its fixed costs are in, else only with the owner's
  override reason (kept on the close, the month's differences OVERRIDDEN); `reopenMonth` writes a new version; `signOffYear`
  once every month of the financial year is closed. Each of them locks the store's link first and decides from what it reads
  under that lock.
- **Putting a difference right** (`adjustDifference`, `books-adjust.ts`): `books.adjust`, the owner's PIN, a reason
  (`books.adjust.reasonMinLength` 10) and the ERP's matching row — a REVERSAL of the group's entries plus one ADJUSTMENT with
  the ERP's amount and a `BooksAdjustment` (PRIOR_PERIOD when the month is closed); one adjustment per ERP event and one per
  difference (two at the same moment: one books, the other is ALREADY); the ERP's row must belong to the difference (its rows,
  or an ERP event about the same order); nothing is edited or deleted (the database refuses it). Migration 0055 also keeps one
  BILL per order and link. ~~A row whose ERP event has not reached the shop's ledger yet (`detail.waitingEvents`, checked again
  under the lock) is not put right by hand: the pull books it under its own key and the next match settles it (spec §4.3;
  a hand correction would count it twice). A row with no event behind it (a charge the ERP typed) is put right as before.~~
  A credit, payment or exchange row the shop lacks (MISSING_EVENT) is never put right by hand, whether or not the ERP's
  statement row carries an eventId (optional in v6): the pull books it under its own key and the next match settles it
  (spec §4.3; a hand correction would count it twice). Where ids are sent, a row naming an event the ledger lacks
  (`detail.waitingEvents`, checked again under the lock) waits too. A charge the ERP typed (OTHER) and a bill the shop
  never booked are put right by hand. A shipment whose answer had no bill date (PR 611 keeps `billedAt` empty) is
  never booked on a guessed day: the ERP's bill row is a MISSING_EVENT marked `billedAtMissing` until the order check fills
  the date, or the correction books the BILL itself from the ERP's row (its own key, so it is never booked twice).
- **The owner's PIN** (`packages/auth/src/pin.ts`, migration `0055_books_pin`: four `StaffUser.booksPin*` columns): set by the
  owner with his password, kept only as a scrypt hash, never logged; digits only, `books.pin.minLength` (6), never one digit
  repeated or a straight run; `books.pin.maxAttempts` (5) wrong tries lock it for `books.pin.lockMinutes` (15). Each try takes
  its number in the database before the hash is checked, so a burst of tries at once cannot pass the lock; the last number
  writes the lock end with it, and a count left at its limit with no lock in force (a crash, a lower limit) starts again.
- **What others read** (`books-view.ts`, shapes kept stable for Hisabi 617/618): `booksStatus` (balance, the ERP's, open
  differences by class and check, days matched, partial checks, months closed, last run, chain), `explainDay` (a day opened to
  its row groups, entries, ERP rows, tie parts and versions), `booksDifferences`, `booksDaysForSummary`; the Needs-you-now row
  `booksDifferences` (MISMATCH rows).
- **Tests:** `packages/inventory/test/books-match.db.test.ts` (11, PostgreSQL: zero tolerance, fix only by reversal + new entry,
  month close only when matched or with the override, PIN hashing and lock, store A never reads or writes store B, v5 runs
  nothing), `packages/inventory/test/books-qa.db.test.ts` (12, PostgreSQL: the qa-gate's reproductions — late equal fixed costs,
  a back-dated correction, a burst of PIN tries, two corrections at once, a close beside a locked run, two runs at once, the
  closing balance, the payment request key, the prior-period fix), `packages/inventory/test/books-money.test.ts`,
  `apps/web/src/lib/admin-books/money.test.ts`, `packages/auth/test/pin.test.ts`, `packages/settings/test/registry-books.test.ts`.

> **বাংলায়:** নতুন (PR 617, 618): দোকান প্রতিদিন নিজের রেকর্ড থেকে দিনের হিসাব বানিয়ে ERP-তে পাঠায়, আর মালিক মাসের স্থির খরচ আর
> প্রতিদিনের খরচ লেখেন। টাকা › দৈনিক হিসাব পাতায় হিসাব মিলছে কি না, টাকা › খরচ পাতায় খরচ। কিছুই টাকা নড়ায় না।

**Built (PR 617, 618; CN-029 Phase 1, 30 Oct; not deployed yet).** Design: [`docs/RETAIL-ERP-MODEL.md`](docs/RETAIL-ERP-MODEL.md)
§3.3–§5, contract [`docs/erp/site-changes-v6.md`](docs/erp/site-changes-v6.md) §2.6, §2.11. Migration `0056_books_summary_minor`
(additive), settings registry v69 (`registry-books-summary.ts`).

- **Daily summary to the ERP (PR 617):** only for a store on contract v6 (`erp.model`) with its own ERP link; a v5 store
  builds and sends nothing. Each shop day is built from the shop's own records on the delivery-day basis, every line
  from its one source (`SUMMARY_LINE_SOURCES`): orders placed, delivered pieces at the customer price on the delivered day
  (`@extas/metrics` `retailDayFigures`), delivery charges, deliveries, customers; goods and return losses from the
  return-pipeline moves and the account's exchange entries; cost lines from cost entries (a reversed entry and its reversal
  are not a figure). A line with no figure yet goes in `incomplete`, never as 0. Whole taka on the wire; the exact lines in
  minor units are kept with each version (`ErpDailySummary.minorLines`), and PR 616's tie reads those (`tieLinesOf`), so a
  piece at 450.50 ties to the paisa. Every built day is an append-only version: sent at `erp.summary.sendAt`, tried again
  after `erp.summary.retry.minutes` (1, 5, 15, 60, then hourly) until accepted; a 4xx refusal is not tried again by itself
  (a new key round when the ERP asks for the day again); a late fact makes a new version within `books.resend.days` (never
  in a closed month, checked under the link's lock); `summary.missing` is answered at once; the hourly check
  (`erp.summary.checkMinutes`) compares the ERP's stored copy over `erp.summary.gapDays`. One send at a time per version (an
  advisory lock), so overlapping ticks never log two tries. Every send and reply is kept (`ErpBooksSend`). Jobs
  `inventory.books.summaryTick` and `inventory.books.summaryCheck`; guard path `books.send`.
- **Books status card (PR 617):** **Money → Daily summary** (`/admin/money/books/daily`, `books.read`): PR 616's
  `booksStatus` (the six checks A–F, days matched, what Retail owes the ERP on both sides, waiting for the owner's check,
  exchanges at risk, months closed, the closes chain), "not run yet" until the nightly match runs; a failure or another
  shape never takes the page down. Beside it "Needs you now" (refused, missing and incomplete days, a month without fixed
  costs, old unchecked returns, open differences, a broken tie) and the summaries sent with how each was taken.
- **Fixed costs and the extra cost lines (PR 618):** **Money → Costs** (`/admin/money/costs`; seeing `books.read`,
  writing `fixedcosts.write`). A month's salary, rent, utilities and other ship empty (owner data); each change is an
  append-only version (`ErpFixedCostMonth`), sent by `PUT /fixed-costs/{month}` from the same tick and checked against
  `GET /fixed-costs`; shown by day with the ERP's rule (`erp.fixedCosts.spread`: exact to the paisa, the remainder on the
  last day); never in a day's `costs.other`. Daily cost lines (packaging, accessories, payment and COD fees, courier, ads,
  other) for today or an open day, each with the form's request key (a double tap writes once); a wrong one is reversed by
  a negative entry with a reason; the day's summary is built again at once. Caps `books.costs.maxLineMinor` (৳10 crore)
  and `books.costs.maxMonthMinor` (৳40 crore) refuse a typing slip; a stored month that cannot be added up shows as
  unreadable. "More options": the lines this shop never has (`erp.summary.noCostLines`).
- **API:** `GET /api/admin/costs`, `PUT /api/admin/costs/fixed-costs`, `POST /api/admin/costs/cost-entries`,
  `POST /api/admin/costs/cost-entries/:id/reverse`, `PUT /api/admin/costs/no-cost-lines`.
- **Tests:** `packages/inventory/test/books-rules.test.ts`, `books.db.test.ts` (13, PostgreSQL: versions, retries,
  refusals, two ticks at once, `summary.missing`, the stored-copy check, the tie to the paisa, closed months, store A never
  touching store B, v5 untouched) and `books-costs.db.test.ts` (11), `packages/settings/test/registry-books-summary.test.ts`,
  `apps/web/src/lib/costs-api.test.ts`, `books-status-view.test.ts`, `messages-unique-keys.test.ts`.
- **Guides:** [Daily summary](docs/admin-guide/pages/money/books-daily.md), [Costs](docs/admin-guide/pages/money/costs.md).

**Built (PR [342](docs/stages/S16.md#pr-342); 31 Oct, CN-031 lane C; live since 31 Oct 19:14, #69): the Money overview.**

> নতুন (PR 342): টাকা › সারসংক্ষেপ — কত টাকা এসেছে, কুরিয়ারের কাছে কত COD পাওনা, কাস্টমারদের কত ফেরত বাকি, এক পাতায়; শুধু দেখা, এখান থেকে কোনো টাকা নড়ে না।

- **Screen:** **Money › Overview** (`/admin/money`, the second tab, so Money still opens Books, CN-028; `payments.view`):
  payments that came in (24 hours, 7 and 30 days, and by method), COD a rider collected that no courier payout has settled
  (by courier, with the oldest age), refunds owed to customers and failed payouts. Read-only, from the shop's own records;
  nothing moves money here. No migration, no setting.
- **Guide:** [`docs/admin-guide/pages/money/overview.md`](docs/admin-guide/pages/money/overview.md).
- **Tests:** `apps/web/src/lib/money-overview.test.ts`, `money-overview.db.test.ts` (PostgreSQL); checked in a real browser
  at 390, 768, 1366 and 1920 px.

**Built (PR [343](docs/stages/S16.md#pr-343), 344, 345, 346; 31 Oct, CN-031 lane C; not deployed yet): costs, expenses and the month-end sheet.**

> নতুন (PR 343–346): খরচের খাতা (প্রতিটা টাকা লাগা মেসেজের খরচ, SMS ব্যালান্স), খুচরা খরচ লেখা (ভুল হলে উল্টো এন্ট্রি, কিছু মোছে না; রসিদের ছবি শুরুতে বন্ধ), খরচ ও ফি-র ঘর (গেটওয়ের ফি, প্যাকেজিং, ডলারের রেট, কুরিয়ারের রেট — সব আপনি দেবেন) আর মাস শেষের হিসাবের পাতা। শুধু লেখা আর দেখা; কোনো টাকা নড়ে না, কোনো দাম বা চার্জ বদলায় না।

- **Cost ledger (PR 343):** a message sent with a known cost writes one `CostEntry` in the same transaction (service = channel,
  what it was for = the message log row) and draws that service's `PrepaidBalance` down; a mock send costs nothing. **Money ›
  Cost ledger** (`/admin/money/cost-ledger`, `books.read`): today, this month and this year by service in the store's time
  zone, the latest rows, the prepaid balances with a top-up record and a low mark (new permission `costs.write`, audited,
  once per request key) and a CSV export (cut at `costs.ledger.exportMaxRows`). The rows never feed the ERP daily summary.
- **Expenses (PR 344):** **Money › Expenses** (`/admin/money/expenses`; seeing `books.read`, entering `fixedcosts.write`):
  head, day, amount and note for today or an open day, through PR 618's cost line on the head's summary line, so it reaches
  the ERP with its day's summary and is never typed twice; a wrong one is reversed with a reason (never twice, never
  deleted). Heads are the owner's own (none shipped): add, put away, bring back. A receipt photo or PDF while
  `costs.receipts` is on (off; checked by its contents, 5 MB, media folder "expense-receipts"; migration
  `0070_expense_receipts`).
- **Costs & fees (PR 345):** **Money › Costs & fees** (`/admin/money/fees`; changes need `costs.write`, audited): gateway fees
  per provider (`costs.gatewayFees`: basis points plus a fixed amount) and the packaging cost of one order
  (`costs.packaging`), both owner data and empty as shipped, saved with their version after a second "Yes, save"; the USD
  rate as `ExchangeRate` rows; courier rates as `CourierRateCard` rows per account, delivery band and weight band (ended,
  never deleted). The RTO cost inputs stay on Delivery › Couriers (PR 192), linked. An unknown fee is never 0.
- **Month-end (PR 346):** **Money › Month-end** (`/admin/money/month-end?month=`, `books.read`, read-only): the total per
  service split into what goes to the ERP and the shop's own ledger, what the ERP has (each day's latest daily summary:
  accepted, waiting, refused, not made; the month's fixed costs), the days not posted, the month's differences and its close,
  with links to Books. MNY-05's monthly expense push is superseded by CN-028 (the daily summary and fixed costs), so nothing
  reaches the ERP twice.
- **Settings:** registry v77 (`registry-costs.ts`: `costs.ledger`, `costs.gatewayFees`, `costs.packaging`) and v90
  (`costs.receipts`).
- **Guides:** [Cost ledger](docs/admin-guide/pages/money/cost-ledger.md), [Expenses](docs/admin-guide/pages/money/expenses.md),
  [Costs & fees](docs/admin-guide/pages/money/fees.md), [Month-end](docs/admin-guide/pages/money/month-end.md).
- **Tests:** `apps/web/src/lib/cost-ledger.test.ts`, `cost-ledger.db.test.ts`, `expenses-api.db.test.ts`,
  `fees-api.db.test.ts`, `month-sheet.db.test.ts` (PostgreSQL), `packages/messages/src/channels.db.test.ts`; checked in a
  real browser at 390, 768, 1366 and 1920 px.

**Built (PR [347](docs/stages/S16.md#pr-347)–355, 504, 536, 537, 568; 1 Nov, #78, After launch): profit, VAT and the
reports.** Settings registry v160–v167 (`registry-finance.ts`); permissions `vat.manage`, `books.report`,
`staff.performance`. Every figure only reads the shop's own records; nothing moves money or changes a price.
> নতুন (#78, S16 শেষ): খরচের রিপোর্ট, প্রতিটা অর্ডারের আসল লাভ (পণ্য, কুরিয়ার, ফি, প্যাকেট, মেসেজ আর বিজ্ঞাপনের ভাগ), লাভ-ক্ষতির পাতা, ফেরত আর কুরিয়ারের আন্দাজি চার্জ লাভে ধরা, ক্যাটাগরি-স্টাইল আর চ্যানেল ধরে লাভ, এলাকা ধরে বিক্রি, VAT (শুরুতে বন্ধ; দাম কখনো বদলায় না), টেলিগ্রামে টাকার রিপোর্ট আর টিমের ব্যাজ (দুটোই শুরুতে বন্ধ)।
- **Costs report (347):** Money › Cost ledger › Costs report (`/admin/money/cost-ledger/report`, `costs.report`) — any
  period by day, month or year, by service or module, AI against its cap, export.
- **Per-order profit (348, 353, 354):** the order page's profit card (`books.read`): product cost, courier, payment fees,
  packaging, messages and AI and an ad-spend share (`costs.allocation`); returns after receipt come off Sales and their
  cost comes back; a parcel not yet charged priced from the owner's rate card and marked an estimate
  (`costs.courierEstimate`, off; Money › Costs & fees).
- **Profit & loss (349, 504, 355):** Money › Profit & loss (`/admin/money/profit`) — Sales beside Ordered value, gross
  profit, contribution, ad spend, other and fixed costs, net profit; Profit by group (`/admin/money/profit/groups`,
  category and style) and Profit by channel (`/admin/money/profit/channels`, `reports.channels`: Meta, Google, YouTube,
  TikTok, organic and the rest), each with a CSV.
- **VAT (350, 537):** Money › VAT (`/admin/money/vat`; `vat.system` off, `vat.rates` empty owner data, `vat.manage`) —
  rates by product, category and default; prices are VAT-inclusive, so switching it on never changes a price; the VAT
  report by rate, category and day with a CSV, and its line on Profit & loss.
- **Money report (351):** `money.report` (off; `books.report`) — daily, weekly or monthly by Telegram at the owner's time
  and language, the same figures as Profit & loss.
- **Team badges (352):** Reports › Team (`/admin/reports/team`, `team.badges` off, `staff.performance`) — recognition
  only, never pay or a penalty.
- **Sales by area (568):** Reports › Sales by area (`/admin/reports/areas`) — Sales, pieces, returns and the return rate
  by district, upazila/thana or Dhaka area, as a table, a map and a CSV.
- **ERP once (536):** an expense entered in the shop reaches the ERP's daily summary once (it was counted twice).
- Guides: [money/cost-report](docs/admin-guide/pages/money/cost-report.md), [money/profit](docs/admin-guide/pages/money/profit.md),
  [money/profit-groups](docs/admin-guide/pages/money/profit-groups.md), [money/profit-channels](docs/admin-guide/pages/money/profit-channels.md),
  [money/vat](docs/admin-guide/pages/money/vat.md), [reports/team](docs/admin-guide/pages/reports/team.md),
  [reports/areas](docs/admin-guide/pages/reports/areas.md), and the [Finance guide](docs/admin-guide/finance.md).
- **Follow-ups (#93):** a pipeline move locks its piece and re-reads its state (615); a Daily summary day opens that
  day's lines with their sources, and on the practice ERP without its data a day says "Waiting for the ERP key" (617).
- **Follow-ups (#94):** the daily cost lines get their own permission, `costlines.write` (618); the nightly smoke checks
  that no daily summary or month waited for the ERP more than a day (617).
- **Follow-ups (#96):** the hand-back desk ticks which pieces came back (615, migration 0179); the books' hash chains are
  versioned (616, migration 0186; nothing re-hashed); an imported courier or gateway statement writes its charges as
  one cost entry (618; registry v274, both off; record only); the daily summary's handed-back pieces are net of a
  same-day put-back (617).

### S21 · Site Health & Audit — Done (14/14)

Started: `readme-guard` in CI (scope on PR 594, CN-011) fails a pull request whose README PR log, stage counts or
feature states disagree with the register. Every deploy copies README.md and docs/ to `$EXTAS_ROOT/docs/<commit>/`
(`infra/deploy/docs-sync.sh`, `current` link, newest `DOCS_KEEP_VERSIONS` kept), mounted read-only in the app as
`/docs/current` for the admin tabs ~~still to be built~~ (built in #78, PR 594, below). ~~Planned — see register PRs 415–422, 424, 570, 594~~ (415–422, 424 and 570 built in #73, 594 in #78, below; S21 is done): [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604).

**Page guides (scope on PR 594, CN-026 cut by CN-027, 24 Oct):**

> **বাংলায়:** অ্যাডমিনের প্রতিটা তৈরি পাতার নিজের বাংলা গাইড এসেছে, ছয় ভাগে: এটা কী, কেন দরকার (একটা উদাহরণসহ), কীভাবে
> করবেন, প্রতিটা বোতামের মানে, সাধারণ ভুল, এরপর কী হয়। উপরের বারের ছোট **?** চাপলে যে পাতায় আছেন তার গাইড খোলে —
> কম্পিউটারে পাশে, ফোনে পুরো পর্দায়। লেখা বড় আর পরিষ্কার, টিপ / সাবধান / উদাহরণ রঙিন বাক্সে। গাইড ছাড়া নতুন পাতা এলে CI আটকায়।

| Part | What it does |
|---|---|
| page guides | `docs/admin-guide/pages/<section>/<page>.md`, one per built admin page (23), in six fixed parts with Tip / Careful / Example boxes (`> [!TIP]`, `> [!WARNING]`, `> [!NOTE]`); `pages/<section>/index.md` is the overview of each of the 14 sections |
| route table | [`apps/web/src/lib/admin-shell/help-pages.json`](apps/web/src/lib/admin-shell/help-pages.json): each built page's route and its guide; login, the 404 catch-all and the old delivery redirect are listed as not guided, with the reason |
| guide API | `GET /api/admin/guide?path=<admin address>` or `?page=<section>/<page>` (`<section>/index` = the overview only): the page guide, the section overview and the section's pages; the same session rule as the other shell routes; only `[a-z0-9-]` ids are read |
| guide icon | a small help icon in the top bar before the bell opens the current page's guide (`data-testid=a2-help`); the side panel on a computer (the page moves left at 1280 px and wider, not modal), the full-screen sheet on a phone; it follows the person to the next page; "এই সেকশনে কী করা যায়" opens the same guide, Help opens the section overviews |
| admin type | self-hosted Instrument Sans + Hind Siliguri for the admin (`apps/web/src/fonts/admin-ui.css`, display optional as in the shop, preloaded), 15.5 px guide text at 1.7 line height, numbered steps, aligned forms (inputs and buttons take the admin font) |
| CI check | `node tools/admin-guide-check.mjs` in the `checks` job: a built admin page with no row, a row with no guide, a guide not in the six parts, a section without its overview or an overview that does not list its pages fails the build |

Tests: `shell.test.ts` (route matching, the mode, boxes, comments, page links, every row's guide in the six parts),
`api.db.test.ts` (the guide API on PostgreSQL), `tools/admin-guide-check.test.mjs`. Smoke: the guide API and the top-bar
icon (`docs/qa/smoke.json`). No setting, no migration, no permission. After launch (CN-027, follow-ups 390–396): the "?"
hints, "Show me", the pop-up and own-page modes and the Admin look setting (CN-025), the live label check, the AI helper.
Guide index: [docs/admin-guide/README.md](docs/admin-guide/README.md).

**Built (PR [413](docs/stages/S21.md#pr-413); 31 Oct, CN-031 lane B; live since 31 Oct 19:14, #69): the Site health hub.**

> নতুন (PR 413): রিপোর্ট › সাইটের অবস্থা — দোকান ঠিক চলছে কি না, পাঁচ লাইনে: কাস্টমারের সমস্যা, সার্ভার, গতি, অডিট আর সব পাতার পরীক্ষা। সবচেয়ে খারাপ লাইনটাই উপরে দেখায়।

- **Screen:** **Reports › Site health** (`/admin/reports/health`, the first page of the health tab beside Server; new
  permission `health.read`): five lines judged from what the server writes (`health.json` every minute, `smoke.json` after
  every deploy and night, `k6-baseline.json` from PR 10) and the worker heartbeat — server (a late check, its problems, the
  worker), speed (the home page time against the limit; the k6 baseline as a note), smoke (never run, failed, late);
  customer problems (PR 423) and the site audit (PR 570) stay grey until they report. Freshness comes from each file's
  write time; the headline is the worst line. No customer data on the page.
- **Settings:** registry v81 `health.hub` (when a line turns yellow: 5 minutes, 2000 ms, 30 hours), saved with
  `settings.write`, audited `health.hub.save`.
- **Guide:** [`docs/admin-guide/pages/reports/health.md`](docs/admin-guide/pages/reports/health.md).
- **Tests:** `apps/web/src/lib/admin-health/hub.test.ts`, `api.db.test.ts` (PostgreSQL); smoke check and device gate.

**Built (PR [414](docs/stages/S21.md#pr-414), 423; 31 Oct, CN-031 lane B; not deployed yet): saved journeys and customer problems.**

> নতুন (PR 414, 423): কাস্টমার, অ্যাডমিন, হিসাবরক্ষক আর গুদামের কাজের পথ আপনার ঠিক করা সময়ে নিজে থেকে ব্রাউজারে চালিয়ে দেখা (শুরুতে বন্ধ; কোনো অর্ডার হয় না)। আর কাস্টমার সাইটে কোথায় সমস্যায় পড়ছে — ভুল, ধীর পাতা, ভাঙা ছবি, বারবার চাপা — তার তালিকা, জরুরিটা আগে; কারো নাম, ফোন বা ঠিকানা রাখা হয় না। কিছু আটকায় না, দোকান বদলায় না।

- **Saved journeys (PR 414):** `docs/qa/journeys.json` + `tools/journeys.mjs` — plain Playwright steps for customer, admin,
  accountant and warehouse on a phone and a desktop screen, with the smoke test's sign-in and error watch; the customer
  never adds to the bag or orders; the staff journeys run as the read-only check account and prove writes are refused.
  `health.journeys` (v82, off): hourly, daily or weekly at the owner's hour, runs kept, "Run now"; the hourly
  `journeys.yml` (`infra/deploy/journeys.sh`, its own concurrency group, never in a deploy's way) keeps the newest runs in
  `state/journeys/` and commits a report only on a failure or a recovery. Site health gains a sixth line.
  **Go-live gate journeys (1 Nov, #74, PR 414 follow-up, CN-013 phase 2):** a `go-live-gate` group (`gate-shop` signed
  out, `gate-admin` as the check account, phone and desktop), each step naming its SIM-F findings; it orders and changes
  nothing, and a feature behind an owner's switch is checked as the switch is set (`switches`, `when` / `unless`). Run
  by hand: Actions › journeys, `mode` now, `group` go-live-gate; its summary (`state/journeys-go-live-gate.json`) and
  report (`docs/reports/journeys/go-live-gate/latest/`) stay apart from Site health's saved journeys. Of the 38 phase-2
  live checks, 8 are proved by the journeys, 24 by CI tests and 6 need a person with a real test order.
  **Go-live gate test orders (1 Nov, #75, PR 414 follow-up, CN-013 phase 2, owner's OK for test orders on the preview):**
  `gate-orders.yml` (by hand, on the VM) runs `infra/deploy/gate-orders.sh`: a host guard (only the preview host), an
  oracle in the live migrate image that uses the shop's own package functions on mocks only (a live provider turns its
  checks into SKIP), and 18 scenarios in real browsers on phones and desktops over throttled networks — baskets of 1, 3
  and 8, the last piece and a race for it, mock bKash paid / failed / retried, one customer with 8 orders (3 cancelled),
  /bn, double tap and reload, a dropped network, OTP sign-in, delivery bands, gate checks 1, 4, 7, 21, 23 and 24. Every
  order has its own address (all 8 divisions), compared as typed, stored, in the admin, at the courier and on the
  sticker. Clean-up cancels every test order and archives the products (nothing deleted); report
  `docs/reports/gate-orders/latest/`. Proved locally 18/18 (15 pass, 3 skip).
  **Customer 360° run (1 Nov, #75, PR 414 follow-up):** `gate-c360.yml` (by hand) runs `infra/deploy/gate-c360.sh` and
  `tools/gate-c360/run.mjs`: one fresh "GATE TEST" customer before ordering (an ad link with its tags, the Facebook and
  Messenger in-app browsers, search, size guide, wishlist, bag, a checkout left and resumed), ordering (guest, then the
  same number signed in), every account option, every support channel and after ordering, on a mid Android phone, an
  iPhone and a desktop in English and /bn. It refuses to run off the preview host or while any connection is live; each
  step is PASS, FAIL or SKIP with its reason; report `docs/reports/gate-c360/latest/`; findings and the live-run log in
  [`docs/qa/FINAL-ANALYSIS-2026-11.md`](docs/qa/FINAL-ANALYSIS-2026-11.md). CI type-checks both gates' server code.
  **After the first live run (1 Nov, #76, PR 414 follow-up):** the live run skipped all 18 orders (cash on delivery and
  test payments are off) and the 360° run found no product. Now both runs pay on the mock bKash through their own run's
  grant (PR 170 above) and close it in the shell's trap on a finish, a failure or SIGINT/SIGTERM (the browser runs in
  the background, so the trap fires at once). gate-orders' `allow_cod` input (false by default) is the only way a run
  switches cash on delivery on; it is put back to the exact earlier value (only if nobody changed it during the run);
  without it the COD scenarios are SKIP "COD is off (owner's setting)". gate-c360 makes its own GATE TEST products with
  gate-orders' shared helpers (`tools/gate-orders/lib/test-shop.ts`) and archives them at the end. An owner's switch
  that is off, a gap planned as PR 622–624 and the default address / phone change (by design) are SKIPs with the reason.
  The UTM check reads the browser's own cookie jar (the shop keeps the tags in the HttpOnly `__Host-extas_src`, which
  page scripts cannot see); a link the check cannot reach is asked once more, with the reason kept. My account › Wallet
  is in the smoke list. Proved locally: gate-orders 18 scenarios, 24 orders on the mock bKash: 14 pass, 0 fail, 4 skip (cash on delivery off, no open coupon, delivered-parcel steps); gate-c360 150 steps: 120 pass, 27 skip, 3 fail — the unnamed-button check (fixed, desktop rerun green), one local browser crash (rerun green) and the messages step, which needs the job worker that runs only on the server.
  **After the second live run (1 Nov, #77, PR 414 follow-up):** the 13:03Z run stopped in scenario 13 and its report
  said nothing about cash on delivery (it had been put back: the shell's safety net closed the grant and restored the
  exact earlier value). Now every report ends with a **Safety net** line ("cash on delivery put back to …" or "not
  touched"; "test-pay grant closed"), also `safetyNet` in `result.json`; the run records its cash-on-delivery change on
  its grant before it makes it; the trap closes the grant first and ignores a second signal; a **start check** before
  every run closes what an earlier run left open and puts cash on delivery back (from its grant, or its own
  setting-change line; never a later change by the owner); `gate-orders.yml` ends with `gate-orders.sh --sweep`
  (`if: always()`). Each scenario has its own time budget (10 min, longer on a slow network, at most 30;
  `GATE_SCENARIO_MIN`); a stuck or crashed scenario is its own FAIL row with a picture (`scenario-<n>.jpg`) and the run
  goes on; the report is written after every scenario. Scenario 13: an unanswered bag wait stopped Node (unhandled
  rejection) — the press now has its own timeout and names what took the tap; each scenario's pieces are stocked up
  first. Search and wishlist: the GATE TEST products had no category, and the shop shows only products in a shown
  category — the gate now makes its own (`GATE TEST — do not ship`, archived with the products); the search step waits
  up to `waits.searchSec` for the word list. Recording a payment by hand switched off (`payments.manual`) makes gate
  check 4 a SKIP. Proved locally: gate-orders 18 scenarios with `allow_cod`, 26 orders: 16 pass, 0 fail, 2 skip; a
  SIGKILL mid-run put back by the safety net, and a dead job's switch put back by the next run's start check (cash on
  delivery back to "no store value" both times); gate-c360 150 steps: 121 pass, 28 skip, 1 fail (the messages step,
  which needs the server's job worker); search in English, Bengali ("পোলো শার্ট"), a typo ("pollo shrit") and
  Banglish, and the wishlist, pass.
  **Live run 3 (1 Nov, #79; new.extas.com.bd, version `0f6ac8a0`, 22:13 / 22:20 Dhaka):** gate-orders **PASS** — 16
  pass, 0 fail, 2 skip (no open coupon, delivered-parcel steps), 26 test orders; cash on delivery put back after the
  run, the test-pay grant closed. gate-c360: 115 pass, 8 fail, 27 skip — 6 × the misspelt search "pollo shrit" (on the
  server Meilisearch kept the misspelt general word; fixed on PR 72 above) and 2 × the desktop category filter, which
  the shop hides by design when a category holds `category.page.fewStyles` (4) or fewer products and no filter is on
  (D-012): a page marked `.cat-layout.cat-few` is now a SKIP naming that rule (`lib.mjs` `fewStyles`); any other
  category without a filter still fails. Reports: [gate-orders](docs/reports/gate-orders/latest/README.md),
  [gate-c360](docs/reports/gate-c360/latest/README.md).
  **Skipped scenario, skipped check (6 Nov, #85, PR 414 follow-up):** with cash on delivery only (the owner's go-live
  offer), the bKash scenario is skipped by the shop's settings, and its gate check is now a SKIP with that reason instead
  of a FAIL (run 42194914295: 14 pass, 0 fail, 4 skip, 24 test orders cleaned up); a scenario that failed or stopped
  still fails its check.
  **The 70-order simulation on the runner (6 Nov, #86, PR 414 follow-up, CN-036):** `simulation.yml` (by hand only, the gate's
  own lane, `allow_cod` off by default) runs the gate with the simulation's scenario set (`tools/simulation/plan.json`: the
  70 plan orders with device, network, test address, basket and checks); a payment method or courier switched off on the
  shop is a SKIP with its reason, never a FAIL; what a person must see (the door, settlement, chats, reviews) is listed as
  theirs. Report in Bengali and English in `docs/reports/simulation/latest/`.
  **After the first simulation run (6 Nov, #89, two PR 414 follow-ups):** the 21:45 run passed 35, failed 7 and
  skipped 28 rows; the shop was right in all 7. Rows 04, 33, 39, 46, 50 and 67: the repeat buyer's new order sat beside
  his own open test order, so the duplicate check (PR 145) opened a review that holds the confirm — the run now plays the
  reviewing person (oracle action `approveDuplicateReview`, the admin's "Not a duplicate", only when every match is a
  GATE TEST order of the same buyer; a risk review or another person's order is left for a person) and then books. Row
  15: the code box answers 200 for any code and the bag page shows the refusal — the run now reads the bag's code box
  (refused, with words). Tests `tools/simulation/lib.test.mjs`; re-run after the next deploy.
- **Customer problems (PR 423, CN-015):** a small probe in the shop layout reports script errors, failed or slow calls to
  the shop's server, failed or slow pages, a form field refused again and again, rage clicks and broken pictures (the
  "Start fresh" screen too); anonymous by construction (masked page patterns, scrubbed messages, device and browser
  families, a random per-tab id); admin pages are never recorded. `POST /api/problems` (same-site, size-capped, rate bucket
  `report`, always 204) keeps one `CustomerProblem` per cause with append-only `ProblemRecord` rows (migration
  `0065_customer_problems`). A break on the bag or checkout, or one that hit `urgentVisitors` in a day, is Urgent.
  **Reports › Site health › Customer problems** (`/admin/reports/health/problems`: today, yesterday, 7 days, all, a day;
  two-week bars; short glitches apart; the recorder card) and one problem's page (devices, browsers, networks, last
  reports, status with a note; `health.problems.manage`, leaving an owner's step `health.problems.approve`; audited). The
  hub's Customer problems line is live. `health.problems` (v83, on as it ships, CN-015). BLOCKED 26: whether old records
  may ever be cleaned up.
- **Guides:** [Site health](docs/admin-guide/pages/reports/health.md),
  [Customer problems](docs/admin-guide/pages/reports/health-problems.md),
  [One problem](docs/admin-guide/pages/reports/health-problem.md).
- **Tests:** `tools/journeys.test.mjs`, `packages/jobs/src/server-sync.test.ts`, `apps/web/src/lib/problems/probe.test.ts`,
  `kinds.test.ts`, `admin-problems/days.test.ts`, `admin-problems/api.db.test.ts`, `admin-health/hub.test.ts`,
  `api.db.test.ts` (PostgreSQL), `edge-gate.test.ts`; smoke, device gate and journeys entries; checked in a real browser at
  390, 768, 1366 and 1920 px.

> নতুন (PR 415–422, 424, 570): সার্ভারের ভুলও কাস্টমারের সমস্যার তালিকায়, পরীক্ষায় পাতার চেহারাও দেখা, গতি আর স্মোক টেস্টের পাতা, সব পরীক্ষার ইতিহাস আর সহজ সারকথা, এজেন্টের ঠিক করা আপনার অনুমতি ছাড়া চালু হয় না, পরীক্ষার অ্যাকাউন্ট শুধু দেখতে পারে, পরীক্ষা ব্যর্থ হলে টেলিগ্রাম, আর পুরো চেকলিস্টের নিয়মিত অডিট (সব শুরুতে বন্ধ)।

**Built (PR [415](docs/stages/S21.md#pr-415)–422, 424, 570; 1 Nov, #73, After launch; B6.6, B7.3).** Every new switch is off.
- **Server problems and alerts (415):** a 5xx or throw on the bag, checkout and payment callbacks becomes a `server_error`
  problem while the recorder is on (method, route and status only); `health.alerts` (off) sends the owner one Telegram
  line when a problem is Urgent or jumps, once per window (migration `0090`).
- **UI checks in the journeys (416):** `health.uiChecks` (off) — each step measured on phone and desktop with the device
  gate's rules; findings fail the step.
- **Speed (417), Smoke runs (418):** `/admin/reports/health/speed` (the lab run against the targets, real visitors, month
  by month, Measure now) and `/admin/reports/health/smoke` (the newest deploy and nightly runs with their pictures; admin
  pictures need `health.smoke.shots`).
- **Run history (419) and what a run says (422):** `/admin/reports/health/history` and one run's page — every smoke test and
  journeys run kept with its findings (migration `0091`), new vs still failing, what was fixed, and a rule-based summary
  with up to four likely causes (AI not needed).
- **Fixes to approve (420):** `/admin/reports/health/fixes` — agents' fixes and new skills wait for the owner's OK
  (`health.fixGate`, proposals off); decided once, never by the proposer.
- **The auditor's sandbox (421):** the check account keeps only read permissions; every admin write from it is refused
  with 403 `READ_ONLY_ACCOUNT`; the test browsers get no database network. (Still open: two GET pages write, follow-up 621.)
- **Run alerts (424):** `health.runAlerts` (off) — Telegram when the smoke test or the journeys fail and when they pass again.
- **Checklist audit (570):** `health.audit` (off) — `audit.yml` judges each checklist group on the owner's schedule; AI ›
  Checklist audit (`/admin/ai/audit`); fixes only through Fixes to approve.
- Guides: [health-speed](docs/admin-guide/pages/reports/health-speed.md), [health-smoke](docs/admin-guide/pages/reports/health-smoke.md),
  [health-history](docs/admin-guide/pages/reports/health-history.md), [health-history-run](docs/admin-guide/pages/reports/health-history-run.md),
  [health-fixes](docs/admin-guide/pages/reports/health-fixes.md), [ai/audit](docs/admin-guide/pages/ai/audit.md).

**Built (PR [594](docs/stages/S21.md#pr-594); 1 Nov, #78, After launch; HLP-02, CN-011): the PR register, blueprint and
files inside the admin.** Migration `0092_build_problems` (a table and an enum only); permissions `build.read`,
`build.report`. Read from the deploy's docs copy; read only apart from problem reports.
> নতুন (#78, S21 শেষ): অ্যাডমিনের সাহায্য › বিল্ড-এ পুরো PR রেজিস্টার (কোন ধাপে কতটা হলো, প্রতিটা PR-এর বাংলা লাইন আর বদলের ইতিহাস), কোনো PR-এ সমস্যা দেখলে জানানো (R-1, R-2 …, কিছু মোছে না) আর ব্লুপ্রিন্টসহ সব ফাইল খুঁজে পড়া ও নামানো।
- **Build progress (`/admin/build`):** totals, the stages, the PRs by search, stage and state; a card per PR
  (`/admin/build/pr/<n>`) with its Bengali line, stage, state, the PRs it builds on, dated updates, change notes and
  build record.
- **Reported problems (`/admin/build/problems`):** "Report a problem on this PR" (`build.report`): open → being fixed →
  fixed (how) or closed (why); every step audited, nothing deleted.
- **Blueprint & files (`/admin/build/files`):** every Markdown file of the docs copy, search across all, a reader with
  contents, "find in this file", download and the file's earlier copies; only real `.md` files inside the docs folder.
- The Speed test no longer fails early in a month (PR 417 follow-up, test only).
- Guides: [help/build](docs/admin-guide/pages/help/build.md), [help/build-pr](docs/admin-guide/pages/help/build-pr.md),
  [help/build-problems](docs/admin-guide/pages/help/build-problems.md), [help/build-files](docs/admin-guide/pages/help/build-files.md),
  [help/build-file](docs/admin-guide/pages/help/build-file.md); device gate 0 fails in 217 checks over the build pages.

**Follow-ups (6 Nov, #82, CN-035):** the go-live gates' clean-up tells the shop's page cache when it archives the GATE
TEST products, so no collection page lists an archived test product, and the go-live-gate journeys start five minutes
after gate-orders (PR 414); after a rollback the deploy report names the docs copy on the server (PR 594).
> নতুন (#82): পরীক্ষার পণ্য সরানোর পরে কালেকশনের পাতায় আর দেখায় না; ফিরে যাওয়ার পরে রিপোর্টে কাগজপত্রের কপির নাম ঠিক।
- **Follow-ups (#94):** a fixed problem that comes back can open again by itself (423; `health.problems.reopen`,
  registry v270, off); browser reports over their per-address limit are dropped in observe mode too (423); Run
  history's catch-up and the fix gate's expiry never write as the read-only check account (421).

### S24 · Virtual Photoshoot Studio — Reopened (owner, 11 Nov; CN-039), building — 1/38

> **আবার চালু (১১ নভেম্বর, CN-039):** মালিক ৬ নভেম্বরের বন্ধ তুলে নিয়েছেন; এখন PR ধরে ধরে বানানো হচ্ছে। পুরো স্টেজ শেষ আর গেট পাস না হওয়া পর্যন্ত স্টুডিও ট্যাব একটা সুইচ দিয়ে (Settings, `stages.closedShown.S24`, শুরুতে বন্ধ) মেনু, sitemap, সার্চ আর robots থেকে লুকানো।
> Reopened by the owner (CN-039, 11 Nov 2026 02:26 Dhaka); built PR by PR; the whole Studio tab stays hidden by PR 652's switch until the stage is finished and gated.

**Built (PR [444](docs/stages/S24.md#pr-444), asset model and role taxonomy; 11 Nov, Gyani — AI-2 lane, CN-044).** New
package `@extas/photoshoot`; no migration (`MediaAsset.role`/`isOriginal`/`isAiGenerated`/`sourceAssetId` have been in
the schema since S00's full skeleton); permissions `photoshoot.read/write/generate/approve/publish`.
- **Role taxonomy (Blueprint C7.6):** a fixed vocabulary for `MediaAsset.role` — `primary_garment`, `front_reference`,
  `side_reference`, `back_reference`, `detail_reference`, `context_reference`.
- **Immutable originals, generated kept separate:** tagging a real photo's reference role (`tagReferenceRole`) is the
  only update an original row ever gets; a pipeline output (`recordGeneratedAsset`) is always its own new row —
  `isOriginal: false`, `isAiGenerated: true`, linked back to the real photo it came from — refusing a source that is
  missing, from another store, or itself a generated image (an AI image never traces back to another AI image).
- **Hard rule built in:** `hasBackReference` — a back view is never generated without a real, non-archived
  `back_reference` on file.
- No admin page yet (PR 445 adds the model library's). 15 new package tests (9 pure + 6 real-PostgreSQL).

> নতুন (PR 444): ফটোশুট স্টুডিওর ভিত্তি তৈরি — আসল ছবি কখনো বদলায় বা মোছা হয় না; AI দিয়ে বানানো প্রতিটা ছবি সবসময় নতুন, আলাদা সারিতে থাকে আর কোন আসল ছবি থেকে বানানো হয়েছে তার লিংক থাকে। প্রতিটা রেফারেন্স ছবির ধরন (সামনে/পাশ/পেছন/ডিটেইল) ঠিক করে রাখা যায়। সত্যিকারের পেছনের ছবি আপলোড না থাকলে সিস্টেম কখনো পেছনের ছবি বানাবে না। এখনো কোনো অ্যাডমিন পাতা নেই (পরের PR-এ মডেল লাইব্রেরি আসবে)।

### S25 · Video & Campaign Creative Studio — Reopened (owner, 11 Nov; CN-039), building — 3/10

> **আবার চালু (১১ নভেম্বর, CN-039):** মালিক ৬ নভেম্বরের বন্ধ তুলে নিয়েছেন; এখন PR ধরে ধরে বানানো হচ্ছে। পুরো স্টেজ শেষ আর গেট পাস না হওয়া পর্যন্ত স্টুডিও ট্যাব একটা সুইচ দিয়ে (Settings, `stages.closedShown.S25`, শুরুতে বন্ধ) মেনু, sitemap, সার্চ আর robots থেকে লুকানো।
> Reopened by the owner (CN-039, 11 Nov 2026 02:26 Dhaka); built PR by PR; the whole Studio tab stays hidden by PR 652's switch until the stage is finished and gated.

**Built (PR [481](docs/stages/S25.md#pr-481), the action/motion library; 11 Nov, Gyani): Marketing › Studio › Motion library.**

> নতুন (PR 481): মোশন লাইব্রেরি — জগিং, হাঁটা, ঘুরে দাঁড়ানো, দলগত ক্লিপের মতো ১১টা তৈরি অ্যাকশন; অ্যাডমিন নিজের মতো অ্যাকশন যোগ, বদল আর আর্কাইভ করতে পারেন (কখনো মোছা হয় না)। স্টেজ শেষ হওয়ার আগ পর্যন্ত মেনুতে দেখা যায় না।

- **Package:** `@extas/creative-studio` (`motion.ts`) — 11 seeded motion actions (jogging, stretching, group workout,
  walking, turning, café sit, office walk, cuff adjust, festive greeting, footwear walk, bag sling), each with an
  English name, Bengali name and description, a garment hint (tracksuit/polo/formal shirt/panjabi/footwear/bag/other),
  a seconds range and a group-clip flag.
- **Admin page:** Marketing › Studio › Motion library (`/admin/marketing/studio/motion`, Lumen pattern, `marketing.studio.read`
  to see, `marketing.studio.write` to add/edit/archive). List, add, edit, archive/restore — nothing deleted.
- **Guide:** `docs/admin-guide/pages/marketing/studio-motion.md`.

**Built (PR [482](docs/stages/S25.md#pr-482), the image-to-video provider adapter, price-then-request; 11 Nov): Marketing › Studio › Videos.**

> নতুন (PR 482): স্টুডিও › ভিডিও — একটা প্রোডাক্টের লাইভ ছবি থেকে ক্লিপের দাম আগে দেখে, তারপর অনুরোধ করা। সেটিংসে সুইচ অফ, আর প্রতি-সেকেন্ডের রেট ০ (ঠিক করা নেই) — দুটোই মালিক নিজে বসাবেন। ভিডিও এখনো সত্যিকারের বানানো হয় না, শুধু অনুরোধ জমা হয়।

- **Adapter:** `@extas/adapters`'s new `video` kind — `mockVideoProviderAdapter` (honest preview only, no footage generated,
  matching the S23 PR 439/440 precedent) and a pure `estimateFromRate` costing function.
- **Settings:** `studio.video` (registry v282) — the engine's on/off switch and its cost-per-second rate, both off/0
  until the owner sets them (CN-018: never a guessed number).
- **Admin page:** Marketing › Studio › Videos (`/admin/marketing/studio/videos`, Lumen pattern, `marketing.studio.read`):
  pick a product/shape/length, price it, then request the clip — it sits as a `DRAFT` job ("waiting to run").
- **Guide:** `docs/admin-guide/pages/marketing/studio-videos.md`.

**Built (PR [483](docs/stages/S25.md#pr-483), image-to-video engine part 2, job orchestration; 11 Nov): queue, run, retry.**

> নতুন (PR 483): চাওয়া ক্লিপ এখন "সারিতে দিন" আর "চালান" চেপে ইঞ্জিনে পাঠানো যায়; ব্যর্থ হলে সর্বোচ্চ ৩ বার "আবার চেষ্টা করুন"। আসল প্রোভাইডার এখনো নেই, তাই ফলাফল সৎ একটা প্রিভিউ।

- **Package:** `video.ts` gains `queueVideoJob` (`DRAFT`→`QUEUED`), `runVideoJob` (`QUEUED`→`PROCESSING`, calls the
  provider once, lands on `REVIEW_REQUIRED` or `FAILED`, never throwing past a refusal) and `retryVideoJob`
  (`FAILED`→`QUEUED` with one more attempt, `CAP_REACHED` past `MAX_ATTEMPTS` = 3).
- **Admin page:** each job row gets its own next-move button (Queue it / Run it / Retry, with its attempt count).
- **Guide:** `docs/admin-guide/pages/marketing/studio-videos.md` (updated). **Not built yet:** PR 484–490 (best-of-2
  and review/approve from `REVIEW_REQUIRED`, reel assembly, campaign creative export, campaign overlays, the
  three-direction creative brief).

Remaining — see register PRs 484–490: [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604).

### S17 · Multi-store — Closed (owner, 6 Nov) (1/24 built, kept)

> **বন্ধ (৬ নভেম্বর, CN-036):** আপনি না বলা পর্যন্ত এই স্টেজের কাজ বন্ধ। যা বানানো আছে তা থাকবে; আধা-বানানো অংশ একটা সুইচ দিয়ে (Settings, `stages.closedShown`, শুরুতে বন্ধ) মেনু, sitemap, সার্চ আর robots থেকে লুকানো।
> Closed until the owner says so (CN-036 update, 6 Nov 2026 14:55): built parts stay; half-built parts hidden by PR 652's switch.

**Built (PR [362](docs/stages/S17.md#pr-362), the launch slice; 31 Oct, CN-031 lane B; live since 31 Oct 19:14, #69): the Cloudflare
cache rule and extra host names.**

> নতুন (PR 362): Cloudflare-এ ক্যাশের নিয়ম — ব্যাগ, চেকআউট, অ্যাকাউন্ট আর অ্যাডমিন কখনো ক্যাশ হয় না; ক্যাটাগরি আর পণ্যের পাতা ক্যাশ সেটিংস মেনে চলে। সার্ভার বাড়তি ডোমেইনও নিজের সার্টিফিকেটসহ চালাতে পারে (চালুর দিনে মূল ডোমেইন, পরে প্রতিটা দোকানের নিজের ডোমেইন)।

- **Cache rules:** "Send to Cloudflare" (PR 386) also writes the `http_request_cache_settings` phase, scoped to the shop's
  host names and merged by ref: `extas-cache-never` (bag, checkout, account, admin and API, both languages; last, so it
  wins) always, and `extas-cache-pages` (category and product pages follow their own `CDN-Cache-Control`) while Settings ›
  System › Cache keeps pages on Cloudflare (`cache.pages.cdn`). The manual Cache Rule step in the Cache guide is struck
  through (follow-up 401). The Cloudflare token also needs Cache Rules edit.
- **Extra host names:** Caddy serves server.conf `EXTAS_EXTRA_HOSTS` (empty by default) beside the staging host, each with
  its own automatic certificate — the main domain on go-live day (PR 587) and a store's own domain (S17) are one config
  line; server setup leaves out a typo and names it, never stopping Caddy; CI validates the Caddyfile with extra hosts.
- **Tests:** `packages/adapters/test/shield.test.ts`, `apps/web/src/lib/admin-edge/service.test.ts`, `api.db.test.ts`,
  `infra/tests/run.sh`.

Planned — see register PRs 356–361, 363–377, 511–512: [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604) and
[A4](docs/BLUEPRINT.md#a4-multi-store--three-stores-one-server-one-codebase).

### S18 · Compliance, security, manual — Done (15/15)

~~Planned — see register PRs 387–390: [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604).~~ Built in #73 (the Site manual, below).

**Built (PR [378](docs/stages/S18.md#pr-378), 379, 380, 381; 31 Oct, CN-031 lane B; live since 31 Oct 17:25, #68): the shop's
safety layer.**

> নতুন (PR 378–381): অন্য সাইট থেকে লুকিয়ে অনুরোধ পাঠানো বন্ধ, প্রতি ঠিকানায় অনুরোধের সীমা (আপাতত শুধু লিখে রাখে), পাতার নিরাপত্তা নিয়ম; কোনো ক্যাপচা ছাড়াই নীরবে বট ধরা (কাউকে আটকায় না); অ্যাডমিনের সাইন-ইন ও নিরাপত্তার পাতা (2FA, সেশনের সময়, ঠিকানার তালিকা, নতুন ডিভাইসে সতর্কবার্তা); প্রতিদিন প্যাকেজের দুর্বলতা খোঁজা আর আসল টাকার আগে নিরাপত্তা রিভিউ।

- **Cross-site check and request limits (PR 378):** one CSRF check in front of every API call in the proxy
  (`apps/web/src/lib/security/same-origin.ts`); only signed webhooks, payment callbacks, the ERP's signed calls, the
  internal deploy hook and the browser's policy reports pass without it, each with its own proof checked in the
  handler (a route-review test keeps every door listed). Per-address limits per kind (sign-in, checkout, shop changes,
  reports, webhooks): **observe** as shipped (a log line, never a refusal, because mobile networks share addresses);
  enforce answers 429 with Retry-After; admin calls are never counted.
- **Page protection policy (PR 378):** Content-Security-Policy on every shop and admin page from settings (report-only
  as shipped; outside sources per kind; the media origin allowed); `/api/security/csp-report` keeps only path and
  origin. Caddy: `geolocation=(self)` (the checkout's location share had been switched off by `geolocation=()`), the
  short policy always on (`object-src 'none'`, `base-uri`, `frame-ancestors`), `X-Permitted-Cross-Domain-Policies none`.
  The Next proxy accepts request bodies up to 200 MB so media uploads pass; each route still enforces its own limit.
- **Quiet bot check (PR 379):** no box to tick, no challenge page. The customer sign-in, the staff sign-in and the
  checkout send a few counts (time since the form appeared, keys / taps / clicks, the browser's automation flag; nothing
  typed, nothing personal); the server scores them per form. Observe (default) writes a `bot.signal` security event;
  off scores nothing. There is no blocking mode: the sign-in and the order always go on.
- **Settings › Sign-in & security (PR 380)** (`/admin/settings/security`, `security.read`; changes `security.write`):
  2FA required (off; the owner decides, with an advice note), idle and total session limits, the wrong-password pause,
  login alerts; the optional admin address list (off; cannot be switched on without the address it is saved from;
  break-glass `EXTAS_ADMIN_ALLOWLIST_OFF=1` on the server), enforced at every admin request, sign-in and 2FA; the shop
  protection modes of PR 378/379; your own signed-in devices with "log out everywhere else"; the latest security events
  (addresses only as a short mark). New-device staff sign-ins show in the notifications drawer. Guide:
  [`docs/admin-guide/pages/settings/security.md`](docs/admin-guide/pages/settings/security.md).
- **Dependency scan and review (PR 381):** `tools/dep-audit.mjs` (pnpm audit: what ships fails at high, the build tools
  at critical); an advisory that cannot be fixed yet is accepted in `tools/dep-audit.json` only with a reason and an
  end date at most 90 days on (then the build fails again). CI job `deps`, needed by `web` (no deploy over a finding),
  and every night. Accepted today: deepmerge-ts (Prisma CLI) and tinypool (vitest 3, test runner only), until
  2027-01-29. [`docs/security/REVIEW.md`](docs/security/REVIEW.md): the review the payment gateways' live keys wait for
  (checks, list R1–R14, findings, sign-off; checklist SC11, SC12). An outside expert is the owner's choice (BLOCKED 21).
- **Settings:** registry v73 (`registry-web-security.ts`), v74 (`registry-bot-check.ts`), v78
  (`registry-admin-access.ts`: `security.adminIpAllowlist`, `security.newLoginNoteDays`, `security.eventsListSize`).
- **Tests:** `apps/web/src/lib/security/*.test.ts` (CSP, reports, the gate, route review, bot check),
  `packages/auth/test/ip-allow.test.ts`, `apps/web/src/lib/admin-security/api.db.test.ts`, the checkout DB test (an
  automated-looking order still goes through and gets its note), `tools/dep-audit.test.mjs`; the security page checked
  in a real browser at 390, 768, 1366 and 1920 px.
- **No eval in the browser (PR 378 follow-up, #69):** the report-only CSP had logged "script-src stopped eval" on the Smart
  Rules, combo and build-your-own pages — Zod 4's one-time `new Function` probe. `apps/web/src/instrumentation-client.ts`
  sets Zod jitless before the page wakes up (same answers, no eval), so the policy can be enforced; a test beside it.
- **Request body limit (PR 378 follow-up, #72):** Caddy answers 413 above server.conf `CADDY_BODY_MAX_MB` (25) and, on the
  admin's file uploads, `CADDY_UPLOAD_MAX_MB` (30), before Next's proxy holds the body in memory; keep the media upload
  limit (`media.upload.maxBytes`) under `CADDY_UPLOAD_MAX_MB` (follow-up 618). The sign-in code's tries are taken
  atomically (PR 130).
- **Enforce without breaking the smoke test (PR 378 follow-up, 6 Nov, #85, CN-036):** in `enforce`, a browser report over its
  limit (`/api/shop/vitals`, `/api/problems`, the CSP report, `/api/shop/track`) is answered 204 and dropped, so the smoke
  test's speed beacons from the server's one address (and many phones behind one mobile address) are never failed
  requests; sign-in, checkout, shop changes and webhooks keep 429 with Retry-After. The owner OK'd enforce (CN-036): it is
  switched on once with `store-settings.yml` after this is deployed, and the go-live row `rateLimit` turns green.

**Built (PR [382](docs/stages/S18.md#pr-382), 383, 384, 385, 386; 31 Oct, CN-031 lane B; live since 31 Oct 19:14, #69): privacy,
the shop's legal words and the last line of defence.**

> নতুন (PR 382–386): প্রাইভেসির পাতা আর কাস্টমারের তথ্য মোছা (শুরুতে বন্ধ, মোছেন শুধু মালিক); দোকানের আইনি নম্বর এক পাতায়, বানানো লেখা কখনো দোকানে যায় না; হেল্প পাতার লেখা সেটিংস থেকে, স্মার্ট রুলের সংখ্যা নিজে বসে; ব্লবের ব্যাকআপ লকের ব্যবস্থা (আপনার সিদ্ধান্ত, BLOCKED 22) আর সার্ভার হারালে ফেরানোর গাইড; Cloudflare-এর সুরক্ষার নিয়ম শুধু দোকানের ঠিকানায়।

- **Settings › Privacy & data (PR 382)** (`/admin/settings/privacy`): how long orders keep the internet address, the device
  and a shared location (`risk.capture`, PR 159) and how often the clean-up runs, its last run, how many orders still hold
  those facts and how many are past the period; a link to Messages › Consent. Customers' erasure requests behind
  `privacy.erasureRequests` (v79, off): a request (new permission `customers.privacy`) changes nothing; only the owner
  carries one out, with the word typed (ERASE / মুছুন), never while an order is on its way. The person's profiles lose name,
  numbers, e-mail, birthday and addresses; orders keep money, lines and history without contact details; the sign-in is
  closed; the message log, consent history, security log, fraud, money and stock records stay. Audited.
- **Settings › Store details (PR 383)** (`/admin/settings/store`, the first Settings tab): registered business name, trade
  licence, DBID and VAT BIN — shown in the footer line, on invoices and on the help pages; an empty one is left out.
  `@extas/settings` `placeholder.ts` refuses filler such as "[your DBID number]", TBD or xxx on save, and the shop drops it
  wherever it reads `legal.`, `contact.` and `social.` values.
- **Settings › Policies & texts (PR 384)** (`/admin/settings/policies`): FAQ, delivery, exchange and returns, privacy, terms,
  our story and contact — each on or off, which Smart Rules text it reads, the store details, the owner's own words in Bengali
  and English. A token such as `{exchange.windowHours}` is filled on the shop from the live rule (`@extas/rules`
  `fillPolicyText`); a line that cannot be filled is left out; unknown tokens and stand-in text are refused on save.
- **Immutable backups and break-glass restore (PR 385):** server.conf `BACKUP_IMMUTABLE` ("no" as shipped). "yes" once the
  Blob container is locked: uploads go `--immutable`, the server never deletes in Blob (Drive pruning unchanged), and
  `extas-backup` proves every day that a delete is refused (an alert when it is not). `.github/workflows/restore.yml`
  (test, staging, production with the typed confirmation and the owner's OK);
  [`docs/security/BREAK-GLASS-RESTORE.md`](docs/security/BREAK-GLASS-RESTORE.md) (the lock, a key that may add and read but
  never delete, restoring when the server is lost); checklist SC13, SC14. Locking is the owner's choice (BLOCKED 22).
- **Cloudflare protection (PR 386)** (Settings › Sign-in & security › Cloudflare protection, `/admin/settings/security/edge`;
  registry v80 `edge.shield`): security level (never "under attack"), browser check, SSL Full (strict), refused robot
  addresses (`/wp-login.php`, `/.env` …), an admin sign-in page challenge (off) and an admin sign-in rate limit (off, owner
  only, since it refuses people). `@extas/adapters` `cdn/shield.ts` builds rules scoped to the shop's host names and merges
  them into the zone by ref, so every other rule (the old shop shares the zone) stays. **Send to Cloudflare** by hand (mock
  until the token is in; it needs Zone WAF and Config Rules edit); the page compares the plan with what Cloudflare holds.
  Audited `edge.shield.save`, `edge.shield.apply`.
- **Guides:** [`privacy.md`](docs/admin-guide/pages/settings/privacy.md), [`store.md`](docs/admin-guide/pages/settings/store.md),
  [`policies.md`](docs/admin-guide/pages/settings/policies.md), [`edge.md`](docs/admin-guide/pages/settings/edge.md).
- **Tests:** `packages/customers/src/erasure.db.test.ts`, `apps/web/src/lib/admin-privacy/api.db.test.ts`,
  `admin-store/api.db.test.ts`, `shop/placeholder-scan.test.ts`, `packages/settings/test/placeholder.test.ts`,
  `admin-policies/api.db.test.ts`, `packages/rules/test/policy-text.test.ts`, `packages/adapters/test/shield.test.ts`,
  `admin-edge/api.db.test.ts`, `infra/tests/run.sh` (the lock check); the pages checked in a real browser at 390, 768, 1366
  and 1920 px.

~~Planned in S18 since 1 Nov: PR 623, the customer's own privacy request from his account into the Privacy & data list
(staff approval stays; `privacy.customerRequests`, off; CN-034, After launch).~~ Built in #81 (below); S18 is done
([report](docs/reports/2026-11-06-S18.md)).

**Built (PR [623](docs/stages/S18.md#pr-623); 6 Nov, #81, After launch, CN-034): the customer's own privacy request.**
`privacy.customerRequests` (v221) ships off and shows only while `privacy.erasureRequests` is on; migration
`0132_customer_privacy_requests`.
> নতুন (#81): কাস্টমার নিজের অ্যাকাউন্টের প্রোফাইল থেকে তাঁর তথ্যের কপি বা মুছে ফেলার অনুরোধ পাঠাতে পারেন; অনুরোধ Privacy & data তালিকায় আসে, নিজে থেকে কিছু মোছে না।
- **Shop:** a "Your data" card on My account › Profile asks for a copy or for erasure (signed-in only; the same tap twice is
  one request); an approved copy is a JSON file for 7 days, every download audited.
- **Admin:** Settings › Privacy & data shows "asked from his account", "Approve copy" on a copy request and "Erase now"
  only on an erasure request; erasing stays the owner's step with the typed word (PR 382).
- Guide [settings/privacy](docs/admin-guide/pages/settings/privacy.md); DB tests in customers and the web API.

**Follow-ups (6 Nov, #81, CN-035):** the outside security review (PR 381) is a "Soon after go-live" sign-off and never
holds back the switch, the automatic checks keep running; a store detail of only spaces, or with every language blank,
counts as empty and is not shown (PR 383).

**Built (PR 620, After launch): signed calls from the ERP to the shop** (CN-028, docs/erp/site-changes-v6.md §2.7; no
migration).

> নতুন (PR 620): ERP-তে "Top products" বা "Customers" চাপলে ERP তখনই দোকানের কাছে তালিকা চায়, দোকানের নিজের গোপন কোডে সই করা থাকলে তবেই উত্তর; দোকান নিজে কিছু পাঠায় না; চাবি ও সংযোগ পাতায় সুইচ (বন্ধ) আর ঠিকানা।

- **Routes:** `GET /erp-api/top-products?from&to&limit` (Sales by SKU, `@extas/metrics` `salesBySku`: pieces, net
  sales, profit over the cost snapshot) and `GET /erp-api/customers?page&pageSize&search` (`@extas/customers`
  `erpCustomerPage`: name, address, phone, total spent = Sales, last purchase, orders, first order). Live, never pushed.
- **Signing:** `X-Extas-Signature: sha256=<hex>` over `METHOD\nPATH?QUERY\nTIMESTAMP`, constant-time, refused beyond
  `erp.siteApi.maxAgeSeconds` (300). The store is the one whose own secret verifies (CN-029 §16): the ERP connection's
  new optional third key `signingSecret`, else its webhook secret; v6 stores only; a secret two stores share is refused.
  ~~Today the mother store's key and card (Keys & connections); each store's own with PR 619.~~ Since PR 619 each
  store's own key and card, on Settings → ERP link. The query is signed as sent, percent-encoded.
- **Screen:** the "The ERP asks the shop" card on ~~`/admin/integrations`~~ `/admin/settings/erp-link?storeId=` (moved by PR 619, follow-up 524) — the base URL for the ERP, the switch
  `erp.siteApi.enabled` (per store, off; `vault.write`), the latest verified calls and the refused calls summed. Guide:
  [`docs/admin-guide/integrations.md`](docs/admin-guide/integrations.md).
- **Settings** (registry v65): `erp.siteApi.enabled`, `.maxAgeSeconds` 300, `.topProductsLimit` 20,
  `.customersPageSize` 50, `.maxRows` 100, `.maxRangeDays` 366, `.callsShown` 20, `.refusedPerMinute` 60,
  `.refusedLogMinutes` 60, `.refusedShownDays` 7, `.searchMaxChars` 100.
- Every verified call is logged as a SecurityEvent `erp.site-call` (never a customer, number or search text). A refused
  call writes nothing of its own: refusals are counted and kept as one summary `erp.site-call.refused` per
  `.refusedLogMinutes`; a call refused from the request alone reads nothing at all; past `.refusedPerMinute` refused calls
  a minute, unverified calls get 429 without a store lookup. The preview gate lets only these two GET paths through,
  matched on the raw request target case for case (Caddy gate v5; CI runs the live gate checks on a pinned Caddy
  2.10.2). Tests: `packages/adapters/test/erp-site-calls.test.ts`,
  `packages/inventory/test/erp-site-calls.db.test.ts`, `apps/web/src/lib/erp-site-api.db.test.ts`.

> নতুন (PR 387–390): সাইট ম্যানুয়াল — পুরো অ্যাডমিন একটা বইয়ের মতো, প্রতিটা পাতার কী-কেন-কীভাবে, নম্বর দেওয়া ছবি, খোঁজা, "নতুন কী এল" আর .md কপি — S18 শেষ।

**Built (PR [387](docs/stages/S18.md#pr-387), 388, 389, 390; 1 Nov, #73, After launch; B7.5, §5 HLP-01): the Site manual.**
- **The book (387):** Help & Build › Site manual (`/admin/help/manual`, `help.read`): every section a chapter in the
  sidebar's order, each page guide in its six parts, drawn from the page guides themselves; a person sees only the
  sections they hold a key in; contents beside the chapter on a computer, folded above it on a phone; a print layout.
- **Pictures (388):** `docs/admin-guide/marks.json` names the pages and the parts to mark; the smoke test takes them on
  phone and desktop after every deploy and every night; numbered rings over each part; `GET /api/admin/help/shot/<file>`
  serves only listed pictures.
- **Search and What's new (389):** `?q=` in both languages, title first, at most 30 hits; `?new=1` lists the newest built
  register PRs with their Bengali line.
- **Markdown copy (390):** `infra/deploy/manual-md.sh` writes `docs/MANUAL.md` into the server's copy of the docs on every
  deploy (never committed), carried by every backup; "Download (.md)".
- Guide [help/site-manual](docs/admin-guide/pages/help/site-manual.md); smoke pages for a chapter, a search and What's new.
- **Follow-up (#93, PR 620):** the ERP's signed calls can refuse a signature already answered
  (`erp.siteApi.refuseReplays`, registry v238, off; code REPLAYED).
- **Follow-ups (#94):** security events keep an internet address only as its short mark (382); the speed readings and
  every admin JSON body are read only up to their cap, and the Server page warns when a file size setting is above
  Caddy's upload limit (378).

### S19 · Deploy, backup, go-live — In progress (18/19)

~~Planned (CN-036, 6 Nov): PR 652 closed stages (S17, S23, unfinished S12) hidden from menu, sitemap, search and robots by a switch, and PR 653 the redirect map built read-only from the old site's public sitemap (49 addresses). Go-live after the admin look is merged and the go-live check is green, on the owner's typed "go live".~~ Built in #85 (below).

**Built (PR [652](docs/stages/S19.md#pr-652), [653](docs/stages/S19.md#pr-653); 6 Nov, #85, CN-036, Launch rows): closed stages
hidden by a switch and the redirect import from the old public sitemap.**
- **Closed stages (652):** settings registry v235 `stages.closedShown` (installation; one yes/no for each stage the owner
  closed — S15, S17, S23, S24, S25, S26, S27 — all off as shipped). `lib/stages/closed.ts` lists each stage's half-built
  parts; while a stage's switch is off its admin sections and tabs leave the menu, the admin search, the manual and the
  start pages for everyone (the owner too), and its shop addresses leave the sitemap and are disallowed in robots, in both
  languages. Today that hides the **AI Center** section and (when it is built) the round assistant button (S15); S17's
  built slice (PR 362, the Cloudflare cache rule and extra host names) is server-side and stays; S23–S27 have nothing
  built. Nothing is deleted; a stage comes back when its switch is turned on. Tests `lib/stages/closed.test.ts`,
  `registry-closed-stages.test.ts`.
- **Redirect import (653):** `redirect-import.yml` (by hand; a dry run unless `commit` is ticked) reads the old shop's
  public sitemap with GET only (47 page addresses on 6 Nov; the old WordPress site is never written) and matches each
  address to its new twin (`tools/redirect-import/map.mjs`: a product by its slug, a category or tag by its slug or its
  parent, the WooCommerce and CartFlows pages to the shop's own pages, anything else to the nearest category or the home
  page, listed for the owner). With `commit` it files them as WordPress-map rows through the redirect manager's own rules
  (`server/import.ts`: no chains, never over a live page, kept, never deleted, audited); the map forwards only once
  `seo.redirects.wordpressMapLive` is on at go-live (PR 587). The go-live check reads the map. Tests
  `tools/redirect-import/map.test.mjs`, `infra/tests/run.sh`.
- **Runbook (PR 401 follow-up, PR 233):** go-live day step 8 makes the indexing switch one step (Website › SEO, only the
  primary domain; staging keeps its password and noindex) with the robots.txt check and "Send the sitemap"; section 0
  prepares the Search Console Domain property (the owner adds Google's TXT record to the main domain's DNS); section 4
  names the redirect import.
- **Acceptance run on the runner (PR 393 follow-up, 6 Nov, #86):** `acceptance.yml` (by hand only, `allow_cod` off by
  default) runs the go-live runs one after the other on the live version (smoke, the go-live journeys, the gate orders,
  the customer-360 gate; a failing part never stops the next) and writes one summary, Bengali first, to
  `docs/reports/acceptance/latest/`. Settings › System › Go-live shows the last acceptance run and the last simulation run
  beside their sign-off rows as evidence; a run never ticks a row, a person does.
> নতুন (#85): বন্ধ স্টেজের (S15, S17, S23, S24, S25, S26, S27) আধা-বানানো অংশ একটা সুইচে লুকানো — AI Center এখন মেনুতে নেই;
> পুরনো সাইটের লিংকগুলো (47টা) নতুন পাতায় পাঠানোর তালিকা পুরনো sitemap থেকে বানানো যায়, পুরনো সাইটে কিছু না লিখে।
> **বাংলায়:** লাইভের আগে আরও 2টা কাজ: বন্ধ স্টেজ লুকানো আর পুরনো সাইটের লিংক নতুন পাতায় পাঠানো।

**Follow-ups (6 Nov, #81, CN-035): the go-live page in two groups.** "Needed before go-live" (only these hold back the
main domain's switch) and "Soon after go-live" (yellow until done), every row with its reason (PR 393); the backup row is
last night's server copy, and a yellow "Off-server backup: not connected" line sits on the Dashboard and goes once a day
to Telegram until Blob and Drive are connected (PR 391); the restore drill (PR 507), the store details and legal numbers
(PR 399, "Owner data: to fill in") and the live keys and Telegram (PR 400: cash on delivery needs no key; without an SMS
key no SMS goes) are soon-after rows. Guide [settings/go-live](docs/admin-guide/pages/settings/go-live.md).
> নতুন (#81): গো-লাইভ পাতায় দুই ভাগ — "লাইভের আগে লাগবে" আর "লাইভের পরে শিগগির"; শুধু প্রথম ভাগ মূল ডোমেইন চালু আটকায়।

**Prepared (PR [587](docs/stages/S19.md#pr-587); 6 Nov, #82, CN-035): the WordPress → new site migration, up to the
owner's "go live".** Not done: the main-domain switch waits for his go-live word (BLOCKED 25), so S19 stays 16/17 and
Launch 304/305. The go-live check (`golive-check.yml`, by hand, read-only on staging as the check account): every
Settings › System › Go-live row in its group with its state, the WordPress redirect map and its targets, every sitemap
address, the main domain's Caddy block validated open in a copy. `tools/golive-switch.mjs` shows the two `server.conf`
lines of the switch and writes them only with the typed "GO LIVE <domain>". Runbook section 4.
> নতুন (#82): পুরোনো WordPress থেকে নতুন সাইটে যাওয়ার সব প্রস্তুতি তৈরি; মূল ডোমেইন বদল শুধু আপনার "গো লাইভ" কথার পরে।

**Follow-up (6 Nov, #82, CN-035): the rollback rehearsal (PR 398).** Deploy "Go back to the previous version" on staging:
43 s to the older version answering, forward again in 3 min 31 s with its smoke test passing (408 page views), recorded
in the runbook (section 5); the go-live page's "runbook" sign-off stays a person's press.

Planned — see register PR 587 (the main-domain switch and the WordPress migration on go-live day; prepared in #82, above; ~~403~~ built 31 Oct in
#71, opened by the owner on go-live day; ~~391, 393, 394, 396–402~~ built 31 Oct; ~~backup settings and monthly restore drills,~~ built in PR 507): [Blueprint Appendix A](docs/BLUEPRINT.md#appendix-a--every-pr-1604).

**Built (PR 619): the switch-over to the ERP model and each store's own ERP link** (CN-028, CN-029 Phase 2; migration
`0057_erp_switchover`, additive; settings registry v70).

> নতুন (PR 619): প্রতিটা দোকানের নিজের ERP সংযোগের পাতা: নিজের চাবি, কী অপেক্ষায়, কত পাওনা; নতুন ERP চুক্তিতে যাওয়া আগে পরীক্ষা করে, শুধু মালিক PIN দিয়ে করেন।

- **Screen:** **Settings → ERP link** (`/admin/settings/erp-link?storeId=`, `vault.read` in that store; a store picker
  for the stores the person may open): the contract the store speaks, its open link (epoch, ERP company, switch date,
  opening balance), the store's own keys form, what was synced each way, the last summary the ERP accepted, the queues
  (orders waiting, held or failed; v5 orders kept at the switch; open exchanges; summaries waiting), the balance by both
  books, the books match state, the switch card, the "The ERP asks the shop" card (moved from Keys & connections) and
  the owner's "start a new link". Guide: [`docs/admin-guide/pages/settings/erp-link.md`](docs/admin-guide/pages/settings/erp-link.md).
- **Keys per store (CN-029):** the API key, webhook secret and signing secret go to the vault under the store id only,
  through Keys & connections' API with `?storeId=` (`apps/web/src/lib/integrations.ts`); a call with store A's key can
  never read or write store B (tests in `apps/web/src/lib/erp-link-admin.db.test.ts`). The per-store signing secret
  signs that store's v6 calls.
- **The switch-over** (`packages/inventory/src/erp-switchover.ts`): the switch date and the moved old orders from the
  ERP (`GET /switch-over`); a dry run first (`vault.write`; changes nothing but its report; counts for
  `erp.switchOver.dryRunMaxHours`, 24); then the owner alone with his books PIN and the switch date typed back: the
  opening balance, the one transfer and the moved orders booked once at the buying price, the OUT orders billed and in
  the pipeline, the month before backfilled from `GET /cost-of-goods`, customer payments, returns and ad spend never
  sent again, `erp.model` v5 → v6 with the owner's OK, the four `returns.legacy.*` switches OFF for that store (never
  deleted; the QC page says the ERP checks each piece now), a v5 order still waiting re-sent as v6 or kept for a person
  (`erp.switchOver.queuedV5Orders`), a wrong opening balance put right by a new link epoch, a handover revokes the
  store's three keys (kept, never deleted). No store is switched by the build.
- **Fresh start (CN-033, 31 Oct; #69):** the ERP does not build `GET /switch-over` and `GET /cost-of-goods`, so
  `erp.switchOver.mode` (v72, per store) is `fresh-start` as shipped: the owner, the PIN, a clean dry run and the switch date
  typed back stay; no moved orders, opening balance 0, no transfer, no cost-of-goods backfill. `erp-list` keeps the steps above
  for an ERP that offers those calls; the owner picks the way on Settings → ERP link before the switch.
- **API:** `GET/POST /api/admin/erp-link?storeId=` (`dryRun`, `switch`, `newLink`, `sendHeld`).
- **Settings** (v70): `erp.switchOver.dryRunMaxHours` 24, `erp.switchOver.queuedV5Orders` resend (per store),
  `erp.link.listShown` 20.
- Tests: `packages/inventory/test/erp-switchover.db.test.ts`, `packages/orders/src/erp-switch-resend.db.test.ts`,
  `apps/web/src/lib/erp-link-admin.db.test.ts`.

**Built (PR 621): the ERP v6 acceptance suite, a go-live gate** (CN-028; settings v70 `erp.acceptance.*`).

> নতুন (PR 621): ERP-এর সব নিয়ম আর খাতার মহড়া প্রতিটা রিলিজের আগে আর প্রতি রাতে পরীক্ষা হয়; ডেমো চাবি না থাকলে অপেক্ষা করে, কিছু আটকায় না।

- **The checks:** `runErpAcceptance` (`packages/adapters/src/erp/acceptance.ts`), 21 checks of
  `docs/erp/site-changes-v6.md` §4 (contract, catalogue, orders, deliveries, return lists, checks, Return stock,
  exchanges, summaries, fixed costs, account, the retired v5 calls, switch-over, cost of goods, signed site calls). On the
  practice ERP in CI with the ERP's own actions driven (`packages/adapters/test/erp-acceptance.test.ts`).
- **The books drills** on PostgreSQL (`packages/inventory/test/erp-acceptance-books.db.test.ts`): the switch day, the
  same webhook twice, a lost webhook, a reversal before its original, a wrong amount, hold → checkout pause → resume, a
  two-day outage, a closed day that moves, an exchange never returned, a month that must not close, the tie formula for
  every day, week, month, year and the whole life, store isolation; and the 72-hour exchange rule
  (`packages/orders/src/erp-acceptance-exchange.db.test.ts`).
- **Against the demo ERP:** every night (`.github/workflows/erp-acceptance.yml`) and before every release
  (`deploy.sh`, ~~before the migration~~ after the migration and before the new colour starts: a failed check stops the
  release before the switch) on the runner
  (`infra/deploy/erp-acceptance.sh`, `packages/jobs/src/erp-acceptance-cli.ts`). Read-only unless
  `erp.acceptance.demoWrites`; "waiting for the demo key" (nothing called, nothing failed) until the owner types it on the
  ERP link page's demo-key card (vault, installation-wide); an unreachable demo ERP or a refused key is reported, not
  failed; on the demo ERP a time-out, network error, 5xx, 429 or 404 in any check is SKIP (only a wrong figure or a
  broken answer fails), a run past the time limit is "not finished" and one that cannot read the database is "not run"
  (both reported, never a stop). Report: `docs/reports/erp-acceptance/latest/`.
- **Settings** (v70): `erp.acceptance.demoBaseUrl` https://demo.extasbd.com, `.timeoutSeconds` 20, `.demoWrites` off.

**Built (PR [392](docs/stages/S19.md#pr-392), 395, 507; 31 Oct, CN-030, CN-031 lane C; live since 31 Oct 17:25, #68): alerts and
backups from the admin.**

> নতুন (PR 392, 395, 507): টেলিগ্রামে সার্ভারের সতর্কবার্তা (চাবি বসালে চালু); এক ক্লিকে নিজের Google Drive-এ ব্যাকআপ; ব্যাকআপের সময়, কত দিন রাখবে, এখনই ব্যাকআপ — সব অ্যাডমিন থেকে; প্রতি মাসে প্রতিটা ব্যাকআপ আলাদা জায়গায় ফিরিয়ে দেখা হয়, আসল ডাটাবেস ছোঁয়া হয় না।

- **Telegram (PR 392):** the bot token in the vault, the chat id on the connection (Keys & connections). The mock keeps
  alerts until the Test (getMe + getChat, sends nothing) passes; no answer ever carries the token. The server's scripts
  get their keys from the vault: `infra/server/bin/extas-vault-sync` (every `VAULT_SYNC_EVERY_MIN` minutes, through
  `packages/jobs` `server-sync`) writes `telegram.env` (0600) only while the connection is live; an unchanged key
  decrypts nothing; `state/vault-sync.json` carries names, never values. A newly connected bot says hello once.
- **Google Drive in one click (PR 395, CN-030):** **Settings › System › Backups** (`/admin/settings/system/backups`):
  the owner's own Google client of type "TVs and Limited Input devices" (client ID and secret); **Connect Google
  Drive** shows Google's code for google.com/device (Copy, Open) and waits for Allow, then makes the folder "Extas
  E-commerce Backups" (found again on a reconnect). Scope `drive.file` only; no redirect address, no service account.
  The secret, the refresh token and the backup key live only in the vault. Disconnect, connecting over a live
  connection and changing the client need the owner's PIN; each is audited without a value and told on Telegram.
  Each upload is checked (`rclone check --one-way`, then a CHECKED marker); Drive keeps the newest `backups.drive.keepCopies`
  (3) checked copies; restore takes the newest checked one.
- **Backup settings and the restore drill (PR 507):** on the same page: the nightly time, the days the server's disk,
  Blob and Drive keep, WAL days, the free share the backup disk keeps; the monthly drill (on, day 1–28, time, Blob,
  Drive); Telegram on failure (on) and on success (off). The defaults are the server's own; a change reaches the
  server's timers at once (`backup-settings.env`). `extas-restore drill` restores the server's own copy, then Blob's and
  Drive's, each into a throw-away database, never the live one. **Back up now** and **Run the restore drill now**
  (permission `system.backup`, one open of each kind; migration `0062_backup_requests`). Nothing restores production
  here (PR 396).
- **Settings:** registry v75 (`backups.drive`), v76 (`backups.plan`, `backups.drill`, `backups.alerts`). Guide:
  [`docs/admin-guide/pages/settings/backups.md`](docs/admin-guide/pages/settings/backups.md),
  [`docs/admin-guide/backup.md`](docs/admin-guide/backup.md).
- **Tests:** `packages/adapters/test/telegram.test.ts`, `packages/jobs/src/server-sync.test.ts`, `backups.test.ts` (a
  fake Google: code, Allow, Deny, expiry, reconnect, revoked), `backup-requests.test.ts`,
  `apps/web/src/lib/backups-api.test.ts`, `infra/tests/run.sh` (the drill of each copy, requests, timers).

**Built (PR [391](docs/stages/S19.md#pr-391), 393, 394, 396–402; 31 Oct, CN-030, CN-031 lane C; live since 31 Oct 19:14, #69): ready
for real orders — backups off the server, restore, and the go-live list.**

> নতুন (PR 391–402): Azure Blob আর Google Drive-এ ব্যাকআপ (চাবি দিলে); ব্যাকআপ থেকে দোকান ফেরানো, আগে পরীক্ষার কপিতে; 'চালুর আগে' পাতা — আসল অর্ডারের আগে যা ঠিক থাকতে হবে তার তালিকা (সার্ভার, সার্টিফিকেট, আপনার তথ্য, পেমেন্ট-কুরিয়ার-SMS, Google); চালুর দিনের গাইড আর প্রথম সপ্তাহের নজর। মূল ডোমেইন বদলায় শুধু আপনার কথায় (BLOCKED 25)।

- **Blob and Drive live (PR 391):** the vault sync's `backup.env` carries the owner's Azure storage account for rclone and the
  container (`backups.blob.container`, default `extas-backups`) only while the Azure Blob connection is on and LIVE; Blob and
  Drive each work on their own. **Backups ready for real orders** on Settings › System › Backups: eight checks (last night's
  copy, Blob connected and fresh, Drive connected and fresh, both brought back by the drill, Telegram connected) with what to
  do next; registry v77 `backups.blob`, `backups.gate` (36 hours, 35 days). It only reports. Connecting: BLOCKED 23.
- **Restore (PR 396):** step 1 restores a backup (Blob, the server's disk or Drive; the newest, one picked, or a minute) into
  the check copy, never the live database (`system.backup`); step 2 puts exactly that backup on the live shop — only the
  newest check copy that passed within `RESTORE_STAGING_VALID_H` (24 h), with RESTORE typed and the owner's PIN (new
  permission `system.restore`). The old data is kept, the shop starts again, Telegram tells the owner. Migration
  `0063_restore_requests` (one open restore at a time); `extas-restore request`, `--backup`, `--confirm RESTORE`.
- **Settings › System › Go-live (PR 393)** (`/admin/settings/system/go-live`, permission `system.golive`): automatic items
  read from what the server wrote (smoke passed within 36 h, health clean within 30 min, the backups' checks), items a
  person confirms (the Appendix C QA gate, [`docs/golive/ACCEPTANCE.md`](docs/golive/ACCEPTANCE.md), a real iPhone and
  Android, the 70-order simulation; who and when kept in `golive.signoff`, audited, Undo) and the owner's own steps. It only
  reports: nothing is switched, opened or blocked, and the main domain is never switched from here.
- **The rows that joined it:** server setup (PR 394: `state/server-setup.json`, only a full run counts); the Cloudflare
  Origin certificate (PR 397: Keys & connections › "Cloudflare origin certificate", migration `0064_certificate_kind`, the
  pair checked offline and again on the server by `extas-origin-cert`, which reverts when Caddy refuses it; rows `originCert`
  and `sslStrict`); the runbook rehearsed (PR 398: [`docs/golive/RUNBOOK.md`](docs/golive/RUNBOOK.md), the switch step by
  step with its undo, rollback smallest step first); the owner's own data per live store (PR 399: `golive.ownerData`, names
  what is empty, never values; BLOCKED 24); payment, courier and SMS connections LIVE with a passing test (PR 400:
  `golive.connections`); main-domain indexing and the Search Console sign-off (PR 401); the first-week watch (PR 402:
  `golive.firstWeek`, off; started on the page, `extas-first-week` sends a daily Telegram check at 21:00 for 7 days and
  `smoke.yml` runs every 6 hours while it lasts).
- **Guides:** [`go-live.md`](docs/admin-guide/pages/settings/go-live.md), [`backups.md`](docs/admin-guide/pages/settings/backups.md),
  [`keys.md`](docs/admin-guide/pages/settings/keys.md).
- **Tests:** `apps/web/src/lib/go-live.test.ts`, `go-live-api.db.test.ts`, `backup-gate.test.ts`, `backups-api.test.ts`,
  `packages/jobs/src/server-sync.test.ts`, `restore-requests.test.ts`, `packages/adapters/test/certificate.test.ts`,
  `packages/settings/test/registry-backups.test.ts`, `infra/tests/run.sh` (restore, origin certificate, first week); the
  Backups and Go-live pages checked in a real browser at 390, 768, 1366 and 1920 px.

**Built (PR [403](docs/stages/S19.md#pr-403)) and the review round 1 fixes (31 Oct, #71): staging always locked, the main
domain on its own switch, three more go-live items.**

> নতুন (PR 403): মূল ডোমেইন খোলার আলাদা সুইচ: চালুর দিন পর্যন্ত মূল ডোমেইনে পাসওয়ার্ড আর noindex থাকে, আপনার বলা দিনে সুইচ খোলা হবে; staging সবসময় পাসওয়ার্ডে বন্ধ। 'চালুর আগে' তালিকায় নতুন তিনটা লাইন: পরীক্ষার পেমেন্ট বন্ধ কি না, অনুরোধের সীমা চালু কি না, স্টাফের দুই-ধাপের লগইন।

- **The main domain's switch (PR 403):** the staging host has its own Caddy block with the preview gate and `noindex`,
  always. The extra hosts (`EXTAS_EXTRA_HOSTS`) get `sites/hosts.caddy` (`infra/stack/caddy/hosts-block.sh`), locked the
  same way until server.conf `EXTAS_MAIN_OPEN="yes"`. It ships `"no"`; opening it is the owner's go-live day step
  (BLOCKED 25, runbook step 4). The shared access log keeps no query string, no `/pay/<token>` and no Referer.
- **Go-live list (PR 393):** the smoke item is green right after a passing smoke test (`state/smoke.json` `at` carries its
  offset). New automatic items, no owner setting flipped: `testPayments` (red while a live store has test payments on or
  offers a method still on the practice gateway), `rateLimit` (red unless `security.rateLimit.mode` is `enforce`) and
  `staffTwoFactor` (red unless every active staff member who can change things has 2FA, or 2FA is required). The guide lists them.
- **Smoke on the main domain (PR 402):** `SMOKE_HOST` (empty = staging, `main`, or one served host) and the `host` input of
  `smoke.yml`; the first-week watch tests the main domain.
- **Restore fails safe (PR 396):** room is checked before anything stops; a failed swap puts the live data back and starts
  the shop again.
- **Tests:** `infra/tests/run.sh` (the real Caddyfile: staging 401 + `noindex` while the main domain is open; the access
  log; restore with a failing copy and a full disk; smoke host), `apps/web/src/lib/go-live.test.ts`.

**Review round 2 fixes (31 Oct, #72): a restore matches the live version, the first week sends no false alerts.**

> নতুন (রিভিউ ২): ব্যাকআপ ফেরালে ডাটাবেস এখনকার ভার্সনে মিলিয়ে নেওয়া হয়, মাঝপথে থামলে আগের ডাটাবেস ফিরে আসে; মূল ডোমেইনের প্রথম সপ্তাহের পরীক্ষা আর ভুল সতর্কবার্তা পাঠায় না; নতুন ডিপ্লয় অপেক্ষায় থাকলে বাতিল হয় না।

- **Restore (PR 396):** the restored database is migrated with the live version's migrate image before the shop starts
  again; a failed migration, a cancel or a time-out puts the live database back.
- **First-week smoke (PR 402):** a smoke check may name its `host`; the preview's noindex check runs on staging only, so
  the main domain's first-week runs pass once search engines are let in.
- **Deploy queue (PR 4):** one queue group per deploy and setup run, so nothing waiting is cancelled.
- **Tests:** `infra/tests/run.sh` (restore migrate and undo on a signal, the queue groups, the smoke host kind, the
  body limits and the gated cache with a real Caddy), `tools/smoke.test.mjs`.

**PR 652 follow-up (#91, follow-up 669): a closed section says so.** A closed stage's section opened by its address
(e.g. `/admin/ai`) shows "closed by the owner for now", names the stage and offers the way back to the Dashboard (Lumen
`ClosedState`), for everyone including the owner, instead of the no-access state.
> বাংলায়: বন্ধ রাখা অংশের ঠিকানা খুললে এখন লেখা আসে "মালিক আপাতত বন্ধ রেখেছেন", "অনুমতি নেই" নয়।
- **Follow-ups (#94):** /status shows the last ERP acceptance run and the go-live checklist needs it green, with writes,
  for a v6 store (621); the ERP link page lists the store's switch runs, and a v5 order kept at the switch longer than a
  day is a "Needs you now" row (619); a push that changes only `infra/config/**` is left to server setup, not deployed
  (403).

### S26 · Installation, documentation & distribution — Parked

Parked — register PRs 513–518, built only when the owner hands the system to someone else:
[the parking lot](docs/MASTER-REGISTER.md#the-parking-lot).

### S27 · No-ERP stock module — Parked

Parked — not numbered yet; the seam is kept open by PR 497–499: [the parking lot](docs/MASTER-REGISTER.md#the-parking-lot).

---

## PR log

> **বাংলায় সংক্ষেপে:** `main`-এ যা যা মার্জ হয়েছে, নতুনটা আগে। প্রতিটা সারিতে এক লাইনে কী যোগ হলো।

Newest first. Times are Dhaka time (20 Oct 2026 unless shown). "#n" is the GitHub pull request; "direct" is a
documents-only commit to `main`; "server report" commits are written by the `server-setup` workflow.

| GitHub | Register PRs / title | Date | What it added |
|---|---|---|---|
| #131 | PR [444](docs/stages/S24.md#pr-444) | 11 Nov | S24 reopened (CN-039/CN-044 AI-2 lane): the photoshoot studio's asset foundation — a fixed role taxonomy for reference photos, an original that can only ever be role-tagged (never otherwise changed or deleted), and every AI-generated image stored as its own row linked back to the real photo it came from. A back view is never generated without a real back reference on file. |
| pending | PR [310](docs/stages/S15.md#pr-310) | 11 Nov | The Locked A5.2 data-class routing policy, in code — personal/business work never effectively reaches a free-capable connection even when picked, public/draft work may; a policy card and a data-class pill on each agent's model row, read-only. |
| #125 | PR [309](docs/stages/S15.md#pr-309) | 11 Nov | Each AI 360 agent gets its own monthly spend cap — a status pill (none/ok/warned/paused) and this month's spend against it; crossing 80% or 100% sends the owner's Telegram warning in Bengali, once per crossing per month, real and live. |
| #122 | PR [308](docs/stages/S15.md#pr-308) | 11 Nov | Each AI 360 agent gets its own schedule — always, daily at a clock time, or weekly on chosen weekdays — with a plain next-run preview; no job runner reads it yet, so it is honestly a preview only. |
| #119 | PR [440](docs/stages/S23.md#pr-440) | 11 Nov | S23: publishing adapters, part 1 (`publish.ts`) — Facebook Page and Instagram, mock until a real token passes its Test; a new account's post waits for approval, a free-running account's post can be sent straight away. Admin page gains "Posts". |
| #115 | PR [439](docs/stages/S23.md#pr-439) | 11 Nov | S23: the video assembly engine (`render.ts`) — a template + chosen products queue a render job; today's honest output is a preview (the product's own lead photo), never a fabricated file, until the server has a real compositor. Admin page gains "Generated content". |
| #114 | PR [307](docs/stages/S15.md#pr-307) | 11 Nov | Each AI 360 agent gets its own model picker — the practice writer or a Tested PR [306](docs/stages/S15.md#pr-306) connection — with Claude's own pick recommended by default and an honest note beside any change. |
| #108 | PR [438](docs/stages/S23.md#pr-438) | 11 Nov | S23: the studio's first admin page (`/admin/marketing/studio`) — PR [437](docs/stages/S23.md#pr-437)'s accounts, plus templates (`StudioTemplate`, versioned, never deleted) and a brand asset library reusing the shared Media library under a new private `studio` folder. |
| #113 | PR [306](docs/stages/S15.md#pr-306) | 11 Nov | AI 360's writer gets its first four live providers — Anthropic, OpenAI, Google and OpenRouter, each one key + one model id in Keys & connections, falling back to practice text until a connection's test passes. |
| #109 | PR [305](docs/stages/S15.md#pr-305) | 11 Nov | AI › Control room's banner now flips the business-wide `ai.enabled` master switch itself (one tap, Undo, a money-safety note while no cap is set), and each agent card gets its own "keep running even when AI is off" switch (`AiAgent.keepOnWhenMasterOff`). |
| #106 | PR [304](docs/stages/S15.md#pr-304) | 11 Nov | S15 reopened (CN-039): AI 360 home screen — the seven fixed agents, master-switch-aware status, cost from `AiUsageLedger`, last activity from `AiDiaryEntry`, a pause/resume switch (`ai.control`, audited). AI › Control room (`/admin/ai`), hidden behind `stages.closedShown` until the stage finishes. (Opened as #104; replaced by #106 after a rebase this session's git-safety rules could not force-push.) |
| #133 | PR [482](docs/stages/S25.md#pr-482) | 11 Nov | S25: the image-to-video engine's provider adapter (honest-preview mock only, no footage fabricated) and Marketing › Studio › Videos — price a clip before requesting it; the job sits `DRAFT` until PR [483](docs/stages/S25.md#pr-483) runs it. |
| #135 | PR [483](docs/stages/S25.md#pr-483) | 11 Nov | S25: image-to-video engine part 2 — job orchestration (queue/run/retry up to a cap); each job row gets its own next-move button. |
| #105 | PR [481](docs/stages/S25.md#pr-481) | 11 Nov | S25 reopened (CN-039): Marketing › Studio › Motion library — 11 seeded motion actions, add/edit/archive, `marketing.studio.*` permissions, hidden by `stages.closedShown.S25` until the stage is finished. |
| #103 | PR [437](docs/stages/S23.md#pr-437) | 11 Nov | S23 reopened (CN-039): the social & content studio's core — social accounts (add/rename/switch/daily-limit/archive, never deleted, always off and needing approval), package `@extas/studio`, settings registry v281. |
| #97 | PR [505](docs/stages/S14.md#pr-505) | 7 Nov | CN-037 go-live MUST fix: the messages journey page's channel-mode pills wrap inside 320 px and the "Also by e-mail" tick is a full 44 px tap box. |
| #97 | PR [626](docs/stages/S00.md#pr-626) | 7 Nov | CN-037 go-live MUST fix: the admin phone bottom bar is a sealed box that clips what it holds, so a waiting badge never runs it past a 320 px phone. |
| #97 | PR [616](docs/stages/S16.md#pr-616) | 7 Nov | Follow-up: a month closes with its returned pieces not checked yet listed as waiting. |
| #97 | PR [616](docs/stages/S16.md#pr-616) | 7 Nov | Follow-up: the year sign-off and a re-opened month end to end on PostgreSQL. |
| #97 | PR [598](docs/stages/S02.md#pr-598) | 7 Nov | Follow-up: the Bag tier box checked in a real browser — tier words save in both languages and the taps are 44 px. |
| #97 | PR [530](docs/stages/S12.md#pr-530) | 7 Nov | Follow-up: the Each year seasonal-page tick checked in a real browser, and a broken Bengali word in the "not ready" note is fixed. |
| #97 | PR [222](docs/stages/S11.md#pr-222) | 7 Nov | Follow-up: a product in more than one colour or size can send Google's ProductGroup variant markup. |
| #97 | PR [58](docs/stages/S02.md#pr-58) | 7 Nov | Follow-up: a site-wide size guide window from the footer, and the size guide page at `/help/size-guide`. |
| #97 | PR [505](docs/stages/S14.md#pr-505) | 7 Nov | Follow-up: a saved WhatsApp text can be sent for approval again from its template editor. |
| #97 | PR [160](docs/stages/S06.md#pr-160) | 7 Nov | Follow-up: the risk card lists the number's last orders, each linked, with a shop-fault refusal marked "Our fault · not counted". |
| #97 | PR [131](docs/stages/S04.md#pr-131) | 7 Nov | Follow-up: My account › For you shows a "Your size" card from the kept height and weight. |
| #97 | PR [175](docs/stages/S08.md#pr-175) | 7 Nov | Follow-up: Delivery › Couriers can rename and archive a courier account, with an Archived list and Bring back. |
| #97 | PR [520](docs/stages/S06.md#pr-520) | 7 Nov | Follow-up: duplicate rule H also reads the blocklist, not only the old BLOCKED entries. |
| #97 | PR [182](docs/stages/S08.md#pr-182) | 7 Nov | Follow-up: the packing step's settings get their own editor under Delivery settings › More options. |
| #96 | PR [617](docs/stages/S16.md#pr-617) | 7 Nov | Follow-up: the daily summary's handed-back pieces are net of a same-day put-back. |
| #96 | PR [618](docs/stages/S16.md#pr-618) | 7 Nov | Follow-up: an imported statement's charges become one cost entry (off). |
| #96 | PR [616](docs/stages/S16.md#pr-616) | 7 Nov | Follow-up: the books' hash chains are versioned. |
| #96 | PR [425](docs/stages/S22.md#pr-425) | 7 Nov | Follow-up: a customer's chat files are copied to the shop's storage (off). |
| #96 | PR [425](docs/stages/S22.md#pr-425) | 7 Nov | Follow-up: the channels' media download adapters behind an SSRF guard. |
| #96 | PR [615](docs/stages/S16.md#pr-615) | 7 Nov | Follow-up: the hand-back desk ticks which pieces came back. |
| #96 | PR [614](docs/stages/S08.md#pr-614) | 7 Nov | Follow-up: an exchange the ERP could not take is sent again (off). |
| #96 | PR [609](docs/stages/S01.md#pr-609) | 7 Nov | Follow-up: the order keeps and shows what the price floor held back. |
| #96 | PR [610](docs/stages/S05.md#pr-610) | 7 Nov | Follow-up: ERP orders and lines are foreign keys (migration 0177). |
| #96 | PR [257](docs/stages/S13.md#pr-257) | 7 Nov | Follow-up: a payment recorded by a person or found by the sweep sends the purchase event. |
| #96 | PR [280](docs/stages/S13.md#pr-280) | 7 Nov | Follow-up: a seasonal look brings only what its editor changes. |
| #96 | PR [280](docs/stages/S13.md#pr-280) | 7 Nov | Follow-up: a saved seasonal look can be previewed on the home page by staff. |
| #96 | PR [183](docs/stages/S08.md#pr-183) | 7 Nov | Follow-up: open packing cards are "Needs you now" lines. |
| #96 | PR [183](docs/stages/S08.md#pr-183) | 7 Nov | Follow-up: an open packing card shows on the order page. |
| #96 | PR [572](docs/stages/S03.md#pr-572) | 7 Nov | Follow-up: an indexed combo rule page carries its trail and pairs as JSON-LD. |
| #96 | PR [558](docs/stages/S04.md#pr-558) | 7 Nov | Follow-up: the checkout advance page shows asked, paid and walked away per layer. |
| #96 | PR [184](docs/stages/S08.md#pr-184) | 7 Nov | Follow-up: "Back at the shop" on a returning parcel. |
| #96 | PR [180](docs/stages/S08.md#pr-180) | 7 Nov | Follow-up: each handed-over sheet is checked against the courier's pick-up (off). |
| #96 | PR [176](docs/stages/S08.md#pr-176) | 7 Nov | Follow-up: Steadfast's and Pathao's own status calls (off). |
| #96 | PR [284](docs/stages/S14.md#pr-284) | 7 Nov | Follow-up: Customer settings cards for merges, the phone mask and the customer pages. |
| #96 | PR [502](docs/stages/S06.md#pr-502) | 7 Nov | Follow-up: a merged place lends its courier zone pair until the merge is undone. |
| #96 | PR [176](docs/stages/S08.md#pr-176) | 7 Nov | Follow-up: the practice courier's parcels live in the database. |
| #96 | PR [502](docs/stages/S06.md#pr-502) | 7 Nov | Follow-up: a place merge keeps a record and can be undone. |
| #96 | PR [177](docs/stages/S08.md#pr-177) | 7 Nov | Follow-up: a lost Pathao booking is closed from the panel. |
| #96 | PR [181](docs/stages/S08.md#pr-181) | 7 Nov | Follow-up: the print run filters by courier and category and prints the ticked parcels. |
| #96 | PR [180](docs/stages/S08.md#pr-180) | 7 Nov | Follow-up: a "Needs you now" line for parcels waiting for the handover. |
| #96 | PR [179](docs/stages/S08.md#pr-179) | 7 Nov | Follow-up: the orders list's Documents column. |
| #96 | PR [602](docs/stages/S02.md#pr-602) | 7 Nov | Follow-up: the Server page's "Cache today" card. |
| #96 | PR [159](docs/stages/S06.md#pr-159) | 7 Nov | Follow-up: the shared location on the order page and the sticker (off). |
| #96 | PR [150](docs/stages/S05.md#pr-150) | 7 Nov | Follow-up: "What happened" adds the courier's own steps. |
| #96 | PR [152](docs/stages/S05.md#pr-152) | 7 Nov | Follow-up: the bulk bar's Export (CSV) and Print invoices. |
| #96 | PR [605](docs/stages/S04.md#pr-605) | 7 Nov | Follow-up: a test server's gift trial reaches the checkout's own requests. |
| #96 | PR [100](docs/stages/S03.md#pr-100) | 7 Nov | Follow-up: the set builder's home row, category banner and product page line (off). |
| #96 | PR [100](docs/stages/S03.md#pr-100) | 7 Nov | Follow-up: the set builder rings each style card's usual size. |
| #96 | PR [41](docs/stages/S02.md#pr-41) | 7 Nov | Follow-up: Quick add on a card marks "Your size". |
| #96 | PR [56](docs/stages/S02.md#pr-56) | 7 Nov | Follow-up: "Your size" also from a signed-in buyer's own orders. |
| #96 | PR [140](docs/stages/S05.md#pr-140) | 7 Nov | Follow-up: a cheaper order list drawn by the server. |
| #96 | PR [155](docs/stages/S05.md#pr-155) | 7 Nov | Follow-up: Reports › Orders by day, zone and payment method. |
| #96 | PR [72](docs/stages/S02.md#pr-72) | 7 Nov | Follow-up: popular search words from real searches (off). |
| #96 | PR [72](docs/stages/S02.md#pr-72) | 7 Nov | Follow-up: Reports › Searches (off). |
| #96 | PR [137](docs/stages/S04.md#pr-137) | 7 Nov | Follow-up: Settings › Policies › Privacy names what the checkout keeps. |
| #96 | PR [91](docs/stages/S03.md#pr-91) | 7 Nov | Follow-up: the set page's rules card reads today's delivery bands and payment methods. |
| #96 | PR [65](docs/stages/S02.md#pr-65) | 7 Nov | Follow-up: Products › Reviews › Import older reviews from a CSV. |
| #96 | PR [65](docs/stages/S02.md#pr-65) | 7 Nov | Follow-up: the shop's public reply under a review (off). |
| #96 | PR [66](docs/stages/S02.md#pr-66) | 7 Nov | Follow-up: "Ask a question" on the product page (off). |
| #96 | PR [66](docs/stages/S02.md#pr-66) | 7 Nov | Follow-up: Products › Reviews › Questions: answer, publish, hide and archive questions. |
| #95 | PR [602](docs/stages/S02.md#pr-602) | 7 Nov | Follow-up: the preview's pages tell Cloudflare not to inject its own scripts (the batch 18 rollback). |
| #94 | PR [275](docs/stages/S13.md#pr-275) | 7 Nov | Follow-up: the unfinished checkout's offer goes only while its code is usable now. |
| #94 | PR [275](docs/stages/S13.md#pr-275) | 7 Nov | Follow-up: a link preview robot on the bag-back link gets no bag. |
| #94 | PR [225](docs/stages/S11.md#pr-225) | 7 Nov | Follow-up: the size chart's text is in the product page's first HTML. |
| #94 | PR [273](docs/stages/S13.md#pr-273) | 7 Nov | Follow-up: the bag is read for the signed-in customer. |
| #94 | PR [421](docs/stages/S21.md#pr-421) | 7 Nov | Follow-up: the read-only check account no longer writes on Run history or Fixes. |
| #94 | PR [403](docs/stages/S19.md#pr-403) | 7 Nov | Follow-up: a push that changes only infra/config is left to server setup. |
| #94 | PR [378](docs/stages/S18.md#pr-378) | 7 Nov | Follow-up: the Server page warns when a file size setting is above Caddy's upload limit. |
| #94 | PR [6](docs/stages/S0A.md#pr-6) | 7 Nov | Follow-up: a worker that does not know a job puts it back for another worker. |
| #94 | PR [4](docs/stages/S0A.md#pr-4) | 7 Nov | Follow-up: the smoke test opens My orders, the bulk-order page and the bag's test page. |
| #94 | PR [15](docs/stages/S00.md#pr-15) | 7 Nov | Follow-up: wrong admin passwords can pause the e-mail only for their network (off). |
| #94 | PR [378](docs/stages/S18.md#pr-378) | 7 Nov | Follow-up: the speed readings and admin JSON bodies are read only up to their cap. |
| #94 | PR [167](docs/stages/S07.md#pr-167) | 7 Nov | Follow-up: the adapters turn minor units into amounts with the currency's own digits. |
| #94 | PR [257](docs/stages/S13.md#pr-257) | 7 Nov | Follow-up: the purchase event goes from the payment for a prepaid or advance order. |
| #94 | PR [6](docs/stages/S0A.md#pr-6) | 7 Nov | Fix: the daily audience, ad spend and money report runs put their day in the run key. |
| #94 | PR [257](docs/stages/S13.md#pr-257) | 7 Nov | Follow-up: the worker sweeps waiting tracked events once an hour. |
| #94 | PR [588](docs/stages/S11.md#pr-588) | 7 Nov | Follow-up: the language switch marks Bengali "coming soon" while the gate is on. |
| #94 | PR [423](docs/stages/S21.md#pr-423) | 7 Nov | Follow-up: browser reports over their limit are dropped in observe mode too. |
| #94 | PR [423](docs/stages/S21.md#pr-423) | 7 Nov | Follow-up: a fixed problem that comes back can open again by itself (off). |
| #94 | PR [234](docs/stages/S11.md#pr-234) | 7 Nov | Follow-up: the shop's own test browsers' speed readings are counted apart. |
| #94 | PR [382](docs/stages/S18.md#pr-382) | 7 Nov | Follow-up: security events keep an internet address only as its short mark. |
| #94 | PR [619](docs/stages/S19.md#pr-619) | 7 Nov | Follow-up: a v5 order kept at the switch over a day is a "Needs you now" row. |
| #94 | PR [619](docs/stages/S19.md#pr-619) | 7 Nov | Follow-up: the ERP link page lists the store's switch runs. |
| #94 | PR [621](docs/stages/S19.md#pr-621) | 7 Nov | Follow-up: the go-live checklist needs the ERP acceptance run green, with writes. |
| #94 | PR [621](docs/stages/S19.md#pr-621) | 7 Nov | Follow-up: the status page shows the last ERP acceptance run. |
| #94 | PR [617](docs/stages/S16.md#pr-617) | 7 Nov | Follow-up: the nightly smoke alerts when a summary or month waited for the ERP over a day. |
| #94 | PR [618](docs/stages/S16.md#pr-618) | 7 Nov | Follow-up: the daily cost lines get their own permission. |
| #94 | PR [502](docs/stages/S06.md#pr-502) | 7 Nov | Follow-up: the owner's names and merges of a place are columns on GeoArea (migration 0165). |
| #94 | PR [284](docs/stages/S14.md#pr-284) | 7 Nov | Follow-up: the sample seed gives the sample customer a "Same person?" pair. |
| #94 | PR [286](docs/stages/S14.md#pr-286) | 7 Nov | Follow-up: "Who looked at this customer" folds repeated opens into one line (off). |
| #94 | PR [285](docs/stages/S14.md#pr-285) | 7 Nov | Follow-up: a district filter on the Customers list. |
| #94 | PR [180](docs/stages/S08.md#pr-180) | 7 Nov | Follow-up: "A reason is needed" says what to do on its screen. |
| #94 | PR [526](docs/stages/S08.md#pr-526) | 7 Nov | Follow-up: "Change the reason" on a returned parcel with a recorded reason. |
| #94 | PR [560](docs/stages/S04.md#pr-560) | 7 Nov | Follow-up: the thank-you page and his order page say what he paid ahead on a COD order. |
| #94 | PR [576](docs/stages/S03.md#pr-576) | 7 Nov | Follow-up: the combo matrix measures tap size by hit area. |
| #94 | PR [574](docs/stages/S03.md#pr-574) | 7 Nov | Follow-up: a replaced set keeps its place in the bag. |
| #94 | PR [541](docs/stages/S05.md#pr-541) | 7 Nov | Follow-up: the list, the order page and the bulk skip name what the review is. |
| #94 | PR [541](docs/stages/S05.md#pr-541) | 7 Nov | Follow-up: a paid prepaid order nothing flagged confirms by itself (off). |
| #94 | PR [605](docs/stages/S04.md#pr-605) | 7 Nov | Follow-up: the gift on the admin order screen and in the ERP order document (off). |
| #94 | PR [127](docs/stages/S04.md#pr-127) | 7 Nov | Follow-up: "Add a line" and "Remove" on the admin order screen. |
| #94 | PR [495](docs/stages/S00.md#pr-495) | 7 Nov | Follow-up: Settings › More › Start & search. |
| #94 | PR [93](docs/stages/S03.md#pr-93) | 7 Nov | Follow-up: the combo page's set picture is the owner's set photo when the colours match. |
| #94 | PR [12](docs/stages/S00.md#pr-12) | 7 Nov | Follow-up: the palette's recent pages and the "g d / g o" key jumps (off). |
| #94 | PR [65](docs/stages/S02.md#pr-65) | 7 Nov | Follow-up: the photo reward's figure beside "Rate & review", by the form's rule. |
| #94 | PR [65](docs/stages/S02.md#pr-65) | 7 Nov | Follow-up: "Rate & review" on delivered order cards and the thank-you page. |
| #94 | PR [128](docs/stages/S04.md#pr-128) | 7 Nov | Follow-up: "Complete your look" on his order page while the add-on window is open. |
| #94 | PR [605](docs/stages/S04.md#pr-605) | 7 Nov | Follow-up: "Send as a gift" on the product page too. |
| #94 | PR [72](docs/stages/S02.md#pr-72) | 7 Nov | Follow-up: the device gate measures search's delivery answer with a sample delivery rule. |
| #93 | PR [40](docs/stages/S02.md#pr-40) | 7 Nov | Follow-up: the computer's nav fits beside a long slogan (categories fold first, then the slogan steps down). |
| #93 | PR [526](docs/stages/S08.md#pr-526) | 7 Nov | Follow-up: the hold and cancel reasons start on an empty "Pick a reason". |
| #93 | PR [546](docs/stages/S05.md#pr-546) | 7 Nov | Follow-up: his cancelled order's page says why and names the order that goes ahead. |
| #93 | PR [150](docs/stages/S05.md#pr-150) | 7 Nov | Follow-up: My account's order history on Customers › Customer settings. |
| #93 | PR [150](docs/stages/S05.md#pr-150) | 7 Nov | Follow-up: the device gate measures the order history pager. |
| #93 | PR [150](docs/stages/S05.md#pr-150) | 7 Nov | Follow-up: "What happened" names the pieces in Bengali on the Bengali page. |
| #93 | PR [282](docs/stages/S13.md#pr-282) | 7 Nov | Follow-up: the calendar's bars view text at 14 px. |
| #93 | PR [80](docs/stages/S02.md#pr-80) | 7 Nov | Follow-up: the demo's eye-toggle parts behind their own switches (off). |
| #93 | PR [281](docs/stages/S13.md#pr-281) | 7 Nov | Follow-up: the festive cut-off line never names another area's later time. |
| #93 | PR [617](docs/stages/S16.md#pr-617) | 7 Nov | Follow-up: a Daily summary day opens that day's lines with their sources. |
| #93 | PR [617](docs/stages/S16.md#pr-617) | 7 Nov | Follow-up: the Daily summary says "Waiting for the ERP key" on the practice ERP. |
| #93 | PR [615](docs/stages/S16.md#pr-615) | 7 Nov | Follow-up: a pipeline move locks its piece, so two runs never write a stale move. |
| #93 | PR [614](docs/stages/S08.md#pr-614) | 7 Nov | Follow-up: an exchange's replacing piece goes to the ERP with its own grade. |
| #93 | PR [610](docs/stages/S05.md#pr-610) | 7 Nov | Follow-up: orders the ERP keeps refusing raise one alert after the owner's hours (off). |
| #93 | PR [611](docs/stages/S08.md#pr-611) | 7 Nov | Follow-up: the Partial delivery box starts from the shop's door record. |
| #93 | PR [610](docs/stages/S05.md#pr-610) | 7 Nov | Follow-up: shop-price.changed lets the SKU sell again and sends its held orders. |
| #93 | PR [609](docs/stages/S01.md#pr-609) | 7 Nov | Follow-up: the offer editor says beforehand that a discount stops at the floor. |
| #93 | PR [620](docs/stages/S18.md#pr-620) | 7 Nov | Follow-up: the ERP's signed calls can refuse a replayed signature (off). |
| #93 | PR [609](docs/stages/S01.md#pr-609) | 7 Nov | Follow-up: "Buying prices that changed" names the sets now below the floor. |
| #93 | PR [609](docs/stages/S01.md#pr-609) | 7 Nov | Follow-up: the rules simulator prices with the selling-price floor. |
| #93 | PR [425](docs/stages/S22.md#pr-425) | 7 Nov | Follow-up: Support in "Needs you now" and the sidebar badge. |
| #93 | PR [407](docs/stages/S20.md#pr-407) | 7 Nov | Follow-up: a settings card's refused save says why, in the admin's language. |
| #93 | PR [425](docs/stages/S22.md#pr-425) | 7 Nov | Follow-up: edit a chat's subject and link or unlink its order, each logged. |
| #93 | PR [425](docs/stages/S22.md#pr-425) | 7 Nov | Follow-up: the chat's customer card shows his exchanges and the team's notes. |
| #93 | PR [425](docs/stages/S22.md#pr-425) | 7 Nov | Follow-up: chat files never show in the media library or the pickers. |
| #93 | PR [407](docs/stages/S20.md#pr-407) | 7 Nov | Follow-up: "Print invoice" on the order page: paper, roll or picture. |
| #93 | PR [98](docs/stages/S03.md#pr-98) | 7 Nov | Follow-up: the bag tier box leads to its rule's set builder page while the builder is open. |
| #93 | PR [146](docs/stages/S05.md#pr-146) | 7 Nov | Follow-up: "2 sizes — check" as an order-list view, a "Needs you now" row and in the badge. |
| #93 | PR [140](docs/stages/S05.md#pr-140) | 7 Nov | Follow-up: orders awaiting their advance in "Needs you now" and the Orders badge. |
| #93 | PR [91](docs/stages/S03.md#pr-91) | 7 Nov | Follow-up: a renamed combo link forwards from its old link. |
| #93 | PR [56](docs/stages/S02.md#pr-56) | 7 Nov | Follow-up: a long size word steps down, then takes two lines, never "…". |
| #93 | PR [85](docs/stages/S02.md#pr-85) | 7 Nov | Follow-up: the device gate measures the header slogan and footer with a long sample slogan. |
| #93 | PR [41](docs/stages/S02.md#pr-41) | 7 Nov | Follow-up: the search results get the cards' back view, Quick add and the added-to-bag panel. |
| #93 | PR [72](docs/stages/S02.md#pr-72) | 7 Nov | Follow-up: ↑ / ↓ move through the search suggestions, Enter opens one. |
| #93 | PR [49](docs/stages/S02.md#pr-49) | 7 Nov | Follow-up: the computer's slim buy bar shows the product's rating. |
| #93 | PR [43](docs/stages/S02.md#pr-43) | 7 Nov | Follow-up: the device gate measures the hero pins after the slider fits them. |
| #93 | PR [153](docs/stages/S05.md#pr-153) | 7 Nov | Follow-up: the order timers run on the worker once an hour while one is on. |
| #93 | PR [110](docs/stages/S04.md#pr-110) | 7 Nov | Follow-up: "Help me pick my size" in the bag offers Find My Size on the product. |
| #92 | PR [83](docs/stages/S02.md#pr-83) | 6 Nov | Follow-up: an A/B test counts a raised quantity as "added to the bag". |
| #92 | PR [532](docs/stages/S13.md#pr-532) | 6 Nov | Follow-up: the thank-you page can share the order's server event ids (off). |
| #92 | PR [532](docs/stages/S13.md#pr-532) | 6 Nov | Follow-up: a returned parcel withdraws GA4's purchase (off). |
| #92 | PR [532](docs/stages/S13.md#pr-532) | 6 Nov | Follow-up: the deep feed keeps an event's extra data from its first send. |
| #92 | PR [589](docs/stages/S13.md#pr-589) | 6 Nov | Follow-up: Merchant feed: the struck price, gender and age group (off, empty). |
| #92 | PR [85](docs/stages/S02.md#pr-85) | 6 Nov | Follow-up: a local gate run at 127.0.0.1 runs the shop's scripts; NO-SCRIPTS verdict. |
| #92 | PR [589](docs/stages/S13.md#pr-589) | 6 Nov | Follow-up: the Merchant feed page's card text at 14 px. |
| #92 | PR [592](docs/stages/S12.md#pr-592) | 6 Nov | Follow-up: the House ads pages' card text at 14 px. |
| #92 | PR [589](docs/stages/S13.md#pr-589) | 6 Nov | Follow-up: Merchant feed: one item per size and colour (off). |
| #92 | PR [592](docs/stages/S12.md#pr-592) | 6 Nov | Follow-up: house ad views counted per place, with the click rate. |
| #92 | PR [592](docs/stages/S12.md#pr-592) | 6 Nov | Follow-up: the journal as a full section: tags, author and reviewer pages, search, RSS. |
| #92 | PR [258](docs/stages/S13.md#pr-258) | 6 Nov | Follow-up: the delivered-purchase run reads the whole window, page by page. |
| #92 | PR [282](docs/stages/S13.md#pr-282) | 6 Nov | Follow-up: Marketing calendar: the month grid at 14 px, wrapping names, 44 px links. |
| #92 | PR [532](docs/stages/S13.md#pr-532) | 6 Nov | Follow-up: the deep feed run reads the whole window, page by page. |
| #92 | PR [282](docs/stages/S13.md#pr-282) | 6 Nov | Follow-up: Marketing calendar: a plan line names its campaign; month grid view. |
| #92 | PR [283](docs/stages/S13.md#pr-283) | 6 Nov | Follow-up: Marketing report: CSV download, spend over every send, sends paged. |
| #92 | PR [280](docs/stages/S13.md#pr-280) | 6 Nov | Follow-up: bell notes when a seasonal home window starts or ends (off). |
| #92 | PR [249](docs/stages/S12.md#pr-249) | 6 Nov | Follow-up: the article's language switch lands on the twin article's own link. |
| #92 | PR [281](docs/stages/S13.md#pr-281) | 6 Nov | Follow-up: the bag says the festive cut-off. |
| #92 | PR [281](docs/stages/S13.md#pr-281) | 6 Nov | Follow-up: the receipt's promise stops at the festive cut-off. |
| #92 | PR [281](docs/stages/S13.md#pr-281) | 6 Nov | Follow-up: the order's late flag knows the festive cut-off. |
| #92 | PR [280](docs/stages/S13.md#pr-280) | 6 Nov | Follow-up: Seasonal home: Launch default never handles a home look (db test). |
| #92 | PR [280](docs/stages/S13.md#pr-280) | 6 Nov | Follow-up: Seasonal home: one locked transaction per save. |
| #92 | PR [597](docs/stages/S02.md#pr-597) | 6 Nov | Follow-up: Page layouts and Side canvas get "Snapshots of this page". |
| #92 | PR [595](docs/stages/S02.md#pr-595) | 6 Nov | Follow-up: the old LayoutEditor marked unused, with a guard test. |
| #92 | PR [80](docs/stages/S02.md#pr-80) | 6 Nov | Follow-up: eye-toggles: D4.1's account switches checked against the registry. |
| #92 | PR [78](docs/stages/S02.md#pr-78) | 6 Nov | Follow-up: Words & language: a number or time claim is marked "Check: number or date". |
| #92 | PR [78](docs/stages/S02.md#pr-78) | 6 Nov | Follow-up: Words & language: the admin's own words, read only. |
| #92 | PR [79](docs/stages/S02.md#pr-79) | 6 Nov | Follow-up: Edit on the shop: words with {slots} preview at once. |
| #92 | PR [78](docs/stages/S02.md#pr-78) | 6 Nov | Follow-up: Words & language: when each word last changed. |
| #92 | PR [77](docs/stages/S02.md#pr-77) | 6 Nov | Follow-up: Page layouts: product pages pick the product the previews show. |
| #92 | PR [625](docs/stages/S00.md#pr-625) | 6 Nov | Follow-up: contrast AA in light and dark for every ready accent swatch, with a token-pair test. |
| #92 | PR [634](docs/stages/S00.md#pr-634) | 6 Nov | Follow-up: the product list chips' counts at full strength. |
| #92 | PR [632](docs/stages/S00.md#pr-632) | 6 Nov | Follow-up: a view tab's count at full strength. |
| #92 | PR [628](docs/stages/S00.md#pr-628) | 6 Nov | Follow-up: a list chip's count at full strength; the list search no longer restyles the sidebar search. |
| #92 | PR [597](docs/stages/S02.md#pr-597) | 6 Nov | Follow-up: Launch default's look tags at 14 px. |
| #92 | PR [596](docs/stages/S02.md#pr-596) | 6 Nov | Follow-up: Side canvas's approval map at 14 px with a legend. |
| #92 | PR [627](docs/stages/S00.md#pr-627) | 6 Nov | Follow-up: the live preview's badge at 14 px; a test keeps the shared patterns at 14 px or more. |
| #92 | PR [625](docs/stages/S00.md#pr-625) | 6 Nov | Follow-up: the old toast's styles are gone from shell.css. |
| #92 | PR [636](docs/stages/S00.md#pr-636) | 6 Nov | Follow-up: Customers as a list + detail split from 1280 px, Previous / Next at every width. |
| #92 | PR [640](docs/stages/S00.md#pr-640) | 6 Nov | Follow-up: the blog pages' back link is a full 44 px tap. |
| #92 | PR [252](docs/stages/S12.md#pr-252) | 6 Nov | Follow-up: the Shared calendar's dates and pills at 14 px. |
| #92 | PR [630](docs/stages/S00.md#pr-630) | 6 Nov | Follow-up: the Admin look page's pills at 14 px; the section check catches small rem/em sizes. |
| #92 | PR [647](docs/stages/S00.md#pr-647) | 6 Nov | Follow-up: a settings card says "saved" through the one toast. |
| #92 | PR [645](docs/stages/S00.md#pr-645) | 6 Nov | Follow-up: Site health's figures rows are the shared summary tiles. |
| #92 | PR [644](docs/stages/S00.md#pr-644) | 6 Nov | Follow-up: the report figures rows are the shared Lumen summary tiles. |
| #91 | PR [642](docs/stages/S00.md#pr-642) | 6 Nov | Lumen section Money part 1: Overview with tiles and the cash-received chart, Cashbook, costs, the cost ledger, fees, VAT, refunds, profit. |
| #91 | PR [641](docs/stages/S00.md#pr-641) | 6 Nov | Lumen section Support: the inbox, a conversation, analytics, the support app, rider issues, settings. |
| #91 | PR [640](docs/stages/S00.md#pr-640) | 6 Nov | Lumen section Website: Page layouts, Words & language, Eye toggles, SEO and Blog & journal. |
| #91 | PR [639](docs/stages/S00.md#pr-639) | 6 Nov | Lumen section Marketing part 2: the customer messages pages. |
| #91 | PR [638](docs/stages/S00.md#pr-638) | 6 Nov | Lumen section Marketing part 1: Smart Rules, Notices, Eid dates, campaigns, audiences, ad platforms, landing and seasonal pages and the rest. |
| #91 | PR [643](docs/stages/S00.md#pr-643) | 6 Nov | Lumen section Money part 2: the books and the month end. |
| #91 | PR [644](docs/stages/S00.md#pr-644) | 6 Nov | Lumen section Reports part 1: team, delivery, customers, stopped, fraud, areas, flags, learning, experiments. |
| #91 | PR [645](docs/stages/S00.md#pr-645) | 6 Nov | Lumen section Reports part 2: Site health and its pages. |
| #91 | PR [647](docs/stages/S00.md#pr-647) | 6 Nov | Lumen section Settings: store, policies, privacy, security, Cloudflare, the ERP link, System, Keys & connections, Server. |
| #91 | PR [648](docs/stages/S00.md#pr-648) | 6 Nov | Lumen section Help: Help & manual, Build progress, a PR's card, problems, Blueprint & files. |
| #91 | PR [589](docs/stages/S13.md#pr-589) | 6 Nov | Google Merchant Center feed (`/feeds/merchant.xml`, off) and Marketing › Merchant feed. |
| #91 | PR [569](docs/stages/S13.md#pr-569) | 6 Nov | Marketing › Where to advertise: district by district advice from real deliveries and returns, advice only. |
| #91 | PR [591](docs/stages/S12.md#pr-591) | 6 Nov | Website › Blog & journal › Content pipeline: pace, queue and health (the non-AI part). |
| #91 | PR [592](docs/stages/S12.md#pr-592) | 6 Nov | House ads on the journal: Website › Blog & journal › House ads, places, clicks and credited orders. |
| #91 | PR [40](docs/stages/S02.md#pr-40) | 6 Nov | Follow-up: the shop's own 404 page for an unknown address, drawn on the server with HTTP 404, English and Bengali. |
| #91 | PR [235](docs/stages/S11.md#pr-235) | 6 Nov | Follow-up: the 404 report counts only addresses a shop page really answered "not found" for. |
| #91 | PR [251](docs/stages/S12.md#pr-251) | 6 Nov | Follow-up: the Comments page's back link is a 44 px tap at every width. |
| #91 | PR [597](docs/stages/S02.md#pr-597) | 6 Nov | Follow-up: the shop's hash-forward script drawn without a React warning. |
| #91 | PR [4](docs/stages/S0A.md#pr-4) | 6 Nov | Follow-up: the deploy warms every new web replica before traffic moves. |
| #91 | PR [652](docs/stages/S19.md#pr-652) | 6 Nov | Follow-up: a closed stage's section says "closed by the owner for now" instead of no access. |
| #91 | PR [251](docs/stages/S12.md#pr-251) | 6 Nov | Follow-up: a shown or hidden comment reaches the article on its next view; a test guards it. |
| #91 | PR [251](docs/stages/S12.md#pr-251) | 6 Nov | Follow-up: erasing a customer also clears his journal comments (archived, never deleted). |
| #91 | PR [600](docs/stages/S02.md#pr-600) | 6 Nov | On-page edit mode: the owner's bar on the shop, draft in place, Publish, undo, "Apply to phone too?" with phone checks. S02 done. |
| #91 | PR [634](docs/stages/S00.md#pr-634) | 6 Nov | Follow-up: Add product, Import from a link and Import from the ERP draw their no-access state in the ready frame; their smoke checks hold for the read-only check account; guard test for every Lumen smoke check. |
| #91 | PR [633](docs/stages/S00.md#pr-633) | 6 Nov | Follow-up: Returns › QC and Hand-back draw their no-access state with the marks their smoke checks wait for. |
| #89 | PR [414](docs/stages/S21.md#pr-414) | 6 Nov | Follow-up: the simulation plays the reviewing person for a repeat buyer's duplicate review (only his own GATE TEST orders), then books (rows 04, 33, 39, 46, 50, 67). |
| #89 | PR [414](docs/stages/S21.md#pr-414) | 6 Nov | Follow-up: the simulation reads a code's refusal from the bag page's code box, not the POST's status (row 15). |
| #89 | PR [637](docs/stages/S00.md#pr-637) | 6 Nov | Lumen section Delivery: zones, couriers, one courier and the delivery settings in the new look. |
| #89 | PR [636](docs/stages/S00.md#pr-636) | 6 Nov | Lumen section Customers: list, customer page, segments, loyalty & wallet, review, import, settings in the new look. |
| #89 | PR [635](docs/stages/S00.md#pr-635) | 6 Nov | Lumen section Products 2: stock, combos, size charts, back in stock and reviews in the new look. |
| #89 | PR [634](docs/stages/S00.md#pr-634) | 6 Nov | Lumen section Products 1: all products, add product, product page, imports, publish queue and audit in the new look. |
| #89 | PR [633](docs/stages/S00.md#pr-633) | 6 Nov | Lumen section Orders 2: packing & print and returns in the new look. |
| #89 | PR [632](docs/stages/S00.md#pr-632) | 6 Nov | Lumen section Orders 1: to confirm, call queue, incomplete, digest, all orders, order view, risk rules in the new look. |
| #89 | PR [631](docs/stages/S00.md#pr-631) | 6 Nov | Lumen section Today: hero sales, Needs you, tiles, pipeline, live feed, goal ring (registry v237 `admin.today`, goal off). |
| #89 | PR [251](docs/stages/S12.md#pr-251) | 6 Nov | Follow-up: the comment form's two messages without a stale claim; the copy-claims exceptions taken out. |
| #89 | PR [547](docs/stages/S12.md#pr-547) | 6 Nov | The journal's main photo from the shop's own pictures, products first, then the library (registry v252 `blog.images`, off). |
| #89 | PR [530](docs/stages/S12.md#pr-530) | 6 Nov | Seasonal pages come back by themselves each year, then rest again (registry v251 `marketing.seasonalReturn`, off). |
| #89 | PR [599](docs/stages/S02.md#pr-599) | 6 Nov | Help & Build › Feature requests: ask for a new feature, the build team's status, never deleted (migration 0164). |
| #89 | PR [598](docs/stages/S02.md#pr-598) | 6 Nov | Settings › Shimmer (registry v246) and Products › Combos › Bag tier box (v247); prices only read, never written. |
| #89 | PR [597](docs/stages/S02.md#pr-597) | 6 Nov | Website › More › Launch default: save the whole shop look and bring it back, every restore saved first and undoable. |
| #89 | PR [596](docs/stages/S02.md#pr-596) | 6 Nov | Website › Side canvas: zones in the empty desktop gutters, off until the owner approves the map (registry v245). |
| #89 | PR [595](docs/stages/S02.md#pr-595) | 6 Nov | Website › Page layouts: the owner's own sections on home and category pages, one category's own order (registry v244). |
| #87 | PR [253](docs/stages/S12.md#pr-253) | 6 Nov | What articles sold: the products bought after reading each article, Ordered value and Sales (`@extas/metrics` `linesByArticle`). |
| #87 | PR [252](docs/stages/S12.md#pr-252) | 6 Nov | Shared calendar on the journal's side: articles beside campaigns, ads, sends and seasonal windows; read-only. |
| #87 | PR [251](docs/stages/S12.md#pr-251) | 6 Nov | Comments under articles, or none (registry v250 `blog.comments`, off; migration 0170); the Comments queue with Show and Undo. |
| #87 | PR [83](docs/stages/S02.md#pr-83) | 6 Nov | A/B tests of words and shown/hidden parts, never prices, offers, payment or delivery (registry v243 `experiments.module`, off; migration 0163). |
| #87 | PR [81](docs/stages/S02.md#pr-81) | 6 Nov | Website › More › Eye-toggles: all 104 show/hide switches in one searchable list (permission `website.eye.write`). |
| #87 | PR [80](docs/stages/S02.md#pr-80) | 6 Nov | The eye-toggle system: 104 show/hide switches of the shop pages, each pointing at its existing setting. |
| #87 | PR [626](docs/stages/S00.md#pr-626) | 6 Nov | Follow-up: a long sidebar label wraps to two lines instead of being cut off (batch 12's device gate, Bengali at 1024 px). |
| #86 | PR [393](docs/stages/S19.md#pr-393) | 6 Nov | Follow-up: the acceptance run as a runner workflow (`acceptance.yml`); the go-live page shows the last acceptance and simulation runs beside their sign-offs. |
| #86 | PR [414](docs/stages/S21.md#pr-414) | 6 Nov | Follow-up: the 70-order simulation as a runner workflow (`simulation.yml`); a switched-off payment or courier is a SKIP, never a FAIL. |
| #86 | PR [79](docs/stages/S02.md#pr-79) | 6 Nov | Edit on the shop: tap a word on the shop page, preview, Publish (registry v242 `language.frontEdit`, off). |
| #86 | PR [78](docs/stages/S02.md#pr-78) | 6 Nov | Website › Words & language: every shop word in English and Bengali, search, filters, CSV export/import (permission `website.words.write`). |
| #86 | PR [630](docs/stages/S00.md#pr-630) | 6 Nov | Settings › Admin look: Lumen in use, ক খ গ Planned; light or dark, accent and Reduce motion per person. |
| #86 | PR [629](docs/stages/S00.md#pr-629) | 6 Nov | Lumen patterns 3: form with readiness checklist and live preview; settings switch cards. |
| #86 | PR [628](docs/stages/S00.md#pr-628) | 6 Nov | Lumen patterns 2: queue with Undo, list with chips, search and bulk bar, list + detail split. |
| #86 | PR [627](docs/stages/S00.md#pr-627) | 6 Nov | Lumen patterns 1: tiles, hero chart, the one toast with Undo only for reversible actions, empty state, skeleton (registry v236 `admin.patterns`). |
| #86 | PR [626](docs/stages/S00.md#pr-626) | 6 Nov | Lumen shell: floating sidebar, glass top bar with the moon, bell panel, phone bottom bar; AI Center hidden while S15 is closed. |
| #86 | PR [625](docs/stages/S00.md#pr-625) | 6 Nov | Lumen theme layer: every admin colour, font and motion as a token, light default, dark per person, coral accent as a setting (registry v234 `admin.theme`); hardcode guard checks admin CSS. |
| #85 | PR [77](docs/stages/S02.md#pr-77) | 6 Nov | Page layouts for the product page and the bag too (registry v241 `layout.product`, `layout.bag`). |
| #85 | PR [76](docs/stages/S02.md#pr-76) | 6 Nov | Website › Page layouts: home and category sections in the owner's order, shown or hidden, per screen (registry v240 `layout.category`; permissions `website.read`, `website.layout.write`). |
| #85 | PR [414](docs/stages/S21.md#pr-414) | 6 Nov | Follow-up: a gate check whose scenario was skipped by the shop's settings is a SKIP, not a FAIL. |
| #85 | PR [401](docs/stages/S19.md#pr-401) | 6 Nov | Follow-up: the indexing switch as one go-live step; the Search Console domain property prepared (PR [233](docs/stages/S11.md#pr-233)); the runbook names the redirect import. |
| #85 | PR [378](docs/stages/S18.md#pr-378) | 6 Nov | Follow-up: in enforce, over-limit browser reports get a quiet 204, so the smoke test never fails on its speed beacons. |
| #85 | PR [652](docs/stages/S19.md#pr-652) | 6 Nov | Closed stages hidden by a switch: S15, S17, S23, S24, S25, S26, S27 (registry v235 `stages.closedShown`, all off); the AI Center leaves the menu. |
| #85 | PR [653](docs/stages/S19.md#pr-653) | 6 Nov | Redirect import from the old shop's public sitemap (GET only) into the WordPress map, by hand, dry unless committed. |
| #85 | CN-036 update (docs) | 6 Nov | The owner's 14:55 update: S15, S17, S23, S24, S25, S26, S27 closed until he says so; order Lumen foundation ∥ S02 → S12 → S13 → the other open stages; the register recount (open 48 to build, closed 126). |
| #84 | PR [532](docs/stages/S13.md#pr-532) | 6 Nov | Deep conversion feed: shipped, returned and the qualified sale to the ad platforms, with the courier outcome and the visitor's intent, never contact details (`ads.conversionFeed`, off). |
| #84 | PR [531](docs/stages/S13.md#pr-531) | 6 Nov | Marketing › Ad platforms › New campaigns: drafts, duplicates and schedules; "Launch…" waits for the owner's approval, practice writer until a campaign-write key (`ads.campaignBuilder`, off; migration `0162`). |
| #84 | PR [283](docs/stages/S13.md#pr-283) | 6 Nov | Marketing › Report: Ordered value and Sales apart, by channel, campaign and message send, with spend and delivered ROAS; read-only (`marketing.report`, off). |
| #84 | PR [282](docs/stages/S13.md#pr-282) | 6 Nov | Marketing › Calendar: campaigns, ads, sends, seasonal home, festive cut-offs, blog and social posts day by day, plus the owner's plan lines (`marketing.calendar`, off; migration `0161`). |
| #84 | PR [281](docs/stages/S13.md#pr-281) | 6 Nov | Festive cut-off words on the home page, the product page and checkout from the festive Smart Rules (`marketing.festiveCutoff`, off). |
| #84 | PR [280](docs/stages/S13.md#pr-280) | 6 Nov | Marketing › Seasonal home: saved home-page looks shown in scheduled windows, the owner's home back by itself (`marketing.seasonalHome`, off; migration `0160`). |
| #84 | PR [40](docs/stages/S02.md#pr-40) | 6 Nov | Follow-up: the footer's payment marks show only the methods the checkout offers now (shared with "Ways to pay"). |
| #84 | PR [250](docs/stages/S12.md#pr-250) | 6 Nov | Website › Blog & journal › Performance: readers by origin and the orders each article brought, Ordered value beside Sales (`blog.performance`, counting off; migration `0150`). |
| #84 | PR [249](docs/stages/S12.md#pr-249) | 6 Nov | Article SEO: the journal's page kind, article meta and twins, BlogPosting, sitemap and "Read next" (v229, all off). |
| #84 | PR [248](docs/stages/S12.md#pr-248) | 6 Nov | Help pages found in search by their live rules, with the rule's own line as the answer. |
| #84 | PR [247](docs/stages/S12.md#pr-247) | 6 Nov | Structured help pages and "Ways to pay" at `/help/payment`: exactly what the checkout offers now; the Policies tab. |
| #84 | PR [246](docs/stages/S12.md#pr-246) | 6 Nov | Seasonal pages for Eid, winter and Puja at `/collections/<link>`, re-used each year, never a broken link (`marketing.seasonal`, off). |
| #85 | CN-036 (docs only) | 6 Nov | The owner's 6 Nov decisions: the new default admin look Lumen before go-live (PR [625–648](docs/stages/S00.md) in S00, three further looks parked 649–651), closed stages hidden by a switch (652) and the redirect import from the old public sitemap (653) in S19; the serial stage order S02 → S12 → S13 → S15 → S25 → S24; S17, S23, S26, S27 closed; three lanes; total 653 PRs (644 active, 9 parked); size report `docs/reports/2026-11-06-admin-look-size.md`. |
| #83 | PR [279](docs/stages/S13.md#pr-279) | 6 Nov | SEO outreach: the websites asked for a link and their stage; "Write to them" only opens the owner's own e-mail app (`marketing.outreach`, off; migration `0129`). |
| #83 | PR [278](docs/stages/S13.md#pr-278) | 6 Nov | Marketing › YouTube: channel and videos by link, tracked product links and the orders each video brought; nothing posted (`marketing.youtube`, off; migration `0128`). |
| #83 | PR [277](docs/stages/S13.md#pr-277) | 6 Nov | Messages › Campaigns: a campaign to a group by SMS or WhatsApp, reach and cost shown first, the shared throttle (`customers.blast`, off). |
| #83 | PR [276](docs/stages/S13.md#pr-276) | 6 Nov | Left-bag recovery for signed-in customers: one reminder, then one offer under the offer rules; two messages per bag (`orders.cartRecovery`, off; migration `0127`). |
| #83 | PR [275](docs/stages/S13.md#pr-275) | 6 Nov | Checkout follow-up: one reminder with the bag-back link, then one offer with the owner's live code; two messages ever (`orders.followUp`, off; migration `0126`). |
| #83 | PR [274](docs/stages/S13.md#pr-274) | 6 Nov | Orders › Incomplete orders: checkouts typed and left, hottest first, with the bag and the visit; nothing messages anyone (`orders.incomplete`, off; migration `0125`). |
| #83 | PR [245](docs/stages/S12.md#pr-245) | 6 Nov | Publish calendar: times per day, the month view and "Fill the free times"; an unfinished article never gets a time (`blog.schedule`). |
| #83 | PR [243](docs/stages/S12.md#pr-243) | 6 Nov | AI first draft from the brief, in its language, marked AI-assisted; the practice writer until the AI key (`blog.aiDraft`, off). |
| #83 | PR [528](docs/stages/S12.md#pr-528) | 6 Nov | Blog brief: topic, language, word count and keywords before a word is written; one per topic (`blog.brief`; migration `0149`). |
| #83 | PR [244](docs/stages/S12.md#pr-244) | 6 Nov | Approval queue: the writers' topics approved a month at a time, the digest of what was decided by itself (`blog.approval`). |
| #83 | PR [242](docs/stages/S12.md#pr-242) | 6 Nov | Topic plan: clusters, pillar and supporting articles, the missing links, topics still to write (`blog.clusters`; migration `0148`). |
| #83 | PR [241](docs/stages/S12.md#pr-241) | 6 Nov | The shop's journal: `/journal`, topic pages and article pages with live product cards; "Coming soon" while off. |
| #83 | PR [240](docs/stages/S12.md#pr-240) | 6 Nov | Website › Blog & journal: the board, the editor with the shop's own preview, Categories & authors. |
| #83 | PR [239](docs/stages/S12.md#pr-239) | 6 Nov | Article model: languages, categories, authors, the review steps and publish states; never deleted (`blog.journal`, off; migration `0147`). |
| #82 | PR [398](docs/stages/S19.md#pr-398) | 6 Nov | Follow-up (CN-035): the rollback rehearsal on staging — back to the older version in 43 s, forward again in 3 min 31 s with the smoke test passing, recorded in the runbook. |
| #82 | PR [594](docs/stages/S21.md#pr-594) | 6 Nov | Follow-up (CN-035): after a rollback the deploy report names the docs copy on the server. |
| #82 | PR [414](docs/stages/S21.md#pr-414) | 6 Nov | Follow-up (CN-035): the gates' clean-up tells the page cache when it archives the GATE TEST products; the go-live-gate journeys start five minutes after gate-orders. |
| #82 | PR [587](docs/stages/S19.md#pr-587) | 6 Nov | **Prepared, waits for the owner's go-live word** (not done): the read-only go-live check (`golive-check.yml`) and `tools/golive-switch.mjs`, which writes the main-domain switch only with the typed "GO LIVE <domain>"; runbook section 4. |
| #82 | PR [273](docs/stages/S13.md#pr-273) | 6 Nov | Referral programme: the invite code on My account › For you, the friend's first-order offer from the owner's rule, "Give reward" into the wallet after a confirm (`referrals.programme`, off; migration `0124`). |
| #82 | PR [272](docs/stages/S13.md#pr-272) | 6 Nov | Coupon limits, who and window changed from the row, a code in a link and single-use code batches as a CSV (`rules.coupons.distribution`, off). |
| #82 | PR [271](docs/stages/S13.md#pr-271) | 6 Nov | Coupon engine, fully dynamic: any offer shape behind a code from rule templates, the bag's words in plain language; every coupon made off. |
| #82 | PR [270](docs/stages/S13.md#pr-270) | 6 Nov | Ad creative briefs from a product and a campaign; "Send to the studio" after a confirm; nothing about prices or budgets changes (`ads.creativeBrief`, off). |
| #82 | PR [238](docs/stages/S11.md#pr-238) | 6 Nov | Organic report: the share of Sales from search engines, YouTube and AI assistants against the owner's target, and Search Console / Bing figures when connected (`seo.organic`). |
| #82 | PR [237](docs/stages/S11.md#pr-237) | 6 Nov | SEO health: what is missing page by page, with filters and "Open"; the smoke test checks canonical language and `#` links. |
| #82 | PR [231](docs/stages/S11.md#pr-231) | 6 Nov | Links between pages: "More collections" under a collection page (`seo.internalLinks`, off). |
| #82 | PR [230](docs/stages/S11.md#pr-230) | 6 Nov | Answer-engine pack: `/llms.txt`, the shop's summary for AI assistants from the owner's own words (`seo.answerPack`). |
| #82 | PR [226](docs/stages/S11.md#pr-226) | 6 Nov | Category SEO block: each collection's text and questions in the HTML, the questions as FAQ data while that part is on. |
| #82 | PR [225](docs/stages/S11.md#pr-225) | 6 Nov | Product page words (fabric, size, description, delivery and returns rules) in the HTML from the first response. |
| #82 | PR [224](docs/stages/S11.md#pr-224) | 6 Nov | FAQ data from the real answered questions; optional, off; Google shows no FAQ rich result since 7 May 2026. |
| #82 | PR [223](docs/stages/S11.md#pr-223) | 6 Nov | Review data only from approved, published reviews and only what the page shows; never a made-up rating (off). |
| #82 | PR [535](docs/stages/S14.md#pr-535) | 6 Nov | Legacy customer import: the old shop's CSV previewed, then brought in as history after a confirm; never overwrites, undo archives (`customers.legacyImport`, off; migration `0146`). |
| #81 | PR [534](docs/stages/S14.md#pr-534) | 6 Nov | Customer grading: the owner's own grades and a verified mark, a pill on the list, the customer page and To confirm; feeds the good-customer override only when he picks a grade (`customers.grades`, off; job `customers.grades.run`). |
| #81 | PR [383](docs/stages/S18.md#pr-383) | 6 Nov | Follow-up (CN-035): a store detail of only spaces, or every language blank, counts as empty and is not shown. |
| #81 | PR [381](docs/stages/S18.md#pr-381) | 6 Nov | Follow-up (CN-035): the outside security review is a "Soon after go-live" sign-off and never holds back the switch; the automatic checks keep running. |
| #81 | PR [400](docs/stages/S19.md#pr-400) | 6 Nov | Follow-up (CN-035): live payment, courier and SMS keys and Telegram are "Soon after go-live"; COD needs no key, no SMS key = no SMS. |
| #81 | PR [399](docs/stages/S19.md#pr-399) | 6 Nov | Follow-up (CN-035): store details, legal numbers and delivery charge are "Soon after go-live" ("Owner data: to fill in"). |
| #81 | PR [507](docs/stages/S19.md#pr-507) | 6 Nov | Follow-up (CN-035): the Blob and Drive restore drill is a "Soon after go-live" row. |
| #81 | PR [393](docs/stages/S19.md#pr-393) | 6 Nov | Follow-up (CN-035): the go-live page in "Needed before go-live" and "Soon after go-live", every row with its reason. |
| #81 | PR [391](docs/stages/S19.md#pr-391) | 6 Nov | Follow-up (CN-035): only last night's server copy is needed for real orders; a yellow "Off-server backup: not connected" line on the Dashboard and daily on Telegram. |
| #81 | PR [623](docs/stages/S18.md#pr-623) | 6 Nov | The customer's own privacy request from My account › Profile (copy or erasure) into Privacy & data; erases nothing by itself (`privacy.customerRequests`, off; CN-034; migration `0132`). |
| #81 | PR [622](docs/stages/S04.md#pr-622) | 6 Nov | Buy again: a past order's lines back in the bag at the current price and stock, sold-out sizes named, the new order tagged "Bought again from #…" (`account.reorder`, off; CN-034; migration `0131`). |
| #81 | PR [269](docs/stages/S13.md#pr-269) | 6 Nov | AI growth agent: delivered ROAS by campaign, product and district and proposals waiting once for approval; practice copies only (`ads.growthAgent`, off). |
| #81 | PR [268](docs/stages/S13.md#pr-268) | 6 Nov | Campaign pause and budget change with a confirm step; more spend waits for "Approve ad budget increases"; practice copies only (`ads.campaignControl`, off). |
| #81 | PR [267](docs/stages/S13.md#pr-267) | 6 Nov | Cost per order and per delivered order with the owner's alert rules sent to Telegram (`ads.costAlerts`, off). |
| #81 | PR [266](docs/stages/S13.md#pr-266) | 6 Nov | The owner's USD rate turns each day's dollar ad spend into taka with that day's rate; never fetched. |
| #81 | PR [265](docs/stages/S13.md#pr-265) | 6 Nov | Ad spend import per platform, campaign and day, "Import spend now" and a daily import; read only, practice copies until the keys (`ads.spendImport`, off; job `ads.spend.import`). |
| #81 | PR [533](docs/stages/S14.md#pr-533) | 6 Nov | Customer history at approval on Orders › To confirm: true deliveries, refusals, charge-paid returns and their reasons, exchanges, cancels (`customers.approvalHistory`, off). |
| #81 | PR [303](docs/stages/S14.md#pr-303) | 6 Nov | CRM report: Reports › Customers — new, returning and quiet buyers and the repeat rate, overall and per saved segment (`customers.report`, off). |
| direct | CN-035 (docs only) | 6 Nov | Go-live is no longer held by the owner's own set-up steps: the outside security review is skipped; store details, Drive and Azure backups and live keys come after go-live; the go-live page shows Needed before go-live / Soon after go-live. |
| #80 | PR [624](docs/stages/S22.md#pr-624) | 5 Nov | Messenger button on the shop beside WhatsApp, with where it was tapped, and taps on the support buttons counted (`support.messengerButton`, off; CN-034; migration `0130`). |
| #80 | PR [538](docs/stages/S22.md#pr-538) | 5 Nov | Support escalation on Telegram when nobody answers, desk hours, risky links shown as words with a danger mark (off; migration `0119`). |
| #80 | PR [436](docs/stages/S22.md#pr-436) | 5 Nov | Support analytics per channel, person and AI: timers, late tickets, chat → order and delivered Sales (migration `0118`). |
| #80 | PR [435](docs/stages/S22.md#pr-435) | 5 Nov | Support app: an installable support-only shell with push notifications, on the push mock until its key (`support.app`, off; migration `0117`). |
| #80 | PR [434](docs/stages/S22.md#pr-434) | 5 Nov | Support block list, own chats only and numbers masked in messages (off; migration `0116`; `support.block`). |
| #80 | PR [433](docs/stages/S22.md#pr-433) | 5 Nov | Follow-ups on chats without an order, rule-capped; a person sends or skips (`support.followUp`, off; migration `0115`). |
| #80 | PR [432](docs/stages/S22.md#pr-432) | 5 Nov | AI draft answers in a support chat from the order, parcel and Find My Size; a person sends (`support.drafts`, off; SIM-F-012). |
| #80 | PR [431](docs/stages/S22.md#pr-431) | 5 Nov | Support tickets: first-answer and solution timers, the Late view, late chats in the bell (`support.tickets`, off; migration `0114`). |
| #80 | PR [264](docs/stages/S13.md#pr-264) | 5 Nov | Refused-parcel exclusion list sent as a list to leave out, never a block, and the daily audience refresh (`ads.refusedExclude`, `ads.audienceRefresh`, off; migration `0123`). |
| #80 | PR [263](docs/stages/S13.md#pr-263) | 5 Nov | Value-based lookalikes from delivered sales and "Send now" to Meta, TikTok and Google as hashed numbers; practice copies until the keys (`ads.audiences`, off; migration `0122`). |
| #80 | PR [262](docs/stages/S13.md#pr-262) | 5 Nov | Audience Builder: Marketing › Audiences from real behaviour with a live count; a campaign picks one (`marketing.audiences.read/write`). |
| #80 | PR [302](docs/stages/S14.md#pr-302) | 5 Nov | Customer data retention: customers never deleted by themselves; old IPs of sign-ins, codes, bulk enquiries and consent answers cleared; "What the shop keeps" card. |
| #80 | PR [301](docs/stages/S14.md#pr-301) | 5 Nov | Birthday field capture on My account › Profile, the year only when asked; nothing sent or given (`customers.birthday`, off). |
| #80 | PR [300](docs/stages/S14.md#pr-300) | 5 Nov | Win-back campaigns: Messages › Campaigns by SMS or WhatsApp, reach and estimated cost first, scheduled by a person (`customers.winback`, off; migration `0145`). |
| #80 | PR [299](docs/stages/S14.md#pr-299) | 5 Nov | Customer export with the retention rule: a reason, a CSV of the list as shown, no address, IP or location, audited (`customers.export`, off). |
| #80 | PR [297](docs/stages/S14.md#pr-297) | 5 Nov | Customer tags and internal notes: one "Note or #tag" box on the customer page; erasure clears notes (migration `0144`; `customers.notes`). |
| #80 | PR [296](docs/stages/S14.md#pr-296) | 5 Nov | Rewards and points: points for delivered orders turned into wallet credit by the customer at the owner's rate; Customers › Loyalty & wallet, My account › Rewards (`customers.points`, off; migration `0143`). |
| #80 | PR [295](docs/stages/S14.md#pr-295) | 5 Nov | Review requests after delivery and Products › Reviews: to check, publish, hide or refuse, the average and the requests answered by channel (`reviews.requests`). |
| #80 | PR [294](docs/stages/S14.md#pr-294) | 5 Nov | Who and when to send: the saved segments ranked by recent buyers who can get offers, and the busiest hour and weekday outside quiet hours, on a draft e-mail send (`customers.sendAdvice`, off). |
| #80 | PR [293](docs/stages/S14.md#pr-293) | 5 Nov | Follow-up: Western digits in two Bengali labels of the AI writer card. |
| #79 | PR [414](docs/stages/S21.md#pr-414) | 1 Nov | Follow-up (the gates' third live run, 1 Nov 22:13 / 22:20 Dhaka, version `0f6ac8a0`): gate-orders PASS — 16 pass, 0 fail, 2 skip, 26 test orders, cash on delivery put back, the test-pay grant closed; gate-c360 115 pass, 8 fail, 27 skip. The desktop category filter, hidden by design on a category of 4 or fewer products (`category.page.fewStyles`, D-012), is now a SKIP naming that rule; any other category without a filter still fails. |
| #79 | PR [72](docs/stages/S02.md#pr-72) | 1 Nov | Follow-up (go-live gate live run 3): a misspelt general word ("shrit") is dropped on Meilisearch too, the same rule as PostgreSQL, so "pollo shrit" finds the polo (6 of gate-c360's 8 fails). |
| #78 | PR [430](docs/stages/S22.md#pr-430) | 1 Nov | Support: the Chat bag and one-press order with the chat's channel, the checkout's stock check and the owner's fraud gate ("Take advance" with its pay link) (`support.cart`, off; `support.order`). |
| #78 | PR [429](docs/stages/S22.md#pr-429) | 1 Nov | Support: the "Products" drawer sends a product card with a reference link; an order through it is credited to the chat once, never changing the price or the source (`support.catalogue`, off; migration `0113`). |
| #78 | PR [428](docs/stages/S22.md#pr-428) | 1 Nov | Support: the "Customer" card beside every chat — his orders and shares, the latest risk band, parcels on their way (`support.context`, on as it ships). |
| #78 | PR [427](docs/stages/S22.md#pr-427) | 1 Nov | Support: "Who is writing" — phone ↔ PSID ↔ customer, one person across channels, fixed by hand when wrong (`support.identity`, off; migration `0112`). |
| #78 | PR [412](docs/stages/S20.md#pr-412) | 1 Nov | The picking list shelf by shelf: each style's shelf set on the page (migration `0111`, `fulfilment.bins`) and the sort as a card (`fulfilment.picking.sort`, by category as shipped). |
| #78 | PR [411](docs/stages/S20.md#pr-411) | 1 Nov | The Pack page: filter by date or a missing document, tick orders, "Book selected" and "Print selected". |
| #78 | PR [410](docs/stages/S20.md#pr-410) | 1 Nov | The Pack page shows each order's documents (sticker, invoice, picking lists, handover sheet) and the day's summary line. |
| #78 | PR [409](docs/stages/S20.md#pr-409) | 1 Nov | Seven invoice designs with a live preview and every invoice word editable in English and Bengali (`documents.invoice.design`, classic as shipped). |
| #78 | PR [408](docs/stages/S20.md#pr-408) | 1 Nov | Print quality rules (B2.4): every document checked on what was drawn, "Print check" at every size, the shop's logo on the picking list and handover sheet (`documents.printQuality`). |
| #78 | PR [406](docs/stages/S20.md#pr-406) | 1 Nov | Orders › Packing › Handover: the "Handed over" history per courier with "Print copy" (`fulfilment.handover.history`). |
| #78 | PR [405](docs/stages/S20.md#pr-405) | 1 Nov | The picking list on screen: tap a size line to mark it pulled, "more to pull" when a new order comes after; marks kept append-only (migration `0110`). |
| #78 | PR [404](docs/stages/S20.md#pr-404) | 1 Nov | Orders › Packing › Print: the queue preview by category and the print settings on the page (what one press prints, the sticker size; stickers only as shipped). |
| #78 | PR [261](docs/stages/S13.md#pr-261) | 1 Nov | Google ads (Search, Shopping, Performance Max, YouTube) read through the Google Ads API beside Meta and TikTok; practice until the keys; nothing paused or re-budgeted. |
| #78 | PR [260](docs/stages/S13.md#pr-260) | 1 Nov | TikTok ads read through the Business API beside Meta on Marketing › Ad platforms; practice until the key; nothing paused or re-budgeted. |
| #78 | PR [259](docs/stages/S13.md#pr-259) | 1 Nov | Marketing › Ad platforms: Facebook and Instagram ads read through Meta's Marketing API (account, campaigns, ad sets), tied to our campaigns; practice until the key; nothing paused or re-budgeted. |
| #78 | PR [258](docs/stages/S13.md#pr-258) | 1 Nov | Delivered-purchase optimisation: each order's confirmation and delivery go once to the ad platforms, valued at the pieces kept; a purchase may mean the delivery (`ads.deliveredPurchase`, off). |
| #78 | PR [256](docs/stages/S13.md#pr-256) | 1 Nov | Marketing › Campaigns: audience, offer, creative, window and planned budget (a plan only, locked once started), its landing pages and the orders they brought; migration `0121`; no ad platform called. |
| #78 | PR [255](docs/stages/S13.md#pr-255) | 1 Nov | Landing page templates (four ready-made and the owner's own) and the parts library; archive and restore, never deleted. |
| #78 | PR [254](docs/stages/S13.md#pr-254) | 1 Nov | Marketing › Landing pages and the builder: pages for ads at `/l/<link>` with an order box, parts on or off in a fixed order, publish behind a confirm, never deleted; orders keep the page (`marketing.landing`, off; migration `0120`). |
| #78 | PR [355](docs/stages/S16.md#pr-355) | 1 Nov | Profit by channel: Meta, Google, YouTube and TikTok ad spend against the Sales each brought, organic and every other channel, profit after ads, the UTM words, CSV. |
| #78 | PR [354](docs/stages/S16.md#pr-354) | 1 Nov | Courier estimate in the profit: a parcel the courier has not charged yet is priced from the owner's rate card and marked an estimate (`costs.courierEstimate`, off). |
| #78 | PR [353](docs/stages/S16.md#pr-353) | 1 Nov | Returns in the profit: pieces returned after receipt come off Sales and their cost comes back; the booked return loss shown on the order, Profit & loss and profit by group. |
| #78 | PR [536](docs/stages/S16.md#pr-536) | 1 Nov | An expense entered in the shop reaches the ERP once (it was sent twice in the daily summary). |
| #78 | PR [504](docs/stages/S16.md#pr-504) | 1 Nov | Profit by group: profit by category and by style with the ad-spend share split over the lines, CSV. |
| #78 | PR [568](docs/stages/S16.md#pr-568) | 1 Nov | Reports › Sales by area: Sales, pieces, returns and the return rate by district, upazila/thana or Dhaka area, as a table, a map and a CSV. |
| #78 | PR [537](docs/stages/S16.md#pr-537) | 1 Nov | The VAT report: the VAT inside Sales by rate, category and day, goods with no rate, CSV, the same line on Profit & loss (while VAT is on). |
| #78 | PR [352](docs/stages/S16.md#pr-352) | 1 Nov | Reports › Team: what each person did in the week or month and badges for the most and for the owner's own minimums (`team.badges`, off; `staff.performance`). |
| #78 | PR [351](docs/stages/S16.md#pr-351) | 1 Nov | The money report to the owner by Telegram, daily, weekly or monthly at his time and language, the same figures as Profit & loss (`money.report`, off). |
| #78 | PR [350](docs/stages/S16.md#pr-350) | 1 Nov | Money › VAT: the owner's rates by product, category and default; VAT shown inside prices, never a price change (`vat.system`, off; `vat.manage`). |
| #78 | PR [349](docs/stages/S16.md#pr-349) | 1 Nov | Money › Profit & loss: Sales beside Ordered value, gross profit, contribution, ad spend, other and fixed costs, net profit for any period. |
| #78 | PR [348](docs/stages/S16.md#pr-348) | 1 Nov | Per-order profit card on the order page: product cost, courier, payment fees, packaging, messages and AI, and an ad-spend share (`books.read`). |
| #78 | PR [347](docs/stages/S16.md#pr-347) | 1 Nov | Money › Cost ledger › Costs report: any period by day, month or year, by service or module, AI against its cap, export. |
| #78 | PR [594](docs/stages/S21.md#pr-594) | 1 Nov | Help & Build › Build progress (the register with a card per PR), Reported problems (R-1, R-2 …, never deleted) and Blueprint & files (every docs file of the deploy's copy, search, reader, earlier copies); migration `0092`; `build.read`, `build.report`. |
| #78 | PR [417](docs/stages/S21.md#pr-417) | 1 Nov | Follow-up: the Speed test no longer fails early in a month (test only; the page is unchanged). |
| #78 | PR [293](docs/stages/S14.md#pr-293) | 1 Nov | "Write with AI" on the e-mail forms: 2 or 3 versions in the owner's own voice, the practice writer until an AI key; nothing saved or sent by itself (`customers.aiWriter`, off). |
| #78 | PR [290](docs/stages/S14.md#pr-290) | 1 Nov | Messages › E-mail: the owner's e-mail templates, sends to a saved segment at a throttle, opens, clicks, unsubscribes and orders per send, one-click unsubscribe (`customers.email`, off; migration `0142`). |
| #78 | PR [562](docs/stages/S06.md#pr-562) | 1 Nov | Follow-up: Reports › Flag outcomes in the smoke test's admin list. |
| #78 | PR [289](docs/stages/S14.md#pr-289) | 1 Nov | Messages › Automations: product-life reminder, win-back and welcome journeys with waits, checks and offer messages under his yes, quiet hours and the weekly cap (`customers.journeys`, off; migration `0141`). |
| #78 | PR [288](docs/stages/S14.md#pr-288) | 1 Nov | The customer page's Journey tab: every touch of a person newest first, no phone number in any row; Customers › More › Customer settings (`customers.journey`, off; migration `0140`). |
| #78 | PR [559](docs/stages/S06.md#pr-559) | 1 Nov | Follow-up: the phone-entry risk ping goes through the beacon and drops its answer (PR [104](docs/stages/S03.md#pr-104)'s rule). |
| #78 | PR [287](docs/stages/S14.md#pr-287) | 1 Nov | Customers › Segments: saved groups by real behaviour, counted live, reused in the Customers list (`customers.segments`, off; `customers.segments.write`). |
| #78 | PR [567](docs/stages/S06.md#pr-567) | 1 Nov | Multi-courier fraud data: Steadfast, Pathao and an aggregator behind one `FraudCheckApi` adapter, own keys in Keys & connections, practice until the Test passes, merged by the maximum (SIM-F-015). |
| #78 | PR [562](docs/stages/S06.md#pr-562) | 1 Nov | Reports › Flag outcomes (SIM-F-016): of the customers asked to pay ahead, who paid, waits, walked away or ordered without the ask, the advance collected, the layers losing customers (`risk.flagReport`, off; reads only). |
| #78 | PR [559](docs/stages/S06.md#pr-559) | 1 Nov | Phone-entry risk check: courier fraud sources asked in the background once a number is typed (`checkout.phoneRisk`, off) and the "pattern, not a slip" signal over his orders, device and identity (`risk.signals.pattern`, off; SIM-F-015). |
| #78 | PR [557](docs/stages/S06.md#pr-557) | 1 Nov | Duplicate turned into an exchange: another size of the same product and colour on its way offers "Exchange on arrival" and notes it on the earlier order's timeline; nothing on that order changes (`sizeExchange`, off). |
| #78 | PR [556](docs/stages/S06.md#pr-556) | 1 Nov | In-transit duplicate notice at checkout: this customer's order already on its way holding the same piece shows its picture and tracking link, "No need - take it out" or "I want another one"; kept with the visit's campaign; Risk rules card and report (`checkout.transitDuplicate`, off). |
| #77 | PR [414](docs/stages/S21.md#pr-414) | 1 Nov | Follow-up (the gates' second live run, 1 Nov): every report ends with a Safety net line (cash on delivery put back to its earlier value or not touched; the test-pay grant closed); a start check before every run and a sweep at the workflow's end put back what an earlier run left open; each scenario has its own time budget and a stuck one is its own FAIL row with a picture, the run goes on; the GATE TEST products sit in their own shown category (search and the wishlist need one); `payments.manual` off makes check 4 a SKIP. The 13:03Z run did not leave cash on delivery on. Local runs: gate-orders 18 scenarios with `allow_cod`: 16 pass, 0 fail, 2 skip; a forced crash and a dead job both put back; gate-c360 150 steps: 121 pass, 28 skip, 1 fail (messages, server worker only). |
| #76 | PR [414](docs/stages/S21.md#pr-414) | 1 Nov | Follow-up (the gates' first live run, 1 Nov): both go-live gate runs pay on the mock bKash through a grant for their own run only (the preview host, their own browser's cookie; closed by the shell's trap on a finish, a failure or a signal; audit lines by the system); `allow_cod` (false) is the only way a run switches cash on delivery on, put back exactly after; gate-c360 makes its own GATE TEST products with gate-orders' shared helpers; an owner's switch, a planned PR (622–624) or a by-design gap is a SKIP, never a FAIL; the UTM check reads the browser's own cookie jar. Local runs: gate-orders 18 scenarios, 24 orders on the mock bKash: 14 pass, 0 fail, 4 skip (cash on delivery off, no open coupon, delivered-parcel steps); gate-c360 150 steps: 120 pass, 27 skip, 3 fail — the unnamed-button check (fixed, desktop rerun green), one local browser crash (rerun green) and the messages step, which needs the job worker that runs only on the server. |
| #76 | PR [170](docs/stages/S07.md#pr-170) | 1 Nov | Follow-up (go-live gate): the practice gateway answers for the gate's own browser while its run's grant is open (`lib/shop/gate-run.ts`); `payments.testPayments` stays off for every real visitor and in the admin; no real key, price, discount or COD amount is touched. |
| #75 | PR [414](docs/stages/S21.md#pr-414) | 1 Nov | Follow-up (go-live gate, CN-013 phase 2, owner's OK 1 Nov): test orders on the preview — `gate-orders.yml` with a host guard, a mock-only oracle and 18 browser scenarios (baskets, last piece, bKash mock, 8 orders for one customer, all 8 divisions' addresses compared from checkout to sticker), clean-up cancels and archives, nothing deleted. |
| #75 | PR [414](docs/stages/S21.md#pr-414) | 1 Nov | Follow-up (go-live gate): the customer 360° run — `gate-c360.yml`, one test customer before, during and after an order, his account and support, on phones and a desktop in English and /bn; findings in `docs/qa/FINAL-ANALYSIS-2026-11.md`. |
| #75 | PR [257](docs/stages/S13.md#pr-257) | 1 Nov | Follow-up (customer 360° finding 1): UTM tags and ad click ids kept in a first-party cookie and written on the order; `ads.attribution` (on), card on Marketing › Tracking. |
| #75 | PR [144](docs/stages/S05.md#pr-144) | 1 Nov | Follow-up (finding 2): "Cancel this order" on the customer's order page, as `orders.cancel.customer` allows; a paid order only asks for a refund. |
| #75 | PR [75](docs/stages/S02.md#pr-75) | 1 Nov | Follow-up (finding 8): "Send us a message" on `/help/contact`, into Support › Inbox (`pages.contactForm`, off). |
| #75 | PR [425](docs/stages/S22.md#pr-425) | 1 Nov | Follow-up (finding 9): the Support inbox search finds a number typed in Bengali digits or with +880. |
| #75 | CN-034 (docs only) | 1 Nov | Three customer gaps no PR covered become After-launch PR [622](docs/stages/S04.md#pr-622) Buy again (S04), 623 the customer's privacy request (S18) and 624 a Messenger button (S22); total 624 PRs (618 active). |
| #74 | PR [414](docs/stages/S21.md#pr-414) | 1 Nov | Follow-up (go-live gate, CN-013 phase 2): a `go-live-gate` journey group that checks the simulation findings on the live preview as a visitor and the check account, as each owner's switch is set; a `group` input on the journeys workflow, kept apart from Site health. |
| #73 | PR [117](docs/stages/S04.md#pr-117) | 1 Nov | Follow-up (go-live gate SIM-F-047, CN-020 (4)): voice address at checkout, the order marked voice-entered with its recording, Speech-to-Text on its mock until the key (`checkout.voice`, off; migration `0074`). |
| #73 | PR [124](docs/stages/S04.md#pr-124) | 1 Nov | Follow-up (go-live gate SIM-F-046, CN-020 (3)): "Call me" at checkout leaves a call-back in the Support inbox (`checkout.callMe`, off). |
| #73 | PR [89](docs/stages/S03.md#pr-89) | 1 Nov | Follow-up (go-live gate SIM-F-051, CN-018 (4)): sets Fixed or Flexible (`combos.split`, off; migration `0073`): a fixed set never splits, a flexible set's split-price rule, the rider told. |
| #73 | PR [550](docs/stages/S06.md#pr-550) | 1 Nov | Follow-up (go-live gate SIM-F-048): a district's own delivery hours at checkout, on the thank-you and order pages and for the late flag (`delivery.promise.districts`, off). |
| #73 | PR [179](docs/stages/S08.md#pr-179) | 1 Nov | Follow-up (go-live gate SIM-F-048): the sticker prints a Bengali address again in Latin letters with its English area and district (`delivery.sticker.latin`, off). |
| #73 | PR [564](docs/stages/S08.md#pr-564) | 1 Nov | Charge mismatch log: the courier's charge read against its rate cards, recorded once (migration `0072`, `delivery.chargeMismatch`, off). |
| #73 | PR [193](docs/stages/S08.md#pr-193) | 1 Nov | Holiday mode and Eid order-by dates on the shop, checkout and thank-you page (go-live gate SIM-F-019); Eid pre-order through the advance path (`delivery.holiday`, off). |
| #73 | PR [192](docs/stages/S08.md#pr-192) | 1 Nov | Reports › Delivery & RTO, the RTO cost book, courier claims and Support › Rider issues (migration `0071`, all off); claims are records, refunds only requests. |
| #73 | PR [186](docs/stages/S08.md#pr-186) | 1 Nov | Exchange request from the customer's account within the window (`orders.exchange.account`, off); a person approves. |
| #73 | PR [178](docs/stages/S08.md#pr-178) | 1 Nov | Courier picked by the real cost of the parcel from each courier's rate card (`delivery.courier.selection`, off); the customer's charge never changes. |
| #73 | PR [169](docs/stages/S07.md#pr-169) | 1 Nov | Card and bank gateway (SSLCommerz) behind the gateway contract: only its VALID answer trusted, a callback must name its own session. |
| #73 | PR [168](docs/stages/S07.md#pr-168) | 1 Nov | Nagad behind the gateway contract: only Nagad's own verify trusted, the practice gateway until the keys pass the Test. |
| #73 | PR [176](docs/stages/S08.md#pr-176) | 1 Nov | Follow-up (go-live gate SIM-F-004): a parcel whose amount went stale after booking shows a red line and a one-press Re-book (the courier cancel stays by hand). |
| #73 | PR [171](docs/stages/S07.md#pr-171) | 1 Nov | Follow-up (go-live gate SIM-F-054): a customer's Wallet tab with the ledger, a hand credit or debit with its reason, "Put right" and his late orders' apology credit. |
| #73 | PR [172](docs/stages/S07.md#pr-172) | 1 Nov | Follow-up (go-live gate SIM-F-041): a returned or partly delivered prepaid parcel asks its refund as a request; Money › Refunds & wallet to approve, pay out and record it; the customer sees its state. |
| #73 | PR [570](docs/stages/S21.md#pr-570) | 1 Nov | AI › Checklist audit: every checklist group judged on the preview host on the owner's schedule (`health.audit`, off; `audit.yml`). |
| #73 | PR [424](docs/stages/S21.md#pr-424) | 1 Nov | Telegram to the owner when the smoke test or the journeys fail and when they pass again (`health.runAlerts`, off). |
| #73 | PR [422](docs/stages/S21.md#pr-422) | 1 Nov | What each test run says: a rule-based summary and up to four likely causes, AI not needed. |
| #73 | PR [421](docs/stages/S21.md#pr-421) | 1 Nov | The site auditor's sandbox: the check account keeps only read permissions, every admin write from it is refused, the test browsers get no database network. |
| #73 | PR [420](docs/stages/S21.md#pr-420) | 1 Nov | Fixes to approve: agents' auto-fixes and new skills wait for the owner's OK (`health.fixGate`, proposals off). |
| #73 | PR [419](docs/stages/S21.md#pr-419) | 1 Nov | Run history: every smoke test and journeys run kept with its findings, new vs still failing (migration `0091`). |
| #73 | PR [418](docs/stages/S21.md#pr-418) | 1 Nov | Reports › Site health › Smoke runs: the newest deploy and nightly runs with every page's picture (`health.smoke.shots` for admin pictures). |
| #73 | PR [417](docs/stages/S21.md#pr-417) | 1 Nov | Reports › Site health › Speed: the lab run against the targets, real visitors and month by month; Measure now. |
| #73 | PR [416](docs/stages/S21.md#pr-416) | 1 Nov | UI checks at phone and desktop widths in the scheduled journeys (`health.uiChecks`, off). |
| #73 | PR [415](docs/stages/S21.md#pr-415) | 1 Nov | Customer problems found by the shop's own server (5xx on the bag, checkout and payment callbacks) and the owner's Telegram alerts for them (`health.alerts`, off; migration `0090`). |
| #73 | PR [390](docs/stages/S18.md#pr-390) | 1 Nov | The Site manual as one Markdown file in the server's docs copy on every deploy and in every backup; "Download (.md)". |
| #73 | PR [389](docs/stages/S18.md#pr-389) | 1 Nov | Site manual search (both languages) and "What's new" from the register's built PRs. |
| #73 | PR [388](docs/stages/S18.md#pr-388) | 1 Nov | Site manual pictures with numbered marks, taken by the smoke test after every deploy and every night (`docs/admin-guide/marks.json`). |
| #73 | PR [387](docs/stages/S18.md#pr-387) | 1 Nov | Help & Build › Site manual: every section a chapter, every page guide in its six parts, only the sections a person may see. |
| #73 | PR [545](docs/stages/S06.md#pr-545) | 1 Nov | New-customer verification: one call task for a customer with no history, never a decline (`risk.newCustomer`, off); Orders › To confirm › Calls to make with the owner's outcomes. |
| #73 | PR [213](docs/stages/S10.md#pr-213) | 1 Nov | Follow-up (go-live gate SIM-F-050): a "first order only" coupon checked on the order history by phone number; "guests only" says what it checks. |
| #73 | PR [148](docs/stages/S05.md#pr-148) | 1 Nov | Follow-up (go-live gate SIM-F-052/F-053): four more journey notices, each off: refund paid, exchange approved, a failed delivery try, the late apology. |
| #73 | PR [505](docs/stages/S14.md#pr-505) | 1 Nov | Follow-up (go-live gate SIM-F-031, F-025/F-047): the thank-you page says only what is true; each order's messages go in the language it was placed in (`Order.lang`, migration `0083`; `messages.language` "customer"). |
| #73 | PR [543](docs/stages/S06.md#pr-543) | 1 Nov | Decision learning loop: every decision kept with its note; Reports › Decisions & learning suggests only (`risk.learning`, off). |
| #73 | PR [540](docs/stages/S06.md#pr-540) | 1 Nov | Orders › Today's digest and the approval gate: with `risk.approval` on every engine hold becomes a proposal a person decides (off). |
| #73 | PR [524](docs/stages/S06.md#pr-524) | 1 Nov | False-positive protection: a good customer is never held by the engine by itself; Reports › Stopped by the engine (`risk.goodCustomer`, `risk.stopReport`, off). |
| #73 | PR [523](docs/stages/S06.md#pr-523) | 1 Nov | Block register proposals: enough rejections propose a number, a person blocks or says "Not now" (migration `0082`, `risk.blockProposal`, off). |
| #73 | PR [522](docs/stages/S06.md#pr-522) | 1 Nov | One parcel for one person's orders, proposed for a person or grouped by the owner's setting (`risk.bundling`, off). |
| #73 | PR [164](docs/stages/S06.md#pr-164) | 1 Nov | Reports › Fraud & RTO: what each risk step caught and what became of it, the cost probably saved (an estimate) and the RTO cost book in taka (`risk.report`). |
| #73 | PR [163](docs/stages/S06.md#pr-163) | 1 Nov | Repeat refusers with the owner's terms per number (migration `0081`, `risk.refusers`, off): the terms become a "Request advance" proposal a person sends; BLOCKED 28 (the advance on a returned parcel). |
| #73 | PR [162](docs/stages/S06.md#pr-162) | 1 Nov | Blocklist with reasons and an undo on Orders › Risk rules (migration `0080`, `risk.blocklist`, off): a listed number is marked or held for a person, never cancelled or told. |
| #72 | PR [197](docs/stages/S09.md#pr-197) | 31 Oct | Follow-up (review round 2): an unpaid order's stock hold ends after `inventory.reservation.unpaidHoldHours` (v121, 24 h); open holds are renewed before they run out. |
| #72 | PR [563](docs/stages/S04.md#pr-563) | 31 Oct | Follow-up (review round 2): "Set delivery area" prices with the order's own payment method, customer, source and code, with the prepaid reward; a band that would make money due on a non-COD order past PLACED is refused. |
| #72 | PR [208](docs/stages/S10.md#pr-208) | 31 Oct | Follow-up (review round 2): the selling-price floor rounds up to the money step, so a cut held at the floor leaves no paisa. |
| #72 | PR [125](docs/stages/S04.md#pr-125) | 31 Oct | Follow-up (review round 2): an order key replays only the checkout it placed; a new bag in the same tab is asked to press Confirm again. |
| #72 | PR [130](docs/stages/S04.md#pr-130) | 31 Oct | Follow-up (review round 2): a sign-in code try is taken before the compare, atomically, so parallel guesses get no more than the set tries. |
| #72 | PR [12](docs/stages/S00.md#pr-12) | 31 Oct | Follow-up (review round 2): `/status` and the health detail only on the preview host; elsewhere 404 and a bare `{"ok":true}`. |
| #72 | PR [396](docs/stages/S19.md#pr-396) | 31 Oct | Follow-up (review round 2): a production restore migrates the restored database to the live version's schema; a cancel or time-out half way puts the live database back. |
| #72 | PR [4](docs/stages/S0A.md#pr-4) | 31 Oct | Follow-up (review round 2): every deploy and server setup run is its own queue group, so a newer commit's waiting deploy or a waiting rollback is never cancelled; four more admin pages in the smoke test. |
| #72 | PR [402](docs/stages/S19.md#pr-402) | 31 Oct | Follow-up (review round 2): the first-week smoke on the main domain skips the preview-only noindex check (a check's `host`). |
| #72 | PR [378](docs/stages/S18.md#pr-378) | 31 Oct | Follow-up (review round 2): Caddy refuses a request body above `CADDY_BODY_MAX_MB` (25) or, on uploads, `CADDY_UPLOAD_MAX_MB` (30) with 413 (server.conf). |
| #72 | PR [602](docs/stages/S02.md#pr-602) | 31 Oct | Follow-up (review round 2): a host behind the preview password never lets Cloudflare keep a page (`private, no-store`), whatever "Cloudflare keeps pages" says. |
| #71 | PR [403](docs/stages/S19.md#pr-403) | 31 Oct | The main domain's preview password and `noindex` are its own switch (`EXTAS_MAIN_OPEN`, ships `"no"`; the owner opens it on go-live day, BLOCKED 25); staging always keeps its own locked Caddy block; the access log keeps no query string, pay-link token or Referer. |
| #71 | PR [8](docs/stages/S0A.md#pr-8) | 31 Oct | Follow-up (review round 1): the WAL archive never sticks on a segment it already has; a failed Drive encryption is a Drive fail; one daily backup at a time; a time limit on every backup unit. |
| #71 | PR [9](docs/stages/S0A.md#pr-9) | 31 Oct | Follow-up (review round 1): the monitor alerts on a site answering errors, a stuck worker (restarted once), stuck WAL archiving, a failed WAL push, smoke test or vault sync, and an old backup "ok". |
| #71 | PR [393](docs/stages/S19.md#pr-393) | 31 Oct | Follow-up (review round 1): the go-live smoke item is green right after a passing smoke test (time with its offset); new items `testPayments`, `rateLimit` and `staffTwoFactor`. |
| #71 | PR [402](docs/stages/S19.md#pr-402) | 31 Oct | Follow-up (review round 1): the smoke test can run against the main domain (`SMOKE_HOST`, `smoke.yml` `host`), and the first-week watch tests it there. |
| #71 | PR [396](docs/stages/S19.md#pr-396) | 31 Oct | Follow-up (review round 1): a production restore that fails half way puts the live database back and starts the shop again; one that cannot fit is refused before anything stops. |
| #71 | PR [6](docs/stages/S0A.md#pr-6) | 31 Oct | Follow-up (review round 1): one try of a background job has a deadline (`jobs.attemptTimeoutSeconds`, 1800 s, v86), so a hung call no longer holds a worker slot for good. |
| #71 | PR [4](docs/stages/S0A.md#pr-4) | 31 Oct | Follow-up (review round 1): each VM workflow has its own queue, so nothing cancels a waiting deploy; an older commit never deploys over a newer one; no second rollback; the image store reset never takes the app down; admin smoke pictures stay on the server, never in Git (ci checks). |
| #71 | PR [208](docs/stages/S10.md#pr-208) | 31 Oct | Follow-up (review round 1): percent cuts rounded to a step a rider can collect (`checkout.money.roundingStepMinor`, ৳0.01 / ৳1 / ৳5 / ৳10, default ৳1), never above the base. |
| #71 | PR [170](docs/stages/S07.md#pr-170) | 31 Oct | Follow-up (review round 1): `payments.testPayments` off by default (the sample store only turns it on); the practice gateway is hidden at checkout and its callbacks refused while off; a callback with another payment id is refused. |
| #71 | PR [166](docs/stages/S07.md#pr-166) | 31 Oct | Follow-up (review round 1): a partial delivery's COD expectation counts only active lines. |
| #71 | PR [125](docs/stages/S04.md#pr-125) | 31 Oct | Follow-up (review round 1): the coupon is redeemed in the order's own transaction, so usage and per-customer limits hold, also for two orders at once; a payment retry asks for what is due now. |
| #71 | PR [197](docs/stages/S09.md#pr-197) | 31 Oct | Follow-up (review round 1): an open order's stock hold is renewed until the ERP takes the order, never released, so a piece is never sold twice. |
| #71 | PR [172](docs/stages/S07.md#pr-172) | 31 Oct | Follow-up (review round 1): refund requests (cancel, edit, return) never add up to more than came in; approving one past it is refused. |
| #71 | PR [138](docs/stages/S05.md#pr-138) | 31 Oct | Follow-up (review round 1): an online order whose money has not come in is never confirmed (`PAYMENT_DUE`); the Prepaid view leaves it out. |
| #71 | PR [563](docs/stages/S04.md#pr-563) | 31 Oct | Follow-up (review round 1): "Set delivery area" for unclear-address and charge-not-set orders: a switched-on band, its own charge, never typed; totals, flags, the call and the ERP order updated. |
| #71 | PR [612](docs/stages/S08.md#pr-612) | 31 Oct | Follow-up (review round 1): the hand-back desk's "today" is the store's own day, not the UTC day. |
| #71 | PR [292](docs/stages/S14.md#pr-292) | 31 Oct | Follow-up (review round 1): the WhatsApp webhook reads a body only up to its limit; a longer one, chunked too, is 413. |
| #71 | PR [426](docs/stages/S22.md#pr-426) | 31 Oct | Follow-up (review round 1): the Messenger webhook reads a body only up to its limit; a longer one is 413. |
| #71 | PR [84](docs/stages/S02.md#pr-84) | 31 Oct | Follow-up (review round 1): a `/bn` page keeps its Bengali on the production server (the rewrite carries the server's own mark); smoke check `/bn/bag` has `lang="bn"`. |
| #70 | PR [257](docs/stages/S13.md#pr-257) | 31 Oct | Server-side event tracking: a product page seen, the checkout opened, an item put in the bag and an order placed go from the shop's own server to Meta, Google Analytics 4 and TikTok (migration `0067_tracked_events`, `ads.tracking` v85, off); prices read on the server, only hashes leave, on the mock until each key passes its Test; Marketing › Tracking. CN-031 lane batch 3 (#70, three builders); Launch building finished. Not deployed yet |
| #70 | PR [588](docs/stages/S11.md#pr-588) | 31 Oct | The Bengali translation gate: Website › SEO › Bengali pages with the coverage report, "Mark ready" / "Not ready" (audited, never by itself); a not-ready Bengali page kept out of search, or sent to its English twin (`language.bengali.gate` v84). |
| #70 | PR [346](docs/stages/S16.md#pr-346) | 31 Oct | Money › Month-end (read-only): the total per service, what the ERP has, the days not posted, the month's differences and its close; the monthly push of MNY-05 is replaced by CN-028's daily summary, so nothing reaches the ERP twice. |
| #70 | PR [345](docs/stages/S16.md#pr-345) | 31 Oct | Money › Costs & fees: gateway fees and packaging (owner data, empty), the USD rate and courier rate cards, every change audited and kept; inputs only, no price, charge or COD changes. |
| #70 | PR [344](docs/stages/S16.md#pr-344) | 31 Oct | Money › Expenses: quick entry on the owner's own heads, sent to the ERP with the day's summary; a wrong one reversed, never deleted; a receipt photo while `costs.receipts` is on (off; migration `0070_expense_receipts`). |
| #70 | PR [343](docs/stages/S16.md#pr-343) | 31 Oct | Money › Cost ledger: each message with a known cost writes one cost row and draws the prepaid SMS balance down; top-ups, a low mark and a CSV export (new permission `costs.write`); records only. |
| #70 | PR [423](docs/stages/S21.md#pr-423) | 31 Oct | Reports › Site health › Customer problems with the privacy-safe recorder (CN-015; migration `0065_customer_problems`, `health.problems` v83, on): script errors, failed or slow calls and pages, refused fields, rage clicks and broken pictures, Urgent first, no personal data; BLOCKED 26 (cleaning up old records). |
| #70 | PR [414](docs/stages/S21.md#pr-414) | 31 Oct | Saved browser journeys for customer, admin, accountant and warehouse on phone and desktop, replayed on the owner's schedule (`health.journeys` v82, off; `journeys.yml`); a sixth Site health line. |
| #70 | PR [236](docs/stages/S11.md#pr-236) | 31 Oct | Language pairs (hreflang) in the HTML head only, the sitemap pairs behind a switch (off); every deploy checks each pair and its way back (`tools/hreflang-check.mjs`). |
| #70 | PR [234](docs/stages/S11.md#pr-234) | 31 Oct | Core Web Vitals from real visitors (daily counts only, migration `0066_web_vitals`, `seo.vitals`) on Website › SEO and the Server page, plus the monthly slow-4G lab run on the VM (`vitals-monthly.yml`). |
| #70 | PR [233](docs/stages/S11.md#pr-233) | 31 Oct | Search Console and Bing Webmaster: the verification codes as meta tags on every shop page (`seo.verification`, empty), two Keys & connections rows on the mock until tested, "Send the sitemap". |
| #70 | PR [232](docs/stages/S11.md#pr-232) | 31 Oct | Product photo descriptions (alt text) written by the shop in English (`seo.altText`, on); a typed one is never changed; Bengali pages use the Bengali words. |
| #70 | PR [229](docs/stages/S11.md#pr-229) | 31 Oct | `robots.txt` from settings: everything closed until the shop opens on its own domain; the admin, the API and customers' own pages always out; the AI robots switch (`seo.robots`, welcome). |
| #70 | PR [228](docs/stages/S11.md#pr-228) | 31 Oct | Sitemaps split by kind (`/sitemap.xml` index, `/sitemaps/<kind>-<n>.xml`) with only listable pages, kept fresh and purged at the CDN when a product goes on or off (`seo.sitemaps`); follow-ups 402 and 517 built. |
| #70 | PR [227](docs/stages/S11.md#pr-227) | 31 Oct | Website › SEO › Collection pages: each collection's own search words in both languages, and the owner-named filter pages that may be listed (`seo.filterPages`, off). |
| #70 | PR [426](docs/stages/S22.md#pr-426) | 31 Oct | Messenger, WhatsApp and the site chat into the Support inbox: channels added off, Meta's reply window kept, refusals kept with their reason; the site chat off as it ships (`support.channels`, `support.liveChat` v72). |
| #69 | PR [342](docs/stages/S16.md#pr-342) | 31 Oct | Money › Overview (`/admin/money`, second tab; Money still opens Books): cash that came in (24 hours, 7 and 30 days, by method), COD a rider collected that no courier has paid out yet (by courier, oldest age), refunds owed and failed payouts. Read-only, `payments.view`; nothing moves money. CN-031 lane batch 2 (#69, three builders). Live since 31 Oct 19:14 |
| #69 | PR [402](docs/stages/S19.md#pr-402) | 31 Oct | The first-week watch after go-live (`golive.firstWeek`, off): started on the go-live page; a daily Telegram check at the set time for 7 days (server, all pages, last night's backup) and the smoke test every few hours while it lasts (`extas-first-week`, hourly `smoke.yml`). |
| #69 | PR [401](docs/stages/S19.md#pr-401) | 31 Oct | Main-domain indexing on go-live day: a go-live row that passes once search engines are let in on a store's primary domain, and the Search Console sign-off (property verified, sitemap submitted); runbook step 8. Staging stays closed to search engines. |
| #69 | PR [400](docs/stages/S19.md#pr-400) | 31 Oct | A go-live row for payment, courier and SMS: it counts only a connection that is switched on, LIVE and passed its last test (`golive.connections`). |
| #69 | PR [399](docs/stages/S19.md#pr-399) | 31 Oct | The owner-data check before go-live (`golive.ownerData`): for every live store the go-live list names the own fields still empty (phone, address, registered name, trade licence) and a missing delivery band, never their values; BLOCKED 24. |
| #69 | PR [398](docs/stages/S19.md#pr-398) | 31 Oct | `docs/golive/RUNBOOK.md`: preparation, the main-domain switch step by step with its undo, rollback smallest step first, what never happens, the owner's part; rehearsed as a go-live sign-off. |
| #69 | PR [397](docs/stages/S19.md#pr-397) | 31 Oct | Cloudflare Origin certificate for Full (strict): the pair in Keys & connections (migration `0064_certificate_kind`), checked offline and again on the server (`extas-origin-cert`, reverts when Caddy refuses it); its go-live rows. |
| #69 | PR [394](docs/stages/S19.md#pr-394) | 31 Oct | Every server item of A2.9 checked before go-live: setup writes `state/server-setup.json` (only a full run counts), and the go-live list's "server" row reads it. |
| #69 | PR [393](docs/stages/S19.md#pr-393) | 31 Oct | The go-live checklist: Settings › System › Go-live (`system.golive`) — automatic items from what the server wrote (smoke, health, backups), items a person confirms (QA gate, `docs/golive/ACCEPTANCE.md`, real phones, the 70-order simulation) and the owner's steps. It only reports; nothing is switched from here. |
| #69 | PR [396](docs/stages/S19.md#pr-396) | 31 Oct | Restoring production: a backup first into the check copy (never the live database), then exactly that backup on the live shop with RESTORE typed and the owner's PIN (`system.restore`, migration `0063_restore_requests`); the old data is kept, Telegram tells the owner. |
| #69 | PR [391](docs/stages/S19.md#pr-391) | 31 Oct | Azure Blob and Google Drive backups go live once connected: the Blob remote from the LIVE connection and the backups' container (`backups.blob`), and "Backups ready for real orders" with eight checks (`backups.gate`); BLOCKED 23. |
| #69 | PR [413](docs/stages/S21.md#pr-413) | 31 Oct | Reports › Site health (`health.read`): five lines — customer problems, server, speed, audit, smoke — from what the server writes and the worker heartbeat; the worst line is the headline (`health.hub`, v81). The problems and audit lines wait for PR [423](docs/stages/S21.md#pr-423) and 570. |
| #69 | PR [362](docs/stages/S17.md#pr-362) (launch slice) | 31 Oct | The Cloudflare cache rule sent with the protection rules: bag, checkout, account, admin and API never kept; category and product pages follow the Cache settings (follow-up 401 built). Caddy serves extra host names from `EXTAS_EXTRA_HOSTS` with their own certificates (the main domain on go-live day, a store's own domain later). |
| #69 | PR [378](docs/stages/S18.md#pr-378) follow-up | 31 Oct | Zod no longer probes with `new Function` in the browser (jitless before hydration), so the page protection policy logs no eval and can be enforced. |
| #69 | PR [386](docs/stages/S18.md#pr-386) | 31 Oct | Cloudflare protection rules for the shop's hosts only (Settings › Sign-in & security › Cloudflare protection, `edge.shield` v80): security level, browser check, SSL Full (strict), refused robot addresses, optional admin sign-in challenge and limit; sent by hand, merged so the old shop's rules on the zone stay. |
| #69 | PR [385](docs/stages/S18.md#pr-385) | 31 Oct | Immutable Blob backups behind `BACKUP_IMMUTABLE` (off) with a daily check that a delete is refused, `restore.yml`, and `docs/security/BREAK-GLASS-RESTORE.md`; BLOCKED 22 (lock or not). |
| #69 | PR [384](docs/stages/S18.md#pr-384) | 31 Oct | Settings › Policies & texts: each help page on or off, its Smart Rules text, the owner's own words in Bengali and English; rule numbers such as `{exchange.windowHours}` filled on the shop from the live rule. |
| #69 | PR [383](docs/stages/S18.md#pr-383) | 31 Oct | Settings › Store details: registered name, trade licence, DBID, VAT BIN; filler such as "TBD" refused on save and never shown on the shop. |
| #69 | PR [382](docs/stages/S18.md#pr-382) | 31 Oct | Settings › Privacy & data: how long orders keep address, device and location facts and the clean-up's last run; customers' erasure requests (off; only the owner carries one out, money and stock records stay). |
| #69 | PR [614](docs/stages/S08.md#pr-614) (CN-033) | 31 Oct | A refused exchange parcel's new piece waits on a deadline: billed the night after, credited when it comes back later and approved; "New piece not back" on the risk list. |
| #69 | PR [610](docs/stages/S05.md#pr-610) (CN-033) | 31 Oct | `erp.orders.bGradeOpen` (off): B-grade lines are not sold on a v6 store and an order the ERP refuses for B-grade SKUs is held as `B_GRADE_CLOSED`, not failed. |
| #69 | PR [619](docs/stages/S19.md#pr-619) (CN-033) | 31 Oct | `erp.switchOver.mode`: the switch-over as a fresh start (no moved orders, opening balance 0, no cost-of-goods backfill) as shipped; the ERP's list kept as `erp-list`. |
| #68 | PR [235](docs/stages/S11.md#pr-235), [527](docs/stages/S11.md#pr-527), [586](docs/stages/S11.md#pr-586), [378](docs/stages/S18.md#pr-378), [379](docs/stages/S18.md#pr-379), [380](docs/stages/S18.md#pr-380), [381](docs/stages/S18.md#pr-381), [392](docs/stages/S19.md#pr-392), [395](docs/stages/S19.md#pr-395), [507](docs/stages/S19.md#pr-507) (+ PR [8](docs/stages/S0A.md#pr-8) follow-up, CN-033) | 31 Oct | CN-031 lane batch 1 (three builders). **Old links never die:** a redirect manager with a 404 report and one-click fixes (the old WordPress links wait behind a go-live switch, a redirect never points to another site); a sold-out or archived product page stays and shows "Available now", an archived collection gets a resting page; old demo `#/…` links move on to their live page. **Safety:** one cross-site check in front of every API call, request limits per address (watching only for now), the page protection policy (report-only), a quiet bot check with no CAPTCHA that never blocks anyone, Settings › Sign-in & security (2FA required switch, session limits, an optional admin address list, new-device alerts, log out everywhere else), a daily dependency scan in CI and the security review the live payment keys wait for. **Alerts and backups:** Telegram alerts once the bot key is tested; Google Drive backups in one click with the owner's own Google client; backup times and days kept from the admin, "Back up now", and a monthly drill that restores each copy into a throw-away database. **PR [8](docs/stages/S0A.md#pr-8) follow-up:** the backup disk can no longer fill up (compressed WAL with its own window, base backups that carry their WAL, room made first). **CN-033:** the shop follows the ERP's 30 Oct retail decisions (PR [610](docs/stages/S05.md#pr-610), 614, 619, 621). Review fixes folded in: the hash forwarder and redirect targets never leave the site, the proxy takes media uploads up to 200 MB, base backups use `-X stream`. Not deployed yet |
| #67 | PR [4](docs/stages/S0A.md#pr-4) follow-up | 31 Oct | The first repair found every image of the stack broken and could not download them again, because Docker's own records pointed at files that were gone, so the site went down. Server setup now asks Docker Hub first: when it answers and downloads still fail, the whole broken image store is moved aside (kept two days, then removed), Docker starts empty, and every image is downloaded or built again. The shop's data lives in the server's own folders and is not touched. |
| #66 | PR [4](docs/stages/S0A.md#pr-4) follow-up | 31 Oct | The deploys still rolled back: inside the running database container some basic programs were missing. The clean-up that removed the old copy of Docker's image store had, through a shared view of the system disk, reached the new store and deleted files there. The clean-up now works only in a private view and checks it is on the system disk before removing anything. Server setup now checks every stack container and image: a broken container is stopped and made again, a broken downloaded image is downloaded again, a broken image built on the server is built again. The data is in the server's own folders, so nothing is lost. |
| #65 | PR [5](docs/stages/S0A.md#pr-5) follow-up | 31 Oct | Three deploys in a row (#63, CN-031, #64) were rolled back by the smoke test: after Docker's image store moved to the data disk, `docker exec extas-postgres psql` found Debian's /usr/bin wrapper instead of PostgreSQL's own tool, so the append-only check read nothing. Every server script now runs PostgreSQL's tools from their own folder inside the container (`infra/deploy/pg-exec.sh`), the check says why it could not read (image, PATH, never the password), and server setup restarts the database container once when its tools cannot run. |
| #64 | PR [12](docs/stages/S00.md#pr-12) follow-up, CN-032 | 31 Oct | In the owner's everyday browser the admin went blank after loading and the sign-in did nothing, while another browser worked. The browser's own page translation is now off on the whole site (the shop has its Bengali pages, the admin its বাং switch), since a translator rewrites the page behind React and breaks it. A page that would go blank shows a Bengali/English screen instead: it first clears this site's cache and stored values by itself (sign-in kept) and reloads once, then offers Start fresh and Try again. `/fresh-start` clears only this site's data in one browser, never the browser's other sites, passwords or tabs, and never the preview cookie. |
| direct | CN-031 (docs only) | 31 Oct | Launch is finished in one run by three builders (lanes A, B, C), the build never sits idle, reviews are lighter per PR and heavy once at the end of Launch; the After-launch list follows a priority order. |
| #63 | PR [4](docs/stages/S0A.md#pr-4) follow-up | 31 Oct | The server report's system-disk step stopped on a harmless "broken pipe" from its top-10 folder list, so Docker's image store had not moved yet; the list now finishes cleanly (a test guards it). When the system disk passes `DISK_SNAPSHOT_PCT` (60%), the hourly monitor saves a snapshot of what fills it (biggest folders, files over 1 GB, deleted files a program still holds open), keeps the last `DISK_SNAPSHOT_KEEP`, and the server report shows the newest one. Files in /tmp and /var/tmp older than `TMP_KEEP_DAYS` (10) are removed by the system. After the owner's restart on 31 Oct the disk went from 97% to 11%: the space was held by temporary or still-open deleted files, not data. |
| #62 | PR [4](docs/stages/S0A.md#pr-4) follow-up | 31 Oct | The server's 128 GB system disk filled up (97%) and two deploys of #61 stopped mid-build. Cause: Docker 29 keeps built images and build cache on the system disk, and nothing pruned them after each deploy. Docker's image store now lives on its own volume on the 1 TB data disk (moved once, checked, put back on any failure). Build cache, untagged images, old deploy images, the journal and the runner's old logs are trimmed by settings after every deploy. Each deploy first checks the system disk and stops cleanly, before building anything, if it is still too full. The server report shows what uses the system disk. |
| #61 | PR [616](docs/stages/S16.md#pr-616), [619](docs/stages/S19.md#pr-619), [610](docs/stages/S05.md#pr-610), [614](docs/stages/S08.md#pr-614), [621](docs/stages/S19.md#pr-621) qa-gate fixes | 31 Oct | CN-029 Phase 3, the whole-ERP qa-gate check (device gate on 29 ERP pages × 31 sizes in en and bn, journeys, the 70-order simulation's money lines): the "Put right" form on Books › Differences fits a phone; the ERP hold says it stops new orders (not payments) and shows on the Dashboard and in Needs you now; the bag and checkout show a calm pause line as soon as they open during a hold, and Confirm is still refused with no console error; a v6 exchange checks the 72 hours first, names practice mode truly and shows the hours left; CI now seeds one v6 sample store so the device gate measures the opened ERP forms in en and bn. |
| direct | CN-030 (docs only) | 31 Oct | Google Drive backup and restore in one click, built like the ERP's: the owner's own Google client (TVs and Limited Input devices, `drive.file`), a code at google.com/device, no service account; PR [391](docs/stages/S19.md#pr-391), 395, 396, 507. |
| #60 | PR [611](docs/stages/S08.md#pr-611), [615](docs/stages/S16.md#pr-615), [616](docs/stages/S16.md#pr-616), [617](docs/stages/S16.md#pr-617), [621](docs/stages/S19.md#pr-621), [620](docs/stages/S18.md#pr-620), [608](docs/stages/S09.md#pr-608) fixes | 31 Oct | CN-029 Phase 3, the books (three review rounds): payments pair even without the ERP's event ids; a caught-up payment keeps its sign and waits when a correction is on its way, never holding back an unrelated payment; an ERP correction after a shop correction is booked; extra decimals are refused; a month never closes on a stale day; a back-dated "paid to ERP" record is raised; an event group waits while an event is on its way; exchange corrections tie and count in the exchange cost; earlier-month corrections show as their own line; the 72 hours start at the courier's delivered time. Caddy: a changed Caddyfile really reloads, and the client address header is sent only when Caddy's live config trusts Cloudflare; a refused-call slot is given back when the lookup fails. |
| #59 | PR [607](docs/stages/S09.md#pr-607), [608](docs/stages/S09.md#pr-608), [610](docs/stages/S05.md#pr-610), [620](docs/stages/S18.md#pr-620) fixes | 30 Oct | CN-029 Phase 3, store isolation (two review rounds): one store's ERP can never write another store's stock even with a shared secret; the ERP webhook refuses unsigned or stale calls before any database or vault read, with one answer code and a capped body; refused calls are limited per caller address, which only Caddy sets (Cloudflare ranges), and the limit holds under parallel calls while a correctly signed ERP still gets through; a v6 event id comes only from the signed body; duplicates are per connection; a late account hold no longer pauses checkout; waiting follow-ups no longer stall a store's documents; refused webhooks show on the ERP link page. |
| #58 | PR [619](docs/stages/S19.md#pr-619), [621](docs/stages/S19.md#pr-621) | 30 Oct | Each store's own ERP link page (its own keys in the vault, what waits, what is owed) and the switch-over to the ERP model (owner only, with the books PIN, a fresh dry run and the ERP's date typed back; the old return paths become switches that are off, never deleted); the ERP v6 acceptance suite (books drills, the 72-hour exchange rule, store isolation) on the practice ERP in CI, nightly on the demo ERP, and in every deploy after the migration and before the new colour (a down demo ERP, no key or a database it cannot read is reported and never stops a release). |
| #57 | PR [609](docs/stages/S01.md#pr-609), [617](docs/stages/S16.md#pr-617), [618](docs/stages/S16.md#pr-618), [620](docs/stages/S18.md#pr-620) (+ PR [505](docs/stages/S14.md#pr-505) test fix) | 30 Oct | The daily summary and fixed costs for the ERP v6 (only for a store switched to v6): each shop day is summed from the shop's own records and sent to the ERP once, kept exactly to the paisa for the books match; Money → Costs takes the month's fixed costs (empty until the owner fills them, capped by settings) and extra cost lines, corrected only by a reversing line with a reason; a Books status card on the Daily summary page. Import from the ERP by style code (v6 stores only): a preview first, every SKU of a grade in one go or nothing, an existing product without a style code adopted, archived or switched-off variants left as they are; the buying price kept for the owner's eyes and an optional selling-price floor (off until the owner sets a margin). Signed calls from the ERP to the shop (top products, customers), off per store until switched on; unsigned or stale calls are refused before anything is read, and only these two exact paths pass the preview password. |
| #56 | PR [612](docs/stages/S08.md#pr-612), [613](docs/stages/S08.md#pr-613), [614](docs/stages/S08.md#pr-614), [615](docs/stages/S16.md#pr-615), [616](docs/stages/S16.md#pr-616) (+ PR [610](docs/stages/S05.md#pr-610), [611](docs/stages/S08.md#pr-611) fixes) | 30 Oct | Returns, exchanges and the books on the ERP v6 (only for a store switched to v6; today every store stays on v5): the courier's return lists go to the ERP from a hand-back desk, a new Returns section shows where every returned parcel is, and exchanges go through the ERP only within 72 hours of the courier's delivered (the old shop QC, restock and write-off paths stay on as switches until the switch-over). Retail's own ERP account ledger, append-only and matched against the ERP with zero tolerance; the nightly match (checks A–F), day, week and month closes, and fixing a difference only by a reversal plus a new entry with the owner's books PIN and a reason; "paid to ERP" only records a payment already made. No refund after delivery. The ERP's totals and shop prices are now read exactly, never rounded. |
| #55 | PR [610](docs/stages/S05.md#pr-610), [611](docs/stages/S08.md#pr-611) | 30 Oct | Orders to the ERP v6 (only for a store switched to v6; today every store stays on v5): one line per piece in whole taka, refusals held and asked again, checkout paused while the ERP account is on hold, short lines decided by a person; the shipment goes when the courier picks the parcel up, and every delivery result goes to the ERP once. |
| #54 | PR [407](docs/stages/S20.md#pr-407), [425](docs/stages/S22.md#pr-425) | 30 Oct | The customer invoice: issued once per order, kept, revised when the order is edited, printed on A4 or a roll or saved as a picture (the shop's legal name, address and BIN come from settings, empty until filled). The support core: one inbox of conversations with replies, internal notes, files, assignment and a who-did-what log; channels plug in later (PR [426](docs/stages/S22.md#pr-426)), so replies wait as "not sent" until one is connected. |
| #53 | PR [607](docs/stages/S09.md#pr-607), [608](docs/stages/S09.md#pr-608) | 30 Oct | ERP contract v6 behind `erp.model` (v5 until the switch), one ERP company per store with its own keys, the permanent event ledger, and the shared tables, settings and permissions for PR [609–618](docs/stages/README.md) (CN-029 Phase 0). |
| #52 | PR [220](docs/stages/S11.md#pr-220), [221](docs/stages/S11.md#pr-221), [222](docs/stages/S11.md#pr-222) | 30 Oct | The SEO engine's base: each page names its own address in its own language, search engines stay off until go-live (the preview is always hidden from them), search titles and descriptions from templates with AI drafts a person accepts (off until AI is on), and structured data for the shop, the website, products and sets. New admin page Website › SEO with its guide. |
| #51 | PR [182](docs/stages/S08.md#pr-182), [183](docs/stages/S08.md#pr-183), [284](docs/stages/S14.md#pr-284), [285](docs/stages/S14.md#pr-285), [286](docs/stages/S14.md#pr-286), [185](docs/stages/S08.md#pr-185) (follow-up [466](docs/stages/S24.md#pr-466)), [198](docs/stages/S09.md#pr-198), [291](docs/stages/S14.md#pr-291), [292](docs/stages/S14.md#pr-292), [298](docs/stages/S14.md#pr-298), [505](docs/stages/S14.md#pr-505) | 30 Oct | Orders → Packing & print → Pack: pick, check every piece, pack (photo and weight checks, off by default) and hand over; a damaged or missing piece opens a card and holds the order until a person decides. Customers: the list with its views and search, one customer's page (orders, Sales delivered only, exchanges, who looked), and To review for the same person's profiles. Messages: SMS (BulkSMSBD) and WhatsApp (Meta) on their mocks until the keys, consent and stop words checked before every send, the template editor with a live preview, the order journey, the message log and channels. The Orders tabs no longer squeeze on a phone. |
| direct | CN-029 (docs only) | 30 Oct | PR [607–621](docs/stages/README.md) will be built in one run with five builders in parallel (two new section agents, Pherot and Hisabi); each store has its own ERP keys; the old exchange and return code is reworked inside PR [610–614](docs/stages/README.md). Plan in `docs/RETAIL-ERP-MODEL.md` §15–16. |
| #50 | PR [4](docs/stages/S0A.md#pr-4) | 30 Oct | The nightly and after-deploy smoke test now also opens Orders → Returns and Refused parcels (the check account can see them, still read-only), so a broken returns page rolls the deploy back. |
| #49 | PR [573](docs/stages/S03.md#pr-573) (follow-up [358](docs/stages/S17.md#pr-358)), [184](docs/stages/S08.md#pr-184), [185](docs/stages/S08.md#pr-185), [187](docs/stages/S08.md#pr-187), [188](docs/stages/S08.md#pr-188), [189](docs/stages/S08.md#pr-189), [190](docs/stages/S08.md#pr-190), [191](docs/stages/S08.md#pr-191), [525](docs/stages/S08.md#pr-525), [526](docs/stages/S08.md#pr-526) | 25 Oct | The combo page paints faster (its own small stylesheet; Lighthouse 2.51 s → 2.23 s). The order now follows its parcel: the courier's news moves it on and shows on the order pages; a "Delivered" our own records contradict is held for a person; why a parcel came back is kept on its one return record; exchanges in four tiers with their money box, Receive & QC with ERP restock or write-off, the size switcher, returns only when the owner's policy allows, who pays the second delivery, and the refused-parcel list a person decides. |
| direct | CN-028 (docs only) | 25 Oct | Retail and the ERP supplier model filed: change note CN-028, PR [607–621](docs/stages/README.md) (Launch +14, After launch +1), `docs/RETAIL-ERP-MODEL.md`, the ERP's contract v5 and v6 kept in `docs/erp/`, 621 PRs in all. |
| #48 | PR [554](docs/stages/S06.md#pr-554), [179](docs/stages/S08.md#pr-179), [180](docs/stages/S08.md#pr-180), [181](docs/stages/S08.md#pr-181) | 25 Oct | Each courier's own area list is paired with ours, and a parcel never goes to an area the courier does not know; the courier sticker prints from the server with a barcode and the live COD (Bengali prints right on any printer); every print is kept, a reprint asks why; the rider signs a handover sheet per courier; the daily picking list puts every order's pieces on one sheet, category → style → colour → size. |
| #47 | PR [12](docs/stages/S00.md#pr-12) (updated, CN-025) | 24 Oct | The admin gets the V12.4 look: new colours and cards, a "To do" drawer, and the new Dashboard on real data (delivered sales chart, the ordered value on its own line, where orders are now, couriers, top products, low stock); Settings › Admin look picks a page's design for the team or just for you, and where the guide opens. One design per page for launch; more after launch. |
| #46 | PR [161](docs/stages/S06.md#pr-161), [542](docs/stages/S06.md#pr-542), [502](docs/stages/S06.md#pr-502), [171](docs/stages/S07.md#pr-171), [172](docs/stages/S07.md#pr-172), [173](docs/stages/S07.md#pr-173), [174](docs/stages/S07.md#pr-174) | 24 Oct | Each risk level (low, medium, high) gets its own steps — watch, hold, a confirmation call and a proposed advance — all off until the owner switches them on, on Orders › Risk rules. From any order the team can ask for an advance in one click: a pay link goes out by SMS, WhatsApp or a call, the order waits, and paying brings it back. The delivery zones page now edits each band's COD limit and every area: rename, extra spellings, move, add and merge (nothing is deleted). Payments get a wallet with an append-only ledger, refunds that always wait for the owner's approval before any payout, a capped advance on pre-orders, and a reconciliation report that matches each gateway statement line to a payment and gives every mismatch a reason. All off by default. |
| #45 | PR [602](docs/stages/S02.md#pr-602), [558](docs/stages/S04.md#pr-558), [560](docs/stages/S04.md#pr-560) | 24 Oct | Pages load from a four-layer cache (browser, Cloudflare when switched on, the server, Redis) and a price, stock or setting change clears the right pages at once; the bag, checkout and account are never kept. A new checkout-advance panel under Orders › Risk rules decides who pays ahead, and a flagged customer then pays the advance on the same checkout page instead of cash on delivery. All off by default. S04 is done (41/41). |
| #44 | PR [594](docs/stages/S21.md#pr-594) | 24 Oct | A Bengali guide for every built admin page (what it is, why, steps, every button and field, common mistakes, what happens next), opened from a small help icon in the top bar: a side panel on a computer that follows you page to page, a full-screen sheet on a phone; the admin gets its own self-hosted fonts and calmer type; CI fails when a built admin page has no guide (CN-026, cut to the launch scope by CN-027) |
| #43 | PR [104](docs/stages/S03.md#pr-104) | 24 Oct | Combo pages no longer keep a request open for a minute after they load (the page-opened count now reads its answer), so Lighthouse and the smoke test see the page settle at once; a test stops any page from leaving such a request open again |
| #42 | PR [519](docs/stages/S06.md#pr-519), [520](docs/stages/S06.md#pr-520), [521](docs/stages/S06.md#pr-521), [544](docs/stages/S06.md#pr-544), [175](docs/stages/S08.md#pr-175), [176](docs/stages/S08.md#pr-176), [177](docs/stages/S08.md#pr-177) | 24 Oct | One identity per customer from the phone, the device and an alike name and address, so a new number no longer hides the same person; the duplicate and re-order rules A–E, H, I, each with its own switch and a proposal a person decides (no block); "Why this alert, and the options" on the order page's review card; one list of every fraud and duplicate rule with its switch (admin API). All off by default. The courier framework with the practice courier (exception states with reasons, events stored once, the RTO cost book from real returned parcels only), Steadfast and Pathao behind it: staff book one, the ticked or all ready orders (never a cancelled, held, unconfirmed or in-review one), consignment ids, and the worker reads parcel updates; both stay on practice until the owner's keys pass the Test. |
| #41 | PR [572](docs/stages/S03.md#pr-572), [573](docs/stages/S03.md#pr-573), [574](docs/stages/S03.md#pr-574), [576](docs/stages/S03.md#pr-576), [165](docs/stages/S07.md#pr-165), [166](docs/stages/S07.md#pr-166), [167](docs/stages/S07.md#pr-167), [170](docs/stages/S07.md#pr-170), [125](docs/stages/S04.md#pr-125) | 24 Oct | Combo templates: each colour-pair rule gets its own list page (`/combos/<rule>`) in five layouts, the pair page and the set in the bag each get five more, and the current look stays the default until the owner picks another. A test tool plays every template at four screen sizes and scores it out of 100. S03 is done (22/22). Payments start (S07 4/10): every payment has one state and a money status, cash on delivery is settled after the door (a paid customer is never asked again), bKash sits behind one gateway contract on its practice mode until the owner adds the keys, and callbacks are signature-checked and counted once. | Merged |
| #40 | PR [541](docs/stages/S05.md#pr-541), [159](docs/stages/S06.md#pr-159) | 24 Oct | Every new order lands in one section with a note the moment it is placed (duplicate, re-order, new identity, high risk, watch, prepaid, clear); the strong sections wait for a person, and an order under review can never be booked. Prepaid orders get their own confirm view. The order list gets a risk column, filters and a "highest risk first" sort. Checkout keeps the IP, the shop's own random device id and a location the customer chooses to share, each by its own switch, and clears them after 180 days. S05 is complete. |
| #39 | PR [44](docs/stages/S02.md#pr-44), [546](docs/stages/S05.md#pr-546), [148](docs/stages/S05.md#pr-148) (follow-up [287](docs/stages/S14.md#pr-287)) | 24 Oct | The home page flash sale: two rows gliding opposite ways with a live countdown, drawn only while the owner has a sale set (empty and off by default; a sale never changes a price). The customer is told in plain words why an order was cancelled; a duplicate's notice names the order that goes ahead, with its tracking link. The "cancel request refused" notice is its own step. Both notices are off by default. |
| #38 | PR [157](docs/stages/S06.md#pr-157), [158](docs/stages/S06.md#pr-158), [156](docs/stages/S06.md#pr-156), [160](docs/stages/S06.md#pr-160) | 24 Oct | The risk score (off until the owner turns it on): each new order gets a score from 0 to 100 from the owner's signals and weights (the number's past orders and refusals, cancels, a very recent order, an unclear or mismatched address …), stored once with its reasons. The order's admin page shows a "Risk" card that says why. It only informs: nothing is blocked, and no price, charge or COD changes. |
| #37 | PR [150](docs/stages/S05.md#pr-150), [143](docs/stages/S05.md#pr-143) (follow-up [260](docs/stages/S13.md#pr-260)), [146](docs/stages/S05.md#pr-146) (follow-up [261](docs/stages/S13.md#pr-261)) | 24 Oct | "My orders" keeps every order, a page at a time, with All · On the way · Delivered · Cancelled & returned, and each order page has "What happened" with its steps and changes. When the owner turns them on, the order page also has the customer's own edit card (address, phone, a size) and the two-size question ("Keep both, or only M?"). |
| #37 | PR [148](docs/stages/S05.md#pr-148), [149](docs/stages/S05.md#pr-149), [151](docs/stages/S05.md#pr-151) | 24 Oct | The customer gets a message at each order step by SMS, WhatsApp or e-mail (which step uses which channel is a setting; the same message never goes twice; on the mock until the owner types a key in). Every try is logged and retried by itself, and staff can retry a failed one. Orders can be exported as a CSV file, with the customer's personal details only for staff allowed to see them. |
| #37 | PR [85](docs/stages/S02.md#pr-85) (fix) | 24 Oct | The device gate measures a shop page only after the shell's fits (footer columns, phone header) have run, so a busy runner no longer catches the footer links in the moment before they fit (main's run failed on it at 360 px). |
| #37 | PR [566](docs/stages/S04.md#pr-566), [606](docs/stages/S04.md#pr-606) | 24 Oct | The support card on an order's admin page explains, from the order's own records, why the customer was asked for an advance and why the delivery charge is what it is, with ready "what to say" lines in both languages (read only). The bulk / corporate lane: `/bulk-order`, a phone-menu row and a bag card send an enquiry (BQ-1001 …) for the team to call back, never a price; off until the owner turns it on. |
| #36 | PR [142](docs/stages/S05.md#pr-142), [143](docs/stages/S05.md#pr-143), [146](docs/stages/S05.md#pr-146) | 24 Oct | Order edits through the one order service: the team changes contact, address, a size at the same price or takes a piece out (reason, where the customer asked, timeline and audit log; refused once a courier is booked; a paid order's overpaid part only becomes a refund request), the customer edits his own phone, address or size until processing (off by default, capped), and the two-size follow-up asks "both, or only M?" after placing (off by default). Settings registry v37, permission `orders.edit`, no migration |
| #36 | PR [98](docs/stages/S03.md#pr-98), [100](docs/stages/S03.md#pr-100) | 24 Oct | "Build your own set" (demo V12.2 `41-set.js`): `/combos/build-your-own` and one page per set group, made from the owner's Smart Rules set tier rules; tier cards, slots, style cards with colours and sizes, the summary beside on a computer and a bar at the bottom of a phone; "Add set to Bag" puts the picks in the bag, where the same tier price applies by itself. Off by default (`combos.builder`, registry v36, migration `0022_set_builder`); admin API `GET/POST /api/admin/combos/builder`; the admin screen is follow-up 240 |
| #35 | PR [17](docs/stages/S00.md#pr-17) (CN-023) | 24 Oct | CI in parallel jobs on one build (owner, CN-023; every gate and budget as strict as before): the images are built once, then lint and type-check, unit tests, the sign-in e2e, the device gate (4 shards) and one Lighthouse run on the sample data (in shards) run side by side; a pull request checks the core pages plus the pages it touches, a push to main and the nightly run check every page and still block the deploy; pnpm, Next.js and Playwright caches. Before about 115 minutes per run, after about 14 minutes. |
| #35 | PR [59](docs/stages/S02.md#pr-59), [65](docs/stages/S02.md#pr-65) | 24 Oct | Find My Size learns from real "how did it fit" answers per garment type (off by default, the chart until enough answers; admin API and permission `catalogue.sizeAdvice`). Product reviews on the product page: up to three, photo reviews first, sliding with pause and resume; a customer reviews a delivered order, staff approve or hide it through the admin API, and only approved reviews show (SIM-F-008). The photo-review reward is off with no amount; once the owner turns it on, staff approval pays it once into the wallet. Migration `0021_reviews`. |
| #35 | PR [140](docs/stages/S05.md#pr-140), [141](docs/stages/S05.md#pr-141), [154](docs/stages/S05.md#pr-154), [152](docs/stages/S05.md#pr-152), [12](docs/stages/S00.md#pr-12), [136](docs/stages/S04.md#pr-136) | 24 Oct | The admin order screens on the new shell (demo V12.3 `#/admin/orders`; no new setting, migration or permission). All orders: views with counts (to confirm, on hold, cancel requests, duplicate review …), search by number, phone (any way it is written, Bengali digits too), name or tracking code, filters, four separate status chips; a table on a computer and cards on a phone. One order's page: products, the customer and his earlier orders, the timeline and notes, and only the buttons the order allows now and the person may press, each with a "what will happen" box; a change made meanwhile reloads and says so. To confirm: the call queue. Bulk confirm, hold and release with the skipped ones and why. The Orders badge and order rows in "Needs you now"; "Get invoice" for staff (follow-ups 200, 180). |
| #35 | PR [563](docs/stages/S04.md#pr-563), [565](docs/stages/S04.md#pr-565), [561](docs/stages/S04.md#pr-561), [127](docs/stages/S04.md#pr-127), [128](docs/stages/S04.md#pr-128), [605](docs/stages/S04.md#pr-605) | 24 Oct | The rest of the customer checkout (S04, settings v34, migration `0020_gift_mode`, permission `orders.lines`; every new feature off by default). No order is held over an address: it is placed and the team calls once (landmark-only lines get one address check). Free delivery never asks for a delivery band. A known number can skip the address line (off). "Add to this parcel" lets a customer add a piece to his COD order before it is confirmed (off). "Complete your look" on the thank-you page offers only pieces a running combo pairs with the order (off). Gift mode sends the order to someone else with a note, a deliver-after date and the prices hidden (off). |
| #35 | PR [12](docs/stages/S00.md#pr-12), [155](docs/stages/S05.md#pr-155), [495](docs/stages/S00.md#pr-495), [28](docs/stages/S01.md#pr-28) | 24 Oct | The new admin shell (CN-018, CN-022; demo V12.3 `#/admin`; settings v33, no migration). Every admin page now sits in one of 14 sections in four groups (Daily work, Grow, Business, and Settings / Help & Build at the bottom), with section tabs and "More", an icon rail on a tablet and a drawer plus Home · Orders · Support · Search · More on a phone. The menu shows only what a person's role can open, with waiting-work badges. Ctrl K or "/" opens one search for pages, settings, products, orders and customers. Each section has its Bengali guide in a side panel. `/admin` is the Dashboard: "Needs you now" from the real queues, plus Delivered sales and Ordered value for today / 7 / 30 days from `@extas/metrics`. A role can start on its own section (off by default); the size-chart links' tap area is 44 px. `/admin/delivery` moved to `/admin/delivery/zones` (redirected). |
| #35 | PR [138](docs/stages/S05.md#pr-138), [144](docs/stages/S05.md#pr-144), [145](docs/stages/S05.md#pr-145), [147](docs/stages/S05.md#pr-147), [153](docs/stages/S05.md#pr-153) | 23 Oct | Order core (S05, BACKEND-ARCHITECTURE §6.5.1, settings v32, migration `0018_order_core`, admin API only, the screens come with the new admin). One order service runs every order step: a wrong step is refused, two people pressing at once get one answer and one "already changed", and every change writes the order's timeline and the audit log in one go. Cancel with reason codes frees the held stock; a paid order only gets a refund request, no money moves; after booking it asks the courier first. Hold and release with a reason support can see. Internal notes and flags. Duplicate orders of one customer go to a review queue and wait for a decision before they can be confirmed. |
| #34 | PR [136](docs/stages/S04.md#pr-136), [66](docs/stages/S02.md#pr-66), [87](docs/stages/S02.md#pr-87), [86](docs/stages/S02.md#pr-86) | 23 Oct | Invoice, product questions and the shop's motion (S04/S02, settings v31, no admin screen, no migration). Every order has its invoice in English and Bengali at `/account/orders/<n>/invoice`, drawn from the order as stored, printable and downloadable, for the order's customer, the browser that placed it or staff with `orders.invoice`; the shop's legal details show once the owner fills them. The product page shows the shop's own approved answers with "See all questions" and the WhatsApp ask. The order-placed celebration (off until the owner switches it on, never on a slow phone, any tap ends it) and one switch board for every light sweep. |
| #34 | PR [91](docs/stages/S03.md#pr-91), [92](docs/stages/S03.md#pr-92), [93](docs/stages/S03.md#pr-93), [94](docs/stages/S03.md#pr-94), [95](docs/stages/S03.md#pr-95), [102](docs/stages/S03.md#pr-102), [103](docs/stages/S03.md#pr-103) | 23 Oct | Combo storefront (S03, demo V12.2, settings v30, no admin screen, no migration). Every combo has its own page `/combo/<link>` (+ `/bn/`) in template C1 (all on one page) or C2 (step by step), with the set picture and a tab per piece, popular colour pairs, each piece's own colour and size with "Same size as item 1", the rules card and the set price and saving from `@extas/combos` only; one tap adds the set to the bag (a toast on the phone, the added panel on a computer) and "Change" in the bag edits it in place. An ended combo keeps its page with "Buy them separately". The product page offers the running sets that hold it, every combo page ends with "More sets", and `/combos` lists all sets by piece count with season tabs. |
| #34 | PR [129](docs/stages/S04.md#pr-129), [130](docs/stages/S04.md#pr-130), [71](docs/stages/S02.md#pr-71), [131](docs/stages/S04.md#pr-131), [132](docs/stages/S04.md#pr-132), [133](docs/stages/S04.md#pr-133), [134](docs/stages/S04.md#pr-134), [135](docs/stages/S04.md#pr-135), [137](docs/stages/S04.md#pr-137) | 23 Oct | Customer accounts (S04, demo V12.2, settings v29, no admin screen, no migration). The first order makes the account with no password (SIM-F-039), and the thank-you page says which number to log in with; login by one-time SMS code (mock sender until the owner adds the key) with an optional own password; the browser's wishlist joins the account; My account with orders, For you, Rewards, Wallet, Wishlist and Profile; the offer banner and profile photo (both off); the order page with tracking, the courier and the late flag past the promise (SIM-F-018); the checkout fills itself for a signed-in customer. Order states, refunds and returns still wait for the owner (CN-022). |
| #34 | PR [52](docs/stages/S02.md#pr-52), [50](docs/stages/S02.md#pr-50), [58](docs/stages/S02.md#pr-58), [51](docs/stages/S02.md#pr-51), [88](docs/stages/S02.md#pr-88) | 23 Oct | Product page templates and Find My Size (S02, demo V12.2, settings v28, no admin screen, no migration). A product page uses the product's own template, else its category's, else the shop default T1, with a `?template=` preview that search engines skip; T2 Editorial (photos peek on a phone, two across on a computer, a larger title) and T3 Fit-first (sizes, the finder and the measurements in one card). Find My Size gives a size from height and weight on the product's own chart and ease, with the reasons in both languages; no chart, no finder; the answer is kept on the phone and recorded without a name for PR [59](docs/stages/S02.md#pr-59); it shares the one "Your size" tag with the last-bag size (follow-up 62) and comes first. SIM-F-012 acceptance test. Storefront speed (PR [88](docs/stages/S02.md#pr-88)): the product page's blocking time drops from about 250 ms to 24–110 ms (V8 compile hints, popups loaded on demand, one shared wishlist reader) and CI checks the page and image weight targets. |
| #33 | PR [74](docs/stages/S02.md#pr-74), [41](docs/stages/S02.md#pr-41), [40](docs/stages/S02.md#pr-40), [45](docs/stages/S02.md#pr-45), [222](docs/stages/S11.md#pr-222), [56](docs/stages/S02.md#pr-56), [117](docs/stages/S04.md#pr-117), [126](docs/stages/S04.md#pr-126) | 23 Oct | Storefront follow-ups (settings v25, no admin screen). On a computer, cards show their back view and Quick add on hover or keyboard focus, with the bag's added panel on the home and category pages; the home page's cards fit like the category page's; a long phone slogan steps to its short form instead of being cut; BreadcrumbList / ItemList JSON-LD on category pages and Product / Offer / BreadcrumbList JSON-LD on product pages from their own price and stock (no rating; PR [222](docs/stages/S11.md#pr-222) partly built, Organization still to come); the owner's words under each size box and "Your size" (both off until set); address suggestions under the checkout's address box; the thank-you page says the delivery note back and can show "What happens next"; a sample sub-category so CI measures the phone menu's accordion. |
| #32 | PR [72](docs/stages/S02.md#pr-72), [73](docs/stages/S02.md#pr-73) | 23 Oct | Storefront search (S02, demo V12.2, settings v24, no admin screen). The header search opens the demo's window on the phone and a panel under the header on the computer, with live suggestions from one index across products, categories and help pages (prefix and typo matching, synonyms and Bengali words from settings; only live, sellable products; a help page still "Coming soon" is never offered). Meilisearch answers when the server has it, PostgreSQL otherwise, indexed by the background worker. `/search?q=` (+ `/bn/`) shows help cards, categories, then the category page's own listing with filters and "Best match" sort; an empty search suggests words, categories and WhatsApp. |
| #31 | PR [7](docs/stages/S0A.md#pr-7), [6](docs/stages/S0A.md#pr-6), [155](docs/stages/S05.md#pr-155), [119](docs/stages/S04.md#pr-119), [195](docs/stages/S09.md#pr-195), [494](docs/stages/S00.md#pr-494) | 23 Oct | Back-office and server follow-ups (no new settings, no admin screen). The preview password lets only the signed ERP webhook POST through (follow-up 80); a rollback starts the old version's worker too (82); KPI report views and a Sales index that count exactly like `@extas/metrics`, the old views kept and marked superseded (92, 93); the rules engine's delivery figure is the band charge the checkout uses (54); oversold stock shows as a negative number and raises shortage cards that block booking until a person decides (16); the hardcode guard catches the simulation's hard-coded customer texts (14, first half). Two money questions go to the owner (BLOCKED 18, 19); nothing changes until he answers. |
| #30 | PR [53](docs/stages/S02.md#pr-53), [67](docs/stages/S02.md#pr-67), [68](docs/stages/S02.md#pr-68), [69](docs/stages/S02.md#pr-69), [70](docs/stages/S02.md#pr-70), [71](docs/stages/S02.md#pr-71), [74](docs/stages/S02.md#pr-74), [75](docs/stages/S02.md#pr-75), [40](docs/stages/S02.md#pr-40) | 23 Oct | Storefront batch 3 (S02, demo V12.2, settings v23, no admin screen). The product page's first-screen budget as one setting with a device-gate check; "Wear it with" and "Recently viewed" rows that slide and pause for mouse, touch and keyboard; the floating rail (wishlist heart, WhatsApp) and the share tiles, both off by default; the site-wide WhatsApp button as a switch, off; the wishlist at `/account/wishlist` kept per browser on the server, with "Move to wishlist" in the bag; the phone menu's sub-categories opening in place; help pages at `/help/<slug>` built only from live rules and the owner's words ("Coming soon" until then); the phone header stays one line with WhatsApp on. Device gate 0 fails in 1302 checks. |
| #29 | PR [6](docs/stages/S0A.md#pr-6), [196](docs/stages/S09.md#pr-196), [155](docs/stages/S05.md#pr-155), [139](docs/stages/S05.md#pr-139) | 23 Oct | The owner's CN-022 foundation items. A background worker (`@extas/jobs`): BullMQ with one scheduler leader, a `JobRun` row per attempt with retries, backoff and a dead letter, a heartbeat, and a retry never repeats a finished run; stock pull, cart-hold expiry, the ERP outbox and reconcile run on it; the Server page (`/admin/server`) shows the worker's state and the failed jobs (PR [6](docs/stages/S0A.md#pr-6)). An ERP webhook receiver (`POST /api/erp/webhook`) for `stock.changed` and `variant.changed`: signature checked with the key in the vault (refuses everything until it is entered), a time window, stored once per event id, an older change than the shop holds is ignored; polling stays as the fallback and the practice ERP stays until the owner connects the real one (PR [196](docs/stages/S09.md#pr-196)). One KPI definition (`@extas/metrics`): "Sales" = delivered orders only, "Ordered value" shown beside it; the combo report now shows both, and a test fails any report that adds up order money on its own (PR [155](docs/stages/S05.md#pr-155)). The audit log and 13 other history tables are append-only at the database: the app runs as its own role, which cannot change or delete those rows, and a trigger refuses it for every role (PR [139](docs/stages/S05.md#pr-139)). |
| #28 | PR [115](docs/stages/S04.md#pr-115), [116](docs/stages/S04.md#pr-116), [117](docs/stages/S04.md#pr-117), [118](docs/stages/S04.md#pr-118), [119](docs/stages/S04.md#pr-119), [120](docs/stages/S04.md#pr-120), [121](docs/stages/S04.md#pr-121), [122](docs/stages/S04.md#pr-122), [123](docs/stages/S04.md#pr-123), [124](docs/stages/S04.md#pr-124), [125](docs/stages/S04.md#pr-125), [126](docs/stages/S04.md#pr-126) | 23 Oct | The checkout on new.extas.com.bd (S04 22/41): `/checkout` and `/bn/checkout` from demo V12.2 with the steps header and the phone's order-summary bar; name, phone and address with inline checks; the address read by the national gazetteer, and "where is this address?" instead of a guess; the delivery charge from the zone, shown before typing; payment methods with Cash on Delivery only when the owner's switch and the Smart Rules allow it, and mobile banking, card and online on a test payment page until the gateways' keys arrive (no money moves); quantity and remove, wallet, the marketing opt-in, Confirm button states; order placement that is idempotent (one press, one order) and stores exactly the money shown (SIM-F-003), keeps failed payments with a retry (SIM-F-026); the thank-you page. The order is created in its first state only; order states, refunds and returns wait for the owner (CN-022). Every option is a `checkout.*` setting (registry v20), off or empty where optional, no admin screen (CN-019). Also filed: CN-022 (worker, ERP webhook, one "Sales" KPI, append-only audit log). |
| #27 | PR [82](docs/stages/S02.md#pr-82), [54](docs/stages/S02.md#pr-54), [55](docs/stages/S02.md#pr-55), [56](docs/stages/S02.md#pr-56), [57](docs/stages/S02.md#pr-57), [60](docs/stages/S02.md#pr-60), [61](docs/stages/S02.md#pr-61), [62](docs/stages/S02.md#pr-62), [63](docs/stages/S02.md#pr-63), [64](docs/stages/S02.md#pr-64), [49](docs/stages/S02.md#pr-49) | 23 Oct | The product page on new.extas.com.bd (S02 23/58): template T1 at `/p/<product>` and `/p/<product>/<colour>` (and `/bn/…`), photos with one swipe strip per colour, thumbnails and full-screen zoom; colour swatches with each colour's own address and "All N colours"; size pills S to 4XL where a sold-out size is crossed out, never hidden (SIM-F-035); the size chart popup in inches and cm; the stock line and "Only N left"; the price block with the ৳ never split from its number; the promise row and the Delivery · Exchange · Returns cells read live from Smart Rules; Fabric & care; and the bag's Add button with the added-to-bag panel (follow-up 38). Every option is a `pdp.*` setting (registry v19), off or empty where it is optional, no admin screen (CN-019). Bengali pages with products no longer stall on fonts (PR [82](docs/stages/S02.md#pr-82), follow-up 23), with a seeded Lighthouse check in CI. |
| #26 | PR [105](docs/stages/S04.md#pr-105), [106](docs/stages/S04.md#pr-106), [108](docs/stages/S04.md#pr-108), [109](docs/stages/S04.md#pr-109), [110](docs/stages/S04.md#pr-110), [111](docs/stages/S04.md#pr-111), [112](docs/stages/S04.md#pr-112), [113](docs/stages/S04.md#pr-113), [114](docs/stages/S04.md#pr-114), [107](docs/stages/S04.md#pr-107) | 23 Oct | The bag on new.extas.com.bd (S04 10/41): `/bag` and `/bn/bag` from demo V12.2, kept across visits in a secure cookie for 30 days (a setting); lines with size, quantity and price, removed lines archived with Undo (never deleted); set lines with each piece linking to its product; the added-to-bag panel (mounted by the product page, follow-up 38); one offer slot and the tier box; the two-sizes notice asked once (SIM-F-036); the order summary; the discount code box with every refusal in words (SIM-F-009); free-delivery progress; "You may also like". Every word in English and Bengali, every amount and switch a setting (registry v18), no admin screen (CN-019). CI now starts the app as the Dockerfile does (all addresses), so `/bn` pages are measured in Bengali, and runs the bag tests on PostgreSQL. |
| #25 | PR [41](docs/stages/S02.md#pr-41), [85](docs/stages/S02.md#pr-85), [45](docs/stages/S02.md#pr-45), [46](docs/stages/S02.md#pr-46), [47](docs/stages/S02.md#pr-47), [48](docs/stages/S02.md#pr-48) | 23 Oct | Category page on new.extas.com.bd (S02 13/58): `/collections/[slug]` and `/bn/collections/[slug]`, with `/collections/new-in` for the newest styles; a grid with breadcrumb, SEO text block and questions, and Show more pages; filters built from the category's own products with live counts (stock, size, colour, fit, price band, on sale, quick chips; a sold-out size is crossed out, never hidden, SIM-F-035); a real listbox for sort; a sticky filter bar; all settings in `categoryPage` (registry v17), no admin screen (CN-019). The home hero's default words no longer claim a count, season or year, and a test keeps every shop default free of such claims (PR [41](docs/stages/S02.md#pr-41), CN-017). When the device gate fails, CI prints and keeps the app's log (PR [85](docs/stages/S02.md#pr-85)). |
| #24 | PR [11](docs/stages/S00.md#pr-11), [85](docs/stages/S02.md#pr-85), [214](docs/stages/S10.md#pr-214), [508](docs/stages/S00.md#pr-508) | 23 Oct | Follow-ups: every package lints with ESLint and says what it is for at the top of `src/index.ts` (PR [11](docs/stages/S00.md#pr-11)); the device gate signs in on the sample data, so admin controls that only show with data are checked at 44 × 44, 0 fails in 620 checks (PR [85](docs/stages/S02.md#pr-85)); Eid order-by dates per band and district with a pre-order advance, as engine, settings and API, all off and empty, with no admin screen until the admin architecture is approved (PR [214](docs/stages/S10.md#pr-214)).; the admin session end to end runs in CI on every pull request in real Chromium: sign in, refresh, the sign-in page while signed in, log out, and the old session refused afterwards (PR [508](docs/stages/S00.md#pr-508)). |
| #23 | PR [82](docs/stages/S02.md#pr-82), [501](docs/stages/S02.md#pr-501), [503](docs/stages/S02.md#pr-503), [84](docs/stages/S02.md#pr-84), [42](docs/stages/S02.md#pr-42), [40](docs/stages/S02.md#pr-40), [85](docs/stages/S02.md#pr-85), [41](docs/stages/S02.md#pr-41), [43](docs/stages/S02.md#pr-43), [4](docs/stages/S0A.md#pr-4) | 23 Oct | Storefront foundation and home page on new.extas.com.bd (S02 9/58): four themes on one token set, branding and the eleven logo styles from settings, English and Bengali shop (`/bn`, language switch, hreflang), one slider engine with separate touch, mouse and keyboard pauses, the store shell (announcement bar, header, phone menu, bottom bar, footer, checkout header, coming-soon pages, 404), 44 px tap layers, the home page and the hero slider, matched to demo V12.2; storefront pages in the device gate and the Lighthouse budget (TBT under 200 ms); the footer sign-up form stays hidden until the sign-up list exists (CN-017: no promise the shop can't keep). The nightly smoke test now runs the checks of the live version, so a check merged before its deploy can't give a false alarm (PR [4](docs/stages/S0A.md#pr-4)). |
| #22 | PR [89](docs/stages/S03.md#pr-89), [90](docs/stages/S03.md#pr-90), [571](docs/stages/S03.md#pr-571), [99](docs/stages/S03.md#pr-99), [101](docs/stages/S03.md#pr-101), [96](docs/stages/S03.md#pr-96), [97](docs/stages/S03.md#pr-97), [575](docs/stages/S03.md#pr-575), [104](docs/stages/S03.md#pr-104), [549–553](docs/stages/S06.md), [555](docs/stages/S06.md#pr-555), [500](docs/stages/S00.md#pr-500) | 22 Oct | S03 combo core: combo model, admin `/admin/combos` (fixed combos, auto colour-pair rules, set photo, report), set tiers from Smart Rules, set validation, summary and add-to-bag with a locked price; S06 delivery-zone engine: gazetteer (sample list), bands (Dhaka City map, sub-area list, outside), whole-line resolver with "Where is this address?", charge only from a resolved place (collision suite), autocomplete, phone-first area fill; admin `/admin/delivery` with its Bengali guide; sign-in says "write the full e-mail address" when the e-mail has no "@" (PR [500](docs/stages/S00.md#pr-500), smoke-checked); Bengali guides for every built admin section (CN-014) |
| #20 | PR [4](docs/stages/S0A.md#pr-4), [85](docs/stages/S02.md#pr-85), [8](docs/stages/S0A.md#pr-8), [594](docs/stages/S21.md#pr-594), [17](docs/stages/S00.md#pr-17) | 20 Oct | CI parses every workflow file (PR [17](docs/stages/S00.md#pr-17)); Smoke test on new.extas.com.bd after every deploy and every night (every built page signed out and as a read-only check account, phone and desktop; a failure rolls the deploy back; pictures in `docs/reports/smoke/latest/`, CN-016); device gate (15 phones, 10 tablets, 6 desktops) in CI, 0/341 fails, admin tap targets 44×44; product photos and a dated docs bundle in every nightly backup, checked by the restore test; docs copied to the server on every deploy with the commit hash (CN-011) |
| #19 | PR [208–219](docs/stages/S10.md), [594](docs/stages/S21.md#pr-594), [509](docs/stages/S00.md#pr-509), [508](docs/stages/S00.md#pr-508), [4](docs/stages/S0A.md#pr-4), [17](docs/stages/S00.md#pr-17), [15](docs/stages/S00.md#pr-15), [7](docs/stages/S0A.md#pr-7) | 20 Oct | Admin sign-in fixed: a fresh installation gets its mother store in the migrate step (PR [508](docs/stages/S00.md#pr-508)), and CI signs in end to end on the production images before every deploy (PR [4](docs/stages/S0A.md#pr-4)); S10 Smart Rules complete (engine, rule admin with live preview, delivery/exchange/set/discount/festive rules, coupons, notices and pop-ups, conflicts, history, simulation); `readme-guard` CI check; store-settings falls back to the newest migrate image; `ci.yml` parses again (PR [17](docs/stages/S00.md#pr-17)), so CI and deploys run; the owner's way back in when he cannot sign in: `owner-reset.yml` gives his account a new first password on the server (PR [15](docs/stages/S00.md#pr-15)) |
| #18 | PR [509](docs/stages/S00.md#pr-509), [17](docs/stages/S00.md#pr-17), [15](docs/stages/S00.md#pr-15), [4](docs/stages/S0A.md#pr-4) + CN-010 | 20 Oct | Owner values go into the live store from the server (`store-settings.yml`), the owner-account workflow and Bengali password steps, deploy result committed back, CI checks one register PR per commit and README against the register; BLOCKED answers struck through |
| direct | CN-011: README as the A-to-Z front page; docs on the server and in backups | 20 Oct | This page rewritten as the full front page, `docs/README.md` index, CN-011 in blueprint and register, CLAUDE.md rules |
| direct `f3822d0` | CN-009: owner answers (Note 52) | 12:22 | Watermark text, photos never deleted, honest "was" price, defaults; owner data is never a blocker |
| direct `303b342` | CN-008: demo V12.1 | 12:13 | Demo V12.1 (owner desktop review, 44 items), QA and admin audit reports, owner notes, agent skills; README as live status page |
| #17 `1c8a4d6` | PR [197–200](docs/stages/S09.md), [202–207](docs/stages/S09.md) | 11:17 | S09 complete: cart holds, ERP order documents, low stock, stock counts, sync health page, re-sync, movement report |
| #16 `a8face8` | PR [33](docs/stages/S01.md#pr-33), [36](docs/stages/S01.md#pr-36), [39](docs/stages/S01.md#pr-39) (+ [27](docs/stages/S01.md#pr-27)/[32](docs/stages/S01.md#pr-32) and [22](docs/stages/S01.md#pr-22) follow-ups) | 10:08 | Import from a link, ghost archive and back-in-stock, product audit; links archived never deleted; storage-mock photo fix |
| #15 `4563976` | PR [497](docs/stages/S09.md#pr-497), [498](docs/stages/S09.md#pr-498), [499](docs/stages/S09.md#pr-499), [194](docs/stages/S09.md#pr-194), [195](docs/stages/S09.md#pr-195), [196](docs/stages/S09.md#pr-196), [201](docs/stages/S09.md#pr-201) | 09:15 | ERP adapter and practice ERP, ERP mode and guard, sync layer, stock pull, company/warehouse mapping, locations |
| #14 `26d2b1f` | PR [21](docs/stages/S01.md#pr-21), [26–29](docs/stages/S01.md), [32](docs/stages/S01.md#pr-32), [34](docs/stages/S01.md#pr-34), [35](docs/stages/S01.md#pr-35), [38](docs/stages/S01.md#pr-38) | 08:22 | Product admin screens, publish checklist and health score, publish queue, size charts, collections and tags, CSV, "was" price |
| #13 `54b7d95` | PR [500](docs/stages/S00.md#pr-500) (fix) | 07:24 | Self-hosted fonts, so the image build never downloads fonts |
| #12 `28ea164` | PR [19](docs/stages/S01.md#pr-19), [20](docs/stages/S01.md#pr-20), [22–25](docs/stages/S01.md), [30](docs/stages/S01.md#pr-30), [31](docs/stages/S01.md#pr-31), [37](docs/stages/S01.md#pr-37), [590](docs/stages/S01.md#pr-590) | 06:54 | Catalogue domain and API, image pipeline, watermark, responsive images, photo minimum, media library, naming and links |
| #11 `4407ddf` | PR [500](docs/stages/S00.md#pr-500) | 06:10 | Admin sign-in and frame, Keys & connections page; S0A and S00 reports |
| #10 `b5fe56d` | PR [509](docs/stages/S00.md#pr-509), [508](docs/stages/S00.md#pr-508), [14](docs/stages/S00.md#pr-14) | 05:20 | Owner-data register and check, general default pack, sample catalogue |
| #9 `fa6b77e` | PR [15](docs/stages/S00.md#pr-15), [16](docs/stages/S00.md#pr-16), [495](docs/stages/S00.md#pr-495) | 05:09 | Staff and customer sign-in, permission checks on every admin action, role builder, audit log |
| server report `5c0656e` | server report 04:34 | 04:34 | Machine report after PR [18](docs/stages/S00.md#pr-18)'s setup run |
| #8 `1861652` | PR [18](docs/stages/S00.md#pr-18) | 04:34 | Adapter framework (mock / sandbox / live) and the storage adapter |
| server report `72f88b1` | server report 04:21 | 04:21 | Machine report |
| #7 `aaa5f76` | PR [491](docs/stages/S00.md#pr-491), [492](docs/stages/S00.md#pr-492), [496](docs/stages/S00.md#pr-496), [510](docs/stages/S00.md#pr-510) | 04:20 | Settings framework, resolver, settings migration on deploy, reset to default |
| #6 `5667515` | PR [493](docs/stages/S00.md#pr-493) (+ PR [17](docs/stages/S00.md#pr-17) fix) | 04:12 | Credential vault; Lighthouse gate on real throttled paint |
| #5 `9959d1b` | PR [494](docs/stages/S00.md#pr-494) | 03:44 | Hardcode guard as the first CI step |
| #4 `3122834` | PR [13](docs/stages/S00.md#pr-13), [603](docs/stages/S00.md#pr-603) | 03:39 | Full Prisma schema with `storeId`, index pack, CI `db` job |
| server report `50daeb7` | server report 03:00 | 03:00 | Machine report |
| #3 `d2ed429` | PR [11](docs/stages/S00.md#pr-11), [12](docs/stages/S00.md#pr-12), [17](docs/stages/S00.md#pr-17) | 02:59 | App skeleton, CI gates, zero-downtime deploy, Bengali status page; first deploy live at 03:03 |
| server report `5bddc39` | server report 02:47 | 02:47 | Machine report |
| #2 `3a8d198` | PR [7](docs/stages/S0A.md#pr-7) (CN-007) | 02:46 | Preview password stays on the server, rotatable |
| server report `d5f2220` | server report 02:40 | 02:40 | First machine report |
| #1 `c96b258` | PR [1–10](docs/stages/S0A.md), [601](docs/stages/S0A.md#pr-601), [604](docs/stages/S0A.md#pr-604) | 02:38 | S0A: server setup as code, workflows on the runner |
| direct `ae1e461` | CN-006 | 02:34 | Run without stopping: no wave-boundary stop, no permission asks, auto-resume |
| direct `4c2be88` | Owner rule | 02:29 | Plans and reports by stage/PR, never by days |
| direct `59865ae` | CN-005 | 02:22 | ERP ↔ shop API contract (`docs/ERP-API-CONTRACT.md`) |
| direct `9895254` | CN-004 | 02:02 | Agent/skill changes exported to `docs/agents/live`; runner script sh-compatible |
| direct `dc0936a` | Session 0 | 01:33 | Repository set up: blueprint V2.1 final, register, demo V12, QA tools, agent files, CLAUDE.md, START-HERE, runner bootstrap |
| `7222f55` | Initial commit | 15 Oct | Empty repository |

---

## Change notes

> **বাংলায় সংক্ষেপে:** মালিকের প্রতিটা নতুন সিদ্ধান্ত একটা "পরিবর্তনের নোট" (CN) হয়ে ব্লুপ্রিন্ট আর রেজিস্টারে ওঠে।

A change note records what the owner asked, which PRs it lands on and the date (process:
[How changes are made after V2](docs/BLUEPRINT.md#how-changes-are-made-after-v2),
[`docs/owner/CHANGE-PROCESS.md`](docs/owner/CHANGE-PROCESS.md)). The notes sit as dated blocks in the blueprint and
the register.

| Note | Date | One line | Where |
|---|---|---|---|
| CN-001 | 19 Oct 23:33 | The owner's server specification: blueprint V2 → V2.1, new PR 601–604, dated scope on many server PRs | [V2 → V2.1 change log](docs/BLUEPRINT.md#v2--v21-change-log-cn-001-owner-19-oct-2333) · [A2.9](docs/BLUEPRINT.md#a29-server-specification--v21--19-oct-2333-owner-cn-001--locked) |
| CN-002 | 20 Oct 00:45 | VM created in Malaysia West zone 1 (kept instead of Southeast Asia); Blob in the same region; ports 22/80/443 verified | [Blueprint front matter](docs/BLUEPRINT.md) |
| CN-003 | 20 Oct 01:30 | Server reached through a self-hosted runner, no SSH; build deploys to new.extas.com.bd, extas.com.bd untouched until go-live; repo and entry files; 4-piece prices stay demo default | [A1](docs/BLUEPRINT.md#a1-how-this-build-runs) |
| CN-004 | 20 Oct 02:01 | Agent profiles, skills and lessons changed in the AI panel are exported to `docs/agents/live/` | [A1](docs/BLUEPRINT.md#a1-how-this-build-runs) |
| CN-005 | 20 Oct 02:25 | The ERP ↔ shop API is fixed in `docs/ERP-API-CONTRACT.md` | [A3](docs/BLUEPRINT.md#a3-architecture--the-erp-is-the-master) |
| CN-006 | 20 Oct 02:33 | The build never stops for the owner: report at wave ends and continue; only money / deletion / irreversible items and the go-live switch need him | [A1](docs/BLUEPRINT.md#a1-how-this-build-runs) |
| CN-007 | 20 Oct | The preview password never goes through chat, logs or artifacts; the owner reads it on the VM; rotatable | [A1](docs/BLUEPRINT.md#a1-how-this-build-runs) |
| CN-008 | 20 Oct | Owner desktop review of V12 (44 items, invoices, admin screens) built into demo V12.1, the new UI truth | [A1](docs/BLUEPRINT.md#a1-how-this-build-runs) · [register](docs/MASTER-REGISTER.md#build-status) |
| CN-009 | 20 Oct 12:22 | Owner answers (Note 52): watermark text, photos never deleted, honest "was" price, defaults; owner data is never a blocker | [A1](docs/BLUEPRINT.md#a1-how-this-build-runs) · [register](docs/MASTER-REGISTER.md#build-status) |
| CN-010 | 20 Oct 12:47 | Owner Note 53: the home page shows the store (built parts, "শিগগির আসছে" elsewhere; progress only at `/status`), S02 now beside the rest, the owner's admin account opened on the server | [A1](docs/BLUEPRINT.md#a1-how-this-build-runs) · [register](docs/MASTER-REGISTER.md) |
| CN-011 | 20 Oct | README is the live, detailed front page; every deploy copies `docs/` to the server for the admin's register tabs; every backup carries a dated docs bundle; an organisation standard every PR keeps | [A1](docs/BLUEPRINT.md#a1-how-this-build-runs) · [register](docs/MASTER-REGISTER.md#build-status) |
| CN-012 | 20 Oct | Owner Note 54: hero campaigns with ready templates; checkout texts, field order, bag style and payment options are settings; design changes reach the phone only after the device gate | [register](docs/MASTER-REGISTER.md#build-status) |
| CN-013 | 20 Oct | Think beyond the ask: the 50-order journey simulation is a go-live gate; every finding gets fix, prevention, core review and growth ideas | [register](docs/MASTER-REGISTER.md#build-status) |
| CN-014 | 20 Oct | Eight simulation ideas as optional settings (off by default); gift mode is new PR 605; a Bengali guide per admin section | [register](docs/MASTER-REGISTER.md#build-status) · [`docs/admin-guide/`](docs/admin-guide/README.md) |
| CN-015 | 20 Oct | Customer problems found automatically: "Running problems" in the admin and at the top of this README | [register](docs/MASTER-REGISTER.md#build-status) |
| CN-016 | 20 Oct | Nothing reaches the owner broken: smoke test after every deploy and every night, rollback on failure | [register](docs/MASTER-REGISTER.md#build-status) |
| CN-017 | 23 Oct | 50-order simulation on demo V12.2: 39 findings, each a required acceptance test of its PR; bulk / corporate lane is new PR 606 | [register](docs/MASTER-REGISTER.md#build-status) · [report](docs/qa/SIMULATION-REPORT.md) |
| CN-018 | 23 Oct | Owner's answers to the simulation questions, all as backend settings; "build the system, never ask for numbers"; simple admin architecture first | [register](docs/MASTER-REGISTER.md#build-status) |
| CN-019 | 23 Oct | One Messages control centre; a modern, simple admin with mock-ups first; a detailed Bengali manual; 20 more simulation orders | [register](docs/MASTER-REGISTER.md#build-status) |
| CN-023 | 24 Oct | CI under 25 minutes with every gate as strict: one Lighthouse run (core set plus touched pages on a pull request, every page on `main`, nightly and by hand), one build reused by parallel jobs, pnpm / Next.js / Playwright caches | [register](docs/MASTER-REGISTER.md#build-status) |
| CN-028 | 25 Oct | Retail becomes a separate buyer of the ERP (contract v6): the ERP bills at shipment, returns go back as return lists, exchange within 72 hours through the ERP, no refunds after delivery; the shop keeps its own books and both sides must match every day, week, month, year and for life; 15 new PRs (607–621), 621 PRs in all | [register](docs/MASTER-REGISTER.md#build-status) · [model](docs/RETAIL-ERP-MODEL.md) |
| CN-029 | 30 Oct | PR 607–621 in one run with five builders in parallel; two new section agents; one ERP link and its own keys per store; old exchange and return code reworked inside the same run | [register](docs/MASTER-REGISTER.md#build-status) · [plan](docs/RETAIL-ERP-MODEL.md) |
| CN-030 | 31 Oct | Google Drive backup and restore in one click like the ERP (own Google client, device code, `drive.file`, one connection per store); replaces the service-account wording | [register](docs/MASTER-REGISTER.md#build-status) |
| CN-031 | 31 Oct | Finish Launch in one run; never idle; three builders; lighter reviews; After-launch by priority | [track](docs/LAUNCH-TRACK.md) |
| CN-032 | 31 Oct | A page never stays blank in one browser because of what it saved: browser translation off, a self-mending safety net, and a "Start fresh" page that clears only this site's data in that browser (PR 12) | [register](docs/MASTER-REGISTER.md#build-status) |
| CN-033 | 31 Oct | The shop follows the ERP's 30 Oct retail decisions: switch-over as a fresh start (no moved orders, no cost-of-goods), B-grade lines held until the ERP opens them, a refused exchange parcel billed at the deadline and credited when it comes back approved (PR 610, 614, 619, 621) | [register](docs/MASTER-REGISTER.md#build-status) |
| CN-034 | 1 Nov | One final customer 360° analysis before go-live, "add whatever I missed": three gaps no PR covered become PR 622 Buy again (S04), 623 the customer's own privacy request into the staff screen (S18) and 624 a Messenger button (S22), each off by default and After launch; total 624 PRs (618 active) | [register](docs/MASTER-REGISTER.md#build-status) · [analysis](docs/qa/FINAL-ANALYSIS-2026-11.md) |
| CN-035 | 6 Nov | Go-live not held by the owner's own set-up steps; go-live page: Needed before / Soon after go-live | [track](docs/LAUNCH-TRACK.md) |
| CN-036 | 6 Nov | New default admin look "Lumen" before go-live (PR 625–648; looks ক, খ, গ parked as 649–651), closed stages hidden (652), redirect import from the old public sitemap (653); serial order S02 → S12 → S13 → S15 → S25 → S24, S17/S23/S26/S27 closed; go-live on the owner's typed "go live"; total 653 PRs | [register](docs/MASTER-REGISTER.md#the-stage-table) · [track](docs/LAUNCH-TRACK.md) |

---

## Docs map

> **বাংলায় সংক্ষেপে:** কোন কাগজ কোথায় আছে। পুরো তালিকা [`docs/README.md`](docs/README.md)-এ।

| What | Where |
|---|---|
| Full specification (V2.1 final + change notes) | [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md) — older versions in [`docs/history/`](docs/history) |
| All 653 PRs, build status, stage table | [`docs/MASTER-REGISTER.md`](docs/MASTER-REGISTER.md) |
| UI truth: the clickable demo | [`docs/demo/EXTAS-demo-V12.2.html`](docs/demo/EXTAS-demo-V12.2.html) (download, open in a browser) · source in [`docs/demo/src/`](docs/demo/src) · V12.1 and V12 kept beside it as history · public share build: see [`docs/README.md`](docs/README.md) |
| Every owner note | [`docs/owner/ROUND15.md`](docs/owner/ROUND15.md) (and `ROUND14.md`) |
| Owner reviews, research and plans | [`docs/owner/`](docs/owner) — desktop and phone reviews, combo research and ranking, Google traffic plan, blog plan, server spec, change process |
| QA checklist and reports | [`docs/qa/ECOMMERCE-CHECKLIST.md`](docs/qa/ECOMMERCE-CHECKLIST.md) · reports and tools in [`docs/qa/`](docs/qa) · gates in Blueprint [Appendix C](docs/BLUEPRINT.md#appendix-c--qa-gate-definition-and-test-inventory) |
| Agents, skills, lessons | [`docs/agents/`](docs/agents) — seven agent profiles, protocol, curriculum, skills, [`lessons/ALL.md`](docs/agents/lessons/ALL.md) |
| ERP API contract | [`docs/ERP-API-CONTRACT.md`](docs/ERP-API-CONTRACT.md) |
| How sessions run, coding mechanics | [`docs/START-HERE.md`](docs/START-HERE.md) · [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) |
| Server in plain Bengali | [`docs/SERVER.md`](docs/SERVER.md) · latest machine report [`docs/reports/server/latest.md`](docs/reports/server/latest.md) |
| Stage reports in Bengali | [`docs/reports/`](docs/reports) |
| Admin guides in Bengali, one per section (CN-014) | [`docs/admin-guide/`](docs/admin-guide/README.md) |
| Owner guides | [`RUNNER-SETUP.md`](docs/owner/RUNNER-SETUP.md) (runner, once) · [`PREVIEW-LOGIN.md`](docs/owner/PREVIEW-LOGIN.md) (preview password) · [`AZURE-VM-GUIDE.pdf`](docs/owner/AZURE-VM-GUIDE.pdf) (the VM) · [`OWNER-PRECODE-CHECKLIST.md`](docs/owner/OWNER-PRECODE-CHECKLIST.md) |

---

## For a future developer

> **বাংলায় সংক্ষেপে:** ৫ বছর পরে নতুন কেউ এলে যেন সব বোঝে — কোড লেখার নিয়ম, নতুন সেটিং যোগ করার নিয়ম, নতুন কাজ রেজিস্টারে
> তোলার নিয়ম, আর হস্তান্তরের নিয়ম।

**README must stay current (readme-guard, CN-011).** CI's `readme-guard` job ([`tools/readme-guard.mjs`](tools/readme-guard.mjs))
fails any pull request into `main` whose title names a PR with no row in the PR log below, whose stage counts differ
from the register's Build status, or that touches a stage still marked "Not started" under Features. Update the
dashboard, the PR log and the feature section in the same pull request; nothing merges while any check is red.

### Read in this order

1. [`CLAUDE.md`](CLAUDE.md) — the owner's hard rules. 2. [`docs/START-HERE.md`](docs/START-HERE.md) — how a session
runs. 3. [`PROGRESS.md`](PROGRESS.md) and [`BLOCKED.md`](BLOCKED.md) — where things stand. 4. The register row of the
PR you build (with every dated "Updated …" scope) and its blueprint section. 5. For UI, the matching demo screen.
6. [`docs/agents/lessons/ALL.md`](docs/agents/lessons/ALL.md) — the owner's past corrections.

### Coding standards found in the repo

- **TypeScript strict** everywhere (`tsconfig.json` in each package). **ESLint:** `eslint-config-next` in
  `apps/web`, `@eslint/js` + `typescript-eslint` recommended in packages (unused variables are errors unless prefixed
  `_`). The schema is checked with `prisma validate` and `prisma format --check`. There is no Prettier config; keep
  the style of the file you edit.
- **Tests beside the code.** Packages keep tests in `packages/<name>/test/` (`*.test.ts` pure,
  `*.db.test.ts` on a throwaway PostgreSQL); the app keeps them next to the file (`apps/web/src/lib/*.test.ts`,
  `components/**/*.test.ts(x)`); tools have `tools/*.test.mjs`; infra has `infra/tests/run.sh`. vitest everywhere.
- **No visible text in code:** every word comes from a messages file (English + Bengali). **No number or limit in
  code:** it is a setting. **No key in code:** it is in the vault. The hardcode guard enforces it.
- **Nothing is deleted:** records are archived (`archivedAt`), links forward, removed features become switches,
  superseded text is struck through.
- **Clear names and a header comment.** Files start with a comment naming their PR and purpose; each package's
  `src/index.ts` explains the package.
- **Commits and PRs** ([`docs/CONVENTIONS.md`](docs/CONVENTIONS.md), CLAUDE.md "Commits"): title
  `PR <number>: <what it does>` (change notes `CN-###: …`), branch `pr-<number>-<slug>`, body from
  [`.github/pull_request_template.md`](.github/pull_request_template.md), merged after the gates pass. After each PR:
  the register Build status row, PROGRESS.md, BLOCKED.md if needed, and this README (dashboard, PR log row, the
  area's feature section).

### How to add a setting

1. Declare it in `packages/settings/src/registry*.ts` with `setting({ schema, default, scope, valueType, group,
   labelKey, helpKey, isOwnerData })` — owner data has **no default**.
2. Add its English and Bengali label and help in `packages/settings/messages/*.json`.
3. Read it through the resolver (`displaySettings` / the package's settings reader), never from the environment.
4. Deploy runs `settings sync`, which gives every installation the new key; nothing else to bump.
5. If it is the owner's own data, it also belongs in the owner-data register
   ([`packages/settings/src/owner-data.ts`](packages/settings/src/owner-data.ts)).

A new permission is one line in [`packages/auth/src/catalogue.ts`](packages/auth/src/catalogue.ts) plus its labels
in `packages/auth/messages/auth.*.json`; the deploy's `auth sync` grants it to the owner role.

### How to add a PR to the register (change process)

1. Is it scope on an existing PR? Then add a dated "**Updated <date>:** …" to that PR's row; the total does not move.
2. Otherwise it takes the **next free number** inside the stage it belongs to (numbers from 491 on are identities,
   not positions); update the totals at the top of the register in the same edit.
3. Write a change note **CN-###** (next free number) as a dated block in `docs/MASTER-REGISTER.md` (before "The stage
   table") and in `docs/BLUEPRINT.md` (under "A1. How this build runs"), and add it to the table above.
4. Only then build it. Full process: [`docs/owner/CHANGE-PROCESS.md`](docs/owner/CHANGE-PROCESS.md).

### Handover rules

- **Nothing hardcoded** (PR 491–496, guard PR 494): every name, number, price, text, key or limit is a setting.
- **The owner's own data never ships** (PR 509): store name, logo, contacts, bank details, customers, orders, every
  money setting and all media are listed in the owner-data register; the installation export leaves them out and
  refuses if one slips in. The repo holds sample data only.
- **No secrets in Git, ever:** keys live in the vault and are typed in by the owner on Keys & connections; server
  secrets are generated on the server.
- **Every integration runs on a mock until its key arrives** (A1.3).
- **Docs travel with the code** (CN-011): `docs/` goes to the server on every deploy and into every backup, so a
  restore brings back the documentation of that exact version. Filed as a rule; built with the deploy workflow,
  PR 594 and PR 8 / 395 / 507 (not running yet).
