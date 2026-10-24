# Extas Retail website: changes needed for the new ERP retail model

**For:** the Claude session that builds the Extas Retail e-commerce site.
**From:** the Extas ERP project, 24 October 2026.
**Version:** 5 (matches plan-v5.md, approved by the owner on 24 October 2026). Changed from version 4: returns now change money only when the owner checks them (section 2.5), delivery results and courier return lists are new, the site gets its own Returns section (2.9), and the daily summary drops `writtenOff`.
**Status:** these are the agreed requirements. The ERP side is **not built yet**. Do the planning now, but do not switch the live site until the ERP announces the switch date and sends the final `openapi.yaml`. Field names below are a draft, and the final contract may rename some of them.

Mehadi (the owner) does not want to do anything by hand. Build everything below so that it runs by itself, and test it against the ERP's demo site (`https://demo.extasbd.com/api/v1/ecommerce`) before it goes live.

---

## 1. What is changing in the ERP, and why

Until now (contract CN-005), each website order became an ERP sale **at the website's selling price**. Each return went **straight back into ERP stock**. The ERP also recorded the **customer's payments**.

The owner has decided on a new business model:

- **Extas Retail is a separate business.** It keeps its own books on the website.
- **To the ERP, Extas Retail is a special wholesale buyer.** It buys each piece from the ERP at a **shop price** set by the owner (for example cost 600, shop price 650). It can buy a single piece at a time.
- **The ERP books every website order as a sale to Extas Retail at the shop price.** The customer's price is Retail's own business. The ERP keeps it with the order for reporting only.
- **Extas Retail pays the ERP on account,** like any wholesale buyer. The ERP's Accounts team records those payments. The ERP no longer records customer payments.
- **Returns change money only after the owner checks them.** The site reports each courier result and each courier return list (with consignment IDs). The ERP puts the pieces in a separate **Return stock**, or on **Hold** when it cannot tell which pieces came back. Until the owner checks a piece in the ERP, it stays on Retail's account. **Approved** A-grade pieces then come off Retail's account at the price Retail paid; **declined** pieces (B-grade, C-grade, damaged, missing, wrong) stay on Retail's account and are Retail's loss. Details in section 2.5.
- **B-grade stock is now sold to Retail too,** as separate lines with their own lower shop price.
- **Bought-in stock:** the owner sometimes buys finished goods from a supplier only for retail. The ERP records that purchase and reserves the pieces for the shops. To the website they are ordinary styles with ordinary SKUs and a shop price: no special handling, and the site must never record such a purchase in its own stock.
- **Unchecked returns can be sold again.** When a SKU is out in main stock but has pieces in Return stock, the ERP still offers it to Retail and fills the order from Return stock. The owner checks that piece at packing; if it passes, the earlier return is approved and the new order is a normal sale.
- **Partial deliveries:** the ERP works out which pieces a customer kept from the courier's amount, or from a "Partial delivery" mark the site's staff make on the order. When it cannot tell, the parcel goes on Hold and the owner ticks the pieces in the ERP.
- **Account hold:** if Retail has a due older than 3 months, the ERP refuses new orders. The owner can lift the hold with a PIN.
- **Several shops:** more shops (online or showrooms) may be added later. Each gets its own API key. Build every feature so it is per shop, never hard-coded to "Extas Retail".
- **Daily figures:** the ERP shows the owner Retail's own figures (sales, costs, profit, ads, customers). They come from a **daily summary** the website must send **every day without fail**.

## 2. What the website must do

### 2.1 Products: import by style code

- Add a "Import from ERP" action. The admin types a **style code** (for example `EX-PL-001`), and the site pulls every SKU of that style from `GET /catalog/variants?styleCode=EX-PL-001` (a new filter), with colour, size, barcode, images if any, and **`shopPrice`**.
- One SKU = one colour × one size; the ERP builds it as `STYLE-COLOUR-SIZE`, for example `EX-PL-001-NAVY-XL`. The site's own product groups these into one product with colour and size options.
- **Show the admin `shopPrice`** ("bought from ERP at"). The admin sets the site's own selling price on top of it. Do not show it to customers.
- **B-grade lines** come as the same SKU with `grade: "B"` and their own `shopPrice` and stock. Sell them as separate listings, for example a "B-grade / outlet" section, or skip them if the admin turns that off.
- **Keep it in sync.** The existing `variant.changed` webhook now also fires when `shopPrice` changes. Update the stored purchase price, but never change the site's selling price by itself; flag it to the admin instead.

