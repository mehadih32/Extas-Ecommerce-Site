# দোকানের কাস্টমাইজ গ্যাপ — যেখানে অ্যাডমিনে বদলানোর স্ক্রিন নেই (15 নভেম্বর 2026)

শুধু পড়ে দেখা অডিট (কোড বদলানো হয়নি)। দেখা হয়েছে: `packages/settings/src/registry-*.ts` (923টা সেটিং কী), অ্যাডমিনের সব পাতা আর API,
`apps/web/src/components/shop`, `app/(shop)`, `docs/BLUEPRINT.md`, `docs/admin-guide`, `docs/demo/admin-proto-v5`, `docs/owner/PARKED.md`।

**বাদ দেওয়া হয়েছে (আগে থেকেই বদলানো যায়):** লেখা আর ভাষা (Words), পেজ লেআউট আর নিজের অংশ (Layouts), দেখানো-লুকানো (Eye toggles),
পলিসি পেজ (9টা), দুই পাশের জায়গা (Side canvas), পেজে এডিট (হোমের হিরো লেখা, ক্যাটাগরি/প্রোডাক্ট ব্লক), SEO টাইটেল-বিবরণ, রিডাইরেক্ট,
নোটিশ/পপ-আপ/ঘোষণার পট্টি, ল্যান্ডিং পেজ, ইনভয়েস ডিজাইন ও লেখা, SMS/WhatsApp/ইমেইল টেমপ্লেট, ডেলিভারি জোন-চার্জ, সাইজ চার্ট, শিমার, FAQ, ব্লগ।

**আসল কারণটা এক লাইনে:** ব্লুপ্রিন্টের "সাইট বিল্ডার" (PR 598: মেনু, হেডার, ফুটার, ক্যাটাগরি, থিম, লোগো) থামানো আছে, আর "দোকানের তথ্য"
(PR 383/705)-এর নাম-লোগো-যোগাযোগ-সোশ্যাল অংশ কখনো বানানো হয়নি: পাতায় শুধু 4টা আইনি নম্বর আছে। সেটিং কীগুলো আছে, দোকান সেগুলো পড়েও, কিন্তু
লেখার জায়গা নেই (এখন শুধু `settings cli.ts set` দিয়ে হয়, অ্যাডমিন API শুধু পড়ার)।

## অগ্রাধিকার তালিকা (সাইজ: S ছোট · M মাঝারি · L বড়)

