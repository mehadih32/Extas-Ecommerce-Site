# Extas Retail website: changes needed for the new ERP retail model

**For:** the Claude session that builds the Extas Retail e-commerce site.
**From:** the Extas ERP project, 24 October 2026.
**Version:** 6. It answers the site's 30 points of 24 October 2026 (exchanges, daily summary, switch-over and the rest).
**Status:** the agreed requirements. The ERP side is **not built yet**. Plan now, but do not switch the live site until the ERP announces the switch date and sends the final `openapi.yaml` with the build. Field names may still be renamed in that final contract.

**Owner's answers still open.** A few ERP rules below need the owner's yes or no. They are marked **(owner: Q1)** to **(owner: Q8)**, and the text describes the answer the ERP recommends. If the owner says no to any of them, the ERP sends a new version.

**The model, in one line:** to the ERP, Extas Retail is a separate buyer. The ERP only keeps track of which pieces it gave, which it took back, what it was paid and what is still owed. Retail keeps its own profit and loss and sends the ERP its own correct figures.

---

## 0. What changed from version 5

1. **Exchanges are new** (section 2.10). An exchange is a new order that names the line it replaces. The ERP sends the new piece without billing it, waits for the old piece, and then settles only the price difference. If the old piece does not come back in time, or is declined, the new piece is billed.
2. **When the ERP bills an order:** when the parcel leaves (the shipment is recorded), at the `shopPrice` fixed when the order was placed. It no longer bills when the order is placed (section 2.3, owner: Q1).
3. **Daily summary** (section 2.6):
   - `costs.goods` is now the site's own cost of the pieces sold that day. The v5 rule "`costs.goods` = the change in what Retail owes" and its check are gone.
   - New lines: `income.deliveryCharges`, `costs.paymentFees`, `costs.accessories` and `costs.returnLosses`. The `returnLosses` line keeps the profit right now that `goods` only counts pieces that were sold.
   - `salary` moves out to a new call for fixed costs (`PUT /fixed-costs/{month}`, section 2.11).
   - New `incomplete` list for figures the site does not have yet.
   - Any past day can be sent again at any time.
4. **Event ids** are confirmed as unique forever (section 2.8).
5. **Catalog:** the site gets only `shopPrice`. `retailPrice` and `avgCost` are no longer sent (section 2.1, owner: Q7).
6. **Old calls:** the final list of which old calls stay and which are retired (section 2.12).
7. **Calls to the site** (`/erp-api/*`): the signing is confirmed (section 2.7).
8. **Switch-over:** how the ERP handles open old orders, and the new `GET /cost-of-goods` to fill the month's summaries backwards (section 3, owner: Q5 and Q6).
9. **Return stock piece fails the packing check:** the new `order.line.short` webhook, and a call to wait for that line, replace it or cancel it (section 2.3).
10. **Account:**
    - The 3-month hold now counts days since the last payment (owner: Q3).
    - `GET /account` shows the hold's reason and its countdown.
    - `GET /account` gives the totals for a date range, so the site can check its figures against the ERP's (section 2.4).
11. **Returns:**
    - The ERP has a "check within N days" setting and reminds the owner (owner: Q4).
    - Missing pieces and parcels carry the claim details.
    - Return lists take `receivedCount` and `note` (section 2.5).
12. **Rounding:** `customerPrice` goes in whole taka, and the ERP never refuses an order for a 1-taka gap (section 2.5.1).

---

## 1. What is changing in the ERP, and why

Until now (contract CN-005), each website order became an ERP sale **at the website's selling price**. Each return went **straight back into ERP stock**. The ERP also recorded the **customer's payments**.

The owner has decided on a new business model:

- **Extas Retail is a separate business.** It keeps its own books on the website.
- **To the ERP, Extas Retail is a special wholesale buyer.** It buys each piece from the ERP at a **shop price** set by the owner (for example cost 600, shop price 650). It can buy a single piece at a time.
- **The ERP bills Retail for every website order at the shop price** when the parcel leaves. The customer's price is Retail's own business. The ERP keeps it with the order for reporting only.
- **Extas Retail pays the ERP on account,** like any wholesale buyer. The ERP's Accounts team records those payments. The ERP no longer records customer payments.
- **Returns change money only after the owner checks them.**
  - The site reports each courier result and each courier return list, with consignment IDs.
  - The ERP puts the pieces in a separate **Return stock**, or on **Hold** when it cannot tell which pieces came back.
  - Until the owner checks a piece in the ERP, it stays on Retail's account.
  - **Approved** A-grade pieces then come off Retail's account at the price Retail paid.
  - **Declined** pieces (B-grade, C-grade, damaged, used, missing, wrong) stay on Retail's account and are Retail's loss. They are never sold anywhere and never get a part credit. A declined returned piece never goes into the ERP's B-grade stock; the B-grade lines the site sells are only the factory's own B-grade.
  - Details are in section 2.5.
- **Exchanges** run through the ERP the same way: the new piece is sent unbilled, and money settles when the old piece is checked (section 2.10).
- **B-grade stock is sold to Retail too,** as separate lines with their own lower shop price.
- **Bought-in stock:** the owner sometimes buys finished goods from a supplier only for retail. The ERP records that purchase and reserves the pieces for the shops. To the website they are ordinary styles with ordinary SKUs and a shop price. The site needs no special handling, and must never record such a purchase in its own stock.
- **Unchecked returns can be sold again.**
  - When a SKU is out in main stock but has pieces in Return stock, the ERP still offers it to Retail and fills the order from Return stock.
  - The owner checks that piece at packing. If it passes, the earlier return is approved and the new order is a normal sale.
- **Partial deliveries:**
  - The ERP works out which pieces a customer kept, from the courier's amount or from a "Partial delivery" mark the site's staff make on the order.
  - When it cannot tell, the parcel goes on Hold and the owner ticks the pieces in the ERP.
- **Account hold:**
  - When Retail owes money and has made no payment for 90 days, the ERP refuses new orders (owner: Q3).
  - The owner can lift the hold with a PIN.
- **Several shops:** more shops (online or showrooms) may be added later. Each gets its own API key. Build every feature per shop, never hard-coded to "Extas Retail".
- **Daily figures:**
  - The ERP shows the owner Retail's own figures: sales, costs, profit, ads, customers.
  - They come from a **daily summary** the website must send **every day without fail**, and from the monthly fixed costs.

## 2. What the website must do

### 2.1 Products: import by style code

- **Import action.** Add an "Import from ERP" action.
  - The admin types a **style code** (for example `EX-PL-001`).
  - The site pulls every SKU of that style from `GET /catalog/variants?styleCode=EX-PL-001` (a new filter), with colour, size, barcode, images if any, and **`shopPrice`**.
