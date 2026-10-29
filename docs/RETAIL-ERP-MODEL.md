# EXTAS — Retail and the ERP: the supplier model and the two ledgers (CN-028)

**Owner decision of 25 October 2026.** The ERP's contract is `docs/erp/site-changes-v6.md` (the ERP project's file; the
v5 it replaced is `docs/erp/site-changes-v5.md`). This document is the shop's side: what Retail does with it, how
Retail's own books are kept, and how the shop's ledger and the ERP's ledger are made to agree every day, week, month,
year and for the whole life of the shop. It controls the shop's ERP work from the switch date. Where it disagrees with
`docs/ERP-API-CONTRACT.md` (CN-005) or with §7.9 and D1/D4 of `docs/BACKEND-ARCHITECTURE.md`, this document wins; those
texts stay as history (struck through where they are quoted).

## বাংলায় সংক্ষেপে

- **মডেল:** ERP একজন আলাদা সরবরাহকারী। Extas Retail তার একজন বিশেষ পাইকারি ক্রেতা, কেনে ERP-র "দোকানের দামে" (shopPrice)। ERP শুধু হিসাব রাখে: কী কী পিস দিল, কোনগুলো ফেরত নিল, কত টাকা পেল, কত বাকি। রিটেল নিজের লাভ-লসের হিসাব নিজে রাখে, আর ঠিক সংখ্যা ERP-কে পাঠায়।
- **দুই লেজার:** (১) "ERP খাতা": রিটেল ERP-কে কত দেবে, প্রতিটা বিল, ক্রেডিট আর পেমেন্ট ধরে; (২) "লাভ-লসের খাতা": রিটেলের বিক্রি, খরচ, ক্ষতি, বিজ্ঞাপন। দুটো একটা সূত্রে বাঁধা, তাই একটা ভুল হলে অন্যটা ধরিয়ে দেয়।
- **মেলানো:** প্রতি রাতে দিনের হিসাব ERP-র সাথে মেলে। সপ্তাহ, মাস, বছর আর আজীবন সেই দিনের হিসাব থেকেই জোড়া লাগে। কোনো গরমিল থাকলে দোকান নিজে সংখ্যা বদলায় না। হারানো ঘটনা ERP থেকে টেনে আনে, না পেলে অ্যাকাউন্টস PIN দিয়ে সংশোধন লেখে।
- **রিফান্ড নেই।** ডেলিভারির পর একটাই পথ: 72 ঘণ্টার মধ্যে এক্সচেঞ্জ। নতুন পিসের দাম বাড়লে ফারাক কাস্টমার দেয়।
- **সুইচের দিন (Q5 = ক):** পুরোনো ডেলিভারি হওয়া, COD-বাকি অর্ডারের বাকি কেনা-দামে রিটেলে সরবে। সুইচের পর সব হিসাবে একটাই দাম: কেনা দাম।

---

## 1. The model and the owner's answers

To the ERP, Extas Retail is a **separate buyer** (special wholesale, can buy one piece). The ERP keeps only: which pieces it
gave, which it took back, what it was paid, what is still owed. Retail keeps its **own profit and loss** and sends the ERP
its own correct figures (daily summary, fixed costs). The ERP is treated as an independent third-party supplier; the
fact that the owner owns both never changes a rule.

