# GAP MAP — prototype v5 against the built system (Phase A, 13 Nov 2026)

Checked 13 Nov 2026 against `docs/BLUEPRINT.md`, `docs/MASTER-REGISTER.md` and the real code (`apps/`, `packages/`, `schema.prisma`).
Three part files hold every item with its evidence (kept): [PART-1](gap/PART-1-orders-couriers-rules.md) Orders, Couriers, Rules ·
[PART-2](gap/PART-2-products-finance-reports-home-settings-customers.md) Products, Finance, Reports, Home, Settings, Customers ·
[PART-3](gap/PART-3-inbox-marketing-website-ai-shell.md) Inbox, Marketing, Website, AI Center, Shell. This file is the one list the builders work from.
Nothing built is rebuilt: a screen the prototype drops moves under "More options" or behind a switch, old text struck through ("Nothing is deleted").

## 1. The numbers

| | Count |
|---|---:|
| Already built and the same (build nothing) | 54 |
| Built but must change (small delta on the same PR) | 123 items, grouped into 65 delta lines on existing PRs |
| New (exists nowhere) | 46 items, filed as **49 new register PRs** (659-707) after merging overlaps (the three parts proposed 52) |
| New stage | 1: **S28 — Admin v5 (prototype alignment)**, 49 PRs, 5 build waves |
| Size of the 49 PRs | 3 S · 27 M · 19 L |

Per part: Part 1 = 9 built / 48 differ / 15 new (72 items) · Part 2 = 22 / 45 / 18 (85 rows, 3 prototype-only) · Part 3 = 23 / 30 / 13 (66 items). Change note: **CN-048**.

## 2. Decisions taken here (all reversible, recorded in CN-048)

1. **New stage S28**, PR 659-707. S15, S24, S25 stay exactly as built (CN-047); no S28 PR touches their remaining rows. S17 stays closed.
2. **Lumen stays the look.** The prototype is a plainer cousin of Lumen with the same skeleton (accent, fonts, radius, flat sidebar differ; Part 3 section S8). Only menu renames and moves; the burnt-orange accent is one existing swatch in Settings > Admin look. No re-skin.
3. **Processing is a view, not an OrderStatus.** Real `OrderStatus.PROCESSING` means "picking started" and stays; lists show it as "Picking". Booked, Packed and Paid stay derived. No enum change.
4. **"Start fresh"** (PR 706) is built, but its run action is behind the owner's written OK (BLOCKED.md row 31, Bengali). It never blocks other work.
5. **Admin menu (PR 659) has one owner first.** `sections.ts`, `lumen-nav.ts` and `admin-shell.*.json` are touched by one PR at a time, in the order of section 4; Prisma schema changes are likewise one open migration PR at a time per wave.
6. **Dropped as an extra:** "Phone order" (Part 1 N21, "verify scope"): DECISIONS only asks for price adjust while on the phone, so no separate order-creation screen is built. "Reset sample data" (prototype-only), the "How to try" panel and the AI Approvals queue / AI Training tabs (S15 frozen) are not built.
7. **Overlaps merged into one PR:** Admin map (P2-15 + N10 -> 707), Peak/Eid mode (part 1 N19 + part 3 N13 -> 679), Bulk/corporate (part 1 N17 + part 3 N14 -> 704), shell menu (D1 -> 659), Courier 360 in Finance/Reports tabs (-> 670), Checkout journey report (part 2 + part 1 N18 -> 668), staff limits (part 3 N11 + part 2 P2-13 settings + part 1 price-adjust limits -> 702 and 705), Offers 360 and online-payment reward (-> 677), courier "Setup" (-> 670).

## 3. Already built and the same (nothing to build)

Orders: cancel after Booked tells the courier; partial delivery "send right size"; rider overcharge to wallet; messages on confirm (SMS + WhatsApp invoice picture); export, bulk Confirm/Hold/Release, search by phone/name/tracking; incomplete-order capture rules; Calls to make; returns and exchange board (72 h, no cash refund, ERP check 7 days). Rules: the Delivery group. Products: list and editor, Combos, Reviews and questions, real-only pages. Finance: VAT, month-end close, ERP link ledger. Reports: real-only reports. Customers: all customers, loyalty and wallet, duplicates, import/export. Settings: ERP connection, Keys and connections, Backups, AI control, Security, Data and privacy, Help. Inbox: conversations, phone capture, send order link and create order from chat, Audiences, Landing pages, Refer a friend, Page layouts, Blog board, Speed, AI Center menu and agents. Shell: EN/bang, global search, notifications, theme, top bar. (Item-by-item evidence is in the part files.)

