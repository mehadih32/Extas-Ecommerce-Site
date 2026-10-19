# T09 · Fashion e-commerce scaling playbooks (what large DTC brands and their agencies do) — adapted to EXTAS

*Tirondaj তীরন্দাজ · A360-07 · module 9 of 9 · level: PhD (judgement) · version 1.0 · as of October 2026*

The common pattern across the sources below: **consolidated structure + broad targeting + high volume of genuinely
different creative + clean server-side signal + decisions on margin, not platform ROAS.** Each principle is tagged with
its evidence level. Large-brand case figures are agency-reported and uncontrolled — learn the method, not the number.

---

## Principle 1 — Plan from contribution margin backwards [2-SRC: CTC guide + CTC Prophit; admetrics]
- Monthly: set spend and target dCPA per offer (combo / hero style) from the CM goal; break the month into daily targets by calendar (Eid, payday weeks, weekends).
- Daily: compare actual vs plan; alert when off by > 10% (CTC's cadence).
- New-customer CM is usually ≤ 0; returning buyers make the margin → retention (Doot's CRM) is part of the ads plan.
- **EXTAS:** Tirondaj produces a 1-page monthly media plan for Gyani/owner: offers, spend by week, target dCPA, expected delivered orders, stock check.

## Principle 2 — Consolidate [2-SRC: Meta's Advantage+ design (official) + Smart Marketer + Jon Loomer]
- One evergreen prospecting campaign per objective per offer family; catalogue retargeting; a test lab; seasonal on/off.
- Smart Marketer case (Oct 2025, anecdotal): 8 campaigns → 2, CPAs ≈ −35% within days. Don't promise this; it illustrates the direction.
- **EXTAS:** T01 §2 structure. A new campaign needs a written reason.

## Principle 3 — Creative volume with real diversity [2-SRC: Meta (official Andromeda statement) + Demand Curve + Jon Loomer + Smart Marketer]
- Meta: diversification is "the best lever to find the most relevant audiences".
- Demand Curve (Dec 2025): accounts testing many meaningfully different ads had better CPA and stability; recycling 3–5 variations gave chaotic results (anecdotal, unquantified).
- Weekly creative quota is a practitioner number (e.g. "~20/week" attributed to Meta by Smart Marketer but not verified) → **[COMMUNITY — test before use]**. EXTAS starting quota: 3–5 new concepts/week, rising with budget.
- Reload old winners (ads paused for fatigue) into a fresh campaign after 2–3 months **[COMMUNITY — test before use]**.

## Principle 4 — Signal quality beats audience tricks [OFFICIAL: Meta CAPI/EMQ docs] + [HOUSE: EXTAS blueprint C6.2]
- Server-side events, deduplicated, rich identifiers; optimise toward delivered value (T02).
- Seed lookalikes / value signals on delivered revenue, not orders.

## Principle 5 — Watch the new-customer share [2-SRC: Dollar Commerce (exclusions leak 30–40% to existing customers) + Smart Marketer (new-customer drop fixed by exclusions)]
- Advantage+ can drift to past buyers and site visitors (cheap, not incremental). Check Meta's new/engaged/existing breakdown and our DB's first-time-buyer share weekly.
- If new-customer share falls while platform ROAS rises → exclude buyers 180d and site visitors 30d from prospecting; cap existing-customer ad set spend (T01 §2).

## Principle 6 — Brand and retargeting are the least incremental [2-SRC: Seer incremental test + SEL / r/PPC brand discussions]
- Keep brand search cheap and separate; exclude brand from PMax; cap retargeting at ~10–20% of spend **[HOUSE]** until a holdout proves more is incremental.

## Principle 7 — Scale in steps, watch the curve [COMMUNITY — test before use]
- Practitioners on r/FacebookAds (2026 threads) suggest +15–20% every 2–3 days on stable winners; Jon Loomer's "slow burn" uses 1%/day automated rules with a cap; Google's own Demand Gen doc says ≤ 15%/week. No official Meta threshold exists.
- Marginal CPA rises as spend rises (diminishing returns). Scale until marginal dCPA ≈ cap, not until average dCPA ≈ cap **[HOUSE]**: estimate marginal dCPA as (Δspend ÷ Δdelivered orders) between two budget levels held for ≥ 5 days each.

## Principle 8 — Offer architecture drives AOV and CPA [HOUSE + Sawdagor's bundle module]
- Combos raise order value so the same CPA cap buys more margin. Lead ads with 2–3-piece sets; keep single pieces for catalogue retargeting.
- Price ladders (2 pcs / 3 pcs) and a free-delivery threshold set slightly above the typical single-item order are classic AOV levers (see Sawdagor module S02).

## Principle 9 — Seasonal compounding [HOUSE + Google PMax doc]
- Build the audience/creative base before the peak (learning done 7+ days before), go heavy in the rush, stop at the courier cut-off, retarget post-Eid with new arrivals.

## Principle 10 — Weekly operating rhythm (big-brand discipline, small-brand scale)
| Day | Task |
|---|---|
| Daily 09:30 | spend vs pace, signal health, red campaigns, auto-decrease run |
| Mon | creative lab results → graduate/kill; launch new batch; weekly report |
| Wed | search terms/negatives; catalogue/feed health; district table |
| Fri | season/stock check with Bhandari; next week's briefs to studio; proposals (if any) |
| Monthly | media plan; MER and CM review with Gyani; one experiment (A/B or geo) |

---

**Sources** (type in brackets):
- [Practitioner/agency] Common Thread Collective, contribution margin guide: https://commonthreadco.com/blogs/coachs-corner/the-complete-guide-to-ecommerce-contribution-margin
- [Practitioner/agency] CTC, Prophit System: https://commonthreadco.com/blogs/coachs-corner/prophit-system-beyond-forecasting
- [Practitioner blog] admetrics, MER vs ROAS: https://www.admetrics.io/en/post/mer-vs-roas-dtc-ecommerce-31983
- [Official] Meta Engineering, Andromeda: https://engineering.fb.com/2024/12/02/production-engineering/meta-andromeda-advantage-automation-next-gen-personalized-ads-retrieval-engine/
- [Official] Meta Marketing API, Advantage+ campaigns: https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-campaigns
- [Practitioner blog] Jon Loomer, Meta Andromeda: https://www.jonloomer.com/meta-andromeda/
- [Practitioner blog] Jon Loomer, How many ads is too many: https://www.jonloomer.com/qvt/how-many-ads-is-too-many/
- [Practitioner blog] Jon Loomer, Slow Burn: https://www.jonloomer.com/slow-burn-a-strategy-for-scaling-facebook-ads/amp/
- [Practitioner newsletter] Demand Curve #298, The Andromeda era: https://www.demandcurve.com/newsletters/growth-newsletter-298
- [Practitioner/agency] Smart Marketer, Andromeda transformed Facebook ads: https://smartmarketer.com/meta-andromeda-transformed-facebook-ads/
- [Practitioner newsletter] Dollar Commerce, existing-customer cap removal: https://dollarcommerce.substack.com/p/why-did-facebook-remove-the-existing
- [Agency study] Seer Interactive, incremental attribution test: https://www.seerinteractive.com/insights/we-tested-metas-new-incremental-attribution-setting-on-1m-in-ad-spend.-heres-how-it-works
- [Practitioner blog] Search Engine Land, PMax brand exclusions: https://searchengineland.com/performance-max-brand-exclusions-395439
- [Community] r/FacebookAds threads (snapshots May 2026): https://reddit.sentinel-team.org/posts/1tnyvvr/snapshots/2026-05-26T14%3A40%3A57.59262Z · https://reddit.sentinel-team.org/posts/1ta64yu/snapshots/2026-05-11T18%3A44%3A01.42695Z
- [Official] Google Ads Help, Demand Gen best practices: https://support.google.com/google-ads/answer/14693848

*As of October 2026.*