| Question (ERP file v6) | Owner's answer, 25 Oct 2026 |
|---|---|
| Q1 When is Retail billed? | When the parcel leaves (the shipment is recorded), at the shop price fixed when the order was placed. A cancelled order that never left is never billed. **Yes.** |
| Q2 Exchange new piece refused by the customer, damaged or lost on return | Billed to Retail at its shop price (Retail's loss). **Yes.** |
| Q3 Account hold | New orders refused when Retail owes money and **30 days** pass with no payment (not 90). Warn the admin **from day 15**. |
| Q4 Owner's check of returned pieces | A setting of **7, 10 or 15 days** from the courier's hand-back date (the ERP keeps it; the shop shows the countdown). Default 7. |
| Q5 Old delivered orders with the customer's money still unpaid at the switch date | **(ক) One rule after the switch: the buying (shop) price for everything.** The open amount moves to Retail at the buying price, not at the customer's price. |
| Q6 Old-order pieces coming back after the switch | Closed. The exchange window is 72 hours, so only orders delivered in the last three days before the switch can be exchanged. The ERP prices every piece it gives at the price of that day. |
| Q7 What the ERP sends about money | Only `shopPrice`. Never `retailPrice` or `avgCost`. **Yes.** |
| Q8 Exchange orders during an account hold | Accepted (not a new sale). **Yes.** |
| Refunds after delivery | **None.** The only way back is an exchange within 72 hours of the courier's "delivered". |
| Price of an exchange piece changed in new ERP stock | The ERP gives the piece at the price of that day and charges Retail the difference. **Retail passes the difference to the customer**, so the exchange terms say so (§6). |
| Retail's costs and the ERP | All of Retail's costs reach the ERP as figures the shop works out itself (daily summary and monthly fixed costs). The shop adds no books that the ERP does not ask for (CN-028; the shop builds the ledgers in §3 only). |

## 2. What each side keeps

| | ERP | Retail (the shop) |
|---|---|---|
| Stock, SKUs, buying price (`shopPrice`) | master | mirror, never overwritten |
| Selling price, discounts, coupons, combos | never | master (the ERP only keeps `customerPrice` for reports) |
| Customer, address, payments of customers, COD, couriers | order copy only | master |
| What Retail owes the ERP | master (its ledger) | mirror (the "ERP account", §3.1) |
| Returns decisions (approve/decline) | **master** (the owner decides in the ERP) | mirror, read-only |
| Exchange money | master | mirror |
| Profit and loss of Retail | shows it from the figures the shop sends | master |
| Delivery charge, exchange charge, courier cost, ads, packaging, fees, salary, rent | never | master; reaches the ERP only as summary figures |

## 3. The two ledgers

### 3.1 The ERP account (what Retail owes the ERP)

An append-only list of entries, one per ERP event, never edited, never deleted. Business date = the **ERP event's own date**
(Asia/Dhaka), never the day the message arrived.

| Entry kind | Source event | Effect on the balance Retail owes |
|---|---|---|
| `BILL` | order billed when the shipment is recorded (`erpTotal`, `billedAt`) | + |
| `EXCHANGE_EXTRA` / `EXCHANGE_ADJUSTMENT` | `exchange.settled` (`EXTRA` / `ADJUSTMENT`) | + / − |
| `EXCHANGE_BILL` | `exchange.billed` | + |
| `EXCHANGE_CREDIT` | `exchange.credited` | − |
| `RETURN_CREDIT` | `return.piece.decided` `APPROVED` and `APPROVED_AT_PACKING` (`credit`) | − |
| `PAYMENT` | `payment.recorded` (ERP Accounts team) | − |
| `SWITCH_TRANSFER` | the one-time moving of old open amounts at the switch date, at the buying price | + |
| `REVERSAL` | any event with `reverses`: the original is cancelled by a new opposite entry dated when it happened | ∓ |
| `ADJUSTMENT` | a shop correction written by Accounts with PIN and a reason (§3.4), always paired with the ERP's matching entry | ∓ |

`DECLINED` pieces and exchange refusals that need no money move create **no** entry (their loss is in the P&L ledger).
Each entry keeps: store, `eventId` (unique **forever**, not 72 hours), kind, business date, whole-taka signed amount, the
references (order, line, return list, consignment, exchange, payment), source (webhook, pull, manual), `reverses`, a
hash of the previous entry (a chain that shows any change).

**Balance** = sum of all entries. It must equal the ERP's `closingBalance` for the same date. Two numbers sit beside the
balance and are **not** in it: `waitingCheck` (returned pieces not yet checked) and `exchangesAtRisk` (new exchange pieces
not yet billed).

Payments made by Retail to the ERP are recorded in two places on purpose: the ERP Accounts team records money received
(`payment.recorded`); the owner or Accounts also records "paid to ERP" in the shop's money screens (it is Retail's cash going
out). The two are **matched** (amount, date within 2 days, reference). An unmatched payment on either side is a difference
(§4). Only the Accounts role and the owner can record it (`accounts.payments.record` rule).

### 3.2 The pipeline stock (Retail's goods in transit, at buying price)

Every piece billed and not yet delivered to a customer, returned and approved, or returned and declined:

| Piece state | In the pipeline? | Counted as |
|---|---|---|
| Billed, with the courier / out for delivery | yes | pipeline |
| Delivered to the customer | no | goods cost (`costs.goods`) on the delivery day |
| Handed back, on Hold or in Return stock, not yet checked | yes | pipeline (this part equals the ERP's `waitingCheck`) |
| Checked, approved | no | credit (`RETURN_CREDIT`), no cost |
| Checked, declined | no | return loss (`costs.returnLosses`) on the decision day |
| Exchange new piece, not yet billed | no | not in the balance, shown as `exchangesAtRisk` |

The shop computes the pipeline from its own piece states, **not** from the ERP, so it is an independent check.

### 3.3 The profit and loss ledger (what Retail sends the ERP)

The shop builds the daily summary from its own records. Every line has one source:

| Summary line | Source in the shop | Day |
|---|---|---|
| `orders` | orders placed (exchange orders are **not** counted as orders) | placed day |
| `sales.gross`, `discounts`, `net` | delivered pieces at the customer's price after discounts | delivered day |
| `income.deliveryCharges` | delivery charges customers paid on delivered orders | delivered day |
| `deliveries` | courier results | result day |
| `costs.goods` | buying price of the pieces delivered that day, plus exchange extras, minus exchange adjustments | delivered day / exchange day |
| `costs.returnLosses` | declined pieces + `exchange.billed` − `exchange.credited`, at the price Retail paid the ERP | decision day |
| `costs.packaging`, `accessories`, `paymentFees`, `delivery`, `ads`, `other` | the shop's cost entries (sources: courier statements, gateway statements, ad accounts, manual entries) | cost day |
| `incomplete` | any category with no figure yet: never sent as 0 | — |
| `netProfit` | `sales.net` + `income.deliveryCharges` − all costs, **before** fixed costs | — |
| fixed costs | `PUT /fixed-costs/{month}`: salary, rent, utilities, other; the ERP spreads them by days of the month, and so does the shop's own view with the same rule | month |

Exchange charges, exchange courier costs and the difference an exchanging customer pays belong to Retail only. They are in
the shop's sales, income or cost lines like any other, never sent as ERP events.

### 3.4 The one formula that ties the two ledgers

For any period, with the pipeline stock `I` at buying price:

```
Balance (end) = Balance (start) + goods + returnLosses + (I end − I start) + switch transfer − payments
```

Why it holds: a piece is billed once (`BILL`). It then leaves the pipeline in exactly one of three ways — delivered
(goods), approved (credit, which cancels the bill, so nothing in the P&L), or declined (return loss). Exchange extras,
adjustments, bills and credits appear on both sides (the ERP's `exchange.*` events and the same amounts in goods or return
losses), as `docs/erp/site-changes-v6.md` §2.10.6 states. So **the P&L ledger and the ERP account can be checked against
each other from the shop's own data**, with no ERP number in the formula except the balance itself. A wrong buying price, a
delivered piece never costed, a loss never booked, a credit counted twice or a payment missing makes the two sides differ
by a named amount.

## 4. The match engine

### 4.1 What is compared

| Check | Shop side | ERP side | Fails when |
|---|---|---|---|
| A. Account | the ERP account (§3.1), per day | `GET /account?from&to` (`ordersTotal`, `exchangesTotal`, `creditsTotal`, `paymentsTotal`, `otherCharges`, `closingBalance`) **and** its `statement` rows, matched one to one by kind, reference, date and amount | any component or any row differs |
| B. Ties (internal) | the formula in §3.4 from P&L lines, pipeline and payments | the shop's own ERP account balance | the formula leaves a remainder |
| C. Returns and exchanges | pieces handed back, on hold, in return stock, approved (with credit), declined, pending exchanges, `waitingCheck` | `GET /returns/summary?date`, `GET /exchanges?status=pending` | counts or values differ |
| D. Daily summary | the last version of each day the shop sent | `GET /daily-summaries?from&to` (stored version, its totals and `netProfit`) | the ERP holds an older or different version of a day |
| E. Fixed costs | the month's figures and the spreading rule | `GET /fixed-costs` | any month differs |
| F. Orders | the order ids billed per day, pieces and `erpTotal` | the `statement` rows of kind bill | an order is billed in one place only |

The shop asks the ERP to give a stable id on every `statement` row, the `bodyHash` of every stored summary, and an "as
of" closing balance for any past date (v7 requests, §9). Until the final contract has them the engine compares what v6
gives (components, rows by reference, stored totals) and marks the check "partial" on the Books status card.

### 4.2 When it runs and how the levels join

- **Hourly:** pull `GET /returns`, `GET /exchanges`, `GET /returns/claims` (v6) so a missed webhook is never a silent gap.
- **Every night, 01:30 Asia/Dhaka (after the ERP's own 01:00 check):** close yesterday: checks A–F for that day, write one
  immutable **day close** row (date, shop balance, ERP balance, result, hash). The day's summary is sent at 00:30 and re-sent
  if a late fact (a courier correction, a cost entry) changed it.
- **Week close** (the shop's week start is a setting, default Saturday), **month close**, **year close** (financial-year
  start is a setting, default July) and the **lifetime check** are built from the day-close rows, not recomputed from raw
  data: the opening balance of a day is the closing balance of the day before (a chain). Each higher level also checks that
  its parts add up to the whole (the days sum to the week, the weeks and days to the month, the months to the year, the years
  to the lifetime), and the lifetime check compares `opening balance at the switch + every entry since` with the ERP's
  `closingBalance` today. A change to a closed day (which should never happen) raises `HISTORY_CHANGED` at once.
- **Tolerance is zero** (whole taka). The only allowed wait is **timing**: a difference that the ERP's rows explain (an
  event the ERP holds that the shop has not received yet) stays `PENDING` while the pull fetches it, then must resolve
  or becomes `MISMATCH` within `books.timing.maxMinutes`.

### 4.3 Differences and how they are fixed

| Class | Meaning | Fix |
|---|---|---|
| `MISSING_EVENT` | the ERP has a row the shop lacks | the pull fetches it; nothing is typed by hand |
| `UNKNOWN_ROW` | the shop has a row the ERP lacks | the owner or Accounts decides; the ERP reverses its side or the shop writes a reversal |
| `AMOUNT_DIFF` | same row, different amount | alert; a correction is a **new** entry |
| `UNMATCHED_PAYMENT` | a payment recorded on one side only | the other side records it, or it is reversed |
| `TIE_BROKEN` | the §3.4 formula leaves a remainder | Books status names the piece, day and amount; the shop's bug-guard tests use the same formula |
| `STALE_SUMMARY` | the ERP holds an older version of a day | the shop sends the day again |
| `HISTORY_CHANGED` | a closed day moved | blocks the month close; the owner sees which entry changed |

Nothing is ever fixed by editing a number. The ERP and the shop correct by **reversing and adding** (the ERP reverses, never
deletes history). A shop correction (`ADJUSTMENT`) needs the permission `books.adjust`, the owner's PIN, a reason and the ERP's
matching event, and it is audited.

### 4.4 Closing a period

- A day closes **MATCHED** or stays open with its differences listed in "Needs you now".
- A **month** can be closed only when every day is MATCHED, every returned piece of that month is checked or listed as
  waiting, and the fixed costs are in. The owner can override with a reason and the PIN; the override is logged and shown
  on every report of that month as "closed with differences".
- Once a month is closed the shop does not re-send its days. A late fact (a courier correction on a closed day) becomes a
  `PRIOR_PERIOD` adjustment dated in the open period (the ERP is asked to accept this line, §9). Re-opening a month needs
  the owner's PIN and writes a new version the ERP keeps.
- The year close and the lifetime check are run by the system on the first day of the month and shown on the Books page;
  the year is signed off by the owner with the PIN.

### 4.5 The "explain this number" view

Every figure on the dashboard, the Money pages and the reports opens to its parts: the summary line, then the orders and
pieces, then the ledger entries and the ERP event ids. A figure that cannot be explained that way does not ship.

## 5. Daily rhythm

| Time (Asia/Dhaka) | What happens |
|---|---|
| continuous | orders, delivery results and return lists go to the ERP; ERP events arrive and are written once (event ledger) |
| hourly | pulls of returns, exchanges and claims |
| 00:30 | yesterday's summary is sent (zeros if nothing; unknown categories listed in `incomplete`) |
| 01:00 | the ERP's own check; `summary.missing` is answered at once |
| 01:30 | the shop closes yesterday (§4.2); Books status and "Needs you now" are updated |
| end of week / month / year | the matching close and report, from the day closes |

## 6. Exchange (ERP file §2.10)

1. A customer asks for an exchange within **72 hours** of the courier's "delivered". The admin approves it and **marks the
   lines** being exchanged.
2. Before approving: the live ERP stock of the new piece is checked, **regular orders come first** (an exchange waits if
   it would take the last piece), and the price difference is shown. The new piece's price is the ERP's price of that day.
3. If the new piece costs more than the old one, the customer pays the difference (the exchange terms say so: *"If the price
   of the new piece is higher at the time of exchange, you pay the difference"*; the line is a setting
   `exchange.passPriceRiseToCustomer`, on). A lower price is not returned to the customer (default, same setting group; no
   refunds) and is Retail's gain through the ERP's adjustment.
4. The exchange goes to the ERP as a new order with `exchange.ofExternalOrderId` and `replacesLineId`, with a clear note
   (for example "Exchange of order WEB-1043, line 2"). The ERP sends the piece without billing.
5. The old piece must come back by courier within **4 days** of the exchange parcel's delivery (a setting the ERP keeps; the
   shop shows the countdown). It is matched by consignment and line, checked in the ERP, and the ERP settles only the
   difference, or bills the new piece if the old one is late (credit if it arrives after), declined, or never comes.