## 4. New register PRs (S28), in build waves

Sizes: S small, M one normal PR, L big. "Shared files": the one-owner-at-a-time files (A1.4). Waves follow BUILD-PROMPT section 4; inside a wave the numbers are the build order, and PRs with no unmet dependency can run in parallel (3 builders + `qa-gate`).

### Wave 1 — shell and orders (11 PRs: 659-669; 0 S · 9 M · 2 L)

| PR | Title | What it is | Size | Depends on | Shared files touched | From |
|---:|---|---|:-:|---|---|---|
| 659 | Admin shell alignment | Left menu as the prototype: groups Daily / Grow / Business / System, renames (Dashboard to Home, Delivery to Couriers, Support to Inbox, Money to Finance), Rules and Couriers as their own sections, Messages entry moves into Marketing, a click on the open section folds it, 3 new icons, the "?" panel slot and the Admin map slot, Orders badge reads Processing. Lumen stays the look; the burnt-orange accent is one existing swatch. Routes stay, nothing deleted. | M | — | sections.ts, lumen-nav.ts, admin-shell.*.json (SOLE OWNER first; merge before any other S28 PR touches them) | part3 S1-S3,S9,S12,D1; part2 Home name |
| 660 | Orders section re-map and Processing view | Orders tabs Batch, All orders, Processing, To ship, With courier, Returns & exchanges, Incomplete orders over the existing pages; old addresses redirect. Processing is a view over To confirm, awaiting advance, hold and open reviews (not an OrderStatus). Date presets and custom range on lists, "lowest courier score" sort, Cancelled summary with Excel/PDF. | M | 659 | sections.ts, lumen-nav.ts, admin-shell.*.json (tabs only, after 659); orders list query | part1 O-01,O-02,O-05,O-08,O-28 |
| 661 | Batch page (Current / Past) | Current: every order not yet handed over (older ones tagged "From last batch"), pipeline counts, Stuck chips (No stock, No answer, Suspicious, Merge needed), "Your work" and "Moved on by itself" with one-line reasons, no clock time. Past batches from hand-over sheets: parcels, COD total, taken vs missing. | M | 660 | orders pages only | part1 O-03,O-04,O-12,O-13 |
| 662 | Courier score out of 10 | Six metrics scored 0-10 by owner bands, weights, upper and lower limits, worked example, source and age per metric, "unknown" goes to the call list (never red), plain one-line reason (no AI call), score-accuracy report. All numbers are settings. | M | — | settings registry; reads phone-history and fraud-check | part1 O-10,O-11,R-17 |
| 663 | Auto-confirm rules engine | Confirm-by-rule for COD (trusted old customer, good score), prepaid full or delivery-charge-only prepaid, big COD to call list, suspicious gets a red tag, nothing auto-blocked; "why" shown; confirmedBy RULE/STAFF plus reason on the order event; presets Low / Normal / Strict. Default off; never touches money. | L | 662 | Prisma (nullable confirm metadata on OrderEvent); settings registry | part1 O-09,O-14,R-05 |
| 664 | Price adjust on orders | Per order: amount, percent, wallet, free delivery; reason required and logged; only before booking; per-role limit, above it the owner approves (Telegram works later); money change needs the owner PIN and the owner written OK (BLOCKED row). | L | — | Prisma (OrderPriceAdjustment); order totals service | part1 O-16; part3 X2 (limits UI in 702) |
| 665 | Merge orders | Merge button on the row, editable merge (remove line, change colour/size, add product, cancel one order), "Merge + call", look-back window default 5 days (setting), auto-merge switch off, no merge after Packed, different addresses ask. | M | — | Prisma (merge record); orders service | part1 O-15 |
| 666 | To ship screen | Chips Confirmed, Booked, Packed; Select all; one-click courier booking (default courier, optional other, one order one booking); sticker only after Booked, printed once, second print needs PIN and reason, print log; Packed means sticker printed (setting); Print all = summary line, picking list, stickers. | M | 660 | Prisma (PrintJob pin field); print run | part1 O-18,O-19,O-20,O-38 |
| 667 | With courier: live status, stuck alert, backup courier | Handed-over list with courier status and filter, tracking drawer with full history, day-end check (packed vs entered), cancelled-but-booked flag, stuck-parcel alert (hours setting, default 48), backup-courier move with PIN. | M | 660, 666 | orders pages; settings | part1 O-22,O-23,O-24,O-25 |
| 668 | Incomplete orders v5 and journey report | Newest first by day, date presets, known-customer chip (browser id or login; IP only "Possible match"), Customer 360 link, call log, Confirm as order, four message templates, "Ordered later" list, step-by-step journey report. Capture stays visible-field autofill after first interaction; no hidden-field harvesting. | M | 660 | Prisma (draft recovery fields, step events) | part1 O-31,O-32,O-33,O-34; part2 checkout journey |
| 669 | Replacement path | Defective or wrong item: free reship case on the returns board, old piece back, no refund and no wallet; its own rule (hours, old-piece days). | M | — | returns board; settings | part1 O-27,R-10 |

