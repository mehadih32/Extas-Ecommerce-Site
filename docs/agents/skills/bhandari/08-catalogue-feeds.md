# B08 · Catalogue feeds for Meta and Google

*Bhandari ভান্ডারী · A360-03 · module 8 of 8 · level: Post-graduate · version 1.0 · as of October 2026*

Bhandari owns feed **data quality**; Tirondaj owns how ads use the catalogue (T01 catalogue ads, T03 PMax/Merchant
Center); Doot owns on-page Product markup (D02). One source of truth — the variant data in B01 — feeds all three.

---

## 1. Meta catalogue — fields [OFFICIAL — Meta for Developers, catalog fields]

| Field | Rule |
|---|---|
| `id` | ≤ 100 chars, unique, appears once → **variant SKU** |
| `title` | ≤ 200 chars, keep ≤ 65 to avoid truncation |
| `description` | ≤ 9,999 chars, plain text, no all-caps, no links |
| `availability` | `in stock` / `out of stock` |
| `condition` | `new` |
| `price` | number + space + ISO code → `1250.00 BDT` |
| `link` | product page on our domain (variant URL) |
| `image_link` | JPEG/PNG, **≥ 500 × 500**, ≤ 8 MB |
| `brand` | ≤ 100 chars → EXTAS |
| `item_group_id` | same for all variants of a style |
| `color` | words, not hex · `size` without the word "size" · `gender` female/male/unisex · `age_group` adult… |
| `additional_image_link` | up to 20 URLs (2,000 chars total) |
| `sale_price` | must be **less than** `price`; consider `sale_price_effective_date` |
| `google_product_category` | most specific Google category (name or ID) |
| `quantity_to_sell_on_facebook` | replaced `inventory`; only for Shops on Facebook/Instagram |

## 2. Google Merchant Center — fields that bite apparel [OFFICIAL — Merchant Center Help]
- `item_group_id`: required for **variants in free listings**; for Shopping ads required in Brazil, France, Germany, Japan, UK, US; 1–50 chars; stable; one per product group; variant IDs differ from it; no group ID for sets (B01).
- `size`: required for Apparel › Clothing in free listings; one value per item; each size a separate item.
- Since May 2026 Google recommends also sending the **variant option attribute** when size/colour identify variants.
- `identifier_exists = no` only when no GTIN/MPN/brand exists (custom items); otherwise expect warnings (B02).
- **Bangladesh availability:** Bangladesh is **not listed** in Merchant Center's supported countries/currencies table (Shopping ads and free listings), and Bengali isn't a listed language **[OFFICIAL — Merchant Center Help "Supported languages and currencies"]** — consistent with wave-1's finding. **So the Google feed matters for Performance Max/YouTube/Demand Gen product use only as far as Merchant Center allows for a BD-targeted shop — Tirondaj tests it in Merchant Center before any spend.**

## 3. EXTAS feed build [HOUSE]

```
source: variant table (B01) + live ATS (B03) + photos (Shilpi P05) + prices (ERP, owner-approved)
  ↓ transform per channel
Meta:   id=SKU · item_group_id=style_code · title="EXTAS Pique Polo — Navy — XL" · price "1250.00 BDT"
        availability from ATS>0 · link=/p/pique-polo?color=navy&size=xl · image = that colour's 4:5 hero
Google: same + size, color, gender=male, age_group=adult, variant option attribute, identifier_exists per B02
Combos: separate items, no item_group_id, title "EXTAS Polo + Jogger Set — Navy/Black"
  ↓ validate (below) → publish URL (scheduled fetch) + API updates for stock/price changes
```

### Validation gate (fail = item withheld, report to Bhandari) [HOUSE]
- [ ] Required fields present per channel; lengths within limits
- [ ] `sale_price` < `price`, and the "was" price is a **real former price** (Sawdagor S05; Google strikethrough rules)
- [ ] Image reachable, ≥ 500 px (we ship 1080 × 1350), correct colour for the variant
- [ ] Link resolves 200 to the **same variant** (colour/size preselected)
- [ ] Availability equals site ATS at publish time
- [ ] Price equals the site price (mismatch = disapprovals and customer anger)
- [ ] No duplicates of `id`; group IDs stable vs last feed (changes flagged)

## 4. Freshness [HOUSE]
- Full feed regenerated every 6 h; **stock-outs and price changes pushed immediately** (Meta catalog API / Merchant Center API or a supplemental feed).
- During campaigns: sold-out variants must leave ads within minutes — otherwise we pay for clicks on "out of stock".
- Weekly feed-health report: items active/disapproved/warnings per channel, top 5 errors, fixes owner-agent.

## 5. Worked example — "Shirt XL shows in stock on Meta, sold out on site"
Cause: feed refresh every 24 h; stock event not pushed. Fix: stock event → catalog item update within 1 min; feed every 6 h as backup; check added to audit runner (feed ATS vs site ATS sample of 50 items daily).

---

**Sources** (type in brackets):
- [Official — Meta for Developers] Catalog fields: https://developers.facebook.com/docs/commerce-platform/catalog/fields/
- [Official — Google Merchant Center Help] Item group ID: https://support.google.com/merchants/answer/6324507?hl=en
- [Official — Google Merchant Center Help] Size: https://support.google.com/merchants/answer/6324492
- [Official — Google Merchant Center Help] identifier_exists: https://support.google.com/merchants/answer/6324478
- [Official — Google Merchant Center Help] Supported languages and currencies: https://support.google.com/merchants/answer/160637?authuser=0
- [Internal] skills/tirondaj/01, 03; skills/doot/02; skills/sawdagor/05; skills/shilpi/photo/05

*As of October 2026.*
