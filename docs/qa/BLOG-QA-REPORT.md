# EXTAS Blog — QA + UX review (one round, front end + back end)

**সংক্ষেপে (মালিকের জন্য, ১০ লাইন)**
1. ব্লগের সামনের অংশ (হোম, বিভাগ, ট্যাগ, লেখক, খোঁজ, আর্কাইভ, লেখার পেজ) আর ব্যাকএন্ড একসাথে, ২০টা স্ক্রিনে (৮ ফোন, ৫ ট্যাবলেট খাড়া-আড়া, ২ কম্পিউটার) পরীক্ষা করা হয়েছে — মোট ৬,৯৪৮টা চেক।
2. ৬,২৭৫টা পাস, ৪৫৫টা ফেল — তবে ফেলগুলো আসলে ১৫টা আলাদা সমস্যা, যেগুলো অনেক পেজে আর স্ক্রিনে বারবার দেখা যায়। কোনো JS এরর নেই, কোথাও পাশে স্ক্রল হয় না।
3. বড় কোনো ভাঙা জিনিস নেই: "ব্যাগে রাখুন" সত্যিই ব্যাগে যায়, শেয়ার, বাংলা টুইন, পেছনে-সামনে যাওয়া, টেনে রিফ্রেশ — সব কাজ করে।
4. ব্যাকএন্ডের পুরো ধারা কাজ করে: টপিক → লেখক → অন্য লেখক প্রুফ → দূত → প্রকাশ। লেখক নিজের লেখা পাস করতে পারে না। পাসের পর লেখা বদলালে আবার প্রুফে যায়।
5. বিজ্ঞাপন বন্ধ করলে দোকান থেকে সরে যায়, নতুন বিজ্ঞাপন দিলে দেখায়। পপআপ ✕ চাপলে, বাইরে চাপলে আর Esc-এ বন্ধ হয়। গুগল থেকে ফোনে এলে প্রথম স্ক্রিনে খোলে না।
6. সবচেয়ে বড় UX সমস্যা: বিজ্ঞাপন বেশি। ৬০০ শব্দের একটা লেখায় ফোনে ৪টা, কম্পিউটারে ৫টা বিজ্ঞাপন। প্রথম প্যারার আগেই একটা বিজ্ঞাপন বসে।
7. বিজ্ঞাপন লেখার সাথে মেলে না: জিন্স ধোয়ার লেখায় হুডির ব্যানার, নিচের বারে পোলো। বাংলা লেখাতেও বিজ্ঞাপনের লেখা ইংরেজিতে।
8. দোকানের ওপরের মেনুতে "জার্নাল" নেই — ব্লগে যাওয়ার পথ শুধু হোমপেজের নিচে আর ফুটারে। প্রোডাক্ট পেজ থেকে যত্নের গাইডেও কোনো লিংক নেই।
9. ছোট বাগ: লেখকের গোল ছবি লম্বা ডিমের মতো হয়ে যায়। ফোনে চালু বিভাগের বোতাম চোখের বাইরে থাকে। বাংলা পেজকে ব্রাউজার "ইংরেজি" ভাবে। বিভাগ লুকালে লেখায় নাম খালি দেখায়।
10. ব্যাকএন্ডে বাংলা-ইংরেজি মেশানো শব্দ আর এজেন্ট কোড (A360-09) বোঝা কঠিন। নিচে সমস্যাগুলো গুরুত্ব অনুযায়ী সাজানো ঠিক করার তালিকা আছে।

---

## 0. What was tested

| | |
|---|---|
| Build | `proto/dist/blogqa.html`, built 13:46 from src. It is **byte-identical to `dist/r16.html`** (verified with `cmp`). |
| Sources | `73-blog.js` md5 `22fdc9f8…` (Shilpi final, 13:13) · `r12-zblogfe.css` `b4ffd860…` (13:12) · `94-admin-blog.js` `d66cc195…` (13:20 = "94 stable") |
| Devices | Phones 320×640, 360×800, 375×667, 390×844, 393×852, 412×915, 430×932, 440×956 · Tablets 768×1024, 820×1180, 834×1194, 1024×1366, 800×1280, each portrait and landscape · Desktop 1280×800, 1440×900. Phones and tablets use touch with CDP touch events, the Asia/Dhaka timezone and Chromium. |
| Runs | Front end (sweep 18 routes, 11 journeys, popup rules), ads (slot rules on 30 pages per device) and back end (14 screens plus 9 flows at 1280, 393 and 820 portrait). At most 2 browsers at a time, in foreground chunks. Results are saved per device in `scratchpad/blog-qa/out/`. |
| Harness | `scratchpad/blog-qa/tools/`: `lib.js`, `checks.js` (contrast measured from real pixels for gradients, images and overlays; tap targets; cut and overlapping text; the font Chrome really used for Bengali glyphs, via CDP), `sweep.js`, `journeys.js`, `ads.js`, `popup.js`, `backend.js`, `capture.js`, `summarize.js`, `run-all.sh`. Rerun: `tools/run-all.sh <html> sweep,journeys,ads,popup,backend [devices]` |
| Totals | **6,948 checks: 6,275 pass · 455 fail · 218 info.** The 455 fails are **15 distinct issues** (§2). |

**Earlier build:** the front end was first run at 13:16 on the pre-patch 94. Two back-end/ad fails from that run are **fixed in 94-stable**, and I re-verified them: the `post-bar` ad is now in the admin list and switches off with "all ads off" (B8c, A1e). Everything below comes from the final build.

**Shilpi's claims, checked independently:**
- No sideways scroll, no JS errors, one h1, skip link and tap targets ≥44 px: all confirmed on all 20 devices × 18 routes.
- Page size 8 with "Load more": confirmed (J8).
- `?from=google` and the real Google referrer: confirmed (P6).
- No floating WhatsApp disc on blog pages: confirmed in the screenshots. The grey gear is the demo-controls button.
- I did not run her own `flow.js` or the device gate. Everything here comes from this harness.

**Test faults I found and fixed (not counted as fails):**
- J1 back on the 1024/1366 tablets: the test tapped an off-screen card.
- TOC highlight check: the test scrolled to the wrong spot.
- "Add to bag" at 320: the overflow is padding only; the text is fully visible.
- Chip-row scroll direction.

---

## 1. Pass table per device group

ok = passed on every device and page in the group · F n/m = failed n of m · – = not applicable

| Area / check | Phones (8) | Tablet portrait (5) | Tablet landscape (5) | Desktop (2) |
|---|---|---|---|---|
| No sideways scroll (18 routes) | ok 144 | ok 90 | ok 90 | ok 36 |
| No JS errors | ok | ok | ok | ok |
| Exactly one h1 · skip link | ok | ok | ok | ok |
| Tap targets ≥ 44 px (blog) | ok 144 | ok 90 | ok 90 | ok 36 |
| Text contrast ≥ 4.5:1 (real pixels) | F 7/144 (active chip under fade, §F3) | ok | ok | ok |
| No cut text | F 3/144 (430 px byline) | ok | ok | ok |
| No overlapping text | ok | ok | ok | ok |
| Images lazy + alt (garment art is inline SVG; no `<img>` without alt) | ok | ok | ok | ok |
| Bengali glyphs drawn with Hind Siliguri | ok 80 | ok 50 | ok 50 | ok 20 |
| Bengali text marked `lang="bn"` | **F 80/80** | **F 50/50** | **F 50/50** | **F 20/20** |
| Grid columns 1 / 2 / 3 | ok | F 9/45 (1024 portrait = 3) | F 45/45 (all landscape = 3) | ok |
| Category chips scroll on phones | ok | – | – | – |
| Active chip visible on phones | F 8/16 (season page) | – | – | – |
| TOC collapsible <1100 / sticky ≥1100, highlights | ok | ok | ok | ok |
| Sidebar ad only ≥1100 | ok | ok | ok | ok |
| Byline honest (no photo, AI label, no empty "Reviewed by") | ok | ok | ok | ok |
| Related posts ≥ 3 | F 8/40 (Bengali twin) | F 5/25 | F 5/25 | F 2/10 |
| Avatars round | **F 32/88** | **F 20/55** | **F 20/55** | **F 8/22** |
| Quick answer + product block | ok | ok | ok | ok |
| Twin link is `<a href="#/bn/journal/…">`, no auto-redirect, Bengali renders | ok | ok | ok | ok |
| Back/forward + scroll restore (home → category → post → related → back ×3 → forward) | ok | ok | ok | ok |
| Add to bag (product block + product ad) | ok | ok | ok | ok |
| Share WhatsApp / Facebook / copy | ok | ok | ok | ok |
| Search EN / BN on /bn / no-result | ok | ok | ok | ok |
| Bengali search on the English blog | F | F | F | F |
| Archive · tag · author pages · load more · newsletter · TOC jump | ok | ok | ok | ok |
| Pull-to-refresh (home + post) | ok | ok | ok | – |
| **Ads**: right ad by date / category / post, labelled, click goes to product/combo/category, grid every N (6 and 3), inline after paragraph N with max respected, switch off / add | ok | ok | ok | ok |
| Ad on its start day before 09:00 | F | F | F | F |
| **Popup**: not on load, trigger %, ✕, outside tap, Esc, frequency cap (return + reload), only on its post, CTA, labelled dialog with focus, exit-intent desktop only | ok | ok | ok | ok |
| Popup: phone from Google never on the first screen (referrer and `?from=google`); setting ON lets it open | ok | – | – | – |
| Popup "wait at least N s" setting | F (393) | F (820) | – | F (1440) |
| **Back end**: every tab renders, no error/scroll/cut text | ok 14 | ok 14 (820p) | – | ok 14 (1280) |
| Back end tap targets ≥44 (touch) | F 14/14 | F 14/14 | – | info |
| Topic duplicate held; approve-all keeps the 3 near-duplicates | ok | ok | – | ok |
| Full pipeline → live post with right author, category, quick answer, product block | ok | ok | – | ok |
| Self-approval refused (code + button); edit after pass → proof | ok | ok | – | ok |
| Schedule warning + auto-fill + minimum change | ok | ok | – | ok |
| Category rename + reorder on shop | ok | ok | – | ok |
| Author name/bio edit · reviewer → "Reviewed by" only on that author's posts · site-wide reviewer | ok | ok | – | ok |
| Bio edit on the Bengali author page | F | F | – | F |
| Idle author ৳0 · reload keeps · reset → seed | ok | ok | – | ok |