6. The shop shows every pending exchange with its value at risk (ERP `GET /exchanges?status=pending`).
7. An exchange order is **not** a sale and not an order for the figures: the customer's original sale stands; the swap
   difference and exchange charge are Retail's income lines.
8. If the customer refuses the new parcel the exchange is cancelled and the original order stays as it was.

## 7. Returns without a quality check in the shop

The shop no longer decides whether a returned piece can be sold again. The owner decides in the ERP. At hand-back the
shop's staff scan the parcels, **count the pieces and note the condition** (a short note; a photo of the sealed bag when
the setting asks), and send the return list with `receivedCount` and `note`. If the count differs from what the ERP expects,
the shop starts the courier claim **at once**, because the check may be 7 to 15 days away and a courier's claim window may
be shorter. The Returns section (tabs: Partial deliveries · Handed back · On hold in ERP · In ERP return stock · Exchanges ·
Approved · Declined (our loss)) shows what the ERP decided, read-only, with each parcel's timeline, the losses report and the
claims list.

## 8. When the ERP refuses or goes quiet

| Case | What the shop does |
|---|---|
| `409 ACCOUNT_ON_HOLD` | the order is queued (never lost); **checkout pauses by itself** (a setting, `erp.hold.pauseCheckout`, on) because the ERP holds no stock for queued orders; the admin sees the reason and `holdsOn`; the queue runs when `account.released` arrives |
| warning days | from `warnFromDays` (15) the admin sees "the ERP will hold new orders on {date} unless a payment comes" on the dashboard |
| `409 NO_SHOP_PRICE` | that SKU stops selling; the admin is told |
| `409 INSUFFICIENT_STOCK` | nothing is saved in the ERP; the retry after `stock.changed` uses a **new** idempotency key |
| a piece from Return stock fails the packing check | `order.line.short`: the order waits; the admin chooses wait, replace or cancel the line (`PATCH /orders/{id}/lines/{lineId}`); the loss is Retail's once |
| the shop was down | queued orders, delivery results and summaries go out in order when it is back; the nightly engine fills gaps by `GET /daily-summaries?from&to` |
| a webhook arrives twice or out of order | the permanent event ledger stores each `eventId` once; a `reverses` that arrives before its original waits for it |