### Wave 2 — couriers (6 PRs: 670-675; 0 S · 4 M · 2 L)

| PR | Title | What it is | Size | Depends on | Shared files touched | From |
|---:|---|---|:-:|---|---|---|
| 670 | Couriers section and Courier 360 | New section Couriers: Overview, Courier 360, Claims & payouts, Setup. Courier 360 sections Overview, Parcels, Money, Payouts, Performance, Claims, Messages, Setup; the same component also as tabs in Finance and Reports. Zones and Delivery settings move under Setup (routes kept). | L | 659, 667 | sections.ts, lumen-nav.ts, admin-shell.*.json | part1 C-01..C-05,C-07,C-11,C-13..C-15 |
| 671 | Courier payouts via the courier own request | Request a payout through each courier own payment-request feature (no "Ask for payment"); status Requested, Processing, Paid or Rejected read back by a poll; Paid marks covered orders settled through the existing settlement path. Steadfast first, Pathao read-only, RedX none. Mock until keys. | L | 670, 672 | Prisma (CourierPayout); adapter contract (optional payouts capability) | part1 C-06 |
| 672 | RedX courier adapter | Create parcel, track by tracking id, areas, behind the courier contract; mock first, keys later. Contract gains optional payouts and balance. | M | — | packages/adapters/courier | part1 C-12 |
| 673 | Courier claims ledger v5 | New kinds (short COD, return short) and deadline, states mapped to open, sent, won, lost; one ledger shared by Orders, Couriers and Finance together with ERP claims; Finance line "Courier claims to receive"; recovered money posts to the courier account. | M | 670 | Prisma (enum values, deadline column); payments posting | part1 C-08,C-09 |
| 674 | Courier messages | Editable text per event (booking note, delivery instruction, COD line, re-attempt, hold, cancel, return pick-up, claim, payout) with placeholders in EN and BN, plus a one-off note on the booking dialog; adapters pass it as the courier note. | M | 659 | settings registry; booking flow | part1 R-07,C-10 |
| 675 | Courier statement match screen (Finance, Couriers) | Screen over the courier-statement import and match: lines that do not match, "Accept the courier figure" books a courier cost, monthly statement, claims-to-receive line. | M | 670 | sections.ts (Money tab, small) | part2 P2-11 |

### Wave 3 — rules and offers (4 PRs: 676-679; 0 S · 3 M · 1 L)

