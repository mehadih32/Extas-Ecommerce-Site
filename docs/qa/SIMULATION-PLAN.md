# SIMULATION-PLAN — the 50-order real-life journey simulation

*Version 1 · 20 Oct 2026 · change note CN-013 (owner Note 55: think beyond the ask) · go-live gate.*
*Research behind it: `SIM-RESEARCH.md` (same folder). Facts quoted as N1–N37 refer to that file's table.*

---

## সংক্ষেপে (মালিকের জন্য)

- **কী:** একজন কাস্টমার "আমার একটা পোলো লাগবে" ভাবা থেকে ডেলিভারির ৩ দিন পর পর্যন্ত পুরো রাস্তাটা আমরা ৫০টা নকল অর্ডার দিয়ে হেঁটে দেখব। সব ঘটনা লিখে রাখব।
- **কারা:** নতুন কাস্টমার, পুরনো কাস্টমার, ঢাকার বাইরে, গিফট, কর্পোরেট বাল্ক, ফেক/প্র্যাংক, রাগী কাস্টমার, বয়স্ক মানুষ, শুধু বাংলা জানা, স্লো ৩জি নেট, কার্টে রেখে চলে যাওয়া — সব রকম।
- **কী কী ঝামেলা:** ভুল ফোন নম্বর, ভুল ঠিকানা, ডাবল অর্ডার, দরজায় দরদাম, রাইডারের বাড়তি টাকা চাওয়া, ট্রাই করে ফেরত, আংশিক রাখা, পার্সেল হারানো/নষ্ট, ঈদের চাপ, সাইজ এক্সচেঞ্জ, রং/কোয়ালিটি নিয়ে অভিযোগ। ৫০টার মধ্যে ৪০টায় ঝামেলা আছে।
- **প্রতিটা সমস্যায় আমরা দেব:** সমাধান, যেন আবার না হয় তার ব্যবস্থা, ধাপটার মূল সিদ্ধান্ত ঠিক আছে কি না, আর বেশি বিক্রি / কম রিটার্ন / কম ফ্রড / কম খরচের আইডিয়া।
- **টাকা, দাম, COD বা কাউকে ব্লক করা** নিয়ে যেকোনো আইডিয়া শুধু প্রস্তাব — আপনি হ্যাঁ বললে তবেই।
- **কোথায় চলবে:** এখন ডেমোতে, পরে new.extas.com.bd-তে আসল অর্ডার নেওয়ার আগে আরেকবার। রিপোর্ট আসবে সহজ বাংলায়।

---

## 0. How to use this file (read first, every session)

This plan is self-contained. A session that has never seen the conversation that produced it can run it.

1. Read, in this order: this file → `SIM-RESEARCH.md` → `SIM-PROGRESS.md` (if it exists, it holds the exact resume point)
   → the repo's `CLAUDE.md`, `docs/agents/lessons/ALL.md`, and the register lines named in §2 for the checkpoint you are on.
2. Repository: `/home/claude/extas-ecommerce-site` (register `docs/MASTER-REGISTER.md`, blueprint `docs/BLUEPRINT.md`).
   Demo source: `/tmp/claude-0/-home-claude/a27f8d4d-b57b-5d41-b919-c637e74e7368/scratchpad/proto` (`src/`, `tools/build.sh`,
   `PROTO_API.md`). If the scratchpad is gone, the approved demo source is in the repo at `docs/demo/src/` with the
   built file `docs/demo/EXTAS-demo-V12.1.html`; build from a copy of `docs/demo/src/` the same way.
3. The run writes three files in `/home/claude/blueprint/qa/`: `SIM-PROGRESS.md` (checkpoint), `SIMULATION-REPORT.md`
   (findings and results), and the Bengali owner summary at the top of the report. CN-013 names the repo copies
   `docs/qa/SIMULATION-PLAN.md` and `docs/qa/SIM-RESEARCH.md`: when the plan or research changes, copy them there in a
   `Status:` commit.
4. Never stop for permission except the hard-rule items (money, prices, COD changes, blocking, deleting data,
   anything irreversible). Those become **proposals for the owner** in the report and in `BLOCKED.md`.
5. The machine has little RAM: **one browser, one page at a time**, closed between batches. No parallel browsers.

**Owner rules that shape this simulation (do not "fix" them, test them):**
- No customer is ever blocked automatically; the system may hold, warn, ask for an advance or propose a block. A human
  decides (register PR 520, 523, 540).
- No order is ever held over an address (PR 563). A wrong delivery charge loses the order (PR 549–553).
- Trial at the door is allowed (setting, on). If the customer returns it at the door, he pays only the delivery charge
  to the rider (blueprint B1.17).
- Exchange is for **size**, within the window set in Smart Rules (demo default 72 h), free if the mistake is ours; no
  returns after receipt (PR 185–190).
- Messages: SMS when the order is placed, SMS when the shop confirms/books the courier, WhatsApp once when the shop
  processes; **nothing from the shop after that** — later messages exist as switches, off by default (register, owner
  answers 19 Oct). Any post-delivery message in this plan is therefore tested **with its switch on and off**, and
  switching it on by default is a proposal.
- Support is WhatsApp **text**; no call buttons on the site. Staff may still phone customers for confirmation.
- Nothing hard-coded: every number in this plan (charges, windows, thresholds) is read from settings. Owner data is not
  a blocker: missing values ship empty/off.

---

## 1. Scope

**50 orders, all categories, 11 personas, about 20 simulated days** (D1–D10 normal, D11–D14 Eid peak, D15–D20 post-Eid
and the 3-day after-delivery windows).

