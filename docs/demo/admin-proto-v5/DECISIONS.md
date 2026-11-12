# Owner decisions to build into prototype v2 (12–13 Nov 2026) — read with CONTRACT.md

Design references (static mockups, approved by the owner) in ../flow/: order-journey.html, returns-journey.html,
add-product.html, rules-redesign.html, marketing.html (and blog-analytics.html when it appears). Match them.
Language: every visible admin string is simple English by default with A.t('English','বাংলা'); Bengali only via toggle.

## Global
- Sidebar: clicking an open menu again (or double-click) collapses its sub-menu; applies to every menu.
- Fonts nicer for letters and numbers (tabular numbers), nicer icons with consistent sizing, smarter charts (area fill,
  faint grid, emphasised last point, tooltips/labels). Home design A "Command" is default and gets the polish; B and C
  keep structure only.
- Never "delete": archive. Money/price/discount/budget changes ask for PIN (any 4 digits).

## Orders (NAV tabs: batch, all, confirm, pack, courier, returns, incomplete)
- Orders opens on "This batch": every order since the last courier pickup (e.g. "Since Sat 5:00 PM · 86 orders"),
  pipeline counts To confirm → Confirmed (x by rules, y by staff) → To pack → Packed → With courier, and "Stuck" with
  reasons (No stock, No answer, Suspicious, Merge needed). Click a count → list filtered to this batch. Two lists:
  "Your work" (needs a person, oldest first) and "Moved on by itself" (each with a one-line reason, e.g. "Paid by bKash",
  "Trusted customer"). Unfinished orders from the previous batch shown on top tagged "From last batch". New batch starts
  by itself when the courier has picked up the last parcel; manual "Close batch" too.
- 7 statuses, final names: New → To confirm → Confirmed → Packed → With courier → Delivered → Paid. All orders has
  these as filter chips.
- Auto-confirm rules (Rules › Order flow, defaults editable): prepaid full → auto; only delivery charge prepaid → auto;
  trusted old customer (all delivered) → auto; new to shop but good courier score → auto; brand-new no history anywhere
  → call list; refused ≥1 before → call list (or auto if paid delivery charge in advance at checkout); big COD (amount
  in Rules) → call list even if trusted; suspicious/duplicate → red tag, a person decides; nothing ever auto-blocked.
- Courier score /10 from 6 courier-history metrics (success rate, total parcels, total returns, worst courier rate,
  number of couriers with record, fraud reports by other shops), each scored 0–10 by owner bands, weighted → total /10;
  ≥ upper → auto confirm, middle → call list, < lower → red tag + one-click "Ask delivery charge in advance". One score
  only (merged into the existing risk score). AI gives a one-line opinion next to it. Shown to staff only.
- Stock is held only when an order is confirmed. Out of stock at confirm → "No stock" stuck list; staff calls (wait /
  swap / send rest / cancel); after the Rules wait time the rest ships. Released by itself when ERP stock arrives.
- On confirm: SMS 2 + WhatsApp invoice image; ERP books the pieces; booking with the ONE default courier happens by
  itself; order goes to To pack. One courier for all parcels (default set in Rules; zone routing kept as off switch).
- To pack: one button "Print all" → (1) today's summary line (orders and pieces counted separately, categories,
  shortages, problem orders listed apart), (2) picking list PDF by category → style → colour → size, most pieces
  first, tick boxes, EXTAS letterhead, (3) stickers in the same order. Only orders not yet with the courier. No
  packing slip. Printing the sticker IS the shop's last step → status Packed. No scan at handover.
- With courier starts only when the courier's own report says it entered the parcel. Day-end check: "Packed today 10,
  entered at courier 9" → list of the missing parcel(s); also a cancelled order that the courier entered.
- Order page: customer card on top (name big; phone, address, email each on its own line with call/copy/map; grade
  badge), score panel big "6.5/10" coloured + 6 small bars + AI line; product lines with photo, colour dot and size
  badge clearly in focus; previous orders list of this customer, each expanding in place; lifetime figures (orders,
  pieces, MRP value, discount received, delivered value, collected, returns, exchanges, average order, profit
  owner-only); "Send message" choose SMS / WhatsApp / Email with templates; per-order Profit block.
