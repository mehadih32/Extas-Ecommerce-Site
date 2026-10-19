# Bhandari · Doesn't work / myths (catalogue, inventory, logistics, documents)

| # | Myth | Evidence | Do instead |
|---|---|---|---|
| 1 | "One product per colour is simpler." | Google: variants share one item_group_id, each variant its own id; Meta the same; Baymard: combine variations into one list item. | One style, many variants (B01). |
| 2 | "One barcode per style is enough." | GS1: each size, colour and size-colour combination needs its own GTIN. | One barcode per variant (B02). |
| 3 | "We can print our own EAN-13 numbers for anyone." | Numbers in GS1 restricted-circulation ranges are for closed environments only; open-trade GTINs need a GS1 company prefix. | RCN/Code 128 internally; GS1 prefix if partners need GTINs. |
| 4 | "We make the courier barcode." | Blueprint standing rule: consignment ID and barcode always come from the courier. | Pull from the courier API. |
| 5 | "Hold stock when it's added to the bag." | Idle bags block real buyers; Saleor documents expiry/competition problems; commercetools offers holds at order or cart by choice. | Hold at checkout, timed (B03). |
| 6 | "Push cart holds to the ERP too." | Blueprint rule 2: double counting; ERP reserved starts at confirmed order. | Local holds only. |
| 7 | "Retry the ERP call until it works — it's fine." | Outbox relays can deliver more than once; consumers must be idempotent (microservices.io). | Idempotency-Key + dedupe (B04). |
| 8 | "Steadfast returns are free, so refusals cost nothing." | Steadfast's terms: no return-parcel charge, but the delivery charge applies to every handed-over parcel, plus 1% COD charge on COD; resend = another delivery charge. | Count refusal cost properly; reduce refusals (B05). |
| 9 | "The courier's payout total is close enough." | Charges, COD %, partial deliveries and unpaid delivered parcels hide inside totals. | Per-consignment reconciliation (B05 §4). |
| 10 | "Google Shopping will work for a Bangladesh shop like anywhere." | Bangladesh is not in Merchant Center's supported countries/currencies table. | Tirondaj tests in Merchant Center first (B08). |
| 11 | "VAT on online sales went to 15% for everyone." | The FY26 proposal reported by two newspapers concerns commissions on platform sales; EXTAS's own case is unverified. | Ask the accountant (B07). |
| 12 | "Put returns straight back on the shelf." | Blueprint PR 187: QC first; damaged → B-grade/write-off. | Restock only after QC = good (B06). |

Sources: see B01–B08.

*As of October 2026.*
