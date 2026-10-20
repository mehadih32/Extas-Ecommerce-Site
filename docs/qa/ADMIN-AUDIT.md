# Admin backend audit — EXTAS demo V12 (owner fix D, 20 Oct 2026)

## মালিকের জন্য সংক্ষেপে

- অ্যাডমিনের **সব পেজ খুলে দেখা হয়েছে** — ৩৯টা পেজ, ভেতরের ট্যাব আর পপআপ মিলিয়ে ১৯৬টা অবস্থা, তিন মাপে (১৩৬৬, ১৯২০ আর ৭৬৮ পিক্সেল)। কোনো পেজ ভাঙা নেই, কোনো জাভাস্ক্রিপ্ট ভুল নেই, পাশে স্ক্রল নেই।
- ১১০০-র বেশি বাটন একটা একটা করে চাপা হয়েছে — কোনোটায় ভুল আসেনি।
- **ঠিক করা হয়েছে ১৪টা সমস্যা।** সবচেয়ে বড়গুলো:
  1. অর্ডার আর কুরিয়ার পেজ আলাদা চলছিল — একটায় "ডেলিভারি" দিলে অন্যটায় বদলাত না। এখন দুটো একসাথে চলে।
  2. অর্ডার হলে স্টক কমত না। এখন অর্ডার হলেই পিস আটকে যায়, ক্যানসেল করলে ফেরত আসে।
  3. কুরিয়ার বুক করার আগেই অর্ডারে একটা বানানো ট্র্যাকিং নম্বর দেখাত — নিয়মের বাইরে। এখন নম্বর আসে শুধু কুরিয়ার থেকে।
  4. অর্ডার খোঁজা, ক্যানসেল করা (কারণসহ) আর ভেতরের নোট লেখা যেত না — এখন যায়।
  5. ইংরেজি মোডে ৭ জায়গায় বাংলা দেখা যাচ্ছিল — ঠিক করা হয়েছে।
- **নতুন:** "Fulfilment" পেজ — কুরিয়ার বুকিং, স্টিকার (ক্যাটাগরি → স্টাইল ক্রমে, পুরো আইটেম তালিকাসহ), পিকিং লিস্ট (টিক বক্সসহ) এক জায়গায়। "Stock & ERP" পেজ — কোন অর্ডার কত পিস আটকে রেখেছে আর ERP-তে কী গেছে।
- **ইনভয়েসের ৭টা ডিজাইন** বানানো হয়েছে। সেটিংসে "Invoice template" থেকে ১–৭ বাছবেন; যেটা বাছবেন সেটাই প্রিন্ট, ডাউনলোড আর হোয়াটসঅ্যাপে যাবে। হোয়াটসঅ্যাপের জন্য **লোগোসহ পুরো পাতার JPG ছবি** তৈরি হয় (PDF চাইলে সেটিংসে বদলাবেন)।
- **এখনো নেই** (কোড পর্বে বানাতে হবে): হিসাব-নিকাশ ও লাভ-ক্ষতির রিপোর্ট, খরচ ও বেতন লেখার জায়গা, কুপন, সাপোর্ট ইনবক্স, স্টাফের রোল ও অনুমতি, অডিট লগ, ডুপ্লিকেট অর্ডারের রিভিউ তালিকা, এক্সচেঞ্জ অনুমোদনের স্ক্রিন। পুরো তালিকা PR নম্বরসহ নিচে।
- ছবিগুলো: `owner-fix/D/sheets/` ফোল্ডারে — ইনভয়েসের ৭ ডিজাইন, স্টিকার আর পিকিং লিস্ট, মূল অ্যাডমিন পেজ, আর আগে/পরে।

---

## 1. How it was checked

