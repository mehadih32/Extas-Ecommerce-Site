# G01 · Root-cause analysis of a sales drop — the EXTAS decomposition tree

*Gyani জ্ঞানী · A360-01 · chief agent (PR 583) · executive module 1 of 5 · level: Post-graduate → PhD · version 1.0 · as of October 2026*

**When:** the owner asks "বিক্রি কমলো কেন?", the daily report shows delivered sales below the control band, or any agent
raises a red alert. The owner's fear is real: if sales fall, the business collapses — so speed **and** correctness both matter.

---

## Step 0 — Is it a real drop or noise? (10 minutes)

Daily orders bounce. Use a **control chart** on daily delivered (or confirmed) orders, centre = last 8 weeks' same-weekday mean:
- **Signal** if: one day beyond ±3σ; 2 of 3 days beyond 2σ on the same side; 4 of 5 beyond 1σ; or **8 days in a row** below the centre line (Western Electric rules, NIST handbook). Adding the extra rules raises false alarms (≈ 1 in 92 points vs 1 in 371 for 3σ only) — so treat a single 2σ day as "watch", not "panic".
- Compare like with like: same weekday, same Ramadan/Eid phase, same payday week. A drop the week after Eid is season, not failure.
- Check the data pipe first: are orders, courier statuses and ad spend all importing? (A broken import looks exactly like a sales crash.)

## Step 1 — Decompose the money

```
Delivered revenue
 = Sessions × Conversion rate (orders ÷ sessions) × AOV × Delivery success rate (delivered ÷ orders)
```
Compute each factor for the drop window vs the baseline window. The factor that moved most explains most of the drop.
Log-decomposition makes shares add up: share_i = ln(new_i ÷ old_i) ÷ ln(new_revenue ÷ old_revenue).

**Worked example (illustrative):**
| Factor | Baseline week | This week | Change | ln ratio |
|---|---|---|---|---|
| Sessions | 40,000 | 31,000 | −22.5% | −0.255 |
| Conversion | 1.50% | 1.52% | +1.3% | +0.013 |
| AOV | ৳1,600 | ৳1,590 | −0.6% | −0.006 |
| Delivery success | 85% | 84% | −1.2% | −0.012 |
| Delivered revenue | ৳816,000 | ৳629,000 | −22.9% | −0.260 |
→ Sessions explain ~98% of the drop → go down the **traffic** branch.

## Step 2 — The tree (go down only the branches that moved)

```
SESSIONS ↓
├─ Paid (Tirondaj): spend ↓? (card declined / budget cap hit / ad disapproved / account restricted)
│                   CPM ↑? (season competition, Eid/11.11) · CTR ↓? (creative fatigue)
│                   tracking change? (sessions fine but attributed ↓ → measurement, not sales)
├─ Organic search (Doot): impressions ↓ (indexing loss, Google update, site down/robots/noindex deploy)
├─ Social organic (Doot): reach ↓ (posting stopped, page restriction)
├─ Direct/WhatsApp/returning (Doot CRM): campaigns paused, SMS gateway down
└─ Site availability (Prohori): downtime, 5xx, slow pages (LCP ↑), DNS/CDN issues

CONVERSION ↓
├─ Site errors (Prohori/Sawdagor): checkout JS error, payment/OTP failure, address resolver failing,
│                                  device-specific break (check device gate)
├─ Stock (Bhandari): hero sizes out (M/L/XL), combos missing a piece, wrong stock sync
├─ Price/offer (Sawdagor + owner): price raised, offer ended, delivery charge changed, competitor sale
├─ Traffic mix: more cold/cheap traffic (e.g. Audience Network, new broad campaign) converts worse
└─ Trust/policy: policy text changed, review problems, payment method missing

AOV ↓
├─ combo engine/offer broken (Sawdagor) · mix shift to singles · discount deeper · free-delivery threshold changed

DELIVERY SUCCESS ↓ (refusals ↑)
├─ Courier performance by district (Bhandari) · confirmation calls not done (support/Gyani)
├─ fraud/fake-order wave (Gyani fraud engine) · ad creative mis-sets expectations (colour/size) (Tirondaj/Shilpi)
└─ longer delivery times (holiday, floods, hartal)

EXTERNAL / SEASON
└─ Eid/Ramadan phase, weather (late winter), national events, internet disruptions, payday timing
```

## Step 3 — Evidence rules
1. Every claim cites a number from a named source: our DB (orders, statuses), ad platforms (spend, CPM, CTR), Search Console, server logs/uptime, courier data, stock table, change log (who deployed/changed what and when).
2. **Timeline first:** line up the exact hour sales fell with the change log (deploys, price edits, budget changes, stock syncs, campaign edits). Correlation in time is the strongest early clue — but confirm with a mechanism.
3. Test the hypothesis: if "checkout error on Android 10", reproduce it on the device gate; if "card declined", see the billing notice; if "stock-out", show sizes out and the add-to-bag failure rate.
4. Use **5 Whys** down to a process cause, branch when several causes combine, and don't stop at "someone made a mistake" (AWS guidance; SRE: fix systems, not people).
5. Two independent pieces of evidence before naming a root cause; otherwise label it "probable".

## Step 4 — First aid while investigating (inside permissions)
- Reversible, owner-approved-by-standing-rule actions only: revert the last deploy (Prohori), restore a broken offer to its approved state (Sawdagor), pause a clearly broken campaign (Tirondaj auto-decrease rule).
- Anything on the approval list (G04) — price, budget increase, refunds, COD rule changes, blocking, deletion — **ask the owner first**, with the evidence.

## Step 5 — Report (G05 template) within: 2 h for a "sales emergency" (delivered orders < 50% of expected for 4 h), otherwise same day.

## Common mistakes
- Blaming ads when the checkout was broken (or vice versa) without looking at the funnel split.
- Reading a tracking change as a sales change.
- Comparing an Eid week to a normal week.
- Naming an agent before evidence; or never naming one when evidence is clear.

---

**Sources** (type in brackets):
- [Official/government] NIST/SEMATECH e-Handbook, control chart rules: https://itl.nist.gov/div898/handbook/pmc/section3/pmc32.htm
- [Practitioner] Mixpanel, Metric trees for e-commerce (Jun 2026): https://mixpanel.com/blog/metric-trees-ecommerce-example/
- [Official vendor doc] AWS, Using 5 Whys analysis in incident reports: https://docs.aws.eu/AmazonCloudWatch/latest/monitoring/incident-report-5whys.html
- [Book, official] Google SRE book, Postmortem culture: https://sre.google/sre-book/postmortem-culture/
- [Research] Baymard Institute, cart abandonment reasons (website errors 17%, extra costs 40%…; Sept 2025): https://baymard.com/lists/cart-abandonment-rate?gad=1
- [Internal] skills/tirondaj/06-measurement.md (MER/ROAS table), AGENT-PROTOCOL.md

*As of October 2026.*