| PR | Title | What it is | Size | Depends on | Shared files touched | From |
|---:|---|---|:-:|---|---|---|
| 676 | Rules one-page layout and Order flow group | Rules as its own section: search, left group nav, each rule one plain sentence with a pill (On / Off / Sample / From date), right-side editor ("Customer sees", "What changes", More options), Order flow group (auto-confirm table, score settings, stock hold, holds, merge, price-adjust limits, advance hours). Old pages stay reachable. | M | 659, 662, 663, 664, 665 | sections.ts (rules tab); settings registry | part1 R-01..R-06,R-08,R-11,R-12,R-15,R-16 |
| 677 | Offers and Discounts 360 | Seven-step wizard (Type, Value, Where, Who, When, Limits, Preview); free delivery, percent, flat, points, wallet credit; coupons, sales, points and wallet in one place; cost and results per offer, calendar, awaiting approval, history; online-payment reward becomes an offer. Facade over the built engines first. Money changes keep the owner OK and PIN. | L | 676 | Prisma (Offer umbrella) | part1 R-09,R-13 |
| 678 | Pop-ups and notices hub | 12 system placements in 4 groups (where each shows, who sees it, on/off, text, small picture) plus the owner own notices; never a pop-up on arrival. | M | 676 | sections.ts (rules tab) | part1 R-14 |
| 679 | Peak and Eid mode | Daily capacity cap (stops promising when full), cut-off dates change promise texts, Print all in parts, roster; all settings. | M | 666 | settings registry; print run | part1 O-36,N19; part3 X4,N13 |

### Wave 4 — products, finance, reports (12 PRs: 680-691; 0 S · 8 M · 4 L)

| PR | Title | What it is | Size | Depends on | Shared files touched | From |
|---:|---|---|:-:|---|---|---|
| 680 | Photos and video step: easy adding and quality checks | Drag many, paste, pick from library, reorder, set main, colour tag, auto alt text on the existing attach API; plain sharp-based quality checks (too small, blurry, dark, wrong ratio, cut off) with setting thresholds and a one-click fix. No AI call. | M | — | media pipeline UI | part2 P2-2 |
| 681 | Product video (upload or link) | Upload or YouTube/Vimeo/Facebook link; clean embed (poster, play on tap, fixed ratio); VideoObject schema, video sitemap, lazy load. Upload transcoding stays mock. | M | — | Prisma (ProductMedia video fields); product page | part2 P2-3 |
| 682 | Product and category FAQs | Per product, per category (auto-attached), shop-wide; PDP accordion with FAQ schema; "Make this an FAQ" from an answered question. | M | — | Prisma (ProductFaq) | part2 P2-4 |
| 683 | ERP-supplied size chart (site side) | Inbound size chart per style from the ERP, "Use ERP chart" in the wizard; mock until the ERP ships it. | M | — | ERP contract adapter | part2 P2-5 |
| 684 | Demo products | Master switch and per-category switches with counts, auto-hide at N real products, "coming soon" pop-up on Add to bag, no index, excluded from feeds, ads, stock, reports, finance and ERP; seeded samples per category. | L | — | Prisma (Product.isDemo); feeds, metrics, ERP push | part2 P2-7 |
| 685 | Add-product wizard (8 steps) | Pick from ERP, Name and category, Colours and sizes, Photos and video, Price, Description and size chart, Google and SEO, Review and publish; autosave draft, live phone preview, single product or set at step 1, buying price owner-only, B-grade switch. | L | 680, 681, 683, 684 | product pages; Prisma (small draft state) | part2 P2-1 |
| 686 | Shop ranking | Rank score per product by owner weights, nightly update, sold-out sizes lower the score, "Recommended" sort and an admin tab. | M | — | Prisma (rankScore); search and category sort | part2 P2-6 |
| 687 | Cashbook and cash forecast | Accounts (Cash, Bank, bKash, Nagad), record money in and out, move between accounts, owner put in / took (PIN), append-only with reversals; 14-day forecast, tightest day. Money is only recorded, never sent. | L | — | Prisma (CashAccount, CashEntry); permission key | part2 P2-8 |
| 688 | Finance regroup, budgets and profit snapshot | Money becomes Finance with 7 tabs (VAT hidden); Match, Differences, Closes, Daily, Month-end under ERP account; Costs, Expenses, Fees merge into Costs and budgets with monthly budgets per head; profit snapshot (Today, Week, Month) and target on Finance and Home. | M | 675, 687 | sections.ts (money tabs); Prisma (CostBudget) | part2 P2-12 and Finance rows |
| 689 | Report library, shared toolbar and missing reports | Library (each report as a question with a headline number), period bar with compare, saved views, restock verdict, monthly review, Courier tab, Areas drill-down, Sales and Customers additions; Checkout journey comes from 668. | L | 659, 668, 670 | sections.ts (reports tabs); Prisma (ReportView) | part2 P2-9 |
| 690 | Report packs, letterhead exports and schedules | Packs (Monthly business, Bank, Stock, Sales) as one PDF or Excel on company letterhead; schedule by Telegram or e-mail over the existing schedule table. | M | 689 | existing ReportSchedule | part2 P2-10 |
| 691 | Home Command default and Do-now sources | Command design as the default Home (other designs stay as choices), KPI tiles from profit, COD and ad spend, Do-now zone with the missing action sources (stuck batch, exchange requests, ERP check days, courier mismatch, drafts, sizes almost out). | M | 661, 688 | dashboard loaders | part2 P2-16,Home rows |

