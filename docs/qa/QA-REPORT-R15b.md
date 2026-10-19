# EXTAS demo store — QA report, round R15b (independent rerun)

- **Build tested (frozen):** `scratchpad/proto/dist/r16-qa-snapshot.html` (2,364,879 bytes, 2026-10-19 07:17). Nothing under `proto/src` was edited. I only tested; I fixed nothing.
- **Tester:** independent QA. I did not build or fix this build.
- **Engine:** Chromium only (Playwright, no WebKit). Phones and tablets ran with `isMobile` + touch at their real pixel ratio. Swipes and pull-to-refresh are CDP `Input.dispatchTouchEvent` gestures.
- **Devices (20 sizes):**
  - **Phones (8):** 320×640, 360×800, 375×667, 390×844, 393×852, 412×915, 430×932, 440×956.
  - **Tablets (10):** iPad mini 768×1024, iPad Air 820×1180, iPad Pro 11 834×1194, iPad Pro 12.9 1024×1366, Android tab 800×1280, each portrait **and** landscape.
  - **Desktop (2):** 1280×800, 1440×900.
- **Device gate** (`blueprint/qa/device-matrix.js --group=all`): **0 failing of 480** (15 phones + 10 tablets).
- **Run notes:** The container restarted part-way through the run. Every result below comes from a run that finished. The runs were then done in the foreground, one or two browsers at a time. Every failure was re-run on its own before I reported it.
- **Scripts:** `scratchpad/qa-r15b/tools/`:
  - `routes.js`: 123 routes per size.
  - `journey.js`: J1–J10 customer journeys.
  - `points2.js`: the 38 points not run in R15, plus re-checks.
  - Also re-run: the R15 `features.js` and the fixer's `nav.js`, `feat.js` and `points.js` (copied as `r15-*.js` and `r16-*.js`).
  - `agg.js` and `aggj.js` total the results.
- **Raw data:** `scratchpad/qa-r15b/out/`. **Screenshots:** `scratchpad/qa-r15b/` (the `fail-*.png` files belong to the bugs below; `j-*-invoice.png` are invoices from the journeys).

## Summary