- **SKUs.** One SKU is one colour and one size. The ERP builds it as `STYLE-COLOUR-SIZE`, for example `EX-PL-001-NAVY-XL`. The site's own product groups these into one product with colour and size options.
- **Show the admin `shopPrice`** ("bought from ERP at"). The admin sets the site's own selling price on top of it. Do not show it to customers.
- **Only the shop price (owner: Q7).**
  - For a retail shop the ERP sends `shopPrice` and nothing else about money.
  - `retailPrice` (the ERP's own price list) and `avgCost` (the ERP's own cost) are no longer sent from the switch date. Stop reading them.
- **B-grade lines** come as the same SKU with `grade: "B"`, their own `shopPrice` and their own stock.
  - Sell them as separate listings, for example a "B-grade / outlet" section.
  - Skip them if the admin turns that off.
- **Keep it in sync.**
  - The existing `variant.changed` webhook now also fires when `shopPrice` changes.
  - Update the stored purchase price, but never change the site's selling price by itself. Flag the change to the admin instead.

### 2.2 Stock

- **No change to how stock works.** Keep using `GET /stock`, `GET /stock/{sku}` and the `stock.changed` webhook.
  - `available` already leaves out stock reserved for other buyers.
  - Each row now has `grade` ("A" or "B").
- **Return stock counts for the shop.**
  - `available` includes the unchecked returned pieces of that SKU, and a new field `fromReturnStock` says how many of them there are.
  - Sell them as normal stock, and do not show customers the difference.
- **New stock in the ERP reaches the site within a minute.** No action is needed.

### 2.3 Orders

- **Sending orders.** Keep `POST /orders` as now.
  - Keep sending `unitPrice` and `discount` as the customer's price. The ERP keeps it for Retail's reports.
- **What the ERP bills, and when (owner: Q1).**
  - The answer to `POST /orders` adds `erpTotal` (what Retail will owe the ERP for this order) and `shopPrice` on each line. The price is fixed at that moment.
  - The ERP bills Retail when the parcel leaves: when `POST /shipments` records the courier booking. If an order reaches a delivery result with no shipment, it is billed at that moment.
  - The bill date is in `billedAt` on the order.
  - An order cancelled before it leaves is never billed.
  - Store `erpTotal` and `billedAt` in the site's books.
- **Handle the refusals:**
  - `409 ACCOUNT_ON_HOLD`:
    - Show the admin "Orders to the ERP are on hold" with the reason from `GET /account`.
    - Do not lose the order: queue it and retry when the `account.released` webhook arrives.
  - `409 NO_SHOP_PRICE`: the SKU has no shop price yet. Stop selling that SKU and alert the admin.
  - `409 INSUFFICIENT_STOCK` (`details.shortSkus`: `sku`, `wanted`, `available`): nothing is saved or reserved.
    - The ERP keeps 4xx answers against the `Idempotency-Key`, so **retry with a new key** after stock arrives.
- **Grade:** each order line needs `grade` ("A", the default, or "B").
  - Updated 31 Oct 2026 (CN-033): until the ERP's separate B-grade release, a B-grade line (and a REPLACE with grade B) answers `422 VALIDATION` with `details.bGradeSkus`. The shop holds such an order (`B_GRADE_CLOSED`) while `erp.orders.bGradeOpen` is off.
- **Lines filled from Return stock.**
  - The ERP takes main stock first, and Return stock only when main stock is out.
  - Such a line comes back with `fromReturnStock: true`.
  - Show it in the site's admin order view as "From ERP return stock", so Retail's staff know the piece is checked at packing.
  - It is a normal sale at the `shopPrice` fixed on the order. When the owner passes the piece, the ERP also sends `APPROVED_AT_PACKING` for the earlier return (section 2.5.4).
- **When that piece fails the packing check.**
  - The piece is declined. The loss is Retail's once, on the earlier return; the new order is not charged for it.
  - The ERP sends the webhook `order.line.short` (`externalOrderId`, `lineId`, `sku`, `reason: "RETURN_PIECE_FAILED_CHECK"`, `eventId`). The line, and with it the whole order, waits.
  - Show it to the admin, who picks one of these through `PATCH /orders/{externalOrderId}/lines/{lineId}` (new):
    - `{ "action": "WAIT" }` (also what happens when the admin does nothing): the ERP fills the line when that SKU is back in stock, sends `order.line.filled` and the order goes on.
    - `{ "action": "REPLACE", "sku": "EX-PL-001-BLACK-XL", "grade": "A" }`: another piece, or another colour or size. It is checked for stock like a new order line and priced at that SKU's `shopPrice` today. The answer gives the new `erpTotal`.
    - `{ "action": "CANCEL", "reason": "customer agreed" }`: the line is dropped and never billed. The rest of the order goes on. The ERP never deletes it: the line stays in the order's history as cancelled.
- **New order fields** for returns, partial deliveries and exchanges: see sections 2.5.1 and 2.10.

### 2.4 Payments and Retail's account

- **Stop calling `POST /payments`** for customer money, including COD and bKash. After the switch date the ERP answers `410 GONE`.
- **Retail pays the ERP separately,** by bank, bKash or cash. The ERP's Accounts team records it and sends `payment.recorded`.
- **`GET /account`** (new) gives what Retail owes:

```json
{
  "balance": 125000,
  "waitingCheck": 11700,
  "exchangesAtRisk": 3200,
  "hold": {
    "onHold": false,
    "reason": null,
    "lastPaymentAt": "2026-11-20",
    "daysSinceLastPayment": 10,
    "holdsOn": "2027-02-18",
    "warnFromDays": 75
  },
  "period": {
    "from": "2026-11-01",
    "to": "2026-11-30",
    "openingBalance": 98000,
    "ordersTotal": 210500,
    "exchangesTotal": 1450,
    "otherCharges": 0,
    "creditsTotal": 18950,
    "paymentsTotal": 166000,
    "closingBalance": 125000
  },
  "statement": []
}
```

- **The parts of the answer:**
  - `waitingCheck`: returned pieces still waiting for the owner's check. Not counted for the hold.
  - `exchangesAtRisk`: new exchange pieces that are not billed yet (section 2.10). Not part of `balance`.
  - `period`: only when the site asks with `?from=YYYY-MM-DD&to=YYYY-MM-DD`; amounts go by the ERP's bill and credit dates.
    - `closingBalance` = `openingBalance` + `ordersTotal` + `exchangesTotal` + `otherCharges` − `creditsTotal` − `paymentsTotal`.
    - `exchangesTotal` is the net of exchange bills, extras, adjustments and exchange credits.
    - `otherCharges` is the one-time switch-over transfer (section 3).
  - `statement`: one row per bill, credit and payment in the period, with its date, its amount and the order, return or payment it belongs to.
