# EXTAS admin: architecture (CN-018, CN-019)

> **বাংলায় এক নজরে**
>
> - নতুন অ্যাডমিনে বাঁ দিকে **12টা সেকশন আর নিচে সেটিংস**, তিনটা দলে ভাগ করা:
>   - **রোজকার কাজ:** ড্যাশবোর্ড, অর্ডার, প্রোডাক্ট, কাস্টমার, ডেলিভারি, মেসেজ, সাপোর্ট।
>   - **বিক্রি বাড়ানো:** মার্কেটিং, ওয়েবসাইট।
>   - **ব্যবসা:** টাকা, রিপোর্ট, AI সেন্টার। এর নিচে সেটিংস।
> - ডেমোর একটা ফিচারও বাদ যায়নি। শুধু জায়গা বদলেছে। কোন ফিচার কোথায় গেল, তা নিচের টেবিলে (§6) লেখা আছে।
> - **প্রতিটা পাতায় একটাই মূল কাজ।** কম দরকারি জিনিস “More options”-এর ভেতরে ভাঁজ করা থাকে। কোনো পাতা সুইচের দেয়াল হবে না।
> - **উপরে একটা সার্চ (Ctrl K):** যেকোনো পাতা, সেটিং, অর্ডার, প্রোডাক্ট বা কাস্টমার এক জায়গা থেকে খোঁজা যায়।
> - **স্টাফ শুধু নিজের সেকশন দেখে।** যেমন প্যাকিংয়ের লোক শুধু অর্ডার আর ডেলিভারি দেখে।
> - **চার্ট শুধু লাইন আর বার।** প্রতিটা সংখ্যার কার্ডে আগের সময়ের সাথে তুলনা থাকে। 3D চার্ট নেই, পাই চার্টের ভিড় নেই।
> - **মেসেজ সেকশন একটা কন্ট্রোল সেন্টার:** অর্ডারের প্রতিটা ধাপে কোন মেসেজ যাবে, কোন চ্যানেলে আর কখন, সব এক টাইমলাইনে। প্রোমোশন ক্যাম্পেইনও এখানে।
> - **প্রতিটা সেকশনের বাংলা ম্যানুয়াল থাকবে, ছবিসহ।** প্রতিটা পাতায় “এই সেকশনে কী করা যায়” লিংক থাকবে।
> - আপনার কাছে দুটো সিদ্ধান্ত চাওয়া হচ্ছে (§9): 13টা সেকশন ঠিক আছে কি না, আর বাল্ক/কর্পোরেট অর্ডারের লেন রেজিস্টারে উঠবে কি না।

Status: **proposal for the owner's approval** (CN-019 (2)). The demo admin (V12.2) defines **what** the admin
contains. This file defines **how** it is laid out. Nothing here changes a business rule; every policy number
stays a backend setting, off by default (CN-018 standing rule).

Pictures: the sitemap and the shell and Dashboard mock-ups (see §10). The remaining section mock-ups are made
after the owner chooses how many he wants.

---

## 1. Principles

1. **One main task per screen.** A screen answers one question ("which orders need confirming?") and offers the
   one or two actions that follow from it.
2. **Everything is kept, nothing is crowded.** Every demo feature and every CN-012 to CN-019 setting has a home
   (§6). Rare options are folded under **More options** inside their own section, never in a global junk drawer.
3. **Settings live where the work is.** Coupon rules sit with coupons, risk rules with orders and message caps
   with messages. The Settings section keeps only store-wide things (store details, checkout and payments, team,
   connections, system).
4. **Find anything in one search.** The command palette (Ctrl K, or tap the search box) indexes pages, tabs,
   every setting by its label and synonyms (Bengali and English), orders, products and customers.
5. **Role-based.** Every section, tab and action has a permission key (PR 16/495 role builder). A packer sees only
   Orders → Packing & print and Delivery. Nobody sees an empty menu item.
6. **Calm visual language.** Deep green, cream and white, one sans typeface, generous spacing, status shown
   with colour **and** words. No 3D, no gradients on data, no pie charts with more than three slices (we use bars
   instead).
7. **Safe by design.** Hard-rule actions (money, refunds, COD, prices, discounts, ad budgets, blocking, deleting)
   always show a confirm step that states the exact effect, and they are logged. Nothing is deleted: "Remove"
   archives the item and offers Undo.

---

## 2. Global layout (the shell)

```
┌────────────┬──────────────────────────────────────────────────────────────────────┐
│ EXTAS      │  [ Search pages, settings, orders, products, customers…   Ctrl K ]   │
│ Main store▾│                                  Ask AI · 🔔 3 · EN|বাং · avatar     │
│────────────├──────────────────────────────────────────────────────────────────────┤
│ DAILY WORK │  Breadcrumb                                                          │
│ Dashboard  │  Page title                     [guide link]   [Secondary] [Primary] │
│ Orders  18 │  Tabs: Tab · Tab · Tab · Tab · More ▾                                │
│ Products   │  ──────────────────────────────────────────────────────────────────  │
│ Customers  │  Content: KPI cards / list / detail / form                           │
│ Delivery 23│                                                                      │
│ Messages   │                                                                      │
│ Support  7 │                                                                      │
│ GROW       │                                                                      │
│ Marketing  │                                                                      │
│ Website    │                                                                      │
│ BUSINESS   │                                                                      │
│ Money      │                                                                      │
│ Reports    │                                                                      │
│ AI Center  │                                                                      │
│────────────│                                                                      │
│ Settings   │                                                                      │
│ Help/manual│                                                                      │
│ Build prog.│                                                                      │
└────────────┴──────────────────────────────────────────────────────────────────────┘
```

