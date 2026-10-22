# QA — EXTAS demo V12.2 — independent check (Note 54 items 1–18, CN-014 items 19–20)

Checker: independent QA agent. I did not write this code and changed nothing. Date: 23 Oct 2026.
File checked: `scratchpad/v122/EXTAS-demo-V12.2.html` (baseline for comparison: `docs/demo/EXTAS-demo-V12.1.html`).
Method: one headless Chromium (Playwright), widths 1366×800 and 390×844, plus 1920 (header, bag panel), heights 700 / 800 / 900 / 1080 / 1200 for the bag panel fill, 360 for the phone pixel compare. Reduced motion on for screenshots; motion on for the flit checks.
Screenshot folder (all paths below are relative to it): `/tmp/claude-0/-home-claude/a27f8d4d-b57b-5d41-b919-c637e74e7368/scratchpad/qa-v122/`

## Result

| | Count |
|---|---|
| PASS | 9 |
| PASS-with-polish | 7 |
| FAIL | 4 (items 13, 15, 17, 19) |

Merge gate: **not passed** (4 fails).

Automated checks run by me: about 540. These include 41 admin guides × 2 widths, 37 bag-panel sizes, 13 phone-number formats × 2 widths, 10 hero templates × 3 widths, 8 features, 11 logo styles, 7 header widths × 2 layouts, and 22 phone pages pixel-compared with V12.1. JavaScript errors: 0.
Phone pixel compare against V12.1 (390 and 360; home, category, 2 product pages, bag, checkout, combos, account, track, exchange page, search): **only the checkout differs**. The only changes are text: the heading, the address hint, the removed SMS and refund line, and the new terms link. Screenshot: `09-phone-checkout-old-vs-new-p.png`.

## Item by item