- Customer 360 (opens in a NEW WINDOW by default; button to open in right panel instead): lifetime figures above, all
  orders expandable, favourite categories and usual sizes ("Polo always L"), source, Inbox conversations, wallet and
  points, coupons used, reviews, incomplete orders, staff notes, grade/priority, score.
- Returns & exchanges tabs inside the page: Exchange requests · Partial deliveries · Coming back · Handed back ·
  Waiting ERP check · Approved · Declined (our loss). Refused at the door, partial at the door and post-delivery
  exchange are separate paths. Partial delivery box (kept pieces, amount paid, phone discount, phone-confirmed, note)
  required; partial counts as delivered and shown separately; "Send right size" creates a linked order. Customer
  exchange request (within 72h of delivered, size/defect only) shows countdown, tier options (same product other size →
  other colour → same category → other category), money box (higher price → difference COD; lower → leftover to
  WALLET after the old piece passes the check; exchange charge unless shop's fault). No cash refunds after delivery.
  The shop does NOT grade pieces: staff count pieces + note at hand-back; owner approves/declines in the ERP within 7
  days (setting 7/10/15). Old piece must return within 4 days. Reminders: request waiting, partial box empty, 4-day
  old-piece clock, 7-day ERP check, short count → courier claim today, courier says Delivered but money missing.
- "Abandoned checkouts" renamed "Incomplete orders"; button "Remind all (19)" with hint "not messaged yet"; max two
  messages per person ever.
- Fraud checks tab removed (merged into batch "Stuck" and order score panel).

## Products (NAV tabs: all, add, stock, ranking, combos, sets, reviews, sizecharts)
- All products unchanged, plus a "Draft" / "Scheduled" filter showing what each draft still needs. "Ready to publish"
  tab removed.
- "Quick import" = small popup on All products (style codes → drafts).
- Add product = 8-step wizard exactly like ../flow/add-product.html: Pick from ERP (list of ERP styles not on shop) →
  Name & category (category-specific details) → Colours & sizes (ERP stock grid, read only, B-grade outlet switch) →
  Photos & video (4 slots per colour, alt text auto) → Price (buying price ERP owner-only, selling, compare-at, profit,
  use in combos, PIN) → Description & size chart (size chart: ERP's → pick saved → "+ Create new" XS–4XL with
  category measurement points; size finder table height/weight per size; Fit; Sizes run; model optional) → Google &
  link (slug, title, description, focus keyword, preview, SEO score) → Check & publish (Publish now / Schedule / Save
  draft). Autosave, progress, live phone preview on the right at every step. Step 1 also offers "Single product" or
  "Set".
- Combos tab: build manually (pick pairs) or Auto-generate all combinations; pair types: same style colours, style +
  style, category + category, product + product; 2 or 3 pieces; per-combo price or rule price; was-price = sum of
  separate prices; pauses when a colour sells out; dates; archive not delete.
- Sets tab: product type Set = top + bottom (ERP SKUs) with colour link, one price, separate sizes per piece.
- Reviews & questions: questions come from "Ask a question" on the product page; answer & publish. Negative reviews
  can never be deleted (Bangladesh guideline) — only spam/abuse hidden with a reason. Product FAQs: per product (Add
  product step 6), per category (auto-attached), shop-wide (Website › Policies/FAQ); one click "Make this an FAQ".
- Size charts: cards by category with a measuring picture and "used by N products", + New size chart per category,
  duplicate, set as category default, in/cm, size finder, Save at top and bottom, unsaved warning, customer preview.
- Shop ranking as now (explain clearly at the top).

## Customers / Inbox
- Customers as now + 360 opening rule above; priority grades by lifetime spend and delivered parcels with a discount
  offer per grade (Rules).
- Inbox: add Instagram as a channel; side panel shows everything known (name, photo, phone if shared, all channels
  merged by phone, orders, score, live order, grade); phone typed in chat is captured and scanned.

## Rules (NAV tabs: all, coupons) — redesign exactly like ../flow/rules-redesign.html
- One page: search, left group nav (Delivery, Payment & COD, Order flow, Exchange, Customers, Discounts, Messages),
  status strip (rules still using sample values, scheduled changes, last change), each rule one plain sentence + pill
  (On / Off / Sample / From date) + Edit → right-side editor with simple fields, "Customer sees", "What changes"
  (before/after + effect on last 30 days), Save (PIN for money), More options (start on a date, try on last month,
  history, back to default). Every rule's default = the decisions above.
- New rule groups: Order flow (auto-confirm table, courier score metrics/bands/weights/limits with a worked example,
  holds & out of stock, courier default + batch), Customer priority (grades + offers), COD with two limits (call above
  / pay online above), Advance payment, Exchange (72h, size/defect, charge, lower price → wallet).
- Auto-cancel after unanswered calls: switch, off by default. Fraud levels Low/Normal/Strict only as presets that fill
  the Order flow table.

## Marketing (NAV tabs: overview, campaigns, messages, audiences, calendar, plan, tools) — like ../flow/marketing.html
- All figures on delivered orders; profit after ads; verdict Scale ≥4 / Keep ≥2.5 / Fix ≥1.5 / Stop per ৳1 (Rules).
  Period switch everywhere. Campaign table all platforms (FB, IG, Google Search/Shopping/PMax, YouTube, TikTok);
  campaign page: platform-claimed vs our orders vs delivered, ads with thumbnails and fatigue, daily chart, districts,
  products, funnel, AI note, Pause / Duplicate / Change budget (owner OK + PIN). Message campaigns WhatsApp / SMS /
  Email / Messenger with opted-in audience, approved template, schedule, throttle, cost estimate, results. Audiences
  (segments, sync, refused-parcel exclusion). Calendar. Plan & ideas (budget plan, where to spend by district,
  creative ideas, competitor watch, AI proposals awaiting OK). Tools = ad accounts, landing pages, referral, Shopping
  feed (existing screens).

## Website (NAV tabs: layout, text, policies, blog, analytics, seo)
- Policies: each page starts with 3–4 "at a glance" boxes, then section cards with icons and short points, details
  folded; numbers pulled from Rules; English + বাংলা; trade licence and UBID shown; last updated + history. Pages:
  Terms, Privacy, Delivery, Exchange, Payment & COD, Cancellation & Refund, Wallet & coupons, Reviews, Cookies.
- Blog: WordPress-like editor (left post nav; block editor incl. Product, Combo, FAQ blocks; right panels Publish,
  Categories, Tags, Featured image, Excerpt, Author, SEO panel like Yoast with score/checklist/readability/internal
  link suggestions/schema; autosave; preview; AI help).
- Analytics (new): Overview (visitors, live now, sources, top pages, devices, districts, visit→order, 30-day chart, AI
  summary), Search (Search Console + Bing: impressions, clicks, CTR, position, queries ▲▼), Behaviour (own tracking:
  click heatmap, scroll depth, rage taps, funnels, checkout field drop-off, no-result searches, WhatsApp taps by page,
  size chart / colour opens → purchase), Speed (Core Web Vitals by page type). Reports' "Visitors & funnel" moves here.
- Shop text: every storefront text (buttons, messages, checkout, invoice, SMS/WhatsApp/email, header/footer,
  announcement) searchable by page, EN + BN, preview; nothing hardcoded.

## Reports
- "Areas" becomes the full Area report: division → district → thana → area drill-down with a map-like view; period
  incl. 6 months/custom; per area orders, pieces, product value, delivered, returned, return rate, collected, profit,
  average order; by area → top products, by product/category → top areas; 2–3 insight lines on top.
- Remove "Visitors & funnel" (now Website › Analytics). Reports stay business-only.

## Round 2 decisions (13 Nov, 00:56) — owner approved, build them
- NO refunds and NO wallet option for defects. Defective / wrong item (also when prepaid): the customer sends it back and
  the shop sends the RIGHT product again (replacement), free. Size issues stay "exchange within 72h" as before. Never
  mention law/legal requirements anywhere in the admin text.
- Stock: keep the blueprint rule — a short hold while the customer is in checkout (minutes, setting), the hold converts
  when the order is placed and lasts N hours (setting) until the order is confirmed; on confirm the ERP holds it. While
  held, the site shows the size as sold out so a single last piece cannot be ordered by 3–4 people; if not confirmed in
  N hours the hold is released and the size shows again.
- Add (owner said "add all your suggestions"): AI Center as its own menu (approvals queue, 7 agents, costs & caps,
  AI-off fallback); Marketing › Studio (photoshoot, video, social posts); score accuracy report in Rules › Order flow
  (flagged orders → what happened, suggested band changes); Bulk & corporate orders (quote, agreed price, advance +
  balance, company invoice, delivery in batches); rider overcharge → return the extra to the customer's wallet;
  message log (status, cost, retries), quiet hours, per-order caps, WhatsApp utility vs marketing templates with
  per-message cost, SMS transactional vs promotional senders with send windows; checkout & payment settings
  (prepaid reward, gift mode, advance-payment mode); Home "Do now" shows customer problems and the nightly page check;
  stuck-parcel alert (no movement in N hours); "money we would save with per-area courier routing" monthly line;
  barcode scan to count pieces at hand-back; quick replies are archived not deleted; courier score shows each
  metric's source and age, missing data = "unknown" → call list (never red); bKash advance by payment link that
  confirms the order by itself; ads get delivered-order conversions; packer role sees no phone/address; call desk
  (click to call, attempt log with outcomes, retry schedule, per staff); Eid / peak mode (daily capacity cap, cut-off
  dates change delivery promise texts, Print all in parts, roster); courier fallback switch + claims ledger (lost,
  damaged, short COD with deadline and recovered money); Facebook/Instagram comments in Inbox (hide phone numbers or
  abuse, comment → message auto-reply) and live-selling order capture; influencers & affiliates (personal code,
  commission on delivered orders, payout ledger in Finance); staff limits (discount limit per role, export permission,
  end-of-day cash/bKash handover); urgent approvals on Telegram with PIN.
- Demo products (approved): sample products fill every category / sub-category / sub-sub-category on the live site;
  Settings › Demo products: one master switch + per-category switches with counts (demo vs real) + optional auto-hide
  when a category reaches N real products; Add product's last step asks "Hide demo products in <category>?". On the
  site a demo product is browsable; tapping Add to bag / Order now (before any address) shows a pop-up "This design
  is coming soon — see what's available in this category" with links. Demo products never go to Google (noindex, no
  sitemap, no Shopping/Facebook feeds, no ads) and are excluded from stock, reports, finance and the ERP. Use generic
  names, not real brand names.