### Wave 5 — the rest (16 PRs: 692-707; 3 S · 3 M · 10 L)

| PR | Title | What it is | Size | Depends on | Shared files touched | From |
|---:|---|---|:-:|---|---|---|
| 692 | Saved replies | Quick replies tab, short name with EN and BN text, "/" picker in the composer, archive not delete, 8 editable starter replies. | M | — | Prisma (SupportSavedReply) | part3 I6,N1 |
| 693 | Comment desk | Comments sub-view (All, Need a reply, Hidden, Auto-replied), hide comments with a phone number or abuse, price/size question triggers an automatic private message and public reply, keyword list, Instagram DM and comment sender behind the adapter (mock). | M | — | Prisma (message hide and auto-reply fields) | part3 I2,I9,I10,N2 |
| 694 | Live-selling capture | Live session with product codes; comments like "P1 L 2 pcs" become draft orders in Processing, "Make all"; staff always confirm by call. Mock until Page keys. | L | 693, 660 | Prisma (LiveSession, LiveCapture) | part3 I11,N3 |
| 695 | Influencers and affiliates | Personal code linked to a coupon, commission on delivered orders only, append-only payout ledger, Pay needs PIN and owner OK, each payout is a cost line in Finance. Commission and hold days are settings. | L | 688 | Prisma (Affiliate, AffiliateCode, AffiliatePayout) | part3 M11,N4 |
| 696 | Meta catalogue feed | Facebook and Instagram product feed beside the Google feed, issue list per product. | S | — | feeds | part3 M14,N5 |
| 697 | Message campaigns v5 | One campaign form over any saved segment and channel (WhatsApp, SMS, e-mail, Messenger mock), opted-in only, approved template, schedule, throttle, cost estimate, test send, results by order. Messages section pages stay, entered from Marketing. | L | 659 | Messages and Marketing pages | part3 M4,M5,N6 |
| 698 | Message cost ceilings | Monthly SMS and WhatsApp ceiling with 80 percent warning and cheapest-channel fallback; shown on the AI Center Costs page too. | S | 697 | settings registry | part3 A5,N15 |
| 699 | Marketing overview and Plan and ideas | Marketing Overview tab (spend, delivered sales per Tk 1, profit after ads, Scale / Keep / Fix / Stop chips from settings), Ad campaigns table with ad-level rows, Plan page with channel budget plan from delivered ROAS (advice only, no auto spend), calendar warnings. | L | 659, 697 | Prisma (ad-level day rows); sections.ts (marketing tabs) | part3 M1-M3,M7,M8,N7; D2-D5 |
| 700 | Website analytics: visitors | First-party page views (privacy-safe), daily roll-up, Overview (visitors, sessions, live now, sources, top pages, devices, districts); collect on/off and keep-days settings. | L | — | Prisma (page-view roll-ups) | part3 W6,N8 |
| 701 | Website analytics: behaviour | Click heatmap, scroll depth, funnels, checkout field drop-off (names only, never values), size-chart and colour opens; links the already-built no-result searches, WhatsApp taps and rage taps. | L | 700 | Prisma (behaviour events) | part3 W8,N9 |
| 702 | Staff controls | Discount limit per role (Tk and percent, empty means no limit), export permission rows, packer role without phone and address on pack and print screens, end-of-day cash and bKash handover per staff. | M | 664, 687 | Prisma (CashHandover); permission catalogue | part3 X1-X3,X8,N11; part1 R-16 |
| 703 | Telegram approvals | Inbound bot, approve or reject urgent items (price adjust, budget raise) with a button, audited, checked by the owner existing confirm step; mock until the bot key. | L | 664 | Telegram adapter | part3 X6,N12 |
| 704 | Bulk and corporate orders screen | Admin list plus quote, agreed price, advance and balance, company invoice, delivery in batches over the built bulk enquiry. | L | 660 | Prisma (BulkQuote, batches) | part1 O-35,N17; part3 X5,N14 |
| 705 | Settings regroup with People, Roles and Activity log | Business and System (owner only) groups with a left list and "lives elsewhere" pointers; People and Roles screens over the existing staff and role API; Activity log over the audit tables; store details (name, logo, contacts, social, warehouse); payments card; Updates and versions card. | L | 659, 702 | sections.ts, lumen-nav.ts, admin-shell.*.json (settings tabs) | part2 P2-13 and Settings rows |
| 706 | Start fresh (one time) | Preview of what is cleared, kept and chosen; full Drive backup first; type START FRESH and the PIN; clears test and sample entries on the site and, by an ERP call, the ERP-side test entries; never real data; one-time lock; audited. Built now, but its run action stays behind the owner written OK (BLOCKED.md) and never blocks other work. | L | 684 | Prisma (test marks on orders, customers, payments, stock moves); ERP contract (mock) | part2 P2-14 |
| 707 | Admin map | Page generated from the menu model plus one bilingual line per page, searchable, opens in a new window from the menu foot and the "?" panel. Built last so it lists every final menu item. | S | all menu PRs (659-706) | new page only | part2 P2-15; part3 S10,N10 |

