# Gap map, part 1: Orders, Couriers, Rules (prototype v5 vs the repo)

Checked 13 Nov 2026 against `apps/web/src/app/admin/**`, `packages/*`, `packages/db/prisma/schema.prisma`,
`docs/MASTER-REGISTER.md` and `docs/BLUEPRINT.md`. Read-only analysis; nothing was changed in the app.
Verdicts: **MATCHES** = built and the same (build nothing) · **DIFFERS** = built, small delta listed · **NEW** = exists nowhere.
Sizes: S (a day-sized change), M (one PR), L (a big PR or two). "Backend" = already in `packages/`; most work here is screens and wiring.

Real nav today: Orders = All · To confirm (+ Calls to make) · Packing & print (Pack, Print, Picking, Handover, Invoices) · Returns & exchanges
(board, Receive & QC, Refused, Hand-back, ERP returns) · More: Today's digest, Incomplete, Risk rules (`lib/admin-shell/sections.ts`).
Delivery is its own section (Zones & charges, Couriers, Settings). Rules sits under Marketing (`/admin/rules`, `/rules/notices`, `/rules/eid`).
Offers/coupons live inside the Rules screen (`RuleSheets.tsx` CouponsSheet).

## 0. Order status model: prototype vs real

Real order has FOUR separate chips (`lib/admin-orders/model.ts`): order state (`OrderStatus`), shipment status (`ShipmentStatus`),
payment pill, return pill. The prototype folds them into one line. Keep the real model; the prototype steps become views over it. No enum change.

| Prototype status | Real thing | Note / delta |
|---|---|---|
| New | `PLACED` | same |
| Confirmed | `CONFIRMED` | Prototype: rules confirm by themselves. Real: a person confirms (To confirm queue) except prepaid self-confirm (PR 541 f320, off). Auto-confirm engine = NEW (see O-09). |
| Processing | NOT a status. A view: `PLACED` not auto-confirmed + `AWAITING_ADVANCE` + `ON_HOLD` + open review (PR 541 sections) | Name clash: real `OrderStatus.PROCESSING` means "picking started" (`startPicking`). Do not rename the enum. Show the real one as "Picking" in lists. |
| (tag) Advance asked / Advance received | `AWAITING_ADVANCE` + `requestAdvance` (PR 542); received = payment lands -> `CONFIRMED` | Matches; tag wording only. |
| Booked | Derived: order has a `Shipment` not `BOOKING_FAILED`/`CANCELLED` (D5, `bookedOf`) | No new state. Keep derived. |
| Packed (= sticker printed) | `PACKED`, today set by the packing screen's pack step (scan/ticks, PR 182) | DIFFERS: add a setting `fulfilment.packOnPrint` so printing the courier sticker runs the existing `pack` command. Additive. |
| Handed over | `HANDED_OVER` (hand-over sheet, PR 180) then `IN_TRANSIT` by `courierPickedUp` (PR 184) | Prototype: courier pickup report. Matches in effect. |
| Delivered | `DELIVERED` / `PARTIALLY_DELIVERED` | Partial counted separately: matches. |
| Paid | payment pill `PAID` / `COD_SETTLED` | Derived flag, same as the prototype. |
| Returned / Cancelled | `RETURNED` / `CANCELLED` | same |
| Exchanged | not an order state: `Exchange` model (`ExchangeStatus`) | Keep as is. |
| (not in prototype) | `DRAFT`, `ON_HOLD`, `IN_TRANSIT` | `ON_HOLD` = the prototype's "Stuck". |

Courier live status (prototype codes -> `ShipmentStatus`): picked_up -> PICKED_UP; in_transit -> IN_TRANSIT; out_for_delivery -> OUT_FOR_DELIVERY;
attempt_failed -> ATTEMPT_FAILED; delivered -> DELIVERED; returning -> RETURNING; returned -> RETURNED. **Missing:** `at_hub` and `on_hold`
(today only in `Shipment.providerStatus` raw text). Fix without enum change: map to IN_TRANSIT/IN_REVIEW and show the raw word, or add two additive enum values `AT_HUB`, `ON_HOLD_COURIER` (S).
Rider name/phone: the prototype's `couriersApi.status` returns a rider; `courier-research.md` says the APIs do not give it. Show only when the API returns it.

## 1. Orders

