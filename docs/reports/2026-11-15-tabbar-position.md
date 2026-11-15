# ট্যাব বারের জায়গা বদলানো: মাপ আর কারণ (১৫ নভেম্বর ২০২৬)

শুধু মাপা আর কারণ খোঁজা হয়েছে। কোনো ফিচার কোড বদলানো হয়নি। ফিক্স এখনো করা হয়নি, নিচে প্রস্তাব আছে।

## ১. সংক্ষেপে

- আপনি ঠিকই ধরেছেন। এক সেকশনের এক পেজ থেকে আরেক পেজে গেলে ট্যাব বার উপর-নিচ করে।
- ল্যাপটপে (1366px) যত পেজ মাপা গেছে তার 90টা / 149টাতে (প্রায় 60%) বার সেকশনের প্রথম পেজের চেয়ে আলাদা জায়গায়। সবচেয়ে বেশি ফারাক 107px।
- ফোনে (390px) 122টা / 147টাতে (প্রায় 83%) আলাদা। সবচেয়ে বেশি ফারাক 346px (এটা Products-এর প্রথম পেজের কারণে; কারণটা নিচে ৪ নম্বরে)।
- মূল কারণ: ট্যাব বার কোনো একটা ঠিক করা জায়গায় আঁকা হয় না। প্রতিটা পেজ নিজের ভেতরে নিজের শিরোনাম আর তার নিচে ট্যাব বার আঁকে। তাই বারের উচ্চতা = শিরোনামের উপরের সব কিছুর উচ্চতা। শিরোনামের নিচের লাইন (সাবটাইটেল) কোনো পেজে ১ লাইন, কোনোটাতে ৩ লাইন, ফোনে ৭ লাইন পর্যন্ত। তাই বার লাফায়।
- প্রোটোটাইপেও (admin-proto-v5) বার পুরো স্থির না। সেখানেও শিরোনাম আর সাবটাইটেলের নিচে বার বসে। তবে ফারাক ছোট: ল্যাপটপে ৬৪টার মধ্যে ১৯টায় (সর্বোচ্চ ৪৯px), ফোনে ৬৪টার মধ্যে ৩৬টায় (সর্বোচ্চ ১১৪px)। অর্থাৎ প্রোটোটাইপ কপি করলেও সমস্যা পুরো যাবে না। বার শিরোনামের **উপরে** নিয়ে ঠিক জায়গায় বসাতে হবে।
- প্রস্তাবিত ফিক্স: ট্যাব বার (আর তার নিচের ছোট চিপগুলো) পেজের ভেতর থেকে তুলে একবারই AdminShell-এর `<main>`-এর একদম উপরে আঁকা। তখন বারের Y সব পেজে একই, কারণ পেজের কনটেন্টের উপর নির্ভরই করে না।

## ২. কীভাবে মাপা হয়েছে

- নমুনা ডাটাবেস (সেম্পল ডেটা) দিয়ে অ্যাপ লোকালি চালানো হয়েছে। Playwright দিয়ে মালিক হিসেবে সাইন-ইন করে `tools/nav-audit-routes.json`-এর প্রতিটা পেজ খোলা হয়েছে (এই তালিকা admin-map আর nav-v5 থেকে তৈরি)।
- প্রতিটা পেজে মাপা হয়েছে: ট্যাব বারের (`data-testid="a2-tabs"`) উপরের দূরত্ব ও উচ্চতা, নিচের চিপের (`a2-subtabs`) জায়গা, শিরোনাম (h1) আর হেডার ব্লকের (`.a2-ph`) জায়গা ও উচ্চতা, বারের উপরে কোন কোন এলিমেন্ট আছে।
- Y মানে `<main>`-এর উপর থেকে দূরত্ব (পেজ স্ক্রল করা না অবস্থায়), যাতে টপবারের উচ্চতা হিসাবে না আসে।
- ফারাক = ওই পেজের বার Y − সেকশনের প্রথম পেজের বার Y। (প্রথম পেজ = মেনুর ক্রমে প্রথম মাপা পেজ।)