| # | কী বদলাতে পারছেন না | কাস্টমার কোথায় দেখে | এখন কী অবস্থা | সাইজ | অগ্রাধিকার |
|---|---|---|---|---|---|
| 1 | দোকানের নাম | হেডার, ফুটার, ট্যাবের টাইটেল, SMS/ইমেইল, ইনভয়েস, 404 পাতা | কী আছে (`store.name`), স্ক্রিন নেই | S | জরুরি |
| 2 | হটলাইন ফোন, WhatsApp নম্বর, ইমেইল | হেডারের WhatsApp আইকন, মেনু, ফুটার, প্রোডাক্ট পেজের সাইজ-সাহায্য, ব্যাগ ও চেকআউটের WhatsApp সাহায্য, ইনভয়েস | কী আছে, স্ক্রিন নেই (BLOCKED 24 বলছে "অ্যাডমিনে লিখবেন", কিন্তু পাতাটা নেই) | S | জরুরি |
| 3 | দোকানের ঠিকানা | হেল্প/কন্টাক্ট পাতা, ইনভয়েস | কী আছে (`contact.address`), স্ক্রিন নেই | S | জরুরি |
| 4 | খোলার সময় | ফুটার, প্রোডাক্ট প্রশ্ন-উত্তর, `llms.txt` | কী আছে, স্ক্রিন নেই | S | জরুরি |
| 5 | সোশ্যাল লিংক (Facebook, Instagram, YouTube, TikTok) | ফুটারের আইকন, Messenger বোতাম, গুগলের দোকান-তথ্য | কী আছে, স্ক্রিন নেই | S | জরুরি |
| 6 | লোগো ছবি আপলোড | হেডার, ফুটার, ইনভয়েস, ইমেইল | কী আছে (`brand.logo`), স্ক্রিন নেই; উল্টো হেডার ছবি আঁকেই না, শুধু নামের লেখা দেখায় | M | জরুরি |
| 7 | ফেভিকন (ট্যাবের ছোট আইকন) | ব্রাউজার ট্যাব, বুকমার্ক | কী আছে, `/favicon.ico` পড়ে, আপলোডের স্ক্রিন নেই | S | জরুরি |
| 8 | শেয়ার করলে যে ছবি আসে (OG image, WhatsApp/Facebook প্রিভিউ) | পণ্য বা হোম লিংক WhatsApp/Facebook-এ পাঠালে | একেবারেই নেই: কোডে `og:image` সেট হয় না | M | জরুরি |
| 9 | থিমের রং, ফন্ট, প্রিসেট (4টা), বড় লেখা, দিন অনুযায়ী থিম | পুরো দোকান | কী আছে (`theme.*`), স্ক্রিন নেই | M | দরকারি |
| 10 | স্লোগান (লম্বা/ছোট), লোগো স্টাইল (10টা), সাইজ, ফোনের আলাদা লোগো | হেডার, ফুটার | কী আছে, স্ক্রিন নেই; `brand.logoPhone` কোথাও পড়াই হয় না | S | দরকারি |
| 11 | ক্যাটাগরি/কালেকশন বানানো, নাম, ছবি, ক্রম, সাব-ক্যাটাগরি | মেনু, মেগা মেনু, হোমের টাইল, `/collections/...` | শুধু API আছে (`/api/admin/catalogue/categories`, `collections`), কোনো স্ক্রিন নেই | L | জরুরি |
| 12 | ডেস্কটপ মেনু (ক্রম, নাম, "More", কোন ক্যাটাগরি সারিতে) | উপরের মেনু আর মেগা মেনু | কী আছে (`shell.desktopNav`); শুধু ৫টা চালু/বন্ধ সুইচ আছে | M | দরকারি |
| 13 | ফোনের মেনু আর নিচের বার (লিংক, ক্রম, নাম) | ফোনের মেনু, বটম বার | কী আছে (`shell.menu`), স্ক্রিন নেই | M | দরকারি |
| 14 | হেডার (আইকনের ক্রম, কোনটা থাকবে, WhatsApp আইকনের ধরন) | হেডার | কী আছে (`shell.header`); শুধু চালু/বন্ধ সুইচ আছে, ক্রম বদলানো যায় না | M | দরকারি |
| 15 | ফুটারের কলাম, লিংক, ক্রম, প্রতিশ্রুতির লাইন, পেমেন্ট চিহ্ন, সোশ্যাল ক্রম | ফুটার (ফোন আর ডেস্কটপ) | কী আছে (`shell.footer`); শুধু চালু/বন্ধ সুইচ আছে। লিংকের লেখা Words-এ বদলায়, কিন্তু লিংক যোগ-বাদ বা সাজানো যায় না | M | দরকারি |
| 16 | ঘোষণার পট্টির গতি (কত সেকেন্ডে বদলাবে) আর বিল্ট-ইন "ফ্রি ডেলিভারি + COD" লাইনের শর্ত/লিংক | সবার উপরের পট্টি | কী আছে (`shell.announce`); নতুন পট্টি Notices-এ হয়, গতি আর বিল্ট-ইন লাইনের স্ক্রিন নেই | S | পরে |
| 17 | নিজের ব্যানারে নিজের ছবি আপলোড (ফোন আর ডেস্কটপ আলাদা) | হোম, ক্যাটাগরি পেজের ব্যানার | ব্যানার ব্লকে শুধু লেখা, রং আর একটা প্রোডাক্ট বাছা যায়; ছবি আপলোডের জায়গা নেই | M | দরকারি |
| 18 | হোমের ফ্ল্যাশ সেল (শুরু-শেষ, কোন পণ্য) আর সারির সাজ | হোমের ফ্ল্যাশ সারি | কী আছে (`home.flashSale`, `home.flashRows`); admin-guide নিজেই লিখেছে "স্ক্রিন পরে আসবে" | M | দরকারি |
| 19 | পেজের হিরো স্লাইডের পণ্য হাতে বাছা | হোমের উপরের স্লাইডার | শুধু সংখ্যা, গতি, "স্টকে আছে"; কোন পণ্য দেখাবে তা নিজে ঠিক হয় (ক্যাম্পেইন ছাড়া) | S | পরে |
| 20 | স্লাইডারের ইঞ্জিনের সেটিং (অটো-প্লে, গতি) | হোম আর সব স্লাইডার | কী আছে (`slider.engine`), স্ক্রিন নেই | S | পরে |
| 21 | ক্যাটাগরি পেজ: সাজানোর অপশন (নাম/ক্রম), ফিল্টারের ক্রম ও কোনটা থাকবে, টুলবার চিপ, পেজে কয়টা স্টাইল | ক্যাটাগরি ও সার্চ পেজ | কী আছে (`category.sort`, `.filters`, `.toolbar`, `.page`); শুধু কয়েকটা চালু/বন্ধ সুইচ আছে | M | দরকারি |
| 22 | প্রোডাক্ট পেজের বিষয়বস্তু: টেমপ্লেট (T1/T2/T3), ভরসার সারির আইটেম, আইকন, শেয়ার, রিভিউ বক্স, রঙ-সাইজের লেখা, সাইজ-শব্দ ("ছোট/মাঝারি") | প্রোডাক্ট পেজ | কী আছে (`pdp.*`, 24টা); admin-guide-এ "স্ক্রিন পরে আসবে"। ব্লকের ক্রম আর সুইচ Layouts/Eye-এ আছে | L | দরকারি |
| 23 | পণ্যের কার্ড: ব্যাজ (New, Bestseller) কোন পণ্যে বসবে, হোভার ছবি, কুইক-অ্যাড | হোম, ক্যাটাগরি, সার্চের কার্ড | ব্যাজ আসে পণ্যের "ট্যাগ" থেকে, ট্যাগের কোনো স্ক্রিন নেই (শুধু API); কার্ডের বাকি অংশে `card.desk` সুইচ আছে | M | দরকারি |
| 24 | ডেলিভারি/রিটার্ন/এক্সচেঞ্জের ছোট সারাংশ লেখা (প্রোডাক্ট ও ল্যান্ডিং পেজে) | প্রোডাক্ট আর ল্যান্ডিং পেজ | কী আছে (`policy.returns.summary`, `policy.exchange.summary`, `policy.orderEdit.summary`), স্ক্রিন নেই। নিয়ম-ভিত্তিক লেখা Smart Rules থেকে আসে | S | দরকারি |
| 25 | পেমেন্ট মেথড: নাম, ক্রম, চালু/বন্ধ (COD, bKash/Nagad/Rocket, কার্ড, অনলাইন) | চেকআউট, ফুটারের পেমেন্ট চিহ্ন, প্রোডাক্ট পেজের পেমেন্ট লাইন | কী আছে (`payment.cod.enabled`, `checkout.pay.*`); শুধু গো-লাইভ পাতা পড়ে দেখায়, বদলানোর স্ক্রিন নেই | M | জরুরি |
| 26 | ম্যানুয়াল পেমেন্টের জন্য দোকানের bKash/ব্যাংক নম্বর | "টাকা পাঠান" ধাপ | কী আছে (`payment.wallet.numbers`, `payment.bank.accounts`), কোথাও পড়াও হয় না, লেখার জায়গাও নেই | M | দরকারি |
| 27 | চেকআউটের ঘর: কোন ঘর থাকবে, ক্রম, নোট বক্স, উপহার মোড, সাহায্য বাটন, কনফার্ম স্টাইল | চেকআউট | কী আছে (`checkout.fieldOrder`, `.gift`, `.note`, `.help`, `.confirm.style`); admin-guide বলছে "উপহার মোড, অ্যাডমিন পাতা পরে আসবে"। শিরোনাম/লেবেল Words-এ আছে | M | দরকারি |
| 28 | ধন্যবাদ পেজ: উদযাপন, লুক পুরো করার সাজেশন, আপসেল | অর্ডারের পরের পেজ | কী আছে (`thanks.celebrate`, `.look`, `.upsell`); শুধু ছোট একটা সুইচ আছে (`thanks.page`) | S | পরে |
| 29 | ব্যাগ: ড্রয়ারের স্টাইল, আপসেল স্টাইল/সংখ্যা, "নিরাপদ পেমেন্ট" লাইন, WhatsApp সাহায্য, ফ্রি-ডেলিভারি বার | ব্যাগ আর "ব্যাগে রাখা হলো" প্যানেল | কী আছে (`bag.*`, 29টা); শুধু ট্যাব-টিয়ার বক্স (Combos › Bag box) আর কয়েকটা সুইচ আছে | M | পরে |
| 30 | কাস্টমার অ্যাকাউন্টের ট্যাব, অফার ব্যানার, ট্র্যাকিং স্বাগত লেখা, কোডের লেখা | "আমার অ্যাকাউন্ট" | কী আছে (`account.tabs`, `.offerBanner`, `.track.welcome`, `.code.text`), স্ক্রিন নেই | M | পরে |
| 31 | সার্চ: জনপ্রিয় খোঁজ, সমার্থক শব্দ ("tee" = "t-shirt"), সাহায্য লেখা, রেজাল্ট প্যানেল | সার্চ বক্স আর সার্চ পেজ | কী আছে (`search.words`, `.help`, `.results`, `.panel`); শুধু সার্চ রিপোর্ট (পড়ার) আছে | M | দরকারি |
| 32 | মুদ্রা, সংখ্যার ধরন (বাংলা অঙ্ক), ভাষা সুইচের ডিফল্ট, সময় অঞ্চল, লোকেল | দাম, তারিখ, ভাষা বদল | কী আছে (`store.currency`, `store.locale`, `language.bengali.digits`, `store.timeZone`), স্ক্রিন নেই | S | পরে |
| 33 | ইমেইলের চেহারা: লোগো, হেডার/ফুটার, রং | সব ইমেইল (অফার, অর্ডার) | কোডে বাঁধা সরল HTML; শুধু লেখা বদলানো যায়, চেহারা না | M | পরে |
| 34 | ইনভয়েসে লোগো, দোকানের নাম-ঠিকানা-ফোন | ইনভয়েস (প্রিন্ট ও ছবি) | ইনভয়েস সেটিং আছে, কিন্তু লোগো/নাম/যোগাযোগ আসে সেই #1–#6 থেকে, যেগুলোর স্ক্রিন নেই | S | দরকারি (1–6 হলেই ঠিক) |
| 35 | কুকি ব্যানার (সম্মতি) | প্রথম ভিজিটে নিচে | কোডে নেই। কুকি পলিসি পেজ আছে, ব্যানার নেই; ব্লুপ্রিন্টেও আলাদা করে বলা নেই | M | পরে |
| 36 | ওয়েবসাইট "অ্যাপ" আইকন/ম্যানিফেস্ট (হোম স্ক্রিনে যোগ করলে নাম আর আইকন) | ফোনে "Add to Home screen" | দোকানের জন্য নেই (শুধু সাপোর্ট অ্যাপের আছে) | S | পরে |

