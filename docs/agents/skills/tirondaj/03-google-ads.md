# T03 · Google Ads — Search, Shopping / Performance Max, Demand Gen (YouTube), bidding, conversion import

*Tirondaj তীরন্দাজ · A360-07 · module 3 of 9 · level: Graduate → Post-graduate · version 1.0 · as of October 2026*

**Role of Google for EXTAS:** Meta *creates* demand (people scrolling); Google mostly *captures* it (people searching
"polo shirt price in bd", "extas combo", "winter hoodie men") and re-reaches them on YouTube/Gmail/Discover.
Start Google with brand + high-intent product search and a feed-based campaign; expand only on delivered-CPA proof.

---

## 0. Availability check — do this first (open question)

| Item | What we found | Action |
|---|---|---|
| Shopping ads / free listings **targeting Bangladesh** | Conflicting: Merchant Center's "supported countries and currencies" table does **not** list Bangladesh; Merchant Center's regional-availability (RAAP) page **does** list Bangladesh; a third-party list (FeedArmy, updated July 2026) lists Bangladesh. Google also runs "beta countries" where access may be limited to some retailers. | In Merchant Center, try to add Bangladesh as a target country and see whether BDT pricing is accepted. Record result in BLOCKED.md. **Until confirmed, plan Search + Demand Gen + PMax without assuming Shopping inventory.** |
| Bengali (বাংলা) as a Merchant Center language | Not in the supported-language list we read. | Feed titles in English (customers search in English and Banglish anyway); Bengali in ad text where Google Ads allows it. |

## 1. Campaign map

```
Google Ads account (USD billing) ── Google tag + enhanced conversions ── Merchant Center (feed from Bhandari)
├─ G1 Search · BRAND        exact/phrase "extas", "extas bd", misspellings · protects the name · tCPA or Max conv.
├─ G2 Search · CATEGORY     polo / t-shirt / hoodie / tracksuit / combo set + "price in bd", "online", "men"
│                           (broad match + smart bidding once conversions flow; AI Max optional, see §2)
├─ G3 Performance Max · FEED (if Shopping is available) · asset groups by category / season · new-customer goal
├─ G4 Demand Gen · VIDEO+IMAGE (YouTube Shorts, in-feed, Discover, Gmail) · product feed attached · remarketing + lookalike seed of delivered buyers
└─ (no Display-only campaigns; no Video Action — VAC is retired, see §4)
```

## 2. Search

- **Keywords:** group by intent: *brand* · *product + price* ("polo shirt price in bangladesh") · *product + attribute* ("cotton polo men", "winter hoodie") · *combo/set* ("t-shirt combo offer", "tracksuit set men"). Include Banglish ("polo shirt dam koto") only after checking the search terms report shows them.
- **Negatives** (account list): free, job, wholesale (unless buying-house wants it), pdf, png, "how to make", female-only terms if irrelevant, competitor brand names (unless a deliberate conquest test).
- **Ads:** responsive search ads; headlines carry *price*, *COD*, *delivery promise* (Dhaka ৳60 / outside ৳120 — from checkout settings, never typed by hand), *exchange rule*, *combo saving*. Use sitelinks to Combos, Polos, Hoodies, Size guide.
- **AI Max for Search** (an optimisation layer inside Search, not a new campaign type): search-term matching (broad + landing-page based), text customisation, final URL expansion; controls = brand inclusions/exclusions, locations of interest, URL inclusions/exclusions. Turn on only in G2 after ≥ 30 conversions/30 days, with URL exclusions for policy/blog pages. Release status per Google page: not stated — check in the account.

## 3. Performance Max with a Merchant Center feed