### 2.2 Stock

- **No change to how stock works:** keep using `GET /stock` and the `stock.changed` webhook. `available` already excludes stock reserved for other buyers. Each row now has `grade` ("A" or "B").
- **Return stock counts for the shop:** `available` includes unchecked returned pieces of that SKU, and a new field `fromReturnStock` says how many of them are in it. Treat them as normal stock for selling; do not show customers the difference.
- **New stock in the ERP reaches the site within a minute.** No action is needed.

### 2.3 Orders

- **No change to sending orders:** keep `POST /orders` as now. Keep sending `unitPrice` and `discount` as the customer's price; the ERP keeps it for Retail's reports.
- **The ERP books the sale at `shopPrice`.** The response adds `erpTotal` (what Retail owes the ERP for this order) and, per line, `shopPrice`. Store `erpTotal` against the order in the site's own books as the cost of goods.
- **Handle the new refusals:**
  - `409 ACCOUNT_ON_HOLD`: show the admin "Orders to the ERP are on hold: dues older than 3 months". Do not lose the order: queue it and retry when the `account.released` webhook arrives.
  - `409 NO_SHOP_PRICE`: the SKU has no shop price yet. Stop selling that SKU and alert the admin.
- **Grade:** each order line needs `grade` ("A", the default, or "B").
- **Lines filled from Return stock:** the ERP takes main stock first and Return stock only when main stock is out. Such a line comes back with `fromReturnStock: true`. Show it in the site's admin order view as "From ERP return stock" so Retail's staff know the piece is checked at packing. It is a normal sale at today's `shopPrice`; when the owner passes the piece, the ERP also sends `APPROVED_AT_PACKING` for the earlier return (section 2.5.4).
- **New order fields** for returns and partial deliveries: see section 2.5.1.

### 2.4 Payments: stop sending customer payments

- **Stop calling `POST /payments`** for customer money, including COD and bKash. After the switch date the ERP answers `410 GONE`.
- **Retail pays the ERP separately,** by bank, bKash or cash; the ERP's Accounts team records it. The site may show the balance it owes, read from `GET /account` (new): `{ balance, waitingCheck, oldestDueDate, onHold, statement: [...] }`.

### 2.5 Delivery results, courier returns and the owner's check

**The one rule:** money between Retail and the ERP changes **only when the owner checks a returned piece in the ERP and approves it**. Until then every returned piece stays on Retail's account, at the price Retail paid. All decisions are made in the ERP, never on the site; the site only reports what the courier and its own staff know, and then mirrors the ERP's results.

**The five stages of every returned parcel** (use the same names on the site):

| Stage | Who acts | Retail's account with the ERP | Where the pieces are |
|---|---|---|---|
| 1. `DELIVERY_RESULT` | site reports the courier's result | no change | customer or courier |
| 2. `HANDED_BACK` | site reports the courier's return list | no change | ERP: Return stock (known pieces) or Hold (unknown) |
| 3. `HOLD_RESOLVED` | owner ticks the pieces in the ERP | no change | ERP: Return stock |
| 4. `CHECKED` | owner approves or declines each piece in the ERP | **approved A-grade: reduced by the price Retail paid**; declined: no change | approved: ERP main stock; declined: Retail's |
| 5. `CLOSED` | nothing | | |

#### 2.5.1 Order data the ERP needs (added to `POST /orders`)