| | Count |
|---|---|
| Checklist points | 405 |
| — Backend / real device only (run later from the real backend) | 58 |
| **Non-backend points (the owner's standard)** | **347** |
| ✅ Pass | **313** |
| ❌ Fail | **22** (16 distinct bugs) |
| 🔒 Blocked: needs owner data (code ready) | 10 |
| ⚖ Owner decision, not a bug (L27 slider snap, P11 second Add) | 2 |
| Route checks (123 routes × 20 sizes) | 2,460. 0 JS errors, 0 sideways scroll, 0 blank, 0 crash, 0 CLS > 0.02, 0 content under a bottom bar |
| Journey checks (J1–J10 × 20 sizes) | 326. 295 pass, 31 fail. All 31 failures are wide touch tablets (bug 1) or the demo tab covering the language switch (bug 12) |

**Is the owner's standard met? No.** 313 of 347 non-backend points pass. The 10 owner-data points and the 2 owner decisions cannot be closed by the developers. The other **22 points fail on 16 real bugs.**
- The biggest is bug 1, on wide touch tablets: iPad landscape, iPad Pro 12.9, and Android tab landscape.
- Phones and tablets in portrait pass every journey.

### Per device group

| Group | Sizes | Journeys J1–J10 (pass / run) | Route sweep findings | Bugs that apply |
|---|---|---|---|---|---|
| Phones | 8 | **128 / 128** | exchange bar off screen; size-guide page gutter 0; small breadcrumb, bag-name and admin taps; combo chip text cut on 4 phones | 4, 5, 7, 8, 9, 10, 11, 13, 14, 16, (3 admin inputs) |
| Tablets, portrait < 1024 px (iPad mini, Air, Pro 11, Android tab) | 4 | **64 / 64** | exchange bar off screen; set-builder swatches 22×22; combo chip cut | 4, 5, 7, 8, 9, 10, 11, 14 |
| Tablets, touch ≥ 1024 px (iPad mini/Air/Pro 11 landscape, Pro 12.9 both, Android tab landscape) | 6 | **66 / 96** | inputs 15 px; footer contact labels overflow or overlap; set swatches small | **1**, **3**, 6, 7, 8, 9, 10, 11, **12**, 14, 15 |
| Desktop | 2 | **37 / 38** | footer contact labels overflow; set swatches small | 6, 7, 8, 9, 10, 11, 12 (1280 only), 14, 15 |

### Customer journeys (what was run on every size)

| # | Journey | Phones | Tablet portrait | Tablet ≥1024 | Desktop |
|---|---|---|---|---|---|---|
| J1 | Home → category (tapped) → grid card → size → Add → View bag → Checkout → name/phone/address → Confirm → thanks → invoice. Checked that invoice total = order total = checkout total = bag total, item count matches, and the download works | ✅ 8/8 | ✅ 4/4 | ✅ 6/6 | ✅ 2/2 |
| J2 | Same journey in Bengali (switch tapped, Bengali name, Bengali digits ০১৭…, Bengali address; checkout ≥ 150 Bengali characters, thanks in Bengali) | ✅ | ✅ | ❌ language switch can't be tapped (bug 12); the flow itself works | ❌ 1280 (bug 12), ✅ 1440 |
| J3 | Combo: #/combos → rule → pair (grid card) → back (list scroll kept) → forward → size → Add both → bag (set price) → checkout → order | ✅ | ✅ | ✅ | ✅ |
| J4 | Back/forward/swipe and scroll restore: footer → Contact → back; category grid → product → back → forward → back; cat → pdp → bag → back → back → forward, then 3 s with no auto-jump; 8 pages with 12 mixed moves | ✅ swipe + Back | ✅ swipe + Back | Back/Alt/keys ✅, **swipe ❌** (bug 1) | ✅ Back, Alt, Backspace |
| J5 | Refresh mid-journey: product with item in bag, checkout with typed details, combo pair; back still works after reload | ✅ | ✅ | ✅ | ✅ |
| J6 | Pull-to-refresh on 11 page types (home, category, product, combos, pair, set, bag, checkout, help, search, admin). Short pull and pull while scrolled are ignored | ✅ | ✅ | **❌ no pull-to-refresh** (bug 1) | ✅ not shown |
| J7 | Zoom viewer: opens full screen, swipes, closes by ✕, Esc and Back; combo-pair zoom | ✅ | ✅ | ✅ | ✅ |
| J8 | Size guide: footer finder over the current page → result; product size chart in cm and inch | ✅ | ✅ | ✅ | ✅ |
| J9 | WhatsApp header icon: prefilled message, names product + SKU on a product page, new tab, shop stays open, ≥ 40×44 px | ✅ | ✅ | ✅ | ✅ |
| J10 | Search typos through header icon + Enter: pollo 9, panjbi 1, hoddie 2, shrit 2, oxfrod, chinos, tshirt, পোলো | ✅ | ✅ | ✅ | ✅ |

Measured highlights:
- **Scroll is kept on back:** home footer 5,997 → 5,997 (393), 6,142 → 6,142 (320), 7,173 → 7,173 (Android tab). Category grid 937 → 937 after Back and after Forward.
- The same grid card is on screen after returning. Grid cards were used, as the fixer advised for sliders.
- Combo list kept 426 px on 393.
- No blank page and no auto-jump to Home in any run.
- Fixer nav suite: **ALL OK** on 393, 1280 and iPad mini portrait.
  - Slow swipe works, native+swipe race at CPU ×4 and ×8 works, and popup + Back works.
  - It cannot pick a card at 320; my J4 covers 320.

## R15 wave 2 — fix round (Prohori A360-02, 2026-10-19)

- **Build:** `scratchpad/proto/dist/r16.html`; frozen copy for the re-check: `scratchpad/proto/dist/r16b-qa-snapshot.html` (2,427,889 bytes).
- **All 16 bugs fixed** (last column). Gates on the frozen copy: device-matrix `--group=all` (run in 5 chunks of 5 devices with `--slice`) **0 failing of 480**; combo-auto `verify.js` **ALL PASSED** (B5 default); `combo-wave2/sweep.js` **ALL CLEAN** (15 phones); admin `ops-test.js` and `ops-flow.js` **ALL PASSED**; my `nav.js` / `feat.js` ALL OK.
- **R15b tools re-run** (copies in `scratchpad/r16-tests/qa15b/`): `journey.js` J2/J4/J6 PASS on ipadmini-l and ipadpro129-p, J1/J2/J4/J6 PASS on 1280, J1/J3/J5/J7/J8 PASS on 393; `points2.js` full run on 393 and ipadmini-l; `routes.js` on 393, 320, ipadmini-l, 1280 (no SMALL, FONT<16, GUTTER, H1, STICKS, HSCROLL); `ftrrow.js` on six sizes.
- **Also fixed on the way:** Confirm button was switched off by typing in the owner's style "b"; checkout now warns about short stock before Confirm (E03 note); the wallet amount is a visible line on phones (CO27 note); admin pages now have a `<main>` landmark (the jolt recorder's "empty admin page"); the payment page names every method in its first line; offers past their end never auto-apply.
- **What the R15b tools still flag, and why it is not a bug:** A09 (the check reads only the first 200 characters of the account page — the names are further down, the buttons are found); AX02 on #/account (the tool cannot read text on the dark gradient wallet card — QA already ruled it fine); CB06b (the tool looks for the old "Change size or colour" link; the B5 bag, Sawdagor's default, changes a set's size right in the row — checked: size L→M, set price ৳1,800 kept); ellipsis truncations listed under Observations.
- **Owner decisions unchanged:** P11, L27 (kept as ruled). Owner data still needed for the 10 blocked points.

## Failures, ranked by severity

Severity:
- **S1:** blocks a sale or loses the shopper. None found.
- **S2:** wrong information, or a core gesture missing on a whole device group.
- **S3:** annoying.
- **S4:** cosmetic.