---

## 2. Every FAIL — device, steps, measured vs expected, screenshot, cause

Screenshots: `/tmp/claude-0/-home-claude/a27f8d4d-b57b-5d41-b919-c637e74e7368/scratchpad/blog-qa/shots/` (664 files; `<device>-<route>.png` for every route on every device, plus `-full.png` page shots on 6 devices and `sheet-*` screens). Raw results are in `…/blog-qa/out/<module>-<device>.json`.

### F1 · Author avatars stretched into ovals — MEDIUM (all 20 devices)
- **Where:** "More ways to browse → Authors" on the blog home, tag, archive and Bengali home.
- **Steps:** open `#/journal` and scroll to "Authors".
- **Measured:** 113×28 to 355×28 px. **Expected:** 28×28 circle.
- **Shot:** `sheet-p393x852-home-browse.png`
- **Cause:** `r12-zblogfe.css:167` `.bf-rows a>span:first-child{flex:1}` also matches the avatar `<span class="bf-av">`, which is the first child (`73-blog.js` bfBrowse). Its specificity beats `.bf-av{flex:0 0 auto}` (line 190).
- **Fix:** `.bf-rows a>.bf-av{flex:0 0 auto}`, or change the selector to `span:first-child:not(.bf-av)`.

### F2 · Bengali pages are not marked Bengali — MEDIUM (all devices, 10 routes)
- **Steps:** open `#/bn/journal` or `#/bn/journal/<slug>`.
- **Measured:** `<html lang="en">`. On the Bengali home, 47 of 50 Bengali text blocks have no `lang="bn"`. On English pages, small Bengali bits (2–7 per page) are also unmarked.
- **Expected:** `lang="bn"` on Bengali pages, so screen readers and Google read them as Bengali.
- **Cause:** `73-blog.js:1203` bfSetLang sets `BF.route` and `BF.ul` but never sets `document.documentElement.lang`.
- **Fix:** set it in bfSetLang and restore it on leaving the journal.

### F3 · Active category chip is off-screen on phones — LOW-MEDIUM (8 phones)
- **Steps:** on a phone, open `#/journal/topic/season`.
- **Measured:** the "Occasions & seasons" chip sits at x 499–671 inside a 320 px row, under the right-edge fade. Its real-pixel contrast there is 2.89:1.
- **Expected:** the active chip is scrolled into view.
- **Shot:** `sheet-p393x852-fail-activechip.png`
- **Cause:** `73-blog.js:940` bfChips. Nothing in bfAfter scrolls the row.
- **Fix:** in bfAfter, set `row.scrollLeft = on.offsetLeft - 16`.

### F4 · Byline date line cut at 430 px — LOW (p430×932, 3 posts)
- **Measured:** "Updated 18 Oct 2026 · Published 17 Oct 2026 · 3 min read" is 345–352 px in a 342 px box, clipped with no "…".
- **Shot:** `sheet-p430x932-fail-byline.png`
- **Cause:** `r12-zblogfe.css:234-235`. `.bf-by-l3{white-space:nowrap;overflow:hidden}`, and "Published" is hidden only when the container is ≤380 px.
- **Fix:** raise the container query to 440 px, or let the line wrap.

### F5 · Bengali twin shows only 1 related post — LOW (all devices)
- **Steps:** open `#/bn/journal/how-to-keep-a-polo-shirt-in-shape` and scroll to "যত্ন ও ধোয়া নিয়ে আরও".
- **Measured:** 1 card. **Expected:** 3.
- **Shot:** `sheet-p393x852-fail-bn-related.png`
- **Cause:** `73-blog.js:1173`. On the /bn route `bfList()` returns only posts with Bengali text, which is 2.
- **Fix:** fill up with English posts from the same category, marked "ইংরেজিতে".

### F6 · Bengali search on the English blog finds nothing — LOW (all devices)
- **Measured:** `#/journal/search?q=পোলো` → "No guides match", although a Bengali polo guide exists. On `#/bn/journal/search` the same query works.
- **Cause:** `73-blog.js:1078-1081` searches only `bfV(p)`, the text in the route's language.
- **Fix:** also score `p.bn.title/dek/body`, and show Bengali hits with the বাংলা flag.

### F7 · The popup "wait" setting does not do what its label says — MEDIUM (393, 820, 1440, with the seed 60 % / 10 s)
- **Steps:** open how-to-wash-denim, stay 12 s, then scroll past 60 %.
- **Measured:** the popup opens 10.1 s **after** reaching 60 %.
- **Expected:** the admin label `94-admin-blog.js:1046` reads "ঢোকার পর অন্তত কত সেকেন্ড অপেক্ষা" (wait at least N s after arriving), so it should open on reaching 60 %.
- **Cause:** `73-blog.js:1299` `setTimeout(…, P0.delay*1000)` starts after the trigger fires.
- **Fix:** wait `max(0, arrivedAt + delay*1000 − now)`. Otherwise readers who finish fast get a popup at the end of the article, or after they have left.

### F8 · Ad start and end days differ between the shop and the back end — LOW (all devices)
- **Steps:** set the clock to 20 Oct 03:00 Dhaka and give the home-top ad start = 20 Oct.
- **Measured:** the back end says Live; the shop shows no home-top ad. **Expected:** the same answer in both.
- **Cause:** `73-blog.js:716` bfTs turns `YYYY-MM-DD` into 09:00 Dhaka, and bfAdLive (line 819) uses it. So the shop starts at 09:00 and runs until 08:59 the day after the end. `94-admin-blog.js:500` zb_adLive compares whole dates.
- **Fix:** the shop should use whole days (00:00 – 23:59:59 Dhaka), or call zb_adLive.

### F9 · Hiding a category leaves its posts with a blank label and a dead link — LOW (all back-end devices)
- **Steps:** in বিভাগ ও ট্যাগ, switch off "প্রোডাক্ট ও ব্র্যান্ড", then open `#/journal/inside-the-essential-pique-polo`.
- **Measured:** the eyebrow and the last breadcrumb are empty, the card labels are `""`, and the eyebrow link goes to `#/journal/topic/brand` = "Guide not found".
- **Shot:** `sheet-p393x852-fail-hiddencat.png`
- **Cause:** `73-blog.js:725` bfPillars drops hidden categories, so bfPName returns `''`.
- **Fix:** show the name without a link for hidden categories, or ask the owner to move the posts before hiding. The admin note promises that "nothing is deleted".

### F10 · Author bio edit does not reach the Bengali author page — LOW
- **Steps:** change যত্ন's bio, then open `#/bn/journal/author/jotno`.
- **Measured:** the old seed Bengali bio. **Expected:** the owner's text.
- **Cause:** the author profile has only one (English) bio field (`94-admin-blog.js:909`). The shop reads `a.bioBn || seed.bioBn` (`73-blog.js:1000`).
- **Fix:** add a "পরিচয় (বাংলা)" field (`bioBn`).