## 9. Switch-over (owner answer: (ক) one rule, the buying price)

1. The ERP announces a switch date. Before it, nothing changes; the practice ERP stays for tests until the real one is connected.
2. On the switch date the ERP: bills old orders still out with the courier at the buying price; moves customer advances to
   Retail as credit; moves the **unpaid amount of old delivered orders to Retail at the buying price**, one transfer
   (`SWITCH_TRANSFER`), and sends the shop the list of every order it moved. Past sales and profit of the ERP's old books
   change only by the margin of those still-unpaid orders, once.
3. The shop books the same list as its opening items and **imports the opening balance**; the lifetime check starts there.
4. The month so far is filled backwards: `GET /cost-of-goods?from&to` gives the buying price of the pieces delivered on each
   day before the switch; those days' summaries are sent with `incomplete` marking what the shop never recorded.
5. From the switch the shop stops sending customer payments and ad spend, and uses delivery results, return lists, exchanges,
   summaries and fixed costs only.
6. Orders that were already out before the switch and come back afterwards use the new return lists and the same buying price.

## 10. What can go wrong and what stops it

| Risk | Control |
|---|---|
| a bill counted twice (duplicate webhook, retry) | permanent unique `eventId` ledger; shipment call keyed by consignment |
| a credit counted twice or missed | same ledger; `reverses` handled; hourly pull; check A rows |
| the price changes between order and billing | the price is fixed on the order when placed (`erpTotal`); a changed buying price only flags the admin |
| selling below the buying price | a floor: buying price + minimum margin (setting) blocks a price, coupon or combo that goes below |
| a piece costed twice or never | pipeline from the shop's own piece states; formula in §3.4 |
| wrong partial-delivery guess | money moves only at the owner's check; the shop's cost for kept pieces follows the ERP's identification and the staff mark; a later `DIFFERENT_PIECE` restates the day |
| rounding | whole taka; the remainder of a combo or discount split sits on the last piece; the fixed-cost spread is exact to the paisa and the remainder sits on the last day |
| time zone and midnight | the ERP's own date is the entry date; the shop never infers it |
| late courier facts | days are re-sent within `books.resend.days` while open; closed months use prior-period adjustments |
| a courier claim window lost | the count at hand-back starts the claim; the countdown on the Returns section |
| the owner forgets to check returns | the ERP's reminders; Books status shows `waitingCheck` and its age |
| a number nobody can explain | the explain view (§4.5); such a figure does not ship |
| personal data | the ERP's customer list is fetched live on click, owner-only, logged, never stored by the ERP |