**যা মাপা যায়নি (সৎ কথা):** মেশিনে মেমরি কম ছিল আর অন্য কাজও চলছিল। ডেভ সার্ভার দুইবার ক্র্যাশ করেছে। তাই ৪২০টার মধ্যে ল্যাপটপে 149টা আর ফোনে 147টা পেজ পুরোপুরি মাপা গেছে (বাকি ল্যাপটপে 66টা, ফোনে 68টা বাদ)। Reports আর AI সেকশন কোনো আকারেই (বা প্রায় কোনো আকারে) মাপা যায়নি, Settings আর Help শুধু ল্যাপটপে, Rules শুধু ফোনে মাপা। এগুলোর কোড একই PageHead ধরন, তাই একই কারণ থাকার কথা, কিন্তু মাপ দিয়ে প্রমাণ হয়নি। ক্র্যাশের সময় যেসব পেজ ৫০০ দিয়েছে সেগুলো হিসাবে ধরা হয়নি। মাপার স্ক্রিপ্ট ঠিক করা আছে, ভালো মেশিনে আবার চালালে বাকিগুলো মাপা হবে।

## ৩. সেকশন ধরে সারাংশ

Y-এর একক px। "কম-বেশি" মানে ওই সেকশনে বারের সবচেয়ে উপরের আর সবচেয়ে নিচের জায়গা।

| সেকশন | প্রথম পেজ | ডেস্কটপে বার Y (প্রথম / কম-বেশি) | ডেস্কটপে কয়টা পেজে আলাদা | ফোনে বার Y (প্রথম / কম-বেশি) | ফোনে কয়টা পেজে আলাদা |
|---|---|---|---|---|---|
| Orders | `/admin/orders/batch` | 77 / 77-124 | 12 / 19 (সর্বোচ্চ 47px) | 153 / 132-292 | 16 / 19 (সর্বোচ্চ 139px) |
| Products | `/admin/products` | 184 / 77-238 | 10 / 18 (সর্বোচ্চ 107px) | 499 / 153-499 | 17 / 18 (সর্বোচ্চ 346px) |
| Customers | `/admin/customers` | 77 / 77-98 | 1 / 6 (সর্বোচ্চ 21px) | 153 / 153-174 | 4 / 6 (সর্বোচ্চ 21px) |
| Delivery | `/admin/delivery` | 77 / 77-103 | 2 / 6 (সর্বোচ্চ 26px) | 153 / 132-195 | 3 / 6 (সর্বোচ্চ 42px) |
| Support | `/admin/support` | 98 / 98-98 | 0 / 1 (সর্বোচ্চ 0px) | 174 / 153-174 | 6 / 8 (সর্বোচ্চ 21px) |
| Rules | `/admin/rules` | মাপা যায়নি | - | 168 / 168-321 | 4 / 5 (সর্বোচ্চ 153px) |
| Marketing | `/admin/marketing/overview` | 77 / 77-142 | 26 / 39 (সর্বোচ্চ 65px) | 259 / 132-259 | 36 / 37 (সর্বোচ্চ 127px) |
| Website | `/admin/website/layouts` | 91 / 77-163 | 23 / 27 (সর্বোচ্চ 72px) | 167 / 153-259 | 23 / 27 (সর্বোচ্চ 92px) |
| Money | `/admin/money` | 98 / 77-103 | 9 / 19 (সর্বোচ্চ 21px) | 195 / 153-195 | 13 / 20 (সর্বোচ্চ 42px) |
| Reports | `/admin/reports` | মাপা যায়নি | - | 153 / 153-153 | 0 / 1 (সর্বোচ্চ 0px) |
| AI | `-` | মাপা যায়নি | - | মাপা যায়নি | - |
| Settings | `/admin/settings/security` | 98 / 77-98 | 4 / 8 (সর্বোচ্চ 21px) | মাপা যায়নি | - |
| Help | `/admin/help` | 77 / 77-119 | 3 / 6 (সর্বোচ্চ 42px) | মাপা যায়নি | - |


## ৪. কারণগুলো (বেশি প্রভাব থেকে কম)