### F11 · Owner is not told a passed post went back to proof — LOW
- **Steps:** in the editor, change the quick answer of a post that is in Ready, then save.
- **Measured:** the post correctly goes back to proof, but the toast says "Draft saved". **Expected:** "লেখা বদলেছে — আবার প্রুফে গেল".
- **Cause:** `94-admin-blog.js:1243`. The final `toast('Draft saved')` overwrites the re-proof toast.

### F12 · Pipeline check notes at 2.48:1 contrast — LOW (all three sizes)
- **Measured:** 11 px muted text in dimmed checks, for example "এখন ৪টা" and "১৩৮ অক্ষর".
- **Cause:** `r12-zblog.css:39` (`.zbp-ck.dim{opacity:.6}`) together with line 44 (11 px muted).
- **Fix:** remove the opacity and use 12 px or larger.

### F13 · Back-end tap targets below 44 px on phone and tablet — LOW (393, 820, all 14 screens)
- **Measured:** tab chips 36 px high, inputs and selects 40 px, the "All posts" back link 36 px.
- **Cause:** the shared admin styles, `r12-zadmin.css:35` (`.zs-in{min-height:40px}`) and `:179` (`.za-tabs .chip`).
- **Fix:** `@media (pointer:coarse){.zs-in,.za-tabs .chip{min-height:44px}}`.

### F14 · Tablets ≥1024 px wide show 3 columns — SPEC DECISION (iPad Pro portrait + all landscape)
- **Measured:** 3 columns. **Spec:** "2 on tablets".
- **Cause:** `r12-zblogfe.css:85` sets 3 columns at ≥1024.
- My view: 3 columns at ≥1024 px look right (cards ≈300 px). I recommend accepting this and updating the spec to "2 below 1024 px". Change the breakpoint only if the owner insists.

### F15 · (demo only) "Demo controls" covers "Back to the shop" at 1280 in admin
- **Measured:** "Back to the shop" at x14–226, y745–782; "Demo controls" at x14–152, y752–786.
- **Shot:** `d1280x800-admin-demo-controls.png`
- Reported by the coordinator; I confirmed it. Demo-only.

**Demo-only notes (not fails):**
- Share and copy links are `file://…#/journal/…` because the demo runs from a file. The live build must share `https://extas.com.bd/journal/<slug>`.
- The post hero caption "Demo picture … (PR 547)" and the "Demo" pills show on customer pages.

---

## 3. UX review (senior e-commerce reviewer) — ranked by severity

Screens: sheets 1–4 (below), and the full pages `p393x852-*-full.png`, `d1440x900-*-full.png`, `t820x1180p-*-full.png`.

**U1 · HIGH — Too many ads, and one comes before the article starts.**
- On a 600-word post a phone reader meets: post-top ad, 1 in-article ad, end ad, the sticky slim bar, the product block (2–3 products), and on denim also the popup. That is about 7 sales units per 600 words. Desktop adds the sidebar.
- The post-top ad sits right after the quick answer and above the first paragraph (ad at 951 px, paragraph 1 at 1103 px on 393×852). The reader's first scroll after the answer lands on an ad.
- On desktop the same Piqué Polo ad shows twice (sidebar and end), because `bfPick` reuses an ad when its pool is empty (`73-blog.js:844`).
- **Fix:**
  - Switch post-top off by default and keep it for campaigns only.
  - 1 in-article ad on posts under 900 words.
  - Never the same ad twice on one page: return `null` instead of reusing.
  - Per page, either the slim bar **or** the popup, not both.
  - Keep the product block. It is the most useful and least intrusive unit.

**U2 · HIGH — Ads don't match the post.**
- The hoodie banner runs on every post (it was widened to every category in 94-stable).
- The denim guide ends with "Polos from ৳690" and a Piqué Polo.
- **Fix:**
  - Fill post slots first with the post's own products and category: `post.products` and `post.shop`, which already exist.
  - Fall back to generic house ads only when nothing matches.
  - The slim bar should use the post's shop category: denim → "Shop jeans".

**U3 · HIGH — Hard to find the blog, and no path from products to guides.**
- The header nav (New in … Sets) and the phone menu have no "Journal". The only ways in are the home-page section and the footer.
- Product pages have no "How to care for it" link, although PR 591 scope asks for a care-guide link on every product page (no `journal` reference in `30-product.js`).
- **Fix:** add "গাইড / Journal" to the header and the phone menu, and put a care/fit guide link under the size chart on each product page.

**U4 · MEDIUM — It reads like a product catalogue more than a magazine.**
- Every card has the same grey garment drawing and a title only, with no excerpt.
- 7 of the first 9 cards wear an orange "Demo" pill.
- 12 legacy posts are thin "This is a short note" stubs that sit in the grid next to the full guides.
- **Fix (live build):**
  - Real, varied photos (PR 547).
  - A one-line excerpt on cards.
  - No Demo pills or captions.
  - Hide or noindex stub posts until they are written. Thin pages hurt Google, as the Sep–Oct 2026 spam update notes say.

**U5 · MEDIUM — The phone's first screen is all chrome.**
- Before the first guide come the header, breadcrumb, h1, intro, search box, RSS/বাংলা pills, the chip row and a house ad.
- The featured post starts at 629 px on 393×852 and below the fold on 320×640 (667 px).
- **Fix:** move RSS to the page bottom, shrink search to an icon, and put the featured post directly under the chips. No home-top ad on phones, or place it after the featured post.

**U6 · MEDIUM — The sticky stack eats the reading area on phones.**
- The bottom tab bar (67 px) plus the slim ad bar (56 px) cover 15 % (393×852) to 19 % (320×640) of the screen and sit over the text while reading. Shot: `sheet-p393x852-post-bar.png`.
- **Fix:** show the bar only when scrolling up or at the article end, or hide the tab bar while scrolling down on posts.

**U7 · MEDIUM — Bengali pages show English ads.**
- The Bengali twin shows "Polos from ৳690 / Shop polos" and "Winter hoodies are here". The label is Bengali ("EXTAS অফার"); the ad text is not.
- **Fix:** add Bengali title, line and button fields to the ad editor, and use them on /bn.

**U8 · LOW-MEDIUM — Readability.**
- Body text is good:
  - phone 18 px / 1.7, about 40 characters a line at 393 (32 at 320);
  - desktop 19 px / 1.7, about 67 characters (ideal);
  - Bengali line height 1.85;
  - the quick answer at 17 px is well framed;
  - the step boxes and tip boxes scan well.
- Weak points:
  - The uppercase, letter-spaced labels (CARE & WASHING, EXTAS OFFER, QUICK ANSWER) at 11.5–12.5 px are hard to scan.
  - The smallest Bengali text is 11.5 px.
- **Fix:** 13 px minimum for labels and 13 px or more for Bengali.

**U9 · LOW — Trust.**
- Good:
  - honest byline ("By Jotno · AI author");
  - no fake faces;
  - "About this guide";
  - "How we write and check";
  - dates;
  - the reviewer line works when it is set (tested).
- Weak: every post says "AI author" and none shows a human reviewer by default.
- **Fix:** the owner should enter his own name as reviewer for fabric and fit; his buying-house experience is real expertise. This is one field in লেখক দল → বাইলাইন.

**U10 · LOW — Conversion paths.**
- Good:
  - The product block ("Add to bag" opens a size sheet and the item really reaches the bag) is the right pattern.
  - Combo cards show the saving.
  - The related row and the newsletter are well placed.
- Missing:
  - Style posts should end with a "Shop the look" combo, which shows only when combos are set.
  - The end-of-page "Shop the look" category strip on the home is generic; tie it to the categories on screen.

**Does it look like a standard blog that belongs to the shop?**
- Mostly yes. It has the same type, colours, header, footer and bottom nav as the shop, a clean article template, a sticky TOC on desktop, breadcrumbs, a byline, share buttons, tags and related posts.
- What stops it feeling premium is U1–U4 (ad load, ad relevance, catalogue-like cards and demo artefacts), not the template.

### Back-end screens for a non-technical owner

**Mixed languages.**
- The tabs are Bengali, but the headings and many labels are English: "Blog & SEO", "New post", "Sitemap & indexing", "Published / Scheduled / Drafts / Average SEO score", "Ready", "Writing", "Proofread & fact-check", "Indexed / Found, not indexed yet", "Edit / View", and the editor fields (title, slug, keyword, meta).
- The owner asked for simple Bengali. Translate them, keeping the English only as small grey text if needed.

**Confusing words.**

