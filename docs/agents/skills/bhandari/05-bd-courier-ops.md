# B05 · Bangladesh courier operations — APIs, three bands, COD reconciliation, refused and returned parcels

*Bhandari ভান্ডারী · A360-03 · module 5 of 8 · level: Post-graduate → PhD · version 1.0 · as of October 2026*

---

## 1. The three delivery bands [HOUSE — master register PR 550/551; data/BD-AREA-MASTER.csv]

| Band code | Definition | Rows in gazetteer |
|---|---|---|
| `DHAKA_CITY` | the official **DNCC + DSCC** map, nothing else | 371 |
| `SUB_AREA` | the owner's list of surrounding areas — the only exception to the map; three settings: own charge · folded into Dhaka City · folded into the outside-Dhaka flat charge | 406 |
| `REST_OF_BD` | everywhere else, one flat rate | 922 |

- The **charge the customer sees is fixed by the owner** per band — it does **not** depend on which courier carries the parcel (PR 550).
- **Courier choice** (PR 178) picks the cheaper courier per destination/weight — **shop cost only**, never the customer charge.
- Delivery time shown in **hours** per band (24–48 inside, 48–72 outside), editable.
- The resolver reads the whole address on blur/pause; a district or postcode anywhere settles the band silently (owner lesson, Bogura case).

## 2. Courier merchant APIs — what is publicly readable

| Courier | What we could read | Status |
|---|---|---|
| **Steadfast** | Base `https://portal.steadfast.com.bd/api/v1`; API key + secret key; create order fields `invoice, recipient_name, recipient_phone, recipient_address, cod_amount, note`; bulk create; status by **consignment ID / invoice / tracking code**; current balance; **webhook POSTs status changes with a Bearer token**, payload keys `consignment_id, invoice, status, cod_amount, updated_at`; statuses: `pending, delivered_approval_pending, partial_delivered_approval_pending, cancelled_approval_pending, unknown_approval_pending, delivered, partial_delivered, cancelled, hold, in_review, unknown` | **[COMMUNITY]** — Laravel package hosted in a `steadfast-it` GitHub org but credited to an individual; a separate third-party Python SDK adds return-request and payments endpoints. Confirm in Steadfast's merchant portal docs. |
| **Pathao** | OAuth-style token (client id/secret + username/password); city → zone → area lookups; store create/list; create order with `delivery_type` **48 (normal) or 12 (on-demand)**, `item_type`, `item_weight`, `amount_to_collect`, merchant order id; order details by consignment ID | **[COMMUNITY]** — third-party Laravel package (Codeboxr); official docs not readable |
| **RedX** | OpenAPI: prod `https://openapi.redx.com.bd/v1.0.0-beta`, sandbox `https://sandbox.redx.com.bd/v1.0.0-beta`; header `API-ACCESS-TOKEN: Bearer <jwt>`; `POST /parcel` (required: `customer_name, customer_phone, delivery_area, delivery_area_id, customer_address, cash_collection_amount` (string), `parcel_weight` (grams), `value`; optional `merchant_invoice_id, instruction, is_closed_box, pickup_store_id`); `GET /parcel/track/{id}`, `GET /parcel/info/{id}` | **[COMMUNITY]** — API-directory copy of an OpenAPI spec; official developer page blocked for our tools |

**Rule [HOUSE]:** build against the courier adapter framework (PR 175) with one internal status model; each courier's mapping lives in its adapter; field lists above are a starting map, verified against the merchant docs at onboarding.

### Internal status model [HOUSE]
`ready_to_book → booked (consignment id) → in_review* → picked_up → in_transit → out_for_delivery → delivered | partial_delivered | hold | cancelled_at_door → returning → returned_to_us → qc_done`
*Owner's rule from Steadfast: consignments at **"In Review" still belong to us** (can be edited/cancelled, appear in our picking/handover lists); **"Pending" means the courier has the parcel** — exclude from those lists.