## 5. Shared-file order (one owner at a time)

| File | Order of owners |
|---|---|
| `sections.ts`, `lumen-nav.ts`, `admin-shell.*.json` | 659 alone first -> 660 -> 670 -> 675 -> 676/678 -> 688/689 -> 699 -> 705 -> 707. Each is merged before the next starts on these files; tab-only edits rebase on main. |
| Prisma schema (additive migrations only) | One migration PR open at a time within a wave: wave 1: 663, 664, 665, 666, 668 (one after another); wave 2: 671, 673; wave 3: 677; wave 4: 681, 682, 684, 685, 686, 687, 688, 689; wave 5: 692-695, 700, 701, 702, 704, 706. Nothing dropped or renamed. |
| Settings registry (`registry-*.ts`) | New keys per PR; every new switch ships off. |
| Adapters (`packages/adapters`) | 672 and 671 (couriers), 693 (Meta), 703 (Telegram): each on its mock until the owner types the keys. |

## 6. Delta follow-ups on existing PRs (built, but change)

Each line is also written as a dated "Updated 13 Nov 2026 (CN-048)" line in the register. Small ones are built inside the new PR named in the third column (one build, one check); the ones marked "wave 5 (follow-up)" are separate small follow-ups, tracked in PROGRESS.md follow-ups 732-736. The old screens stay reachable ("Nothing is deleted").