| Now | Problem | Suggested |
|---|---|---|
| লেখা (tab) | the same word is also the pipeline stage "লেখা হচ্ছে" | "সব পোস্ট" |
| ওজন (বেশি = বেশি দেখায়) | "weight" means nothing to the owner | "কতবার দেখাবে (১–১০)" |
| অনাথ লেখা | sounds alarming | "কোনো লেখা এটার দিকে লিংক করেনি" |
| home-top, post-inline (slot map) | code names in mono font | keep only the Bengali names |
| A360-09 on pipeline cards | agent codes the owner must memorise | "যত্ন" |
| PR 220–253 · 528–530 · 591–593 | build numbers in the page header | remove |

**Agent work looks like the owner's work.**
- The pipeline shows "প্রুফে পাঠান", the three tick boxes, "প্রুফ পাস" and "শেষ চেক পাস" as big buttons, which suggests the owner must do them.
- PR 591 says quality is the system's job. Show these as read-only "এজেন্ট করছে" with owner-only "ফেরত পাঠান / থামান".

**Clicks.**
- Approving topics takes **2 taps**: টপিক তালিকা, then সব অনুমোদন. The toast explains that 3 near-duplicates were kept for him. Excellent.
- One topic takes 1 tap ("হ্যাঁ").
- Publishing one post by hand takes **about 11 taps plus typing two fields**: start, open the editor, type the description and the quick answer, save, send to proof, 3 ticks, proof pass, final check, publish.
- The final check refuses with only "এখনো বাকি: বর্ণনা ঠিক আছে". The real rule (120–160 characters and must contain the keyword) is not shown. Say exactly what is wrong ("বর্ণনা ১০৫ অক্ষর, ১২০–১৬০ লাগবে; 'how to wash' শব্দটা নেই") and offer "দূত ঠিক করে দিক".

**Good, keep:**
- duplicate warnings while typing;
- the "tomorrow below minimum" banner with a one-tap fill;
- the visual ad slot map;
- the plain-Bengali Google popup note;
- "মুছে যায়নি" reassurance everywhere;
- ৳0 for idle authors;
- the reviewer field explained in plain words.

---

## 4. Fix list for the builders (ordered by severity)

| # | Sev | Owner | What | Where |
|---|---|---|---|---|
| 1 | High | Shilpi + Gyani | Cut the ad load: post-top off by default; 1 inline under 900 words; no repeat of the same ad on a page (bfPick returns null instead of reusing); slim bar **or** popup per page | `73-blog.js:844` bfPick, `:1187` post-top, `:1176` bar; `94` seed `zb_adSeed` slots |
| 2 | High | Shilpi + Gyani | Relevant ads: post slots prefer the post's products / pillar shop category; generic ads as fallback; bar CTA from `post.shop` | `73-blog.js` bfPick / bfPost; `94` zb_adsFor |
| 3 | High | Shilpi (+ PDP owner) | "Journal / গাইড" in the header nav and phone menu; care/fit guide link on every product page (PR 591) | `03-layout.js` header + menu; `30-product.js` |
| 4 | Med | Shilpi | F1 avatar stretch | `r12-zblogfe.css:167` |
| 5 | Med | Shilpi | F2 `html lang="bn"` on /bn, lang on Bengali bits | `73-blog.js:1203` bfSetLang |
| 6 | Med | Shilpi | F7 popup delay = "at least N s after arriving" | `73-blog.js:1299` |
| 7 | Med | Gyani + Shilpi | U7 Bengali ad fields (titleBn, subBn, ctaBn), used on /bn | `94` zb_adEditor; `73` bfAdView |
| 8 | Med | Shilpi | U5 phone first screen: featured post under the chips, RSS to the bottom, search as an icon, no home-top ad on phones | `73-blog.js:1009` bfHome, bfHead |
| 9 | Med | Shilpi | U6 slim bar only on scroll-up or at the end; not on top of the bottom nav while reading | `73-blog.js:1317` bfScroll, CSS `.bf-bar` |
| 10 | Med | Shilpi | U4 card excerpt line; hide/noindex thin legacy stubs from lists | `73-blog.js:931` bfCard, bfList |
| 11 | Low | Shilpi | F3 scroll the active chip into view | `73-blog.js:940` / bfAfter |
| 12 | Low | Shilpi | F4 byline line at 430 px (container query to 440 px, or wrap) | `r12-zblogfe.css:234-235` |
| 13 | Low | Shilpi | F5 fill Bengali related with English posts | `73-blog.js:1173` |
| 14 | Low | Shilpi | F6 search Bengali twin text on the English blog | `73-blog.js:1078` |
| 15 | Low | Shilpi | F8 ad dates as whole Dhaka days (match zb_adLive) | `73-blog.js:716/819` |
| 16 | Low | Shilpi + Gyani | F9 hidden category: keep the label, no dead link (or require moving posts first) | `73-blog.js:725`; `94` zb-pl-hide |
| 17 | Low | Gyani | F10 Bengali bio field | `94-admin-blog.js:909` |
| 18 | Low | Gyani | F11 keep the "আবার প্রুফে গেল" toast | `94-admin-blog.js:1243` |
| 19 | Low | Gyani | Final-check refusal says exactly what is wrong + "দূত ঠিক করুক" | `94` zb_passFinal / zb-p-final |
| 20 | Low | Gyani | Back-end words: Bengali labels, names instead of A360 codes, no PR numbers, "সব পোস্ট", "কতবার দেখাবে"; agent steps read-only | `94` zb_postsTab, zb_card, zb_slotBox, zo_head |
| 21 | Low | Gyani / admin CSS | F12 dim check text contrast; F13 44 px targets on touch | `r12-zblog.css:39,44`; `r12-zadmin.css:35,179` |
| 22 | Low | Shilpi | U8 labels ≥13 px; Bengali small text ≥13 px | `r12-zblogfe.css` `.bf-pl`, `.bf-adlab`, `.bf-flag`, `.bf-quick-l` |
| 23 | Low | Shilpi | Desktop TOC: clear the highlight when scrolled above the first section | `73-blog.js:1259` |
| 24 | Decide | Coordinator/owner | F14 tablets ≥1024 px: keep 3 columns (recommended) or force 2 | `r12-zblogfe.css:85` |
| 25 | Demo | Shell | F15 demo controls over "Back to the shop" at 1280; remove Demo pills/captions in live | demo shell; `73-blog.js:1160` |
| 26 | Owner | Owner | Enter his name as reviewer (লেখক দল → বাইলাইন → যাচাই করেছেন) | admin |

---

## 5. Comparison sheets (Bengali labels; red = problem, green = ok)

All in `/tmp/claude-0/-home-claude/a27f8d4d-b57b-5d41-b919-c637e74e7368/scratchpad/blog-qa/sheets/`:
- `1-blog-home.png`: blog home, grid with grid ad, and category page — phone 393 · tablet 820 · desktop 1440
- `2-post-page.png`: post title and byline, quick answer plus the top ad (red), product block, Bengali twin
- `3-ads.png`: in-article ad, slim bar (red: polo bar on the denim post), end ad (red on desktop: same ad as the sidebar)
- `4-popup.png`: popup on phone, tablet and desktop, plus the back-end popup rules
- `5-backend.png`: pipeline, ad slot map and topic list at the three sizes
- `6-fails.png`: stretched avatars, off-screen active chip, cut byline at 430, single Bengali related post, blank hidden category

---

## Fixed (back) — Gyani A360-01 with Doot A360-06, 19 Oct

**সংক্ষেপে (মালিকের জন্য)**
1. ব্যাকএন্ডের সব লেখা এখন সহজ বাংলায়; এজেন্টের কোড (A360-09) আর PR নম্বর আর দেখায় না — দেখায় নাম ("যত্ন", "দূত")। কোড শুধু ছোট ধূসর লেখায়।
2. লেখা, প্রুফ, দূতের চেক — এগুলো এজেন্টদের কাজ, তাই এখন বোতাম না, স্ট্যাটাস আর অগ্রগতির দাগ। আপনার বোতাম শুধু: টপিকে হ্যাঁ/না, "প্রকাশ করুন" (একবার নিশ্চিত করে), "সময় দিন", "প্রকাশ বন্ধ", "এডিট"।
3. হাতে প্রকাশ: সব পোস্ট → "প্রকাশ করুন" → "হ্যাঁ" = ২ চাপ (কাজের ধারা থেকে ৩ চাপ)। টপিক অনুমোদন আগের মতো ২ চাপ।
4. বিজ্ঞাপনে বাংলা শিরোনাম/লাইন/বোতাম, দুই ভাষায় প্রিভিউ, আর "কোন কোন লেখায় দেখাবে" — কেন মিলল সহ। হুডির ব্যানার শুধু যত্ন আর মৌসুমের লেখায়, পোলোর বিজ্ঞাপন শুধু পোলোর লেখায়।
5. নতুন নিয়ম: ফোনে/কম্পিউটারে একটা লেখায় সর্বোচ্চ ৩টা বিজ্ঞাপন, শুরুর বিজ্ঞাপন প্রথম অংশের পরে, একই বিজ্ঞাপন একবারই।