- **The 3-month hold (owner: Q3).**
  - It counts days since Retail's last payment, not the age of each bill.
  - When Retail owes money (not counting `waitingCheck`) and 90 days pass with no payment, the account goes on hold. With no payment ever, the 90 days count from the first unpaid bill.
  - Any payment starts the count again.
  - `holdsOn` is the date the hold will start if no payment comes. From `warnFromDays` days, warn the admin in the site.
  - When the account is on hold, `reason` says why, for example `"No payment for 92 days"`.
  - Whether the site keeps checkout open during a hold is the site's own setting. The ERP still refuses the orders, and the site queues them.
- **Check your figures against the ERP every day.**
  - Work out the balance yourself: `erpTotal` of billed orders + exchange bills − credits − payments.
  - Compare it with `GET /account?from&to`. Show any difference to the admin, and fix it by pulling `GET /returns?updatedSince=` and `GET /exchanges?updatedSince=`.

### 2.5 Delivery results, courier returns and the owner's check

**The one rule:** money between Retail and the ERP changes **only when the owner checks a returned piece in the ERP**. Until then every returned piece stays on Retail's account, at the price Retail paid. All decisions are made in the ERP, never on the site. The site only reports what the courier and its own staff know, and then mirrors the ERP's results.

**The five stages of every returned parcel** (use the same names on the site):

| Stage                | Who acts                                         | Retail's account with the ERP                                               | Where the pieces are                               |
| -------------------- | ------------------------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------- |
| 1. `DELIVERY_RESULT` | site reports the courier's result                | no change                                                                   | customer or courier                                |
| 2. `HANDED_BACK`     | site reports the courier's return list           | no change                                                                   | ERP: Return stock (known pieces) or Hold (unknown) |
| 3. `HOLD_RESOLVED`   | owner ticks the pieces in the ERP                | no change                                                                   | ERP: Return stock                                  |
| 4. `CHECKED`         | owner approves or declines each piece in the ERP | **approved A-grade: reduced by the price Retail paid**; declined: no change | approved: ERP main stock; declined: Retail's       |
| 5. `CLOSED`          | nothing                                          |                                                                             |                                                    |

#### 2.5.1 Order data the ERP needs (added to `POST /orders`)

- **On each line:**
  - `lineId`: the site's own id for the line, for example `WEB-1043-3`.
  - `customerPrice`: the customer's price for that piece after the combo split and discounts.
  - `comboId`: when the piece is part of a combo.
- **On the order:**
  - `deliveryCharge`: what the customer was to pay; 0 for free delivery.
  - `advancePaid`: bKash or another advance.
- **Rounding:**
  - Send `customerPrice` in whole taka, and put the remainder of a combo or discount split on the last piece. For example, a combo of 3 at 1600 is 533, 533 and 534.
  - Where `customerPrice` is sent, the ERP uses it and does not split the combo itself.
  - The ERP's check that the lines add up allows 1 taka per order and never refuses an order for it. Its partial-delivery engine already allows ±20.

#### 2.5.2 Stage 1: report every delivery result

When the courier marks an order delivered, partly delivered or returned, call `PUT /orders/{externalOrderId}/delivery` (new):

```json
{
  "status": "PARTIAL",
  "courier": "PATHAO",
  "consignmentId": "PATHAO-88341",
  "collected": 1500,
  "at": "2026-11-02T15:40:00+06:00",
  "mark": {
    "keptLines": ["WEB-1043-3"],
    "discountGiven": 0,
    "phoneConfirmed": true,
    "note": "kept the polo, returned pant and T-shirt"
  }
}
```

- `status` is `DELIVERED`, `PARTIAL` or `RETURNED`.
- **The "Partial delivery" mark.**
  - Add a "Partial delivery" box to the site's order page. Staff tick the lines the customer kept and enter the amount paid and any discount promised by phone.
  - When staff fill it in, send it as `mark`. Send it again (the same call) whenever staff change it before the parcel is handed back.
  - **Any discount promised by phone must be written there.** The ERP never guesses a discount.
- **The ERP works out partial deliveries itself when there is no mark.**
  - It tries every set of kept lines against `collected`: a delivery charge of 0 to 200, rider rounding of ±20, the combo split, the advance and recorded discounts only.
  - It answers with `identification`:
    - `GREEN`: one answer fits.
    - `YELLOW`: the count and value are certain, but the exact colour or size is not.
    - `ORANGE`: unclear. The parcel will go on Hold.
  - Show this colour on the site's order page.
- **Full returns.** A `PARTIAL` whose `collected` is below the cheapest piece and within 200 is a full return: only the delivery charge was paid.
- **Money in the site's books.** The delivery charge, and anything the customer underpaid or the rider failed to collect, are Retail's own income or loss. They never reach the ERP.

#### 2.5.3 Stage 2: report each courier return list

When the courier hands back a lot, call `POST /return-lists` (new). `returnListId` is the idempotency key:

```json
{
  "returnListId": "RL-123",
  "courier": "PATHAO",
  "handedBackAt": "2026-11-05",
  "parcels": [
    {
      "consignmentId": "PATHAO-88341",
      "externalOrderId": "WEB-1043",
      "receivedCount": 2,
      "note": "packet torn on one side"
    },
    {
      "consignmentId": "PATHAO-88355",
      "externalOrderId": "WEB-1050",
      "receivedCount": 1
    }
  ]
}
```

- **Do not list the pieces.** The ERP knows them from stage 1: one set of facts, one source.
- **`receivedCount` and `note`** (optional) are the site's evidence: how many pieces staff counted in the parcel, and what they saw.
  - The ERP shows them on the Hold popup and the check page.
  - When `receivedCount` differs from the pieces the ERP expects, the parcel is highlighted for the owner. The ERP does not decide anything from it.
- **`handedBackAt` is the courier's date** that the parcel reached the merchant. The ERP uses this date for every deadline, not the day the site sends the list.
- **The answer has one row per parcel:**
  - `IN_RETURN_STOCK`, with the pieces.
  - `HOLD`: the owner must tick the pieces.
  - `REFUSED`, with a reason:
    - `NOT_OUR_ORDER`.
    - `NOT_RETURNED`: the order was delivered in full and is not an exchange.
    - `ALREADY_HANDED_BACK`.
  - Fix a refused parcel and send the list again.