Per line: `lineId` (the site's own id for the line, for example `WEB-1043-3`), `customerPrice` (the customer's price for that piece after combo split and discounts), `comboId` (when the piece is part of a combo; the combo price is split equally across its pieces unless the site sends the split). Per order: `deliveryCharge` (what the customer was to pay, 0 for free delivery), `advancePaid` (bKash or other advance).

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
- **The "Partial delivery" mark:** add a "Partial delivery" box to the site's order page where staff tick the lines the customer kept, the amount paid and any discount promised by phone. When staff fill it in, send it as `mark`; send it again (same call) whenever staff change it before the parcel is handed back. **Any discount promised by phone must be written there**: the ERP never guesses a discount.
- **The ERP works out partial deliveries itself** when there is no mark: it tries every set of kept lines against `collected` (delivery charge 0 to 200, rider rounding ±20, combo split, advance, recorded discount only). It answers with `identification`: `GREEN` (one answer fits), `YELLOW` (the count and value are certain, the exact colour or size is not) or `ORANGE` (unclear: the parcel will go on Hold). Show this colour on the site's order page.
- A `PARTIAL` with `collected` below the cheapest piece and within 200 is a full return (only the delivery charge was paid).
- **Money in the site's books:** the delivery charge and anything the customer underpaid or the rider failed to collect are Retail's own income or loss. They never reach the ERP.

#### 2.5.3 Stage 2: report each courier return list

When the courier hands back a lot, call `POST /return-lists` (new). `returnListId` is the idempotency key:

```json
{
  "returnListId": "RL-123",
  "courier": "PATHAO",
  "handedBackAt": "2026-11-05",
  "parcels": [
    { "consignmentId": "PATHAO-88341", "externalOrderId": "WEB-1043" },
    { "consignmentId": "PATHAO-88355", "externalOrderId": "WEB-1050" }
  ]
}
```

- Do not list the pieces: the ERP knows them from stage 1. One set of facts, one source.
- The answer has one row per parcel: `IN_RETURN_STOCK` (with the pieces), `HOLD` (the owner must tick the pieces) or `REFUSED` (`NOT_OUR_ORDER`, `NOT_RETURNED` when the order was delivered in full, or `ALREADY_HANDED_BACK`). Fix a refused parcel and send the list again.
- A return that does not come through a courier (for example handed in at a showroom) uses the same call with `courier: "HAND"` and one parcel per order.
- **No money changes at this stage.** Retail still owes the ERP for every piece.

#### 2.5.4 Stages 3 and 4: results the ERP sends back

All of these come as webhooks with `eventId` (store each one once; a repeated webhook changes nothing). The site can also pull them with `GET /returns?updatedSince=` (new) to catch anything missed; run it every hour and on start-up.

- `return.parcel.resolved`: the owner ticked a Hold parcel. Gives the pieces that came back, or `PARCEL_MISSING`.
- `return.piece.decided`: one per piece, after the owner's check:
  - `APPROVED`: A-grade, back in ERP main stock. `credit` is the price Retail paid. **Reduce what Retail owes the ERP by `credit`** on the webhook's date.
  - `DECLINED`: with `reason` (`B_GRADE`, `C_GRADE`, `STAIN_OR_DAMAGE`, `USED`, `NO_TAG`, `PIECE_MISSING`, `WRONG_ITEM`, `PARCEL_MISSING`, `OTHER`). **No money change**: Retail already paid for the piece through its account and keeps the loss. Record it in the site's Returns section as Retail's loss.
  - `APPROVED_AT_PACKING`: an unchecked piece from Return stock was sent on a new order, and the owner passed it at packing. `credit` as for `APPROVED`. The new order has its own `erpTotal` as usual.
  - `DIFFERENT_PIECE`: the parcel held a different piece from the one expected. The ERP gives the corrected piece; update the site's record. No money change.
- **Corrections:** if the owner reverses a decision, the ERP sends `return.piece.decided` again with `reverses: <eventId>`. Undo the earlier effect and apply the new one.

#### 2.5.5 Why nothing is ever counted twice

