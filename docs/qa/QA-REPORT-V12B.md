# QA রিপোর্ট — EXTAS ডেমো V12b (স্বাধীন রিভিউ, 20 Oct 2026)

## মালিকের জন্য সংক্ষেপে

- চারটা ফিক্স-এজেন্টের কাজ একসাথে জুড়ে (হোম/হেডার/ফুটার, ক্যাটাগরি/প্রোডাক্ট, ব্যাগ/চেকআউট, অ্যাডমিন) পুরো ডেমো আবার পরীক্ষা করা হয়েছে। আপনার লিস্টের **৪৪টা কাজের সবগুলো ঠিক আছে** (H1–H14, C1–C6, P1–P8, B1–B3, G1–G3, K1–K11)।
- আগের রিভিউয়ারের রেখে যাওয়া ৪টা বাকি কাজ (ডেমো বাটন, ইংরেজি মোডে বাংলা, একটা পুরোনো টেস্ট, সাইড অফারের সময়) — সব শেষ।
- **নতুন ৬টা সমস্যা পেয়ে ঠিক করা হয়েছে** — কেউ আগে বলেনি:
  1. ফুটারে লোগোর পাশের স্লোগান কেটে যাচ্ছিল (“Made in Banglade…”)।
  2. ক্যাটাগরি পেজের সেট বক্সে পণ্যের নাম কেটে যাচ্ছিল (“Heavyweight Hoodi…”)।
  3. ট্যাবে (1024) প্রোডাক্ট পেজের সাইজ হেল্পারের লেখা কেটে যাচ্ছিল (“chest 42" · Lo…”)।
  4. “Find my size” বাক্সে কিছু পণ্যে ক্রেতা দেখত “… (test) size chart”।
  5. “Hide demo controls” চাপলে ডেমো বাটন আবার ফিরে আসত।
  6. সময়ের একটা টেস্ট পুরোনো নিয়মে চলছিল (ওয়েলকাম বাক্স এখন শুধু ডেমো লিংকে) — টেস্ট ঠিক করা হয়েছে, সাথে নতুন চেক: সাধারণ ক্রেতা ওয়েলকাম বাক্স দেখে না।
- সব গেট পাস: ফোন ১৫টা সাইজ, ট্যাব ৪টা সাইজ — **০টা সমস্যা**; সময়ের ৫৩১টা চেক — ০ ফেল; চেকআউট/ব্যাগ/প্যানেলের ৩৬৯টা চেক, কম্বোর ১৩৬১টা চেক, অ্যাডমিনের সব টেস্ট — ০ ফেল। যোগফল ড্রয়ার, ব্যাগ, সামারি, চেকআউট আর ইনভয়েসে সব জায়গায় একই।
- ছবি: `scratchpad/owner-fix/QA/sheets/QA-r3-01-kata-lekha.png` (কাটা লেখা আগে/পরে) আর `QA-r3-02-test-lekha-ar-demo.png` ((test) লেখা আর ডেমো বাটন)।
- **আপনার সিদ্ধান্ত লাগবে এমন কিছু নেই।** নিচে কয়েকটা “পছন্দের প্রশ্ন” আছে — চাইলে দেখবেন।

---

## 1. Leftovers from the earlier reviewers

| Item | Result | What was done |
|---|---|---|
| (a) "Demo controls" pill over the desktop footer, shown to visitors | **FIXED** | Previous reviewer: gear and welcome box only with `?demo=1` (03-layout `demoToolsOn`, 98-intro), desktop gear moved to a slim tab at the left edge, mid-height. This review: **"Hide demo controls" did not work** while the address still had `?demo=1` (the next redraw switched it back on) — `ACT['demo-hide']` now also removes `demo=` from the address. Checked at 1366/1920/768/393: visitor sees nothing, `?demo=1` shows it, it covers nothing in the footer, Hide works (20/20); demo-gate 135/135. |
| (b) 4 Bengali leaks in admin English mode (85-admin-combos, 89w-owner-c) | **FIXED** | Dictionary entries in 98b. English crawl 1366/1920/768: 720 states, 0 Bengali, 0 JS errors, 0 overflow. The same-colour switch toasts now read in English (clicked and checked). |
| (c) owner-answers 1 fail | **FIXED (stale test)** | The test read raw `p.stock`; after earlier steps place orders the buyable stock is `stockOf()` (orders hold stock since the admin audit). The app is right; the test now uses `stockOf()`. owner-answers ALL PASSED. |
| (d) SC-02b flaky (156 vs 150 ms) | **FIXED (both)** | Code: the side-canvas leave handler now turns the zone in the same event instead of a `setTimeout(0)` (96c). Test: the time is measured inside the page (pointerleave → frame change), so Playwright round trips do not count. Now 0 ms in page (26 ms wall clock). |

## 2. Owner items

Checked on the combined build (`proto/dist/v12b.html`) at 1366 and 1920 unless noted. Tools in `scratchpad/owner-fix/QA/tools3/`.

### Home, header, footer
| # | Status | Evidence |
|---|---|---|
| H1 hero board 110–115 px right, text stays | PASS | text left 95/240 px same as before; board/photo moved +112 px |
| H2 button gap, promise lines under buttons, longer 72-hour line | PASS | gap 16 px; each line under its button; "72-hour easy exchange for size or fault" |
| H3 Journal out of desktop header, highlighted in footer | PASS | header has 10 items, no Journal; footer link `fdr-hl` |
| H4 smarter menu arrangement | PASS | 4 options (all / catsMore / shop / priority), none cut |
| H5 bigger wordmark, 10 text-logo options | PASS | styles 1–10 draw different marks (lgs-1…10) |
| H6 compact dropdown + flyouts | PASS | dropdown under the item, not full width |
| H7 3+3 sets with tall Build-your-own tile | PASS | screenshot; texts editable |
| H8 finder texts editable, tiles from data | PASS | words changed via Site builder data; 6 tiles from size charts |
| H9 switch for row fade | PASS | off/on both ways |
| H10 BYO prices highlighted | PASS | red chips, bold |
| H11 Shop the look styles | PASS | struck price red, "You save" bold red |
| H12 journal 4 fixed posts | PASS | 4 cards, one row, no arrows, no duplicate (Bengali twin) |
| H13 footer layout, social icons, COD logo | PASS | 4 social icons; **slogan cut fixed in this review** |
| H14 Join phone rule | PASS | "1" refused with one line; +880 / Bengali digits accepted and cleaned; 012… refused |

### Category and product
| # | Status | Evidence |
|---|---|---|
| C1 FAQ side filled | PASS | size + why-EXTAS card on all 6 categories |
| C2 easy English | PASS | read-through of FAQ and blurbs |
| C3 categories alike | PASS | Polos, T-shirts, Shirts, Panjabi, Trousers, Hoodies: filters + set box |
| C4 one set box style | PASS | same box everywhere; **name cut fixed in this review** |
| C5 more demo products | PASS | 24–33 products per category |
| C6 product video | PASS | video-test 37/0 (YouTube itself is blocked on this machine — 4 info) |
| P1 photo inside first screen | PASS | photo bottom 748 px of 768 |
| P2 care article card | PASS | card with read time (Panjabi has the general "Care & washing" card, no read time — info) |
| P3 review cards equal | PASS | all 285 px |
| P4 smart Q&A left panel | PASS | size helper; **1024 px cut fixed in this review** |
| P5 one slider + grid of 4 | PASS | grid of 4; recent-timing 20/0 (holds, resumes, never empty) |
| P6 sticky bar middle | PASS | rating, delivery, COD (template T1). Panjabi uses T2, whose buy column stays in view, so no bar — by design |
| P7 zoom to every edge | PASS | zoom-test 59/0 |
| P8 thumbnails | PASS | 5–6 thumbs, "+N" when more. T2 shows a photo grid instead — by design |

### Bag drawer, bag page, checkout
| # | Status | Evidence |
|---|---|---|
| B1 drawer words + more products | PASS | qa.js: style A shows ≥ 2 products |
| B2 stronger free-delivery line | PASS | screenshots |
| B3 style B (all lines, newest on top) | PASS | qa.js: lines = min(items+1, 4), "Just added" on top, total = grand total |
| G1 compact "Add one more" band | PASS | screenshot bag 1366 / 5 items |
| G2 compact tier area | PASS | "2 for ৳1,500 · size M" |
| G3 upsell styles as options | PASS | current / cards / side drawn at 1366/1440/1920 |
| K1–K8 checkout widths, gaps, "+N more", WhatsApp box, note, ticks, upsell | PASS | qa.js 369/0 across 1, 3, 5, 6 items, wide + classic, 6 widths; screenshot co-1366-6 |
| K9 payment boxes always, bKash etc. choosable | PASS | K9 2109/0 (20 loops × 5 entry paths × 3 widths) |
| K10 phone rule everywhere | PASS | K10 310/0 |
| K11 Polo Duo "2 different colours", same total everywhere | PASS | K11 65/0; totals.js ALL OK; combo verify 1361/0; drawer = bag = summary = checkout = order = invoice |

### Admin
| Check | Result |
|---|---|
| English checker (crawl 1366/1920/768) | 720 states, 0 Bengali, 0 errors, 0 overflow, 0 dead buttons |
| fixE-test | 49/0 (P&L matches the hand sum) |
| fixD-test | 19/0 |
| ops-test / ops-flow / reg-test | 96/0 · 94/0 · 162/0 |

## 3. New bugs found and fixed in this review

| # | Bug (steps · expected · actual) | Fix (file) |
|---|---|---|
| N1 | Open home at 1366, scroll to footer · slogan whole · "Menswear · Made in Banglade…" | `src/r12-zzz-qa.css` — brand row may wrap, slogan stays one line, no ellipsis (desktop only) |
| N2 | Open `#/c/hoodies` at 1366, set box "Pick any of these" · names whole · "Heavyweight Hoodi…" (owner-B CSS used ellipsis) | `src/r12-zzz-qa.css` — names wrap to 2 lines, prices level (desktop only) |
| N3 | Open `#/p/essential-pique-polo` at 1024×768 (iPad mini landscape) · size helper line whole · "chest 42" · Lo…" (device gate: 7 fails) | `src/89x-owner-b.js` line ~230 (two spans) + `src/r12-zzz-qa.css` (`.ob-qh-m` wraps between pieces) |
| N4 | Open `#/p/ct-tracksuit-top` → Find my size · plain chart name · "Track top · Regular **(test)** size chart" | `src/01z-combo-test.js` — "(test)" taken off the 7 sample chart names (ct- ids still mark sample data) |
| N5 | Open `?demo=1#/`, Demo controls → "Hide demo controls" · gear gone · gear came back on the next redraw | `src/03-layout.js` `ACT['demo-hide']` removes `demo=` from the address |
| N6 | Timing IN-01 expected the welcome popup for every first visit · popup is now a demo helper | `timing-audit/tools/misc.js` (backup `misc.pre-r3.js`): IN-01 opens with `?demo=1`; new IN-00 checks a visitor never gets it |

Also kept from the previous reviewer (checked line by line): journal block shows one card per article (Bengali twin), bag summary steps to the short name on a narrow phone, product photo label moved off the model chip, contact form uses the shared phone helper (K10), "(test)" tags off shopper texts.

## 4. Gates (final build)

| Gate | Result |
|---|---|
| Device gate — phones (15 devices × 15 routes, 3 slices) | **0 fails** |
| Device gate — tablets (4 devices × 15 routes + extra) | 7 fails (N3) → fixed → **0 / 96** |
| Desktop checks 1366 + 1920 (own probes: home, 6 categories, 4 products) | 0 cut text, 0 sideways scroll, 0 JS errors (2 by-design T2 notes) |
| Storefront crawl (every internal link) 1366 / 1920 / 768 | 132 / 132 / 130 routes: 0 not-found, 0 JS errors, 0 sideways scroll, 0 "undefined/NaN" |
| Keyboard focus (home, product, bag, checkout) | visible on the first 14 Tab stops, skip link first |
| Timing suites (sliders, hover, overlays, misc, extra, drag) | 531 checks · 522 pass · **0 fail** · 9 info |
| demo-gate | 135/0 |
| totals.js / combo verify / ops-test / ops-flow / owner-answers / reg-test | ALL OK / 1361-0 / ALL PASSED / ALL PASSED / ALL PASSED / ALL PASSED |
| K9 / K10 / K11 / qa.js matrix | 2109-0 / 310-0 / 65-0 / 369-0 |
| fixE / fixD / zoom / recent / video | 49-0 / 19-0 / 59-0 / 20-0 / 37-0 |
| `node --check` every src/*.js | OK |

Total checks run in this review: about 7,200 (plus 720 admin states and ~390 storefront route visits). Fails left: **0**. Info items: 9 timing info, 4 YouTube-blocked info, 2 by-design template notes.

Not tested here: real YouTube playback (blocked on this machine; the player box and poster are tested), real fonts (Google Fonts blocked in tests; layout checks use fallback fonts).

## 5. Taste questions (no change made — owner may decide)

1. Hero: the first product chip ("Heavyweight Hoodie 320 GSM") sits half over the green-to-photo fade.
2. Journal cards cut their teaser text with "…" after 2–3 lines (and the card title after 2 lines on a tablet). Normal for blog teasers; the full text is on the article page.
3. The blog shows a small "Demo content" note to every visitor while demo articles are in the store (it goes away by itself with real posts).
4. Product page: the "Size – Choose your size" label is indented 5 px more than "Colour – Navy" (set on purpose with `--pdp-sp`).
5. Demo placeholder labels on set photos wrap a lone "]" (placeholder only; real photos have no label).

## 6. Files

- Progress log: `/home/claude/blueprint/qa/QA-V12B-PROGRESS.md`
- Probes: `scratchpad/owner-fix/QA/tools3/` (lib.js, c1-demo, c2-home, c2-opts, c3-catpdp, c5-toast, c6-crawl, c6-focus, shots-after, q-*.js)
- Results and screenshots: `scratchpad/owner-fix/QA/r3/` (gates/, qa/, fixE/, fixD/, crawl-en.json, c6-crawl-*.json)
- Bengali sheets: `scratchpad/owner-fix/QA/sheets/QA-r3-01-kata-lekha.png`, `QA-r3-02-test-lekha-ar-demo.png`
- Backups of files changed here: `tools3/01z.before-r3.js`, `tools3/89x.before-r3.js`, `timing-audit/tools/misc.pre-r3.js`