| # | Item | Verdict | One-line reason | Screenshot(s) |
|---|---|---|---|---|
| 1 | Footer link icons | PASS | All 15 desktop footer links have a small, matching line icon. The phone footer is unchanged and already had icons. | `01-footer-d.png`, `01-footer-icons-zoom-d.png`, `01-footer-p.png` |
| 2 | Footer social icons | PASS-with-polish | There are real Facebook, Instagram, YouTube, TikTok and WhatsApp marks in neat round outlines (4 are dimmed until their address is set). But the icon row is left-aligned under centred hours and hotline lines, and the phone footer still has no social icons at all. | `02-social-zoom-d.png`, `01-footer-p.png` |
| 3 | Bag panel "Free delivery on this order" | PASS | No box and no fill: a truck icon, green text and a thin highlighter band. It does not read as a button. (Info: below the free-delivery limit, for example ৳600 in the bag, the panel shows no "৳900 more for free delivery" nudge. V12.1 had none either.) | `03-free-line-zoom-d.png`, `03-drawer-under-threshold-d.png` |
| 4 | Bag panel recommendations fill | PASS-with-polish | At 1366 and 1920 × 700–1200 there is never a scrollbar, the gap under the buttons is always 22 px or more, and "+5 more items · View bag" appears only when a line will not fit. But at 700 px high with 4 items the whole "Complete the look" block disappears and leaves **109 px of blank space** under the buttons. 1366×900 with an empty bag leaves 84 px. Phone sheet unchanged (correct). | `04-drawerB-1366x700-bag3.png`, `04-drawerB-1366x900-bag0.png`, `04-drawerB-1366x700-bag8.png`, `04-drawerB-1920x1080-bag3.png`, `04-drawerA-1366x1080-bag0.png`, `04-drawer-phone-390x844-bag3.png` |
| 5 | Bag page offer cards | PASS-with-polish | The polo card is now clean white with an outline button, no longer cheap green. The bottoms line up (640 = 640), but the offer card's top border sits **2 px above** the product cards (182 vs 184). There is also about 130 px of empty space inside the offer card between "4 polos" and the button. | `05-bag-offers-d.png` |
| 6 | Checkout heading | PASS | "Delivery details" on desktop and phone. The heading, Bengali heading and field order are in Admin › Settings (checked: the rows exist and an edit changes the checkout). | `06-checkout-top-d.png`, `06-checkout-full-p.png` |
| 7 | Checkout labels and padding | PASS | Labels went from 13 px/600 to 15 px/700 and the card is 12 px shorter. (Tiny: 23 px top padding vs 30 px under the address box.) | `06-checkout-top-d.png` |
| 8 | Address placeholder | PASS | "বাসা/রোড নম্বর, এলাকা, থানা ও জেলা লিখুন — রাইডার যেন সহজে খুঁজে পায়". It wraps to 2 lines on phone and is fully visible. | `06-checkout-top-d.png`, `06-checkout-full-p.png` |
| 9 | Phone error | PASS | Typing "01" or "0171234" shows nothing. Leaving the box with 7 digits shows a small "7/11 digits" chip inside the box, and the address box does not move (0.0 px). A valid number shows "✓ 01712-345678". All 13 formats from lesson 26 behave correctly. | `09-phone-typing01-d.png`, `09-phone-blur-invalid-d.png`, `09-phone-blur-invalid-p.png`, `09-phone-valid-p.png` |
| 10 | "Try it on in front of the rider" | PASS | On desktop it sits on the right of the "Delivery anywhere…" row, with a sheen that runs 4 times and is off under reduced motion. On phone it keeps its own line (text-only rule). | `10-trial-d.png`, `10-trial-motion-1.png`, `10-trial-p.png` |
| 11 | Bottom terms line | PASS | The SMS line and the "not returned or refunded" text are gone. "Items can be exchanged for size" links to `#/page/exchange`. | `11-terms-d.png`, `11-terms-p.png` |
| 12 | "Need help? Message us on WhatsApp" | PASS | There is a space after "?". A soft sheen runs every 7 s and is off under reduced motion. | `12-help-d.png` |
| 13 | Payment | **FAIL** | Cash on Delivery is open by default; Mobile, Card and Online open only when clicked; bKash, Nagad, Rocket, Visa, Mastercard, Amex, Bank and SSLCommerz marks are all there, and online payment is back. **But on phone (390) in Card & bank the choices are cut: "Masterc…" and "Inte…".** The logos are text badges, and the checkout uses white text on colour while the footer uses colour on white (polish). | `13-payment-default-d.png`, `13-payment-mb-d.png`, `13-payment-card-p.png` (FAIL), `13-payment-online-p.png` |
| 14 | Product page price highlight | PASS | The red "Save ৳450" is gone from the sticky bar, as before. The rating and delivery chips stay. The main price block is pixel-identical to V12.1. | `14-pdp-bar-old-vs-new-d.png`, `14-pdp-top-d.png` |
| 15 | Logos | **FAIL** | The 11 styles are refined (serif, italic, ring monogram, frame, rules, lowercase with a dot, double rule) and the default is unchanged. **But in the header, style 9 "Fine line under the middle letter" draws its line into the tagline "Menswear".** Styles 1 and 9 also do not line up at the left with the tagline. | `15-logos-admin-d.png`, `15-logos-header-all-d.png`, `15-logo-9-zoom-d.png` (FAIL) |
| 16 | Menu "More" rule | PASS-with-polish | 1024–1920: nothing spills over or wraps, and everything folded is inside More. The "Roomy row" (priority) layout follows the rule exactly: 1024 shows 4 categories, 1366 shows 6, 1920 shows all. But the default "main categories + More" keeps Trousers and Hoodies inside More even at 1920, with 230 px free on each side. In V12.1, the version the owner called "good", they were in the row. | `16-header-1366.png`, `16-header-1920.png`, `16-header-more-open-1920.png`, `16-header-priority-1366.png`, `16-header-priority-1920.png` |
| 17 | Hero campaigns | **FAIL** | There are 10 templates. The demo switcher (Auto, Winter, Puja, Eid, Summer, Hot deals) changes both the design and the products. "New campaign" saves, goes live by its dates and shows the chosen collection. "Design your own" saves a template that then appears in every campaign's list. No sideways scroll at any width. **But on phone the Festive frame template cuts prices ("Classic Cotton Panjabi · ৳ 1,8…", "৳ 2,6…").** Hot deals cuts names ("Contrast Coll…"), Centred statement cuts "Embroidered Neck Pani…", and the Festive left arch crosses the gold frame line. Admin template cards also have uneven thumbnail heights. | `17-switch-Puja_festive-d.png`, `17-templates-sheet-1366.png`, `17-templates-sheet-390.png`, `17-FAIL-festive-price-cut-p.png`, `17-deals-names-cut-p.png`, `17-admin-hero-full-d.png`, `17-admin-new-campaign-filled-d.png`, `17-admin-new-campaign-live-home-d.png`, `17-admin-design-own-d.png` |
| 18 | Working style | PASS-with-polish | The builder's gates were broad and the phone held to text-only changes. Still, 4 visible defects reached this check. These are phone cut text in two places and a broken gift box layout, the kinds of things the owner would spot. | — |
| 19 | 8 optional features | **FAIL** | All 8 are off by default. Each has a switch and editable numbers and texts, and each sits in its own section (Orders, Messages, Fulfilment, Analytics, Exchanges, Hero & campaigns, Settings). When switched on, I saw the effect: the Eid banner on home and bag; the gift box at checkout, saved on the order, with a no-price invoice; the self-confirm line on the thanks page; the exact-amount line on tracking and the sticker; the swap line on the exchange page; 5 RTO tables; the Day-1/Day-3 message preview. **But the "Send it as a gift" box is broken on desktop and phone: the gift icon sits on its own line above the label, the tick sits alone above "The invoice in the parcel shows no prices", and the closed box wastes about 80 px.** Polish: Packing proof photo has no effect beyond a text note (the demo has no "mark packed" step), and the Eid banner repeats "Eid delivery: order by" 3 times (3 lines on phone). | `19-gift-off-d.png`, `19-gift-checkout-d.png`, `19-gift-on-p.png` (FAIL), `19-eid-banner-home-d.png`, `19-eid-home-context-p.png`, `19-eidDates-card-on-d.png`, `19-selfconfirm-thanks-d.png`, `19-exact-tracking-d.png`, `19-swap-exchange-d.png`, `19-rtoBook-analytics-d.png`, `19-care-card-on-d.png` |
| 20 | Bengali section guides | PASS | All 41 admin sections show the "এই সেকশনে কী করা যায়" link, on desktop and phone, fully in view. Each panel has 5 parts (purpose, menus, what you can do, switches with defaults, what happens next). There are no Bengali digits, no "ছাঁকনি" or "সংরক্ষণ", and no sideways scroll (82/82). The markdown copies exist (41 + README). They are still in the scratchpad, not yet in `docs/admin-guide/`. | `20-guide-_admin_hero-d.png`, `20-guide-_admin_orders-p.png` |