- **Returns that do not come through a courier** (for example handed in at a showroom) use the same call with `courier: "HAND"` and one parcel per order.
- **Exchange returns** use the same call, naming the exchange order (section 2.10).
- **No money changes at this stage.** Retail still owes the ERP for every piece.

#### 2.5.4 Stages 3 and 4: results the ERP sends back

All of these come as webhooks with an `eventId`. Store each one once: a repeated webhook changes nothing. The site can also pull them with `GET /returns?updatedSince=` (new) to catch anything missed. Run it every hour and on start-up.

- **`return.parcel.resolved`:** the owner ticked a Hold parcel. It gives the pieces that came back, or `PARCEL_MISSING`.
- **`return.piece.decided`:** one per piece, after the owner's check.
  - `APPROVED`: A-grade, back in ERP main stock. `credit` is the price Retail paid. **Reduce what Retail owes the ERP by `credit`** on the webhook's date.
  - `DECLINED`, with a `reason`: `B_GRADE`, `C_GRADE`, `STAIN_OR_DAMAGE`, `USED`, `NO_TAG`, `PIECE_MISSING`, `WRONG_ITEM`, `PARCEL_MISSING` or `OTHER`.
    - **No money change.** Retail already paid for the piece through its account and keeps the loss.
    - Record it in the site's Returns section, and in `costs.returnLosses` of that day's summary (section 2.6).
  - `APPROVED_AT_PACKING`: an unchecked piece from Return stock was sent on a new order, and the owner passed it at packing. `credit` works as for `APPROVED`. The new order has its own `erpTotal` as usual.
  - `DIFFERENT_PIECE`: the parcel held a different piece from the one expected. The ERP gives the corrected piece; update the site's record. No money change.
  - **For a piece returned on an exchange**, the event also carries `exchangeId` and its `credit` is always 0. The exchange's money comes only through the `exchange.*` events (section 2.10), so nothing is counted twice.
