# B01 · Product data and variant modelling (size × colour)

*Bhandari ভান্ডারী · A360-03 · module 1 of 8 · level: Graduate → Post-graduate · version 1.0 · as of October 2026*

---

## 1. The model EXTAS already has — use it, don't rebuild it [HOUSE — blueprint A3.2/A3.3]

```
Style  (e.g. "Pique Polo — Classic Fit")         ← one product page, one item group
 ├─ Color  (Navy, White, Black, Olive, Maroon, Grey)
 ├─ Size   (S, M, L, XL, XXL, 3XL)
 └─ ProductVariant = Style × Color × Size         ← the thing you stock, sell, ship, barcode
       sku (unique per company) · barcode · retailPrice · wholesalePrice · avgCost · bGradeAvgCost
StockBalance per variant per Warehouse (quantity, reserved)
```
- **The ERP owns** variants, SKUs, stock, costs. **The shop owns** presentation (photos, copy, SEO, size help), combos, cart and checkout (blueprint A3.3).
- A polo in 6 colours × 6 sizes = **36 variants, 1 style**.

## 2. External standards agree with this shape

- **Google Merchant Center:** every variant is a **separate item with its own `id`**; all variants share one **`item_group_id`** (1–50 chars, alphanumeric/underscore/dash, **stable — never change it**, never reuse it for another product, not case-sensitive); don't use the group ID as a variant ID; if you use a parent SKU, it is the group ID and is **not** submitted as its own product; don't give a group ID to non-variants such as **sets**; each variant should have its **own landing URL** (path or query parameter) **[OFFICIAL — Google Merchant Center Help]**.
- Google `size`: one value per item (e.g. `XL`), submit **each size as a separate product**; "2 colours in 3 sizes = 6 products"; letter sizes XXS–6XL accepted; colour/material/pattern go in their own attributes **[OFFICIAL]**.
- **Meta catalogue:** same group ID for all variants; `color` described in words, **not hex**; `size` without the word "size"; `gender` and `age_group` enumerations **[OFFICIAL — Meta for Developers, catalog fields]**.
- **GS1:** each size, each colour, each size-colour combination is a **different variation needing its own GTIN** **[OFFICIAL — GS1 support]**.

So: one style → one group ID; one variant → one SKU, one barcode, one feed item, one URL **[2-SRC — Google + Meta + GS1 agree]**.

## 3. Attribute dictionary (controlled values) [HOUSE]

| Attribute | Rule | Example |
|---|---|---|
| `style_code` | stable, never reused; = item_group_id | `PLO-PQ-CL` |
| `color_name_en` / `color_name_bn` | from a controlled list; word, not hex | Navy / নেভি |
| `color_family` | for filters/feeds | blue |
| `color_hex` | display swatch only, never in feeds | #1F2A44 |
| `size` | controlled order S, M, L, XL, XXL, 3XL | XL |
| `size_system` | our chart; Google values (US/UK/EU…) only if true | — |
| `fit` | Classic / Slim / Oversized / Relaxed | Classic |
| `fabric` | composition % | 100% cotton pique, 220 GSM (only if measured) |
| `gender`, `age_group` | feed enums | male / adult |
| `category_path` + `google_product_category` | our tree + Google's taxonomy | Men › Polo shirts |
| `measurements` per size | chest, length, shoulder, sleeve in cm and inch | from the size chart |
| `care` | wash instructions | — |
| `combo_eligible` | yes/no; combos reference variants, never copy them | yes |

Rules:
1. **Controlled lists, not free text** — "Navy", "navy blue", "NAVY" become one value; a new colour needs a dictionary entry (Bhandari approves).
2. **Colour names match the photo** (Shilpi P02 true-colour) — a mismatch is a refusal cause.
3. **Never invent fabric or GSM** — only measured or supplier-certified values; otherwise leave blank.
4. **Sets/combos are not variants** — a combo is its own product referencing component variants (pricing rules belong to Sawdagor S02); Google says no item group ID for sets.
5. **Retired ≠ deleted:** a discontinued variant keeps its SKU and history; it's hidden, not removed (owner rule: nothing is deleted).

## 4. Data-quality gate before a style goes live [HOUSE]

- [ ] Every variant has SKU, barcode, price, cost (ERP) and stock record
- [ ] All colours have EN + BN names from the dictionary and ≥ the photo set required by P01
- [ ] Size chart complete for every size (cm + inch)
- [ ] item_group_id = style_code; variant URLs resolve (`/p/pique-polo?color=navy&size=xl`)
- [ ] Feed attributes present: gender, age_group, color, size, google_product_category (B08)
- [ ] No duplicate style for the same garment in another category
- [ ] Combo references valid variants only

## 5. Worked example — adding "Winter Hoodie" in 4 colours × S–3XL
- 1 style `HD-WN-RG`, 4 colours, 6 sizes → 24 variants; ERP creates SKUs `HD-WN-RG-BLK-M` etc. (B02); shop pulls them (B04).
- Bhandari fills BN colour names, size chart (chest/length/sleeve), fit "Regular", care; Shilpi's photo set per colour.
- Feed: 24 items, `item_group_id=HD-WN-RG`, each with its own link and image of its colour.
- Gate passes → publish. 3XL Olive not produced → variant exists with stock 0 and shows as out-of-stock (greyed, not hidden — Sawdagor S01).

---

**Sources** (type in brackets):
- [Official — Google Merchant Center Help] Item group ID [item_group_id]: https://support.google.com/merchants/answer/6324507?hl=en
- [Official — Google Merchant Center Help] Size [size]: https://support.google.com/merchants/answer/6324492
- [Official — Meta for Developers] Catalog fields: https://developers.facebook.com/docs/commerce-platform/catalog/fields/
- [Official — GS1 support] How many GTINs for sizes and colours: https://support.gs1.org/support/solutions/articles/43000734083-how-many-gs1-gtins-do-i-need-when-i-have-a-product-with-many-sizes-and-colours-
- [Internal] blueprint A3.2–A3.6 (ERP models, ownership, sync), bhandari.md (S–3XL, 6 colours), skills/shilpi/photo/

*As of October 2026.*