- **Sidebar** (252 px, deep green): the store switcher at the top (S17 multi-store: Main store / Store 2 /
  Store 3 / "All stores" combined view), then three labelled groups, then Settings, **Help & manual** and
  **Build progress** at the bottom. A count badge shows only work that is waiting (orders to confirm, parcels to
  book, open chats). It collapses to icons on a laptop at 1366 px or narrower.
- **Top bar:** the global search (command palette), **Ask AI** (opens the chief agent panel, hidden when AI is
  off), notifications (approvals waiting, urgent customer problems, failed syncs, Bug Guard-style alarms),
  the language toggle EN | বাং, and the account menu (profile, 2FA, sign out).
- **Page header:** breadcrumb, title, one-line description, the section's guide link **“এই সেকশনে কী করা যায়”**
  (opens the Bengali manual chapter in a side panel), then at most one primary and two secondary buttons.
- **Tabs:** at most 6 visible; the rest sit under "More ▾". The tab strip scrolls with a fade on narrow screens.
- **Notifications** are grouped Urgent / Important / FYI, and each one links to the exact record.

### Command palette

- Results are grouped: Pages · Settings · Orders · Products · Customers · Help.
- A setting result shows its path ("Orders › Risk rules › Soft level") and opens the page scrolled to that
  setting with a brief highlight.
- It understands Bengali words and common synonyms ("ক্যাশ অন ডেলিভারি" = COD, "ফেরত" = return).
- Quick actions: "Create order", "Add product", "New coupon", "Book ready parcels".
- Keys: ↑ ↓ to move, Enter to open, Esc to close.

### Role-based visibility (defaults; the owner edits roles)

| Role | Sees |
|---|---|
| Owner / Super admin | Everything |
| Manager | Everything except Settings → Team & roles, Keys & connections, System |
| Order desk | Dashboard (own), Orders (no Risk rules), Customers (read), Delivery, Messages → Message log |
| Packer | Orders → Packing & print, Returns & exchanges (Receive & QC only) |
| Support agent | Support, Customers (read), Orders (read, notes), Messages → Message log |
| Marketing | Marketing, Website, Messages → Campaigns, Reports → Marketing & ads |
| Accounts | Money, Reports, Orders (read) |
| Auditor | Read-only everywhere, plus the audit log |

---

## 3. UI rules (every section)

**Lists**

- Saved views show as chips above the table (for example "Today", "COD unpaid" or "Gift orders"), with
  **+ Save view** at the end. Views can be personal or shared.
- The filter bar has search, then 3 or 4 common filters, then **More filters**. Active filters show as removable
  chips.
- The bulk action bar appears at the bottom only when rows are selected. It shows what will be skipped and why
  (for example "1 cancelled order will not be booked", CN-017).
- Rows are 48 px high with clear status pills (colour plus a word) and right-aligned money in ৳ with Western
  digits.
- Every list has an empty state that says what goes here, why it is empty and the one button that fills it.

**Detail pages**

- The left two-thirds holds the record, in cards.
- The **right third is the timeline**: every event, status change, message sent (with channel, cost and delivery
  state), note and staff action, newest first. A note box sits at the top of the timeline.
- The next action is the primary button in the header (for example "Book courier"). Locked states are explained
  inline (for example "Booked: editing will re-book the parcel").

**Forms**

- Forms are split into sections with a left anchor list that shows ✓ or ! per section.
- A **sticky save bar** at the bottom appears as soon as anything changes (Discard · Save draft · Publish).
- Every field has a one-line hint. Long explanations sit behind an ⓘ that opens the manual at that spot.
- **More options** is a collapsed card at the end of each form, labelled with how many options are inside.

**Settings cards**

- Each feature is one card: its name, one line on what it does, the on/off switch (off by default) and its
  values. When the feature is off, its values are folded away.
- Every value shows its default and has **Reset to default** (PR 510).
- A change that touches money, COD, prices or discounts shows a "what changes" preview and needs confirmation.

**Charts and numbers**

- KPI cards show the value, the change against the previous period (▲ or ▼ with %) and a 30-point sparkline.
- Charts are **line** charts (trends, with the previous period dashed) or **bar** charts (comparisons and
  categories). There are no 3D charts and no pie charts with more than 3 slices. Money axes are in ৳ with
  k / lakh shorthand.
- Every chart has a title that says what it answers, a date range control and a "View data" table toggle.
- Colour is never the only signal: values are labelled, and up and down also use ▲ and ▼.

**Help and empty states**

- Every section header has the Bengali guide link (CN-014). Every empty state links to the same guide chapter.
- Inline help is short Bengali text under the field where it matters (for example "0 মানে ফ্রি ডেলিভারি").

**Phone (390 px) and tablet (768 px)**

- **Phone:** a bottom bar with 5 items (Home · Orders · Support · Search · More). "More" opens the full section
  list. Tables become cards (order number, name, amount, status, one action). Detail pages stack the record,
  then the timeline. The sticky save bar spans the full width. Touch targets are at least 44 px.
