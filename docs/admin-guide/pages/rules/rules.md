# নিয়ম (সব নিয়ম এক পাতায়)

## এটা কী
দোকানের প্রতিটা নিয়ম এক লাইনের বাক্যে, এক পাতায়: ফ্রি ডেলিভারি, ক্যাশ অন ডেলিভারির সীমা, অগ্রিম, ডুপ্লিকেট অর্ডার, অর্ডার মার্জ,
দাম কমানোর সীমা, কুরিয়ার, এক্সচেঞ্জ, ব্যস্ত সময় আর ঈদ মোড, অফার আর পপ-আপ। প্রতিটা সারিতে নিয়মের অবস্থা (চালু, বন্ধ বা
নমুনা) দেখায়। **Edit** চাপলে ডান পাশে (ফোনে নিচে) সম্পাদনার ঘর খোলে, পাতা ছেড়ে যেতে হয় না। লম্বা নিয়ম লেখার পাতা
আলাদা: **Smart Rules**।

> [!NOTE]
> প্রোটোটাইপের সাথে মিলিয়ে ফর্মের কিছু ঘরের নাম বদলেছে: "Replace defective or wrong items for free", "Customer tells us within (hours)", "Old piece must come back within (days)", "ERP check within (days)", "Remind the customer after (hours)" আর "Merge by itself when phone and address are the same"। কাজ আগের মতোই, শুধু শব্দ বদলেছে।

## কেন দরকার
আগে একই কাজের নিয়ম দশটা পাতায় ছড়ানো ছিল, তাই কোনটা চালু আর কোনটা শুরুর সংখ্যায় পড়ে আছে বোঝা যেত না। এখন এক
নজরে দেখা যায়, আর বদলালে নতুন অর্ডার থেকেই দোকান সেটা মানে।

> [!NOTE]
> ধরুন একই কাস্টমার তিন দিনের মধ্যে আবার একই জিনিস অর্ডার করে ফেলেন। **Order flow** গ্রুপে **Duplicate orders** সারির **Edit**
> চাপুন। **Look back (days)** এখন 5, সেটা দেখে নিন। **Put a clear duplicate on hold by itself** চালু করে **Save** চাপুন: পরের
> ডুপ্লিকেট নিজে থেকে হোল্ডে যাবে আর আপনি দেখে ছাড়বেন।

## কীভাবে করবেন
1. মেনুতে **Rules** → **All rules** খুলুন।
2. বাঁ পাশের গ্রুপ থেকে ভাগ বাছুন (ডেলিভারি, পেমেন্ট ও COD, অর্ডার ফ্লো …), অথবা উপরের খোঁজার ঘরে লিখুন।
3. যে সারি বদলাবেন তার **Edit** চাপুন।
4. ঘরগুলোতে নতুন মান দিন। নিচে **What changes** দেখায় আগে কী ছিল আর এখন কী হবে।
5. টাকা বা দামের নিয়ম হলে **Owner PIN (4 digits)** দিয়ে **Save · PIN** চাপুন; অন্যগুলোয় **Save**। বোতামের সারিতে বাঁয়ে **Cancel**, ডানে **Save**।
6. শুরুর মানে ফিরতে **Back to default**।

## প্রতিটা বোতাম আর ঘরের মানে
- **All rules** আর **Delivery · Payment & COD · Checkout & payments · Order flow · Courier · Courier messages · Exchange · Customers · Discounts · Messages** — নিয়মের ভাগ। বাঁ পাশে।
- **Search rules — e.g. COD, exchange, free delivery** — খোঁজার ঘর।
- **Edit** — প্রোটোটাইপের মতো প্রায় সব সারিতে **Edit**: এখানে ঠিক হওয়া নিয়মের সম্পাদনার ঘর ডানে খোলে, আর যে নিয়ম নিজের পাতায় থাকে (ডেলিভারি চার্জ, অগ্রিম, কুরিয়ার, Smart Rules) সেই পাতা খোলে। **Open** — শুধু যেগুলো একটা আলাদা পাতা: **Offers & discounts**, **Message log** আর **Pop-ups & notices**।
- নতুন সারি (প্রোটোটাইপের নিয়ম): **Delivery charges** (জোন ধরে চার্জ, চাপলে ডেলিভারি জোনের পাতা), **bKash & Nagad numbers** (চেকআউট সেটিংসের পাতা), **Exchange** — **Exchange allowed for (hours after delivery)**, ডেলিভারির পর কত ঘণ্টা এক্সচেঞ্জ করা যাবে; **Order changes by the customer** — **Times a customer may change an order before packing**; **Buy more, save** (ব্যাগের Take 2 / Take 3 বক্স), **Order messages** (প্রতি অর্ডারের মেসেজের ধাপ) আর **Message log**।
- Smart Rules-এর সারির লাইনে নিয়মের নিজের সংখ্যা বসানো থাকে (যেমন "Exchange within 72 hours"); কোনো সংখ্যা এখনো ঠিক না থাকলে সেখানে **not set** লেখা থাকে, কখনো বন্ধনীর চিহ্ন নয়।
- **On · Off · Sample** — অবস্থা। **Sample** মানে নিয়ম চালু আছে কিন্তু দোকানের শুরুর সংখ্যায়; দেখে নিয়ে সেভ করলে সেটা আপনার হয়।
- **Show all** — নমুনা ছাড়া সব সারি ফিরিয়ে আনে।
- **Free delivery from (amount)** — কত টাকা থেকে ডেলিভারি ফ্রি। টাকার নিয়ম, তাই মালিকের OK আর PIN।
- **Switch Peak and Eid mode on** — ব্যস্ত সময় আর ঈদ মোড। **Orders a day the shop can send** — দিনে কয়টা অর্ডার পাঠানো যাবে; দিন ভরে গেলে
  **Words when the day is full (English)** আর **Words when the day is full (Bengali)** দেখায়। **Stickers in one part of Print all in parts** —
  প্রিন্টে এক ভাগে কয়টা স্টিকার। **Roster for the busy days** — **Name**, **Task**, **First day**, **Last day**, **Add a person**, **Remove**।