## Fails: steps, expected, actual

1. **Item 13: phone card names cut.** Steps: 390×844 › bag with 3 items › Checkout › fill the address › Payment › tap "Card & bank".
   - Expected: every card or bank choice reads in full; per the lessons, step down to shorter text or an icon, never cut.
   - Actual: "Masterc…" and "Inte…" are cut in the 2-column grid.
   - Screenshot: `13-payment-card-p.png`.
2. **Item 15: logo style 9 hits the tagline.** Steps: 1366 › Admin › Site builder › Header › logo style 9 "Fine line under the middle letter" › look at the header.
   - Expected: the line under the X sits clear of "Menswear · Made in Bangladesh".
   - Actual: the green line overlaps the top of "Menswear". The tagline rect starts at 76 px and the logo box ends at 71 px, but the underline is drawn below the box.
   - Screenshot: `15-logo-9-zoom-d.png`.
3. **Item 17: phone hero cuts prices and names.** Steps: 390×844 › put the Puja campaign live, or use the demo switcher "Puja festive" › home.
   - Expected: no price or name is ever cut.
   - Actual: the captions end "৳ 1,8…" and "৳ 2,6…". Hot deals shows "Contrast Coll…", "Linen Blend S…" and "Relaxed Twill …". Centred statement shows "Embroidered Neck Pani…".
   - Screenshots: `17-FAIL-festive-price-cut-p.png`, `17-deals-names-cut-p.png`.