**কারণ ১: সাবটাইটেলের লাইন সংখ্যা বদলায় (নতুন PageHead পেজ, সবচেয়ে বেশি)**
- ল্যাপটপে PageHead পেজ ১৩৭টা: সাবটাইটেল ১ লাইনে ৭৫টা, ২ লাইনে ৫৫টা, ৩ লাইনে ৭টা। প্রতি লাইন ২১px। তাই বার ৭৭px, ৯৮px, ১১৯px... এই ধাপে বসে।
- ফোনে একই পেজ ১৩১টা: ১ লাইনে ৯টা, ২ লাইনে ৪১টা, ৩ লাইনে ৪৯টা, ৪ লাইনে ২৬টা, ৭ লাইন পর্যন্ত। বার ১৩২px থেকে ২৯২px পর্যন্ত ছড়ায়।
- কোডে: `apps/web/src/components/admin/shell/ShellParts.tsx` (PageHead, লাইন ১০১ থেকে) শিরোনাম, `<p className="a2-subt">` আর ডানের বোতাম একটা ব্লকে রাখে (`.a2-ph`, `apps/web/src/app/admin/shell.css:85`)। ব্লকের উচ্চতা সাবটাইটেলের লেখার উপর নির্ভর করে, কোনো সীমা নেই। ফোনে (`shell.css:291`) ডানের বোতামগুলো `width:100%` হয়ে আলাদা সারিতে নামে, তাই উচ্চতা আরও বাড়ে।
- উদাহরণ: `/admin/orders/packing/invoices` ল্যাপটপে +৪২px, ফোনে +৯৬px।

**কারণ ২: দুই রকম হেডার একসাথে আছে (পুরনো পেজ)**
- ১২টা (ল্যাপটপ) / ১৬টা (ফোন) পেজ নতুন PageHead নয়, পুরনো ধরনে আঁকা: উপরে `PageCrumb` সারি (সেকশন › ট্যাব + গাইড বোতাম), তারপর পেজের নিজস্ব হেডার (`.ad-hd`, `.cb-hd`, `.rl-hd` — এদের নিজের শিরোনাম, লাইন, বোতাম), তারপর বার।
- এই পেজগুলো: Products সেকশনের `/admin/products`, `/products/new`, `/stock`, `/stock/counts`, `/stock/movements`, `/products/back-in-stock`, `/combos`, `/size-charts`, `/products/queue`, `/products/import`, `/products/erp-import`, `/products/audit`; আর Rules সেকশনের `/rules`, `/rules/smart`, `/rules/offers`, `/rules/notices`।
- ফল: এখানে বার ল্যাপটপে ১৩০ থেকে ২৩৮px, ফোনে ১৫৪ থেকে ৪৯৯px। অন্য পেজে ৭৭ থেকে ১৪০px। ফোনে `/admin/products` (ProductListPage) এ বারের আগে ক্রাম্ব সারিই ৯৬px (গাইড বোতাম ভেঙে নামে) আর হেডার ৩৭১px, তাই ৪৯৯px। Products সেকশনের প্রথম পেজই এটা, তাই ওই সেকশনের "প্রথম পেজের চেয়ে ফারাক" সংখ্যাটা বড় দেখায়। আসলে সমস্যা এই এক পেজের।
- Products থেকে Add product / Stock / Combos এ গেলে লাফানোর বড় কারণ এটাই: ট্যাবগুলো দুই রকম হেডারের পেজে ছড়িয়ে আছে (`/products`, `/products/new`, `/stock`, `/combos` পুরনো; `/products/ranking`, `/products/sets`, `/combos/bag-box` নতুন)।

**কারণ ৩: বারের নিচের ফাঁক আর ফিল্টার চিপ**
- PageHead থেকে বারের মধ্যে সাধারণত ১৪px ফাঁক (১১৯টা পেজে)। ২৮ বা ৩০px ফাঁকের পেজও আছে (ল্যাপটপে ১৭টা)। মানে হেডার আর বারের মাঝে আরও কিছু (নোটিশ বা ফাঁকা ব্লক) বসেছে।
- সেকশনে ট্যাবের নিচে চিপ সারি (`a2-subtabs`) থাকে ল্যাপটপে ৯২টা পেজে, ফোনে ৯০টা পেজে। এটা বারের নিচে, তাই বারের Y বদলায় না, কিন্তু পেজের শুরু বদলে যায়। ফিক্সের সময় এটাও বারের সাথে একই জায়গায় আনা ভালো।