- **Let rules confirm orders** — নিয়ম নিজে অর্ডার কনফার্ম করে। **Delivered parcels that make a customer trusted** আর
  **Most refusals a trusted customer may have** — কাকে বিশ্বস্ত ধরা হবে।
- **Look for duplicate orders** — **Look back (days)** (শুরুতে 5) আর **Put a clear duplicate on hold by itself**।
- **Allow merging orders** — **Look back (days)**, **Merge by itself when the addresses match**, **When the addresses differ** (**ask a person** বা **do not merge**)।
- **Allow price adjust on open orders** — **Limits by role**: ভূমিকা টিক দিলে তার নিজের সীমা, কত টাকা আর কত শতাংশ; খালি ঘর মানে ওই দিকে সীমা নেই;
  টিক না দেওয়া ভূমিকা প্রতিবার মালিককে জিজ্ঞেস করে। টাকার নিয়ম, তাই মালিকের OK আর PIN।
- **Hours before the advance reminder** — অগ্রিমের রিমাইন্ডার কত ঘণ্টা পর (0 = নেই)। **Days to check a returned piece** — ফেরত পিস ERP-তে চেকের দিন।
- **Allow replacement** — **Hours after delivery it can be opened** আর **Days for the old piece to come back**।
- **Gift mode** (PR 833) — চেকআউটের গিফট পছন্দ। **Show “This is a gift” at checkout** — চালু বা বন্ধ। **Let the buyer write a short gift note (most letters, 0 = no note)** — গিফট নোটের সর্বোচ্চ অক্ষর। **Deliver later, up to (days)** — গিফট কত দিন পরে পাঠানো যাবে। **Hide prices on the invoice inside the parcel** — পার্সেলের ইনভয়েসে দাম লুকানো। গিফটের অগ্রিম নিয়ম আগের মতোই চেকআউট সেটিংসে।
- **Quiet hours & limits** (PR 833) — **Hold messages in quiet hours**, **Quiet from (hour, 0–23)** আর **Quiet until (hour, 0–23)**। এই সময়ের মেসেজ সকাল পর্যন্ত অপেক্ষা করে; পেমেন্ট লিংক আর OTP সঙ্গে সঙ্গে যায়।
- নিয়মের সারির নাম এখন প্রোটোটাইপের মতো: **Eid last order dates**, **Peak / Eid mode**, **Cash on delivery**, **Reward for paying online**, **Price-adjust limits by role**, **Advance request reminder**, **Courier & batch**, **Defective or wrong item**, **Customer priority**।
- **Stock hold at checkout** — (Order flow-এ) কাস্টমার চেকআউটে থাকলে একটা পিস কত মিনিট ধরা থাকবে আর অর্ডার আসার পর কনফার্ম পর্যন্ত কত ঘণ্টা। ঘর খালি থাকলে সিস্টেমের নিজের সংখ্যা চলে। ফর্মে **Hold while the customer is in checkout (minutes)** আর **Hold after the order is placed (hours)**।
- **WhatsApp templates** আর **SMS senders** — (Pop-ups & notices-এর পাশে) মেসেজ পাতায় ঠিক হওয়া নিয়ম; সারিতে চাপলে সেই পাতা খোলে। কোনো মেসেজ ক্রেতার কাছে নিজে থেকে যায় না।
- **Score accuracy** — কুরিয়ার স্কোর চালু থাকলে স্কোর সারির নিচে একটা কার্ড, **Last 30 days**: স্কোর পাওয়া অর্ডার ভাগ অনুযায়ী (**Band**, **Orders**, **Delivered**, **Refused**, **Cancelled**, **Refusal rate** — PR 1130, আগে Came back; ফেরত আসা অর্ডারের ভাগ)। সবুজ অর্ডার বেশি ফেরত এলে সীমা বাড়ানোর কথা বলে; না এলে **Limits look right.**
- **Phone number refused parcels before** — চেকআউট সিমুলেটরের টিক। ক্যাশ অন ডেলিভারিতে টিক দিলে সিমুলেটর বলে অগ্রিম মোড চালু আছে কি না; চালু থাকলে স্তরে ধরা পড়া নম্বরকে আগে অগ্রিম চাওয়া হয়। এখানে কিছু সেভ বা বদলায় না।
- **Customer sees** — প্রতিটা নিয়মের ফর্মে, আপনি এখন যে সংখ্যা লিখছেন তা দিয়ে কাস্টমার ঠিক কী দেখবেন তার কথা; সেভের আগেই বদলায়। পর্দার পেছনের নিয়মে লেখা থাকে কাস্টমার কিছু দেখেন না।
- **Try the numbers above** — (আরও অপশনে, ফ্রি ডেলিভারি, ডুপ্লিকেট আর মার্জ নিয়মে) গত 30 দিনের অর্ডারে ওপরের সংখ্যা চালিয়ে দেখায় কয়টা ধরা পড়ত। শুধু দেখা, কিছু সেভ বা বদল হয় না।
- **What changes** — সেভের আগে বদলের তালিকা। **Back to default** — শুরুর মানে ফেরা। **Owner PIN (4 digits)** আর **Save · PIN** — টাকার নিয়মে।
- **Save** আর **Cancel** — সেভ বা বাতিল। **Close** — ঘর বন্ধ।
- **Start on a later date** (PR 858) — আরও অপশনে একটা তারিখ বেছে **Schedule** চাপলে (টাকার নিয়মে **Schedule · PIN**) বদলটা আজ হয় না, ওই দিন নিয়মের ঘড়ি নিজেই বসিয়ে দেয়। আজকের পরের দিন লাগবে, সর্বোচ্চ 400 দিন সামনে। তারিখ খালি রাখলে সেভ আগের মতো এখনই বদলায়। শিডিউল থাকলে নিয়মের ঘরে "নির্ধারিত" লেখা আসে আর **Cancel schedule** দিয়ে মুছে ফেলা যায় (নিয়ম আগের মতোই থাকে)। টাকার নিয়মে শিডিউল আর বাতিল দুটোতেই মালিকের OK আর PIN লাগে; ওই দিন বসানোর সময় নতুন করে PIN লাগে না, কারণ শিডিউলের সময়ই OK দেওয়া হয়েছে। একটা নিয়মের একটাই শিডিউল থাকে; নতুন দিলে আগেরটা বদলে যায়। দিন এলে সেটা বসতে না পারলে (মাঝে নিয়ম বদলে গেলে) জোর করে বসে না, বাদ পড়ে আর লগে লেখা থাকে।
- **Checkout simulator** (PR 858) — কোনো নিয়ম না বাছলে ডান পাশে (ফোনে নিচে) দেখা যায়। **Delivery area**, **Cart value**, **Pieces**, **Category**, **Payment**, **Coupon** (দোকানের নিজের কুপন কোডের তালিকা, **No coupon** মানে কুপন ছাড়া; বন্ধ কুপনের পাশে "(off)") আর **New customer (first order)** বেছে বা লিখে দেখুন আপনার এখন চালু সব নিয়ম মিলিয়ে কাস্টমার ঠিক কত দেবেন: প্রোডাক্টের দাম, নিয়মের ছাড়, ডেলিভারি (ফ্রি হলে ফ্রি), **Customer pays**, ক্যাশ অন ডেলিভারি চলবে কিনা (সবুজ বা লাল বাক্স: "Cash on delivery allowed. No advance needed.", "Cash on delivery not offered", "Paid online"), ফ্রি ডেলিভারিতে আর কত লাগবে ("Add … more for free delivery"), ঈদের শেষ অর্ডারের দিন, কুপন ধরা হলো কিনা। ডেলিভারি ফ্রি হলে **Free** লেখার পাশে আসল চার্জ কাটা অবস্থায় দেখায়। নম্বরের আগের ফেরত রেকর্ড আর অগ্রিমের হিসাব এই সিমুলেটরে নেই। দোকানের চেকআউট যে হিসাবের ইঞ্জিন চালায় এটাও সেটাই। কিছু সেভ হয় না, কাউকে কিছু যায় না, কুপনের ব্যবহারও গোনা হয় না।
- **ওপরের ট্যাব বার** — সেকশনের সব ট্যাব, সব পাতায় একই জায়গায় (শিরোনামের ওপরে); এক ট্যাব থেকে আরেকটায় গেলে বার লাফায় না। শিরোনামের ডানে **গাইড** বোতাম (বইয়ের ছবি) এই পাতার গাইড খোলে।
- **Edit the customer text** (PR 867) — আরও অপশনে দুটো ঘর: **Bengali text** আর **English text**। শুরুতে অটো লেখাটা বসানো থাকে (ওপরের সংখ্যা থেকে বানানো)। নিজের মতো লিখে **Use my text** চাপলে সেটা এই নিয়মের জন্য সেভ হয়, আর **Customer sees** তখন আপনার লেখা দেখায় সঙ্গে একটা সতর্কতা: ওপরের সংখ্যা বদলালে এই লেখা বদলাবে না। দুই ভাষাতেই লিখতে হয়। **Back to automatic text** চাপলে আপনার লেখা সরে যায়, অটো লেখা ফেরে। এটা শুধু লেখা, তাই PIN লাগে না; অডিট লগে ওঠে। যেসব দোকান-পাতা এই নিয়মের বাক্য নিজে ছাপে, সেগুলো এখনও নিয়মের নিজের লেখাই ব্যবহার করে।
- **History** (PR 867) — আরও অপশন খুললে এই নিয়মের শেষ ছয়টা বদল দেখায়: কোন মান থেকে বদলানো হয়েছিল, "until" কবে পর্যন্ত চলেছিল, কে বদলেছিলেন। **Undo to this** চাপলে জিজ্ঞেস করে, তারপর নিয়মটা ওই আগের মানে ফিরে যায়। এটা একটা নতুন বদল হিসেবে সেভ হয়; ইতিহাসের কোনো ধাপ মোছে না। টাকার নিয়মে মালিকের OK আর PIN লাগে। কোনো বদল না থাকলে "No changes yet." লেখা আসে।
- **PIN-এর লাইন** — টাকার নিয়মে **Owner PIN (4 digits)** ঘর আর তার নিচে "Money and price changes always ask for the owner PIN." লেখা থাকে। আগের "Needs owner PIN to save" আর "Saves at once" লাইন প্রোটোটাইপে নেই, তাই সরানো হয়েছে।
- **ওপরের পিল** (PR 940) — খোঁজার ঘরের নিচে ছোট পিল: **N rules still use sample values** (চাপলে শুধু নমুনা সারি দেখায়, **Show all** দিয়ে ফেরা), **N change starts on (date)** (নির্ধারিত বদল থাকলে, চাপলে সেই নিয়ম খোলে) আর **Last change: (rule) · (time)**। সব নিয়ম আপনার সংখ্যায় থাকলে **All rules use your own values**।
- **From (date)** — যে নিয়মের বদল ভবিষ্যতের তারিখে বসবে তার সারিতে পিল। **Hub** — যে নিয়ম নিজের পাতায় থাকে (পপ-আপ ও নোটিশ, কুরিয়ার মেসেজ)।
- **More options · start on a date, try on last month, history (N)** — আরও অপশনের লাইন; ভেতরে **Edit the customer text**, **Start on a later date**, **Try on last 30 days' orders**, **History**, আর সবার নিচে **Back to default**।

