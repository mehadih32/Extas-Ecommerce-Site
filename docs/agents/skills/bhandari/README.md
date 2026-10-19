# Bhandari ভান্ডারী · A360-03 · skills (curriculum waves 1–2)

Load order before any catalogue, stock, courier, ERP or document task: this README → task modules → MYTHS.md →
lessons/ALL.md + lessons/bhandari.md. Imported generic skills stay in `ext/` (skills/INDEX.md); these EXTAS modules win
where they disagree.

## Wave 1
| File | What it is |
|---|---|
| PHOTO-STANDARD.md | pointer to the shared product-photo standard in skills/shilpi/photo/ (P01–P06) and what Bhandari applies from it |

Photo exam: Bhandari takes **skills/shilpi/photo/EXAM.md** (20 items, pass 85%) for the photo part of S01.

## Wave 2 — catalogue, inventory, logistics, documents (PR 579)
| # | File | Topic | Level |
|---|---|---|---|
| B01 | 01-product-data-variants.md | Style × Colour × Size model, Google/Meta/GS1 agreement, attribute dictionary, go-live gate | Grad → PG |
| B02 | 02-sku-barcodes.md | SKU vs GTIN vs RCN vs courier barcode, EXTAS SKU format, new-SKU decision tree | Grad |
| B03 | 03-stock-reservations.md | commercetools/Saleor reservation models, EXTAS hold rules, ATS formula, cycle counts | PG |
| B04 | 04-erp-sync.md | decided sync map, transactional outbox + idempotent consumer, ERP-down mode, reconcile | PG |
| B05 | 05-bd-courier-ops.md | three bands, Steadfast/Pathao/RedX API facts (and their confidence), Steadfast terms, COD reconciliation, refusals | PG → PhD |
| B06 | 06-exchange-returns.md | five flows, exchange engine steps, QC, size-exchange reduction, metrics | PG |
| B07 | 07-invoices-documents-vat.md | document set, VAT facts (15%, thresholds, Mushak 6.3) with confidence tags, DCOG 2021 points, template rules | Grad → PG |
| B08 | 08-catalogue-feeds.md | Meta and Google feed fields, Bangladesh Merchant Center caveat, validation gate, freshness | PG |
| — | MYTHS.md | 12 myths with evidence | all |
| — | **EXAM.md** | **22 items + answer key, pass 85% (19/22)** | — |

## Confidence tags
**[OFFICIAL]** platform/standards docs (Google Merchant Center, Meta for Developers, GS1, commercetools, Saleor, Steadfast's
own terms) · **[2-SRC]** two independent good sources · **[HOUSE]** EXTAS rule (blueprint, owner lessons) ·
**[COMMUNITY — test before use]** single practitioner/library/news claim. Only the first three are rules (PR 585 gate).

## Could not verify (needs the owner, the courier or the accountant)
- Official Steadfast, Pathao and RedX API documentation (only community packages and an API-directory copy were readable).
- The VAT rate and invoice obligations for EXTAS's own direct online garment sales; whether Mushak 6.3 is needed per sale.
- Current text of the Digital Commerce Operation Guidelines (2021 summaries only).
- Whether EXTAS's existing ERP SKUs already follow a format (B02 defers to the ERP).

## Decisions for the owner (raised by this wave)
1. **GS1 barcodes:** stay with internal barcodes (RCN/Code 128) now, or license a GS1 Bangladesh prefix if wholesale or marketplace partners need GTINs (fees).
2. **Checkout hold length:** 15 min guest / 20 min signed-in, and COD holds until confirmation (max 24 h) — confirm.
3. **Trial at delivery** (try sizes at the door) — a Bangladeshi brand uses it; costs logistics; yes/no/test.
4. **Accountant review** of VAT mode and invoice layout before launch.
5. **Courier merchant docs** — ask Steadfast/Pathao/RedX account managers for current API docs and webhook specs.

*As of October 2026.*
