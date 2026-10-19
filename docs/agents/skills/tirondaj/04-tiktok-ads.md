# T04 · TikTok ads — Smart+, catalogue, Spark Ads, creative norms

*Tirondaj তীরন্দাজ · A360-07 · module 4 of 9 · level: Graduate · version 1.0 · as of October 2026*

**Position for EXTAS:** third channel after Meta and Google. Young male audience, video-only, cheap reach, but
COD refusal risk from impulse orders may be higher — prove it with delivered numbers before scaling.
TikTok announced ad solutions in Bangladesh in May 2024 through regional sales partner **Aleph**; whether self-serve
Ads Manager lets a Bangladesh-registered account target Bangladesh with all options must be checked in the account
(TikTok's location page says options depend on the registration country).

---

## 1. Campaign types to use

| Type | What it is (official) | EXTAS use |
|---|---|---|
| **Smart+ Web Campaign** | TikTok automates setup and optimisation; you give location, language (gender only for some advertisers); optimisation goals: Value, Conversion, Landing Page View, Click; promotes on TikTok, Search and Pangle (Pangle in available markets); **no manual placement**; Spark and non-Spark ads cannot be mixed in one campaign | Default once the Pixel + Events API send ≥ OrderConfirmed reliably |
| **Smart+ Catalog Ads** | Turn on "Product Source Details" in a Smart+ Web campaign, pick the catalogue; catalogue creative used by default, plus up to **30 extra videos/images** | Retarget viewers / add-to-bag; show combos as catalogue items |
| Manual web conversion campaign | full control (placements, audiences) | Use when Pangle must be excluded (Smart+ can't exclude it) or for structured tests |

Catalogue availability by country is not confirmed for Bangladesh — check in Ads Manager (Catalog Manager) before planning.

## 2. Spark Ads

- A Spark Ad promotes an **organic post** (ours or a creator's); likes, comments, shares and follows stay on the original post.
- Creator flow: post → Ad settings → turn on *Ad authorization* → choose duration (**30, 60 or 365 days** per the guide we read) → generate code → we paste it in Ads Manager (Tools → Creative assets → Spark Ad posts → Apply for authorization; batch up to 20 codes).
- Captions cannot be edited after authorization → agree the caption (Bengali/English, price, COD line) before the creator posts.
- EXTAS use: pay micro-creators (Dhaka university students, gym/fashion creators) for try-on and "combo unboxing" posts, then Spark the best 20%. Contract must state the authorization length and that we may run it as an ad.

## 3. Creative norms (TikTok official "Creative best practices for performance ads")

- Vertical **9:16**, at least **720p**, with **sound/music**.
- **Hook in the first 6 seconds**; state the offer/proposition **within the first 3 seconds**.
- Captions or text overlays for context; if text, **5–10 words per second**.
- **3–5 different creatives per ad group** and 3–5 diversified ad groups per campaign (for non-Smart+ setups); creatives that differ a lot work better in testing.
- Refresh when delivery shows a **consistently declining trend** or when daily new reach is low; add new creatives to the existing ad group rather than creating a new one.
- Keep content inside the UI safe zone; secondary guide (NestScale, Aug 2026, citing TikTok): keep key elements in the centre and at least ~270 px from the bottom and ~100 px from the right of a 1080×1920 frame. In-feed video 5–60 s accepted; practitioners report 9–15 s (or 9–21 s) works best — treat as a starting point, test it.
- Ad text: description 1–100 Latin characters (≈ 1–50 Asian characters); no emojis in brand name or description; no `#` or `{}` in descriptions (secondary source — verify in Ads Manager).

EXTAS TikTok formats that fit the brand:
1. **"৳1,999-তে ৩ পিস"** combo reveal — three pieces dropped on a bed, price on screen at second 1.
2. **Try-on transition** — plain tee → full combo on the beat.
3. **Fabric proof** — macro of pique knit / fleece inside; stretch test; "wash test after 10 washes".
4. **Size help** — "I'm 5'8", 70 kg, I wear L" — cuts size-related refusals.
5. **Courier moment** — parcel opened at the door, "দেখে তারপর টাকা দিন" (check-then-pay, only if that is our real policy).

## 4. Signals on TikTok

- Pixel + **Events API** with identical `event` + `event_id`; 48 h window; cross-channel duplicate must arrive > 5 min after the first (official).
- Store `ttclid` on the order; send phone hashed (same normalisation as Meta: 880… then SHA-256).
- Optimise for Purchase/OrderConfirmed equivalent; whether TikTok lets us optimise on a **custom** delivered event is not confirmed — so judge TikTok strictly on delivered CPA from our DB.

## 5. Kill / keep rules specific to TikTok

- Delivered rate from TikTok orders tracked separately. If TikTok's delivered rate is ≥ 10 points worse than Meta's for two straight weeks, move TikTok to OrderConfirmed-only judging and require the advance-delivery-charge rule for its high-risk orders (fraud engine, Gyani's area — propose, don't change).
- Kill a creative after 2 × CPA cap with no confirmed order; kill an ad group after 4 × cap.

---

**Sources** (read for this module):
- TikTok Business Help, About Smart+ Web Campaigns: https://ads.tiktok.com/help/article/about-smart-plus-web-campaigns?lang=en
- TikTok Business Help, Creative best practices for performance ads: https://ads.tiktok.com/help/article/creative-best-practices?lang=en
- TikTok Business Help, About event deduplication: https://ads.tiktok.com/help/article/event-deduplication?lang=en
- TikTok Business Help, Available location targeting by market: https://ads.tiktok.com/help/article/placements-available-locations?lang=en
- Insense, TikTok Spark Ads guide (Feb 2026): https://insense.pro/blog/tiktok-spark-ads
- NestScale, TikTok ad specs (Aug 2026): https://nestscale.com/blog/tiktok-ads-specs.html
- The Financial Express, TikTok launches ad solutions in Bangladesh (May 2024): https://thefinancialexpress.com.bd/trade/tiktok-launches-ad-solutions-in-bangladesh

**Not verified:** Bangladesh targeting options and catalogue availability for a BD-registered account; a 7-day Spark
code option (not in the source read); optimising on custom events; Smart+ minimum budgets.

*As of October 2026.*