| Event | ERP books | Site books |
|---|---|---|
| Order | sale to Retail at `shopPrice` | cost of goods = `erpTotal` |
| Delivery result, return list, Hold resolved | nothing | nothing (status only) |
| `APPROVED` or `APPROVED_AT_PACKING` | sale and profit reduced by `credit`; Retail owes less | cost of goods reduced by `credit` |
| `DECLINED` | nothing | nothing more: the cost is already in cost of goods; mark it as a returns loss |
| Delivery charge, customer underpaid | nothing | Retail's own income or loss |

- **No time limit:** the owner may check pieces weeks later; nothing on the site needs to wait for it.
- **Retail's balance:** the ERP leaves the value of unchecked returns out of the 3-month hold rule, and `GET /account` shows it separately as `waitingCheck`.

### 2.6 Daily summary: must arrive for every day

- **New endpoint `PUT /daily-summaries/{date}`** (date `YYYY-MM-DD`, Asia/Dhaka). It is idempotent: sending the same day again replaces that day. The ERP keeps the old version and shows the owner what changed.
- **Send it every day at 00:30 for the day before,** even with no sales (send zeros).
- **If it fails,** keep it in a queue and retry with backoff (1, 5, 15, 60 minutes, then every hour) until the ERP answers 2xx.
- **Answer the ERP's reminder:** the ERP checks at 01:00. For any missing day it sends the webhook `summary.missing` with `{ dates: [...] }`, and repeats it every hour. When it arrives, send those days at once.
- **Keep the ERP's answers:** store each summary the site sent, and the ERP's reply, in a log the admin can see.
- **Fill gaps:** `GET /daily-summaries?from&to` (new) returns which days the ERP has, so the site can fill any gap by itself, for example after downtime.

**Body (draft).** Every amount is in BDT. Only these fixed categories are allowed, so do not invent others:

```json
{
  "date": "2026-11-02",
  "orders": { "count": 42, "pieces": 61 },
  "sales": { "gross": 98500, "discounts": 6200, "customerReturns": 3900, "net": 88400 },
  "deliveries": { "delivered": 37, "failed": 2, "returned": 3, "codPending": 21500 },
  "costs": {
    "goods": 41250,
    "packaging": 1850,
    "delivery": 4600,
    "ads": { "facebook": 5200, "instagram": 0, "google": 1300, "tiktok": 0, "other": 0 },
    "salary": 3000,
    "other": 900
  },
  "returns": { "handedBackPieces": 4, "approvedCredit": 2600, "declinedValue": 650, "waitingCheckValue": 11700 },
  "customers": { "new": 18, "returning": 11 },
  "netProfit": 30300
}
```

- **The cost lines:**
  - `costs.goods`: that day's `erpTotal` of orders, minus that day's `credit` from `APPROVED` and `APPROVED_AT_PACKING`. It always equals the change in what Retail owes the ERP for goods that day.
  - `returns`: for information only, never added to costs (declined pieces are already inside `costs.goods`, so adding them again would count them twice). `declinedValue` is that day's declined pieces at the price paid to the ERP; `waitingCheckValue` is the value still waiting for the owner's check at the end of the day.
  - `salary` and `other`: monthly costs spread over the days of the month, or put on the day they are paid. Pick one way and keep it, and say which in the admin.
  - `netProfit`: `sales.net − all costs` (goods, packaging, delivery, ads, salary, other). The ERP checks the sum and warns the owner if it does not match.
- **Ad spend:** the old `POST /ad-spend` stays for now, but the daily summary's `costs.ads` is what the ERP shows. Send both the same until the ERP retires `/ad-spend`.

### 2.7 Data the ERP asks for only on click

When the owner clicks "Top products" or "Customers" in the ERP, the ERP calls the site **live**. The site must expose two endpoints under its own base URL:

- **The endpoints:**
  - `GET {site}/erp-api/top-products?from&to&limit=20`: SKU, name, pieces, net sales, profit.
  - `GET {site}/erp-api/customers?page&pageSize=50&search=`: name, address, phone, total spent, last purchase date, number of orders, first order date.