## সাধারণ ভুল
- **নমুনা সংখ্যা না দেখে ছেড়ে দেওয়া।** **Sample** সারিগুলো দোকানের নিজের শুরুর সংখ্যায় চলছে; আপনার ব্যবসার সংখ্যা বসিয়ে সেভ করুন।
- **টাকার নিয়মে PIN ভুলে যাওয়া।** PIN ছাড়া ফ্রি ডেলিভারি, দাম কমানো বা অফার সেভ হয় না; এটা ইচ্ছা করেই।
- **সব ঘর খালি রেখে ভাবা সীমা শূন্য।** খালি মানে "সীমা নেই" বা "বন্ধ", শূন্য নয়।
- **পুরনো অর্ডারেও বদলাবে ভাবা।** বদল শুধু নতুন অর্ডারে খাটে।

> [!TIP]
> কুরিয়ারকে পাঠানো লেখা (বুকিং, বাতিল, ক্লেইম) এই পাতায় নেই, **Courier messages** সারির **Open** দিয়ে কুরিয়ারের পাতায় যান।

## এরপর কী হয়
সেভের পর নতুন অর্ডার থেকেই নিয়ম খাটে; কে কখন কী বদলেছে নিয়মের ইতিহাসে লেখা থাকে। টাকার নিয়ম মালিকের OK আর PIN ছাড়া বদলায়
না। অফার, পপ-আপ আর স্মার্ট নিয়মের পাতা আলাদা, কিন্তু অবস্থা এখানেও দেখায়।
