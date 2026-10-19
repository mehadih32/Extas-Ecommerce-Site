# Tirondaj · Curriculum wave 1 exam (paid ads)

*33 questions (Q31–33 added in curriculum wave 2) · 1 point each · **pass mark 85% (29/33)** · open-book is NOT allowed in the sandbox run · practical
questions (P) need a short written answer graded against the key · as of October 2026*

## Part A — Meta (T01, T02)

1. A sales campaign has campaign budget on, Advantage+ audience on, but excludes Audience Network at ad-set level. What is its `advantage_state`, and why?
2. The legacy "existing customer budget %" is gone. Describe Meta's documented replacement.
3. Pixel fires `Purchase` with `eventID: "EX-10452"`; CAPI sends `Purchase` with `event_id: "10452"`. What happens and how do you fix it?
4. What is the dedup window for Meta pixel/CAPI events, and from when is it measured?
5. A batch of 200 delivered events contains one event 8 days old. What happens to the batch?
6. Normalise and say whether to hash: phone `01712-345678`; `fbc`; client IP.
7. Which three events and which parameter are required for Advantage+ catalog ads?
8. (P) An ad set gets 22 OrderConfirmed and 14 DeliveredPurchase events per week. Which event should it optimise for, and how do you judge it?
9. Which Meta catalogue fields make all sizes/colours of one polo a single product family, and how must colour be written?
10. True/False: Meta's official guidance says budget changes above 20% always reset learning. Explain.

## Part B — Google & TikTok (T03, T04)

11. Name two official reasons to keep a PMax campaign running at least 6 weeks before judging, or quote Google's guidance.
12. Google Shopping availability for Bangladesh: what did the official pages say, and what must Tirondaj do before planning Shopping?
13. Target ROAS 500% means what? What does Google say happens if the target is set too high?
14. A refused COD order came from a Google click with order ID 10452. Which adjustment do you upload, and what can never be done afterwards?
15. Video Action Campaigns: what replaced them, and why should you look for paused campaigns you didn't create?
16. Demand Gen: minimum daily budget guidance for tCPA and the weekly change limit Google recommends.
17. TikTok: by when should the proposition appear, and how many creatives per ad group does TikTok recommend?
18. Can a Smart+ Web campaign exclude Pangle? What do you do if you must?

## Part C — Creative, measurement, budget (T05–T07, T09)

19. (P) Write a Bengali hook + primary text (4 lines) for a hoodie + jogger winter combo using placeholder prices, following T05 §5.
20. Give the three ratios every concept must be produced in for Meta + TikTok, with pixel sizes.
21. (P) 100 orders: 82 delivered, 18 refused. Margin per delivered order before ads ৳900; each refusal costs ৳210. Compute break-even CPA per placed order.
22. MER is falling while Meta ROAS is rising. Two likely causes and two checks.
23. Why should Meta, Google and TikTok conversion counts never be added together?
24. Name the steps of an EXTAS geo test and the one approval it needs.
25. A campaign's dCPA has been 1.6 × cap for 3 days. What may Tirondaj do alone, and what may it not?
26. (P) The owner's Meta daily ceiling is $70. What platform daily budget do you set and why?
27. List the five conditions for proposing a budget increase.
28. In the budget-increase proposal, which four things must always be present?

## Part D — Bangladesh (T08) and myths

29. Expected 2027 dates for Eid ul-Fitr and Eid ul-Adha, and the rule that ends Eid campaigns.
30. A vendor blog says "BD COD refusal is 20–40%". Can Tirondaj quote it in a report? What does it use instead?

## Part E — South-Asian practice (T10, wave 2)

31. A campaign gets clicks but no sales. Give eChai's five-step diagnostic order and the India-specific check that EXTAS already applies as a house rule.
32. Name three COD-market practices that T10 upgraded to [2-SRC] and the one that still needs owner approval before testing.
33. (P) A vendor deck says "WhatsApp verification cuts RTO by 34–41%". What do you write in the owner's report, and what test do you propose instead?

---

## Answer key (graders only)

