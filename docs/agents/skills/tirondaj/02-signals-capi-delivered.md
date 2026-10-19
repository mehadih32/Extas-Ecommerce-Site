# T02 · Signals: Pixel + Conversions API, deduplication, and feeding back delivered / refused parcels

*Tirondaj তীরন্দাজ · A360-07 · module 2 of 9 · level: Post-graduate · version 1.0 · as of October 2026*
*Shared with Prohori for PR 257–258 (server-side purchase/delivery events). Tirondaj owns the event design; Prohori owns the server code.*

**The one-line rule (lesson already in lessons/tirondaj.md):** optimise for **delivered** COD purchases, not orders.
A refused parcel costs us the delivery charge both ways, packing, and a blocked unit of stock — and if we tell the ad
platform "this was a purchase", it goes and finds **more people like the refuser**.

---

## 1. The EXTAS event map (one source of truth)

| Event | Type | Sent by | When | event_id | value | Used for |
|---|---|---|---|---|---|---|
| ViewContent | standard | browser + server | product/combo page view | `vc-<session>-<sku>-<ts>` | price | catalogue ads, retargeting |
| AddToCart | standard | browser + server | add to bag | `atc-<cart line id>` | line value | catalogue ads, retargeting |
| InitiateCheckout | standard | browser + server | checkout opened | `ic-<cart id>` | bag value | fallback optimisation, audiences |
| **Purchase** | standard | browser + server | order placed (thank-you) | **order number** | bag value (ex-delivery) | catalogue signal; fallback optimisation |
| OrderConfirmed | custom | server only | confirmation call/SMS says yes | `oc-<order no>` | bag value | optimisation phase 1 |
| **DeliveredPurchase** | custom | server only | courier status = delivered (Steadfast/Pathao webhook) | `dp-<order no>` | **amount actually kept** (ex-delivery charge) | optimisation phase 2; delivered ROAS |
| ParcelRefused | custom | server only | courier status = returned/refused | `pr-<order no>` | 0 | exclusion audience only — **never** an optimisation event |

Every event carries `content_ids` = catalogue IDs (same as Bhandari's catalogue), `content_type` = `product` (or `product_group` for combos if set up that way), `currency` = `BDT`, and full user data (§3).

Build route: EXTAS sends CAPI from its own server (Prohori, PR 257–258). Meta also offers a code-free **Conversions API Gateway** (Meta Blueprint lesson, Apr 2025; partners named: Stape, Datahash, Madgicx) — only a fallback if our server route is blocked, because the delivered/refused events must come from our order database anyway.

## 2. Deduplication — exact rules

**Meta (official):** an event from the pixel and the same event from CAPI are merged when **`event_name` matches and pixel `eventID` = CAPI `event_id`**, within **48 hours** of the first one. The pixel passes `eventID` as the 4th argument of `fbq('track', …)`. The alternative method (`fbp`/`external_id`) only works browser-first and does not dedupe within one source — do not use it as the main method. Order number is Meta's own suggested ID for purchases.

**TikTok (official):** same idea — identical `event` + `event_id` through Pixel and Events API; window 48 h; for cross-channel duplicates the second must arrive more than 5 minutes after the first and within 48 h; the first event received is kept.

**Google:** online conversions are de-duplicated by **transaction ID (order ID)**; send the same order ID on the tag and in every later adjustment.

Server-only events (OrderConfirmed, DeliveredPurchase, ParcelRefused) need no dedup partner, but still need a unique, stable `event_id` so retries do not double count.

## 3. Match quality (who the event belongs to)

- Meta Event Match Quality is scored 1–10; highest-weight identifiers: **email, phone, IP address, user agent, fbp, fbc, first name, last name** (Meta omni setup guide).
- In Bangladesh COD, **phone** is almost always present and email usually is not → phone must be perfect:
  - normalise to digits with country code, no leading zero: `01812-345678` → `8801812345678`, then SHA-256.
  - `fbp`, `fbc`, `client_ip_address`, `client_user_agent` are sent **unhashed** (official).
  - `fbc` format `fb.1.<ms timestamp>.<fbclid>` — create it from the `fbclid` URL parameter on landing if the cookie is missing, store it **on the order**, because the delivered event happens days later on the server and has no browser.
  - `external_id` = our customer ID (hashed), identical on every event.
- Store with each order: fbp, fbc, ttclid (TikTok), gclid/gbraid/wbraid (Google), client IP and user agent at order time, UTM set. Without these, delivered events cannot be attributed.

## 4. Choosing the optimisation event (decision tree)

```
Does the campaign get ≥ ~50 DeliveredPurchase events per 7 days (per ad set)?
├─ YES → optimise for DeliveredPurchase (custom conversion on the custom event)   [phase 2]
└─ NO  → Does it get ≥ ~50 OrderConfirmed per 7 days?
         ├─ YES → optimise for OrderConfirmed                                     [phase 1]
         └─ NO  → optimise for Purchase, but JUDGE (keep / scale / kill) only on
                  delivered CPA from our own database                             [phase 0]
```
Why phases: the learning phase needs volume (~50 events/7 days, T01 §5). Delivered events are fewer and come later.

**Timing traps (verify each one in our data):**
1. Meta CAPI rejects any event whose `event_time` is more than **7 days** before it is sent — and one bad event fails the **whole batch**. Send delivered events as soon as the webhook arrives; never in a weekly batch; send them one order per request or validate times before batching.
2. Attribution uses a 7-day click window (default). If click → delivery takes longer than 7 days, the delivered event will not be credited to the ad. Outside-Dhaka parcels take longer than Dhaka-city parcels, so a DeliveredPurchase campaign may quietly favour fast-delivery areas. Check the delivered-share by district before and after switching.
3. Switching the optimisation event is a **significant edit** (restarts learning). Do it in a duplicate campaign with a written test plan (T06 §5), not by editing the live winner.

How to make DeliveredPurchase optimisable on Meta: send it as a custom event, then create a **custom conversion** on that event (and value) in Events Manager and choose it as the ad set's conversion event. Confirm in the account that the custom conversion appears as an option for the Sales objective with "Website" as the conversion location — this is how practitioners (e.g. eGrow's COD guide) do it, but Meta's help pages could not be read here, so test it in the sandbox first.

