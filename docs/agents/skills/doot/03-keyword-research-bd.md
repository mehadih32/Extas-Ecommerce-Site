# D03 · Keyword research for Bangladesh — English, Bengali (বাংলা) and Banglish queries for menswear

*Doot দূত · A360-06 · module 3 of 9 · level: Graduate → Post-graduate · version 1.0 · as of October 2026*

---

## 1. How BD shoppers search (what we know, what we must measure)

- Three scripts/registers appear: **English** ("polo shirt price in bangladesh"), **Bengali script** ("পোলো শার্ট দাম"), **Banglish / romanized Bengali** ("polo shirt er dam koto"). Romanized Bangla is common in BD social text: one ULAB study's dataset from Facebook/Twitter/YouTube/news had ~28% romanized-Bangla entries (sample composition, not a national share) **[academic, single source]**.
- Google has supported Bengali in its ad system since 2017 (AdWords/AdSense, plus Bengali Knowledge Graph and voice search) **[news, MediaNama]**.
- **What we don't know without our own data:** the real split of English vs Bengali vs Banglish searches for our products. → Measure it from Search Console queries after launch (D03 §6) — that becomes the rule, not a guess **[HOUSE]**.

## 2. Tools (free first)

| Tool | Use | Limits |
|---|---|---|
| **Google Search Console** (after launch) | the only real query data for *our* site: queries, impressions, clicks, position, by page and country | only queries we already appear for; small numbers hidden |
| **Google Keyword Planner** | ideas + volumes + forecasts; set **location = Bangladesh**, **language = English and Bengali** separately; segment by device | needs billing set up; volumes are broad without spend **[COMMUNITY — widely reported]** |
| **Google Trends** | season curves and relative comparison (0–100 = share of searches, normalised to the peak; low-volume terms show 0; it's a sample) **[OFFICIAL Google News Initiative training]** | no absolute volumes |
| Google autocomplete + "People also ask" + related searches (searched from BD, logged out) | real phrasing incl. Banglish | manual |
| Facebook/Instagram/TikTok search bars, Daraz search suggestions | how people phrase products socially | manual |
| Our own site search logs (Doot's analytics layer already logs search) | exact words customers type on EXTAS | only existing visitors |
| Customer chats (WhatsApp/Messenger) | the language of questions → FAQ and blog topics | needs tagging |
| Paid suites (Semrush/Ahrefs) | competitor keyword gaps, difficulty | BD database depth for Bengali is uncertain — test in trial (TRIAL-PLAN) |

## 3. Keyword map structure (one primary intent per URL)

| Intent | Example queries | Target page |
|---|---|---|
| Category, commercial | polo shirt for men · men's polo shirt bd · পোলো শার্ট | `/men/polo-shirts` |
| Category + price | polo shirt price in bangladesh · polo t shirt dam | same category page (price range in title/intro) |
| Sub-category / attribute | cotton pique polo · white polo shirt · oversized t shirt men · winter hoodie men | sub-category or indexable facet page (D04 §4) — only if demand exists |
| Combo / set | t-shirt combo offer · tracksuit set men · polo jogger set | `/combos/...` or combo category |
| Season / occasion | eid panjabi collection · winter jacket men bd · boishakh t shirt | seasonal landing page (kept live year-round, refreshed) |
| Brand | extas · extas polo · extas bd | home / brand pages |
| Product-specific | extas pique polo navy | PDP |
| Informational | polo vs t-shirt · how to choose t shirt size · গেঞ্জির সাইজ কিভাবে মাপবো | blog / size guide (links to category) |

Rules **[HOUSE, consistent with Ahrefs category guidance]**: never target the same primary query with two URLs (cannibalisation); categories take broad commercial terms; long-tail specific terms go to sub-categories/PDPs; informational terms go to the blog and link to the money page.

## 4. Building the list — step by step

1. **Seed list** from the product tree: polo, t-shirt, shirt, hoodie, sweatshirt, tracksuit, jogger, trouser, jacket, panjabi, combo/set — each in English, Bengali script and Banglish.
2. **Modifiers:** price/dam, bd/bangladesh, online, for men/chheleder, cotton, winter/sheet, offer/combo, size names (M, L, XL, XXL, 3XL), colours, occasions (eid, office, gym).
3. **Expand** with Keyword Planner (BD, English; then BD, Bengali), autocomplete, related searches, PAA.
4. **Qualify:** volume (Planner range / Trends comparison), intent (look at the live results page: are they category pages, products, blogs, marketplaces?), competition (who ranks — Daraz, big local brands, Facebook pages?).
5. **Cluster** by intent and SERP overlap → one cluster = one URL.
6. **Prioritise:** (business value × achievable) — combos and high-margin categories first; long-tail where page 1 shows weak/thin pages.
7. **Assign** to URLs in the keyword map sheet; write title/H1/intro from the cluster's main phrase.

## 5. Bengali / Banglish specifics

- Spelling variants matter: "টি-শার্ট / টিশার্ট / টি শার্ট"; "গেঞ্জি" for tee/vest; "প্যান্ট"; Banglish "dam", "daam", "koto". Collect variants from autocomplete and our search logs.
- Don't stuff variants into copy. Use the natural main form in headings; let a short Bengali FAQ and Bengali product descriptions (if a `/bn/` version exists — D02 §6) carry Bengali phrasing. Google's spam policy explicitly names keyword stuffing **[OFFICIAL]**.
- Bengali Unicode text must be real text (not images of text) so it can be indexed.
- Banglish rarely belongs in titles; it shows up in FAQ questions phrased the way customers ask ("Polo shirt er size kivabe bujhbo?") — test before scaling **[COMMUNITY — test before use]**.

## 6. After launch — the measurement loop

Weekly (Search Console, last 28 days):
- Queries with impressions but CTR far below the site average at positions 3–10 → rewrite title/description.
- Queries ranking 8–20 → strengthen the page (content, internal links) — the cheapest wins.
- New query clusters (especially Bengali/Banglish) → add to the map; maybe a new page.
- Script split: share of impressions from Bengali-script queries vs English vs Banglish → update §1 with the real number.

## 7. Common mistakes
- Using global keyword volumes (US/UK) for a BD shop.
- One page per spelling variant (doorway-like; Google's spam policy lists doorway abuse).
- Targeting "polo shirt" with the home page, the category and a blog post at once.
- Ignoring marketplaces and Facebook pages in the SERP when judging difficulty.

---

**Sources** (type in brackets):
- [Official] Google Ads Help, Keyword Planner: https://support.google.com/adwords/answer/6325025?hl=en-GB
- [Official training] Google News Initiative, Google Trends — understanding the data: https://newsinitiative.withgoogle.com/resources/trainings/data-journalism/google-trends-understanding-the-data
- [Official] Google, Spam policies (keyword stuffing, doorway): https://developers.google.com/search/docs/essentials/spam-policies?authuser=0&rd=1&visit_id=639279628525680537-3678641720
- [News] MediaNama, Google adds Bengali to AdWords/AdSense (Oct 2017): https://www.medianama.com/2017/10/223-google-bengali-adsense-adwords/
- [Academic] Hassan et al. (ULAB), Sentiment analysis on Bangla and Romanized Bangla text: https://arxiv.org/pdf/1610.00369
- [Practitioner blog] Ahrefs, e-commerce category pages (Matching terms, Parent Topic clustering): https://ahrefs.com/blog/seo-ecommerce-category-pages

**Not verified:** Keyword Planner's volume-range behaviour without spend (widely reported, not in the help page read);
Bengali keyword database depth in paid tools.

*As of October 2026.*
