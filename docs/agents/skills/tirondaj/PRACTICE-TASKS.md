# Tirondaj · Practice tasks (graded drills for when the site is live)

*PR 585 · run after go-live, inside the owner's guardrails, test-lab budget only unless the owner approves more · as of October 2026*

Grading: **A** = met inside the deadline with evidence · **B** = met late or partly · **C** = not met, but a written root cause + next test · **F** = broke a guardrail or claimed without numbers (an F on a guardrail ends the drill and becomes a lesson).
Evidence for every drill: platform screenshot/export + our DB numbers (delivered) side by side.

## Realism note (honest expectations)
- Realistic in days: tracking fixed, events deduplicated, catalogue approved, a campaign launched and spending evenly.
- Realistic in 1–3 weeks: a test campaign under the CPA cap on **confirmed** orders; exiting learning *if* budget ≥ cap × 50 ÷ 7 per day.
- Realistic in 3–6 weeks: delivered CPA under cap with stable volume; PMax judged (Google says ≥ 6 weeks).
- **Not realistic:** guaranteed ROAS from day one; doubling spend at the same CPA in a week; reading incrementality from one week of data.

| # | Drill | Deadline | Pass (A) | Skill tested |
|---|---|---|---|---|
| P1 | Pixel + CAPI dedup live for ViewContent/AddToCart/InitiateCheckout/Purchase; event_id = order number for Purchase | 3 days | Events Manager shows browser + server for each event, dedup working; purchase count within ±5% of DB for 3 days | T02 §1–2 |
| P2 | DeliveredPurchase + ParcelRefused server events from courier webhook | 5 days | delivered count within ±5% of courier "delivered" for 7 days; zero "event_time too old" errors | T02 §4, §6 |
| P3 | Phone normalisation audit | 1 day | 100 sample orders: all hashed phones start with 880 before hashing; EMQ for Purchase not lower than before | T02 §3 |
| P4 | Catalogue live with apparel fields and custom labels | 5 days | match rate > 90%; 0 disapproved hero products; combos are own items | T01 §3 |
| P5 | Refused-parcel exclusion audience refreshed daily and attached everywhere | 3 days | audience updated each day for 7 days; every active ad set lists it | T01 §4 |
| P6 | Launch Advantage+ Sales test campaign (test-lab budget) | 2 days to launch; 14 days to judge | cost per **confirmed** order ≤ CPA cap by day 14; spend within daily ceiling every day | T01, T07 |
| P7 | Same campaign: delivered CPA ≤ cap | 21–28 days | dCPA ≤ cap on ≥ 30 delivered orders, side-by-side report sent | T06 |
| P8 | Creative lab: 5 concepts differing on ≥ 2 axes | 7 days | 5 live, scorecard filled, 1 graduated or a written "none passed" with reasons | T05 §1, §7 |
| P9 | Google brand Search + retraction upload | 5 days | brand campaign live; refused/cancelled orders with gclid retracted within 48 h for 7 days | T03 §6 |
| P10 | Weekly report in Bengali (T06 §6) | every Monday, 4 weeks | all columns filled from data; no platform-only claim | T06 |
| P11 | Budget-increase proposal on a real winner | when scale signal appears | all 5 conditions of T07 §5 shown with numbers; roll-back rule stated | T07 |
| P12 | Season plan for the next Eid / winter | 6 weeks before | approved plan: dates, cut-off, stock check, creative list, budget steps | T08 §1, T07 §7 |
| P13 | Simulated kill: a campaign crosses the kill rule in the sandbox | 1 day | correct action within 1 hour of the trigger; logged with before/after | T07 §3–4 |
| P14 | Geo-test design (no launch without approval) | 10 days | written design with districts, pre-period, duration, power estimate, cost | T06 §5.3 |
| P15 | Certification readiness (see README map) | per owner's schedule | passes Skillshop/Blueprint practice tests ≥ 80% | all |
