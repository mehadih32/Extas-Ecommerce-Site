# Bhandari · Curriculum wave 2 exam (catalogue, inventory, logistics, documents)

*22 items · pass mark 85% (19/22) · (P) = practical task on sandbox data · changing a price, refunding, writing off
stock or blocking a customer without routing it to the owner scores 0 and fails the exam · as of October 2026*

1. Draw the Style → Colour/Size → ProductVariant model and say which side (ERP or shop) owns variants, stock and costs.
2. Google's item_group_id: length, characters, stability rule, and two "don'ts".
3. Why does a combo/set get no item_group_id? What does it get instead?
4. Three Meta catalogue rules for apparel attributes (colour, size, gender/age_group).
5. (P) Build the attribute record for "Winter Hoodie, 4 colours × S–3XL" with BN colour names and the go-live gate.
6. Explain SKU vs GTIN vs RCN vs courier barcode — who issues each and where EXTAS uses it.
7. GS1's rule for size/colour variants, and what restricted circulation numbers may and may not be used for.
8. Write the EXTAS SKU for a slim-fit white t-shirt in XXL, style code "CR"; give two SKU rules.
9. Same style and colour, new production batch — new SKU? A darker "navy" from the supplier — new SKU? Why?
10. commercetools TrackOnly vs ReserveOnOrder vs ReserveOnCart — what happens to overselling in each?
11. Saleor reservations: what is configurable, what happens on expiry, and the competition caveat.
12. State the blueprint's reservation rule and the EXTAS hold timings.
13. Write the ATS formula for a variant and for a combo.
14. The three blueprint rules every ERP sync call must obey.
15. Transactional outbox: the problem, the solution, and the consequence for the consumer.
16. (P) Simulate a relay timeout that sends the same SalesOrder 3 times; show the ERP ends with one order.
17. Name the three delivery bands, how each is defined, and who sets the customer charge. Does courier choice change it?
18. The Steadfast rule "In Review" vs "Pending" — which orders go on the picking/handover list?
19. Four commercial terms from Steadfast's T&C that change EXTAS's costs.
20. (P) Reconcile a sample payout of 10 consignments (one partial, one missing, one over-charged) and list the actions.
21. VAT: what is verified (rate, thresholds, Mushak 6.3 fields) and what must go to the accountant?
22. Bangladesh and Google Merchant Center — what does the official table show, and what does that mean for the Google feed?

---

## Answer key
1. Style → Colour, Size → ProductVariant (sku, barcode, retailPrice, wholesalePrice, avgCost); StockBalance per variant/warehouse. ERP owns variants, SKUs, stock, costs; shop owns presentation, combos, cart/checkout.
2. 1–50 chars, alphanumeric/underscore/dash (ASCII recommended), keep stable; don't reuse for another product; don't use it as a variant id; don't submit the parent SKU as a product; no group ID for non-variants (sets).
3. Sets aren't variants (Google); a combo is its own item with its own SKU (CMB-…) referencing component variants.
4. Colour in words not hex; size without the word "size"; gender female/male/unisex, age_group adult/… (any three incl. same group ID for variants).
5. Graded: 24 variants, style_code = group id, dictionary colours EN/BN, size chart cm+inch, gender/age_group, category, gate items ticked.
6. SKU — ERP, internal; GTIN — from a GS1 company prefix, open trade/feeds; RCN — company/region closed use (prefix 02/20–29, 040–049 in-company); courier barcode — the courier, per parcel, on the sticker.
7. Each size, colour and combination needs its own GTIN. RCNs: closed environments (internal, in-store, variable measure); not for open trade; EAN/UPC symbols only, no AIs.
8. TEE-CR-SL-WHT-XXL; any two: uppercase ASCII/digits/dashes ≤ 32; never reuse retired SKUs; no changing meaning (price/season/supplier); ERP issues; ERP format wins.
9. Batch: same SKU (track as StockLot). Darker navy: new colour code → new SKUs (photo/colour mismatch causes refusals).
10. TrackOnly: possible (stock can go negative); ReserveOnOrder: blocked at order creation; ReserveOnCart: blocked at add-to-cart.
11. Duration in minutes for anonymous and signed-in users; expiry returns units to stock; another shopper can reserve after expiry and block the original customer.
12. Local short-lived cart/checkout hold, not pushed; ERP reserved from confirmed SalesOrder; global across storefronts; row locking. Hold at checkout 15 min guest / 20 signed-in; COD pending confirmation max 24 h; prepaid until gateway result.
13. ATS = on_hand − erp_reserved − active_holds − safety_buffer; combo = min over components of ATS ÷ qty.
14. Push business documents not journal lines; cart holds local; companyId on every call.
15. Can't atomically update DB and notify; write message to an outbox in the same transaction and relay it; at-least-once → idempotent consumer tracking processed IDs.
16. Graded: Idempotency-Key, unique constraint, one SalesOrder, log shows 2 deduped.
17. DHAKA_CITY = DNCC+DSCC map; SUB_AREA = owner's list (own charge / fold into Dhaka / fold into outside); REST_OF_BD = flat. Owner fixes charges; courier choice (PR 178) changes shop cost only.
18. In Review = still ours → on the lists; Pending = courier has it → excluded.
19. 1% COD cash-handling charge; delivery charge on every handed-over parcel incl. cancelled; no charge for return parcels; resend/zone change = extra original delivery charge; damage up to 50% declared value; CCTV packing (any four).
20. Graded: per-consignment expected vs collected vs charges, partial adjusted via return lines, missing → unpaid-delivered list + courier claim, over-charge → dispute; write-offs/refunds to owner.
21. Verified (with tags): 15% standard and reduced rates, BDT 5m registration, 3–5m turnover tax 4% (single tax-firm source); Mushak 6.3 fields (2 sources); 6.7 credit note (1 source). Accountant: rate for EXTAS's sales, whether 6.3 per sale, registration timing, FY26 changes.
22. Bangladesh isn't listed for Shopping ads/free listings, Bengali not a listed language → test in Merchant Center before spend; Google feed may be limited for BD targeting (Tirondaj decides).