- **Tablet:** the sidebar becomes icons only (it expands on tap). Detail pages show the timeline as a tab
  ("Details | Timeline"). Charts keep their full form; KPI cards wrap 2 by 2.
- The layout checks run at 390, 768, 1366 and 1920 px: no cut text, no sideways scroll.

---

## 4. The sections

Notation: **Tab** is what the screen does. *More options* lists what is folded away. PR numbers show where the
work is registered.

### 4.1 Dashboard (ড্যাশবোর্ড)

The owner's morning screen. There is one page with no tabs.

- **Today at a glance:** KPI cards (sales, orders, delivery success over 30 days, estimated profit), each with its
  trend and sparkline. Date control: Today · 7 days · 30 days · Custom.
- **Needs you now:** a task list with counts and age, for example orders to confirm, risky orders, parcels to
  book, exchange requests, waiting chats, low-stock sizes, approvals waiting (AI and staff, PR 317/540) and urgent
  customer problems (CN-015). Each row opens the filtered list.
- **Sales trend:** a 30-day line, with the previous period dashed.
- **Orders by stage:** a pipeline bar (New → Confirmed → Packed → With courier → Delivered).
- **Top products today** and **Delivery success by courier** (bars).
- **Running problems** strip (CN-015): open problems with the number of users hit, linking to Reports → Site
  health.
- *More options:* choose and reorder the cards (per user), and send this summary to Telegram daily (time is a
  setting, default 22:00).

### 4.2 Orders (অর্ডার)

| Tab | Main task | Notes |
|---|---|---|
| **All orders** | Find and act on orders | Saved views: Today · COD unpaid · Prepaid · Gift orders · Edited after booking · Partly delivered · **Bulk & corporate** · Incomplete (typed but not placed, PR 274–275). Bulk: confirm, book courier, print stickers, invoices, picking list, add tag, export (PR 140, 151, 152) |
| **To confirm** | Confirm new orders quickly | Call and WhatsApp buttons, **WhatsApp self-confirm** status (CN-014a; replies 1/2/3, hours before the call queue), new-customer verification queue (PR 545) |
| **Risk review** | Decide on flagged orders | Risk-sectioned queue (PR 541), alert card that says why it fired (PR 521), duplicate and re-order cases A–H (PR 520), multi-order bundling (PR 522), one-click advance-charge request (PR 542), decision learning (PR 543). This replaces the demo's "Review queue" and "Duplicate & fraud review" pages |
| **Packing & print** | Pick, pack and hand over | Print run, courier stickers, picking list, invoice designs (default 3 of 7), defective-at-packing card (PR 183), **packing proof photo** (CN-014c), handover sheet (PR 180, 182). Former "Fulfilment" and "Bulk" pages |
| **Returns & exchanges** | Move each request to done | Board: Requested → Approved → Received & QC → Done. Exchange requests, return requests, refused parcels, **size exchange charge** (customer pays for own size choice; free for our mistake via a claim with note and photo; staff **waive** with a logged reason, CN-018 (5)), **one-trip size swap** (CN-014e), QC with SKU scan before restock (CN-017) |
| **Risk rules** | Set how risk is judged | The risk matrix: rules and weights (past RTO, courier success ratio, new phone number, area, order value, repeat cancels; PR 156). **Soft level** = ask for the delivery charge in advance; **Hard level** = ask for full advance; partial-advance option (CN-018 (2)). Rule master switches (PR 544), false-positive protection (PR 524), blocklist with reason and Undo (PR 162, 523; **never auto-block**). Flag outcome report link (PR 562) |

- **Order detail:** items, totals (with "to collect on delivery", hidden for prepaid orders, CN-017),
  customer and address with band, courier box, risk panel (PR 160), customer history summary (PR 533), and the
  **timeline** on the right (PR 138/139: events, every message sent, every edit with who and source, PR 142).
  Editing after booking re-books or locks the parcel (CN-017).
- **Bulk & corporate lane:** a saved view plus a "Bulk & corporate" order type: quotation, tiered or agreed price,
  advance and balance, invoice with company details, delivery in batches. *Not yet in the register: needs a CN
  and a PR number (see §9).*
- *More options:* order edit window for customers (PR 143), cancellation reasons (PR 144), hold reasons
  (PR 153), duplicate-order defence layers (PR 145), two-size follow-up (PR 146), cancellation notice text
  (PR 546), order number format.

### 4.3 Products (প্রোডাক্ট)

| Tab | Main task |
|---|---|
| **All products** | Status views (On sale · Ready · Draft · Unpublished · Out of stock), category chips, bulk publish, unpublish, tag or price (price changes confirmed) |
| **Launch queue** | Products waiting for photos, size chart or stock before going live (PR 35, 204) |
| **Combos & sets** | Auto colour-pair combos, the 8-step combo wizard, fixed combos and customer sets, archive, combo report (PR 89–104, 571–576). Each set has **"Fixed set (nothing kept or returned alone)" or "Flexible"**; flexible sets have the split-price rule and the delivery-charge-under-limit rule (CN-018 (4)) |
| **Stock** | Overview (units, value, low stock, mismatches, **negative stock shown as negative**, CN-017), low-stock size grid, stock counts (barcode, variance, reason), movements, **Sent to ERP**, **Back-in-stock requests**. ERP sync now / per SKU (PR 194–207, CN-005) |
| **Size charts** | Charts, paste from Excel, read from a spec-sheet photo, copy for another fit, category defaults (PR 27–28) |
| **Reviews** | Moderate, publish or hide, mark verified, import a file, photo reviews first. The review request timing lives in Messages (PR 65, 223, 295) |
| **Collections** | Manual and rule-based collections, seasonal start and end (PR 32). Used by hero campaigns |