## Round 3 — Orders workflow rework (13 Nov, owner's plan; NOT yet applied to the prototype — apply all Orders items together after Incomplete orders is settled)
- Statuses now: New → (auto, only up to Confirmed) Confirmed | Processing. "To confirm" is REMOVED, replaced by Processing.
  Processing = orders that failed the Rules; owner opens each, then Approve (→ Confirmed), Cancel (reason) or Ask for advance.
  Processing keeps filter chips (not tabs): No stock, No answer, Suspicious, Merge needed, Advance asked.
- Then: Confirmed → Booked (one click, courier API, default courier; optional other courier) → Packed (= sticker printed) →
  Handed over (courier pickup report) → Delivered → Paid; plus Returned and Cancelled. "Booked" name is OK (owner).
- Courier entry is by API, one click for many orders (owner confirmed). Print stickers only after Booked (courier barcode on sticker).
- Print once by default: a second print needs the owner PIN, every print is logged (who, when, why). Reprint uses the stored
  consignment, never a second booking. One order = one booking. Cancel after Booked -> tell the courier (auto if API) or warn.
- Packed = sticker printed (owner's decision, no barcode scan at packing). Day-end check (packed vs handed over) catches gaps.
- Batch: no clock time anywhere. Current batch = every order not yet handed to the courier (older leftovers included; blueprint B1.4
  has no cut-off). When the courier takes parcels, a Past batch is made (date-time, parcels, COD total, taken vs missing); click opens it.
  Batch page has two tabs: Current / Past. Owner rejected these extras: "Pickup expected at", "Rush one-click", "Rider is here".
- Advance request: "Ask for advance" sends SMS AND WhatsApp (channel choice); order gets an "Advance asked" tag inside Processing;
  "Advance received" (one click) → Confirmed; also usable when the owner asked by phone. Suggest: payment link that auto-confirms;
  reminder hours in Rules.
- Merge: button right on the Processing "Merge needed" row; after merge the owner can edit the merged order: remove a line, cancel one
  order, change colour/size, add a product, then Confirm. Merge + call. Rules: look-back window (default 5 days), auto-merge switch (off),
  no merge after Packed, different addresses → ask.
- Price adjust on every order (also while on the phone): ৳ amount, % off, use wallet balance, free delivery; reason required, logged,
  per-role limit in Rules › Staff limits, above the limit → owner approval (Telegram works).
- Courier live status: after Handed over every order shows both its own step and the courier status (Picked up, In transit, At hub,
  Out for delivery, Attempt failed, Delivered, Returning). Click → side panel with the courier's full history, tracking no., rider phone,
  COD amount, attempts, notes. List column + filter; auto refresh; stuck-parcel alert. Depends on what the courier API returns.
- Date filters everywhere (All orders, Returns, Cancelled, Incomplete): Today, Yesterday, 7 days, This month, Last month, Custom (from–to).
  Returns and Cancelled show counts, money, reason split, stage cancelled at, who; Excel/PDF download.
- Online-payment reward is just an Offer made in the Offers section (free delivery, % off, flat ৳ off, points, wallet credit, ...).
- With courier tab (owner): every order row is clickable → order page with the courier's full tracking history (per order, from the courier API);
  the courier status itself opens a side panel. Keeps: day-end check, claims ledger, backup-courier switch, stuck-parcel alert.
- Courier messages (owner wants to SET them): Rules › Courier messages — for each event (booking note, delivery instruction such as "call before
  delivery" / "trial at door allowed", COD amount line, re-attempt request, hold request, cancel request, return pick-up request, claim message)
  an editable text with placeholders; plus a one-off note field on the order that goes with the booking.
- Claims + money with couriers: ONE claims ledger (Orders › With courier); Finance reads it — "Courier claims to receive" (open amount) and
  recovered money posts to the courier's account. Today the prototype has two separate lists (Orders claims, Finance "courier lines not matching"
  with a Claim button) → merge them. Courier COD owed, statement match and settlements stay in Finance › Cash.
- Returns / exchange: keep as built (blueprint way for partial delivery: Fill the box → hand back → ERP check). Add date filters (see above).
- Incomplete orders (approved):
  · date filters; list grouped by day, NEWEST FIRST (owner works from the top one by one).
  · name → Customer 360 (new window): items with size/colour, where they stopped, all past orders of this phone, courier score, earlier attempts.
  · actions: Call (outcome log like call desk), Confirm as order (address form on the call, stock held, tag "Recovered by phone" + who),
    Send message SMS/WhatsApp by template or custom (templates: Forgot something?, Size help?, Delivery charge question?, an Offer from Offers).
  · known customer chip ("4 orders, score 9/10"). Auto reminders keep max 2; owner's own messages unlimited with a warning.
  · a person who places ANY order afterwards (same phone/email) leaves the Open list automatically, no reminder, shown only under "Ordered later".
  · contact capture (owner insists every incomplete order needs a phone / WhatsApp / email): phone-first checkout with proper autofill attributes so
    the browser fills name, phone, email in one tap; cart saved the moment the number is typed (before Next); "Save my bag / send to WhatsApp"
    box on the bag; phone-OTP or Google one-tap sign-in (customer's choice); leaving-checkout prompt "We'll hold your size N hours — your
    WhatsApp number?" (ties to the stock-hold hours); carts with no contact are kept as "No contact" for funnel report and retargeting audiences.
    NOT built: silently reading browser-saved data the customer never typed or submitted (decided with the owner's note; alternatives above).
- CORRECTION (supersedes the "contact capture" bullet above; owner, 13 Nov 03:10): the 5 extra checkout ideas (phone-first change, Save-my-bag box,
  OTP/Google sign-in, leaving-checkout popup, extra No-contact work) are NOT to be added — checkout pages stay as the blueprint has them.
  Incomplete orders follow blueprint C6.3 (draft saved as typed, browser id + phone, stages cart → phone → address → payment → left, follow-up ladder
  1 h / 24 h offer / max 2 messages, EXTAS AI loop, templates still run with AI off) and C6.4 (autofill capture: on the visitor's FIRST click in any
  checkout field, read the values the browser filled into the VISIBLE form — name, phone, email, address — and save the draft; whatever the visitor
  then types replaces the autofilled value; done in the background). Owner adds: a small notice for a moment ("Your details are saved so we can help
  you finish"), not blocking. A visitor who touches nothing: only cart + browser id → on-site follow-up and ad retargeting; if the browser id belongs to a
  known customer we already have their phone → incomplete order under that person. No invisible/off-screen fields; no reading before any interaction.
  Admin list/flow decisions above (newest first, Customer 360, call/confirm/message, auto-remove after a later order) stay.
- Owner 13 Nov 03:17 (Incomplete orders, final): (1) visitors who touch nothing = NOT in the Incomplete list; only a count ("N left without a number") + report +
  ad audiences + on-site retargeting from our system. (2) NO notice/pop-up when details are saved (the earlier 2.5–3 s notice is removed).
  (3) capture on the first interaction with the form: values typed, or filled by the browser into the visible fields, are saved as a draft in the
  background; typed values replace autofilled ones; stage recorded. Every device/browser, as much as the browser exposes.
  NOT agreed (decided, told to the owner): filling invisible/off-screen fields to pull saved details the customer never saw (e.g. clicking only
  the name box and reading phone, email, address too). Instead: proper autocomplete names on all visible checkout fields so one tap on the
  browser's suggestion fills everything, and the draft is saved the moment those values land.
- Owner 13 Nov 03:20 (Incomplete orders closed): capture = blueprint C6.3–C6.5 as written (see correction above).
  · Known customers: a visitor whose first-party browser id/device (or login) has ordered before who leaves midway → attach their stored details
    (name, phone, email, address) to the incomplete order automatically, so they can be contacted. IP alone is only a weak "maybe" match
    (shared networks) and is never auto-attached; shown with a "possible match" tag.
  · Incomplete orders report (workflow/journey view, with a sample on the prototype): where visitors land → each checkout step (cart, phone,
    address, delivery, payment) → where they leave; drop-off % per step; by landing page / product / campaign / device; how many came back and
    ordered, how many recovered by call or message; "left without a number" count. Summary at the top, step-by-step flow picture below.

## Round 3 — Products (13 Nov): rest of Products is OK as is; only the "Photos & video" step of Add product changes
- Photos: easier adding (drag many at once, paste, pick from ERP/library, reorder, set main, colour tag per photo). Every photo is optimised automatically
  whatever is uploaded: blueprint image pipeline (5 sizes × AVIF/WebP/JPEG, 4:5 ratio, quality setting default 78, targets < 40 KB category / < 150 KB product
  big image, dominant colour, original archived, full-resolution file only on zoom). Wrong ratio → auto-crop with a preview the owner can nudge.
- Quality indicator (AI, simple): each photo gets "Looks good" or a short reason (too small, blurry, too dark, wrong ratio, cut off) with a one-click fix when possible.
  Shows final size in KB and the saving ("2.4 MB → 96 KB").
- Video, two ways: (1) upload a file → auto-compressed (MP4 H.264, sensible bitrate, poster frame made, size shown); (2) paste a link (YouTube, Vimeo, Facebook)
  → shown on the product page as a clean embedded frame in the site's own style (poster + play button first, player loads on tap = fast), so it looks like the
  site's own video. Honest limit: YouTube/Facebook keep their own small logo inside the player once playing; Vimeo is the cleanest.
- SEO always on for photos and video: alt text suggested by AI from the product, file names from the product, VideoObject schema (thumbnail, duration,
  description) per blueprint C4.4, video sitemap entry, lazy loading, no layout shift (fixed ratio). All sizes/quality numbers are settings, not hard-coded.

## Round 3 — Couriers section, payouts, pop-ups hub, Offers 360 (owner, 13 Nov 03:30–03:36)
- New left-menu section **Couriers** (Overview, Courier 360, Claims, Setup). Courier 360 also stays in Finance (tab "Couriers"), Reports (tab "Couriers") and Orders (Courier tab). Nothing dropped.
- **"Ask for payment" removed.** Money from a courier is requested through the courier's own payout/payment-request feature (via API where the courier offers it). The request status (Requested → Processing → Paid / Rejected) comes back automatically and is shown inside Courier 360; Paid marks the covered orders as settled.
- Courier API research in proto/courier-research.md (thin where public docs are limited).
- Pop-ups & notices: one hub in Rules (every pop-up in one place: where it shows, on/off, text, small picture of the place).
- Offers & Discounts 360 (Rules › Offers & discounts): wizard like the others; includes the online-payment reward.
- Profit snapshot (Today / This week / This month) on Finance Overview and Home, clickable to P&L.
- Admin map opens as an in-page window (new window is blocked in the sandbox); real site opens it in a new window.