- **Signing:** the ERP signs each request with the same scheme it uses for webhooks (`X-Extas-Signature`, HMAC-SHA256 of `METHOD\nPATH?QUERY\nTIMESTAMP` with the webhook secret, plus `X-Extas-Timestamp`). The site must check the signature and refuse anything older than 5 minutes.
- **Tell the owner the base URL:** the site's admin shows the `{site}` base URL to put into the ERP's shop settings.
- **The ERP does not store customer lists:** it shows them and forgets them. Do not push customer lists to the ERP.

### 2.8 New webhooks to handle

All webhooks keep the existing signature scheme. The new events are:
- `delivery.identified`: the ERP's answer for a delivery result (`GREEN`, `YELLOW` or `ORANGE`, with the pieces it thinks came back)
- `return.parcel.resolved` and `return.piece.decided` (section 2.5.4)
- `summary.missing`
- `account.hold` / `account.released`
- `shop-price.changed` (or included in `variant.changed`)
- `payment.recorded`: the ERP recorded money from Retail, so the site can update the balance it owes.

### 2.9 A Returns section on the site

Open a **Returns** section in the site's admin, so Retail's books show exactly what the ERP shows.

- **Tabs that match the ERP:** "Partial deliveries", "Handed back", "On hold in ERP", "In ERP return stock", "Approved", "Declined (our loss)".
- **Each parcel's timeline:** delivery result, its colour (green, yellow, orange), return list and consignment ID, the owner's tick, each piece's decision with reason and date. Show it read-only: decisions are made only in the ERP.
- **Losses report:** declined pieces by reason and month, at the price paid to the ERP, plus the delivery charges and underpayments the site kept or lost. This is Retail's loss, never the ERP's.
- **Courier claims:** a list of `PARCEL_MISSING` and `PIECE_MISSING` items with return list ID and consignment ID, ready to send to the courier.
- **Daily check with the ERP:** every night, compare the site's Returns section with `GET /returns/summary?date=` (new): pieces handed back, on hold, in return stock, approved (with total `credit`) and declined. Any difference is shown to the admin and fixed by pulling `GET /returns?updatedSince=`; never by editing numbers by hand.

## 3. Switch-over

1. **Build and test against the demo ERP first,** with a demo shop key. Ask Mehadi for one, or the ERP session will make it on the demo site.
2. **The ERP announces a switch date.**
   - Orders before it stay as they are in the ERP.
   - From that date the site uses the new rules: `shopPrice`, delivery results and return lists, daily summaries, and no customer payments.
3. **On the switch date, send the daily summaries backwards from the first day of that month,** so the owner's month is complete.
4. **Write a short admin page:** what is synced, when the last summary was accepted, any queued orders or summaries, and the balance owed to the ERP.

## 4. Test checklist

- An order of an A-grade and a B-grade SKU is booked in the ERP at the shop prices, and `erpTotal` is stored.
- A partial delivery of 850, 1190 and 980 with `collected` 1310 comes back `GREEN` (1190 kept). The same with `collected` 1110 and only a phone discount of 200 in the mark (no kept lines ticked) also comes back `GREEN` (1190 kept).
- A return list of 3 parcels, one of them `ORANGE`: 2 parcels go to Return stock and 1 to `HOLD`; Retail's balance does not change. After the owner ticks it, `return.parcel.resolved` arrives.
- The owner approves 2 pieces and declines 1 (`B_GRADE`): the site reduces what it owes by both `credit`s once, even if the webhooks arrive twice, and shows the declined piece as its loss without adding any cost.
- A parcel not on any of the shop's orders, or an order delivered in full, is refused; sending the same `returnListId` twice changes nothing.
- The nightly compare with `GET /returns/summary` finds no difference.
- A SKU is out in main stock but one piece is in Return stock: the site still shows it, an order is filled with `fromReturnStock: true`, and the admin order view says "From ERP return stock".
- The site is down for 2 days. When it comes back, the queue sends both days without anyone touching it.
- `summary.missing` arrives, and the site sends that day within minutes.
- The account goes on hold: new orders queue, and after `account.released` they go through.
- `GET /erp-api/customers` refuses a request with a bad or old signature.
- Clicking import by style code brings all SKUs with their colours, sizes, grade and `shopPrice`.
