# Gap map, PART 2 — Products, Finance, Reports, Home, Admin map, Settings, Customers

Prototype v5 (`docs/demo/admin-proto-v5`, `A.NAV` in `js/core.js`, `m-products|m-finance|m-reports|m-home|m-settings|m-customers|map.js`, `DECISIONS.md`)
against the real repo at branch `gap-part2` (register highest PR = 658, S00–S25 built, S17 closed). Read-only analysis; no app code touched.
Rule used (BUILD-PROMPT Phase A): check blueprint + code first; built = nothing to build; differs = small delta on that PR; only what exists nowhere is NEW.

**Verdicts:** M = BUILT-MATCHES · D = BUILT-DIFFERS (small deltas) · N = NEW. **Size:** S ≤ 1 PR small, M one normal PR, L big/multi-part.
"Lumen" = the admin look already applied to these screens by PR 634–648 (so layout work is a re-arrange, not a rebuild).
New PR ids below are provisional `P2-n` (the register's next free number is taken when filed; Parts 1 and 3 file theirs too).

Facts that shape this part (verified in code):
- Real admin = `apps/web/src/app/admin/**` driven by `lib/admin-shell/sections.ts` (SHELL_SECTIONS: dashboard, orders, products, customers, delivery, messages, support, marketing, website, **money**, reports, ai, settings, help). Prototype's **Finance = real "Money"**; menu words and tab list differ (see rows).
- Schema already has: `ProductMedia.role=VIDEO`, `MediaKind.VIDEO`, `Combo` (types FIXED_SET / COLOUR_PAIR / TOP_BOTTOM / MIXED_SET / FIXED_COLOUR_PACK / BUILD_YOUR_OWN), `ComboAutoRule`, `SizeChart(+Assignment)`, `CourierSettlement(+Line)`, `CourierClaim`, `WalletAccount/Entry`, `RetailExpense` (receipt photo), `ExpenseHead`, `MonthClose`, `ErpFixedCostMonth`, `ReportSchedule` (no screen), `ReportDigest`, `CustomerGrade`, `CustomerMerge`.
- Schema has **no** demo-product flag, no cash/bank account ledger, no budgets, no sales target table (only `admin.today.goal` setting), no product video embed fields on the storefront side, no stored report packs/saved views.

---
## 1. Products (prototype tabs: all, add, stock, ranking, combos, sets, reviews, sizecharts)

| Item | Verdict | Evidence | Delta / what to build | Size | Depends on |
|---|---|---|---|---|---|
| All products list: search, status/category chips, counters, issue chips, bulk bar (publish, take off, archive, restore), CSV export | M | `/admin/products` PR 21, 26, 29, 34, 634 (Lumen), 657 (3 designs); `components/admin/products/ProductList*.tsx` | none | — | — |
| List KPI strip (live, drafts & scheduled, sizes almost out, need photos, average margin vs minimum), best-seller callout, "synced N ago" | D | counters exist (PR 21); no margin/low-size/need-photo tiles; margin floor = `price-floor.ts` (PR 609) | add 4 tiles + callout from existing facts (health score, stock low-at PR 202, price floor) | S | P2-F1 |
| Draft / Scheduled filter showing what each draft still needs; "Ready to publish" | D | publish queue is its own tab `/admin/products/queue` PR 35; checklist PR 26 | fold queue into All products as a filter (queue stays as an address); **Scheduled** status (publish at a date) does not exist (no `publishAt` in `publish.ts`/schema) | M | P2-F1 |
| Quick import popup (style codes → drafts) | D | link import `/admin/products/import` PR 33; ERP import by style code `/admin/products/erp-import` PR 609; sync compare PR 654 | popup on the list that calls the PR 609 import for many codes; CSV import PR 34 stays | S | P2-F1 |
| Product editor page | M | `/admin/products/[id]`, `ProductForm.tsx` PR 21, 31, 38, 634 | none (wizard re-uses it for editing) | — | — |
| Add product = 8-step wizard (Pick from ERP → Name & category → Colours & sizes → Photos & video → Price → Description & size chart → Google & SEO → Review & publish), autosave draft, progress, live phone preview on every step, "Single product / Set" at step 1 | N (UI shell) over built back end | today `/admin/products/new` = `NewProductForm` (name → draft → edit page); pieces exist: ERP import PR 609 (+B-grade listings), colours PR 30, sizes/SKU, size chart PR 27/28, was-price PR 38, price floor PR 609, Google fields PR 21, checks PR 26/35, health PR 29 | build the stepper, draft autosave (`Product.status=DRAFT` already there; wizard step state in a small JSON column or settings-free local draft), step "why" lines, ERP-style picker list "styles not on shop" (PR 654 compare gives the list), read-only ERP stock grid, B-grade outlet switch (PR 609), price step with PIN (buying price owner-only), "use in combos" tick, step 8 checklist; live phone preview = reuse storefront product page T1 in an iframe/`?preview=` | L | P2-1 |
| Wizard step 4 "Photos & video": drag many / paste / pick from library, reorder, set main, colour tag, 4 slots per colour, auto alt text | D | pipeline PR 22–25 (5 sizes × AVIF/WebP/JPEG, 4:5, q78), library PR 37, alt text PR 232 (`seo.altText`), photo API `/api/admin/media/products/<id>`, minimum 4 photos PR 25 | UI only: multi-drop/paste/reorder/colour-tag on the existing attach API; settings for sizes/quality already exist (PR 22) | M | P2-2 |
| Photo quality indicator (plain checks, no AI: too small, blurry, too dark, wrong ratio, cut off, one-click fix) | N | only a count/role minimum exists (PR 25); `packages/media/src/photos.ts` has no blur/brightness checks | sharp stats (laplacian variance, mean luma, ratio) as plain rules with settings thresholds; "Looks good" / reason chip | S | P2-2 |
| Product video: upload or YouTube/Vimeo/Facebook link, clean embed (poster + play, player loads on tap, fixed ratio), VideoObject schema + video sitemap + lazy load | N | Blueprint C4.4 lines 3868–3870 ask for it; schema has `ProductMedia.role=VIDEO`/`MediaKind.VIDEO` but nothing uses it; PR 278 YouTube module only does channel + order attribution; grep for `VideoObject` finds nothing | additive: video link/embed fields on `ProductMedia` (url, provider, duration, poster asset), storefront embed component in PDP gallery (PR 54/49), VideoObject in product JSON-LD, video sitemap entry; upload path reuses media library `VIDEO` kind (mock transcode, no new service) | M | P2-3 |
| Wizard step 6: size chart (ERP's → saved → create new XS–4XL), size-finder table height/weight per size, Fit, Sizes run, model optional | D | size charts PR 27/28, Find My Size PR 58/59 (`size-finder.ts`), `catalogue.fits`; **ERP-supplied size chart is not in the ERP contract** (`docs/ERP-API-CONTRACT.md`, `docs/erp/*` have no size chart) | add "Use ERP's chart" once the ERP sends it (ERP CLAUDE.md decision 2026-10-31: size chart per style sent to shops); site side = new inbound field, stays mock until ERP ships it | M | P2-5, ERP release |
| Product FAQs (per product, per category auto-attached, shop-wide; "Make this an FAQ" from a question) | D | shop-wide FAQ page in Settings › Policies PR 384; product Q&A PR 66 + `/admin/products/questions`; no per-product/per-category FAQ store | additive `ProductFaq` (productId/categoryId nullable) + PDP accordion + FAQ JSON-LD; button on question answer | M | P2-4 |
| Stock tab (ERP stock, low sizes, days left) | D | `/admin/stock` + counts + movements PR 203, 205, 202, 635 (Lumen); back-in-stock `/admin/products/back-in-stock` | add size-heat grid, "days of stock left" (sales velocity from `@extas/metrics`), ERP-sync line | S | — |
| Shop ranking (score per product, weights, nightly update, sold-out sizes lower the score, "Save this order") | N | no shop ranking in `packages/catalogue`/`search`; category sort exists (PR 47) but no owner-weighted score; Google ranking = Website › SEO | additive `Product.rankScore` + nightly job + weights in settings registry + admin tab; category/collection/search sort option "Recommended" | M | P2-6 |
| Combos tab: build by hand, auto-generate all combinations, pair types, 2/3 pieces, price/rule price, was-price | M | `/admin/combos` PR 89, 90, 571 (auto colour-pair rules), 99, 101, 104, 635 | none beyond tab split | — | — |
| Sets tab: Top + Bottom (ERP SKUs), colour link, one price, separate sizes per piece | D | `ComboType.TOP_BOTTOM/MIXED_SET`, set pricing PR 89/96/97, tiers PR 98/99, set photo PR 575 | present TOP_BOTTOM sets as their own tab (prototype splits Combos / Sets; real has one "Combos & sets" tab); verify "colour link" = `sameColour` | S | — |
| Reviews & questions (answer & publish; never delete negatives; FAQ) | M | `/admin/products/reviews` PR 295 + `/questions` PR 66; Lumen 635 | none (FAQ link = P2-4) | — | — |
| Size charts tab: cards by category with picture, "used by N products", duplicate, set default, in/cm, customer preview, Save top+bottom, unsaved warning | D | `/admin/size-charts` PR 27, 28 (copy, coverage warning, default per category + fit, cm toggle) | card layout + measuring picture + "used by N" + customer preview + unsaved-change guard; chart filled from tech pack = see wizard row | S | — |
| Demo (sample) products: master switch + per-category switches with counts, auto-hide at N real products, "Hide demo in <category>?" at last wizard step, "coming soon" pop-up on Add to bag, noindex/no feeds/no ads, excluded from stock/reports/finance/ERP | N | no `isDemo` anywhere in schema, settings or code | additive `Product.isDemo` (default false) + settings (master, per-category, auto-hide N) + storefront pop-up + exclusion in metrics/feeds/sitemap/ads/ERP push; seed generic samples per category (Bengali/English) | L | P2-7 |
| Categories (tree, garment type, slug, per-category settings) | D | tree + garment type PR 20 (`categories.ts`); category SEO `/admin/website/seo/categories`; **no category admin screen** (chips on the list only); prototype has no categories tab either | nothing required by the prototype; if owner wants editing, list under "More options" (existing PR 20 API) | S | owner word |
| Combo bag-box, back-in-stock, audit, import pages (real-only) | M | `/admin/combos/bag-box`, `/products/audit` PR 39, `/products/back-in-stock` | keep under "More options" (nothing deleted) | — | — |

---
## 2. Finance (real: **Money**). Prototype tabs: overview, cash, pnl, costs, erp, couriers, wallet, (vat hidden)

| Item | Verdict | Evidence | Delta / what to build | Size | Depends on |
|---|---|---|---|---|---|
| Menu name/tab set (7 tabs, VAT hidden) | D | real Money has ~14 flat tabs: Books(ERP), Overview, Profit, Refunds, Match, Differences, Closes, Daily, Costs, Expenses, Fees, VAT, Ledger, Month-end (`sections.ts` 377–420) | regroup to the 7 prototype tabs; Match/Differences/Closes/Daily/Month-end fold under **ERP account**; Expenses/Fees/Ledger under **Costs & budgets**; VAT hidden unless switched on (PR 350 switch exists); old addresses stay | M | P2-F2 |
| Overview: "Where the money is now", money in hand, with couriers, owed to ERP, customer wallets, "Decide today" cards, month-end projection | D | `/admin/money` PR 342, 642 (received 24h/7d/30d by method, COD owed by courier, refunds owed); books status card PR 616/617 | add in-hand total, owed-to-ERP (PR 615 ledger), wallet total (PR 171), "Decide today" action cards (one action each), month-end sales/profit projection | M | P2-8 (cash) for in-hand |
| Profit snapshot (Today / This week / This month) on Finance Overview and Home, clickable to P&L | N | no snapshot component; P&L page `/admin/money/profit` PR 349 has periods; metrics `@extas/metrics` is the one definition | small shared card reading the same P&L function for 3 periods | S | — |
| Profit & loss: periods (30 d, last 7, last month…), line by line, click to drill channel → category → style → product, close month | D | `/admin/money/profit` PR 349 (one-press periods + from/to, delivered-only Sales, order-cost lines, ad spend, fixed costs, net), `/profit/groups` PR 504, `/profit/channels` PR 355, returns in profit PR 353, courier estimate PR 354 | add compare-with-previous column and click-to-drill links between the 3 existing pages; COD-fee / packaging / gateway lines exist as order costs (verify naming); "Close & send to ERP" button = PR 616 closes (PIN) | S | — |
| Cash: cashbook by account (Cash, Bank, bKash, Nagad), record money in/out, move between accounts, owner put in/took, search, balances after each movement | N | no account/cashbook model (Money Overview only shows received payments, PR 342); Blueprint has no cashbook (the "Cashbook" word appears only in the admin-look file, PR 642 title) | additive `CashAccount`, `CashEntry` (append-only, reversal not delete; `companyId`-style `storeId`), permission `cash.record`, PIN on owner put/took; payments PR 166 settlements can post in | L | — |
| 14-day cash forecast, fixed costs covered, tightest day | N | nothing | pure calculation from cash balances + expected payouts (courier COD age) + fixed costs (PR 618); read-only | M | P2-8 |
| Targets (monthly delivered-sales target, change target) | D | monthly goal ring `admin.today.goal` PR 631 (setting, off) | one editable target on Finance + Home reading the same setting | S | — |
| Costs & budgets: fixed costs that record themselves, extra expenses with receipt photo, packaging, ad spend imported daily, dollar rate, monthly budgets per category | D | `/admin/money/costs` PR 618 (fixed costs per month, append-only versions, ERP push), `/expenses` PR 344 (heads, receipt photo `receiptMediaId`), `/fees` PR 345 (USD rate, gateway, packaging), ad spend PR 265 | missing: **monthly budgets per category** (no table/setting), "Fixed per month by day of month, self-recorded" display; merge 3 pages into one tab | M | P2-F2 |
| ERP account: balance owed, ageing 0–7/8–15/16–30/30+, bills/credits/payments, exchanges at risk, "Accept ERP figure", pay ERP, monthly statement, daily summary status | M/D | `/admin/money/books` PR 615 (ledger, "paid to ERP"), `/books/match` + `/differences` + `/closes` PR 616 (put right = reversing entry), `/books/daily` PR 617, `/month-end` PR 346, ERP returns PR 612/613 | ageing buckets + "Exchanges at risk (old piece back in 4 days)" tile + a printable monthly "ERP statement" page; rest is built | S | — |
| Couriers tab: COD held, payouts (courier's own payout request, status Requested→Processing→Paid/Rejected), monthly statement, match courier statement parcel by parcel, "Courier claims to receive" (one ledger) | D | COD owed by courier on `/admin/money` PR 342; settlement import + match = `importSettlement` in `packages/payments/src/cod.ts` PR 166 (API only, `lib/payments-api.ts`, **no screen**); claims `CourierClaim` + rider overcharge PR 192/431 (shown inside `/admin/delivery/couriers/[id]`); true-delivery check PR 525 | screen for statement import/match with "Accept the courier figure → booked as courier cost"; read-only claims-to-receive line from the one ledger; **payout request via courier API = Part 1 (Couriers section)** | M | Part 1 courier PRs |
| Wallet & refunds: refunds waiting, approve & pay, who approves, wallet balances, exchange credits waiting | M/D | `/admin/money/refunds` F-041/F-054 (approve/pay/four-eyes), wallet ledger PR 171 (manual credit, `walletManual`), refunds PR 172 | add "Who can approve refunds" selector (owner / owner+manager) as a setting; exchange-credit-waiting list depends on Part 1 exchange flow | S | Part 1 |
| VAT (hidden by default) | M | `/admin/money/vat` PR 350 (off as shipped) | hide tab until switched on | — | — |
| Bank / loan pack, downloads: Excel / PDF on letterhead / Print | N | no pack/export on Money except CSV (PR 349) and cost-ledger export | see Reports packs (P2-10) | — | P2-10 |
| Month-end close (lock month, send summary to ERP) | M | `/month-end` PR 346 + `/books/closes` PR 616 (PIN, `books.close`) | none | — | — |

---
## 3. Reports (prototype tabs: overview=library, sales, profit, products, customers, delivery, couriers, marketing, areas, team, review)

Real Reports section today = Site health, Fraud, Stopped, Learning, Delivery, Customers, Flags, Team, Areas, Orders, Searches, Experiments (`sections.ts` 424–488). Marketing report lives in Marketing (PR 283). P&L lives in Money.

| Item | Verdict | Evidence | Delta / what to build | Size | Depends on |
|---|---|---|---|---|---|
| Report library (every report as a question + headline number with ▲▼, pin) | N | no library page | one page listing every report with a headline figure from existing loaders; links to real addresses | M | P2-9 |
| Period bar: Today, 7 d, 30 d, this/last month, 6 months, custom, **compare with previous**, Excel / PDF / Print, saved views, schedule by Telegram/e-mail | D | one-press periods + from/to exist (`costs.report`, `lib/*-view`), CSV on several pages; `ReportSchedule` + `ReportDigest` models exist (B3.10; money report PR 351 Telegram digest) but **no schedule or saved-view screen** | shared toolbar component; Excel/PDF on company letterhead; schedule UI over `ReportSchedule`; saved views (additive `ReportView`) | L | P2-9, P2-10 |
| Sales tab (orders/value by day/week, channel, payment, hour, weekday, discounts and coupon cost) | D | Reports › Orders `/admin/reports/orders` PR 155 f91 (day, zone, payment, Ordered vs Sales), channels PR 355 | add hour/weekday, discount + coupon cost, channel | S | P2-9 |
| Profit tab (by channel, category, style, product, area, weekly margin) | D | Money › Profit PR 349/504/355 | expose under Reports with link-through; area profit from PR 568 | S | P2-9 |
| Products tab: style profit & restock tree with verdict Restock / Buy in bulk / Stop, days of stock | N | no restock verdict report; stock velocity in `@extas/metrics`/PR 202 | restock verdict from sales velocity + ERP stock (settings for thresholds) | M | P2-9 |
| Customers tab (new/returning, repeat, top customers, cohorts, at-risk, grades) | D | `/admin/reports/customers` PR 303 (new, returning, churned, repeat, per segment) | add cohorts by first-order month, top customers, grade mix (PR 534 `CustomerGrade`) | S | — |
| Delivery & returns tab (success by courier, days by zone, refused by area/reason, COD with couriers, return cost; returns by size/product, partial deliveries, exchange reasons) | D | `/admin/reports/delivery` PR 192 (per courier, zone, district, exceptions), returns PR 353/612 | add returns by size/product, partial deliveries, exchange reasons | S | Part 1 exchange data |
| Courier report (Reports › Couriers: which courier is better: success, days, returns, cost per parcel) | D | per-courier rows inside `/admin/reports/delivery` PR 192, `lib/courier-report-api.ts`; Courier 360 = Part 1 | dedicated tab + courier-vs-courier chart; score out of 10 from Part 1 | S | Part 1 |
| Marketing & ads tab | D | `/admin/marketing/report` PR 283 (spend vs delivered revenue, channel, campaign, ROAS) | keep source; add tab entry in Reports (Marketing keeps it too, "nothing dropped") | S | — |
| Areas (division → district → thana → area drill-down, map view, 6 months/custom, per area orders, pieces, value, delivered, returned, return rate, collected, profit, average; by area → top products, by product → top areas; insight lines) | D | `/admin/reports/areas` PR 568 (district, upazila/thana, Dhaka area, table + map, return rate) | add drill-down tree, 6 months, collected/profit/average columns, cross views, insight lines | M | — |
| Team (calls confirmed, packed, handed over, exchanges, messages, avg reply, chat → order) | D | `/admin/reports/team` PR 352 (confirmed, packed, handed over, replies, badges) | add exchanges, average reply/confirm time, chat→order | S | Part 3 Inbox |
| Monthly review (one page: sales, profit, orders/returns, went well/badly, 3 next steps with buttons) | N | none (PR 351 money report is a Telegram digest of P&L only) | page from the same figures with rule-based "went well / badly" lines (no AI calls) + action buttons | M | P2-9 |
| Report packs (Monthly business, Bank, Stock, Sales) + daily business report | N | none; Blueprint 2169 mentions a "daily business report" for the AI agent only | pack = bundle of existing reports as one PDF/Excel on letterhead, with preview, schedule | M | P2-10 |
| Checkout journey (incomplete orders): landing → cart → phone → address → delivery → payment, drop-off % per step, by page/product/campaign/device, how many came back | N | Orders › Incomplete list PR 274/275/276 (capture + follow-up) exists, no step funnel report; dashboard D has an order funnel only | step events table (additive) + report; **depends on Part 1's visible-field capture rules** | M | Part 1 incomplete-orders |
| Visitors & funnel moves to Website › Analytics (remove from Reports) | N/A here | Website analytics = Part 3 | none in this part | — | Part 3 |
| Real-only Reports (Health, Fraud, Stopped, Learning, Flags, Searches, Experiments) | M | PR 303–426 area, `reports/*` | keep, under "More options" in the new Reports menu | — | — |

---
## 4. Home (prototype: Design A "Command" default; B Calm and C Classic stay as choices)

| Item | Verdict | Evidence | Delta / what to build | Size | Depends on |
|---|---|---|---|---|---|
| Home page with switchable designs | D | `/admin` PR 12 + registry (`components/admin/look/registry.ts`): A Calm overview, **B Lumen Today = default (PR 631)**, C Classic cards (PR 655), D Command center (PR 658) | make the prototype's "Command" the default (re-use D's frame); prototype's A/B/C map to real D/B/C — rename only in the chooser, keep registry keys (nothing renamed) | S | — |
| Design A Command: 6 KPI tiles (Orders, Sales delivered, Net profit, Money with couriers, Return rate, Ad spend · sales per ৳1) with sparkline and ▲▼ | D | D.tsx comments: ad spend, ROAS, COD held and estimated profit "have no store yet"; since then built: profit PR 349, ad spend import PR 265, COD owed PR 342 | switch D's sixth tile and add profit/COD/ad tiles from those now-existing sources | M | — |
| "Do now" action zone grouped Urgent / Important (stuck batch orders, exchange requests, ERP check days running out, courier entry mismatch, rules on sample values, AI approvals, incomplete orders, customer messages, drafts ready, reviews to answer, sizes almost out, page-check failures) | D | "Needs you now" queue `lib/admin-shell/queues.ts` (packing, handover, ERP-held, support) in A/C/D | add the missing queue sources; most counts exist (ERP held PR 613, rider issues PR 431, returns PR 612); batch/mismatch items depend on Part 1 | M | Part 1 |
| Profit snapshot (Today/Week/Month) + monthly target card | N / D | see Finance rows; goal ring PR 631 | reuse the shared card | S | Finance snapshot |
| Sales trend 30 days vs previous 30, best day, hover | D | A/D trend (PR 12, 658) | match chart annotations | S | — |
| Best sellers with stock cover, delivery success by courier, ads "are they paying", products "what to do", searches with no result | D | top products + delivery success exist (A/D); no-result searches `/admin/reports/searches`; ads verdict Scale/Keep/Fix/Stop = Part 3 Marketing | add stock-cover, link-through cards | S | Part 3 |
| Tour/"How to try this prototype" panel | N/A | prototype-only | do not build | — | — |

---
## 5. Admin map (opens in a new window) and page guide

| Item | Verdict | Evidence | Delta / what to build | Size | Depends on |
|---|---|---|---|---|---|
| Admin map: every menu item and tab with its one-line job, searchable, own window | N | no map page (grep "admin map" empty); menu model `SHELL_SECTIONS` + `help-pages.json` hold titles | page generated from `SHELL_SECTIONS` + a short bilingual line per page (new keys in `messages/admin-*.json`), opened with `target=_blank` | M | all menu PRs (last) |
| "?" page guide panel: What · Why · How · buttons · mistakes | M/D | per-page guide button, `/admin/help/manual`, `help-pages.ts`, CN-014/026, PR 387–389 | panel instead of page navigation (UI only); content re-written wherever a screen changes (already a rule) | S | — |

---
## 6. Settings (prototype: Business group: Store details, ERP connection, Couriers, Payments, Customer messages, Team & roles, Demo products · System group, owner only: Keys & connections, Backups & restore, Site health, AI control, Updates & versions, Security, Activity log, Data & privacy, Telegram control, Help & manual)

Real Settings tabs: store, policies, keys (integrations), erp, security, privacy, system (cache, backups, go-live), shimmer, shell, look (`sections.ts` 509–546).

| Item | Verdict | Evidence | Delta / what to build | Size | Depends on |
|---|---|---|---|---|---|
| Two groups + searchable left list; Business vs System (owner only); "settings that live elsewhere" pointers (delivery charge → Rules, etc.) | D | tabs are flat; settings search exists in shell (`search.ts`) | regroup into Business / System with owner-only gate (permission `system.read`/`vault.read` already separate), left list + "lives elsewhere" hints | M | P2-F3 |
| Store details (name, logo, licence, UBID/DBID, TIN/BIN, address, contacts) | D | `/admin/settings/store` PR 383 (legal numbers + placeholder guard; "rest of SET-01 (name, logo, contacts, social links) joins with its PR") | add name/logo/contacts/social, warehouse address (also feeds PDFs, invoices) | S | — |
| ERP connection (test, sync, warehouse, bill) | M | `/admin/settings/erp-link` PR 614/615, sync health `/admin/stock` PR 205 | none | — | — |
| Couriers (default, pickup, fee) | D | `/admin/delivery/settings` + couriers PR 192/554 | moves to Part 1 Couriers › Setup; leave a pointer here | — | Part 1 |
| Payments (bKash, Nagad, card gateway, settlement, bank account) | D | gateways in Keys & connections (PR 493), payments settings `payments.*` (PR 166/171/174) | one Payments card that links keys + statement + settlement settings | S | — |
| Customer messages (SMS/WhatsApp templates) | M | `/admin/messages/templates`, channels, consent PR 291/292/298 | pointer only | — | — |
| Team & roles: people, role tree (tri-state), what each role opens, staff limits (discount limit per role, export permission), end-of-day cash/bKash handover | D / N | API only: `/api/admin/roles`, `/api/admin/staff` PR 15/16/495 with permission tree + audit; **no People/Roles admin pages** (ARCH SET-04a/b "join with their PRs"; S17 closed); staff limits and handover not anywhere | build People + Roles screens over the existing API (nested tri-state tree is already how permissions are coded); new settings for discount limit/export per role (backend settings, off); end-of-day handover record needs the cash model (P2-8) | L | P2-8 for handover |
| Demo products | N | see Products | master + per-category switches | (in P2-7) | P2-7 |
| Keys & connections | M | `/admin/integrations` PR 493 (vault, mock until key) | none | — | — |
| Backups & restore | M | `/admin/settings/system/backups` PR 395, 396, 385, 391 | none | — | — |
| Site health | M | Reports › Health `/admin/reports/health` S21 + `/admin/server` | link only (prototype lists it in Settings) | S | — |
| AI control | M | `/admin/ai` S15 (CN-047: stays as built) | none | — | — |
| Updates & versions (auto-update, roll back, changelog, staging) | D | Build progress `/admin/build` (PR 648), deploy/rollback in infra, "What's new" in manual PR 389 | a small owner screen over existing deploy info; no new infra | S | — |
| Security (2-step login, sessions, block) | M | `/admin/settings/security` PR 380, `/security/edge` PR 386 | none | — | — |
| Activity log (who changed or viewed what) | D | audit log written (PR 16, 139, 496 per ARCH SET-04c), customer access log model `CustomerAccessLog`; **no audit screen found** | screen with filters over existing append-only tables | M | — |
| Data & privacy | M | `/admin/settings/privacy` PR 382, 623 | none | — | — |
| **Start fresh (one time only)**: preview what is cleared/kept/you choose, full Drive backup first, type START FRESH + PIN, also clears the ERP-side test entries, never real data | N | nothing in code; old `/fresh-start` (Register line 953) is a browser-only helper; go-live checklist `/admin/settings/system/go-live` PR 393 | server job: marks/clears rows tagged test/sample (needs a reliable "is test data" mark: additive `isTest`/store flag on orders, customers, payments, stock moves), backup gate via PR 395, PIN, audit entry, one-time lock; ERP-side clear must be an ERP call (contract addition, mock until ERP ships); **irreversible → BLOCKED.md item for the owner's written OK** | L | ERP contract, P2-7 mark |
| Reset sample data (prototype-only) | N/A | prototype-only; real equivalent = Start fresh | do not build separately | — | — |
| Telegram control (daily report 22:00, pairing, urgent approvals with PIN) | D | alerts PR 392, money report PR 351 (Telegram), digests PR 340/341 | pairing screen + PIN approvals belong to Part 3 Inbox/Telegram | S | Part 3 |
| Help & manual | M | `/admin/help`, `/admin/help/manual` PR 387–390 | none | — | — |
| Admin look, shimmer, shell (real-only) | M | PR 630, 86, 12 | keep under "More options" | — | — |

---
## 7. Customers (prototype tabs: all, groups, loyalty, merge)

| Item | Verdict | Evidence | Delta / what to build | Size | Depends on |
|---|---|---|---|---|---|
| All customers (orders, delivered vs refused, spend, group badge, filters, search) | M | `/admin/customers` PR 285, 636 | none | — | — |
| Customer 360: lifetime figures (orders, pieces, MRP value, discount received, delivered value, collected, returns, exchanges, average order, profit owner-only), favourite categories and usual sizes, courier score, fraud reports, coupons/influencer code used, incomplete orders, conversations, wallet credit, block / unblock with PIN, **opens in a new window by default, button to use a right panel** | D | `/admin/customers/[id]` PR 286 (Overview, orders, refusals, Sales vs Ordered value), PR 297 notes, 534 grade pill, 171 wallet manual credit, 288 journey | add lifetime table fields not yet shown (MRP value, discount received, profit), favourite categories/usual size (derive from order lines), courier score + fraud flag chips (from Part 1 scores), coupon/influencer lines, block with PIN (check existing block flag in risk PRs), new-window rule + side-panel option | M | Part 1 scores |
| Priority grades by lifetime spend + delivered parcels with a discount | D | `CustomerGrade` model + PR 534 (grading, off) | add the two prototype bands as settings and the grade badge on the list | S | — |
| Customer groups (saved, auto-updating) | D | Segments `/admin/customers/segments` PR 287 (built-in + saved) | rename tab to "Customer groups"; keep address | S | — |
| Loyalty & wallet (points rule, balances, top earners, manual changes) | M | `/admin/customers/loyalty` PR 296, 171 | none | — | — |
| Duplicates to merge | M | `/admin/customers/review` PR 284 (side by side, merge rules, `CustomerMerge`) | rename tab; merge + call lives in Part 1 orders | S | — |
| Import / settings / export (real-only) | M | `/customers/import` PR 535, `/customers/settings`, export PR 299 | keep under "More options" | — | — |
| Customer 360 opened from orders / inbox / incomplete (shared component) | D | page is a route; other sections link to it | one link rule (new window) used by Parts 1 and 3 | S | — |

---
## Counts (rows above, each separate item counted once; "M/D" counted as D, "D / N" as D, N/A rows not counted)

- BUILT-MATCHES: **18**
- BUILT-DIFFERS: **48**
- NEW: **18**
- N/A (prototype-only): 3

## Proposed new register PRs (provisional ids; next free register number = 659 at time of writing)

| Id | Title | Scope | Size |
|---|---|---|---|
| P2-1 | Add-product wizard (8 steps) | stepper over the existing create/edit, autosave draft, ERP style picker, phone preview, review step | L |
| P2-2 | Photos & video step: easy adding + quality checks | multi-drop/paste/reorder/colour tag; plain sharp-based quality rules with settings | M |
| P2-3 | Product video (upload or link) + VideoObject | additive `ProductMedia` fields, PDP embed (poster + tap), JSON-LD, video sitemap | M |
| P2-4 | Product / category FAQs | additive `ProductFaq`, PDP accordion, FAQ schema, "Make this an FAQ" | M |
| P2-5 | ERP-supplied size chart (site side) | inbound size chart per style, "use ERP's chart"; mock until ERP ships it | M |
| P2-6 | Shop ranking | `rankScore` + nightly job + owner weights + "Recommended" sort + admin tab | M |
| P2-7 | Demo products | `Product.isDemo`, master + per-category switches, pop-up, exclusions from feeds/ads/stock/reports/finance/ERP, seed samples | L |
| P2-8 | Cashbook and cash forecast | `CashAccount`/`CashEntry`, record/move, owner put/took with PIN, 14-day forecast, end-of-day handover record | L |
| P2-9 | Report library + shared report toolbar + missing reports | library, compare, saved views, restock report, monthly review, Checkout journey, courier tab | L |
| P2-10 | Report packs, Excel/PDF letterhead, schedules | pack bundles (Monthly, Bank, Stock, Sales), schedule UI over `ReportSchedule` | M |
| P2-11 | Courier statement match screen (Finance › Couriers) | screen over `importSettlement`; accept figure books a courier cost; claims-to-receive line | M |
| P2-12 | Monthly budgets and Finance tab regroup | budgets per cost head (additive table), 7-tab Finance (Money) menu, profit snapshot card + target on Finance/Home | M |
| P2-13 | Settings regroup + People, Roles, Activity log screens | Business/System groups, People and Roles over `/api/admin/{staff,roles}`, audit screen, staff limits settings | L |
| P2-14 | Start fresh | preview/backup/PIN/type-word one-time clear of test data (site + ERP call), needs owner OK in BLOCKED.md | L |
| P2-15 | Admin map | generated map page, own window | M |
| P2-16 | Home "Command" default + Do-now sources | D design as default, new tiles (profit, COD, ads), extra action sources | M |

(If the register prefers fewer numbers: P2-2+P2-3, P2-9+P2-10 and P2-12+P2-16 can each be one PR.)

## Delta follow-ups on existing PRs (no new number)

| PR | What changes |
|---|---|
| 21, 35, 634, 657 | All products: KPI strip, Draft/Scheduled filter folded from queue, Quick import popup; `Scheduled` status (needs a tiny additive `publishAt`) |
| 609, 654 | style-code import popup for many codes; ERP-style picker list for wizard step 1 |
| 27, 28, 58, 59 | size chart cards with picture, "used by N", preview, unsaved guard; size-finder table inside wizard |
| 89, 90, 571, 99 | split "Combos" and "Sets" tabs (no logic change) |
| 203, 205, 635 | Stock: size heat grid, days of stock left |
| 66, 295 | link "Make this an FAQ" (with P2-4) |
| 342, 642 | Money Overview: in-hand, owed to ERP, wallets, Decide-today cards, projection |
| 349, 504, 355 | P&L: compare column, drill links; snapshot component |
| 618, 344, 345 | merge Costs/Expenses/Fees into one "Costs & budgets" tab (budgets = P2-12) |
| 615, 616, 617, 346 | ERP tab: ageing buckets, exchanges-at-risk tile, printable monthly statement; Match/Differences/Closes/Daily/Month-end under it |
| 166, 192, 525 | courier statement and claims shown in Finance (P2-11) |
| 171, 172, F-041 | "Who approves refunds" setting |
| 350 | VAT tab hidden until switched on |
| 568 | Areas: drill-down tree, 6 months, extra columns, cross views, insight lines |
| 303, 534 | Reports › Customers: cohorts, top customers, grade mix; grade bands as settings |
| 192 | Reports › Delivery & returns: returns by size/product, partial deliveries, exchange reasons; courier tab |
| 352 | Reports › Team: exchanges, average reply time, chat → order |
| 283 | Marketing report also listed in Reports (nothing moved away) |
| 155 f91 | Reports › Orders → "Sales" tab: hour/weekday, discount and coupon cost |
| 631, 658, 655, 12 | Home: Command as default, new tiles, Do-now sources, target card |
| 383 | Store details: name, logo, contacts, social, warehouse address |
| 286, 285, 284, 287 | Customer 360 fields, new-window rule, tab renames "Customer groups" and "Duplicates to merge" |
| 387–389 | "?" guide as a side panel (UI only) |
| 380, 382, 395, 396, 493 | System group (owner only) regroup, no logic change |

## Schema gaps (additive migrations only) and mock-only integrations

Additive: `Product.isDemo`; `Product.publishAt` (or status SCHEDULED); `ProductMedia` video fields (provider, url, poster, duration); `ProductFaq`; `Product.rankScore`; `ErpSizeChart` inbound (or reuse `SizeChart` with `source=ERP`); `CashAccount` + `CashEntry`; `CostBudget`; `ReportView` (saved views); `CheckoutStepEvent` (journey); test/sample mark on orders, customers, payments, stock moves for Start fresh; staff limits as settings (no table). Nothing renamed or dropped.
Mock-only until the owner types keys or the ERP ships: ERP-supplied size chart, ERP-side Start fresh clear, courier payout request/status (Part 1 adapters), Telegram approvals with PIN, YouTube/Vimeo/Facebook embeds need no key (links only), video upload transcoding stays mock/none.

## Owner-OK items to put in BLOCKED.md (hard rules)

Start fresh (deletes/clears data, irreversible); cash entries by owner put/took (money moves are only recorded, never sent); "Who approves refunds" default; staff discount-limit settings (discounts). Everything else here ships off / empty.

## Notes and uncertainties

- Row verdicts for screens with Lumen restyles (PR 634–648) assume the underlying features are as the PR text says; a few (colour link on sets, block-customer with PIN, "COD fee / packaging / gateway" line names on P&L) need a 5-minute check by the builder before filing the delta.
- Courier payout request, Courier 360, claims ledger, exchange flow, incomplete-orders capture belong to Part 1; rows here only record the dependency.
- Prototype Home designs: A Command ≈ real D, B Calm ≈ real A/B, C Classic ≈ real C; the real registry keeps its own keys.