- **Product add or edit:** a sectioned form (Basics · Photos · Colours & sizes · Prices & stock · Size chart ·
  Search & Google · Shop display), with the readiness score and checklist on the right (PR 29) and a sticky save
  bar.
- *More options (in the tab strip "More ▾"):* Import from link (PR 33), Bulk CSV (PR 34), Product audit
  (PR 39), Naming & links (PR 590; templates, bulk rename), Media library (PR 37), Colour library (PR 30), "Was"
  price source (PR 38), product page template per product (PR 52).

### 4.4 Customers (কাস্টমার)

| Tab | Main task |
|---|---|
| **All customers** | Views: New · Returning · VIP · At risk · Refused before · Exchanged · No offers. Columns include delivery success and risk band |
| **Segments** | Saved behaviour segments (PR 287) used by Messages campaigns and ad audiences |
| **Loyalty & wallet** | Rewards and points (PR 296), customer grades and badges (PR 534), wallet ledger (PR 171), **referrals** (PR 273). Every perk is a setting, off by default |
| **To review** | Merge suggestions from the identity graph (PR 284, 519) |

- **Customer profile:** orders, spend, delivered or returned ratio, the **risk breakdown per rule** with the
  level it reaches (rules are edited in Orders → Risk rules), tags and notes (PR 297), support history, journey
  (PR 288), wallet and points, and a timeline.
