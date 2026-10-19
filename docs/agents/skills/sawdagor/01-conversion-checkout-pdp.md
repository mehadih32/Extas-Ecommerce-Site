# S01 · Conversion: checkout and product-page findings (Baymard / NN/g) applied to EXTAS

*Sawdagor সওদাগর · A360-04 · module 1 of 6 · level: Post-graduate · version 1.0 · as of October 2026*
*Design layer: Shilpi reviews; Doot signs off SEO parts; prices/policies come from Smart Rules (owner-approved).*

Tags: **[RESEARCH]** large usability study (Baymard/NN/g) · **[ACADEMIC]** peer-reviewed · **[HOUSE]** EXTAS rule ·
**[COMMUNITY — test before use]**.

---

## 1. Why people abandon (Baymard, US shoppers, list updated Sept 2025) [RESEARCH]

Average documented cart abandonment **70.22%** (50 studies). Reasons (excluding "just browsing"):
| Reason | % | EXTAS answer |
|---|---|---|
| Extra costs too high (shipping, fees) | 40% | delivery charge shown on PDP and in bag before checkout (Dhaka ৳60 / outside ৳120 from Smart Rules) |
| Delivery too slow | 20% | delivery promise in hours/days by band on PDP + checkout (already built) |
| Didn't trust site with card info | 19% | COD default; trust block (S05) |
| Account creation required | 18% | no forced account (phone-first; account auto-created after order — keep it optional-feeling) |
| Checkout too long/complicated | 17% | ≤ 8 fields target (below) |
| Website errors/crashes | 17% | device gate, error monitoring (Prohori) |
| Returns policy unsatisfactory | 13% | exchange rule in plain words at the point of commitment |
| Couldn't see total cost up front | 12% | live total incl. delivery in bag |
| Card declined / not enough payment methods | 10% / 9% | COD + bKash + Nagad (+ card via gateway) |

Baymard estimates fixing documented checkout issues could lift an average large site's conversion by **35.26%** — a ceiling from their benchmark, not a promise for EXTAS.
Note: these are US/EU numbers; in BD the COD/trust picture differs (S03). Use them as a checklist, then measure our own funnel.

## 2. Checkout rules [RESEARCH + HOUSE]

- **Fields:** Baymard: average checkout has 11.3 form fields (2024); "most sites need only 8". EXTAS target ≤ 6–8: phone, name (single **full-name** field — 42% of testers typed full name into "First Name"), address (one line + area resolver), delivery band (inferred silently from the address — owner rule), optional note, payment choice.
- Hide "Address line 2", coupon field (behind a link), and **any account creation until after the order** (Baymard recommends delaying account creation to the confirmation step and reports this and the coupon field as common misses; exact shares not quoted here because the summary was ambiguous).
- Phone field: numeric keypad, accepts 01XXXXXXXXX and +880 formats, validates live with plain-language messages (blueprint).
- Show the full total (items + delivery) before the confirm button; CTA says the amount ("অর্ডার কনফার্ম করুন · ৳2,059").
- One-page / short stepped checkout; never lose typed data on back (owner rule: back goes back exactly one page with scroll restored).
- Draft order saved as typed (blueprint C6.3) — for recovery, under consent rules (Doot D09).

## 3. Product page rules [RESEARCH]

NN/g minimum: clear name, recognisable images with zoom, **full price incl. product-specific fees**, options, stock status, add-to-cart, short informative description; same details for every variant; **shipping terms on the product page**; review summary with filtering; reviewer context (size, height); mark verified reviews.
Baymard apparel (90% of sites get ≥ 1 wrong):
1. Sufficient sizing info (82% fail): letter + numeric sizes, measurements in **cm and inches**, how-to-measure, product-specific chart, size-guide link next to the size buttons, closing it returns to the PDP, support link inside, **model's measurements + size worn**, fit notes ("runs small").
2. Reviewer photos browsable across all reviews (90% fail).
3. **Size buttons, not a dropdown** (70% fail) — show unavailable sizes as disabled, not hidden.
4. Products on real human models (21% fail).
5. Aggregate **fit subscore** (too small ↔ too large) (24% fail) — EXTAS reviews already collect fit.
Shipping on PDP: 64% of test users looked for shipping cost on the product page; 43% of sites didn't show it (Baymard 2017). Free-shipping/threshold info must sit **near the Buy section**, not only in a banner (27% missed banner-only info).

## 4. EXTAS PDP order (phone, first screen budget — Shilpi's PDP_FIT)
Images (on-model first, set photo for combos) → title + price line (one line, owner rule) → colours (≤5 after swatches rule) → size buttons + "Find my size" + model info → Add to Bag / Order Now → delivery line (charge + time for detected band) + exchange line → below: server-rendered Fabric & care · Size & fit · Delivery & exchange · Questions · Reviews (fit bar).

## 5. Measure (Doot's analytics layer already logs these)
Funnel per device and traffic source: PDP view → add to bag → checkout start → phone typed → address typed → confirm → **confirmed** → **delivered**. Watch: size-chart opens vs conversion, "Order Now" vs bag path, error events. Every change = an A/B test or before/after with a control (S01 §6).

## 6. Testing discipline [ACADEMIC/HOUSE]
- One primary metric (confirmed orders per session, then delivered); pre-set sample size and duration (≥ 1–2 full weeks to cover weekday cycles); no stopping early on a lucky day.
- Small shops have little traffic: prefer big, research-backed changes (from this module) over tiny button-colour tests.
- Log every test in the test register: hypothesis, dates, result, decision.

---

**Sources** (type in brackets):
- [Research] Baymard, Cart abandonment rate & reasons (Sept 2025): https://baymard.com/lists/cart-abandonment-rate?gad=1
- [Research] Baymard, Checkout form fields (Jun 2024): https://baymard.com/blog/checkout-flow-average-form-fields
- [Research] Baymard, 5 apparel UX best practices (updated Feb 2025): https://baymard.com/research-articles/apparel-5-best-practices
- [Research] Baymard, Apparel sizing information (Jul 2022): https://baymard.com/research-articles/apparel-size-information
- [Research] Baymard, Show shipping costs on product pages (2017): https://baymard.com/research-articles/show-shipping-costs-on-product-pages
- [Research] Baymard, Free shipping not only in banners (2017): https://baymard.com/research-articles/avoid-banners-only-free-shipping
- [Research] NN/g, E-commerce product pages (Nov 2019): https://www.nngroup.com/articles/ecommerce-product-pages/
- [Internal] EXTAS blueprint (checkout, C6.3), lessons/ALL.md, sawdagor.md

*As of October 2026.*