| Check | Result |
|---|---|
| Routes and states crawled (every nav item, every tab and sub-link found on the pages) | 39 routes · 186 states before, 196 after (2 new routes) |
| Widths | 1366 · 1920 · 768 — 558 page states before, 588 after |
| JS errors (page + console) | 0 |
| Horizontal page overflow | 0 |
| "Page not found" inside admin | 0 (the side-canvas hit was a page-name button, not an error) |
| Buttons with no handler (`data-act` / `data-change` / `data-input` / `data-submit`) | 0 |
| Every visible `data-act` button clicked, route by route, tabs included (`clicks.js` + `one.js`) | about 1,140 clicks on 83 route/tab states · 0 errors |
| English mode, visible Bengali | 7 leaks before → 0 after |
| Feature test of the new work (`owner-fix/D/tools/fixD-test.js`) | 19 / 19 pass |
| Clipped text after fixes | 1 report — Telegram "Send" button, 3 px sub-pixel; looked at, nothing is cut (left) |
| Phone device gate (storefront unchanged) | see the end of this file |

Tools (scratchpad, `owner-fix/D/tools/`): `crawl.js` (routes × widths, errors, overflow, Bengali leaks, clipped text,
dead handlers), `clicks.js` (clicks every action on every admin route), `fixD-test.js` (the new flows), `sheet.js`
(Bengali-labelled sheets).

## 2. Every admin route

Status: **OK** = opens, works, matches the admin look · **Fixed** = had a problem, fixed in this round · **New** = added
in this round · **Gap** = part of what the blueprint promises is still missing on this screen.

| # | Route | Page | Opens / works / design | Status |
|---|---|---|---|---|
| 1 | `#/admin` · `#/admin/orders` | Orders | yes / yes / older header style (no eyebrow, no PR tag) | **Fixed** (search, cancel, note, documents, fake tracking, courier sync) · **Gap** bulk actions, admin edit, hold, export, timeline/audit log |
| 2 | `#/admin/rules` | Smart Rules | yes / yes / yes | OK |
| 3 | `#/admin/size-charts` | Size charts | yes / yes / yes | OK |
| 4 | `#/admin/ai` (+5 tabs) | AI & agents (AI 360) | yes / yes / yes | OK |
| 5 | `#/admin/agents` (+ chief, telegram) | Agents | yes / yes / yes | OK |
| 6 | `#/admin/agents/<id>` (7 agents × 6 tabs) | Agent profile | yes / yes / yes | OK |
| 7 | `#/admin/landing` | Landing pages | yes / yes / yes | OK |
| 8 | `#/admin/landing/new` | Create landing page | yes / yes / yes | OK |
| 9 | `#/admin/combos` (+4 tabs) | Combos & sets | yes / yes / yes | OK |
| 10 | `#/admin/reviews` | Reviews | yes / yes / yes | OK |
| 11 | `#/admin/analytics` | Analytics (site events) | yes / yes / yes | OK · **note**: "Fill demo data" adds sample purchases that are not real orders, so its sales figure never matches Orders (labelled demo) |
| 12 | `#/admin/settings` | Settings | yes / yes / yes | **Fixed** (3 new rows: Invoice template, WhatsApp invoice format, Courier sticker size) |
| 13 | `#/admin/backup` | Backup | yes / yes / yes | OK |
| 14 | `#/admin/audit` | Site audit | yes / yes / yes | OK |
| 15 | `#/admin/health` | Server health | yes / yes / yes | OK |
| 16 | `#/admin/server` | Server | yes / yes / yes | OK |
| 17 | `#/admin/cache` | Cache | yes / yes / yes | OK |
| 18 | `#/admin/images` | Images | yes / yes / yes | OK |
| 19 | `#/admin/speed` | Speed | yes / yes / yes | OK |
| 20 | `#/admin/integrations` | Keys & connections | yes / yes / yes | OK |
| 21 | `#/admin/products` | Products | yes / yes / yes | OK · **Gap** "Ready to publish" queue (PR 35, 204) |
| 22 | `#/admin/products/<id>` · `/new` | Product edit | yes / yes / yes | OK |
| 23 | `#/admin/customers` | Customers & CRM | yes / yes / yes | OK |
| 24 | `#/admin/customers/<phone>` | Customer | yes / yes / yes | OK |
| 25 | `#/admin/couriers` (+5 tabs) | Couriers | yes / yes / yes | **Fixed** (parcel and order now move together; sticker = the full B1.4 sticker) · **Gap** Money check uses only the simulated 30-day history, not the demo's own orders (PR 166, 174) |
| 26 | `#/admin/ads` (+7 tabs) | Ads & tracking | yes / yes / yes | OK |
| 27 | `#/admin/blog` (+8 tabs, authors, ads) | Blog & SEO | yes / yes / yes | **Fixed** (5 author pages + 1 popup note showed Bengali in English mode) |
| 28 | `#/admin/blog/<id>` · `/new` | Post editor | yes / yes / yes | OK |
| 29 | `#/admin/naming` (+5 tabs) | Naming & links | yes / yes / yes | OK |
| 30 | `#/admin/register` (+3 tabs) | PR register | yes / yes / yes | OK |
| 31 | `#/admin/register/pr/<n>` | PR card | yes / yes / yes | **Fixed** ("সাথে: জ্ঞানী" in English mode → "With: Gyani") |
| 32 | `#/admin/register/doc/<id>` | Blueprint & files reader | yes / yes / yes | OK (documents shown as written, by design) |
| 33 | `#/admin/layout` | Page layout | yes / yes / yes | OK |
| 34 | `#/admin/side-canvas` | Side canvas | yes / yes / yes | OK |
| 35 | `#/admin/site` (+ tabs) | Site builder | yes / yes / yes | OK |
| 36 | `#/admin/manual` (+ 33 sections, search) | Site manual | yes / yes / yes | OK |
| 37 | `#/admin/fulfilment` (+ stickers, picking, invoices) | **Fulfilment** | yes / yes / yes | **New** (PR 179–182, 404–412) |
| 38 | `#/admin/stock` (+ ERP tab) | **Stock & ERP** | yes / yes / yes | **New** (PR 195, 197, 199, 200, 205) |
| 39 | unknown `#/admin/xyz` | stays in the admin shell | yes | OK (B7.2 rule 7) |