## 11. New settings (all dynamic; defaults)

`books.week.start` Saturday · `books.fiscalYear.startMonth` 7 · `books.timing.maxMinutes` 120 · `books.resend.days` 14 ·
`books.close.requireMatched` on · `erp.hold.pauseCheckout` on · `erp.hold.warnDays` 15 (from the ERP) ·
`exchange.passPriceRiseToCustomer` on · `exchange.returnWatch.days` 4 (the ERP's own value shown) ·
`returns.handback.photo` off · `catalogue.floor.minMarginPercent` empty (off until the owner sets it) ·
`catalogue.bGrade.listing` off · `erp.summary.sendAt` 00:30 · `erp.summary.retry.minutes` 1,5,15,60 ·
`erp.fixedCosts.spread` as the ERP's rule.

## 12. New permissions

`books.read`, `books.reconcile` (run, add notes), `books.adjust` (PIN, Accounts and owner only), `books.close` (owner),
`erp.account.read`, `erp.payments.record` (Accounts and owner only, the existing money rule), `returns.handback`
(packers and desk), `exchange.approve`, `fixedcosts.write`. All also go into `ACCESS_TREE`.

## 13. Requests to the ERP for its next version (v7)

1. A way to void a shipment/bill before the courier picks the parcel up (a cancelled booking). Until then the shop calls
   `POST /shipments` **when the courier confirms pickup**, not when the booking is made.
2. A stable id on every `statement` row, and an "as of" closing balance for any past date.
3. `bodyHash` and a `version` in the answer to `PUT /daily-summaries/{date}` and in `GET /daily-summaries`.
4. Confirmation that the ERP never back-dates an entry (a correction is dated when it is made).
5. A `PRIOR_PERIOD` line in the summary for corrections to closed months.
6. A piece taken from Return stock for an **exchange** order that fails the packing check: the same `order.line.short`.
7. Week and year closing balances, or confirmation that the day statements are enough.

## 14. The PRs (CN-028)

New numbers 607–621 and the existing PRs they update are in `docs/MASTER-REGISTER.md` (CN-028 block and the stage
tables). Fourteen are Launch (the real ERP carries the first real orders); the signed ERP-to-site calls are After launch.

## 15. The build plan: PR 607–621 in one run (CN-029, 30 Oct 2026)

**Owner's decision:** all fifteen PRs in one run, no parts. Speed comes from five builders working at the same time on their own git worktrees, quality from tests first, one independent reviewer (`qa-gate`) and a whole-ERP check at the end. One commit per register PR (`PR <n>: …`), each PR rebase-merged after its gates pass.

### Phase 0 — the shared base (one agent, Bhandari, alone, first)
Nothing else starts until it is merged, because it holds every file that more than one lane would otherwise change.
- PR 607 (contract v6 in the adapter and the mock ERP) and PR 608 (event ledger and webhook receiver v6), both **per store** (§16).
- One additive migration with every new table of PR 607–618 (event ledger, ERP account entries, pipeline pieces, day closes, match results and differences, daily summaries, fixed costs, return lists and hand-back counts, exchange links, books adjustments, the store's ERP link without its secrets). Migration numbers for later changes are reserved per lane (Bhandari 1, Sawdagor 2, Pherot 3, Gyani 4, Hisabi 5 in the number gaps the migration file names) so that no two lanes pick the same number.
- Every new setting of §11, every permission of §12 (also in `ACCESS_TREE`), and the switch `erp.model` (v5 stays the default).
- The shared TypeScript types of the ledger, the pipeline stock and the summary (`@extas/erp-types`), so each lane can write against them before the other lanes land.

### Phase 1 — five lanes at the same time
| Lane (agent) | PRs | Notes |
|---|---|---|
| Bhandari | 609 import by style code and the price floor, then 620 signed ERP→shop calls | 620 is After launch and goes last |
| Sawdagor | 610 orders to the ERP v6 with hold, pause and the short line, then 611 shipment at pickup and the delivery results | 611 sends `POST /shipments` when the courier confirms pickup |
| Pherot (new) | 612 return lists, 613 Returns section, 614 exchange through the ERP, and the rework of PR 184–191, 525, 526 | old flow keeps working while `erp.model` is v5 |
| Gyani | 615 ERP account ledger and pipeline stock, 616 books match engine | the three-way match and the day close |
| Hisabi (new) | 617 daily summary, 618 fixed costs and extra cost lines, the Books status card | writes against the Phase 0 types until 615 lands |

Rules for all lanes: tests for the owner's rules first, then the code; a lane touches only its own PRs (anything shared goes to its owner, one line in `PROGRESS.md`); every new admin page gets its guide (CN-026) and every new screen is checked at 390 / 768 / 1366 / 1920 px in English and Bengali; each PR updates `README.md`, `PROGRESS.md` and `docs/stages/bn.json` (then `pnpm docs:stages`). `qa-gate` reviews each lane's PRs before they merge.

### Phase 2 — switch-over and acceptance (Prohori, after Phase 1)
- PR 619 switch-over (switch date, opening balance, the moved old orders at buying price, the ERP link page) and PR 621 the acceptance suite.
- The acceptance suite must prove, on the mock and (when the owner has typed the demo key) on the demo ERP: the tie formula for a day, a week, a month, a year and for life; a lost webhook, a doubled event, a wrong amount and a late return each found and fixed only by a reversing entry; the 72-hour exchange rule; hold → checkout pause → resume; and that store A's key can never read or write store B.

### Phase 3 — the whole-ERP check
`qa-gate` runs the device gate, the smoke test (the new pages added to `docs/qa/smoke.json`), the journeys and the 70-order simulation's money lines; fresh reviewers look at the whole change for money and data problems, round after round (at most 3) until a round finds none. Then the Bengali report for the owner, with the one step only he can do: type the demo ERP key in the vault.

### What the old work becomes
PR 184, 185, 187, 188, 189, 190, 191, 525 and 526 stay as built while `erp.model` is v5. PR 610–614 add the v6 path beside them; at the switch-over (619) the v6 path takes over and the old shop-side QC, restock and write-off paths are switched off (kept in the code as switches, never deleted: CLAUDE.md rule 3).

## 16. One ERP link per store (CN-029)

- One store = one ERP company. Each store has its **own** API key, its **own** webhook secret and its **own** signing secret for the ERP's calls to the shop (PR 620). They are typed by the owner in "Keys & connections", stored only in the encrypted vault under the store's id, never in Git, in chat or in a log, and never shared between stores.
- Every ERP call, webhook, ledger entry, day close, match result and summary carries the store id and goes through the store guard; a call made with store A's key can never read or write store B (test, PR 607 and 621).
- The switch date, the opening balance and the settings of §11 are per store. A handover to a new owner replaces the store's three secrets (the new owner types their own), starts that store's own ledgers and keeps the history of the old one unreachable from the new keys (PR 509, PR 619).
- Development and tests use the mock ERP with one test key per test store. The real demo key is typed by the owner when he connects the demo ERP.