**কারণ ৪: কোডের গঠন, আসল শিকড়**
- ট্যাব বার আঁকার কাজ প্রতিটা পেজের নিজের হাতে: `<SectionTabs>` বা `<SystemTabs>` প্রায় ২৪৫টা জায়গায় আলাদা আলাদা ডাকা হয় (`ShellParts.tsx:59`)। শেল (`AdminShell.tsx:542`) শুধু `<main>{children}</main>` দেয়, বারের জায়গা নিয়ে কিছু জানে না। তাই কোনো কেন্দ্রীয় নিয়ম নেই।
- ক্লিক করে যাওয়ার সময় `loading.tsx` নেই। নতুন পেজ তৈরি হলে পুরনোটা বদলে বসে যায়। তাই লাফটা মাঝপথের ঝলক না, নতুন পেজের আসল জায়গা।

**প্রোটোটাইপের সাথে তুলনা (docs/demo/admin-proto-v5)**
- প্রোটোটাইপে ক্রম: শিরোনাম + সাবটাইটেল (`.phead`), তারপর বার (`.tabs`) (`js/core.js:754-755`, `css/app.css:110-118`)। বারের জায়গা স্থির করার কোনো ব্যবস্থা নেই।
- মেপে দেখেছি: ল্যাপটপে ৬৪টার মধ্যে ১৯টায় বার আলাদা (সর্বোচ্চ ৪৯px, যেমন Finance → P&L), ফোনে ৩৬টায় (সর্বোচ্চ ১১৪px, Rules → Coupons)। সাধারণ ফারাক ২০px, অর্থাৎ একটা সাবটাইটেল লাইন আছে কি নেই।
- অর্থাৎ প্রোটোটাইপ "বার স্থির" দেখায় না। তবু আসল অ্যাপে ফারাক অনেক বড় (১০৭px বনাম ৪৯px), কারণ সাবটাইটেল বেশি লম্বা, পুরনো হেডার আছে।

## ৫. প্রস্তাবিত ছোট ফিক্স

**মূল কথা:** বারকে পেজের কনটেন্ট থেকে আলাদা করে শেলের একটা স্থির জায়গায় আনা।

১. `AdminShell.tsx`-এ `<main>`-এর ভেতরে `{children}`-এর **আগে** একটা `ShellTabBar` আঁকা। শেল ক্লায়েন্ট কম্পোনেন্ট, আর `locate(pathname)` দিয়ে ইতিমধ্যেই জানে কোন সেকশন আর কোন ট্যাব খোলা (`AdminShell.tsx:261`)। ট্যাব তালিকা আর "More" মেনুর (`TabsRow`, `MoreTabs`) কম্পোনেন্ট আগেই আছে। ট্যাবের নিচের চিপ সারিও এই ব্লকেই আসবে।
২. `SectionTabs` (আর `SystemTabs`) এখনকার জায়গায় `null` ফেরত দেবে। তাহলে ২৪৫টা ডাকার জায়গা এক ধাক্কায় অকেজো হয়, কোনো পেজ ফাইল ছুঁতে হয় না। পরে ধীরে ধীরে ডাক মুছে ফেলা যাবে।
৩. বার শিরোনামের **উপরে** থাকবে (ক্রম: বার, তারপর ক্রাম্ব/শিরোনাম/সাবটাইটেল, তারপর কনটেন্ট)। বারের Y সব পেজে সমান: ল্যাপটপে `<main>`-এর উপর থেকে ০px আর ফোনে ০px (টপবারের ঠিক নিচে)।
৪. চাইলে `position: sticky` দিয়ে বারটা স্ক্রলেও উপরে আটকে রাখা যায়, কিন্তু এটা অতিরিক্ত। শুধু আপনি বললে।
৫. পুরনো PageCrumb সারি আর বারের দ্বিগুণ তথ্য (সেকশন › ট্যাব) কমানো যায়, কিন্তু সেটা আলাদা কাজ। ফিক্সের জন্য দরকার নেই।
৬. বিকল্প (বড় কাজ, আমি সুপারিশ করি না): শিরোনাম আগে রেখে হেডারের উচ্চতা স্থির করা, যেমন সাবটাইটেল ১ লাইনে কেটে দেওয়া। ২১৮টা PageHead পেজের লেখা আর ফোনের বোতাম সারির উচ্চতা নিয়ে ঝামেলা হয়, আর বাংলা লেখায় লাইন গোনা নির্ভরযোগ্য না।