## 5. Feeding refusals and returns back

| Platform | Refused / cancelled parcel | Partial delivery or exchange value change |
|---|---|---|
| Meta | no "retraction" for web events. (a) DeliveredPurchase simply never fires; (b) send ParcelRefused for the exclusion audience; (c) add the phone to the refused-parcel custom audience (daily). | send DeliveredPurchase with the value actually kept |
| Google Ads | **Retraction** via conversion adjustments with the order ID → removes the conversion and its value from counts and from CPA/ROAS bidding. A retracted conversion cannot be adjusted again; never retract by mistake. | **Restatement** with the order ID → changes value only (used by tROAS bidding). |
| TikTok | no confirmed adjustment API for web conversions found in TikTok help — **unverified**; rely on refused-customer exclusion lists and on judging by delivered CPA. | — |

Google alternative: import "Delivered" as an **offline conversion with GCLID** (click-to-conversion up to 90 days for file/HTTP/Sheets sources; wait 4–6 h after creating the conversion action before the first upload). Use it as primary conversion only when it has enough volume; keep the online Purchase as secondary.

## 6. Daily signal health check (automated, alert to Telegram)

| Check | Threshold → action |
|---|---|
| Purchases in Events Manager vs orders in our DB (yesterday) | gap > 10% → alert Prohori (tag broken?) |
| DeliveredPurchase count vs courier "delivered" count | gap > 5% → webhook or event_time failure |
| Dedup: server events received but marked duplicate | sudden drop to 0% dedup → event_id mismatch |
| EMQ (Purchase) | falls ≥ 1 point week on week → phone normalisation broken? |
| CAPI batch errors | any "event_time too old" → fix batching immediately |
| Catalogue match rate | < 90% → content_ids mismatch; tell Bhandari |
| Google retractions uploaded | refused orders with gclid not retracted within 48 h → alert |

## 7. Worked EXTAS example

Week: 400 orders placed from Meta, 340 confirmed, 290 delivered, 40 refused, 10 still in transit.
- If we had optimised to Purchase: the platform counted 400 "wins" — 15% of them refusers it now tries to copy.
- Ads Manager shows ROAS on 400 orders; our delivered ROAS uses 290. Report both, side by side (standing rule).
- Action: 290 delivered in 7 days is the *whole account*; split over the prospecting ad set, the existing-customer ad set and the catalogue campaign, no single ad set reliably reaches ~50 delivered per 7 days with delivered events arriving days after the order. → Stay on OrderConfirmed (340/week), judge on delivered CPA; all 40 refusers go into the exclusion list today; re-check the threshold every Monday.

## 8. Common mistakes

- Firing Purchase twice (thank-you reload) without event_id → doubled conversions, fake ROAS.
- Hashing `fbc`/IP (must not be hashed) or not hashing phone (must be hashed).
- Phone without 880 → low match.
- Sending delivered events in a weekly batch → 7-day rejection, whole batch lost.
- Using ParcelRefused as a conversion event in any campaign.
- Retracting a Google conversion for an order that was later delivered (cannot be undone except by re-uploading as a new order ID).

---

**Sources** (read for this module):
- Meta, Handling duplicate Pixel and CAPI events: https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events
- Meta, CAPI server event parameters: https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/server-event
- Meta, CAPI customer information parameters: https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/customer-information-parameters
- Meta, omni-channel optimal setup guide: https://developers.facebook.com/documentation/ads-commerce/marketing-api/best-practices/omni-optimal-setup-guide
- TikTok, About event deduplication: https://ads.tiktok.com/help/article/event-deduplication?lang=en
- Google Ads, About conversion adjustments: https://support.google.com/google-ads/answer/7686447?hl=en
- Google Ads, Offline conversions with GCLID: https://support.google.com/google-ads/answer/7012522?hl=en-GB
- eGrow, Optimise for COD using Delivered events: https://help.egrow.com/en/article/optimize-facebook-ads-for-cash-on-delivery-cod-using-delivered-events-not-purchase
- [Academy] Meta Blueprint, Conversions API Gateway code-free setup: https://bep.facebookblueprint.com/student/activity/645428

**Not verified:** Google's maximum age for uploading adjustments (the API page was not reachable); TikTok conversion
adjustments for web events; the exact Meta UI path for optimising on a custom conversion in an Advantage+ Sales
campaign. Test all three in the sandbox before go-live.

*As of October 2026.*
