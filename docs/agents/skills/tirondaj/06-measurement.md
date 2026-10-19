# T06 · Measurement — CPA, ROAS, MER, delivered economics, attribution windows, incrementality and geo tests

*Tirondaj তীরন্দাজ · A360-07 · module 6 of 9 · level: Post-graduate → PhD · version 1.0 · as of October 2026*

**Standing rule (tirondaj.md):** never claim a result without the platform's numbers and our delivered-order numbers
side by side. Platforms grade their own homework; our database grades it again.

Confidence tags used in this set: **[OFFICIAL]** platform docs · **[2-SRC]** two independent good sources ·
**[HOUSE]** EXTAS rule decided from our own economics, revisable by data · **[COMMUNITY — test before use]**.

---

## 1. The metric ladder (from platform to profit)

| Metric | Formula | Who uses it | Trap |
|---|---|---|---|
| Platform CPA | spend ÷ platform-reported conversions | daily steering | counts orders that will be refused; attribution-window dependent |
| **Delivered CPA (dCPA)** | spend ÷ delivered orders attributed to the campaign (our DB, by UTM/click ID) | keep/scale/kill decisions | delivered orders arrive late — use a 7–10-day lag view |
| Platform ROAS | platform revenue ÷ spend | bidding | revenue includes refused parcels |
| **Delivered ROAS (dROAS)** | delivered revenue (ex-delivery charge) ÷ spend | weekly review | not profit — ignores COGS and courier |
| **MER** (blended) | total revenue ÷ total marketing spend, all channels | owner / Gyani, budget level | hides which channel works; good guardrail **[2-SRC: admetrics, CTC]** |
| **Contribution margin (CM)** | (net delivered sales + delivery charge collected) − COGS − ad spend − courier & packing (both ways for refusals) − payment fees | the real answer | needs per-order margin (EXTAS already plans per-order operational margin) **[2-SRC: CTC + EXTAS blueprint]** |
| New-customer CPA (nCAC) | spend ÷ first-time delivered buyers | growth health | returning buyers flatter CPA |

CTC's benchmark (one practitioner source, so **[COMMUNITY]**): CM 20–35% healthy, below 15% "danger zone"; new-customer orders are usually CM-negative or break-even, returning customers carry the margin.

## 2. Break-even maths for a COD order (worked EXTAS example — numbers illustrative)

Combo "Polo ×3" sells at ৳1,999; COGS ৳1,050; packing ৳30. Assumption for the sketch: on a delivered order the delivery charge the customer pays (৳60 Dhaka / ৳120 outside) roughly covers our courier bill, so it nets to zero; on a refusal we pay the forward **and** the return leg (assume ৳90 each on average) and collect nothing. Assume 85% delivered. Replace every number with the real per-order margin table before use.

```
Per 100 orders placed:
  delivered 85 × (1,999 − 1,050 − 30) = 85 × 919 = ৳78,115 gross margin before ads
  refused   15 × (forward ৳90 avg + return ৳90 avg + packing ৳30) = 15 × 210 = ৳3,150 loss
  margin before ads ≈ ৳74,965  → ≈ ৳882 per DELIVERED order, ≈ ৳750 per PLACED order
Break-even CPA (per placed order) ≈ ৳750; per delivered order ≈ ৳882.
Target CPA cap with a 30% margin buffer ≈ ৳525 per placed order.
```
Every refusal-rate point matters: at 75% delivered the break-even per placed order falls to ≈ ৳640. **This is why the CPA cap must be set on delivered economics and reviewed when the refusal rate moves.** The owner sets the cap (guardrail); Tirondaj supplies this calculation with real numbers from the per-order margin table.

## 3. Attribution windows

- Meta defaults (March 2026, per Jon Loomer): **7-day click, 1-day engage-through, 1-day view**; click = link clicks only since March 2026; 28-day click is reporting-only; "incremental attribution" model exists (2025) **[COMMUNITY-verified practitioner; confirm in account]**.
- Google: conversion windows set per conversion action (check settings); Demand Gen/YouTube count view-through differently — never add Google + Meta conversions together; they double count.
- **Our DB attribution** (the source of truth for EXTAS): last non-direct click by stored click ID/UTM, 7-day window, delivered orders only. Show it next to each platform's own number.
- Incrementality reality check: Seer Interactive's test of Meta's incremental attribution on ~$1M spend (Jul 2025) found Meta judged ~87% of conversions incremental while GA4 suggested ~67%; broad and retargeting segments looked least incremental **[COMMUNITY — one agency study]**. Treat platform-attributed numbers as an upper bound.
- Retargeting and brand search always look best in platform reports and are the least incremental — never scale them on platform ROAS alone **[2-SRC: Seer study + SEL/r/PPC brand discussions]**.

## 4. Reading MER vs ROAS (decision table) [2-SRC: admetrics + CTC]