Popups checked: order screen, cancel confirm (new), WhatsApp invoice (new), invoice (shop + admin), courier entry,
courier sticker, every Settings control, combo editors, Smart Rules preview, blog editors, layout/site builder
dialogs, AI switches.

## 3. Completeness against a standard e-commerce backend and the blueprint

| Area | In the demo admin | Missing (PR) |
|---|---|---|
| Dashboard & KPIs | Orders KPIs (today, to confirm, flagged, exchanges); Ads, Couriers, AI each have KPIs | One owner home with sales, profit, stock alerts and the daily report (S16 PR 342–355, 504; daily report B7.6); risk-sectioned dashboard (PR 541) |
| Orders | list, chips, **search (new)**, detail, status flow, flags with scripts, **cancel with reason (new)**, **note (new)**, **invoice / WhatsApp / sticker (new)** | bulk select + bulk status (PR 140, 152), admin order edit with source (PR 142), hold & release (PR 153, 183), order timeline / audit log (PR 139), notification log with retry (PR 149), export (PR 151), order analytics by day/zone/payment (PR 155) |
| Fraud & duplicates | flags (address, phone, 2 sizes) on orders; refused-before segment in CRM | duplicate review queue and merge (PR 145, 519–524, 546, 556–557), risk panel and score (PR 156, 160, 161), blocklist (PR 162), fraud report (PR 164) |
| Customers / CRM | list, segments, customer page | journey builder (PR 289), campaign blast (PR 277) |
| Products & catalogue | list, edit/new, media shots, size charts, naming & links | publish queue (PR 35, 204), product audit report (PR 39) |
| Combos & sets | fixed combos, auto colour-pair, archive | — |
| Stock & ERP sync | **Stock & ERP page (new)**: ERP stock, held, delivered, available, push log | manual re-sync (PR 206), stock movement report (PR 207), low-stock alerts to Telegram (PR 202) |
| Courier booking & tracking | booking, auto-pick, tracking steps, returns, accounts, **fulfilment page (new)** | handover sheet (PR 180 part) |
| Returns & exchange | refused / returned / restock in Couriers; exchange request shows as a flag | exchange approval + QC + money box screen (PR 185–188, 190) |
| Payments & COD | COD per order; Couriers "Money check" (simulated history) | payment reconciliation on the demo's real orders (PR 165, 166, 174); wallet ledger admin (PR 171–172) |
| Finance & reports | — | **everything in S16**: sales / profit / profit by style and category, ad spend vs delivered sales, courier cost, cost ledger, retail expenses (incl. salaries), month-end close (PR 342–355, 504, 536–537, 568) |
| Marketing, coupons, offers | Ads, landing pages, house ads/popups (blog) | coupon engine (PR 271–272), incomplete orders & abandoned carts (PR 274–276), referral admin (PR 273) |
| SEO & blog | blog, authors, schedule, results, naming & redirects | — |
| Support inbox | — | **S22 all**: inbox, tickets, context panel, AI support (PR 425–436, 538) |
| AI 360 | AI & agents, agents, costbook, caps, Telegram | — |
| Settings / keys / roles / audit | Settings, Keys & connections | roles & permissions (PR 16, 495), admin audit log (PR 139 orders; rule history PR 218) |
| Site builder | layout, side canvas, site builder, manual | on-page edit (PR 600, paused) |
| Server, backup, health | server, cache, images, speed, backup, health, audit | — |
| PR register & docs | register, PR cards, files reader | — |

