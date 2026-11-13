# Courier APIs: what a merchant really gets (research for Courier 360)

Method: web search + package docs (Steadfast Python SDK docs, Pathao and RedX Laravel wrappers). Public pages were thin, so
items marked (check) are from the couriers' merchant docs as remembered and must be confirmed against the live docs before build.

## Steadfast (merchant API)
- Create parcel: invoice, recipient name / phone / address, cod_amount, delivery_type (0 / 1), note. Bulk create: list of the same, one result per parcel (status, invoice, consignment_id, error).
- Status by consignment id, invoice or tracking code: one field, `delivery_status`. Values (check): pending, in_review, hold, delivered, partial_delivered, cancelled, unknown, plus "..._approval_pending" variants (courier marked it, waiting approval).
- Balance: `current_balance` (what Steadfast holds for the merchant).
- Payments: list / get (id, amount, date, method, reference, the parcels in it) (check). Payment request: merchant asks to be paid the balance (check).
- Return requests: create (consignment, reason), get, list; status pending / approved / processing / completed / cancelled (check).
- No rider name / phone, no step-by-step history in the public API. We keep our own timeline of every status we see.

## Pathao Merchant API
- Stores (pickup points), price plan (price from city / zone / weight), create order (merchant_order_id, recipient, address, city / zone / area, delivery_type 48 / 12, item_type, weight, amount_to_collect, instruction), view order by consignment_id.
- Status words (webhook / order info, check): Order Created, Pickup Requested, Assigned for Pickup, Picked Up, Pickup Failed, At the Sorting Hub, In Transit, Received at Last Mile Hub, Assigned for Delivery, Delivered, Partial Delivery, Return, Delivery Failed, On Hold, Paid Return, Exchanged, Payment Invoice.
- Gives: collected amount, delivery fee, COD fee, discount, invoice id when a payment is made. Payment is by invoice / statement on Pathao's schedule.
- No rider phone in the API.

## RedX
- Create parcel: customer name / phone / address, delivery_area + area id, merchant_invoice_id, cash_collection_amount, parcel_weight, instruction, value, pickup_store_id.
- Track by tracking id: list of steps with time + message (English / Bangla). Parcel details by tracking id (check: charge, cash collection, status).
- Status words (check): pending, ready-for-delivery, delivery-in-progress, delivered, agent-hold, agent-returning, returned.
- Areas list. No rider phone.

## Paperfly / eCourier (not built, same shape)
- Create + track by tracking number, a status text and time per step; COD amount; payment by statement.

## What Courier 360 shows, and from where
FROM THE COURIER: current status, tracking steps with time and place, consignment / tracking no., COD collected, delivery charge, COD fee, return charge, return reason, delivery attempts (counted from failed / re-attempt steps), payout status / amount / reference / date.
FROM OUR DATA: order, customer, area / zone, our rate card (to spot wrong charges), handed-over time, claims, what we expect to receive.
NOT SHOWN (the APIs do not give it): rider name and phone, live rider location.
Payout: the courier's own payment-request feature is used; its status (requested, processing, paid or rejected, with amount, reference, date) is read back by itself.