| Code | Persona | Traits the tester must play | Orders (primary persona; combined ones counted again) |
|---|---|---|---:|
| FT | First-timer | Never bought from EXTAS; checks trust signals; unsure of size; prefers COD | 14 |
| RP | Repeat customer | Logged in or known phone; saved size; wallet credit; expects speed | 8 |
| OD | Outside Dhaka | District town or village; longer delivery; higher charge; patchy network | 9 (plus gift and other orders shipped outside Dhaka) |
| GF | Gift buyer | Pays from one place, ships to another person; wants a date; may hide price | 3 |
| BK | Bulk / corporate | 25–40 pieces, logo, invoice, advance payment; needs a human quote | 2 |
| FR | Fraudster / prank | Fake name, friend's number, repeat refuser, orders from several pages | 4 |
| AN | Angry customer | Late parcel, faded colour, wrong item; threatens a public Facebook post | 3 |
| EL | Elderly, not tech-savvy | Large text, Bengali digits, gives up on long forms, wants a human | 2 (12, 31) |
| BN | Bengali-only | Switches to বাংলা; types Bengali address and digits; reads Bengali SMS | 3 (13, 31, 44) |
| 3G | Slow network | Throttled "Slow 3G" profile; timeouts; double taps | 3 (06, 34, 45) |
| AB | Abandons and returns | Leaves at checkout/payment; comes back later from a message or link | 2 |

Categories covered: polos, T-shirts, shirts, panjabi, trousers/chinos, denim, hoodies, joggers and sets, socks and
belts, combos (Polo Duo, Office Trio, Polo + Chino, hoodie-jogger set) and Build-your-own sets.

Payment mix (final method): COD 40 · bKash 6 · Nagad 1 · card 2 · bank advance 1 — 80% COD, a little below the national
86.8% (N1) on purpose, so the prepaid paths are exercised; order 43 switches from bKash to COD.

Couriers (mocked in the demo): Steadfast, Pathao, RedX, assigned by the courier-choice rule (PR 178).

---

## 2. Journey checkpoints

Each order is walked through every checkpoint that applies. **Pass** = all bullets in the pass column hold, on
phone (390 px) and desktop (1366 px), in English and বাংলা where the persona uses it.

| CP | Checkpoint | What to test | Pass looks like | Register | Demo route |
|---|---|---|---|---|---|
| CP01 | **Need** | The occasion that triggers the order (Eid, office, winter, worn-out); is there content or a reminder that meets the need (blog, seasonal page, repeat reminder)? | A customer with that need can reach a relevant page in ≤2 taps from the ad/search/message; the seasonal page exists for the occasion | 246, 530, 591, 289 | `#/journal`, `#/` |
| CP02 | **Discovery** | Ad → landing; Google → category/product; WhatsApp/word-of-mouth link; Messenger "price?" comment | Correct page opens with the advertised offer and price; tracking event fires with the source; no "inbox for price" anywhere | 254–258, 338, 426, 432 | `#/l/polo-duo`, `#/c/polos`, `#/search` |
| CP03 | **Landing** | First screen on phone: price, offer, COD, delivery charge/time promise, exchange line, reviews, WhatsApp | All visible without scrolling more than one screen; LCP within the PR 10/234 budget on Slow 3G; no layout jump | 40–88, 234, 602 | `#/l/...`, `#/p/...` |
| CP04 | **Browse, filter, search** | Category filters (size, colour, price), search with Banglish ("polo shart", "panjabi"), out-of-stock sizes | Results are right; out-of-stock sizes visibly marked; zero-result search offers alternatives; back keeps scroll | 61–75, 72, 527 | `#/c/polos`, `#/search` |
| CP05 | **Product page: size help and trust** | Find My Size (height/weight), fit notes, model's size chip, true-colour view, fabric/GSM, reviews with buyers' height/weight, delivery charge and promise, trial-at-door and exchange text | Recommended size shown with the reason; colour named in words; trial and exchange lines read from Smart Rules; nothing hard-coded | 58–59, 65, 225, B1.17 | `#/p/essential-pique-polo`, `#/size-guide` |
| CP06 | **Bag and offers** | Combo/set pricing, tier offers, free-delivery progress, two-sizes notice, coupon, wallet, multi-size line | Same total in drawer, bag, summary, checkout, order, invoice and sticker (lesson K11); offer words match price rule | 105–114, 212–213, 271, 109 | `#/bag`, `#/combo/...`, `#/set` |
| CP07 | **Checkout: address, phone, payment** | Phone in every format (lesson list); Bengali digits; address collision; sub-area band; payment choice; advance-payment mode for flagged customers; double tap on Confirm | Phone cleaned and said back; band settled silently by district/postcode; charge never from free text; one order only; flagged customer sees one neutral line, never a score | 115–125, 549–563, 555, 559–560 | `#/checkout` |
| CP08 | **Confirmation by SMS and WhatsApp** | Messages sent per the owner's rule; content (order no., items, total, COD amount, delivery promise, tracking link, how to change/cancel); Bengali template | Exactly the configured messages, no double send; amounts match the order; template editable | 148–149, 505, 291–292 | `#/thanks/<id>`, `#/admin/comms` |
| CP09 | **Confirmation call and fraud check** | Risk score and section on arrival; courier success ratio; identity graph; duplicate rules; call queue; advance request; new-customer queue | Every order sorted instantly with a reason; nothing auto-blocked; genuine order never trapped; one-click advance request works; outcome recorded | 156–163, 519–524, 540–545, 559, 562, 567 | `#/admin/orders` |
| CP10 | **Packing** (invoice and sticker, 5–6 items) | Picking list sorted; pack check; invoice lists every line; sticker shows COD amount, item list, weight; edited order reprints | Every line on invoice and sticker; COD on sticker = amount due; reprint safe; held item does not block the rest without a team decision | 179–183, 407, 409 | `#/admin/fulfilment` |
| CP11 | **Courier handover** | Booking per courier, zone ids, handover sheet, declared value, weight slab | Booking succeeds for every area; handover sheet count = parcels; declared value = real value | 175–178, 180, 554 | `#/admin/couriers` |
| CP12 | **Tracking** | Customer tracking page vs courier status; delay beyond promise; "where is my order" chat | Status matches the courier within the sync interval; a late parcel is flagged to staff before the customer asks | 135, 184, 192 | `#/order/<id>`, `#/account` |
| CP13 | **Door delivery** | Try-on, negotiation, partial acceptance, refusal, extra money asked, not reachable, charge-only collection | Each outcome recorded with the right money and stock effect; partial acceptance needs our approval (Steadfast, N16) and recomputes the set price; "charge-paid return" not counted as delivered | 166, 185, 191, 525–526, B1.17 | `#/admin/orders`, `#/admin/couriers` |
| CP14 | **COD settlement** | Expected cash vs courier statement; delivery charge, 1% COD charge, return charges; timing | Every order matched or listed as a mismatch with a reason; settlement days per courier measured | 165–166, 174, 525 | `#/admin/finance` |
| CP15 | **Day 1–3 after delivery** | Review request, exchange request, complaint, quality issue, angry customer, auto-reply and handover to a human | Auto-reply answers from live rules within a minute; human handover with full context; exchange self-service inside the window; complaint resolved or escalated with SLA | 186, 295, 425–436, 505 | `#/account`, `#/exchange/<id>`, `#/admin/support`, `#/admin/reviews` |
| CP16 | **Return/exchange logistics** | Pickup with the new item, QC as good / B-grade / damaged, restock or damaged bin, wallet difference | Stock moves to the right location; money box per exchange tier correct; B-grade has its own state | 185–190, 187, 201 | `#/admin/exchanges`, `#/admin/stock` |
| CP17 | **Repeat purchase** | Saved size, reorder, loyalty, referral, product-life reminder, win-back | Returning customer reaches a paid order in fewer taps than a first-timer; reminders honour consent | 131, 273, 289, 296, 300 | `#/account`, `#/login?demo=1` |