- **Claim details.** `PARCEL_MISSING` and `PIECE_MISSING` (and `STAIN_OR_DAMAGE`, which may be the courier's fault) carry `returnListId`, `consignmentId`, `courier`, `handedBackAt` and `decidedAt`, so the site can claim from the courier in time.
  - `GET /returns/claims?from&to` (new) lists them.
- **Corrections.** If the owner reverses a decision, the ERP sends `return.piece.decided` again with `reverses: <eventId>`. Undo the earlier effect and apply the new one.

#### 2.5.5 How soon the owner checks (owner: Q4)

- **The setting.** The ERP has a per-shop setting, "Check returns within", **3 days** by default, counted from `handedBackAt`. The owner can change it.
- **Reminders to the owner:**
  - The day before the deadline, and on the day, the owner gets a reminder with the count and value of what is still unchecked (Hold and Return stock).
  - After the deadline those parcels show red until they are checked.
  - This replaces v5's reminders at 7 and 15 days.
- **The deadline is for the owner only.** A piece checked late is still decided in the normal way, and nothing on the site has to wait for it.

#### 2.5.6 Why nothing is ever counted twice

| Event                                       | ERP books                                             | Site books                                                |
| ------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| Order placed                                | nothing yet (`erpTotal` fixed)                        | nothing yet                                               |
| Parcel leaves (shipment)                    | sale to Retail at `shopPrice`; Retail owes more       | the site's own bill from the ERP: `erpTotal`              |
| Delivery result, return list, Hold resolved | nothing                                               | status only                                               |
| Pieces delivered to the customer            | nothing                                               | sale, and its cost of goods (`costs.goods`)               |
| `APPROVED` or `APPROVED_AT_PACKING`         | sale and profit reduced by `credit`; Retail owes less | bill from the ERP reduced by `credit`; no cost line       |
| `DECLINED`                                  | nothing                                               | `costs.returnLosses` (the piece was paid for and is lost) |
| Exchange events (section 2.10)              | bill, extra, adjustment or credit, as the event says  | as section 2.10.6                                         |
| Delivery charge, customer underpaid         | nothing                                               | Retail's own income or loss                               |

- **No time limit.** The owner may check pieces weeks later. Nothing on the site needs to wait for it.
- **Retail's balance.** The ERP leaves the value of unchecked returns out of the hold rule, and `GET /account` shows it separately as `waitingCheck`.

### 2.6 Daily summary: must arrive for every day

- **The call.** `PUT /daily-summaries/{date}` (date `YYYY-MM-DD`, Asia/Dhaka).
  - It is idempotent: sending a day again replaces that day.
  - **Any past day can be sent again at any time**, whenever a cost is updated (ads, packaging, accessories, a daily expense).
  - The ERP keeps every version and shows the owner what changed.
- **Send it every day at 00:30 for the day before,** even with no sales (send zeros).
- **If it fails,** keep it in a queue and retry with backoff (1, 5, 15 and 60 minutes, then every hour) until the ERP answers 2xx.
- **Answer the ERP's reminder.** The ERP checks at 01:00. For any missing day it sends the webhook `summary.missing` with `{ dates: [...] }` and repeats it every hour. When it arrives, send those days at once.
- **Keep the ERP's answers.** Store each summary the site sent, and the ERP's reply, in a log the admin can see.
- **Fill gaps.** `GET /daily-summaries?from&to` (new) returns which days the ERP has, so the site can fill any gap by itself, for example after downtime.

**Body (draft).** Every amount is in BDT. Only these fixed categories are allowed, so do not invent others:

```json
{
  "date": "2026-11-02",
  "orders": { "count": 42, "pieces": 61 },
  "sales": {
    "gross": 98500,
    "discounts": 6200,
    "customerReturns": 3900,
    "net": 88400
  },
  "income": { "deliveryCharges": 3700 },
  "deliveries": {
    "delivered": 37,
    "failed": 2,
    "returned": 3,
    "codPending": 21500
  },
  "costs": {
    "goods": 41250,
    "returnLosses": 650,
    "packaging": 1850,
    "delivery": 4600,
    "paymentFees": 650,
    "accessories": 400,
    "ads": {
      "facebook": 5200,
      "instagram": 0,
      "google": 1300,
      "tiktok": 0,
      "other": 0
    },
    "other": 900
  },
  "returns": {
    "handedBackPieces": 4,
    "approvedCredit": 2600,
    "waitingCheckValue": 11700
  },
  "customers": { "new": 18, "returning": 11 },
  "incomplete": ["ads"],
  "netProfit": 35300
}
```

- **`sales`** go on the day the customer receives the goods (the delivery day).
- **The cost lines:**
  - `costs.goods`: the ERP price of the pieces in that day's `sales`, the pieces customers kept. Add exchange extras and subtract exchange adjustments on the day the exchange settles (section 2.10.6).
    - This is the site's own figure. **The ERP no longer checks it against Retail's account**: v5's rule "goods = the change in what Retail owes" is gone. The ERP takes Retail's account from its own ledger.
  - `costs.returnLosses`: the ERP price of pieces Retail paid for and cannot sell, on the day the ERP decides them. That is pieces `DECLINED`, and exchange pieces billed through `exchange.billed`.
    - Without this line, a declined piece would never show in Retail's profit, because it is not in `goods`.
  - `costs.paymentFees`: payment gateway, bKash and COD collection fees.
  - `costs.accessories`: gift boxes, tags, inserts and the like that are not packaging.
  - `costs.delivery`: what the site pays the courier.
  - `costs.other`: daily expenses that fit no other line.
  - **Fixed monthly costs** (salary, rent, electricity) are no longer in the daily summary. They go through `PUT /fixed-costs/{month}` (section 2.11).
- **`income.deliveryCharges`:** the delivery charges the customers paid.
- **`returns`:** for information only, never added to costs.
  - `approvedCredit`: that day's `credit` from `APPROVED` and `APPROVED_AT_PACKING`.
  - `waitingCheckValue`: the value still waiting for the owner's check at the end of the day.
- **`incomplete`:** the categories the site does not have yet for that day, for example `["ads"]` when the ad platforms have not reported.
  - Send what is known so far. The ERP marks those figures "not complete yet" for the owner and never reads a missing figure as 0.
  - Send the day again when it is complete, with that category taken off the list.
  - Allowed keys: `orders`, `sales`, `income`, `deliveries`, `goods`, `returnLosses`, `packaging`, `delivery`, `paymentFees`, `accessories`, `ads`, `other`, `customers`.
- **`netProfit`:** `sales.net` + `income.deliveryCharges` − all `costs` (goods, returnLosses, packaging, delivery, paymentFees, accessories, ads, other). It is the profit **before** fixed costs.
  - The ERP checks the sum and warns the owner if it does not match. The ERP takes off the fixed costs itself.
- **Check the sample:**
  - Costs: 41250 + 650 + 1850 + 4600 + 650 + 400 + 6500 + 900 = 56800.
  - Profit: 88400 + 3700 − 56800 = 35300.
- **Ad spend:** the daily summary's `costs.ads` is the only ad figure. `POST /ad-spend` is retired on the switch date (section 2.12).

### 2.7 Data the ERP asks for only on click

When the owner clicks "Top products" or "Customers" in the ERP, the ERP calls the site **live**. The site must expose two endpoints under its own base URL:

- **The endpoints:**
  - `GET {site}/erp-api/top-products?from&to&limit=20`: SKU, name, pieces, net sales, profit.
  - `GET {site}/erp-api/customers?page&pageSize=50&search=`: name, address, phone, total spent, last purchase date, number of orders, first order date.
- **Signing (confirmed).** The ERP signs each request with the same headers and the same webhook secret as its webhooks: `X-Extas-Signature: sha256=<hex>` and `X-Extas-Timestamp: <Unix seconds>`.
  - Because these requests have no body, the signed text is `METHOD\nPATH?QUERY\nTIMESTAMP`, for example `GET\n/erp-api/customers?page=1&pageSize=50\n1793606400`. This way a signature works only for that exact request and that moment.
  - The site must check the signature with a constant-time compare, and refuse anything more than 5 minutes from its own clock.
- **Tell the owner the base URL.** The site's admin shows the `{site}` base URL to put into the ERP's shop settings.
- **The ERP does not store customer lists.** It shows them and forgets them. Do not push customer lists to the ERP.

### 2.8 Webhooks and event ids

- **The signature scheme is unchanged** for every webhook.
- **Event ids (confirmed):**
  - Every event has an `eventId` (also in `X-Extas-Delivery`). The ERP makes it once, as a random UUID, when the event happens, and sends the same id on every retry.
  - **An id is never used again for another event, ever.**
  - A correction is always a new event with its own `eventId`, plus `reverses: <the old eventId>`.
- **Events that move money or credit** must be stored in a permanent filter, not the 72-hour one: `return.piece.decided` (`APPROVED`, `APPROVED_AT_PACKING`, and any event with `reverses`), `payment.recorded` and every `exchange.*` event. The pull calls (`GET /returns`, `GET /exchanges`) return the same `eventId`s, so the one filter covers both paths.
- **The new events are:**
  - `delivery.identified`: the ERP's answer for a delivery result (`GREEN`, `YELLOW` or `ORANGE`, with the pieces it thinks came back).
  - `return.parcel.resolved` and `return.piece.decided` (section 2.5.4).
  - `order.line.short` and `order.line.filled` (section 2.3).
  - `exchange.billed`, `exchange.settled`, `exchange.credited` and `exchange.cancelled` (section 2.10).
  - `summary.missing`.
  - `account.hold` and `account.released`.
  - `shop-price.changed` (or included in `variant.changed`).
  - `payment.recorded`: the ERP recorded money from Retail, so the site can update the balance it owes.

### 2.9 A Returns section on the site

Open a **Returns** section in the site's admin, so Retail's books show exactly what the ERP shows.

- **Tabs that match the ERP:** "Partial deliveries", "Handed back", "On hold in ERP", "In ERP return stock", "Exchanges", "Approved" and "Declined (our loss)".
- **Each parcel's timeline:** the delivery result and its colour (green, yellow or orange), the return list and consignment ID, the owner's tick, and each piece's decision with its reason and date. Show it read-only: decisions are made only in the ERP.
- **Losses report:**
  - Declined pieces and billed exchange pieces, by reason and month, at the price paid to the ERP.
  - The delivery charges and underpayments the site kept or lost.
  - These are Retail's losses, never the ERP's.
- **Courier claims:** the list from `GET /returns/claims`, with the return list ID, consignment ID and dates, ready to send to the courier.
- **Daily check with the ERP.**
  - Every night, compare the site's Returns section with `GET /returns/summary?date=` (new): pieces handed back, on hold, in return stock, approved (with the total `credit`) and declined.
  - Show any difference to the admin, and fix it by pulling `GET /returns?updatedSince=`, never by editing numbers by hand.

### 2.10 Exchanges (new)

An exchange is a customer swapping a piece they received for another (another size, colour or style).

#### 2.10.1 The rules

1. **Approval.** The site's admin approves the exchange in the Retail panel, and marks **which `lineId`s** are being exchanged. The other lines of the order stay as they are.
2. **The call.** The moment it is approved, the site calls the ERP with a new order that names the old order and the lines it replaces (section 2.10.2).
3. **No bill yet.** The ERP sends the new piece but does not bill it. The exchange waits for the old piece to come back.
4. **Matching the return.** When the old piece comes back on a courier return list, the ERP matches it by order and `lineId` and marks it "Exchange return". It is checked like any other return.
5. **The deadline.**
   - Each shop has an ERP setting for how long the old piece may take: **4 days** by default; the owner can raise it.
   - The days count from the day the exchange parcel is **delivered** (its `PUT /orders/{id}/delivery` with `DELIVERED`, or `PARTIAL` for the lines kept). Day 0 is the delivery day, and the deadline is the end of day 4, Asia/Dhaka time.
   - The old piece counts as back on the courier's `handedBackAt` date, not the day the site sends the list.
6. **Settlement.** The ERP settles the exchange as below, by the old piece's check.

| What happens to the old piece            | What the ERP does with money                                                                                                                         | Event                |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Back in time and **approved**            | Only the difference: new price higher, it charges the extra as an "Exchange extra" line; lower, it gives an "Exchange adjustment"; the same, nothing | `exchange.settled`   |
| Back in time and **declined**            | Bills the new piece at its full `shopPrice`. The old piece stays Retail's loss, with no credit                                                       | `exchange.billed`    |
| **Not back** by the deadline             | Bills the new piece at its full `shopPrice`, the night after the deadline (01:00)                                                                    | `exchange.billed`    |
| Back **after** the bill and approved     | Credits the old piece at the price Retail paid for it. The final figure is the same as an exchange on time                                           | `exchange.credited`  |
| Back after the bill and declined         | Nothing more: the bill stands                                                                                                                        | none                 |
| Customer **refused** the exchange parcel | ~~The exchange is cancelled. No bill. The original order stays as it was~~ Updated 31 Oct 2026 (CN-033): the new piece gets the deadline of a delivered one (`WAITING_RETURN`); not back by then, it is billed in full the night after; back later and approved, it is credited (the ERP's retail loss rule, 30 Oct 2026) | ~~`exchange.cancelled`~~ `exchange.billed`, then `exchange.credited` |

- **Prices.** The new piece's price is its `shopPrice` when the exchange order is placed. The old piece's price is what Retail paid for it.
- **Exchange charges** (exchange fee, courier, delivery) are all Retail's own. They never reach the ERP. The difference the customer pays or gets back is also Retail's own business.

#### 2.10.2 The exchange order

`POST /orders`, with `exchange` on the order and `replacesLineId` on each new line:

```json
{
  "externalOrderId": "WEB-1043-X1",
  "exchange": {
    "ofExternalOrderId": "WEB-1043",
    "note": "Exchange of order WEB-1043: polo size M for size L"
  },
  "customer": { "name": "Rahim", "phone": "01700000000" },
  "shippingAddress": "Mirpur 10, Dhaka",
  "paymentMethod": "COD",
  "deliveryCharge": 80,
  "items": [
    {
      "lineId": "WEB-1043-X1-1",
      "replacesLineId": "WEB-1043-2",
      "sku": "EX-PL-001-NAVY-L",
      "quantity": 1,
      "grade": "A",
      "unitPrice": 0,
      "customerPrice": 0
    }
  ]
}
```

- **The note.** `exchange.note` is free text in Bengali or English. The ERP also writes its own line on the order, for example "Exchange of WEB-1043, line WEB-1043-2".
- **One new line per old line.** A new line's `quantity` may not be more than the quantity still with the customer on the line it replaces.
- **Customer prices.** `unitPrice` and `customerPrice` are what the customer pays for the swap, often 0. They are for Retail's reports only.
- **The answer** is the order, with:
  - `exchangeId`;
  - per line, `shopPrice` (the new piece) and `replacedShopPrice` (what Retail paid for the old piece);
  - `atRisk`: the full value that would be billed if the old piece does not come back;
  - `erpTotal: 0`, because nothing is billed yet.
- **Refusals:**
  - `409 INSUFFICIENT_STOCK`, as for any order (`details.shortSkus`). Nothing is saved or reserved.
    - Keep the exchange "waiting" on the site, as the owner decided. Call again **with a new `Idempotency-Key`** after `stock.changed` shows stock.
    - Return stock counts here too, as for any order.
  - `409 LINE_NOT_DELIVERED`: the line was never delivered to the customer, or has already come back.
  - `409 EXCHANGE_OPEN`: that line already has an exchange that is not settled.
  - `404`: the old order is not this shop's.
- **During an account hold,** exchange orders are still accepted, because they are not a new sale (owner: Q8).

#### 2.10.3 The delivery and the return of an exchange

- **The exchange parcel's delivery result** uses `PUT /orders/{exchangeOrderId}/delivery` like any order:
  - `DELIVERED` starts the deadline.
  - `RETURNED` means the customer refused it: ~~the exchange is cancelled (`exchange.cancelled`).~~ Updated 31 Oct 2026 (CN-033): the exchange waits for the new piece (`WAITING_RETURN`, deadline as for a delivered piece); not back by the deadline it is billed in full (`exchange.billed`, the night after); back later and approved it is credited (`exchange.credited`). The new piece comes back by the normal return path.
  - `PARTIAL`, with the kept lines in `mark`, starts the deadline for the kept lines and cancels the rest.
  - The ERP ignores `collected` on an exchange order: the customer's money is Retail's own.
- **The old piece** comes back on a courier return list as a parcel naming the **exchange order**: `{ "consignmentId": "...", "externalOrderId": "WEB-1043-X1" }`. The consignment may be the exchange parcel's or a separate pickup consignment; the ERP matches by the order.
- **A refused exchange parcel coming back** goes the normal way, but nothing was billed for the new piece:
  - approved: back to main stock, no money;
  - declined (damaged, missing): billed to Retail at its `shopPrice` as Retail's loss (`exchange.billed`, reason `NEW_PIECE_DECLINED`) (owner: Q2).
- **A late return with no matching consignment.**
  - The admin can tell the ERP by hand that the old piece arrived late: `POST /exchanges/{exchangeId}/late-return` with `{ "handedBackAt": "2026-11-12", "courier": "PATHAO", "returnListId": "RL-140", "consignmentId": null, "note": "came in a different lot" }`.
  - The ERP puts that piece on Hold for the owner to tick. Once ticked, it is checked and settled by the table above.

#### 2.10.4 An exchange of an exchange

- **Allowed.** A customer may exchange the new piece again, even before the first exchange is settled.
  - The second exchange order names the first exchange order in `ofExternalOrderId`, and its line in `replacesLineId`.
- **Every exchange settles on its own** by the table above.
  - The second exchange's "old piece" is the first exchange's new piece, at the `shopPrice` fixed on the first exchange order.
  - The chain always adds up. For example, a polo at 650 is exchanged for 700, then exchanged again for 720, and both old pieces come back approved. Retail pays 650, then +50, then +20: 720 in all.
- **Refusal.** A line that already has an open exchange cannot be exchanged twice at the same time (`409 EXCHANGE_OPEN`).

#### 2.10.5 What is waiting (risk)

`GET /exchanges?status=pending` (new; also `?updatedSince=` and `?status=all`):

```json
{
  "items": [
    {
      "exchangeId": "EXG-2026-00031",
      "externalOrderId": "WEB-1043-X1",
      "ofExternalOrderId": "WEB-1043",
      "status": "WAITING_RETURN",
      "lines": [
        {
          "lineId": "WEB-1043-X1-1",
          "replacesLineId": "WEB-1043-2",
          "sku": "EX-PL-001-NAVY-L",
          "shopPrice": 700,
          "replacedShopPrice": 650
        }
      ],
      "atRisk": 700,
      "deliveredAt": "2026-11-03",
      "deadline": "2026-11-07",
      "events": []
    }
  ],
  "totalAtRisk": 3200
}
```

- **`status`:**
  - `WAITING_STOCK` is the site's own state; the ERP never sees it.
  - `WAITING_DELIVERY`: the exchange parcel is not delivered yet.
  - `WAITING_RETURN`: the deadline is running.
  - `RETURNED_WAITING_CHECK`: the old piece is back and waiting for the owner's check.
  - `SETTLED`, `BILLED`, `CREDITED` or `CANCELLED`: the exchange is finished that way.
- **`atRisk` and `totalAtRisk`** count only exchanges that are not billed or settled. The same total is `exchangesAtRisk` in `GET /account`.
- **Reminder.** If an exchange parcel has no delivery result 7 days after it was placed, the ERP reminds the owner.

#### 2.10.6 Exchanges in the site's books

| Event                      | ERP: Retail's account                    | Site: daily summary                         |
| -------------------------- | ---------------------------------------- | ------------------------------------------- |
| Exchange order placed      | nothing                                  | nothing                                     |
| `exchange.settled` (extra) | owes more by `amount`                    | `costs.goods` + `amount` that day           |
| `exchange.settled` (less)  | owes less by `amount`                    | `costs.goods` − `amount` that day           |
| `exchange.billed`          | owes more by the new piece's `shopPrice` | `costs.returnLosses` + that amount that day |
| `exchange.credited`        | owes less by the old piece's price       | `costs.returnLosses` − that amount that day |
| `exchange.cancelled`       | nothing                                  | nothing                                     |

- **Fields.** Every `exchange.*` event has `eventId`, `exchangeId`, `date`, `amount` and, for `settled`, `kind`: `EXTRA`, `ADJUSTMENT` or `EVEN`. For `billed`, `reason` is `DEADLINE_PASSED`, `OLD_PIECE_DECLINED` or `NEW_PIECE_DECLINED`.
- **A bill reversed** (for example, a return list arrives late but shows the old piece reached the merchant before the deadline): the ERP sends a new event with `reverses`. Undo the earlier one.

### 2.11 Fixed monthly costs (new)

- **The call.** The owner enters the monthly fixed costs in the site's Retail dashboard and raises them when they rise. The site sends them with `PUT /fixed-costs/{month}` (month `YYYY-MM`), whenever they change:

```json
{
  "month": "2026-11",
  "costs": { "salary": 45000, "rent": 20000, "utilities": 4500, "other": 2000 },
  "note": "salary raised from November"
}
```

- **Allowed lines:** `salary`, `rent`, `utilities` (electricity, water, internet) and `other`.
- **Changes.** The call is idempotent: sending a month again replaces it. The ERP keeps every version and shows the owner what changed.
- **How the ERP uses them:**
  - **A month or longer:** the full monthly amount for each month.
  - **A day or a week:** the monthly amount spread evenly over the days of the month (November: 71500 ÷ 30 = 2383.33 a day).
  - **This month so far:** the days so far.
  - The ERP shows profit after fixed costs = the summaries' `netProfit` − the fixed costs of the same days.
- **No figure for a month:** the ERP shows "Fixed costs for November not in yet", and never treats them as 0.
- **Do not put** salary, rent or utilities in the daily summary's `costs.other`, so they are not counted twice.

### 2.12 Old calls: what stays and what goes on the switch date

| Call                                                         | After the switch date                                                                                                                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`, `/catalog/variants`, `/stock`, `/stock/{sku}` | **Stay.** The catalog for a retail shop drops `retailPrice` and `avgCost` (section 2.1)                                                                                                                       |
| `POST /orders`                                               | **Stays,** with the new fields (sections 2.3, 2.5.1 and 2.10)                                                                                                                                                 |
| `GET /orders/{externalOrderId}`                              | **Stays,** with `erpTotal`, `billedAt`, per-line `shopPrice` and the exchange fields                                                                                                                          |
| `PATCH /orders/{externalOrderId}`                            | **Stays** for edits before packing and the status steps `PROCESSING`, `PACKED` and `CANCELLED`. `DELIVERED` and `RETURNED` are **retired**: answer `410 USE_DELIVERY_RESULT`, use `PUT /orders/{id}/delivery` |
| `POST /shipments`                                            | **Stays.** It now also bills the order (section 2.3)                                                                                                                                                          |
| `POST /shipments/{consignmentId}/events`                     | **Retired** (`410 GONE`). Delivery results go through `PUT /orders/{id}/delivery`                                                                                                                             |
| `POST /returns`                                              | **Retired** (`410 GONE`). Returns go through `POST /return-lists`                                                                                                                                             |
| `POST /payments`                                             | **Retired** (`410 GONE`). Retail's payments are recorded in the ERP                                                                                                                                           |
| `POST /ad-spend`                                             | **Retired** (`410 GONE`). Ads go in the daily summary's `costs.ads`                                                                                                                                           |

**New calls:**

- `PUT /orders/{id}/delivery`
- `PATCH /orders/{id}/lines/{lineId}`
- `POST /return-lists`
- `GET /returns`, `GET /returns/summary`, `GET /returns/claims`
- `GET /exchanges`, `POST /exchanges/{exchangeId}/late-return`
- `GET /account`
- `PUT /daily-summaries/{date}`, `GET /daily-summaries`
- `PUT /fixed-costs/{month}`, `GET /fixed-costs`
- `GET /cost-of-goods`

All of them will be in the final `openapi.yaml` that comes with the ERP build.

## 3. Switch-over

1. **Build and test against the demo ERP first,** with a demo shop key. Ask Mehadi for one, or the ERP session will make it on the demo site.
2. **The ERP announces a switch date.** From that date the site uses the new rules: `shopPrice`, delivery results and return lists, exchanges, daily summaries, fixed costs, and no customer payments.
3. **What the ERP does by itself with open old website orders on the switch date:**
   - **Not yet out** (confirmed, processing or packed): they move to the new rules. They are billed to Retail at `shopPrice` when they leave, like any new order.
   - **Out with the courier, not yet delivered:** billed to Retail at `shopPrice` on the switch date. Their delivery results and returns use the new calls.
   - **Customer advances** the ERP recorded on those orders (bKash and the like) move to Retail's account as a credit, because the customer's money is now Retail's.
   - **Delivered before the switch, customer money still unpaid (owner: Q5):** the unpaid amount moves, as it was booked, from the walk-in customer to Retail's account, because the site now collects that money.
     - This is one transfer on the switch date, shown in `GET /account` as `otherCharges`.
     - Past sales and profit do not change.
   - ~~The ERP sends the site a list of every order it moved, with the amount, so the site can book the same.~~ Updated 31 Oct 2026 (CN-033): the website never sent real orders to the live ERP through the old link, so the ERP does not build this list (decision 30 Oct 2026); the shop's switch-over runs as `fresh-start` (`erp.switchOver.mode`): no moved orders, no opening balance, no transfer.
4. **Returns of old orders after the switch (owner: Q6).**
   - A piece delivered before the switch that comes back afterwards goes through the same return list and check.
   - If it is approved, the credit is **the price the ERP booked for that piece** in the old sale (the customer's price after the discount), because that is what the ERP counted.
   - If it is declined, there is no credit.
5. **Filling the month backwards.**
   - On the switch date, send the daily summaries backwards from the first day of that month, so the owner's month is complete.
   - For days before the switch, the ERP has no bill to Retail. ~~To get `costs.goods` for those days, call `GET /cost-of-goods?from&to` (new).~~ Updated 31 Oct 2026 (CN-033): `GET /cost-of-goods` is not built in the ERP; on `fresh-start` the days before the switch are simply not sent. For each day and SKU it gives the pieces delivered and their value at the shop price that applied that day (or the switch-day price, if no shop price existed yet).
   - These figures are for Retail's own books only. They never change the ERP's books.
6. **A short admin page:** what is synced, when the last summary was accepted, any queued orders, exchanges or summaries, and the balance owed to the ERP.

## 4. Test checklist

- **Orders and billing:**
  - ~~An order of an A-grade and a B-grade SKU is quoted at the shop prices, and `erpTotal` is stored.~~ Updated 31 Oct 2026 (CN-033): until B-grade opens, an order with a B-grade line answers `422` and the shop holds it (`B_GRADE_CLOSED`); an A-grade order is quoted at the shop prices and `erpTotal` is stored.
  - It is billed only when the shipment is recorded. An order cancelled before that is never billed.
- **Partial deliveries:**
  - Three pieces at 850, 1190 and 980, with `collected` 1310, come back `GREEN` (1190 kept).
  - The same with `collected` 1110 and only a phone discount of 200 in the mark (no kept lines ticked) also comes back `GREEN` (1190 kept).
- **Return lists:**
  - A return list of 3 parcels, one of them `ORANGE`: 2 parcels go to Return stock and 1 to `HOLD`, and Retail's balance does not change. After the owner ticks it, `return.parcel.resolved` arrives.
  - A parcel sent with `receivedCount` 1 when 2 pieces were expected is accepted and shown highlighted in the ERP.
  - A parcel not on any of the shop's orders, or an order delivered in full, is refused. Sending the same `returnListId` twice changes nothing.
- **Checks:**
  - The owner approves 2 pieces and declines 1 (`B_GRADE`). The site reduces what it owes by both `credit`s once, even if the webhooks arrive twice, and puts the declined piece in `costs.returnLosses` that day.
  - The nightly compare with `GET /returns/summary` finds no difference.
- **Return stock:**
  - A SKU is out in main stock but one piece is in Return stock. The site still shows it, an order is filled with `fromReturnStock: true`, and the admin order view says "From ERP return stock".
  - That piece fails the packing check: `order.line.short` arrives. `REPLACE` with another size gives a new `erpTotal`, and `CANCEL` drops the line with no bill.
- **Exchanges:**
  - Placing one bills nothing, and `GET /exchanges?status=pending` shows it with `atRisk` and a deadline 4 days after delivery.
  - The old piece comes back on day 3 and is approved: `exchange.settled` arrives with the difference only (+50 for 650 to 700).
  - The old piece never comes back: `exchange.billed` arrives the night after the deadline with the full 700. A late approved return then gives `exchange.credited` 650, so the final figure is again 50.
  - The customer refuses the exchange parcel: ~~`exchange.cancelled`, and no bill.~~ Updated 31 Oct 2026 (CN-033): right after the refusal nothing is billed and the exchange is not cancelled; past the deadline the new piece is billed in full, and a late approved return credits it (net 0).
  - An exchange of an exchange (650 to 700 to 720), with both old pieces approved, ends at 720 in all.
  - An exchange call short of stock gets `409 INSUFFICIENT_STOCK`. A retry with a new key after `stock.changed` goes through.
- **Daily summaries and fixed costs:**
  - The site is down for 2 days. When it comes back, the queue sends both days without anyone touching it.
  - `summary.missing` arrives, and the site sends that day within minutes.
  - A summary with `incomplete: ["ads"]` shows the ads as not complete in the ERP. Sending the day again with the ads and an empty list replaces it.
  - `PUT /fixed-costs/2026-11` with 71500 in all shows 2383.33 a day in a daily view and 71500 for the month.
- **Account:**
  - The account goes on hold: new orders queue, and after `account.released` they go through. `GET /account` shows `holdsOn` and the days since the last payment before that.
  - The site's own balance for a month equals `GET /account?from&to`'s `closingBalance`.
- **Calls to the site:** `GET /erp-api/customers` refuses a request with a bad signature, or one more than 5 minutes old.
- **Catalog:** import by style code brings all SKUs with their colours, sizes, grade and `shopPrice`, and no `retailPrice` or `avgCost`.
- **Old calls:** `POST /payments`, `POST /returns`, `POST /ad-spend` and `PATCH` with `DELIVERED` get the `410` answers after the switch date.