(মোট 36 সারি। প্রথম 8টা + #11 + #25 একসাথে করলেই "মালিক কোড ছাড়া দোকান চালু করতে পারে" মোটামুটি পূর্ণ হয়।)

## সাজেশন: কীভাবে ভাগ করা যায় (আলোচনার জন্য, কিছু শুরু হয়নি)

- **ভাগ ক: "দোকানের তথ্য" পূর্ণ করা** (#1–#7, #10, #34): নাম, লোগো ছবি (আর হেডারে বসানো), ফেভিকন, যোগাযোগ, খোলার সময়, সোশ্যাল, স্লোগান। প্রায় সব সেটিং কী তৈরিই আছে, তাই মূলত একটা স্ক্রিন। সবচেয়ে বেশি ফল, কম কাজ।
- **ভাগ খ: ক্যাটাগরি/কালেকশন + ট্যাগ-ব্যাজ + পেমেন্ট মেথড** (#11, #23, #25, #26, #27): দোকান চালানোর সরাসরি জিনিস।
- **ভাগ গ: সাইট বিল্ডার (থিম, মেনু, হেডার, ফুটার)** (#9, #12–#16, #17): বড় কাজ; ব্লুপ্রিন্ট PR 598।
- **ভাগ ঘ: পেজের ভেতরের সেটিং স্ক্রিন** (#18–#22, #24, #28–#31): প্রোডাক্ট, ক্যাটাগরি, ব্যাগ, সার্চ, অ্যাকাউন্ট।
- **শেষে:** #8 (শেয়ার প্রিভিউ ছবি), #32, #33, #35, #36।

---

# Appendix (English): evidence and file paths

## A. How the gap was established
- Registry keys: 923 `'<key>': setting(` entries across `packages/settings/src/registry*.ts`. 566 have no string-literal reference in any admin-related source (`apps/web/src/**` paths containing "admin", tests excluded). Storefront-relevant ones were then checked by hand against their writers.
- Admin settings API is read-only: `apps/web/src/app/api/admin/settings/route.ts` (GET only; "never carries owner data"). Writes today go through `packages/settings/src/cli.ts set` (see `docs/admin-guide/login.md:92`).
- Storefront reads the keys in `apps/web/src/lib/shop/context.ts` (lines ~22-81: `store.name`, `brand.*`, `theme.*`, `contact.*`, `social.*`, `shell.*`, `home.*`, `slider.engine`, `language.*`).
- Eye toggles (`packages/settings/src/eye-toggles.ts`, admin `components/admin/website/EyeList.tsx`) cover only yes/no values; its header says list items (menu links, footer columns) "are shown and hidden in that list's own editor", and no such editor exists.
- Page edit (`apps/web/src/lib/website/page-edit-model.ts`) only writes `EDIT_KEYS = home.sections, home.hero, home.heroSlides, home.categories, home.newIn, home.reviews, layout.category, layout.product, layout.blocks`. Nothing from `shell.*`, `brand.*`, `theme.*`, `contact.*`, `pdp.*`, `category.*`.
- Shop text is clean: a grep for hardcoded JSX text/attributes in `components/shop` and `app/(shop)` found nothing; words go through `c.t()` and the Words editor (`lib/website/words-admin.ts`, `language.labels`). So the gaps are structure, links, images, colours and numbers, not wording.

## B. Row evidence (row # -> files)
- 1-5, 34: `apps/web/src/app/admin/settings/store/page.tsx` (legal fields only; header comment: "The rest of SET-01 (name, logo, contacts, social links) joins with its PR"); `apps/web/src/lib/admin-store/service.ts` (`LEGAL_FIELD_IDS`); registry `registry.ts` (`store.name`, `contact.*`, `social.*`, `brand.*`). Promised: `docs/BACKEND-ARCHITECTURE.md:1403` (SET-01), `docs/MASTER-REGISTER.md:1360` ("PR 383 ... built in 705 (wave 5)") and `:2305` (PR 705 lists store details), but the merged PR 705 row (`:731`) lists only People, Roles, Activity log. `docs/owner/PARKED.md` section 5 and `BLOCKED.md` row 24 tell the owner to type phone/address in the admin; the screen cannot take them. Readers: `components/shop/StoreHeader.tsx`, `StoreFooter.tsx`, `MessengerButton.tsx`, `lib/shop/help-data.ts`, `lib/shop/invoice-load.ts`, `lib/seo/shop-ld.ts`, `app/llms.txt/route.ts`, `components/shop/product/ProductPage.tsx`, `PdpQa.tsx`.
- 6: `brand.logo` is read only by `lib/admin-invoices/print.ts` and `lib/seo/shop-ld.ts`; header uses `components/shop/LogoText.tsx` (text wordmark). 7: `app/favicon.ico/route.ts` reads `brand.favicon`; no upload UI. 10: `brand.logoPhone` has zero readers.
- 8: `lib/shop/meta.ts` `shopMetadata()` builds `openGraph` without `images`; no `opengraph-image` file under `apps/web/src/app`. `lib/admin-health/audit-checklist.json:2059` lists "og:image set" as a check.
- 9: `theme.*` read in `lib/shop/context.ts`, `lib/shop/theme.ts`, favicon route; no admin writer. (Look snapshots in `lib/website/look-model.ts` save/restore but do not edit.) Blueprint D10.4 "theme tokens (colours, fonts, spacing) with an AA contrast block".
- 11, 23: `lib/catalogue-api.ts` header (`GET/POST /api/admin/catalogue/categories`), `lib/catalogue-merch-api.ts` (collections); no `.tsx` calls `catalogue/categories|collections|tags|brands|garment-types|fabrics|sizes`; only `ProductForm.tsx` calls `catalogue/colours`. Badge = first live tag name: `lib/shop/catalogue.ts:200`, `lib/shop/home-model.ts:71 cardBadge`.
- 12-15: `packages/settings/src/registry-storefront.ts:737-818` (`shell.announce|header|menu|desktopNav|footer`), `registry-shop-more.ts:332,390` (`shell.fab`, `shell.menuSubs`); builders `lib/shop/shell-model.ts` (`footerColumns`, `footerDeskColumns`, `liveAnnouncements`); only `eye-toggles.ts` references them in admin land. Blueprint: `docs/BLUEPRINT.md:6564` (D10.4 Site builder, "paused"), `:226` (PR 598), `docs/admin-guide/site.md`, `docs/admin-guide/pages/website/index.md:37`.
- 16, 20: `shell.announce.rotateSeconds`, `slider.engine` have no admin reader.
- 17: `packages/settings/src/registry-layout-blocks.ts:52` banner = eyebrow/title/text/cta/href/tone/product; no media field.
- 18: `home.flashSale`, `home.flashRows` read in `lib/shop/flash.ts`; `docs/admin-guide/site.md:26` "স্ক্রিন পরে আসবে".
- 19: `page-edit-model.ts:113-115` (slides count, speed, in-stock only).
- 21, 22, 24, 28-31: `docs/admin-guide/site.md:29,39` ("স্ক্রিন পরে আসবে, CN-019"); keys read in `app/(shop)/(store)/collections/[slug]/page.tsx`, `search/page.tsx`, `components/shop/product/ProductPage.tsx`, `lib/shop/thanks-look.ts`, `lib/shop/account-view.ts`, `lib/shop/bag.ts`, `packages/search/src/engine.ts` (`search.words`). `docs/admin-guide/combos.md:102` ("ধন্যবাদ পেজে লুকটা পুরো করুন ... অ্যাডমিন পাতা পরে আসবে").
- 25, 26: `lib/go-live-api.ts:78-82` only reads `checkout.pay.*`; `packages/checkout/src/payment.ts` reads them; `payment.wallet.numbers`/`payment.bank.accounts` appear only in `registry.ts` and tests.
- 27: `docs/admin-guide/pages/orders/index.md:31`, `docs/admin-guide/orders.md:179` (gift mode "অ্যাডমিন পাতা পরে আসবে"); `packages/checkout/src/place.ts`, `components/shop/checkout/CheckoutPage.tsx`.
- 32: `store.currency|locale|timeZone` and `language.bengali.digits` are only read.
- 33: `packages/messages/src/email-html.ts` builds plain HTML (only an unsubscribe footer); no logo or layout setting.
- 35: no cookie banner component anywhere in `apps/web/src`; 36: web manifest exists only under `app/admin/support/app.webmanifest/route.ts`.

## C. Not counted as gaps (checked, an editor exists)
`/admin/website/{words,layouts,eye-toggles,side-canvas,policies,page-edit,launch-default,seo,seo/redirects,seo/categories,seo/bengali}`, `/admin/rules/notices`, `/admin/settings/{policies,shimmer,store (legal only)}`, `/admin/orders/packing/invoices` (5 invoice keys), `/admin/messages/{templates,email}`, `/admin/delivery/{zones,settings}`, `/admin/size-charts`, `/admin/products/{faqs,reviews,questions}`, `/admin/marketing/{landing,seasonal}`, `/admin/combos/bag-box`, `/admin/support/settings` (`contact.messenger`).