**যাচাইয়ের উপায় (ফিক্সের পরে):** এই মাপার স্ক্রিপ্ট আবার চালিয়ে দেখা হবে প্রতিটা সেকশনে ১ম পেজের চেয়ে ফারাক ০px কি না, দুই আকারেই। একটা স্থায়ী টেস্ট হিসেবে `tools/nav-audit.mjs`-এ "বারের Y সমান" চেক যোগ করা যায় (মালিক কোনো ভুল পেজ নিজে ধরার আগে CI-ই ধরবে)।

**যা পরীক্ষা করা হয়নি:** ফিক্সটা আমি লিখিনি বা চালাইনি, তাই "বার স্থির হবে" কথাটা কোডের পড়া আর মাপের উপর দাঁড়ানো, চালিয়ে দেখা না। ফোনে বার সরলেও শিরোনাম নিচে নামবে, সেটা ঠিক আছে কি না মালিকের চোখে দেখার বিষয়।

## ৬. পেজ ধরে সব ফারাক

ফারাক = সেকশনের প্রথম পেজের বার Y-এর সাথে ফারাক (px)। যে পেজ মাপা যায়নি সেখানে "-"। শুধু সেই পেজগুলো, যেখানে ল্যাপটপে বা ফোনে ফারাক আছে। মোট 130টা পেজ।