4. **Item 19: gift box layout broken.** Steps: switch Gift mode on (Admin › Settings › Optional features) › Checkout, desktop or phone.
   - Expected: one row "☐ 🎁 Send it as a gift", like the SMS tick rows, and a tick inline with "The invoice in the parcel shows no prices."
   - Actual: the icon sits on one line and the label on the next, the tick is orphaned on its own line, and the closed box is about 80 px tall.
   - Screenshots: `19-gift-off-d.png`, `19-gift-checkout-d.png`, `19-gift-on-p.png`.

## Polish list (allowed, but the owner may notice)
- Item 2: centre the social row and payment marks to match the centred contact block, or left-align everything. Consider adding the social row to the phone footer (needs the phone gate).
- Item 4: at 700 px high with 3 or more bag lines, about 109 px stays blank; a 1-row compact "Complete the look" strip would fill it.
- Item 5: align the offer card's top border with the product cards (2 px); spread the tiers or add a short line, so there is no 130 px gap inside the card.
- Item 13: the mobile-banking badges (white on colour) do not match the footer badges (colour on white).
- Item 16: decide whether the default "main categories + More" should promote Trousers and Hoodies when there is room, as the owner's rule and V12.1 did.
- Item 17: the Festive arch crosses the frame on phone; admin template thumbnails have uneven heights; Eid crescent shows a single product.
- Item 19: Packing proof photo has no visible effect in Fulfilment; the Eid banner wording repeats 3 times.
- Info: the free-delivery nudge below the limit is missing in the bag panel (growth idea, CN-013). The self-confirm sample text says "EXTAS" literally; a {shop} token would keep it install-neutral.

## Bengali captions for the owner (screenshots he should see)
- `09-phone-checkout-old-vs-new-p.png`: ফোনের চেকআউট — আগে (বামে) আর এখন (ডানে)। শুধু লেখা বদলেছে, ডিজাইন একই।
- `09-phone-blur-invalid-p.png`: ভুল নম্বর দিয়ে বের হলে ঘরের ভিতরেই ছোট "7/11 digits" দেখায়, ঠিকানার ঘর নড়ে না।
- `13-payment-card-p.png`: সমস্যা — ফোনে কার্ডের নাম কেটে যাচ্ছে ("Masterc…", "Inte…")।
- `15-logo-9-zoom-d.png`: সমস্যা — লোগো 9-এর দাগ নিচের "Menswear" লেখার উপর পড়ছে।
- `17-FAIL-festive-price-cut-p.png`: সমস্যা — পূজার হিরোতে ফোনে দাম কেটে যাচ্ছে ("৳ 1,8…")।
- `17-templates-sheet-1366.png`: হিরোর 10টা তৈরি ডিজাইন (কম্পিউটারে)।
- `19-gift-on-p.png`: সমস্যা — "গিফট হিসেবে পাঠান" বক্সে আইকন আর লেখা আলাদা লাইনে, এলোমেলো দেখায়।
- `04-drawerB-1366x700-bag3.png`: ছোট স্ক্রিনে ব্যাগের প্যানেলে বাটনের নিচে প্রায় 109 px খালি।
- `05-bag-offers-d.png`: ব্যাগ পেজের অফার কার্ড — এখন পরিষ্কার সাদা, পণ্যের কার্ডের সমান উঁচু।
- `01-footer-d.png`: ফুটারের প্রতিটা লিংকে আইকন, নিচে আসল সোশ্যাল আইকন।

## Tools (reusable)
Scripts are in `/tmp/claude-0/-home-claude/a27f8d4d-b57b-5d41-b919-c637e74e7368/scratchpad/qa-tools/`:
- `h.js`: shared helper.
- `a.js`, `b.js` (checkout and phone number), `c.js` (bag panel fill matrix), `d.js`.
- `e.js` + `diff.py`: phone pixel compare with V12.1.
- `f.js` (header and logos), `h2.js`, `h4.js`, `h5.js` (hero), `i.js`, `i4.js` (features), `j.js` (guides), `k.js`, `l.js`.

Raw results: `a.json`, `b.json`, `c.json`, `d.json`, `f.json`, `h2.json`, `i.json`, `j.json` in the screenshot folder.
