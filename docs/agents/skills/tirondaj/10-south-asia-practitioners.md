# T10 · South-Asian practitioners — what COD-market sellers in Bangladesh, India and Pakistan teach about paid ads

*Tirondaj তীরন্দাজ · A360-07 · module 10 · level: Post-graduate → PhD · version 1.0 · as of October 2026 · curriculum wave 2 deepening pass*

---

## 0. What the search found — honest summary

Searches in English, Bengali, Hindi and Urdu/Roman-Urdu for Facebook-ads and COD e-commerce tutorials:

- **YouTube video pages and transcripts were not readable** by our tools (one Hindi-market Facebook-ads course and
  several Pakistani Udemy courses surfaced only as listings). **No South-Asian Facebook-ads video could be reviewed.**
- Readable and useful: Indian founder-community diagnostics for Meta ads (eChai Ventures, which also links Indian
  practitioner Wittelsbach), Indian and Pakistani COD/RTO operations writing (logistics/checkout vendors, a Pakistani
  marketplace co-founder, DHL Pakistan, Aaj TV) and a Bangladeshi fake-order piece (Future Startup).
- Every percentage these sources give for RTO or "uplift" is **unsourced** → rejected as a number (§4).
- Net result: **no new platform rules** (Meta/Google docs stay the authority — T01–T03), but **several COD-market
  practices now have two or more independent South-Asian sources**, upgrading items T08 §3 had as [COMMUNITY].

Names come from the sources read; nothing is invented.

## 1. Sources reviewed