1. `DISABLED` — placement lever requires no ad-set placement exclusions (account-level exclusions are allowed).
2. Two ad sets: existing-customer ad set (custom audience, relaxation off) and new-customer ad set (same audience excluded); set `daily_min_spend_target` / `daily_spend_cap` on each.
3. IDs differ → not deduplicated → double count. Use the identical value (e.g. order number `10452`) in both.
4. 48 hours, measured from the first event with that event_id.
5. The whole request fails; no events processed. Send delivered events promptly / validate before batching.
6. `8801712345678` → SHA-256 hash; `fbc` not hashed; IP not hashed.
7. ViewContent, AddToCart, Purchase; `content_ids` (or `contents`) matching catalogue IDs.
8. Neither reaches ~50/7 days → optimise for Purchase (phase 0) or consolidate to reach volume; judge keep/scale/kill on delivered CPA from our DB.
9. Same `item_group_id`; `color` in words (e.g. "Navy Blue"), not hex.
10. False — Meta gives only examples (tiny unlikely, 10× likely); 20% is practitioner lore.
11. Google: run ≥ 6 weeks so the AI gathers data; also PMax needs conversion cycles; (any accurate quote of the 6-week guidance scores).
12. Conflicting: supported-countries table lacks Bangladesh; RAAP page lists it; must test adding Bangladesh/BDT in Merchant Center and record in BLOCKED.md; plan Search/Demand Gen without assuming Shopping.
13. ৳5 conversion value per ৳1 spend; too high limits traffic.
14. Retraction keyed on order ID; a retracted conversion can't be adjusted again (re-upload only with a new order ID).
15. Demand Gen; failed upgrades are recreated paused and must be unpaused deliberately.
16. ≥ 10 × target CPA per day; 5–10% per week, ≤ 15%.
17. Within the first 3 seconds (hook within 6 s); 3–5 creatives per ad group.
18. No — Smart+ has no manual placement; use a non-Smart+ (manual) campaign.
19. Graded: hook in line 1, offer + price line 2, trust line (COD/delivery/exchange) line 3, CTA line 4; চলতি বাংলা; prices marked as pulled from site.
20. 9:16 (1080×1920), 4:5 (1080×1350), 1:1 (1080×1080).
21. 82 × 900 = 73,800; 18 × 210 = 3,780; (73,800 − 3,780) ÷ 100 = **৳700.2** per placed order.
22. Platform claiming organic/returning sales; promo dependence; checks: new-customer share, brand/retargeting share, discount depth/CM, holdout.
23. Each claims the same order under its own attribution → double counting; use our DB attribution.
24. Choose units (districts), outcome (delivered orders/day), ≥ ~90 days pre-period, market selection, 2–4 weeks avoiding Eid/11.11, compute incremental CPA; owner approval (pausing/changing spend by district).
25. May cut budget 40% or pause (auto-decrease); may not raise any budget or loosen caps.
26. ≤ $40 ($70 ÷ 1.75) or a spend cap, because Meta may spend up to 75% over daily budget on some days.
27. dCPA ≤ 80% cap for 7+ days on ≥ 50 delivered; out of learning; refused % ≤ average; stock covers 2+ weeks; MER not falling.
28. Current vs requested budget (daily + monthly impact), our delivered numbers vs cap, stock confirmation, automatic roll-back rule (also: risk line).
29. ≈ 10–12 March 2027 and ≈ 17–19 May 2027 (moon-dependent); pause season campaigns at the courier cut-off.
30. No — unsourced vendor figure; use our own refused % by channel/campaign/district.

31. Tracking (Pixel + CAPI, optimise for Purchase) → learning phase → creative fatigue → landing page → offer/trust; split COD vs prepaid (delivered) ROAS.
32. Any three: ad promise = page = policy; confirm every COD order; advance charge for high-risk only; risk-based rules over blanket blocks; fast NDR follow-up; courier choice by region. Prepaid incentive = price change → owner approval.
33. Unsourced vendor figure, not quoted; propose a measured test on our data (e.g. confirmation by WhatsApp vs call, or reply-required vs not) with refusal rate and delivered CPA as outcomes, judged by channel/district, budget unchanged.

Scoring: 29/33 = pass. Any answer that recommends raising a budget without approval scores 0 for that item and fails the exam regardless of total (guardrail rule).