| Existing PR(s) | Change | Built in | Size |
|---|---|---|:-:|
| 140, 141 | Orders list: date range and presets, chips named as steps, lowest-score sort, Bulk chip; order page: new layout, lifetime figures, send-message modal, previous orders expand, Processing chips | 660 (wave 1) | M |
| 145, 520, 522 | Merge command hook; look-back window default 5 days | 665 (wave 1) | S |
| 146, 188 | "Send right size" wording only | 660 | S |
| 156, 157, 559 | Courier score /10 view and "unknown" handling | 662 (wave 1) | S |
| 161, 541, 542 | Presets Low/Normal/Strict fill the auto-confirm table; Processing view uses the sections; advance reminder hours | 663 (wave 1) | S |
| 176, 177 | `payouts` capability, default courier, backup courier | 666, 667, 671 | S |
| 178 | Per-area routing "money saved" monthly line | 670 (wave 2) | S |
| 179, 180 | PIN on reprint, visible print log | 666 (wave 1) | S |
| 181, 182 | `packOnPrint` setting, summary line, colour level in the picking sort | 666 (wave 1) | S |
| 183 | Wait hours and "send the rest after" setting for No stock | 661 (wave 1) | S |
| 184 | `at_hub` / `on_hold` mapping, stuck-parcel alert, auto refresh | 667 (wave 1) | S |
| 185-191, 612, 613 | Returns sub-tab labels, date filters, reminder timers (request waiting, 4-day, 7-day, short count) | 660, 669 | S |
| 192 | Courier 360 tabs; claim kinds, deadline, recovered; Reports delivery additions (returns by size and product, partial deliveries, exchange reasons); courier tab | 670, 673, 689 | M |
| 197, 198 | Hours after order until confirmed (default 12) setting; release when not confirmed | 663 (wave 1) | S |
| 208-219 | Group nav, "Sample" pill, status strip, PIN on money rules | 676 (wave 3) | M |
| 213, 271, 272 | Prepaid reward becomes an Offer; Offers 360 facade | 677 (wave 3) | S |
| 193, 214 | Peak mode capacity cap | 679 (wave 3) | S |
| 216 | Hub list of the 12 placements | 678 (wave 3) | S |
| 274, 275, 276 | Newest-first by day, ordered-later list, Confirm as order, templates | 668 (wave 1) | M |
| 545, 563 | Retry schedule, attempt log per staff, click-to-call, auto-cancel switch (off) | 661 (wave 1) | M |
| 606 | Admin screen for bulk enquiries | 704 (wave 5) | S |
| 554 | Courier setup page links the zone sync | 670 | S |
| 284, 285, 286, 287 | Customer 360 new fields (MRP value, discount, profit, favourite categories, usual sizes, courier score, coupons, incomplete orders), opens in a new window with a side-panel option; tabs renamed "Customer groups" and "Duplicates to merge" | 660 (wave 1) | M |
| 21, 35, 634, 657 | All products: KPI strip, Draft/Scheduled filter folded from the queue, quick import popup, additive `publishAt` for Scheduled | 685 (wave 4) | M |
| 609, 654 | Style-code import popup for many codes; ERP style picker list for wizard step 1 | 685 (wave 4) | S |
| 27, 28, 58, 59 | Size chart cards with picture, "used by N", customer preview, unsaved guard | 685 (wave 4) | S |
| 89, 90, 571, 99 | Split "Combos" and "Sets" tabs (no logic change) | 685 (wave 4) | S |
| 203, 205, 635 | Stock: size heat grid, days of stock left | 685 (wave 4) | S |
| 66, 295 | "Make this an FAQ" link | 682 (wave 4) | S |
| 342, 642 | Money overview: in hand, owed to ERP, wallets, Decide-today cards, projection | 688 (wave 4) | M |
| 349, 504, 355 | P&L compare column and drill links; profit snapshot card | 688 (wave 4) | S |
| 618, 344, 345 | Costs, Expenses and Fees merged into one tab; budgets | 688 (wave 4) | M |
| 615, 616, 617, 346 | ERP tab: ageing buckets, exchanges-at-risk tile, printable monthly statement; Match, Differences, Closes, Daily, Month-end under it | 688 (wave 4) | S |
| 166, 525 | Courier statement and claims shown in Finance | 675 (wave 2) | S |
| 171, 172, F-041 | "Who can approve refunds" setting | 688 (wave 4) | S |
| 350 | VAT tab hidden until switched on | 688 (wave 4) | S |
| 568 | Areas: drill-down tree, 6 months, collected/profit/average columns, cross views, insight lines | 689 (wave 4) | M |
| 303, 534 | Reports Customers: cohorts, top customers, grade mix; grade bands as settings | 689 (wave 4) | S |
| 352 | Team report: exchanges, average reply time, chat to order | 689 (wave 4) | S |
| 155 (f91) | Reports Orders becomes "Sales": hour and weekday, discount and coupon cost | 689 (wave 4) | S |
| 283, 355 | Marketing report also listed in Reports; Marketing Overview with profit after ads and verdict settings | 699 (wave 5) | M |
| 631, 658, 655, 12 | Home: Command as default, new tiles, Do-now sources, target card | 691 (wave 4) | M |
| 383 | Store details: name, logo, contacts, social, warehouse address | 705 (wave 5) | S |
| 387-389 | "?" guide as a side panel (UI only) | 659 (wave 1) | S |
| 380, 382, 395, 396, 493 | System group (owner only) regroup, no logic change | 705 (wave 5) | S |
| 12, 625, 626 | Shell alignment (menu groups, renames, fold, icons) | 659 (wave 1) | M |
| 259-261, 265, 269, 531 | Ad campaigns table with verdict; campaign page with ad-level rows and fatigue | 699 (wave 5) | L |
| 282 | Calendar as a tab; overlap and low-stock warnings | 699 (wave 5) | S |
| 569, 270, 269 | Plan and ideas assembly | 699 (wave 5) | S |
| 300, 290, 291 | Marketing "Message campaigns" entry; automatic messages reachable from it | 697 (wave 5) | S |
| 257 | Tracking status beside each ad account | 699 (wave 5) | S |
| 589 | Feed tab names and issue list | 696 (wave 5) | S |
| 436 | Response times: waiting list, share inside N minutes, hour chart, header strip | wave 5 (follow-up) | S |
| 427, 428 | Customer side panel: grade badge, photo, Customer 360 in a new window | wave 5 (follow-up) | S |
| 443 | Comments sub-view counts and chips | 693 (wave 5) | S |
| 78 | Shop text grouped by page with search and preview; links to Templates | wave 5 (follow-up) | S |
| 75, 383, 384 | Policies: 5 new pages (Payment and COD, Cancellation and Refund, Wallet and coupons, Reviews, Cookies), at-a-glance boxes, section cards, history; placed under Website | wave 5 (follow-up) | M |
| 224, 240, 243, 249 | Blog editor: Combo and FAQ blocks, SEO checklist, readability, autosave | wave 5 (follow-up) | L |
| 233, 238 | Analytics Search: query table with change, Google/Bing switch | wave 5 (follow-up) | S |
| 234, 417 | Analytics Speed as a sub-view | wave 5 (follow-up) | S |
| 237, 238 | SEO score on top, key-search positions | wave 5 (follow-up) | S |
| 76-81, 596-600 | Website tab order, extras under More | 659 (wave 1) | S |
| 304, 305, 577 | AI tab names, AI-off message setting, extras under More (S15 frozen: names and one setting only) | wave 5 (follow-up) | S |
| 309, 343, 347 | AI Center "Costs and limits" page assembled from agent caps and the cost report | 698 (wave 5) | S |
| 627 | Chart and number polish check (tabular numbers, area fill, last-point marker) | 659 (wave 1) | S |

