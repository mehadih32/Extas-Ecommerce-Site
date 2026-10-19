# B03 · Stock accuracy and reservations — cart holds vs overselling

*Bhandari ভান্ডারী · A360-03 · module 3 of 8 · level: Post-graduate · version 1.0 · as of October 2026*

---

## 1. How serious platforms handle it [OFFICIAL — commercetools and Saleor docs]

| Approach | What happens | Oversell? | Source |
|---|---|---|---|
| **Track only** | stock decremented at order creation, no check; can go negative | yes | commercetools `TrackOnly` |
| **Reserve on order** | stock checked at order creation; orders above availability are **rejected** | no (at checkout) | commercetools `ReserveOnOrder` |
| **Reserve on cart** | scarce stock reserved when the line enters the cart; only mode that stops adding more than available | no | commercetools `ReserveOnCart` |
| **Timed checkout reservation** | stock held for a configured number of minutes (separate values for guests and signed-in users); reserved units disappear from others' availability; expiry returns them; completion converts to allocation | no, within the hold | Saleor |
| No reservations | first to complete checkout wins; others get "insufficient stock" | no, but losers get an error late | Saleor |

Caveats: commercetools notes availability values update with **eventual consistency (up to ~10 s)**; Saleor warns a customer whose reservation expired may lose the item to someone who reserved after **[OFFICIAL]**.

## 2. The EXTAS rule (already decided) [HOUSE — blueprint A3.5 rule 2, PR-102]

1. The shop keeps a **short-lived cart/checkout hold locally** and **does not push it to the ERP**.
2. On **order confirmation** the shop pushes a `SalesOrder`; from then the ERP's `StockBalance.reserved` ("allocated to confirmed but undelivered orders") takes over.
3. **Reservation is global** across all storefronts (the moment a variant is held on one site, the others see it held).
4. **Reservation with row locking** (PR-102) — two customers can't both take the last unit.

### Recommended hold parameters [HOUSE — owner-editable, tune with data]
| Moment | Hold? | Duration |
|---|---|---|
| Add to bag | **no hard hold** (soft: show "শেষ ২টা" if ≤ 3) | — |
| Enter checkout (phone typed) | **hold** the bag's variants | 15 min guest / 20 min signed-in |
| COD order placed (awaiting confirmation call) | hold continues as "pending confirmation" | until confirmed/cancelled, max 24 h |
| Prepaid order awaiting payment | hold | until gateway result + re-query window (R07) |
| Confirmed → SalesOrder pushed | ERP `reserved` | until delivered/returned |

Why not hold at add-to-bag: bags are cheap to create and often abandoned; holding there lets idle bags block real buyers (Saleor's expiry caveat). Why hold at checkout: COD confirmation takes hours, and overselling a confirmed COD order means a cancellation call — the worst customer experience **[HOUSE]**.

## 3. Available-to-sell formula [HOUSE]
```
ATS(variant) = on_hand(ERP mirror) − erp_reserved − shop_active_holds − safety_buffer(variant)
combo ATS     = min(ATS of each component variant ÷ qty in combo)
```
- `safety_buffer`: 0 by default; 1 for variants that sell fast during campaigns (absorbs mirror lag).
- Never show ATS < 0; if ATS hits 0 while a customer is in checkout without a hold (expired) → clear message + same product/other colour in that size (blueprint duplicate/alternative ranking).

## 4. Stock accuracy — the physical side [HOUSE]
- **Mirror freshness:** ERP → shop stock push on every movement (webhook) + full reconcile every night (B04). Drift report: variants where mirror ≠ ERP.
- **Cycle counts:** count a few bins every day (fast movers weekly, slow monthly) instead of one big annual count; variances need a reason code (ERP stock audit by barcode, PR-107).
- **Packing-time truth:** if the item isn't on the shelf at packing → the resolution card and hold (PR 183) — **never auto-cancel**; the rest of the order ships.
- **Returns and exchanges** restock only after QC = good (PR 187); damaged → B-grade/write-off.
- A Bangladeshi D2C fashion founder describes running real-time inventory synced to the website and keeping buffer stock to avoid delays **[COMMUNITY — Future Startup interview, Strides Co, 2021]**.

## 5. Metrics
| Metric | Target [HOUSE — set after a month of data] |
|---|---|
| Oversell incidents (confirmed order, no stock) | 0 per month |
| Mirror drift (variants mismatched at nightly reconcile) | < 0.5% |
| Cycle-count accuracy (units counted = system) | ≥ 98% |
| Hold expiry rate (holds that lapse) | watch; high = checkout friction (Sawdagor) |

## 6. Worked example — Friday campaign, last 5 units of Navy XL
- 09:00 Tirondaj's ad goes live; 12 people add Navy XL; none held.
- 6 reach checkout: first 5 get holds (row lock); the 6th sees "Navy XL শেষ — Navy L বা Black XL নেবেন?" before typing the address.
- 2 holds expire unpaid → 2 units return to ATS automatically; the "notify me" list (if on) is told.
- Result: 0 oversells, 0 cancellation calls. Report to Telegram: ATS 0, sold-out time, demand lost (adds without stock) → Bhandari reorder input.

---

**Sources** (type in brackets):
- [Official — commercetools docs] Manage inventory with the Cart (inventory modes): https://docs.commercetools.com/learning-model-your-product-catalog/inventory-modeling/cart-inventory
- [Official — Saleor docs] Stock reservation: https://docs.saleor.io/developer/stock/stock-reservation
- [News interview] Future Startup, Strides Co (Alavi Khondoker), 2021: https://futurestartup.com/2021/06/03/on-strides-co-fashion-ecommerce-and-building-a-d2c-business-with-alavi-khondoker/
- [Internal] blueprint A3.2–A3.6 (StockBalance.reserved, reservation rule), PR-101/102/107, PR 183, PR 187

*As of October 2026.*