| # | Item | Verdict | Evidence | Delta / what to build | Size | Depends |
|---|---|---|---|---|---|---|
| O-01 | Orders menu and tab set (Batch, All, Processing, To ship, With courier, Returns & exchanges, Incomplete) | DIFFERS | `sections.ts` orders tabs (all, confirm, digest, incomplete, riskrules, packing, returns) | Re-map nav: Batch (new), All, Processing (view over To confirm + reviews), To ship (Book + Print + Pack), With courier (Handover), Returns, Incomplete. Old routes redirect (prototype keeps `confirm`/`pack` aliases). Digest and Risk rules go under More or Rules. | M | O-03, O-08, O-12 |
| O-02 | Status chain and "To confirm is gone" | DIFFERS | section 0 above; `ORDER_VIEWS` in `packages/orders/src/list.ts` | New view `processing`; `packOnPrint` setting; no enum change | S | O-09 |
| O-03 | Batch > Current (every order not yet handed over, older leftovers tagged "From last batch", pipeline counts, Stuck reasons, "Your work" / "Moved on by itself" with reasons) | DIFFERS | PR 181 picking scope is the same set ("not with the courier however many days"); PR 540 digest `orders/digest` (placed, moved on, held by reason); PR 541 sections | One page composing existing counts: pipeline strip, Stuck chips (No stock, No answer, Suspicious, Merge needed), two lists, one-line reason per auto-move (needs `confirmedBy RULE/STAFF + reason` on the confirm event). Click a count -> filtered list. No clock time anywhere. | M | O-09 |
| O-04 | Batch > Past batches (date-time, parcels, COD total, taken vs missing, click opens orders) | DIFFERS | `HandoverBatch` (PR 180), `/admin/orders/packing/handover`, `handover-check.ts` (`notPicked`, `offSheet`, PR 180 f437) | List page over HandoverBatch with COD total and taken/missing from the check; "Print all" rejected extras stay out | S | O-03 |
| O-05 | All orders: step chips, search, date presets (Today, Yesterday, 7 days, This month, Last month, Custom), sort by lowest score, Bulk chip | DIFFERS | `/admin/orders` (PR 140, 541, 656: chips, search, payment/source/risk filters, 3 designs A/B/C); `ListQuery` has no date range | Add `from`/`to` + presets to `ListQuery`/`parseListQuery`; sort "lowest courier score" (risk sort exists, highest first); chips renamed to the steps; keep A/B/C looks (CN-025). Same date bar on Returns, Cancelled, Incomplete. | S | |
| O-06 | Order page: big customer card (call/copy/map per line, grade badge), score panel, product lines with photo/colour/size, previous orders expandable, lifetime figures, send message (SMS/WhatsApp/Email + template), per-order profit | DIFFERS | `OrderDetailPage.tsx` (PR 141: items, customer + history, courier, `RiskPanel`, duplicate review, payments, timeline), `OrderProfitCard.tsx`, `InvoicePrintMenu` | Re-layout; lifetime figures (orders, pieces, MRP value, discount, delivered value, collected, returns, exchanges, AOV, profit owner-only) are derived reads; "Send message" modal over Messages templates (PR 148/289, `messages/templates`); previous-orders expand in place | M | O-07 |
| O-07 | Customer 360 (new window default, or right panel; favourite categories, usual sizes, wallet/points, coupons used, reviews, incomplete orders, staff notes, grade) | DIFFERS | `/admin/customers/[id]` (PR 285), grades (PR 534), `customers/loyalty` | Open in new window / panel toggle; add favourite categories + usual sizes, incomplete orders, coupons used. Part 2 (Customers) owns the page; here only the link behaviour. | S | Part 2 |
| O-08 | Processing tab: chips No stock / No answer / Suspicious / Merge needed / Advance asked; Approve, Cancel (reason), Ask for advance | DIFFERS | `/admin/orders/confirm` (PR 141/541: To confirm, Prepaid, Cancel requests, Awaiting advance), review cards with `AlertExplain` (PR 521), `calls` (PR 545/563), `advance-request.ts` (PR 542) | One screen with the five chips over existing sources (stock shortage from packing issues PR 183; no answer = call outcome; suspicious = risk sections high/identity/duplicate; merge = bundling proposal PR 522; advance = AWAITING_ADVANCE). Buttons already exist as commands. | M | O-12, O-13 |
| O-09 | Auto-confirm rules: prepaid full or delivery-charge-only prepaid, trusted old customer, new customer with good courier score, big COD -> call list, suspicious -> red tag, nothing auto-blocked; shows "why" | NEW (pieces built) | Prepaid self-confirm PR 541 f320 (`orders.prepaid.selfConfirm`, off, `prepaid-confirm.ts`); good-customer override PR 524 (`good-customer.ts`, skips holds only, never confirms); levels PR 161; New-customer call task PR 545 | A rules table + confirm-by-rule command: for COD orders confirm when customer is trusted (delivered >= N, refused <= M) or score >= upper limit; call list below; red tag below lower. Writes `confirmedBy=RULE` + reason on the event. All numbers = settings (Rules > Order flow), default off. Must still hold CLAUDE.md rule 6 (never touches money). | L | O-10, R-05 |
| O-10 | Courier score out of 10 (6 metrics 0-10 by owner bands, weights, upper/lower limits, worked example, each metric's source and age, missing = "unknown" -> call list, AI one-liner, staff only) | DIFFERS | `risk-score.ts` (PR 156: score 0..RISK_MAX, signals+bands, higher = riskier), `phone-history`, `phone-risk.ts` (PR 157/559 per-courier fraud check, `CourierFraudCheck`, adapter `fraud-check`), `RiskPanel`, bands `risk.bands` | Show a /10 courier-record score (higher = better) built from: success rate, total parcels, returns, worst courier rate, couriers with a record, fraud reports by other shops (data = phone-history + fraud-check, already read). New settings group (bands, weights, limits). "Unknown" never red. AI line: S15 is frozen (CN-047), so ship the plain one-line reason now; AI line only if S15 already exposes it. Score-accuracy report: reuse `reports/flags` + `reports/stopped` (PR 164/524). | M | R-05 |
| O-11 | Courier score confirms COD orders automatically / "Ask delivery charge in advance" one-click on low score | DIFFERS | PR 542 one-click advance, PR 161 levels (auto option) | Wire the low-score tag to the existing `awaitAdvance`; auto = O-09 | S | O-09 |
| O-12 | Stuck > No stock: staff calls (wait / swap / send rest / cancel), after the Rules wait time the rest ships, released when ERP stock arrives | DIFFERS | PR 183 packing issues (`packing-issues.ts`, resolution card, "never auto-cancelled"), `fulfilment.packing.issues`; ERP stock pull PR 195 | Add wait-hours + "send the rest after" setting; auto-release hook on stock arrival (reservation sweep exists, PR 198) | S | |
| O-13 | Stuck > No answer; "Calls to make" with outcome log, retry schedule, per-staff, click to call | MATCHES (small delta) | `/admin/orders/confirm/calls` (PR 545, 563; `CallTask`, outcomes, `cl.*` settings) | Only: retry schedule per outcome and per-staff counts if missing. | S | |
| O-14 | Auto-cancel after unanswered calls (switch, off by default) | NEW | `noAnswerOutcomes` exists only as a risk signal (`registry-risk.ts`) | One setting + nightly job that proposes (never silently) a cancel with reason. | S | O-13 |
| O-15 | Merge needed: Merge button on the row, editable merge (remove line, change colour/size, add product, cancel one order), Merge + call; look-back 5 days; auto-merge switch (off); no merge after Packed; different addresses -> ask | DIFFERS | PR 145 duplicate defence, PR 520 rules engine, PR 522 bundling (`bundling.ts`: propose "One parcel?" / group via `OrderGroup`, setting `risk.bundling`, off), `edit.ts` (remove line, size), `addon.ts` (add line), B1.12 | Real grouping keeps each order as is and ships one parcel; prototype wants ONE merged order after an edit step. Build a merge command (move lines into the main order, cancel the others with reason "merged", record both timelines) + the side-by-side modal. Window default 5 days = setting. | M | |
| O-16 | Price adjust on every order: ৳ amount, % off, use wallet, free delivery; reason required and logged; per-role limit; above limit -> owner approval (Telegram works) | NEW | `edit.ts` header: "no price, discount, delivery charge … is ever changed" (rule 6); wallet PR 171; approval gate PR 540; Telegram adapter | New command `adjustPrice` (additive table e.g. `OrderPriceAdjustment`: kind, amountMinor, reason, actor, approvedBy, state) + role limits in Rules > Order flow / staff limits; only before booking; posts through the order service so totals, COD amount and payments stay right. Needs the owner's PIN on money change (`packages/auth/src/pin.ts`). | L | wallet, R-05 |
| O-17 | Stock hold: short hold in checkout, N hours after order (default 12h), size shown sold out while held, released if not confirmed | DIFFERS | PR 197/198 `StockReservation` (cart hold, order hold continues "until the ERP has it, at most a day"), `inventory.reservation.abandonMinutes`, `…unpaidHoldHours` (24) | Setting for "hours after order until confirmed" (default 12), release when not confirmed; the sold-out display already follows pool availability. | S | |
| O-18 | To ship: chips Confirmed -> Booked -> Packed; tick or Select all; "Book courier" in one click by API; default courier, optional other; one order = one booking | DIFFERS | `bookOrders` + `readyToBook` view (PR 176/176 f, `shipping/booking.ts`), courier choice PR 178 (`courier-choice.ts`, off), idempotent `merchantRef` (one booking) | Screen with the three chips; bulk book already exists; "default courier" setting + optional override per run. | M | R-06 |
| O-19 | Print stickers only after Booked; print once; second print needs PIN + reason; print log; reprint reuses the consignment | DIFFERS | PR 179/180 (`PrintJob`, `isReprint`, `reason`, `labelPrintCount`; reason asked via `delivery.sticker.queue`), `packages/auth/src/pin.ts` | Add PIN check on reprint (not there today) and show who/when/why log on the page; sticker needs consignment already = true. | S | |
| O-20 | Packed = sticker printed (no scan); "Print all": today's summary line + picking list PDF by category > style > colour > size + stickers in the same order | DIFFERS | PR 181 picking list (category > style > size, most pieces first), PR 182 pack step, print run `registry-print-run.ts`, `orders/packing/print` | `fulfilment.packOnPrint` setting; summary line (orders vs pieces counted apart, categories, shortages, problem orders apart) added to the print run; colour level in sort. | M | O-02 |
| O-21 | Cancel after Booked: tell the courier (auto if API) or warn | MATCHES | `Shipment.cancelRequestedAt/cancelOutcome`, view `cancelPending`, `courierCancelConfirmed` (D5, PR 144/176) | none | - | |
| O-22 | With courier tab: handed-over list with courier status column + filter, "Record courier pickup", day-end check (packed vs entered), missing parcels, cancelled-but-booked flag | DIFFERS | `/admin/orders/packing/handover` (PR 180), `handover-check.ts` (not picked / off sheet), PR 184 tracking sync, list `ship` chip | Page re-arranged; day-end check "Packed today 10, entered at courier 9" is `handover-check` output; add the cancelled-but-booked flag (view `cancelPending` exists). | M | |
| O-23 | Courier live status side panel + full tracking history (tracking no., COD, attempts, notes, rider if given); auto refresh | DIFFERS | `ShipmentEvent` (status, rawStatus, message, riderNote), `tracking.ts`, sync PR 184, `webhooks.ts` (PR 184 f) | Panel (drawer) over ShipmentEvent; `couriersApi.history` = this read. Attempts counted from ATTEMPT_FAILED events. Rider phone only if the API returns it. | S | |
| O-24 | Stuck-parcel alert (no movement in N hours, default 48) | NEW | `Shipment.lastTrackedAt` exists; Reports > Delivery lists "parcels past their promise" (PR 192) | Setting `hours` + derived list + Home/alert hook + Telegram. | S | |
| O-25 | Backup-courier switch (move today's bookings when the courier is down, PIN) | NEW | `rebook.db.test.ts`/`Shipment.attempt` (re-booking exists), PR 178 selection | One action "Move today's unbooked/booked parcels to backup" with PIN; setting for backup courier. | M | R-06 |
| O-26 | Returns & exchanges: sub-tabs Exchange requests, Partial deliveries, Coming back, Handed back, Waiting ERP check, Approved, Declined; partial box; exchange within 72h with tiers and money box; no cash refund; shop does not grade; ERP check 7 days; old piece within 4 days | MATCHES (mostly) | `/admin/orders/returns` (PR 185-191, 189 "no returns after receipt"), `returns/handback` (PR 612), `returns/erp` seven tabs (PR 613), `exchange-customer.ts` (PR 186, 72h), `returns.erpCheck.days`, `returns-v6` registry, refused list PR 191 | Sub-tab labels/order only. Check the 4-day old-piece clock and the reminder set (request waiting, partial box empty, 4-day, 7-day, short count -> claim) exist as timers; add the missing ones as settings. | S | |
| O-27 | Defective / wrong item -> replacement, no refund, no wallet | DIFFERS | PR 189/190 (exchange rules), `erp-switch-resend.ts` is NOT this (ERP switch resend) | Add a "Replacement" case kind on the returns board (free reship, old piece back) with its own rule (hours, old piece days, pickup free). | M | |
| O-28 | Cancelled view: counts, money, reason split, stage cancelled at, who, Excel/PDF | NEW | cancel reasons PR 144 (`orders.cancel.reasons`), list view `finished`; no summary | Summary on Returns with date filter; stage from `OrderEvent`; export via PR 151 export. | S | O-05 |
| O-29 | Partial delivery: "Send right size" creates a linked order | MATCHES | PR 188 variant switcher, PR 146 two-size, `Exchange` linked leg (`Shipment.isExchangeLeg`) | none | - | |
| O-30 | Rider overcharge -> return the extra to customer's wallet | MATCHES | `RiderIssue` + `/admin/support/rider-issues` (PR 192), refund request to wallet (PR 172) | none | - | |
| O-31 | Incomplete orders list: grouped by day newest first, date filters, known-customer chip, "left without a number" count, max 2 auto messages | DIFFERS | `/admin/orders/incomplete` (PR 274: hottest first, WhatsApp/Call, assign, handled), PR 275 follow-up (2 messages), PR 276 left bag; count of no-number bags exists | Sort newest first per day; date presets; known-customer chip (browser id/login -> stored details, IP only "Possible match"); `CheckoutDraft.convertedOrderId` already gives "Ordered later" -> move to its own list. | M | O-05 |
| O-32 | Incomplete: Customer 360 (items with size/colour, where they stopped, past orders, score), Call with outcome log, Confirm as order (address form on call, stock held, tag "Recovered by phone" + who), SMS/WhatsApp templates (Forgot something?, Size help?, Delivery charge question?, an Offer) | DIFFERS | `IncompleteActions.tsx` (assign, handled), `CheckoutDraft` (`lastStep`, `data`, `handledById`), `CallTask`, message templates | New actions: Confirm as order (calls the order service with the draft; adds `recoveredBy` on draft/order event), outcome log reuses CallTask, 4 template keys, Offer picker reads Offers (R-13). Own messages unlimited with a warning. | M | R-13 |
| O-33 | Incomplete journey report (landing -> cart -> phone -> address -> delivery -> payment -> left; drop-off by step, landing page, product, campaign, device; came back; recovered) | NEW | `CheckoutDraft.lastStep`, `CheckoutFlagEvent`, `reports/orders`; no funnel by step | Report page from draft stages + attribution tags (PR 274 has campaign tags). Part of Reports in Part 3 too. | M | |
| O-34 | Capture per C6.3-C6.5 (autofill on first interaction, no notice, no hidden-field harvesting; untouched visitors only counted) | MATCHES | `components/shop/checkout/draft.ts` (PR 137 C6.5 `checkout.autofill.browserDays`, PR 274), blueprint C6.4 | Verify the "first interaction" read and "count only" for untouched visitors; owner dropped the 5 checkout ideas (DECISIONS correction). | S | |
| O-35 | Bulk / corporate orders (quote, agreed price, advance + balance, company invoice, delivery in batches) | DIFFERS | PR 606 `BulkEnquiry` + `/api/admin/bulk-enquiries` (list + status), `orders.bulkLane` off; NO admin screen found | Admin list + quote/agreed price/advance/balance/company invoice/batches (new additive tables for quote and batches). | M | |
| O-36 | Peak / Eid mode: daily capacity cap, cut-off dates change delivery promise texts, Print all in parts, roster | DIFFERS | Eid order-by dates + holiday mode (PR 193/214, `/admin/rules/eid`, `/admin/delivery/settings`) | Capacity cap + "Print all in parts" + roster are new settings; promise texts exist. | S | O-20 |
| O-37 | Phone order (staff creates an order while on the call) | NEW (verify) | No admin create-order found in `packages/orders`; closest: support `chat-cart.ts` (a cart built in chat) | Admin "New order" form over the checkout service (stock hold, risk, courier fee), source = phone. Confirm with Part 2 (Inbox call desk) whether it is in scope. | M | |
| O-38 | Packer role sees no phone/address | DIFFERS | packers' keys in `packages/auth/src/catalogue.ts` (`returns.handback`, `fulfilment.*`); personal columns `orders.exportPersonal` only for export | Mask phone/address on pack/print screens unless a key; the sticker still prints them. | S | |
| O-39 | Messages on confirm: SMS + WhatsApp invoice picture | MATCHES | PR 148 notifications, PR 407 invoice chat picture, advance link PR 542 | none | - | |
| O-40 | Order export, bulk Confirm/Hold/Release, search by phone/name/tracking | MATCHES | PR 151, 152, 154 | keep | - | |

## 2. Couriers (new left-menu section)

Real counterpart: Delivery section (Zones & charges, Couriers = accounts + area lists, Settings), Reports > Delivery & RTO, Finance books/match (COD statements),
Support > Rider issues. There is no Couriers section, no Courier 360 and no payouts.

| # | Item | Verdict | Evidence | Delta / what to build | Size | Depends |
|---|---|---|---|---|---|---|
| C-01 | Couriers menu: Overview, Courier 360, Claims & payouts, Setup | DIFFERS | `sections.ts` `delivery` (zones, couriers, settings) | New section; Zones & charges and Delivery settings move under Setup (keep routes, add redirects). | S | |
| C-02 | Overview: card per courier (parcels on the way, cash held, success rate, payout status), What needs you, alerts, comparison, cost per parcel, "money we would save with per-area routing" | NEW (data built) | `shipping/performance.ts` (PR 192), `courier-choice.ts` (PR 178 cost from rate cards), `CodCollection`/`cod.ts` (COD held), `reports/delivery` | Composed page; all figures are reads. Save-line needs `delivery.courier.selection` on to compute. | M | |
| C-03 | Courier 360 > Overview | NEW (data built) | same as C-02 | per-courier header + week-by-week success | S | C-02 |
| C-04 | Courier 360 > Parcels (live status, tracking history) | DIFFERS | `Shipment`, `ShipmentEvent`, `/admin/delivery/couriers/[id]` shows area lists, not parcels | Parcel table with status filter + the O-23 drawer | M | O-23 |
| C-05 | Courier 360 > Money (cash held, received, monthly statement, lines that do not match) | DIFFERS | `CodCollection`, `CourierSettlement(+Line)`, `payments/cod.ts`, `statements.ts` + `cod-match.ts` (PR 174/166), `/admin/money/books/match`, `…/differences` | Per-courier view of the same data; "lines that do not match" = books/differences filtered | M | |
| C-06 | Courier 360 > Payouts: "Request a payout" through the courier's own payment-request feature; status Requested -> Processing -> Paid / Rejected read back; Paid marks covered orders settled; **no "Ask for payment"** | NEW | No payout/payment-request code in `packages/adapters/src/courier/*` (grep: none); `courier-research.md` says Steadfast has payment request + payments list (check), Pathao pays by invoice, RedX nothing | Additive: `CourierPayout` (courierAccountId, amountMinor, state, ref, requestedAt, paidAt, coveredShipmentIds, raw) + optional adapter capability `payouts` (`request()`, `status()`, `list()`); poll job; on Paid -> settle `CodCollection` via the existing settlement path (money posts through payments service, never by the page). Steadfast first; Pathao read-only invoices; RedX none (shows "paid by statement"). | L | C-12 |
| C-07 | Courier 360 > Performance | DIFFERS | `shipping/performance.ts`, `reports/delivery` (on-time, refused, exceptions by courier/zone/district, PR 192), RTO cost book | By district + week-by-week + charges last 30 days | S | |
| C-08 | Courier 360 > Claims (one ledger, new claim, deadline, recovered) | DIFFERS | `CourierClaim` (kind LOST/DAMAGED/RIDER_OVERCHARGE/OTHER; state OPEN/SENT/SETTLED/REJECTED; `settledMinor`), `/api/admin/delivery/claims`, `CourierCards` on courier page, `delivery.courier.claims` off | Prototype kinds lost, damaged, short_cod, rider, return_short and states open, sent, won, lost, deadline. Additive: enum values `SHORT_COD`, `RETURN_SHORT`, column `deadlineAt`; map SETTLED = won, REJECTED = lost (labels only). | M | |
| C-09 | One claims ledger shared by Orders, Couriers, Finance; Finance shows "Courier claims to receive" and recovered money posts to the courier's account | DIFFERS | PR 192 claims; ERP claims `ErpClaim` (returns-erp short count -> claim, PR 612/613) are a second list | Merge the two lists in one read; Finance line + posting of recovered money through `payments` (check `claims.ts` posts nothing today: "a claim is a record"). | M | C-08 |
| C-10 | Courier 360 > Messages we send this courier | NEW | `Shipment.bookingNote` only | Reads Rules > Courier messages (R-07) | S | R-07 |
| C-11 | Courier 360 > Setup / Couriers > Setup: connection status + Test, pickup point, rate card, payout settings, default courier, backup fallback, per-area routing (off switch) | DIFFERS | `/admin/delivery/couriers` (add/on/off/archive), keys in `/admin/integrations` vault (practice until Test passes, PR 176/177), rate cards in `money/fees` (`FeesScreen`), zone mapping PR 554, `courier-choice` | One Setup page linking these; add default courier + backup courier + payout settings. | M | |
| C-12 | Courier adapters: Steadfast, Pathao, RedX | DIFFERS | `packages/adapters/src/courier/{steadfast,pathao,mock,practice}.ts`; RedX absent (`contract.ts` mentions it only as an example) | RedX adapter (create parcel, track by tracking id with steps, areas) behind the contract, mock first; extend contract with optional `payouts` and `balance`. Paperfly/eCourier not planned. | L (RedX M) | |
| C-13 | Courier 360 also in Finance (tab Couriers) and Reports (tab Couriers) | DIFFERS | Finance = Money section (books/match, differences, daily); Reports = Delivery & RTO | Two tabs that embed the same components | S | C-05, C-07 |
| C-14 | Stuck parcels / alerts card | NEW | see O-24 | | S | O-24 |
| C-15 | Courier comparison (cost per parcel, success) | DIFFERS | PR 178 + 192 | chart only | S | C-02 |

## 3. Rules

Real counterpart: Smart Rules (`/admin/rules`, PR 208-219: rule cards by topic chips delivery/exchange/setTier/discount/festive/payment/policy/fulfilment,
editor with live preview, draft/publish, history, simulation, conflicts, templates, coupons sheet), Notices & pop-ups (`/admin/rules/notices`, PR 216),
Eid dates (`/admin/rules/eid`). Order-flow and risk settings are on Orders > Risk rules; messages on the Messages section.

| # | Item | Verdict | Evidence | Delta / what to build | Size | Depends |
|---|---|---|---|---|---|---|
| R-01 | Rules menu: All rules, Offers & discounts, Pop-ups & notices | DIFFERS | `/admin/rules`, `/rules/notices`, `/rules/eid`; sits under Marketing | Own top-level section with 3 tabs; Eid moves into Delivery group | S | |
| R-02 | One page: search, left group nav (Delivery, Payment & COD, Checkout & payments, Order flow, Courier, Courier messages, Exchange, Customers, Discounts, Messages), each rule one plain sentence + pill (On / Off / Sample / From date) + Edit | DIFFERS | `RulesScreen.tsx` (cards + topic chips + editor beside the list), rule text from the rule (PR 215), `rl-*` | Re-skin: group nav + sentence rows; pill "Sample" = setting still at shipped default (derived); "From date" = active window (PR 208). Status strip: still sample / scheduled / last change (history PR 218). | M | |
| R-03 | Right-side editor: simple fields, "Customer sees", "What changes" (before/after + effect on last 30 days), Save (PIN for money), More options (start on a date, try on last month, history, back to default) | DIFFERS | `RuleEditor.tsx` live preview, `PreviewSheet`, `SimulateSheet` (PR 219: what a past order would have cost), `HistorySheet`, schedule | Mostly wording and placement; PIN on money rules via `auth/pin.ts`; "back to default" = reset to registry default | S | |
| R-04 | Delivery group (fees, free delivery, Eid, peak) | MATCHES | rule kind `delivery` (PR 210), bands/COD limits admin PR 502, Eid PR 214, holiday PR 193 | Peak = O-36 | - | |
| R-05 | Order flow group: auto-confirm table, courier score metrics/bands/weights/limits with worked example, score accuracy, fraud level presets (Low/Normal/Strict fill the table), stock hold, holds & out of stock, auto-cancel, merge, price-adjust limits, advance reminder hours | DIFFERS | `/admin/orders/risk-rules` (+ `/checkout`): levels PR 161, bundling 522, duplicate rules 520, good customer 524, block proposal 523, advance 558; `risk.*` registries | Move/show under Rules > Order flow; new settings for O-09, O-10, O-14, O-16, O-17 and advance reminder hours; presets = new tiny mapping. Old page stays reachable ("Nothing is deleted"). | M | O-09, O-10, O-16 |
| R-06 | Courier group: default courier, zone routing (off), batch auto/close | DIFFERS | `delivery.courier.selection` (PR 178, off) | Add `delivery.courier.default`; batch has no clock time so "close at" is dropped | S | |
| R-07 | Courier messages: editable text with placeholders per event (booking note, delivery instruction e.g. "call before delivery", COD amount line, re-attempt, hold, cancel, return pick-up, claim, payout) + one-off note on the order that goes with the booking | NEW | `Shipment.bookingNote` (`booking.ts`, `parcels.ts`) | New settings JSON (`delivery.courier.messages`, en/bn, tokens) + `courierMsg(key, ctx)` read used by booking, cancel, claim and payout calls; per-order note field on the book dialog. Adapters pass it in the courier's `instruction`/`note`. | M | |
| R-08 | Payment & COD group: COD with two limits (call above / pay online above), advance, wallets | DIFFERS | COD limits in delivery bands (PR 502), advance PR 173, checkout advance PR 558, wallet PR 171 | Check if "pay online above" exists as a checkout layer; if not add as a second limit (S). Otherwise wording. | S | |
| R-09 | Checkout & payments group: reward for paying online, pay link, gift mode | DIFFERS | prepaid reward inside rules PR 213, advance link PR 542, gift mode (S04 additions, `gift.ts`) | Reward becomes an Offer (R-13) | S | R-13 |
| R-10 | Exchange group (72h, size/defect, charge, lower price -> wallet after check, old piece 4 days, ERP check 7 days) + Replacement rule | DIFFERS | rule kind `exchange` PR 211, `exchange-charge.ts`, `returns.erpCheck.days`, PR 190 | Add Replacement rule (O-27); rest matches | S | O-27 |
| R-11 | Customers group: priority grades by lifetime spend/parcels with a discount offer per grade; order-edit limits | DIFFERS | `customers.grades` PR 534 (`grades.ts`), `customers/settings`, `orders.edit.*` PR 142/143 | Offer per grade = new field that points at an Offer | S | R-13 |
| R-12 | Discounts group: buy more (tiers), coupons, sale prices | DIFFERS | PR 212 `SetTierRule`, 213 discount rules + was-price guard (`was-price.ts`), 271/272 `Coupon` | Rows link to Offers & discounts | S | R-13 |
| R-13 | Offers & Discounts 360 (7-step wizard Type > Value > Where > Who > When > Limits > Preview; kinds free delivery, percent, flat, points, wallet credit; coupons, sales, points, wallet in one place; cost and results per offer; calendar; awaiting approval; history; "built-in rules that also change the price"; `offersApi.active()` pickers) | NEW (engines built) | `Coupon`, `CouponRedemption` (PR 271/272 `registry-coupons-distribution`), discount rules 213, `RewardRule` (points), wallet 171, referral 273, campaigns offer (PR 256), `rules/coupons-service.ts`, approvals `rules.approve` | Unified `Offer` read model/table over those engines + wizard + results (redemptions, discount given, orders, delivered value, return rate) + calendar. Online-payment reward becomes an offer (free delivery / 5% / 10% / flat / points / wallet credit). Money changes keep owner OK + PIN. Build as a facade first; no engine rewrite. | L | |
| R-14 | Pop-ups & notices hub: 12 items in 4 groups (Notice bar, Welcome/offer pop-up, Holiday banner, Free-delivery bar, Duplicate-order pop-up, Advance notice, Stock-hold notice, Out-of-stock size notice, Demo "coming soon" pop-up, Low-stock notice, Thank-you notice, Delivery promise) with where it shows, who sees it, on/off, text, small picture | DIFFERS | `Notice` model + `NoticesScreen.tsx` (PR 216: bar/banner/inline/popup, placement, triggers, caps), holiday PR 193, duplicate notice (PR 145/546), delivery promise PR 550 | Hub = list of fixed system placements each linked to its text/switch (some live in other settings) + the owner's own notices. Demo pop-up depends on the demo-products feature (other part). Rules stay "never a pop-up on arrival" (D1). | M | |
| R-15 | Messages group: message log (status, cost, retries), limits (quiet hours, per-order caps), WhatsApp utility vs marketing templates with cost, SMS transactional vs promotional senders with send windows | DIFFERS | Messages section: log PR 149/291 (`messages/log`), channels & limits PR 298 (`registry-message-channels.ts`: category UTILITY, reply window), templates PR 505, consent | Link only; add quiet hours, per-order cap, per-message cost and sender type if absent in `registry-message-channels` (verify before sizing). | S | |
| R-16 | Staff limits (discount limit per role, export permission, end-of-day cash/bKash handover) | DIFFERS | roles/permissions (`packages/auth`), `orders.exportPersonal` | Price-adjust limits per role (O-16); the rest is Part 3 (Settings) | S | O-16 |
| R-17 | Score accuracy report in Rules > Order flow | DIFFERS | `reports/flags`, `reports/stopped`, `reports/learning` (PR 164/524), `flag-report.ts` | Band table + one suggestion line over the same data | S | O-10 |

## 4. Schema gaps (additive migrations only; nothing dropped or renamed)

1. `CourierPayout` (+ link to covered `CodCollection`/shipments) and optional adapter capability `payouts` (C-06).
2. `CourierClaim`: enum values `SHORT_COD`, `RETURN_SHORT`; column `deadlineAt` (C-08). `settledMinor` already holds "recovered".
3. `ShipmentStatus`: optional `AT_HUB`, `ON_HOLD_COURIER` (or keep in `providerStatus`) (section 0).
4. `OrderPriceAdjustment` (kind AMOUNT / PERCENT / WALLET / FREE_DELIVERY, minor units, reason, actor, approvedBy, state) (O-16).
5. Confirm event metadata `confirmedBy` RULE/STAFF + reason (O-03, O-09): a nullable column on `OrderEvent` or JSON in its data.
6. Order merge record (`mergedIntoId` / merge event) for O-15; `OrderGroup` stays.
7. `BulkQuote` (+ batches) next to `BulkEnquiry` (O-35).
8. `Offer` umbrella (or a read model) over `Coupon`, discount rules, `RewardRule`, wallet credit (R-13).
9. `CheckoutDraft`: `recoveredById`, `recoveredAt`, `possibleMatch` flag (O-32).
10. `PrintJob`: `pinVerifiedAt` (O-19). Settings only (no tables): `fulfilment.packOnPrint`, courier messages JSON, courier default/backup, stuck hours, hold hours, auto-confirm table, courier score bands/weights/limits, peak capacity, advance reminder hours, price-adjust limits per role.

## 5. Integrations that stay mock-only until the owner types keys (A1.3, mock first)

- Couriers: Steadfast and Pathao are coded behind `CourierApi` but run in practice/sandbox until the vault keys pass the Test button (PR 176/177); mock + practice parcels for tests (`adapters/courier/mock.ts`, `practice.ts`). RedX, Paperfly, eCourier: not built. Payout/payment-request: not built for any courier. Courier fraud history (`adapters/fraud-check`): mock.
- Messages: SMS (`adapters/sms`), WhatsApp (`adapters/whatsapp`), Telegram approvals (`adapters/telegram`, used for price-adjust OK), web push: mock until keys.
- Payments: bKash, Nagad, card (PR 167-169) and payment links `/pay/<token>`: mock/test payments until keys (`payments.testPayments`).
- ERP (stock hold release, returns check 7 days, claims): `adapters/erp` runs against the ERP contract v6; the switch-over is a separate owner step.
- AI one-line next to the score: S15 is frozen (CN-047). Ship a plain-text reason; call AI only if S15 already exposes it.
- Courier live "rider name/phone": no courier API gives it; the prototype shows it, the real screen must hide it when empty.

## 6. Proposed new register PRs (numbers assigned at filing; stage "S28 Admin v5")

| # | Title | One-line scope | Size |
|---|---|---|---|
| N1 | Orders section re-map and Processing view | Orders nav = prototype tabs over existing pages, redirects, Processing view, date presets on lists, Cancelled summary | M |
| N2 | Batch page (Current / Past) | Pipeline counts, Stuck chips, Your work / Moved on by itself with reasons, Past batches from hand-over sheets | M |
| N3 | Auto-confirm rules engine | Confirm-by-rule for COD (trusted, good score), call list, red tag, `confirmedBy` + reason, all numbers settings, default off | L |
| N4 | Courier score out of 10 | 6 metrics, owner bands, weights, limits, source + age, unknown -> call list, accuracy report | M |
| N5 | Price adjust on orders | Amount / % / wallet / free delivery, reason, per-role limits, owner approval, PIN | L |
| N6 | Merge orders | Merge command with editable merged order, Merge + call, rules (window, auto switch off, no merge after Packed) | M |
| N7 | To ship screen | Bulk Book with default/other courier, print once + PIN reprint + log, pack-on-print, Print all (summary + picking + stickers), peak "in parts" | M |
| N8 | With courier: live status, stuck alert, backup courier | Tracking drawer, stuck-parcel alert, day-end check page, backup move with PIN | M |
| N9 | Couriers section + Courier 360 | Overview, 8-section Courier 360, tabs also in Finance and Reports | L |
| N10 | Courier payouts via the courier's own request | `CourierPayout`, adapter capability, status read-back, settle on Paid, Steadfast first | L |
| N11 | RedX courier adapter | Create, track, areas behind the contract, mock first | M |
| N12 | Courier claims ledger v5 | New kinds + deadline, one ledger shared with ERP claims, Finance line, recovered money posts | M |
| N13 | Courier messages | Editable event messages with placeholders in Rules, per-order booking note | M |
| N14 | Rules one-page layout | Group nav, sentence rows, pills, status strip, right editor, Order flow group (moves risk-rules settings) | M |
| N15 | Offers & Discounts 360 | Wizard, unified list, results per offer, calendar, approvals; online-payment reward as an offer | L |
| N16 | Pop-ups & notices hub | 12 system placements with where/who/picture + custom notices | M |
| N17 | Bulk / corporate admin | Enquiries list, quote, agreed price, advance + balance, company invoice, delivery in batches | M |
| N18 | Incomplete orders v5 | Newest-first by day, Customer 360 link, call log, Confirm as order, templates, ordered-later list, journey report | M |
| N19 | Peak / Eid mode | Daily capacity cap, print in parts, roster, cut-off promise texts switch | S |
| N20 | Replacement path | Defective / wrong item: free reship case on the returns board, old piece back | M |
| N21 | Phone order (verify scope) | Staff creates an order on a call | M |

## 7. Delta follow-ups on existing PRs

| PR | What changes |
|---|---|
| 140 | Date range + presets, chips named as steps, "lowest score" sort, Bulk chip |
| 141 | Order page layout, lifetime figures, send-message modal, previous orders expand; Processing chips |
| 145 / 520 / 522 | Merge command hook (N6); look-back window default 5 days |
| 146 / 188 | "Send right size" wording only |
| 156 / 157 / 559 | Courier score /10 view and unknown handling (N4) |
| 161 / 541 / 542 | Presets Low/Normal/Strict fill the auto-confirm table; Processing view uses sections; advance reminder hours |
| 176 / 177 | `payouts` capability, default courier, backup courier |
| 178 | Per-area routing "money saved" monthly line |
| 179 / 180 | PIN on reprint, visible print log |
| 181 / 182 | `packOnPrint`, summary line, colour in sort |
| 183 | Wait hours + "send the rest" setting |
| 184 | `at_hub` / `on_hold` mapping, stuck alert, auto refresh |
| 185-191, 612, 613 | Sub-tab labels, date filters, replacement rule, reminder timers |
| 192 | Courier 360 tabs; claim kinds, deadline, recovered; ledger merge with ERP claims |
| 197 / 198 | Order hold hours (default 12) |
| 208-219 | Group nav layout, Sample pill, status strip, PIN on money rules |
| 213 / 271 / 272 | Prepaid reward as an Offer; Offers 360 facade |
| 193 / 214 | Peak mode capacity cap |
| 216 | Hub list of the 12 placements |
| 274 / 275 / 276 | Newest-first by day, ordered-later list, Confirm as order, templates |
| 545 / 563 | Retry schedule, auto-cancel switch |
| 606 | Admin screen for bulk enquiries |
| 554 | Courier setup page links the zone sync |