Google's own optimisation tips (official) applied to EXTAS:
1. **Feed quality first:** all products approved; price and availability always current (Bhandari's sync); rich descriptions; images ≥ 500×500 (and Google's clothing guidance: ≥ 512×512, ideally ≥1024, width 1500 recommended; plain white/transparent background for the main image; model shots for clothing; don't crop head/feet in full-body).
2. **Apparel attributes:** `color`, `size`, `gender`, `age_group`, `item_group_id` (same for all variants), `material`, `pattern`, `size_system`; `is_bundle`/bundle for sets sold as one item. Title: Brand + product type + key attributes, most important within the **first 70 characters** — e.g. `EXTAS Men's Cotton Pique Polo Shirt – Navy – Regular Fit`.
3. **Custom labels** mirror the Meta labels (T01 §3): combo/single, bestseller/new/clearance, season, margin band, stock band.
4. **Structure:** keep it simple, one budget; split campaigns only for different budgets, ROAS targets or product groups (best sellers, high margin, clearance). Asset groups by theme (Winter, Summer polos, Combos).
5. **Seasonal asset groups:** upload Eid/winter asset groups **at least 2 weeks before** the event; use asset-group scheduling.
6. **Runtime:** let a PMax campaign run **at least 6 weeks** before judging.
7. **Seasonality adjustments** for short, big events (> 30% change within 7 days) — e.g. Eid final-week rush, 11.11 day.
8. **New customer acquisition goal:** "new customer value" mode (bids higher for new buyers); "new customers only" mode only with a dedicated acquisition budget. Feed it Customer Match lists of past buyers so it can tell new from returning.
9. **Controls available (2025 rollouts, reported by PPC Land):** campaign-level negative keywords (up to 10,000), search terms report, channel performance report, brand exclusions (per format for feed campaigns), age exclusions, device targeting, asset reporting. Use channel report weekly: if most spend sits in Display/Discover with poor delivered CPA, tighten assets and audience signals.
10. Brand: exclude our brand from PMax (brand exclusions) so G1 Search owns brand queries — otherwise PMax "steals" cheap brand conversions and looks better than it is.

## 4. YouTube = Demand Gen now

- Video Action Campaigns were retired: no new VACs from April 2025; automatic upgrades to Demand Gen from July 2025; final upgrades April 2026 (failed upgrades are recreated **paused** — check for paused Demand Gen campaigns you didn't create).
- Demand Gen runs on YouTube (in-stream, in-feed, **Shorts**), Discover, Gmail and the Google Display Network; supports video, image and carousel; product feeds attach.
- Google's Demand Gen best practices (official): daily budget ≥ **10 × target CPA** (or ≥ $100/day for Maximize strategies); per campaign at least 3 vertical, 3 square, 3 horizontal images and 1 vertical, 1 square, 1 horizontal video; judge only after **≥ 50 conversions**; merge ad groups with < 30 conversions/30 days; change bids/budgets by **5–10% per week, never more than 15%**; add new assets before removing old.
- EXTAS reality check: at a ৳450 CPA cap (≈ $3.75), 10× = ≈ $38/day. If the owner's Google budget is smaller, run Demand Gen only as remarketing or wait.

## 5. Bidding strategies

| Strategy | When for EXTAS | Official requirement / behaviour |
|---|---|---|
| Maximize conversions | new Search campaign, first 2–4 weeks | spends the full budget |
| **Target CPA** | once a campaign has ~30 conversions in 30 days | can start with no history; Google recommends last-30-day CPA; target too low = fewer conversions |
| Maximize conversion value | PMax start; when values differ (combos vs singles) | needs real order values |
| **Target ROAS** | after 4 weeks or 1–2 conversion cycles of value data; Search/Shopping need 15 conversions/30 days; Demand Gen 50 in 35 days | expressed as % (৳5 revenue per ৳1 = 500%); too-high target throttles traffic; 1–2 conversion cycles to settle after a change |

Set the target from **delivered** economics: if 85% of orders are delivered, a platform tROAS that looks like 400% on orders is really ≈ 340% on delivered revenue (before COGS and courier). Better: make the platform see delivered values (retractions/restatements, §6) and set tROAS on that.

## 6. Conversion setup and import

1. Google tag on all pages + **enhanced conversions** (hashed phone/email at purchase).
2. Primary conversion = Purchase with **transaction_id = order number** and value ex-delivery charge. Secondary (non-biddable) = add to cart, begin checkout (Demand Gen guidance: set shallow actions as non-biddable when optimising for purchase).
3. Every day, upload **retractions** for refused/cancelled orders and **restatements** for partial deliveries/exchanges, keyed on order ID (T02 §5). Retract works for CPA and ROAS bidding; restate affects ROAS bidding.
4. Optional: offline "Delivered" conversion by GCLID (90-day click window for file/HTTP/Sheets uploads; wait 4–6 h after creating the action before the first upload; GCLID is case-sensitive).
5. Store gclid / gbraid / wbraid on the order (Prohori).

## 7. Weekly Google checklist

- [ ] Search terms report (Search + PMax): add negatives; find new exact keywords.
- [ ] PMax channel report + asset report; listing/product diagnostics in Merchant Center (disapprovals, price mismatches).
- [ ] Retraction upload ran every day; count = refused + cancelled orders with a Google click ID.
- [ ] Brand campaign impression share; brand CPC trend (competitor bidding on "extas"?).
- [ ] Platform CPA vs delivered CPA per campaign.
- [ ] Any Demand Gen campaign created paused by the VAC upgrade?

## 8. Common mistakes

- Letting PMax take brand traffic and calling it a win.
- tROAS set on order value while 15% of orders are refused.
- Judging PMax at week 2 (Google: give it 6 weeks).
- Feed price ≠ site price (disapprovals; and misleading).
- Changing Demand Gen budget by 50% in a day (Google: max 15%/week).

---

**Sources** (read for this module):
- Google Ads Help, PMax optimisation tips with a Merchant Center feed: https://support.google.com/google-ads/answer/13776350
- Google Ads Help, About Target ROAS: https://support.google.com/google-ads/answer/6268637
- Google Ads Help, About Target CPA: https://support.google.com/google-ads/answer/6268632?hl=en-GB
- Google Ads Help, Video Action Campaigns upgraded to Demand Gen: https://support.google.com/google-ads/answer/15110871?hl=en
- Google Ads Help, Best practices for Demand Gen: https://support.google.com/google-ads/answer/14693848
- Google Ads Help, AI Max for Search: https://support.google.com/google-ads/answer/15910187?hl=en-GB
- Google Ads Help, About conversion adjustments: https://support.google.com/google-ads/answer/7686447?hl=en
- Google Ads Help, Offline conversions with GCLID: https://support.google.com/google-ads/answer/7012522?hl=en-GB
- Merchant Center Help, Best practices for clothing and accessories: https://support.google.com/merchants/answer/7348545?hl=en
- Merchant Center Help, Supported languages and currencies: https://support.google.com/merchants/answer/160637
- Merchant Center Help, Regional availability and pricing: https://support.google.com/merchants/answer/16782229
- Merchant Center Help, Beta countries: https://support.google.com/merchants/answer/7101265?hl=en
- FeedArmy, Google Shopping country list (July 2026): https://feedarmy.com/kb/available-countries-list-for-google-shopping/
- PPC Land, PMax 2025 feature rollouts: https://ppc.land/google-wraps-up-performance-max-feature-rollouts-in-2025/

**Not verified:** whether Shopping ads currently serve to Bangladesh users and in which currency (conflicting
official pages — test in Merchant Center); AI Max release status.

*As of October 2026.*