| MER | Platform ROAS | Likely meaning | Action |
|---|---|---|---|
| holding | falling | tracking loss / attribution lag | check signals (T02 §6); don't cut |
| falling | strong | platform taking credit for organic/returning sales; promo dependence | check new-customer share, brand/retargeting share; run a holdout |
| falling | falling | real problem | creative refresh, site conversion, stock, price, season → hand to Gyani's root-cause tree |
| rising | rising | working | propose a budget increase (T07) |

## 5. Experiments

### 5.1 A/B tests inside a platform
- Meta: use the built-in A/B test tool for one variable (creative concept, optimisation event) — split audiences so the same person doesn't see both.
- Pre-register: hypothesis, metric (dCPA), minimum spend per arm (≥ 3 × CPA cap **[HOUSE]**), stop date. No peeking-and-stopping on day 2.

### 5.2 Conversion lift (platform-run holdout)
- Google lowered Conversion Lift minimums to about **$5,000** (Nov 2025, Bayesian methods) for Video/Demand Gen self-serve; Search/Shopping/PMax need a Google rep **[COMMUNITY-reported by PPC Land; Google help page on Bayesian lift exists]**.
- Meta conversion lift: availability for a Bangladesh account at our spend is not confirmed — ask the Meta partner (BD revenue agent) before planning.

### 5.3 Geo test (our own, cheapest real incrementality test)
Method = synthetic control (Meta's open-source **GeoLift** uses augmented synthetic control + conformal inference) **[OFFICIAL-ish: Meta open-source; documented replication]**.

EXTAS design template:
1. Units = districts (64) or Dhaka thanas; outcome = **delivered orders per day** from our DB (not platform data).
2. Pre-period ≥ 90 days of daily data (the GeoLift walkthrough uses ~90 pre-periods; treat as a guide, not a rule).
3. Pick test regions with the market-selection step (lowest detectable effect for the budget); hold out = ads **off** (or doubled) in test districts only.
4. Duration 2–4 weeks; avoid Eid, 11.11 and big weather events.
5. Result = incremental delivered orders ÷ spend difference = **incremental CPA**. Compare with platform CPA → "incrementality factor" for future planning.
6. Running a holdout means pausing ads in some districts = a budget change → **owner approval** with the test plan.

### 5.4 Quick sanity checks (no budget needed)
- Post-purchase question in the thank-you page / confirmation call: "আমাদের কোথায় দেখেছেন?" (Facebook / Instagram / Google / TikTok / friend / other).
- Day-of-week and hour patterns vs spend changes.
- Branded search volume trend (Google Trends / Search Console) after a Meta push.

## 6. The weekly report (owner sees it in simple Bengali)

Columns per channel and campaign: spend (৳ and $), platform conversions, **our confirmed**, **our delivered**, refused %, platform CPA, **dCPA vs cap**, dROAS, CM estimate, MER (total), new-customer %.
Rows coloured: green (dCPA ≤ 80% of cap), amber (80–100%), red (> cap for 3 days → T07 kill/decrease rules).

## 7. Common mistakes

- Adding up conversions from Meta + Google + TikTok (double counting).
- Judging last week's campaign on delivered numbers before parcels are delivered (use the lag view).
- Comparing a 7-day-click week with a 1-day-click week.
- Treating Ads Manager "ROAS 4" as profit.
- Running a geo test across Eid.

---

**Sources** (type in brackets):
- [Official] Meta CAPI server event parameters: https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/server-event
- [Official] Google Ads Help, About Target ROAS: https://support.google.com/google-ads/answer/6268637
- [Practitioner blog] Jon Loomer, Meta ads attribution 2026: https://www.jonloomer.com/meta-ads-attribution-2026/amp/
- [Agency study] Seer Interactive, Meta incremental attribution on $1M: https://www.seerinteractive.com/insights/we-tested-metas-new-incremental-attribution-setting-on-1m-in-ad-spend.-heres-how-it-works
- [Industry news] PPC Land, Google incrementality threshold $5,000: https://ppc.land/google-lowers-incrementality-testing-threshold-to-5-000-for-advertisers/
- [Technical doc] GeoLift replication (mlsynth): https://mlsynth.readthedocs.io/en/stable/replications/geolift.html
- [Practitioner blog] admetrics, MER vs ROAS: https://www.admetrics.io/en/post/mer-vs-roas-dtc-ecommerce-31983
- [Practitioner/agency] Common Thread Collective, contribution margin guide: https://commonthreadco.com/blogs/coachs-corner/the-complete-guide-to-ecommerce-contribution-margin
- [Practitioner/agency] CTC, Prophit System: https://commonthreadco.com/blogs/coachs-corner/prophit-system-beyond-forecasting
- [Practitioner blog] Search Engine Land, PMax brand exclusions: https://searchengineland.com/performance-max-brand-exclusions-395439
- [Community] r/PPC "Performance Max for brand" thread (via mirror): https://redlib.ssps.io/r/PPC/comments/1l4njor/performance_max_for_brand

**Not verified:** Meta Conversion Lift eligibility for Bangladesh accounts; current GeoLift repo docs (repository page
not fetched — methodology taken from a documented replication).

*As of October 2026.*
