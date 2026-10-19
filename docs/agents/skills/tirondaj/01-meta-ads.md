# T01 · Meta ads (Facebook + Instagram) — the EXTAS playbook

*Tirondaj তীরন্দাজ · A360-07 · module 1 of 9 · level: Graduate → Post-graduate · version 1.0 · as of October 2026*

**Use this module when:** building, auditing, scaling or cutting any Meta campaign. Read T02 (signals) first if the
pixel/CAPI setup has not been checked this week — Meta optimises toward whatever event we feed it.

---

## 1. What changed in 2024–2026 (know this before touching the account)

| Fact | Status | What it means for EXTAS |
|---|---|---|
| **Advantage+ Shopping (ASC) is now Advantage+ Sales.** A sales campaign is "Advantage+" when three levers are on: campaign budget (Advantage+ campaign budget), Advantage+ audience (or geo-only / relaxed targeting), and Advantage+ placements (no ad-set placement exclusions). If any lever is off, `advantage_state = DISABLED`. | Official (Marketing API docs). | Default build = one Advantage+ Sales campaign. Turning off a lever is a deliberate, logged decision. |
| Legacy ASC could not be created from API v24.0; v25.0 blocks creation everywhere; v26.0 blocks edits and pauses campaigns that used `existing_customer_budget_percentage`. | Official. | Never build on the legacy ASC type. Migrate any old campaign by "Duplicate Campaign". |
| **The "existing customer budget cap" is gone** for new Advantage+ campaigns. Replacement: two ad sets — (a) existing customers (custom audience, relaxation off), (b) new customers (same audience *excluded*) — each with `daily_min_spend_target` / `daily_spend_cap`. | Official (API docs); removal reported summer 2025. | This is how we keep most money on **new** buyers. Exclusions are not a hard wall — prospecting can still reach past buyers; check the new/engaged/existing breakdown. |
| **Andromeda** (Meta's retrieval engine, introduced 2024) handles far more ad candidates; Meta says the lever has shifted "from niche targeting to creative diversification". Meta's engineering post reports +6% recall and +8% ad quality on selected segments (self-reported). | Official claim; impact on any one account unproven. | Targeting work → creative work. Ten genuinely different ads beat ten audiences. |
| Meta dropped its old "≤6 ads per ad set" advice; the hard limit is 50 ads per ad set. | Reported by Jon Loomer; 50-ad limit also in API docs (campaigns with >50 ads can't be duplicated). | Put 6–15 *distinct* concepts per ad set; never 50 near-copies. |
| Attribution (March 2026): defaults are 7-day click, 1-day engage-through, 1-day view. "Click" now counts only link clicks; "engage-through" replaced engaged-view. Incremental attribution exists as a model option (2025). 28-day click is reporting-only. | Reported by Jon Loomer (Mar 2026); verify in the account. | Keep defaults for purchase/delivered optimisation. Never compare a 2025 report to a 2026 report without noting the definition change. |
| Daily budget may overspend up to 75% on good days; weekly spend never exceeds 7 × daily budget. | Reported (Jon Loomer quoting Meta's in-product text); some accounts still show the older 25%. | Our code-side daily ceiling must be set **below** the owner's hard ceiling (see T07 §2). |

## 2. Account structure — the EXTAS default

```
Business portfolio (owner is admin; Tirondaj has an employee/system-user role, never admin)
└─ Ad account (USD) ── one dataset (pixel + CAPI) ── one catalogue
   ├─ C1  ADV+ SALES · Prospecting · optimise = DeliveredPurchase (or Purchase until volume allows, T02 §4)
   │     ├─ AS-new   : Advantage+ audience, Bangladesh, EXCLUDE buyers 180d + refused-parcel list
   │     │             spend cap ≈ 80–90% of campaign
   │     └─ AS-exist : buyers 180d (relaxation off), spend cap ≈ 10–20%
   │     Ads: 8–15 concepts (UGC, combo flat-lay, on-model reel, catalogue carousel/collection)
   ├─ C2  CATALOGUE (Advantage+ catalog ads) · retarget viewers/add-to-bag 14–30d · exclude buyers 7d + refused
   ├─ C3  TEST lab (ABO or ADV+ with small budget) · new concepts only · winners graduate into C1
   └─ C4  SEASON (Eid / winter / 11.11) · switched on by schedule, off after the delivery cut-off
```

Rules:
1. **Consolidate.** Fewer campaigns = more conversions per ad set = faster exit from learning. Create a new campaign only for a different *goal*, *budget owner decision* or *season*.
2. **One optimisation event per campaign** — never mix a "Purchase" campaign and a "DeliveredPurchase" campaign on the same audience without a written test plan.
3. **Placements on** (Advantage+ placements). Exclude only at account level (e.g. Audience Network if fraud traffic is proven by our own refused-order data).
4. **Naming:** `EXT_<C#>_<goal>_<event>_<geo>_<yyyymmdd>` — the dashboard parses this; a wrong name breaks reporting.
5. **Brand safety & ownership:** the ad account, pixel, catalogue and page belong to the owner's business portfolio. Tirondaj never creates assets in a personal account.

## 3. Catalogue / Advantage+ catalog ads (dynamic product ads)

Requirements (official):
- Pixel/CAPI must fire **ViewContent, AddToCart, Purchase** with `content_ids` (or `contents` with id + quantity); IDs **must equal catalogue IDs**. Commerce Manager may need up to 24 h to show the dataset as a source.
- Catalogue item: `id` (≤100 chars, use SKU-colour-size), `title` (≤200; keep ≤65 so it is not cut), `description` (plain text, not equal to title), `availability`, `condition`, `price` as `1450.00 BDT` (number + ISO code, no ৳ symbol), `link` (own domain), `image_link` (JPEG/PNG ≥500×500, ≤8 MB), `brand`.
- Apparel: same `item_group_id` for every size/colour of one style; `color` in words ("Navy Blue", never a hex code); `size` without the word "size"; `gender` = male; `age_group` = adult; `material`, `pattern`; up to 20 `additional_image_link`; `sale_price` + `sale_price_effective_date` for offers; `custom_label_0–4` for our own grouping.
- Target catalogue match rate **> 90%** (Meta's omni setup guide).

EXTAS labelling convention (Bhandari fills, Tirondaj reads):
| label | values |
|---|---|
| custom_label_0 | `combo` / `single` |
| custom_label_1 | `bestseller` / `new` / `clearance` |
| custom_label_2 | season: `winter` / `summer` / `eid` / `all` |
| custom_label_3 | margin band: `m-high` / `m-mid` / `m-low` (from per-style profit) |
| custom_label_4 | stock band: `deep` / `thin` (thin = fewer than ~2 sizes left — exclude from prospecting sets) |

Combos as catalogue items: a set (e.g. polo + jogger) is its own catalogue product with its own ID, price and a set photo (Shilpi photo module P04). Never let a catalogue ad show a combo price on a single-piece photo.

## 4. Audiences and exclusions

Default: **broad + Advantage+ audience**, Bangladesh, men-skewed creative (not a hard gender lock unless a test proves it).
Exclusions that are *always* on in prospecting:
1. **Refused-parcel list** (people who refused/returned a COD parcel; hashed phone, daily refresh — PR 262–264). Applies to every campaign.
2. Buyers in the last 7 days (they are in delivery; ads to them waste money and trigger duplicate orders).
3. Staff/test phones list.

Seeds for lookalike/Advantage+ suggestions: **delivered** buyers by value, never "all orders".
Phone hashing: E.164 digits only, country code included, leading zero removed — `01712345678` → `8801712345678` → SHA-256. A list uploaded with `017…` without `880` will match badly.

Value rules (official, Marketing API): bid adjustment +1% to +1000% or −1% to −90% by age, gender, OS, device, **location (country/region/city)**, placement or audience label. Works with lowest-cost and cost-cap; 6 rule sets per account, 10 rules each. EXTAS use: lower the value of districts with proven high refusal (from our delivered-rate-by-district table), raise Dhaka city if delivered ROAS there is clearly higher. Only from our own 60–90-day data, never a guess. A value-rule change is a **bid** change → logged, and treated as a significant edit.

## 5. Learning phase

- Ad sets need **about 50 optimisation events in a 7-day window** to exit learning (Meta Help Center figure, widely cited). "Learning limited" = unlikely to get there; it is not a penalty — fix by consolidating, using a higher-volume event, or more budget.
- **Significant edits restart learning:** changing the optimisation event or bid strategy, targeting, adding/swapping the main creative, a long pause, and large budget changes. Meta's own docs give only examples (a $1 change unlikely; 10× likely). The often-quoted "~20%" threshold is practitioner lore, not a Meta rule.
- EXTAS budget for a new Advantage+ Sales campaign: daily budget ≥ (CPA cap × 50 ÷ 7) is the volume needed to exit learning. Example: CPA cap ৳450 → ≈ ৳3,200/day (≈ $27 at ৳120/$). If the owner's ceiling is lower, choose a higher-volume event (InitiateCheckout or Purchase-confirmed) for learning and judge on delivered (T02 §4).

## 6. Creative testing on Meta

1. Test **concepts**, not tweaks (angle × format × persona). A new colour of the same polo is not a new concept.
2. Test lab (C3): 3–5 new concepts/week, equal small budget, 5–7 days or until each has spent ≥ 2 × CPA cap.
3. Graduate a concept to C1 when, after ≥ 2 × CPA cap spent, its **cost per confirmed order** ≤ cap and its early refusal signal is not worse than average (orders cancelled at confirmation call). Add it to C1 as a *new ad* (adding ads restarts learning only for that ad set — batch additions weekly, Monday morning, not daily).
4. Kill in the lab: spent 2 × cap with zero confirmed orders; or CTR (link) in bottom quartile of the last 30 days after 3,000 impressions.
5. Use Meta's text variations (up to 5 primary texts and 5 headlines per ad) in Bengali and English.

## 7. Frequency and fatigue

- Meta shows **"Creative fatigue"** in the Delivery column when cost per result is about 2× its past level, and **"Creative limited"** when it is higher but under 2× (as described by Jon Loomer; Meta wording may change).
- There is no official "good frequency". Watch the *trend*: rising frequency + falling CTR + rising CPA over 7 days = fatigue. In retargeting (small audiences) check 7-day frequency weekly; above ~4 with falling CTR → add new ads, widen window.
- Fix order: (1) add 2–3 new distinct concepts; (2) widen audience / remove restrictions; (3) only then pause the tired ad. Never pause the only winner without a replacement live for 3 days.

## 8. Weekly Meta checklist (Monday 10:00)

- [ ] Dataset: Purchase + DeliveredPurchase received in last 24 h; EMQ for Purchase ≥ previous week; dedup OK (T02 §6).
- [ ] Catalogue: match rate > 90%; disapproved items fixed by Bhandari; out-of-stock items `out of stock`.
- [ ] Refused-parcel list refreshed in last 24 h; attached to every ad set.
- [ ] Each campaign: platform CPA vs **delivered CPA** (our numbers) side by side — standard rule from tirondaj.md.
- [ ] New/engaged/existing breakdown: existing-customer share of prospecting spend ≤ 20%.
- [ ] Fatigue flags; 3–5 concepts queued for the lab.
- [ ] No budget raised without an approved proposal (T07).

## 9. Common mistakes (each one has cost real shops money)

- Optimising to "Purchase" fired on the thank-you page for COD → the system learns to find people who order and then refuse.
- Many small ad sets by interest → permanent "Learning limited".
- Editing the campaign daily → never leaves learning.
- Uploading customer lists without the 880 country code.
- Showing a combo price on a single-piece image (also misleading to the customer).
- Reading Ads Manager ROAS as profit (it ignores refusals, courier cost and COGS — see T06).

---

**Sources** (read for this module):
- Meta Marketing API — Advantage+ campaigns: https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-campaigns
- Meta Marketing API — Value rules: https://developers.facebook.com/documentation/ads-commerce/marketing-api/bidding/value-rules
- Meta Pixel for Advantage+ catalog ads: https://developers.facebook.com/docs/meta-pixel/get-started/advantage-catalog-ads
- Meta Commerce catalogue fields: https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/fields
- Meta omni-channel optimal setup guide: https://developers.facebook.com/documentation/ads-commerce/marketing-api/best-practices/omni-optimal-setup-guide
- Meta CAPI customer information parameters: https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/customer-information-parameters
- Meta Engineering, Andromeda (Dec 2024): https://engineering.fb.com/2024/12/02/production-engineering/meta-andromeda-advantage-automation-next-gen-personalized-ads-retrieval-engine/
- Jon Loomer, Meta Andromeda: https://www.jonloomer.com/meta-andromeda/
- Jon Loomer, Meta ads attribution 2026: https://www.jonloomer.com/meta-ads-attribution-2026/amp/
- Jon Loomer, Creative fatigue: https://www.jonloomer.com/creative-fatigue-meta-ads/
- Jon Loomer, Updates to Meta ads budgeting: https://www.jonloomer.com/updates-to-meta-ads-budgeting/
- AdNabu, Advantage+ sales campaigns: https://blog.adnabu.com/facebook/meta-advantage-plus-sales-campaigns/
- Dollar Commerce, removal of existing-customer cap: https://dollarcommerce.substack.com/p/why-did-facebook-remove-the-existing
- Jetfuel, learning phase 2026: https://jetfuel.agency/what-is-the-meta-ads-learning-phase-how-to-exit-it-faster-in-2026/

**Not verified directly:** Meta Business Help Center pages could not be fetched from this environment (blocked); the
50-events/7-days figure is taken from secondary sources that cite it. Verify the overspend percentage (25% vs 75%)
in the live account's budget tooltip.

*As of October 2026.*