- *More options:* import legacy customers (PR 535), export with retention (PR 299), consent and opt-outs
  (PR 298), data retention (PR 302), birthday field (PR 301), messages-per-order view (moved here from the
  demo's Customers tab).

### 4.5 Delivery (ডেলিভারি)

| Tab | Main task |
|---|---|
| **Overview** | Parcels with couriers, success rate, average days in Dhaka and outside, RTO rate and cost; success by courier over 8 weeks (line) |
| **Ready to book** | Book in one go with suggested couriers by zone, weight and cost (PR 178); **cancelled and held orders are excluded** (CN-017) |
| **In transit** | Tracking sync (PR 184), stuck parcels (no movement in N hours, a setting), delivery-day list |
| **Returned & refused** | RTO parcels, return reasons from the rider (PR 526), refused-parcel handling (PR 191), partial delivery, failed delivery (CN-017 states) |
| **Couriers** | Accounts (Steadfast, Pathao, more; mock until a key exists), performance per courier (PR 192), courier zone sync (PR 554), multi-courier fraud data (PR 567) |
| **Zones & charges** | Three bands (Dhaka City, near-Dhaka sub-areas, outside Dhaka), charges, times, sub-area list, test an address (PR 502, 549–553) |

- *More options:* charge mismatch log (PR 564), charge accuracy guard (PR 553), sticker size, holiday delivery
  promises (PR 193; the festive dates themselves are in Marketing → Campaigns), exact-amount line on the sticker
  (CN-014b, shared with Messages).
- The courier money check lives in **Money → COD reconciliation**, with a link from here.

### 4.6 Messages (মেসেজ): the control centre (CN-019)

| Tab | Main task |
|---|---|
| **Order journey** | One timeline editor for every automatic message (below) |
| **Campaigns** | Promotions: audience, channel, schedule, frequency cap, quiet hours, preview of reach and cost (below). Includes win-back (PR 300) and abandoned-cart or incomplete-order recovery (PR 275–276) as ready-made campaign types |
| **Templates** | Every SMS, WhatsApp and e-mail text in Bengali and English with variables (PR 505); the AI writer drafts in the owner's voice (PR 293) |
| **Message log** | Every message: what, when, channel, cost and delivery state, with retries (PR 149) |
| **Channels & limits** | Providers (SMS, WhatsApp Business, e-mail, Messenger; mock until connected), sender names, per-order caps, quiet hours, consent rules (PR 291, 292, 290, 298) |

**Order journey editor.** A horizontal timeline of steps: Order received → Confirmation → Packed → Booked →
Out for delivery → Delivered → After delivery (Day 1, Day 3).

- Each step card has:
  - a **Send** switch;
  - the **channel** (SMS · WhatsApp · E-mail · None, with a fallback order);
  - the **template**, with a live phone preview;
  - **when** it goes (immediately, after N minutes, at a set time) and **who** gets it (all, COD only, prepaid
    only, gift receiver).
- The **caps** card sets the maximum messages per order: per channel and in total.
- Optional steps are built and can be switched:
  - the delivery-day morning message ("arrives today, keep ৳X ready", off);
  - **Day-1 care** ("did the size fit?") and the **Day-3 review request**, both on by default and sending once a
    provider is connected (CN-019 (1), CN-014f);
  - **self-confirm WhatsApp** as a placeable step, with "counts as the order's one WhatsApp" as a setting (the
    decision is pending, CN-018 (10)).
- The exact-amount line (CN-014b) is a variable that **never renders for prepaid orders** (CN-017).
- Clicking a step opens its editor in a right panel. Nothing sends while the store's messages master switch is off.

**Campaigns screen.** On the left, the list of campaigns (status, audience, channel, reach, cost and results in
orders and ৳). On the right, a 4-step builder:

1. **Audience:** a segment plus exclusions ("No offers", recent buyers).
2. **Channel.**
3. **Message:** template and preview.
4. **Schedule:** a time, quiet hours and a frequency cap.

A summary box always shows *will receive*, *skipped (and why)* and the *estimated cost* before **Schedule**.

### 4.7 Support (সাপোর্ট)

| Tab | Main task |
|---|---|
| **Inbox** | One inbox for every channel (WhatsApp, Messenger, site chat, e-mail, calls logged). Views: All · Open · Waiting · Solved · Mine. Three panes: list · thread with AI draft (a human sends) · customer and order panel (PR 425–436, 538, 566) |
| **Rider issues** | Overcharge complaints with proof → staff approve → refund the **exact extra** to wallet or the original method, then recover it from the courier claim (CN-018 (7)) |
| **Claims & credits** | Wrong-item claims (feeding Returns & exchanges) and the **late-delivery apology credit** (percentage or amount, to wallet or next order, per order or by rule; off by default, CN-018 (8)) |
| **Saved replies** | Reply snippets in Bengali and English, catalogue drawer and tracked product links |

- *More options:* desk hours, AI answer level, escalation window before Telegram ping (default 5 min), link safety
  check, one-click order creation from chat.

### 4.8 Marketing (মার্কেটিং)

| Tab | Main task |
|---|---|
| **Campaigns & hero** | "On the site now" preview, a date calendar of campaigns, 8–10 ready hero templates plus "Design your own", linked collection, launch default fallback (CN-012 (1), PR 41/43, 280, 597). **Eid order-by dates per district** with banner text and **pre-order with advance** (fixed or %) (CN-014g, CN-018 (6), PR 193, 214, 173) |
| **Coupons & offers** | Coupon list with usage and sales; each coupon has **"Who can use it": guests, logged-in customers or both** (CN-018 (9)); limits, dates, products, stacking (PR 271–272, 213). Combo tier offers link to Products → Combos |
| **Rules & pop-ups** | Smart rules (delivery, exchange, sets, discounts, festive) with preview, history and simulation (PR 208–219); notices, pop-ups and **house ads** (own ad slots in the blog and side canvas, PR 216, 592, 596) |
| **Ads** | Ad accounts (Meta, Google, TikTok; mock until connected), campaigns, spend, **ROAS**, cost per delivered order, approvals, pause all, tracking and conversion feed, audiences and the refused exclusion list, Merchant Center feed, creatives, change log (PR 254–270, 531–532, 569, 589) |
| **Landing pages** | Campaign and seasonal landing pages, templates, copy link (PR 254–255, 246, 530) |
| **Studio** | Social and content studio (S23), virtual photoshoot (S24), video and campaign creative (S25). Each opens its own workspace |

- *More options:* marketing calendar (PR 282), competitor and market intelligence (PR 548), YouTube (PR 278), USD
  rate (PR 266), SEO outreach (PR 279).

### 4.9 Website (ওয়েবসাইট)

| Tab | Main task |
|---|---|
| **Site builder** | Menus, header, footer, theme, product page and category templates, content pages (PR 598, 501, 75, 82) |
| **Page layouts** | Home and category sections: add, move, hide (PR 595, 76–77); **side canvas** zones (PR 596) |
| **Blog & journal** | Board: Ideas → Writing → Review → Scheduled → Published. Topics, schedule, writers ("EXTAS Journal" byline), results, blog ad slots, image sourcing (PR 239–253, 528–529, 547, 591–593) |
| **SEO** | Titles and meta templates, SEO health per page, redirects and 404s, sitemaps, robots and AI crawlers, structured data, the Bengali-ready gate, permanent URL policy (PR 220–238, 527, 586, 588) |
| **Words & language** | The label dictionary (every visible word), the Bengali and English switch, the checkout text set (PR 78, 503, 84) |

- *More options:* on-page edit mode (PR 600, 79), the eye-toggle dashboard (PR 80–81), **Launch default:
  save and restore** (PR 597), light-sweep and celebration switches (PR 86–87), floating WhatsApp placement
  (PR 70).

### 4.10 Money (টাকা)

| Tab | Main task |
|---|---|
| **Profit & loss** | Revenue (delivered), product cost, courier, gateway fees, ad spend (allocated per order), packaging, expenses and salaries → gross and net; by day, style, category and combo; delivered vs booked (S16, PR 342–355) |
| **COD reconciliation** | Per courier: delivered COD, received, pending, mismatch; match a payout file; open a claim; true-delivery reconciliation (PR 166, 174, 525) |
| **Payments & refunds** | Gateway statements (bKash, Nagad, card), refunds (always confirmed), wallet refunds (PR 165–172) |
| **Expenses & salaries** | Expenses, staff and salaries, expense heads; read-only from the ERP when it is connected (S16 Q22) |
| **Costs & fees** | Courier rates, gateway fees, packaging, the **RTO cost book** inputs (CN-014d), USD rate |

- *More options:* VAT (off, field present), daily money report time, per-style profit view, export.

### 4.11 Reports (রিপোর্ট)

| Tab | Main task |
|---|---|
| **Overview** | Sales, orders, average order, conversion, repeat rate, with comparison to the previous period |
| **Sales** | By day, category, product, payment method, zone (PR 155) |
| **Products & combos** | Best sellers, sell-through, combo pairs picked (PR 104) |
| **Customers** | New, returning, churned, by segment (PR 303) |
| **Marketing & ads** | Spend, revenue, ROAS by channel and campaign (PR 283); content performance (PR 250, 253); organic (PR 238) |
| **Delivery & RTO** | **RTO cost book** by district, campaign, product, courier and reason (CN-014d); courier performance; fraud report (PR 164) |
| **Site health** | **Customer problems** (CN-015: Urgent / Important / Can wait, status, users hit, lost sales), **Server** (PR 423, services, Telegram alerts, alert log), Speed (Core Web Vitals, PR 234), Site audit (runs and report history, PR 570 results) |
| **Experiments** | A/B tests, for example added-to-bag drawer A vs B (PR 83) |

- *More options:* scheduled reports (daily, weekly and monthly digests to Telegram and e-mail, PR 341), CSV export,
  the analytics commentary agent's notes (PR 333), the funnel per page (PR 339).

### 4.12 AI Center (AI সেন্টার)

| Tab | Main task |
|---|---|
| **Control room** | What is running, what it cost, master switch, per-agent on and off (PR 304–305) |
| **Approvals** | The single queue of everything the AI is waiting on (PR 317, 540) |
| **Agents** | The seven agents and the five blog writers: profiles, appraisals, curriculum, memory, **Ask the chief**, Telegram routing (PR 577–585, 318–319) |
| **Skills** | Skill library, versions, sandbox, training from corrections (PR 321–323) |
| **Checklist audit** | The full e-commerce checklist audit runner: run, schedule, report history, bugs (PR 570) |
| **AI costs** | Cost book, spend caps with the 80% warning, estimate vs actual, presets, calculator (PR 309, 312–316) |

- *More options:* model picks per agent and auto-suggest (PR 306–307, 580), data routing and masking
  (PR 310–311), AI diary and bug box (PR 319–320), AI-off fallback (PR 324), AI media library, competitor
  teardown (PR 335–337).

### 4.13 Settings (সেটিংস)

Settings opens with a large **settings search** and a left list of groups:

| Group | Contains |
|---|---|
| **Store details** | Name, logo styles, contacts, social links, legal numbers (DBID, trade licence, BIN), the "My own data" register (PR 501, 509) |
| **Checkout & payments** | Payment options (COD open; mobile, card and online on click), **Prepaid reward** (type: free delivery, fixed amount or percentage; falls back to amount or percentage when delivery is already free; CN-018 (1)), **Gift mode** (CN-014h), checkout words and field order, bag panel style, recommendation fill rule, wallet at checkout, advance-payment checkout mode (CN-012 (2), PR 558, 560) |
| **Policies & texts** | Terms, exchange policy, privacy, delivery FAQ (editable text that rules quote) |
| **Team & roles** | Role builder, people, acting as, 2FA, **audit log** (PR 16, 495, 139) |
| **Keys & connections** | The credential vault: every integration with Mock / Sandbox / Live, test and remove (archives) (PR 493, 500, 18) |
| **ERP connection** | Mode (EXTAS ERP · another ERP · no ERP), mapping to `companyId` and warehouse, sync health (PR 497–499, 196, 205; CN-005) |
| **Stores** | Multi-store: stores, domains, shared vs separate settings, the combined view (S17, PR 356–377, 511–512) |
| **System** | **Backups & restore** (Google Drive, Azure Blob, schedule and retention, monthly restore test, last runs; PR 8, 395, 507), cache (PR 602), images (5 sizes, quality, storage), security (login rules, IP and GPS purge after 180 days), the settings framework's reset to default |

- **Help & manual** (sidebar bottom): the Bengali manual per section (§8), what's new.
- **Build progress** (sidebar bottom, owner only): PR register (Stages & PRs, What's new, Reported problems,
  **Blueprint & files**; PR 594).

---

## 5. Stage → section map (all 28 stages)

| Stage | Where it lives in the admin |
|---|---|
| S0A Server foundation | Settings → System (backups, cache); Reports → Site health → Server |
| S00 Foundation, settings framework | Shell, Settings (all groups), Keys & connections, Team & roles, Build progress |
| S01 Catalog, media & images | Products (all tabs, More: import, audit, naming, media) |
| S02 Storefront | Website (site builder, layouts, words), Reports → Experiments |
| S03 Combo & bundles | Products → Combos & sets; Reports → Products & combos |
| S04 Cart, checkout, accounts | Settings → Checkout & payments; Customers → Loyalty & wallet |
| S05 Order management | Orders (all tabs, detail, timeline) |
| S06 Fraud & location | Orders → Risk review and Risk rules; Delivery → Zones & charges |
| S07 Payments & wallet | Money → Payments & refunds; Settings → Checkout & payments; Customers → Loyalty & wallet |
| S08 Courier, returns, exchange | Delivery; Orders → Returns & exchanges; Money → COD reconciliation |
| S09 Inventory & ERP sync | Products → Stock; Settings → ERP connection |
| S10 Smart Rules | Marketing → Rules & pop-ups |
| S11 SEO engine | Website → SEO |
| S12 Content & blog | Website → Blog & journal |
| S13 Marketing & ads | Marketing (Ads, Coupons, Landing pages, Campaigns & hero) and Messages → Campaigns |
| S14 CRM & customers | Customers; Messages (journey, templates); Products → Reviews |
| S15 AI 360 Control Room | AI Center; Reports (funnels, digests) |
| S16 Finance, costs & reports | Money; Reports |
| S17 Multi-store | Store switcher in the sidebar; Settings → Stores |
| S18 Compliance, security, manual | Settings → System (security), Store details (legal numbers), Help & manual |
| S19 Deploy, backup, go-live | Settings → System → Backups & restore; Build progress |
| S20 Fulfilment & documents | Orders → Packing & print |
| S21 Site Health & Audit | Reports → Site health; AI Center → Checklist audit; Build progress (PR 594) |
| S22 Support (all-in-one) | Support |
| S23 Social & content studio | Marketing → Studio |
| S24 Virtual Photoshoot Studio | Marketing → Studio |
| S25 Video & Campaign Creative Studio | Marketing → Studio |
| S26 Installation, docs & distribution (parked) | Settings → System (placeholder, hidden until approved) |
| S27 No-ERP stock module (parked) | Products → Stock (works when Settings → ERP connection = no ERP) |

---

## 6. Feature → location map (nothing lost)

Every demo admin page (V12.2, with its guide in `docs/admin-guide/`) and every CN-012 to CN-019 item:

| Demo page / feature (guide) | New location |
|---|---|
| Orders list, Review queue (`orders`) | Orders → All orders; Orders → Risk review |
| Duplicate & fraud review (`review`) | Orders → Risk review; rules in Orders → Risk rules |
| Bulk (`bulk`) | Bulk bar on Orders → All orders; printing in Orders → Packing & print |
| Fulfilment (`fulfilment`) | Orders → Packing & print |
| Exchanges & returns (`exchanges`) | Orders → Returns & exchanges |
| Couriers: overview, parcels, returns, accounts (`couriers`) | Delivery (Overview, Ready to book, In transit, Returned & refused, Couriers) |
| Couriers → Money check (`couriers`) | Money → COD reconciliation |
| Delivery areas and charges (`delivery`) | Delivery → Zones & charges |
| Products, queue, import, audit, back-in-stock (`products`) | Products (All, Launch queue, More: import, audit; Stock → Back-in-stock) |
| Size charts (`size-charts`, `sizecharts`) | Products → Size charts |
| Stock & ERP, counts, movements (`stock`) | Products → Stock |
| Combos & sets (`combos`) | Products → Combos & sets |
| Reviews (`reviews`) | Products → Reviews |
| Naming & links, redirects (`naming`) | Products → More → Naming & links; redirects in Website → SEO |
| Images (`images`) | Settings → System → Images |
| Customers and segments (`customers`) | Customers (All, Segments, To review) |
| Message log, send rule (`comms`) | Messages → Message log; Messages → Order journey |
| Coupons (`coupons`) | Marketing → Coupons & offers |
| Hero & campaigns (`hero`) | Marketing → Campaigns & hero |
| Smart rules, notices & pop-ups (`rules`) | Marketing → Rules & pop-ups |
| Landing pages (`landing`) | Marketing → Landing pages |
| Ads & tracking (`ads`) | Marketing → Ads |
| Blog & SEO (`blog`) | Website → Blog & journal; Website → SEO |
| Site builder (`site`) | Website → Site builder |
| Page layout (`layout`) | Website → Page layouts |
| Side canvas (`sidecanvas`) | Website → Page layouts → Side canvas |
| Finance, P&L (`finance`) | Money → Profit & loss |
| Expenses & salaries (`expenses`) | Money → Expenses & salaries |
| Analytics (`analytics`) | Reports (Overview, Sales, Experiments) |
| Support inbox (`support`) | Support → Inbox |
| AI & agents (`ai`) | AI Center (Control room, AI costs, More: model picks, data routing) |
| Seven agents, Ask the chief, Telegram (`agents`) | AI Center → Agents |
| Site audit (`audit`) | AI Center → Checklist audit; results in Reports → Site health |
| Server, health, alerts (`server`, `health`) | Reports → Site health → Server |
| Speed (`speed`) | Reports → Site health → Speed |
| Cache (`cache`) | Settings → System → Cache |
| Backup (`backup`) | Settings → System → Backups & restore |
| Keys & connections (`keys`, `integrations`) | Settings → Keys & connections |
| Team & audit log (`team`) | Settings → Team & roles |
| Settings groups (`settings`) | Split by topic: Delivery → Zones & charges; Settings → Checkout & payments; Messages → Templates; Website → Words & language; Orders → Packing & print (invoice designs) |
| Site manual (`manual`) | Help & manual (sidebar bottom) |
| PR register, Blueprint & files (`register`) | Build progress (sidebar bottom) |
| Login and the admin frame (`login`) | Sign-in page; account menu (2FA) |
| CN-012 (1) hero campaigns and templates | Marketing → Campaigns & hero |
| CN-012 (2) checkout texts, field order, bag style, fill rule, payment options, logo choice | Settings → Checkout & payments; logo in Store details |
| CN-014a WhatsApp self-confirm | Orders → To confirm (status) + Messages → Order journey (the step) |
| CN-014b exact-amount line | Messages → Templates (variable) + Delivery → More options (sticker) |
| CN-014c packing proof photo | Orders → Packing & print → More options |
| CN-014d RTO cost book | Reports → Delivery & RTO (inputs in Money → Costs & fees) |
| CN-014e one-trip size swap | Orders → Returns & exchanges → More options |
| CN-014f Day-1 care + Day-3 review | Messages → Order journey (After delivery) |
| CN-014g Eid order-by dates per district | Marketing → Campaigns & hero → More options |
| CN-014h gift mode | Settings → Checkout & payments |
| CN-014 (2) Bengali guide per section | Guide link in every section header; Help & manual |
| CN-015 customer problems | Reports → Site health → Customer problems; Dashboard strip; notifications |
| CN-016 smoke test results | Reports → Site health → Server (last smoke run); Build progress |
| CN-017 fixes (prepaid SMS, Book all, lock after booking, states, negative stock, gift address, SKU on restock) | Rules inside Messages, Delivery → Ready to book, Order detail, Returns & exchanges, Products → Stock |
| CN-018 (1) prepaid reward | Settings → Checkout & payments → Prepaid reward |
| CN-018 (2) risk matrix, soft and hard level, partial advance | Orders → Risk rules |
| CN-018 (4) fixed or flexible sets | Products → Combos & sets (per set) |
| CN-018 (5) size exchange charge, claim, waive | Orders → Returns & exchanges; claims from Support → Claims & credits |
| CN-018 (6) Eid pre-order with advance | Marketing → Campaigns & hero |
| CN-018 (7) rider overcharge refund | Support → Rider issues |
| CN-018 (8) late-delivery apology credit | Support → Claims & credits |
| CN-018 (9) coupon "Who can use it" | Marketing → Coupons & offers (per coupon) |
| CN-019 (1) journey, optional messages, caps, campaigns, log | Messages (all tabs) |
| CN-019 (2) modern simple admin | This document |
| CN-019 (3) manual per section | §8 |
| Loyalty, wallet, referrals (PR 296, 171, 273, 534) | Customers → Loyalty & wallet |
| Fraud review AI agent (PR 329) | AI Center → Agents; its output in Orders → Risk review |
| House ads and pop-ups (PR 216, 592, 596) | Marketing → Rules & pop-ups |
| Bulk & corporate lane | Orders → All orders (view and order type), pending registration |

---

## 7. Screen inventory for the mock-ups

These are the planned pictures. The owner chooses how many are made after seeing the sitemap.

| # | Screen | Shows |
|---|---|---|
| 01 | Shell + command palette | Sidebar, store switcher, search finding a setting |
| 02 | Dashboard | KPI cards, sales trend, Needs you now, pipeline |
| 03 | Orders → All orders | Saved views, filters, bulk bar with the skip notice |
| 04 | Order detail | Record cards with the timeline on the right |
| 05 | Product add or edit | Sectioned form, readiness score, sticky save |
| 06 | Products → Stock | Size grid heat-map, ERP sync, negative stock |
| 07 | Orders → Returns & exchanges | 4-column board, charge or waive |
| 08 | Delivery → Overview and Couriers | Success by courier, ready to book |
| 09 | Customers + risk | Profile with the risk breakdown per rule |
| 10 | Marketing → Campaigns & hero | Live hero, calendar, templates |
| 11 | Marketing → Coupons | "Who can use it", usage |
| 12 | Website → Blog & journal | Board and results |
| 13 | Messages → Order journey | Timeline editor, caps, preview |
| 14 | Messages → Campaigns | Builder with reach and cost preview |
| 15 | Money | P&L, COD reconciliation |
| 16 | Support → Inbox | Three panes, AI draft, rider issue |
| 17 | Reports | Line and bar charts, RTO cost book, site health |
| 18 | Settings | Settings search, Checkout & payments cards |
| 19 | Phone | Dashboard, orders and order detail on 390 px |

---

## 8. User manual plan (CN-014, CN-019 (3))

- One Bengali chapter per section in `docs/admin-guide/`: `dashboard.md`, `orders.md`, `products.md`,
  `customers.md`, `delivery.md`, `messages.md`, `support.md`, `marketing.md`, `website.md`, `money.md`,
  `reports.md`, `ai-center.md` and `settings.md`. The existing per-page guides become sub-chapters, so nothing is
  lost.
- Each chapter covers: what the section is for; each tab, with **what · why (a real EXTAS example) · how (steps)**;
  every switch and number with its default; common mistakes; and what happens next.
- **Screenshots:** taken automatically from staging with sample data. Each picture has red numbered marks that
  match the steps. Captions are in Bengali. Pictures are retaken when a screen changes.
- Written in plain চলতি Bengali with Western digits. Labels are quoted exactly as the screen shows them.
- In the admin, the guide link in each header opens the chapter in a side panel at the right tab. The palette
  also searches the manual.
- A chapter is written **in the same PR that builds the section** (CN-014 rule). An index page lists the chapters
  in sidebar order.

---

## 9. Decisions for the owner

1. **13 sidebar entries instead of about 10.** Website and AI Center are kept as their own sections because each
   holds 5 or 6 large tools; folding them into Marketing and Settings would bring back the crowding. Staff see only
   their 2 to 5 sections. *Option:* fold Website into Marketing to get 12.
2. **Bulk & corporate lane** is placed in Orders, but it is not yet in the register. It needs a CN note and a PR
   number before it is built.

## 10. Pictures

The mock-up pictures are rendered from static HTML in the session scratchpad. The parent session publishes them;
they are not committed to the repo. They are: `00-sitemap.png`, `01-shell.png` and `02-dashboard.png`.