Nothing beyond the blueprint was invented. The two new pages are the blueprint's own Fulfilment page (B1.3–B1.7)
and the stock / ERP-push view (A3.4, PR 205).

## 4. ERP / stock / accounts — do the pages agree?

| Check | Before | After |
|---|---|---|
| An order placed on the shop shows in Orders | yes | yes |
| …and holds its pieces (shop shows less stock) | **no** — stock never moved | yes: available = ERP stock − open orders − delivered; cancel gives it back; returned + QC ok goes back |
| Order "With courier" / "Delivered" moves the parcel in Couriers | **no** | yes (books the cheapest courier if none) |
| Courier "Picked up" / "Delivered" moves the order | **no** | yes |
| Refused → back → "QC ok, restock" | parcel only | order becomes **Returned**, pieces back in stock |
| Tracking number before booking | a random number invented at order time (breaks B1.1) | blank until the courier gives one; then the real consignment everywhere (order, invoice, account) |
| ERP push status per order | not shown | order screen + Stock & ERP: SalesOrder · Shipment · Payment · SalesReturn, each with one idempotency key |
| Analytics "Sales" vs Orders | different sources | still different: Analytics counts tracked events (and its "Fill demo data" button adds fake purchases) — labelled, left as is |
| Couriers "Money check" vs Orders | simulated 30-day history | still simulated — gap PR 166/174 |
| Reports / P&L | none | none — gap S16 |

## 5. Invoice and documents