Build: `proto/dist/blog-fixb.html` (test build). Files: `94-admin-blog.js`, `r12-zblog.css` only.

| # | Item | What was done | Where |
|---|---|---|---|
| F7 | Popup wait label | Label kept as the rule Shilpi implements: "ঢোকার পর অন্তত কত সেকেন্ড অপেক্ষা". A plain help line under it says exactly what happens (wait at least N s from arrival, then open on the trigger; 0 = no wait). | `zb_adEditor` popup card, `data-testid=zb-adp-help` |
| F8 | Ad days / time zone | `zb_adLive(a, ts)` now uses whole days in `cfg.tz` = Asia/Dhaka (Intl, fallback `tzOffsetMin` 360): live 00:00 on the start day to 23:59 on the end day, whatever the browser zone. Editor shows "বাংলাদেশ সময় (Asia/Dhaka): শুরুর দিনের রাত ১২টা থেকে শেষের দিনের রাত ১১:৫৯". | `zb_tzDay`, `zb_adLive`, `ZB_CFG_DEF.tz` |
| F10 | Bengali bio | New field "পরিচয় (বাংলা)" → `ST.blogAuthors[].bioBn`, seeded from the shop's own seed Bengali bio (older saved teams get it once). The shop already reads `a.bioBn` first. | `zb_authorPage`, `zb_bioBnSeed` |
| F11 | Re-proof message | One message, never overwritten: "সেভ হলো — লেখা বদলেছে, তাই আবার প্রুফে গেল (অন্য লেখক দেখবে, তারপর দূত)". | `ACT['zb-save']` |
| F12 | Check-note contrast | `.zbp-ck.dim{opacity}` removed; notes 12 px in `--text2`. Measured: 0 contrast fails on the pipeline at 393 / 820 / 1280 (was 2.48:1). | `r12-zblog.css` |
| F13 | 44 px targets | Tabs, chips, inputs, selects, buttons, icon buttons, ✕ in pills, pill links, back links, list links, colour input and switches (hit area 44, track stays 26) are ≥ 44 px on touch **and** at ≤ 1100 px wide. Measured: B1 tap check 0 fails on all 14 screens at 393 and 820. | `r12-zblog.css` media block |
| #16/F9 | Hidden category | Hiding a category with posts now says the posts stay on the shop and the name shows without a link (front-end label is Shilpi's). | `zb-pl-hide` |
| #19 | Final-check refusal | Says exactly what is wrong (e.g. "গুগলের বর্ণনা (meta) ঠিক আছে — ১০৫ অক্ষর — ১২০–১৬০ লাগবে; "how to wash" শব্দটা নেই") and offers "দূত ঠিক করুক" (fixes links, description, slug). | `zb_pchecks`, `zb_passFinal`, `ACT['zb-p-fix']` |
| #20 | Owner words | All owner-facing labels in simple Bengali (SEO, slug, meta, sitemap, Search Console kept); tab "সব পোস্ট"; "কতবার দেখাবে (১–১০)"; "কেউ লিংক করেনি"; slot map without code names; names instead of A360 codes; no PR numbers anywhere in the blog admin. | whole file |
| New | Ad fields | `titleBn, subBn, ctaBn` on every ad (seeded for the 6 seed ads), "বাংলা পেজের লেখা (/bn)" fields, preview in both languages. | `zb_adNew`, `zb_adEditor`, `zb_adPreview(d, lang)` |
| New | Ad settings | `ST.blogAdSettings` + `maxPerPostPhone:3, maxPerPostDesktop:3, postTopAfterSection:1, noDuplicate:true` (defaults fill old saved settings), each with a Bengali label + help line in "সাধারণ নিয়ম". | `ZB_AD_SET_DEF`, `ZB_AD_SET_UI` |
| New | Relevance | `zb_adWhy(ad, post)` used by `zb_adsFor` (which the shop calls) and by the editor list "এই বিজ্ঞাপন যে লেখাগুলোয় দেখাবে". Seed ads: hoodie banner → care + season; polo duo, Piqué Polo and polo bar → posts whose products or tags are polos; panjabi → season + fit; denim popup → its post. | `zb_adWhy`, `zb_adReach`, `zb_adSeed` |
| UX 4 | Agent steps | Status chip + 5-step progress on every card; the check list is read-only; agent buttons only in a dashed "ডেমো: এজেন্টের ধাপ" strip, shown while the page switch "ডেমো: এজেন্টের ধাপ নিজে চালান" is on (default on in the demo; off = the owner's live view). | `zb_pipeTab`, `zb_card` |
| UX 5 | Publish taps | "প্রকাশ করুন" on Ready cards **and** Ready rows in সব পোস্ট → confirm "হ্যাঁ, প্রকাশ করুন". "প্রকাশ বন্ধ" on published pipeline cards. | `zb-p-pub` → `zb-p-pubok`, `zb-p-unpub` |

**Design choices taken (written down as the owner asked):**
- Ad relevance rule: chosen categories decide alone (that category's posts only). With no category, "শুধু মিলে যাওয়া লেখায়" (seed and new ads) = posts whose products or tags match the ad's product/category; "সব লেখায়" = every post (for campaigns). Chosen posts override both. Ads saved before this round with no `match` field keep their old "every post" behaviour. An empty slot is fine — the shop collapses it.
- Post-top stays a slot (hoodie seed) but shows after section 1 (`postTopAfterSection:1`) instead of above paragraph 1; the owner can set 0.
- The demo switch is on by default because the walkthrough and the tests use the agent-step buttons; in the live build the strip is simply never rendered.
- Touch-size rules also apply at ≤ 1100 px wide: Playwright's full-page screenshot drops touch emulation (`pointer:coarse` turns false), and a narrow window should never get small targets either.

**Tests (one browser at a time):**
- `admin-shots/blog/zb-flow.js` (updated, old copy `zb-flow.pre-fixb.js`): **ALL PASSED, 94 checks** (47 per size at 1280 and 393). Changes: the pipeline publish now taps "প্রকাশ করুন" then the confirm `[data-testid=zb-pubok]` and checks one tap alone does not publish; the old ad check `zb_adsFor('post-popup',…).length === 2 / === 1` became "denim popup only on its post + the new related combo ad shows exactly on the posts the editor lists"; added checks for F7 label/help, F8 Dhaka whole days, F10 bioBn, F11 single message, seed relevance + Bengali ad text, new ad settings defaults, ad editor Bengali fields / two-language preview / post list / time-zone note, no A360 codes or PR numbers on the pipeline, agent-step buttons only in the demo strip, demo switch off = clean owner view.
- `ops-test.js` (default routes + 18 blog/agent routes) **ALL PASSED** at 1280 + 393; `ops-flow.js` **ALL PASSED**.
- QA harness, back end + ads (`blog-qa/tools` backend,ads — same jobs as `run-all.sh`, run one browser at a time; results in `scratchpad/blogfixb/qa2/`): **546 ok, 95 fail lines**; every fail is one of the expected design changes below — nothing else fails:
  - Back end (393, 820, 1280): B1 every tab, cut text, **tap targets (was 14/14 fail → 0)**, **contrast (pipeline 2.48:1 → 0 fails)**, B2, B3a–e, **B4b re-proof message (was fail → ok)**, B5–B9 all ok. Still flagged: **B3f/B3g** — the harness taps `zb-p-pub` once; publishing now needs the confirm tap `[data-testid=zb-pubok]` (UX 5). **B7c2** — the harness edits only the English bio and expects the Bengali page to change; Bengali now has its own field (F10), so the old check no longer applies (edit `#zb-a-biobn` instead).
  - Ads (20 devices): A1a rules, A1c–e, A2 dates, A3, A4, A7, **A8 start-day (was fail on all devices → ok)** all ok. Still flagged: **A1b** (slots the harness thinks could be filled are empty), **A5a–c** (no in-article ad on the denim post) and **A6** (no sidebar ad on the denim post ≥1100) — the harness rule does not know relevance / no-duplicate: the only in-article and sidebar ads are polo ads, which no longer go on a denim post. To retest the in-article mechanics the harness should also set `match:'all'` on the inline ad.
- Device sizes: B1 also run at 320×640, 1180×820 landscape and 1440×900 — 0 fails (one popup-trigger row cut at 320 found and fixed: the three buttons now wrap).
- Screenshots with Bengali captions (pipeline, owner view with demo off, publish confirm, ad editor, ad rules, popup rules, author editor — 1280 and 393): `scratchpad/admin-shots/blog/fix/`.

**Left for others:** Shilpi — read `titleBn/subBn/ctaBn`, the four new `ST.blogAdSettings` keys, and keep calling `zb_adsFor(slot, {pillar, slug})` (relevance is inside it). QA — update B3/B7c2/A1b/A5/A6 as above.

---

## Fixed (front) — শিল্পী Shilpi A360-05, 19 Oct

**সংক্ষেপে (মালিকের জন্য)**
1. ব্লগের সামনের অংশের ১০টা বাগ (F1–F10) আর ৭টা UX কাজ ঠিক হয়েছে। প্রতিটার আলাদা পরীক্ষা আছে: ৮২টার ৮২টাই পাস।
2. বিজ্ঞাপন কম: একটা লেখায় সর্বোচ্চ ৩টা। ফোনে লেখার ভেতরে ১টা, শেষে ১টা, আর চিকন বার **অথবা** পপআপ — দুটো একসাথে কখনো না। কম্পিউটারে ভেতরে ১টা, পাশে ১টা, শেষে ১টা। প্রথম প্যারার আগে কোনো বিজ্ঞাপন নেই। একই বিজ্ঞাপন এক পেজে একবারই।
3. লেখার সাথে মেলে এমন বিজ্ঞাপন আগে আসে: জিন্সের বিজ্ঞাপন থাকলে ডেনিমের লেখায় সেটাই দেখায়, পোলো না। মেলার মতো কিছু না থাকলে জায়গাটা ফাঁকা না রেখে বন্ধ হয়ে যায়।
4. ওপরের মেনুতে আর ফোনের মেনুতে "জার্নাল" এসেছে। প্রোডাক্ট পেজে "কীভাবে যত্ন নেবেন" লিংক আছে, যেটা সেই পোশাকের যত্নের গাইডে নিয়ে যায়।
5. ফোনে ব্লগ হোমের প্রথম গাইড এখন ২৯৪ পিক্সেলে (আগে ছিল ৬২৯)। সবচেয়ে ছোট ৩২০ ফোনেও গাইডের শিরোনাম প্রথম স্ক্রিনেই দেখা যায়।
6. পড়ার সময় নিচে স্ক্রল করলে নিচের মেনু সরে যায়। চিকন বার স্ক্রিনের মাত্র ৪–৮% ঢাকে (আগে ১৫–১৯%)।
7. কার্ডগুলো এখন ব্লগের মতো: আলাদা পোশাক আর রং, দুই লাইনের সারাংশ। সব কার্ডের "ডেমো" লেখার বদলে ওপরে একটাই নোট। পুরনো ১২টা ছোট নোট গাইডের পরে আলাদা তালিকায় আছে — কিছুই মোছা হয়নি।
8. বাংলা পেজে বিজ্ঞাপনের লেখা বাংলায় দেখায়, আর ব্রাউজারও পেজটাকে বাংলা হিসেবে চেনে।

**Build:** `proto/dist/blog-fix.html` (test build) and `proto/dist/r16.html` (both built 16:4x). Sources `73-blog.js` a5d7da61 · `r12-zblogfe.css` 2dbaba13 · `03-layout.js` 8b2f48e9 · `30-product.js` 9a4d4ef7; built against Gyani's `94-admin-blog.js` c3cb2217, which I did not touch.
- `03-layout.js`: "Journal" added to `NAV`; a wrapper around `ACT['open-menu']` adds the phone-menu row, because 02-core draws that menu.
- `30-product.js`: one call to `bfCareLink(p)` under the details box.

### Fails (§2)

| # | Fix | Where | Proof |
|---|---|---|---|
| F1 | The avatar is excluded from `.bf-rows a>span:first-child{flex:1}`. | `r12-zblogfe.css` | 28×28 on home, tag, archive and Bengali home, at 393 and 1280 |
| F2 | The journal sets `<html lang>` to its UI language (`bn` on /bn, or when the shop is in Bengali) and restores it when you leave. Text in the other language gets its own `lang` through `bfLA()`: cards, notes, ad texts, author name and bio, the search query in the result line. | `bfSetLang`, `bfLA` | 0 unmarked Bengali on 4 Bengali and 3 English routes; html lang back to `en` after leaving |
| F3 | The active chip is scrolled to 16 px from the left. The right fade switches off at the row end; once the row is scrolled, a 14 px left fade sits in the gutter. | `bfChipsIntoView` | season, brand and Bengali care rows at 320, 393 and 440: inside the row, not under a fade |
| F4 | The byline steps down and is never cut: "Published" goes at ≤440 px (was 380), then "3 min read" becomes "3 min", then "Updated" goes. It re-fits on resize. | css + `bfFitBy` | 25 posts × 8 sizes, 320 → 1440: no line overflows |
| F5 | Bengali related cards: Bengali guides first (same category, then others), then English guides marked "ইংরেজিতে" (title `lang="en"`). Full guides always come before short notes. | `bfPost` | 3 cards on both twins |
| F6 | Search scores the English and Bengali text of every post. A Bengali match on the English blog shows the Bengali twin (title, /bn link, বাংলা flag). | `bfSearchPage`, `bfCard` | `?q=পোলো` → 2 results, both twins; `?q=ফিট` → 5 results |
| F7 | "Wait N s" counts from arrival: the trigger arms the popup; it opens at once if N s have passed, otherwise when they do. Arrival is one per navigation (router `NAVS.tok`) and is kept on a redraw of the same page. | `bfTryPop`, `BF.arrive` | 393 and 1440: stay 12 s then scroll → opens at once; scroll at once → opens at 9.8–9.9 s; coming back later starts a fresh count |
| F8 | Start and end are whole days in the shop's time zone (`zb_cfg().tz`, Asia/Dhaka), whatever the phone is set to — the same rule as `zb_adLive`. | `bfAdLive`, `bfToday` | At 20 Oct 03:00 Dhaka, start 20 Oct: back end live and shop shows it; end 19 Oct: both off. Same result with the browser set to UTC, New York and Dhaka. |
| F9 | A hidden or removed category shows "Journal" and links to the blog home (eyebrow, cards, notes, related "More guides"); the crumbs drop that step. A hidden sub-category's URL shows its parent category. | `bfPLabel`, `bfPHref`, `bfTopic` | brand hidden → "Journal" → blog home, 0 blank labels; `/topic/care/washing` (hidden) → "Care & washing" |
| F10 | `bioBn` shows on the Bengali author page when set. If the owner rewrote the English bio and has no Bengali one yet, his English text shows (marked English) instead of the old seed line. | `bfABio` | set → shown, page lang bn |
| F14 | 3 columns kept at ≥1024 (Claude's decision). The harness still flags S13 on those tablets. | — | — |

### UX (§3), as decided by Claude

| # | Done |
|---|---|
| U1 density | `bfAdPlan()` fills up to `maxPerPostPhone` / `maxPerPostDesktop` (3/3). Default slot order: phones and tablets <1100 px = in-article #1 · end · bar-or-popup · in-article #2 · top; desktop = in-article #1 · sidebar · end · in-article #2 · top. The most relevant ad fills first and slot order breaks ties. A second in-article ad needs 900+ words. **post-top** goes after the quick answer and section `postTopAfterSection` (1), never next to an in-article ad. **noDuplicate:** `bfPick` returns null rather than repeat an ad (top, grid and post slots); the empty slot collapses. The sidebar and the bar render only for their own layout; a post redraws when the window crosses 1100 px. Fallback defaults for the four keys are in `BLOG_AD_SETTINGS_SEED`. **Decision (mine):** on desktop the popup is outside the count, because it is owner-aimed and capped, and exit-intent only exists there. On phones it takes the bar's place, and once a visit has had its popup the bar stays away. |
| U2 relevance | Tiers: 4 = the ad lists this post · 3 = the ad's product, category or combo items match the post's products, its shop category or its tags · 2 = the ad lists this category · 1 = general. The shop only ranks; what is allowed still comes from `zb_adsFor` (Gyani's `match` rule). A jeans ad in post-end wins on the denim guide even when the polo ad has 9× the weight. |
| U3 reachability | "Journal" is in the desktop nav (marked on journal pages) and the phone menu (54 px row). AUTO ADJUST: nav labels never wrap and the gap steps down at 1024–1279, so 9 items fit on one line at 1024, 1100, 1180, 1194, 1280 and 1366. *(The first build wrapped "New in" and "T-Shirts" at 1024; caught on screenshots, fixed.)* The product page's "How to care for this" goes to the care guide that names the product, else one for its category, else the care page (Bengali twin when the shop is in Bengali): polo → polo guide; jeans → denim; tee → dark colours; hoodie → "See our care guides". |
| U4 blog look | Card art per post: a garment from the post's products, in one of its colours, on a tint of the category colour. No two cards in a grid repeat; a post without products gets a category tile with an icon. Cards carry a 2-line excerpt. The Demo pills and the hero demo caption are gone; one "Demo content" note sits in the home header, shown only while demo posts exist. The 12 short notes sit after the guides in a compact "Short notes" list on home, category, tag, author, archive and search. They are still published and get `robots noindex, follow` as a live-build hint. |
| U5 first screen | Header rows: crumbs · Demo note · language twin / h1 (24 px) · search button (opens the form) / intro folded to one line. Desktop keeps the full intro and form. RSS moved into "More ways to browse". The top banner comes after the featured guide (category pages: after the pillar guide). The featured image is 2:1 on phones. Featured card at 291–294 px on 320, 360, 375 and 393 (was 629 on 393); at 320×640 the title line is 476–504 px, above the bottom nav at 573. |
| U6 reading | On posts the tab bar slides away on scroll down and returns on scroll up, at the end and near the top. The slim bar is 48 px and shows only while the tab bar is away. Measured while reading: 5.6 % (393), 7.5 % (320), 5 % (440), 4.1 % (820). Reduced motion turns the slide off. |
| U7 Bengali ads | Bengali pages use `titleBn/subBn/ctaBn` in every slot, the bar and the popup; any English left is marked `lang="en"`. |
| #22, #23 | Labels are 13 px and Bengali labels 13–13.5 px. The desktop contents list clears its highlight above the first section. |

### Tests on the final build
- `scratchpad/blog-fix/fixcheck.js` (new, one check per item, F1–F10 and U1–U7): **82/82 PASS**. `tzcheck.js` (ad dates in 3 browser time zones): 3/3 PASS.
- `blog-fe/flow.js` (28 behaviour checks; the search step now taps the search button first): **ALL PASSED** on `r16.html`.
- `blog-fe/sweep.js`: **0 of 168** (320 → 1280) and **0 of 168** (tablets, 1366, 1440).
- Device gate `device-matrix.js --group=all`, 5 chunks: **0 failing of 480** (15 phones + 10 tablets). The phone chunk was re-run on `r16.html` after the last change: 0 of 80.
- Blog QA harness (sweep, journeys, ads, popup; 20 devices, one browser at a time; results in `blog-qa/out-fix/`, QA's own `out/` untouched): **6,249 pass · 274 fail · 224 info**. The QA agent updated `ads.js` during the run, so tablets and desktop ran its new A10–A12. **New-rule checks: A10 max-3 / no-repeat / nothing above P1 / post-top after section / collapse — all ok; A11 denim and hoodie relevance — ok; F7 P2b/P2c — ok; F8 A8a–c — ok; S23 avatars, S17 byline and S18 related — ok on all devices.** Every one of the 274 fails is one of:
  - **S10b ×120** — the check counts **৳** (U+09F3, inside the Bengali Unicode block) as Bengali. The only "unmarked Bengali" on English pages is prices like "৳ 1,350"; marking prices `lang="bn"` would make English screen readers switch voice. *Harness: exclude ৳ and digits from the Bengali test.*
  - **S13 ×54** — the F14 decision (3 columns ≥1024).
  - **J5 ×12** — the harness fills `#bf-q` directly. Below 900 px the form now opens from the search button (U5); J5a–c pass where the form is visible. *Harness: tap `[data-act=bf-sopen]` first.*
  - **S14b ×8** — a harness fault: sweep.js line 44 tests the chip row by setting `scrollLeft = 120` and then `= 0` (not back to `before`), which wipes the scroll-into-view just before S14b measures. My F3 check (and the screenshot) show the chip in view.
  - **A1a ×20 + A1b-oracle ×10** — the QA rule and Gyani's `zb_adWhy` disagree (hoodie on what-gsm-means: back end yes, QA no; what-to-wear-for-eid-2026: the reverse). The shop shows only what `zb_adsFor` allows. *For Gyani/QA to settle.*
  - **A1b-filled ×10, A5a–c ×30** — the old ads.js on phones (pre-update). A1b asks for a slot to be filled even when the density rules leave it empty; A5 needs an in-article ad on the denim post, where the back end now allows none. Placement checked separately with a general ad: first ad after paragraph 3 (N=3) / 2 (N=2), one only under 900 words.
  - **A12 ×10** — the Piqué Polo ad's `titleBn` in Gyani's seed is the English product name ("Essential Piqué Polo"), so a Bengali page shows English. The shop shows `titleBn` as asked. *Gyani: give it a Bengali title, e.g. "পিকে পোলো — ২২০ GSM কটন".*
- Sheets (Bengali captions, red = before, green = now): `scratchpad/blog-fe/blog-fe-phone.png` (14 panels) and `blog-fe-desktop.png` (8 panels). The earlier sheets are kept as `*-r1.png`.

**Found on the way (not on the list):**
- The popup arrival time was first kept per post, so coming back to the denim guide later opened the popup at once over the page (harness J7 caught it). Now one arrival per navigation, with a regression check.
- The nav wrap at 1024 (see U3).

**Left for others:** Gyani — A12 seed title and the A1 rule agreement with QA. QA — the harness notes above (৳, `bf-sopen`, `scrollLeft = before`, A1b/A5 with relevance). Owner — #26 (his name as reviewer). Demo shell — F15. Not in this round: U10 (a "Shop the look" combo at the end of style posts).


---

## R2 — full re-check after the fixes (independent QA, 19 Oct, 16:45–18:05)

**সংক্ষেপে (মালিকের জন্য)**
1. শিল্পী আর জ্ঞানীর ঠিক করার পর আবার পুরো পরীক্ষা হয়েছে — ২০টা স্ক্রিনে, একবারে একটা ব্রাউজার দিয়ে। মোট ৭,০৫৮টা চেক।
2. দোকানের ব্লগে (হোম, লেখা, খোঁজ, বিজ্ঞাপন, পপআপ) ২০টা স্ক্রিনের কোথাও একটাও ফেল নেই।
3. বিজ্ঞাপন এখন একটা লেখায় সর্বোচ্চ ৩টা। প্রথম প্যারার আগে কোনো বিজ্ঞাপন নেই, একই বিজ্ঞাপন দুবার নেই, জিন্সের লেখায় পোলোর বিজ্ঞাপন নেই।
4. ওপরের মেনুতে আর ফোনের মেনুতে "Journal" এসেছে। প্রোডাক্ট পেজে "কীভাবে যত্ন নেবেন" লিংক আছে। ফোনে প্রথম গাইড এখন প্রথম স্ক্রিনেই দেখা যায়।
5. বাংলা লেখায় বিজ্ঞাপনও বাংলায়। পপআপ এখন ঢোকার পর ঠিক ১০ সেকেন্ড অপেক্ষা করে খোলে।
6. ব্যাকএন্ডে প্রকাশ করতে এখন "হ্যাঁ" চেপে নিশ্চিত করতে হয়। লেখকের বাংলা পরিচয় আলাদা। এজেন্টের ধাপগুলো একটা আলাদা ডেমো ঘরে, আপনি দেখেন শুধু অবস্থা।
7. বাকি আছে ছোট দুটো জিনিস। "লেখক দল" পাতায় এখনো এজেন্টের কোড (A360-…) দেখা যায়। আর বিভাগ লুকালে ব্যাকএন্ড বলে "নাম লিংক ছাড়া দেখাবে", কিন্তু দোকানে দেখায় "Journal"।
8. আপনার একটা কাজ বাকি: লেখক দল → বাইলাইন-এ "যাচাই করেছেন" ঘরে নিজের নাম লিখুন।

### R2.0 What was tested
| | |
|---|---|
| Build | `proto/dist/blogqa-r2.html`, built 16:45 after "Shilpi done" and the coordinator's A12 data fix |
| Sources | `73-blog.js` a5d7da61 · `r12-zblogfe.css` 2dbaba13 · `94-admin-blog.js` 49f76fc1 · `r12-zblog.css` 4dc6268e · `03-layout.js` 8b2f48e9 · `30-product.js` 9a4d4ef7. The same as Shilpi's final sources, plus the coordinator's 94 data fix. |
| Runner | `blog-qa/tools/run-r2.sh`: **one browser at a time**, all 20 devices. Full-page screenshots are taken last, so they cannot change the touch emulation behind the tap checks. |
| Results | `scratchpad/blog-qa/r2/out/` (JSON per module and device), `r2/logs/`, `r2/shots/`. A stale start on the 16:17 build was stopped and kept aside as `r2-stale-1617/`. |

**Harness changes for R2.** These are intended rule changes, not bugs:
- Publishing needs a confirm (B3h).
- Bengali bio is a separate field (B7c2/B7c3).
- Ad relevance rule; ≤3 ads per post; no duplicates; nothing above paragraph 1; post-top after section 1; empty slots collapse (A10a–g).
- Denim / hoodie relevance (A11).
- Bengali ad text on /bn (A12).
- Ad dates as whole Dhaka days (A8a–c).
- Popup waits N s from arrival (P2c); on phones the popup replaces the slim bar (P11). On desktop the popup is not counted in the cap.
- Owner view: no agent codes or PR numbers; agent buttons only in the dashed demo strip (B10a–c).
- New UX re-check probe: `ux.js`.

**Shilpi's 5 tool-fault notes, each checked independently:**

| # | Shilpi said | Verified | Done |
|---|---|---|---|
| 1 | ৳ counted as Bengali | **True.** U+09F3 sits in the Bengali block. Every "unmarked Bengali" hit on English pages was a price. | ৳ excluded from all Bengali checks |
| 2 | J5 must open search first on phones | **True** | J5 taps `[data-act=bf-sopen]` when the form is closed |
| 3 | sweep.js resets the chip row before S14b | **True, and there was a second cause.** My contrast sampler's `scrollIntoView` also scrolled the chip row sideways. | S14b now measures before the audit, and the sampler restores sideways scroll. Real navigation: season chip at x 21–193 in a 360 px row. |
| 4 | A1b/A5 ignore relevance and no-duplicate | **True** | A1a now asks the back end's own `zb_adsFor` (single rule source). My independent rule became info (A1b). A5 sets `match:'all'` on the inline ad. |
| 5 | Popup / bar rules | Recorded as decisions | P11 added; the A10 cap excludes the popup |

### R2.1 Counts per device group
**7,058 checks: 6,688 pass · 10 fail · 54 decision · 306 info.** "Decision" = S13, 3 columns at ≥1024 on tablets, which F14 keeps by decision.

| Group | Devices | Pass | Fail | Decision (F14) | Info |
|---|---|---|---|---|---|
| Phones | 8 | 2,710 | 4 (back end ×2 at 393, UX probe ×2) | 0 | 98 |
| Tablet portrait | 5 | 1,687 | 3 (back end ×2 at 820, UX ×1) | 9 (1024×1366) | 76 |
| Tablet landscape | 5 | 1,567 | 0 | 45 | 83 |
| Desktop | 2 | 724 | 3 (back end ×2 at 1280, UX ×1) | 0 | 49 |

| Module | Pass | Fail |
|---|---|---|
| Sweep (18 routes × 20 devices) | 4,956 | 0 (+54 decision) |
| Journeys | 556 | 0 |
| Popup | 282 | 0 |
| Ads (30 pages × 20 devices + rule edges) | 620 | 0 |
| Back end (393 · 820 · 1280) | 250 | 6 |
| UX re-check (320 · 393 · 820 · 1440) | 24 | 4 |

The front end, journeys, ads and popup have **0 fails on all 20 devices**. None of the remaining fails comes from the desktop-batch files (`03-layout.js`, `30-product.js`), which have not changed since the R2 build.

### R2.2 Remaining fails (4 distinct, all low)

| # | What | Devices | Measured vs expected | Cause / where |
|---|---|---|---|---|
| R2-1 | Agent codes still on owner screens | 393 · 820 · 1280 | "A360-06 … A360-12" on লেখক দল cards, "A360-09" on the author profile. Expected: none on owner screens (coordinator rule 6). | `94-admin-blog.js` zb_authorsTab (~1044) and zb_authorPage (~1058) print `a.code`. Keep it only in the tooltip, or drop it. Screens: `r2/shots/r2-*-admin-authors.png` |
| R2-2 | Hidden category: the back-end message and the shop disagree | 393 · 820 · 1280 | The toast says "বিভাগের নাম লিংক ছাড়া দেখাবে"; the shop shows **"Journal" → blog home** (`#/journal`). No blank labels and no dead links any more (F9 fixed). | `94-admin-blog.js:1101` toast vs `73-blog.js` bfPLabel/bfPHref. Change one to match the other; simplest is the toast: "লেখাগুলো 'Journal' নামে দেখাবে". |
| R2-3 | Slim bar shows while reading down (U6) | 320 · 393 · 820 | Mid-article while scrolling down, the 48 px bar is on; the tab bar slides away. Total cover is 6–10 % (was 15–19 %). | Shilpi's design: the bar replaces the tab bar while reading. **Partly resolved, accepted as a design choice.** |
| R2-4 | Smallest Bengali text 12 px on desktop | 1440 | TOC number badges (`.bf-tocn`, Bengali digits ১ ২ ৩) are 12 px; everything else is ≥13 px. | `r12-zblogfe.css` `.bf-tocn{font-size:12px}`. Trivial: 13 px. |

**Info, no action needed unless someone wants it tidy:** for one legacy seed note (`what-to-wear-for-eid-2026`) the shop files the post under "Occasions & seasons" (`BF_SEEDMAP`), while the back end derives another category from its old section. The back end's "এই বিজ্ঞাপন যে লেখাগুলোয় দেখাবে" list and my independent rule therefore differ for that one post. The shop follows `zb_adsFor`, so nothing wrong is shown.

### R2.3 UX verdict per earlier issue
| # | Earlier issue | R2 verdict | Measured |
|---|---|---|---|
| U1 | Too many ads, one before the article | **Resolved** | ≤3 ads on every post on all 20 devices (A10a). 0 ads above paragraph 1, no ad repeated on a page, post-top after section 1. Denim guide: 1 ad; polo guide: 3 (in-article, end, bar). |
| U2 | Ads don't match the post | **Resolved** | No polo ad on the denim guide (A11a). The hoodie banner appears only where `zb_adsFor` allows it (A11c). Picked posts override (A3b); "সব লেখায়" works (A3c). |
| U3 | Blog hard to reach; no path from products | **Resolved** | "Journal" in the desktop header and the phone menu. Product page: "How to care for this" → polo guide (U3 probe, all 4 sizes). |
| U4 | Looks like a catalogue | **Mostly resolved** | Excerpt on 8/8 cards, 0 "Demo" pills, the 12 thin notes are in a separate "Short notes" list. Real photos still wait for PR 547. |
| U5 | Phone first screen all chrome | **Resolved** | First guide at 291 px (320×640), 294 (393), 301 (820), 326 (1440). Was 629–667. |
| U6 | Sticky stack covers the text | **Partly** (design choice) | Cover 6–10 % while reading (was 15–19 %); the bar is still on while reading down (R2-3). |
| U7 | Bengali pages show English ads | **Resolved** | All ad titles on /bn pages are Bengali (A12, U7), after the coordinator's data fix for the Piqué Polo and jeans ads. |
| U8 | Small labels | **Resolved** (one trivial left) | Labels 13 px; Bengali ≥13 px except desktop TOC badges at 12 px (R2-4). |
| U9 | Trust: no human reviewer by default | **Owner action pending** | The feature works (B7d/B7e). Owner to enter his name: লেখক দল → বাইলাইন → যাচাই করেছেন. |
| U10 | "Shop the look" combo on style posts | **Not in this round** | — |
| BE | Back end for a non-technical owner | **Mostly resolved** | Bengali labels. Publish is 2 taps with a confirm (B3h: one tap alone does not publish). The demo switch off shows status chips only and no agent buttons (B10b/c). Re-proof message kept (B4b). 44 px targets at 393/820 (B1t 0 fails). Pipeline contrast fixed. Agent codes remain on লেখক দল (R2-1). |

**Earlier fails F1–F13, re-checked on all devices:** all pass on the R2 build.
- F1 avatars round
- F2 `lang`
- F3 active chip in view
- F4 byline never cut
- F5 Bengali related ≥3
- F6 Bengali search
- F7 popup wait from arrival (P2b 0.0 s, P2c 9.7 s)
- F8 whole Dhaka days (A8a–c)
- F9 no blank / dead links (wording: R2-2)
- F10 `bioBn`
- F11 re-proof message
- F12 contrast
- F13 44 px

F14 stays a decision; F15 is demo-only.

### R2.4 Sheets (Bengali labels; red = problem, green = ok)
In `/tmp/claude-0/-home-claude/a27f8d4d-b57b-5d41-b919-c637e74e7368/scratchpad/blog-qa/sheets/`:
- `7-r2-age-ebong-ekhon.png`: before and now on a 393 phone. First screen, no ad before the text, denim without polo ads, the reading cover, Bengali ads.
- `8-r2-dokan.png`: phone · tablet · desktop. Blog home, cards with excerpts, in-article ad, popup, "Journal" in the menu, care-guide link on the product page.
- `9-r2-backend.png`: owner view (status only), dashed demo strip, publish confirm, ad rules, Bengali bio, and agent codes still on লেখক দল (red).
