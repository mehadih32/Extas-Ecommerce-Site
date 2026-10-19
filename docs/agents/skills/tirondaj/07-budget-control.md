# T07 · Budget control under the owner's guardrails — caps, ceilings, auto-decrease, kill rules, increase proposals

*Tirondaj তীরন্দাজ · A360-07 · module 7 of 9 · level: Post-graduate · version 1.0 · as of October 2026*

**Law (enforced by code, PR 265–268, 531; approval list in AGENT-PROTOCOL.md):**
- Tirondaj may **decrease** budgets, **pause** and **kill** inside the rules below by itself.
- **Any increase** (budget, bid cap loosening, new campaign that adds spend, value-rule increase, CPA-cap change) = a written **proposal → owner approves** on the dashboard or Telegram. No exceptions, including seasons.
- Every change is logged with before/after, reason and the numbers it used.

---

## 1. The guardrail set (owner fills, code enforces)

| Guardrail | Example value (owner's real values live in the dashboard) |
|---|---|
| CPA cap (per placed order or per delivered order — state which) | ৳525 per placed order / ৳620 per delivered order |
| Daily ceiling per channel | Meta $60 · Google $15 · TikTok $10 |
| Monthly ceiling, all channels | $2,400 |
| USD rate for conversion (PR 266) | owner-set, e.g. ৳122 per $ incl. bank charges and VAT |
| Target sales (per product / campaign / month) | e.g. 900 delivered orders |
| Kill switch | one tap, all channels |

## 2. Setting platform budgets so ceilings can never be broken

- Meta may spend **up to 75% over** a daily budget on some days (weekly max 7 × daily) — reported by Jon Loomer from Meta's in-product text; some accounts show 25% **[COMMUNITY-verified practitioner; check tooltip]**. Rule **[HOUSE]**: platform daily budget ≤ owner daily ceiling ÷ 1.75, *or* set an account spending limit / campaign spend cap equal to the monthly ceiling share.
- Google may also spend above the daily budget on some days and balances over the month (check Google's current wording in the account before relying on it) — use campaign budgets that sum to ≤ the monthly ceiling ÷ 30.4.
- Code-side guard (PR 265–268): pull spend every hour; at 90% of the daily ceiling → pause non-essential campaigns (test lab first, then season, then catalogue; prospecting last); at 100% → pause all for the day and alert.
- Monthly pacing line: expected spend to date = ceiling × (days passed ÷ days in month). > 110% of pace → auto-decrease 10% on the worst-dCPA campaigns.

## 3. Auto-decrease rules (Tirondaj may do these alone) [HOUSE]

| Trigger (all measured on **delivered** or confirmed numbers, lag-adjusted) | Action |
|---|---|
| Campaign dCPA > cap for 3 consecutive days, spend ≥ 2 × cap in that period | budget −20% |
| dCPA > 1.5 × cap for 3 days | budget −40% or pause |
| Refused % of a campaign ≥ account average + 10 points over 7 days | budget −30% and flag to Gyani (fraud/district issue?) |
| Stock: hero product thin (custom_label_4 = thin) | remove from prospecting; catalogue only |
| Delivery cut-off passed (Eid, courier holiday) | pause season campaigns; keep brand search |
| Tracking broken (T02 §6 alert) | freeze all changes; decrease nothing based on broken data; alert Prohori |

Respect the learning phase: decreases are also edits. Make at most **one budget change per campaign per 72 h** unless a kill rule fires **[COMMUNITY — test before use: r/FacebookAds practitioners suggest 15–20% steps every 2–3 days; Google's Demand Gen doc says ≤15%/week]**.

## 4. Kill rules [HOUSE]

- **Ad:** spent 2 × cap with zero confirmed orders, or "Creative fatigue" flag + dCPA > cap for 5 days.
- **Ad set / asset group:** spent 4 × cap with dCPA > 1.5 × cap.
- **Campaign:** 14 days, dCPA > cap, and no ad inside it under cap.
- **Channel:** 30 days at dCPA > cap while other channels are under → propose moving the money (moving to another channel is *not* an increase if the total doesn't rise, but still log it and tell the owner in the daily report).
- **Never kill on platform numbers alone** when the platform says good and delivered says bad — delivered wins; when the platform says bad but delivered is good (attribution loss), investigate tracking first.

## 5. When to ask for more money (the scale signal)

All must be true **[HOUSE]**:
1. dCPA ≤ 80% of cap for 7+ days on ≥ 50 delivered orders.
2. Campaign is out of learning.
3. Refused % ≤ account average.
4. Stock of the advertised styles covers the expected extra orders for 2+ weeks (ask Bhandari).
5. MER is not falling (T06 §4).
Scale step proposed: +15–20% per step, one step per 3 days, until dCPA reaches ~95% of cap — or a one-off larger step before a season with the risk stated.

## 6. Budget-increase proposal — template (Bengali for the owner, numbers from the dashboard)

```
🏹 তীরন্দাজ · Tirondaj · A360-07 · বিজ্ঞাপন
প্রস্তাব: বাজেট বাড়ানো (অনুমতি দরকার)

কোন ক্যাম্পেইন: EXT_C1_sales_delivered_BD_20261012 (Meta)
এখন: দিনে $40   →   চাই: দিনে $48 (+20%)   ·   মাসে বাড়তি খরচ ≈ $240 (≈ ৳29,300)

কেন:
• গত ৭ দিনে ডেলিভারি হওয়া অর্ডার ৬২টা, প্রতি ডেলিভারি অর্ডারে খরচ ৳410 (সীমা ৳620 — ৬৬%)
• ফেরত (রিফিউজ) ৯% — দোকানের গড় ১৩%
• MER ঠিক আছে: ৪.১ (আগের সপ্তাহে ৩.৯)
• স্টক: পোলো কম্বোর সব সাইজ ৩ সপ্তাহের মতো আছে (ভান্ডারী নিশ্চিত করেছে)

ঝুঁকি: বাজেট বাড়ালে খরচ প্রতি অর্ডারে ১০–১৫% বাড়তে পারে; তবু সীমার নিচে থাকবে বলে আশা।
থামানোর নিয়ম: ৩ দিন খরচ সীমার উপরে গেলে নিজে থেকেই আগের বাজেটে ফিরিয়ে দেব।

✅ রাজি  ·  ❌ না  ·  ✏️ অন্য পরিমাণ
```
Rules for the proposal: one campaign per proposal; numbers are our delivered numbers (platform numbers shown in brackets if asked); state the monthly ceiling impact; include the automatic roll-back rule; never bundle an increase inside a "routine" message.

## 7. Season budget plan (proposal, not action)

Six weeks before Eid ul-Fitr / winter peak, send one season plan: expected demand curve (last year's daily delivered orders if available), proposed daily budgets by week, courier cut-off date, stock check, creative readiness, and the automatic step-down date. The owner approves the plan; each step still goes through the code guard.

## 8. Common mistakes

- Treating a channel shift as "no increase" and not telling the owner.
- Raising Meta daily budget to exactly the owner ceiling (forgetting 75% overspend).
- Decreasing budgets while tracking is broken.
- Killing a campaign on day 2 of learning on platform numbers.
- Asking for money without stock confirmation — the ad then sells sizes we don't have.

---

**Sources** (type in brackets):
- [Practitioner blog] Jon Loomer, Updates to Meta ads budgeting: https://www.jonloomer.com/updates-to-meta-ads-budgeting/
- [Practitioner blog] Jon Loomer, Slow Burn scaling: https://www.jonloomer.com/slow-burn-a-strategy-for-scaling-facebook-ads/amp/
- [Official] Google Ads Help, Best practices for Demand Gen (5–10%/week, ≤15%): https://support.google.com/google-ads/answer/14693848
- [Official] Meta Marketing API, Advantage+ campaigns (ad-set spend caps / min spend): https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-campaigns
- [Community] r/FacebookAds "Meta favoring one ad. How to scale?" (snapshot May 2026): https://reddit.sentinel-team.org/posts/1tnyvvr/snapshots/2026-05-26T14%3A40%3A57.59262Z
- [Community] r/FacebookAds "Andromeda scaling.." (snapshot May 2026): https://reddit.sentinel-team.org/posts/1ta64yu/snapshots/2026-05-11T18%3A44%3A01.42695Z
- [Practitioner/agency] CTC Prophit System (daily alerts at >10% off plan): https://commonthreadco.com/blogs/coachs-corner/prophit-system-beyond-forecasting

**Not verified:** Google's current daily-overspend wording (help page not fetched this session); Meta's exact
overspend percentage for this account.

*As of October 2026.*