## 7. Additive schema (migrations never drop or rename)

`OrderEvent` confirm metadata; `OrderPriceAdjustment`; order merge record; `PrintJob` PIN field; `CourierPayout`; `CourierClaim` enum values SHORT_COD, RETURN_SHORT and `deadlineAt`; optional `ShipmentStatus` AT_HUB / ON_HOLD_COURIER (or raw text kept); `CheckoutDraft` recovery fields and `CheckoutStepEvent`; `BulkQuote` and batches; `Offer` umbrella; `Product.isDemo`, `Product.publishAt`, `Product.rankScore`; `ProductMedia` video fields; `ProductFaq`; inbound size chart; `CashAccount`, `CashEntry`, `CashHandover`; `CostBudget`; `ReportView`; test marks for Start fresh; `SupportSavedReply`; message hide/auto-reply fields; `LiveSession`, `LiveCapture`; `Affiliate`, `AffiliateCode`, `AffiliatePayout`; ad-level day rows; page-view and behaviour roll-ups; structured policy sections with history. Everything else is a setting (off, owner-editable).

## 8. Mock until keys (A1.3) and owner-OK items

Mock-only until the owner types keys or the ERP ships: courier payouts and RedX, ERP size chart, ERP-side Start fresh clear, Meta comment hide / private reply / Instagram DM send, live-comment capture, Telegram inbound approvals, Search Console / Bing, Meta catalogue feed, WhatsApp and SMS sending, ad-platform pause and budget writes, Messenger broadcast, video transcoding.

Owner written OK needed (BLOCKED.md, Bengali): Start fresh run action (PR 706); price adjust (PR 664, money and discount rule); cash entries by owner put/took (PR 687, recorded only); staff discount limits (PR 702); "who approves refunds" default (PR 688); affiliate payouts (PR 695). Each ships off and never blocks other work.

## 9. Reconciliation of the existing admin PRs

The 624 earlier PRs (and the admin PRs up to 658) are all kept. A screen the prototype drops (Digest, Risk rules, Campaign pages not in the 7 Marketing tabs, Real-only Reports, Admin look, shimmer, shell) moves under "More options" or a switch; old text is struck through; old routes redirect. Nothing is deleted.