| Document | Before | After |
|---|---|---|
| Customer invoice | one design (Classic), shop side only; no button in admin | **7 designs** (1 Classic · 2 Minimal · 3 Bold brand header · 4 Receipt · 5 Two-column · 6 Dark accent · 7 Modern cards). Setting **Invoice template** (Settings → Invoice wording) with preview gallery in Fulfilment → Invoice designs. Each shows logo (the site logo image if uploaded, else the wordmark), invoice + order number, date, customer name/phone/address, items with colour/size/qty/price, combo/set group with its saving, sale "was" price, delivery, discount, total, paid, **cash to collect**, payment status stamp, exchange line from Smart Rules (`{exchangeHours}` hours, size or fault only), WhatsApp + hotline. All words are INVOICE_TPL labels (editable), all figures from the order/settings. Design 1 stays the default, so the shop looks exactly as before until the owner picks another. |
| WhatsApp invoice | none (setting text only) | **full-page JPG with logo**, drawn in the browser from the chosen design (2× resolution), preview, download, "Send (demo)"; setting **WhatsApp invoice format** JPG (default) / PDF |
| Courier sticker | small modal: name, phone, address, COD, items in grey small text | B1.4 sticker: courier + consignment + barcode (from the courier, labelled sample), customer, address, order, **bordered box with every item** (style · colour · size · qty), **COD in a heavy box**, note; owner-set size (100×150, 100×100, 75×100, A6); black-and-white safe; reprint never books again |
| Sticker print order | n/a | category with most pieces first → style with most pieces first; a multi-category order prints once in the group of its top item |
| Picking list | missing | EXTAS letterhead, summary line (orders, pieces, line items, categories in order, shortages, held/problem listed apart and not counted), category → style → colour → sizes with counts, shortage marks, a tick box on every row, repeating header when printed |
| Packing slip | — | not built (dropped by the owner, B1.5) |

Sheets: `owner-fix/D/sheets/01-invoice-designs.png` (all 7, numbered, Bengali labels; sample order with a Polo Duo
combo + 3 more pieces), `02-whatsapp-jpg.png`, `03-sticker-picking.png`.

## 6. Bugs and quality — fixes made

| # | Problem | Fix | File |
|---|---|---|---|
| 1 | Orders and Couriers out of step (order Delivered left the parcel "Booked"; courier Delivered left the order "Packed") | both directions synced | 96e-admin-docs.js |
| 2 | Orders never held stock | placeOrder marks the order; stockOf subtracts open + delivered pieces of shop-placed orders | 96e |
| 3 | Random tracking number invented at order time (B1.1: always from the courier) | blank until booked, then the courier's consignment | 96e |
| 4 | No order search (PR 154) | search by order no., name, phone, tracking | 96e |
| 5 | No cancel (PR 144) | Cancel order… with reason list and a confirm (B7.2 rule 1/10); pieces return; cancelled orders cannot advance | 96e |
| 6 | No internal note (PR 147) | note box on the order screen, saved | 96e |
| 7 | No invoice / sticker from the admin order | Invoice, WhatsApp invoice, Sticker buttons | 96e |
| 8 | Courier sticker missing the B1.4 content | new sticker, also used by the Couriers page | 96e |
| 9 | No picking list, no fulfilment page (B1.3, B1.6) | Fulfilment page | 96e |
| 10 | English mode: "দূত-এর দলে · …" on 5 blog author pages | dictionary pattern | 98b-admin-dict.js |
| 11 | English mode: blog popup-ad note in Bengali | dictionary entry | 98b |
| 12 | English mode: "সাথে: জ্ঞানী" on PR cards | dictionary pattern | 98b |
| 13 | Order screen showed "Steadfast SF-…" even when nothing was booked | "Courier not booked yet" | 96e |
| 14 | Returned parcel never changed the order | order → Returned | 96e |
| 15 | (own) hidden label of the new search box showed at 768 px (`sr-only` is scoped to the register page) | uses the global `sr` class | 96e |

Found and **not** changed (design / scope, listed for the owner):
- Orders page header is the older style (big title, no eyebrow / PR tag) while most admin pages use the newer
  `zs-head` style — left as is because B7.1 says the orders triage screen must not be touched.
- The 768 px tablet tab strip scrolls sideways (all chips reachable); it has no fade or arrow (B7.2 rule 3) — shared
  admin shell, belongs with the shell owner.
- The Polo Duo auto-combo also applies to two pieces of the **same** colour (navy M × 2) although its blurb says "any
  2 colours" — storefront pricing rule, reported to the bag/checkout agent, not changed here.

## 7. Sync, timers and popups

