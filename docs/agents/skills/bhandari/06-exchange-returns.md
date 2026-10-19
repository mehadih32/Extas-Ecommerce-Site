# B06 · Exchange and returns logistics

*Bhandari ভান্ডারী · A360-03 · module 6 of 8 · level: Post-graduate · version 1.0 · as of October 2026*

EXTAS policy (blueprint, Sawdagor S05): **no returns after receipt — exchange only**; the exchange delivery charge is
paid by the customer, **free if the mistake is ours**; refusing at the door costs only the delivery charge. Policy
wording and prices are owner decisions; Bhandari runs the logistics.

---

## 1. The four flows [HOUSE — PR 185–191, 557]

| Flow | Trigger | Physical path | Money |
|---|---|---|---|
| **A. Size exchange** | customer requests in account within the window (PR 186) | courier picks old item when delivering new one (swap) or customer sends back first | exchange charge (customer) unless our error |
| **B. Our mistake** (wrong item/colour/size, defect) | customer report + photo | swap, free | free; QC tags supplier/packing cause |
| **C. Refused at door** | courier status | parcel returns to us | delivery charge only (door rule) |
| **D. Partial delivery** | customer keeps some items | rest returns with the rider | COD adjusted (B05 §4) |
| **E. Duplicate → exchange** (PR 557) | same product+colour, different size, earlier one in transit | offer exchange on arrival instead of a second parcel | one exchange charge instead of parcel + refusal |

## 2. Exchange engine steps [HOUSE]
1. **Eligibility:** within window (Smart Rules), item unworn with tags (policy text), not a final-sale item.
2. **Variant switcher (PR 188):** same product, other size — show **ATS** live (B03); hold the new variant (24 h) once requested.
3. **Charge** per tier (PR 185/190) shown before confirming; prepaid via bKash/Nagad or collected by the rider.
4. **Booking:** courier swap if supported, otherwise two consignments (pickup + delivery) — record both IDs.
5. **QC on arrival (PR 187):** good → restock same SKU; damaged → B-grade/write-off with reason and photo; **never** put unchecked items back on sale.
6. **ERP:** `SalesReturn` + `SalesReturnItem` with `ReturnItemQcStatus`, then a new `SalesOrder` for the replacement (B04).
7. **Customer messages:** 2 SMS + 1 WhatsApp per order rule applies (Doot D09) — exchange messages count against the same rule unless the owner decides otherwise.

## 3. Size exchanges are the big lever — reduce them before they happen
- Size help on PDP (Sawdagor S01: size-guide components; Shilpi U03 type for the chart).
- The 2-size check flow when a customer orders two sizes (blueprint).
- **Trial-at-delivery** (customer tries sizes at the door, keeps one) is used by at least one Bangladeshi D2C fashion brand, which calls it its key differentiator and admits it adds logistics complexity **[COMMUNITY — Future Startup interview, Strides Co 2021]** → an option for the owner, not a rule.
- Measure: exchange-for-size rate per style × size; a style with a high rate gets its size chart re-measured (Bhandari) and its fit line reworded (Shilpi).

## 4. Returns from the courier — receiving checklist
- [ ] Scan consignment → order found → expected items listed
- [ ] Items match? (missing/extra → photo + courier claim within their window)
- [ ] QC: tags, stains, smell, damage → good / B-grade / write-off (reason code)
- [ ] Restock in ERP only after QC = good
- [ ] Customer notified (exchange shipped / refund decision)
- [ ] Days-to-receive recorded (courier performance, B05)

## 5. Metrics
| Metric | Why |
|---|---|
| Exchange rate (exchanges ÷ delivered) by style/size | fit problems |
| Our-error rate (flow B ÷ delivered) | packing/picking quality |
| Refusal rate by reason, band, courier | delivery and expectation problems |
| QC good % on returns | restockable value |
| Exchange cycle time (request → replacement delivered) | customer experience |

## 6. Worked example — L returned for XL
Customer requests XL on day 2 → ATS XL = 3 → hold 1 → charge shown (owner's tier) → customer pays by bKash → courier swap booked → old L arrives day 4 → QC good → L restocked → ERP gets SalesReturn(L) + SalesOrder(XL) → exchange-for-size counter for that style +1 → if the style passes the threshold this month, Bhandari re-measures the L/XL chart.

---

**Sources** (type in brackets):
- [News interview] Future Startup, Strides Co "Trial at Delivery" (2021): https://futurestartup.com/2021/06/03/on-strides-co-fashion-ecommerce-and-building-a-d2c-business-with-alavi-khondoker/
- [Official — Steadfast] Terms (resend/zone-change charge, return parcels): https://www.steadfast.com.bd/terms-and-condition
- [Internal] master register PR 185–191, 557; blueprint exchange/door rules; skills/sawdagor/01, 03, 05; skills/doot/09 (message rule)

*As of October 2026.*