| # | Sev | Points | Where (devices) | Steps | Expected | Measured | Likely cause (file:line) | Screenshot | Fixed (R15 wave 2) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | S2 | N03 N04 N06 N38 N39 N40 | **Touch tablets ≥ 1024 px wide:** iPad mini/Air/Pro 11 landscape, iPad Pro 12.9 portrait + landscape, Android tab landscape (6 of 10 tablet sizes) | (a) Category → product → edge swipe from x=5. (b) Pull down 300 px at the top of 11 page types | (a) Back one page. (b) "Release to refresh" → reload | (a) Nothing happens: still on the product (J4a/b, 6/6 sizes). (b) No indicator, no reload on all 11 page types. Phones and the 4 portrait tablets pass both. | `09-ptr.js:26` returns when `innerWidth >= 1024`; `99-boot.js:261` the same for the swipe. `r12-pdp.css:677` `html,body{overscroll-behavior-y:none}` also stops the browser's own pull-to-refresh, so these tablets have **no** refresh gesture. Should test touch (`pointer:coarse`), not width. Swipe: Safari on a real iPad has its own edge swipe; confirm on a real iPad. Pull-to-refresh is missing for certain. | (journey JSON `out/journey-ipad*-l.json`) | ✅ **Fixed.** Edge swipe and pull-to-refresh are decided by input (`isTouchUI()`: primary coarse pointer, or touch with no hover), not by width; the PTR pill shows on ≥1024 touch screens; desktop with a mouse still has neither. `02-core.js`, `09-ptr.js`, `99-boot.js`, `r12-zfix.css`. Verified R15b `journey.js` J4 (swipe) + J6 (PTR, 11 page types) PASS on ipadmini-l and ipadpro129-p; J6 "not on desktop" PASS on 1280. |
| 2 | S2 | E04 | All sizes | Put Everyday Crew Tee in the bag, then raise its price ৳100 (as an admin price change would) → open bag and checkout | "Price changed from ৳X to ৳Y" note | The new price is charged silently; no note in the bag or at checkout | Loose bag lines use the live `p.price` (`50-bag.js:222-231`), and the price at add time is not stored. Only set lines get "Set price changed…" (`50-bag.js:263`). | — | ✅ **Fixed.** A loose bag line keeps `addedPrice` (set by `bagAdd`); bag and checkout summary show "Price changed from ৳X to ৳Y — you pay the new price" (same note as sets). `02-core.js`, `50-bag.js` `bag_priceNote`, `51-checkout.js`. Verified `points2.js` E04 PASS. |
| 3 | S3 | F06 | Tablets ≥ 1024 px (6 sizes) on every store page; admin on phones | Focus checkout Name/Phone/Address, footer phone signup, or search | ≥ 16 px (iPadOS zooms on focus below 16 px) | `co-name`, `co-phone`, `co-address` and footer `join` are **15 px** at ≥ 1024. Admin inputs 13–14 px on phones (size charts, combos, settings, backup, audit, health, ads, products, customers). | `styles.css:386-388`: `@media(min-width:1024px){.input,…{font-size:15px}}` treats every ≥ 1024 screen as a desktop, but iPad landscape is touch Safari. Admin: `r12-zadmin*.css`. | — | ✅ **Fixed.** Every typing field (store and admin, every width) is 16 px. `r12-zfix.css`. Verified `routes.js` FONT<16: none on 393, 320, 1024×768, 1280. |
| 4 | S3 | L04 (and L31) | #/exchange/<order>: 8 phones + iPad mini/Air/Pro 11/Android tab portrait | My account → delivered order → Exchange a size | Bottom bar inside the screen with a 16 px gutter | Bar spans −16 … W+16 px (e.g. right edge 409 on 393). "Next" runs off the right edge; "Cancel" touches the left edge. | `61-exchange.js:90` `.exc-mbar{margin:16px -16px 0}` on top of `styles.css:280` (fixed bar with `left:0;right:0`). | `qa-r15b/fail-exchange-bar-393.png` | ✅ **Fixed.** `.exc-mbar` no longer has −16 px side margins; buttons share the bar. `r12-zfix.css`. Verified routes.js: no STICKS/GUTTER on #/exchange (393, 320, 1024×768, 1280). |
| 5 | S3 | L05 | #/combo/ct-tee-trio (15 of 20 sizes, 320 → 1440); #/combo/ct-polo-trio (412, 430, 440, Android tab portrait) | Look at the colour-pair chips | Full names or a clean wrap | Cut mid-word with no "…": "Black + Grey Melange + W", "Sky Blue + White + Na" (text 151 px in a 122 px chip) | `.cb-pairs .chip` uses `fit-x` with clip; the auto-fit rule `fitRule('.cb-wrap .cb-pairs .chip', {min:11,…})` (`40-combo.js`, AUTO-FIT block at the end) can't fit three-colour names | `qa-r15b/fail-combo-chip-cut-320.png`, `…-430.png` | ✅ **Fixed.** Three-colour sets get wide pair chips (`cb-pairs3`: one per row on a phone, 2–4 across on wider screens), so all three names show. `40-combo.js`, `r12-zfix.css`. Verified sweep (no cut text) on ct-tee-trio / ct-polo-trio / polo-duo at 320, 430, 768, 1440; device gate 0. |
| 6 | S3 | L05 | Footer at every width ≥ 1024 (6 tablet sizes + 1280 + 1440) | Scroll to the footer contact row | Labels inside their buttons | "Hotline 09XXX-XXXXXX" sticks out of its button by 7–26 px. At 1024 wide, "Text us on WhatsApp" also overflows (16 px) and the two labels **overlap** ("WhatsAppHotline") | `r11-cat.css:63`: the 3-column footer contact grid squeezes `.ftr-reach`; buttons in `03-layout.js:188-191` don't wrap or shrink | `qa-r15b/fail-footer-contact-1024x768.png`, `fail-footer-contact-1280.png` | ✅ **Fixed.** At ≥1024 WhatsApp/Hotline sit side by side only when `ftrReachFit()` says they fit (as on phones), otherwise stacked; with no social links the contact row is two columns. `r12-zfix.css`. Verified R15b `ftrrow.js`: overflow 0 px on ipadmini-l, ipadpro129-p, ipadair-l, 1280, 1440, 393. |
| 7 | S3 | AX13 | Checkout, login (all) | Checkout: type "0121234" in phone, tap Confirm with empty name. Login: submit empty | Bad fields get `aria-invalid="true"` and `aria-describedby` → message | Checkout: **no field** gets `aria-invalid`; the name message is not tied to the field (only the phone hint is, as a polite live region). Login: the error is `role=alert`, but fields are not marked or tied. | Checkout field markup (`51-checkout.js`, `co-f` blocks); `60-account.js:251` login form | — | ✅ **Fixed.** After a refused Confirm every wrong field gets `aria-invalid="true"` + `aria-describedby` → its message (Bengali prompt, phone hint, or a screen-reader line); login marks phone/password and ties them to `#lg-err`; the bag code field too. Also fixed: typing used to *disable* Confirm in the owner's style "b". `51-checkout.js`, `60-account.js`, `50-bag.js`. Verified points2.js AX13 PASS. |
| 8 | S3 | AX01 | Various | Measure visible controls (QA rule: ≥ 32×32, inline text links excepted) | ≥ 32 px | Combos hub/list/pair breadcrumbs **36×20, 51×20, 59×20** (all 20 sizes). Bag product-name link **142×19** (18 sizes). Set builder colour swatches **22×22** and size pills 28 px wide at ≥ 768 px (11 sizes). "See all 5 colours" **29×32** at 320/360. Admin "Shop →" 46×20, customer-name links 18 px, copy-link 23×23. | `.ca-crumbs` (`42-combo-auto.js:291`) is not covered by the breadcrumb fix `r12-zfix.css:19 .crumbs a`. `a.bg-name` (`50-bag.js:231`). Set swatch fix is phone-only (`r12-zfix.css:74`; `41-set.js:48-56`). | — | ✅ **Fixed.** `.ca-crumbs a`, bag `a.bg-name`, set-builder swatches/pills at ≥600 px, "See all colours" min 32 px, admin "Shop →", customer names, product/blog title links, `zs-link`, copy-link, landing back link, exchange radios. `r12-zfix.css`, `03-layout.js`. Verified routes.js SMALL: none on 393, 320, 1024×768, 1280; `taps.js` 0 on the admin routes. |
| 9 | S3 | B05 B06 | Bag, all sizes | Single item (not a set) in the bag | Change size / colour in the bag, with a stock re-check | The line has only qty ±, Move to wishlist, and Remove. Sets have "Change size or colour". | `bag_itemLine` (`50-bag.js:220-241`). **Owner to confirm** whether this is intended (Remove + re-add works) | — | ✅ **Fixed.** Single bag items now have a colour and a size dropdown (sets' select style); options the stock (minus the rest of the bag) cannot cover are disabled; a refused change says why; a change onto an existing line joins it. `50-bag.js` `bag_itemPick/bag_itemChange`. Verified points2.js B05/B06 PASS; layout checked at 320/393/1280. |
| 10 | S3 | A09 | #/account/wishlist, all | Save 2 items, open Wishlist | Add to bag, or remove | Items and a remove heart only; **no Add to bag**. Move-to-bag exists only in the bag's saved list. | Account wishlist tab (`60-account.js`) | — | ✅ **Fixed.** Wishlist cards have **Add to bag** (size sheet when the size is not known — the bag's own "Move to bag") and **Remove**. `60-account.js`. Verified by hand and points2.js (buttons found). ⚠ The R15b A09 check still reports FAIL only because it looks for the product names in the first 200 characters of the page, which on the account page are the account header; the names are on the cards. |
| 11 | S3 | E05 | Bag/checkout, all | Give an account offer an end date in the past, then type its code | "This code has ended" | Code **accepted** (ST.appliedCode = OLD100) | `bag_findCode` (`50-bag.js:90`) has no end-date check; offers only carry free text ("Ends 31 Oct", `02-core.js:25`). Might be left to the backend; dev to decide. | — | ✅ **Fixed.** Offers can carry `expires` (ms) or `ends` (date); an expired code is refused with "Code X has expired — it ended on …", never applied automatically, and an already-applied expired code drops out with a note. `50-bag.js`. Verified points2.js E05 PASS. |
| 12 | S3 (demo-only) | LG01 | 1024–1366 px: iPad landscape, Pro 12.9 both, Android tab landscape, 1280 desktop | Scroll to the footer, tap EN/বাং | Switches language | The tap lands on the demo "Demo controls" tab (`.demo-fab-t`) that sits on the pill. On the desktop layout this pill is the only switch outside My account. | Demo panel position (`03-layout.js` demo panel, `r12-zfix.css`). Goes away when the demo chrome is removed, but it blocks the owner's own review. | `qa-r15b/fail-lang-switch-covered-1024x768.png` | ✅ **Fixed (demo only).** On the desktop layout the Demo tab and panel sit bottom-left, away from the footer language switch (bottom-right). `r12-zfix.css`. Verified ftrrow.js `covered: null` at 1024×768, 1280, 1440; journey J2 (Bengali, switch tapped) PASS on ipadmini-l, ipadpro129-p, 1280. |
| 13 | S4 | L31 | #/size-guide deep link, all 8 phones | Open #/size-guide | 16 px gutter | "Size guide" heading and text at **0 px** from both edges (behind the finder sheet) | `10-size-guide.js:67` inline `style="padding:28px 0 48px"` wipes the container's side padding | `qa-r15b/fail-sizeguide-gutter-393.png` | ✅ **Fixed.** #/size-guide keeps the container gutter (`.sg-page`). `10-size-guide.js`, `r12-zfix.css`. Verified routes.js GUTTER: none. |
| 14 | S4 | AX09 SE10 | #/combos/nope, #/combo-pair/nope~x (20 sizes) | Open a switched-off rule or an unknown pair | One h1 | **0 h1** ("These combos are switched off", "This combo is not available") | Not-found branches in `42-combo-auto.js` (ca-list / ca-pair) use a `div` heading | — | ✅ **Fixed.** "These combos are switched off" / "This combo is not available" are `<h1>`. `42-combo-auto.js`. Verified: 1 h1 on #/combos/nope and #/combo-pair/nope~x; routes.js H1 clean. |
| 15 | S4 | AX02 | #/checkout at ≥ 1024 | Read the step header | ≥ 4.5:1 | "Done" step label **3.41:1** (#8A8278 on white, 12.5 px). The other 9 sampled pages are clean (the account wallet card is fine on its dark gradient). | `styles.css:1010` `.ckh-steps{color:#8A8278}` | — | ✅ **Fixed.** Step labels `#625B52` (≈6.6:1 on white). `r12-zfix.css`. |
| 16 | S4 | AX03 | #/admin/blog on all 8 phones | Screen reader on the post rows | Every link named | 12 "View" links are an eye icon with no name: the word "View" is hidden on small screens | `94-admin-blog.js:111` `<span class="zo-hide-s">View</span>`, no `aria-label` | — | ✅ **Fixed.** Blog "View" links carry `aria-label="View <title> on the shop"`. `94-admin-blog.js`. Verified routes.js NONAME: none. |

### Observations (not counted as fails)
- **Ellipsis truncation:** combo card subtitles ("Fleece Hoodie 6-Colour · 2…"), the bag summary row at 320 ("Slim Chino Trousers · 34 × 2…"), the "Grey Mela…" swatch label in pair template P2 at ≥ 1024, and some admin table cells. These end in a proper "…", so I did not count them against L05.
- **E03 passes, with a note:** at checkout nothing warns about the stock change until Confirm is tapped. Confirm then refuses, shows "Only 1 left in Navy · L — your bag has 2", sends the shopper to the bag (which shows the fix) and keeps the typed details. A warning on the checkout page itself would be kinder.
- **CO27 passes:** wallet ৳350 comes off the total and the Confirm button. On phones the wallet line sits inside the collapsed order summary.
- **Admin pages have no `<main>` landmark.** The jolt recorder therefore sees an "empty page" on admin; this is not a real blank.
- **The welcome sheet on a first visit** owns one history step. The first Back closes it and the second leaves the shop (consistent with N12). N13/N50 pass.
- **Route checks are clean at the high level:**
  - The `See all 5 colours` link reaches only 29 px at 320/360 (bug 8).
  - Every other product-page owner rule passes the device gate at all 25 gate sizes.

## Blocked: needs owner data (code ready, value missing)

| Points | What the owner must give | Where it goes |
|---|---|---|---|
| M01, TR08 | Real WhatsApp number (now `8801XXXXXXXXX`) | `DB.whatsapp` |
| M05, H21 text, TR08 | Real hotline (now `09XXX-XXXXXX`) | `DB.hotline` |
| M07, TR05 | Support email, street address (registered business name optional) | `DB.site.supportEmail`, `.address`, `.registeredName` |
| H23, TR06 | DBID number | `DB.site.dbid` |
| H23, TR07 | Trade licence number | `DB.site.tradeLicence` |
| H19, TR12 | Facebook, Instagram, YouTube, TikTok page links | `DB.site.social.*` (empty ones stay hidden) |

## Open owner decisions (not bugs)
1. **P11:** a second "Add to bag" of the same size says "already in your bag" instead of making it 2.
2. **L27:** sliders drift on their own with no snap (owner rule, which conflicts with the checklist wording).
3. **B05/B06** (bug 9): should a single item's size or colour be changeable in the bag, as it is for sets?
4. Already ruled and kept: offers tick on by default (CO20), no floating WhatsApp button (M04 passes because nothing is covered), Share off (P25), Send bag on WhatsApp off (B19).

## What still needs a real device or the backend (58 points, marked —)
- **Real iPhone / iPad (Safari, WebKit):** Safari's own swipe and page snapshot, N52, safe areas (L12, L13), keyboard covering fields (CO24). Bug 1 on a real iPad.
- **Backend / network / hosting:** payments (CO29, CO30), OTP / SMS (A06, T12, T13), analytics (AN01–AN10), SEO and hosting (SE03–SE09, SE11, SE12, PF01–PF03, PF11), security (SC01–SC03, SC05, SC06), offline (OF01–OF05, OF07, OF08), E06, AD11.
- **Real photos:** P34, AX04, L11.

---

## R15c — independent re-check of fix wave 2 (QA, 2026-10-19)

- **Build (frozen):** `scratchpad/proto/dist/r16b-qa-snapshot.html` (2,427,889 bytes). It contains Prohori's fix wave 2 and Sawdagor's combo wave 2 (P3/P4, bag templates B1–B5, with **B5 as the default bag**). I fixed nothing.
- **How it was run:** foreground chunks, at most 2 browsers. Chromium with CDP touch.
- **Scripts:** `scratchpad/qa-r15b/tools/`, with `QA_HTML` pointing at the new build. There is a new `points3.js` for the 16 bugs; `journey.js`, `routes.js` and `points2.js` are reused.
- **Raw data:** `scratchpad/qa-r15c/out/`. **Screenshots:** `scratchpad/qa-r15c/`.

### Result

| | R15b | **R15c** |
|---|---|---|
| ✅ Pass | 313 | **334** |
| ❌ Fail | 22 | **1** (AX02, S4) |
| 🔒 Blocked: owner data | 10 | 10 |
| ⚖ Owner decision | 2 | 2 |
| — Backend / real device | 58 | 58 |

**Is the owner's standard met? Not yet. One point is short.** 21 of the 22 R15b fail points now pass on every size where they failed. AX02 still fails on a different element: the checkout "WhatsApp us" text. It is a one-line CSS fix. Everything else outside the 10 owner-data points and the 2 owner decisions passes.

### What was run
1. **The 16 bugs, on all 20 sizes** (8 phones, 10 tablets, 2 desktops), using `points3.js` (functional checks) plus a 23-route layout subset:
   - E04, E05, B05/B06, CB06b (B5), CB06c (3 sets, ▸), A09, AX13, AX02, language switch, footer labels, exchange bar.
   - The 23 routes cover size-guide, combos hub/list/nope, pair (P1/P2/nope), ct-tee-trio, ct-polo-trio, office-trio, bag, set, exchange, product, checkout, home, admin blog/customers/landing/settings/size-charts, and login.
2. **Full journeys J1–J10 on the 6 wide touch tablets** (iPad mini/Air/Pro 11 landscape, iPad Pro 12.9 both orientations, Android tab landscape): **96 / 96 PASS** (16 checks per size). Edge swipe and pull-to-refresh both work.
   - Desktop still has no pull-to-refresh: a 300 px mouse drag on 1280 and 1440 shows no indicator and does not reload, and `(pointer:coarse)` is false there.
   - 1280: J2 (Bengali, switch tapped) and J9 pass.
3. **Regression checks:**
   - Full route sweep (123 routes) on 320, 393, iPad mini landscape and 1280: 492 checks. 0 JS errors, 0 sideways scroll, 0 sticking out, 0 small taps, 0 inputs under 16 px, 0 gutter problems, 0 h1 problems, 0 unnamed links, 0 layout shift above 0.02, 0 content under a bar. Only ellipsis ("…") truncations are left; these are observations, as in R15b.
   - New templates, with three sets in the bag: P3/P4 pair pages and `#/bag?btpl=current|B1|B2|B3|B4|B5` on 5 sizes. Clean.
   - J1/J3/J5 on 320, 393 and 1440: pass.
   - **Device gate `--group=all`** (4 slices): **0 failing of 480**.

### The 16 R15b bugs: R15c verdict

| # | R15b bug | R15c | Measured |
|---|---|---|---|
| 1 | Wide touch tablets: no edge swipe, no pull-to-refresh | ✅ | J4 swipe (footer → Contact → back, y 6,998 → 6,998; category y kept; 3 s no auto-jump) and J6 (11 page types, "Release to refresh" → reload, bag kept) pass on all 6 sizes |
| 2 | E04 price change silent | ✅ | Real add stores ৳550. After +৳100, bag **and** checkout show "Price changed from ৳550 to ৳650 — you pay the new price" on 20 sizes |
| 3 | F06 15 px inputs at ≥1024; admin 13–14 px | ✅ | No input under 16 px on any route in the subset, on any size |
| 4 | Exchange bar off screen | ✅ | Bar spans 0…W, buttons 16 px in (phones, tablet portrait). On the desktop layout the bar is hidden and the side summary carries the buttons |
| 5 | Combo pair chips cut mid-word | ✅ | ct-tee-trio and ct-polo-trio: no clipped chip on any of the 20 sizes |
| 6 | Footer WhatsApp/Hotline labels overflow at ≥1024 | ✅ | Ink inside the box (over = 0), no overlap, on all 20 sizes |
| 7 | AX13 errors not tied | ✅ | Checkout name/phone/address: `aria-invalid="true"` and `aria-describedby` → message. Login phone/password: `aria-invalid`, described by the `role=alert` error |
| 8 | AX01 small targets | ✅ | 0 small targets on the subset routes, all 20 sizes. B5 ▸ button is 44×44 |
| 9 | B05/B06 no size/colour change for a single item | ✅ | Size `<select>` (16 px, sold-out XXL disabled): L→XL. Colour `<select>`: navy→black. Still one line |
| 10 | A09 wishlist has no Add to bag | ✅ | "Add to bag" on each card (size pick → 1 line in the bag) and Remove. See tool note below |
| 11 | E05 expired code accepted | ✅ | Typing an ended code gives "Code OLD100 has expired — it ended on 1 Oct". A code applied earlier that has since ended shows "has expired, so it is not used" at checkout |
| 12 | Demo tab covers the language switch | ✅ | The pill is the top element at its centre; a tap switches EN→বাং on all 20 sizes; J2 passes on the wide tablets and 1280 |
| 13 | #/size-guide gutter 0 | ✅ | 16 px on all phones |
| 14 | No h1 on combos-off / unknown pair | ✅ | One h1, 20 sizes |
| 15 | AX02 checkout "Done" 3.41:1 | ✅ for "Done", but **AX02 still ❌**, see below | — |
| 16 | Admin blog View links unnamed | ✅ | 0 unnamed links on #/admin/blog (phones) |

**CB06 with B5 (default bag):**
- **One or two sets:** each set already shows a size `<select>` per piece in its card. Changing piece 1 from S to M kept ৳1,800 and kept one line.
- **Three or more sets:** each set becomes a compact row with a ▸ button (44×44). Tapping ▸ opens the card; changing a size kept the bag total at ৳4,500 across 3 lines.
- **Old link:** "Change" (the old "Change size or colour" link, now shorter) is still in the expanded card and in `?btpl=current`.
- Passed on all 20 sizes.

**Wave-2 notes, verified:**
- E03: checkout now shows "Only 1 left in Navy · L — your bag has 2. Remove 1 to continue. Fix it in your bag" before Confirm.
- CO27: the "Wallet −৳350" line is visible on phones.

### Still failing (1)

| # | Sev | Point | Where | Measured | Cause |
|---|---|---|---|---|---|
| 17 | S4 | AX02 | #/checkout on 8 phones + 4 tablet-portrait sizes (< 1024 px) | "Need help? **WhatsApp us**": green #1FA855, bold 15.5 px, on the #F3F1EC help strip = **2.79:1** (needs 4.5:1; bold text counts as large only from 18.66 px) | `r12-acct.css:289-293`: `.co-help .wa-btn.co-wa b, .co-wa-s {color:#1FA855}` with no button background on phones. The rule is already in the R15b build; the R15b tool missed it because its checkout sample had an empty bag. A darker green (e.g. #0F6E37, ≈ 5.6:1 on #F3F1EC; #137A3E is only 4.79:1) or the filled green button used on desktop would fix it. |

Screenshot: `qa-r15c/ax02-checkout-wa-393.png`.

### Tool corrections (checked myself, not taken on trust)
- **A09.** Prohori is right that the R15b `txt` field was cut at 200 characters. The verdict did not come from that field, though: it came from a scan of **every** button and link on the page, and that scan found only "Remove from wishlist". I re-ran the fixed tool (whole page) against the **old** R15b build, and it still finds no Add to bag there. So the R15b fail was real. On the new build the Add to bag exists and works.
- **AX02.** Prohori is right that the R15b tool could not measure text on a gradient: it treated a gradient background as white, so the account wallet card was a false alarm.
  - The tool now composites colour layers and tests every gradient stop (worst case). The wallet card passes.
  - The courier badges ("SF" white on #0C8A4B = 4.42:1) are `aria-hidden` logo marks. Logos are exempt from the contrast rule, so I did not count them.
  - The fixed tool, with a seeded bag, found the real checkout "WhatsApp us" failure above.
- **CB06b.** Updated for B5: the in-row `<select>` for one or two sets, ▸ for three or more sets, and the "Change" link.

### Owner items (unchanged, not counted as fails)
- **🔒 Blocked on owner data (10 points):**
  - M01, TR08: real WhatsApp number.
  - M05, TR08: hotline.
  - M07, TR05: support email + street address.
  - H23, TR06: DBID.
  - H23, TR07: trade licence.
  - H19, TR12: social page links.
- **⚖ Owner decisions (2 points):**
  - P11: second Add of the same size says "already in your bag".
  - L27: sliders drift on their own, with no snap.
- **Already ruled:** offers tick on by default (CO20), no floating WhatsApp button (M04).

---

## R15d: final regression before V12 (QA, 2026-10-19)

- **Build (frozen):** `scratchpad/proto/dist/r16c-qa-snapshot.html` (2,883,194 bytes). It contains:
  - the AX02 fix
  - the owner-answer changes: consent ticks, trial line, `bag.duplicateAdd`, slider snap after a drag, full CRM phones with logs, combo lifecycle
  - naming and links, new brands
  - the `parseHash` → `parseHashRaw` + `nm_resolve` split
- **Not covered:** the blog (#/journal*, #/admin/blog), which the blog QA agent covers.
- **How it was run:** one browser at a time, foreground chunks.
- **Scripts:** `scratchpad/qa-r15b/tools/` with `QA_HTML` pointing at r16c. The new `points4.js` covers the new features.
- **Raw data:** `scratchpad/qa-r15d/out/`.

### Result

| | R15c | **R15d** |
|---|---|---|
| ✅ Pass | 334 | **337** |
| ❌ Fail (checklist) | 1 | **0** |
| 🔒 Blocked: owner data | 10 | 10 |
| ⚖ Owner decision | 2 | **0** (L27 and P11 settled by the owner's answers; both pass) |
| — Backend / real device | 58 | 58 |

**Is the owner's standard met? Not yet.**
- **Checklist: yes.** All 337 testable non-backend points pass; the other 10 wait on the owner's own data.
- **New features: no.** One new feature is broken: **old product links do not forward on the shop** (bug 18 below). Fix it before V12 goes out.

### What was run
1. **Device gate `--group=all`** (4 slices): **0 failing of 480**.
2. **Full route sweep, 126 routes × 20 sizes = 2,520 checks.** The route list now includes #/admin/naming, the new brand products, and two old links; the blog routes are left out.
   - Results: 0 JS errors, 0 sideways scroll, 0 blank pages, 0 crashes, 0 sticking out, 0 small taps, 0 inputs under 16 px, 0 gutter problems, 0 h1 problems, 0 unnamed links, 0 layout shift above 0.02, 0 content under a bar.
   - Only "…" truncations are left. The Lacoste/Tommy titles at 393 are 2 px over, but every letter shows.
3. **Journeys J1–J10 on all 20 sizes: 326 / 326 PASS** (phones 128, tablets 160, desktop 38).
   - Back, forward and swipe with scroll restore (J4a–d), refresh (J5), pull-to-refresh (J6) and search typos (J10) all pass after the `parseHash` change.
   - Fixer nav suite: ALL OK on 393 and 1280.
4. **New-feature checks** (`points4.js`) on 320, 393, 440, iPad mini landscape and 1280; **R15c bug checks** (`points3.js`) on 393, iPad mini landscape and 1280; **broad points** (`points2.js`) on 393.

### New features: verdict

| Feature | Verdict | Measured |
|---|---|---|
| Consent ticks at checkout | ✅ | Defaults: SMS ticked, WhatsApp unticked. Four real orders (default, SMS off + WA on, both on, both off) each stored `order.consent = {sms, wa, src:'checkout'}` correctly, and the account copy matches. |
| Consent on the landing form | ✅ | Fresh visitor: SMS on, WA off. A landing order with WA on and SMS off stored `{sms:false, wa:true, src:'ad landing'}`. A returning customer starts from their last choice (by design). |
| Consent in My account | ✅ | Two toggles. WhatsApp on survives a reload (`acct.consent.src = 'my account'`). |
| Trial at the door | ✅ | "Try it on in front of the rider" on the product page, checkout, Delivery and Exchange pages; the Bengali line shows in বাং. |
| `bag.duplicateAdd` | ✅ | block (default): "Already in your bag — size S (1)", qty 1. qty: "Size S — now 2 in your bag", qty 2. |
| Slider snap after a hand drag (L27) | ✅ | Touch drag of 70 px and 25 px (phones, tablets) and mouse drag (desktop). The row ends **0–0.2 px** from a card edge, with **0 direction reversals** (no jitter) in the 1.2 s glide. It holds still for 4 s, then drifts on (22–26 px over the next 2 s). On desktop the drift stays paused while the mouse rests on the row (hover rule). |
| Full CRM phone numbers with logs | ✅ | The list shows full numbers (01812-345671 …), 0 masked. The profile has "Who looked at this customer" with "opened the profile"; Copy adds "copied the phone number". |
| Combo lifecycle | ✅ | Gave solid-polo-2 an end date in the past. Results: removed from #/combos; the rule page and pair page stay live in the ended state ("এই অফার শেষ / This offer has ended"), with no buy button and 7 alternatives; one h1. A set already in the bag keeps ৳1,800 and the bag and checkout show "This offer has ended — you can still buy it at the price in your bag". The Archive tab is in #/admin/combos. |
| #/admin/naming | ✅ | One h1, 31 link rows, no sideways scroll. |
| Brand line, new demo brands | ✅ | Lacoste, Tommy Hilfiger, Calvin Klein, Levi's, Hugo Boss, Zara products render on all 20 sizes. The brand line on cards is hidden when the name already contains the brand (by design). |
| **Old product links forward** | **❌ bug 18** | See below. |
| AX02 checkout WhatsApp text | ✅ | #0F6E37. The contrast check is clean on 10 pages × 3 sizes. |
| R15c bug checks | ✅ | E04, E05, B05/B06, CB06b/c (B5), A09, AX13, language switch, footer labels, exchange bar: all pass. |

### Failure (new feature, outside the 405 points)

| # | Sev | Feature | Where | Steps | Expected | Measured | Cause (file:line) |
|---|---|---|---|---|---|---|---|
| 18 | **S2** | Old product links forward (owner change "product redirects from old slugs") | Every size, every shopper who has **not** opened #/admin/naming in that browser (that is, every real customer) | Open `#/p/rl-pique-polo-slim`, `#/product/ralph-lauren-polo-black/`, `#/product/lacoste-polo-white/`, `#/product-category/polo-shirts/ralph-lauren-polo/` or `#/product-category/t-shirt/combo/`, cold or from inside the shop | Forward to #/p/rl-pique-polo, #/p/rl-solid-polo, #/p/lc-classic-polo, #/c/polos, #/combos | **"Product not found" / "Page not found"** on all 5 links and all 5 sizes tested. After opening #/admin/naming once in the same browser, all 5 forward correctly. Back and Forward are also right then (#/c/shirts ⇄ target), and so is swipe-back on phones, so the `parseHash` integration itself works. | `nm_findR` (`95-admin-naming.js:169-170`) reads `ST.naming.redirects` directly. That list is only created by `nm_st()` (`95-admin-naming.js:63-64`), which only the admin page calls. On the shop the list is empty. Fix: call `nm_st()` inside `nm_findR`, or seed `ST.naming` at boot. |

### Notes
- The fixer's `feat.js` stops at the old single opt-in checkbox (`[data-change=co-optin]`), which the two consent ticks replaced. That is an out-of-date test, not a bug; consent is covered by `points4.js`.
- Fixer `points.js`:
  - N13/N50 shows history.length 3 on first load: the welcome sheet owns one step, then one Back leaves (checked in R15b).
  - L27 and P11 now pass as owner settings.
  - B19 is an owner switch, off.
- The R15b-era copies of the CB06b, A09 and AX02 checks inside `points2.js` are replaced by the `points3.js` versions (B5 bag, whole-page scan, gradient-aware contrast).

### Owner items
- **🔒 Blocked on owner data (10 points), unchanged:**
  - M01, TR08: WhatsApp number.
  - M05, TR08: hotline.
  - M07, TR05: support email + street address.
  - H23, TR06: DBID.
  - H23, TR07: trade licence.
  - H19, TR12: social page links.
- **⚖ Owner decisions:** none left open. L27 is now snap-after-drag and P11 is now the `bag.duplicateAdd` setting (default block). CO20 stays an owner ruling: SMS ticked, WhatsApp unticked.