| Item | Result |
|---|---|
| Admin auto-refresh widgets | none run on a timer in the admin (server / health numbers are drawn on render) |
| Order search | debounced 250 ms, re-renders only while the Orders route is open, focus and caret restored |
| Order note | saves 300 ms after typing stops; no re-render while typing |
| WhatsApp JPG | drawn once per open; ignored if the popup changed or closed meanwhile |
| Popups | open with `openModal`, close with Esc / ✕; the shared modal returns focus to the opener (02-core) |
| Print frames | removed 1.5 s after the print call |

## 8. What the simulation team needs — works now or missing

**Updated 20 Oct (owner fix E, `dist/fixE.html`).** Every item the simulation needs now works on the demo's own
orders, parcels and settings. Proof: `owner-fix/E/tools/fixE-test.js` — 4 orders placed through the real shop
checkout and pushed through review → confirm → courier → delivered → money check → exchange → return → support →
P&L; **49 / 49 checks pass**, and the P&L matches an independent hand sum line by line.

| Screen / flow | Works now? | Where / note |
|---|---|---|
| Place orders on the shop (all categories, combos, sets, sale items, COD / bKash / Nagad / card mock) | **Works** | storefront; orders land in `#/admin/orders` |
| Order status flow To confirm → Packed → With courier → Delivered | **Works** | order screen, Couriers "Next step", or **Bulk actions** (new) |
| Courier booking, consignment, tracking | **Works** | Couriers → Parcels, Fulfilment, or **Bulk actions → Book courier** (new) |
| Cancel an order (reason, stock back) | **Works** | order screen → Cancel order… |
| Duplicate-looking order → fraud flag | **Works (new)** | `#/admin/review` — same address + new phone, re-order while one is on the way (severity by item overlap), several same-day orders, odd phone, refused before, test/fake look. Approve / decline / call (with reason, logged), **merge same-day orders into one parcel** (one delivery charge). Never blocks; flagged orders are held out of bulk actions and the picking list until decided. Each check switchable, look-back days a setting (PR 145, 519–524, 544, 546, 556–557) |
| Refused at door → back → restock (return path) | **Works** | Couriers → Returns, or **Exchanges → Receive & QC** (new) with good / B-grade / damaged; B-grade and damaged leave sellable stock and the loss reaches the P&L |
| Size exchange (customer request) | **Works (new)** | `#/admin/exchanges` — request from My account shows with the money box and the charge rule (exchange charge by zone, ৳0 if our mistake); approve books the swap and holds the new item; "old item received → QC" puts it back in stock, posts the wallet credit only if the check passes (PR 185–188, 190) |
| Return request (customer) | **Works (new)** | order page → "Request a return" → Exchanges → Return requests: decline with the Smart Rules policy text (sent into the customer's chat) or turn into an exchange (size / fault, inside the window) — B1.9 |
| Support inbox (customer messages, tickets) | **Works (new, mock channels)** | `#/admin/support` — Messenger, WhatsApp, website chat, email, SMS replies in one list; status, assignee (staff list), first-reply SLA timer, internal notes, customer scan beside the chat (orders, delivered / came back, open order, checks); EXTAS AI draft (rule-based, works with AI off, says it doesn't know rather than invent) that a person must send. Customer side: order page "Message us here" + the replies (PR 425–436, 538). Real channel connectors, media to Drive and the support PWA stay for the code phase |
| Stock reduced by orders, ERP push status | **Works** | `#/admin/stock`; exchange and QC movements now sit on top of the ERP mirror |
| Payment / COD reconciliation on the demo's own orders | **Works (new)** | Couriers → Money check starts with "This demo's own parcels": COD collected vs due after charge + COD fee, per courier and per parcel; load the courier statement (mock) or type what was really paid; mismatches, unpaid after N days and "COD changed after booking" are flagged; claim (PR 165, 166, 174). The simulated 30-day history stays below, labelled |
| Product cost (ERP cost), courier cost, gateway fee per order | **Works (new)** | Finance → Costs & fees: variant cost (sample ERP mirror, big-size extra), bKash / Nagad / card fee %, packaging per parcel, SMS / WhatsApp / email price, B-grade recovery % — all settings, min/max checked |
| Ad spend | **Works (new)** | Finance → Ad spend: entered per day; today falls back to the Ads page figure (labelled sample); past days count only what is entered |
| Employee salaries and other expenses entry | **Works (new)** | `#/admin/expenses` — expenses by head (add / edit / void, never deleted), staff with monthly salary prorated per day, heads, and the ERP push (one document per head per month, mock, idempotency key). Marked "mirror for the dashboard — the ERP is the master" (B3.7, B3.8) |
| P&L reports (revenue, COGS, gross / net profit, by style and category, combo performance) | **Works (new)** | `#/admin/finance` — revenue, COGS, exchanges, write-offs, courier, COD fee, return charges, gateway, packaging, messages, ads, expenses, salaries → gross and net; by day, style, category, combo / set; delivered-only vs all booked; today / yesterday / 7 days / month / all; CSV export (PR 342–355, 504, 536, 537) |
| Coupons | **Works (new, basic)** | `#/admin/coupons` — percent / taka off, minimum, dates, total and per-customer limits, on/off; the bag's "Have a code?" reads them; uses counted per order (PR 271–272). Free delivery / BOGO / set-unlock codes stay for the full engine |
| Roles, permissions and the audit log | **Works (new)** | `#/admin/team` — 6 roles × 11 sections (none / view / edit), checked on every button (new pages and the main existing order / courier / fulfilment buttons); demo "acting as" chip on every new page; append-only audit log with search, filter, CSV; blocked attempts logged (PR 16, 495, 139) |
| Bulk order actions | **Works (new)** | `#/admin/bulk` (button on Orders) — tick orders, then confirm, book courier, print stickers, picking list or invoices; flagged orders skipped with a note (PR 140, 152) |
| Communications log | **Works (new, mock)** | `#/admin/comms` + "Messages to the customer" on the order screen: SMS at order placed, SMS + one WhatsApp at confirm / processing, texts from Settings → SMS & WhatsApp messages (2 new rows: processing WhatsApp, order email); a 3rd SMS or 2nd WhatsApp (incl. the WhatsApp-invoice button) is blocked and logged; invalid phone → failed with Retry; message cost feeds the P&L (B2.5, PR 148–149, 505) |
| Invoice generation | **Works** | shop and admin, 7 designs; bulk invoice print (new) |
| WhatsApp invoice send | **Works (demo)** | counts as the order's one WhatsApp (owner rule) |
| Stickers and picking list | **Works** | `#/admin/fulfilment`, or bulk print for chosen orders (new) |
| 768 px admin tab strips | **Fixed** | every scrolling tab strip (admin nav chips and page tabs) shows a fade and an arrow on the side that has more (B7.2 rule 3) |
| An ops agent processing orders | **Missing (by design here)** | the screens are ready for the simulation's OPS agent to drive; no AI agent acts on demo orders by itself |

Files of fix E: `src/96f-admin-ops.js` (finance, expenses, team & audit, messages, bulk, money check, tab strip),
`src/96g-admin-care.js` (review, exchanges & returns, support, coupons, customer side), `src/r12-zz-ownerE.css`.
No shared file was edited. Sheets: `owner-fix/E/sheets/`.

## 9. Files

- `src/96e-admin-docs.js` (new) — Fulfilment, Stock & ERP, 7 invoice designs, JPG, sticker, picking list, order
  screen additions, order ↔ courier sync, stock hold, search, cancel, note.
- `src/r12-zz-ownerD.css` (new) — styles for the above.
- `src/98b-admin-dict.js` — 16 entries (English mode leaks + new admin strings).
- Build: `dist/fixD.html`.

## 10. Phone device gate

`node qa/device-matrix.js dist/fixD.html --group=phones` → **15 devices × 15 routes, 240 checks, 0 failing.**
The storefront is unchanged (invoice design 1 stays the default; the stock hold only touches orders placed in the
browser after this build).