| Source | Country | Content | Verdict |
|---|---|---|---|
| eChai Ventures — "Meta ads clicks but no sales" (links Ben Heath, Jon Loomer, Meta docs, Indian D2C writers) | India | diagnostic order + India-specific checks | **Used** (§2) |
| Wittelsbach (via eChai's list) | India | COD policy vs ad copy; reach quality by placement and city tier; ASC basics | **Used with tags** (§2–3) |
| Markaz — Fawad Hussain (Sep 2026) | Pakistan | measure RTO, break-even formula, nine tactics incl. "filter harder at the ad stage" | **Used** (§3) |
| DHL Express Pakistan (Jul 2026) | Pakistan | confirmation, risk screening, prepaid incentives, delivery comms, courier choice | **Used** (§3) |
| Aaj TV — Nasir Wakeel (2020) | Pakistan | confirm by phone, advance payment for large/doubtful orders | **Used** (§3) |
| Future Startup — Nezam Uddin (2017) | **Bangladesh** | advance delivery charge, double phone confirmation, social-profile checks | **Used** (§3) |
| Velocity (2025), Shipmozo, HillTeck (2026), Razorpay (2019), base.com (2026) | India | RTO/NDR operations, risk scoring, static-rule warnings | **Used** for practices only (§3) |
| Udemy listings: Aqib Zaman "Local Pakistani E-commerce Market complete course, FB, TikTok" (updated Apr 2023); a "Facebook Ads for E-commerce (Hindi/Urdu)" course | Pakistan / India | syllabi only (Shopify, product hunting, FB/TikTok ads lectures) | **Found, not reviewed** — no claims taken |
| Digital Deepak (Deepak Kanakaraju) — Facebook Ads Mastery course page (2020, 2019 lesson list) | India | campaign types, pixel, custom audiences, retargeting | **Rejected as outdated** (pre-Advantage+, pre-CAPI era); no India-specific advice |

## 2. Diagnostics — "clicks but no sales" in a COD market [2-SRC — eChai + Meta docs already in T01/T02]

Check in this order (the leak is usually after the ad):
1. **Tracking:** Pixel + Conversions API firing Purchase correctly (Pixel Helper; Events Manager Test Events); optimise for Purchase, not a proxy — **[OFFICIAL via T02]**.
2. **Learning phase:** "Learning limited"; batch edits so learning resets once — **[OFFICIAL via T01]**.
3. **Creative fatigue:** frequency rising with flat reach, CTR falling, CPM rising → refresh hooks first.
4. **Landing page:** speed, promise match, drop-off recordings (Shilpi U01/U10, Sawdagor S01).
5. **Offer and trust:** price, guarantee, trust signals near price/CTA.
India-specific additions (eChai): **split COD vs prepaid ROAS** (returns/refusals flatter reported ROAS) — already EXTAS's delivered-ROAS rule **[HOUSE, T06]**; **Audience Network and premature tier-3 expansion inflate clicks without buyers** — diagnose by **placement and city tier/district**, not overall CTR **[COMMUNITY — Wittelsbach via eChai; test with our delivered data before excluding anything]**.

## 3. COD-market practices with independent support

| Practice | Independent sources | Tag | EXTAS status |
|---|---|---|---|
| **Ad promise = product page = policy** (state COD/exchange terms honestly; vague "free COD, no questions" attracts refusers) | Wittelsbach (IN) + Markaz "filter harder at the ad stage" (PK) + EXTAS accurate-expectations rule | **[2-SRC]** | new creative rule: COD/exchange line in ad copy must match checkout wording (T05) |
| **Confirm every COD order before dispatch** | Velocity, Shipmozo, eChai (IN); DHL PK, Markaz, Aaj (PK); Future Startup (BD) | **[2-SRC]** | in place |
| **Advance payment / delivery charge for large, new or doubtful orders — not for everyone** | Aaj TV (PK), DHL PK, Future Startup (BD: one store's fake orders "nearly zero" after it — anecdote), Shipmozo (verify medium-risk only) | **[2-SRC]** | blueprint: advance delivery charge by bKash for high-risk only, never auto-block |
| **Risk-based rules beat blanket blocks** (blocking whole pincodes/regions rejects genuine buyers; tighten by risk tier instead) | Razorpay (IN, 2019), Shipmozo (IN) | **[2-SRC]** | matches T08 "lower a district's value, don't exclude on one bad week" |
| **Prepaid incentive** (small discount/free delivery for bKash/Nagad) | DHL PK, Shipmozo, Velocity, HillTeck | **[2-SRC]** as a practice | **price change → owner approval**; test as an offer, measure delivered margin |
| **Fast NDR follow-up** (failed delivery → message within hours) | Velocity, eChai, Shipmozo, HillTeck | **[2-SRC]** | Doot owns messages (D10 §5) |
| **Choose couriers by regional performance** | Velocity (IN), DHL PK | **[2-SRC]** | PR 178 / 192 |
| **Exclude past refusers from ads; feed delivered/refused back** | Markaz (stop selling to/at what returns), EXTAS T02 | [HOUSE] | in place |

### Break-even thinking (Markaz) — matches T06
Successful deliveries needed to pay for one failure = **F ÷ M** (F = full cost of a failed parcel, M = margin per delivered order). Use EXTAS's own F and M per category; e.g. with placeholder F = ৳210, M = ৳900 → every refusal eats 0.23 of a delivered order's margin. **[COMMUNITY formula, arithmetic is ours — same logic as T06 §delivered economics]**

## 4. Rejected numbers (do not quote)

| Claim | Source | Why |
|---|---|---|
| "COD RTO 28–35%, prepaid 4–8%" | Shipmozo | no source |
| "OTP/WhatsApp verification cuts RTO 34–41%" | Shipmozo | vendor claim, no method |
| "SMS confirmation cuts RTO 20–35%" (FAQ says 10–15%) | base.com | inconsistent, unsourced |
| "IVR cuts RTO 20–30%" (FAQ 25–40%) | HillTeck | inconsistent, vendor |
| "COD RTO up to 40%" | Razorpay 2019 | own unsourced finding, old |
| "~30% of COD orders return" | Shiprocket via eChai | unsourced |
| "Pakistan national RTO 18–20%" | DHL PK FAQ | unsourced; Markaz: no audited national figure |
| "SEO CAC ₹140 vs paid ₹480" | eChai | one unnamed brand |

## 5. What Tirondaj does with this
1. Add a **"COD honesty" line check** to every creative review: the ad's COD/exchange/delivery-time words equal the checkout wording (Sawdagor) — mismatch = no launch.
2. In weekly reports, show **refusal % by placement and by district** next to delivered CPA; propose (never apply alone) value-rule changes for outliers.
3. Prepaid-incentive test → written proposal to the owner (offer, cost per order, guard metrics), per T07.
4. Re-run the South-Asia search quarterly (LEARNING-LOOP §1e) with Bengali/Hindi/Urdu terms; try YouTube via mirrors/Class Central; ask the owner to share any creator he trusts so it can be reviewed.

---

**Sources** (type in brackets):
- [Founder community guide — IN] eChai, Meta ads not converting: https://echai.ventures/d2c/d2c-meta-ads-fundamentals/ads-not-converting
- [Founder community index — IN] eChai, resources from Wittelsbach: https://echai.ventures/d2c/from/wittelsbach
- [Marketplace blog — PK] Markaz, COD return rates in Pakistan (Sep 2026): https://www.markaz.app/blog-post/cod-return-rates-in-pakistan-how-to-reduce-them
- [Vendor guide — PK] DHL, Reduce COD returns (Jul 2026): https://www.dhl.com/discover/en-pk/e-commerce-advice/e-commerce-best-practice/subscription-marketing/how-pakistani-e-commerce-sellers-can-reduce-cod-returns
- [News — PK] Aaj TV, Reduce return rate (2020): https://english.aaj.tv/news/30247881/
- [News — BD] Future Startup, Fake orders tips (2017): https://futurestartup.com/2017/01/31/practical-tips-deal-fake-orders-e-commerce-f-commerce/
- [Vendor blog — IN] Velocity, RTO & NDR management (2025): https://blog.velocity.in/rto-and-ndr-management-in-ecommerce/
- [Vendor blog — IN] Shipmozo, COD fraud: https://www.shipmozo.com/blog/cod-fraud-in-indian-e-commerce
- [Vendor blog — IN] HillTeck, Reduce RTO (2026): https://www.hillteck.com/blog/reduce-rto-ecommerce.html
- [Payments blog — IN] Razorpay, RTO and fraud (2019): https://razorpay.com/blog/ecommerce-business-cost-saving-rto-fraud/
- [Vendor blog — IN] base.com, SMS for COD confirmation (2026): https://base.com/en-IN/blog/?p=20701
- [Founder community guide — IN] eChai, Reduce RTO and block fake COD orders: https://echai.ventures/d2c/d2c-rto-returns-cod/reduce-rto-block-fake-cod-orders
- [Course listing] Udemy, Local Pakistani E-commerce Market complete course (Aqib Zaman): https://www.udemy.com/course/local-pakistani-e-commerce-market-complete-coursefbtiktok/
- [Course page — IN] Digital Deepak, Facebook Ads Mastery course (2020): https://digitaldeepak.com/get-facebook-ads-mastery-course-for-free/

*As of October 2026.*