---

## 3. The event list — 50 orders

Columns: **Day** (simulated) · **Persona** · **Area / band** (Dhaka City · Sub-area · Outside) · **Source** · **Items**
· **Pay** · **Courier** · **Planned events** · **Cx** = has a real-life complication · **Focus CPs**.

Product ids are the demo's (`src/01-data.js`). Coupon codes: `VIP15`, `BDAY200` exist in the demo; `EID` must be created
in Smart Rules before order 44.

| # | Day | Persona | Area / band | Source | Items | Pay | Courier | Planned events | Cx | Focus |
|---|---|---|---|---|---|---|---|---|---|---|
| 01 | D1 | FT | Mirpur 10 · City | FB ad → `#/l/polo-duo` | Polo Duo (2× M) | COD | Steadfast | Baseline happy path: SMS + WhatsApp, call answered, delivered in 24 h, review request on D+2 (switch on/off) | – | all |
| 02 | D1 | FT | Dhanmondi · City | Google "polo shirt price bd" | textured-knit-polo L | bKash | Pathao | Prepaid baseline: callback, no confirmation call needed (check rule), paid badge on sticker (COD ৳0) | – | 07, 08, 10 |
| 03 | D1 | FT | Uttara · City | IG ad → PDP | essential-pique-polo M **and** L (unsure) | COD | Steadfast | Two-sizes notice and follow-up (PR 110/146); customer ignores it; at the door keeps L, returns M → **partial acceptance**: our approval, M back to stock, collect only L + charge | ✓ | 05, 06, 13, 16 |
| 04 | D2 | RP | Mohammadpur · City | WhatsApp link from a friend | everyday-crew-tee ×3 on one line (S, M, L for family) | COD | Pathao | Logged in, saved size pre-selects, wallet ৳100 applied, multi-size line | – | 06, 17 |
| 05 | D2 | OD | Agrabad, Chattogram · Outside | FB ad | office-skus set (Oxford shirt + slim chino) | COD | RedX | Outside charge correct, promise in hours (48–72), delivered day 3 | – | 07, 12 |
| 06 | D2 | OD + 3G | Village near Kurigram bazar · Outside | FB ad on Slow 3G | classic-cotton-panjabi XL | COD | Steadfast | Page weight on Slow 3G; address "bazar er pashe, Kurigram" → address-unclear queue (PR 563), order still confirms; rider cannot find house, calls; delivered day 6 (beyond promise) | ✓ | 03, 07, 09, 12, 13 |
| 07 | D3 | FR | Gulshan 2 · City | Direct | heavyweight-hoodie ×2 | COD | – | Name "Test Bhai"; courier history 5/5 cancelled across couriers → flagged; advance (delivery charge) requested in checkout → abandons; flag-outcome report counts it; **no block** | ✓ | 07, 09 |
| 08 | D3 | FR (prank) | Badda · City | FB ad | polo-chino combo | COD | – | Friend's number; call: "I didn't order" → cancel before packing with reason; identity graph notes the device; no block, no message spam to the victim | ✓ | 09 |
| 09 | D3 | GF | Pays in Dhanmondi, ships to Zindabazar, Sylhet · Outside | Direct | classic-cotton-panjabi L (for father) | bKash | Pathao | Different receiver name/phone; gift note; **price hidden on the invoice?** (does the option exist); receiver unreachable once, delivered on 2nd attempt; sender gets the delivered notice | ✓ | 07, 10, 12 |
| 10 | D4 | BK | Tejgaon office · City | Google "corporate polo bd" | 40 polos with logo, 4 sizes | Advance (bank) | – | Bulk enquiry page (blueprint B8.5 #4), not the cart; human quote; quantity cap in cart if he tries; handover to owner; no auto price | ✓ | 02, 06, 15 |
| 11 | D4 | AN | Mirpur 2 · City | Repeat | heavy-cotton-tee black XL | COD | Steadfast | Delivered; D+1 "colour faded after the first wash", angry WhatsApp + public FB comment; AI first reply, then human with context; quality replacement free; returned item QC = B-grade | ✓ | 15, 16 |
| 12 | D4 | EL | Lalbagh, Old Dhaka · City | Son's WhatsApp link | classic-cotton-panjabi XXL | COD | Pathao | Large text; types phone "০১৭১২ ৩৪৫ ৬৭৮"; gives up on address; uses "send my bag on WhatsApp"; agent creates the order from chat (PR 430) with the channel tag | ✓ | 05, 07, 15 |
| 13 | D5 | BN | Fatullah, Narayanganj · Sub-area | FB ad in Bengali | Polo Duo | COD | Steadfast | Whole journey in বাংলা; Bengali address "ফতুল্লা, নারায়ণগঞ্জ" → sub-area band silently; Bengali SMS; every visible string translated | – | 03–08 |
| 14 | D5 | AB | Savar · Sub-area | IG | linen-blend-shirt + leather-look-belt | COD | RedX | Fills phone and name, leaves; incomplete-order capture (PR 274); one follow-up next day only with consent (PR 275); returns via the link, draft restored (PR 137), places | ✓ | 07, 08 |
| 15 | D5 | FT | Tongi, Gazipur · Sub-area | FB | jersey-zip-polo + cotton-socks-3 | COD | Pathao | Tries `VIP15` (not eligible) → clear reason and the better-offer explanation (PR 112) | ✓ | 06 |
| 16 | D6 | RP | Uttara · City | Repeat | hoodie-jogger set | Nagad | Steadfast | Nagad fails once (mock failure), retries, succeeds → exactly one order, one payment (PR 125, 170) | ✓ | 07, 14 |
| 17 | D6 | OD | Rajshahi city · Outside | FB | 2 polos + slim-chino | COD | RedX | **Wrong phone** (one digit off, valid format): SMS goes to a stranger, call fails; customer writes on WhatsApp from his real number asking for status → identity merge, phone corrected with a log, order proceeds | ✓ | 07–09 |
| 18 | D6 | FT | Mohammadpur · City | FB | contrast-collar-polo M | COD | – | **Duplicate**: double tap on Confirm, then reorders 10 min later thinking it failed → submit guard + duplicate rule; cancellation notice with tracking link (PR 546) | ✓ | 07, 09 |
| 19 | D7 | OD | Masterpara, Gabtali, Bogura · Outside | FB | relaxed-twill-trousers 34 | COD | Pathao | Address collision Gabtali (Bogura) vs Gabtoli (Dhaka) → settled by district silently; charge correct; courier zone id correct | ✓ | 07, 11 |
| 20 | D7 | FT | Dhanmondi · City | IG | striped-rib-polo L | COD | – | Cancels on WhatsApp 2 h after ordering, before packing → reason code, stock released, no courier booking, no charge | ✓ | 09, 15 |
| 21 | D7 | RP | Gulshan 1 · City | Repeat | 6 items: 2 polos, 2 tees, slim-chino, belt | Card | Steadfast | **Packing 5–6 items**: picking list, invoice lists all 6, sticker item list does not truncate silently, weight >1 kg changes the courier charge (shop cost only) | ✓ | 10, 11 |
| 22 | D8 | FT | Khulna · Outside | FB | long-sleeve-polo XL | COD | RedX | **Try-on at the door**: too tight → returns at the door, pays delivery charge only (B1.17); shop then offers XXL re-ship; customer accepts → second order linked to the first | ✓ | 13, 15 |
| 23 | D8 | OD | Cox's Bazar · Outside | FB | Polo Duo | COD | Steadfast | **Negotiation at the door**: asks rider for ৳100 off; rider calls the shop; policy says no bargaining; customer pays full; the call and outcome logged | ✓ | 13 |
| 24 | D8 | FT | Mirpur 11 · City | FB | heavyweight-hoodie L | COD | Pathao | **Rider asks ৳50 extra**; customer reports on WhatsApp; logged against courier/rider; goodwill credit = **owner proposal** | ✓ | 13, 15 |
| 25 | D9 | OD | Sylhet · Outside | FB | oxford-cotton-shirt + slim-chino | COD | RedX | **Courier loses the parcel** (in transit 9 days); staff alerted before the customer; claim with declared value; re-ship decision; customer informed | ✓ | 11, 12, 14 |
| 26 | D9 | RP | Badda · City | Repeat | polo-chino combo | bKash | Steadfast | **Damaged parcel** (torn mailer, stain); customer sends photo on D+0; free replacement; courier claim (up to 50% of declared value, N16); damaged item to the damaged bin | ✓ | 13, 15, 16 |
| 27 | D9 | FT | Mymensingh · Outside | FB | 2 everyday-crew-tee | COD | Pathao | Phone off on delivery day; rider marks "not available" twice → RTO; RTO cost recorded; was any delivery-day reminder sent (switch)? | ✓ | 12, 13, 14 |
| 28 | D10 | AN | Chattogram · Outside | FB | jersey-zip-polo | COD | RedX | Delivered 6 days late vs 48–72 h promise; tracking page said "with courier" for 4 days; customer threatens a Facebook post; goodwill credit = owner proposal | ✓ | 12, 15 |
| 29 | D10 | FT | Uttara · City | IG | pocket-tee M | COD | Steadfast | Smooth; D+2 photo review → reward per setting; moderation queue; review appears with verified-buyer mark | – | 15, 17 |
| 30 | D10 | GF | Pays in Gulshan, ships to Rangpur · Outside | Direct | hoodie set | bKash | Pathao | Wants delivery **on a date** (birthday); what do we promise and where is it recorded? | ✓ | 07, 12 |
| 31 | D10 | BN + EL | Cumilla · Outside | Messenger | classic-cotton-panjabi + slim-chino | COD | RedX | Asks size on Messenger "উচ্চতা ৫ ফুট ৬, ওজন ৬৫" → answer from Find My Size; agent builds the order in chat | – | 05, 15 |
| 32 | D10 | FT | Dhanmondi · City | FB | textured-knit-polo M | COD | Steadfast | D+1 size exchange to L from My account (PR 186); new item out and old item picked in one trip; QC good → restock | ✓ | 15, 16 |
| 33 | D10 | RP | Mohammadpur · City | Repeat | slim-chino 32 | COD | Pathao | Exchange asked on D+4 (window passed) → polite, rule-based answer; alternative offered within the rules | ✓ | 15 |
| 34 | D10 | 3G | Barishal · Outside | FB on Slow 3G | Polo Duo | COD | Steadfast | Heavy pages, lazy images, a dropped connection at Confirm → no lost or doubled order | ✓ | 03, 07 |
| 35 | D10 | FR | Mirpur 1 · City | Direct | heavyweight-hoodie ×3 | COD | – | Same name and address, **new phone number**, 3 earlier refusals → identity graph match → hold + advance request; block only proposed | ✓ | 09 |
| 36 | D11 | FT | Mohakhali · City | Eid ad | classic-cotton-panjabi ×2 | COD | Pathao | **Eid peak.** Cut-off banner; "before Eid" promise for Dhaka; delivered in time | – | 03, 12 |
| 37 | D11 | OD | Dinajpur · Outside | Eid ad | classic-cotton-panjabi M | COD | RedX | Ordered **after the outside-Dhaka cut-off** → site says honestly it may arrive after Eid; customer orders; arrives 2 days after Eid → refusal risk measured | ✓ | 03, 07, 12, 13 |
| 38 | D11 | GF | Pays in Dhaka, ships to Khulna (father) · Outside | Eid ad | classic-cotton-panjabi XL | bKash | Steadfast | Prepaid Eid gift; courier peak delay; sender and receiver both informed | ✓ | 12 |
| 39 | D12 | RP | Gazipur · Sub-area | Eid ad | panjabi ×2 (sizes for sons) + polo | COD | Pathao | One size **oversold** at peak → resolution card at packing (PR 183), never auto-cancelled; rest ships per the team's decision (blueprint B1.15 #2 still open) | ✓ | 10, 15 |
| 40 | D12 | BK | Narayanganj factory · Sub-area | Direct | 25 panjabis for staff Eid gift | bKash advance | – | Bulk at peak: enquiry, human quote, advance, stock reservation, split delivery | ✓ | 06, 10 |
| 41 | D12 | FT | Sylhet · Outside | Eid ad | classic-cotton-panjabi L | COD | RedX | Call queue backlog (simulate 100 orders/day): time to confirm; WhatsApp self-confirm (if built) vs call | ✓ | 09 |
| 42 | D13 | FR | Shyamoli · City | Eid ad | 4 panjabis | COD | Steadfast | Orders from several pages; refuses at the door "already bought elsewhere" → RTO; learning loop records it; refused-parcel exclusion list for ads (PR 264) | ✓ | 09, 13 |
| 43 | D13 | AB | Chattogram · Outside | Eid ad | classic-cotton-panjabi M | bKash → COD | RedX | bKash fails, leaves; comes back from the follow-up, switches to COD; exactly one order | ✓ | 07, 08 |
| 44 | D13 | BN | Rajshahi · Outside | Eid ad (Bengali) | panjabi + belt | COD | Pathao | Coupon `EID` from Smart Rules; same total on bag, checkout, SMS, invoice, sticker (K11) | ✓ | 06, 08, 10 |
| 45 | D14 | OD + 3G | Rangpur → village for Eid · Outside | Eid ad | classic-cotton-panjabi L | COD | Steadfast | **Address change after the courier is booked**; courier charges a resend/zone change (N16); who pays, what the customer is told | ✓ | 07, 11, 12 |
| 46 | D16 | RP | Uttara · City | Repeat reminder (switch on) | everyday-crew-tee ×3 | COD | Pathao | Came from a product-life reminder; attribution recorded; points earned | – | 17 |
| 47 | D16 | AN | Dhanmondi · City | Repeat | linen-blend-shirt white M | Card | Steadfast | **Wrong item packed** (blue sent); "not as ordered" → free exchange; packing proof (if any) checked; root cause logged | ✓ | 10, 15, 16 |
| 48 | D17 | OD | Khulna · Outside | FB | hoodie-jogger set | COD | RedX | **Partial on a set**: keeps hoodie, refuses jogger → what is the price of one piece of a discounted set? what does the rider collect? | ✓ | 06, 13, 14 |
| 49 | D17 | FT | Savar · Sub-area | Google | slim-chino 30 + belt | COD | Pathao | "Add to this parcel" (socks) before packing (PR 127) → COD on sticker and invoice updated; customer notified once | ✓ | 06, 10 |
| 50 | D18 | RP (VIP) | Gulshan 2 · City | Repeat | Office Trio | COD | Steadfast | All fine; D+3 asks for an invoice copy; leaves a review; shares a referral code → friend's first order | – | 15, 17 |

**Complications: 40 of 50 (80%).** Covered: multi-item and set orders (01, 03, 05, 21, 39, 44, 48, 50), coupons and offers
(15, 44, combos), cancellations before packing (08, 20), address mistakes (06, 19, 45), wrong phone (17), duplicates and double-submit risk
(16, 18, 34, 43), Eid peak (36–45), lost parcel (25), damaged parcel (26), door events (03, 22, 23, 24, 27, 42, 48).

**Load note for D11–D14.** For order 41 and the Eid block, also run the order list and fulfilment screens with
the demo's bulk/sample orders loaded (`#/admin/bulk`), so the screens are judged at peak volume, not with 5 rows.

---

## 4. Six review angles (apply to every finding)

| Angle | The question to answer |
|---|---|
| **Technical** | What broke or could break (data, state, idempotency, race, performance, settings)? Is there a test that would have caught it? |
| **Customer** | How did it feel? Time, effort, clarity, trust, language. Would he order again or post publicly? |
| **Employee** (support, packer, accounts) | How many clicks, calls and decisions did it cost the team? Is the next action obvious? Can a new hire do it? |
| **CEO** (Gyani's view: growth and risk) | What does it do to delivered revenue, RTO, cost per delivered order, repeat rate, brand risk? |
| **Owner** | Does it follow his standing rules (no auto-block, nothing hard-coded, money needs his OK)? What decision, if any, does he need to make? |
| **Supplier** (factories, courier, payment partner) | Does it create a cost or a claim with the courier or a factory? Is the data there to negotiate (courier performance, defect rate per factory/style)? |

---

## 5. The finding template

Copy one block per finding into `SIMULATION-REPORT.md`.

```
### SIM-F-<nnn> · <short title>
- Order / checkpoint: SIM-<order #> · CP<nn>
- What happened: <facts, steps to reproduce, screen/route, viewport, language>
- Severity: Urgent | Important | Can wait
- Fix: <what to change, where (file/route/setting), owner agent>
- Prevention: <test / guard / setting that stops it coming back; name the gate (device gate, journey test, checklist line)>
- Core-decision review: <is this step designed right? keep / change / proposal for the owner, and why>
- Growth idea: <sales, retention, fraud or cost impact; rough size if the research gives one>
- Six angles: Technical … · Customer … · Employee … · CEO … · Owner … · Supplier …
- Register: PR <n> (existing) | dated scope on PR <n> | next free PR + CN-### (proposal)
- Status: open | fixed in demo (<build file>) | proposal for owner | demo gap (not built yet, register PR <n>)
```

**Severity rules.**
- **Urgent** — a genuine order is lost, trapped or doubled; a wrong charge or amount is shown or collected; money or
  stock figures become wrong; personal data leaks; a hard rule is broken.
- **Important** — the customer or employee can finish, but with confusion, extra steps, a likely refusal or a support
  ticket; a cost leak the system cannot see.
- **Can wait** — polish, wording, a nice-to-have, a growth idea with no current harm.

**"Demo gap" vs "bug".** The demo is a front-end prototype. When a checkpoint needs something only the server build has
(courier API, real SMS, settlement), record it as a **demo gap** with the register PR that builds it and write the
**acceptance test** the real build must pass. That list becomes the staging-run script (§8.4).

---

## 6. Back-office checks (run after D10, after D14 and at the end)

### 6.1 Stock and ERP reconciliation
- For every SKU touched: `opening − reserved/sold + RTO returned + exchange returned (QC good) − damaged/B-grade moves = closing`.
- Every order produced exactly one ERP document push (PR 199–200); no duplicate stock movement after retries (orders 16, 18, 43).
- Partial acceptance (03, 48) and wrong-item (47) show the right movements; oversold size (39) shows the reservation
  failure and the fix.
- Pass: zero unexplained variance; every variance has a reason code.

### 6.2 Accounts: the simulation P&L
Build a P&L for the 50 orders (sample values from settings; where a value is missing, mark it "owner value pending",
never invent it):

| Line | Source |
|---|---|
| Gross sales (ordered) | orders |
| − cancelled before dispatch | 08, 20 … |
| **Delivered revenue** (only delivered and paid) | courier outcomes |
| − discounts, coupons, wallet used | PR 112, 122, 271 |
| − COGS (CM + fabric + trims from the ERP costing) | ERP |
| − courier delivery charges paid (incl. RTO forward legs) | courier statement |
| − COD charge (1% where it applies, N16/N17) | courier statement |
| − return / resend / exchange charges | 22, 32, 45, 47 |
| − **RTO losses** (forward charge + packaging + handling + damage share + wasted ad cost) | §6.3 model in SIM-RESEARCH §5 |
| − packaging per parcel | settings |
| − ad spend (allocated by campaign and by delivered order) | PR 265–267 |
| − staff salaries and fixed expenses (allocated per order for the period) | `#/admin/expenses`, S16 |
| − payment gateway fees (bKash/Nagad/card) | PR 174 |
| − goodwill credits (proposals only until the owner approves) | 24, 28 |
| **= Contribution and net per delivered order** | |

Pass: every figure traceable to an order; delivered revenue ≠ ordered revenue is visible; cost per delivered order
shown (PR 267).

### 6.3 COD reconciliation against the courier
- Expected cash per order = COD due − delivery charge − COD charge (per courier terms).
- Courier statement (mock) includes deliberate traps: a charge-paid return marked "Delivered" (PR 525), a partial
  delivery, a missing order, a double deduction, a late settlement.
- Pass: every trap caught and listed; days-to-settle per courier measured; cash in transit shown as a total.

### 6.4 Support inbox metrics
First response time, resolution time, AI-answered vs human-handed-over, reopen rate, complaints by reason (size,
colour, quality, late, wrong item, rider behaviour), and the public-post risk list (AN orders). Pass: every
conversation linked to its order and customer (PR 427–428); SLA timers running (PR 431).

### 6.5 Fraud review queue
Flagged orders, the reason, the action (watch / hold / call / advance / COD off), outcome (paid advance, abandoned,
delivered, refused). True and false positives. Pass: no genuine order trapped; no automatic block anywhere;
flag-outcome report (PR 562) produces the number that tunes the threshold.

---

## 7. Beyond the ask — 24 ideas to make EXTAS easier, smarter and more profitable

Status column: **In register** (existing PR) · **Partly** (needs a dated scope on an existing PR) · **New** (next free PR
number with a CN note). **Owner** = touches money, prices, COD or blocking → presented only as a proposal (hard rule 6).
Impact and effort are rough: H/M/L.

| # | Idea | Why (evidence) | Impact | Effort | Status / placement | Owner |
|---|---|---|---|---|---|---|
| 1 | **Prepaid nudge** — a small bKash/Nagad discount or free delivery for prepaid, shown in the payment campaign slot | Prepaid RTO near zero; 15–20% pick bKash when offered (N7, N11, N33); an RTO costs ≈৳250–700 | H | L | **Partly** — payment campaign slot (blueprint B8.5 #3) + PR 120, 213; dated scope "prepaid incentive rule" on PR 213 | Owner (price) |
| 2 | **Smart COD advance for risky orders only** (delivery charge or full) | Deposits cut RTO 40–50% (N9); advance delivery charge gave one shop "nil" fakes (N28) | H | — | **In register** — PR 161, 560, 542, 562 | Owner (COD) — thresholds |
| 3 | **Size-confidence tool** — Find My Size plus "people your height and weight kept size L" from delivered/exchanged orders | >50% of apparel returns are fit (N30) | H | M | **Partly** — PR 58–59, 328; dated scope on PR 59: learn from exchange outcomes | – |
| 4 | **Try-on as a selling point** — "Try it in front of the rider; return it and pay only delivery" on PDP, landing and checkout | Distrust drives COD insistence (N25); policy already approved (B1.17) | M | L | **In register** — B1.17 text; check the line appears on landing pages (PR 254–255) | – |
| 5 | **WhatsApp self-confirm button** — "Reply 1 to confirm, 2 to change, 3 to cancel" on the processing message; unanswered goes to the call queue | Calls cut RTO 15–25% (N10); 21 of 24 RTO points are indecision/unreachable (N6); saves staff calls at Eid | H | M | **New scope** on PR 148 + 292 + 545 (confirm-by-reply feeding the queue) | – |
| 6 | **Courier success-ratio check** | Standard BD practice (N29) | H | — | **In register** — PR 559, 567 | – |
| 7 | **Smart courier choice by area** — by cost *and* by measured success rate and speed per district | Couriers differ by area; performance data exists (PR 192) | M | M | **Partly** — PR 178 is cost only; dated scope: weight success/speed from PR 192 | – |
| 8 | **RTO-cost dashboard** — RTO count × real cost per RTO, by district, campaign, product, courier, reason | One RTO ≈৳250–700 (SIM-RESEARCH §5); owner sees the leak in taka | H | M | **Partly** — PR 164, 192, 267; propose **next free PR (S16)** "RTO cost book" + CN | – |
| 9 | **Delivery-day reminder** — morning message "Your parcel arrives today; keep ৳X ready; you may try it on" | Cuts "customer unavailable" 30–40% (N34) | H | L | **Partly** — later-step message switch exists (PR 148/505, off by default) | Owner (switch default) |
| 10 | **Exact-amount line against extra charges** — "Pay exactly ৳1,580. The rider may not ask for more" on SMS, sticker and tracking page, with a WhatsApp report link | Door overcharging and negotiation (CP13; [K]) | M | L | **New scope** on PR 179 (sticker) + PR 148 + PR 135 | – |
| 11 | **Rider-issue log** — customer reports (extra money, rude, fake "not available") linked to courier and area; feeds courier choice and claims | Courier accountability is weak (N27) | M | L | **New scope** on PR 192 + 431 | – |
| 12 | **Partial-delivery rules** — courier "Partially Delivered" handled end to end: our approval, set-price split rule, stock return, money | Recognised by Steadfast/Paperfly with charges (N16, N17) | H | M | **New scope** on PR 166 + 184 + 212 (set split price) | Owner (set split price rule) |
| 13 | **Packing proof** — a photo of the packed items with the order barcode at pack time | "Not as ordered" is 50.7% of complaints (N4); settles disputes and wrong-item claims | H | L | **New scope** on PR 182 (fulfilment page) | – |
| 14 | **Declared value on every booking + claim workflow** for lost/damaged parcels | Steadfast pays up to 50% of declared value (N16); lost = negotiated | M | L | **New scope** on PR 176 + 192 | – |
| 15 | **Post-delivery WhatsApp care (Day 1)** — "Did the size fit? Exchange in 2 taps" + care tips; then the review request on Day 3 | Catches problems before a public post (N25); drives reviews (N36) | H | L | **Partly** — PR 295, 289, 505; switch exists, off by default | Owner (switch default) |
| 16 | **Review-with-photo reward** (wallet points) and verified height/weight/size on reviews | 5+ reviews → 270% (N36); photo reviews feed the size tool | H | L | **In register** — PR 65, 295, 296 (`reviews.photoReward` setting) | Owner (reward amount) |
| 17 | **Size-exchange self-service with swap-at-door** — new size goes out and the old one comes back in the same trip | Exchange costs +50% of a delivery (N17); one trip halves it | H | M | **Partly** — PR 185–188, 190; dated scope on PR 190: one-trip swap | Owner (exchange charge) |
| 18 | **Repeat-purchase reminder by product life** (tees 6–9 months, polos 9–12, panjabi before each Eid) | Repeat buyers cost no ad money (research §2.12) | M | L | **New scope** on PR 289 + 300 (product-life trigger) | – |
| 19 | **Eid pre-order and order-by dates per district** — "Order by 24 Mar for Khulna to arrive before Eid", pre-order with advance | Eid = 35–40% of sales (N22); late Eid parcels are refused | H | M | **Partly** — PR 173, 193, 214, 281; dated scope on PR 193: per-band cut-off dates | Owner (advance for pre-order) |
| 20 | **Instant COD settlement option** (courier instant-pay products as a payout source) and a cash-in-transit card | Settlement 2–10 days (N13); InstaPay instant (N14) | M | L | **New scope** on PR 166 + 174 | Owner (money flow) |
| 21 | **Bulk/corporate lane** — enquiry form → quote by the owner → advance → split delivery; logo add-on | Owner already runs buying-house orders; Eid staff gifts | M | M | **In register** — blueprint B8.5 #4 (bulk enquiry page); scope: quote and advance steps | Owner (prices) |
| 22 | **Gift mode** — receiver name/phone, hide prices on invoice, gift note, "deliver on or after" date | Gift is common at Eid; receiver ≠ payer causes unreachable calls | M | L | **New** — next free PR in S04 + CN | – |
| 23 | **Wallet cashback instead of a discount** for prepaid or reviews — money stays in EXTAS for the next order | Converts a cost into repeat purchase | M | L | **Partly** — PR 171, 296; scope on PR 296 | Owner (amounts) |
| 24 | **Colour-truth pack** — true-colour photo under standard light, colour named in words, "how it looks indoors/outdoors", fade/shrink notes from QC | Colour and quality are the top complaints (N4, N26) | H | M | **Partly** — B8.5 "True colour" view, `DB.colorNotes`, S24 photoshoot; dated scope on PR 225 | – |

**Ideas the simulation must not implement on its own:** 1, 2, 9 (default), 12 (split price), 15 (default), 16, 17,
19, 20, 21, 23 — they go to `BLOCKED.md` as short Bengali questions and into the report's "Proposals for the owner"
section. Everything else is filed by the next session through the register-first rule (hard rule 8: dated scope or next
free PR number, plus a CN note) before any build.

---

## 8. How to run it

### 8.1 Setup (demo)
```bash
cd /tmp/claude-0/-home-claude/a27f8d4d-b57b-5d41-b919-c637e74e7368/scratchpad/proto
tools/build.sh dist/sim.html          # one self-contained HTML file
```
- Open `dist/sim.html?demo=1` in **one** browser (Playwright: one `chromium.launch()`, one context, one page; close it
  at the end of each batch). For the phone pass use a 390×844 touch context; for desktop 1366×900 — sequentially,
  never both at once.
- Demo controls (`?demo=1`): reset all demo data before order 01 and **not again** (state must accumulate like a real
  shop); the Eid cutoff banner switch is turned on at D11 and off after D14; returning customer login
  01712345678 / 01712345678; `advanceOrder` moves an order confirmed → packed → shipped → delivered.
- Slow 3G: Chrome DevTools network throttling "Slow 3G" (or Playwright CDP `Network.emulateNetworkConditions`,
  download ≈400 kbps, latency ≈400 ms) for orders 06, 34, 45.
- Things the demo cannot do (courier, SMS, door events, settlement): play them as **event cards** — write what the
  courier/customer did, then check that the admin screen that would record it exists and shows the right effect
  (`#/admin/orders`, `#/admin/couriers`, `#/admin/fulfilment`, `#/admin/exchanges`, `#/admin/stock`,
  `#/admin/finance`, `#/admin/expenses`, `#/admin/support`, `#/admin/comms`, `#/admin/reviews`). If it does not exist,
  log a **demo gap** with the register PR and the acceptance test.

### 8.2 Batches and checkpoints
Run in batches of 5 orders (10 batches). After **every order**, update `SIM-PROGRESS.md`; after every batch, append the
findings to `SIMULATION-REPORT.md`. After batches 2, 3 and 10, run the back-office checks (§6). A crash, usage limit or
new session resumes from `SIM-PROGRESS.md` with no rework.

`SIM-PROGRESS.md` format:
```
# SIM-PROGRESS
Build: dist/sim.html · built <date time> · source hash <sha1 of src/*.js concatenated>
Simulated day: D<n> · Eid banner: on/off
Resume at: order <#>, checkpoint CP<nn>, step "<last thing done>"
Findings so far: <n> (Urgent <a> · Important <b> · Can wait <c>) · last ID SIM-F-<nnn>

| # | Persona | Status (todo/doing/done/blocked) | CPs done | Findings | Note |
|---|---|---|---|---|---|
| 01 | FT | done | 01–17 | F-001, F-002 | |
...
```
If the source hash differs from the last run (the demo was rebuilt), re-check the open findings of finished orders
before continuing, and note it.

### 8.3 Output
`/home/claude/blueprint/qa/SIMULATION-REPORT.md`:
1. **মালিকের জন্য সারাংশ** (top, simple চলতি Bengali, Western digits, 10–15 lines): what was tested, how many problems
   (জরুরি / জরুরি না হলেও দরকারি / পরে করলেও চলবে), what was fixed, what needs his decision (short questions), and one
   line "আসল অর্ডার নেওয়ার জন্য তৈরি: হ্যাঁ / না, কারণ …".
2. Scorecard: 50 orders × 17 checkpoints (pass / fail / gap / n.a.).
3. Findings (template §5), sorted Urgent → Can wait.
4. Back-office results (§6) with the P&L table and reconciliation traps caught.
5. Proposals for the owner (money, prices, COD, blocking, default switches) — each with the expected effect.
6. Demo gaps → the staging acceptance list.
7. Ideas filed in the register (PR numbers / CN notes).
8. Lessons added (§9).
Also show the Bengali summary in the chat and write it as `docs/reports/YYYY-MM-DD-simulation.md` in the repo (CLAUDE.md
"How to report").

### 8.4 The staging run (new.extas.com.bd) — the go-live gate
Run the same 50 orders again on new.extas.com.bd once the shop flows exist there (S04–S08 merged), before real orders
and before the S19 go-live checklist (PR 585–587) is signed.
- The site is password-protected and `noindex`; integrations run on **mock or sandbox** (couriers, SMS, WhatsApp,
  bKash/Nagad sandbox). Never message a real customer; never book a real parcel without the owner's OK.
- Use sample customers and test phone numbers only; tag every simulation order `SIM` (source = simulation).
- Clean-up never deletes: simulation orders are cancelled with reason "simulation", stock is restored by reversing
  movements, wallet credits are reversed (hard rule 3; the ERP's reverse-never-delete rule).
- Replace every demo gap from 8.1 with its acceptance test; a gap that still fails on staging is **Urgent** for go-live.
- Add the measurements the demo cannot give: real page speed from Dhaka on 4G (PR 234), message delivery times,
  courier booking success per area, settlement days.

---

## 9. Lessons to skills

After each batch, every lesson that would stop a class of problem is written as one line and appended to the repo's
`docs/agents/lessons/ALL.md` in its existing format — a dash, the rule in plain words, then the source in brackets:

```
- <the rule, one or two sentences, imperative>. (SIM-<order #> / SIM-F-<nnn>, <date>)
```

Also append it to the owning agent's file (`docs/agents/lessons/<agent>.md`): checkout, PDP, COD and offers →
**sawdagor**; stock, fulfilment, courier, exchange → **bhandari**; fraud, rules, support, finance, AI → **gyani**;
messages, CRM, content → **doot**; ads and delivered-purchase signals → **tirondaj**; design and phone layout →
**shilpi**; QA gates, security, monitoring → **prohori**.

**Proposed new skills** (written as `docs/agents/skills/<agent>/NN-<slug>.md`, added to `skills/INDEX.md`, and
imported to the Skill Library through PR 321–323 with the sandbox test and approval gate PR 420):

| Skill | Agent | What it teaches |
|---|---|---|
| `07-door-outcomes.md` | bhandari | Every door outcome (try-on return, partial, refusal, charge-only, not available, negotiation) with its stock, money and courier-charge effect and the courier terms behind it |
| `08-cod-reconciliation.md` | bhandari / gyani | Matching courier statements to orders; the trap list from §6.3 |
| `07-commitment-before-dispatch.md` | sawdagor | Confirmation, self-confirm, delivery-day reminders and prepaid nudges as RTO tools, with the evidence |
| `10-post-delivery-care.md` | doot | Day 1–3 message design under the owner's message rule and consent; review timing; angry-customer de-escalation scripts in Bengali |
| `simulation-runner` | prohori | How to run this plan: build, one browser, event cards, checkpoint file, demo gap vs bug, staging acceptance |
| `rto-cost-model` | gyani | The per-RTO cost model and how to fill it from real data |

A lesson becomes a skill only after it has prevented a repeat in a later batch or run (the skill's own exam case).

---

## 10. Done criteria

The simulation is done when: all 50 orders have every applicable checkpoint marked; every Urgent finding is fixed in
the demo (or, if it needs the server, has an acceptance test on the staging list); every Important finding has a fix
or a filed register item; the back-office checks pass or list their variances; proposals are in `BLOCKED.md` with
Bengali questions; lessons are appended; and the Bengali summary has been shown to the owner. On staging, the same
plus: zero Urgent findings open before go-live.