## 3. Steadfast commercial terms that change our numbers [OFFICIAL — Steadfast terms & conditions page]
- **1% "Cash Handling & Risk Management" charge on COD**, after delivery charges are deducted.
- Delivery charges are deducted from collected COD; payouts requested in the merchant panel (bank transfer on a weekly day on request; bKash/Nagad/Rocket; cash at head office/some hubs).
- **"Does not charge for return parcels"** — but the **delivery charge applies to every handed-over parcel, delivered or cancelled**.
- **Resend or zone change = an extra charge equal to the original delivery charge.**
- Damage compensation **up to 50% of declared value** after investigation; lost parcels: mutually agreed amount; packaging must be done **under CCTV**; terms can change without notice.
→ Re-read the terms page every quarter (audit runner item) and keep the numbers in the courier cost table, not in code.

## 4. COD reconciliation — every taka matched [HOUSE]

```
For each courier payout (statement/API):
  for each consignment in the payout:
     expected_cod   = order.cod_amount (after any partial delivery adjustment)
     collected      = courier reported amount
     charges        = delivery charge (by courier rate table) + COD % (e.g. Steadfast 1%) + any return/resend charge
     net_expected   = collected − charges
     compare net_expected with paid line → match | short | over
  orders delivered but not in any payout after N days → "unpaid delivered" list
  payout total vs bank/MFS receipt → match
Post to ERP: Payment per order (shop → ERP sync), courier fees as expense document (ERP makes journals)
```
- Daily: delivered-not-settled ageing (0–3, 4–7, 8–14, > 14 days) to Telegram; > 14 days → raise with the courier.
- Partial deliveries (customer kept 1 of 2): adjust order lines first (return of the other item → B06), then reconcile.
- Mismatches are a Gyani/finance item; **refunds and write-offs need owner approval**.

## 5. Refused and returned parcels [HOUSE — PR 189–192 + Sawdagor S03]
- **Door rule** shown at checkout: refusing at the door → pay only the delivery charge to the rider (blueprint wording).
- Every refusal gets a **reason** (courier note + our follow-up call): price shock, size worry, delay, not ordered/fake, address unreachable, changed mind.
- Refused parcel lifecycle: `cancelled_at_door → returning → returned_to_us → QC → restock | B-grade`. Track **days to return**; stock isn't sellable until QC.
- Repeated refusals feed the **exclusion/risk list (PR 191)** → higher risk score → advance delivery charge by bKash for that customer; **never automatic blocking** (approval list).
- Courier performance report (PR 192): on-time %, refusal %, return-to-us days — **by band and district** → input to courier choice (PR 178) and to Tirondaj's geo decisions.

## 6. Metrics [HOUSE]
| Metric | Formula |
|---|---|
| Delivery success | delivered ÷ (delivered + refused + returned) per courier × band × district |
| Days to deliver | booked → delivered, median and p90, per band |
| Refusal reasons mix | % per reason, weekly |
| Unsettled COD | taka delivered but not paid, by age bucket |
| Return-to-us lag | cancelled → received at warehouse, days |

## 7. Worked example — a Sub-area order
Address "Ashulia, Savar" → resolver: `SUB_AREA` (owner setting: own charge) → customer sees the owner's Sub-area charge. PR 178 picks the cheaper courier for that zone and 400 g; booking returns a consignment ID; sticker prints with the courier's barcode. Delivered day 2 → webhook `delivered` → stock moves from reserved to sold in ERP → payout 5 days later → reconciliation matches net amount after delivery charge + COD %.

---

**Sources** (type in brackets):
- [Community package] SteadFast Courier Laravel package (steadfast-it org): https://github.com/steadfast-it/SteadFast-Courier-Laravel-Package
- [Third-party SDK docs] Steadfast Courier Python SDK: https://steadfast-python.readthedocs.io/
- [Official — Steadfast] Terms and conditions: https://www.steadfast.com.bd/terms-and-condition
- [Community package] Codeboxr, Pathao courier Laravel package: https://github.com/codeboxrcodehub/pathao-courier
- [API directory] apis.io, ShopUp/RedX Parcels API (OpenAPI): https://apis.io/apis/shopup/shopup-parcels-api/
- [Internal] master register PR 175–193, 178, 550/551; data/BD-AREA-MASTER.csv; blueprint In Review/Pending rule, door rule; skills/sawdagor/03

**Could not read:** redx.com.bd/developer-api (blocked), Pathao and Steadfast official API documentation.

*As of October 2026.*