| সেকশন | পেজ | হেডার ধরন | ডেস্কটপ Y | ডেস্কটপ ফারাক | ফোন Y | ফোন ফারাক |
|---|---|---|---|---|---|---|
| Orders | `/admin/orders` | নতুন (PageHead) | 77 | 0 | 292 | +139 |
| Orders | `/admin/orders/confirm` | নতুন (PageHead) | 77 | 0 | 132 | -21 |
| Orders | `/admin/orders/confirm/calls` | নতুন (PageHead) | 77 | 0 | 132 | -21 |
| Orders | `/admin/orders/packing` | নতুন (PageHead) | 98 | +21 | 228 | +75 |
| Orders | `/admin/orders/packing/print` | নতুন (PageHead) | 98 | +21 | 249 | +96 |
| Orders | `/admin/orders/packing/picking` | নতুন (PageHead) | 98 | +21 | 195 | +42 |
| Orders | `/admin/orders/packing/invoices` | নতুন (PageHead) | 119 | +42 | 249 | +96 |
| Orders | `/admin/orders/packing/handover` | নতুন (PageHead) | 98 | +21 | 174 | +21 |
| Orders | `/admin/orders/returns` | নতুন (PageHead) | 119 | +42 | 249 | +96 |
| Orders | `/admin/orders/returns/qc` | নতুন (PageHead) | 103 | +26 | 223 | +70 |
| Orders | `/admin/orders/returns/refused` | নতুন (PageHead) | 103 | +26 | 202 | +49 |
| Orders | `/admin/orders/returns/handback` | নতুন (PageHead) | 124 | +47 | 265 | +112 |
| Orders | `/admin/orders/returns/erp` | নতুন (PageHead) | 124 | +47 | 244 | +91 |
| Orders | `/admin/orders/incomplete` | নতুন (PageHead) | 98 | +21 | 195 | +42 |
| Orders | `/admin/orders/risk-rules` | নতুন (PageHead) | 98 | +21 | 174 | +21 |
| Orders | `/admin/orders/risk-rules/checkout` | নতুন (PageHead) | 77 | 0 | 174 | +21 |
| Products | `/admin/products/new` | পুরনো (crumb + নিজস্ব হেডার) | 238 | +54 | 315 | -184 |
| Products | `/admin/stock` | পুরনো (crumb + নিজস্ব হেডার) | 184 | 0 | 209 | -290 |
| Products | `/admin/stock/counts` | পুরনো (crumb + নিজস্ব হেডার) | 184 | 0 | 233 | -266 |
| Products | `/admin/stock/movements` | পুরনো (crumb + নিজস্ব হেডার) | 184 | 0 | 209 | -290 |
| Products | `/admin/products/back-in-stock` | পুরনো (crumb + নিজস্ব হেডার) | 184 | 0 | 209 | -290 |
| Products | `/admin/products/ranking` | নতুন (PageHead) | 98 | -86 | 174 | -325 |
| Products | `/admin/combos` | পুরনো (crumb + নিজস্ব হেডার) | 199 | +15 | 245 | -254 |
| Products | `/admin/combos/bag-box` | নতুন (PageHead) | 91 | -93 | 167 | -332 |
| Products | `/admin/products/sets` | নতুন (PageHead) | 98 | -86 | 195 | -304 |
| Products | `/admin/products/reviews` | নতুন (PageHead) | 98 | -86 | 195 | -304 |
| Products | `/admin/products/questions` | নতুন (PageHead) | 77 | -107 | 153 | -346 |
| Products | `/admin/products/faqs` | নতুন (PageHead) | 77 | -107 | 174 | -325 |
| Products | `/admin/size-charts` | পুরনো (crumb + নিজস্ব হেডার) | 130 | -54 | 154 | -345 |
| Products | `/admin/products/queue` | পুরনো (crumb + নিজস্ব হেডার) | 184 | 0 | 319 | -180 |
| Products | `/admin/products/import` | পুরনো (crumb + নিজস্ব হেডার) | 184 | 0 | 285 | -214 |
| Products | `/admin/products/erp-import` | পুরনো (crumb + নিজস্ব হেডার) | 184 | 0 | 285 | -214 |
| Products | `/admin/products/audit` | পুরনো (crumb + নিজস্ব হেডার) | 160 | -24 | 301 | -198 |
| Customers | `/admin/customers/segments` | নতুন (PageHead) | 77 | 0 | 174 | +21 |
| Customers | `/admin/customers/loyalty` | নতুন (PageHead) | 77 | 0 | 174 | +21 |
| Customers | `/admin/customers/review` | নতুন (PageHead) | 98 | +21 | 174 | +21 |
| Customers | `/admin/customers/import` | নতুন (PageHead) | 77 | 0 | 174 | +21 |
| Delivery | `/admin/delivery/courier-360` | নতুন (PageHead) | 103 | +26 | 181 | +28 |
| Delivery | `/admin/delivery/zones` | নতুন (PageHead) | 98 | +21 | 195 | +42 |
| Delivery | `/admin/delivery/settings` | নতুন (PageHead) | 77 | 0 | 132 | -21 |
| Support | `/admin/support/replies` | নতুন (PageHead) | - | - | 153 | -21 |
| Support | `/admin/support/analytics` | নতুন (PageHead) | - | - | 153 | -21 |
| Support | `/admin/support/settings` | নতুন (PageHead) | - | - | 153 | -21 |
| Support | `/admin/support/app` | নতুন (PageHead) | - | - | 153 | -21 |
| Support | `/admin/support/comments` | নতুন (PageHead) | - | - | 153 | -21 |
| Support | `/admin/support/comments/live` | নতুন (PageHead) | - | - | 153 | -21 |
| Rules | `/admin/rules/smart` | পুরনো (crumb + নিজস্ব হেডার) | - | - | 212 | +44 |
| Rules | `/admin/rules/eid` | নতুন (PageHead) | - | - | 195 | +27 |
| Rules | `/admin/rules/offers` | পুরনো (crumb + নিজস্ব হেডার) | - | - | 321 | +153 |
| Rules | `/admin/rules/notices` | পুরনো (crumb + নিজস্ব হেডার) | - | - | 265 | +97 |
| Marketing | `/admin/marketing/campaigns` | নতুন (PageHead) | 98 | +21 | 174 | -85 |
| Marketing | `/admin/marketing/message-campaigns` | নতুন (PageHead) | 98 | +21 | 174 | -85 |
| Marketing | `/admin/messages/campaigns` | নতুন (PageHead) | 119 | +42 | 216 | -43 |
| Marketing | `/admin/messages/journey` | নতুন (PageHead) | 119 | +42 | 153 | -106 |
| Marketing | `/admin/messages/automations` | নতুন (PageHead) | 98 | +21 | 195 | -64 |
| Marketing | `/admin/messages/email` | নতুন (PageHead) | 77 | 0 | 153 | -106 |
| Marketing | `/admin/messages/templates` | নতুন (PageHead) | 77 | 0 | 174 | -85 |
| Marketing | `/admin/messages/log` | নতুন (PageHead) | 77 | 0 | 174 | -85 |
| Marketing | `/admin/messages/channels` | নতুন (PageHead) | 77 | 0 | 174 | -85 |
| Marketing | `/admin/messages/consent` | নতুন (PageHead) | 98 | +21 | 174 | -85 |
| Marketing | `/admin/messages/cost-ceilings` | নতুন (PageHead) | 98 | +21 | 174 | -85 |
| Marketing | `/admin/marketing/audiences` | নতুন (PageHead) | 98 | +21 | 228 | -31 |
| Marketing | `/admin/marketing/calendar` | নতুন (PageHead) | 98 | +21 | 195 | -64 |
| Marketing | `/admin/marketing/plan` | নতুন (PageHead) | 77 | 0 | 132 | -127 |
| Marketing | `/admin/marketing/ad-platforms` | নতুন (PageHead) | 98 | +21 | 195 | -64 |
| Marketing | `/admin/marketing/affiliates` | নতুন (PageHead) | 77 | 0 | 174 | -85 |
| Marketing | `/admin/marketing/landing` | নতুন (PageHead) | 98 | +21 | 207 | -52 |
| Marketing | `/admin/marketing/landing/seasonal` | নতুন (PageHead) | 98 | +21 | 207 | -52 |
| Marketing | `/admin/marketing/landing/seasonal/yearly` | নতুন (PageHead) | 142 | +65 | 239 | -20 |
| Marketing | `/admin/marketing/referrals` | নতুন (PageHead) | 98 | +21 | 174 | -85 |
| Marketing | `/admin/marketing/merchant-feed` | নতুন (PageHead) | 93 | +16 | 190 | -69 |
| Marketing | `/admin/marketing/meta-feed` | নতুন (PageHead) | 77 | 0 | 153 | -106 |
| Marketing | `/admin/marketing/tracking` | নতুন (PageHead) | 98 | +21 | 195 | -64 |
| Marketing | `/admin/marketing/studio` | নতুন (PageHead) | 77 | 0 | 174 | -85 |
| Marketing | `/admin/marketing/studio/motion` | নতুন (PageHead) | 98 | +21 | - | - |
| Marketing | `/admin/marketing/studio/videos` | নতুন (PageHead) | 98 | +21 | 174 | -85 |
| Marketing | `/admin/marketing/studio/reels` | নতুন (PageHead) | 119 | +42 | 216 | -43 |
| Marketing | `/admin/marketing/studio/export` | নতুন (PageHead) | 119 | +42 | 237 | -22 |
| Marketing | `/admin/marketing/studio/briefs` | নতুন (PageHead) | 98 | +21 | 216 | -43 |
| Marketing | `/admin/marketing/studio/overlay` | নতুন (PageHead) | 119 | +42 | 258 | -1 |
| Marketing | `/admin/marketing/youtube` | নতুন (PageHead) | 77 | 0 | 174 | -85 |
| Marketing | `/admin/marketing/outreach` | নতুন (PageHead) | 77 | 0 | 174 | -85 |
| Marketing | `/admin/marketing/seasonal` | নতুন (PageHead) | 98 | +21 | 195 | -64 |
| Marketing | `/admin/marketing/festive` | নতুন (PageHead) | 98 | +21 | 195 | -64 |
| Marketing | `/admin/marketing/report` | নতুন (PageHead) | 77 | 0 | 132 | -127 |
| Marketing | `/admin/marketing/geo-guide` | নতুন (PageHead) | 114 | +37 | 190 | -69 |
| Marketing | `/admin/marketing/intel` | নতুন (PageHead) | 114 | +37 | 211 | -48 |
| Website | `/admin/website/words` | নতুন (PageHead) | 77 | -14 | 153 | -14 |
| Website | `/admin/website/policies` | নতুন (PageHead) | 98 | +7 | 228 | +61 |
| Website | `/admin/website/blog` | নতুন (PageHead) | 137 | +46 | 259 | +92 |
| Website | `/admin/website/blog/shelves` | নতুন (PageHead) | 126 | +35 | 202 | +35 |
| Website | `/admin/website/blog/plan` | নতুন (PageHead) | 147 | +56 | 223 | +56 |
| Website | `/admin/website/blog/calendar` | নতুন (PageHead) | 126 | +35 | 223 | +56 |
| Website | `/admin/website/blog/performance` | নতুন (PageHead) | 126 | +35 | 181 | +14 |
| Website | `/admin/website/blog/comments` | নতুন (PageHead) | 142 | +51 | 218 | +51 |
| Website | `/admin/website/blog/shared` | নতুন (PageHead) | 163 | +72 | 239 | +72 |
| Website | `/admin/website/blog/sold` | নতুন (PageHead) | 142 | +51 | 218 | +51 |
| Website | `/admin/website/blog/ads` | নতুন (PageHead) | 142 | +51 | 218 | +51 |
| Website | `/admin/website/blog/pipeline` | নতুন (PageHead) | 142 | +51 | 218 | +51 |
| Website | `/admin/website/blog/source` | নতুন (PageHead) | 147 | +56 | 244 | +77 |
| Website | `/admin/website/analytics` | নতুন (PageHead) | 77 | -14 | 153 | -14 |
| Website | `/admin/website/analytics/behaviour` | নতুন (PageHead) | 77 | -14 | 153 | -14 |
| Website | `/admin/website/seo` | নতুন (PageHead) | 77 | -14 | 174 | +7 |
| Website | `/admin/website/seo/redirects` | নতুন (PageHead) | 77 | -14 | 174 | +7 |
| Website | `/admin/website/seo/categories` | নতুন (PageHead) | 77 | -14 | 174 | +7 |
| Website | `/admin/website/seo/bengali` | নতুন (PageHead) | 98 | +7 | 195 | +28 |
| Website | `/admin/website/seo/health` | নতুন (PageHead) | 77 | -14 | 174 | +7 |
| Website | `/admin/website/seo/organic` | নতুন (PageHead) | 98 | +7 | 174 | +7 |
| Website | `/admin/website/brand-menus` | নতুন (PageHead) | 77 | -14 | 174 | +7 |
| Website | `/admin/website/eye-toggles` | নতুন (PageHead) | 77 | -14 | 153 | -14 |
| Money | `/admin/money/cash` | নতুন (PageHead) | 77 | -21 | 174 | -21 |
| Money | `/admin/money/profit` | নতুন (PageHead) | 77 | -21 | 174 | -21 |
| Money | `/admin/money/profit/groups` | নতুন (PageHead) | 98 | 0 | 174 | -21 |
| Money | `/admin/money/costs` | নতুন (PageHead) | 77 | -21 | 153 | -42 |
| Money | `/admin/money/cost-ledger/report` | নতুন (PageHead) | 98 | 0 | 174 | -21 |
| Money | `/admin/money/budgets` | নতুন (PageHead) | 77 | -21 | 174 | -21 |
| Money | `/admin/money/books` | নতুন (PageHead) | 98 | 0 | 174 | -21 |
| Money | `/admin/money/books/match` | নতুন (PageHead) | 77 | -21 | 174 | -21 |
| Money | `/admin/money/books/differences` | নতুন (PageHead) | 77 | -21 | 174 | -21 |
| Money | `/admin/money/books/closes` | নতুন (PageHead) | 77 | -21 | 153 | -42 |
| Money | `/admin/money/books/daily` | নতুন (PageHead) | 77 | -21 | 153 | -42 |
| Money | `/admin/money/couriers` | নতুন (PageHead) | 103 | +5 | 181 | -14 |
| Money | `/admin/money/vat` | নতুন (PageHead) | - | - | 174 | -21 |
| Settings | `/admin/settings/activity` | নতুন (PageHead) | 77 | -21 | - | - |
| Settings | `/admin/settings/start-fresh` | নতুন (PageHead) | 77 | -21 | - | - |
| Settings | `/admin/settings/shimmer` | নতুন (PageHead) | 91 | -7 | - | - |
| Settings | `/admin/settings/shell` | নতুন (PageHead) | 91 | -7 | - | - |
| Help | `/admin/help/manual` | নতুন (PageHead) | 98 | +21 | - | - |
| Help | `/admin/build` | নতুন (PageHead) | 119 | +42 | - | - |
| Help | `/admin/build/requests` | নতুন (PageHead) | 112 | +35 | - | - |

