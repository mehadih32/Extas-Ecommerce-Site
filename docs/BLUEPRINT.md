# EXTAS — E-commerce Platform Build Specification

**Version 2.1 · 19 October 2026, 23:33** · change note **CN-001** (the owner's server specification) on top of Version 2.0 · written by জ্ঞানী Gyani (A360-01, chief) for the code phase · **V2.1 final · 20 October 2026** (last update before code)

> **CN-002 · 20 Oct 2026 00:45 (owner screenshots).** The VM is created. **Region: Malaysia West (zone 1)** instead of Southeast Asia — kept (owner's choice at creation; about $0.67/hr; latency to Dhaka similar; Cloudflare in front). Everywhere this document says "Southeast Asia" for the new machine, read **Malaysia West**; the Azure Blob storage account must be created in **Malaysia West** so restores stay same-region and free. Everything else matches CN-001: E8ds_v6, Ubuntu Server 24.04 LTS Gen2, Trusted launch, NVMe controller, OS 128 GB + data 1 TB Premium SSD LRS, accelerated networking on, auto-shutdown off, boot diagnostics on, ports 22/80/443. NSG verified 20 Oct 00:48 (owner screenshot): Extas-Ecommerce-Site-nsg on the NIC allows 80, 443, 22 from any; all else denied. Day 1: SSH stays key-only + fail2ban; 80/443 may later be limited to Cloudflare ranges.

> **V2.1 final · 20 Oct 2026 (the last update before code).** All pre-code demo work is finished, and it is folded in here: the timing audit round TA-2 (530 checks, 0 fails; Appendix C4, D1.2), the owner's bag review 43.3–43.10 done by Batch B (D3.11, D10.4, PR 598), the admin language clean-up (D11), the phone price rule (D1.2, D3.4) and the CN-001 server admin pages in the demo (A2.9.18). Every item sits at its own place and is marked **V2.1 final · 20 Oct**; superseded text is struck through or tagged, nothing is deleted. **No new PRs: still 604 PRs · 28 stages.** English summary: "V2.1 final change log" under the change log; Bengali summary: "V2.1 চূড়ান্ত (২০ অক্টোবর)" below. **Code starts from this file.**


V2 replaces V1.0 (18 October 2026) as the specification the code phase builds from. V1 is kept unchanged
beside it as `EXTAS-ECOMMERCE-V1.md`. Every V1 section is carried into this file, in V1's order. Where a section
changed, a **V2 block** (a quoted paragraph starting "V2 · 19 Oct") sits directly under its heading, and any
V1 sentence that no longer holds is tagged in place **[Replaced on 19 Oct by …]**. Nothing from V1 is dropped
without a tag. Part E is rewritten for 600 PRs; V1's Part E is kept at its end as history.

**V2.1 (19 Oct 2026, 23:33).** This file is V2 with change note **CN-001** applied — the owner's server specification (`review/SERVER-SETUP-SPEC-OWNER.md`), approved point by point (ROUND15 Note 48). `EXTAS-ECOMMERCE-V2.md` is kept unchanged beside it as history. V2.1 changes sit in **V2.1 blocks** (quoted paragraphs starting "V2.1 · 19 Oct 23:33"), in-place tags **[Replaced 19 Oct 23:33 …]** with the old text struck through, and the new section **A2.9** (the full server specification). Nothing from V2 is dropped.

**Source of truth for scope:** `master/MASTER-REGISTER.md` (604 PRs, 28 stages; 600 at V2). Where this file and the
register disagree, the register wins and this file is wrong. Owner notes: `review/ROUND15.md` (Notes ~~1–48~~ **1–49**, V2.1 final · 20 Oct).
**Working reference:** the demo, `scratchpad/proto/src/` (built to `dist/r16.html`); demo files are cited by
name where they define behaviour.

## V2.1-এ কী বদলেছে

*১৯ অক্টোবর ২০২৬, রাত ১১:৩৩ · পরিবর্তনের নোট **CN-001** · আপনার সার্ভার স্পেসিফিকেশন (`review/SERVER-SETUP-SPEC-OWNER.md`) — আপনি সব পয়েন্টে সবুজ সংকেত দিয়েছেন, আর বলেছেন দুইটা সিদ্ধান্তে টক্কর লাগলে সেরাটা নিতে। পুরো সার্ভারের নিয়ম: A2.9।*

1. **সার্ভার ঠিক হয়ে গেছে:** Azure **E8ds_v6** (৮ CPU, ৬৪ জিবি RAM, ৪৪০ জিবি অস্থায়ী NVMe), রিজিয়ন **Southeast Asia** (সিঙ্গাপুর), **Ubuntu Server 24.04 LTS Gen2** (Pro না)।
2. **ডিস্ক:** OS-এর জন্য ১২৮ জিবি, আর ডেটার জন্য আলাদা **১ টিবি** Premium SSD। আগে ২ টিবি লেখা ছিল — ১ টিবি নেওয়া হলো, কারণ ডিস্ক পরে বাড়ানো যায়, কমানো যায় না।
3. **লগইন:** VM বানানোর সময় আপনি key বানিয়ে .pem ফাইল নিজের কাছে রাখবেন। কোডের প্রথম দিনে আমরা একটা public key দেব, আপনি সেটা VM-এ বসাবেন। কোনো গোপন key চ্যাটে আসবে না।
4. **NVMe প্রতিবার বন্ধ-চালুর পর খালি আসে।** তাই প্রতিবার চালুর সময় একটা ছোট ব্যবস্থা ওটাকে ঠিক করে, তারপর ডাটাবেস আর বাকি সব চালু হয় (নতুন **PR 601**)।
5. **কোন জিনিস কোথায়:** আসল ডেটা SSD ডিস্কে; সব ছবি আর মিডিয়া Azure Blob-এ (Cloudflare-এর পেছনে); NVMe-তে শুধু অস্থায়ী জিনিস।
6. **RAM আর CPU-র ভাগ** একটা কনফিগ ফাইলে (Meilisearch-এর ৪ জিবিও ধরা হয়েছে)। ছোট সার্ভারে নিলে সিস্টেম নিজেই হিসাব করে নেবে; Blob বা CDN ছাড়াও চলবে (নতুন **PR 604**)।
7. **ক্যাশ চার স্তরে।** দাম, স্টক, সেটিংস বা নতুন প্রোডাক্ট বদলালে সাথে সাথে মুছে যায়। স্টক দেখানো ১৫ সেকেন্ডের ক্যাশে, কিন্তু ব্যাগে দেওয়া আর চেকআউট সবসময় আসল স্টক দেখে — বেশি বিক্রি হবে না (নতুন **PR 602**)।
8. **ডাটাবেস:** দরকারি সব ইনডেক্স, ধীর কোয়েরির তালিকা, রিপোর্ট আলাদা জায়গায় (নতুন **PR 603**)। সাইট সার্চ থাকছে Meilisearch-এ।
9. **ছবি:** ৫টা মাপ, ৩টা ফরম্যাট (AVIF, WebP, JPEG), অনুপাত ৪:৫। ক্যাটাগরির ছবি ৪০ KB-এর নিচে, প্রোডাক্টের বড় ছবি ১৫০ KB-এর নিচে।
10. **ব্যাকআপ:** এখন **Azure Blob + Google Drive**, দুই জায়গায় (আগে শুধু Drive ছিল)। Google Drive বাধ্যতামূলক থাকছে। যেকোনো মিনিটে ফেরানো যায়। মাসে একবার নিজে থেকে ফেরানোর পরীক্ষা হয়, ফল অ্যাডমিন আর টেলিগ্রামে। Blob-এর খরচ VM-এর দামের বাইরে — মাসে মোটামুটি ৫–১৫ ডলার।
11. **গতির লক্ষ্য** (ঢাকা থেকে, ফোনে, 4G-তে): LCP ২.৫ সেকেন্ডের নিচে, CLS ০.১-এর নিচে, INP ২০০ মিলিসেকেন্ড, TTFB ৬০০ মিলিসেকেন্ড। মাসে একবার নিজে থেকে মাপা হবে।
12. **অ্যাডমিনে সার্ভার পাতা**, আর **টেলিগ্রামে সতর্কবার্তা** — ডিস্ক ৮০% ভরলে, কোনো সার্ভিস বন্ধ হলে, ব্যাকআপ ব্যর্থ হলে, সাইট ধীর হলে, NVMe না পেলে।
13. **Docker আর Caddy থাকছে** (PM2 বা Nginx না)। সাইট না থামিয়ে নতুন কোড বসে।
14. **সব সার্ভারের কাজ লাইভের আগেই শেষ হবে** — কিছুই পরে রাখা হয়নি।
15. **মোট PR এখন ৬০৪টা** (নতুন ৪টা: ৬০১–৬০৪), ২৮টা স্টেজ। ২৩টা পুরনো PR-এ তারিখসহ নতুন অংশ যোগ হয়েছে।
16. **আপনার কাছে নতুন যা লাগবে:** লাইভের আগে গাইড দেখে Azure Storage account (Blob) খোলা; তার key ব্যাকএন্ডের ভল্টে। VM বানানোর গাইড: `review/AZURE-VM-GUIDE.pdf`।

### V2.1 চূড়ান্ত (২০ অক্টোবর)

*২০ অক্টোবর ২০২৬ · কোডের আগের সব ডেমোর কাজ শেষ। এটাই V2.1-এর শেষ আপডেট — **এই ফাইল থেকেই কোড শুরু হবে।** নতুন কোনো PR নেই, মোট এখনো ৬০৪টা, ২৮টা স্টেজ।*

1. **টাইমিং টেস্ট (TA-2):** ৫৩০টা মাপ, **০ ফেল**। নিয়মগুলো এখন পাকা:
   - মাউস, আঙুল আর কিবোর্ড — তিনটার থামার হিসাব আলাদা।
   - যা থামে, সেটা আবার চলার টেস্ট থাকতেই হবে।
   - মাউস সরালে, টেনে ছাড়লে বা পাশের দিকে চাকা ঘোরালে স্লাইডার ~০.১ সেকেন্ডের মধ্যে আবার চলে।
   - উপর-নিচের চাকা ঘোরালে স্লাইডার থামে না, শুধু পেজ নামে।
   - সব সারি মাউসে টানা যায়; টেনে ছাড়লে কার্ড খোলে না।
   - টোস্টের উপর মাউস বা ফোকাস থাকলে টোস্ট থেকে যায়।
   - পেজ বদলালে সব টাইমার বন্ধ হয়।
   - মেনু বা প্যানেল বন্ধ হলে ফোকাস যে বোতাম খুলেছিল, সেখানে ফেরে।
   - pull-to-refresh মাঝপথে বাতিল হলে আগের অবস্থায় ফেরে।
   - ফোনে কিছু বদলায়নি: ফোন টেস্ট ০/২৪০ ফেল, স্ক্রিনশটে আসল পরিবর্তন ০। চেকলিস্টে এই নিয়মের নম্বর এখন **L32/L33** (আগে L28/L29 লেখা ছিল)।
2. **ব্যাগ পেজ (আপনার রিভিউ ৪৩.৩–৪৩.১০, Batch B করেছে):** শিরোনাম "Your bag — N items"; Continue shopping বোতাম বড় আর ঝিলিকসহ; FREE-তে ঝিলিক; "You save" সেলের লাল রঙে; একই সাইজের বক্স ঠিক; লাইনের নাম ১৭ px, রং আর সাইজ গাঢ় করে; ব্যাগের সব কথা সহজ ইংরেজিতে (১৫টা লেবেল, বাংলাসহ বদলানো যায়); ব্যাগে কম্বোর ডাকনাম আর নেই।
3. **ঝিলিক (Shimmer) নিয়ন্ত্রণ:** Admin › Settings › Shimmer — ১৪টা ঝিলিক, প্রতিটায় চালু/বন্ধ, গতি আর জোর, সাথে একটা মূল সুইচ। ফোনে "কম নড়াচড়া" (reduce motion) চালু থাকলে কোনো ঝিলিক নেই। Add to Bag-এর ঝিলিক আছে, কিন্তু শুরুতে বন্ধ।
4. **"Take 2 │ Take 3 │ Take 4" বক্স:** সোনালি দাগসহ, আগের "Build your own set"-এর দামের নিয়ম থেকেই বানানো। সেটিংসে: চালু/বন্ধ, তারিখ, কোন ক্যাটাগরি/প্রোডাক্ট, একটা নিয়মে ৪টা পর্যন্ত ধাপ। শুধু কম্পিউটারে চলে; ফোনেরটা এখন শুধু প্রিভিউ।
5. **আপনার "হ্যাঁ" লাগবে:** ডেমোতে ৪ পিসের দাম আমরা ধরে নিয়েছি — ৪টা পোলো ৳২,৭০০ আর ৪টা টি-শার্ট ৳১,৭৫০। আসল দাম সবসময় আপনিই ঠিক করবেন (পরিশিষ্ট B.4-এর ১৩ নম্বর)।
6. **অ্যাডমিনের ভাষা:** ইংরেজি মোডে ২০৬টা অ্যাডমিন পেজে একটাও বাংলা শব্দ নেই; আধা-বাংলা আধা-ইংরেজি লেবেলের ডিকশনারি ঠিক করা হয়েছে; "Blueprint & files"-এ ডকুমেন্ট যেমন লেখা তেমনই দেখায়, দুই মোডেই; কম্বো নিয়মের অবস্থা ইংরেজিতে Running/Off/Ended/Starts, বাংলা মোডে বাংলায়।
7. **ফোনে দাম:** ৳ চিহ্ন আর তার সংখ্যা কখনো আলাদা লাইনে যায় না। ক্যাটাগরির ব্যানারে এটা ঠিক করা হয়েছে।
8. **সার্ভারের অ্যাডমিন পেজ (ডেমোতে):** Server, Cache, Images, Speed আর "Keys & connections"; Backup পেজে এখন Blob আর Drive দুটোই। এসব পেজের সব সংখ্যা নমুনা — আসল সংখ্যা আসবে সার্ভার চালু হলে।
9. **টেস্টের ফল:** ফোন, ট্যাবলেট আর কম্পিউটারের ডিভাইস টেস্ট ০ ফেল; টাইমিং ০ ফেল; সার্ভার অ্যাডমিন ১২০টা চেক ০ ফেল, সাথে ১৯টা ফ্লো পাস; owner-answers টেস্ট পাস।
10. **এরপর:** আপনার দিক থেকে বাকি — VM-এর public key বসানো আর GitHub অ্যাক্সেস (পরিশিষ্ট B.1), আর ৪ পিসের দামে হ্যাঁ/না। তারপর কোড।

---

## মালিকের জন্য সংক্ষেপে

1. এটা EXTAS অনলাইন দোকানের পুরো বিল্ড-নির্দেশনা, ভার্সন ২ (১৯ অক্টোবর)। কোড লেখার সময় এজেন্টরা এটা দেখেই কাজ করবে। ভার্সন ১ যেমন ছিল তেমনই রাখা আছে, একটা অক্ষরও বদলানো হয়নি।
2. প্ল্যাটফর্মটা কী: ফোনে কেনাকাটার জন্য বানানো ছেলেদের পোশাকের দোকান। কম্বো সবচেয়ে বেশি বিক্রি হয়, ক্যাশ অন ডেলিভারি চলে, স্টক আসে আপনার ERP থেকে, আর সাতজন AI এজেন্ট রোজকার কাজ চালায়।
3. মোট কাজ এখন ~~৬০০টা~~ **৬০৪টা** PR, ২৮টা স্টেজে (V2.1-এ সার্ভারের ৪টা নতুন PR)। ~~৫৯৪টা~~ **৫৯৮টা** লেখা হয়ে গেছে, কোড এখনো শুরু হয়নি। ৬টা (হস্তান্তর প্যাক) পরে হবে, যেদিন সিস্টেম অন্য কাউকে দেবেন।
4. ভার্সন ১-এর পর যা যা বদলাল:
   - হেডারে WhatsApp আইকন সব পেজে। ভাসমান WhatsApp বন্ধ, তবে সুইচ হিসেবে রাখা আছে। ব্যাগে জিনিস থাকলে ব্যাগ আইকন হালকা নড়ে।
   - প্রোডাক্ট পেজে দামের লাইন আর মাপের লাইন সব ফোনে এক লাইনে থাকে। ৫টা রং পর্যন্ত "সব রং" লিংক রঙের পাশেই থাকে।
   - ডেলিভারির সময় ঘণ্টায় দেখায়: ঢাকার ভেতরে ২৪–৪৮ ঘণ্টা, বাইরে ৪৮–৭২ ঘণ্টা। সংখ্যা ব্যাকএন্ড থেকে বদলানো যায়।
   - কাস্টমার আমাদের কাছ থেকে পায় ২টা SMS আর ১টা WhatsApp, এর বেশি না। মার্কেটিংয়ের টিক দুইটা আলাদা: SMS-এর টিক দেওয়া থাকে, WhatsApp-এর টিক খালি থাকে।
   - কাস্টমার দরজায় রাইডারের সামনে পরে দেখতে পারবে (চালু, বন্ধ করার সুইচ আছে)।
   - কম্বো: একটা স্টাইলের সব রঙের জোড়া নিজে থেকেই কম্বো হয়ে যায়। ক্যাটাগরি, প্রোডাক্ট আর ব্যাগ পেজের ৫টা করে ডিজাইন আছে, নম্বর দিয়ে সেরাটা বাছা হয়েছে। অফার শেষ হলে পেজ আর্কাইভে যায়, কিন্তু লিংক কখনো মরে না।
   - কম্পিউটারের জন্য: মেগা মেনু, ডানদিকে ব্যাগের ড্রয়ার, স্ক্রল করলেও কেনার বার থাকে, চওড়া স্ক্রিনে লেআউট ১৪৪০ পিক্সেল। ফোনের ডিজাইন একটুও বদলায়নি।
   - ব্লগ: দিনে ৩–৬টা ভালো লেখা আসবে। ৫ জন লেখক-এজেন্ট লিখবে, একজনের লেখা আরেকজন প্রুফ দেখবে। ব্লগে শুধু নিজেদের বিজ্ঞাপন থাকবে, পপআপের নিয়ম মেনে।
   - গুগল: ইংরেজি পেজ মূল ঠিকানায়, বাংলা পেজ /bn-এ। পুরনো WordPress-এর সব লিংক নতুন পেজে চলে যাবে, তাই র‍্যাংক হারাবে না। ব্র্যান্ডের নাম থাকবে (আপনার সিদ্ধান্ত), প্রতিটা প্রোডাক্টে আলাদা ব্র্যান্ডের ঘর আছে।
   - প্রোডাক্টের নাম, লিংক আর SEO টাইটেল সব ব্যাকএন্ড থেকে ঠিক করা যায়। লিংক বদলালেও পুরনো লিংক নতুনটায় নিয়ে যায়।
   - সাতজন এজেন্ট, প্রধান জ্ঞানী। টেলিগ্রামে প্রত্যেকের নাম আর কোড দেখায়। তাদের পড়াশোনা, পরীক্ষা আর শক্ত মেমরি আছে।
   - ব্যাকএন্ডে আছে: সব PR-এর তালিকা, পেজ সাজানোর টুল, দুই পাশের খালি জায়গার টুল, এক বোতামে "লঞ্চ ডিফল্টে" ফেরা। ব্যাকএন্ড ইংরেজিতে চলে, বাংলার সুইচ আছে।
   - সার্ভার: ~~নতুন VPS (Ubuntu 24.04)~~ **V2.1: Azure E8ds_v6, সিঙ্গাপুর, Ubuntu Server 24.04 LTS Gen2, OS ১২৮ জিবি + ডেটার জন্য ১ টিবি ডিস্ক।** প্রথম দিনে লাগবে শুধু IP, ~~SSH key~~ আমাদের দেওয়া public key আপনার VM-এ বসানো, আর GitHub অ্যাক্সেস; পোর্ট আমরাই খুলব। বাকি সব key আপনি পরে ব্যাকএন্ডে বসাবেন। তবে লাইভে যাওয়ার আগে Google Drive ব্যাকআপ, **Azure Blob ব্যাকআপ (V2.1)** আর Telegram সতর্কতা চালু থাকতেই হবে।
5. চারটা কাজ থামিয়ে রাখা আছে, কোডের সময় শেষ হবে: পুরো সাইট বিল্ডার, ইউজার ম্যানুয়াল, দুই পাশের জায়গার বাড়তি কাজ, আর পেজে দাঁড়িয়ে সরাসরি এডিট করা।
6. টেস্টের নিয়ম: অন্তত ৮টা ফোন, ট্যাবলেট খাড়া আর আড়াআড়ি দুইভাবেই, আর কম্পিউটার। সব পাস না করলে কিছু লাইভে যাবে না।
7. পরে নতুন কিছু চাইলে: আপনি বলবেন বা ব্যাকএন্ডের ফর্মে লিখবেন। সেটা রেজিস্টারে ওঠে, একটা "পরিবর্তনের নোট" হয়, তারপর ব্লুপ্রিন্টের নতুন ভার্সন (V2.1, V2.2…) হয়। আপনাকে GitHub দেখতে হবে না।
8. এরপর কী: ~~আপনি VPS-এর স্ক্রিনশট, IP, SSH key আর GitHub অ্যাক্সেস দিলেই কোড শুরু হবে।~~ **V2.1:** গাইড দেখে (`review/AZURE-VM-GUIDE.pdf`) VM বানাবেন, IP দেবেন, আমাদের দেওয়া public key VM-এ বসাবেন, আর GitHub অ্যাক্সেস দেবেন — তাহলেই কোড শুরু। আপনার কাছ থেকে আর যা লাগবে, তার ছোট তালিকা পরিশিষ্ট B-তে আছে।

---

## Contents

- V2.1-এ কী বদলেছে (CN-001)
  - V2.1 চূড়ান্ত (২০ অক্টোবর) — শেষ আপডেট, এই ফাইল থেকেই কোড (V2.1 final · 20 Oct)
- মালিকের জন্য সংক্ষেপে
- Status of each part
- How to use this document
- What this platform is
- Change log
- Resolved conflicts
- Owner rulings and standing instructions in force (to 19 Oct, 23:33)
- How changes are made after V2

**Part A · Platform, server and architecture**

- A1. How this build runs
- A2. Server foundation (S0A) — runs first, before any application code (V2.1: A2.9 server specification)
- A3. Architecture — the ERP is the master
- A4. Multi-store — three stores, one server, one codebase
- A5. Model and cost policy
- A6. Repository and document discipline
- A7. Settings framework and handover-ready rules (V2 · S00 additions, approved 18 Oct)

**Part E · Stages, the PR plan and the numbers**

- E0. The stage table (from the register, 19 Oct)
- E1. How the count was arrived at (V2 trail)
- E2. Checks on the numbers
- E3. Order of work
- E4. What one PR must contain
- E-H. V1 Part E as of 18 October 2026 (history, kept verbatim)

**Part B · Orders, money, support and operations**

- B1. Orders and fulfilment
- B2. Documents
- B3. Payments and money
- B4. Support module — S22 · Support (all-in-one)
- B5. Customers and CRM
- B6. Data, security and compliance
- B7. Admin and back-office quality
- B8. Competitor Teardown agent
- B9. PR register inside the backend (V2 · S21 · PR 594)

**Part C · AI, marketing and imagery**

- C1 · AI 360 Control Room (S15)
- C2 · AI Cost Book and the cost calculator
- C3 · The agents and their jobs
- C4 · Organic growth — SEO, AI answers, YouTube, blog
- C5 · S23 · Social & content studio
- C6 · Marketing
- C7 · S24 · Virtual Photoshoot Studio
- C8 · S25 · Video & Campaign Creative Studio
- C9 · Build capacity and timeline — the reality check
- C10. The seven fixed agents, chain of command and learning (V2 · PR 577–585, 593)
- C11. The blog as the traffic engine (V2 · S12 · PR 591–593, 244, 528–530, 547)
- C12. Google traffic plan (V2 · S11/S13/S19 · PR 220, 236, 586–589)
- C13. Product naming and URL control (V2 · S01 · PR 590)

**Part D · UI/UX — IN REVIEW**

- D0. Status of this part — IN REVIEW, NOT FINAL
- D1. Standing design rules
- D2. The compulsory first-screen rule — Locked (§57.5, §58.4, §58.12)
- D3. Page by page
- D4. Configurability — the eye-toggle system
- D5. Analytics — Locked (§50, corrected; confirmed locked in §52.1)
- D6. Still open / still in review
- D7. Where two rounds disagreed — the later one wins
- D8. Combos — the biggest-selling section (V2 · S03 · PR 89–104, 571–576)
- D9. Desktop (V2 · Notes 34–35, 39 · DESKTOP-REVIEW, DESKTOP-QA-REPORT)
- D10. Page and site building tools (V2 · S02 · PR 595–600)
- D11. Admin language (V2 · PR 503 scope · Note 37.3)
- D12. Performance budgets (V2)

**Part F · Decisions still open**

- F1. Settings still to be decided
- F3. Decisions from the UI/UX rounds still waiting
- F2. Questions raised while writing this specification
- F4. Status of every V1 question (V2, 19 Oct)

**Appendix A · Every PR, 1–604**


**Appendix B · Open owner decisions and owner data still needed**

- B.1 Owner data — day 1 (code start)
- B.2 Owner data — before go-live (entered by the owner in the vault / Integrations screen)
- B.3 Business content
- B.4 Open owner decisions

**Appendix C · QA gate definition and test inventory**

- C1. The release standard (owner, Note 21; PR 570)
- C2. The device gate — `qa/device-matrix.js`
- C3. Phone pixel-diff guard (desktop-only work)
- C4. Pause / resume rule
- C5. The checklist — `qa/ECOMMERCE-CHECKLIST.md`
- C6. Test inventory (to re-run in the code phase)
- C7. Real-device checks still owed
- C8. Gate order for a release
- C9. Verification of this specification

---

## Status of each part

| Part | What it covers | V1 status (18 Oct) | **V2 status (19 Oct)** |
|---|---|---|---|
| **A** | How the build runs · server · architecture · multi-store · model policy · documents · settings framework | Locked | **Locked, updated.** New VPS (A2, Note 45); permissions in two steps (A1.1); seven agents replace the A/B/C lanes (A1.4); settings framework added as A7. **V2.1 (19 Oct 23:33, CN-001):** server fixed — Azure E8ds_v6, storage placement, NVMe boot unit, RAM/CPU split, Blob + Drive backup, everything before go-live (A2.9). **V2.1 final · 20 Oct:** server admin pages in the demo (A2.9.18) |
| **E** | Stages, PR plan, numbers, order of work | Locked, one warning | **Rewritten for 600 PRs / 28 stages.** Reconciles exactly with the register (Appendix A, verification script). **V2.1:** 604 PRs (601–604 added) |
| **B** | Orders, documents, money, support, customers, security, admin | Locked | **Locked, updated.** Messages (2 SMS + 1 WhatsApp), two consent ticks, trial at the door, delivery hours, invoice editable, fraud engine without automatic blocking, PR register (B9) |
| **C** | AI 360, costs, agents, organic growth, social, studio, video | Locked | **Locked, updated.** Seven fixed agents and chain of command (C10), blog engine (C11), Google traffic plan (C12), naming and URL control (C13) |
| **D** | UI/UX | In review | **Reviewed through round 15, phone and desktop; ready for the code phase** (owner, Note 44.1). New D8 combos, D9 desktop, D10 site-building tools, D11 admin language, D12 performance budgets. **Paused items: PR 596 (extensions), 598, 599, 600**. **V2.1 final · 20 Oct:** owner bag review 43.3–43.10 built (D3.11; Shimmer control and tier box, D10.4), timing rules from TA-2 (D1.2 R18), phone price rule (R19), admin language 0 Bengali in English mode on 206 routes (D11) |
| **F** | Decisions still open (V1 list) | Reference | **Reference.** Each V1 question now carries its status; the live open list is Appendix B |
| **App. A** | Every PR 1–604 (1–600 at V2): title, stage, status, owner, demo file | — | New |
| **App. B** | Open owner decisions and owner data still needed | — | New. **V2.1 final · 20 Oct:** B.4 #13 (4-piece tier prices) |
| **App. C** | QA gate definition and test inventory | — | New |

**V2.1 final · 20 Oct:** Appendix C gains the timing rules and TA-2 results (C4), the L32/L33 references (C5) and the final QA totals (C2, C3, C6).

**Paused for the code phase (owner, Note 44.1, 22:38).** These are filed, partly in the demo, and finished in
code. Nobody builds on their demo state as if it were final:

| PR | What | In the demo | What the code phase still owes |
|---:|---|---|---|
| 596 | Side canvas, extensions (side zones on login and bag pages, per-size placement, Bengali sheets) | Yes, v2: `96c-layout-builder.js`, `r12-zlb.css`, `#/admin/side-canvas`, `#/preview/side-canvas`. Owner's placement (157 × 644 at 1797 × 879), 10-size editor, 16 page types, per-page switches | Tests for per-page placement, Bengali placement sheets, full gate re-run (register PR 596 "status at pause") |
| 598 | Site builder: menus, header, footer, categories, product-page blocks, content pages, theme, shimmer control, tiered bag offers | Yes, paused cleanly ~23:00: `96d-site-builder.js`, `#/admin/site` — menus (one tree → desktop row, mega menu, phone menu, bottom bar), header (announcements, icons, logo text or image + phone logo), slogan (switched **on**), footer drag-and-drop with 9 social and 10 payment icon sets + uploads, categories, 16 product-page blocks per device (buy group cannot be hidden), content pages, theme with AA contrast block, draft → preview → publish → undo, versions; default data = shop identical (43 pages markup-identical, 0 px) | Full gate re-run, Bengali dictionary merge, measured tap check at publish, phone-menu footer wiring; shimmer control and tiered bag offers to confirm against the register line. **V2.1 final · 20 Oct: confirmed and built** — both are in the register line and in the demo (Batch B: `89t-shimmer.js`, `89u-bag-offers.js`; D3.11, D10.4) |
| 599 | In-dashboard help and the handover user manual | Partly: "How to" panels and the Site manual `#/admin/manual` (25 sections) inside `96d-site-builder.js` | Coverage of every admin area; `USER-MANUAL.md` export kept with the blueprint (not exported yet) |
| 600 | On-page edit mode with phone review and the AI checker | **Not in the demo.** Plan approved 100% (Note 43.12) | All of it, on the PR 598 engine |

*V1 note kept (superseded by the table above):* **What "in review" means for Part D.** Everything in it marked **Locked** may be built now — those are
settled and will not move. Everything in D6 is still being audited and a builder waits. When the UI/UX
review finishes, **only Part D's status line and its contents change**, and this file becomes V1.1,
V1.2 and so on. The rest of the document does not move.

---

## How to use this document

**If you are the build agent:**

1. Read Part A first. It contains the rules you operate under, and they override your defaults.
2. Build S0A — the server — before you write a single line of application code.
3. Work the stages in the wave order in E3.
4. When you reach something undecided, look in Part F. Use the recommended default, build it as a
   setting the owner can change, write one line in `BLOCKED.md`, and keep going. **Never stop and wait.**
5. Every PR meets the six conditions in E4, without exception.
6. If this document and your own judgement disagree, this document wins. If this document is silent,
   write the question into `BLOCKED.md` rather than inventing an answer.

**If you are the owner:** Part F is your list. Nothing there stops the build — each one has a sensible
default already chosen — but the eight marked "Owner must supply" are things only you can provide, and
two of them (ERP repository access, and which domain is connected first) block real work.

> **V2 · 19 Oct — how to use this version.**
> 1. Scope comes from `master/MASTER-REGISTER.md`. Appendix A lists every PR with its stage and status; the
>    register's PR line is the requirement, and this file explains it.
> 2. Behaviour the owner has already reviewed is defined by the demo. When this file says "see demo
>    `42-combo-auto.js`", that file is the reference implementation to match (not to copy; the stack is
>    Next.js, see A3.1).
> 3. Paused PRs (596 extensions, 598, 599, 600) are finished in the code phase; their demo state is a start,
>    not a sign-off.
> 4. The QA gate in Appendix C replaces the single 440 × 956 screenshot rule for anything visual.
> 5. Undecided items: Appendix B lists the owner's open decisions with the default that ships. Build the
>    default as a setting, write one line in `BLOCKED.md`, keep going (V1 rule, unchanged).
> 6. Every PR is filed in the register before it is built (standard 5). The PR register page (PR 594) is
>    generated from the register on every build, so a new PR appears there by itself.

---

## What this platform is

A premium menswear shop for Bangladesh, built on the owner's own Azure server, with his existing ERP as
the master for stock and accounting. Three stores will eventually run from one codebase on that one
server, sharing stock but sharing nothing else.

Five requirements stand above every detail in this document. Where anything below conflicts with one of
these, these win:

1. **AI agents run the shop's routine work**, and they are trained continuously rather than configured
   once.
2. **Super SEO** — found on Google, on Bing, on YouTube, and by AI assistants.
3. **A fast site on a server kept optimised**, always.
4. **A top-class, premium, classy look** that is genuinely easy for everyone — a 30-year-old in Dhaka, a
   60-year-old, and a buyer in a village.
5. **Combos are central, and selling is the point.** A change that makes the shop prettier but sells
   less is the wrong change.

**95% of customers are on a phone.** Every design decision is judged at **440 × 956 CSS px** first, and
on a desktop second.

> **V2 · 19 Oct — what changed in the picture.** The five requirements above stand unchanged. Since V1:
> the plan grew from 473 PRs in 27 stages to **600 PRs in 28 stages** (594 active, 6 parked); the shop runs on a
> **new VPS** (Note 45), not the Azure VM described in A2; **seven fixed agents** (Gyani A360-01 as chief) build
> the code and then run their dashboard sections; the **blog becomes the main organic traffic engine** (3–6
> posts a day); **combos** get the owner's auto colour-pair model with five templates per page type; and the
> whole storefront becomes editable from the backend with guardrails (PR 595–600). **95% phone** stays the
> rule; desktop got its own treatment without changing the phone by a single pixel (Note 34.2).
>
> **V2.1 · 19 Oct 23:33 (CN-001).** 604 PRs (598 active, 6 parked). The shop runs on a **new Azure VM, E8ds_v6, in Southeast Asia** (A2.9) — not the old E8ds v4 and not an unnamed VPS. Media lives in Azure Blob behind Cloudflare; backups go to Blob and Google Drive.

---

## Change log

| Version | Date | What changed |
|---|---|---|
| 1.0 | 2026-10-18 | First complete specification. Per-stage PR counts re-derived from the 341-PR baseline and reconciled exactly to 473 (see E2). Assembled from 58 recorded decision sections covering 12 UI/UX review rounds, the server assessment, the ERP-master architecture, the support module, the photoshoot studio and the multi-store plan. Parts A, B, C, E locked. Part D in review. |
| 2.0 | 2026-10-19 | 600 PRs / 28 stages (register). Settings framework, fraud and delivery-zone engines, Parameter for Checkout (18 Oct decision rounds, PR 491–569). Round 15 (Notes 1–45): header WhatsApp, price row, delivery hours, messages and consent, trial at the door, combos (PR 571–576), desktop, blog engine (PR 591–593), Google traffic plan (PR 586–589), naming and URLs (PR 590), PR register (PR 594), page and site building (PR 595–600), seven agents (PR 577–585), admin in English, QA standard. New VPS (Note 45). Part D reviewed through round 15. Permissions now come in two steps (replaces A1.1 rule 2). New section "How changes are made after V2" (Note 46, PR 594). |
| 2.1 | 2026-10-19 23:33 | **CN-001 — the owner's server specification** (`review/SERVER-SETUP-SPEC-OWNER.md`, Notes 47–48). 604 PRs / 28 stages: new PR 601 (NVMe boot unit), 602 (four-layer cache), 603 (database performance pack), 604 (hardware-aware profile, run-anywhere); dated scope on 23 existing PRs. Machine fixed: Azure E8ds_v6, Southeast Asia, Ubuntu Server 24.04 LTS Gen2, OS 128 GB + 1 TB data disk. Backups Blob + Drive (replaces Drive only). New A2.9; A2.6 split updated (Meilisearch added); "re-size to the new VPS" struck; nine conflicts resolved (32–40); Appendix A rows 601–604; Appendix B updated. V2.md kept unchanged as history. |
| 2.1 final | 2026-10-20 | **Last update before code; no new PRs (604 PRs / 28 stages).** Timing rules proven in the timing audit TA-2 (530 checks, 0 fails) added to D1.2 (R18) and Appendix C4; the old timing references "checklist L28/L29" corrected to **L32/L33**. Owner bag review 43.3–43.10 done by Batch B: title, Continue shopping, shimmer on FREE, "You save" in sale red, duplicate-size box, line titles, plain bag words, **Shimmer control** (14 shimmers + master), **tier box** "Take 2 │ Take 3 │ Take 4" (D3.11, D10.4, PR 98/107/109/598). Admin language: 0 Bengali in English mode on 206 routes (D11). Phone price rule: currency sign and number never split (R19, D3.4). CN-001 server admin pages in the demo (A2.9.18). Note 49 / CN-002 row. Appendix B.4 #13 (4-piece tier prices, owner's yes). QA totals in Appendix C. Bengali "V2.1 চূড়ান্ত (২০ অক্টোবর)" block. |

### V2 → V2.1 change log (CN-001, owner, 19 Oct 23:33)

| Change | PR | Source |
|---|---|---|
| Machine fixed: Azure E8ds_v6 (8 vCPU, 64 GB, 440 GB temporary NVMe), Southeast Asia, Ubuntu Server 24.04 LTS x64 Gen2 (not Pro), Trusted launch, accelerated networking, boot diagnostics on, auto-shutdown and Azure Backup off | 1, 2 | Note 48 · A2.9.1 |
| Disks: OS 128 GB Premium SSD + separate 1 TB (P30) data disk with LVM, "delete with VM" off (replaces the 2 TB note) | 1, 3 | Note 48 · A2.9.1 |
| Access: owner keeps the .pem; adds our public key via Reset SSH public key; no private key in chat | 1 | Note 48 · A2.9.2 |
| Storage placement: data disk = permanent data; Blob behind Cloudflare = all media; NVMe = temporary only | 1, 18, 37, 601 | Owner spec §1 · A2.9.3 |
| NVMe boot unit: format and mount at every boot, before Redis/Postgres/Docker; admin card; alert | **601** | Owner spec §1 · A2.9.4 |
| RAM/CPU split in one config file (Meilisearch 4 GB added; Redis and worker 6 GB); hardware-aware profile; storage adapter; runs without CDN or Blob | 4–7, 18, **604** | Owner spec §2, §11 · A2.9.5, A2.9.15 |
| Docker Compose and Caddy stay; zero-downtime deploys with rollback; Cloudflare Full (strict) | 4, 7 | Note 48 · A2.9.6 |
| Images: 5 sizes, AVIF/WebP/JPEG, 4:5, quality 75–80 (setting), dominant colour, original archived, < 40 KB / < 150 KB | 22, 24, 37, 88 | Owner spec §3 · A2.9.7 |
| Cloudflare for the three domains, cache rules, instant purge | 362, 7 | Owner spec §4 · A2.9.8 |
| Four-layer cache and purge rules; stock display 15 s, live stock with row lock at bag and checkout; "Clear all cache" | **602**, 6, 198 | Owner spec §5 · A2.9.9 |
| Database: tuning, PgBouncer, temp on NVMe, required indexes, pg_trgm for fraud matching, slow log, materialized views; search stays Meilisearch | 5, 13, 72, 519, **603** | Owner spec §6 · A2.9.10 |
| Speed targets from Dhaka on a phone over 4G, measured monthly | 10, 88, 234 | Owner spec §7 · A2.9.11 |
| Backups: Azure Blob added (WAL/PITR, daily full, soft delete, versioning/immutability) + Google Drive mandatory; restore defaults to Blob; monthly restore test | 8, 395, 396, 507 | Note 48 · A2.9.12 |
| Server page and Telegram alerts | 9, 423 | Owner spec §9 · A2.9.13 |
| Security: UFW 22/80/443, key-only SSH with fail2ban (22 not IP-restricted), boot order NVMe first | 3 | Owner spec §10 · A2.9.14 |
| Everything before go-live; S0A build order | all above | Note 48 · A2.9.16 |

### V2.1 final change log (20 Oct 2026)

Pre-code demo work finished and folded in. **No new PR numbers**; the register carries the dated scope
"V2.1 final · 20 Oct" on the PR lines named below and in its "Scope added to existing PRs, 20 Oct" block.

| Change | PR | Source | Landed in |
|---|---|---|---|
| Timing rules proven in TA-2: separate pause flags for mouse, touch and keyboard; every pause has a tested resume path; sliders resume within about 100 ms after the mouse leaves, after a drag and after a sideways wheel; a vertical wheel is ignored by sliders; every row drags with the mouse and a click after a drag does not open the card; toasts hold on hover and focus; timers cleared on route change; focus back to the opener; a cancelled pull-to-refresh resets | 42, 570 | `qa/TIMING-AUDIT.md` TA-2 (530 checks · 521 pass · 0 fail · 9 info); checklist L32, L33.01–L33.37; `agents/lessons/ALL.md` (TA-2, T1–T4) | D1.2 R18, App. C4 |
| Timing-rule references "checklist L28/L29" → **L32/L33** (renumbered 20 Oct; L28/L29 are the older carousel and long-name points) | 570 | `qa/ECOMMERCE-CHECKLIST.md` renumbering note | App. C4, C5 |
| Bag page: "Your bag — N items"; bigger Continue shopping with shimmer; shimmer on FREE; "You save" in sale red; duplicate-size box fixed; line titles 17 px with colour and size in bold ink; 15 plain English bag labels (editable, Bengali included); no combo nick-names on the bag | 107, 109, 598 | Note 43.3–43.9; Batch B (`agents/worklog/sawdagor.log`) | D3.11 |
| Shimmer control: Admin › Settings › Shimmer, 14 shimmers × on/off · speed · strength + master; reduce-motion = no shimmer; Add to Bag shimmer present, off by default | 598 | Note 43.4–43.5; Batch B (`89t-shimmer.js`) | D1.5, D4, D10.4 |
| Tier box "Take 2 │ Take 3 │ Take 4" with gold bars, from the Build your own set price rules; on/off, dates, categories/products, up to 4 tiers per rule; desktop only, phone version preview only | 98, 109, 598 | Note 43.10; Batch B (`89u-bag-offers.js`) | D3.11, D10.4 |
| 4-piece tier prices suggested in the demo (`BAG_TIER_SEED`: 4 polos ৳2,700, 4 tees ৳1,750) wait for the owner's yes | 98, 598 | Batch B | App. B.4 #13 |
| Admin language: English mode 0 Bengali across 206 admin routes; mixed-label dictionary fixed; documents in Blueprint & files shown exactly as written in either mode; combo-rule states Running/Off/Ended/Starts in English, Bengali in Bengali mode | 503, 594, 90 | admin-language pass (Prohori); owner-answers test | D11 |
| Phone price rule: a currency sign and its number never split across lines (nowrap); fixed in the category banners | 45, 61 | phone review | D1.2 R19, D3.4 |
| Server admin pages in the demo (sample data): server, cache, images, speed, Keys & connections; backup shows Blob + Drive | 423/601/603/604, 602, 22/24/88, 234, 493/500, 8/395/507 | ROUND15 "Done — CN-001 server pages in the V12 demo" | A2.9.18 |
| Note 49: VM created, region Malaysia West kept (CN-002), NSG verified | 1 | Note 49 | front matter (CN-002), Round 15 table |
| QA totals at V2.1 final: device gate 0 fails (phones, tablets, desktop); timing 0 fails; phone gate 0/240; phone pixel diff 0 real changes; server admin 120 checks 0 fails + 19 flows; owner-answers test passes | 570 | TA-2, Batch B, server-admin checks | App. C2, C3, C4, C6 |

### V1 → V2 change log, by area

Each line: what changed · PR · where it came from. "§59" = the 18 Oct decision round in `PENDING_CHANGES.md`
(answer numbers match V1 Part F question numbers); "§60" = the 18 Oct delivery-zone round; "Note" = ROUND15.

**Server and build rules**

| Change | PR | Source |
|---|---|---|
| New VPS created fresh with Ubuntu 24.04 LTS; the old Azure E8ds v4 sections apply to the old VM only | 1, 2 | Note 45 · PR 1–2 |
| Ports 22/80/443 opened by us (server firewall over SSH; provider panel with the owner's login or step-by-step guidance) | 3 | Note 45.2 · PR 3 |
| Permissions in two steps: day 1 = VPS IP + SSH key + GitHub access; everything else entered later by the owner in the vault / Integrations screen; Drive backup and Telegram alerts on **before go-live**. Replaces V1 A1.1 rule 2 | 493, 500, 8, 9 | Note 45.3 · PR 493/500 |
| Settings framework: typed registry, two-tier resolver, credential vault, hardcode guard in CI, role builder, settings migration, integrations screen, default pack, "my own data" register, reset to default | 491–496, 500, 508–510 | Settings-driven instruction, 18 Oct |
| Branding and language from settings; both languages live; admin in simple English by default with a Bengali switch | 501, 503 | 18 Oct · Note 37.3 · PR 503 |
| ERP becomes optional: mode switch, generic adapter, ERP-absent guard; no-ERP stock module parked as S27 | 497–499 | 18 Oct decision |
| Handover pack (installer, setup wizard, clean-install check, inline help, bilingual guide, update distribution) parked as S26 | 513–518 | 18 Oct decision |
| Demo-only helpers (sample logins, reviewer hints) behind `?demo=1`, never shipped | 509 | Note 41.2 |
| Blueprint kept as versioned files (V1, V2 …), latest marked latest inside the PR register page | 594 | Note 33.2 · PR 594 |
| Change process after V2: register and blueprint in the repo `docs/`, change notes CN-###, scope-first filing, placement rules, V2.1/V2.2 versions, staging + gate after go-live, wave briefs | 594 | Note 46 · PR 594 · review/CHANGE-PROCESS.md |

**Plan size and staging**

| Change | PR | Source |
|---|---|---|
| 473 PRs / 27 stages → 600 PRs / 28 stages (S26 added; S27 parked, unnumbered) | all | Register stage table |
| The 12 mis-filed PRs re-filed (page builder and label dictionary S08 → S02; category SEO S10 → S11; invoice templates S14 → S20; celebration overlay S19 → S02; user manual S20 → S18; Find My Size S23 → S02) | — | Register ("The 12 that moved"); closes V1 E2 point 1 |
| PRs 586–594 re-staged into their real stages; stage counts fixed | 586–594 | Note 33 (done 15:45) |

**Storefront, phone (round 15)**

| Change | PR | Source |
|---|---|---|
| Header WhatsApp icon on every page (same glyph; hover tip "Need any help"; soft glow, no flicker); checkout shows it in the header only after the in-page help block scrolls away; floating disc kept as a switch, off | 40, 70 | Note 2.4, 3.1–3.3 · PR 70 |
| Bag icon bigger, pulses in header and bottom bar when the bag has items; icon gaps 2 px smaller; heart tried in the header (kept, hides on too-narrow phones) | 40 | Note 3.4, 3.5 |
| Heart right after the product title; share icon switched off (kept); floating icon column retired by default | 68, 69 | Note 2.3, 3.7 |
| "All N colours": up to 5 colours after the last swatch on the swatch line; from 6 on the colour label line | 55 | Note 2.2 |
| Fit line under the sizes always one line; fields hide from the end, first field always stays | 53, 56 | Note 2.5 |
| Price row: price · discount stack · second bar · free delivery (or the owner's text), always one line; second bar shown per product / offer / campaign | 61 | Note 2.6, 3.10 |
| Buy bar never sinks under the screen edge (safe-area padding, no pull bounce) | 85 | Note 2.1 |
| Add to Bag a near shade of Order Now (one family) | 49–51 | Note 3.11 |
| Home hero buttons: labels, links, style, on/off from the backend; "Shop sets" uses the v3 brand tint | 41, 76 | Note 1.1, 3.12 |
| Search answers help words (delivery, return policy, exchange policy), typos, Bengali | 72 | Note 4.1, 36 |
| Full-screen photo zoom showing the full original image | 24, 54 | Note 13.1 |
| Pull-to-refresh on every page type; one history model: Back goes exactly one page to the same scroll, never blank, never home | S02 shell (no PR named) | Note 6.1, 4.6, 7.1, 12.2, 12.3 |
| Footer "Size guide" opens the size finder over the current page | 58 | Note 12.1 |
| Sliders: snap after a hand drag, auto-drift stays; on desktop they restart the moment the mouse leaves | 42 | Note 23.12, 39 |
| Footer brand block (slogan under the E), newsletter Join, "Text us on WhatsApp", WhatsApp / Hotline layout | 40, 501 | Note 1.2–1.4, 35.6 |
| Same size added twice: "already in bag" by default, quantity +1 as a settings option | 110 | Note 23.13 |
| Bag page polish and tiered "Take 2 / 3 / 4" offer box | 107, 109, 598 | Note 43.3–43.10 |
| Any link to the page you are on (e.g. the logo on home) scrolls to the top | 598 (global fix in demo `99-boot.js`) | Note 42.3 |

**Checkout, orders, messages, customers**

| Change | PR | Source |
|---|---|---|
| Delivery time shown in hours per band (inside Dhaka 24–48, outside 48–72), editable; same line on checkout, thank-you headline, help answers | 550, 119, 126 | Note 4.2, 4.3, 36 |
| Three charge bands, national gazetteer, ambiguity resolver that waits for the whole line, autocomplete with parent and price, accuracy guard, courier zone sync | 549–554 | §60 |
| Phone-first recognition, in-transit duplicate notice, duplicate turned into an exchange, phone-entry risk check, multi-courier fraud data, flag outcome report | 555–557, 559, 562, 567 | §60.7–60.12 |
| Parameter for Checkout: advance-payment mode on the same page; no order held over an address; free delivery exempt; support explanation; silent address backfill | 558, 560, 561, 563, 565, 566 | §60.8–60.12 |
| Duplicate and fraud engine with **no automatic block**: identity graph, rules engine (cancel · hold · warn · allow), alert card, bundling, block proposals, false-positive protection, approval digest, one-click advance request, decision learning, rule switches, new-customer call queue | 519–524, 540–546 | §59 answers 1–5, 44 · §59.2 |
| Customer messages: SMS when placed, SMS when the shop confirms (courier booked), one WhatsApp when the shop processes, nothing after; later steps are switches, off | 148, 505 | Note 4.7, 23.2 · PR 148/505 |
| Two marketing consent ticks: SMS ticked, WhatsApp separate and unticked; stored separately on order and customer | 123, 148, 298, 505 | Note 23.1 |
| Trial at the door: the customer may try in front of the rider (setting, on) | S08 setting | Note 23.9 |
| Invoice: every word and block editable from the backend | 407, 409 | Note 4.4 |
| Account: order number clickable, invoice download icon; desktop shows three offers from different categories' top sellers | 131, 132, 134, 136 | Note 4.5, 4.8 |
| Admin shows full phone numbers; every profile open and number copy is logged; address rule PR 561 unchanged | 284–286 | Note 24.1 |
| True-delivery reconciliation, charge mismatch log (no correction, no message), return-reason capture | 525, 526, 564 | §59 answer 44 · §60.13 |
| Customer history summary, grading, legacy import | 533–535 | §59 answers 25, 44 |

**Combos**

| Change | PR | Source |
|---|---|---|
| Combos get their own simple admin section | 90 | Note 9.1 |
| Picture taps never leave the combo page | 93 | Note 5.1 |
| Auto colour-pair combos (2 / 3 piece, evergreen, "no single piece here", add 1 more → 3 pcs) | 571 | Note 10, 11 |
| Combo lifecycle: optional dates, auto-end, ended pages stay live with alternatives, Archive tab, URLs never die | 571 | Note 25 |
| Combo SEO: fixed colour order in the slug, reverse order 301s, featured pairs indexed, others noindex,follow | 571 | Google plan N4 |
| Five templates each for combo category (L1–L5), combo product (P1–P5), combo in the bag (B1–B5) | 572–574 | Note 8, 11.2 |
| Set photo composed from each piece's photo | 575 | Note 8 |
| Template test matrix and 100-point ranking; winners applied (L1, P1/P3 auto, B5) | 576 | Note 8 · COMBO-RANKING |

**Desktop**

| Change | PR | Source |
|---|---|---|
| Data-driven mega menu (Combos, Sets, Journal; More for hidden categories); 1440 content at ≥ 1536; 4-column footer with contact block; header loops max 3 rounds | 40, 74 | Note 34 · DESKTOP-REVIEW |
| Desktop sticky buy bar; right-side "Added to bag" drawer (420 px); Order Now above the fold at 1024–1366; rows fill; sticky checkout summary | 49–51, 106, 115 | Note 34 · DESKTOP-REVIEW |
| Hero text aligned to the content edge, slides dissolve into the panel (140 px); reviews one row of 3 | 41, 43, 65 | Note 35.1–35.3 |
| Category filters built from the category's own products | 46 | Note 35.7 |
| Page layout builder (home and every category) | 595 | Note 35.4, 35.8 |
| Side canvas in the desktop gutters | 596 | Note 35.5, 37, 38, 42.6–42.8, 43.1–43.2 |
| Launch default and named snapshots | 597 | Note 37.2 |
| Site builder with guardrails (paused) | 598 | Note 40, 41, 42.2, 42.4, 43.5, 43.10 |
| In-dashboard help and user manual (paused) | 599 | Note 42.5 |
| On-page edit mode with phone review and AI checker (paused, not in demo) | 600 | Note 43.11, 43.12 |

**Google, SEO and naming**

| Change | PR | Source |
|---|---|---|
| English at `/`, Bengali at `/bn` live for every page that passes the translation gate; hreflang; own canonical per language | 220, 236, 503, 588 | Note 23.3, 27.1 |
| Hash-to-real-URL forwarder for old demo links | 586 | Google plan N1 |
| WordPress → new site migration on extas.com.bd: every old URL 301s to its twin | 587 | Note 26.1, 27.2 |
| Merchant Center feed and Bangladesh test after go-live | 589 | Note 23.4 |
| FAQ rich results ended for all sites on 7 May 2026: FAQ content stays, markup optional | 224 | Google plan F-notes |
| Product naming and URL control; brand field per product; brand names stay; slug change auto-301s | 590 | Note 26, 27.3 |
| Permanent URL policy (nothing ever 404s once it existed) | 527 | §59 answer 8 |

**Blog**

| Change | PR | Source |
|---|---|---|
| Blog is the main traffic engine: 3 and up to 5–6 posts a day, topic list, writer → another author proofreads → Gyani business facts → Doot final SEO | 591, 244 | Note 28 |
| Blog as a complete section with house ads only and popup rules | 592 | Note 30 |
| Five author agents A360-08…12 under Doot, honest bylines, reviewer names from the owner | 593 | Note 31 |
| Blog brief form, source-link writer, seasonal lifecycle, image sourcing (own photos first; AI generation asks every time) | 528–530, 547 | §59 answers 11–14 |

**Analytics, agents and AI**

| Change | PR | Source |
|---|---|---|
| Owner's event list (search terms, WhatsApp clicks by page and button, bag → purchase, Order Now, removes and re-adds, offer adds, All N colours, size chart, wishlist, logged-in vs guest) | 338, 339 | Note 3.13 |
| Checklist audit runner in the AI section (one click or scheduled, Telegram report, fixes only with permission) | 570 | Note 14, 21 |
| Agent 360° profiles, appraisal reports, curriculum and certification | 577–579 | Note 15, 16, 18 |
| Model auto-suggest with free-model qualification | 580 | Note 17 |
| Seventh agent Tirondaj (ads) with code-enforced guardrails; strong agent memory | 581, 582 | Note 18 |
| Chief agent Gyani; Telegram identity and command routing | 583, 584 | Note 19 |
| Continuous learning engine for Tirondaj and Doot | 585 | Note 20, 22 |
| PR register inside the backend | 594 | Note 33 |
| Geography analytics and geo-led ad guidance; market intelligence; full campaign control; deep conversion feed | 568, 569, 548, 531, 532 | §59 answers 18–21 · §60.14 |
| Per-style profit (simple screen, smart internals); expenses entered here; VAT system present, off | 536, 537 (S16) | §59 answers 21–25 · §59.2 |

### Round 15 notes → where they landed

Every owner note in `review/ROUND15.md` is either in this specification or marked "no spec change".

| Note | Topic | Landed in (V2 section · PR) |
|---|---|---|
| Note 1 | Home hero "Shop sets" tint, footer slogan, newsletter Join, WhatsApp/Hotline wording | D3.3, D3.18 · PR 41, 40, 501 |
| Note 2 | Product page on a real iPhone: buy bar safe area, All N colours rule, heart + share off, header WhatsApp, one-line fit and price lines, size chart waived, spacing | D2, D3.1, D3.5 · PR 53, 55, 56, 61, 68, 69, 85 |
| Note 3 | Header WhatsApp everywhere, checkout exception, glow, bag pulse, Buy-together bug, title fill, price row second bar, Add to Bag colour, hero buttons, analytics list, combo audit | D3.1, D3.3, D3.5, D5, D8 · PR 40, 61, 76, 338, 339 |
| Note 4 | Help-word search, delivery hours, thank-you headline, invoice editable, account order link + invoice, back to the bag, two SMS + one WhatsApp, desktop three offers, standing order 03:34 | D3.2, D3.12, D3.13, D3.15, B2.1, B2.5, D1.9 · PR 72, 550, 126, 407, 409, 134, 136, 148, 505, 132 |
| Note 5 | Answers in Bengali; combo picture taps; more combo layouts | D1.9, D8 · PR 93, 572–574 |
| Note 6 | Pull-to-refresh (6.1); final report (6.2 — no spec change) | D3 V2 block (demo `09-ptr.js`) |
| Note 7 | Swipe-back blank page, jolts, Save for later | D1.2 (history rule), D3.11 |
| Note 8 | Combo focus: category page, 4–5 templates per page type, testing, ranking, set photos | D8 · PR 571–576 |
| Note 9 | Separate easy Combos section in the backend | D8 · PR 90 |
| Note 10 | Owner's WordPress combo model, auto colour pairs | D8 · PR 571 |
| Note 11 | 6-colour example + journeys; templates for every combo kind; 11.3–11.4 version boundary and morning report (no spec change) | D8 · PR 571–576 |
| Note 12 | Size guide link, back scroll, back sequence, the big checklist | D1.2, D3.18, App. C · PR 58, 570 |
| Note 13 | Full-image zoom; 13.2 "nothing dropped" (no spec change) | D3.5 · PR 24, 54 |
| Note 14 | Checklist audit runner in the AI section | B7.3, App. C · PR 570 |
| Note 15 | Backend demos; same fixed agents; 360° profiles | C10 · PR 577 |
| Note 16 | Outside skills in the library; agent reports; degree-level skills | C10 · PR 321, 578, 579 |
| Note 17 | Model auto-suggest, free models only at equal quality | C1.5, C10 · PR 580 |
| Note 18 | Editable profiles; teaching starts; seventh agent (ads); dashboard not a third-party tool; strong memory | C10 · PR 577, 579, 581, 582 |
| Note 19 | Chief agent; shared Telegram with identity; command routing by name or code | C10 · PR 583, 584 |
| Note 20 | Tirondaj and Doot as power agents, continuous learning, practice tasks, paid tools | C10 · PR 585 |
| Note 21 | QA standard: all non-backend points pass on 6–8+ phones, tablets, every page type | App. C · PR 570 |
| Note 22 | Temporary e-mails for free trials — refused; TRIAL-PLAN instead (no spec change) | C10 (learning sources) |
| Note 23 | Owner answers: consent ticks, message counting, /bn, Merchant Center, Use in combos, ceiling, trial at the door, barcodes, VAT, slider snap, quantity option, V11/V12 | B1, B2.5, B5.7, C12, D3.3, D3.11, D8 · PR 148, 505, 220, 589, 42, 110 |
| Note 24 | Full phone numbers in admin, views logged; combo rule "cannot be deleted" explained | B5.1, D8 · S14 |
| Note 25 | Combo rule lifecycle: never delete, auto archive, link stays live | D8 · PR 571 |
| Note 26 | extas.com.bd is his; naming and URLs in the backend | C12, C13 · PR 587, 590 |
| Note 27 | English first, /bn as proposed; WordPress 301s; brand names stay | C12, C13 · PR 220, 587, 590 |
| Note 28 | Blog as the traffic engine; quality is the agents' job | C11 · PR 591 |
| Note 29 | More agents in parallel; blog shown in V12 (process; no spec change beyond PR 592) | C11 |
| Note 30 | Blog full section with house ads | C11 · PR 592 |
| Note 31 | Several author agents; idle cost; reviewer names | C11 · PR 593 |
| Note 32 | Blog reviewed in one go across devices (process) | App. C (blog QA harness) |
| Note 33 | PR register in the backend, files, automatic updates | B9 · PR 594 |
| Note 34 | Desktop finished by agents; phone must not change | D9, App. C (phone pixel-diff guard) |
| Note 35 | Owner desktop review: hero, slider fade, reviews row, layout builder, side gutters, footer, filters | D3.3, D3.4, D3.18, D10 · PR 41, 46, 595, 596 |
| Note 36 | Trust test on the search complaint (no spec change; found the hours gap, fixed) | D3.2 |
| Note 37 | Side canvas yes, launch default, admin English, zones, float, blend, animation, scaling, AI templates | D10, D11 · PR 596, 597, 503 |
| Note 38 | Side canvas speed, AI asset reuse, walk-out template | D10, D12 · PR 596 |
| Note 39 | Desktop sliders resume at once | D1.2, App. C · PR 42 |
| Note 40 | Whole site dynamic like WordPress + Elementor | D10 · PR 598 |
| Note 41 | Dynamic with guardrails; demo login helper hidden | D10, A7 · PR 598, 509 |
| Note 42 | Token breakdown (42.1, no spec change); logo image + slogan; logo click to top; footer drag-and-drop; manual; side-canvas placement rules | D3.1, D10 · PR 598, 599, 596 |
| Note 43 | Bag review; side zones on every page with gutters; on-page edit mode | D3.11, D10 · PR 596, 598, 600 |
| Note 44 | Pause site builder and side-canvas extensions; server file not received; canvas paused cleanly | Status table "Paused", App. B · PR 596, 598 |
| Note 45 | New VPS; we open ports; keys later in the backend | A1.1, A1.2, A2, App. B · PR 1–3, 493, 500 |
| Note 46 | How later changes get in (while coding, after go-live, six months later) | "How changes are made after V2" · PR 594 |
| Note 47 | Owner's server spec file and the new VM config (analysis only, not filed) | A2.9 (V2.1) · CN-001 |
| Note 48 | Owner approves every point of the server analysis; final machine, disks, backup, order (CN-001) | V2.1 block, A2.9, E0–E3, App. A, App. B · PR 601–604; 1–10, 13, 18, 22, 24, 37, 72, 88, 234, 362, 395, 423, 507, 519 |
| Note 49 | VM created (owner screenshots, 20 Oct 00:45–00:48): region Malaysia West kept instead of Southeast Asia (CN-002), Blob in the same region, NSG 22/80/443 verified | CN-002 note under the title; V2.1 final change log · PR 1 (V2.1 final · 20 Oct) |

### V1 front matter as of 18 October 2026 (superseded, kept for the record)

#### EXTAS — E-commerce Platform Build Specification

**Version 1.0 · 18 October 2026**

This is the single living document for the EXTAS e-commerce platform. The version number moves forward
inside this file; there is never a second file. V1 is everything decided up to today.

#### V1 Contents

- Status of each part
- How to use this document
- What this platform is
- Change log

**Part A · Platform, server and architecture**

- A1. How this build runs
- A2. Server foundation (S0A) — runs first, before any application code
- A3. Architecture — the ERP is the master
- A4. Multi-store — three stores, one server, one codebase
- A5. Model and cost policy
- A6. Repository and document discipline

**Part E · Stages, the PR plan and the numbers**

- E1. How the count was arrived at
- E2. The stages
- E3. Order of work
- E4. What one PR must contain

**Part B · Orders, money, support and operations**

- B1. Orders and fulfilment
- B2. Documents
- B3. Payments and money
- B4. Support module — S22 · Support (all-in-one)
- B5. Customers and CRM
- B6. Data, security and compliance
- B7. Admin and back-office quality
- B8. Competitor Teardown agent

**Part C · AI, marketing and imagery**

- C1 · AI 360 Control Room (S15)
- C2 · AI Cost Book and the cost calculator
- C3 · The agents and their jobs
- C4 · Organic growth — SEO, AI answers, YouTube, blog
- C5 · S23 · Social & content studio
- C6 · Marketing
- C7 · S24 · Virtual Photoshoot Studio
- C8 · S25 · Video & Campaign Creative Studio
- C9 · Build capacity and timeline — the reality check

**Part D · UI/UX — IN REVIEW**

- D0. Status of this part — IN REVIEW, NOT FINAL
- D1. Standing design rules
- D2. The compulsory first-screen rule — Locked (§57.5, §58.4, §58.12)
- D3. Page by page
- D4. Configurability — the eye-toggle system
- D5. Analytics — Locked (§50, corrected; confirmed locked in §52.1)
- D6. Still open / still in review
- D7. Where two rounds disagreed — the later one wins

**Part F · Decisions still open**

- F1. Settings still to be decided
- F3. Decisions from the UI/UX rounds still waiting
- F2. Questions raised while writing this specification

#### V1 Status of each part

| Part | What it covers | Status |
|---|---|---|
| **A** | How the build runs · server foundation · architecture · multi-store · model policy | **Locked — build may start** |
| **E** | Stages, the PR plan and the numbers | **Locked, with one warning** — see E2 |
| **B** | Orders, documents, money, support, customers, security, admin | **Locked — build may start** |
| **C** | AI 360, costs, agents, organic growth, social, photoshoot studio, video | **Locked — build may start** |
| **D** | UI/UX | **In review — not final.** Last round: 12, 18 October. The desktop review has not started. |
| **F** | Every decision still open, with a recommended default for each | Reference |

---

## Resolved conflicts

Where V1 (or an older record) and the register (or a later owner ruling) disagree, the newer one is built.
Each conflict is listed so nobody "fixes" the spec back to the old answer.

| # | V1 / older record said | Now built (and why) |
|---|---|---|
| 1 | A2.1–A2.4: keep the existing Azure E8ds v4, Ubuntu 20.04, in-place upgrade, "the package must not change" | **New VPS with Ubuntu 24.04 LTS** (register PR 1–2, Note 45). A2.1–A2.4 apply to the old VM only. **V2.1:** the new machine is an Azure VM, **E8ds_v6** in Southeast Asia (A2.9.1, Note 48) |
| 2 | A1.1 rule 2: one single permission collection at the very start | **Two steps**: day 1 = IP + SSH key + GitHub; before go-live = Drive backup + Telegram alerts on; everything else entered by the owner in the vault (Note 45.3, PR 493/500) |
| 3 | A1.2: the owner hands over IP, sudo user and SSH key or password | Day 1 is **IP + SSH key** (plus GitHub). We create the deploy user ourselves (Note 45.1, OWNER-PRECODE-CHECKLIST) |
| 4 | A4 open question / F #39: the owner opens 80/443 in the portal himself | **We open ports 22/80/443** (PR 3, Note 45.2) |
| 5 | A2.5: V1's own ten-PR list for S0A (access, OS upgrade, LVM disk layout, kernel tuning, runtime, tuning, backup, restore, monitoring, baseline) | **Register PR 1–10 numbering wins.** V1 items without their own register PR are carried as scope: LVM separation and swap → PR 3/4; kernel and network tuning → PR 5; tested one-command restore → PR 8; `docs/SERVER.md` and dashboard hooks → PR 10 (Gyani mapping, for Prohori to confirm) |
| 6 | F #6 "`/en` default with `/bn`"; §59 answer 6 "drop `/bn`, English only"; PR 503 "one language ships live" | **English at `/`, Bengali at `/bn` live per page behind the translation gate** (PR 220, 503, 588; Note 23.3, 27.1) |
| 7 | D3.12: one "Send me offers" tick, on; owner ruling 18 Oct (PHONE-REVIEW): every such box ticked by default | **Two ticks: SMS on, WhatsApp separate and off** (PR 148/505, Note 23.1). Other boxes keep the 18 Oct "ticked by default" rule |
| 8 | D3.3 / D3.4 / D4.1 `fab.whatsapp` On; PR 70 floating WhatsApp; F #62 position question | **Header WhatsApp on every page**; floating disc kept as a switch, **off** (Note 3.1) |
| 9 | D4.1 `pdpIcons.share` On, `pdpIcons.panel` On | **Off** — heart after the title, WhatsApp in the header (Note 2.3, 2.4; demo `02-core.js` SHOWN) |
| 10 | D3.12: "only two zones", "Dhaka city ৳60 · Outside Dhaka ৳120", courier zone mismatches corrected into the gazetteer | **Three bands** with a national gazetteer (PR 549–553); charge never computed from free text; courier mismatches only **logged** (PR 564) |
| 11 | Delivery promise "usually 1–4 days" (and "1–2 / 2–4 days" in help) | **Hours per band**, from settings everywhere (Note 4.2, 36) |
| 12 | B2.5: email is the guaranteed channel; WhatsApp optional per order | **Default send rule: 2 SMS + 1 WhatsApp, then nothing** (PR 148/505, Note 4.7). Email is not covered by Note 4.7 → Appendix B |
| 13 | B2.5 / F #45: WhatsApp invoice PDF or JPG as an owner setting | **Full-page JPG image by default**, still a setting (§59 answer 45) |
| 14 | F #50: anonymise inactive customers after 3 years | **Customers are never auto-deleted**; only IP and GPS expire at 180 days (PR 302, §59 answer 50) |
| 15 | F #1–5 defaults (owner + manager blacklist; drop the GPS button; COD off after 3 returns) | Register PR 156–163, 519–545: **no automatic block anywhere**; customer-facing staff may blacklist; GPS button stays, default on; repeat refusers per case (§59 answers 1–5, §59.2) |
| 16 | F #11–13: owner approves each post for a month; 2 articles a week; no post on a new product | **Owner approves the topic list**; 3–6 posts a day through the agent pipeline; a new product triggers a post (PR 244, 591; §59 answer 12; Note 28) |
| 17 | F #14: blog Bengali first | **English pages are the most important**; Bengali twins publish through the translation gate (Note 27.1, PR 588) |
| 18 | C3.1: eleven functional agents; A1.4: three build lanes A/B/C | **Seven fixed agents** A360-01…07 plus five blog authors A360-08…12; the eleven jobs are mapped to them in C10 (PR 577, 581, 583, 593) |
| 19 | A6.1 / B2.6 / V1 header: one file, the version moves inside it | **Versioned files side by side** (V1 frozen, V2 current); the PR register page marks the highest version as latest (PR 594) |
| 20 | F #58: offer "Continue with Facebook" login | **No Facebook login** (§59 answer 58); birthday marketing stays parked |
| 21 | F #31: mandatory 2FA for admins | **2FA present, not mandatory**; the owner decides (§59 answer 31) |
| 22 | F #28: lawyer review of policy pages | **No lawyer required**; Claude drafts, the owner edits from the backend (§59 answer 28) |
| 23 | F #29: pre-order advance capped at 10% | **Percentage per product**, defaults present (§59 answer 29) |
| 24 | C4.2 / C4.6: FAQPage schema as a rich-result lever | **FAQ rich results ended for all sites on 7 May 2026**; FAQ content stays, markup optional (PR 224) |
| 25 | Google traffic plan F2/N6: drop third-party brand names; schema `brand` always EXTAS | **Brand names stay**; each product has a real brand field (EXTAS only for own-label); the "other brand" warning is a setting, off (PR 590, Note 27.3) |
| 26 | D3.12: return/exchange charge sentence on checkout | **Return note on the thank-you page and My Account → Orders only, not on checkout** (owner ruling, PHONE-REVIEW 18 Oct). The door note and trial-at-the-door line stay on checkout |
| 27 | PR 244: owner approval queue per post | **Topic-list approval**, posts approved by a second author agent, never the writer (PR 244 as updated, PR 591, 593) |
| 28 | B7.5: user manual in plain Bengali | **Simple English and Bengali** (admin is English by default with a Bengali switch) — PR 599, PR 503 |
| 29 | PR 117: Dhaka gazetteer of 140+ areas | **National gazetteer** (PR 549); the Dhaka list is part of it |
| 30 | V1 A1.6: plan sized for ~409 PRs | 600 PRs; the timeline is not re-derived in V2 (see A1.6 V2 block) |
| 31 | Register PR 574 line: "B2 sizes editable in the bag (default)" (filed ~05:00) | **B5 is the default** (B2 behaviour with 1–2 combos, one compact line from 3): the ranking applied it at ~09:00 and the owner said to keep the current defaults at 11:39 (Note 23.16). The register line should be updated to match (Prohori) |
| | **V2.1 · CN-001 (owner server spec, 19 Oct 23:33)** — the owner said: where two decisions conflict, take the best one | |
| 32 | A2.8 / A2.5 item 7: backups to Google Drive only, "no Azure Blob" | **Azure Blob + Google Drive.** Blob: WAL/point-in-time, daily full, soft delete, versioning/immutability, media; Drive stays mandatory (daily encrypted off-site copy; add-only Drive = third copy); restore defaults to Blob, Drive fallback (owner's answer, Note 48; PR 8) |
| 33 | Owner spec §2: Node app with PM2 or similar | **Docker Compose stays** — per-container RAM/CPU limits, auto-restart, zero-downtime rolling/blue-green deploys with rollback; one setup that runs the same on any server (PR 4; Claude's decision, delegated) |
| 34 | Owner spec §2: Nginx as the reverse proxy | **Caddy stays** — automatic SSL renewal, HTTP/2/3, compression; Cloudflare in front in Full (strict) (PR 7) |
| 35 | Owner spec §6.2: site search index in Postgres | **Meilisearch stays** for site search (Bengali and English typos); Postgres `pg_trgm` only for fraud fuzzy matching (PR 72, 519, 603) |
| 36 | Owner spec §5: stock cached 15–30 s | **Display cache 15 s**, purged by every stock event; **add-to-bag and checkout read live stock with a row lock** — nothing oversells (PR 602, 198) |
| 37 | Owner spec §3.2: image ratio "3:4 or 4:5" | **4:5** on every size (already decided in V2; PR 22) |
| 38 | A2.1–A2.3 / Note 47: one 2 TB Premium SSD | **OS 128 GB + a separate 1 TB (P30) data disk with LVM** — a disk can grow, never shrink (PR 1) |
| 39 | Owner spec §12: monitoring page, speed measurement and report pre-computation "later" | **All before go-live** (owner's answer: finish all server work at once); schema-dependent items built with their stage and marked pre-launch required (A2.9.16) |
| 40 | A2.5: NSG port 22 restricted to the owner's IP only | **Key-only SSH, no root login, fail2ban; 22 open in the NSG and UFW** — the build agents connect from changing IPs (PR 3) |

**Register wording notes (no scope effect, for Prohori to tidy):** the register sub-heading "How this reached 582"
now ends at 600; the line "total stays 569" in the round-15 scope paragraph is a leftover; PR 570's heading says
"round 15 note 17" while ROUND15 files it under Note 14 (Note 21 sets its standard). PR 577 still says "six fixed
agents" (seven since PR 581). The header says "594 are built"; in the register "built" means **filed and specified**,
not coded. **V2.1:** the register header now reads "598 are active" (filed and specified, not coded).

---

## Owner rulings and standing instructions in force (to 19 Oct, 23:33)

| Ruling | Source |
|---|---|
| Brand names stay in product names; real brand field per product; owner accepts the trademark risk | Note 27.3 · PR 590 |
| Marketing consent: SMS tick on, WhatsApp tick separate and off | Note 23.1 |
| Default messages: 2 SMS + 1 WhatsApp per order, nothing after | Note 4.7, 23.2 |
| Trial at the door allowed (setting, on) | Note 23.9 |
| Barcodes internal / courier; no GS1 | Note 23.10 |
| VAT and invoice format after launch with the accountant; backend must have no gaps | Note 23.11 |
| Same size twice: "already in bag"; quantity +1 as an option | Note 23.13 |
| Sliders keep auto-drift, snap after a hand drag; desktop resumes the moment the mouse leaves | Note 23.12, 39 |
| Combos never deleted; offers end into an archive; URLs never die | Note 25 |
| "Use in combos" ticked on a new product, as an option | Note 23.5 |
| An ad budget approval above the daily ceiling stays blocked until the ceiling is raised | Note 23.7 |
| Admin shows full phone numbers; views and copies logged | Note 24.1 |
| English pages first; Bengali at /bn; WordPress links 301 | Note 27.1, 27.2 |
| Blog quality is the agents' job; the owner approves topics only | Note 28.3 |
| Desktop gets its own treatment; phone must not change | Note 34.2 |
| Side canvas will be turned on; master switch stays (off = today's look) | Note 37.1 |
| Everything dynamic, with guardrails (grid, not pixels) | Note 41.1 |
| Fix every bug without asking; for design choices pick one, apply it, keep 2–3 pictures | Note 4 (03:34) |
| Answers and picture labels in simple Bengali | Note 5.0 |
| Nothing the owner asks to remove is deleted — it becomes a switch, off by default | standing (lessons/ALL.md) |
| Nothing hardcoded; the owner's own data never ships to another installation | standing · PR 494, 509 |
| The same fixed agents from design to the live dashboard; skills never re-taught | Note 15.2 |
| Thank-you page password line stays as is (alignment only) | PHONE-REVIEW 18 Oct |
| Pause site builder and side-canvas extensions until the code phase | Note 44.1 |
| New VPS; we open the ports; keys later in the backend; Drive backup + Telegram before go-live | Note 45 |
| Later changes go through the register, change notes and versioned blueprints; no GitHub needed by the owner | Note 46 · PR 594 |
| Server fixed: Azure E8ds_v6, Southeast Asia, Ubuntu Server 24.04 LTS Gen2, OS 128 GB + 1 TB data disk; the owner keeps the .pem and adds our public key | Note 48 · CN-001 · PR 1 |
| Backups to Azure Blob + Google Drive; Google Drive stays mandatory; monthly automatic restore test | Note 48 · PR 8, 395, 507 |
| All server work finished before go-live — nothing from the server spec deferred | Note 48 · A2.9.16 |
| Where two decisions conflict, take the best one (server spec) | Note 48 |

---

## How changes are made after V2

*Owner, 19 Oct 22:54 (Note 46). Source: `review/CHANGE-PROCESS.md` (Bengali) and the PR 594 register line.
This is part of PR 594. It applies while the code is being written, after go-live, and months later.*

**One source of truth.** The master register (what each PR does) and the blueprint (this file and its later
versions) are the only sources. From the first code day both live in the repository's **`docs/`** folder,
next to the code. Every deploy regenerates the admin's **PR register** and **Blueprint & files** tabs from them
(PR 594), so the owner never has to open GitHub. **The build agent re-reads the register before every PR**, so
whatever is in the register is what gets built, and nothing is lost between chats.

**1. A new idea while the code is being written**

1. The owner says it in chat, writes it in the PR register's **"request a feature / request a change"** form, or
   sends it on Telegram to the chief (Gyani, A360-01).
2. Gyani first checks whether it is **scope on an existing PR**. If it is, that PR gets a dated "updated" entry.
   Only if no PR covers it does it take the next free PR number (the register's rule: no new PR without need).
3. A **change note** is written, numbered **CN-001, CN-002 …**: what was asked (in the owner's words), which PR,
   which stage, the owner's decision, the date.
4. Where it is placed:

| The affected part is … | Placement | Effect on running work |
|---|---|---|
| A PR **not built yet** | Added to that PR's scope; the agent builds it with the new instruction when it gets there | None |
| A PR **already built** | Goes on the **change queue**; picked up after the current wave ends | Nothing breaks mid-wave |
| An **urgent bug** | A separate small PR at once | Fixed now |

5. The blueprint version moves forward: **V2 → V2.1 → V2.2 …**, each with a dated change log at the top.
6. The admin's "What's new" tab and the bell show which PRs were added or updated.

**2. After go-live.** The same path, with two more steps:
- The change is built and tested on **staging** (a separate test copy) first, through the full gate in
  Appendix C: phones, tablets, desktop, and the before/after phone pixel comparison.
- Only after it passes is it deployed; if something goes wrong, **one-step rollback** to the previous version
  (A1.5 gated deploy, PR 391–403).
- Layout, text, offer and menu changes the owner makes himself in the site builder or the on-page edit mode
  (PR 598, 600) need **no PR**; they are kept in those tools' version history only.

**3. A large new plan six months later**

1. The owner raises it in any chat. Whether or not that chat remembers anything, the register and the latest
   blueprint are in `docs/` (and downloadable from the admin), and work starts by reading them.
2. The plan is filed as new PRs (or a new stage) in the register; PR 594 shows by itself which earlier PRs it
   builds on.
3. The code gets a **small brief file** for that work only (for example "V2.7" or "Wave X brief"). The whole
   blueprint is not rewritten, but the main blueprint's version is bumped at the same time.
4. When the work is done, each PR's status becomes "built" (in code / live) with its date in the admin.

**In one line:** idea → register (scope on an existing PR, or a new PR) → change note CN-### → placed in the
right queue → built and tested → new blueprint version → visible in the admin. At no step does the owner need
to read code or open GitHub.

**First change note:** **CN-001** = the owner's server specification, 19 Oct 23:33 (V2 → V2.1): register PR 601–604, dated scope on PR 1–10, 13, 18, 22, 24, 37, 72, 88, 234, 362, 395, 423, 507 and 519, and the new section A2.9.

---

# Part A · Platform, server and architecture

> **V2 · 19 Oct — what changed in Part A.** A1.1 rule 2 is replaced (permissions in two steps, Note 45.3).
> A1.2 is narrowed to IP + SSH key + GitHub. A1.4's three build lanes are replaced by the seven fixed agents (C10).
> A2.1–A2.4 describe the old Azure VM and are replaced by the new VPS (Note 45, PR 1–3). A3 gains the optional-ERP
> seam (PR 497–499). A6's single-file rule is replaced by versioned files (PR 594). New **A7** carries the settings
> framework (PR 491–496, 500, 508–510).
>
> **V2.1 · 19 Oct 23:33 — what changed in Part A (CN-001).** The machine is fixed (Azure E8ds_v6, Southeast Asia, Ubuntu Server 24.04 LTS Gen2, OS 128 GB + 1 TB data disk). The full server specification is the new **A2.9**; A2.6's split is updated; A2.8's "Drive only" is superseded by Blob + Drive; the "re-size to the new VPS" note is struck. Day-1 access changes: the owner adds our public key to the VM himself (A1.1, A1.2 V2.1 blocks).


## A1. How this build runs


> **CN-004 · 20 Oct 2026 02:01 (owner).** Agent profiles, skills, curriculum and lessons changed in the site's AI panel (PR 577, 585) are also exported to GitHub at `docs/agents/live/<agent>/` (one-way, dated, retried on failure). No new PR.


> **CN-003 · 20 Oct 2026 01:30 (owner + test).** (1) **Server access:** cloud Claude sessions cannot open SSH (port 22) to the VM — tested. So the build reaches the server through a **GitHub Actions self-hosted runner on the VM** (label `extas-vm`), installed once by the owner via Azure *Run command* (`docs/owner/RUNNER-SETUP.md`, `infra/bootstrap/install-runner.sh`); S0A and deploys are workflows; no SSH key is exchanged. This replaces the "owner adds our public key" step of A2.9.2. (2) **Domains:** the old WordPress shop stays live on extas.com.bd until go-live; the build deploys to **new.extas.com.bd** (password + noindex) and A1.5's "every merge deploys to production" means this staging host until the go-live switch (S19, PR 587, 301 for every old URL), which needs the owner's explicit word. (3) **Repo:** the build runs in the private repo `Extas-Ecommerce-Site`; `CLAUDE.md` + `docs/START-HERE.md` are the entry; this blueprint lives at `docs/BLUEPRINT.md`. (4) 4-piece tier prices stay as the demo default (owner 01:27); he edits them in the admin.

These are operating rules for the build agent. They are the owner's standing instruction, settled and
not to be re-opened. An agent that asks the owner to review code is breaking the rules, not being careful.

### A1.1 The rules — Locked

> **V2 · 19 Oct 22:44 — rule 2 replaced (Note 45.3).** Permissions now come in **two steps**:
> - **Day 1 (code start):** the new VPS's IP, an SSH key, and GitHub access. Nothing else.
> - **Later, by the owner himself:** every other key and account (Google Drive backup, Telegram bot, payment,
>   courier, SMS, AI providers, ad platforms, Search Console …) is typed into the backend's credential vault and
>   Integrations screen (PR 493, 500), each with a Test button. Until a key arrives, its feature runs on the mock
>   (A1.3).
> - **Go-live gate:** the site does not take real orders until the **Google Drive backup** (PR 8, 395, 507) and the
>   **Telegram alerts** (PR 9) are live and tested.
> Rules 1 and 3–9 are unchanged. The owner never reviews code, and the build never waits on him.

> **V2.1 · 19 Oct 23:33 (CN-001).** Day 1 is now: the VM's IP, **our public key added by the owner** under the VM's Reset password → Reset SSH public key (separate username for the build agent; he keeps his own .pem; no private key in chat), and GitHub access. **Go-live gate** adds the **Azure Blob backup** (WAL/point-in-time and daily full) next to the Google Drive backup, plus the first monthly restore test passed, and every server item of A2.9 (A2.9.16).


1. **The owner is not a coder. He does not review, check or merge pull requests.** His approval on a code
   change means nothing and must not be asked for.
2. **[Replaced on 19 Oct 22:44 by permissions in two steps — see the V2 block above (Note 45.3).]** ~~One single permission collection at the very start.~~ Before any code is written, the build agent asks
   once for everything it will ever need, in one sitting, as one list: GitHub repository and token, domain,
   Cloudflare, SSL, Azure VPS access, database, object storage, Google Drive, Telegram bot, and the API keys
   that already exist. After that sitting it never asks again.
3. **The agent creates the PR, tests it, and merges it itself.** It does not wait for a human. All permissions
   are granted up front precisely so that it does not have to.
4. **It never stops for approval mid-wave.** It works through the stages in order, from zero to the end.
5. **When a usage limit is reached it stops, and when the limit resets it picks up exactly where it left off.**
   No restart, no lost context, no human needed. `PROGRESS.md` records the exact stopping point every time.
6. **The owner's computer may be off.** Nothing in the build depends on his machine being awake.
7. **The only stop is a wave boundary.** At the end of Wave 1 the agent reports: "Wave 1 is complete. Shall I
   start Wave 2?" — yes or no. If the answer does not come, it waits; when he says yes later, it continues
   from there. It never skips a PR and never silently jumps between waves.
8. **Quality is the agent's own responsibility.** Tests, Lighthouse budgets, type checks and the staging checks
   must pass before a merge. If something cannot be resolved it is written into `BLOCKED.md` and the agent
   moves to the next PR. It does not sit waiting.
9. **The owner's routine:** he wakes up, looks at what was built, and says yes or no to anything that genuinely
   needs him. The build never waits on that.

### A1.2 What the owner hands over for the server, and nothing more — Locked

> **V2 · 19 Oct 22:44 (Note 45).** On the new VPS the owner gives **the IP and an SSH key** (chosen when the
> VPS is created). We create the non-root deploy user ourselves and **open ports 22/80/443 ourselves**: the server
> firewall over SSH, and the provider's cloud firewall either through its panel with the owner's login or by
> step-by-step guidance (PR 3). The owner installs nothing.

> **V2.1 · 19 Oct 23:33.** The machine is an Azure VM (E8ds_v6). The owner creates it with "Generate new key pair" following `review/AZURE-VM-GUIDE.pdf`, ticks 22/80/443 in the NSG, and gives us the IP; on code day 1 he adds our public key (A2.9.2). The owner still installs nothing.


For server matters the owner supplies **the IP, the sudo username, and the SSH key or password**. That is the
whole list, once, forever. The build agent does everything else from there and must not come back to him for
server work.

(The two places this is written in the source are consistent in substance: §38.1 names "three things only —
the IP, and the SSH key or password"; §40.3 item 5 spells the three out as IP, sudo username, and SSH key or
password. Treat the §40.3 wording as the operative list.)

### A1.3 Nothing is ever blocked waiting for a credential

> **V2 · 19 Oct.** Unchanged in principle. The Activation Center's items are entered by the owner in the
> Integrations screen and vault (PR 500, 493), never in code or Git. Two items are go-live conditions, not
> optional: Google Drive backup and Telegram alerts (A1.1 V2 block). The long-lead items to start early are listed
> in Appendix B (Google Ads developer token, Meta business verification, bKash/Nagad/SSLCommerz, SMS masking, DBID).


Every integration is built with a **mock** that works from day one, behind the adapter framework (PR-007,
mock / sandbox / live, test-connection) and its full implementation (PR-198). The shop goes live on mocks and
sandboxes, and each service switches to live the day its token arrives. An earlier claim that bKash or SMS
approval would delay go-live was wrong and is withdrawn.

The **Activation Center** makes this visible. It is a **temporary section** in the dashboard, fully built front
end and back end. It lists every pending item with what it is, why it is on hold, exactly what to paste or
upload, and a Test button. The items are: bKash, Nagad, SSLCommerz, SMS gateway and masking sender ID,
WhatsApp Business API, Messenger / Facebook page, email and SMTP, Steadfast, Pathao, Barikoi, Google Maps,
Meta / Google / TikTok ad accounts, Search Console, Bing, Google Drive, Telegram, the AI providers (Anthropic,
OpenAI, Google, image and video providers), ERP sync endpoints, DBID and trade licence.

- When an item is completed and tested, **it disappears from the list by itself.**
- When the last item is cleared, **the Activation Center removes itself from the dashboard.**
- Until then the feature behind each item runs on mock or sandbox, and its UI is already finished and waiting.

### A1.4 Parallel agents — the owner does nothing

> **V2 · 19 Oct — lanes A/B/C replaced by the seven fixed agents (PR 577, 583).** Each stage has one owning
> agent (Part E, E0 table; C10). The owner's standing rule stays: **2–3 agents build at once** on separate
> worktrees, more only when he asks (Note 29.1). Days 1–2 are still one agent alone on S0A, S00 and the complete
> schema skeleton, now including the settings framework (PR 491–492 cannot be retrofitted). The single-owner rule
> for shared files stays; Gyani names each shared file's owner at kickoff (recommended: Prisma schema → Prohori as
> S00 owner; design tokens → Shilpi; routing table → Sawdagor). The "~110–140 PRs each" load figure is replaced by
> the per-stage counts in E0.


The owner does not manage agents. Part 0 of the blueprint carries the parallel plan, and the lead session spawns
and coordinates the others on separate git worktrees.

- **Days 1–2: one agent alone.** S00 Foundation plus the **complete Prisma schema skeleton for every stage**,
  so that no agent ever fights another over a migration. This is the single most important rule for parallel work.
- **From day 3: three agents**, each owning whole stages end to end, grouped so they do not touch the same files.

| Agent | Scope | Stages owned |
|---|---|---|
| **A** | Commerce spine | S01, S04, S05, S07, S08, S09, S14, S20 |
| **B** | Storefront and content | S02, S03, S06, S10, S11, S12, S17, S18 |
| **C** | Intelligence and studio | S15, S13, S22, S23, S24, S25, S16, S21, S19 |

Rules that keep them from colliding:

- One agent owns a stage completely.
- **Shared files — the Prisma schema, the design tokens, the routing table — are changed only by Agent A.**
  The others request a change through Agent A.
- Each agent runs the full test suite before merging.
- A defined merge order.
- A nightly integration run across all three branches.

Load is roughly 110–140 PRs each; the final blueprint balances the split.

### A1.5 Continuous deploy — live the moment it is merged

> **V2 · 19 Oct.** Before real orders: Drive backup and Telegram alerts must be live (A1.1 V2). Once real orders
> start, the gated deploy also runs the QA gate in Appendix C (device gate 0 failures, journeys, phone pixel-diff
> for desktop-only changes). After go-live every change goes staging → gate → deploy, with one-step rollback
> (see "How changes are made after V2").


- **During the build, while there are no real customers: every merge deploys straight to production.** The site
  is live from day one and grows hour by hour. Nothing waits.
- **Once real orders start: the same automatic deploy, but gated.** Tests, a smoke run of the customer journey,
  and the Lighthouse budget must all pass. If any fail, the deploy is refused. If something degrades after a
  deploy, it rolls back by itself. Still no human in the loop, but a broken build never reaches a paying customer.
- `PROGRESS.md` and the daily Telegram report say what went live that day.
- This pipeline **replaces** the manual production promotion that was in PR-205.

### A1.6 The one-month plan and the timeline

> **V2 · 19 Oct.** The plan is now **594 active PRs** (600 filed, 6 parked), not ~409. The V1 turn model is not
> re-derived here; scaled linearly (594 × ~22 turns × 1.35) it gives about 17,600 turns, so treat the V1 timeline
> as a lower bound. **Plan tier answered 18 Oct: Max 20x is already taken (§59 answer 32).**
> **V2.1 · 19 Oct 23:33:** 598 active PRs (604 filed, 6 parked).


Scale: roughly **409 PRs across 27 stages**. The timing model assumes ~400 PRs × ~22 turns = 8,800 turns, plus
35% for retries, test failures, rebuilds and deploys ≈ **11,900 turns**.

| Setup | Throughput | Whole system live |
|---|---|---|
| **Max 5x**, one session, 24/7 | ~380 turns/day (~2,700/week) | **4–7 weeks, typically ~5** |
| **Max 20x**, one session, 24/7 | ~600–720 turns/day — session-bound, not limit-bound | **2.5–4 weeks, typically ~3** |
| **Max 20x**, 2–3 parallel agents on separate worktrees | ~1,200–1,500 turns/day | **1.5–2.5 weeks, typically ~2** |

A single agent can only produce roughly 25–40 turns an hour, so one session cannot spend a 20x allowance.
**20x only pays for itself when 2–3 agents run in parallel on different stages** — which is why the parallel
plan in A1.4 exists.

**First site live (Wave 1, ~80 PRs ≈ 2,400 turns with overhead):** Max 5x ~6 days · Max 20x single session
~4 days · Max 20x parallel ~2 days. The owner's "live within 7 days" is achievable on either plan.

**On Max 20x with three agents:** 11,900 ÷ ~1,500 a day ≈ 8 days of pure throughput; with integration, deploys
and blocked items, **2–3 weeks**. **One month on Max 20x is comfortable, with about a week of buffer.** Wave 1 —
a working shop — lands in the **first 2–4 days**.

**Recommendation on record: Max 20x.** It finishes in about 3 weeks instead of about 5, or about 2 weeks with
parallel agents, for $100 more a month over a one-to-two month build. Drop back to 5x once the build is done.

**Honest caveat, to be carried into the blueprint:** these are calculated estimates, not guarantees. Prompts per
window vary with codebase size, Anthropic may apply additional caps, and external approvals — bKash, Nagad, the
SMS masking sender ID, courier APIs, DBID — run on their own timetable regardless of build speed.

### Open — needs the owner's decision

- **[Answered 18 Oct: Max 20x already taken — §59 answer 32.]** **Plan tier:** do you want to run the build on **Max 20x** (about 2–3 weeks with three parallel agents) or stay
  on **Max 5x** (about 5 weeks)? One word is enough.

---

## A2. Server foundation (S0A) — runs first, before any application code

> **V2.1 · 19 Oct 23:33 — the machine is fixed (CN-001, Note 48; full specification in A2.9).** A new **Azure VM, E8ds_v6** (8 vCPU, 64 GB, 440 GB temporary NVMe), **Southeast Asia**, **Ubuntu Server 24.04 LTS x64 Gen2** (not Pro), OS disk 128 GB Premium SSD + a separate **1 TB data disk** with LVM. The size is confirmed, so nothing is re-sized. Backups go to **Blob + Drive**. Four new PRs: 601 and 604 here in S0A (S0A now 12 PRs), 603 in S00, 602 in S02. The V2 block below stays as the record of 22:44; where it says "VPS" read "the new Azure VM".

> **V2 · 19 Oct 22:44 — new VPS (Note 45; register S0A PR 1–3 updated).**
> - The shop runs on a **brand-new VPS created fresh with Ubuntu 24.04 LTS**. It is **not** the Azure E8ds v4 VM.
>   Its specs come from the owner's configuration screenshot (Appendix B, day-1 data).
> - **PR 1:** record the new machine's specs from the screenshot; take a provider snapshot or backup before any change.
>   The "Azure package must not change" rule applies to the old VM only.
> - **PR 2:** no in-place upgrade. Verify the Ubuntu 24.04 LTS version and apply all updates.
> - **PR 3:** base hardening (SSH keys only, no root login, fail2ban, unattended security updates, UFW). **Ports
>   22/80/443 are opened by us**: server firewall over SSH, provider cloud firewall via its panel or guided steps.
> - **PR 4–10 unchanged** (Docker, PostgreSQL, Redis/BullMQ, Caddy, Drive backup, monitoring to Telegram, k6
>   baseline). ~~PR 5's tuning is written for 8 vCPU / 64 GB in the register; it must be **re-sized to the new
>   VPS's real CPU, RAM and disk** once the screenshot arrives (A2.6 already keeps all values in one config file).~~
>   **[Replaced 19 Oct 23:33 (V2.1, CN-001): the size is confirmed — E8ds_v6, 8 vCPU / 64 GB — so no re-size is pending; PR 4–10 now carry the owner's server spec (A2.9).]**
> - Sections A2.1–A2.4 below are kept as the record of the old VM and tagged "Replaced".


**Locked.** The server is set up and fully optimised **before** the e-commerce build starts. The order in the
blueprint and in execution is: **Part 0 rules → S0A Server Foundation → S00 Foundation → the rest of the waves.**
The build agent does not write a line of application code until S0A's checks pass.

The server is not a side topic. The build agent has to build, deploy, tune, secure, back up and monitor the box,
so all of that lives in the one blueprint file. An earlier note that moved server work out to a separate
discussion (§36.7) was a misreading and is **withdrawn**. What genuinely belongs in a separate conversation is
only the owner's own hands-on questions — which button in the Azure portal, how to SSH, day-to-day admin — and
with the one-time permission handover in A1.2 there is very little of that left for him to do by hand.

### A2.1 The machine the owner already has

**[Replaced 19 Oct 22:44 — new VPS. This table describes the old Azure VM only; see the V2 block under A2.]** **[V2.1, 19 Oct 23:33: the new machine is Azure E8ds_v6 in Southeast Asia, OS 128 GB + a 1 TB data disk — A2.9.1.]**


| Item | Value |
|---|---|
| Size | Standard **E8ds v4** |
| CPU / RAM | **8 vCPU / 64 GB** |
| OS disk | **Premium SSD LRS, 2048 GiB** (7,500 IOPS, 250 MB/s) |
| Data disks | **None** |
| OS | **Ubuntu 20.04** |
| Region | **West India** |
| Billing | Pay-As-You-Go |

### A2.2 Assessment of that machine

**[Replaced 19 Oct 22:44 — new VPS. The assessment applies to the old Azure VM only. Its general requirement (4–8 vCPU, 16–32 GB RAM, fast disk, media on object storage behind a CDN, no GPU) still guides the new VPS check in PR 1.]**


What has to run on one box: the Next.js app, the BullMQ worker, PostgreSQL, Redis, Meilisearch, Caddy, and local
image processing with sharp. Image and video generation are hosted APIs, so **no GPU is needed**. A comfortable
requirement is 4–8 vCPU, 16–32 GB RAM, ~256–512 GB of fast disk, with media on object storage behind a CDN.

**Verdict: the CPU and memory are more than enough — roughly double what is needed, which is good headroom for
sale-day spikes and parallel image jobs. Nothing needs upgrading for performance.**

Four real problems were identified, and each has an answer that does not change the Azure package:

| # | Problem | How it is handled |
|---|---|---|
| 1 | **Ubuntu 20.04 is past its standard support window** | In-place release upgrade 20.04 → 22.04 → 24.04, done by the build agent (A2.4). Fallback: Ubuntu Pro ESM on 20.04. |
| 2 | **Everything on one 2 TB OS disk, no data disk** — database, Docker, uploads and OS share one volume, so one of them filling up takes the whole machine down | **LVM volumes** carve the 2 TB so `/var/lib/postgresql`, `/var/lib/docker`, `/srv/uploads` and `/var/log` cannot starve each other (S0A PR 3). |
| 3 | **2 TB Premium SSD is genuinely wasteful** — roughly $240 a month for space the plan does not use, because media lives in object storage behind Cloudflare. 256–512 GB would do the same job, but **Azure cannot shrink a managed disk** | **Accepted as a cost.** The owner has decided the package does not change, so the disk stays. |
| 4 | **Single VM, no redundancy** | Acceptable to start. It makes the backup and the tested one-command restore the thing that actually protects the business — which is why both are inside S0A, not left to later. |

### A2.3 The Azure package must not be changed — Locked

**[Replaced 19 Oct 22:44 — new VPS. Applies to the old Azure VM only (register PR 1).]**


**E8ds v4, 8 vCPU, 64 GB, the existing 2048 GiB Premium SSD — all kept exactly as they are. No resize, no new VM,
no new disk, no change of region.**

The earlier "recommended production build" (a fresh Ubuntu 24.04 VM on v5 silicon, 128 GB OS disk plus a separate
256–512 GB data disk, possibly downsizing to 4 vCPU / 32 GB) is **superseded by this decision and is not to be
built.** It is recorded here only so nobody re-proposes it. The useful parts of it that do not touch the package —
Accelerated Networking on, swap, a locked-down NSG, LVM separation — are all carried into S0A below.

### A2.4 The OS question, solved without changing the package — Locked

**[Replaced 19 Oct 22:44 — new VPS created with Ubuntu 24.04 LTS; no in-place upgrade (register PR 2).]**


Ubuntu 20.04 is past standard support, but a new VM is not wanted. The machine is empty, so the answer is an
**in-place release upgrade, 20.04 → 22.04 → 24.04**, performed by the build agent. The Azure package is untouched;
only the operating system inside it moves forward.

Safety rules for that upgrade:

- A **one-time Azure disk snapshot before the upgrade** — small, temporary, deletable straight afterwards. This is
  **the only Azure storage this plan asks for**, and whether to keep or delete it afterwards is the owner's call.
- Connectivity is verified after **every** step.
- If the upgrade cannot be completed, the fallback is **Ubuntu Pro ESM on 20.04** (free for up to 5 machines), so
  the box is patched either way.
- Nothing is lost on either branch, because nothing is deployed yet.

### A2.5 S0A — the ten PRs

> **V2 · 19 Oct — register numbering wins.** The register's PR 1–10 (A2 V2 block) is the build list. V1 items
> below that have no PR of their own are carried as scope: access and lock-down → PR 3; LVM volume separation, swap
> and free-space alarms (where the new disk allows) → PR 3/4; network and kernel tuning → PR 5; one-command restore
> proven on a throwaway machine → PR 8; `docs/SERVER.md` in Bengali and the optimisation-panel hooks → PR 10.
> Azure-specific items (Accelerated Networking, NSG, snapshot) apply only if the new provider offers them.
> **V2.1 · 19 Oct 23:33:** the new machine is Azure (E8ds_v6), so Accelerated Networking (on), the NSG (inbound 22/80/443) and a snapshot before changes all apply. LVM goes on the separate 1 TB data disk. The S0A build order is A2.9.16.


1. **Access and lock-down** — connect over SSH, create a non-root deploy user, keys only, password login off, root
   login off, ufw, fail2ban, unattended security upgrades, timezone Asia/Dhaka, hostname.
2. **OS upgrade** — snapshot, 20.04 → 22.04 → 24.04 in place, kernel update, reboot handling, verification at each
   step, documented fallback to Ubuntu Pro ESM.
3. **[V2.1: LVM on the separate 1 TB data disk, not a 2 TB OS disk — A2.9.1]** **Disk layout** — LVM carves the 2 TB into separate volumes for `/var/lib/postgresql`, `/var/lib/docker`,
   `/srv/uploads` and `/var/log` so none can starve another; filesystem tuning (`noatime`); **16 GB swap**; fstab;
   free-space alarms per volume.
4. **Network and kernel tuning** — Accelerated Networking confirmed on; sysctl for connection backlog, file
   descriptors, `vm.swappiness`, transparent huge pages off for PostgreSQL; ulimits.
5. **Runtime** — Docker and Compose, daemon config with log rotation, Caddy with automatic HTTPS, Cloudflare DNS
   and proxy, origin certificate, HTTP/3.
6. **Tuning profile for 8 vCPU / 64 GB**, all values in one config file (see A2.6).
7. **Google Drive backup** — service account; nightly database, uploads and the blueprint file; encrypted;
   retention rules; and the monthly blueprint snapshot from A6.4. ~~**Azure Blob removed entirely.**~~ **[Replaced 19 Oct 23:33 (V2.1): Azure Blob is added — Blob + Drive, A2.9.12, PR 8.]**
8. **One-command restore, actually tested** — rebuild everything on a throwaway VM from the Drive backup, prove it
   works, then destroy the test VM. A restore that has never been run is not a backup.
9. **Monitoring from day one** — metrics, disk, memory, CPU, service heartbeats, Telegram alerts, all wired
   **before** the application exists, so the foundation is watched from the first hour.
10. **Baseline benchmark and runbook** — a k6 load test against a trivial app to record this machine's ceiling, so
    every later change can be measured against it; plus `docs/SERVER.md` **in Bengali**; plus the server-side hooks
    that the dashboard optimisation panel (PR-208) calls. *(V2.1: "PR-208" is V1 numbering; in the register this panel is the S21 Server page, PR 423 — register PR 208 is the Smart Rules engine.)*

Everything else the agent must do on the server is inside these ten PRs or in S19 / S21: Docker build, Azure VPS
provisioning, OS choice, disk layout, swap, Accelerated Networking, NSG rules (80 and 443 open, 22 restricted to
the owner's IP only), SSH hardening, firewall, fail2ban, unattended security upgrades, Caddy and HTTPS, DNS and
Cloudflare CDN, the deploy pipeline with automatic rollback, backups, one-command restore on a fresh VM,
monitoring and alerts, the optimisation panel, load testing, performance tuning, Server Health with the
performance budget, and the go-live checklist.

> **V2.1 · 19 Oct 23:33:** port 22 is **not** restricted to the owner's IP — SSH by key only, no root login, fail2ban, because the build agents connect from changing IPs (resolved conflict 40; PR 3).

### A2.6 The tuning profile, sized to this exact box

> ~~**V2 · 19 Oct.** These values are sized for 8 vCPU / 64 GB (the old VM). Re-size them to the new VPS from the
> owner's screenshot (PR 1, PR 5); the one-config-file rule makes that a single edit.~~
> **[Replaced 19 Oct 23:33 (V2.1, CN-001): the size is confirmed — E8ds_v6, 8 vCPU / 64 GB. No re-size is pending.]**

> **V2.1 · 19 Oct 23:33 — the operative split (owner spec §2, PR 604; all values in one config file, never in code).** The V1 table further down is history.

| Service | RAM | CPU / setting |
|---|---|---|
| PostgreSQL | 16 GB | 2–3 CPU; `shared_buffers` 16 GB, `effective_cache_size` 40 GB; PgBouncer in front; temp on NVMe; slow query log |
| Redis | 6 GB | 1 CPU; `maxmemory` with LRU eviction |
| Meilisearch (site search) | 4 GB | — (added; missing from the owner's table) |
| Node / Next.js app | 16 GB | 4–6 CPU; 6 replicas |
| Image / video worker | 6 GB | 2 CPU; separate process, queue-based |
| Background jobs | 4 GB | 1 CPU |
| Caddy reverse proxy | 1 GB | 1 CPU |
| OS and the rest | 11 GB | never squeezed |
| **Total** | **64 GB** | |

The admin shows each service's RAM and CPU against its limit (PR 423). On a smaller server the hardware-aware profile computes these itself (PR 604, A2.9.15).


*V1 text and table (history; superseded by the V2.1 table above — Redis 2 → 6 GB, `effective_cache_size` 48 → 40 GB, 4 → 6 app replicas; new rows for the image/video worker, background jobs, Caddy and the OS reserve):*

With 64 GB and 8 vCPU confirmed, the build is tuned to the real machine rather than guessing. **All of these
values live in one config file so they can be re-tuned if the VM ever changes.**

| Component | Setting |
|---|---|
| PostgreSQL | `shared_buffers` **16 GB**, `effective_cache_size` **48 GB**, WAL and checkpoint settings tuned, **PgBouncer** in front |
| Redis | capped at **2 GB** with an eviction policy |
| Meilisearch | **4 GB** |
| Next.js | **4 app processes** |
| BullMQ worker | concurrency **4**, with **image jobs limited to 2 at a time** so a batch never starves the storefront |
| sharp | explicit memory limits |

**Rule:** all heavy work — the image pipeline, ERP sync, AI calls, courier booking — stays in the worker queue and
never runs in the request path. Disk throughput of 250 MB/s is ample once media is on object storage.

**Capacity on this box with Cloudflare in front: comfortably 50,000–150,000 page views a day and several hundred
orders a day** — far beyond what the shop needs at launch.

### A2.7 100% optimisation, and who watches it

The dashboard already carries the live optimisation and usage panel — **PR-208**: one-button optimise, plus live
page speed, query times, cache hit rate, queue depth, disk and memory. **S21 Server Health** carries the
performance budget and the Telegram alerts. Both are confirmed; nothing new is needed there. S0A PR 10 supplies
the server-side hooks that PR-208 calls, and the k6 baseline that every later change is measured against.

> **V2.1 · 19 Oct 23:33.** "PR-208" above is V1 numbering. In the register this panel is the S21 **Server page, PR 423** (scope filed 19 Oct 23:33: CPU/RAM/disk, each service against its limit, NVMe, up/down, cache hit %, slowest queries, last backups on Blob and Drive, CDN traffic, monthly speed results); register PR 208 is the Smart Rules engine and is unchanged. Telegram alerts: PR 9. All of it is pre-launch required (A2.9.16).

### A2.8 Backups — Google Drive only — Locked

> **V2 · 19 Oct.** Still Google Drive only. A **second, add-only Google Drive** holds a third copy (decided in
> curriculum wave 2, OWNER-PRECODE-CHECKLIST item 13). The owner enters the Drive credentials in the vault; the
> backup must be live before go-live (A1.1 V2). Restore of production needs a typed confirmation and runs on
> staging first (PR 396/507).
>
> **V2.1 · 19 Oct 23:33 — "Drive only" is superseded (CN-001, Note 48).** Backups now go to **Azure Blob + Google Drive**: Blob holds the continuous WAL archive (point-in-time restore), daily full backups and the media, with soft delete and versioning/immutability; Drive stays **mandatory** for the daily full encrypted off-site copy, and the second add-only Drive is a third copy. Restore defaults to Blob, Drive is the fallback. Full rules: A2.9.12, PR 8.


**[Replaced 19 Oct 23:33 by Blob + Drive — A2.9.12.]** ~~**Backups go to Google Drive. No Azure Blob. No second Azure cost.**~~ PR-206 is simplified accordingly, and the
earlier "Azure Blob and Google Drive" wording in §37.1 is superseded. The backup set is the database, the uploads,
and the blueprint file, taken nightly, encrypted, with retention rules. The monthly blueprint snapshot (A6.4)
rides on the same Google Drive target.

If the owner ever moves to a new VM, the go-live checklist says: **run the one-command restore. Nothing is rebuilt
by hand.**

### A2.9 Server specification — V2.1 · 19 Oct 23:33 (owner, CN-001) — Locked

> **V2.1 · 19 Oct 23:33.** The owner sent his server file (`review/SERVER-SETUP-SPEC-OWNER.md`, 13 sections in
> Bengali) at 23:15 (ROUND15 Note 47). It was analysed, and at 23:33 he approved every point and said: wherever two
> decisions conflict, take the best one (Note 48). Everything below is final and is the build list for S0A and the
> server-side parts of S00, S01, S02, S11, S19 and S21. **Where this section and A2.1–A2.8 disagree, this section wins.**
> Register: new **PR 601–604**; dated scope "Updated 19 Oct 23:33 (owner server spec)" on PR 1–10, 13, 18, 22, 24,
> 37, 72, 88, 234, 519 and in the register's scope block for PR 362, 395, 423 and 507. Change note **CN-001**.

#### A2.9.1 The machine

| Item | Value |
|---|---|
| Size | Azure **E8ds_v6** — 8 vCPU, 64 GB RAM, Intel (2025 generation) |
| Local disk | **440 GB NVMe, temporary** (raw after every stop — A2.9.4) |
| Region | **Southeast Asia** (Singapore) |
| OS | **Ubuntu Server 24.04 LTS x64 Gen2** — the plain image, not Ubuntu Pro. Trusted launch |
| OS disk | **128 GB Premium SSD LRS** |
| Data disk | **1 TB (1024 GiB) Premium SSD LRS (P30)**, separate, "delete with VM" **off**, **LVM** on it |
| Networking | Accelerated networking **on**. NSG inbound 22/80/443; UFW inside locks it further (A2.9.14) |
| Azure extras | Auto-shutdown **off** · Azure Backup **off** (backups are A2.9.12) · Boot diagnostics **on** (needed for the serial console) |
| Runs | EXTAS e-commerce, all three stores. The ERP stays on its own server |

- **2 TB → 1 TB.** The old "2 TB" note is replaced. The owner chose 1 TB on Claude's advice: a managed disk can grow
  later but never shrink.
- **Size confirmed.** The 8 vCPU / 64 GB tuning stands; there is no "re-size to the new VPS" step any more (A2 V2
  block and A2.6 V2 block are struck).
- **Cost note.** After 1–2 stable months, consider a 1-year Reserved Instance (roughly 30–40% saving). Blob storage is
  billed separately from the VM (A2.9.12).

#### A2.9.2 Access — no private key in chat

1. The owner creates the VM with **"Generate new key pair"** and keeps the `.pem` file himself.
2. On code day 1 we give him a **public key**. He adds it under the VM's **Reset password → Reset SSH public key**,
   with a separate username for the build agent.
3. No private key ever goes into chat. Step-by-step: `review/AZURE-VM-GUIDE.pdf`.

#### A2.9.3 Where each thing lives (owner spec §1)

| Place | Holds | Never holds |
|---|---|---|
| **Premium SSD data disk** (permanent, LVM) | PostgreSQL data; Docker volumes (and the app's images and release checkout); Redis persistence (AOF/RDB); logs that must be kept; config files; SSL certificates | — |
| **Azure Blob Storage behind Cloudflare** | **All media**: product images (the original archive and every processed size), video, banners, logos, generated PDFs, WhatsApp invoice JPGs; backup copies (A2.9.12) | — |
| **Local NVMe** `/mnt/nvme` (temporary) | Redis working cache; image-processing intermediates; Virtual Photoshoot and video studio rendering; Postgres `temp_tablespaces`; Next.js build and npm/pnpm caches; backup staging (zip, upload, delete); session and queue scratch | **The database, code, uploads, final backups, kept logs** |

**Images are never stored permanently on the VM disk.** Blob is cheap, grows by itself, pairs with the CDN, and the
pictures stay safe when the server changes.

#### A2.9.4 The NVMe is raw on v6 — the boot unit (PR 601)

On the v6 sizes the local NVMe comes up **unformatted** after a stop, deallocate, maintenance or move (Microsoft
documentation). So a systemd unit runs **at every boot, before Redis, Postgres and Docker start**, and:

1. detects the NVMe device;
2. formats it ext4 if it is not already formatted;
3. mounts it at `/mnt/nvme`;
4. creates the folder layout (Redis cache, image work, studio render, Postgres temp, build and pnpm caches, backup
   staging, scratch);
5. sets ownership.

Redis, Postgres and Docker **wait for this unit to succeed** (systemd `Requires=`/`After=` ordering). **Admin:** an
NVMe card shows whether it is mounted, the free space and which services use it (Server page, PR 423). A Telegram alert
fires if it is missing (PR 9).

#### A2.9.5 RAM and CPU split (PR 604) — one config file, never in code

| Service | RAM | CPU / setting |
|---|---|---|
| PostgreSQL | 16 GB | 2–3 CPU; `shared_buffers` 16 GB, `effective_cache_size` 40 GB |
| Redis | 6 GB | 1 CPU; `maxmemory` with LRU eviction |
| **Meilisearch** (site search) | 4 GB | — (missing from the owner's table; added) |
| Node / Next.js app | 16 GB | 4–6 CPU; **6 replicas** |
| Image / video worker | 6 GB | 2 CPU; separate process, queue-based |
| Background jobs (courier sync, e-mail, reports) | 4 GB | 1 CPU |
| Caddy reverse proxy | 1 GB | 1 CPU |
| OS and the rest | 11 GB | never squeezed |
| **Total** | **64 GB** | |

- Heavy image and video work **never runs in the web process**: it goes to the worker through the queue, so one person
  uploading ten photos never slows another customer's page.
- The admin shows each service's RAM and CPU against its limit (PR 423).
- The owner's table had Redis at ~8 GB and the worker at ~8 GB; they are 6 GB each so that Meilisearch's 4 GB fits
  inside 64 GB without touching the OS reserve.

#### A2.9.6 Runtime — Docker Compose and Caddy stay (Claude's decision; the owner delegated it)

- **Docker Compose stays (not PM2).** Each service has its own container with RAM/CPU limits and auto-restart.
  Deploys have **zero downtime**: rolling or blue-green with health checks, and automatic rollback (PR 4).
- **Caddy stays (not Nginx).** Automatic SSL renewal, HTTP/2 and HTTP/3, compression (PR 7). Cloudflare sits in front
  in **Full (strict)** mode with an Origin certificate.
- **Why both:** one setup that runs the same on any server — which is what the handover needs (A2.9.15).

#### A2.9.7 Images (owner spec §3; PR 22, 24, 37, 88) — required from launch

| Name | Width | Where it is used |
|---|---|---|
| thumb | 160 px | bag, search suggestions, order list |
| card | 400 px | category grid on a phone |
| card2x | 800 px | the same grid on a sharper screen |
| main | 1200 px | product page main image |
| zoom | 2000 px | zoom |

- **Ratio 4:5** on every size (already decided in V2; the owner's "3:4 or 4:5" resolves to 4:5).
- **Three formats each:** AVIF, WebP, JPEG, served with `<picture>`/srcset — the browser takes the best it can read,
  and a phone never receives the 2000 px file.
- **Quality 75–80**, changeable from settings. The **dominant colour** is stored and shown as a placeholder box;
  **width and height are always set**; the first screen loads eagerly, the rest lazily.
- **The original is archived**, so a new size later is made from it without re-uploading.
- **Targets:** a category image under **40 KB**; a product main image under **150 KB**.
- Processing runs in the background on NVMe (worker, PR 6); the results go to Blob through the storage adapter (PR 18).
  Required from launch — adding it later would mean re-processing every product photo.

#### A2.9.8 CDN — Cloudflare (owner spec §4; PR 362, 7)

- All three domains go through Cloudflare.
- **Static files** (images, CSS, JS, fonts): cached for a long time, with hashed file names (a change = a new name).
- **Category and product pages:** cached for a few minutes; the duration is a setting.
- **Cart, checkout, account, admin:** never cached.
- **The cache is purged instantly when a price, stock, setting or new product changes** (PR 602).
- Brotli and gzip, HTTP/3, free SSL, bot and DDoS protection. Keys live in the vault (PR 493).

#### A2.9.9 Cache — four layers and invalidation (owner spec §5; PR 602)

| Layer | What it keeps | For how long |
|---|---|---|
| Browser | images, CSS, JS | a long time (hashed names) |
| Cloudflare | images and public pages | images long, pages a few minutes (setting) |
| Server page cache | built HTML | minutes; renewed the moment something changes |
| Redis | settings, the Dhaka area list (250–300 areas), products, categories, stock display | seconds to hours, by item |

- **Purge rules:** price change → the product, its category pages and the CDN; stock change → instantly; settings
  change → everywhere that setting is used; new product → category pages and the sitemap.
- **Stock (Claude's decision):** the **display** cache lasts **15 s**, and every stock change event purges it at once.
  **Add-to-bag and checkout always read live stock with a row lock** (PR 198). Nothing oversells. *(The owner's line
  said 15–30 s; the display uses 15 s and the money path never uses a cached number.)*
- An admin **"Clear all cache"** button. Cache hit % on the Server page.

#### A2.9.10 Database (owner spec §6; PR 5, 13, 603, 519, 72)

- **Tuning:** as A2.9.5, `work_mem` by workload, `max_connections` kept low behind **PgBouncer**, temp files on NVMe,
  slow query log.
- **Required indexes (PR 603, built with the schema, PR 13):**
  - category page — category + store + in-stock + sort, in one index;
  - SKU and variant by colour and size;
  - order by phone (the fraud engine runs it on every order);
  - fuzzy name/address with **`pg_trgm`** — duplicate and fraud detection in S06 (PR 519);
  - customer order history;
  - style hierarchy for profit (Polo → Ralph Lauren polo → solid polo; PR 536);
  - order list filters — date, status, courier, store.
- **Site search stays on Meilisearch** (PR 72) — better at Bengali and English typos. Postgres `pg_trgm` is for fraud
  fuzzy matching. This settles the owner's "search index in Postgres" line.
- **Reports** (profit, ads, dashboard charts) run on **materialized views** refreshed on a schedule, or on a
  **low-priority report pool**, so a report never slows a customer.
- **Targets:** a normal query under **50 ms**; anything over **100 ms** is logged; an admin page lists the slowest
  queries.

#### A2.9.11 Speed targets (owner spec §7; PR 10, 88, 234) — not met = not finished

Measured **from Dhaka, on a phone, over 4G** (not office Wi-Fi):

| What | Target |
|---|---|
| LCP (first large content) | < 2.5 s |
| CLS (layout jumps) | < 0.1 |
| INP (tap response) | < 200 ms |
| TTFB (first byte from the server) | < 600 ms |
| Category page total weight | < 1 MB |
| Admin page open | < 1 s |

Measured **automatically every month**, results in the admin Server page (PR 234, 423).

#### A2.9.12 Backup — Azure Blob + Google Drive (owner's answer; PR 8, 395, 396, 507)

- **Google Drive is mandatory.** The second add-only Drive stays as a third copy.
- **Azure Blob is now added** — this supersedes "Drive only, no Blob" in A2.8.
- **Blob holds:** the continuous **WAL archive** (point-in-time restore to any minute); **daily full backups**; soft
  delete and versioning or immutability on, so a mistake or ransomware cannot wipe it; images and media, also with soft
  delete and versioning.
- **Drive holds:** the daily full **encrypted** copy — off-site, with a different company.
- Zip staging happens on NVMe: zip → upload → delete. Retention is set from settings.
- **Restore:** one command, **defaulting to Blob** (same region, fast), **Drive as the fallback**; a point in time can be
  chosen; it runs on staging first, and production needs a typed confirmation (PR 396).
- **Monthly automatic restore test** of the backups, with the result shown in the admin and sent to Telegram.
- **Cost:** Blob is **not** in the VM price. It is billed separately and is small — roughly **US$5–15 a month** for
  backups plus media at launch scale; same-region restore traffic is free.
- The owner creates the **Storage account** later, with a guide; its key goes into the vault (Appendix B, B.2 4a).

#### A2.9.13 Monitoring and alerts (owner spec §9; PR 9, 423)

An admin **Server page in plain language**: CPU, RAM and disk; each service's RAM/CPU against its limit; NVMe status;
DB, Redis, app and Meilisearch up or down; cache hit %; the slowest queries; the last backup on Blob and on Drive and
whether it succeeded; CDN traffic; the monthly speed results.

**Telegram alerts** (through the AI 360 channel) when a disk passes **80%**, a service goes down, a backup fails, the
site slows down, or the NVMe goes missing.

#### A2.9.14 Security (owner spec §10; PR 3, 7)

- SSL auto-renewal on all three domains.
- DB and Redis reachable only inside the server.
- SSH by key only, no root login, fail2ban. **Port 22 is not limited to the owner's IP** — the build agents connect from
  changing IPs, so key-only plus fail2ban is the rule.
- UFW allows only 80, 443 and 22; optionally 80/443 limited to Cloudflare's IP ranges (a setting).
- Unattended security updates.
- After a restart everything starts by itself in the right order: **NVMe first**, then the data disk, then Docker,
  Postgres, Redis and the app.
- Zero-downtime deploys (A2.9.6).

#### A2.9.15 Handover — runs anywhere (owner spec §11; PR 18, 604)

- All keys live in the vault (Blob, Cloudflare, backups — encrypted).
- Image sizes, quality and formats, and the cache durations, are settings.
- The RAM/CPU split lives in a config file.
- **Works without the CDN** — images are served from the server.
- **Works without Blob** — a storage adapter (local disk / Azure Blob / S3-compatible) on the adapter framework of PR 18.
- **Works on a smaller server** — the hardware-aware profile detects CPU and RAM (for example 4 vCPU / 16 GB) and
  computes the limits itself; nothing is edited by hand.

#### A2.9.16 Order — everything before go-live (owner's answer: "finish ALL server work at once, nothing for later")

Every server item is required **before go-live**, including the monitoring page, the monthly speed measurement and the
report pre-computation that the owner's file had put under "later". Nothing from this spec is deferred until after
launch. Items that need the app schema are built with their stage and marked **pre-launch required**.

**Build order inside S0A:**

1. Record specs (PR 1).
2. Hardening and UFW (PR 3).
3. NVMe boot unit (PR 601).
4. Data-disk LVM (PR 1, 3).
5. Docker (PR 4).
6. Hardware-aware profile (PR 604).
7. Postgres, PgBouncer and Redis tuning (PR 5, 6).
8. Caddy, Cloudflare and the Origin certificate (PR 7).
9. Backup — Blob, Drive, WAL and the restore test (PR 8).
10. Monitoring and Telegram (PR 9).
11. k6 baseline (PR 10).

**Then:** S00 indexes (PR 603) with the schema; S01 image pipeline (PR 22, 24, 37); S02 cache (PR 602). The Server page
(PR 423), the monthly speed measurement (PR 234) and the restore test (PR 395/507) are built with their stages and
marked pre-launch required.

#### A2.9.17 Where it landed in the register

| Owner spec section | PR |
|---|---|
| §0 machine | 1, 2 (updated) |
| §1 storage placement, boot script | 1, 3 (updated); **601** (new) |
| §2 RAM/CPU split | 4, 5, 6, 7 (updated); **604** (new) |
| §3 images | 22, 24, 37, 88 (updated) |
| §4 CDN | 7, 362 (updated) |
| §5 cache | **602** (new); 6 (updated) |
| §6 database | 5, 13, 72, 519 (updated); **603** (new) |
| §7 speed targets | 10, 88, 234 (updated) |
| §8 backup | 8, 395, 507 (updated) |
| §9 monitoring | 9, 423 (updated) |
| §10 security | 3, 4, 7 (updated) |
| §11 handover | 18 (updated); **604** (new) |
| §12 order | A2.9.16; E3 |

New PRs: 601 and 604 in S0A (10 → 12), 603 in S00 (18 → 19), 602 in S02 (57 → 58). **Total 604.**

#### A2.9.18 Server admin pages in the demo (V2.1 final · 20 Oct; CN-001)

The V12 demo shows the admin side of A2.9 (System group; nothing on the storefront). **Every number on these pages is
sample data**, labelled as such; the code phase wires them to the real server. Demo files `89v-admin-server.js`,
`r12-zsrv.css` (plus a link on the health page in `89-admin-system.js`). These are the reference screens for the PRs:

| Demo route | What it shows | PR |
|---|---|---|
| `#/admin/server` | machine card with "auto profile detected" and a smaller-server preview; per-service RAM/CPU against limits; OS and data disks; NVMe card (mount, free, last boot format, "simulate missing"); services up/down; cache hit %; CDN bars; slowest queries (> 100 ms flagged); Telegram alert rules with on/off and editable limits | 423, 601, 603, 604 |
| `#/admin/cache` | durations as settings, purge rules, never-cached list, live-stock line, "Clear all cache" with confirm | 602 |
| `#/admin/images` | 5 sizes × AVIF/WebP/JPEG, quality 75–80 (default 78), 4:5, 40 KB / 150 KB targets, Blob / server-disk switch, CDN on/off | 22, 24, 88 |
| `#/admin/speed` | the monthly Dhaka 4G table with pass/fail | 234 |
| `#/admin/integrations` ("Keys & connections") | every key and connection in one place; typed keys are never stored | 493, 500 |
| `#/admin/backup` | now **Blob + Drive**: Google Drive (required, plus the add-only Drive) and Azure Blob (daily and minute-by-minute, soft delete; "Not connected — add key" until the key is in); restore from Blob or Drive at a chosen minute, staging first, typed RESTORE; monthly restore-test rows; retention | 8, 395, 507 |

Checks: 120 route and modal checks (1366 / 768 / 393 / 360 × English and Bengali) with **0 fails**, plus **19 flows**
passing; English mode 0 Bengali; phone device gate 0/240.

### Open — needs the owner's decision

- **[Obsolete 19 Oct 22:44 — new VPS.]** **The pre-upgrade Azure disk snapshot:** after the OS upgrade finishes successfully, do you want the snapshot
  **deleted straight away** (no ongoing Azure cost) or **kept** for a while as insurance?
- **[Obsolete 19 Oct 22:44 — new VPS.]** **Ubuntu Pro ESM fallback:** if the in-place upgrade cannot be completed and the box has to fall back to Ubuntu
  Pro ESM on 20.04, attaching ESM needs an Ubuntu One account and token. Are you willing to supply that one token
  **if and only if** the fallback is actually needed, or should the agent keep retrying the upgrade instead?
- **[Obsolete 19 Oct 22:44 — new VPS; region follows the new provider.]** **[Resolved 19 Oct 23:33 (V2.1): Southeast Asia (Singapore) — A2.9.1.]** **Region:** West India is a reasonable choice for Dhaka, and the original assessment suggested measuring it
  against Central India and South-East Asia before go-live. Changing region means a new VM, which your "do not
  change the package" rule forbids. **Confirm: stay on West India permanently?** (With the CDN in front, region
  only affects API calls, not images, so staying is a perfectly good answer.)

---

## A3. Architecture — the ERP is the master


> **CN-005 · 20 Oct 2026 02:25 (owner).** The ERP ↔ shop API is fixed in `docs/ERP-API-CONTRACT.md`. The ERP endpoints are built in the owner's **ERP project** (repo Extas-ERP); this build makes the adapter (S09, PR 497) against the same contract, on a mock until the key is entered.

> **V2 · 18 Oct — the ERP becomes optional (PR 497–499).** ERP mode switch (EXTAS ERP · another ERP · no ERP),
> a generic adapter contract with mock / sandbox / live, and an ERP-absent guard proven by tests. The no-ERP stock
> module is parked as S27 (handover pack). ERP push permission was granted on 18 Oct (§59 answer 36); the access
> itself is still owner data (Appendix B).


### A3.1 The stack

Both systems are **Next.js + Prisma + TypeScript + PostgreSQL**. The same stack on both sides is deliberate: the
ERP already uses it, so the sync adapter is written against real types, not guesses. Around the app on the one
server sit **Redis**, **BullMQ** for the worker queue, **Meilisearch** for search, **Caddy** for HTTPS, **sharp**
for local image processing, and **Docker Compose** to run it all. Media lives on **object storage behind
Cloudflare**, never on the VM disk.

### A3.2 ERP is the master — Locked

The ERP repository is **the owner's ERP repository (`Extas-ERP`)**. Reading it changed the architecture: it already contains far more
than was assumed, and the e-commerce platform must not rebuild any of it.

Models that already exist in the ERP and must be used, not duplicated:

- `Style` → `Color` / `Size` → `ProductVariant` (sku unique per company, barcode, `retailPrice`, `wholesalePrice`,
  `avgCost`, `bGradeAvgCost`) — a full variant-level catalogue
- `Warehouse`, `StockBalance` (quantity **and `reserved`** — "allocated to confirmed but undelivered orders"),
  `StockMovement` (referenceType / referenceId), `StockLot`, `BadStockEntry`
- `StockIntake` / `StockIntakeLine`, `PurchaseOrder`, `Party` (suppliers) — goods receiving
- `SalesOrder` with `channel: SalesChannel`, `integrationId`, `externalOrderId`, `customerName`, `customerPhone`,
  `shippingAddress`, and `partyId` **nullable, "for walk-in retail"**
- `SalesChannelIntegration` (platform, apiKeyRef, webhookSecretRef, lastSyncedAt) and `WebhookEvent` (source,
  payload, status) — an e-commerce integration inbox already designed in
- `EcommercePlatform.CUSTOM_WEBSITE`, `SalesChannel.WEBSITE`, `SalesChannel.POS`
- `CourierAccount`, `Shipment`, `ShipmentEvent`, `CourierProvider.PATHAO | STEADFAST`
- `SalesReturn`, `SalesReturnItem`, `ReturnItemQcStatus`
- `Payment`, `Refund`, `CreditAllocation`, `Cheque`
- `LedgerAccount`, `JournalEntry`, `JournalLine` — real double-entry accounting
- `ExpenseHead`, `Expense`, `AdSpend` (date, platform, campaign, amount), `BankAccount`

### A3.3 Ownership split

| Side | Owns |
|---|---|
| **ERP** | Variants and SKUs · stock on hand · goods receiving · purchase orders · suppliers · production · all accounting and the books · expenses · fixed assets · payroll |
| **E-commerce** | Storefront · product presentation and SEO · content and blog · customer accounts · cart and checkout · online payment gateways · combos and bundles · fraud scoring · location check · retail CRM and marketing automation · ad analytics with delivered-ROAS attribution · the AI agent · the Telegram bot · the daily report · courier booking and tracking (it sits in the operational flow) |

### A3.4 The sync map

| What | Direction | ERP model |
|---|---|---|
| Variants: SKU, colour, size, retail price, cost | ERP → shop | `ProductVariant` |
| Stock on hand and reserved | ERP → shop | `StockBalance` |
| Confirmed order | shop → ERP | `SalesOrder` + `SalesOrderItem`, channel `WEBSITE` |
| Payment received | shop → ERP | `Payment` |
| Shipment booked + status | shop → ERP | `Shipment` + `ShipmentEvent` |
| Return + QC result | shop → ERP | `SalesReturn` + `SalesReturnItem` |
| Daily ad spend total per platform | shop → ERP | `AdSpend` |

### A3.5 Three rules the sync adapter must obey

1. **Accounting: push business documents, not journal lines.** The shop sends SalesOrders, Payments and
   SalesReturns. The ERP's own double-entry logic produces the journals. Writing journal lines from outside
   would fight the ERP's existing accounting rules.
2. **Reservation rule, to prevent double-counting.** The shop holds a short-lived **cart** reservation locally and
   does **not** push it. On order confirmation the shop pushes a SalesOrder, and from that point the ERP's own
   `StockBalance.reserved` logic takes over.
3. **The ERP is multi-company — `companyId` sits on everything.** **Every single sync call must carry the
   `companyId`.** Store-to-companyId mapping is covered in A4.4.

### A3.6 What is removed from the e-commerce build, and what stays

**Removed, because the ERP already does it:** stock transfers · suppliers and purchase orders · goods receiving ·
stock audit and adjustments · expense entry · VAT reporting. (≈ −6 PRs.)

**Kept in the e-commerce, for speed or because only the shop has the data:**
- a **local stock mirror** for fast page loads
- the **cart reservation**
- low-stock alerts
- sell-through by size
- auto-clearance
- **per-order operational margin** — revenue − COGS − courier − gateway − ads — which the daily report and
  delivered ROAS both need

**Added:** the ERP sync adapter, written against the real schema above, plus the ERP-side endpoints. (≈ +4 PRs.)

**Net effect: no duplicated data entry anywhere.** Anything the ERP owns is read from the ERP or pushed to the
ERP; it is never re-keyed or re-modelled on the shop side.

### Open — needs the owner's decision

- **Push access to the owner's ERP repository (`Extas-ERP`).** The sync needs endpoints on the ERP side. Will you give the build
  agent push access to that repository, so the ERP-side endpoints are built in the same project? Without it the
  agent can only write a specification and wait for someone else to implement it, which stalls the whole sync.

---

## A4. Multi-store — three stores, one server, one codebase

> **V2 · 18–19 Oct.** S17 is now **24 PRs** (356–377, 511–512). The owner adds store 2 himself later from the
> panel (§59 answer 38); the system supports 2–3 stores by default (§59 answer 40). The first domain is
> **extas.com.bd**: the new site replaces the live WordPress shop on the same domain (PR 587, Note 26.1), so it
> becomes the mother store. The "Azure credential / who opens 80/443" question is closed: we open the ports
> (Note 45.2).


### A4.1 The shape — Locked

**Three e-commerce sites: three domains, each its own brand and theme, each selling its own items (clothing or
otherwise), each with its own ad campaigns and its own sales — and all three connected to the same EXTAS ERP,
because all three are the owner's retail business.** The benefit he has seen in practice is exactly this:
separate domains, separate campaigns, separate sales.

**One codebase, one deployment, three domains. Not three copies.** The request's hostname decides the store;
everything downstream is scoped by `storeId`, **enforced at the data layer so one store can never read another's
rows.** Three copies would mean three times the maintenance and three times the bugs, for no gain.

Three stores on this machine cost very little extra — one application, three hostnames, one database. The
8 vCPU / 64 GB box handles all three comfortably.

### A4.2 What is separate per store

Domain and certificate · brand: logo, theme, fonts, colours, templates, page layouts · catalogue and which
products are listed · prices and offers · categories and menus · content, blog and SEO · policies and Smart
Rules · payment accounts · courier accounts · SMS sender ID · WhatsApp number and Facebook page · ad accounts and
attribution · support inbox · customers and orders · reports.

### A4.3 What is shared

The codebase and the server · staff accounts and roles (one login, with a store switcher) · the AI 360 control
room, with per-store switches and per-store cost attribution · the Studio asset, model and scene libraries, which
a store may use or keep private · the ERP connection.

### A4.4 ERP mapping, and the stock decision — Locked

**Each store maps to a `companyId` and a warehouse**, and every SalesOrder pushed carries which store it came
from, so stock and accounts never mix by accident.

**Decision: one stock, one warehouse, shared by all three stores.** (Option (a) of the two discussed; option (b),
a separate warehouse and separate stock per store, is rejected.) What that means in the build:

- One stock number per variant in the ERP, used by all three sites. A sale on any site reduces it on all three at
  once.
- **Reservation is global.** The moment a variant is held in checkout on one site, the other two see it held — so
  two sites can never sell the same last piece. **This is the single most important rule in S17 and it gets its
  own test.**
- Every product carries **"show on this store"** toggles — three switches. A product can live on one site, two, or
  all three. A hidden product still holds its stock; it is simply not displayed there.
- Low-stock and out-of-stock behaviour follows the shared number, so a last piece goes out of stock everywhere
  together.
- The ERP sees **one warehouse and one stock ledger**. Each store still maps to **its own `companyId`** for sales
  and accounts, so **stock is shared, but sales, costs and reports stay separate per store.**
- Stock alerts and restock suggestions are raised **once** on the shared number, not three times.

### A4.5 The mother store — Locked

**The first domain connected is the mother store.** It is created during setup, carries `storeId = 1` and the flag
`isPrimary = true`, and **that flag can never be moved or deleted.**

Everything already designed and given a UI in this project **is** the mother store. It is the default store
everywhere:

- the store a staff member lands on after login
- the owner of the shared Studio libraries
- the one whose settings a new store may optionally copy from as a starting point

Stores 2 and 3 are added later from the back end and are **ordinary stores — no shared look, no shared identity.**

### A4.6 The store switcher and "Add store"

In the admin dashboard, under **Settings → Stores**, there is a **store switcher** at the top and an **"Add
store"** button.

The wizard asks for: store name · domain · language and currency · which ERP `companyId` and warehouse it maps
to · which theme to start from · which products to list.

- Nothing is added by editing code or a file. The owner does it from the dashboard.
- Stores can be created in **draft** and launched when ready.
- **The mother store cannot be deleted from here.**

### A4.7 What the owner must supply to connect a domain — one time, per domain

The build agent does everything else: DNS records, certificates, Caddy host config, Cloudflare settings, store
creation, testing.

1. **The domain name itself.**
2. **Registrar access** — either the login for wherever the domain was bought, or the owner changes two
   nameservers himself, with step-by-step instructions supplied by the build agent.
3. **A Cloudflare account** — the free plan is enough. The email, and an **API token** created with the
   "Edit zone DNS" template. The build agent supplies the exact click path for creating it.
4. **Azure, two things only:**
   - the VM's public IP must be set to **Static**, not Dynamic — a dynamic IP changes on restart and the site
     dies;
   - **ports 80 and 443 open** in the Network Security Group.
   Both are one-time clicks in the Azure portal. The build agent supplies the exact path, or does it itself if it
   is given an Azure credential. **The VM package does not change.**
5. **Server access** — IP, sudo username, and SSH key or password. Already agreed (A1.2).

**That is the entire list. Nothing else is ever asked of the owner.**

### A4.8 Add-on stores must look nothing like the mother store — Locked

Functionality stays the same across all three. **The face must be completely different — a customer who visits two
of them must never feel they are the same shop. This is not a colour swap.** Per store:

- its own page templates and homepage composition, not the same layout recoloured
- its own component variants — a different product card, different navigation, different buttons, a different grid
- its own typography pack and colour system
- its own photography style: different lighting, different framing, different backgrounds
- **its own AI model roster in the Studio** — different faces, a different look; a model used on one store is not
  used on another
- its own AI copy voice and brand tone
- its own SEO: different keywords, different titles, different descriptions, different blog topics
- its own ad creative style

**A cross-store sameness guard** runs automatically and warns if two stores drift toward looking or reading alike —
same layout shape, same copy phrasing, same product text, same model face.

**Honest note, recorded so the cost is not hidden:** "same functions, completely different face" means the theme
layer has to be deep — a **real theme engine with its own template sets**, not variables on one design. That is
genuine work, and it is priced into the PR count below rather than glossed over.

### A4.9 The duplicate-content warning

Three separate domains mean three separate SEO efforts. **If the same product appears on two sites with the same
text and the same photos, Google may treat it as duplicate content and rank neither well.** So: either list a
product on one store only, or give each store its own description, title and images. **The system flags it
automatically when the same SKU is listed on more than one store with matching copy.**

### A4.10 S17 — the stage that carries all of this, 21 PRs

| Group | PRs |
|---|---|
| Original five | store entity and query scoping · store switcher · shared vs separate settings · combined all-stores view · isolation tests |
| Added in §39 (9) | per-store brand, theme, templates and page layouts · per-store domain, certificate and Cloudflare routing · per-store ERP mapping to `companyId` and warehouse · per-store product listing and stock visibility · per-store payment, courier and SMS accounts · per-store WhatsApp, Facebook and support-inbox routing · per-store ad accounts, attribution and campaign separation · per-store SEO with cross-store duplicate-content detection · per-store AI 360 scoping, switches and cost attribution |
| Added in §40 (7) | theme engine with full template sets, component variants and typography packs · store #2 complete theme build · store #3 complete theme build · per-store Studio identity (own model roster, scene style, photo grade) · per-store AI copy voice and brand tone profile · cross-store sameness guard for look, copy and SEO · "Add store" wizard with domain connection, Cloudflare and certificate automation |

**Total S17: 21 PRs.** The earlier suggestion to drop S17 entirely is **withdrawn.**

### Open — needs the owner's decision

- **Which domain is connected first?** That domain becomes the mother store (`storeId = 1`, `isPrimary = true`),
  permanently. Name it.
- **Stores 2 and 3:** do you already have the two other domain names, or should the agent build stores 2 and 3 in
  **draft** and wait for the domains to arrive?
- **[Answered 19 Oct 22:44: we open the ports ourselves — Note 45.2.]** **Azure credential:** do you want to give the build agent an Azure credential so it sets the static IP and opens
  ports 80/443 itself, or will you do those two clicks in the portal yourself following its instructions?
- **Per-store ERP `companyId`:** do companies already exist in the ERP for stores 2 and 3, or should the agent
  create them? If they exist, their names or IDs are needed at the "Add store" step.

---

## A5. Model and cost policy

> **V2 · 19 Oct.** Free models are in the pool but **qualified per job**: each job type has a quality test set, and
> the cheapest model that passes the job's bar is suggested; the owner accepts or changes it (PR 580, Note 17).
> Spend caps per agent (PR 309), the cost book (PR 312–313) and "cost only when used" for idle author agents
> (PR 593) apply.


### A5.1 The honest position on free models

Free endpoints are real and useful, but they come with four problems: tight daily rate limits, models that get
removed without notice, uneven uptime and latency, and — the important one — **free routes generally require
allowing the provider to use the data.** That last point decides the whole design.

### A5.2 The rule — Locked

**Every AI job is tagged with a data class, and the data class decides which providers may run it.**

| Data class | What it covers | Which providers |
|---|---|---|
| **Personal** | Anything containing a customer's name, phone, address, chat content or order details | **Paid providers only**, under terms that do not train on the data. **Free endpoints never.** |
| **Business** | Our own numbers: sales, costs, stock, reports | Paid small / cheap models. Free endpoints **not recommended** — these are the owner's own figures. |
| **Public / draft** | Content that will be published anyway, reviewed before it goes out, with no private data in it | **Free models allowed**, with an automatic fallback to a cheap paid model whenever the free one is rate-limited, removed or slow. |

### A5.3 Where free models may be used

All of these are drafts that a human or a paid model reviews afterwards, contain no customer data, and cost
nothing if they fail:

- Blog article first drafts (quality gates and review run afterwards anyway)
- Product description first drafts
- SEO meta titles, descriptions and image alt-text drafts
- Social captions and hashtag suggestions
- Keyword clustering and topic ideas
- Standard UI string translation, Bengali ↔ English
- Spam and abuse screening of review text **after names and phone numbers are stripped**
- Summarising rider notes **after customer identity is stripped**
- Explaining an error message in the owner's bug box
- Generating test data
- Drafting prompts that the paid models will then run

### A5.4 Where free models must never be used

- **Address parsing** — that is a customer's home address. Personal data, paid providers only.
- **Customer-facing chat replies** — brand voice, accuracy and uptime all matter; a free model going down means a
  customer waits.
- **Fraud judgement, order confirmation, courier booking** — decisions that move money.
- **The daily business report** — these are the owner's real financials. Use a cheap paid model, not a free
  endpoint.
- **Anything on a path where an outage breaks a customer flow.**

### A5.5 The arithmetic behind the rule

At EXTAS's volume the text work is small — support replies, a dozen blog posts, a few dozen product descriptions,
one report a day. On cheap paid models that is roughly **৳1,500–4,000 a month in total.** Free models might save
**৳1,000–2,000 of that**, while adding rate limits, sudden model removals and a data-sharing question.

**So: free models for drafting, everything else on cheap paid models.** The saving is real but small; the risk on
customer data is not worth it. The image and video work is where the real money goes, and **nothing there is free.**

### A5.6 How the policy is built, not just written

- Each job in the **AI Cost Book** carries its data class, its recommended model, and whether a free route is
  permitted.
- The **AI 360 provider router enforces it.** A job tagged personal **cannot** be sent to a free endpoint even if
  the owner selects one — the interface explains why and offers the cheapest permitted model instead.
- **Every free route has a named paid fallback** and switches to it automatically on rate limit, error or timeout,
  so nothing in the shop ever stops because a free model vanished.
- A monthly line in the report: what the free routes saved, and how often they fell back.

This is **+1 PR**: data-class tagging and the provider routing policy inside AI 360.

---

## A6. Repository and document discipline

### A6.1 One living file, not two — Locked

> **V2 · 19 Oct — replaced by versioned files (PR 594).** The blueprint is kept as versioned files side by side:
> `EXTAS-ECOMMERCE-V1.md` (frozen), `EXTAS-ECOMMERCE-V2.md` (current), then V2.1, V2.2 … each with a dated change
> log. The admin's PR register page holds them all and marks the highest version as latest. In the code phase the
> register and the latest blueprint live in the repository's `docs/` folder (see "How changes are made after V2").
> The Part 0–5 structure listed below was the V1 plan for the file; this file keeps V1's Part A–F order.


**The owner hands the build agent a single `.md` file and nothing else.** Everything goes in it — every
discussion, every decision, every PR, every word. The wave split (before launch / after launch) happens **inside
that one file, never as a second file.** The owner is happy to wait four or five more days for it to be complete
rather than have it split up.

Structure of that file:

| Part | Contents |
|---|---|
| **Part 0** | How the build agent must work on this project — rules, order, never skip |
| **Part 1** | The business, the non-negotiable principles, the rules, the architecture |
| **Part 2** | **Wave 1: everything needed to go live**, PR by PR |
| **Part 3** | **Wave 2: everything after launch**, PR by PR |
| **Part 4** | Appendices: data model, environment variables, owner checklist, traceability, **Appendix F · Parked modules** |
| **Part 5** | **Change log**, appended forever |

**Parked, not cancelled** (they live in Appendix F and may be built later, on the owner's word):

| Parked module | Why it is parked |
|---|---|
| **POS / counter selling** | There is no physical showroom today; one is planned later. The core is built POS-**ready** now (see A6.2) so POS becomes a clean add-on, not a rebuild. |
| **AI voice calls** | Deferred by the owner; not needed for launch. |
| **Birthday marketing** | Deferred by the owner; not needed for launch. |

**Rule written into Part 0 so nothing is skipped:** the agent builds Wave 1 in order, runs the staging checks,
then **stops and reports "Wave 1 is complete. Shall I start Wave 2?"** It never skips a PR, never silently jumps
between waves, and if it cannot finish something it writes it in `BLOCKED.md` and carries on.

**Order inside Part 0 and in execution:** Part 0 rules → **S0A Server Foundation** → S00 Foundation → the rest of
the waves.

### A6.2 The POS-ready carve-out, recorded here because it shapes the schema

POS is parked, but the core must be built so POS is a clean add-on later. Cost now: about one extra PR of care
spread across S04, S05, S07 and S09. Cost later when a shop opens: a self-contained **S20 of ~8–10 PRs** (counter
UI, offline cache, till barcode scanning, cash drawer and printer hardware, day-close and cash-up) **that does not
touch the core.** What must be true in the core from day one:

- `Order.fulfillmentType` enum: `DELIVERY` | `PICKUP` | `COUNTER`, default `DELIVERY`
- Shipping address and `Shipment` **optional** on an order, not hard-required
- `Customer` **optional** on an order — a walk-in with no phone
- Payment method `CASH` present in the payment adapter from day one; **split payment supported**
- Inventory already location-aware (warehouse / showroom / in-transit / damaged) — the showroom location simply
  stays empty until a shop exists
- Order source enum already includes `SHOWROOM`
- Thermal receipt template reused from the label and invoice work
- Wallet / store credit usable at the counter — it lives on the customer, so it already works

### A6.3 The blueprint lives in GitHub and updates itself — Locked

> **V2 · 19 Oct.** Still true, with the PR 594 change process: the register and blueprint live in `docs/`, feed the
> admin on every deploy, and the build agent re-reads the register before every PR. A change is a dated change
> note (CN-###) and a new blueprint version (V2.1 …).


The point: two months after launch the owner says "move this menu", and the blueprint must not go stale.

- The blueprint `.md` sits in the repository, next to the code.
- **Hard rule: a PR is not complete until the blueprint is updated in the same PR.** The change and the document
  move together, in one commit, so forgetting is impossible and git history shows both.
- Every new request becomes **a new numbered PR appended to the right Part, plus a Change log entry** — the date,
  what the owner asked **in his own words**, what changed, which PR, written in the same plain style as the rest
  of the file.
- **A CI check enforces it:** if code under the app paths changes and the blueprint file was not touched, the PR
  fails. That is what makes it automatic rather than a promise.
- **The owner never edits the file himself.** He describes the change in plain Bengali — in chat, in Telegram, or
  in the AI 360 box — and the AI writes the blueprint entry and opens the PR.

### A6.4 Monthly Google Drive snapshot of the blueprint — Locked

- On the **1st of every month** a scheduled job copies the current blueprint to Google Drive as
  `EXTAS-BLUEPRINT-YYYY-MM.md`.
- **It runs whether or not anything changed that month** — the owner was explicit about this.
- **Three snapshots are kept**; the oldest is deleted as a new one arrives.
- A **one-line Telegram confirmation** each time, so the owner knows it happened.
- It rides on the Google Drive backup target in S0A PR 7 (A2.8).

### A6.5 Branding and naming — Locked

- **Brand name: EXTAS** (E-X-T-A-S). Every `{{BRAND_NAME}}` placeholder is replaced with EXTAS.
- **AI agent default name: EXTAS AI.**
- **File and package naming: `extas-ecommerce`.**

### A6.6 Running totals

> **V2 · 19 Oct — current totals:** **600 PRs, 28 stages** (S0A–S26 numbered; S27 parked unnumbered); 594 active,
> 6 parked (S26 513–518). Parked outside the count: S27 no-ERP stock, AI voice calls, POS, birthday marketing, ERP
> retail section. The V1 table below is history.
>
> **V2.1 · 19 Oct 23:33:** **604 PRs, 28 stages**; 598 active, 6 parked (PR 601–604 added by CN-001).


| Item | Value |
|---|---|
| Total PRs | **409** |
| Stages | **27** |
| Parked | AI voice calls, POS, birthday marketing |

### Open — needs the owner's decision

- **[Answered 19 Oct: versioned files `EXTAS-ECOMMERCE-V1.md`, `-V2.md` …, latest marked in the PR register — PR 594.]** **The blueprint filename.** The source names it two ways: `EXTAS-ECOMMERCE-BLUEPRINT.md` (§21.1) and
  `EXTAS-ECOMMERCE-V1.md` (§33, §36.7, §37.1). Which one do you want as the single file at the repository root?
  The monthly Drive snapshot name (`EXTAS-BLUEPRINT-YYYY-MM.md`) is unaffected either way.

## A7. Settings framework and handover-ready rules (V2 · S00 additions, approved 18 Oct)

The owner's instruction (§59, "I should not have to say this again"): build everything with handover in mind.
Nothing a human might change lives in code; every installation can be configured from the admin. These PRs are
built in S00 at schema time (wave 1), long before their numbers suggest:

| PR | What it does |
|---:|---|
| 491 | Settings framework: a typed registry in the database, cached, every value readable and writable from the admin |
| 492 | Two-tier resolver: installation → store, with inheritance. **Goes in with the schema on day one; cannot be retrofitted** |
| 493 | Credential vault: every key encrypted at rest, entered from the admin, never in the repository. Day-1 keys are only the server and GitHub (A1.1 V2) |
| 494 | Hardcode guard in CI: the build fails on a hardcoded key, name, number or policy string |
| 495 | Role builder (replaces the fixed role list of PR 16) |
| 496 | Settings migration: a new setting reaches every installation with its default |
| 500 | Integrations screen: courier, SMS, payment, AI providers, Facebook, Google, YouTube, WhatsApp, Messenger, Telegram, Drive, email — each with a Test button |
| 501 | Branding and appearance from settings (the approved design unchanged; only its source moves) |
| 503 | Language framework: every string from a dictionary; both languages live, Bengali per page behind the translation gate (PR 588); **admin in simple English by default with a Bengali switch** (D11) |
| 508 | General default pack seeded as editable defaults |
| 509 | "My own data" register: values that never ship to a new installation (store name, logo, keys, phone, address, Dhaka list, bank details, social links). Demo data and demo-only helpers never ship (Note 41.2) |
| 510 | "Reset to default" on every setting |

**Standing rules carried into every PR:** nothing the owner asks to remove is deleted — it becomes a switch, off by
default; build switches and settings first, data changes last; admin strings are kept as `{en, bn}` pairs (D11).
Demo: `#/admin/settings` (`89-admin-system.js`, `89s-shop-settings.js`).

---

# Part E · Stages, the PR plan and the numbers

> **V2 · 19 Oct — Part E rewritten for 600 PRs in 28 stages.** E0–E4 below are current. V1's Part E (as of 18 Oct,
> 473 PRs) is kept verbatim at the end of this part as **E-H** for the audit trail.
>
> **V2.1 · 19 Oct 23:33 (CN-001):** 604 PRs — PR 601 and 604 in S0A, 603 in S00, 602 in S02. E0–E3 are updated in place; Appendix A lists all 604.

This is the spine of the build. Every PR belongs to exactly one stage, and the stage decides build order.
**PR numbers 1–490 run in build order; from 491 a number is an identity, not a position** — a new PR takes the
next free number but is built inside its stage (PR 491 is built at S00 time). The register is the source of truth
(`master/MASTER-REGISTER.md`); Appendix A lists all ~~600~~ 604 (V2.1).

## E0. The stage table (from the register, 19 Oct)

| # | Stage | PRs | Range | V1 count | Status (register) | Owning agent |
|---|---|---:|---|---:|---|---|
| S0A | Server foundation | 12 | 1–10, 601, 604 | 10 | locked; **server spec filed 19 Oct 23:33** | Prohori |
| S00 | Foundation — repo, CI, schema, auth, **settings framework** | 19 | 11–18, 491–496, 500, 508–510, 603 | 8 | locked | Prohori |
| S01 | Catalog, media & images | 22 | 19–39, 590 | 19 | locked | Bhandari |
| S02 | Storefront | 58 | 40–88, 501, 503, 595–600, 602 | 35 | locked; UI in review | Sawdagor (design: Shilpi) |
| S03 | Combo & bundles | 22 | 89–104, 571–576 | 16 | locked; UI in review | Sawdagor |
| S04 | Cart, checkout, accounts | 39 | 105–137, 558, 560, 561, 563, 565, 566 | 33 | locked; UI in review | Sawdagor |
| S05 | Order management | 20 | 138–155, 541, 546 | 18 | locked | Sawdagor |
| S06 | Fraud & location | 33 | 156–164, 502, 519–524, 540, 542–545, 549–557, 559, 562, 567 | 9 | **answered 18 Oct** | Gyani |
| S07 | Payments & wallet | 10 | 165–174 | 10 | locked | Sawdagor |
| S08 | Courier, returns, exchange | 22 | 175–193, 525–526, 564 | 22 | locked | Bhandari |
| S09 | Inventory & ERP sync | 17 | 194–207, 497–499 | 14 | locked | Bhandari |
| S10 | Smart Rules | 12 | 208–219 | 14 | locked | Gyani |
| S11 | SEO engine | 22 | 220–238, 527, 586, 588 | 17 | **answered 18 Oct** | Doot |
| S12 | Content & blog | 22 | 239–253, 528–530, 547, 591–593 | 14 | **answered 18 Oct** | Doot (+ 5 authors) |
| S13 | Marketing & ads | 35 | 254–283, 531–532, 548, 569, 589 | 30 | **answered 18 Oct** | Doot; paid ads Tirondaj |
| S14 | CRM & customers | 24 | 284–303, 505, 533–535 | 23 | locked | Doot |
| S15 | AI 360 Control Room | 48 | 304–341, 506, 577–585 | 34 | locked | Gyani |
| S16 | Finance, costs & reports | 18 | 342–355, 504, 536–537, 568 | 14 | **answered 18 Oct** | Gyani |
| S17 | Multi-store | 24 | 356–377, 511–512 | 22 | settings open | Prohori |
| S18 | Compliance, security, manual | 13 | 378–390 | 12 | settings open | Prohori |
| S19 | Deploy, backup, go-live | 15 | 391–403, 507, 587 | 14 | locked | Prohori |
| S20 | Fulfilment & documents | 9 | 404–412 | 7 | locked | Bhandari |
| S21 | Site Health & Audit | 14 | 413–424, 570, 594 | 10 | locked | Prohori |
| S22 | Support (all-in-one) | 13 | 425–436, 538 | 12 | locked | Gyani |
| S23 | Social & content studio | 7 | 437–443 | 9 | locked | Doot |
| S24 | Virtual Photoshoot Studio | 38 | 444–480, 539 | 37 | locked | Gyani |
| S25 | Video & Campaign Creative Studio | 10 | 481–490 | 10 | locked | Gyani |
| S26 | Installation, documentation & distribution | 6 | 513–518 | — | **parked** — handover pack | — (parked) |
| S27 | No-ERP stock module | parked | — | — | **parked** — handover pack; numbered when approved | — (parked) |
| | **Total** | **604** | | **473** | 598 active · 6 parked | |

Shilpi (A360-05) owns the design layer of every customer-facing surface and reviews what Sawdagor builds;
Tirondaj (A360-07) owns the paid-ads PRs inside S13 (256–270, 278, 283, 531, 581); the five author agents
(A360-08…12) work inside S12 under Doot.

**Why the counts moved since V1 (473 → 600):** the 12 mis-filed PRs were re-filed into the stages that describe
them (S08 → S02 page builder and label dictionary; S10 → S11 category SEO; S14 → S20 invoice templates; S19 → S02
celebration overlay; S20 → S18 user manual; S23 → S02 Find My Size), and 127 PRs were added. The trail is E1. **V2.1:** four more (601–604, the owner's server spec) → **604**.

## E1. How the count was arrived at (V2 trail)

The V1 trail to 473 / 483 is in E-H below. From the re-tally the register records every step:

*(The register's own table; its heading still reads "How this reached 582" but it runs to 600.)* *(V2.1: the heading now reads "How this reached 604".)*

| Step | Change | Total |
|---|---|---:|
| Full stage-by-stage re-tally, reconciled exactly | baseline | 473 |
| 12 PRs re-filed into the stages that describe them | no change to the total | 473 |
| Scoped work landed: analytics 6, upload block 2, eye-toggles 2 | +10 | 483 |
| Approved: floating WhatsApp 2, sub-menu 2, rebuilt search 3 | +7 | 490 |
| Settings-driven instruction, approved 18 Oct | +28 | 518 |
| Decision round, 18 Oct — fraud/duplicate engine, blog, ads, per-style profit | +21 | 539 |
| Review of that round, 18 Oct — no automatic blocking, approval digest, AI learning | +9 | 548 |
| Delivery-zone correction, 18 Oct — three bands, national gazetteer, collision resolver | +6 | 554 |
| Phone-first recognition at checkout, 18 Oct | +3 | 557 |
| Parameter for Checkout — advance payment caught at checkout, 18 Oct | +5 | 562 |
| Never hold an order, courier charge correction, support explanation, 18 Oct | +5 | 567 |
| Geography analytics — product and category by district, geo ad guidance, 18 Oct | +2 | 569 |
| Checklist audit runner in the AI section, scheduled with Telegram reports (round 15, 19 Oct) | +1 | 570 |
| Combo deep work — auto colour-pairs, category/product/bag templates, set photos, ranking (round 15, 19 Oct) | +6 | 576 |
| Agent 360° profiles in the AI 360 Control Room (round 15, 19 Oct) | +1 | 577 |
| Agent appraisal reports + curriculum and certification (round 15, 19 Oct) | +2 | 579 |
| Model auto-suggest with free-model qualification (round 15, 19 Oct) | +1 | 580 |
| Seventh agent Tirondaj (ads) + strong agent memory (round 15, 19 Oct) | +2 | 582 |
| Chief agent (virtual CEO, chain of command) + Telegram identity and command routing (round 15, 19 Oct) | +2 | 584 |
| Continuous learning engine for the two power agents, Tirondaj and Doot (round 15, 19 Oct) | +1 | 585 |
| Google traffic plan — hash forwarder, WordPress migration, Bengali translation gate, Merchant Center feed (round 15, 19 Oct; review/GOOGLE-TRAFFIC-PLAN.md) | +4 | 589 |
| Product naming and URL control (owner, 19 Oct 12:04) | +1 | 590 |
| Blog content pipeline — 3–6 quality posts a day by agents (owner, 19 Oct 12:10–12:14) | +1 | 591 |
| Blog as a full section with our own ad placements (owner, 19 Oct 12:20) | +1 | 592 |
| Blog writing team — five author agents under Doot (owner, 19 Oct 12:22) | +1 | 593 |
| PR register inside the backend (owner, 19 Oct 14:59) | +1 | 594 |
| Page layout builder + side canvas (owner desktop review, 19 Oct 18:38) | +2 | 596 |
| Launch default — save and restore the whole shop look (owner, 19 Oct 19:53) | +1 | 597 |
| Site builder — every part of the site editable like WordPress/Elementor, with guardrails (owner, 19 Oct 21:23) | +1 | 598 |
| In-dashboard help and the handover user manual — no coder needed (owner, 19 Oct 22:14) | +1 | 599 |
| On-page edit mode with phone review and the AI checker (owner, 19 Oct 22:27–22:33) | +1 | 600 |
| Owner's server specification — NVMe boot unit, four-layer cache, database performance pack, hardware-aware profile (owner, 19 Oct 23:33; review/SERVER-SETUP-SPEC-OWNER.md; CN-001) | +4 | **604** |

## E2. Checks on the numbers

- **Both routes agree.** The stage column sums to **604** (V2.1; 600 at V2); the ranges expand to 604 distinct numbers, 1–604, with
  no gap and no duplicate (verification script, Appendix C, C9).
- **V1's three warnings:** (1) the 12 mis-filed PRs are re-filed (above); (2) the S0A/S19 double count stays fixed;
  (3) the old "263 authoritative" section stays superseded.
- **165 PRs are listed in the register by range only** (S16–S25, S26 and the 18 Oct add-ons such as 504, 506, 507,
  511–518, 536–539, 568): their scope is the stage's section of this specification. Appendix A gives each a
  derived title and marks it as such. Itemising those titles in the register is a Prohori/Gyani task, not an owner
  decision.

## E3. Order of work

**S0A runs first and alone** on the new ~~VPS (A2 V2 block)~~ Azure VM, E8ds_v6, in the build order of A2.9.16 (V2.1). Then the waves, as in V1, with the newer PRs built inside
their stages. 2–3 agents build at once (A1.4 V2).

| Wave | Stages | New PRs built inside the wave (since V1) | Why they go together |
|---|---|---|---|
| 0 | S0A | 1–10 (PR 1–3 updated for the new VPS; **V2.1:** PR 1–10 carry the owner's server spec), **601 NVMe boot unit, 604 hardware-aware profile** — order in A2.9.16 | Server first; no application code before its checks pass |
| 1 | S00, S01, S09 | 491–496, 500, 508–510 (settings framework, **with the schema on day one**); **603 database performance pack with the schema (V2.1)**; 590 naming and URLs; image pipeline PR 22, 24, 37 (V2.1 scope); 497–499 ERP-optional seam | Schema, settings, catalogue and the ERP link |
| 2 | S02, S03, S10 | **602 four-layer cache (V2.1)**; 501, 503 (branding, language, admin English); 595 layout builder, 597 launch default, 596 side canvas (desktop only), 598 → 599 → 600 (paused, finished here in this order); 571–576 combos | The storefront, its builder and the rules that drive it |
| 3 | S04, S05, S07, S08 | 558, 560, 561, 563, 565, 566 checkout parameter and address rules; 541, 546 order dashboard and cancellation notice; 525, 526, 564 courier reconciliation | The money path, end to end |
| 4 | S06, S14, S20, S22 | 502, 519–524, 540, 542–545, 549–557, 559, 562, 567 fraud and delivery-zone engines; 505, 533–535 CRM; 538 support | Everything around an order once it exists |
| 5 | S11, S12, S13, S23 | 527, 586, 588 SEO; 528–530, 547, 591–593 blog; 531, 532, 548, 569, 589 marketing | Being found and being marketed |
| 6 | S15, S16, S21 | 506, 577–585 AI 360 and agents; 504, 536, 537, 568 finance; 570 audit runner, 594 PR register | The control room and the numbers it governs |
| 7 | S24, S25 | 539 | Imagery, once the catalogue is real |
| 8 | S17, S18, S19 | 511, 512 multi-store; 507 backup settings; 587 WordPress migration (on go-live day, with 586) | Multi-store, compliance and go-live |
| — | S26, S27 | 513–518 (parked); S27 unnumbered | Handover pack, built only on the owner's word |

**Dependencies that cross waves (Gyani's build notes, not owner decisions):**
- Checkout (S04, wave 3) reads the delivery bands. Build PR 549–553 and 555 at the start of wave 3, or let S04 use
  the band-lookup interface on the demo gazetteer data (`data/tools/make-gazetteer.py`) until S06 lands. The charge
  accuracy test (PR 553) must pass before any real order.
- PR 597 snapshots cover PR 592's house ads and popups (wave 5): wire the blog keys into the snapshot set when PR 592
  lands (demo keys: `ST.layout`, `ST.sideCanvas`, `ST.blogAds`, `ST.blogAdSettings`, `ST.heroBtns`, `sitebPub`).
- PR 594 is generated from the register on every build; the generator (`tools/make-register.py`) can run from day
  one even though the admin page is S21.
- Go-live conditions: Drive backup and Telegram alerts live (PR 8, 9, 395, 507); WordPress 301 map loaded (PR 587,
  235); hash forwarder in place (PR 586); the Appendix C gate green.
  **V2.1:** plus the Blob backup with WAL/point-in-time restore and the first monthly restore test passed (PR 8, 395, 507), and **every server item of A2.9** — including the Server page (PR 423), the monthly speed measurement (PR 234) and the report pre-computation (PR 603). Nothing from the server spec is deferred until after launch.

## E4. What one PR must contain

V1's six conditions stand, with these additions:

1. One change, named in plain English in the title — not "fix" or "update".
2. Migrations that run forward cleanly and are reversible.
3. Tests that would fail without the change.
4. ~~A screenshot or a measured number for anything visual, at 440 × 956.~~ **V2:** for anything visual, the
   Appendix C gate: the device gate at 0 failures on the 15 phones and 10 tablet sizes, the relevant journeys on 8
   phones, tablets in both orientations and desktops, and screenshots looked at.
5. A line appended to `PROGRESS.md`: stage, PR number, what changed, what was verified.
6. No secret, key, token or password anywhere in the diff; no owner data (PR 509).
7. **V2:** the build agent re-reads the register before the PR starts, and the register (scope or a new PR) is
   updated before anything is built (standard 5; "How changes are made after V2").
8. **V2:** desktop-only changes pass the phone pixel-diff guard at 0 px.
9. **V2:** every pause has a resume test (R13).
10. **V2:** new admin strings are `{en, bn}` pairs and `tools/extract-admin-bn.py --missing` then `--merge` is run.
11. **V2:** anything removed becomes a switch, off by default; demo-only helpers never ship.

A PR that cannot meet all of them is split until it can.

---

## E-H. V1 Part E as of 18 October 2026 (history, kept verbatim)

This is the spine of the build. Every PR belongs to exactly one stage, and the stages run in the order
below. A build agent that is unsure where a piece of work belongs puts it in the stage named here
rather than inventing a new one.

### E-H.E1 (V1) How the count was arrived at

The figure has been re-derived from scratch once, because a running total had drifted. On 2026-10-17 the
stages were re-added one at a time and the correct figure at that moment was **341 PRs across 24
stages**. Everything after that is a recorded increment, and the full trail is reproduced here so the
owner can audit it rather than take it on trust.

| Step | Change | Running total | Stages |
|---|---|---:|---:|
| Full re-tally (supersedes every earlier figure) | baseline | **341** | 24 |
| Image system — PREMIUM tier | +5 | 346 | 24 |
| S24 Virtual Photoshoot Studio created | +7 | 353 | 25 |
| S24 — all product families, lifestyle catalogue | +6 | 359 | 25 |
| Sets, unisex shots, occasion scenes, video | +8 | 367 | 25 |
| Campaign visuals — two layers, Studio menu | +12 | 379 | 26 |
| Campaign overlay + creative brief | +2 | 381 | 26 |
| Activation Center / parallel-agent plumbing | +1 | 382 | 26 |
| Free-model routing policy | +1 | 383 | 26 |
| Server assessment | no change | 383 | 26 |
| S0A server foundation enters the plan | +2 | 385 | 26 |
| S17 expanded — three stores, one server | +8 | 393 | 27 |
| Mother store, domains, store separation | +9 | 402 | 27 |
| Domain connection detail | no change | 402 | 27 |
| Add-on store separation rules | +7 | **409** | 27 |
| UI/UX round 1 — configurability, page builder, mobile | +33 | 442 | 27 |
| Competitor Teardown agent | +3 | 445 | 27 |
| Fabrilife teardown decisions | +4 | 449 | 27 |
| UI/UX round 2 | +16 | 465 | 27 |
| Round 9 — tracking landing, upsell block, review manager | +8 | **473** | 27 |
| Analytics event layer (scoped, not yet built) | +6 | 479 | 27 |
| Product-upload mandatory block (scoped) | +2 | 481 | 27 |
| Dashboard eye-toggles (scoped) | +2 | **483** | 27 |

**Current plan (V1, 18 Oct): 473 PRs across 27 stages, rising to 483 once the three scoped items land.** *(V2: 600 PRs / 28 stages — see E0.)*

**UI/UX rounds 10, 11 and 12 are deliberately not in this count.** Those three audits produced 151
correction points, and almost all of them are layout, type and spacing work inside PRs that are already
counted — not new features. Counting them again would inflate the number without adding work. The few
that are genuinely new (the site-wide floating WhatsApp button, the sub-menu system, the rebuilt search)
are listed as open items in Part D and will be counted when the owner approves them.

**Parked, and excluded from every figure above:** AI voice calls (≈6 PRs), POS (≈8–10), birthday
marketing (≈2), the ERP retail section. Parked means postponed, not cancelled — each keeps its design
notes so it can be picked up without re-deciding anything.

### E-H.E2 (V1) The stages

**Re-derived 2026-10-18, and it reconciles exactly.** The per-stage column had gone stale: increments
were being added to the running total but not written back into a stage row, so the column read 416
against a total of 473. Every increment since the 341-PR baseline has now been placed in a named stage,
by two independent routes that agree — 341 + 132 = 473, and the column summed top to bottom = 473.
**Difference: zero. Nothing was left unplaceable.**

Thirty-five of the 132 were placed by judgement because the record did not name a stage; those are
marked in the full working at `parts/part-E-retally.md`, which also carries the increment-by-increment
audit trail. Anyone who doubts a number can follow it back to a line in the record.

27 stages. "Change since §24" shows the arithmetic for every stage that moved.

| # | Stage | §24 baseline | Change since §24 — with the section that made it | **PRs now** |
|---|---|---:|---|---:|
| S0A | Server foundation (runs before any application code) | — (did not exist) | **new, +10** — §38.5: 2 moved out of S19 plus 8 new | **10** |
| S00 | Foundation — repo, CI, Docker, Prisma, auth | 8 | — | **8** |
| S01 | Catalog, media & images | 24 | +5 §25.10 · **−12 §27.8** (image AI moves to S24) · +2 §46.19 ("was" price) = −5 | **19** |
| S02 | Storefront | 28 | +4 §41.24 · +2 §45.7 · +1 §46.19 = +7 | **35** |
| S03 | Combo & bundles | 16 | — (see the S02/S03 note in section 4) | **16** |
| S04 | Cart, checkout, accounts | 19 | +1 §41.24 · +1 §45.7 · +5 §46.19 · +7 §55.4 = +14 | **33** |
| S05 | Order management | 14 | +3 §41.24 · +1 §55.4 = +4 | **18** |
| S06 | Fraud & location | 9 | — | **9** |
| S07 | Payments & wallet | 10 | — | **10** |
| S08 | Courier, returns, exchange | 17 | +3 §41.24 · +2 §46.19 = +5 | **22** |
| S09 | Inventory & ERP sync | 14 | — | **14** |
| S10 | Smart Rules | 11 | +2 §41.24 · +1 §45.7 = +3 | **14** |
| S11 | SEO engine | 15 | +2 §46.19 | **17** |
| S12 | Content & blog | 10 | +3 §41.24 · +1 §46.19 = +4 | **14** |
| S13 | Marketing & ads | 28 | +2 §41.24 | **30** |
| S14 | CRM & customers | 18 | +3 §41.24 · +2 §46.19 = +5 | **23** |
| S15 | AI 360 Control Room | 28 | +1 §35.5 · +2 §41.24 · +3 §44.4 = +6 | **34** |
| S16 | Finance, costs & reports | 13 | +1 §41.24 | **14** |
| S17 | Multi-store — three stores, one server | 5 | +9 §39.7 · +7 §40.6 · +1 §41.24 = +17 | **22** |
| S18 | Compliance, security, manual | 11 | +1 §46.19 | **12** |
| S19 | Deploy, backup, go-live | 12 | +1 §34.4 · **+2 §37.2 then −2 §38.5** (net 0) · +1 §41.24 = +2 | **14** |
| S20 | Fulfilment & documents | 6 | +1 §41.24 | **7** |
| S21 | Site Health & Audit | 6 | +4 §41.24 | **10** |
| S22 | Support (all-in-one) | 12 | — | **12** |
| S23 | Social & content studio | 7 | +2 §41.24 | **9** |
| S24 | Virtual Photoshoot Studio | — (did not exist) | **new** — 19 §27.8 · +6 §28.6 · +8 §29.8 · +4 §30.8 | **37** |
| S25 | Video & Campaign Creative Studio | — (did not exist) | **new** — 8 §30.8 · +2 §31.4 | **10** |

#### Showing the arithmetic

Running down the column:

10, 18, 37, 72, 88, 121, 139, 148, 158, 180, 194, 208, 225, 239, 269, 292, 326, 340, 362, 374, 388, 395, 405, 417, 426, 463, **473**

In full: 10 + 8 = 18 · +19 = 37 · +35 = 72 · +16 = 88 · +33 = 121 · +18 = 139 · +9 = 148 · +10 = 158 · +22 = 180 · +14 = 194 · +14 = 208 · +17 = 225 · +14 = 239 · +30 = 269 · +23 = 292 · +34 = 326 · +14 = 340 · +22 = 362 · +12 = 374 · +14 = 388 · +7 = 395 · +10 = 405 · +12 = 417 · +9 = 426 · +37 = 463 · +10 = **473**.

And checked the other way: the §24 baseline of **341** plus the **+132** in the audit trail = **473**. The two routes agree.

**Column total: 473 PRs across 27 stages.**

---

#### Three things in this table the owner should look at

1. **Twelve PRs sit under stages that do not describe them.** When the first UI/UX round was recorded,
   several items were filed against the wrong stage: the page builder under S08 (courier), category SEO
   under S10 (Smart Rules), invoice and PDF templates under S14 (CRM), the celebration overlay under
   S19 (deploy), the user manual under S20 (fulfilment), and the Find My Size engine under S23 (social
   studio). The numbers above keep them where the record put them. **They should be re-filed** — a
   build agent reaching S08 and finding a page builder in it will be confused — but that is a decision,
   not a correction, so it waits.
2. **An earlier table double-counted two server PRs.** It showed S19 at 14 and S0A at 10, but those two
   PRs moved from S19 into S0A. Fixed here: S19 reaches 14 by a different route.
3. **Section 11 of the record is still labelled "authoritative" at 263 PRs.** It is not; §24 replaced
   it, and this table replaces §24. Anyone re-reading the record should ignore it.

### E-H.E3 (V1) Order of work

**S0A runs first and alone.** No application code is written until the server is built, hardened,
tuned and backing up to Google Drive. This is the owner's explicit instruction and it is not negotiable:
a shop built on an unprepared server has to be rebuilt.

After S0A, work runs in waves. Inside a wave the stages are independent enough for three agents to run
in parallel without touching the same files; a wave boundary is the only point at which the build stops
to take stock.

| Wave | Stages | Why they go together |
|---|---|---|
| 1 | S00, S01, S09 | Nothing can be built until the schema, the catalogue and the ERP link exist |
| 2 | S02, S03, S10 | The storefront and the rules that drive it |
| 3 | S04, S05, S07, S08 | The money path, end to end |
| 4 | S06, S14, S20, S22 | Everything that happens around an order once it exists |
| 5 | S11, S12, S13, S23 | Being found and being marketed |
| 6 | S15, S16, S21 | The control room and the numbers it governs |
| 7 | S24, S25 | Imagery, which depends on the catalogue being real |
| 8 | S17, S18, S19 | Multi-store, compliance and go-live |

### E-H.E4 (V1) What one PR must contain

A PR is the unit the owner never reviews, so each one has to be safe on its own:

1. One change, named in plain English in the title — not "fix" or "update".
2. Migrations that run forward cleanly and are reversible.
3. Tests that would fail without the change.
4. A screenshot or a measured number for anything visual, at **440 × 956**.
5. A line appended to `PROGRESS.md`: stage, PR number, what changed, what was verified.
6. No secret, key, token or password anywhere in the diff.

A PR that cannot meet all six is split until it can.

---

---

# Part B · Orders, money, support and operations

> **V2 · what changed in Part B.** Order messages follow the owner's 2 SMS + 1 WhatsApp rule (B2.5); two
> separate consent ticks (B5.7); delivery promise in hours and trial at the door (B1.16–B1.17); duplicate and
> fraud handling never blocks automatically (B1.12, B6.4); the invoice is fully editable (B2.1); admin shows full
> phone numbers with view logging (B5.1); the PR register lives in the backend (new B9).


## B1. Orders and fulfilment

### B1.1 Order lifecycle — already in the blueprint, confirmed

> **V2 · 18 Oct.** Every order is scored, marked and placed in its section the moment it lands
> (risk-sectioned dashboard, PR 541); marking is instant, the decision never is. No order is ever held over an
> unclear address: it confirms and goes to a call queue (PR 563). Out-of-stock lines are never auto-cancelled; the
> rest ships (PR 183, §59 answers 41–42).

**Locked.** These were checked against the owner's operations notes and need no new work, only correct implementation:

- Order states including `ON_HOLD`, an event timeline plus an append-only audit log on every change (PR-058, PR-005).
- Inventory locations including a damaged bin, per-variant per-location stock levels (PR-101); reservation with row locking (PR-102); stock audit by barcode with variance and reason (PR-107); low-stock alerts (PR-108).
- Returns flow with QC good/damaged → restock or write-off (PR-096); exchange variant switcher (PR-097).
- Invoice and label PDFs, A4 and thermal, barcode/QR (PR-066); bulk actions including booking, invoice and label printing (PR-065); courier booking stores the real consignment ID (PR-092); handover sheet (PR-093).
- Customer dashboard with full order history and lifecycle (PR-055); SMS / WhatsApp / Email adapters with templates and delivery logs (PR-156 / 157 / 158); policy display pulled from Smart Rules (PR-116).
- Idempotency keys on every webhook, payment callback and ERP push. No duplicate shipment and no duplicate stock movement is possible (§221, §246, PR-081).

**Standing rule, repeated because it is easy to get wrong:** the consignment number and the barcode always come from the courier integration. The shop never generates them.

### B1.2 Defective item found at packing
**Locked** (approved exactly as planned, plus the hold additions).

On the packing screen every order line carries two one-tap buttons: **Damaged** and **Not found**.

One tap does all of this:
1. Moves that piece out of sellable stock. For a damaged piece it writes an ERP `BadStockEntry`.
2. Puts the order on `ON_HOLD` with the reason visible in the order list.
3. Opens the resolution card with, in order:
   - another location or warehouse has it → swap and continue;
   - another colour or size of the same style → offer it;
   - nothing available → contact the customer with four choices: wait / swap / send the rest now / cancel with refund.
4. Records who marked it, when, and why.

A held order also carries a **Hold button with a reason**. The owner sets the waiting time in Smart Rules. After that wait the team either arranges stock or talks to the customer and offers another product.

**Dropped:** the `NOT_FOUND` stock state, the recount task and the stock-adjustment posting. The owner removed them — stock reconciliation belongs in the ERP and has to be updated there manually anyway, and he does not want a second counting system in the shop. The shop keeps only the defective-at-packing exception and the hold. All counting and correcting stays in the ERP. (The **Not found** button on the packing screen stays; it holds the order and flags the line, but it does not open a recount workflow in the shop.)

### B1.3 The Fulfillment page
**Locked.** One page replaces the work that was spread over several screens.

- Pick a date or a status, select orders, then act in this order: **Book courier → Print stickers → Print packing slips** *(the packing slip was subsequently dropped — see B1.5; the page keeps Book courier and Print stickers, plus the picking list).*
- A column shows which document each order already has.
- The daily order summary line (B1.7) is shown on this page as well as printed.
- Reprinting a sticker never creates a second shipment. A reprint always uses the stored consignment.

### B1.4 The courier sticker — the single most important fulfilment document
**Locked.**

**Which orders print.** There is **no fixed cut-off time and no "today" filter**. Whenever the owner presses print — 5 pm, 7 pm, 8 pm, or the next morning — the system takes **every order still with us that has not yet gone to the courier**, however many days they span. If nothing was dispatched yesterday, yesterday's 50 orders print together with today's. Orders already handed to the courier never appear again (the exact signal is in B1.6).

**Sticker size.** The owner sets the sticker/label size to match his own barcode or sticker printer. The layout adapts to the chosen size so the whole content fits neatly. Print must be clean and sharp at every supported size — nothing cut, nothing overlapping.

**Print order — this is the packing order, not the order-time order:**

| Level | Rule |
|---|---|
| 1 | Group by **category**. The category with the most pieces in this print run comes first (e.g. Polo), then the next (T-shirt → Panjabi → Shirt …). |
| 2 | Inside a category, group by **brand / style / SKU family**. The style with the most pieces comes first (e.g. Ralph Lauren polo before Tommy polo). |
| 3 | Result: the packing desk finishes all the polos, then all the T-shirts, and so on. |

If an order contains items from several categories it is printed **once**, placed in the group of its highest-ranked item, and its other items are listed on the same sticker.

**What is printed on the sticker:**
- Courier details plus the courier's own consignment ID and barcode/QR — **always pulled from the courier integration (Steadfast / Pathao / etc.), never generated by us.**
- Customer name, phone, full delivery address, order number.
- A clean bordered box holding a **short product invoice summary**: every item in that order with brand/style, colour and size (so four or five items are all clearly readable), and quantity.
- **COD amount to collect**, printed prominently.
- Delivery instructions / order note.

**The packing rule this creates:** take the sticker → stick it on the poly bag → read the sticker → put those exact items in (Ralph Lauren polo black S, Tommy polo navy, the shirt item, …) → done.

### B1.5 Packing slip — DROPPED
**Dropped by the owner, with his reason recorded:** two documents means the packer has to match an ID on the slip with the right sticker, which is not workable in practice. The sticker alone carries everything. Do not build a per-order packing slip.

### B1.6 Daily consolidated picking list PDF
**Locked.** The warehouse or store manager holds **one document** and pulls every product for the whole run in one pass, category by category, then hands them to the packing desk.

**Which orders are included — detected automatically:** only orders still with us, meaning **not yet picked up by the courier**. The owner's own signal is the rule to implement: in Steadfast, consignments sitting at **"In Review" belong in the list**; **"Pending" means the courier already has the parcel and the order must be excluded**. Orders that are approved but not yet booked at all are also included. The owner may choose a custom date range, but an order already dispatched can never enter the list whatever date is chosen.

**Format:** proper EXTAS letterhead — the same header and footer as the EXTAS invoice pad.

**Sorting:** identical logic to the sticker — the category with the most pieces in this run first, and inside it the style/SKU with the most pieces first.

**Breakdown — must be exact.** For each style, then colour, then size:

```
Ralph Lauren Polo — 15 pcs
   Black — 5 pcs
      M — 2   L — 2   XL — 1
   Navy — 6 pcs
      ...
```

So the store keeper can separate them without thinking.

**A tick box at the end of every row** so the picker marks off what he has pulled.

**Header of the same PDF** (B1.7) and these print rules: repeating table headers on every page, black-and-white safe, nothing cut and nothing overlapping. Rows where stock is short are marked.

### B1.7 Daily order summary line
**Locked.** Printed at the top of the picking-list PDF and also shown on the Fulfillment page:
- orders included and total pieces, **counted separately** — 50 orders is not 50 pieces;
- line items;
- categories, in the print order;
- shortages;
- problem and held orders **listed separately and excluded from the quantities**, so the picking quantity is never wrong.

### B1.8 The exchange engine and its tiers
**Locked.** Exchange, not return.

**Policy (final).** Exchange is allowed **only for size issues**, plus defect, damage or wrong item (our mistake). There is **no colour-change reason, no "didn't like it", no returns and no refunds after receipt.**

**Window.** Read from the Smart Rules setting — currently 72 hours from the courier's Delivered timestamp, but the number is **never hard-coded**. Every piece of copy anywhere on the site prints the rule value.

**Flow.** My account → order → **Request exchange** (the button hides itself once the window has passed) → item → reason → needed size → new item → review the money box → submit. The form asks reason and needed size, and the system checks stock instantly.

**Replacement hierarchy — strictly in order, the customer cannot skip a tier:**

| Tier | What is offered |
|---|---|
| 1 | Same product, same colour, the needed size |
| 2 | Same product (same style / SKU family), other colours in the needed size |
| 3 | Same category — same collection first, then all of that category — items available in the needed size (same measurement) |
| 4 | Only if nothing in the category: other categories (T-shirts, shirts …) in that size |

The note shown to the customer: *"These are the only options available for your exchange under our rules."* Defects follow the same hierarchy, free of charge.

**The money box** — the review screen that shows the customer exactly what money moves before he confirms:

| Situation | What happens |
|---|---|
| New item costs more | Difference added to the invoice and collected as COD, plus the exchange delivery charge as COD |
| New item costs less | Difference credited to the customer's **wallet**, exchange delivery charge still collected as COD |
| Same price | Delivery charge only |
| Our mistake (wrong or damaged item, photo required) | **৳0** after the item is checked |

**Logistics.** Where the courier supports it, the swap happens in one trip; otherwise it is a delivery plus a separate pickup. Confirm the exact capability against each courier's documentation at build time.

**Settlement.** Wallet credit posts only after the old item has passed check. The ERP records a return of the old item and a sale of the new item.

**Limits** come from Smart Rules: number of exchanges per item, excluded categories.

### B1.9 Returns and refunds
- **No returns and no refunds after receipt.** The exchange engine above is the only post-delivery route, except where the shop is at fault.
- A **cancel with refund** exists only in the defective-at-packing resolution card (B1.2), before dispatch.
- Returned goods that do come back go through the existing QC good/damaged → restock or write-off flow (PR-096).

### B1.10 Order editing — who may do it
**Locked.**
- **Customer:** may edit twice from the dashboard before packing, up to the limit set in Smart Rules (existing rule, unchanged).
- **Admin / team (new):** the team must be able to edit an order from the admin dashboard when a customer phones in — add a product, remove a product, change a size.
- Every edit records **where it came from** — customer dashboard / admin / Telegram / support — with who and when.
- Every edit **re-runs the stock check and the fraud check**, exactly as at order time.
- An edited order's invoice is regenerated (B2.1).

### B1.11 The 2-size follow-up (affects packing)
**Locked.** When a customer buys two sizes of the same item: if he said "for someone else" it is a note only, no question. If he said "keep both" or did not answer, the order is tagged **"2 sizes — check"** and an automatic WhatsApp template goes out right after the order with reply buttons (Keep both / Only L / Only XL). The reply updates the order **before packing**, and it works with AI off. SMS fallback carries a one-tap link. No reply by packing time → a yellow note on the order plus a one-line script for the confirmation caller. Still unclear → ship both.

### B1.12 Duplicate orders — four layers

> **V2 · 18 Oct — the duplicate and fraud engine (PR 519–524, 540–546, 555–557).** One identity graph (phone, name,
> address, IP, device). Rules per scenario with actions **cancel · hold · warn · allow; there is no block action**.
> Scenario A cancels the second order and the customer gets a detailed SMS or WhatsApp with the first order's
> tracking link (PR 546). Several orders from one identity become one parcel (PR 522). An identity is only
> *proposed* for blocking; a human blocks (PR 523). The AI reports and waits (approval digest, PR 540). Phone-first
> at checkout: an in-transit duplicate shows a popup with two buttons, cancel or "no, I want another one" (PR
> 556); same product, different size becomes an exchange offer (PR 557). Binding rule: a genuine order is never
> trapped.

**Locked.** The owner reports this happens often. Prevention comes first.

1. **Stop it at checkout.** Before the order is placed the system checks the phone for an open order in the last N days with overlapping items. If one is found a calm card appears: *"আপনার একটা অর্ডার (#1234) এখনো পথে আছে। এটা কি নতুন অর্ডার, নাকি ওটার খোঁজ নিতে চান?"* with three buttons — this is a new order / show me the old one / cancel. Most duplicates die here.
2. **Flag it in admin.** "Possible duplicate" with a link to the other order. Severity: same SKU and colour = high; same product, other colour = medium; same category = low. The window is set in Smart Rules.
3. **Merge.** If neither parcel has been dispatched, one tap merges them into a single parcel — saves a delivery charge and pleases the customer.
4. **If the first is already shipped**, one tap sends a WhatsApp template: *"আপনার আগের অর্ডার #1234 আজ পথে আছে। নতুনটা কি সত্যিই চান?"* with reply buttons, and the answer updates the order before packing.

This works **across every channel**, because website, Messenger, WhatsApp and phone orders all share one customer record keyed by phone.

**Root cause also addressed:** clearer tracking messages, and a "your order is on the way" banner for a recognised customer, so people stop re-ordering out of confusion.

### B1.13 Fulfilment exception rules live in Smart Rules
**Locked.** These are written as rules the owner edits, never in code:
- how long to wait before cancelling a held order;
- whether partial shipping is allowed;
- who may approve a stock adjustment;
- refund wording;
- the duplicate-order lookback window;
- the exchange window, exchanges per item and excluded categories.

### B1.14 Holiday / vacation mode
**Locked.** **The site is never taken down.** Returning an error page for days genuinely damages rankings.

Holiday mode is: a clear banner with the dates · checkout either open with "ships after 20 Ramadan" shown before payment, or closed with a notify-me form · support auto-reply on · ads paused · SMS paused · the catalogue stays fully browsable and indexable. Google sees a normal site with a notice, which costs nothing.

### B1.16 Delivery promise in hours (V2, 19 Oct)

**Note 4.2, 4.3; PR 550, 119, 126.** The delivery time is shown in **hours per band**, set in the backend:
inside Dhaka **24–48 hours**, outside Dhaka **48–72 hours** (sub-area follows its mode). Plain wording, e.g.
"You'll get your order within 24–48 hours." It is decided from the resolved address and shown on checkout, as
the thank-you page headline, in the help search answer, on the Delivery page and in the FAQ, all read from the
same settings (demo: `07-help-search.js` `hs_deliveryAnswer()`, `zoneHours()`; `{insideHours}/{subHours}/{outsideHours}`
tokens). No page may say "days".

### B1.17 Trial at the door (V2, 19 Oct)

**Note 23.9.** The customer may try the product in front of the rider. A setting, **on** by default, with its text
on the product page, checkout and the delivery/exchange help pages in English and Bengali (demo
`08-shop-opts.js`, `89s-shop-settings.js`). If the customer returns it at the door, the existing door rule
applies: pay only the delivery charge to the rider.


### B1.15 Open — needs the owner's decision
1. **Held-order wait time:** how many hours or days should an order sit on hold for a defective item before the team must cancel it? (This is the Smart Rules default.)
2. **Partial shipping:** when one item of a multi-item order is held, may the rest ship immediately by default, or must the whole order wait?
3. **Stock adjustment approval:** which roles may approve a stock adjustment — owner only, or store manager as well?
4. **Duplicate-order window:** how many days back should the system look for an open order on the same phone — 3, 5 or 7?

---

## B2. Documents

One **document engine** produces all of these. This is why the sticker, the picking list and the invoice are cheap together and would cost more if split.

### B2.1 Customer invoice

> **V2 · 19 Oct.** Every word and block of the invoice is editable from the backend (PR 407, template editor PR
> 409; Note 4.4). In My account the order number is a link and an invoice download icon sits beside it; "Get
> invoice" on the order page opens its popup (Note 4.5). The WhatsApp invoice is a **full-page JPG image with the
> logo** by default (§59 answer 45), still a setting.

**Locked.**
- Generated automatically on **every** order.
- One invoice per order. It is **regenerated only if the order is edited**.
- Downloadable from three places: the **customer dashboard**, the **Thank-you page**, and a **Download invoice button on every order in My account**.
- Admin keeps the existing invoice PDF (PR-066), A4 and thermal, with barcode/QR.

### B2.2 Courier sticker
Full specification in **B1.4**. It is a document-engine template with owner-set custom sizes, the category → style sort, and reprint safety.

### B2.3 Picking list PDF
Full specification in **B1.6**. EXTAS letterhead, grouped and totalled, tick boxes, repeating headers, black-and-white safe.

### B2.4 Printed accounting and print quality rules
**Locked.** Rules that apply to every printed document:
- **EXTAS letterhead** — the same header and footer as the EXTAS invoice pad — on the picking list and on the customer-facing accounting documents.
- Repeating table headers on every page.
- **Black-and-white safe.** Nothing may depend on colour to be readable.
- Nothing cut, nothing overlapping, at every supported paper and sticker size.
- Barcode and QR always sourced from the courier integration, never generated locally.
- The ERP remains the book of record for accounting (see B3.6). Printed shop documents are operational documents, not the ledger.

### B2.5 Notification log and delivery

> **V2 · 19 Oct — the owner's default send rule (PR 148/505; Note 4.7, 23.2).**
> | # | Channel | When | Note |
> |---|---|---|---|
> | 1 | SMS | the order is placed on the site | order number, amount |
> | 2 | SMS | the shop confirms / processes it (booked with the courier) | tracking link |
> | 3 | WhatsApp (one) | when the shop processes the order | utility template |
> After that **nothing from the shop**; the courier's own pickup SMS is the customer's third message. Messages for
> later steps (picked up, out for delivery, delivered) exist as switches, **off**. The code counts messages per order
> and blocks a third SMS or a second WhatsApp, logging the block (Doot skill D09). The notification log, retry and
> no-double-send guard below stay. Whether the optional order e-mail counts against this rule is open (Appendix B).

**Locked.**
- Every order carries a **notification log**: what was sent, on which channel, sent or failed, with a **retry button**.
- A guard prevents the same thing being sent twice.
- **Order placed → confirmation email goes automatically.** Email is the guaranteed channel.
- **WhatsApp is optional**, switched on from the dashboard. When on, the system checks whether the number has WhatsApp: if yes it sends automatically, if not it simply skips — the email still goes.
- **WhatsApp invoice format is an owner setting: PDF file, or a JPG image of the order invoice.** The owner picks one and the system sends that format.
- The email address is collected as an **optional, never mandatory** field at checkout. Its exact placement is a UI decision settled elsewhere.

### B2.6 File naming and versions

**[Replaced on 19 Oct by versioned files — see the A6.1 V2 block and "How changes are made after V2". UI/UX results did go into Version 2 as this section planned.]**

**Locked, owner's instruction.**
- The blueprint file is **`EXTAS-ECOMMERCE-V1.md`** — "EXTAS E-commerce .md file, Version 1".
- Everything decided up to now goes into **Version 1**.
- UI/UX audit results and anything that comes after go into **Version 2**; later changes into **Version 3**, and so on.
- It stays **one file that travels with the project**. The version number moves forward inside it; a new version does not mean a new file.
- The version number, the date and the change log sit at the top of the file.

### B2.7 Open — needs the owner's decision
5. **WhatsApp invoice default format:** should the system send the invoice as a **PDF file** or as a **JPG image** out of the box? (He can change it later; the build needs a starting value.)

---

## B3. Payments and money

### B3.1 Cash on Delivery
- COD is the primary method. The COD amount to collect is printed prominently on the courier sticker (B1.4).
- Exchange price differences and exchange delivery charges are collected as COD (B1.8).
- COD fraud is managed by the fraud engine (B6.4), and the decisive action for a high-risk order is an **advance delivery charge by bKash** rather than a refusal.

### B3.2 bKash
- Used for the **advance delivery charge on high-risk orders** — the most effective single fraud filter available.
- Used for the **payment link sent in chat** when the support fraud gate turns red (B4.6).
- A **named, dated payment campaign** (for example a bKash cashback with its end date) can be shown inside the checkout. It is driven by Smart Rules, so the owner sets it without code and it expires itself. **Locked** (adopted from the Fabrilife teardown).

### B3.3 Nagad
Nagad is offered as a payment option and its icon appears in the footer. This is already one of the places the demo is ahead of the competition and must not be traded away.

### B3.4 Card
Card payment runs through a gateway. **Card data is never stored by the shop — the gateway holds it.** Gateway fees are recorded automatically in the cost ledger (B3.7).

### B3.5 The wallet
- The wallet holds store credit on the customer record, so it already works at the counter as well as online.
- Credit sources: an exchange where the new item costs less (B1.8), and offers the owner issues.
- Wallet credit from an exchange **posts only after the old item has passed check**.
- The wallet is visible in My account and in the "For you" offers area.

### B3.6 Refunds
- **No refunds after receipt.** Exchange is the only post-delivery route (B1.9).
- The one refund path is cancellation at the defective-at-packing stage, before dispatch.
- Refund wording is a Smart Rules field, not code.

### B3.7 The accounting boundary with the ERP — ownership line
**Locked. This is the rule that stops the two systems arguing.**

| Owned by the ERP | Owned by the shop |
|---|---|
| Cost price and base retail price | Sale price, compare-at price |
| Double-entry books: `ExpenseHead`, `Expense`, `BankAccount`, `LedgerAccount` | Campaign discounts, coupons, combo prices, landing-page prices |
| Stock counting and reconciliation | What the customer actually pays |
| Journals and the monthly close | Operational cost capture as it happens |

Every shop-side price passes a **margin guard** against the ERP cost. A price below the floor needs the owner's explicit override.

### B3.8 Retail expenses
**Locked.** The books stay in the ERP, but the shop generates its own costs automatically and typing them twice is how numbers stop matching.

- The shop records every system cost automatically as it happens.
- A **Retail expenses** screen in the shop takes the owner's own quick entries: packaging, salary share, office, miscellaneous.
- **At month end the shop pushes one expense document per service per month to the ERP**, which posts its own journals. Nothing is typed twice, the ERP stays master, and the owner can enter a retail expense wherever he happens to be.

### B3.9 Cost ledger — core, must not be forgotten
**Locked.**
- Every paid call writes a **cost row**: service (AI / SMS / WhatsApp / maps / gateway / courier), amount in ৳, what it was for (order id or job id), model or template used, date and time.
- Prepaid balances (SMS credit top-ups) are held as a prepaid balance and drawn down, so the dashboard always shows credit remaining.
- A **Costs section** the owner asked for separately: by day, month and year; by service; by module; one click to any period; export. It shows spend against the AI 360 caps.
- **Per-order cost allocation** feeds the existing per-order profit figure (PR-179): product cost from the ERP + courier + gateway + packaging + allocated AI/SMS + allocated ad spend.
- **Month-end close sheet** — one page: total per service, what was pushed to the ERP, what is still unposted, differences flagged. This is the sheet that makes the month tally.

### B3.10 Money reporting

> **V2 · 18 Oct (S16 additions, PR 504, 536, 537, 568).** Profit per order with ad spend apportioned, and by
> category and **by style** (e.g. Polo → Ralph Lauren polo → Ralph Lauren solid polo), so the owner can decide to
> restock, buy in bulk or stop a style (§59 answer 21). The screen stays simple; the internals do the work
> (§59.2). Expenses are entered here and later reach the ERP (§59 answer 22). VAT system present and dynamic per
> product/category, off for now (§59 answer 23). Report frequency set by the owner (§59 answer 24). Staff and
> performance badges needed (§59 answer 25). Product and category sales by district and upazila (PR 568).
> Itemised titles for these PR numbers are not in the register (Appendix A).

**Locked.** One page shows total ad spend this month across Meta, Google, YouTube and TikTok, set against sales attributed to ads, against organic and other channels, with delivered revenue, returns, and profit or loss per channel. Plus **sales by district and thana, and by area inside Dhaka**, as a table and a map, with the return rate per area — which also feeds courier choice.

### B3.11 Open — needs the owner's decision
6. **Card gateway:** which gateway should the build integrate for card payments (for example SSLCommerz, or another he already has an account with)?
7. **Margin floor:** what minimum margin percentage should the margin guard enforce against the ERP cost before it demands an override?

---

## B4. Support module — S22 · Support (all-in-one)

Support is **not** a feature inside CRM. It is its own module, built on top of the existing PR-157 (WhatsApp API), PR-160 (live chat) and PR-161 (unified inbox). The owner's words: *"this is an all-in-one, all-solution support system."*

### B4.1 Wording — enforced everywhere in the build and the UI
**Locked.**
- **"AI agent" means EXTAS AI only.** It is never used for a person.
- **"Employee" (কর্মচারী) means the human on the support desk.** A person is never called an agent.
- The owner's target: **EXTAS AI handles about 95% of support by itself; employees handle only the roughly 5% that is complicated.**

### B4.2 Channels and inbox
**Locked.**
- **Facebook Messenger** — page messages and replies.
- **WhatsApp** — messages and replies.
- **Website live chat** — the customer writes straight from the site.
- **Support Inbox:** every channel in one dashboard.

**How WhatsApp reaches the site:** WhatsApp Business Platform / Cloud API — (1) the customer messages the WhatsApp number, (2) WhatsApp's webhook posts the message to our server, (3) the server attaches it to that customer's identity and conversation and shows it in the Support Inbox, (4) the employee replies from the website and it goes back out over WhatsApp.

### B4.3 The WhatsApp number

> **V2 · 19 Oct.** The header WhatsApp icon on every page (D3.1) and the checkout help block open this number.
> Text only, as below. The real number is owner data still needed (Appendix B); until then the demo's placeholder
> numbers are expected and come from settings.

**Locked.**
- A **new business SIM used only here**, registered on the WhatsApp Business Platform (Cloud API). The number then lives on the API and **cannot be logged into the WhatsApp or WhatsApp Business app at all** — which is exactly what the owner wants.
- **No calls on WhatsApp. Text only.** Meta's calling feature stays switched off so customers cannot ring that number. Calls go to the separate hotline number only. This is consistent with the standing decision: WhatsApp text button everywhere, no call buttons.
- Any message to that business number from anywhere — including the WhatsApp button inside the customer dashboard — lands in the Support Inbox. One number, one inbox.

### B4.4 Tickets and who is responsible
**Locked.**
- Ticket management: what is solved, what is pending, who is responsible.
- Status, owner, **SLA timers**, resolution time, notifications.
- **Who replied is recorded.** Every reply carries the employee's name, or **"EXTAS AI"** when the AI answered. Visible in the thread and in reports.
- Assign a conversation to an employee.
- Notification on a new message.
- Conversation history and resolution time stored.
- Internal notes on a thread, invisible to the customer.

### B4.5 Order context beside the conversation
**Locked.**
- The customer's **order number and order status** are shown beside the conversation.
- **Instant customer scan on every incoming message.** A WhatsApp message arrives → the system immediately takes that number and checks our own server: has this number ordered before, how many orders, how many delivered, how many returned, is there a pending or in-transit order right now. The result appears in a side panel or popup next to the conversation. Clicking it opens what was ordered and where that order is now. The same applies to Messenger and website chat.
- The context panel carries: order count, delivered/returned ratio, fraud score, live order status, and a click-through to the order.
- **Customer history is always visible** on one side of the conversation.

**Messenger phone numbers:** take the number from the Facebook profile where the API allows it. Otherwise, the moment the customer types a phone number in the chat, grab it from the text and run the same scan. Whenever a number appears in a chat, the history and fraud check run instantly and show on the side.

**Identity resolution:** phone ↔ PSID ↔ customer matching, phone captured from chat text, one person merged across channels as far as is possible.

### B4.6 Selling from the chat
**Locked.**

- **Catalogue drawer in the composer.** The employee taps a button (or types `/`) → searches by name, SKU or colour → picks colour and size → one tap sends a card: two or three photos, the name, the price, and a short link such as `extas.com/p/pique-polo?c=navy&s=L&r=chat8312`.
- **The `r=` reference is the whole trick.** It ties the click to this conversation and this employee, so if the customer buys from the link the order is automatically credited to the chat and to the employee. No manual tagging, and the employee's conversion rate becomes a real number.
- **Mini-cart in the side panel.** The employee drops products into a small cart beside the conversation. Combo prices apply automatically, exactly as on the site. Then **Create order** fills name, phone and address from the customer record (or from what was typed in the chat), runs the stock and fraud checks, and creates the order with source = WhatsApp / Messenger / Live chat.
- **Fraud gate on the button.** Green → the button creates a COD order. Red → the button changes to **Take advance** and sends a bKash payment link in the chat instead of creating a COD order. **The rule decides, not the employee's mood.**
- **One-click order from the chat.** If the history is good, the employee or EXTAS AI turns the conversation into a real order in one click and it lands straight in the Orders section. If the history is bad, the order is refused or cancelled there. Both the AI and the human use the same panel.
- **Send products inside the chat:** search the catalogue from the chat, send the product's photos, send the product link so the customer can order straight away. Images and video must be sendable both ways.
- **Order source filtering.** Orders created from the support system are tagged with their channel. The order list can be filtered by "from support" and then by Messenger / WhatsApp / live chat. Website and ad-driven orders keep their normal analytics and attribution unchanged.
- **Block a bad customer** from inside the support screen.

### B4.7 EXTAS AI inside support
**Locked.**
- The AI answers common questions, looks up order information, and **drafts answers for all questions**, handing over to a human when needed.
- It answers from Smart Rules, the manual and order data, with defined handover rules.
- **AI follow-up and conversion:** messages that did not become orders get AI follow-up later, offers and conversion attempts — a proper system, not ad-hoc. All of it is rule-capped.
- **The AI uses the same panel as the employee.** It proposes the cart and the order; a human taps approve. Nothing separate is built for the AI.

### B4.8 Media in conversations
**Locked.**
- Meta does **not** keep media for us. A WhatsApp media URL expires and Messenger attachment links are temporary, so anything we do not copy is gone. Therefore **every photo, video, document and voice note is downloaded to our own storage the moment it arrives**, and the conversation always shows our copy.
- **Storage target is the owner's Google Drive** (approved direction), not the VPS disk. A service account writes each file into a dated folder in his Drive. The server keeps only a small thumbnail and the Drive file id, so the VPS disk stays small and the files remain the owner's property. If Drive is down the file queues and uploads later; the chat text is never blocked by it.
- **Retention:** photos kept a long time — default **2 years**, editable in Smart Rules, because without the photo an old conversation makes no sense. Videos kept short — default **90 days**, after which the video is removed and the message keeps a note saying a video was sent on that date. **Text, who said what, and order links are kept for ever.**

### B4.9 Voice messages
**Locked.**
- **Incoming: yes.** Bangladeshi customers send voice notes constantly and refusing them loses orders. The voice note is saved like any other media, and **EXTAS AI transcribes it to Bengali text under the player**, so the employee reads it in five seconds instead of listening for a minute. Transcription is an AI feature with a fallback: AI off → the player still works, no text.
- **Outgoing: no voice by default.** Typed replies only, so everything is searchable, auditable and on-brand. One owner-switchable exception: a short pre-recorded clip (for example a size-measuring explanation) may be sent as a file.

### B4.10 Facebook page and Meta compliance
**Locked. This is a build requirement, not a preference.**
- Messages stay visible in the Facebook Page inbox and Meta Business Suite as well. Connecting our app does not hide or delete them. Both sides show the same thread, and our app can be set as the primary handler so two people do not reply at once.
- Meta's rules are respected by design: replies only inside the allowed window, approved message templates outside it, no unsolicited promotional blasts, customer consent recorded, data handled per Meta's platform terms.
- **The page must never be put at risk by our support system.**

### B4.11 The separate support app
**Locked.** The support system must be installable on its own, like Messenger: an icon on **Android, iOS and desktop** that opens **only** the support system, with push notifications. Employees must not have to open Messenger, WhatsApp and the website separately, and must not have to walk through the website admin to reach support. Built as a support PWA with a support-only shell.

### B4.12 Privacy and permissions inside support
**Locked.** Customer privacy is protected with employee-level permissions: a block list, per-employee permissions, and controls on what customer data each employee can see inside support.

### B4.13 Support analytics
**Locked.** Per employee, per channel, chat → order conversion, first-response time and resolution time.

### B4.14 The 12 PRs of S22

> **V2 · 18 Oct.** S22 is now **13 PRs: 425–436** (the twelve below, in order) **plus 538** from the 18 Oct decision
> round. That round set: the AI answers 95–98% as fast as it can; what it cannot answer goes to a human; if no
> employee responds within a settable window (default 5 minutes) the AI pings the owner on Telegram (§59 answer
> 48); desk hours from the backend (answer 49); links customers send are checked by the AI, risky ones made
> non-clickable with a danger mark (answer 54).

| # | PR |
|---|---|
| 1 | Support core: conversation/message model, threads, attachments (image, video), internal notes, employee assignment, who-replied log |
| 2 | Channel connectors: Messenger Page API, WhatsApp Business API webhook in and out, website live-chat widget |
| 3 | Identity resolution: phone ↔ PSID ↔ customer matching, phone captured from chat text, merge one person across channels |
| 4 | Customer context panel: order count, delivered/returned ratio, fraud score, live order status, click-through to the order |
| 5 | Catalogue drawer: search, send photos, send tracked product link with the `r=` reference |
| 6 | Mini-cart and one-click order creation with channel tag, stock check and fraud gate |
| 7 | Ticketing: status, owner, SLA timers, resolution time, notifications |
| 8 | AI support agent: answers from Smart Rules, the manual and order data; drafts; handover rules |
| 9 | AI follow-up and conversion: no-order follow-up, offers, win-back, all rule-capped |
| 10 | Block list, employee permissions, customer data privacy inside support |
| 11 | Support PWA: installable icon on Android, iOS and desktop, support-only shell, push notifications |
| 12 | Support analytics: per employee, per channel, chat → order conversion, first-response and resolution time |

Media-to-Drive (B4.8) and voice transcription (B4.9) fold into these twelve and add no extra count.

### B4.15 How support connects to AI 360
Support is one of the agents controlled from **AI 360 · Control Room** (S15, renamed and reorganised from "AI agent core"). The connection points that belong to support:

- The **AI 360 home screen** lists every agent including the support agent: what it is doing right now, which company and model it is on, what it has spent today and this month, with **one-tap pause per agent**.
- **Master switch and per-feature "keep on when AI is off."** With AI off, support still works: the customer chat falls back to the team inbox plus an auto-reply template, and the inbox, tickets, assignment, order context and order creation all keep running as normal rule-based features.
- **Multi-provider and per-agent control:** choose the company (Anthropic, OpenAI, Google, OpenRouter, local) and model per agent, with a schedule, a spend cap, a per-run override and cost-saver mode.
- **Budget controller:** a monthly ceiling for AI, SMS and WhatsApp with a live usage graph and an 80% warning. At 100% non-essential AI pauses **while orders and support keep running**.
- **Grounded answers:** the support AI answers from the knowledge base built over the manual, policies, the live catalogue, stock, delivery zones, FAQs and solved tickets. It must be grounded and must say *"I don't know"* rather than invent.
- **Training panel:** the owner's own instructions, corrections that become examples, extra documents, forbidden topics, a sandbox test before going live, version history and rollback.
- **Ticket updates are pushed to the customer's tracking page** (PR-172).
- **Telegram full control:** the owner runs the business from Telegram — orders, courier, stock, combos, campaigns, ads, reports and free questions — with whitelisted IDs, pairing, confirm buttons on destructive actions and a full audit trail.
- **Skill tests in CI** so a model change cannot quietly make support worse.
- **The owner's bug/question box** inside AI 360: he describes a problem in plain Bengali, the AI investigates, explains the cause, proposes a fix and asks approval. This ties into S21 Site Health & Audit.

**The human-free goal, recorded:** employees should only do the physical work — print stickers, pack, hand over to the courier. Everything inside the website from order arrival to courier entry, checking, updating and reporting is EXTAS AI's job.

### B4.16 Open — needs the owner's decision
8. **The support dashboard reference screenshot** at `https://prnt.sc/X5UEB8g1Hmt0` could not be read by the tool. Please attach the image itself before the support dashboard is designed — Claude is designing a custom dashboard, not a copy, but it needs to see what he liked.
9. **Support SLA targets:** what first-response time and what resolution time should the SLA timers count against — for example 15 minutes first response during business hours?
10. **Support hours:** what hours are employees on the desk, so EXTAS AI knows when to say "an employee will reply in the morning" rather than promising an immediate handover?

---

## B5. Customers and CRM

### B5.1 The Customers section

> **V2 · 19 Oct (Note 24.1).** The admin shows customers' phone numbers **in full** in the list and the profile.
> Every profile open and every number copy is logged ("Who looked at this customer"). The address rule (PR 561)
> is unchanged. Added 18 Oct: customer history summary at approval (PR 533), grading with badges and a verified
> mark (PR 534), legacy customer import from the owner's order sheet and courier data (PR 535). Demo:
> `91-admin-crm.js`, `#/admin/customers`.

**Locked.** A **Customers** menu of its own: a searchable list showing name, phone, email, WhatsApp number, address, district, first source, orders, delivered, returned, lifetime value and tags.

### B5.2 Filters and segments
**Locked.** District / thana / city area · VIP · fraud-flagged · repeat versus one-time · channel of first contact · date range · order value band · size bought · category bought · consent status.

**Gender is shown only where it is actually known.** An inferred guess is displayed as a guess, never as a fact.

### B5.3 The customer journey view
**Locked.** Click a name and see the whole journey: how they first arrived (campaign, keyword, chat), every visit source, every order and its outcome, exchanges, chats, reviews, wallet and notes.

### B5.4 Export
**Locked.** One-click export of any filtered set as CSV or ZIP, for campaigns, audiences or record-keeping.

### B5.5 One customer record, keyed by phone
Website, Messenger, WhatsApp and phone orders all share **one** customer record keyed by phone. This is what makes duplicate-order detection (B1.12) and the support identity resolution (B4.5) work across channels.

### B5.6 What the shop keeps and for how long

> **V2 · 18 Oct.** Customers are **never auto-deleted**; only IP and GPS expire at 180 days; manual deletion stays
> (PR 302, §59 answer 50).

| Data | Retention |
|---|---|
| Chat text, who said what, order links | For ever |
| Chat photos | Default 2 years, editable in Smart Rules |
| Chat videos | Default 90 days, then removed; the message keeps a note that a video was sent on that date |
| Order history, lifecycle and audit log | Append-only, kept |
| Card data | **Never stored.** The gateways hold it |
| Site Health & Audit reports | Kept for comparison over time |
| Competitor teardown reports | Saved and comparable over time |

### B5.7 Consent

> **V2 · 19 Oct — two separate consent ticks (Note 23.1; PR 123, 148, 298, 505).** Checkout, the landing-page
> form and the account switches show **SMS offers: ticked** and **WhatsApp offers: separate, unticked**. Both are
> stored separately on the order and the customer, with where and when; the CRM shows both and campaign sending
> respects each. Order-related messages (B2.5) need no tick. Demo: `51-checkout.js`, `70-landing.js`,
> `60-account.js`, `91-admin-crm.js`.

Marketing consent is recorded per customer and is a filter in the Customers list. Campaign sending (SMS, email, WhatsApp) respects the consent record, and WhatsApp bulk additionally needs Meta-approved templates while SMS needs the masking sender ID.

### B5.8 Open — needs the owner's decision
11. **Inactive customer retention:** how long should a customer's personal details (phone, address, email) be kept after their last order — for ever, or deleted after a set number of years?

---

## B6. Data, security and compliance

### B6.1 Security — taken seriously from the first commit
**Locked.**

Already planned and confirmed: CSRF, CSP and security headers · rate limits · admin 2FA · session timeout · an IP allowlist option · login alerts · encrypted secrets · an append-only audit log · permission checks on **every** action · an independent security review before real money flows.

**Added in round 6:**
- **Cloudflare WAF and DDoS protection.**
- **Bot protection on login and checkout** (invisible — see B6.3).
- **Dependency vulnerability scanning in CI.**
- **Immutable backups**, so an attacker who gets in cannot delete the backups.
- A **device list with "log out everywhere."**
- **Alerts on any new admin login.**
- A written **break-glass restore runbook.**
- **Card data is never stored — the gateways hold it.**

### B6.2 Backup and rebuild
**Locked.** Nightly database and uploads · 14 daily and 8 weekly copies kept · copied off-server · `restore.sh` · a tested restore. **Added:** **Google Drive as a second backup target**, and a true **one-command rebuild** — paste one command on a fresh Azure VPS and it installs everything, pulls the latest backup and restores the whole site.

### B6.3 No CAPTCHA — the owner's decision, and what replaces it
**Locked.**
- **No "I am human" checkbox. No Turnstile. No challenge page** before or after entering the site. The customer clicks and the site opens. **Any earlier mention of Turnstile is cancelled.**
- Bot protection is done **invisibly in the background**: rate limits, behaviour signals, server-side checks, and WAF rules that never show the customer anything.
- If a challenge is ever genuinely unavoidable it is limited to the **admin login only, never the shop**.
- **No pop-up on arrival.** Notices are owner-placed and deliberate, never an automatic welcome pop-up. (The Fabrilife teardown confirmed this decision — see B8.6 item 15.)

### B6.4 Fraud checking

> **V2 · 18 Oct.** Governing rule: **nothing is ever blocked automatically**; the AI may at most decline an order
> (§59.2). Phone-entry risk check runs in the background and passes the customer on a slow or failed check (PR
> 559); multi-courier fraud data merged behind one adapter (PR 567); flagged customers get the advance-payment mode
> on the same checkout page, never shown a score or reason (PR 558, 560); flag outcome report (PR 562); every rule
> individually switchable (PR 544); decision learning (PR 543); new customers with no history get a call, not a
> decline (PR 545).

**Locked.** The fraud engine is **not a side feature**. It gets its own scoring service and its own tuning screen with measured accuracy. Thresholds are tuned on real outcomes, not guesses, and the system measures its own accuracy.

Signal layers, in order of value:
1. **Our own history** — the strongest signal over time, and it belongs to us.
2. **Behaviour and device** — form-fill speed, repeat devices, many phones from one IP, bot patterns.
3. **Address clustering** — repeated failures from the same building or lane.
4. **Multi-courier check services** where the owner has access — useful, but third-party and of varying accuracy.
5. **Employee check in the chat** — a quick look at the Facebook profile for the handful of genuinely suspicious orders.
6. **Advance delivery charge by bKash for high-risk orders** — the most effective single filter, and the decisive action.

**Stated honestly for the record:** nothing removes COD fraud. A layered score plus a confirmation step should cut it substantially.

### B6.5 Admin access

> **V2 · 18 Oct.** Roles come from the role builder (PR 495). 2FA is present and the owner decides; not mandatory
> (§59 answer 31).

**Locked.**
- Admin 2FA, session timeout, optional IP allowlist, login alerts, a device list with "log out everywhere", and an alert on any new admin login.
- **Permission checks on every action**, not only on the page.
- An **append-only audit log** on every change, recording who, when and from where.
- Employee-level permissions inside support govern what customer data each person can see (B4.12).
- An accountant role exists with permission limits, and those limits are tested by the scheduled site audit's accountant journey (B7.3).
- Telegram control uses whitelisted IDs, pairing, confirm buttons on destructive actions and a full audit trail.

### B6.6 Site audit sandbox limits
**Locked.** The scheduled site auditor **may never touch the database, stock, payments, accounting or customer data.** Those are read-only to it. A fix it proposes needs the owner's approval, runs on staging first, is re-tested, and rolls back automatically if anything gets worse.

### B6.7 Open — needs the owner's decision
12. **Admin IP allowlist:** should admin login be restricted to a list of IP addresses from day one, or left open with 2FA only? (An allowlist is safer but locks him out if his connection changes.)

---

## B7. Admin and back-office quality

### B7.1 What the admin audit found clean — do not break it
An agent walked all 8 admin routes at 390 / 768 / 1366 / 1920 px. Full report: `audit-admin.md`.

Clean: **zero console errors, zero page errors, zero horizontal overflow on any admin route at any viewport, and contrast passing everywhere** (lowest 5.58:1).

**The landing-page builder, the orders triage screen and the Smart Rules preview are the strongest parts and must not be touched.**

### B7.2 Blockers and majors — these are build rules, not one-off patches
**Locked.**

**Blockers:**

| # | Rule |
|---|---|
| 1 | A destructive action must **never** look like a harmless one and must **never** run without a confirm. (Demonstrated: "Only M" on an order permanently deleted a line — no confirm, no undo, styled identically to the safe button beside it.) |
| 2 | **Every number field that feeds live customer-facing copy must be validated before it can be published.** (Demonstrated: −5 hours was published to the storefront footer, the product page, the bag, the checkout, SMS and AI answers.) Min and max on every numeric setting, and publish blocked on an invalid value. |

**Majors:**

| # | Rule |
|---|---|
| 3 | No navigation may lose items on a phone. Scrolling tabs must show a fade or an arrow; nothing off-screen and invisible. |
| 4 | **No action may report success when it did not save.** Save status must reflect the actual write. |
| 5 | Status counts must reflect reality. Nothing may report "running" when its provider is not connected. |
| 6 | An output must land somewhere that exists, and nothing is charged for work that went nowhere. |
| 7 | An unknown admin URL stays inside the admin shell with a route back. It never drops the owner onto the storefront. |
| 8 | **"Save as draft" must actually persist.** |
| 9 | One field, one rule — a limit enforced in one place must be enforced everywhere that field is edited. |
| 10 | A confirm step is required on every consequential action: disconnect, deactivate, discard, clear all, start an A/B test. |
| 11 | Tap targets: the **44 × 44** minimum applies to the admin too — switches, small link buttons, chips, remove icons. |

### B7.3 Site Health & Audit — the operations side

> **V2 · 19 Oct — checklist audit runner (PR 570; Note 14, 21).** The full e-commerce checklist
> (`qa/ECOMMERCE-CHECKLIST.md`, 405 points plus later additions, grouped and prioritised) lives in the AI section.
> One click starts 2–3 agents on chosen groups, on desktop and several phones; or a schedule (e.g. weekly) sends the
> report and bug list to Telegram. The owner chooses when, how many agents and which groups. **Fixes only with
> his permission.** The release standard it enforces is Appendix C. Demo: `#/admin/audit` (`89-admin-system.js`).

**Locked.** The owner's words: *"this is more important, it must never be missed."*

Server Health is extended into **Site Health & Audit**. The owner sets the schedule — hourly, daily, weekly or manual, on or off. Each run replays saved browser journeys:

| Journey | What it walks |
|---|---|
| **Customer** | home → category → product → size/colour → search → bag → checkout → order placed → invoice → tracking |
| **Admin** | login, products, orders, stock, processing, reports |
| **Accountant** | payments, invoices, financial reports, permission limits |
| **Warehouse** | stock view, picking list, shortage, defective report, packing |

Plus UI checks at several phone and desktop widths (cut text, broken layout, overflow, images not loading, buttons unreachable) and the speed checks already in place.

**These journeys are plain Playwright scripts, so they work with AI off.** AI only writes the summary, guesses the cause and proposes a fix.

Every run is stored with the date, what passed, what failed, severity, page, how to reproduce, the suggested fix, and whether a fix was applied. Old reports are kept for comparison. A fix needs the owner's approval, runs on staging first, re-tests, and rolls back automatically if anything gets worse. The auditor's sandbox limits are in B6.6.

### B7.4 Product publishing — the back-office queue
**Locked.** The ERP holds only style, colour, size, SKU and stock. The shop turns that into a sellable product.

- A new style created in the ERP appears automatically in the shop's **"Ready to publish"** queue.
- The owner opens it and adds what the ERP does not have: images and video, category and sub-category, name and description, size chart, template, SEO, the combos it belongs to, tags.
- **A publish checklist blocks a half-done product**: images present and standardised, size chart attached, price set, SEO filled, at least one category. Red ticks until it is ready.
- Bulk publish for a whole batch, and an **unpublish that keeps the page alive as out-of-stock** (ghost archive, PR-124).
- Stock then flows ERP → shop continuously. **The owner never re-enters stock.**

### B7.5 The user manual

> **V2 · 19 Oct — PR 599, paused for the code phase.** A "How to" panel on every admin page and a "?" on every
> field, in simple English and Bengali; a searchable Site Manual inside the admin written for a new owner; a `.md`
> copy kept with the blueprint documents. A truly new function is requested through the PR register ("request a
> feature") and built by the agent team, never by hand-editing code (Note 42.5). Demo: `#/admin/manual` in
> `96d-site-builder.js`, 25 sections.

**Locked, upgraded to the owner's specification.** A proper book: **every menu, module, section and button with What it is, Why it exists, How to use it.** Written in plain Bengali with screenshots, searchable, reachable from a help button on every dashboard screen, regenerated automatically when the UI changes, and fed into the AI so staff can simply ask.

### B7.6 Operational monitoring already in place
Lighthouse CI gate (PR-033) · uptime, queue and error monitoring (PR-207) · the one-button optimisation panel (PR-208) · the Server Health budget with a Telegram alert and AI Diagnose · the daily business report at 22:00 to Telegram and email plus `/report` on demand · the weekly deeper audit.

### B7.7 A standing way of working
**"Check what exists before rebuilding."** This is already how the project runs and it stays a rule for every PR.

### B7.8 Open — needs the owner's decision
13. **Audit schedule:** how often should Site Health & Audit run by default — hourly, daily or weekly? (He can change it afterwards; the build needs a starting value.)

---

## B8. Competitor Teardown agent

**Locked.** The owner asked whether an agent can visit a competitor's site by link, walk the product page and checkout, come back and brief Claude, and then Claude compares it against EXTAS, judges which is better from a customer and conversion point of view, and recommends what to copy, adapt or ignore. The answer is yes, with the limits below.

### B8.1 What the agent does
Opens the site and walks **category → product → variant/size select → add to cart → cart → checkout form**, recording at each step:

- layout and what is above the fold
- how variants and sizes are chosen
- what the gallery does
- trust signals: COD, delivery time, exchange window, reviews
- offers, combos and upsells
- urgency devices
- what the cart does: mini-cart, cross-sell, free-delivery bar
- how many fields the checkout has, in what order, what is required, what validation it gives, which payment and delivery options
- page speed, mobile behaviour, image handling
- SEO markup, titles, schema
- the copy and tone

Screenshots at every step, on phone and desktop.

### B8.2 What it will not do — stated plainly
- **It will not place a real order.** Confirming on someone's live site creates a real order for a real business, with a real COD parcel, a courier booking and a phone call to a real person. The walk stops at the checkout page, **before** the confirm button. This means the thank-you page, the confirmation SMS/email, the tracking page and their customer dashboard are **not** visible this way. If the owner has ordered there himself, his own screenshots fill the gap.
- It will not log in to anyone's account, and will not enter a payment flow.
- Some sites block automated visits. The agent **reports that plainly instead of working around it**; the fallback is screenshots the owner takes.
- It reads at a normal human pace, takes nothing in bulk, and **copies no code and no text**. Ideas and patterns are studied; wording and design are not lifted.

### B8.3 The report it produces
1. **Their journey, step by step**, with screenshots.
2. **A side-by-side table** — their site versus EXTAS, one row per step.
3. **Each difference judged from two angles** — how it feels to a customer, and what it does to conversion. Verdict per row: *they are better · we are better · neither matters.*
4. **A recommendation per item: Pick · Pick with changes · Skip**, each with its reason.
5. **Claude's own view** where neither approach is good, including saying "none of this is worth taking."
6. **A short list of what EXTAS already does better**, so nothing good gets traded away.

### B8.4 It is a permanent dashboard feature, not a one-off
**Competitor Teardown** lives in **AI 360**: paste a link, pick what to compare, get the report. It keeps a saved list of competitors, **re-runs on a schedule**, and **tells the owner when a competitor changes something** — a new offer, a changed checkout, a new delivery promise. Reports are saved and comparable over time.

**Recommendation: track 3 to 5 competitors, not one.** One site's choices may just be that site's mistakes.

**+3 PRs in S15:** journey walker · comparison and report engine · saved competitors, scheduling and change alerts.

### B8.5 Fabrilife teardown — PICK (take these into the build)
No order was placed; the walk stopped at their checkout form. Their scale: Laravel + LiteSpeed, 2,176 products, 156 categories, Algolia search, SSLCommerz, native apps, 8 outlets. Full factual report: `teardown-fabrilife.md`.

| # | Adopt | How ours differs |
|---|---|---|
| 1 | **"Popular searches" suggestion chips** in the search box (T-Shirt, Polo, Hoodie…) | Cheap, and it teaches new customers what the shop sells. **Ours is driven by real search data, not a hand-typed list.** |
| 2 | **Several sizes of one product on one cart line** ("+ Add Size") | A real Bangladeshi buying pattern — three polos of the same style in different sizes for a family. **Ours also carries per-size stock state on the line.** |
| 3 | **A named, dated payment campaign shown inside the checkout** (theirs: bKash 10% cashback with its end date) | **Ours comes from Smart Rules**, so the owner sets it without code and it expires itself. |
| 4 | **A bulk / corporate order enquiry page**, with a phone and email also printed in the cart | The owner already takes buying-house orders, so this is a real line of business, not a copy. |
| 5 | **Per-category meta title templated with the lowest price** — "Men's Polo T-shirt — Starting ৳750" | Raises the click rate from Google at no content cost. |
| 6 | **Policy pages in Bengali**, not only English | — |
| 7 | **Trade licence number published in the footer** | Already a placeholder in the demo; **make it real.** |
| 8 | **A proper full-screen zoom lightbox** with pinch, pan and a reset | Theirs has a zoom-% readout and +/− controls. Ours must be at least this good, because fabric zoom is a stated requirement. |

**PICK WITH A CHANGE:**

9. **Product JSON-LD — yes, but only ratings we actually have.** Theirs declares `aggregateRating 4.7 / 355 reviews` on a page with **no review section at all**. That is unsupported structured data and Google can act on it. **Our rule: schema is generated from real review rows, and emits no rating when there are none.**
10. **High-resolution images for fabric zoom** — the owner requires them, and this is how to have them without the cost: **serve a small modern-format image by default and load the full-resolution file only when the customer opens zoom.** Theirs ships a 3000×3000 JPEG at 357 KB to display it at 330 CSS px, with no `srcset` and an empty `alt`, and another at 801 KB. No WebP or AVIF anywhere on their site.

**SKIP:**

11. Grid / list view toggle on collection pages — clutter, and almost nobody uses it on a phone.
12. Cart quantity dropdown running 1 to 112.
13. Native apps and an app-only discount — a large separate investment; the web store has to work first.
14. Affiliate programme and a client-logo carousel — revisit once there is traffic to affiliate.

### B8.6 Fabrilife teardown — DO NOT COPY (their mistakes)
| # | What they do | Why we refuse it |
|---|---|---|
| 15 | **Entry interstitial** — a full-screen bKash offer blocks the first page of a session | The owner has already banned entry pop-ups. This confirms the decision. |
| 16 | **`user-scalable=no` site-wide** — pinch-zoom disabled everywhere | On a clothing site that stops a customer inspecting the fabric. **We keep real zoom** — and we have already fixed accidental zoom (16px fields, global `touch-action`) **without disabling real zoom.** |
| 17 | **A strikethrough price and a % off badge on every single product, all the time** | That is a discount-brand playbook. It is the opposite of the premium, classy positioning EXTAS is going for, and permanent discounts stop reading as discounts. **No always-on strikethrough price.** Discounts are shown when a real, dated campaign is running — see PICK item 3. |
| 18 | **A pre-ticked terms checkbox** | Weak consent, and it hides the returns rule the customer most needs to read. Ours is unticked and the rule is stated in plain words at the point of commitment. |
| 19 | **No colour selection — each colour is a separate product URL** | Part of why they have 2,176 products. It splits the SEO value of one style across many near-identical pages and makes the customer hunt. **Ours keeps one product with colour selection.** |
| 20 | **Checkout with no validation at all** — junk typed into name, email and phone produced no message of any kind | Ours has live validation with plain-language messages and a CTA that says what is missing. |

### B8.7 Their two open flanks — where EXTAS wins
**Speed.** Measured at 390 × 844: LCP **13.7 s** on the homepage, **11.9 s** on a category page, **11.3 s** on a product page. Homepage 2.87 MB over 156 requests; the cart page 5.66 MB; the desktop homepage **13.45 MB**. Five of their own CSS/JS files are served with the wrong content type and refused by the browser on every load, and seven page loads returned HTTP 502 during the walk.

**Target for EXTAS: LCP under 2.5 s on a 4G phone, enforced in CI.** This is the single largest gap available and it is exactly the owner's "super fast site" principle paying off.

**SEO.** They have no `<h1>` or `<h2>` on the homepage, category pages or product pages. No canonical, no hreflang, no `sitemap.xml`, **no blog**, and no on-page copy on category pages. A competitor this large with no content programme is an open door for the owner's 50%-organic goal.

### B8.8 Where EXTAS is already ahead — do not trade any of this away
Multi-image gallery with labelled views including True colour · the model's height/weight/size chip · colour selection with the colour described in words · Find my size · the fit-from-reviews bar · the stock and cut-off message · delivery charge, time and free-delivery threshold stated on the product page · real on-page reviews with verified buyers' height, weight and size · on-page Q&A · WhatsApp as a named channel with hours, including "send my bag on WhatsApp" · the free-delivery progress line · save for later · sets and combos with automatic pricing and tier building · Order Now skipping the bag · the stepped checkout · live validation with plain-language messages · a CTA that says what is missing · delivery zone inferred from the typed address instead of a 72-option dropdown · the door-refusal rule and the returns rule stated in plain words at the point of commitment · Nagad · payment icons in the footer · filter chips and sort · breadcrumbs and real H1s · the EN/বাং toggle · the promo strip carrying the two decisive facts.

### B8.9 PR impact
**+4 PRs:** popular-search chips from real search data (1) · multi-size on one cart line (1) · the Smart-Rules-driven payment campaign slot in checkout (1) · the bulk / corporate order enquiry page (1).

Folded into existing PRs at no extra count: the category meta template with the lowest price · Bengali policy pages · progressive zoom image loading · schema emitted only from real reviews · the LCP budget in CI.

### B8.10 Open — needs the owner's decision
14. **Which competitors to track:** Fabrilife is done. Which 2 to 4 other Bangladeshi menswear sites should go on the saved list, and how often should the teardown re-run — weekly or monthly?
15. **Trade licence number:** please give the real trade licence number to print in the footer (PICK item 7), since the demo currently carries a placeholder.

## B9. PR register inside the backend (V2 · S21 · PR 594)

**Owner, 19 Oct 14:59–15:05 and 22:54 (Note 33, 46).** An admin section lists every stage and every PR with its
full details: what it does, scope added later and when, owner decision, status (built / parked / in demo / in
code / live), owning agent, demo page link. Click a PR for the full card; search (number, English, Bengali) and
filters; history of updates per PR; **"report a problem on this PR"**, which opens a task for the owning agent
through the chief (with a Telegram preview). **Generated from the master register on every build**, so new PRs
appear by themselves and nothing is typed twice.

- **Files:** the latest full blueprint (highest version marked latest), the master register and the supporting
  files (round notes, plans, research, checklist, QA reports, agent protocol) — read inside the admin with contents
  and search, downloadable, with version history; backed up to Google Drive; no personal data, no third-party
  skill copies.
- **Automatic:** new stages and PRs appear with the date first seen; each new PR shows which earlier PRs it builds
  on and raises a dated notification; growth of an existing PR's text is recorded as an "updated" entry; a helper
  flags new PRs that look like scope on an older one (for Gyani to merge); an unseen-update counter on the page and
  in the sidebar.
- **Change process:** see "How changes are made after V2".
- Demo: `#/admin/register` (`96-admin-register.js`), data `04-register-data.js`, `04b-docs-data.js`, generator
  `tools/make-register.py` with `tools/register-state.json` (idempotent; privacy filter).

---

# Part C · AI, marketing and imagery

> **V2 · what changed in Part C.** The agent team is now seven fixed agents with a chief (new C10, replacing the
> C3.1 job list as the org chart). The blog becomes the main traffic engine (new C11). The Google traffic plan
> (new C12) sets `/` + `/bn`, the WordPress migration and Merchant Center. Product naming and URL control is new
> C13.


## C1 · AI 360 Control Room (S15)

> **V2 · 19 Oct.** S15 is now **48 PRs** (304–341, 506, 577–585). PR 506: the whole site works with AI off (proof
> tab in the demo). PR 577–585: agent profiles, reports, curriculum, model auto-suggest, Tirondaj, memory, chief,
> Telegram routing, learning engine (C10). Demo: `#/admin/ai` (`83-admin-ai.js`), `#/admin/agents` and
> `#/admin/agents/<id>` (`89b-admin-agents.js`).


**Status: Locked.** Sections 12–20 of the decision record were locked by the owner on 2026-10-17; nothing in this
section is to be re-opened or re-asked. It goes into the build exactly as written.

### C1.1 What AI 360 is

AI 360 is the **control room** for every piece of AI in the business. Individual AI engines live in their own stages
(the site auditor is S21, the photoshoot engine is S24, the social studio is S23, and so on), but **the control of
every one of them is in AI 360**.

The governing rule, set when the site-audit placement was corrected:

> **The engine may live in its own stage, but every AI switch and report appears in AI 360.**

So the owner never hunts through the dashboard to find out what the AI is doing, what it costs, or how to stop it.
One screen answers all of it, for the whole business — text, images, video, support, marketing, audits.

### C1.2 The AI 360 home screen

The home screen lists, for every agent at once:

- what the agent is doing right now;
- which **company (provider) and which model** it is using;
- **today's spend and this month's spend** for that agent;
- a **pause button on each agent**, so one agent can be stopped without stopping the rest.

### C1.3 The master switch, per-agent switches and keep-on behaviour

- There is a **master AI switch** for the whole business.
- Every agent also has its own switch.
- **Keep-on behaviour:** an individual agent can be left **running even when the master switch is off**. This was
  confirmed explicitly for the Photoshoot agent — "the owner can leave the Photoshoot agent running even with the AI
  master switch off, **as with any agent**" — so keep-on is a property of every agent, not a special case.

### C1.4 The AI-off principle (deterministic core first)

**AI is additive. The shop runs without it.** This is a build rule, not a preference:

- Every AI-driven step has a **rule-based or template-based fallback** that runs when AI is off. Marketing is the worked
  example: AI chooses the audience, writes the copy, picks the timing and sets the discount — but **with AI off, saved
  templates and fixed rules still run** and the campaign still goes out.
- The same applies to incomplete-order follow-up: AI off → saved templates and fixed rules still run.
- Same for the photoshoot module: when the Photoshoot agent's monthly cap is reached, **new generations pause while
  everything already approved stays live and the shop keeps running normally.**

Build consequence: the deterministic path is implemented and tested first in every feature; the AI path is layered on
top of it and can be switched off at any time without breaking the feature.

### C1.5 Multi-provider and per-agent model choice

> **V2 · 19 Oct — PR 580, Note 17.** For every agent job the system suggests a model with its reason; the owner
> accepts or changes it. Free models are qualified against each job's test set; the cheapest model that passes the
> bar is suggested. The page shows quality per candidate, cost per 100 runs, monthly saving, last test date and
> "re-test now". Cost control never lowers quality.


- AI providers are handled through an **adapter pattern**, the same mock → sandbox → live pattern used for payments and
  couriers, with **two or three providers behind one interface**, so the owner can switch on price or quality without a
  rebuild.
- **Everything is dynamic** — provider/company, which AI package or model is used, the quality tier, and the settings
  behind them. Nothing is hard-coded.
- **Model choice is per agent and per job**, changed from the AI Cost Book row itself (see C2), with no hunting
  through settings screens.
- **Image and video model choice lives on the same AI 360 screen as the text models.** One place answers "which company,
  which package, for which job" for the entire business.
- **Recommendation notes:** Claude's choice is always the default. When the owner changes a setting, an inline note
  immediately explains the effect — "this is the best setting for the output you want", or "this change is fine too —
  slightly lower cost, no visible quality loss". The system guides instead of silently obeying, so **the owner cannot
  make a silent mistake.**
- **Verify provider model names, parameters, pricing, rate limits, retention and commercial terms from the official
  documentation at implementation time.** No figure written in this blueprint is to be trusted as current.
- **Free / OpenRouter-style models are a hard no in production.**

### C1.6 Schedules and spend caps

- Every AI job and every scheduled run (including the S21 multi-angle site audit) has its **schedule, its on/off switch
  and its reports inside AI 360**.
- **Every agent has its own monthly spend cap.** Worked example, the Photoshoot agent: at **80% of the cap a Telegram
  warning** goes out; at **100% new generations pause**, already-approved output stays live, and the shop is unaffected.
- A **hard spend cap is shown and enforced before any batch runs** (product count, views, tier, estimate, retry buffer,
  cap).
- All spend, from every agent, writes to **one `ai_usage_ledger`**, which feeds the Costs section, the month-end close
  sheet and the ERP push. **Photoshoot cost is not a separate pot of money.**

### C1.7 The rest of the AI 360 screens

| Screen | What it does |
|---|---|
| **Owner's bug/question box** | The owner writes a problem or question in plain Bengali. The AI investigates, explains the cause, proposes the fix and asks for approval. Ties into S21 (site audit). |
| **Skill library** | Replaces and absorbs the old "training panel". Each skill is a card: name, purpose, which agent uses it, on/off. |
| **Import a skill from outside** | The owner pastes a document, a link or an instruction set and says "learn this". The AI converts it into a skill and **shows what it understood**. Sandbox test before it goes live, one-click rollback, and corrections become training examples. |
| **Permission matrix** | Per agent, what it may touch: orders, stock, prices, courier, money, customer data, code. |
| **Approval queue** | Everything the AI wants to do but needs permission for collects in **one queue the owner clears in one pass**. |
| **AI diary** | A plain-Bengali log of everything the AI did today, written for the owner — not a technical log. It includes the day's photoshoot activity. |
| **AI Cost Book** | See C2. |

### C1.8 Continuous skill training (standing requirement)

> **V2 · 19 Oct.** Outside skills are imported into each agent's library, marked for the agent they serve
> (`agents/skills/<agent>/ext/`, Note 16.1). Curriculum and exams (PR 579), the continuous learning engine with its
> quality gate (PR 585) and strong memory (PR 582) are in C10.


The agents are not static. The skill library is the training mechanism and it runs continuously:

- the owner (or the AI itself) **imports new skills** from any document, link or instruction set at any time;
- every skill is **sandbox-tested before it goes live**, and can be **rolled back in one click**;
- **every correction the owner makes becomes a training example** for the agent that made the mistake;
- the Analyst agent **tells the other agents what worked and what did not** (C3), so the whole team improves from
  measured results;
- the incomplete-order loop and the marketing loop explicitly **learn from what converted and adjust**;
- the AI Cost Book's estimate-vs-actual loop (C2) is the same principle applied to money — the system corrects its own
  numbers from real usage.

---

## C2 · AI Cost Book and the cost calculator

**Status: Locked** (approved 2026-10-17, inside the locked 12–20 block).

### C2.1 The question it answers

A page inside AI 360 that answers, **before any money is spent**: *what does each AI job cost, and which model should it
use?* Every AI job in the whole website is listed, point by point, each with Claude's recommendation and an estimated
cost, **searchable**, so the owner can look up "image generation" or "support reply" whenever he wonders.

### C2.2 Shape of the book

One searchable table. Realistically **60–90 job types**, not 250, grouped by section: **Support · Orders · Marketing ·
Social · SEO & blog · Site audit · Reports · Admin helpers**, plus a row for **every photoshoot and video sub-job**
(ghost mannequin, try-on, detail re-projection, upscale, finishing, detail finder, quality scoring, image-to-video,
reel assembly).

Each row shows:

| Column | Content |
|---|---|
| **Job** | e.g. "write one blog article", "reply to one support message", "transcribe one voice note", "parse one address", "write one reel caption", "build one reel", "generate one product description", "daily report", "fraud judgement" |
| **What it does** | One plain line |
| **Recommended model and why** | Small/cheap model for simple classification and parsing; mid model for writing; large model only where real reasoning is needed. **The recommendation is the point of the page, not decoration.** |
| **Estimated cost per run** | In ৳ |
| **Typical runs per day / month** | Giving an estimated monthly cost |
| **Alternatives** | The same job on other companies' models, with their costs, so quality can be traded against price |
| **Model selector** | Change the model **in the row** — it takes effect immediately. No hunting through settings. |

### C2.3 What makes it self-correcting

- **Estimate vs actual, side by side.** Before launch the estimate comes from a **measured sample run of each job on
  staging**. After launch the **real token usage is recorded per job type** and the "actual" column fills in. The book
  corrects itself and stops being a guess; the owner sees where reality beat or broke the estimate.
- **"What if" slider.** "If I post 3 times a day instead of 1" → the monthly total updates live. Same for articles per
  week, support volume, order volume.
- **Three one-click presets — Economy / Balanced / Premium.** Each sets the model for every job at once and shows the
  new monthly total and what quality changes. This is how a non-technical owner controls cost without studying model
  names.
- **Top-10 most expensive jobs always visible**, because that is where savings actually are.
- **Daily report line:** today's AI spend broken down by job type, feeding the daily report and the AI 360 budget caps.
- **Provider price table is editable and refreshable**, because model prices change; a price change updates every
  estimate in the book.

### C2.4 Honest notes printed on the page itself

- Text jobs are cheap. **Image generation is far more expensive. Video assembly costs server time rather than tokens.**
  Voice transcription is cheap. The page states this plainly so the owner's intuition is right.
- Estimates carry a **±10–15% band at first, tightening to a few percent once real usage data arrives.** Claiming 1–3%
  accuracy before any usage exists would be dishonest, and the page does not claim it.

### C2.5 The free-form cost calculator

Beside the per-job table sits a **calculator the owner drives in his own words**: he describes a piece of work and gets
a cost before committing.

It must answer questions like:

- "10 blog posts, about 1,200 words each, 3 images each, on this model — what will it cost?"
- "20 reels generated this month — what will it cost?"
- "1,000 customer support conversations this month — what will it cost?"
- "Product descriptions for 300 new SKUs"
- "Rewrite the SEO text for the whole catalogue"
- "20 products × 5 colours × 3 images at best-of-2 — what will it cost?" (photoshoot questions are answered directly)

Behaviour:

- **Fields adapt to the job type chosen** — words and images for an article; length and clips for a video; messages per
  conversation for support; number of SKUs for descriptions.
- **Output:** cost per unit, total, **the same total on 2–3 alternative models side by side**, and a one-line
  recommendation ("this job does not need the big model; the mid model saves 70% with no visible difference").
- **"Save as plan"**: the estimate is kept, and when the work actually runs the real cost is compared against it, so the
  owner sees whether the estimate held. This feeds the same learning loop as C2.3.
- **Reachable from Telegram** — the owner asks the question in plain Bengali and gets the estimate back.

### C2.6 Caps (summary)

- Per-agent monthly cap, set in AI 360. 80% → Telegram warning. 100% → that agent's new work pauses; approved work stays
  live; the shop is unaffected.
- Hard spend cap shown and enforced before any batch job runs, with the retry buffer included in the estimate.
- One shared `ai_usage_ledger` for every AI spend in the business → Costs section → month-end close → ERP push.
- **Idempotency key per logical request** and duplicate-job protection, so nothing is ever charged twice.
- **Approved output is reused** rather than regenerated, unless the source image, the model, the settings or the
  provider version changed.
- For images, the headline metric is **cost per APPROVED image, not per generated image**.

### Open — needs the owner's decision (C2)

1. **Data-class routing:** which classes of our data may be sent to which classes of model? For example — may full
   customer names, phone numbers and addresses be sent to an external model for support replies and address parsing, or
   should they be masked first and only the order text sent? A one-sentence answer ("mask personal data before it leaves
   the system" / "send it as-is to approved providers only") is enough to build the rule from. No rule for this was
   recorded in the approved decisions.

---

## C3 · The agents and their jobs

> **V2 · 19 Oct — the eleven jobs below are now carried by the seven fixed agents (PR 577, 581, 583, 593).**
> The jobs, their permissions and the approval queue stay; who does them changes:
>
> | V1 job | Owning agent now |
> |---|---|
> | 1 Head of Growth | Gyani (chief) sets targets; Doot (organic, CRM) and Tirondaj (paid) own the channels |
> | 2 Social content agent | Doot (S23) |
> | 3 Creative agent | Gyani (S24/S25 studio) with Shilpi for design |
> | 4 SEO & blog agent | Doot with the five author agents A360-08…12 |
> | 5 Performance agent | Tirondaj (A360-07) |
> | 6 Community agent | Gyani (S22 support), comment/DM ingestion with Doot (S23) |
> | 7 Analyst agent | Gyani (S15 analytics commentary, PR 333) |
> | 8 AI growth agent (PR 269) | Tirondaj |
> | 9 EXTAS AI (support, incomplete orders) | Gyani (S22); incomplete-order follow-up with Doot (S13 PR 274–276) |
> | 10 Photoshoot agent | Gyani (S24/S25) |
> | 11 Site audit agent | Prohori (S21, PR 570) |
>
> The mapping follows each agent's owned stages (`agents/*.md`); C10 has the full org chart.


**Status: Locked** (the agent team was approved on 2026-10-17 inside the locked block).

Every agent is defined in the **AI 360 skill library** with a named role, its own skills, its own permissions and its
own target. The owner's instruction on how the roles are written: the marketing and SEO agents are defined as **"a
PhD-level digital marketing specialist with large-scale e-commerce experience"** — **an operator with a target, not a
text generator.** It owns its channel, sets its own experiments within the owner's rules, and reports results.

### C3.1 The team

| # | Agent | What it does | What it may decide alone | What needs the owner |
|---|---|---|---|---|
| 1 | **Head of Growth** (PhD-level digital marketing specialist, large e-commerce experience) | Owns the sales target. Sets the channel mix and the budget split, reads **delivered ROAS**, directs the other agents. | Channel mix and experiments inside the owner's rules and budget. | Any move outside the budget or the permission matrix. |
| 2 | **Social content agent** | Plans the content calendar, picks which products to post, writes hooks and captions in the Bangladeshi mix of Bangla and English that actually performs locally. | Calendar, product selection, copy — within the per-platform rules. | Publishing, where the platform is set to "require approval"; anything needing trending audio (lands in drafts). |
| 3 | **Creative agent** | Assembles reels and image posts from the product library using the brand templates. | Template choice, assembly, variants. | Publishing; new brand templates. |
| 4 | **SEO & blog agent** | Topical clusters, articles, schema, answer-engine work. | Cluster plan, article drafts, internal linking, schema. | Publishing is subject to the mandatory quality gates. |
| 5 | **Performance agent** | Ad campaigns, audiences, budget moves, alerts. | Within the permission matrix only. | Budget moves and campaign changes outside the matrix. |
| 6 | **Community agent** | Reads comments and DMs on Facebook, Instagram and TikTok and **routes them into the Support Inbox**, so a comment asking "price?" becomes a conversation and then an order. | Routing and classification. | Replies that commit the business (price change, refund, exception). |
| 7 | **Analyst agent** | Measures everything, reports to the owner, and **tells the other agents what worked and what did not**. | Measurement and reporting. | — |
| 8 | **AI growth agent** | Watches **delivered ROAS by campaign, product and district**; proposes budget moves, audiences to build and creatives to refresh; writes the copy; **flags a campaign spending with no delivered orders**. | Proposals, copy, analysis. | **Executes only what the owner approves, or what the permission matrix allows.** |
| 9 | **EXTAS AI (support and incomplete orders)** | Runs the incomplete-order recovery loop end to end (see C6.3), and answers support. | Scoring, channel choice, message wording, whether an offer is needed and how much — **margin-checked against ERP cost** — within the two-message ceiling. | Anything outside its permission row. |
| 10 | **Photoshoot agent** (S24/S25) | Registered in AI 360 as a named agent with its **sub-jobs listed separately**: ghost mannequin, try-on, detail re-projection, upscale, finishing, detail finder, quality scoring (plus the video sub-jobs in S25). | Generation inside the approved shot plan, tier and cap. | **Every image. Approval is mandatory and permanent** — nothing publishes unseen. |
| 11 | **Site audit agent** (S21 engine) | Scheduled multi-angle audit — customer, admin, accountant, warehouse — across many devices, produces a report. | Running the audit and reporting. | **Fixes are approval-gated.** Schedule, on/off and reports live in AI 360. |

### C3.2 Permissions

Permissions are set in the AI 360 **permission matrix**, per agent, over: orders, stock, prices, courier, money,
customer data and code. Worked example, locked: **the Photoshoot agent may write to media only — never to price, stock,
orders or customer data.**

Everything an agent wants to do but may not do alone lands in the **single approval queue**, which the owner clears in
one pass.

### C3.3 Continuous skill training

Stated again here because it is one of the owner's standing requirements, and it applies to **every agent in the table
above**: skills are cards in the AI 360 skill library; new skills are imported from any document, link or instruction
set with the command "learn this"; the AI shows what it understood; each skill is sandbox-tested before going live and
can be rolled back in one click; **every correction the owner makes becomes a training example**; and the Analyst agent
feeds measured results back to the other agents so the team keeps improving.

---

## C4 · Organic growth — SEO, AI answers, YouTube, blog

> **V2 · 19 Oct.** Read with C11 (blog engine) and C12 (Google traffic plan). FAQ rich results ended for all sites
> on 7 May 2026: FAQ content stays for customers and AI answers, markup optional, no rich result promised (PR 224).


**Status: Locked.** This is one of the owner's standing requirements: *super SEO — Google, Bing, YouTube, AI assistants.*

### C4.1 The target and the honest timeline

Target: **50% of total sales from organic** — Google, Bing, YouTube and AI assistants. Achievable for this niche, but it
is a **12–18 month build, not a launch feature**. The realistic shape, which must be written plainly in the blueprint so
the owner plans his cash around it:

| Period | Organic share of sales |
|---|---|
| Months 1–3 | ~5% |
| Months 4–8 | ~15–25% |
| Months 9–18 | toward 50% |

**Paid ads carry the business until then.**

### C4.2 Product-page content architecture

- **Above the fold: selling only.** Images, price, colour, size, Find my size, Add to Bag. **No SEO paragraphs.** 95% of
  visitors are on phones and a wall of text kills the sale.
- **Below: collapsible sections, server-rendered so Google reads them even while closed** — Fabric & care · Size & fit
  (the chart) · Delivery & exchange (pulled from Smart Rules) · Questions · Reviews.
  **Build rule:** accordions are SEO-safe only when the text is already in the HTML. **Text loaded on click is never
  done.**
- **The Questions block is the real weapon** — real customer questions with short factual answers, marked up as
  **FAQPage**. This is what Google shows and what AI assistants quote.
- **No keyword-stuffed article on the product page.** It does not rank any more and it lowers conversion. Long-form
  content lives in the **blog** and on **category pages** (intro above the grid, guide plus FAQ below it).
- Admin keeps a **separate SEO panel per product** — title, description, focus keyword, extra facts — **not shown to
  shoppers.**

### C4.3 Answer-engine optimisation — being the brand AI assistants recommend

Bangladeshi buyers increasingly ask an AI "best polo under ৳1500 in Bangladesh". To be that answer:

- **Clean, consistent, machine-readable facts**: Product, Offer, AggregateRating, FAQPage and Organization schema, with
  accurate price and stock (the schema engine itself is S11).
- **Content written in quotable shape**: question-style headings, short factual paragraphs, comparison tables, and clear
  statements — e.g. *"EXTAS polos are 220 GSM combed cotton piqué, S to XXL, exchange within the stated window."*
- **A machine-readable site summary** (`llms.txt`-style) describing the brand, the categories, sizes, policies and
  delivery.
- **AI-crawler policy switch** in robots.txt for GPTBot, ClaudeBot, PerplexityBot and Google-Extended. Blocking them
  means never being cited; allowing them is how a small brand gets recommended. **Recommended: allow — and make it a
  switch** the owner can flip. (See Open item below.)
- **Track referrals from AI assistants separately** in analytics, so the owner can watch this channel grow.

### C4.4 YouTube

Second-biggest search engine and heavily used by Bangladeshi men.

- **Per product**: a short clip — fabric close-up, fit on a model, how it moves.
- **Evergreen videos**: "how to measure your size", "polo vs T-shirt", styling.
- Video **embedded on the product page with VideoObject schema**.
- Description **links the product with a tracked URL**, so **YouTube-driven sales are attributable**.
- A **YouTube module** handles per-product video, VideoObject markup, channel sync and **video → product attribution**.

### C4.5 Blog that actually sells

> **V2 · 19 Oct.** Replaced in scale by C11: 3 and up to 5–6 posts a day, an agent pipeline with a second-author
> proofread, house ads and a care-guide link on every product page. The selling rules below still apply.


Three content types, in this priority order:

1. **Buying intent** — "best polo shirts in Bangladesh", "polo vs T-shirt", "which size will fit me".
2. **Problem solving** — "how to stop a collar curling", "washing a white shirt".
3. **Brand story.**

- **Topical clusters:** one **pillar page per category** with supporting articles all linking to it. This is what makes
  a small site rank against big ones. A **topical cluster planner** is built into the blog: pillar + cluster map, with
  **internal link enforcement**.
- **Every money article carries a product block.**
- **Cadence: quality over volume.** Three or four genuinely good articles a week beats twenty thin ones; **mass thin AI
  content is actively penalised now.** The content quality gates already specified in the plan stay **mandatory**.

### C4.6 What gets built (+5 PRs)

> **V2 · 19 Oct.** S12 is now **22 PRs** (239–253, 528–530, 547, 591–593); S11 is **22 PRs** (220–238, 527, 586,
> 588). See Appendix A.


1. **PDP content architecture** — collapsible server-rendered sections, FAQ block, FAQPage schema.
2. **Answer-engine pack** — machine-readable site summary, AI-crawler policy switch, quotable-content rules, AI-referral
   tracking.
3. **YouTube module** — per-product video, VideoObject, channel sync, video → product attribution.
4. **Topical cluster planner** in the blog — pillar + cluster map, internal link enforcement.
5. **Organic revenue dashboard** — organic share of sales against the 50% target, broken down by source: Google, Bing,
   YouTube, AI assistants.

### Open — needs the owner's decision (C4)

1. **AI crawlers:** should GPTBot, ClaudeBot, PerplexityBot and Google-Extended be **allowed** to crawl the site from
   day one? (Claude recommends yes — it is the only way to be recommended by AI assistants — and it is built as a switch
   either way.)

---

## C5 · S23 · Social & content studio

**Status: Locked** (approved 2026-10-17). **S23 is its own stage, +7 PRs.**

### C5.1 What each platform actually allows (honest, and it shapes the build)

| Platform | What the API allows | Consequence for the build |
|---|---|---|
| **Facebook Page** | Full API publishing — photos, videos, links, scheduling. | Fully automatic. |
| **Instagram** (Business account linked to the Page) | API publishing of feed photos, carousels, videos, **Reels** and Stories. Daily publishing limit ~50 posts / 24h. | Fully automatic, with the limit enforced in the scheduler. |
| **TikTok** | The Content Posting API can push a video **into the account's drafts** immediately. Fully automatic direct posting needs TikTok's **app audit approval**. | **Semi-automatic until that approval comes.** Build both paths: draft now, direct posting switched on when approved. |
| **YouTube** | API upload works for normal videos and Shorts. Daily upload quota is small (a handful a day) — fine for this business. | Automatic, quota-aware. |

**The music catch, and it matters:** content posted through an API **cannot use the platform's in-app licensed music**
(trending audio). Only royalty-free tracks we own. On Reels and TikTok, trending audio is a large part of reach.

**Therefore the design is hybrid, and this is the rule:**
the AI builds the video, writes the caption and schedules it; **where trending audio matters, the post lands in drafts
and a person taps publish in the app with the sound. Everything else publishes automatically.**

### C5.2 How the AI "makes" video (honest)

**Not by generating footage with a video model** for social posts — that is expensive, inconsistent, and would not show
EXTAS's actual garment. Instead: **template-based assembly** from our own product photos and short clips — motion, cuts,
text overlays, price card, brand frame, royalty-free track. Reliable, cheap, on-brand, and it shows the real product.

The AI writes the hook, the caption and the hashtags, and chooses which products to feature; a human-quality creative
template does the rest.

**AI voiceover in Bengali: optional, off by default until the owner hears it and approves it.**

### C5.3 Automatic vs queued for approval

- Each platform has its own setting: **require approval before anything goes out, or let it run free.**
- **Always queued (never automatic):** anything that needs trending audio → TikTok/Instagram drafts for a person to
  publish; TikTok direct posting until app audit approval exists; Bengali AI voiceover until the owner has approved the
  voice.
- **Automatic when the platform is set to run free:** Facebook Page posts, Instagram feed/carousel/video/Reels/Stories
  within the daily limit, YouTube uploads within quota, and the whole calendar and scheduling layer.
- **Approval queue:** the studio's own queue, surfaced in the AI 360 approval queue, so the owner clears everything in
  one pass.
- **Daily cadence example to configure:** 3 posts a day spread across categories, plus 1 reel.

### C5.4 Where it lives, and its wiring

S23 is a module of its own because it carries an asset library, templates, a calendar, an approval queue and four
publishing adapters. Following the AI 360 rule, **all of its switches, schedules, spend and reports appear inside
AI 360** — the owner never has to go hunting.

### C5.5 What gets built (+7 PRs, S23)

1. **Studio core** — brand asset library, templates, rules (2 PRs)
2. **Video assembly engine** — reels, shorts, image posts (1 PR)
3. **Publishing adapters** — Facebook Page, Instagram feed/reel/story, TikTok draft + direct, YouTube (2 PRs)
4. **Content calendar, approval queue, auto-schedule rules, per-platform limits** (1 PR)
5. **Comment and DM ingestion** from Facebook, Instagram and TikTok into the **Support Inbox** (1 PR)

### C5.6 Honest note on sales — how to judge this module

Social posting **builds awareness and feeds retargeting pools; it is rarely the direct sales engine on its own.** The
sales engine for this business is: **ads optimised on delivered orders + organic search + follow-up on incomplete orders
and chats.** The social studio makes those three cheaper and stronger. **It should be judged on assisted sales, not on
likes.**

### Open — needs the owner's decision (C5)

1. **Per-platform publishing mode at launch:** which of Facebook, Instagram, TikTok and YouTube may post
   **automatically** from day one, and which should **wait for his approval** on every post? (Both modes are built; this
   is just the opening setting.)

---

## C6 · Marketing

> **V2 · 18–19 Oct.** S13 is now **35 PRs** (254–283, 531–532, 548, 569, 589). Paid ads belong to Tirondaj (A360-07)
> inside code-enforced guardrails: target sales, max cost per purchase, daily/monthly ceilings, auto-decrease
> allowed, **any budget increase only after the owner's approval**, kill switch, every change logged (PR 581). Full
> campaign control from the dashboard (PR 531); deep conversion feed with courier outcomes (PR 532); the Facebook
> feed is generous: successful deliveries and orders that went to the courier untouched, holding back only what
> was cancelled or marked bad (§59.2); geography-led ad guidance (PR 569); market and competitor intelligence from
> public pages only (PR 548); Merchant Center feed and Bangladesh test after go-live (PR 589). Demo: `#/admin/ads`
> (`93-admin-ads.js`).


**Status: Locked** (sections 14–16 and 19.0 approval).

### C6.1 What already exists in the marketing module, and what was added

**Already in the plan:** SMS gateway with masking ID and cost tracking · WhatsApp templates · transactional email ·
automation flows (order confirmation, shipping, abandoned cart, review request, birthday, win-back, re-order reminder) ·
customer profile · RFM segments · tags · send-to-top-customers · coupons · campaign builder · ad analytics and
three-level ROAS.

**Added and approved (S14 grows from 11 to 16 PRs):**

1. **Journey builder** — the owner draws his own multi-step follow-up flows.
2. **Email marketing proper** — newsletters, campaigns, templates, open and click tracking.
3. **AI campaign writer** — 2–3 versions of each SMS/email copy.
4. **AI segment and timing selection** — who will actually buy and when to send, instead of blasting everyone.
5. **Marketing calendar** — Eid, Puja, Pohela Boishakh, winter — with **per-campaign spend vs delivered revenue**.

**AI is wired into every marketing step** — who to send to, what text, when, how much discount (**margin-checked against
ERP cost**), and learning from the result. All of it sits under AI 360 switches, **with rule-based fallback when AI is
off.**

### C6.2 Ad marketing — the 2026 approach

**The honest headline: in 2026 the money is in signal quality, not in slicing audiences thinly.** Meta and Google now
optimise better than hand-built audiences when they are fed clean, complete, server-side events — but they optimise
towards whatever we tell them is success, and **for a COD business the default target (checkout) is the wrong one.**
So:

1. **Delivered-purchase as the optimisation event** (already in the plan): fire **OrderConfirmed** and
   **OrderDelivered** server-side, and let the platforms learn from **parcels actually accepted**, not COD orders that
   get refused. *This single change is worth more than every audience trick combined for a Bangladeshi COD shop.*
2. **Richer stage events, server-side and deduplicated** (+1 PR): viewed → added to bag → began checkout → typed phone →
   typed address → reached payment → abandoned → ordered → confirmed → shipped → delivered → refused → exchanged. **Each
   with value, category, size and colour.** These are what make any later audience or report possible.
3. **Audience Builder in our own admin** (+2 PRs): the owner picks conditions from **our** database — "incomplete orders
   last 7 days", "bought in last 30 days", "added to bag but never bought", "VIP", "buys size L", "refused a parcel" —
   sees the count, and pushes it as a **hashed custom audience** to Meta, Google and TikTok, **refreshed daily**.
   Campaigns then target or exclude those lists directly, and connect to a landing page with the **UTM wired
   automatically**.
4. **The exclusion list is the quiet money-saver.** People who refused parcels are **automatically excluded from ad
   spend**. Almost nobody in this market does it; it cuts wasted spend and lowers the return rate at the same time.
5. **Value-based lookalikes seeded on delivered revenue**, never on order count.
6. **AI growth agent** (+2 PRs) — see C3.1 row 8.
7. **Daily report extension** (no new PR): a line for **what the AI itself produced** — follow-ups sent, replies,
   incomplete orders recovered, **taka of sales generated by AI follow-up**, chat-to-order conversions, and the running
   total.

### C6.3 Incomplete orders / abandoned carts — approved, and this must be built as written

- **Capture as they type.** Every field at checkout is saved to the server as a **draft order as it is typed**
  (debounced), tied to a **first-party browser id** and, as soon as it is typed, to the **phone number**. So a customer
  who types the phone and address and then closes the tab **is captured**.
- **Honest limit:** we can only keep what the customer actually typed. If they typed nothing, we have the cart and the
  browser id only — then follow-up is on-site and through ad retargeting, **not SMS**.
- **Stage recorded:** cart only → typed phone → typed address → reached payment → left. **The further they went, the
  hotter the lead.**
- **Incomplete orders list in admin:** what is in the bag, value, how far they got, how long ago, which channel or
  campaign brought them, and one-click **WhatsApp**, **create the order**, or **hand to an employee**.
- **Follow-up ladder (rule-controlled, never spam):** about **1 hour later** a WhatsApp or SMS —
  *"আপনার ব্যাগে ২টা পোলো রাখা আছে"* — with a link that **restores the exact bag**; if still nothing and the rules allow,
  **one offer after 24 hours**; then stop. **Maximum two messages, ever.**
- **EXTAS AI owns this loop**, with these skills defined in the AI 360 skill library: score which incomplete orders are
  worth chasing · pick the channel (**WhatsApp → Messenger → SMS → on-site**) · write the message in the customer's own
  language and tone · decide whether an offer is needed and how much, **margin-checked against ERP cost** · respect the
  two-message ceiling · learn from what converted and adjust. **AI off → saved templates and fixed rules still run.**
- **Drafts are deleted on the retention schedule** like any other personal data, and **the privacy page says plainly**
  that an unfinished checkout is kept so we can help complete it.

### C6.4 Autofill capture — approved, must be built (the owner was explicit)

A new visitor clicks the name box and the browser or phone fills in name, phone and address from its own saved data.
**We capture those values even though the customer typed nothing**, and save them as a draft order exactly like typed
input.

**How:** listen for the browser's autofill — input/change events plus the autofill style hook — and read the field
values on first interaction, then save the draft.
**Build note:** Chrome only exposes autofilled values to the page **after the visitor interacts with it**, so capture
happens on that first click — which is exactly the moment the owner described.
**Disclosed in the privacy policy.**

### C6.5 Autofill on return

Name, phone and address are remembered **in the browser** and, for logged-in customers, **on the server**, so the
checkout fills itself next time. **Standard browser autofill is supported properly as well.** (+1 PR in the checkout
stage, together with draft capture.)

### C6.6 PARKED · Birthday marketing

> **V2 · 18 Oct.** Still parked. "Continue with Facebook" login is **not** built (§59 answer 58), so there is no
> automatic birthday source; the birthday field capture (PR 301) stays.


**Parked, not cancelled.** Goes into **Appendix F · Parked modules — built only when the owner asks**, with the full
specification below.

**Why it is parked:** the owner's words — *too much effort for a manual-collection feature; he would only want it if it
were automatic.* **−2 PRs** from the build.

**The honest limits that caused this** (the owner must know them):

- **Messenger / Facebook do NOT give us a customer's birthday.** The Page messaging API returns name, profile picture,
  locale and timezone — not date of birth. Birthday is only available through **Facebook Login with the `user_birthday`
  permission**, which the person must grant and which needs **Meta App Review**.
- **WhatsApp gives nothing but the phone number and profile name.** No birthday.
- **Cookies cannot contain a birthday.** A cookie only holds what our own site put there. There is no way to read a
  birthday out of a browser. Any vendor claiming otherwise is guessing or buying data.
- Therefore birthdays **have to be asked for** — cleverly, and most customers will give it for a gift.

**The full parked specification (five collection routes):**

1. **Optional field in My account** — *"জন্মদিনের তারিখ দিন, প্রতি বছর উপহার পাঠাবো"* — with the reward stated
   (e.g. a ৳200 birthday coupon).
2. **One WhatsApp/SMS question after the first delivered order** — *"আপনার জন্মদিন কবে?"* — a one-tap date reply.
   **Highest response rate.**
3. **EXTAS AI asks naturally in support chat** when the conversation allows it, and saves the answer.
4. **Optional "Continue with Facebook" login** on the site. If the owner enables it and Meta approves `user_birthday`,
   birthdays arrive automatically for everyone who uses that button. **This is the only automatic route that exists** —
   and the day it is enabled is the day this module becomes worthwhile.
5. **Thank-you page** — one small optional line, because that is the happiest moment of the journey.

**Birthday month-only is accepted** when the customer will not give the full date.

**The calendar and the sending:** a Birthday calendar in Marketing showing today, this week and the next 30 days. The
system sends **ONE wish per customer per year**, choosing the channel by availability and consent in this order —
**WhatsApp → Messenger → SMS → email** (phone call stays parked). A branded EXTAS wish card plus a coupon whose value,
validity (**default 7 days**) and minimum order come from Smart Rules and are **margin-checked against ERP cost**.
Results tracked: wishes sent, coupons used, revenue earned. **AI writes the message; with AI off a saved template goes
out.** All of it respects the existing marketing consent record.

**Restart sentence:** *"Build the parked birthday marketing module from Appendix F."*

### C6.7 PARKED · AI voice calls

**Parked, not cancelled.** Removed from the PR count on the owner's correction of 2026-10-17; it must still be written
into the blueprint **in full** as a parked module in **Appendix F**. Estimated size: **≈6 PRs, +4 more for free
conversation.**

**Why it is parked:** the owner's decision — it is not to be implemented now. What must be arranged first: **a licensed
Bangladeshi IPTSP / call-centre provider.**

**The full parked specification:**

*Calling the courier on the phone: recommended NO.* Courier hotlines are IVR plus human queues; an AI sitting in that
queue is unreliable and risks annoying the courier. Tickets, email and WhatsApp (already built) work better. Rider notes
and courier tickets are **already in the main plan** — the AI opens and chases courier tickets, reads rider notes on
failed or partial deliveries and classifies the real reason, and pushes ticket progress to the customer's tracking page.
No change needed there.

*Calling customers: YES, in three levels — levels 1 and 2 would be built, level 3 deferred.*

- **Level 1 — automated confirmation call with keypad (the workhorse).** A Bengali voice reads the order number, amount
  and area; *"press 1 to confirm, 2 to cancel, 3 to talk to a person"*. Reliable, cheap, no speech recognition needed,
  and it answers the real question — **is the phone live and is the person real.** Triggered **only by the fraud rules**,
  not on every order. Retry rules, no-answer handling, and the result written on the order and into the fraud score.
- **Level 2 — the AI also understands short spoken answers** ("হ্যাঁ", "না", "সাইজ বদলাব"), with the keypad always as
  the fallback.
- **Level 3 — free conversation.** Possible, but **Bengali speech recognition on a noisy mobile line with regional
  accents is not good enough yet**, and the 1.5–3 second pause before each reply feels wrong to a customer. **Deferred
  on purpose; revisit after live.**
- **Inbound:** the AI answers the hotline, recognises the caller's number, reads out order status, and hands over to an
  employee for anything else. Levels 1–2 only.

*What would have to be built:* a telephony adapter to a **licensed Bangladeshi IPTSP / call-centre provider** (same
mock → sandbox → live pattern as every other integration; **grey VoIP routes are illegal under BTRC rules and must not
be used**) · Bengali text-to-speech · Bengali speech-to-text for level 2 · a call-flow engine · call recording with a
**spoken consent line** · transcript and call log on the order · **per-minute cost tracking under the AI 360 budget
caps** · and all triggers written in Smart Rules.

*PR list:* telephony adapter (1) · outbound confirmation call with Bengali TTS + keypad, retries, result into the fraud
score (2) · spoken-answer understanding with keypad fallback (1) · inbound AI receptionist with handover (1) ·
recording, consent, transcript, call log, cost tracking (1). **Level 3 free conversation ≈ 4 more PRs, deliberately not
scheduled.**

**Restart sentence:** *"Build the parked AI voice-call module from Appendix F."*

### C6.8 The parked-module convention (applies to every parked item)

**Appendix F · Parked modules — built only when the owner asks** holds each parked module with:

- its **full specification**;
- **why it is parked**;
- **what must be arranged first** (e.g. a licensed IPTSP provider for calls, a shop for POS, Facebook Login for
  birthdays);
- its **PR list and estimated size**;
- **the exact sentence the owner can say to start it.**

`CLAUDE.md` in the repo **points at Appendix F**, so a Claude Code session six months later knows the module exists,
knows it is deliberately not built, and knows how to start it on the owner's word — without it leaking into the normal
build order.

**Parked modules are excluded from the PR total, the roadmap and every progress figure**, so they never make the main
build look bigger than it is.

**Parked so far:** AI voice calls · POS / counter sales (≈8–10 PRs, owned by another part of this blueprint) · birthday
marketing.

### Open — needs the owner's decision (C6)

1. **"Continue with Facebook" login:** should the site offer Facebook Login (and should we apply to Meta for the
   `user_birthday` permission)? It is the **only automatic source of birthdays**, and enabling it is the trigger to
   un-park the birthday module.

---

## C7 · S24 · Virtual Photoshoot Studio

> **V2 · 18–19 Oct.** S24 is **38 PRs** (444–480, 539). The 18 Oct round added: models may be brought in from outside
> or created in the backend, and when the owner supplies a sample pose or styling image the generated photograph
> follows it (§59 answer 59; filed in this stage, PR 539 by its round). Every AI pose set or video is kept in an
> asset library and reused for the same template + product + colours, never paid for twice (Note 38.2; demo
> `ST.aiAssets`, AI & agents → AI media library). The side canvas's motion templates (PR 596) use this studio;
> signature "walk-out" template: `agents/skills/gyani/studio/WALKOUT-TEMPLATE.md`.


**Status: Approved and merged master plan** (sections 25–29 of the decision record; §28, §29 marked APPROVED).
**The owner calls this the heart of the shop.**
**S24 · Virtual Photoshoot Studio — 37 PRs.** The image-AI PRs that used to sit in S01 move here; S01 keeps only
ordinary media handling (upload, CDN, watermark, zoom delivery).

### C7.1 The key design decision

**Do NOT ask an AI to "generate a model" per product** — that gives a different face and body every time and looks fake.

Instead: **keep a fixed library of model photographs** (4–5 models, each shot in several angles and poses, in plain
clothing) and use a **virtual try-on / garment-transfer model that puts OUR garment onto THAT fixed model photo.**
The model photo is the anchor, so **the same faces appear across the whole catalogue**, the lighting is consistent, and
the result reads as a real shoot. This is the only way to get consistency.

### C7.2 Where the model photos come from

| Option | What it is | Verdict |
|---|---|---|
| **(a) One real photoshoot, once** | 4–5 models, 5–6 angles each, plain grey/white studio, neutral fitted base garments. ~30 photos total, usable for years. Needs a **signed model release for commercial and AI use**. | **Best quality, clearly legal. Recommended.** |
| **(b) Licensed stock model photos** with a licence permitting AI modification | Cheaper, but fewer matching angles and the same faces may appear on other brands' sites. | Acceptable fallback. |
| **(c) AI-generated model personas** kept consistent by fixed seed/reference | No release needed, no real person's likeness. Weakest for close-up realism (hands, ears, skin texture) but acceptable when the garment is the focus. | **Recommended fallback if (a) is not possible.** |

**Hard rule: never use a real person's photo without a written release.** Consent and rights records are stored with
every model profile.

### C7.3 Reference images — the rights gate is REMOVED (owner's decision, §28.1)

EXTAS retails genuine branded goods (Ralph Lauren, Tommy, CK and similar) and does not put its own logo on them.
**Whatever image the owner uploads as a reference is simply used.**

Removed from the design: the rights-verification step · the "usage rights" field as a gate · any confirmation prompt
about image source · and **Claude's earlier stricter rule against using other sites' product photos — that rule is
withdrawn.** An **optional free-text source note** remains, **off by default**.

**The system's only job is to produce the best output from the references given.**

### C7.4 What the owner must do when photographing a garment

A small discipline with a big payoff:

- **Flat-lay on a plain sheet, or better a ghost-mannequin shot** (garment on a mannequin, mannequin removed) — try-on
  quality jumps when the garment already has a worn shape.
- **Even window light**, no harsh shadow, phone held **parallel** to the garment, **same distance every time**.
- **A grey card / colour checker in one frame per colourway**, so colour is corrected accurately.
- **Required set per product:** front, back, one detail/fabric close-up, plus any print or label shot.

### C7.5 The pipeline, step by step

1. **Upload** — the original is kept at full resolution, **forever, untouched** (originals are immutable; generated
   assets are stored separately).
2. **Auto-orient, denoise, white-balance** using the grey card; exposure normalised.
3. **Garment segmentation** — precise cut-out of the garment from the background.
4. **Ghost-mannequin / shape normalisation** where the input is a flat-lay.
5. **Standardisation** — same canvas, same ratio (**4:5**), garment at the same scale and centre, standard background.
6. **Colour verification** — measured against the ERP colour name and the colour checker; **drift beyond tolerance is
   flagged**.
7. **On-model generation** — garment + chosen model photo + chosen angle → try-on model → generated image. **One job per
   angle**, queued, **retried with a different seed on failure**.
8. **Detail re-projection — this is what makes it look real.** Logos, prints, embroidery and text are exactly where
   these models fail. After generation, **the original high-resolution texture of the print/logo region is warped and
   composited back over the generated garment**, so the print stays exactly as it is in real life instead of being
   re-imagined into mush. **This is the single biggest fidelity lever in the whole module.**
9. **Automatic quality scoring** — garment shape integrity, print legibility, colour difference vs the original,
   hand/finger artefacts, edge quality, seam continuity. **Anything below threshold never reaches a human.**
10. **Human review queue** — the owner sees generated vs original **side by side** and approves, rejects or regenerates.
11. **Output set** — several sizes in **AVIF/WebP** for the page, plus the **full-resolution file kept for zoom**.
12. **Watermark** — see C7.11.

**Everything runs in the background queue; nothing blocks the product upload.**

### C7.6 Job state machine, roles, and the safety rules

- **Job states:** draft → queued → processing → review_required → approved → published, plus **rejected, failed,
  cancelled**.
- **Image role taxonomy:** `primary_garment`, `front_reference`, `side_reference`, `back_reference`,
  `detail_reference`, `context_reference`.
- **Hard rule: never invent a back view from a front-only reference.** A back image is generated **only when a real back
  reference exists.** This prevents the single worst fidelity failure.
- **Data model:** `model_profiles`, `model_reference_assets`, `photoshoot_jobs`, `photoshoot_outputs`,
  `ai_usage_ledger` — mapped onto the existing schema rather than duplicating the product and media tables.
- **Idempotency key per logical request**, duplicate-job protection, **no double charging**.
- **Retry only the failed or rejected view**, never the whole product.
- **Reuse approved outputs** unless the source image, the model, the settings or the provider version changed.
- **Cost shown before a batch:** product count, views, tier, estimate, retry buffer, hard spend cap.
- **Security and records:** rights and consent records, originals immutable, generated assets stored separately,
  **AI-generated status recorded**, provider secrets server-side only, **signed URLs**, a retention policy and an audit
  log.
- **Approval stays mandatory permanently.** (The alternative — "mandatory in the first release, relax later" — was
  considered and **rejected**. The owner reviews every image; that is the agreement.)

### C7.7 The PREMIUM tier decision

**The volume changes everything.** The owner's real volume is about **5 new products a month × 5 colourways × 3 images
≈ 75 generated images a month** (~900 a year). That is tiny. **Cost is therefore NOT the constraint — quality is.**
The whole design is built accordingly: **spend freely per image, because the monthly bill is small either way.**

**Owner's decisions, final:**

- **Best-of-2, not best-of-4.**
- **Nothing outsourced.** No external retouch service, no human retoucher. **Every finishing step is built into the
  system**; the extra API cost for that is accepted.
- **Premium tier priced at $0.70 per image single pass, $1.40 for the two-pass best-of-2.** At 75 images a month that is
  about **$105/month ≈ ৳12,600**, roughly **৳150,000 a year. Approved.**
- **Everything dynamic** — model library, provider/company, which AI package is used, quality tier, shot plan.

**Cost table, final:**

| Tier | Per image | 75 images/month | Per year |
|---|---|---|---|
| Budget | $0.02 | ~৳180 | ~৳2,200 |
| Mainstream | $0.10 | ~৳900 | ~৳11,000 |
| Premium single pass | **$0.70** | ~৳6,300 | ~৳76,000 |
| **Premium best-of-2 (approved default)** | **$1.40** | **~৳12,600** | **~৳151,000** |

**The tier is switchable per product:** best-of-2 for hero launches, single pass for routine restocks.

**Quality strategy that the money buys:**

1. **Best-of-2** — generate candidates across two providers, score them automatically, show the owner the best.
2. **Two-stage render** — try-on at base resolution → **AI upscale to 2500–3000px** → detail re-projection → gentle
   retouch → web sharpening. The customer zooms and sees weave, stitching and seams.
3. **The fabric macro shot is ALWAYS a real photograph, never generated.** This is what makes a premium product feel
   premium, and it is the one image that must be unarguably true.
4. **Mandatory review. Nothing publishes unseen.**

### C7.8 Finishing, built in-house (replaces any outsourced retouch)

A finishing pass inside the system, applied to **every approved image**:

**AI upscale to 2500–3000px · artifact repair (hands, edges, garment boundary) · contact-shadow synthesis so the garment
sits on the body properly · colour match back to the real garment colour · fabric micro-detail enhancement · house
colour grade so every image on the site looks like one shoot · final web sharpening.**

Plus a **small editor in the admin**: crop, straighten, brightness and contrast, spot removal, and **"run finishing
again"**.

**No external service, no third party, nothing leaves the system.**

### C7.9 Shot Plan per category, with ghost mannequin as a first-class option

Not every product needs a model. The owner sets a **Shot Plan per category, overridable per product**. Each slot is a
dropdown: **Real photo / Ghost mannequin / On-model / Off.** Mixing is normal — e.g. one ghost, three model shots, one
real macro.

| Category | Default shot plan |
|---|---|
| Polo / T-shirt / Shirt | real flat or ghost front · 3 model angles (front, three-quarter, back) · real fabric macro |
| Boxer / underwear | **ghost mannequin front and back** · real fabric macro · model optional and **off by default** |
| Trousers / denim / chino | ghost front · 2 model angles (full length, walking) · real fabric and hardware macro |
| Tank top / jersey | ghost or model, owner's choice |
| Panjabi / katua | model strongly preferred, 3 angles · real fabric and embroidery macro |

**Ghost mannequin is its own engine, not an afterthought.** The garment is photographed on a mannequin, the mannequin is
removed, the inner neck and back are reconstructed, the shape is kept. Clean, premium, and for some categories (boxers
especially) better than a model. **It is also the best input for the on-model step, so the pipeline produces it first
and reuses it.**

### C7.10 Detail Finder — auto-focus on the small things that sell a premium garment

The owner's point: a polo has side tapes with the brand name, a side vent, collar tape, embroidery, print under the
placket. **These small details are what make a garment look premium, and they must be shown.**

- **Per garment type, a checklist of likely detail points:**
  - **polo** — side tape, side vent, collar tape, placket and buttons, cuff, chest logo
  - **shirt** — collar, cuff, button, pocket, yoke, stitch density
  - **denim / chino** — rivets, back pocket stitching, label, zip and hardware, selvedge
  - **hoodie** — drawcord tips, kangaroo pocket, rib, zip pull
  - **panjabi** — neck embroidery, button placket, side slit
- **The system scans the uploaded images and proposes the regions it found, labelled.** The owner confirms, renames,
  adds or removes. **Each confirmed region becomes a focused close-up image in the gallery.**
- **Focus crops are produced from the ghost and on-model renders too**, not only from the flat-lay — so the side tape is
  visible the way it actually sits on a body.
- **If the system cannot see a detail clearly, it asks:** *"The collar tape is not readable in these photos — please
  take one closer photo of the collar."* The owner shoots it on his phone, uploads, and that region is regenerated.
  Same for a small chest logo. **This back-and-forth is part of the normal upload flow, not an error.**

### C7.11 Watermark — corrected behaviour

- **A customer browsing the site sees NO watermark.** Clean images, clean video.
- **The watermark is applied automatically at the moment of download or save** — the download button, right-click save
  and drag-save **all go through a stamping endpoint that returns a watermarked copy.** Same for video.
- **Honest limit:** this covers saving and downloading, **not a phone screenshot**. Nothing can stop a screenshot, and
  trying to (right-click blocking and the like) only annoys real customers.
- The stored original is never watermarked.

### C7.12 All product families — three engines cover everything

Rather than a separate build per category, **every product family maps to one of three engines**, plus a shared
detail/macro step:

1. **On-model (worn)** — menswear, ladieswear, kidswear, caps on a head, sunglasses on a face, a watch on a wrist, a bag
   carried.
2. **Ghost mannequin** — all garments, including kidswear.
3. **Product-only studio** — footwear, perfume, wallets, belts, watches laid flat, sunglasses folded, bags standing.

Each family then gets a **studio recipe**: which engine, how many angles, which detail points, which model library.

**Model libraries:**

- **Men** (4–5 profiles) — the first library.
- **Ladies** (4–5 profiles) — each profile carries a **styling guideline the owner sets** (how the model is dressed and
  posed) so the result matches what sells in this market. His call, set once per profile.
- **Kids** — added, but **the default for kidswear is ghost mannequin or flat-lay, not a child model.** The reasons are
  practical, not moral: several providers restrict generating realistic images of children, results are less reliable,
  and ghost shots of kidswear look clean and are cheaper. **A kids model profile can be enabled later if the owner wants
  it.**
- **Hand / wrist / face part-models** — for watches, rings, sunglasses and wallets: a small library of hand, wrist and
  face references, treated exactly like a model profile.

**Category recipes (defaults, all editable):**

| Family | Engine | Angles | Detail points |
|---|---|---|---|
| Polo / tee / shirt / panjabi | ghost + on-model | 3–4 | side tape, vent, collar tape, placket, cuff, chest logo |
| Trouser / denim / chino | ghost + on-model | 3 | rivets, pocket stitch, label, zip and hardware |
| Ladies garments | ghost + on-model (ladies library) | 3–4 | neckline, sleeve, print, trim |
| Kidswear | ghost / flat (model optional) | 2–3 | print, trim, button |
| Footwear | product-only | 6 (3/4, side, top, back, sole, detail) | sole pattern, stitching, logo, eyelets |
| Bags | product-only + carried on model | 5 | handle, zip pull, lining, logo plate, feet |
| Wallets | product-only + in-hand scale | 4 | open, card slots, stitching, logo |
| Belts | product-only + worn | 4 | buckle macro, keeper, leather grain, tip |
| Caps | on-head + product-only | 4 | front logo, back closure, under-visor, eyelets |
| Sunglasses | on-face + product-only | 4 | hinge, temple logo, lens, nose pad |
| Watches | on-wrist + product-only | 5 | dial, crown, bracelet links, clasp, caseback |
| Perfume | product-only | 3–4 | cap, label, liquid level, embossing |
| Socks / ties / small goods | flat + product-only | 2–3 | weave, tip, label |

**Footwear and other non-garment products** (shoes, boots, Chelsea boots, sneakers, loafers, sandals) need no model:

- **Product-only studio** — a multi-angle set from the owner's photos (three-quarter, side profile, top, back, sole,
  detail) on the standard background, with **consistent shadow and scale**.
- **Turntable-style angle set** where enough reference exists; **the system says plainly when it does not and asks for
  the missing angle rather than inventing it.**
- A **footwear shot plan** alongside the garment ones, with the same dropdowns.

**Reflective and transparent goods — honest handling.** Perfume bottles, watch glass and sunglass lenses are the weakest
area for generative models: glass, reflections and transparency come out wrong. **These are not generated.** Instead the
pipeline keeps the owner's real photo, replaces and cleans the background, rebuilds the shadow and a controlled
reflection, corrects colour, and crops to standard. The result is a clean studio look from a phone photo **without
inventing the object**. Where a real angle is missing, the system asks for it.

**Detail fidelity on branded goods.** For watches, sunglasses and bags, the brand name and dial text are exactly what
the customer studies. **Detail re-projection is mandatory for these families** — the real logo and text are composited
back from the owner's photograph, never left to the model.

**Withdrawn:** the "other families worth planning for" list (socks, ties, grooming, jewellery, backpacks, luggage,
hampers) was withdrawn by the owner — **those items are not coming.**

### C7.13 Lifestyle catalogue — sets, unisex shots and occasion scenes

**Top-bottom sets and tracksuits — the owner's core winter business.**
Items: tracksuits (hoodie + jogger), zip tracksuits, sweatshirt sets, joggers, shorts, swim shorts, full-sleeve polo and
tee, tee + three-quarter short sets. These sell as a **matched set** — black top with black bottom, ash hoodie with ash
grey trouser — and **the model must be wearing the complete set in one image.**

- New product type: **Set** — a parent with a **top component and a bottom component, each its own SKU**, joined by a
  **colourway link** so the set's colour stays matched.
- The try-on engine runs **two passes on the same model image** — upper body, then lower body — producing **one
  photograph of the model wearing the whole set.** Angles: front, three-quarter, back, plus a **motion/walking frame**.
- **Detail points for this family:** hood and drawcord, cuff and hem rib, zip pull and puller branding, side stripe or
  tape, pocket, ankle rib, waistband drawcord, and **fleece inside texture (a real macro)**.
- Links to the existing **combo engine**: a tracksuit sold as a set is one sellable unit, and the same images serve the
  combo page.

**Unisex / couple shots.** Some sets are unisex, and one frame showing **a male and a female model both wearing the
set** says it instantly. Built as: **generate each model separately on their own profile, then compose them into one
scene** with matched lighting, scale, ground plane and shadow. Composing two separately-generated people is **far more
reliable** than asking a model to generate two people at once, and each person's garment stays accurate.

**Occasion scenes — and the system grooms the owner, not the other way round.** The owner's words: his head will not
produce scene ideas on the spot, so **the system must propose.**

- Before generating, the system **offers three scene options with small previews**, each named and described in one
  line: *"Winter morning — soft fog, park path, cool tones"* · *"Eid evening — warm light, decorated interior"* ·
  *"Match day — stadium tunnel, strong side light"* · *"Summer — bright open street"*.
- Suggestions are chosen from **the product's category and the calendar**, so winter items get winter scenes in winter.
- The owner picks one, asks for more options, or says **no scene** (plain studio).
- **A demo frame is always shown before the full set is generated** — he approves the look first, then it runs.
- **Approved scenes are saved to the scene library and reused**, so the catalogue stays consistent within a season.

**Combo / gift-set studio.** Combos are central to this business, yet there is no way to photograph a set. A composition
studio: **pick 2–4 products, choose a layout** (flat-lay arrangement, stacked, or on one model wearing all of them), and
it produces **one clean set image.** Directly serves the combo pages, the Eid gift sets and the landing pages.

**Scene library.** Beyond the plain studio background, a small set of approved backgrounds — **studio grey, street,
festive, winter** — chosen per campaign. One garment set can then be re-rendered into a seasonal scene **without a new
shoot.**

### C7.14 Video (the S24 side): what the Studio feeds into S25

Product video and reels are built in **S25** (section C8), but the method depends on S24: **the first frame of every
clip is an already-approved S24 still**, so the garment, the colour and the logo are already correct.

### C7.15 Front end

- **On-model images are part of the normal gallery**, with the same zoom; the high-resolution version loads on zoom.
- **Angle switcher** — front / three-quarter / back / walking / seated — **sharing the garment's colour selection**;
  changing colour **re-renders the whole set from the pre-generated cache, instantly**.
- **Nothing is slower: all generation happens at upload time, never at page-view time.**
- **The real photo always stays the hero.** The flat-lay and the fabric close-up carry the truth of fabric and colour;
  the on-model images carry the feeling. **Gallery order: real front shot → on-model views → back → fabric close-up →
  detail.**
- **Disclosure:** no "AI" badge plastered on the image, but **one honest line in the product details** — *"some images
  show the garment digitally placed on a model; fabric and colour photos are real."* This protects against "it looked
  different" complaints, which in a COD market means **fewer refused parcels — it pays for itself.**

### C7.16 Admin

- **Model library screen** — add a model (name, photos per angle, height, size worn, rights/consent record); set which
  models are available for which category.
- **On product upload** — pick the model and tick which angles to generate. **Generate → review → approve.** Per-product
  and per-image on/off.
- **Regenerate** any single image; **batch regenerate** a whole category if the standard changes.
- **Cost per generation is shown in the AI Cost Book before the owner presses generate.**
- **In-admin image editor** — crop, straighten, brightness and contrast, spot removal, "run finishing again".
- **Review and approval UI** — side by side, with reasons on rejection.

### C7.17 Technology and providers

- **A provider adapter**, exactly like the payment and courier adapters — **mock / sandbox / live**, with **two or three
  providers behind one interface**, so the owner can switch on price or quality **without a rebuild**.
- **FASHN AI** (Try-On v1.6 for baseline, Try-On Max for premium) is one of the two providers to benchmark. Other
  specialist flat-lay-to-model services exist (Claid, uwear.ai, Pixelcut, Fitroom and others) and can sit behind the
  same adapter.
- **Gemini / OpenAI are kept only as secondary adapters for background and scene variation — never as the
  garment-transfer engine.**
- **Free / OpenRouter models in production: a hard no.**
- **Verify every provider's model names, parameters, pricing, rate limits, retention and commercial terms from the
  official documentation at implementation time.** The figures in this blueprint are from October 2026 and will move.
- **A/B the providers on 20 real products before committing.**

### C7.18 Honest limits — what the system will and will not do

- **Does well:** plain and solid-colour garments, polos, tees, shirts, trousers, hoodies — **the bulk of EXTAS's
  catalogue.**
- **Struggles:** large complex prints, fine text, lace/mesh, very shiny fabrics, unusual drape, hands overlapping the
  garment.
- **Never:** promises 100% accuracy without review. **Every generated image is checked before publishing.**
- Glass, reflection and transparency are **not generated at all** (C7.12).

### C7.19 Proof before scale — the pilot

- Build the pipeline, then run **20–30 real EXTAS products** through **two providers**, **including deliberately hard
  cases**: plain black and plain white polos, small embroidery and logos, stripes and patterns, light and dark
  colourways, and low-quality phone shots.
- Put the results in front of the owner.
- **A/B test on-model vs flat-lay on the live site**, measuring **add-to-bag, conversion and return rate.**
- **Headline metric: cost per APPROVED image, not per generated image**, plus **first-pass approval rate, retries per
  approved image, processing time, failure rate and review time.**
- **Scale only on the numbers.**

### C7.20 AI 360 wiring (S24 is the engine; AI 360 is the control room)

- The photoshoot work registers in AI 360 as a named agent — **Photoshoot agent** — with its **sub-jobs listed
  separately**: ghost mannequin, try-on, detail re-projection, upscale, finishing, detail finder, quality scoring.
- **Provider and model choice for images lives in the same AI 360 screen as the text models.** One place answers "which
  company, which package, for which job" for the entire business.
- **Every sub-job has its own row in the AI Cost Book**, with the recommended model, estimated cost per run,
  alternatives and their cost, and the recommendation note when the owner changes one.
- **The Photoshoot agent has its own monthly cap in AI 360.** At 80% a Telegram warning; at 100% new generations pause
  while everything already approved stays live and the shop keeps running normally.
- **The cost calculator answers photoshoot questions directly** — "20 products × 5 colours × 3 images at best-of-2 —
  what will it cost?" — before anything runs.
- **Every generation writes to the same `ai_usage_ledger`** that feeds the Costs section, the month-end close sheet and
  the ERP push. **Photoshoot cost is not a separate pot of money.**
- **The AI diary** includes the day's photoshoot activity in plain Bengali.
- **Permission matrix:** the Photoshoot agent **may write to media only — never to price, stock, orders or customer
  data.**
- **Keep-on switch:** the owner can leave the Photoshoot agent running **even with the AI master switch off**, as with
  any agent.

### C7.21 The Studio menu (dashboard structure)

The dashboard gets **one main menu: "Studio"**, with two sections under it:

- **Photoshoot Studio** (S24) — model library, shot plans, generation, review, detail finder, scenes
- **Video & Campaign Creative** (S25) — reels, motion, campaign creatives, platform exports

They **share the asset library, the model library, the scene library, the cost ledger and the AI 360 switches**, so
keeping them in one place is also how it works underneath. **The split into S24 and S25 is only the build order, not two
menus.**

### C7.22 S24 PR list (37 PRs)

1. Asset model, role taxonomy, immutable originals, generated kept separate
2. Model library with consent records
3. Ghost-mannequin engine
4. Garment prep and standardisation (cut-out, colour, canvas)
5. Reference analysis and recommendation
6–7. Provider adapter (FASHN + one other; estimate, generate, status, fetch)
8–9. Job orchestration: queue, state machine, idempotency, per-view retry, concurrency, spend caps
10. Best-of-2 plus automatic scoring
11. Detail re-projection for logos and prints
12–13. Finishing pass (upscale, artifact repair, contact shadow, grade, sharpen)
14. In-admin image editor
15. Review and approval UI with side-by-side and reasons
16. Cost ledger, estimates, caps, reuse rules
17. Recommendation-note system
18. Front-end gallery, angle switcher, zoom, disclosure line
19. Pilot harness and metrics (cost per approved image, first-pass rate) plus live A/B
20–21. Detail finder
22–23. Footwear / product-only studio
24. Download-watermark pipeline
25. AI 360 wiring and Cost Book rows for every photoshoot sub-job
26–27. Category recipe framework with the 13 recipes
28–29. Worn-accessory engine for caps, sunglasses, watches and carried bags
30. Reflective and transparent product handling
31. Ladies, kids and part-model libraries with styling guidelines
32. Combo and gift-set composition studio
33. Scene library
34–35. Set product type and two-garment try-on
36. Unisex / couple composition
37. Occasion scene suggester with previews and approval

### Open — needs the owner's decision (C7)

1. **Model photographs:** does he want to do **one real photoshoot** of 4–5 models with signed releases (option a,
   recommended and used for years), or should the system start on **AI-generated model personas** (option c) until he
   can arrange a shoot?

---

## C8 · S25 · Video & Campaign Creative Studio

> **V2 · 19 Oct.** S25 stays 10 PRs (481–490). It also renders the short clips for the side canvas's AI motion
> templates (PR 596, Note 37.9).


**Status: Approved** (sections 30 and 31). **S25 · Video & Campaign Creative Studio — 8 PRs**, plus the 2 campaign-visual
PRs in C8.4. It is the second section under the single **Studio** menu (C7.21).

### C8.1 Video and reels — the method that keeps the product accurate

**Image-to-video from an already-approved still.** The first frame is **our approved on-model image**, so the garment,
the colour and the logo are already correct; **the model only moves from there.**
**Text-to-video would re-imagine the garment and is not used.**

- **Clips of 4–8 seconds**, stitched into a **15–25 second reel** with music, text and the logo.
- **Action library per category** — tracksuit: jogging, stretching, a group workout · polo: walking, turning, sitting at
  a café · formal shirt: office walk, adjusting a cuff · panjabi: festive greeting · footwear: a walking close-up on the
  feet · bag: picked up and slung on the shoulder. **The owner picks the action or lets the system suggest.**
- **Group clips** (two or three models jogging together) are produced as **separate clips cut together**, or as a wider
  shot where faces matter less — generating several consistent people in one moving shot is **still unreliable**.
- **Per product, a tick box. Off by default. Nothing is generated unless the owner allows it for that product.**
- **Outputs:** **9:16** for reels and stories, **1:1 and 4:5** for feed, **16:9** for the website — **auto-cropped with
  safe areas so nothing important is cut.**
- **On the website:** a short **muted auto-looping clip on the product page**, plus hero and category banners.
- **Music** is royalty-free or generated. The rule from C5.1 stands: **API-posted social content cannot use the
  platforms' trending audio, so reels needing trending sound land in drafts for a person to publish.**
- **Watermark on video follows the same rule as images** — clean on the site, stamped on download or save.

### C8.2 Video cost (vendor rates, checked October 2026 — verify before building)

- Per-second API rates run from about **$0.02/s** at the cheap end to **$0.40/s** for the top tier, with mainstream
  1080p models around **$0.08–$0.14/s**.
- An 8-second clip is therefore roughly **$0.64–$1.12 mainstream**, or **$3.20 top tier**.
- A **20-second reel from three clips**, with best-of-2 and retries: **~৳800–1,200 mainstream, ~৳2,500–3,500 top tier.**
- **Five reels a month: ~৳5,000 mainstream, ~৳15,000 top tier.** Affordable at this volume, and the owner has said
  quality comes first.
- **Reseller prices run 2–3× vendor rates, so the adapter talks to vendors directly.**
- **Every clip is priced in the AI Cost Book before it runs**, under the **Photoshoot/Video agent's own monthly cap** in
  AI 360.

### C8.3 Campaign visuals — two separate layers

The owner spotted a real distinction. These are **two different things and they must not be confused in the build**.

**Layer (a) — On the product page: nothing is burned into the photo.**
When a discount or flash-sale campaign is running, every product inside that campaign automatically shows a campaign
**overlay** — a corner ribbon, a bottom strip, a struck-through price, a badge.

- It is a **page element drawn on top at display time, not part of the stored image.**
- It **appears when the campaign starts and disappears when it ends**, with **nothing regenerated and no image
  replaced.**
- It shows **on the product card in listings, in search results and on the product page.**
- The design is **chosen per campaign from a small set of templates**, matched to the theme.

This is what the owner meant by *"it should be default, attached to the campaign, not written onto the picture."*

**Layer (b) — For ads: the vibe IS baked into the image.**
A Facebook flash-sale creative needs the offer inside the picture. Those are produced in the **Campaign Creative
Studio** as **separate files, never touching the product gallery**: the offer text, the price, the urgency, the festive
or seasonal treatment, in every platform size. **Product photos stay clean; ad creatives carry the message.**

### C8.4 The AI grooms the owner before it creates

Before generating campaign creative, the AI asks a few short questions **in plain Bengali** — what is this campaign for,
who should it reach, what is the offer and for how long, which products — then comes back with **three creative
directions, each with a preview and a one-line rationale**:

- *"Urgency — dark background, big timer, strong red"*
- *"Festive — warm light, gold accents"*
- *"Clean premium — product led, small offer tag"*

**The owner picks one, asks for more, or edits. Nothing is produced until he has seen a direction he likes. He is never
asked to invent the idea himself.**

### C8.5 Campaign creative export

From a campaign the owner picks **a product, a SKU, or a whole category/sub-category**; the system gathers the approved
images and videos for that selection and prepares **campaign-ready creative**:

- **every platform size** — Meta 1:1, 4:5 and 9:16; Google 1.91:1; TikTok 9:16;
- **safe-zone cropping**;
- **optional price or offer overlay pulled from the campaign itself**;
- **the tracked landing URL**.

**One click sends them to the connected ad account or downloads them.**

### C8.6 S25 PR list

**S25 · Video & Campaign Creative Studio — 8 PRs:**

1. Action / motion library (1)
2–4. Image-to-video engine with provider adapter and best-of-2 (3)
5–6. Reel assembly with music, text, logo and aspect variants (2)
7–8. Campaign creative export (2)

**Plus the two campaign-visual PRs:**

9. **Campaign overlay system — page-level and time-bound** (1)
10. **Campaign creative brief and three-direction grooming flow** (1)

---

## C9 · Build capacity and timeline — the reality check

> **V2 · 19 Oct.** Counts in this section are V1's. Current: 594 active PRs (E0). See the A1.6 V2 block.


The owner asked whether roughly **400 PRs across ~30 stages** can be built and taken live **in 3–7 days** on the Max 5x
($100) plan.

**Honest answer: no — not on any plan.** The working figures, to be written into the blueprint as they stand:

- **Official Max 5x limits:** ~50–200 Claude Code prompts per 5-hour window; weekly roughly 140–280 Sonnet hours and
  15–35 Opus hours. Usage falls toward the **lower** end on a large codebase, and **Opus burns about 5× faster.**
- **Realistic cost per PR** on a greenfield build with tests: small 5–10 turns, medium 15–30, large 40–80 — **average
  ~22 turns.** So **400 PRs ≈ 8,800 agent turns.**
- **Max 5x throughput** ≈ 120–190 prompts/day sustained ≈ ~1,000/week → **roughly 8–10 weeks.**
- **Max 20x** ≈ 4× that → ~3–4 weeks of model capacity, realistically **5–7 weeks** once the owner's own review time is
  counted.
- **Wave 1 only** — a working shop: catalogue, product, cart, checkout, orders, courier, basic admin, **≈80 PRs** ≈
  1,760 turns → about **1.5–2 weeks on Max 5x, or 4–6 days on Max 20x.** **That is the realistic "one week" target.**

**The real blockers are not the plan.** bKash PGW, Nagad, SMS masking sender ID, Steadfast/Pathao API, WhatsApp Business
API and DBID **each take days to weeks of external approval.** **The applications must go in now, in parallel with the
build.**

**Recommendation recorded:** **Max 20x for the build sprint, dropping back to 5x afterwards**, with Console
pay-as-you-go as overflow if a deadline needs it. **Plan limits change over time — verify before buying.**

### Open — needs the owner's decision (C9)

1. **Plan for the sprint:** does he want to move to **Max 20x for the build** and drop back to 5x afterwards, as
   recommended, or stay on Max 5x and accept roughly 8–10 weeks?
2. **Blueprint structure (still unanswered from §14.5):** should the final blueprint mark each PR as **"before go-live"
   or "after go-live"**? Claude offered this; the owner has not yet answered.

## C10. The seven fixed agents, chain of command and learning (V2 · PR 577–585, 593)

The same agents work in design now, build the code, and then run their sections of the live dashboard. Skills are
kept, never re-taught (Note 15.2). Profiles: `agents/<name>.md`; protocol: `agents/AGENT-PROTOCOL.md`.

### C10.1 Org chart

| Code | Agent | Role | Owns | Never touches |
|---|---|---|---|---|
| A360-01 | জ্ঞানী Gyani | **Chief (virtual CEO)** — investigates any "why", names the responsible agent with evidence, assigns and tracks the fix; routes unnamed Telegram commands | S06, S10, S15, S16, S22, S24, S25 | Storefront layout |
| A360-02 | প্রহরী Prohori | Server, settings framework, security, deploy, backup, site health and audit | S0A, S00, S17, S18, S19, S21 (incl. PR 570, 594) | Customer-facing design |
| A360-03 | ভান্ডারী Bhandari | Catalogue and images, courier/returns/exchange, ERP sync, documents | S01, S08, S09, S20 | Marketing copy, AI prompts |
| A360-04 | সওদাগর Sawdagor | Storefront logic: pages, combos, cart, checkout, orders, payments | S02, S03, S04, S05, S07 | Server and ERP internals |
| A360-05 | শিল্পী Shilpi | Senior UI/UX; every customer-facing surface, phone first; reviews Sawdagor's pages | design layer of all surfaces | Business logic, data model |
| A360-06 | দূত Doot | SEO, content, non-paid marketing, CRM, social; head of content | S11, S12, S13 (non-ads), S14, S23 | Checkout, payments, stock |
| A360-07 | তীরন্দাজ Tirondaj | Paid ads only (Google incl. YouTube, Meta, TikTok) | S13 paid-ads PRs (256–270, 278, 283, 531, 581) | Checkout, stock, prices, customer data; never raises a budget without approval |
| A360-08…12 | Five author agents (Suta, Jotno, Rong, Ritu, Bazar in the demo; names editable) | Write articles and help blog SEO, one per section: care and washing, styling, fabrics and fit, seasons and occasions, brands and products | inside S12 under Doot | Everything else |

### C10.2 Chain of command and approvals (PR 583)

Owner → Gyani → the other six (and the authors through Doot). Gyani is free to research, report, analyse, assign
and review work and to write warnings into appraisals. **Only with the owner's approval, for every agent including
the chief:** any money movement or refund, any COD amount change on an order, price or discount changes, ad budget
increases, blocking anyone, deleting data, anything irreversible. The permission list is a dashboard setting the
owner edits; it is **enforced by code**.

### C10.3 Telegram identity and command routing (PR 584)

All agents share the owner's one Telegram bot. Every message starts with the sender's identity line — emoji, name,
Bengali name, employee code, role (e.g. "🏹 Tirondaj তীরন্দাজ · A360-07 · Ads"). A command naming an agent or its
code ("A360-07 budget report", "@Bhandari courier entry check") is assigned to that agent automatically and shows
on its profile; no name → Gyani routes it. Approvals come back as buttons (Approve / Reject / Ask why). Also visible
in the dashboard.

### C10.4 Profiles, reports, memory (PR 577, 578, 582)

- **360° profile** per agent: role, owned stages, never-touches, plan, skills it has and is learning, work log, test
  results, performance (first-time-right rate, bugs it found vs the owner found, rework, cost). The owner edits
  photo, name, bio, joining date, rewards, a verified star and assignments with due dates.
- **Reports** daily / weekly / monthly / yearly and a yearly appraisal in the multinational style
  (`agents/APPRAISAL-TEMPLATE.md`), on demand or on schedule to Telegram or e-mail.
- **Memory protocol:** before every task the agent replays its profile, standards, skills, last 20 work-log lines,
  lessons and open items, and restates them in five lines; the runner stops the task if a line is wrong. After the
  task the runner appends the work log; new lessons become versioned skills only after a sandbox test (PR 322) and
  an approval (PR 420). **Strong memory** (PR 582): a long-term store per agent, searchable by meaning, summarised
  weekly, never deleted silently, backed up nightly to Drive, viewable and correctable by the owner.

### C10.5 Curriculum and learning (PR 579, 585)

- Each agent's field is a degree path — graduate → post-graduate → PhD level — from top-university syllabi and the
  field's standard texts, turned into versioned skills with exams passed in the sandbox before a level is earned
  (`agents/CURRICULUM.md`). Wave 1–2 status: 66 modules + 2 deepening, 9 exams written; exams not yet sat.
- **Tirondaj and Doot are the two power agents** (Note 20): they learn continuously from official docs, practitioner
  blogs, communities, transcripts and case studies. A tip becomes a skill only after it is checked against official
  docs or two independent sources, tested, and written with source, date and confidence; failures are recorded as
  "doesn't work for us". Practice tasks with deadlines are graded in their appraisals. Paid tools are proposed with
  cost and reason; the owner approves and pays. Free official academies are core sources; throwaway accounts for
  free trials are not used (Note 22) — one honest trial per tool, with the owner's account, after go-live
  (`agents/skills/*/TRIAL-PLAN.md`).

### C10.6 Model choice and cost (PR 580, 309, 312–313)

Model auto-suggest with free-model qualification (C1.5 V2 block). Author agents cost nothing while idle; cost =
articles × length × model (Note 31.2).

Demo: `#/admin/agents`, `#/admin/agents/<id>` (`89b-admin-agents.js`), `#/admin/ai` (`83-admin-ai.js`).

## C11. The blog as the traffic engine (V2 · S12 · PR 591–593, 244, 528–530, 547)

**Owner, 19 Oct 12:10–12:26 (Notes 28–31).** Plan: `review/BLOG-CONTENT-PLAN.md`. The storefront label is
"Journal" (`/journal`).

### C11.1 Volume and quality

At least **3 and up to 5–6 posts a day**: everyday fashion knowledge (care, washing, styling, fabrics, fit, occasions,
seasons) plus our own product posts. Calendar: 3 a day for two weeks, then 5 a day **only while quality and indexing
stay healthy** — automatic drop to 3 a day otherwise; an empty slot is never filled with a weak post. Quality is the
system's job, not the owner's (Note 28.3). Plan size: 8 pillars with hub pages, 179-topic bank (125 with Bengali
twins), a 90-day calendar assuming the journal is live on 2 Nov 2026.

### C11.2 Pipeline (PR 591, 244)

Topic list (built by Doot from real search demand; the owner adds topics and approves the list as a monthly batch)
→ **writer** (an author agent) → **another author proofreads and fact-checks** (never the writer) → **Gyani checks
business facts** (delivery, exchange, prices) → **Doot final SEO check** → ready → scheduled → published. Seven checks
run in code before publish; an edit sends the post back to proof. Scope from the plan: per-post fact sources and the
reviewer's verdict; editorial-policy page and an AI-assistance line; similarity and duplicate thresholds; required
internal links and a weekly unlinked-post report; a care-guide link on every product page and "Shop the look" combos
on style posts; refresh queue and merge tool with 301s ("updated" date only on real edits); care-lab / photo request
queue; topic ideas from Search Console, support chats and site search; product blocks swap sold-out items; the
proofreader uses a different model from the writer where possible; English and Bengali readability check; journal-
assisted sales defined.

### C11.3 Authors and bylines (PR 593)

Five author agents A360-08…12 under Doot, one per section; profiles, model choice per job, cost only when used.
**Bylines are honest:** "EXTAS Journal" with the author agent's name, and each author page says the articles come
from EXTAS's AI writing team, checked by our team. A real staff reviewer line appears only where the owner enters
a name (Note 31.3). No invented human personas or fake photos.

### C11.4 The blog as a full section (PR 592)

Categories (pillars) and sub-categories, tags, author and reviewer pages, search, archive, featured and related posts,
reading time, contents, share, RSS, newsletter sign-up, Bengali twins. Reading: 18 px on phones, 19 px on desktop,
66–77 characters per line, Bengali line height 1.85; desktop 720 px column with sticky contents and a sidebar slot.

### C11.5 House ads and popup rules (PR 592)

House ads only — our banners, products, combos or categories; no outside ad networks. Slots: blog home (top banner,
between cards), category pages, inside the article (after paragraph N), desktop sidebar, end of article, optional
popup per post. The owner picks which ads show in which slots, posts and categories, with dates (whole Asia/Dhaka
days), weights and on/off; click and sales report per ad and slot. Rules decided in the blog QA round: **at most 3 ads
per post** (phone: 1 inline + end + bar or popup), **none before the first paragraph**, no duplicate ad on a page,
relevance first (chosen categories decide; else product/tag match; "all" for campaigns), empty slots collapse; ads are
labelled "EXTAS offer" and have Bengali text fields. **Popups:** triggers by scroll %, time or leaving; frequency caps;
easy to close (✕, outside tap, Esc); **never on the first screen for a phone visitor arriving from Google** (Google's
intrusive-interstitial guidance); bottom sheet on phones, 420 px card on desktop; on phones the popup replaces the slim
bar for the visit.

### C11.6 Images (PR 547)

Own product photographs first, then free-licence libraries; **AI generation asks permission every time**; nothing from
Google image search. Studio images are labelled as studio-generated and never used as evidence for a test or fit claim.

Demo: front end `73-blog.js`, `r12-zblogfe.css` (`#/journal`, also under `/bn`); back end `94-admin-blog.js`,
`r12-zblog.css` (`#/admin/blog`: posts, topics, pipeline, schedule min 3 / target 5 / max 6, results, author team,
categories and tags, house ad slots, sitemap). QA: `qa/BLOG-QA-REPORT.md` (R2: front end, journeys, ads and popup 0 fails).

## C12. Google traffic plan (V2 · S11/S13/S19 · PR 220, 236, 586–589)

**Owner, 19 Oct 11:39–12:07 (Notes 23.3, 26, 27).** Plan: `review/GOOGLE-TRAFFIC-PLAN.md`.

### C12.1 Language and URLs

- **English at the root** (`https://extas.com.bd/…`), **Bengali under `/bn`**, same host. Each language has its own
  URL and its own canonical; no automatic redirect by browser language or IP; the language switch is a plain link
  to the twin (a soft "বাংলায় দেখুন" suggestion bar is allowed).
- **Translation gate (PR 588):** a `/bn` page publishes, enters the sitemap and gets hreflang only when its main
  content is really Bengali (natural চলতি, approved) — a "Bengali ready" flag per page; the SEO health report shows
  coverage.
- **hreflang (PR 236):** `en`, `bn` and `x-default` → the English twin, HTML `<link>` tags in the server `<head>` only,
  emitted only when both twins return 200 and pass the gate.
- **Same ASCII slug** for both languages; lowercase; hyphens; trailing slash 301s to the slash-free form.
- **URL map:** home `/`; category `/<category>` (reserved first segments never used as category slugs); product
  `/p/<style-slug>` (category-free); combo hub `/combos`; combo category `/combos/<rule>`; pair
  `/combo/<style>-<colourA>-<colourB>[-<colourC>]-<n>-piece` (colours in fixed dictionary order, reverse order 301s);
  seasonal `/collections/<slug>`; journal `/journal/<slug>`; help `/help/<slug>`; ad landings `/l/<slug>` noindex,follow;
  search noindex,follow; bag, checkout, account, admin and tracking disallowed in robots.txt.
- **Server-rendered first response** carries title, meta description, canonical, hreflang, Open Graph, one H1, the
  main content, visible price and availability matching JSON-LD, real `<img>` with alt and size, crawlable `<a href>`
  links, correct status codes.

### C12.2 Migration (PR 586, 587, 235)

- **extas.com.bd is the owner's live WordPress shop (49 sitemap URLs)**: this is a migration. Before the switch,
  export its Search Console data and backlinks; on go-live day **301 every old URL to its closest new twin**, crawl-
  check the same day, keep redirects at least 12 months (PR 587; the map loads into the redirect manager, PR 235).
- Old demo `#/…` links are forwarded by a small script with `location.replace` and a test table (PR 586).

### C12.3 Combo pair indexing (PR 571)

Ranking pages are `/combos` and `/combos/<rule>`. A pair page is indexable only when **featured** (own set photo and
own line of text); others are `noindex,follow` but fully linked. A paused or ended pair keeps its URL at 200 with an
honest message and live alternatives (PR 527).

### C12.4 Brand, feed and structured data (PR 590, 589, 222, 224)

**Brand names stay** (owner 12:07, replacing 12:04): structured data and the feed use the product's **real brand
field** (EXTAS only for own-label). Merchant Center feed from the catalogue, BDT, Bangladesh tested as the target
country after go-live, result logged; free listings and Shopping ads only if available (PR 589). Structured data adds
WebSite and ProductGroup; combo pages as Product + Offer at the set price. FAQ markup optional (PR 224). Review schema
only from real review rows (PR 223).

### C12.5 Expected speed of traffic

Brand queries days to 2 weeks; long-tail top 10 in 2–6 weeks; image search weeks to 3 months; journal 2–6 months.
English-script searches dominate in Bangladesh except panjabi, and no BD fashion competitor runs a `/bn` section.
**Eid 2027 panjabi pages must be indexed by 15 Jan 2027.**

## C13. Product naming and URL control (V2 · S01 · PR 590)

**Owner, 19 Oct 12:04–12:07 (Notes 26, 27).** Nothing fixed in code. Per product the owner sets the **name on the
site, the URL slug, the SEO title, the feed/ad title and the brand** (default EXTAS); shop-wide templates for slugs
and titles with tokens including `{brand}`; Google and feed preview. **Changing a slug never breaks a link:** the old
URL 301s to the new one automatically (no chains; Back is one step), the same mechanism as the WordPress migration.
An optional "other brand name" warning (setting, **off** by default); a bulk rename tool with preview; the SEO report
compares organic visits and sales before and after a rename. Claude's trademark warning (Merchant Center / Meta) is
recorded; the owner accepted the risk, noting that ads with brand-named links already run without problems.
Demo: `#/admin/naming` and "Name, link & Google" in the product form (`95-admin-naming.js`, `r12-zname.css`); the
demo carries extra brands to show the field (Lacoste, Tommy Hilfiger, Calvin Klein, Levi's, Hugo Boss, Zara).

---

# Part D · UI/UX — IN REVIEW

> **V2 · 19 Oct — Part D is reviewed through round 15 and handed to the code phase (Note 44.1).** The phone review
> finished on 18 Oct (PHONE-REVIEW "PHONE REVIEW COMPLETE"); rounds 13–15 followed on 19 Oct; the desktop review ran
> on 19 Oct (agent audit 53 findings, functional QA 14 issues, owner's 18:38 notes), all fixed in the demo. Final
> regression R15d: 337/337 testable non-backend checklist points pass, device gate 0/480, journeys 326/326. New
> sections D8–D12 follow D7.


## D0. Status of this part — IN REVIEW, NOT FINAL

> **V2 · 19 Oct — status replaced.** Round 12 was followed by rounds 13, 14 and 15 (`review/ROUND14.md`,
> `review/ROUND15.md`) and the desktop review (`review/DESKTOP-REVIEW.md`, `qa/DESKTOP-QA-REPORT.md`). The owner said
> "do 1–4 … final V2 .md" and moves to code (Note 44.1). What may be built: everything in this part, the V2 blocks
> and D8–D12. Paused (finished in code): PR 596 extensions, 598, 599, 600. Reference devices: the 15-phone device
> gate plus the owner's standard of 8 phones, 5 tablets in both orientations and desktops (Appendix C); 440 × 956
> stays the first check.


**This part is not locked.** The owner said so explicitly: the UI/UX is still being reviewed, round by
round, and he has not signed it off.

- **Last review round recorded: Round 12 (§58), 2026-10-18** — his second phone audit, home page through
  My account, 53 points. All 53 were built and verified the same day (§58.12), but **he has not re-audited
  the result**, so Round 12 is not signed off.
- **Review order he set:** phone first, then desktop. He stopped Round 11 at the product page and will not
  go further until the phone is accepted. **The desktop review has not started.** The phone and desktop
  footers will be two different designs, and that desktop footer has not been designed (§58.2).
- **What may be built now:** everything marked **Locked** below. Those were explicitly approved or locked by
  the owner — §41 (approved), §43 (build rules), §46/§47 (approved and applied), §49 (locked), §50 + §52.1
  (analytics, locked), §53 (locked), §54.1 (locked).
- **What must wait:** everything in **D6. Still open**. Do not build an answer to an open question; ask it.
- **Reference device for every "must fit" rule: 440 × 956 CSS px (iPhone 16 Pro Max class).** Secondary
  check widths: 360, 390, 414, 430, 768, 1366, 1440. **95% of customers are on phones.**

Everything below is the *current intended design*, folded together from twelve review rounds. It is a
record of what was decided, not a proposal. Where two rounds disagreed, the later one is written in and the
disagreement is listed in **D7**.

---

## D1. Standing design rules

These are rules a builder checks every piece of work against. A PR that breaks one of them is wrong even if
it does what the ticket said.

### D1.1 The owner's five principles — Locked (§4)

1. The AI agents behind the site must keep getting more capable, continuously, in the backend.
2. SEO must be exceptional.
3. Site and server must be super fast.
4. The look must be **top-class premium and classy**.
5. Extremely user-friendly — and every UI must be built to **convert**. Sales is the whole point.
6. **95% of customers are on phones.** Mobile-first in everything, and mobile is judged first.

### D1.2 The rules he repeats most

- **R1 — No empty strip on the right.** Nothing anywhere on the site may leave an empty gutter, gap or
  dead strip on the right edge: not a hero slider showing two cards, not a thumbnail rail, not a size row,
  not a footer social row, not a product grid. If content does not fill the width, the layout resizes until
  it does. (§56.1, §56.2, §57.1, §57.4, §58.2)
- **R2 — Every slider glides, it does not jump.** Continuous smooth motion everywhere a slider exists, never
  a snap from card to card. This is site-wide and absolute. (§58.1)
- **R3 — Nothing is ever deleted.** Anything the owner asks to remove becomes an **eye-toggle in the
  dashboard, default off**. The code stays, the switch is off. (§48.2, §56, §56.12)
- **R4 — The approved design is not to be redesigned.** He likes the look, the layout language and the
  visual style. Everything in this part is optimisation, correction or addition on top of it. Nothing gets
  re-imagined. (§41.1, §46)
- **R5 — What converts goes first.** Every page is ordered in decreasing importance from the top down. A
  customer does not scroll to the bottom to find the reason to buy. (§46.13)
- **R6 — Beautiful and easy at the same time.** A Gulshan or Banani buyer and a Rangpur village buyer must
  both get through it; a tech-confident 30-year-old and a 55-year-old who is not. For the older and
  less-confident: a large-text toggle, clear word labels instead of icon-only controls in the critical path,
  big obvious buttons at every decision point, and no step that depends on knowing a convention. (§41.7)
- **R7 — Combos are central.** Sets, combos and build-your-own are not a side feature; they carry the
  margin and they appear across home, category, product, bag and thank-you. (§4, §55.2)

> **V2 · rules added to D1.2 by rounds 14–15 (`agents/lessons/ALL.md`; every agent replays them before work).**
> - **R8 — AUTO ADJUST.** Nothing fixed; nothing wraps to a second line or covers anything; what cannot fit steps
>   down (full → short → icon) or hides (R14).
> - **R9 — One line.** A price line, fit line or label line is one line on every device (Note 2.5, 2.6).
> - **R10 — Never leave the combo.** No tap on a combo page takes the customer to a single product page (Note 5.1).
> - **R11 — History.** Back goes back exactly one page to the same scroll position; never a blank page, never a jump
>   home (Note 7.1, 12.2, 12.3). Popups close first.
> - **R12 — Browser behaviours.** Never stop one (pull-to-refresh, edge swipe) without putting it back (Note 6.1).
> - **R13 — Every pause has a resume.** Hover, focus, touch, popup, menu, video: the test checks it starts again at
>   the right moment; a touch rule (4 s hold) never applies to the mouse (Note 39).
> - **R14 — Hover means a real mouse.** A phone tap fires mouseenter without mouseleave; hover logic checks
>   `(hover:hover) and (pointer:fine)` and `pointerType === 'mouse'`.
> - **R15 — Desktop work never changes the phone** (Note 34.2): phone pixel-diff 0 px (Appendix C).
> - **R16 — A district or postcode in an address settles the delivery band silently** (PR 551).
> - **R17 — Demo-only helpers never show to a normal visitor** (`?demo=1` only) and never ship (Note 41.2).

> **V2.1 final · 20 Oct — timing rules proven in the timing audit TA-2** (`qa/TIMING-AUDIT.md`: 530 checks · 521 pass ·
> 0 fail · 9 info; checklist L32 and L33.01–L33.37; `agents/lessons/ALL.md`, TA-2). They extend R13 and bind every
> slider, popup and timer in the code phase (PR 42 slider engine; PR 570 audit runner; Appendix C4).
> - **R18a — Separate pause flags.** Mouse (hover), touch (the 4 s hold) and keyboard (focus, 1.5 s grace) each have
>   their own flag, cleared only by its own event. A mouse never sets the 4 s touch hold.
> - **R18b — Every pause has a tested resume path.** No pause ships without a test that it ends at the right moment.
> - **R18c — Sliders resume at once on a desktop:** within about 100 ms after the mouse leaves, after a mouse drag and
>   after a sideways wheel (measured 54–97 ms; L32, L33.01–L33.06).
> - **R18d — A vertical wheel is ignored by sliders.** It scrolls the page and never pauses a row.
> - **R18e — Every row drags with the mouse** (home, category, product, account), with no browser "ghost" drag; **a
>   click after a drag never opens the card**, a plain click does (L33.07).
> - **R18f — A toast holds while hovered or focused** (a toast with a link: "View bag", "Undo") and goes 2.6 s after
>   the mouse leaves (L33.23).
> - **R18g — Timers are cleared on every route change;** no forever timer runs on an idle page (L33.37).
> - **R18h — Focus returns to the opener** when a menu, sheet or panel closes (L33.25, L33.26).
> - **R18i — A cancelled pull-to-refresh resets** (indicator hidden, text back, no reload) (L33.32).
> - Results: timing **0 fails**; phone device gate **0/240**; phone pixel diff **0 real changes** (Appendix C3, C4).
>
> **V2.1 final · 20 Oct — R19 — a currency sign never splits from its number.** On a phone "৳" and its amount stay
> one unit (`white-space: nowrap` on every price); a price that cannot fit steps down per R8 instead of breaking. Fixed
> in the category banners (D3.4; PR 45, 61).

### D1.3 Everything is configurable — Locked (§41.2, §41.10, §41.16)

- **Every section on every page is a toggle plus a position.** Edit, drag to reorder, move from one side to
  the other, turn on, turn off, change position — on footer, header, homepage, product page, checkout,
  thank-you page, customer dashboard **and** the admin dashboard. The build's job is to make every piece
  movable; the owner arranges it himself later.
- **Every button name, section title, field label and message is editable from the backend**, in Bengali and
  English. One searchable text dictionary. Nothing hard-coded. Claude's default wording stays as the default.
- **The owner can change button colours himself** from the backend. Claude's colours are defaults only.

### D1.4 Mobile hardening — Locked build rules, from the first PR (§41.3, §43)

These came out of the customer-journey audit (36 steps × 6 viewports) and the owner's own hands-on testing.
They are non-negotiable and several of them are enforced by an automated test that **fails the build**.

| Rule | Why |
|---|---|
| Every form field is **16px or larger** | iOS Safari auto-zooms any focused field under 16px and does not zoom back. This was the single most expensive defect in the build. |
| **`touch-action: manipulation` on every control, globally** | Without it a control keeps the 300 ms double-tap-to-zoom window, so a second tap zooms the page instead of pressing the button. 117 controls had this fault. |
| Every tap target **at least 44 × 44**, padded invisibly where the drawn shape is smaller | Swatches, hearts, chips, icon buttons, small buttons. |
| **`env(safe-area-inset-bottom)`** honoured by every fixed bottom element | Nothing hides under the phone's bottom bar or notch. |
| **Zero horizontal overflow anywhere** | Automated test fails the build if any page scrolls sideways. |
| **No text under 11px** anywhere; **nothing that sells under 12.5px** | Price saving, Cash on Delivery, exchange window, badges, footer. |
| Any horizontal scroller shows a **fade or arrow** | A cut-off item must read as "there is more", never as a broken layout. |
| **Toasts and overlays never intercept taps** (`pointer-events:none` on toasts) | A toast was eating taps. |
| **Minimum 4.5:1 contrast**, checked automatically in CI | Sold-out sizes were at 2.13:1. |
| Sticky bars are **fixed with real space reserved** below the content | So nothing hides under them. |
| **Pinch-zoom on product photos stays** — it is wanted | Zoom is deliberate: pinch, or tap the zoom icon then drag. Never accidental. |

The automated gate fails the build on: horizontal overflow, a field under 16px, or a control without
`touch-action`.

Tested on small (360px), standard (390–414px), large (430px+ including the owner's 440) phones, tablets
(768), and desktop (1366, 1440) — on cheap Android and expensive phones alike.

### D1.5 Motion rules — Locked

- Never more than one thing moving at a time. Nothing loops forever. It respects the phone's
  **reduce-motion** setting. It never shifts the layout. Tasteful, not a flashing banner. (§46.4)
- **The light sweep** (a slow sheen crossing an element) is the house motion:
  - **7 seconds**, 2.2 s delay — the green buttons, and **the EXTAS wordmark in the header on every page**,
    run through the letters themselves. (§56.12)
  - **2–3.5 seconds** — "Free home delivery" on the product page. It crosses the free-delivery words
    **only, not the price**. (§57.4)
  - **4–5 seconds** — the small product-page sweeps: colour label, size block, "All N colours", "In stock".
    (§58.4)
  - Also on: "Choose your size" and the size boxes (§58.4), the footer payment marks (§58.2), "Your bag ·
    3 items" (§58.6), the checkout Need-help strip and the "Add your phone number to confirm" line (§58.7).
  - **Every sweep is a back-end switch** so the owner can turn it off if customers dislike it.
  - All sweeps switch off under `prefers-reduced-motion`.
- **Buy-button motion:** a one-time soft pulse on the primary button when it first comes into view, and
  again if the customer has been on the page a while without acting; a gentle lift and sheen on hover on
  desktop; selecting a size makes the buy bar visibly "wake up" once. (§46.4, §47.2)
- **Entry popups stay banned.** The one exception is the Celebration Overlay (§41.18): a full-screen
  particle animation for an occasion or campaign — balloons, light streaking up, text forming out of the
  particles. It is on a switch, **off by default**, and strictly bounded: the page loads and works behind it
  and it never blocks anything · 2.5 seconds maximum · any tap anywhere skips it instantly · once per
  customer per campaign · never on a slow connection or a low-end phone (it checks first and simply does not
  run) · respects reduce-motion · never delays the first thing the customer can tap · the owner previews it
  before switching it on and sees how many people skipped it.

> **V2.1 final · 20 Oct — Shimmer control** (owner Note 43.5; PR 598; demo `89t-shimmer.js`). Every sweep above is one
> entry in **Admin › Settings › Shimmer**: **14 shimmers**, each with **on/off, speed and strength**, plus a **master
> switch**; the defaults reproduce today's look. **Reduce-motion always wins: no shimmer at all.** Added by the bag
> review: "Continue shopping" (the checkout sweep) and the "FREE" delivery label in the bag summary. An **Add to Bag
> shimmer exists but is off by default** (R3). Contrast is measured at the sweep's brightest point and stays ≥ 4.5:1
> (Continue shopping 4.97:1, FREE 5.41:1).

### D1.6 Navigation rules

- **Edge-swipe back on phones.** A swipe from the left edge closes a sheet or goes back — bag back to
  product, and so on. **It must not fight the horizontal scrollers on the page.** (§46.11, §47.8)
- **On pages with their own sticky action bar** — product, combo, set, bag, checkout, exchange, landing —
  **the bottom nav hides** and the action bar sits at the very bottom. Other pages keep the bottom nav.
  (§8)
- Buttons generally: **make the label text bigger.** The owner raised this as a general complaint, not a
  one-page one. (§58.6)

### D1.7 Honesty rules the build will not break

- **No invented "was" price.** A struck-through price must come from something real: the brand's list price
  (MRP) for genuine branded goods, a real former price out of the automatic price history, a combo or set
  calculation, or a launch/limited-time price with a real end date. Invented original prices are deceptive
  pricing, illegal in several markets, and in Bangladesh customers have learned to ignore them — a premium
  brand that only discounts for real is the one that stands out. The owner keeps full control of where and
  when a "was" price appears (per category, sub-category and product). (§46.14)
- **No generator that writes customer reviews out of nothing.** That single thing is refused. Everything
  else about reviews the owner asked for **is built** — see D3.11. (§46.15, §52.4)
- **Schema is emitted only from what is actually stored** — never a rating the shop does not have. Hidden
  and waiting reviews are excluded from both the average and the schema. (§53.1, §55.3)
- **The address guess is never silently decided.** It is always visible and always one tap to change. No
  system is 100%; the target is ~95% automatic with a visible override and a learning loop. (§46.7)

### D1.8 AI-off principle — Locked (§6, §7)

The UI is deterministic code plus the Rules engine first; AI is an add-on layer. With AI off, every screen
and every flow keeps working, and anything AI already set — size-chart numbers, address mappings, notes,
settings — stays in effect. Nothing in this part may be built so that it only works when AI is on.

### D1.9 How UI work is run — Locked standing instruction (§56.13, §57.5, §58)

> **V2 · 19 Oct.** Bugs are fixed without asking; for design choices one option is picked, applied and 2–3
> pictures kept so the owner can confirm or change it later (Note 4, 03:34). Answers and picture labels for the
> owner are in simple Bengali (Note 5.0). "Done" means the Appendix C gate passed and the screenshots were looked
> at, not one device (lessons R14). Build switches and settings first and data changes last, so an owner reversal
> costs nothing.


- When the owner returns with a review list, the work is **split across two or three agents running at once**
  (Round 12 used five), never one agent working through it in series. The split is by area — for example
  homepage + footer / product page / cart + checkout + thank-you — and the results are **brought back
  together and verified as one build before he is shown anything**.
- Each agent must also **hunt for defects beyond its list** and bring suggestions back.
- Reporting is **section by section with screenshots**, phone first then desktop, not one dump.
- **Audit brief, amended (§46):** every audit must include **finger-drag and swipe gestures**, must **open
  every menu entry**, and must **follow every footer and menu link to its page**. The earlier audits missed
  real defects because the brief did not ask for these.
- **Screenshots before implementing** were required for the optimised checkout, the bag page and the contact
  page. (§46.8, §46.9, §46.16)

---

## D2. The compulsory first-screen rule — Locked (§57.5, §58.4, §58.12)

> **V2 · 19 Oct.** The fit line sits centred in the space between the size boxes and the buy bar; +3 px between
> "Colour – Black" and the swatches, paid from that space, photo height unchanged (Note 2.8). The buy bar uses
> `viewport-fit=cover` and `padding-bottom:max(12px, env(safe-area-inset-bottom))` with `overscroll-behavior-y:none`
> so it never sinks under the screen edge on a real iPhone (Note 2.1; final proof needs the owner's real phone).
> On desktop, Order Now is above the fold on every template at 1024–1366 (worst 707 px at 1024 × 768).


The owner calls this compulsory. It is the single hardest constraint in the UI.

**The rule.** On a **440 × 956 CSS px** phone, opening **any** product in **any** category, sub-category or
sub-sub-category, the **first screen** — with no scrolling — must reach from the free-delivery strip at the
top down to **the size row and the measurement line that appears when a size is tapped**, with
**1–1.5 px of clearance below it, above the Add to Bag / Order Now bar**.

**Why 1–1.5 px and not more.** Earlier rounds allowed a 49–78 px gap, which let the top edge of the next
block peek above the buy bar. Round 12 closed that: the measurement line was sliding slightly *under* the
buy bar on some pages, and the owner wants it to end dead flat just above it.

**It is implemented as a measured budget, not per-product tuning.** This is the part that matters for the
build:

- Product-page image height used to differ per category and per template, so only the polo lined up. That is
  not acceptable.
- One shared photo height replaced it: **`--pdp-img: min(38vh, 360px)`**, dropping to 35vh / 330px on narrow
  phones. The photo always fills the **full width**; only its height is budgeted.
- The whole first screen is then computed from a height budget, **`PDP_FIT` + `pdp_budget()` in
  `30-product.js`** — **this is the one and only place the rule is configured.** A builder changing
  first-screen fit changes it there and nowhere else.
- It must be **back-end driven**, so a category that does not exist yet — a jacket, say — obeys it
  automatically with no code change. (§58.4)

**Proof recorded:** all 17 demo products **PASS at 440 × 956 and at 390 × 844**, measured one by one, with
the last block clearing the buy bar by **1.25–1.27 px**. It was proved against an injected `jackets`
category with a 54-character title, 7 sizes, 6 colours, a discount and free delivery — it obeyed on first
render with no code change. (§57.6, §58.12)

**Still to satisfy within the same budget:**

- **Trousers:** choosing size 34 must not hide the hip and length figures behind the bottom bar. Fix per
  category. (§58.4)
- **Panjabi and pages like it:** Find my size needs 1–2 px of air below it; the space comes from higher up
  the page. (§58.4)
- **Shirt:** "Tap a size to see its measurements" needs 1 px below it. (§58.4)
- **Every price combination** must be checked inside the budget: with discount / without discount × with
  free delivery / without. (§57.5)
- **Long titles** must not break it: with "Full Floren Spandex Lycra Cotton Premium Polo Shirt" the price,
  the free-delivery line and all five swatches still land on the first screen. (§51, §53.6)

**The set / combo page has the same discipline.** Its stage is capped to `min(38vh, 320px)` so the set
price and both buttons land in the first screen; the page went 4,861 → 4,614 px. (§58.12)

---

## D3. Page by page

### D3.1 Header — Locked except where noted

> **V2 · 19 Oct (Notes 2.4, 3.1–3.5, 42.2–42.3).**
> - **WhatsApp icon in the header on every page**, first in the search/bag group, exactly the product page's glyph in
>   the pale-green disc. Hover (real mouse only) grows it ×1.14 and drops the tip **"Need any help"**; press grows
>   it. A soft glow spreads out ("bleeds"), never a flicker or shimmer. Switch `SHOWN.header.whatsapp` (on); pages
>   in `HDR_WA_PAGES`. **Checkout:** it appears in the header, left of the "Secure" lock with a gap, only after the
>   "Need help? WhatsApp" block has scrolled away. The floating WhatsApp disc is a switch, **off** (`fab.whatsapp`).
> - Icon gaps 2 px smaller; the **heart (wishlist)** sits in the header too (asks to log in without an account),
>   hidden by the header fit on phones too narrow for it (`HDR_WISH_PHONE`).
> - **Bag icon bigger and clearer; it pulses in the header and the bottom bar while the bag has items.**
> - Narrow phones (≤ 374 px): icons 40 px, logo clamps 20–24 px; the header never moves after a page change.
> - Logo as text or an uploaded image with a phone version; **slogan under the logo** (editable, shared with the
>   footer, on) — PR 598, paused. Clicking any link to the current page scrolls to the top (demo `99-boot.js`).
> - Desktop: data-driven mega menu (D9). Demo: `03-layout.js` (`hdrWa()`, `waGlyph()`).


- **EXTAS wordmark**, larger and more refined than the original. The **light sweep runs through the letters
  themselves**, same 7 s rhythm and 2.2 s delay as the buttons, on every page, off under reduce-motion.
  (§46.16, §56.12)
- **Search sits beside the Bag icon, top right** — moved out of its old position left of the wordmark.
  (§49.1)
- **The EN | বাং language toggle is out of the header entirely, site-wide.** It lives only in the footer,
  written exactly as **"EN | বাং"**. (§49.1, §51)
- **Bag and wishlist-heart icons redrawn** — the originals were not good enough. (§46.16, §47.8)
- **On a phone the product page shows a back arrow in the header**, which is why the breadcrumb is hidden
  there. (§47.2)
- **Hotline on desktop, in the header beside WhatsApp.** (§46.16)
- All buttons, cards and inputs are **softly rounded**: 10 px buttons, 8 px controls, 12 px cards. (§49.1)
- Header sections are toggle-plus-position in the page builder like every other page. (§41.2)

### D3.2 Menu and search

> **V2 · 19 Oct.** Search answers help words ("delivery", "return policy", "exchange policy", "COD") with the right
> help page and a one-line answer from the live rules, handles typos, multi-word queries and Bengali ("polo shirt",
> "গেঞ্জি") — Note 4.1, 36; demo `07-help-search.js`. The sub-menu system and rebuilt search were approved on 18 Oct
> (register, +7). Journal is in the header nav and the phone menu. Desktop mega menu: D9.


**Menu drawer**

- **The drawer starts below the header**, not from the very top of the screen — full-page top-to-bottom
  looked wrong. (§48.4)
- Contents, in order: a quick row of **Search / Bag / Wishlist / Account**, then **New in**, every category,
  **Build your own set**, **Sets & combos**, a **Help** block, and **WhatsApp plus the hotline at the
  bottom**. (§47.8, §46.16)
- **16 px display type on 54 px rows.** Menu items must be noticeable — the typography and style were
  deliberately strengthened. (§46.16, §47.8)
- The **Sets** entry used to render its sizes on top of each other — fixed. (§46.12, §47.8)

**Sub-menus — proposal, awaiting the owner (§58.3)**

Today the three-dot menu goes straight to the category. The owner asked: if a category has sub-categories,
the menu should open those first and then go. **Claude must explain how sub-menus will work and show it in a
picture before building it.** Not yet approved.

**Search — partly open**

- Tapping the header search opens a **half window from the bottom**. The owner asked whether on a phone it
  should come from the **top or the middle** instead. **Claude to recommend; not yet decided.** (§58.3)
- **Search must also return help articles** — delivery charge, returns, exchange — not only products and
  categories. (§58.3)
- **Not yet built (§58.11):** the search engine has no prefix match, no synonyms, no Bengali keywords and no
  help pages, so "polo shirt" and "গেঞ্জি" return nothing. The search results page has no filter or sort,
  and its "Popular right now" row ignores the query.

### D3.3 Home page

> **V2 · 19 Oct.** "Shop sets" uses the v3 brand tint (`HERO_SETS_BTN = 'v3'`, Note 1.1). Hero buttons — labels,
> links, style, on/off — are backend settings (Note 3.12). The floating WhatsApp is off (header icon instead).
> Sliders snap after a hand drag and keep auto-drift (Note 23.12); on desktop they restart the moment the mouse
> leaves (Note 39). Desktop: hero text aligned to the content edge, slides dissolve into the panel colour over 140 px
> (`HERO_FADE`; 80 and 140 + wash kept as options), reviews one row of 3 sliding (Note 35.1–35.3). Home sections
> are arranged in the page layout builder (PR 595; demo `HOME_SECTIONS` in `20-home.js`).


- **Hero slider.** No empty strip on the right when two products show (it left ~18–19 px). It carries
  **12–15 products across all categories, two or three per category, running continuously**. (§57.1)
  - **The white name+price pin sizes itself**: fixed height, width grows with the name, the price beside the
    name separated by a bar, the whole pin semi-transparent. A short name ("Polo") gives a small pin; a long
    one ("Classic Panjabi") no longer breaks out of its box. **The discount case — struck-through price — has
    its own corrected layout.** (§57.1)
  - *Known defect, not yet fixed:* the hero arrows only appear on hover, so a phone cannot step the hero —
    drag only. (§58.11)
- **Trust row under Shop now / Shop sets.** The two trust lines become **one line with a bar between them**,
  using the **whole width**. The copy is **not** to be shortened to make it fit — "Cash on Delivery **all
  over Bangladesh**" was cut while free space remained on the right; the line is optimised instead.
  (§57.1, §58.1)
- **Winter collection row.** Desktop shows **three** products, not two, so the right side is not empty. On
  the phone it is a **slider** (swipe and auto-advance) accepting as many pictures as the owner adds. **The
  sliding cards pass *behind* the "Winter 2026" banner card, up to its border — not over it.** (§56.1)
- **Flash sale.**
  - The countdown sits **on the right on the phone too**, as it already does on desktop, with the type
    scaled to fit — it must not drop below and make the section tall. (§56.1)
  - **No HRS / MIN / SEC labels — numbers only.** **"Ends in" on one line** (not "Ends" with "in" stacked
    underneath), then the clock. (§57.1)
  - The grid is 2 columns × 2 rows and **each row is its own independent slider** — with 100 flash products,
    row one slides through about ten and row two through another ten. (§57.1)
  - **Both rows auto-slide smoothly and in opposite directions at the same time** — the top row drifts left,
    the bottom row drifts right. (§58.1)
  - *Known defect, not yet fixed:* the countdown is a painted-on string that never ticks and resets on every
    render. (§58.11)
- **"What customers say."** Up to **ten** reviews, not three, and it **auto-slides slowly to the left on its
  own** — not drag-only. (§56.1, §57.1, §58.1)
- **"From the journal."** A slider of the last ten posts; a tap opens the article. Accepted as built. (§57.1,
  §58.1)
- **"Find your size" band.** The icon sits **immediately before the "F" of "Find"**, the text starts there,
  and the second line runs the full width — no large empty block top-left and no empty right side. (§57.1)
- **[Replaced on 19 Oct by the header WhatsApp icon; the floating disc is a switch, off — Note 3.1.]** **Floating WhatsApp icon on the home page**, vertically centred, **drifting about 1 cm up and 1 cm down
  with the scroll** rather than sitting rigid. Its position is under review — see D6. (§57.1, §58.10)
- Homepage sections are toggle-plus-position and reorderable. (§41.2)

### D3.4 Category page

> **V2 · 19 Oct.** Filters are built from the category's own products: sizes only those that exist up to the
> largest present (S…3XL/4XL/5XL), colours present with counts, fits only those present (PR 46, Note 35.7). Each
> category page is arrangeable in the layout builder (PR 595; `CAT_SECTIONS`, slot `CAT_SLOTS.afterGrid` in
> `21-category.js`). Desktop gutters can hold the side canvas (PR 596, off by default). The lower filter row and
> the top Filter / Recommended / On sale row are backend options (R14 14.3–14.4).
>
> **V2.1 final · 20 Oct — phone price rule.** On narrow phones a price in a category banner could break between "৳"
> and its number. Every price is now one unit (`white-space: nowrap`): the currency sign and its number never split
> across lines (D1.2 R19; PR 45, 61).


- **Breadcrumb stays visible, and JSON-LD breadcrumb structured data is added as well.** The owner asked
  whether the visible trail could be dropped in favour of back-end structured data only; the answer given and
  accepted was keep both. Switch: `category.breadcrumb`, default on. (§57.3, §57.6, §58.3)
  - *Known defect, not yet fixed:* the breadcrumb "Home" link is a 35 × 19 px tap target, under the 44 × 44
    rule. (§58.11)
- **Category name stays, with a short line under it.** (§57.3)
- **Filter / Recommended / On sale controls.**
  - All three get the **same treatment, same getup, same box size and same font size** — the transparent box.
    "Recommended" was white-backgrounded with type too small; the word "Filter" was breaking out of its box.
    (§46.12, §57.3, §58.3)
  - **"Recommended" is a real button plus a listbox anchored 6 px under the control** — not a native
    `<select>`. A phone browser draws a select's option list itself, pinned to the bottom of the screen,
    which is why the popup opened at the bottom of the page and no CSS could have moved or recoloured it.
    (§58.10)
  - **The sticky filter bar is a direct child of the main column** so it actually sticks; inside a short
    wrapper it slid away after a few hundred pixels. (§58.10)
  - The filter row and the sort row sit level with each other. (§46.12)
- **The chip row** (Set price · ৳800–1,200 · Regular fit · Slim fit) — **all chips the same size, fitted to
  the width.** (§58.3)
  - **How "Set price" works, as answered to the owner:** the chip is a **yes/no filter**; the ৳800–1,200 band
    is hard-coded; the real set tiers come automatically from **Admin → Smart Rules**. The popup itself is
    fine as it is. (§57.3, §57.6)
- **Bundle section ("Start bundle").** The icon goes before the text or is positioned properly — it must not
  sit on top and waste the space to its right. (§57.3)
- **The "Pick any of these" bundle slider is ONE row, not two.** It slides; the list below grows downward as
  more products come. **Two cards per screen, not three** — at three the products are too small to read.
  The owner marked this mandatory. (§58.3)
- **"Find my size" on this page is bigger and bolder** so it catches the eye. (§57.3)
- **[Replaced on 19 Oct by the header WhatsApp icon — Note 3.1.]** **Floating WhatsApp icon on this page and on every page**, with a **back-end switch for which pages it
  shows on and where it sits** (`fab.whatsapp`). (§57.3)
- **Category SEO text.** Every category and sub-category (including brand-based ones) gets its own written
  description, hand-written or AI-generated. Honest point recorded: **text that only lives in the backend
  gives no SEO benefit** — Google has to read it on the page. So it is a **visible block at the bottom of the
  category page, collapsed behind "Read more"**. Meta title and meta description stay backend-only fields.
  (§41.11)
- "Trousers category, Set price available on the left" — fine as it is, no change. (§46.16)
- **Known defects, not yet fixed (§58.11):** `cat_banner()` is hardcoded to polos/tshirts, so a set rule on
  any other category silently shows nothing · `cat_bundlePicks` only ever shows the first 6 styles, so styles
  7+ are invisible however long you watch · every filter tap re-renders the page and restarts the conveyor at
  0, so the shopper loses their place.

### D3.5 Product page — the buy block

> **V2 · 19 Oct — round 15 (Notes 2, 3, 13) — these win over anything below.**
> - **Title:** the first line fills the full width; leftover words go to line 2; the **heart sits right after the last
>   word**. Share is switched off (kept). The floating icon column is off (`SHOWN.pdpIcons = {panel:false, wish:true,
>   share:false, whatsapp:false}`).
> - **"All N colours":** ≤ 5 colours → right after the last swatch on the swatch line, stepping down "All 5 colours" →
>   "5 colours" → "▦5" if needed; ≥ 6 → the "Colour – Navy" label line (`PDP_ALLC_UP_FROM = 6`).
> - **Fit line** (after picking a size): one line; fields hide from the end; the first field always stays
>   (`pdp_fitLineTrim()`); centred between the size boxes and the buy bar.
> - **Price row:** `৳price · | · text`, always one line on every device (`pdp_payFit()`: type steps 0.5 px down to 11.5
>   px, then the last pieces hide; never wraps, never "…"). With a discount: price | discount (stacked) | **second
>   bar** | free delivery or the owner's text; when the second bar shows is set per product / offer / campaign; if
>   it cannot fit, "Free" stacks over "home delivery" like the discount stack.
> - **Add to Bag** is a near shade of Order Now (one family of two buttons).
> - Size chart chip 2 px higher; six sizes S…3XL auto-fit (tested); size chart popup scroll waived (Note 2.7).
> - **Zoom:** tap / double-tap / pinch opens a full-screen viewer with the **full original image** from the backend,
>   not the cropped one; desktop adds drag, wheel, ‹ › and keyboard (Note 13.1; demo `31-zoom.js`).
> - Brand line on the page from the product's brand field (PR 590); care-guide link to the matching journal post
>   (PR 591 scope); trial-at-the-door text when the setting is on.
> Demo: `30-product.js`, `r12-pdp.css`.


This is the most-reviewed page in the build. Order of the buy block, top to bottom:

**photo → eyebrow → title → rating → price row → colour → size row → measurement line → Find my size →
stock line → trust row → Delivery | Exchange | Returns → offers → details → reviews → Q&A → product rows**

**Photo and gallery**

- **The photo fills the full width.** Only its height is budgeted — `min(38vh, 360px)`, 35vh/330 on narrow
  phones. Capping the height without filling the width left the image sitting in a corner with empty space at
  the side; that was a Claude bug and is fixed. (§48.1, §57.6)
- **The thumbnail strip fills the width** — no white strip on the right — for **4, 5 or 6 images alike**.
  **A minimum of four images is enforced at upload**; above four, any number fits. (§52.2, §57.4)
- **Thumbnails follow the arrows.** The arrows change the main photo and the thumbnails move with it. **The
  main photo is swipeable by hand**, and swiping must keep working after the arrows have been used. (§58.4)
- Thumbnails below the main image **or** down the side — a per-store / per-product option. (§41.4, §53.5)
- Pinch-zoom stays; the zoom icon then drag is the deliberate path. (§41.3)
- **The "POLOS · SKU EX-POL-1001" line under the thumbnails is removed** and that space is used. (§48.1)
- **The model badge** ("Model 5'10" · 72 kg · wears L") uses a **shadow or better placement** — the solid slab
  behind it looked bad. It shows only on products where the owner ticks "has model photo". (§5, §57.4)

**Title**

- Wraps on whole words, balanced across its lines, **clamped at two lines on a phone and three on desktop**,
  ellipsis after that. (§51, §53.6)
- **The title has the full column width** because the action icons are a floating column, not inline. (§52.2)

**Price row — Style B is the live default, Locked (§54.1)**

- `৳ 850` — **a space after the Taka sign** (§48.1) — then a space, then a **thick 5 px vertical bar in the
  brand colour, vertically centred on the price** (`align-self:center`), then a **larger truck icon** and
  **Free home delivery** in brand green.
- **The truck icon is slightly larger than the "F" of "Free".** (§57.4)
- **Price and "Free home delivery" both go up one or two type sizes**, and the truck icon with them. (§57.4)
- **The price row sits further right** — the price and its icon move right by one or two spaces, and the
  COD | bKash | Nagad line is pushed further right too. (§58.4)
- **The price is bolder on desktop**, and the part after the bar a little bolder too. (§56.6)
- **When the product is not free delivery**, the same slot after the bar carries the payment line instead —
  `COD | bKash | Nagad | Card` in the quiet grey — so the line is never half empty. (§54.1)
- **When the product is discounted**, the COD | bKash | Nagad line is dropped and the **struck price, the
  −21% and "Save ৳450" go on the far side of the bar**, with the bar in the middle, two spaces before it and
  two after, cut to one space each if it will not fit. Switch `pdpPrice.discountAfterBar`, **default on**.
  (§58.4)
- **Style A stays in the backend as the per-product alternative**: a full-width free-delivery strip under the
  price, with a soft shadow, on one line — "Free home delivery | COD available" and "| All over Bangladesh"
  where the screen is wide enough, icon and type at 15.5px. (§49.2, §51, §53.5)
- **Every combination must be checked** — with/without discount × with/without free delivery. (§57.5)
- A product's **free-delivery flag** set at upload, or a running **free-delivery campaign**, or the **cart
  threshold** (free over ৳1,500 / ৳2,000 / ৳2,500) all feed this same place. (§48.1, §48.2)

**Colour**

- A **row of dots** for scanning, with **the selected colour's name written above the row** — "Colour: Deep
  Navy". Both, deliberately: dots alone fail in this market because cheap phone screens over-saturate and
  navy and black look identical in low light, and a 55-year-old will not risk ৳1,200 on a dot he cannot read;
  names alone are slow to scan and eat the first screen. (§46.2)
- **Four colours or fewer**: the name may also sit under each dot — a per-product switch. (§46.2)
- Every swatch carries its colour name as its **accessible label**, and a **long-press shows the name**.
  (§46.2)
- **A single-colour product shows only the words "Colour: Black" — no swatch dots.** A combo reads
  "Colour: Black & Navy combo". (§48.1)
- **"All N colours" is clickable** and opens a popup showing every colour with its own photo. Tapping a
  colour selects it and goes to Add to Bag / Order Now as a single order. The reason this exists: the page
  opens on black by default and many customers never work out how to switch — which is why big sites split
  colours into separate products. EXTAS keeps one product and solves it with this popup. (§48.1)
  - **It always sits level with the last colour swatch** and moves right as colours are added. (§57.4)
  - **With only three colours it is pushed right, onto the Size-chart button's line**, with its type raised.
    It must find that position **automatically for 3, 5 or 6 colours**. (§58.4)
  - Its type is bigger by one or two steps. (§57.4)
- **"Colour · Olive" label type is bigger**, and **"Size · Choose your size" is the same size as the Colour
  label**. (§57.4)
- **The colour note** ("Deep navy. Can look almost black in low light — see the daylight photo") moves off the
  first screen. Switch `pdp.colourNote`, **default off**. The first screen ends at the swatches with a clean
  gap — no half-cut line of text underneath. (§53.4)
- **"See true-colour photo"** — switch `pdp.trueColourLink`, **default off**. (§53.4)
- When the owner switches any of these off, **the space closes up automatically**. (§53.4)
- **The gap between the swatches and "Size · Choose your size" comes up 5–6 px**, so Size starts just under
  the swatches — while the **real gap above the buy bar holds**. (§49.2, §52.2, §57.4)

**Size**

- Order: **Colour → Size → then Find my size.** Find my size comes **after** the size row, not before. (§56.5)
- The size row is "Choose your size" with **Size chart on the right**, then S M L XL XXL.
- **The size pills are much bigger with bold type, on the scale of the price.** "XXL" must read clearly.
  (§56.5)
- **The size boxes fill 100% of the width** — no empty strip on the right on the phone. **When 3XL or 4XL is
  added they re-size themselves and stay on one line.** (§57.4)
- **Tapping a size selects it. It never adds and never increments.** Tapping L four times leaves one L
  selected. (§46.6)
- **The measurement line** under the sizes: **the size letter and the numbers bold, font one size up**, with
  **1–1.5 px of clearance below it** on every page. (§57.4, §58.4)
- **The cm/inch toggle is removed from the product page.** Inches on the page; **cm belongs only inside the
  size-chart popup.** Switch `pdp.unitToggle`, **default off**. (§56.5)
- **The "Runs small / True to size / Runs large" fit bar is removed.** Switch `pdp.fitBar`, **default off**.
  (§56.5)
- **The Size-chart control** runs **from the right edge of the last size box to the right edge of the
  screen**. It is a bordered control (110 × 44), not a text link. Two or three visual versions were to be
  tried and the best picked. (§47.3, §57.4)

**Find my size**

- Height and weight **only** — no fit-preference question, no build question. (§5)
- Size logic is set **per category** and overridable **per product**: a 70 kg, 5'8" customer needs one size in
  a T-shirt or polo, another in a shirt, another again in a panjabi. The owner enters and adjusts the
  height/weight bands in the backend; AI proposes the bands from the measurement chart and from past orders
  and returns, and the owner approves or edits; it learns from exchanges and flags a band that keeps producing
  "too tight". (§41.5)
- **The card aligns to the same right edge as the Returns box**, so the text fits on one line and the card is
  shorter. (§57.4)
- **The sheet is bigger and clearer** — type up, window two sizes larger. (§57.4)
- On panjabi-type pages it needs **1–2 px of air below it**, found from higher up the page. (§58.4)
- A customer's saved size profile feeds it everywhere. (§41.17)

**Stock and trust lines**

- **"Only 3 left in Olive, size L" stays** — it creates urgency — but it currently appears too far down and
  **a better place must be found**. (§57.4)
- **"100% original" goes on the same line** as the exchange window and free delivery, not below, and that
  line is optimised. (§56.5)
- **Those lines must not blend into the background — raise the contrast.** (§56.5)
- **The offer boxes and the 72-hour / Free / 100% original row align to the same right edge** as everything
  else on the page. (§57.4)

**The floating action icon column — heart / share / WhatsApp**

- **46 px circles stacked vertically down the right**, positioned **over the title block** so they add no
  height to the page — which is what let the colour row move up. (§52.2)
- **Desktop: at the far right, 2–3 px to the right of the Order Now button's line.** (§56.4)
- **It floats with the scroll on both desktop and phone, staying vertically centred in the window — not
  pinned** — and it **drifts about an inch up and an inch down and settles**: visibly alive, but always in
  the same place. (§56.4, §57.4)
- **Phone home position is 38% of the viewport, not 50%.** At 50% it parked permanently on the fifth
  thumbnail on every product's first screen. (§57.6)
- **It must never ride up over the title. The title's line is its ceiling; it never climbs onto the
  photograph.** (§58.4)
- **Desktop: hovering the WhatsApp icon shows a small floating label.** (§56.4)
- **Which icons show — or the whole panel off — is `pdpIcons.panel / wish / share / whatsapp`.** The same
  applies to any floating icon anywhere. (§53.2)
- **The WhatsApp glyph is the proper transparent WhatsApp mark**, not a generic speech bubble. One shared
  `waGlyph()` draws every WhatsApp control on every page. (§58.1, §58.10)

**Share**

- Tapping Share **slides a row of icons out in place, full width** — Facebook, Messenger, WhatsApp,
  Instagram, and copy link — each in its own brand tint. It is not a modal. (§53.3)
- **It floats as an overlay under the icon column, so nothing below it moves.** Measured: short title, long
  title, and long title with share open all leave the colour swatches at the same place and the gap above
  the buy bar unchanged. (§54.2)
- **No white panel behind it.** Fully transparent background — only the icon tiles, each with its own shadow,
  with the page showing through between them. **The tiles are a little smaller.** (§56.3)
- **It closes itself**: tapping any share option closes it, tapping anywhere else closes it, and if nobody
  uses it, it closes on its own after 8 seconds. Tapping Share again toggles it. (§54.2)

**The buy bar**

- **Sticky bottom buy bar on the phone**, always reachable, slimmed. The bottom nav hides on this page.
  (§41.9, §47.2, §8)
- **Desktop: Add to Bag and Order Now must be visible in the first window.** If a customer cannot see them
  without scrolling, the will to scroll drops. Offers move further down to make room. (§56.6)
- **Add to Bag and Order Now must not look identical.** Add to Bag gets a **different but harmonious**
  colour. Claude shows **4–5 numbered combinations in one image** so the owner can pick — he may answer
  "number 1", or "number 1's Add to Bag with number 3's Order Now". **Option 1 is shipped pending his pick.**
  The pair is `PDP_CTA_STYLE`, **shared with the set page** so one change moves both. (§58.4, §58.12)
- **Add to Bag adds exactly one.** Repeat taps within one second (1.2 s in the build) are ignored. (§46.6)

### D3.6 Product page — below the buy block

- **Delivery | Exchange | Returns are one bar-separated row on the phone** (three stacked rows were 303 px;
  one row is 121 px) and **three columns on desktop** (387 → 174 px). (§46.13, §47.2)
  - **The Delivery row shows the value, not the word "Details".** If the product is flagged free delivery it
    says **Free**, highlighted; otherwise the normal rule applies automatically. Toggling the product's
    free-delivery checkbox flips it, and the cart-threshold version feeds the same place. (§48.2)
  - **The Exchange row shows the window** — "72 hours" today — nicely set, with a round badge if that looks
    good. **The value always comes from the Rules setting, never hard-coded in copy.** (§7, §48.2)
  - **The Returns row wording is still open.** "No return" reads badly; a smarter, still-honest phrasing is
    needed. (§48.2 — see D6.)
  - **All three stay clickable for the full rule.** The owner controls which of them show and what each says —
    he may want Delivery only. (§46.13, §48.2)
  - **Only one panel opens at a time**, and **the opened panel's text fills the width and runs line by line**,
    from under Exchange across to Returns — not a tall narrow box. (§47.2, §57.4)
- **Fabric & care opens to its first line only on every screen size** — "Fabric · 100% combed cotton piqué ·
  220 GSM" — with "Read more" for Care and the rest. (An earlier fix applied only on desktop; corrected.) The
  owner likes it as it now is. (§49.2, §51, §57.4)
- **All block names (Fabric & care and the rest) are editable by the owner.** (§48.2)
- **Reviews on the page: three at most, the ones with photos first**, the one without a photo last. **They
  slide — 3 to 5 of them — instead of stacking one under another.** (§56.5, §57.4)
- **The "Ask on WhatsApp" icon in the Q&A block is made stronger and better looking.** (§56.5)
- **The product rows at the bottom — you-may-also-like and recently viewed — all slide automatically.** Two
  rows, one category each, with a **back-end option to set which category each row shows**. (§57.4)
- **Every block on this page has an on/off switch and a position**, including "See true-colour photo".
  Nothing is hidden by default that the owner has not switched off himself. (§46.1)

### D3.7 Product page — templates, colours and URLs

> **V2 · 19 Oct.** Live product URLs are `/p/<style-slug>`, category-free (PR 220, 527); name, slug, SEO title,
> feed title and brand are set per product with shop-wide templates; a changed slug 301s automatically (PR 590, C13).


- **At least 3 product-page templates** (target 4–5), selectable per category or per product, so the owner can
  A/B them: **T1 Classic, T2 Editorial, T3 Fit-first** now; T4 Video-first and T5 Combo-push later. A/B
  testing is an **optional module with on/off (global and per test), default OFF**, with a per-template
  conversion report. (§4, §5)
  - *Bug fixed on the way:* `pdp_t3Card` referenced an undefined variable, which threw and left the **whole
    T3 template blank** — `contrast-collar-polo` rendered nothing at all. (§57.6)
- **Per-colour URLs — the premium way to get Fabrilife's benefit without their cost (§46.3):**
  - **One product page, all colours on it.** Clean and premium.
  - **Every colour still gets its own shareable, indexable URL** — `/p/essential-pique-polo/navy` — with its
    own title, meta description and Open Graph image, opening the page with that colour already selected.
  - **Every colour is its own row in the product feed**, with its own image, so ad campaigns stay per-colour
    and the ad lands on the right colour.
  - **Canonical is configurable per category**: point all colours at the main product (concentrates SEO) or
    let each colour stand alone where the copy genuinely differs. **Default: canonical to the main product.**
- **Size charts live in e-commerce, not the ERP.** The ERP holds only size labels (M/L/XL, 30/32). Charts are
  per product type and fit, with type-specific fields (tops: chest/length/shoulder/sleeve; bottoms:
  waist/hip/thigh/length/leg opening; boxers: waist relaxed/stretched); default by category → sub-category →
  per-style override; auto-attached on product upload by category + fit; inches entered once, cm computed;
  ease per fit feeds Find my size (rule-based, works with AI off); a how-to-measure diagram per type; quick
  fill by grid, paste from Excel, or optional AI read from a spec-sheet photo; a warning when a linked
  product has an ERP size label with no chart row. The same data feeds the PDP chart, the inline measurement
  line, Find my size and the Fit-first table. (§6)

### D3.8 Size-chart popup

- **One fixed modal.** No page content visible above it, no second scrolling area, and **it does not scroll
  with the page.** (§46.12, §46.17, §47.3, §58.4)
- **It floats with a gap on all four sides**, so a sliver of the page shows behind it. (§51)
- **Full height on the phone**, starting below the header. (§47.3, §48.3)
- **Tapping a size row in the chart selects that size on the product.** (§7)
- **Measurement columns are per product.** Not every product has shoulder or sleeve. **A measurement that has
  not been entered does not render — no empty box, no dash.** A polo may show only chest and length, and the
  How-to-measure list drops to match. (§46.17, §47.3)
- **"Not sure? / Find my size" and "Still unsure? / Ask on WhatsApp" sit side by side as two equal cards**,
  exactly where the empty space was, on **the same neutral background** — the green-on-white pairing is gone
  and green only appears on hover of the WhatsApp one. The long "Still unsure…" sentence is gone; it is
  inside the WhatsApp card. **How to measure returns to full width underneath.** (§48.3, §49.3, §51)
- The **"Size chart" heading has a proper design**; "How to measure" stays as it is — it is good. (§46.17)
- **cm lives only here**, not on the product page. (§56.5)

### D3.9 Combo / set page

> **V2 · 19 Oct — superseded in detail by D8 (combos).** Picture taps never leave the combo page; colour and size
> are picked in place; the "Your set" boxes keep scrolling to the list (Note 5.1).


- **2–3 template options**, owner-customisable: **C1 Stacked and C2 Step-by-step** now, C3 Lookbook later.
  (§4)
- **3–4 items per set supported, not only 2.** (§4)
- **Main image is the composed combo image**; below it a gallery pulling **2–4 extra images from each
  component product**. (§4)
- **Price display very clear and attractive**: set price / price separately / "save ৳ and %". (§4)
- **Combo colour naming uses "+"** — "Black + Navy", never a single colour. Auto-name is
  "Name — Colour + Colour". (§4)
- **First screen:** the stage is capped to `min(38vh, 320px)`, so **the set price and both buttons land in
  the first screen**. Before that the page opened on one enormous photograph with price, saving and buttons
  all below the fold — the exact fault the product page had just been cured of. Page height 4,861 → 4,614 px.
  (§58.12)
- **The set page follows `PDP_CTA_STYLE`**, so the button colour pair changes on both pages at once. It used
  to use green + black while the product page used the owner's chosen pair. (§58.12)
- **"Buy together, save more" / popular pairs show three per row** where three fit, not two. (§58.4)
- **The item thumbnails (Item 1 Navy, Item 2 White) get a deeper shadow** so they catch the eye — **not a
  black border**, because selecting one already turns it black. (§58.4)
- **Claude goes through this page A to Z personally**, not only through an agent. (§58.4)
- **Build-your-own set:** a public page, no account needed; entry from home and category banners, a PDP line
  and the menu; adds as **one bag line**; normal guest checkout; account auto-created after the order;
  logged-in users get their saved size preselected; **shown only in enabled categories**. (§5)
- **The owner defines exactly what customers may combine** — category ↔ category rules (Polo+Polo,
  Shirt+Chino) or SKU-to-SKU lists, each with an item count, a fixed tier price, dates and stock-awareness.
  The builder shows only allowed products. **The owner's own fixed combos are fully free-form.** (§6)
- **Customer-built sets sit behind a global and per-category toggle, default OFF.** Only the owner's fixed
  combos are live until he turns them on. (§5)
- **Auto-apply combo price when the bag matches a combo**, per-combo toggle. (§4, §5)

### D3.10 Add-to-bag sheet

> **V2 · 19 Oct.** "Buy together" → Add to Bag → "View bag" opens the bag (bug fixed, Note 3.6). Desktop uses a
> right-side "Added to bag" drawer (420 px) on product, auto-combo and set pages. Owner rule kept: never "add ৳X
> more" on the sheet; it reads "Free delivery on this order" or "COD · 72-hour exchange" (exchange window from
> Rules).


- **Three behaviours, the owner picks:** a small toast and stay on the page · a slide-in mini-cart · go
  straight to the cart page. **Default: slide-in mini-cart** with "Continue shopping" and "Checkout". (§41.9)
- **Device difference: desktop = right-side drawer, phone = bottom sheet.** The right edge of a phone is the
  hardest place for a thumb and the bottom is the easiest. (§46.5)
- **A short sheet rises from the bottom with a grab handle; a tall one (the size chart) fills the screen with
  no gap.** An earlier modal fix made every phone modal full-screen, so the add-to-bag sheet looked like a new
  page — corrected. (§47.1)
- **Contents**, each one the owner's switch: what was just added (photo, name, size, colour, quantity), the
  bag total, the free-delivery progress line, "Continue shopping", "Checkout", and **one cross-sell row**.
  (§46.5)
- **Type sizes: product name and size much bigger and bold. Price bigger. "Bag · 3 items" bigger.** (§58.5)
- **"Free delivery unlocked": when the order does not qualify for free delivery, do not raise delivery there
  at all** — put something smarter in that space. **What goes there is still open.** (§58.5)
- **If the same size and colour is already in the bag it does not silently become 2** — the sheet says
  "Already in your bag" with an explicit way to increase. (§46.6)
- **The two-size catch (L+XL) fires here**, at the moment the second size is added, as well as in the bag.
  (§5)

### D3.11 Bag / Cart page

> **V2 · 19 Oct.** Browser back from checkout returns to the bag unchanged (Note 4.6). Same size added twice →
> "already in bag" by default, quantity +1 as a settings option (Note 23.13). A single item's size or colour can be
> changed in the bag with a stock check and merge. Combos use bag template **B5** by default (D8). Note 43 polish:
> "Your bag — 4 items" with a longer dash and smaller, readable count; "Continue shopping" one size bigger with
> the checkout shimmer; shimmer on "FREE" delivery; "You save ৳X" in the sale red, bold; the duplicate-size box
> fits with accent borders left and right; "Navy · M" bold and readable; plain everyday labels instead of "Polo
> Duo" / "Goes well with your bag"; a tiered offer box "Take 2 ৳… save ৳… │ Take 3 … │ Take 4 …" with coloured bars,
> fully editable in the backend (PR 598 scope).
>
> **V2.1 final · 20 Oct — owner bag review 43.3–43.10 done** (Batch B, Sawdagor + Shilpi; `agents/worklog/sawdagor.log`;
> demo `50-bag.js`, `51-checkout.js`, `72-upsell.js`, `89t-shimmer.js`, `89u-bag-offers.js`, `r12-zzdesk-b.css`;
> PR 98, 107, 109, 598). The Note 43 polish above is built:
> - Title **"Your bag — N items"** (longer dash; the count readable — it is no longer painted through a transparent
>   gradient, which was also a phone bug).
> - **"Continue shopping"** one size bigger with the checkout shimmer; **shimmer on "FREE"** delivery; **"You save ৳X"**
>   in the sale red, bold.
> - **Duplicate-size box fixed:** it fits (16 px top and bottom), gold accent left and right; its "Find my size" button
>   repaired.
> - **Line titles 17 px** on desktop; colour and size (e.g. "Navy · M") in **bold ink**.
> - **Plain English bag words:** 15 labels (e.g. "You may also like", "From the same category as your bag.", "Buy 2
>   and save", "Add one more and save"), each editable in the backend with its Bengali ("Bag page words"); checkout's
>   set-saving row uses the same words. **No combo nick-names on the bag** (no "Polo Duo").
> - **Tier box "Take 2 │ Take 3 │ Take 4"** with gold bars, built from the existing **Build your own set** price rules
>   (PR 98) — the same numbers in the box, the set builder, the bag and checkout. Settings "Bag offer tiers": on/off,
>   dates, categories/products, **up to 4 tiers per rule** (pieces, price, own label). **Desktop only; the phone
>   version exists as a preview only.** The 4-piece prices in the demo are suggestions waiting for the owner's yes
>   (Appendix B.4 #13).
> - Shimmer control for all of these: D1.5. Checks: bag totals equal in bag, summary and checkout (current and B1–B5
>   at 1366 and 393); shimmer and tier settings test pass; device gate 0/480.


Renamed **Cart**, as asked. (§56.7)

**Heading and spacing**

- **"Your bag · 3 items" needs 1–2 px of gap from the EXTAS header band** — it is touching it. (§58.6)
- **"3 items" gets more space after "Your bag"**, type two or three sizes bigger, bold, **with the sweep
  across it** — still one or two sizes smaller than "Your bag" itself. (§58.6)

**Order summary**

- **The Delivery row is out of the order summary.** It appears, highlighted, **only when delivery is actually
  free** (product flag, campaign, or the cart threshold reached). Otherwise item prices and total only.
  (§49.4)
- **Lines use the product's short name, not "Item 1"**, and **the price is bold**. (§56.7)
- **Order summary type a step bigger.** (§58.6)

**Buttons**

- **The Checkout button is 58 px, 17 px type, weight 800, with a real gap above it** — and **its label must be
  bigger still**. (§49.4, §58.6)
- **"See the set" is too small inside its button — bigger.** (§58.6)

**Warnings and offers**

- **The two-size warning** ("Same Oxford Cotton Shirt in M and L") is **shorter and the full width of the cart
  column** on desktop — not a differently coloured strip floating in the middle. (§56.7)
- **The offer block is full width and shorter** — it did not reach the edge and was too tall. (§56.7)
- **An offer shows whenever that space is not being used by a warning.** One product in the cart, any product
  — there must still be a sensible offer there, not only when a polo + polo combo applies. (§56.7)
- **On desktop with four or five items the offer must not scroll out of sight.** (§56.7)

**Upsell — the shared block (§55.2)**

One block, used on both the cart and the thank-you page, every part switchable:

- **A set or combo line** when one applies — "Polo Duo · Take both for ৳ 1,500 · save ৳ 200" (`upsell.setLine`).
- **A row of products to add**, chosen from the same category as what is already in the bag, never repeating
  something already there — swipeable on a phone, a four-column grid on desktop.
- **Three reassurance cards** — Cash on Delivery, 72-hour size swap, 100% original — the three things that
  actually close a sale in this market (`upsell.why`).
- Copy on the cart: **"Goes well with your bag"**.
- **It moves up 2 px, and the section gets 1–2 px of gap below it** so the polo images underneath sit
  properly. **The gap below the offer box must equal the gap above it** — there was a gap above and none
  below, so the box ran into the product photos. (§56.11, §58.6)
- **"See all" must go to New in.** It did not, because the floating WhatsApp button was sitting dead centre of
  the link and eating the tap. (§58.6, §58.10)
- Cart page height went 2,330 → 3,065 px once the upsell was added — the page now carries on to the footer,
  as asked.

**Help and WhatsApp**

- **The help block keeps its heading only.** "We reply 10 am – 10 pm" and the rest come out, and the WhatsApp
  button is seated properly **inside** the section — it was half outside its box and the colour did not match.
  It uses the shop's green. (§48.6, §47.9)
- **"Message us on WhatsApp" above "Total · Checkout" is removed** on the phone — it competed with the
  Checkout button and the footer already has one. Switch `bag.waAboveTotal`, **default off**. (§56.7)
- **No floating WhatsApp on the bag page**; the one inside the help block is enough. (§49.4)
- **"Send my bag on WhatsApp" is not a default** — switch `bag.waSendBag`, **default off** unless the owner
  turns it on. (§56.7)

**Quantity guards — Locked (§46.6)**

1. Tapping a size selects it; it never increments.
2. Add to Bag adds exactly one; repeat taps inside ~1 second are ignored.
3. An existing same size + colour line does not silently become 2 — the bag line shows a stepper.
4. **A sanity line:** any line at 3 or more of the same size shows **"3 pieces of the same size — is that
   right?"** with a one-tap **"Make it 1"**.
5. Quantity is editable at checkout too, so a customer who arrives at a frightening total can fix it there
   instead of leaving.

**Other cart behaviour**

- **Order Now (primary, direct checkout) plus Add to Bag**, with a global/campaign skip-cart toggle. Add to
  Bag must never confuse or lose the shopper. (§4, §5)
- **Free-delivery progress line**; **coupon behind "Have a code?"**; **auto-apply the combo price when the
  cart matches a combo**. (§4)
- **The two-size (L+XL) soft card**: it triggers only on the **same product, same colour, adjacent sizes**.
  Buttons "Help me pick my size" / "One is for someone else". Evidence order: the size kept in past orders →
  Find my size → an inline height+weight question. An honest note: after delivery it is an exchange with a
  charge, not a return. "Keep both" tags the order "2 sizes — check" → an automatic WhatsApp template right
  after the order with reply buttons (Keep both / Only L / Only XL), which updates the order before packing
  and **works with AI off**; SMS fallback with a one-tap link; no reply by packing → a yellow note and a
  one-line script for the confirmation caller; still unclear → ship both. "For someone else" leaves a note and
  asks nothing. Frequent two-size products feed the size-issue report. (§5, §6)
- **Bug fixed:** tapping a product from the cart opened the home page instead of that product's page. (§56.7)
- **Screenshots to the owner before implementing** further bag rework. (§46.9)

### D3.12 Checkout

> **V2 · 18–19 Oct — these win over anything below.**
> - **Delivery bands and address:** three bands (Dhaka City · Sub-area · Rest of Bangladesh) from the national
>   gazetteer (PR 549–553); the resolver reads the whole line on blur or a pause, and a district, parent area or
>   postcode settles the band silently; only a line still ambiguous asks (PR 551). Autocomplete rows show parent
>   and price (PR 552). Phone-first: a bare phone number prefills the area only; full address only after an SMS
>   code or login (PR 555). An unresolved address still confirms (PR 563). Free delivery hides all band machinery
>   (PR 565). Demo: `05-gazetteer.js`, `06-resolver.js`, built from `data/BD-AREA-MASTER.csv` by
>   `data/tools/make-gazetteer.py`.
> - **Delivery line in hours** (B1.16).
> - **Consent:** two ticks — SMS offers ticked, WhatsApp offers separate and unticked (B5.7).
> - **Trial at the door** line when on (B1.17); the door note stays.
> - Header WhatsApp appears only after the help block scrolls away (D3.1). Enter never places the order; details
>   survive a refresh; the page is fully Bengali in Bengali mode with Bengali digits; "Need help? WhatsApp us"
>   text at 5.6:1 contrast.
> - Desktop: the order summary is aligned and sticky with "+N more items".
> - Advance-payment mode for a flagged customer swaps only the payment section of the same page (PR 560).


**The shape — Locked (§4, §5)**

Only three inputs: **name, phone, full address.** Progressive disclosure: address → delivery charge → then
payment options appear. Payment is three choices — **Cash on Delivery / Card & Bank / Mobile Banking** —
and tapping Mobile Banking reveals bKash or Nagad. Confirm button reads **"Confirm Order · ৳total"**.

- **Phone is free-form** (+880 / 880 / 01…). The system validates against Bangladeshi number patterns and
  **suggests a fix, never blocks**. No rigid 11-digit mask.
- **One free-text address box, no district or thana dropdowns.** It was 3 rows; it is now **2 rows with a real
  example** in it. (§4, §47.4)

**Address zone detection — the gazetteer, Locked (§46.7)**

This replaces the earlier decision to show nothing at all on the front end.

1. **Before anything is typed**, the delivery line already reads **"Dhaka city ৳60 · Outside Dhaka ৳120"**, so
   nobody is confused while typing.
2. **A gazetteer, not keyword matching**, down to para / block / road level, each entry mapped to thana → city
   corporation → delivery zone, plus the surrounding districts. Sources: the Bangladesh Post Office postcode
   list, the OpenStreetMap Bangladesh extract, the courier companies' published coverage and zone lists
   (Steadfast, Pathao, RedX), and the DNCC / DSCC ward lists.
3. **Matching that works on real Bangladeshi addresses**: Bengali and English, common misspellings (Nikunja /
   Nikunjo / নিকুঞ্জ, Khilkhet / Khilkhat), and **the longest known place name in the string wins**, so
   "Mirpur 12" beats "Mirpur".
4. **A confidence score.** High → set the zone and show it. Medium → set it but show it as an obviously
   editable chip. **Low or none → one short question with two big buttons: "Inside Dhaka city" / "Outside
   Dhaka"** — never a 72-option dropdown. If outside, a type-ahead district field.
5. **The guess is always visible and always one tap to change** — "Dhaka city · ৳60 · change". The system
   never silently decides something the customer cannot see.
6. **[Replaced on 18 Oct: courier mismatches are only logged, nothing is changed or messaged — PR 564.]** **It learns.** When the courier returns the real zone and charge, that is compared with the guess;
   mismatches land in an admin review queue and approved corrections go back into the gazetteer.
7. **[Replaced on 18 Oct by three bands — PR 549–553, see the V2 block above.]** **The owner controls it**: edit the zone table, add an area, set the charge per zone, set the outside-Dhaka
   default (he says ৳120–130). There are only **two zones: Dhaka City / Outside Dhaka City**, and checkout
   shows only the one that applies.
8. Optional extras: a map pin-drop fallback and "use my location" for customers who allow it.
9. **Honest note recorded:** no system is 100%. Target ~95% correct automatically, with a visible one-tap
   override and a learning loop.

**Layout and type — phone**

- The whole page was compacted: **1,769 → 1,447 px**. The delivery section is fully visible and the payment
  section starts on screen. (§46.8, §47.4)
- **The header strip is not all white** — it gets a tint or a shadow. (§56.8)
- **The order summary bar is a highlighted element** with a shadow, a 19 px bold total and a chevron pill, and
  **tapping it shows what is inside**. **The price beside "Show order summary" goes two sizes bigger** and
  **"Show order summary" one size bigger**. (§46.8, §47.4, §58.7)
- **The expanded summary gets a tint, not white**, and **closes from the chevron, from tapping the bar itself,
  or from tapping anywhere outside it.** (§56.8, §58.7)
- **2–3 px more gap between the summary bar and "Where should we deliver?".** (§56.8)
- **Subtotal and Delivery — both the labels and the amounts — bigger.** (§58.7)
- **"Add your name to continue" becomes confirm wording — "Add your phone number to confirm"** — more
  highlighted, with a better background and the sweep. (§58.7)
- **Quantity is editable here.** (§46.6, §56.9)
- **The door note is one bold line:** "Returning at the door? Pay only the delivery charge to the rider."
  (§47.4)
- **"Ordered before? Log in" is hidden** behind the owner's eye-toggle. (§47.4)
- **Confirm button 58 px, amount at 19/800, with the slow sheen.** The checkout keeps its button sweep.
  (§47.4, §56.12)
- **[Replaced on 19 Oct by two separate ticks, SMS on and WhatsApp off — Note 23.1, B5.7.]** **The marketing opt-in "Send me offers" is ticked by default**; the customer can untick it. Tracking-link
  SMS goes to **every** customer automatically with no checkbox — the opt-in is a separate, honest one for
  offers and new arrivals on SMS/WhatsApp. Order-related calls go to everyone; promotional calls only to
  opted-in customers. Standard wording. (§4, §5, §56.8)
- **[Moved by owner ruling 18 Oct: return note on the thank-you page and My Account → Orders, not checkout — PHONE-REVIEW.]** **The return/exchange charge sentence** comes from Rules: a return means a return delivery charge applies;
  if the mistake was ours, no charge. (§5)

**Need help / WhatsApp**

- **Phone:** keep it where it is, balance the colour. **Transparent background, nicely styled WhatsApp
  wording, and the sweep across it. The "Need help" text is bigger — there is space on both sides.**
  The button is solid green. (§47.4, §56.8, §58.7)
- **Desktop:** the whole **"Need help with your order?" strip is removed** — its colour matched nothing.
  Switch `checkout.helpStripDesktop`, **default off**. Checkout content starts directly under the header,
  with a gap. The **Need help / WhatsApp box then becomes one line placed below the order summary with a clear
  gap, and floats with it.** (§56.9)

**Layout — desktop**

- **The order summary box starts level with the "Where should we deliver?" box**, not with the "Checkout"
  heading, and **floats with the scroll, vertically centred**, so the customer always sees what they ordered.
  (§56.9)
- **The EXTAS mark moves to the left of the header**, and the space that frees up is used for something useful
  — **what goes there is still open.** A Bag / Delivery & payment / Done steps bar is currently in that space
  pending his answer. (§56.9, §56.12)
- Checkout's bottom-sheet behaviour on the phone is fine as it is. (§48.8)

### D3.13 Thank-you page

> **V2 · 19 Oct.** The headline states the delivery promise: "You'll get your order within 24–48 hours" (48–72
> outside Dhaka), from settings (Note 4.3). The return-charge note belongs here and in My Account → Orders, not on
> checkout (PHONE-REVIEW ruling).


- **A big check and the order number** at the top. (§5)
- **"Track your order" is a full-width primary button, 54 px, in the hero**, directly under the order number
  and the SMS line. **The lower button is renamed "Order details"** so the two do not compete. (§49.5, §51)
- **Desktop: "Track your order" goes beside the Copy button, on the right**, not below it. (§56.10)
- **The auto-created account is shown**: username = phone, password = phone, changeable. **No address block.**
  **The "Your account is ready" box is cut down on the phone** — it was too tall. (§5, §56.10)
- **COD wording:** "Total due ৳X — pay the delivery person when you receive the order." (§5)
- **Order editing note:** the customer can edit the order from the dashboard until it enters processing, **max
  2 edits per order**. (§5)
- **"What happens next" comes out** — it duplicates the tracking the customer sees in the dashboard. Switch
  `thanks.nextSteps`, **default off**, on phone and desktop. (§56.10)
- **Page order: the first block → Complete your look → Your order.** (§56.10)
- **Desktop right column ends at "Questions? Message us on WhatsApp".** **"Keep shopping" and "Order details"
  move to the LEFT column, under Your order, after three or four upsell product boxes, as big buttons filling
  the width.** (§56.10)
- **"Questions? Message us on WhatsApp" must be full width** — it is not, and this was asked for before.
  (§58.8)
- **Upsell runs down to the footer.** The shared block (`upsell.thanks`) with copy changed for this page:
  **"Add to this parcel — anything you add in the next few minutes ships with the same order, no second
  delivery charge."** Page height 2,026 → 2,877 px. (§48.7, §55.2)
- **The same gap below the upsell box as above it**, and **the "100% original" card at the bottom must not
  collide with whatever follows.** (§56.11)
- **Bug, which the owner called very important — fixed:** "Add to this parcel" added the product and updated
  the total, but **the added product never appeared** in the order on the dashboard or in Order details —
  the new total showed against the old product list. The add-on is now a real order line, so order detail,
  My orders, the invoice, admin and the exchange flow all see it. **Old orders self-heal.** Proven by 14
  assertions. (§58.8, §58.12)
- **A nice upsell** was asked for from the start; post-purchase add-to-order carries no extra delivery charge
  and stays open until the order is packed. (§4, §5)

### D3.14 Order tracking / order page

- **Landing from the thank-you page's "Track your order" opens the order page with a green panel on top:**
  **"This is your account — we created it with this order. Everything you buy, every delivery and every size
  exchange lives here."** Under it, in a white card: **"Log in with 01XXXXXXXXX"** and
  **"Password ••••••••"** with a **Show** toggle, plus the line that the password is their mobile number and
  can be changed in My account. The panel has a close button and **only appears on the first arrival from the
  thank-you page.** (§55.1)
- **The box is too tall — compress it:** phone and password **side by side**, the three-line sentence cut to
  **two lines**, the box tightened, **so that all four or five tracking steps show at once underneath.**
  (§56.11)
- Below it: the order number, the status tag and the **four-step tracking timeline**. (§55.1)
- **Order editing** from here until the order enters processing, max 2 edits; each edit re-runs stock and
  fraud checks, is logged, and syncs to the ERP. (§5)
- **Exchange request** from here: the button hides after the Rules window closes. Steps: item → reason → new
  item → the money box. (§6)
- **"Rate & review"** entry point from My orders. (§5)
- **The hotline appears on this page and on the order-confirmation page.** (§46.16)

### D3.15 My account / customer dashboard

> **V2 · 19 Oct.** The order number is clickable (opens the order page) with an invoice download icon beside it
> (Note 4.5). Offers: phone keeps the rotating single offer; **desktop with a mouse at ≥ 1024 shows three offers side
> by side, each from a different category, each that category's top-selling product**; touch tablets keep two
> (Note 4.8, desktop QA). SMS and WhatsApp marketing switches are separate (B5.7).


- **The offer banner is still missing and must be delivered.** The original offer-and-wallet banner was good;
  it comes back and **always carries some offer, from a fixed set the owner picks.** Claude built one earlier,
  the owner asked for it, and it did not arrive. (§56.10, §58.9)
- **Phone account menu:** My orders · **For you** (offers) · Rewards · Wallet · Wishlist · Profile. (§58.9)
- **Profile needs a photo upload.** (§41.17, §58.9)
- **Invoice generation and download from the account.** (§58.9)
- **"For You" offers tab** — personal offers such as a VIP flat 10–20%, with an expiry and auto-apply,
  **highlighted prominently at the top** and also surfaced **in the wallet area**. (§4, §5)
- **Product rows**: recommended / trending / new / on offer. (§4, §5)
- **Profile value-adds (§41.17):** saved addresses · a **saved size profile** (height, weight, fit preference)
  that feeds Find My Size everywhere · wishlist · order again in one tap · recently viewed · back-in-stock
  alerts · loyalty points · a referral code · preferred courier and delivery time · WhatsApp opt-in ·
  exchange and return history · saved payment preference.
- **Referral** is always available but the owner controls on/off and timing, and it shows **only in logged-in
  dashboards.** (§7)
- **Login:** username = phone, password = phone by default (shown on the thank-you page, changeable), with a
  one-time SMS code on a new device. (§5)
- **Reviews** are submitted from here by verified buyers and shown only after the owner approves. (§5)
- **The large-text toggle** lives here for older and less-confident customers. (§41.7)
- Dashboard blocks are switchable (`account.*`) and arrangeable in the page builder. (§41.2, §58.12)

### D3.16 Reviews on the storefront — Locked (§52.4, §53.1, §55.3)

- **The reviews the owner enters by hand are the reviews the site counts.** Typed in, or brought over from
  WhatsApp and Messenger inboxes where customers sent their feedback. **The star rating on the product page is
  the average of the stored live rows, the count beside it is their number, and tapping the stars jumps to the
  review section.** `reviewAverage(productId)` computes both.
- **Hidden and waiting rows are excluded from the average and from the Google schema.**
- On top of the stored rows: a **per-size and per-fit breakdown** ("85% true to size") · **the reviewer's
  height, weight and size bought** shown beside each review · **photos** where the customer sent one ·
  sorting by newest, highest, lowest and most helpful · filtering by size and fit · **the category average
  rolled up to the category page** · a **duplicate check** so the same message is not entered twice.
- **Google ranking tie-in:** Product + AggregateRating + Review JSON-LD generated from the stored rows ·
  review snippets in the category page's schema · review text indexed as page content · a review sitemap
  entry · "verified buyer" marked in the schema where the review is tied to a real order · **the schema emits
  only what is actually stored.**
- **The review-request engine (§46.15):** every delivered order triggers a WhatsApp or SMS message with a
  two-tap review (stars, optional photo, optional line of text), with reminders. Most Bangladeshi shops have
  few reviews simply because they never ask. An **incentive the owner controls** (points or a discount on the
  next order, disclosed as such) and **a reward for sharing on Facebook**, both on/off. (§7)
- **Real signals while review counts are low**, all computed from actual orders and all true: "47 sold this
  month", "most bought size: L", "85% kept their size". Plus **a clearly labelled editorial block** — "From
  our team: how this polo fits".
- **Pre-launch placeholder reviews** may exist only as demo data that is **visibly marked and removes itself
  the moment the store goes live** — never shown to a real customer.

### D3.17 Content pages

> **V2 · 19 Oct.** FAQ, Delivery, Exchange and the announcement bar read settings (hours, charges, windows); Careers
> and Payment pages exist; social links come from settings. Content pages get a rich-text editor in the site builder
> (PR 598, paused). Help pages live at `/help/<slug>` (C12).


- **One route, `#/page/:slug`**, serving: **Questions & answers** (10 real Q&As), **Delivery**, **Exchange &
  returns**, **Privacy**, **Terms**, **Our story**, and **Contact**. (§47.7)
- **All nine dead links that pointed at the home page are fixed**; FAQ and Delivery no longer land on a
  category page. (The FAQ page showed nothing, Terms was empty and Privacy was never added.) (§46.12, §47.7)
- **Proper left padding** — the text was clipped on the left edge, with the first letter of several lines cut
  off. (§48.5)
- **Contact page:** a contact form plus WhatsApp, the hotline, email and track-order. **It must look
  exceptional**, and Claude shows a design first. (§46.16, §47.7)
- **The announce strip:** if the message fits, it stays fixed and **pulses gently so it is noticed**; if it is
  long, it **scrolls sideways**. (§48.5)
- Content pages must be reachable from search, which must return **help articles** as well as products and
  categories. (§58.3)

### D3.18 Footer

> **V2 · 19 Oct.** Brand block is a column: wordmark, then the slogan starting exactly under the E's ink, 10–12 px
> gap (Note 1.2). Newsletter: Join bold 16 px, field height, about a third of the row (Note 1.3). "Text us on
> WhatsApp"; WhatsApp and Hotline side by side only when both fit at full size, else stacked; nothing shrinks
> (Note 1.4). Help → "Size guide" opens the size finder over the current page (Note 12.1). **Desktop:** four columns
> (Shop · Help · EXTAS · Join) and under them a contact block — left: social icons over payment marks; right: WhatsApp
> over Hotline, equal width (Note 35.6). Columns and links drag-and-drop, social and payment icons from a set or
> uploaded (PR 598, paused).


- **Phone and desktop footers will be two different designs.** The desktop one belongs to the desktop round
  and has not been designed. (§58.2)
- **Colour scheme — three or four colours, not one black slab (§57.2, §58.2):**
  - The **promise strip** (Size exchange · Cash on Delivery · Secure payment · 100% original) gets its own
    tasteful colour.
  - The **EXTAS block** — from the wordmark down to the border above the category columns — gets a second,
    different tasteful colour.
  - The **WhatsApp / hotline / hours band** gets a tasteful colour too, **matched to the promise strip**.
  - The black section is combined with those so the whole footer reads as a three- or four-colour scheme.
    **No cheap colours.**
- **Columns.** Compact columns with vertical dividers on mobile (3 links | 3 links | 3 links was the original
  shape), **centred between the dividers**, not left-aligned. **Help and EXTAS carry six links each** (they
  had five; Claude picks the sixth). **Shop shows six, chosen by the owner in the dashboard.** All three
  columns then stand level, and the empty space underneath is tightened so the page gets shorter. (§5, §56.2,
  §58.2)
- **Icons beside every footer link**, and **they must match automatically**: a polo link gets a polo icon, a
  shirt a shirt icon, a panjabi a panjabi icon, a t-shirt a t-shirt icon — for whatever categories the shop
  has. The owner can change an icon, add a link or remove one. (§41.6, §56.2, §57.2)
- **Payment marks — bKash, Nagad, Visa, Mastercard, COD — use the real brand marks, not text chips.** **No
  flat white boxes**: transparent, matched to the band's colours, tastefully highlighted, **with the light
  sweep passing across them**, fitted across the width the way the Facebook–TikTok row already does. (§41.6,
  §57.2, §58.2)
- **The social row is full width on the phone** — it left a gap on the right. Social icons: Facebook,
  Instagram, YouTube (and the TikTok row). (§41.6, §56.2)
- **Legal on one line:** the trade licence and DBID go on the **same line as the copyright**, separated by
  bars — not stacked underneath. Anything else important goes on that line too. **The page must not keep
  growing.** On desktop this took the legal block from 91.5 px to 20 px. (§46.16, §47.8)
- **The language switch EN | বাং lives here, and only here.** (§49.1, §51)
- **The hotline sits in the footer contact column.** (§46.16, §47.8)
- Other footer content: the promise row, a join block (WhatsApp / email), accordion link groups, contact,
  social, payment logos, DBID / trade licence. (§4)
- **Known defects, not yet fixed (§58.11):** the four footer social links all point at `#/`; the placeholders
  `[support email]`, `[your DBID number]` and `[number]` are still shipping in the footer; footer link touch
  targets are 34 px, not 44 — see D6, this one needs the owner's call.

---

## D4. Configurability — the eye-toggle system

> **V2 · 19 Oct — switches added or changed in round 15** (demo `02-core.js` `SHOWN`, `08-shop-opts.js`,
> `89s-shop-settings.js`):
> | Switch / setting | Default | Source |
> |---|---|---|
> | `header.whatsapp` (+ `HDR_WA_PAGES`, `HDR_WA_TIP` "Need any help") | On, every page | Note 3.1, Q-009 |
> | `fab.whatsapp` (floating disc) | **Off** (was On) | Note 3.1 |
> | `pdpIcons.panel` / `pdpIcons.share` / `pdpIcons.whatsapp` | **Off** (were On) | Note 2.3, 2.4 |
> | `pdpIcons.wish` (heart after the title) | On | Note 2.3 |
> | `HDR_WISH_PHONE` (heart in the header on phones) | On, hidden when it cannot fit | Note 3.4 |
> | `HERO_SETS_BTN` | `v3` brand tint | Note 1.1 |
> | `HERO_FADE` (desktop slider edge) | 140 px | Note 35.2 |
> | Trial at the door | On | Note 23.9 |
> | Same size twice | `block` ("already in bag"); option `qty` | Note 23.13 |
> | Consent ticks | SMS on · WhatsApp off | Note 23.1 |
> | Later-step order messages | Off | Note 4.7 |
> | Delivery hours per band | 24–48 / 48–72 | Note 4.2 |
> | Side canvas master switch | **Off** | PR 596 |
> | Header slogan | On | Note 42.2 |
> | Shimmer control (all shimmers) | per element; master | PR 598 |
> Every switch is listed in one searchable eye-toggle dashboard (PR 81) — this answers V1 question D6.1 #14.
>
> **V2.1 final · 20 Oct — switches added by the bag review (PR 598):** Shimmer master + 14 shimmers (each on/off,
> speed, strength; **Add to Bag shimmer off**; none under reduce-motion) · Bag offer tiers (on; desktop only; dates;
> categories/products; up to 4 tiers per rule) · Bag page words (15 labels, English + Bengali).


**The standing rule:** anything the owner asks to remove is **not deleted** — it becomes an **eye-toggle in
the dashboard, default off**. (§48.2, §56, §56.12)

### D4.1 Named switch keys created by the review rounds

| Key | What it controls | Default |
|---|---|---|
| `pdp.payLineWithFree` | On a free-delivery product, whether the `COD / bKash / Nagad / Card` line still shows. When off, everything below moves up. | **Off** |
| `pdp.colourNote` | The colour-description note under the swatches ("Deep navy. Can look almost black in low light…"). Moved off the first screen. | **Off** |
| `pdp.trueColourLink` | The "See true-colour photo" link. | **Off** |
| `pdp.fitBar` | The "Runs small / True to size / Runs large" bar. | **Off** |
| `pdp.unitToggle` | The cm/inch toggle on the product page. (cm stays inside the size-chart popup either way.) | **Off** |
| `pdpIcons.panel` | The whole floating heart/share/WhatsApp column. | On **→ V2: Off (Note 2.3)** |
| `pdpIcons.wish` | The heart icon in that column. | On |
| `pdpIcons.share` | The share icon in that column. | On **→ V2: Off (Note 2.3)** |
| `pdpIcons.whatsapp` | The WhatsApp icon in that column. | On **→ V2: Off; WhatsApp is in the header (Note 2.4)** |
| `pdpSweep.freeDelivery` | Light sweep over "Free home delivery" (2–3.5 s). | On |
| `pdpSweep.stock` | Sweep over "In stock — ships today…" (4–5 s). | On |
| `pdpSweep.allColours` | Sweep over "All N colours" (4–5 s). | On |
| `pdpSweep.colourLabel` | Sweep over "Colour · Olive" (4–5 s). | On |
| `pdpSweep.sizeLabel` | Sweep over "Choose your size". | On |
| `pdpSweep.sizePills` | Sweep over the S M L XL XXL boxes. | On |
| `pdpPrice.discountAfterBar` | On a discounted product, drop the COD line and put the struck price, −% and "Save ৳" after the bar. | **On (the default behaviour)** |
| `fab.whatsapp` | The floating WhatsApp button — **and which pages it shows on and where it sits**. | On **→ V2: Off (Note 3.1)** |
| `category.breadcrumb` | The visible breadcrumb on the category page. (JSON-LD breadcrumb data is emitted either way.) | On |
| `checkout.helpStripDesktop` | The desktop "Need help with your order?" strip. | **Off** |
| `bag.waAboveTotal` | "Message us on WhatsApp" sitting above "Total · Checkout" on the cart. | **Off** |
| `bag.waSendBag` | "Send my bag on WhatsApp". | **Off** |
| `thanks.nextSteps` | The "What happens next" block on the thank-you page (phone and desktop). | **Off** |
| `upsell.bag` | The shared upsell block on the cart page. | On |
| `upsell.thanks` | The same block on the thank-you page. | On |
| `upsell.setLine` | The set/combo line inside the upsell block. | On |
| `upsell.why` | The three reassurance cards (COD · 72-hour size swap · 100% original). | On |
| `account.*` | The My-account blocks. | On |
| `PDP_CTA_STYLE` | The Add to Bag / Order Now colour pair — **shared by the product page and the set page**. | Option 1 shipped, **awaiting the owner's pick of 5** |
| `PDP_FIT` / `pdp_budget()` in `30-product.js` | **The one place the compulsory first-screen height budget is configured.** | Measured budget, not a per-product value |

### D4.2 Option switches created by the earlier rounds

| Switch | What it controls | Default |
|---|---|---|
| Page builder: section toggle + position | Every section of footer, header, homepage, product page, checkout, thank-you, customer dashboard and admin dashboard | All on, in Claude's order |
| Text dictionary | Every button name, section title, field label and message, EN and BN | Claude's wording |
| Button colours | All button colours | Claude's colours |
| A/B testing module | Global and per test | **Off** |
| Product-page template | T1 Classic / T2 Editorial / T3 Fit-first per category or product | T1 |
| First-screen style | **Style A** (strip under price) or **Style B** (free delivery after the bar) — **per product, mandatory at upload** | Style B is the live default |
| Gallery layout | Thumbnails below the main image or down the side | Per store / per product |
| Which PDP blocks show on this product | Colour note, true-colour link, the three rule rows, fabric, size & fit, description | Mandatory choice at upload |
| Which measurement columns this product has | Per product; an unentered measurement does not render | Mandatory at upload |
| "Was" price | Shown or not, and its source (MRP / price history / combo / launch price) — per category, sub-category and product | **Off** unless chosen |
| Canonical behaviour for colour URLs | Canonical to the main product, or let each colour stand alone | **Canonical to the main product** |
| Free delivery | Per product at upload; also by campaign; also by cart threshold (৳1,500 / ৳2,000 / ৳2,500) | Mandatory choice at upload |
| Model-stats chip | Per product / per category "has model photo" tick | **Off** unless ticked |
| Colour name under each dot | Per product, only when the product has 4 colours or fewer | Off |
| After "Add to cart" behaviour | Toast and stay · slide-in mini-cart · straight to the cart page | **Slide-in mini-cart** (phone: bottom sheet) |
| Add-to-cart sheet contents | Each element inside it | All on |
| Skip the cart | Global and per campaign | Off |
| Combo auto-apply when the bag matches | Per combo | On per combo |
| Customer-built sets | Global and per category | **Off** |
| Which categories the two PDP bottom product rows show | Back-end option | Claude's choice |
| Shop footer column's six links | Chosen by the owner in the dashboard | Claude's six |
| Auto-approve 4–5★ reviews | Review moderation | **Off** |
| Review reward / Facebook-share reward | On/off | Owner's choice |
| Referral programme | On/off and timing; shown only to logged-in customers | Always available, owner-controlled |
| Wishlist alerts | Opt-in only, real triggers only, max 1 per item and ~2 per week | **Off until live test** |
| Celebration overlay | Tied to an occasion or campaign | **Off** |
| Online-payment discount | An option, not mandatory; set from the backend / Campaign section | **Off** |
| Themes | 4–5 complete UI themes (Classic / Noir / Ivory / Festive) across all pages including the dashboard, with preview and scheduled switch | Classic |
| Large-text toggle | Customer-facing accessibility control | Off |
| Zone table, per-zone charge, outside-Dhaka default | Admin-edited | ৳60 inside / ৳120–130 outside |
| Exchange window | Read from Rules, never hard-coded in copy | 72 hours currently |

---

## D5. Analytics — Locked (§50, corrected; confirmed locked in §52.1)

> **V2 · 19 Oct — the owner's event list is part of PR 338/339 (Note 3.13).** Must exist, part by part, dynamic:
> search terms; WhatsApp clicks **by page and by button**; add-to-bag → purchased; direct purchase (Order Now);
> removed from bag, re-added, new adds; adds that came from an offer, combo or set; "All N colours" taps; Size chart
> taps; wishlist saves; **logged-in vs guest on every event**. Every event carries page type, product/category and
> source button so each part can be read on its own. Demo: `87-admin-analytics.js`, `88-track.js`.


**§48.9 was written too narrowly and the owner was right to object.** "How many tapped All 5 colours" was one
example among many, not the requirement. **The requirement is a survey layer across the whole shop:** every
place a customer makes a small decision is measured, and the reports say what is working and what is not.
**Claude decides where to place the measurement points using its own judgement about what would be useful,
and adds more as it sees fit without asking.** The list below is the starting set, not the limit.

### D5.1 What gets measured — the starting set

**Product page** — page views · how far people scroll · thumbnail and gallery use · zoom opens · **"All N
colours" opens, and how many of those end in a purchase** · colour switches, and whether a switch leads to a
purchase · **size-chart opens, and how many pick a size from inside the popup** · which sizes people look at
and in what ratio · Find my size opens, completions, and whether they take the size it recommends ·
**WhatsApp taps, and how many of those turn into an order** · review-section reach · Q&A opens · Delivery /
Exchange / Returns detail opens · add-to-bag, Order Now, and the split between them · out-of-stock size taps.

**Category and search** — filter and sort use, and which filters · how many results people scroll past · "no
results" searches **with the words they typed** · which card position gets tapped.

**Bag** — reach · abandonment · quantity changes · line removals · save-for-later · coupon attempts and
failures · the free-delivery bar: how many add more to reach it.

**Checkout** — reach · completion · drop-off per field · **how often the address zone is auto-detected versus
asked** · **how often the detected zone is changed by hand** · validation errors per field · payment method
chosen · how long it takes · quantity corrections made on the page.

**Thank-you and account** — Track-order taps · upsell add-ons taken · account logins afterwards.

**Site-wide** — hotline taps · menu use and which menu items · language switches · campaign overlay skips ·
page speed as real customers experience it.

**Added on Claude's own judgement (§52.1)** — time-to-first-interaction per page · **rage taps** (three taps
on the same spot in a second, which is how a broken control shows up in the data) · back-button use within a
session · returning-customer versus new-customer behaviour per page · which photo view people stop on · how
far down the reviews they read · **device and connection class against conversion, so slow phones can be seen
separately** · the exact words typed into search that returned nothing · **abandoned-at-size versus
abandoned-at-address** · WhatsApp conversations that end in an order within 24 hours, matched by phone number.

### D5.2 The reports

A **section of its own in the dashboard**. **Weekly and monthly**, by **landing page, product page, category
page and cart page**: what is performing, what is not, **and the arithmetic behind it**. A **funnel per
product**. Comparison between pages. Trend lines. Everything **filterable by date, store, source and
campaign**.

### D5.3 How it is built

- **Deterministic event capture first.** Every tracked element carries its own event, stored in **our own
  database**, with nothing depending on an outside service.
- **On top of that an AI layer reads the numbers and writes the plain-language verdict:** what changed, what
  is dragging, what to try next.
- **The AI explains; it never invents a number.**
- Scope: **+6 PRs in S15/S21** — event layer · per-page funnels · the report section · weekly and monthly
  digests · AI commentary · alerts when a page's numbers fall.

---

## D6. Still open / still in review

> **V2 · 19 Oct — status of the V1 items.** D6.1: #1 answered (Add to Bag a near shade of Order Now, Note 3.11; desktop
> CTA style D-040 still the owner's call); #2 replaced (header WhatsApp, disc off); #3 approved 18 Oct (sub-menu, +2
> in the register); #6 replaced (icon rail off by default); #9 settled by the owner rule kept on the drawer (D3.10);
> #12 answered (desktop three offers, Note 4.8); #14 answered (one searchable switch list, PR 81); #16 done (phone
> review complete 18 Oct, desktop review 19 Oct). **#4, #5, #7, #8, #10, #11, #13, #15 have no recorded ruling: the demo
> default ships and they are listed once in Appendix B.** D6.2: #4 fixed (search, D-015/R15); #8 social links now
> from settings, contact placeholders wait for owner data (Appendix B); the rest are re-verified by the checklist
> in the code phase. D6.3 is closed: the desktop review ran on 19 Oct.


### D6.1 Questions waiting on the owner — one sentence each answers them

1. **Buy-button colours.** Five numbered Add to Bag / Order Now combinations are in `shots/cta-options.png`
   and number 1 is shipped — which do you pick, or which two do you want mixed (e.g. "number 1's Add to Bag
   with number 3's Order Now")? (§58.4, §58.12)
2. **The floating WhatsApp button's position.** It is `position:fixed` and vertically centred, so it covers a
   50 px strip of the right-hand gutter at every scroll position and has already eaten taps — do you want
   **(1)** it kept centred with each page's content inset by hand (endless), **(2)** it moved low-right above
   the sticky bar where every shop puts it, thumb-reachable, sitting over chrome rather than content
   (**Claude recommends this**), or **(3)** it kept centred but fading to a half-circle tucked against the
   edge while idle? (§58.10 A)
3. **Sub-menus.** Do you approve the sub-menu design — the three-dot menu opening a category's sub-categories
   first and then going through — once Claude has shown you the picture? (§58.3, §58.12)
4. **Search panel.** On a phone, should the search open from the top, the middle, or stay as the half window
   from the bottom? (§58.3)
5. **Desktop checkout header.** What should fill the space that moving the EXTAS mark to the left frees up —
   is the Bag / Delivery & payment / Done steps bar now sitting there what you want, or an offer instead?
   (§56.9, §56.12)
6. **The floating icon rail's home position on the phone.** It was moved from 50% to 38% of the viewport
   because at 50% it parked permanently on the fifth thumbnail on every product's first screen — is 38%
   acceptable? (§57.6)
7. **Footer link tap targets.** Raising them from 34 px to the required 44 px puts about 90 px back into the
   footer you asked to make shorter — do you want the bigger targets or the shorter footer? (§58.11)
8. **The Returns row wording.** "No return" reads badly on the product page — what honest phrasing do you want
   there instead? (§48.2)
9. **The add-to-bag sheet's free-delivery slot.** When the order does not qualify for free delivery, what
   should go in that space instead of raising delivery at all? (§58.5)
10. **"Only 3 left in Olive, size L".** It stays, but it appears too far down the product page — where do you
    want it? (§57.4)
11. **"Was" price sources.** Which source — brand MRP, recorded price history, or the combo calculation —
    should be the default for each category? (§46.14, §47.10)
12. **The My-account offer banner.** Which fixed set of offers should it rotate through? (§56.10, §58.9)
13. **The six Shop links in the footer.** Which six do you want? (§58.2)
14. **The eye-toggle controls in the dashboard.** Should every hidden block's eye-toggle live in one switch
    list, or beside its own section inside the page builder? (§47.10, §49.6)
15. **Wishlist alerts.** Do you confirm the proposal — opt-in only, triggered only by a price drop on a saved
    item or the customer's own size coming back in stock, capped at one message per item and about two a week,
    no fake-scarcity messages, default off until a live test? (§8)
16. **The phone sign-off.** Round 12 is built and verified — will you re-audit the phone from the top, so the
    desktop review can start? (§57.5, §58.12)

### D6.2 Found, not yet fixed — carried forward (§58.11)

These are known defects the latest round logged but did not repair. They are not questions; they are work
still owed.

1. `cat_banner()` is hardcoded to polos and t-shirts — a set rule on any other category silently shows
   nothing.
2. `cat_bundlePicks` only ever shows the first 6 styles; styles 7 and beyond are invisible however long you
   watch.
3. Every filter tap re-renders the category page and restarts the conveyor at 0, so the shopper loses their
   place.
4. The search engine has no prefix match, no synonyms, no Bengali keywords and no help pages — "polo shirt"
   and "গেঞ্জি" return nothing. Covered by the §58.3 search proposal, which is not yet built or approved.
5. The search results page has no filter and no sort, and its "Popular right now" row ignores the query.
6. The breadcrumb "Home" link is a 35 × 19 px tap target, under the 44 × 44 rule.
7. The flash-sale countdown is a painted-on string that never ticks and resets on every render.
8. The four footer social links all point at `#/`, and the placeholders `[support email]`,
   `[your DBID number]` and `[number]` are still shipping in the footer.
9. The hero arrows only appear on hover, so a phone cannot step the hero — drag only.
10. `.cb-mbar` / `.bs-mbar` reserve 56 px for a bottom tab bar that no longer renders.
11. Disabled size pills show a strikethrough and `cursor:not-allowed` with no explanation of why.
12. Footer link touch targets are 34 px, not 44 — the trade-off is question 7 above.

### D6.3 Rounds not yet run

- **The desktop review has not started.** The owner's order is phone first, then desktop, and only after the
  phone is signed off. The **desktop footer is a separate design** that does not exist yet. (§57.5, §58.2)
- **Add-to-Bag onwards comes after the product page is accepted** — that was his sequencing instruction in
  Round 11 and the later rounds have run ahead of it by agreement, not by sign-off. (§57.5)

---

## D7. Where two rounds disagreed — the later one wins

> **V2 · 19 Oct — later still:** row 8 (WhatsApp in a floating column) → header WhatsApp on every page (Note 2.4,
> 3.1); row 16 → unchanged, and the bag still has no floating WhatsApp; row 20 (payment line) → the one-line price
> row with the second bar (Note 2.6, 3.10); row 19 → desktop drawer 420 px confirmed (D-028). The full V1 → V2 list
> is in "Resolved conflicts" at the top.


Recorded so the owner can see the conflicts were noticed and not quietly resolved.

| # | Earlier decision | Later decision — **this is what gets built** |
|---|---|---|
| 1 | §5: the checkout front end shows **nothing** about address parsing — no area chip, no question | **§46.7:** the detected zone is **always visible and one tap to change**, a two-button question is asked when confidence is low, and the delivery line shows both zone prices before anything is typed |
| 2 | §6: support contact is a **WhatsApp text button only — no call buttons or cards anywhere** | **§46.16:** the **hotline number** appears in the desktop header, at the top of the phone menu drawer, in the checkout "Need help?" row, in the footer contact column, and on the order-confirmation and tracking pages — but **never as a floating button** |
| 3 | §46.1: nothing on the product page is hidden by default; the owner switches off what he does not want | **§53.4:** the colour note (`pdp.colourNote`) and "See true-colour photo" (`pdp.trueColourLink`) ship **off by default**, so the first screen ends cleanly at the swatches |
| 4 | §5: inches by default everywhere with a small **cm link on the product page** | **§56.5:** the cm/inch toggle is **removed from the product page** (`pdp.unitToggle` off); cm lives only inside the size-chart popup |
| 5 | §5: a **fit bar** ("Runs small / True to size / Runs large") built from review and exchange data | **§56.5:** the fit bar is **removed** (`pdp.fitBar` off). The underlying fit data still feeds Find my size and the admin size-issue report |
| 6 | §46.1 / §47.2: **Find my size sits above the size pills** as a prominent card | **§56.5:** **Find my size comes after the size row** — Colour → Size → Find my size |
| 7 | §52.3: **Option A** (free-delivery strip under the price) is live; Option B built but not applied | **§54.1:** **Option B / Style B is the live default** — price, thick bar, truck icon, "Free home delivery". Style A stays in the backend as the per-product alternative |
| 8 | §49.2: **WhatsApp sits inside the sticky buy bar** on the phone, left of Add to Bag | **§51 → §52.2 → §56.4 → §57.4:** WhatsApp is out of the buy bar; it is one of three **46 px icons in a floating column** down the right that drifts with the scroll. (Its exact resting position is open — D6.1 question 2) |
| 9 | §54.3: a **49–78 px gap** above the buy bar is fine; the next block peeking is ordinary scrolling | **§58.4 / §58.12:** the measurement line must clear the buy bar by **1–1.5 px** — achieved at 1.25–1.27 px |
| 10 | §57.5: the first-screen rule allows **2–3 px of gap** below the measurement line | **§58.4:** **1–1.5 px** |
| 11 | §56.8 point 31: **"The brand name must not shimmer"** | **§56.12:** the owner corrected himself — he wanted the **opposite**. The 7-second sweep now also crosses the **EXTAS mark in the header on every page**, and the checkout and thank-you pages **keep** their button sweep. The removal was undone |
| 12 | §46.15: Claude will not build review generation — framed as a refusal of what the owner asked for | **§52.4 / §53.1:** the owner never asked for invented reviews. **A full review manager is built** — add by hand, edit, import from a file, paste in what a customer said on WhatsApp, Messenger or the phone, set name, date, rating, size, height and weight, mark verified, hide, pin, sort, rotate, bulk add, per category or product. **Only an AI button that writes reviews out of nothing is refused** |
| 13 | §57.3 point 21: the bundle picks are **two rows**, splitting half and half above ten products | **§58.3:** **one row only**, sliding, with **two cards per screen, not three** — marked mandatory |
| 14 | §6: the exchange window is **72 hours** | **§7:** the window is **whatever the Rules setting says**; all copy reads the rule value. 72 hours is simply today's value |
| 15 | §47.2: the main photo is **height-capped**, which left empty space at the side | **§48.1 / §57.6:** the photo **always fills the full width**; only the height is budgeted, with one shared value `min(38vh, 360px)` for every category |
| 16 | §46.9 / §46.10: WhatsApp must be **prominent on the bag page** | **§49.4 / §56.7:** no floating WhatsApp on the bag, and the WhatsApp line above "Total · Checkout" is **off** (`bag.waAboveTotal`) — the one inside the help block is enough |
| 17 | §5: the footer is fixed by making **compact mobile columns with vertical dividers** | **§57.2 / §58.2:** the footer becomes a **three- or four-colour scheme** with centred columns, six links per column, automatic category icons and real payment brand marks — **and phone and desktop become two different designs** |
| 18 | §48.3 point 17: the size chart is **full screen starting just below the header** with a 1–2 mm gap | **§51:** the size-chart sheet **floats with a gap on all four sides**, so a sliver of the page shows behind it — and **§58.4:** it must stay **fixed**, not scroll with the page |
| 19 | §41.9: after Add to cart, the default is a **slide-in mini-cart** | **§46.5:** still the default, but **desktop = right-side drawer, phone = bottom sheet**, because the right edge of a phone is the hardest place for a thumb |
| 20 | §48.1 point 4: the payment line always shows, bar-separated | **§49.2 → §54.1 → §58.4:** the payment line **hides on a free-delivery product** (`pdp.payLineWithFree` off), **takes the slot after the bar** when delivery is not free, and is **dropped entirely on a discounted product** in favour of the struck price, −% and "Save ৳" (`pdpPrice.discountAfterBar`) |

## D8. Combos — the biggest-selling section (V2 · S03 · PR 89–104, 571–576)

**Owner, 19 Oct 03:43–11:51 (Notes 5, 8–11, 23, 25).** Research: `review/COMBO-RESEARCH.md`; audit:
`review/COMBO-AUDIT.md`; ranking: `review/COMBO-RANKING.md`.

### D8.1 Rules for every combo page (research §0)

Sizes and the Add button on the first screen; one size for all pieces by default ("Size for both", with "Different
size for each?"; top + bottom sets get two rows); every colour pair is its own product; price said one way in taka
("2 pcs ৳2,200 → ৳1,800 · Save ৳400"), once on the page and once in the sticky bar; **one button wording: "Add both to
bag · ৳1,800"** ("Add all 3 to bag" for three) — never "Add to set / Add to combo"; when something is missing the
button says what and scrolls there; the photo shows every piece in the chosen colours; sold-out handled before the tap
(a size is available only when every piece has it); one honest bag line per set; the bigger pack is offered, a single
piece never is; under 40 words above the fold, colour names in text, "Pay ৳1,800 when it arrives" beside the button.
**Picture taps never leave the combo page** (Note 5.1).

### D8.2 Auto colour-pair combos — the owner's model (PR 571)

Bind a category, sub-category or chosen products, pick **2-piece or 3-piece** → every colour pair (or triple) becomes
its own combo listing, e.g. "Ralph Lauren Polo — Black + Navy · 2-piece combo", evergreen, priced "2 pcs ৳2,200 →
৳1,800". Best sellers first, "has colour" filter; regenerates when a colour is added; a pair pauses when a colour sells
out; sizes only where every piece has stock. Per-section tick **"no single piece here"**; optional "add 1 more → 3
pcs". The promoted link is a category page (e.g. Polo → Ralph Lauren → Solid Polo) showing only the generated pairs.
"Use in combos" is ticked on a new product, as an option (Note 23.5). Demo: `01y-combo-auto-data.js` (Solid Polo, 6
colours, S–3XL → 15 two-piece pairs, 20 three-piece), `42-combo-auto.js`, `r12-zauto.css`; routes `#/combos`,
`#/combos/<rule>`, `#/combo-pair/<id>`.

### D8.3 Lifecycle — nothing is deleted, no URL dies (PR 571, Note 25)

Optional start/end dates (none = always on). At the end date the rule ends by itself: pages stay live and indexable,
show "offer ended" with live alternatives, no add to bag, and move to an **Archive** tab in admin. Sold out stays
automatic from stock. Manual off = ended. Turning on or extending brings the same URLs back. Combo rules cannot be
deleted, only switched off or archived. A combo that ends while in a bag keeps its price, with a note (demo
`ended-bag.js` test). "Dynamic, nice and easy" (Note 25.5).

### D8.4 Templates and the winners (PR 572–574, 576)

| Page | Templates | Default applied (score /100) |
|---|---|---|
| Combo category | L1 pair grid · L2 one card per style · L3 hub with winter/summer tabs · L4 one-column ad landing · L5 "2 pcs / 3 pcs" switch first | **L1** (87; L5 ties at 87 and is the choice when pushing 3-piece) |
| Combo product | P1 pair page · P2 pick-your-colours · P3 top + bottom set · P4 mixed 3-item set · P5 fixed-colour pack | **Auto: P1 for same-product packs (96.5), P3 for top + bottom and mixed sets (94.7), P2 for very long lists** |
| Combo in the bag | B1 grouped card · B2 sizes editable in the bag · B3 "add 1 more" in the card · B4 real item prices + one discount line · B5 compact line for many sets | **B5** (97.3): B2 behaviour with 1–2 combos, one compact line from 3; desktop keeps B5 |

Ranking: 188 agent journeys on 360 / 393 / 430 / 1280, no knock-outs, all bag prices right; weights in
COMBO-RANKING §2. B4's real piece prices + one discount line is how the order record and invoice store a set. The
owner keeps the current defaults and may ask for more designs (Note 23.16); the "Move to wishlist" label for combos
(they go to Saved for later) stays until he checks (Note 23.17). Demo: `43-combo-tpl.js`, `r12-zcombo*.css`.

### D8.5 Set photo (PR 575)

Composed automatically from each piece's photo in the chosen colours (side by side, top + bottom, or three-up), one
house standard, no text baked in; "2 pcs" and "Save ৳…" are page badges.

### D8.6 Combo admin (PR 90, Note 9.1)

Its own section, built step by step for non-technical staff: auto rules, an 8-step wizard, fixed combos — products,
allowed colours and sizes, photos, price, offer, on/off, preview. Demo: `#/admin/combos` (`85-admin-combos.js`).
Money bugs from the combo audit (double add, oversell, stale set price, set above regular price) are fixed in the
demo (COMBO-AUDIT "Fixed") and are regression tests for the code phase.

## D9. Desktop (V2 · Notes 34–35, 39 · DESKTOP-REVIEW, DESKTOP-QA-REPORT)

**Rule: desktop gets its own treatment; the phone must not change** (Note 34.2). New desktop CSS lives in files that
load last, inside `@media (min-width:1024px)` and/or `(hover:hover) and (pointer:fine)`; JS layout is gated on
`matchMedia('(min-width:1024px)')` and hover on a real mouse. Touch tablets ≥ 1024 px get the desktop layout without
hover effects. After every change the phone pixel-diff guard must be 0 px (Appendix C).

| Area | Built (demo `97-desk-a.js`, `r12-zzdesk-a.css`, `r12-zzdesk-b.css`) |
|---|---|
| Navigation | Data-driven **mega menu**: New in, categories, More (hidden categories), Combos, Sets, Journal; folds into More when narrow; sub-category links; hover intent 150 ms; **Enter = go to the category, Space/↓ = open the panel, Esc returns focus** |
| Container | **1440 px content at ≥ 1536** |
| Header | Loop animations max 3 rounds; WhatsApp tip "Need any help" |
| Home | Hero text on the content edge; slides dissolve into the panel (140 px); reviews one row of 3 |
| Category | Filters from data; rows fill (no empty right strip) |
| Product | **Sticky buy bar (64 px)**; Order Now above the fold on every template at 1024–1366; zoom with drag, wheel, ‹ › and keyboard; focus restored after colour/size picks |
| Add to bag | **Right-side drawer, 420 px** |
| Combos | Hub rails share rows; bag stays B5 with desktop sizing |
| Checkout | Summary aligned and sticky with "+N more items" |
| Account | Three offers at ≥ 1024 with a mouse; touch tablets keep two |
| Footer | Four columns + contact block (social over payment left; WhatsApp over Hotline right, equal width) |
| Sliders | Pause on hover; **restart the moment the mouse leaves** (touch keeps its 4 s hold) — one engine, `02-core.js` |
| Accessibility | Site-wide focus style; no nested buttons in links (1,428 → 0) |

Results: desktop interaction 198/198 at six widths (1024, 1280, 1366, 1440, 1536, 1920); route sweep 104 routes × 6
widths with 0 JS errors and 0 sideways scroll; journeys 126/126. Open on purpose (Appendix B): D-040 CTA style, D-042
inline size chips, D-045 form cap.

## D10. Page and site building tools (V2 · S02 · PR 595–600)

All of these share one rule: **defaults reproduce today's pages exactly** (gate 0 px), nothing is deleted (hide, never
delete), every change is draft → preview → publish with undo, and the owner's own data never ships (PR 509).

### D10.1 Page layout builder (PR 595 — in demo)

Home and every category page (all categories or a per-category override): add, move (drag or ↑/↓), hide, edit,
duplicate sections. Types: banner, offer strip, product row/grid (from category, tag or manual), combo row (from a
combo rule), category tiles, reviews, journal, safe rich text, spacer, custom HTML-safe block. Each section has
on/off, whole-day Asia/Dhaka dates and device choice (phone / desktop / both); live phone + desktop preview; example
"নতুন অফার" above the reviews. Demo: `#/admin/layout` (`96c-layout-builder.js`, `r12-zlb.css`); hooks `HOME_SECTIONS`,
`CAT_SECTIONS`, `CAT_SLOTS.afterGrid`.

### D10.2 Side canvas (PR 596 — in demo; extensions paused)

The empty left and right desktop gutters, from under the header banner to the footer. **Master switch off** (off =
today's look); the owner will turn it on (Note 37.1). Desktop with a mouse only; phones and tablets never download it.
- Zones: free-form by size and position (draw, drag, resize or type numbers) on a live map at 1280–1920 with rulers;
  per page (home, all or chosen categories; login and bag added, checkout never), per zone on/off and dates.
- Zone types: banner, house ad (product / combo / category), popup trigger (view / time / click; once per visit / day /
  week), illustrated figure, image/animation; full-blend mode (no frame, edge fade).
- **Never hide — scale** from the 1440 standard (gutter 132 px): 0.31× at 1280, 0.68× at 1366, 1× at 1440, 0.28× at
  1536, 1.6× cap at 1920; picture-only below 72 px. Modes: sticky, float (±40 px, eased, transform only), anchored.
- **Placement default from the owner's marking** (`review/owner-side-zone-2026-10-19.png`): top at the first content
  row (≈ 14.4% below the header), height ≈ 80% of the visible window, ≈ 6% bottom gap, ≈ 16 px from the content; 157 ×
  644 at 1797 × 879; mirrored right; percentages are settings ("centred 75%" kept as a preset). A per-size editor with ≥
  10 real desktop sizes; fix any size (badge, reset to auto); sizes in between interpolate; "check all sizes" grid.
- **AI motion templates (with S24/S25):** 19 in the demo incl. the signature **walk-out** (a model in our polo, denim
  and shoes walks out of the page; skill `agents/skills/gyani/studio/WALKOUT-TEMPLATE.md`); product picker (category,
  sub-category, every colour of a style, manual, combo); AI pose/video generation reuses the asset library (never paid
  twice).
- **Speed:** loads after the main content on idle; transform/opacity only; paused off-screen or in a hidden tab;
  budgets in D12; publishing over budget is blocked.
- Demo: `#/admin/side-canvas`, approval view `#/preview/side-canvas` (1440 and 1920). **Paused — the code phase owes:**
  tests for per-page placement, Bengali placement sheets, a full gate re-run.

### D10.3 Launch default and snapshots (PR 597 — in demo)

The launch look is saved as the "Launch default": page layouts, side canvas, house ads and popups, home/category
sections and banners (and the site builder's published data). **"Back to launch default"** returns everything to it;
test sections, zones and ads switch off and are kept as hidden copies. Named snapshots (e.g. "Eid 2027") with restore
and rename; every restore logged and undoable. Panels on Page layout, Side canvas and Settings.

### D10.4 Site builder (PR 598 — partly in demo; paused)

"Like WordPress + Elementor, nothing fixed" (Note 40) **with guardrails** (Note 41): menus (header nav, mega menu,
phone menu, bottom bar), header (announcement bar, icons on/off and order, logo text or image with phone version,
slogan under the logo, on), footer (columns, links drag-and-drop, contact block, social and payment icons from a set or
uploaded), categories and sub-categories, product-page blocks (order and per-device visibility; the buy group cannot
be hidden and only first-screen blocks may sit above it), content pages (rich text), theme tokens (colours, fonts,
spacing) with an AA contrast block, a **Shimmer control** (every shimmer: on/off, speed, intensity, master, reduced
motion), and **tiered bag offers** (Take 2 / 3 / 4 with prices and savings). Guardrails: blocks snap to the responsive
grid (no free pixel dragging), contrast and tap-size checks block bad publishes, **checkout keeps its tested structure —
texts, fields on/off and order are editable, payment steps are locked**. Demo: `#/admin/site` (`96d-site-builder.js`,
`r12-zsb.css`), status page "what can be changed". Paused state and what the code phase owes: status table at the top.

> **V2.1 final · 20 Oct.** The two items the paused-state table left "to confirm against the register line" are
> confirmed and built in the demo: the **Shimmer control** (Admin › Settings › Shimmer; 14 shimmers × on/off · speed ·
> strength + master; reduce-motion = no shimmer; Add to Bag shimmer present, off by default; D1.5) and the **tiered bag
> offer box** "Take 2 │ Take 3 │ Take 4" (D3.11; tiers from the Build your own set price rules, up to 4 per rule, dates
> and targeting; desktop only, phone version preview only). Register PR 598 carries the dated scope "V2.1 final · 20
> Oct". The rest of PR 598 stays paused as listed in the status table.

### D10.5 Help and user manual (PR 599 — partly in demo; paused)

See the B7.5 V2 block.

### D10.6 On-page edit mode (PR 600 — not in demo; paused)

Logged in as super admin, a thin bar on every storefront page turns on Edit mode (customers never see it): hover a
section → outline + Edit; click → side panel with that section's settings (texts, prices, products, offer tiers,
shimmer, hide); "+" between sections adds one; the draft shows in place → Publish → undo. Same engine as the site
builder (two doors). On a phone: a light version (texts and offers only, no drag). **Desktop change → "Apply to phone
too?"** If yes, previews on the **10 phone screen sizes most used in Bangladesh** (the owner can open any) plus automatic
checks (nothing cut, no sideways scroll, tap size, buy button above the fold); it reaches the phone only after the
checks pass and the owner approves. **AI mode:** an AI reviewer tests the change across phones, tablets and desktops
(layout, speed, conversion rules, customer impact) and returns "safe to publish" or "Boss, don't publish: …" with
reasons and screenshots; with AI mode off it says so and the owner's check stands. Guardrails as PR 598.

## D11. Admin language (V2 · PR 503 scope · Note 37.3)

The backend's menus and labels are in **simple English by default**, with a switch **"English | বাংলা"** (sidebar on
desktop, top bar on phone). Demo: a separate layer `98a-admin-lang.js` + `98b-admin-dict.js` (2,016 hand-written
plain-English entries); 84 admin routes and tabs × 1280/393, 442 states: 0 Bengali visible in English mode, Bengali
mode identical to before. Rules: an admin string that has its English beside it is kept as `{en, bn}` or
`['English', 'বাংলা']` so the harvest uses the author's own English; after adding admin strings run
`tools/extract-admin-bn.py --missing` then `--merge`. Owner-facing admin text avoids agent codes and PR numbers (names
instead; codes in tooltips). The storefront language switch is unchanged (footer, "EN | বাং").

> **V2.1 final · 20 Oct — admin language finished for the demo** (PR 503). English mode shows **0 Bengali across 206
> admin routes** (84 at V2). The **mixed-label dictionary is fixed** (labels that mixed both languages). Documents in
> **Blueprint & files** (the reader, PR 594) are shown **exactly as written** in either mode — the switch never
> translates a document. **Combo-rule state labels** are English by default (**Running / Off / Ended / Starts …**) and
> Bengali in Bengali mode (PR 90); the owner-answers test was updated for this and passes.

## D12. Performance budgets (V2)

| Budget | Target | Where it is enforced |
|---|---|---|
| First screen on a mid phone over 4G | < 2.5 s | checklist PF01; PR 88, 234 (needs real hosting) |
| First page HTML + JS + CSS | < 500 KB compressed | checklist PF02 (code phase; the demo is one file) |
| Images | WebP/AVIF, `srcset`, lazy below the fold | PF03; PR 24, 88 |
| Route draw (in-app navigation) | < 200 ms | PF06 (demo: 19–180 ms) |
| Scroll | no heavy work per scroll event; no forced-reflow loops | PF07, PF12 (demo 17 ms/frame) |
| Timers and animations | no forever `setInterval`; infinite animations few and stopped off-screen / reduced motion | PF08, PF09 |
| **V2.1 final · 20 Oct** timers on route change | every timer cleared on route change; none alive on an idle page (TA-2 TM-01 ✅) | L33.37; D1.2 R18g |
| Slow CPU | works at 4× slower CPU without double navigations | PF10 |
| CLS | 0 on load | desktop QA (measured 0) |
| Side canvas | image ≤ 150 KB, video ≤ 1.5 MB + poster, page total ≤ 3 MB; LCP regression ≤ 100 ms; CLS 0; publishing over budget blocked | PR 596 (demo at 1440: LCP +28 ms, CLS 0, longest task 19 ms, slow scroll frames 2.3% vs 1.7%) |
| Lighthouse budget | CI gate | PR 17, 88 |
| Server baseline | k6 baseline recorded; every later change measured against it | PR 10 |
| Field data | Core Web Vitals from real users | PR 234 |
| **V2.1 speed targets** (from Dhaka, on a phone, over 4G) | LCP < 2.5 s · CLS < 0.1 · INP < 200 ms · TTFB < 600 ms · category page < 1 MB · admin page < 1 s; measured automatically every month | PR 10, 88, 234, 423 (A2.9.11) |
| **V2.1 images** | category image < 40 KB, product main image < 150 KB; 5 sizes × AVIF/WebP/JPEG, 4:5 | PR 22, 24, 88 (A2.9.7) |

---

# Part F · Decisions still open

> **V2 · 19 Oct — most of this part is answered.** The 18 Oct decision round answered questions 1–60 one by one
> (`PENDING_CHANGES.md` §59; answer numbers match the numbers below), and rounds 13–15 settled most UI/UX rows. The
> status of every V1 question is in **F4** at the end of this part. The live open list is **Appendix B**.


## F1. Settings still to be decided

These do not change any design. They are defaults, thresholds and account details, and each one has a
recommended value so **the build never stops waiting for an answer**. A build agent reaching one of
these uses the recommendation, builds it as a setting the owner can change from the dashboard, and
writes one line in `BLOCKED.md` saying which assumption it made.

**A discrepancy the owner should know about.** The record states there are **42** of these questions,
but only the **31 below were ever written down**. The missing 11 were counted and never captured. They
are most likely in S13 (ads) and S18 (compliance), the two stages whose settings were discussed last.
Rather than invent them, they are flagged here: when the owner reaches those two stages he should
expect a few more questions than this list holds.

### S06 · Fraud & location

| # | Question | Recommended default |
|---|---|---|
| 1 | Risk score thresholds | 30 = watch, 60 = hold |
| 2 | What happens at each risk level | Watch: flag only. Hold: require a confirmation call before packing. |
| 3 | Who may add a customer to the blocklist | Owner and manager only |
| 4 | Keep the IP / GPS / address panel and the optional GPS button | Keep the panel, drop the GPS button — it asks a customer for a permission that frightens people |
| 5 | Turn COD off for customers who repeatedly return | Yes, after 3 returns in 90 days, and reversible by hand |

### S11 · SEO engine

| # | Question | Recommended default |
|---|---|---|
| 6 | `/en` as default with `/bn` alongside | Confirmed in the record; build it that way **→ V2: English at `/`, Bengali at `/bn` behind the translation gate (PR 220, 588)** |
| 7 | Which filter pages get their own indexable page | Category + single colour, and category + single fit. Nothing deeper — deeper combinations compete with each other. |
| 8 | Ghost archive for out-of-stock products | Keep the page live with "back in stock" capture; never 404 a page that has earned rankings |
| 9 | AI meta and alt text — auto-apply or one-click accept | Auto-apply for alt text, one-click accept for meta titles and descriptions |
| 10 | Whose Search Console and Bing accounts | **Owner must supply.** Needed before S11 can verify anything. |

### S12 · Content & blog

| # | Question | Recommended default |
|---|---|---|
| 11 | Blog auto-publish or owner approval | Owner approval for the first month, then auto-publish with a daily digest |
| 12 | Articles per week | 2 |
| 13 | Auto-post when a new product lands | No — product launches belong in social, not the blog |
| 14 | Blog language | Both, Bengali first for anything a village buyer would search |
| 15 | Which permanent seasonal pages | Eid, winter, Puja, and a "new in" evergreen page |

### S13 · Marketing & ads

| # | Question | Recommended default |
|---|---|---|
| 16 | Which ad platforms | Facebook and Instagram first; TikTok second; Google last |
| 17 | Who sets the USD rate | Owner, by hand, in settings — an automatic rate makes the cost reports move on their own |
| 18 | Allow pausing and budget changes from the dashboard | Yes, with a confirmation step |
| 19 | Alert thresholds | Alert when cost per order rises 40% above the 7-day average |
| 20 | Which coupon types | Percentage, fixed amount, free delivery, and set-price unlock |

### S16 · Finance, costs & reports

| # | Question | Recommended default |
|---|---|---|
| 21 | Allocate ad spend per order in the profit figure | Yes — profit without ad spend is not profit |
| 22 | Expenses read-only from the ERP | Yes, read-only. The ERP stays the master. |
| 23 | VAT | Off for now, with the field present so it can be switched on |
| 24 | Daily report time | 22:00 |
| 25 | Team performance badges | Build it, default off |

### S17 · Multi-store

| # | Question | Recommended default |
|---|---|---|
| 26 | Is a second store really wanted, or drop the stage | Build the foundation (`storeId` everywhere) regardless — retro-fitting it later means touching every table. Launch stores 2 and 3 only when he has the domains. |

### S18 · Compliance, security, manual

| # | Question | Recommended default |
|---|---|---|
| 27 | DBID, trade licence and VAT BIN numbers | **Owner must supply.** They are placeholders in the footer today and must not reach the live site. |
| 28 | Lawyer review of the policy pages | Recommended before go-live; the build does not wait for it |
| 29 | Pre-order advance cap | 10% |
| 30 | Purge IP and GPS data after 180 days | Yes |
| 31 | Mandatory 2FA for admin accounts | Yes |

## F3. Decisions from the UI/UX rounds still waiting

These are not settings — they change what gets built — and the build should not guess at them.

| Question | Status |
|---|---|
| Which Add-to-Bag / Order Now colour combination (five were shown, numbered) | Number 1 is shipped as the working default |
| Where the floating WhatsApp button lives: centred as first asked, low-right above the sticky bar, or idle-collapsing | Recommendation given: low-right. Currently centred, and it covers content at some scroll positions. |
| The sub-menu design for the hamburger menu | Proposal and mock-up delivered; not built |
| The rebuilt search — panel from the top, with help articles in the results | Proposal and mock-up delivered; not built |
| Whether the ৳800–1,200 price band should compute from the catalogue instead of being fixed | Raised; currently hard-coded, which is normal for a band filter |
| Whether footer link rows go to a full 44 px touch target, which adds ~90 px to a footer he asked to shorten | Raised; currently 34 px |

## F2. Questions raised while writing this specification

Writing the spec surfaced decisions that had never been asked. They are listed here with the same rule:
**the build does not wait.** Where a recommendation is given the agent uses it and records the
assumption; where the answer can only come from the owner, that is said plainly.

### Platform and server

| # | Question | Recommended default |
|---|---|---|
| 32 | Claude plan tier for the build — Max 20x or Max 5x | 20x only pays for itself when 2–3 agents run in parallel, which this plan assumes |
| 33 | After a successful OS upgrade, delete the pre-upgrade disk snapshot or keep it | Keep for 30 days, then delete |
| 34 | If the in-place OS upgrade fails, supply an Ubuntu Pro token or keep retrying | **Owner must decide.** A failed upgrade is one of the few things that can stall S0A. |
| 35 | Confirm the Azure region permanently | A region change needs a new VM, which the "do not change the package" rule forbids |
| 36 | Push access to the owner's ERP repository (`Extas-ERP`) for the sync endpoints | **Owner must supply.** S09 cannot finish without it. |
| 37 | Which domain is connected first — it becomes the mother store permanently | **Owner must decide.** It cannot be moved later. |
| 38 | Are the domains for stores 2 and 3 in hand, or build them in draft | Build in draft; launch when the domains arrive |
| 39 | Azure credential for the agent, or will the owner set the static IP and open 80/443 himself | Owner does it himself — fewer credentials handed over is better |
| 40 | Do ERP companies already exist for stores 2 and 3 | Agent creates them if absent |

### Operations and support

| # | Question | Recommended default |
|---|---|---|
| 41 | How long may an order sit on hold for a defective item before it must be cancelled | 48 hours |
| 42 | When one item of a multi-item order is held, may the rest ship | Yes by default, with the customer told |
| 43 | Which roles may approve a stock adjustment | Owner only |
| 44 | How many days back to look for a duplicate order on the same phone | 5 |
| 45 | WhatsApp invoice default format | JPG image — it opens inside WhatsApp; PDF makes people download |
| 46 | Which card gateway | **Owner must decide** — whichever he already holds an account with |
| 47 | Minimum margin the margin guard enforces before demanding an override | 15% |
| 48 | Support SLA — first response and resolution targets | First response 15 minutes in hours, resolution 24 hours |
| 49 | Support desk hours | 10 am – 10 pm, matching the hotline already shown in the footer |
| 50 | How long to keep an inactive customer's phone, address and email | 3 years after the last order, then anonymise |
| 51 | Restrict admin login to an IP allowlist from day one, or 2FA only | 2FA only at first — an allowlist locks the owner out the first time he travels |
| 52 | How often Site Health & Audit runs | Daily |
| 53 | Which competitors to track, and how often | **Owner must name them.** 2–4 Bangladeshi menswear sites, re-run weekly. |
| 54 | The support dashboard reference screenshot could not be opened | **Owner should attach the image**, not a link |

With these, the real count of open settings is **54**, not 42 — the eleven that the record said existed
but never wrote down are now more than accounted for.

### AI, data and imagery

| # | Question | Recommended default |
|---|---|---|
| 55 | **Which classes of customer data may be sent to an external AI model.** May a full name, phone and address go out for a support reply or address parsing, or must they be masked first? No rule for this was ever recorded. | **Owner must decide.** Recommendation: mask phone and house number by default; send only what the model needs to answer. |
| 56 | Allow AI crawlers — GPTBot, ClaudeBot, PerplexityBot, Google-Extended | Yes. Being answerable by AI assistants is one of the owner's stated goals. Built as a switch either way. |
| 57 | Which social platforms may post automatically from day one, and which wait for approval | Facebook and Instagram auto; TikTok and YouTube on approval for the first month |
| 58 | Offer "Continue with Facebook" login, and apply to Meta for `user_birthday` | Yes — it is the only automatic birthday source, and it is what un-parks the birthday module |
| 59 | Model photographs — one real shoot of 4–5 models with signed releases, or AI model personas for now | **Real shoot recommended.** Real faces outsell generated ones in this market, and the releases remove a legal question permanently. |
| 60 | Should each PR be marked "before go-live" or "after go-live" in the final plan | Yes — it is how the owner will know what he is waiting for |

### UI/UX — these change what gets built, so the build should not guess

| # | Question | Status |
|---|---|---|
| 61 | Which of the five Add to Bag / Order Now colour combinations, or which two mixed | Five shown and numbered; option 1 is the working default |
| 62 | Floating WhatsApp button: centred as first asked, low-right above the sticky bar, or centred but collapsing while idle | **Low-right recommended.** Centred, it covers content at some scroll positions and has already swallowed one tap. |
| 63 | Approve the sub-menu design | Proposal and mock-up delivered; not built |
| 64 | Phone search — from the top, the middle, or stay at the bottom | **Top recommended**, with the reasoning and a mock-up delivered |
| 65 | What fills the space the EXTAS mark leaves on the desktop checkout header | A Bag → Delivery → Done steps bar is in there now |
| 66 | Is the icon rail's phone home at 38% of the viewport acceptable, instead of 50% | At 50% it parked on the fifth thumbnail on every product |
| 67 | Footer link tap targets — 44 px, or the shorter footer | 44 px adds about 90 px back to a footer he asked to shorten |
| 68 | What honest wording replaces "No return" on the Returns row | Needs his words — it is a policy statement, not a design choice |
| 69 | What goes in the add-to-bag sheet when the order does not qualify for free delivery | Cash on Delivery + the exchange window is in there now |
| 70 | Where "Only 3 left in Olive, size L" should sit | Currently a chip on the photograph, which costs no vertical space |
| 71 | Which "was"-price source is the default per category — MRP, price history, or combo | Needs a decision before any discount goes live |
| 72 | Which fixed set of offers the My-account banner rotates through | Needs his list |
| 73 | Which six Shop links appear in the footer | Needs his pick |
| 74 | Do the eye-toggles live in one dashboard switch list, or beside each section in the page builder | One list recommended — he will look for them in one place |
| 75 | Confirm the wishlist-alerts proposal (opt-in, real triggers only, capped, default off) | Designed, not built |
| 76 | Will he re-audit the phone from the top, so the desktop review can begin | The desktop review has not started at all |

**Total open decisions: 76.** None of them stops the build. Thirty-one were known; forty-five surfaced
while writing this specification — which is the point of writing one.

## F4. Status of every V1 question (V2, 19 Oct)

Answers 1–60 come from `PENDING_CHANGES.md` §59 (18 Oct); the numbers match.

| # | V1 question (short) | Status |
|---|---|---|
| 1 | Risk score thresholds | Answered: customisable, the owner types the numbers (PR 156) |
| 2 | Actions per risk level | Answered: Claude's set is the default, every action editable (PR 161) |
| 3 | Who may blacklist | Answered: owner, manager and customer-facing staff (PR 162); nothing blocked automatically (PR 523) |
| 4 | IP/GPS panel and GPS button | Answered: panel stays; GPS button stays, default on, switchable (PR 159) |
| 5 | COD off for repeat returners | Answered: per case — COD off, delivery charge in advance, full advance, or nothing (PR 163) |
| 6 | `/en` + `/bn` | Replaced: English at `/`, Bengali `/bn` behind the gate (PR 220, 588) |
| 7 | Indexable filter pages | Answered: whatever genuinely performs; more pages not automatically better (PR 227) |
| 8 | Ghost archive | Answered: no URL ever deleted or 404 (PR 527) |
| 9 | AI meta/alt auto-apply | Answered: auto-filled, editable, removable, improvable |
| 10 | Search Console / Bing accounts | Answered: fields provided, the owner pastes keys (Appendix B) |
| 11 | Blog auto-publish | Answered, then replaced: topic-list approval, agent pipeline (PR 244, 591) |
| 12 | Articles per week | Replaced: 3–6 a day (PR 591); a new product triggers a post |
| 13 | Auto-post on new product | Answered: yes, aimed at Bangladesh, auto-shared to social if configured |
| 14 | Blog language | Answered: both; English pages most important (Note 27.1) |
| 15 | Permanent seasonal pages | Answered: permanent; archive and live are states (PR 530) |
| 16 | Ad platforms | Answered: Facebook, Instagram, Google, YouTube, TikTok, LinkedIn present by default |
| 17 | USD rate | Answered: the owner sets it (PR 266) |
| 18 | Dashboard ad control | Answered: full control (PR 531) and deep feed (PR 532) |
| 19 | Alert thresholds | Answered: owner sets them from the dashboard (PR 267) |
| 20 | Coupon types | Answered: fully dynamic (PR 271) |
| 21 | Ad spend in profit | Answered: yes, plus profit by category and by style (S16) |
| 22 | Expenses from the ERP | Answered: entered here, later reach the ERP |
| 23 | VAT | Answered: off for now; whole system present, per product/category |
| 24 | Daily report time | Answered: frequency set by the owner |
| 25 | Team badges | Answered: needed |
| 26 | Second store | Answered: 2–3 stores must work (S17) |
| 27 | DBID, licence, VAT BIN | Answered: dynamic from the backend; numbers still owner data (Appendix B) |
| 28 | Lawyer review | Answered: no lawyer; Claude drafts, the owner edits |
| 29 | Pre-order advance cap | Answered: defaults present, percent per product |
| 30 | Purge IP/GPS at 180 days | Answered: yes |
| 31 | Mandatory 2FA | Answered: present, not mandatory |
| 32 | Plan tier | Answered: Max 20x already taken |
| 33 | Keep the pre-upgrade snapshot | Obsolete (new VPS, Note 45) |
| 34 | Ubuntu Pro token on a failed upgrade | Obsolete (new VPS) |
| 35 | Azure region | Obsolete in form; the owner's rule stands that a backup must restore into a new region if one is suspended |
| 36 | ERP push access | Answered: granted, the owner will provide (Appendix B) |
| 37 | First domain | Answered by PR 587: extas.com.bd (domain access when ready) |
| 38 | Stores 2 and 3 domains | Answered: the owner adds store 2 himself later from the panel |
| 39 | Azure credential / who opens ports | Answered: we open ports 22/80/443 (Note 45.2) |
| 40 | ERP companies for stores 2–3 | Answered: ERP needed when they open; 2–3 stores supported by default |
| 41 | Defective-item hold limit | Answered: never auto-cancelled; the team decides (PR 183) |
| 42 | Rest of a multi-item order ships | Answered: yes |
| 43 | Stock adjustment roles | Answered: owner for now; two or three more role options (PR 495) |
| 44 | Duplicate look-back | Answered: the duplicate engine (PR 519–524, 540–546) |
| 45 | WhatsApp invoice format | Answered: full-page JPG with the logo |
| 46 | Card gateway | Answered: several gateways configurable at once with checkboxes; accounts are owner data |
| 47 | Minimum margin | Answered: margin % set per product at add time |
| 48 | Support SLA | Answered: AI answers first; 5-minute (settable) employee window, then Telegram to the owner |
| 49 | Support desk hours | Answered: backend, dynamic |
| 50 | Inactive customer retention | Answered: never auto-deleted (PR 302) |
| 51 | Admin IP allowlist | Withdrawn by the owner |
| 52 | Site Health frequency | Answered: defaults provided, the owner sets them |
| 53 | Competitors to track | Answered: defaults provided; the owner links them later |
| 54 | Support dashboard screenshot | Answered: link safety rule (AI checks links customers send) — the screenshot itself was not resent |
| 55 | Data classes to external AI | Answered: Claude's proposal accepted (data-class routing and masking, PR 310–311) |
| 56 | AI crawlers | Answered: optional, default on (PR 229) |
| 57 | Social auto-posting | Answered: defaults provided, the owner decides where |
| 58 | Facebook login | Answered: **no** Facebook login |
| 59 | Model photographs | Answered: from outside or created in the backend; generated photos follow a supplied pose |
| 60 | Before/after go-live marking | Answered: "do what is better for the site" — the wave plan (E3) carries it |
| 61 | Buy-button colours | Answered (Note 3.11); desktop CTA style D-040 open (Appendix B) |
| 62 | Floating WhatsApp position | Replaced by the header icon (Note 3.1) |
| 63 | Sub-menu design | Approved 18 Oct (register +2) |
| 64 | Phone search position | No recorded ruling; demo default ships (Appendix B, carried list) |
| 65 | Desktop checkout header space | No recorded ruling; demo default ships (Appendix B, carried list) |
| 66 | Icon rail at 38% | Replaced: the rail is off by default (Note 2.3) |
| 67 | Footer tap targets | No recorded ruling; demo default ships (Appendix B, carried list) |
| 68 | Returns row wording | Open (Appendix B) |
| 69 | Add-to-bag sheet without free delivery | Settled: owner rule kept — "COD · 72-hour exchange" (D3.10) |
| 70 | "Only 3 left" position | No recorded ruling; demo default ships (Appendix B, carried list) |
| 71 | "Was"-price source per category | Open (Appendix B) |
| 72 | Account offer banner set | Answered (Note 4.8) |
| 73 | Six footer Shop links | No recorded ruling; demo default ships (Appendix B, carried list) |
| 74 | Eye-toggles in one list | Answered: one searchable list (PR 81) |
| 75 | Wishlist alerts | No recorded ruling; designed, default off (Appendix B, carried list) |
| 76 | Phone re-audit | Done: phone review complete 18 Oct; desktop review 19 Oct |

F3 rows: buy-button colours → #61; floating WhatsApp → #62; sub-menu → #63; rebuilt search → approved 18 Oct (register
+3) and built (D3.2); price band from the catalogue → answered by PR 46 (filters from data); footer tap targets → #67.

---

# Appendix A · Every PR, 1–604

Generated from `master/MASTER-REGISTER.md` (title, stage) and the PR register data the demo builds from it (`proto/src/04-register-data.js`, written by `tools/make-register.py` after Note 45: status, owning agent, demo file). **Status:** *Filed* = specified in the register, built in the code phase · *In demo* = a working reference exists in the demo (the register generator's reading of demo source headers; "route hint" = matched by route only) · *Parked* = S26 handover pack · *paused* = finished in the code phase (status table at the top). **165 titles are marked *(derived)*:** the register lists those PRs by range only; their titles come from V1's own item lists in order (positional, to be confirmed when the register is itemised), from agent files that name them, or from the stage's section of this specification.

**V2.1 (19 Oct 23:33, CN-001):** rows 601–604 are added; rows whose scope the owner's server spec changed carry "· updated 19 Oct 23:33 (CN-001)" in the title.

| PR | Title | Stage | Status | Owner | Demo reference |
|---:|---|---|---|---|---|
| 1 | New VPS (Ubuntu 24.04 LTS): record specs from the owner's screenshot; provider snapshot before any change (updated 19 Oct 22:44) · updated 19 Oct 23:33 (CN-001): Azure E8ds_v6, Southeast Asia, Ubuntu Server 24.04 LTS Gen2, OS 128 GB + 1 TB data disk (LVM) | S0A | Filed | Prohori |  |
| 2 | OS: no in-place upgrade on the new VPS — verify Ubuntu 24.04 LTS and apply all updates (updated 19 Oct 22:44) · updated 19 Oct 23:33 (CN-001): image Ubuntu Server 24.04 LTS x64 Gen2, not Pro | S0A | Filed (verify only on the new VPS) | Prohori |  |
| 3 | Base hardening — SSH keys only, no root login, fail2ban, unattended updates, UFW; ports 22/80/443 opened by us · updated 19 Oct 23:33 (CN-001): UFW 22/80/443, Cloudflare IPs option, fail2ban, boot order NVMe first | S0A | Filed | Prohori |  |
| 4 | Docker and Docker Compose, with the project's network and volume layout · updated 19 Oct 23:33 (CN-001): per-container limits, zero-downtime deploys with rollback | S0A | Filed | Prohori |  |
| 5 | PostgreSQL tuned for 8 vCPU / 64 GB — connections, shared buffers, work memory, autovacuum · updated 19 Oct 23:33 (CN-001): size confirmed; 16 GB, effective_cache_size 40 GB, PgBouncer, temp on NVMe, slow log | S0A | Filed | Prohori |  |
| 6 | Redis, and BullMQ queues with their dead-letter handling · updated 19 Oct 23:33 (CN-001): Redis 6 GB LRU, image/video worker and job queues | S0A | Filed | Prohori |  |
| 7 | Caddy with automatic TLS, HTTP/2 and HTTP/3, compression, and the security headers · updated 19 Oct 23:33 (CN-001): Caddy stays; Cloudflare Full (strict) with Origin certificate | S0A | Filed | Prohori |  |
| 8 | Nightly encrypted backup of database, uploads and configuration to Google Drive, with one-command restore · updated 19 Oct 23:33 (CN-001): Azure Blob + Google Drive, WAL/PITR, soft delete, restore defaults to Blob | S0A | Filed | Prohori | V2.1 final · 20 Oct: demo `#/admin/backup` shows Blob + Drive (sample data) |
| 9 | Monitoring — uptime, queue depth, error rate, disk and memory, alerting to Telegram · updated 19 Oct 23:33 (CN-001): alerts: disk 80%, service down, backup failed, slow site, NVMe missing | S0A | Filed | Prohori |  |
| 10 | k6 performance baseline, recorded as the number every later change is measured against · updated 19 Oct 23:33 (CN-001): speed targets from Dhaka on a phone over 4G | S0A | Filed | Prohori |  |
| 11 | Repository, branch rules, commit and PR conventions, PROGRESS.md and BLOCKED.md | S00 | Filed | Prohori |  |
| 12 | Next.js App Router + TypeScript skeleton, Tailwind and the component base | S00 | Filed | Prohori |  |
| 13 | Full Prisma schema in one pass — every table the whole plan needs, including storeId on everything · updated 19 Oct 23:33 (CN-001): indexes and pg_trgm from PR 603 | S00 | Filed | Prohori |  |
| 14 | Seed data and fixtures: categories, products, colours, sizes, a demo order | S00 | Filed | Prohori |  |
| 15 | Authentication — customer accounts, admin accounts, sessions, password rules | S00 | Filed | Prohori |  |
| 16 | Role and permission model: owner, manager, support, auditor (read-only) | S00 | Filed | Prohori |  |
| 17 | CI — lint, type-check, unit tests, build, and the Lighthouse gate | S00 | Filed | Prohori |  |
| 18 | The adapter framework: every integration has a mock / sandbox / live mode and a test-connection button · updated 19 Oct 23:33 (CN-001): storage adapter (local / Blob / S3) | S00 | Filed | Prohori |  |
| 19 | Product, variant, colour and size model, with the ERP's SKU as the key | S01 | In demo | Bhandari | `90-admin-catalog.js` (#/admin/products) |
| 20 | Category tree with sub-categories, and the per-category garment type | S01 | In demo | Bhandari | `90-admin-catalog.js` (#/admin/products) |
| 21 | Product admin — create, edit, publish, unpublish, bulk actions | S01 | In demo | Bhandari | `90-admin-catalog.js` (#/admin/products) |
| 22 | Image upload with standardisation: size, aspect, background, naming convention · updated 19 Oct 23:33 (CN-001): 5 sizes, AVIF/WebP/JPEG, 4:5, original archived | S01 | In demo | Bhandari | `90-admin-catalog.js` (#/admin/products) · V2.1 final · 20 Oct: demo `#/admin/images` (sample data) |
| 23 | Watermark on download only, never on the storefront image | S01 | In demo | Bhandari | `90-admin-catalog.js` (#/admin/products) |
| 24 | High-resolution zoom, and the responsive image pipeline · updated 19 Oct 23:33 (CN-001): picture/srcset, dominant-colour placeholder, eager/lazy | S01 | In demo | Bhandari | `90-admin-catalog.js` (#/admin/products) · V2.1 final · 20 Oct: demo `#/admin/images` (sample data) |
| 25 | Minimum four photographs enforced at upload | S01 | In demo | Bhandari | `90-admin-catalog.js` (#/admin/products) |
| 26 | Upload-time validation block: missing photos, missing size chart, missing fabric notes | S01 | In demo | Bhandari | `90-admin-catalog.js` (#/admin/products) |
| 27 | Size chart system — per garment type, per fit, with the measurement fields | S01 | In demo | Bhandari | `90-admin-catalog.js` (#/admin/products) |
| 28 | Size chart admin: create, copy, assign to categories and to single products | S01 | In demo | Bhandari | `90-admin-catalog.js` (#/admin/products) |
| 29 | Product health score — what is missing before this product may go live | S01 | In demo | Bhandari | `90-admin-catalog.js` (#/admin/products) |
| 30 | Colour library with real hex values, the colour name dictionary, and true-colour reference | S01 | Filed | Bhandari |  |
| 31 | Fabric and care content, structured so it can feed the page and the AI answers | S01 | Filed | Bhandari |  |
| 32 | Collections and tags, including seasonal ones | S01 | Filed | Bhandari |  |
| 33 | Product import from a link — read a supplier or brand page, draft the product | S01 | Filed | Bhandari |  |
| 34 | Bulk CSV import and export for the catalogue | S01 | Filed | Bhandari |  |
| 35 | Publish queue — nothing reaches the storefront until its checklist passes | S01 | Filed | Bhandari |  |
| 36 | Ghost archive: an out-of-stock product keeps its page and collects back-in-stock interest | S01 | Filed | Bhandari |  |
| 37 | Media library with search, reuse, and orphan cleanup · updated 19 Oct 23:33 (CN-001): media library on the storage adapter (Blob) | S01 | Filed | Bhandari |  |
| 38 | "Was" price source per category — MRP, price history or combo — with the honesty rule enforced | S01 | Filed | Bhandari |  |
| 39 | Product audit report: everything incomplete, with a one-click route to fix it | S01 | Filed | Bhandari |  |
| 40 | Store shell — header, footer, bottom navigation, the slim checkout header | S02 | In demo | Sawdagor | #/ (route hint) |
| 41 | Home page: hero, categories, new in, sets band, flash sale, reviews, journal | S02 | In demo | Sawdagor | #/ (route hint) |
| 42 | One smooth slider engine | S02 | In demo | Sawdagor | #/ (route hint) · V2.1 final · 20 Oct: separate pause flags, resume ≤ ~100 ms after leave / drag / wheel, vertical wheel ignored, mouse drag on every row (TA-2) |
| 43 | Hero slider: 12–15 products across all categories, auto-sizing name-and-price pins | S02 | In demo | Sawdagor | #/ (route hint) |
| 44 | Flash sale: two rows sliding in opposite directions, with a countdown that actually ticks | S02 | In demo | Sawdagor | #/ (route hint) |
| 45 | Category page: grid, breadcrumb, category SEO text block, pagination | S02 | In demo | Sawdagor | #/c/polos (route hint) · V2.1 final · 20 Oct: price never splits from "৳" in category banners (nowrap) |
| 46 | Filter system — colour, size, fit, price band, on-sale, in-stock — with live counts | S02 | In demo | Sawdagor | #/c/polos (route hint) |
| 47 | Sort control built as a real listbox, never a native select (a phone draws that at the bottom of the screen) | S02 | In demo | Sawdagor | #/c/polos (route hint) |
| 48 | Sticky filter bar that stays stuck, with the active filters visible while scrolling | S02 | In demo | Sawdagor | #/c/polos (route hint) |
| 49 | Product page template T1 — gallery left, buy column right | S02 | In demo | Sawdagor | #/p/essential-pique-polo (route hint) |
| 50 | Product page template T2 — stacked gallery | S02 | In demo | Sawdagor | #/p/essential-pique-polo (route hint) |
| 51 | Product page template T3 — fit-first | S02 | In demo | Sawdagor | #/p/essential-pique-polo (route hint) |
| 52 | Template assignment per product and per category, with a preview | S02 | In demo | Sawdagor | #/p/essential-pique-polo (route hint) |
| 53 | The first-screen budget — PDP_FIT and the measured sizing that guarantees the size row and the measurement line land above the buy bar on any… | S02 | In demo | Sawdagor | #/p/essential-pique-polo (route hint) |
| 54 | Gallery: arrows, thumbnail sync, hand swipe, pinch zoom kept working | S02 | In demo | Sawdagor | #/p/essential-pique-polo (route hint) |
| 55 | Colour swatches, colour name, "All N colours" sheet, and true-colour photograph | S02 | In demo | Sawdagor | #/p/essential-pique-polo (route hint) |
| 56 | Size pills that fill the width and stay on one line from S to 4XL | S02 | In demo | Sawdagor | #/p/essential-pique-polo (route hint) |
| 57 | Size chart popup — fixed, not scrolling with the page, with cm and inches inside it | S02 | In demo | Sawdagor | #/p/essential-pique-polo (route hint) |
| 58 | Find My Size — height and weight to a recommended size, with the reasoning shown | S02 | In demo | Sawdagor | #/p/essential-pique-polo (route hint) |
| 59 | Find My Size training engine — the chart data, the ease model, and the admin report | S02 | Filed | Sawdagor |  |
| 60 | Stock line, low-stock urgency chip, and sold-out-in-this-colour handling | S02 | In demo | Sawdagor | #/p/essential-pique-polo (route hint) |
| 61 | Price block: price, discount, saving, free-delivery badge, payment line, all four combinations | S02 | In demo | Sawdagor | #/p/essential-pique-polo (route hint) · V2.1 final · 20 Oct: currency sign and number never split (nowrap) |
| 62 | Trust row — exchange window, free delivery threshold, 100% original — reading live from Smart Rules | S02 | In demo | Sawdagor | #/p/essential-pique-polo (route hint) |
| 63 | Delivery / Exchange / Returns row, opening full width, one at a time | S02 | In demo | Sawdagor | #/p/essential-pique-polo (route hint) |
| 64 | Fabric & care, and the product detail accordions | S02 | In demo | Sawdagor | #/p/essential-pique-polo (route hint) |
| 65 | Product reviews on the page: up to three, photo reviews first, sliding | S02 | In demo | Sawdagor | #/p/essential-pique-polo (route hint) |
| 66 | Questions & answers block, with the WhatsApp ask | S02 | In demo | Sawdagor | #/p/essential-pique-polo (route hint) |
| 67 | "Goes well with" and "Recently viewed" rows, auto-sliding, category-driven | S02 | In demo | Sawdagor | #/p/essential-pique-polo (route hint) |
| 68 | The floating action rail — wishlist, share, WhatsApp — drifting with scroll, never over the title | S02 | In demo | Sawdagor | #/p/essential-pique-polo (route hint) |
| 69 | Share row: transparent floating tiles, Facebook, Messenger, WhatsApp, Instagram, copy link | S02 | In demo | Sawdagor | #/p/essential-pique-polo (route hint) |
| 70 | Site-wide floating WhatsApp button — replaced 19 Oct by the header icon; kept as a switch, off | S02 | Replaced → switch, off | Sawdagor | `02-core.js` (fab.whatsapp off) |
| 71 | Wishlist — add, remove, the wishlist page, and back-in-stock alerts | S02 | In demo | Sawdagor | #/account/wishlist (route hint) |
| 72 | Search: the panel, the index across products, categories and help articles, prefix and synonym matching, Bengali keywords · updated 19 Oct 23:33 (CN-001): search stays on Meilisearch | S02 | In demo | Sawdagor | #/search?q=polo (route hint) |
| 73 | Search results page with filters and sort | S02 | In demo | Sawdagor | #/search?q=polo (route hint) |
| 74 | Hamburger menu with sub-categories — accordion in place, counts per row, "View all" as the first child | S02 | In demo | Sawdagor | #/ (route hint) |
| 75 | Content pages: FAQ, delivery, exchange, privacy, terms, story, contact | S02 | In demo | Sawdagor | #/page/faq (route hint) |
| 76 | Page builder — sections, drag order, show/hide, per page | S02 | Filed | Sawdagor |  |
| 77 | Page builder coverage for every storefront page, not only the home page | S02 | Filed | Sawdagor |  |
| 78 | Label dictionary — every visible word editable by the owner, in both languages | S02 | Filed | Sawdagor |  |
| 79 | Front-end editing: open the page, change a label, publish | S02 | Filed | Sawdagor |  |
| 80 | Field-level show and hide — the eye-toggle system, with its defaults | S02 | Filed | Sawdagor |  |
| 81 | The eye-toggle dashboard: every switch in one list, searchable | S02 | Filed | Sawdagor |  |
| 82 | Four themes, with the token system behind them | S02 | In demo | Sawdagor | #/ (route hint) |
| 83 | A/B test module for the storefront | S02 | Filed | Sawdagor |  |
| 84 | Bengali and English throughout, with the language switch | S02 | In demo | Sawdagor | #/ (route hint) |
| 85 | Mobile hardening — 16px fields, no accidental zoom, 44px targets, no horizontal overflow, as CI gates | S02 | Filed | Sawdagor |  |
| 86 | The light-sweep system and its per-element switches | S02 | Filed | Sawdagor |  |
| 87 | Celebration overlay on order placement | S02 | Filed | Sawdagor |  |
| 88 | Storefront performance: image loading, code splitting, the Lighthouse budget · updated 19 Oct 23:33 (CN-001): image and page-weight targets | S02 | Filed | Sawdagor | V2.1 final · 20 Oct: demo `#/admin/images` (sample data) |
| 89 | Combo model: items, set price, savings, active window | S03 | In demo | Sawdagor | #/combo/polo-duo (route hint) |
| 90 | Combo admin — create, edit, activate, with live preview | S03 | In demo | Sawdagor | `90-admin-catalog.js` (#/admin/products) |
| 91 | Combo page template C1 | S03 | In demo | Sawdagor | #/combo/polo-duo (route hint) |
| 92 | Combo page template C2 — step by step | S03 | In demo | Sawdagor | #/combo/polo-duo (route hint) |
| 93 | Combo gallery with the per-item colour switcher | S03 | In demo | Sawdagor | #/combo/polo-duo (route hint) |
| 94 | Popular pairs — three across, one tap applies both colours | S03 | In demo | Sawdagor | #/combo/polo-duo (route hint) |
| 95 | Per-item size and colour selection with the "same as item 1" shortcut | S03 | In demo | Sawdagor | #/combo/polo-duo (route hint) |
| 96 | Set summary, set price, and the saving against buying separately | S03 | In demo | Sawdagor | #/combo/polo-duo (route hint) |
| 97 | Add set to bag as one line, with the set price locked | S03 | In demo | Sawdagor | #/combo/polo-duo (route hint) |
| 98 | Build your own set — pick any N, the tier price applies automatically | S03 | In demo | Sawdagor | #/set (route hint) · V2.1 final · 20 Oct: its tier rules feed the bag tier box (Take 2 │ 3 │ 4) |
| 99 | Set tier rules from Smart Rules: any 2 for X, any 3 for Y | S03 | In demo | Sawdagor | #/set (route hint) |
| 100 | The set builder: slots, pick from a sliding row, swap, remove | S03 | In demo | Sawdagor | #/set (route hint) |
| 101 | Set validation — what is still missing before it can be added | S03 | In demo | Sawdagor | #/set (route hint) |
| 102 | Combos on the product page: the matching set offer | S03 | In demo | Sawdagor | #/p/essential-pique-polo (route hint) |
| 103 | "More sets" row, and the sets landing page | S03 | In demo | Sawdagor | #/combos (route hint) |
| 104 | Combo analytics: which sets sell, which pairs get picked | S03 | Filed | Sawdagor |  |
| 105 | Cart model, line items, quantities, persistence across sessions | S04 | In demo | Sawdagor | #/bag (route hint) |
| 106 | Add-to-bag sheet: name, size, price, bag count, and what shows when delivery is not free | S04 | In demo | Sawdagor | #/bag (route hint) |
| 107 | Cart page: lines, images, quantity, remove, save for later | S04 | In demo | Sawdagor | #/bag (route hint) · V2.1 final · 20 Oct: owner bag review 43.3–43.9 built (title, words, line titles, duplicate-size box) |
| 108 | Set lines in the cart, with each piece linking to its own product page | S04 | In demo | Sawdagor | #/bag (route hint) |
| 109 | One offer slot | S04 | In demo | Sawdagor | #/bag (route hint) · V2.1 final · 20 Oct: tier box "Take 2 │ Take 3 │ Take 4", desktop only |
| 110 | The two-sizes-of-the-same-product notice, and the keep-or-change flow | S04 | In demo | Sawdagor | #/bag (route hint) |
| 111 | Order summary with product names, sizes and bold amounts | S04 | In demo | Sawdagor | #/bag (route hint) |
| 112 | Discount code entry, validation, and the better-offer explanation | S04 | In demo | Sawdagor | #/bag (route hint) |
| 113 | Free-delivery progress and what is still needed to reach it | S04 | In demo | Sawdagor | #/bag (route hint) |
| 114 | "Goes well with your bag" upsell row | S04 | In demo | Sawdagor | #/bag (route hint) |
| 115 | Checkout page shell, the steps header, and the mobile summary bar | S04 | In demo | Sawdagor | #/checkout (route hint) |
| 116 | Name, phone and address capture with inline validation | S04 | In demo | Sawdagor | #/checkout (route hint) |
| 117 | Dhaka address gazetteer — longest match across 140+ areas and 64 districts | S04 | In demo | Sawdagor | #/checkout (route hint) |
| 118 | Zone detection with the ask-don't-guess question when confidence is low | S04 | In demo | Sawdagor | #/checkout (route hint) |
| 119 | Delivery charge from the zone, shown before the customer types | S04 | In demo | Sawdagor | #/checkout (route hint) |
| 120 | Payment method selection: COD, bKash, Nagad, card | S04 | In demo | Sawdagor | #/checkout (route hint) |
| 121 | Quantity change and item removal at checkout, with the many-of-one-size guard | S04 | In demo | Sawdagor | #/checkout (route hint) |
| 122 | Wallet credit applied at checkout | S04 | In demo | Sawdagor | #/checkout (route hint) |
| 123 | Marketing opt-in, default on, with a clear way out | S04 | In demo | Sawdagor | #/checkout (route hint) |
| 124 | Confirm button states — what is missing, and that the next step confirms the order | S04 | In demo | Sawdagor | #/checkout (route hint) |
| 125 | Order placement, idempotency, and the failure path | S04 | Filed | Sawdagor |  |
| 126 | Thank-you page: order number, copy, track, payment due | S04 | Filed | Sawdagor |  |
| 127 | "Add to this parcel" — a real order line, visible everywhere the order is shown | S04 | Filed | Sawdagor |  |
| 128 | Complete-your-look block on the thank-you page | S04 | Filed | Sawdagor |  |
| 129 | Account auto-creation on first order, with the credentials shown once | S04 | In demo | Sawdagor | #/account (route hint) |
| 130 | Customer login, password change, and the SMS code on a new device | S04 | In demo | Sawdagor | #/account (route hint) |
| 131 | My account: orders, for you, rewards, wallet, wishlist, profile | S04 | In demo | Sawdagor | #/account (route hint) |
| 132 | Account offer banner — wallet balance or a standing member offer, never empty | S04 | In demo | Sawdagor | #/account (route hint) |
| 133 | Profile photo upload, cropped and stored client-side | S04 | Filed | Sawdagor |  |
| 134 | Order detail page with the full line list and the add-on items | S04 | Filed | Sawdagor |  |
| 135 | Order tracking page, the account welcome panel, and the tracking steps | S04 | In demo | Sawdagor | #/account/orders (route hint) |
| 136 | Invoice generation and download | S04 | Filed | Sawdagor |  |
| 137 | Draft capture and autofill — a started checkout is remembered | S04 | In demo | Sawdagor | #/checkout (route hint) |
| 138 | Order model, states, and the event timeline | S05 | In demo | Sawdagor | #/admin/orders (route hint) |
| 139 | Append-only audit log on every order change, with who and when | S05 | In demo | Sawdagor | #/admin/orders (route hint) |
| 140 | Admin order list: filters, search, bulk selection | S05 | In demo | Sawdagor | #/admin/orders (route hint) |
| 141 | Order detail for the admin, with the customer's history beside it | S05 | In demo | Sawdagor | #/admin/orders (route hint) |
| 142 | Admin-side order edit, recording the source of every change | S05 | In demo | Sawdagor | #/admin/orders (route hint) |
| 143 | Customer-side order edit until processing starts, capped | S05 | Filed | Sawdagor |  |
| 144 | Order cancellation, with reason codes | S05 | Filed | Sawdagor |  |
| 145 | Duplicate-order defence — four layers, from the submit guard to the review queue | S05 | In demo | Sawdagor | #/admin/orders (route hint) |
| 146 | Two-size follow-up: the customer ordered S and M, which do they want | S05 | Filed | Sawdagor |  |
| 147 | Notes and internal flags on an order | S05 | In demo | Sawdagor | #/admin/orders (route hint) |
| 148 | Order status notifications — SMS, WhatsApp, email — with the no-double-send guard | S05 | In demo | Sawdagor | `91-admin-crm.js` (#/admin/customers) |
| 149 | Notification log with retries | S05 | Filed | Sawdagor |  |
| 150 | Customer dashboard order history and lifecycle | S05 | Filed | Sawdagor |  |
| 151 | Order export | S05 | Filed | Sawdagor |  |
| 152 | Bulk status change with confirmation | S05 | Filed | Sawdagor |  |
| 153 | Hold and release, with the reason visible to support | S05 | Filed | Sawdagor |  |
| 154 | Order search by phone, name, order number and tracking number | S05 | Filed | Sawdagor |  |
| 155 | Order analytics: by day, by zone, by payment method | S05 | Filed | Sawdagor |  |
| 156 | Risk score model — the signals, their weights and the band thresholds, all set by the owner (answer 1) | S06 | Filed | Gyani |  |
| 157 | Phone history: past orders, refusals, returns on this number | S06 | Filed | Gyani |  |
| 158 | Address and zone checks against the gazetteer | S06 | Filed | Gyani |  |
| 159 | IP, device and GPS signals, with the 180-day deletion rule (answers 4 and 30) | S06 | Filed | Gyani |  |
| 160 | Risk panel on the order, showing why the score is what it is | S06 | Filed | Gyani |  |
| 161 | Actions per risk level — watch, hold, confirmation call, delivery charge in advance, full advance, COD off | S06 | Filed | Gyani |  |
| 162 | Blocklist with reasons and an undo | S06 | Filed | Gyani |  |
| 163 | Repeat-refuser handling, reversible by hand — COD off, delivery charge in advance, full advance, or nothing | S06 | Filed | Gyani |  |
| 164 | Fraud report: what was caught, what was wrong, and the cost avoided | S06 | Filed | Gyani |  |
| 165 | Payment model, states, and the reconciliation fields | S07 | Filed | Sawdagor |  |
| 166 | Cash on Delivery: amount due, rider collection, settlement | S07 | Filed | Sawdagor |  |
| 167 | bKash integration behind the adapter, with the mock | S07 | Filed | Sawdagor |  |
| 168 | Nagad integration behind the adapter, with the mock | S07 | Filed | Sawdagor |  |
| 169 | Card gateway integration behind the adapter, with the mock | S07 | Filed | Sawdagor |  |
| 170 | Payment callbacks with idempotency keys | S07 | Filed | Sawdagor |  |
| 171 | Wallet: credit, debit, balance, and the ledger behind it | S07 | Filed | Sawdagor |  |
| 172 | Refund to wallet, and the rules for when a refund is allowed | S07 | Filed | Sawdagor |  |
| 173 | Partial payment and advance for pre-orders, capped | S07 | Filed | Sawdagor |  |
| 174 | Payment reconciliation report against the gateway statements | S07 | Filed | Sawdagor |  |
| 175 | Courier adapter framework with the mock | S08 | In demo | Bhandari | `92-admin-couriers.js` (#/admin/couriers) |
| 176 | Steadfast integration — booking, consignment ID, status polling | S08 | In demo | Bhandari | `92-admin-couriers.js` (#/admin/couriers) |
| 177 | Second courier integration | S08 | In demo | Bhandari | `92-admin-couriers.js` (#/admin/couriers) |
| 178 | Courier selection by zone, weight and real cost | S08 | In demo | Bhandari | `92-admin-couriers.js` (#/admin/couriers) |
| 179 | Courier sticker — the one fulfilment document, custom size, barcode, COD amount, full item list | S08 | In demo | Bhandari | `92-admin-couriers.js` (#/admin/couriers) |
| 180 | Sticker print queue, reprint safety, and the handover sheet | S08 | In demo | Bhandari | `92-admin-couriers.js` (#/admin/couriers) |
| 181 | Daily consolidated picking list PDF | S08 | In demo | Bhandari | `92-admin-couriers.js` (#/admin/couriers) |
| 182 | Fulfilment page: pick, pack, hand over, all on one screen | S08 | In demo | Bhandari | `92-admin-couriers.js` (#/admin/couriers) |
| 183 | Defective or out-of-stock at packing: the resolution card and the hold | S08 | In demo | Bhandari | `92-admin-couriers.js` (#/admin/couriers) |
| 184 | Tracking status sync back to the order and the customer's tracking page | S08 | In demo | Bhandari | `92-admin-couriers.js` (#/admin/couriers) |
| 185 | Four-tier exchange engine | S08 | In demo | Bhandari | `92-admin-couriers.js` (#/admin/couriers) |
| 186 | Exchange request from the customer's account, within the window | S08 | In demo | Bhandari | `92-admin-couriers.js` (#/admin/couriers) |
| 187 | Exchange QC — good or damaged — then restock or write-off | S08 | In demo | Bhandari | `92-admin-couriers.js` (#/admin/couriers) |
| 188 | Exchange variant switcher: same product, different size | S08 | In demo | Bhandari | `92-admin-couriers.js` (#/admin/couriers) |
| 189 | Return handling, with the policy that there are no returns after receipt | S08 | In demo | Bhandari | `92-admin-couriers.js` (#/admin/couriers) |
| 190 | Delivery charge rules for exchanges, and who pays | S08 | In demo | Bhandari | `92-admin-couriers.js` (#/admin/couriers) |
| 191 | Refused-parcel handling and the exclusion list it feeds | S08 | In demo | Bhandari | `92-admin-couriers.js` (#/admin/couriers) |
| 192 | Courier performance report: on-time rate, refusal rate, by zone | S08 | In demo | Bhandari | `92-admin-couriers.js` (#/admin/couriers) |
| 193 | Holiday mode — cut-off dates, promised delivery windows, the storefront notice | S08 | In demo | Bhandari | `92-admin-couriers.js` (#/admin/couriers) |
| 194 | ERP sync adapter — authentication, retry, and the error surface | S09 | Filed | Bhandari |  |
| 195 | Stock pull from the ERP at SKU / colour / size level | S09 | Filed | Bhandari |  |
| 196 | companyId and warehouse mapping per store | S09 | Filed | Bhandari |  |
| 197 | Global reservation across all three stores | S09 | Filed | Bhandari |  |
| 198 | Reservation with row locking, and release on cart abandon | S09 | Filed | Bhandari |  |
| 199 | Order push to the ERP as a document, never as journal lines | S09 | Filed | Bhandari |  |
| 200 | Idempotency on every ERP push — no duplicate stock movement is possible | S09 | Filed | Bhandari |  |
| 201 | Inventory locations including the damaged bin | S09 | Filed | Bhandari |  |
| 202 | Low-stock alerts, per variant | S09 | Filed | Bhandari |  |
| 203 | Stock audit by barcode, with variance and reason | S09 | Filed | Bhandari |  |
| 204 | Product publishing queue driven by real ERP stock | S09 | Filed | Bhandari |  |
| 205 | Sync health panel: last run, what failed, what is queued | S09 | Filed | Bhandari |  |
| 206 | Manual re-sync and single-product re-sync | S09 | Filed | Bhandari |  |
| 207 | Stock movement report, reconciled against the ERP | S09 | Filed | Bhandari |  |
| 208 | Rules engine: conditions, actions, priority, active window | S10 | In demo | Gyani | #/admin/rules (route hint) |
| 209 | Rule admin with a live preview of what the customer will see | S10 | In demo | Gyani | #/admin/rules (route hint) |
| 210 | Delivery rules — charges, free-delivery threshold, zones | S10 | In demo | Gyani | #/admin/rules (route hint) |
| 211 | Exchange rules — window, who pays, what qualifies | S10 | In demo | Gyani | #/admin/rules (route hint) |
| 212 | Set and combo tier rules: any 2 for X, any 3 for Y | S10 | In demo | Gyani | #/admin/rules (route hint) |
| 213 | Discount and coupon rules, with the honesty guard on "was" prices | S10 | In demo | Gyani | #/admin/rules (route hint) |
| 214 | Festive and seasonal rules, with cut-off dates | S10 | In demo | Gyani | #/admin/rules (route hint) |
| 215 | Rule text everywhere reads from the rule | S10 | In demo | Gyani | #/admin/rules (route hint) |
| 216 | Notices and pop-up builder, with placement and timing | S10 | In demo | Gyani | #/admin/rules (route hint) |
| 217 | Rule conflict detection and the resolution order | S10 | Filed | Gyani |  |
| 218 | Rule history: what changed, when, and by whom | S10 | Filed | Gyani |  |
| 219 | Rule simulation: what would this order have cost under the new rule | S10 | Filed | Gyani |  |
| 220 | URL structure and canonical rules — English at /, Bengali at /bn/ behind the translation gate | S11 | In demo | Doot | `94-admin-blog.js` (#/admin/blog) |
| 221 | Title and meta description templates per page type, with AI drafting | S11 | In demo | Doot | `94-admin-blog.js` (#/admin/blog) |
| 222 | Structured data: Product, Offer, BreadcrumbList, Organization | S11 | In demo | Doot | `94-admin-blog.js` (#/admin/blog) |
| 223 | Review schema emitted only from real review rows | S11 | In demo | Doot | `94-admin-blog.js` (#/admin/blog) |
| 224 | FAQ content from the real questions on the page, for customers and AI answers | S11 | In demo | Doot | `94-admin-blog.js` (#/admin/blog) |
| 225 | Product page content architecture — server-rendered accordions that search engines can read | S11 | In demo | Doot | `94-admin-blog.js` (#/admin/blog) |
| 226 | Category SEO content block, per category | S11 | In demo | Doot | `94-admin-blog.js` (#/admin/blog) |
| 227 | Sub-category SEO content and the filter-page indexing rules — indexed only where it genuinely earns traffic, not every combination (answer 7) | S11 | In demo | Doot | `94-admin-blog.js` (#/admin/blog) |
| 228 | Sitemaps, split by type, with automatic regeneration | S11 | In demo | Doot | `94-admin-blog.js` (#/admin/blog) |
| 229 | robots.txt, and the switch for AI crawlers — GPTBot, ClaudeBot, PerplexityBot, Google-Extended | S11 | In demo | Doot | `94-admin-blog.js` (#/admin/blog) |
| 230 | Answer-engine pack — the content shape that gets quoted by AI assistants | S11 | In demo | Doot | `94-admin-blog.js` (#/admin/blog) |
| 231 | Internal linking engine: related products, related categories, related articles | S11 | In demo | Doot | `94-admin-blog.js` (#/admin/blog) |
| 232 | Image alt text, auto-applied; English live, Bengali held in the dictionary | S11 | In demo | Doot | `94-admin-blog.js` (#/admin/blog) |
| 233 | Search Console and Bing Webmaster connection, with the verification flow | S11 | In demo | Doot | `94-admin-blog.js` (#/admin/blog) |
| 234 | Core Web Vitals monitoring against the real field data · updated 19 Oct 23:33 (CN-001): monthly Dhaka 4G measurement | S11 | In demo | Doot | `94-admin-blog.js` (#/admin/blog) · V2.1 final · 20 Oct: demo `#/admin/speed` (sample data) |
| 235 | Redirect manager, and the 404 report with one-click fixes | S11 | In demo | Doot | `94-admin-blog.js` (#/admin/blog) |
| 236 | Hreflang and the language alternates | S11 | In demo | Doot | `94-admin-blog.js` (#/admin/blog) |
| 237 | SEO health dashboard: what is missing, page by page | S11 | In demo | Doot | `94-admin-blog.js` (#/admin/blog) |
| 238 | Organic performance report — traffic, position, and which AI assistants are citing the shop | S11 | In demo | Doot | `94-admin-blog.js` (#/admin/blog) |
| 239 | Article model, categories, authors, publish states | S12 | In demo | Doot | `73-blog.js` (#/journal) |
| 240 | Blog admin with the editor and the preview | S12 | In demo | Doot | `73-blog.js` (#/journal) |
| 241 | Blog listing and article pages, with the related-product block | S12 | In demo | Doot | `73-blog.js` (#/journal) |
| 242 | Topical cluster planner — which articles to write, and how they link | S12 | In demo | Doot | `73-blog.js` (#/journal) |
| 243 | AI article drafting from the PR 528 brief, in either language, per post (answer 11) | S12 | In demo | Doot | `73-blog.js` (#/journal) |
| 244 | Approval queue — the owner approves the topic list (monthly batch), not each post (updated 19 Oct) | S12 | In demo | Doot | `73-blog.js` (#/journal) |
| 245 | Article scheduling and the publish calendar | S12 | In demo | Doot | `73-blog.js` (#/journal) |
| 246 | Seasonal landing pages — Eid, winter, Puja — permanent and re-used each year | S12 | In demo | Doot | `73-blog.js` (#/journal) |
| 247 | Help articles as structured content: delivery, exchange, returns, payment | S12 | In demo | Doot | `73-blog.js` (#/journal) |
| 248 | Help articles indexed into search | S12 | In demo | Doot | `73-blog.js` (#/journal) |
| 249 | Article SEO: schema, meta, internal links | S12 | In demo | Doot | `73-blog.js` (#/journal) |
| 250 | Content performance report: which articles bring traffic and which bring orders | S12 | In demo | Doot | `73-blog.js` (#/journal) |
| 251 | Comment handling, or the decision to run without comments | S12 | In demo | Doot | `73-blog.js` (#/journal) |
| 252 | Content calendar shared with the social studio | S12 | In demo | Doot | `73-blog.js` (#/journal) |
| 253 | Article-to-product attribution: what an article actually sold | S12 | In demo | Doot | `73-blog.js` (#/journal) |
| 254 | Landing page builder — sections, templates, publish, per campaign | S13 | In demo | Doot, Tirondaj | #/l/polo-duo (route hint) |
| 255 | Landing page templates and the component library | S13 | In demo | Doot, Tirondaj | #/l/polo-duo (route hint) |
| 256 | Campaign model: audience, offer, creative, window, budget | S13 | In demo | Tirondaj, Doot | `93-admin-ads.js` (#/admin/ads) |
| 257 | Server-side event tracking — view, add to bag, checkout, purchase | S13 | In demo | Tirondaj, Doot | `93-admin-ads.js` (#/admin/ads) |
| 258 | Delivered-purchase optimisation — the event that matters is delivery, not order | S13 | In demo | Tirondaj, Doot | `93-admin-ads.js` (#/admin/ads) |
| 259 | Facebook and Instagram ads integration behind the adapter | S13 | In demo | Tirondaj, Doot | `93-admin-ads.js` (#/admin/ads) |
| 260 | TikTok ads integration behind the adapter | S13 | In demo | Tirondaj, Doot | `93-admin-ads.js` (#/admin/ads) |
| 261 | Google ads integration behind the adapter | S13 | In demo | Tirondaj, Doot | `93-admin-ads.js` (#/admin/ads) |
| 262 | Audience Builder — segments from real order behaviour | S13 | In demo | Tirondaj, Doot | `93-admin-ads.js` (#/admin/ads) |
| 263 | Value-based lookalike audiences from delivered revenue | S13 | In demo | Tirondaj, Doot | `93-admin-ads.js` (#/admin/ads) |
| 264 | Refused-parcel exclusion list | S13 | In demo | Tirondaj, Doot | `93-admin-ads.js` (#/admin/ads) |
| 265 | Ad spend import, per platform, per campaign | S13 | In demo | Tirondaj, Doot | `93-admin-ads.js` (#/admin/ads) |
| 266 | USD rate as a setting | S13 | In demo | Tirondaj, Doot | `93-admin-ads.js` (#/admin/ads) |
| 267 | Cost per order, cost per delivered order, and alert thresholds the owner sets from the dashboard (answer 19) | S13 | In demo | Tirondaj, Doot | `93-admin-ads.js` (#/admin/ads) |
| 268 | Pause and budget change from the dashboard, with a confirm step — extended by PR 531 to full campaign control | S13 | In demo | Tirondaj, Doot | `93-admin-ads.js` (#/admin/ads) |
| 269 | AI growth agent — reads performance, proposes changes, waits for approval | S13 | In demo | Tirondaj, Doot | `93-admin-ads.js` (#/admin/ads) |
| 270 | Ad creative briefs generated from the product and the campaign | S13 | In demo | Tirondaj, Doot | `93-admin-ads.js` (#/admin/ads) |
| 271 | Coupon engine, fully dynamic — percentage, fixed taka, free delivery, buy-one-get-one, buy-two-get-five, and offer shapes invented later without… | S13 | Filed | Doot, Tirondaj |  |
| 272 | Coupon distribution, limits, and per-customer caps | S13 | Filed | Doot, Tirondaj |  |
| 273 | Referral programme | S13 | Filed | Doot, Tirondaj |  |
| 274 | Incomplete-order capture — the details typed before the order was placed | S13 | Filed | Doot, Tirondaj |  |
| 275 | Incomplete-order follow-up, capped at two messages | S13 | Filed | Doot, Tirondaj |  |
| 276 | Abandoned-cart recovery with the offer rules | S13 | Filed | Doot, Tirondaj |  |
| 277 | Campaign blast — SMS, WhatsApp, email — with the audience and the throttle | S13 | Filed | Doot, Tirondaj |  |
| 278 | YouTube module — channel, videos, and the attribution back to orders | S13 | In demo | Tirondaj, Doot | `93-admin-ads.js` (#/admin/ads) |
| 279 | SEO outreach pipeline | S13 | Filed | Doot, Tirondaj |  |
| 280 | Seasonal homepage switching, scheduled | S13 | Filed | Doot, Tirondaj |  |
| 281 | Festive cut-off banners and the delivery promise | S13 | Filed | Doot, Tirondaj |  |
| 282 | Marketing calendar across ads, content and social | S13 | Filed | Doot, Tirondaj |  |
| 283 | Marketing report: spend, revenue, by channel, by campaign | S13 | In demo | Tirondaj, Doot | `93-admin-ads.js` (#/admin/ads) |
| 284 | Customer model, merge rules, and the single view by phone number | S14 | In demo | Doot | `91-admin-crm.js` (#/admin/customers) |
| 285 | Customers section: list, filters, search | S14 | In demo | Doot | `91-admin-crm.js` (#/admin/customers) |
| 286 | Customer detail — orders, exchanges, support history, lifetime value | S14 | In demo | Doot | `91-admin-crm.js` (#/admin/customers) |
| 287 | Segments from real behaviour, saved and reusable | S14 | In demo | Doot | `91-admin-crm.js` (#/admin/customers) |
| 288 | Customer journey view: every touch, in order | S14 | In demo | Doot | `91-admin-crm.js` (#/admin/customers) |
| 289 | Journey builder — triggers, waits, conditions, messages | S14 | In demo | Doot | `91-admin-crm.js` (#/admin/customers) |
| 290 | Email marketing: templates, sends, and the delivery log | S14 | In demo | Doot | `91-admin-crm.js` (#/admin/customers) |
| 291 | SMS adapter with masking approval, templates, delivery log | S14 | In demo | Doot | `91-admin-crm.js` (#/admin/customers) |
| 292 | WhatsApp Business API adapter, templates, delivery log | S14 | In demo | Doot | `91-admin-crm.js` (#/admin/customers) |
| 293 | AI campaign writer — the message drafted in the owner's voice | S14 | In demo | Doot | `91-admin-crm.js` (#/admin/customers) |
| 294 | AI segment and timing suggestions, with the reasoning shown | S14 | In demo | Doot | `91-admin-crm.js` (#/admin/customers) |
| 295 | Review requests after delivery, and the review manager behind them | S14 | In demo | Doot | `91-admin-crm.js` (#/admin/customers) |
| 296 | Rewards and points, with the rules the owner sets | S14 | In demo | Doot | `91-admin-crm.js` (#/admin/customers) |
| 297 | Customer tags and internal notes | S14 | In demo | Doot | `91-admin-crm.js` (#/admin/customers) |
| 298 | Consent and opt-out handling, honoured across every channel | S14 | In demo | Doot | `91-admin-crm.js` (#/admin/customers) |
| 299 | Customer export, with the retention rule applied | S14 | In demo | Doot | `91-admin-crm.js` (#/admin/customers) |
| 300 | Win-back campaigns for customers who have stopped ordering | S14 | In demo | Doot | `91-admin-crm.js` (#/admin/customers) |
| 301 | Birthday field capture, ready for the parked birthday module | S14 | In demo | Doot | `91-admin-crm.js` (#/admin/customers) |
| 302 | Customer data retention: customers are never auto-deleted (answer 50) | S14 | In demo | Doot | `91-admin-crm.js` (#/admin/customers) |
| 303 | CRM report: new, returning, churned, by segment | S14 | In demo | Doot | `91-admin-crm.js` (#/admin/customers) |
| 304 | AI 360 home screen — what is running, what it cost, what it decided | S15 | In demo | Gyani | #/admin/ai (route hint) |
| 305 | Master switch | S15 | In demo | Gyani | #/admin/ai (route hint) |
| 306 | Multi-provider adapter: Anthropic, OpenAI, Google, OpenRouter, all dynamic | S15 | In demo | Gyani | #/admin/ai (route hint) |
| 307 | Per-agent model selection, with the recommendation note beside each | S15 | In demo | Gyani | #/admin/ai (route hint) |
| 308 | Per-agent schedule | S15 | In demo | Gyani | #/admin/ai (route hint) |
| 309 | Per-agent monthly spend cap | S15 | In demo | Gyani | `89b-admin-agents.js` (#/admin/ai?tab=models) |
| 310 | Data-class routing — which class of data may reach which class of model | S15 | In demo | Gyani | `89b-admin-agents.js` (#/admin/ai?tab=models) |
| 311 | The masking layer applied before anything leaves the server | S15 | Filed | Gyani |  |
| 312 | AI Cost Book — 60–90 job rows, searchable, with the model selector in the row | S15 | In demo | Gyani | `89b-admin-agents.js` (#/admin/ai?tab=models) |
| 313 | Estimate versus actual, and the self-correction that follows | S15 | In demo | Gyani | `89b-admin-agents.js` (#/admin/ai?tab=models) |
| 314 | What-if slider, and the Economy / Balanced / Premium presets | S15 | In demo | Gyani | `89b-admin-agents.js` (#/admin/ai?tab=models) |
| 315 | One shared usage ledger behind every figure | S15 | Filed | Gyani |  |
| 316 | Free-form cost calculator | S15 | Filed | Gyani |  |
| 317 | The single approval queue — everything waiting on the owner, in one place | S15 | In demo | Gyani | #/admin/ai (route hint) |
| 318 | Permission matrix: what each agent may decide alone | S15 | In demo | Gyani | #/admin/ai (route hint) |
| 319 | AI diary — what each agent did, why, and what it changed | S15 | In demo | Gyani | #/admin/ai (route hint) |
| 320 | Bug box: the agent reports what it could not do | S15 | In demo | Gyani | #/admin/ai (route hint) |
| 321 | Skill library — import a skill, version it, roll it back | S15 | Filed | Gyani |  |
| 322 | Skill sandbox: try a skill on real data without touching production | S15 | Filed | Gyani |  |
| 323 | Continuous skill training — corrections become training examples | S15 | Filed | Gyani |  |
| 324 | AI-off fallback: every agent has a rule or template path that works without AI | S15 | Filed | Gyani |  |
| 325 | Support AI agent wiring | S15 | Filed | Gyani |  |
| 326 | Product content AI agent | S15 | Filed | Gyani |  |
| 327 | SEO and meta AI agent | S15 | Filed | Gyani |  |
| 328 | Size advice AI agent | S15 | Filed | Gyani |  |
| 329 | Fraud review AI agent | S15 | Filed | Gyani |  |
| 330 | Growth marketing AI agent | S15 | Filed | Gyani |  |
| 331 | Social content AI agent | S15 | Filed | Gyani |  |
| 332 | Photoshoot studio AI orchestration | S15 | Filed | Gyani |  |
| 333 | Analytics commentary agent — explains the numbers, never invents one | S15 | Filed | Gyani |  |
| 334 | System Q&A agent — the owner asks the system how it works | S15 | Filed | Gyani |  |
| 335 | Competitor Teardown agent — journey walker | S15 | Filed | Gyani |  |
| 336 | Competitor comparison and report engine | S15 | Filed | Gyani |  |
| 337 | Saved competitors, scheduling, and change alerts | S15 | Filed | Gyani |  |
| 338 | Site-wide analytics event layer | S15 | In demo | Gyani | #/admin/analytics (route hint) |
| 339 | Per-page funnels built on that layer | S15 | In demo | Gyani | #/admin/analytics (route hint) |
| 340 | The report section: what happened, what changed, what to do | S15 | Filed | Gyani |  |
| 341 | Weekly and monthly digests to Telegram and email | S15 | Filed | Gyani |  |
| 342 | Finance, costs & reports — stage scope item, not itemised in the register (see B3.8–B3.10) *(derived)* | S16 | Filed | Gyani |  |
| 343 | Finance, costs & reports — stage scope item, not itemised in the register (see B3.8–B3.10) *(derived)* | S16 | Filed | Gyani |  |
| 344 | Finance, costs & reports — stage scope item, not itemised in the register (see B3.8–B3.10) *(derived)* | S16 | Filed | Gyani |  |
| 345 | Finance, costs & reports — stage scope item, not itemised in the register (see B3.8–B3.10) *(derived)* | S16 | Filed | Gyani |  |
| 346 | Finance, costs & reports — stage scope item, not itemised in the register (see B3.8–B3.10) *(derived)* | S16 | Filed | Gyani |  |
| 347 | Finance, costs & reports — stage scope item, not itemised in the register (see B3.8–B3.10) *(derived)* | S16 | Filed | Gyani |  |
| 348 | Finance, costs & reports — stage scope item, not itemised in the register (see B3.8–B3.10) *(derived)* | S16 | Filed | Gyani |  |
| 349 | Finance, costs & reports — stage scope item, not itemised in the register (see B3.8–B3.10) *(derived)* | S16 | Filed | Gyani |  |
| 350 | Finance, costs & reports — stage scope item, not itemised in the register (see B3.8–B3.10) *(derived)* | S16 | Filed | Gyani |  |
| 351 | Finance, costs & reports — stage scope item, not itemised in the register (see B3.8–B3.10) *(derived)* | S16 | Filed | Gyani |  |
| 352 | Finance, costs & reports — stage scope item, not itemised in the register (see B3.8–B3.10) *(derived)* | S16 | Filed | Gyani |  |
| 353 | Finance, costs & reports — stage scope item, not itemised in the register (see B3.8–B3.10) *(derived)* | S16 | Filed | Gyani |  |
| 354 | Finance, costs & reports — stage scope item, not itemised in the register (see B3.8–B3.10) *(derived)* | S16 | Filed | Gyani |  |
| 355 | Finance, costs & reports — stage scope item, not itemised in the register (see B3.8–B3.10) *(derived)* | S16 | Filed | Gyani |  |
| 356 | Store entity and query scoping (V1 A4.10) *(derived)* | S17 | Filed | Prohori |  |
| 357 | Store switcher (V1 A4.10) *(derived)* | S17 | Filed | Prohori |  |
| 358 | Shared vs separate settings (V1 A4.10) *(derived)* | S17 | Filed | Prohori |  |
| 359 | Combined all-stores view (V1 A4.10) *(derived)* | S17 | Filed | Prohori |  |
| 360 | Isolation tests (V1 A4.10) *(derived)* | S17 | Filed | Prohori |  |
| 361 | Per-store brand, theme, templates and page layouts (V1 A4.10) *(derived)* | S17 | Filed | Prohori |  |
| 362 | Per-store domain, certificate and Cloudflare routing (V1 A4.10) *(derived)* · updated 19 Oct 23:33 (CN-001): Cloudflare for the three domains, cache and purge rules | S17 | Filed | Prohori |  |
| 363 | Per-store ERP mapping to companyId and warehouse (V1 A4.10) *(derived)* | S17 | Filed | Prohori |  |
| 364 | Per-store product listing and stock visibility (V1 A4.10) *(derived)* | S17 | Filed | Prohori |  |
| 365 | Per-store payment, courier and SMS accounts (V1 A4.10) *(derived)* | S17 | Filed | Prohori |  |
| 366 | Per-store WhatsApp, Facebook and support-inbox routing (V1 A4.10) *(derived)* | S17 | Filed | Prohori |  |
| 367 | Per-store ad accounts, attribution and campaign separation (V1 A4.10) *(derived)* | S17 | Filed | Prohori |  |
| 368 | Per-store SEO with cross-store duplicate-content detection (V1 A4.10) *(derived)* | S17 | Filed | Prohori |  |
| 369 | Per-store AI 360 scoping, switches and cost attribution (V1 A4.10) *(derived)* | S17 | Filed | Prohori |  |
| 370 | Theme engine with template sets, component variants and typography packs (V1 A4.10) *(derived)* | S17 | Filed | Prohori |  |
| 371 | Store #2 complete theme build (V1 A4.10) *(derived)* | S17 | Filed | Prohori |  |
| 372 | Store #3 complete theme build (V1 A4.10) *(derived)* | S17 | Filed | Prohori |  |
| 373 | Per-store Studio identity (model roster, scene style, photo grade) (V1 A4.10) *(derived)* | S17 | Filed | Prohori |  |
| 374 | Per-store AI copy voice and brand tone profile (V1 A4.10) *(derived)* | S17 | Filed | Prohori |  |
| 375 | Cross-store sameness guard for look, copy and SEO (V1 A4.10) *(derived)* | S17 | Filed | Prohori |  |
| 376 | "Add store" wizard with domain connection, Cloudflare and certificate automation (V1 A4.10) *(derived)* | S17 | Filed | Prohori |  |
| 377 | S17 item added in UI/UX round 1 (§41.24) — not itemised (V1 A4.10) *(derived)* | S17 | Filed | Prohori |  |
| 378 | Compliance, security, manual — stage scope item, not itemised in the register (see B6, B7.5) *(derived)* | S18 | Filed | Prohori |  |
| 379 | Compliance, security, manual — stage scope item, not itemised in the register (see B6, B7.5) *(derived)* | S18 | Filed | Prohori |  |
| 380 | Compliance, security, manual — stage scope item, not itemised in the register (see B6, B7.5) *(derived)* | S18 | Filed | Prohori |  |
| 381 | Compliance, security, manual — stage scope item, not itemised in the register (see B6, B7.5) *(derived)* | S18 | Filed | Prohori |  |
| 382 | Compliance, security, manual — stage scope item, not itemised in the register (see B6, B7.5) *(derived)* | S18 | Filed | Prohori |  |
| 383 | Compliance, security, manual — stage scope item, not itemised in the register (see B6, B7.5) *(derived)* | S18 | Filed | Prohori |  |
| 384 | Compliance, security, manual — stage scope item, not itemised in the register (see B6, B7.5) *(derived)* | S18 | Filed | Prohori |  |
| 385 | Compliance, security, manual — stage scope item, not itemised in the register (see B6, B7.5) *(derived)* | S18 | Filed | Prohori |  |
| 386 | Compliance, security, manual — stage scope item, not itemised in the register (see B6, B7.5) *(derived)* | S18 | Filed | Prohori |  |
| 387 | Compliance, security, manual — stage scope item, not itemised in the register (see B6, B7.5) *(derived)* | S18 | Filed | Prohori |  |
| 388 | Compliance, security, manual — stage scope item, not itemised in the register (see B6, B7.5) *(derived)* | S18 | Filed | Prohori |  |
| 389 | Compliance, security, manual — stage scope item, not itemised in the register (see B6, B7.5) *(derived)* | S18 | Filed | Prohori |  |
| 390 | Compliance, security, manual — stage scope item, not itemised in the register (see B6, B7.5) *(derived)* | S18 | Filed | Prohori |  |
| 391 | Deploy, backup, go-live — stage scope item, not itemised in the register (see A1.5, A2) *(derived)* | S19 | Filed | Prohori |  |
| 392 | Deploy, backup, go-live — stage scope item, not itemised in the register (see A1.5, A2) *(derived)* | S19 | Filed | Prohori |  |
| 393 | Deploy, backup, go-live — stage scope item, not itemised in the register (see A1.5, A2) *(derived)* | S19 | Filed | Prohori |  |
| 394 | Deploy, backup, go-live — stage scope item, not itemised in the register (see A1.5, A2) *(derived)* | S19 | Filed | Prohori |  |
| 395 | Google Drive backup and restore drills (named in Prohori skill 04) *(derived)* · updated 19 Oct 23:33 (CN-001): monthly automatic restore test, Blob + Drive | S19 | In demo | Prohori | `89-admin-system.js` (#/admin/backup) · V2.1 final · 20 Oct: demo `#/admin/backup` shows Blob + Drive (sample data) |
| 396 | Restoring production: typed confirmation, staging first (named in Prohori skill 04) *(derived)* | S19 | In demo | Prohori | `89-admin-system.js` (#/admin/backup) |
| 397 | Deploy, backup, go-live — stage scope item, not itemised in the register (see A1.5, A2) *(derived)* | S19 | Filed | Prohori |  |
| 398 | Deploy, backup, go-live — stage scope item, not itemised in the register (see A1.5, A2) *(derived)* | S19 | Filed | Prohori |  |
| 399 | Deploy, backup, go-live — stage scope item, not itemised in the register (see A1.5, A2) *(derived)* | S19 | Filed | Prohori |  |
| 400 | Deploy, backup, go-live — stage scope item, not itemised in the register (see A1.5, A2) *(derived)* | S19 | Filed | Prohori |  |
| 401 | Deploy, backup, go-live — stage scope item, not itemised in the register (see A1.5, A2) *(derived)* | S19 | Filed | Prohori |  |
| 402 | Deploy, backup, go-live — stage scope item, not itemised in the register (see A1.5, A2) *(derived)* | S19 | Filed | Prohori |  |
| 403 | Deploy, backup, go-live — stage scope item, not itemised in the register (see A1.5, A2) *(derived)* | S19 | Filed | Prohori |  |
| 404 | Fulfilment & documents — stage scope item, not itemised in the register (see B1.3–B2.4) *(derived)* | S20 | Filed | Bhandari |  |
| 405 | Fulfilment & documents — stage scope item, not itemised in the register (see B1.3–B2.4) *(derived)* | S20 | Filed | Bhandari |  |
| 406 | Fulfilment & documents — stage scope item, not itemised in the register (see B1.3–B2.4) *(derived)* | S20 | Filed | Bhandari |  |
| 407 | Customer invoice (named in the register round-15 scope) *(derived)* | S20 | Filed | Bhandari |  |
| 408 | Fulfilment & documents — stage scope item, not itemised in the register (see B1.3–B2.4) *(derived)* | S20 | Filed | Bhandari |  |
| 409 | Invoice template editor — every word and block editable (named in Bhandari's files) *(derived)* | S20 | Filed | Bhandari |  |
| 410 | Fulfilment & documents — stage scope item, not itemised in the register (see B1.3–B2.4) *(derived)* | S20 | Filed | Bhandari |  |
| 411 | Fulfilment & documents — stage scope item, not itemised in the register (see B1.3–B2.4) *(derived)* | S20 | Filed | Bhandari |  |
| 412 | Fulfilment & documents — stage scope item, not itemised in the register (see B1.3–B2.4) *(derived)* | S20 | Filed | Bhandari |  |
| 413 | Site Health & Audit — stage scope item, not itemised in the register (see B7.3, B9) *(derived)* | S21 | Filed | Prohori |  |
| 414 | Site Health & Audit — stage scope item, not itemised in the register (see B7.3, B9) *(derived)* | S21 | Filed | Prohori |  |
| 415 | Site Health & Audit — stage scope item, not itemised in the register (see B7.3, B9) *(derived)* | S21 | Filed | Prohori |  |
| 416 | Site Health & Audit — stage scope item, not itemised in the register (see B7.3, B9) *(derived)* | S21 | Filed | Prohori |  |
| 417 | Site Health & Audit — stage scope item, not itemised in the register (see B7.3, B9) *(derived)* | S21 | Filed | Prohori |  |
| 418 | Site Health & Audit — stage scope item, not itemised in the register (see B7.3, B9) *(derived)* | S21 | Filed | Prohori |  |
| 419 | Site Health & Audit — stage scope item, not itemised in the register (see B7.3, B9) *(derived)* | S21 | Filed | Prohori |  |
| 420 | Approval gate for agent auto-fixes and new skills (named in the agent protocol) *(derived)* | S21 | In demo | Prohori | `89-admin-system.js` (#/admin/audit) |
| 421 | Site Health & Audit — stage scope item, not itemised in the register (see B7.3, B9) *(derived)* | S21 | Filed | Prohori |  |
| 422 | Site Health & Audit — stage scope item, not itemised in the register (see B7.3, B9) *(derived)* | S21 | Filed | Prohori |  |
| 423 | Site health page with spike alerts (named in Prohori skill 08) *(derived)* · updated 19 Oct 23:33 (CN-001): the plain-language Server page | S21 | In demo | Prohori | `89-admin-system.js` (#/admin/health) · V2.1 final · 20 Oct: demo `#/admin/server` (sample data) |
| 424 | Site Health & Audit — stage scope item, not itemised in the register (see B7.3, B9) *(derived)* | S21 | Filed | Prohori |  |
| 425 | Support core: conversation/message model, threads, attachments, internal notes, assignment, who-replied log (V1 B4.14 item 1) *(derived)* | S22 | Filed | Gyani |  |
| 426 | Channel connectors: Messenger Page API, WhatsApp Business API webhook in and out, website live-chat widget (V1 B4.14 item 2) *(derived)* | S22 | Filed | Gyani |  |
| 427 | Identity resolution: phone ↔ PSID ↔ customer matching, merge one person across channels (V1 B4.14 item 3) *(derived)* | S22 | Filed | Gyani |  |
| 428 | Customer context panel: order count, delivered/returned ratio, fraud score, live order status (V1 B4.14 item 4) *(derived)* | S22 | Filed | Gyani |  |
| 429 | Catalogue drawer: search, send photos, send tracked product link (V1 B4.14 item 5) *(derived)* | S22 | Filed | Gyani |  |
| 430 | Mini-cart and one-click order creation with channel tag, stock check and fraud gate (V1 B4.14 item 6) *(derived)* | S22 | Filed | Gyani |  |
| 431 | Ticketing: status, owner, SLA timers, resolution time, notifications (V1 B4.14 item 7) *(derived)* | S22 | Filed | Gyani |  |
| 432 | AI support agent: answers from Smart Rules, the manual and order data; drafts; handover rules (V1 B4.14 item 8) *(derived)* | S22 | Filed | Gyani |  |
| 433 | AI follow-up and conversion: no-order follow-up, offers, win-back, rule-capped (V1 B4.14 item 9) *(derived)* | S22 | Filed | Gyani |  |
| 434 | Block list, employee permissions, customer data privacy inside support (V1 B4.14 item 10) *(derived)* | S22 | Filed | Gyani |  |
| 435 | Support PWA: installable, support-only shell, push notifications (V1 B4.14 item 11) *(derived)* | S22 | Filed | Gyani |  |
| 436 | Support analytics: per employee, per channel, chat → order, first-response and resolution time (V1 B4.14 item 12) *(derived)* | S22 | Filed | Gyani |  |
| 437 | Studio core — brand asset library, templates, rules (part 1) (V1 C5.5) *(derived)* | S23 | Filed | Doot |  |
| 438 | Studio core — brand asset library, templates, rules (part 2) (V1 C5.5) *(derived)* | S23 | Filed | Doot |  |
| 439 | Video assembly engine — reels, shorts, image posts (V1 C5.5) *(derived)* | S23 | Filed | Doot |  |
| 440 | Publishing adapters — Facebook Page, Instagram feed/reel/story (part 1) (V1 C5.5) *(derived)* | S23 | Filed | Doot |  |
| 441 | Publishing adapters — TikTok draft + direct, YouTube (part 2) (V1 C5.5) *(derived)* | S23 | Filed | Doot |  |
| 442 | Content calendar, approval queue, auto-schedule rules, per-platform limits (V1 C5.5) *(derived)* | S23 | Filed | Doot |  |
| 443 | Comment and DM ingestion from Facebook, Instagram and TikTok into the Support Inbox (V1 C5.5) *(derived)* | S23 | Filed | Doot |  |
| 444 | Asset model, role taxonomy, immutable originals, generated kept separate (V1 C7.22 item 1) *(derived)* | S24 | Filed | Gyani |  |
| 445 | Model library with consent records (V1 C7.22 item 2) *(derived)* | S24 | Filed | Gyani |  |
| 446 | Ghost-mannequin engine (V1 C7.22 item 3) *(derived)* | S24 | Filed | Gyani |  |
| 447 | Garment prep and standardisation (cut-out, colour, canvas) (V1 C7.22 item 4) *(derived)* | S24 | Filed | Gyani |  |
| 448 | Reference analysis and recommendation (V1 C7.22 item 5) *(derived)* | S24 | Filed | Gyani |  |
| 449 | Provider adapter (FASHN + one other) — part 1 (V1 C7.22 item 6) *(derived)* | S24 | Filed | Gyani |  |
| 450 | Provider adapter — part 2 (estimate, generate, status, fetch) (V1 C7.22 item 7) *(derived)* | S24 | Filed | Gyani |  |
| 451 | Job orchestration: queue, state machine, idempotency — part 1 (V1 C7.22 item 8) *(derived)* | S24 | Filed | Gyani |  |
| 452 | Job orchestration: per-view retry, concurrency, spend caps — part 2 (V1 C7.22 item 9) *(derived)* | S24 | Filed | Gyani |  |
| 453 | Best-of-2 plus automatic scoring (V1 C7.22 item 10) *(derived)* | S24 | Filed | Gyani |  |
| 454 | Detail re-projection for logos and prints (V1 C7.22 item 11) *(derived)* | S24 | Filed | Gyani |  |
| 455 | Finishing pass (upscale, artifact repair) — part 1 (V1 C7.22 item 12) *(derived)* | S24 | Filed | Gyani |  |
| 456 | Finishing pass (contact shadow, grade, sharpen) — part 2 (V1 C7.22 item 13) *(derived)* | S24 | Filed | Gyani |  |
| 457 | In-admin image editor (V1 C7.22 item 14) *(derived)* | S24 | Filed | Gyani |  |
| 458 | Review and approval UI with side-by-side and reasons (V1 C7.22 item 15) *(derived)* | S24 | Filed | Gyani |  |
| 459 | Cost ledger, estimates, caps, reuse rules (V1 C7.22 item 16) *(derived)* | S24 | Filed | Gyani |  |
| 460 | Recommendation-note system (V1 C7.22 item 17) *(derived)* | S24 | Filed | Gyani |  |
| 461 | Front-end gallery, angle switcher, zoom, disclosure line (V1 C7.22 item 18) *(derived)* | S24 | Filed | Gyani |  |
| 462 | Pilot harness and metrics (cost per approved image, first-pass rate) plus live A/B (V1 C7.22 item 19) *(derived)* | S24 | Filed | Gyani |  |
| 463 | Detail finder — part 1 (V1 C7.22 item 20) *(derived)* | S24 | Filed | Gyani |  |
| 464 | Detail finder — part 2 (V1 C7.22 item 21) *(derived)* | S24 | Filed | Gyani |  |
| 465 | Footwear / product-only studio — part 1 (V1 C7.22 item 22) *(derived)* | S24 | Filed | Gyani |  |
| 466 | Footwear / product-only studio — part 2 (V1 C7.22 item 23) *(derived)* | S24 | Filed | Gyani |  |
| 467 | Download-watermark pipeline (V1 C7.22 item 24) *(derived)* | S24 | Filed | Gyani |  |
| 468 | AI 360 wiring and Cost Book rows for every photoshoot sub-job (V1 C7.22 item 25) *(derived)* | S24 | Filed | Gyani |  |
| 469 | Category recipe framework with the 13 recipes — part 1 (V1 C7.22 item 26) *(derived)* | S24 | Filed | Gyani |  |
| 470 | Category recipe framework — part 2 (V1 C7.22 item 27) *(derived)* | S24 | Filed | Gyani |  |
| 471 | Worn-accessory engine (caps, sunglasses, watches, carried bags) — part 1 (V1 C7.22 item 28) *(derived)* | S24 | Filed | Gyani |  |
| 472 | Worn-accessory engine — part 2 (V1 C7.22 item 29) *(derived)* | S24 | Filed | Gyani |  |
| 473 | Reflective and transparent product handling (V1 C7.22 item 30) *(derived)* | S24 | Filed | Gyani |  |
| 474 | Ladies, kids and part-model libraries with styling guidelines (V1 C7.22 item 31) *(derived)* | S24 | Filed | Gyani |  |
| 475 | Combo and gift-set composition studio (V1 C7.22 item 32) *(derived)* | S24 | Filed | Gyani |  |
| 476 | Scene library (V1 C7.22 item 33) *(derived)* | S24 | Filed | Gyani |  |
| 477 | Set product type and two-garment try-on — part 1 (V1 C7.22 item 34) *(derived)* | S24 | Filed | Gyani |  |
| 478 | Set product type and two-garment try-on — part 2 (V1 C7.22 item 35) *(derived)* | S24 | Filed | Gyani |  |
| 479 | Unisex / couple composition (V1 C7.22 item 36) *(derived)* | S24 | Filed | Gyani |  |
| 480 | Occasion scene suggester with previews and approval (V1 C7.22 item 37) *(derived)* | S24 | Filed | Gyani |  |
| 481 | Action / motion library (V1 C8.6 item 1) *(derived)* | S25 | Filed | Gyani |  |
| 482 | Image-to-video engine with provider adapter and best-of-2 — part 1 (V1 C8.6 item 2) *(derived)* | S25 | Filed | Gyani |  |
| 483 | Image-to-video engine — part 2 (V1 C8.6 item 3) *(derived)* | S25 | Filed | Gyani |  |
| 484 | Image-to-video engine — part 3 (V1 C8.6 item 4) *(derived)* | S25 | Filed | Gyani |  |
| 485 | Reel assembly with music, text, logo and aspect variants — part 1 (V1 C8.6 item 5) *(derived)* | S25 | Filed | Gyani |  |
| 486 | Reel assembly — part 2 (V1 C8.6 item 6) *(derived)* | S25 | Filed | Gyani |  |
| 487 | Campaign creative export — part 1 (V1 C8.6 item 7) *(derived)* | S25 | Filed | Gyani |  |
| 488 | Campaign creative export — part 2 (V1 C8.6 item 8) *(derived)* | S25 | Filed | Gyani |  |
| 489 | Campaign overlay system — page-level and time-bound (V1 C8.6 item 9) *(derived)* | S25 | Filed | Gyani |  |
| 490 | Campaign creative brief and three-direction grooming flow (V1 C8.6 item 10) *(derived)* | S25 | Filed | Gyani |  |
| 491 | Settings framework — a typed registry, held in the database, cached, every value readable and writable from the admin | S00 | In demo | Prohori | `89-admin-system.js` (#/admin/settings) |
| 492 | Two-tier resolver — installation level → store level, with inheritance | S00 | In demo | Prohori | `89-admin-system.js` (#/admin/settings) |
| 493 | Credential vault — every key encrypted at rest, entered from the admin, never in the repository or in Git | S00 | Filed | Prohori | V2.1 final · 20 Oct: demo `#/admin/integrations` "Keys & connections" |
| 494 | Hardcode guard in CI — the build fails on a hardcoded key, name, number or policy string | S00 | Filed | Prohori |  |
| 495 | Role builder — the admin creates roles and permissions | S00 | Filed | Prohori |  |
| 496 | Settings migration — when a new setting ships, every existing installation receives it with its default | S00 | Filed | Prohori |  |
| 497 | ERP mode switch — EXTAS ERP · another ERP · no ERP | S09 | Filed | Bhandari |  |
| 498 | Generic ERP adapter interface — one contract with mock, sandbox and live modes, so a second ERP is a new adapter and not a rewrite | S09 | Filed | Bhandari |  |
| 499 | ERP-absent guard — every path that depends on the ERP has a defined behaviour when none is connected, proven by tests | S09 | Filed | Bhandari |  |
| 500 | Integrations settings screen — courier, SMS, payment, AI providers, Facebook, Google, YouTube, WhatsApp, Messenger, Telegram, Drive, email, all in… | S00 | Filed | Prohori | V2.1 final · 20 Oct: demo `#/admin/integrations` "Keys & connections" |
| 501 | Branding & appearance from settings — name, logo, favicon, colours, fonts, banners, menu, footer, contact details, social links | S02 | Filed | Sawdagor |  |
| 502 | Zone, charge and area admin — the three charge bands, the COD limits, and every area: add, rename, merge, move an area between bands, edit its… | S06 | Filed | Gyani |  |
| 503 | Language framework — both languages live, Bengali per page behind the gate; admin English by default with a Bengali switch | S02 | In demo | Sawdagor | `98a-admin-lang.js` (#/admin) · V2.1 final · 20 Oct: English mode 0 Bengali on 206 admin routes; documents shown as written |
| 504 | Finance, costs & reports — stage scope item, not itemised in the register (see B3.8–B3.10) *(derived)* | S16 | Filed | Gyani |  |
| 505 | Notification template editor — every SMS, email and WhatsApp template, the auto-replies, and which event sends which message, all written and… | S14 | In demo | Doot | `91-admin-crm.js` (#/admin/customers) |
| 506 | AI-off proof — the whole site works with AI off (named in the agent protocol) *(derived)* | S15 | In demo | Gyani | `89b-admin-agents.js` (#/admin/ai?tab=models) |
| 507 | Backup settings and restore drills, Google Drive (with PR 395) *(derived)* · updated 19 Oct 23:33 (CN-001): monthly automatic restore test, Blob + Drive | S19 | In demo | Prohori | `89-admin-system.js` (#/admin/backup) · V2.1 final · 20 Oct: demo `#/admin/backup` shows Blob + Drive (sample data) |
| 508 | General default pack — policy shapes, charge structures, category structure, SMS and email template text, AI settings, theme, roles, seeded as… | S00 | Filed | Prohori |  |
| 509 | "My own data" register — the list of values that never ship to a new installation: store name, logo, every API key, phone, address, the Dhaka area… | S00 | In demo | Prohori | `89-admin-system.js` (#/admin/settings) |
| 510 | "Reset to default" | S00 | In demo | Prohori | `89-admin-system.js` (#/admin/settings) |
| 511 | Multi-store — stage scope item, not itemised in the register (see A4) *(derived)* | S17 | Filed | Prohori |  |
| 512 | Multi-store — stage scope item, not itemised in the register (see A4) *(derived)* | S17 | Filed | Prohori |  |
| 513 | Installer (register parking lot) *(derived)* | S26 | Parked |  |  |
| 514 | Setup wizard (register parking lot) *(derived)* | S26 | Parked |  |  |
| 515 | Clean-install check (register parking lot) *(derived)* | S26 | Parked |  |  |
| 516 | Inline help (register parking lot) *(derived)* | S26 | Parked |  |  |
| 517 | Bilingual guide (register parking lot) *(derived)* | S26 | Parked |  |  |
| 518 | Update distribution (register parking lot) *(derived)* | S26 | Parked |  |  |
| 519 | Order Identity Graph — one identity built from phone, name, address, IP and device, so a customer who changes his phone number is still the same… · updated 19 Oct 23:33 (CN-001): pg_trgm fuzzy name/address matching | S06 | Filed | Gyani |  |
| 520 | Duplicate & re-order rules engine — scenarios A–E and H–I as separate rules, each with its own window, confidence threshold and action: cancel ·… | S06 | Filed | Gyani |  |
| 521 | Alert summary card — one click on an alert shows why it fired, which earlier orders matched, what the rider wrote, and the customer's history, so… | S06 | Filed | Gyani |  |
| 522 | Multi-order bundling — several separate orders from one identity inside a window become one group and one parcel, with a note, instead of five parcels | S06 | Filed | Gyani |  |
| 523 | Block register, and the proposal that fills it | S06 | Filed | Gyani |  |
| 524 | False-positive protection — every rule carries a confidence score and a good-customer override, and a weekly report lists everything the engine… | S06 | Filed | Gyani |  |
| 525 | True-delivery reconciliation — the courier marks a charge-paid return as "Delivered" | S08 | In demo | Bhandari | `92-admin-couriers.js` (#/admin/couriers) |
| 526 | Return-reason capture — the rider's note (didn't like it, size didn't fit, not as expected, ordered by mistake) recorded against the customer and… | S08 | In demo | Bhandari | `92-admin-couriers.js` (#/admin/couriers) |
| 527 | Permanent URL policy — no product, category or page URL is ever deleted or allowed to 404 | S11 | Filed | Doot |  |
| 528 | Blog brief form — word count, keywords, topic and language chosen before a single word is written | S12 | In demo | Doot | `94-admin-blog.js` (#/admin/blog) |
| 529 | Source-link research writer — give it a link to an article anywhere in the world | S12 | In demo | Doot | `94-admin-blog.js` (#/admin/blog) |
| 530 | Seasonal page lifecycle — archived and live are states, never deletion | S12 | In demo | Doot | `94-admin-blog.js` (#/admin/blog) |
| 531 | Full campaign control from the dashboard | S13 | In demo | Tirondaj, Doot | `93-admin-ads.js` (#/admin/ads) |
| 532 | Deep conversion feed — server-side events enriched with the courier outcome and the visitor's intent, pushed to every platform, so the shop… | S13 | Filed | Doot, Tirondaj |  |
| 533 | Customer history summary at approval — one screen: orders, true deliveries, charge-paid returns and their reasons, refusals, exchanges | S14 | In demo | Doot | `91-admin-crm.js` (#/admin/customers) |
| 534 | Customer grading — badges, levels and a verified mark earned from real delivery history, feeding the fraud engine's good-customer override | S14 | In demo | Doot | `91-admin-crm.js` (#/admin/customers) |
| 535 | Legacy customer import — the existing business's order list brought in, de-duplicated, matched against new customers, so the shop opens with real… | S14 | In demo | Doot | `91-admin-crm.js` (#/admin/customers) |
| 536 | Finance, costs & reports — stage scope item, not itemised in the register (see B3.8–B3.10) *(derived)* | S16 | Filed | Gyani |  |
| 537 | Finance, costs & reports — stage scope item, not itemised in the register (see B3.8–B3.10) *(derived)* | S16 | Filed | Gyani |  |
| 538 | Support (all-in-one) — stage scope item, not itemised in the register (see B4) *(derived)* | S22 | Filed | Gyani |  |
| 539 | Virtual Photoshoot Studio — stage scope item, not itemised in the register (see C7) *(derived)* | S24 | Filed | Gyani |  |
| 540 | Approval digest and permission gate — the AI reports and then waits: *"50 orders today | S06 | Filed | Gyani |  |
| 541 | Risk-sectioned order dashboard — the moment an order lands it is scored, marked and placed in its section with a note, so the owner opens one… | S05 | Filed | Sawdagor |  |
| 542 | One-click advance-charge request — from the order itself: SMS, WhatsApp or call, with the payment link and the order's state change, in one click | S06 | Filed | Gyani |  |
| 543 | Decision learning loop — every approve and decline by the owner and by each employee, with its reason, is taken as training | S06 | Filed | Gyani |  |
| 544 | Rule master switches — every fraud and duplicate rule individually switchable from the backend | S06 | Filed | Gyani |  |
| 545 | New-customer verification queue — an identity with no history anywhere goes to a phone call, never to a decline | S06 | Filed | Gyani |  |
| 546 | Cancellation notice to the customer — when a duplicate is cancelled, a detailed WhatsApp or SMS explains why, with the tracking link to the order… | S05 | Filed | Sawdagor |  |
| 547 | Image sourcing for the blog — the owner's own product photographs first, then free-licence libraries the AI may draw on by itself | S12 | Filed | Doot |  |
| 548 | Market and competitor intelligence — the owner supplies links to large pages in his market | S13 | Filed | Doot, Tirondaj |  |
| 549 | National gazetteer — division → district → upazila/thana → area for the whole of Bangladesh, with Bengali, English and Banglish spellings,… | S06 | In demo | Gyani | #/checkout (route hint) |
| 550 | Band mapping — one band per area, simple | S06 | In demo | Gyani | `92-admin-couriers.js` (#/admin/couriers) |
| 551 | Ambiguity resolver — reads the whole line, and waits | S06 | In demo | Gyani | #/checkout (route hint) |
| 552 | Address autocomplete — type-ahead over the gazetteer, matching Bengali, English and the Banglish people actually type (Gabtali ↔ Gabtoli, Sreepur… | S06 | In demo | Gyani | #/checkout (route hint) |
| 553 | Charge accuracy guard — the delivery charge is never computed from free text, only from a resolved gazetteer entry | S06 | In demo | Gyani | #/checkout (route hint) |
| 554 | Courier zone sync — our gazetteer mapped to each courier's own city/zone/area ids, so a booking never fails on an area the courier does not… | S06 | Filed | Gyani |  |
| 555 | Phone-first recognition at checkout — the customer has given a phone number before he has given anything else | S06 | In demo | Gyani | #/checkout (route hint) |
| 556 | In-transit duplicate notice — the moment the phone number identifies an order already on its way with the same product, colour and size, a Bengali… | S06 | Filed | Gyani |  |
| 557 | Duplicate turned into an exchange — same product and colour, different size, earlier one still in transit: that is a size worry, not forgetfulness | S06 | Filed | Gyani |  |
| 558 | Parameter for Checkout panel — its own dashboard section, mixed with no earlier parameter | S04 | Filed | Sawdagor |  |
| 559 | Phone-entry risk check — our database and the courier fraud checks queried in the background while the customer keeps typing | S06 | Filed | Gyani |  |
| 560 | Advance-payment checkout mode — for a flagged customer only, and only once he has filled everything in: COD disappears, bKash, Nagad and card… | S04 | Filed | Sawdagor |  |
| 561 | Silent address backfill — a customer who writes only "Road 12, House 42" gets the Inside/Outside Dhaka question, unless his phone number is… | S04 | In demo | Sawdagor | `91-admin-crm.js` (#/admin/customers) |
| 562 | Flag outcome report — of the customers flagged: how many paid the advance, how many abandoned | S06 | Filed | Gyani |  |
| 563 | No order is ever held over an address — an unresolved address, with no Inside/Outside choice made either, still confirms | S04 | Filed | Sawdagor |  |
| 564 | Charge mismatch log — when the courier resolves a different real location than the band the customer was charged for, nothing is changed and… | S08 | In demo | Bhandari | `92-admin-couriers.js` (#/admin/couriers) |
| 565 | Free delivery is exempt — where delivery is free, none of the band machinery shows, corrects or messages | S04 | Filed | Sawdagor |  |
| 566 | Support explanation panel — one click gives the agent a summary of why this customer was asked for an advance, and why the delivery charge rather… | S04 | Filed | Sawdagor |  |
| 567 | Multi-courier fraud data — Steadfast's and Pathao's own checks to begin with, and any aggregated source behind the same adapter | S06 | Filed | Gyani |  |
| 568 | Product and category sales by district and upazila (PENDING_CHANGES §60.14) *(derived)* | S16 | Filed | Gyani |  |
| 569 | Geography-led ad guidance — the shop knows where parcels are actually *delivered and paid for*, district by district | S13 | Filed | Doot, Tirondaj |  |
| 570 | Checklist audit runner in the AI section | S21 | In demo | Prohori | `89-admin-system.js` (#/admin/audit) · V2.1 final · 20 Oct: timing items L32/L33 (TA-2: 0 fail) |
| 571 | Auto colour-pair combos (the owner's model) | S03 | In demo | Sawdagor | `42-combo-auto.js` (#/combos) |
| 572 | Combo category page — 5 templates — L1 pair grid (the promoted page), L2 one card per style, L3 combo hub with winter/summer tabs, L4 one-column… | S03 | In demo | Sawdagor | `42-combo-auto.js` (#/combos) |
| 573 | Combo product page — 5 templates — P1 pair page (2 taps to bag), P2 pick-your-colours, P3 top + bottom set, P4 mixed 3-item set, P5 fixed-colour pack | S03 | In demo | Sawdagor | `42-combo-auto.js` (#/combos) |
| 574 | Combo in the bag — 5 templates — B1 grouped card, B2 sizes editable in the bag (default), B3 "add 1 more" inside the card, B4 real item prices +… | S03 | In demo | Sawdagor | `42-combo-auto.js` (#/combos) |
| 575 | Set photo standard — the set picture is composed automatically from each piece's photo in the chosen colours (side by side / top + bottom /… | S03 | In demo | Sawdagor | `42-combo-auto.js` (#/combos) |
| 576 | Combo template test matrix and ranking — set types × 5–6 colours × S–3XL × phone sizes, a 100-point score per template (taps to bag, first-screen… | S03 | Filed | Sawdagor |  |
| 577 | Agent 360° profiles — each of the six fixed agents (প্রহরী Prohori, ভান্ডারী Bhandari, সওদাগর Sawdagor, শিল্পী Shilpi, দূত Doot, জ্ঞানী Gyani —… | S15 | In demo | Gyani | `89b-admin-agents.js` (#/admin/ai?tab=models) |
| 578 | Agent appraisal reports — daily, weekly, monthly and yearly reports per agent, written like an employee's: what it did, what it left undone and… | S15 | In demo | Gyani | `89b-admin-agents.js` (#/admin/ai?tab=models) |
| 579 | Agent curriculum and certification — each agent's field is taught as a degree path (graduate → post-graduate → PhD level) from top-university… | S15 | In demo | Gyani | `89b-admin-agents.js` (#/admin/ai?tab=models) |
| 580 | Model auto-suggest with free-model qualification | S15 | In demo | Gyani | `89b-admin-agents.js` (#/admin/ai?tab=models) |
| 581 | তীরন্দাজ Tirondaj — the seventh agent, ads specialist | S15 | In demo | Tirondaj, Gyani | `89b-admin-agents.js` (#/admin/ai?tab=models) |
| 582 | Strong agent memory — every agent gets a long-term memory store inside the system (facts, decisions, owner instructions, past campaigns/tasks and… | S15 | Filed | Gyani |  |
| 583 | Chief agent — জ্ঞানী Gyani as virtual CEO (প্রধান এজেন্ট), chain of command | S15 | In demo | Gyani | `89b-admin-agents.js` (#/admin/agents) |
| 584 | Telegram identity and command routing | S15 | In demo | Gyani | `89b-admin-agents.js` (#/admin/agents) |
| 585 | Continuous learning engine — Tirondaj (ads) and Doot (SEO/marketing) are the two power agents | S15 | Filed | Gyani |  |
| 586 | Hash-to-real-URL forwarder — a small script maps every old demo #/… link to its live URL (location.replace), with a test table, so no shared demo… | S11 | Filed | Doot |  |
| 587 | WordPress → new site migration (extas.com.bd) | S19 | In demo | Prohori | `95-admin-naming.js` (#/admin/naming) |
| 588 | Bengali translation gate — per page a "Bengali ready" flag (main content translated and approved) | S11 | Filed | Doot |  |
| 589 | Merchant Center feed + Bangladesh test | S13 | Filed | Doot, Tirondaj |  |
| 590 | Product naming and URL control (owner, 19 Oct 12:04) | S01 | In demo | Bhandari | `95-admin-naming.js` (#/admin/naming) |
| 591 | Blog content pipeline (owner, 19 Oct 12:10–12:14) | S12 | In demo | Doot | `73-blog.js` (#/journal) |
| 592 | Blog as a complete, standard section of the shop, with our own ad placements (owner, 19 Oct 12:20) | S12 | In demo | Doot | `73-blog.js` (#/journal) |
| 593 | Blog writing team — five author agents under Doot (A360-06, head of content) | S12 | In demo | Doot | `94-admin-blog.js` (#/admin/blog) |
| 594 | PR register inside the backend (owner, 19 Oct 14:59) | S21 | In demo | Prohori | #/admin/register (route hint) |
| 595 | Page layout builder (home and every category page) | S02 | In demo | Sawdagor | `96c-layout-builder.js` (#/admin/layout) |
| 596 | Side canvas — the empty left and right gutters on desktop | S02 | In demo · **paused** (extensions) | Sawdagor | `96c-layout-builder.js` (#/admin/side-canvas) |
| 597 | Launch default — save and restore (owner, 19 Oct 19:53) | S02 | In demo | Sawdagor | `96c-layout-builder.js` (#/admin/layout) |
| 598 | Site builder — the whole site dynamic (owner, 19 Oct 21:23: "like WordPress + Elementor, nothing fixed") | S02 | In demo (partial) · **paused** | Sawdagor | `96d-site-builder.js` (#/admin/site) · V2.1 final · 20 Oct: Shimmer control (14 + master) and bag tier box built (`89t-shimmer.js`, `89u-bag-offers.js`) |
| 599 | In-dashboard help and the handover user manual (owner, 19 Oct 22:14: "no coder needed later; whoever takes over runs the whole site from the manual") | S02 | In demo (partial) · **paused** | Sawdagor | `96d-site-builder.js` (#/admin/manual) |
| 600 | On-page edit mode (owner, 19 Oct 22:27–22:33, plan approved 100%) | S02 | Filed · **paused** (not in demo) | Sawdagor |  |
| 601 | NVMe temporary-disk boot unit — format and mount at every boot, folder layout, systemd ordering before services, admin NVMe card and alert (owner server spec, 19 Oct 23:33) | S0A | Filed | Prohori | V2.1 final · 20 Oct: NVMe card in demo `#/admin/server` (sample data) |
| 602 | Four-layer cache plus invalidation — browser, Cloudflare, server page cache, Redis; purge rules; 15 s stock display with live checks at bag and checkout; Clear all cache (owner server spec, 19 Oct 23:33) | S02 | Filed | Sawdagor, Prohori | V2.1 final · 20 Oct: demo `#/admin/cache` (sample data) |
| 603 | Database performance pack — required indexes, pg_trgm, slow query log, slowest-queries page, report materialized views and low-priority pool (owner server spec, 19 Oct 23:33) | S00 | Filed | Prohori | V2.1 final · 20 Oct: slowest queries in demo `#/admin/server` (sample data) |
| 604 | Hardware-aware auto profile and run-anywhere — limits from detected CPU and RAM, storage adapter (local / Blob / S3), CDN optional (owner server spec, 19 Oct 23:33) | S0A | Filed | Prohori | V2.1 final · 20 Oct: auto profile card in demo `#/admin/server` (sample data) |

---

# Appendix B · Open owner decisions and owner data still needed

Kept short. Each decision has the default that ships if no answer comes (build it as a setting, one line in
`BLOCKED.md`, keep going). Source: ROUND15, the QA and plan reports, `review/OWNER-PRECODE-CHECKLIST.md`.

## B.1 Owner data — day 1 (code start)

| # | Item | Source |
|---|---|---|
| 1 | ~~New VPS configuration screenshot (CPU, RAM, disk, provider) — sizes PR 5 / A2.6~~ **Resolved 19 Oct 23:33 (V2.1): Azure E8ds_v6, Southeast Asia, Ubuntu Server 24.04 LTS x64 Gen2, OS 128 GB + 1 TB data disk (A2.9.1); the region is settled too** | Note 45.1, 47, 48 |
| 2 | ~~VPS IP and SSH key~~ **V2.1:** the VM's IP, and our public key added by the owner under Reset password → Reset SSH public key (separate username for the build agent); he keeps his own .pem, no private key in chat. The VM is created with `review/AZURE-VM-GUIDE.pdf` | Note 45.1, 48 |
| 3 | GitHub access (a private repository for the shop) | Note 45.3; checklist 32 |
| — | ~~Optional: the server-setup blueprint file offered at 11:57, not yet received~~ **Received 19 Oct 23:15** (`review/SERVER-SETUP-SPEC-OWNER.md`), approved 23:33, filed as CN-001 | Note 44.2, 47, 48 |

## B.2 Owner data — before go-live (entered by the owner in the vault / Integrations screen)

| # | Item | Source |
|---|---|---|
| 4 | Google Drive (main + second add-only) for backups — **must be live before go-live**; stays **mandatory** next to Blob (V2.1) | Note 45.3, 48; PR 8, 507 |
| 4a | **Azure Storage account (Blob)** for media and backups (V2.1) — the owner creates it before go-live with a guide; its key goes into the vault (PR 493). Billed separately from the VM, roughly US$5–15 a month at launch scale | Note 48; PR 8, 18, 604 |
| 5 | Telegram bot token — **alerts must be live before go-live** | Note 45.3; PR 9 |
| 6 | extas.com.bd domain panel access; Cloudflare account (nameserver change on launch day, not before) | checklist 7–8 |
| 7 | WordPress admin and hosting access for the migration export; keep the old site running until launch | checklist 9–11; PR 587 |
| 8 | Merchant accounts and API: bKash, Nagad, SSLCommerz; Steadfast, Pathao, RedX (and their official API docs) — **start early** | checklist 24–28 |
| 9 | SMS gateway and masking sender ID (**start early**); WhatsApp Business API number; order e-mail address | checklist 21, 29–30 |
| 10 | Google (account, Search Console, Merchant Center, Ads + developer token — **start early**, Analytics/Tag Manager); Meta Business (verification — **start early**, ad account, Pixel, developer app); TikTok; YouTube | checklist 12–23 |
| 11 | ERP access (server, API/database, push access) | checklist 33; §59 answer 36 |
| 12 | AI provider keys and the monthly spend cap | checklist 34; PR 309 |

## B.3 Business content

| # | Item | Source |
|---|---|---|
| 13 | Real WhatsApp number, hotline, support e-mail, address — 10 checklist points wait on these (code ready) | checklist 35; R15d 🔒 10 |
| 14 | Trade licence number and DBID (apply for DBID if missing — **start early**) | checklist 36 |
| 15 | Facebook, Instagram, YouTube, TikTok page links | checklist 37 |
| 16 | Logo files (SVG or large PNG, phone version) and the final slogan; brand colours/fonts if any | checklist 38–39 |
| 17 | Real product photos (best sellers first) and set photos for featured combo pairs | checklist 40; C12.3 |
| 18 | Final delivery charges per band, hours, exchange policy, free-delivery threshold | checklist 41 |
| 19 | Blog: expert reviewer names per section; a care-lab person about half a day a week (otherwise no "we tested" claims); confirmation of product-story facts before they go live | Note 31.3; BLOG plan; ROUND15 13:35 |
| 20 | Who writes and approves Bengali text; which pages go Bengali first (default: home, every category, `/combos` and rules, help pages, all panjabi, top 20 product pages) | checklist 43; Google plan §6.4 |
| 21 | Go-live date (the blog calendar assumes 2 Nov 2026; Eid 2027 panjabi pages indexed by 15 Jan 2027) | checklist 44 |

## B.4 Open owner decisions

| # | Decision | Default that ships (*rec.* = Gyani's recommendation; no recorded source) | Source |
|---|---|---|---|
| 1 | Does the optional order-confirmation e-mail count inside "2 SMS + 1 WhatsApp"? | *rec.* E-mail sent only when the customer gave an address, not counted (V1 B2.5 unchanged) | Note 4.7 is silent on e-mail |
| 2 | The one WhatsApp: the register says "when the shop processes"; Doot's D09 allocation (accepted in Note 23.2) puts a 2-size check or a review request in that slot | Register: WhatsApp at processing; *rec.* the 2-size check and review request go on-site / in the account | PR 148; Note 4.7, 23.2; D09 |
| 3 | Side canvas on 1280–1366 laptops and ~1536 px: zones are small, picture-only; 1.6× cap at 1920 | As built (scale from the 1440 standard) | ROUND15 22:00 |
| 4 | Desktop: D-040 CTA style; D-042 inline size chips; D-045 form cap (waits D-010) | As built | DESKTOP-REVIEW Batch B |
| 5 | Combo defaults (L1 / P1–P3 auto / B5) and the "Move to wishlist" label for combos | Keep (owner will check) | Note 23.16–23.17 |
| 6 | "100% original" trust line next to third-party-brand stock | *rec.* Keep the line (brand names stay) | Google plan §1.8 (PR 62); Note 27.3 |
| 7 | Return-policy wording for structured data (exchange-only) | *rec.* Exchange-only wording from Rules | Google plan §6.6 |
| 8 | Brand-name collision: "EXTAS" alone or "EXTAS Menswear" in titles and social names | *rec.* "EXTAS" | Google plan §6.9 |
| 9 | Old short journal notes overlapping the new guides | Compact list after the guides; noindex in the live build | Blog QA (Shilpi / Claude decision) |
| 10 | "Was"-price source per category (MRP, price history, combo) | *rec.* No struck price until chosen (honesty rule, PR 38) | V1 F #71 |
| 11 | Wording that replaces "No return" on the Returns row | *rec.* "Exchange within the Rules window", from Rules | V1 F #68 |
| 12 | VAT and invoice format with an accountant | After launch (not blocking) | Note 23.11 |
| 13 | **V2.1 final · 20 Oct.** 4-piece tier prices in the bag tier box (`BAG_TIER_SEED`): the demo suggests **4 polos ৳2,700** and **4 tees ৳1,750** | Demo suggestion only — **needs the owner's yes**; real prices are always owner data (entered in the Build your own set / Bag offer tiers settings, never shipped as code, PR 509) | Note 43.10; Batch B (`agents/worklog/sawdagor.log`) |

**Carried from V1 D6.1 without a recorded ruling (the demo default ships unless the owner reopens one):** phone search
panel position (#64), desktop checkout header space (#65), footer link tap targets (#67), "Only 3 left" position (#70),
the six footer Shop links (#73), wishlist alerts (#75, default off).

---

# Appendix C · QA gate definition and test inventory

## C1. The release standard (owner, Note 21; PR 570)

**Every non-backend checklist point must PASS** on **8 phone sizes, 5 tablets in portrait and landscape, and desktop**,
on every page type (home, every category, product, combo pages, bag/add-to-cart, checkout, thank-you, account, journal),
before any release. Backend-only points are run from the real backend. "Done" needs the gate at 0 failures **and** the
screenshots looked at (lessons R14).

| Group | Sizes |
|---|---|
| Phones (8, touch, `isMobile`, real DPR) | 320×640 · 360×800 · 375×667 · 390×844 · 393×852 · 412×915 · 430×932 · 440×956 |
| Tablets (5 × 2 orientations, touch, DPR 2) | iPad mini 768×1024 · iPad Air 820×1180 · iPad Pro 11 834×1194 · iPad Pro 12.9 1024×1366 · Android tab 800×1280 |
| Desktop (real mouse/keyboard, no touch) | 1024×768 · 1280×800 · 1366×768 · 1440×900 · 1536×864 · 1920×1080 (owner's standard: at least 1280×800 and 1440×900) |
| Before launch | a real iPhone (Safari and the Claude app) and a real Android (Chrome) — the workspace has no WebKit |
| PR 600 phone apply | the 10 phone screen sizes most used in Bangladesh |

## C2. The device gate — `qa/device-matrix.js`

`node device-matrix.js <built.html> [--routes=pdp|all] [--group=phones|tablets|all] [--slice=A-B] [--json=out.json]`

- **Devices:** 15 phones from `qa/devices.json` (320×640, 360×640, 360×780, 360×800, 375×667, 375×812, 384×854,
  390×844, 393×852, 393×873, 402×874, 412×915, 414×896, 430×932, 440×956) + the 10 tablet sizes above = 25.
- **Routes:** product pages `essential-pique-polo`, `oxford-cotton-shirt`, `classic-cotton-panjabi`,
  `slim-chino-trousers`, `heavyweight-hoodie`, `everyday-crew-tee`; pages `#/`, `#/c/polos`, `#/c/new`, `#/set`,
  `#/combo/polo-duo`, `#/bag`, `#/checkout`, `#/account`, `#/journal`. The code phase maps these to live URLs (C12.1).
- **Checks:** PAGE-WIDER-THAN-PHONE, HORIZONTAL-SCROLL, STICKS-OUT-RIGHT, TEXT-CUT-OFF, TAPS-OVERLAP, JS-ERROR,
  PRICE-LINE-TWO-LINES, PRICE-LINE-CUT, PRICE-BAR-SPACING, PRICE-BELOW-FOLD, FIT-LINE-TWO-LINES, FIT-LINE-CUT,
  FIT-LINE-FIRST-HIDDEN, FIT-LINE-HOLE, FIT-LINE-NOT-CENTRED, FIT-LINE-OFFSCREEN, FIT-LINE-UNDER-BAR,
  ALL-COLOURS-OFF-LINE, ALL-COLOURS-PAST-EDGE, SWATCHES-WRAP, SIZE-ROW-BREAKS, SIZE-VALUE-NOT-BOLD,
  SIZE-CHART-PAST-EDGE, DASH-INVISIBLE, TOO-MANY-QUESTIONS-SHOWN.
- **Pass:** 0 failures. Last results: 0 of 480 (15 phones 240 + 10 tablets 240) on the R15 builds; V11 0 of 240.
  Older gates kept: `device-matrix.pre-r14.js`, `.pre-r15.js`, `.pre-tab.js`.
- **V2.1 final · 20 Oct:** the gate stays at **0 fails** across phones, tablets and desktop: 0/480 after the bag review
  (Batch B), phones **0/240** on the TA-2 build and after the server admin pages.

## C3. Phone pixel-diff guard (desktop-only work)

Before/after pixel diff of the 47 phone routes at 360 / 390 / 430 / 440 must be **0 px** (Note 34.2). Use Playwright
`animations:'disabled'` and identical route lists (history-based rows like Recently viewed change otherwise); take tap
measurements before full-page shots (a full-page shot on a mobile context switches off `pointer:coarse`). The demo's
layout builder and side canvas were proven the same way: 56/56 pixel-identical with defaults (phones, tablet,
1280/1440/1920, home + 7 categories).

**V2.1 final · 20 Oct:** TA-2 phone pixel diff — 67 routes/states × 360/393/430 = 201 shots against a baseline built
from the same source with only the TA-2 edits reversed: **0 real changes** (the raw flags are run-to-run noise that two
runs of the unchanged baseline show too). The bag review's phone diff is text-only on the routes it meant to change
(the plain bag words, the title colour, the 4-piece tier text).

## C4. Pause / resume rule

Every test that checks something stops (hover, focus, touch, popup, menu, video, slider) also checks it starts again
at the right moment; touch rules never apply to the mouse (R13; checklist ~~L28, L29~~ **L32, L33** — renumbered, V2.1 final · 20 Oct). Example: desktop sliders still on
hover, moving within 0.7 s after the mouse leaves (measured at 1366 on all four home rows).

**V2.1 final · 20 Oct — the rules proven in TA-2** (`qa/TIMING-AUDIT.md`, round TA-2: 530 checks · 521 pass · **0 fail** ·
9 info; scripts `scratchpad/timing-audit/tools/run-all.sh`). Every release re-runs them (checklist L32, L33.01–L33.37):

| Rule | Proven by (TA-2) |
|---|---|
| Mouse, touch and keyboard have **separate pause flags** (hover · 4 s touch hold · focus with 1.5 s grace), each cleared only by its own event | T1–T4 fixed; L33.12, L33.13 |
| **Every pause has a tested resume path** | L33 (all 37 items) |
| A slider **resumes within about 100 ms** after the mouse leaves, after a drag and after a sideways wheel | L32, L33.01–L33.06: 54–97 ms; drag 94 ms; after the glide 5–51 ms |
| A **vertical wheel is ignored** by sliders (the page scrolls, no pause) | L33.06: 18–45 ms |
| **Every row can be dragged with the mouse**; a **click after a drag doesn't open the card**, a plain click does | L33.07: 25/25 rows; DR-01/02 9/9 |
| The **toast pauses on hover and focus** | L33.23: held 9 s; goes 2.6 s after leave |
| **Timers are cleared on route change**; no forever timer | L33.37: none alive |
| **Focus returns to the opener** when a menu or panel closes | L33.25, L33.26 |
| A **cancelled pull-to-refresh resets** | L33.32 |

Results: timing **0 fails**; phone device gate **0/240**; phone pixel diff **0 real changes** (C3). The old example
above ("within 0.7 s") is kept; the measured standard is now "about 100 ms". Storefront rules: D1.2 R18.

## C5. The checklist — `qa/ECOMMERCE-CHECKLIST.md`

405 points in 23 groups (navigation & history, layout, header/footer/menus, search, category, product, combos, bag,
checkout, thank-you/tracking/invoice, account, messages & WhatsApp, performance, accessibility, forms, language,
trust & legal, analytics, SEO, security & privacy, offline & slow network, error handling, admin) plus later additions
~~(L28, L29)~~ **(L32, L33 — V2.1 final · 20 Oct: renumbered; L28/L29 are the older carousel and long-name points)**. Marks: ✅ pass · ❌ fail · 🔒 blocked on owner data · ⚖ owner decision · — backend / real device · ⬜ not run.
**Final regression R15d:** 337/337 testable non-backend points pass; 10 🔒 owner data; 58 backend / real device; 0 open
decisions. (Owner's Note 21 counted 357 non-backend points before the reclassification; R15b–R15d count 347
non-backend of which 10 wait for owner data.) The checklist lives in the backend's audit runner (PR 570).

**V2.1 final · 20 Oct:** timing items **L32** (sliders resume when the mouse leaves) and **L33 + L33.01–L33.37** (every
pause has its resume) — all ✅ in TA-2. They were filed as L28 / L29 / L29.xx and renumbered on 20 Oct because those
numbers clashed with the older [L28] carousels and [L29] long names; results kept.

## C6. Test inventory (to re-run in the code phase)

| Suite | What it covers | Where (demo era) |
|---|---|---|
| Device gate | layout rules above, 25 sizes | `blueprint/qa/device-matrix.js`, `qa/devices.json` |
| Route sweep + journeys J1–J10 | 123–126 routes × 20 sizes; customer journeys (back/forward/swipe, PTR, reload, checkout) | `scratchpad/qa-r15b/tools/routes.js`, `journey.js`, `points2.js`–`points4.js`, `agg.js`, `aggj.js`, `r16-nav.js`, `r16-feat.js`, `r16-points.js`, `r16-taps.js` |
| Desktop QA | 104 routes × 6 widths, links, journeys, features F01–F24, phone cross-check | `scratchpad/desktop-qa/tools/sweep.js`, `clip.js`, `links.js`, `journey.js`, `feat.js`, `exwalk.js`, `phone.js` |
| Blog QA | sweep, journeys, ad slot rules, popup rules, back-end flows, contrast from real pixels, Bengali font check | `scratchpad/blog-qa/tools/sweep.js`, `journeys.js`, `ads.js`, `popup.js`, `backend.js`, `checks.js`, `run-all.sh`, `run-r2.sh` |
| Combo | verify (combo flows, B5 default, P3 for hoodie + jogger), ranking journeys, ended combo in bag | `scratchpad/verify.js`; ranking scripts per COMBO-RANKING §1; `ended-bag.js` |
| Admin | ops-test (default + blog/agent routes), ops-flow, zb-flow (blog back end, 47/47), nm-flow (naming, 50+), reg-test (register, 159/159) | demo tools; `scratchpad/regtest/` |
| Demo smoke and page tests | smoke, journeys, a–g tests, views | `scratchpad/proto/tools/smoke.js`, `journey.js`, `a-test.js` … `g-test.js`, `d-view.js`, `vshot.js` |
| Timing audit | timers, animation timings, pause/resume (Note 44.1 item 2) | `scratchpad/timing-audit/` — ~~**in progress when V2 was written; `qa/TIMING-AUDIT.md` not yet present**~~ **V2.1 final · 20 Oct: done** — `qa/TIMING-AUDIT.md` (TA-1, TA-2), `tools/run-all.sh` (`sliders.js`, `hover.js`, `overlays.js`, `misc.js`, `extra.js`, `drag.js`); TA-2 530 checks, 0 fail |
| Admin language harvest | missing Bengali / English pairs | `scratchpad/proto/tools/extract-admin-bn.py --missing`, `--merge` |
| Register generator | register → admin data; idempotent | `scratchpad/proto/tools/make-register.py` |
| **V2.1 final · 20 Oct** bag review | bag totals in bag / summary / checkout (current, B1–B5), shimmer and tier settings | `scratchpad/desktop-fix/bag/` (Batch B) — pass; device gate 0/480 |
| **V2.1 final · 20 Oct** server admin | 120 route and modal checks (4 widths × en/bn) + 19 flows | `scratchpad/server-admin/check.js`, `flow.js` — 0 fails |
| **V2.1 final · 20 Oct** owner-answers | owner answers, Notes 23–25 (combo rule states now English by default) | `scratchpad/owner-answers/test.js` — passes |
| Performance (code phase) | Lighthouse budget in CI, k6 baseline, CWV field data | PR 17, 88, 10, 234 (D12) |

The scratchpad paths are the design-phase workspace; at code start the suites are ported into the repository's test
folder and run in CI, Playwright with Chromium plus WebKit where available.

## C7. Real-device checks still owed

Real iPhone Safari (buy bar safe area, edge swipe, pull-to-refresh) and a real Android Chrome before launch; the
backend-only checklist points from the real backend; payment, courier and SMS sandboxes once the owner's accounts
exist.

## C8. Gate order for a release

1. Unit and type checks, build, hardcode guard (PR 494).
2. Device gate 0 failures (C2).
3. Journeys and route sweep on the C1 sizes; desktop suite at the six widths.
4. Phone pixel-diff 0 px for desktop-only changes (C3).
5. Checklist groups touched by the change (C5), via the audit runner (PR 570).
6. Performance budgets (D12).
7. After go-live: all of the above on staging first, then deploy, with one-step rollback.

## C9. Verification of this specification

`scratchpad/v2/verify_v2.py` checks that every PR 1–600 appears in this file (and in Appendix A), that every owner
note in ROUND15 is referenced or marked "no spec change", and that the E0 stage table matches the register's stage
table row by row and in total. Its last result is recorded in Gyani's work log.

**V2.1:** `scratchpad/v2/verify_v21.py` runs the same checks on this file for PR 1–604 and ROUND15 Notes 1–48, plus a check that every V2 line is carried into V2.1 (verbatim, tagged, or listed as an intentional in-place change). Result at filing: PASS (ROUND15 Note 48).

**V2.1 final · 20 Oct:** `verify_v21.py` now checks ROUND15 Notes 1–49 (Note 49 = CN-002), the V2.1 final markers (the
Bengali "V2.1 চূড়ান্ত" block, B.4 #13, no unstruck L28/L29 timing reference) and lists the V2.1 final in-place change
next to the CN-001 ones. Result: recorded in ROUND15 "Done — V2.1 final".
