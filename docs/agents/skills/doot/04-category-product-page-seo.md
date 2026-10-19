# D04 · Category and product page SEO for fashion — titles, intros, facets, pagination, variants, PDP content

*Doot দূত · A360-06 · module 4 of 9 · level: Post-graduate · version 1.0 · as of October 2026*
*Design layer is Shilpi's; page logic is Sawdagor's. Doot supplies SEO requirements and signs off the SEO checklist.*

---

## 1. Category pages are the main ranking asset for commercial terms

Category/sub-category pages usually match broad commercial queries ("polo shirt for men"); product pages tend to rank for
brand/model-specific queries **[2-SRC: Ahrefs category guide + Go Fish Digital 2026 (agency, little original data)]**.
→ The first SEO money is in categories, combos categories and seasonal collections.

## 2. Category page template (EXTAS)

| Element | Rule | Evidence |
|---|---|---|
| H1 | the shopper's words: "Men's Polo Shirts" (Bengali page: "ছেলেদের পোলো শার্ট") | [2-SRC] Ahrefs, Go Fish |
| Title | `<H1 / main query> – Price in BD from ৳<lowest> | EXTAS` (blueprint: templated with lowest price); keep short (long titles are rewritten more often — Ahrefs data: Google rewrote 33.4% of titles studied, using the H1 ~51% of the time when it did) | [2-SRC] Ahrefs + blueprint; price from DB |
| Intro above the grid | **30–100 words**: what's in the range, fabric, fit, size range, delivery/exchange line. No wall of text — Mueller is quoted saying "maybe 90%, 95%" of long bottom-of-page category text is unnecessary | [2-SRC] Ahrefs (30–60) + Go Fish (50–100) |
| Product grid | first page of products **server-rendered** with `<a href>` links to canonical PDP URLs | [OFFICIAL] JS SEO + pagination docs |
| Below the grid | short buying guide + real FAQ (size, fabric care, delivery) + links to sub-categories and related combos | [2-SRC] |
| Internal links | parent → child and sibling links automated from the category tree; top categories linked from home/nav; blog posts link in with descriptive anchors | [2-SRC] Ahrefs, Go Fish |
| Structured data | BreadcrumbList; optional CollectionPage/ItemList; **no** Product/AggregateRating on category pages | [OFFICIAL eligibility] + [2-SRC] |
| Breadcrumb position | SEO placement doesn't matter; Ahrefs reports A/B tests where top breadcrumbs hurt conversion — Shilpi decides by test | [COMMUNITY — test before use] |

## 3. Variants: one URL per style or per colour?

| Option | When | SEO handling |
|---|---|---|
| **A. One PDP per style**, colour/size selectors (default) | most EXTAS products | `ProductGroup` with `variesBy` color+size; selector parameters (`?color=navy`) canonical to the style URL |
| B. One URL per colour | a colour has its own search demand ("white polo shirt") and distinct photos | each colour page self-canonical, Product with `inProductGroupWithID`; other colours linked |
Sizes never get their own indexable URLs **[2-SRC: SEJ faceted guidance (keep size/price out of index) + Google faceted doc]**.

## 4. Facets and filters (colour, size, price, fabric, sort) [OFFICIAL + 2-SRC]

Decision tree:
```
Does the filter combination have real search demand (Keyword Planner / Search Console)?
├─ YES (e.g. "white polo shirt", "cotton hoodie") → make it a real sub-category page:
│      static path (/men/polo-shirts/white), self-canonical, own H1/intro, linked from the parent
└─ NO (size, price range, sort, most multi-filter combos)
       → don't let Google crawl them: robots.txt disallow the parameters (or apply filters client-side without <a href>),
         return 404 for empty combinations, never link them in sitemaps
```
- Google: robots.txt disallow is the way to prevent crawling of facet URLs; canonical and nofollow are "generally less effective long term"; for sort/filter variants of the same list Google's pagination doc also allows `noindex` **[OFFICIAL]**.
- Don't combine robots.txt disallow **and** noindex on the same URL (Google can't see a noindex on a page it may not crawl) **[COMMUNITY — standard practice; follows from Google's crawl rules]**.
- Use `&` as separator, fixed parameter order **[OFFICIAL]**.

## 5. Pagination [OFFICIAL]
Each page its own URL (`?page=2`) with a **self-canonical** (never canonical to page 1); sequential `<a href>` next links; no `#` page numbers; rel=next/prev unused by Google; "Load more"/infinite scroll must also have crawlable page links. Titles may repeat across the series.
(Some practitioners advise noindex on page 2+; Google's own doc doesn't — follow Google.)

## 6. Product page (PDP) content (blueprint C4.2 + Google)

- **Above the fold: selling only** (images, price, colour, size, Find my size, Add to Bag) — no SEO paragraphs **[HOUSE, blueprint]**.
- **Below: server-rendered collapsible sections** (Fabric & care, Size & fit chart, Delivery & exchange from Smart Rules, Questions, Reviews). Accordions are fine only when the text is already in the HTML — "text loaded on click is never done" **[HOUSE + OFFICIAL basis: Google indexes rendered HTML]**.
- **Unique description** per style: fabric (GSM, composition), fit, measurements, care, styling — written from Bhandari's product data; never copied from a supplier or another product.
- Real reviews with fit info (Too small / Just right / Too big) — useful content and AggregateRating source.
- Images: descriptive file names and alt text (Shilpi photo module P06), multiple angles, set photos for combos.
- Title tag: `EXTAS <Product> – <Colour> | Price ৳<price> in BD` (price from DB).
- Product JSON-LD in initial HTML (D02 §4).

## 7. Out of stock, discontinued, seasonal [COMMUNITY — standard practice; consistent with Google status-code guidance]
- Temporarily out: keep 200, `OutOfStock`, show alternatives + "notify me".
- Seasonal (returns next winter): keep the URL; update and re-stock the same URL each season.
- Discontinued with a successor: 301 to successor; without: 301 to the category if closely relevant, otherwise 404/410.

## 8. Combo pages
- Each combo is a page with its own URL, H1 ("Polo + Jogger Summer Set"), set photo, set price and the per-piece saving, plus links to the single products **only inside the combo context** (owner rule: never take a customer away from a combo to a single product page — so single-product links open in the combo flow, not a PDP jump).
- Combo category pages ("T-shirt combo offers", "Winter combos") target set/offer queries.

## 9. SEO checklist per category/PDP launch
- [ ] Main query chosen from the keyword map; no other URL targets it.
- [ ] Title/H1/intro written; price pulled live.
- [ ] Server-rendered grid/links; canonical correct; JSON-LD valid.
- [ ] Internal links in (parent, siblings, ≥ 2 blog/guide links where relevant).
- [ ] Facet URLs blocked unless deliberate sub-category.
- [ ] Added to sitemap; URL inspected.

---

**Sources** (type in brackets):
- [Practitioner blog] Ahrefs, 11 ways to improve e-commerce category pages: https://ahrefs.com/blog/seo-ecommerce-category-pages
- [Practitioner/agency] Go Fish Digital, category page SEO (Jun 2026): https://gofishdigital.com/blog/ecommerce-category-page-seo/
- [Practitioner/agency] Darkroom, category page rankings 2026 (agency opinion): https://www.darkroomagency.com/observatory/ecommerce-seo-category-page-rankings-2026
- [Industry blog] Search Engine Journal, faceted navigation without hurting crawl efficiency (May 2025): https://www.searchenginejournal.com/ask-an-seo-how-to-implement-faceted-navigation-without-hurting-crawl-efficiency/545735
- [Official] Google, Managing crawling of faceted navigation: https://developers.google.cn/crawling/docs/faceted-navigation?hl=en
- [Official] Google, Pagination and incremental loading: https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading?authuser=8
- [Official] Google, Merchant listing structured data: https://developers.google.com/search/docs/appearance/structured-data/merchant-listing
- [Official] Google, JavaScript SEO basics: https://developers.google.com/webmasters/ajax-crawling
- [Internal] EXTAS blueprint C4.2 (PDP content architecture), lessons/ALL.md (combo rule)

*As of October 2026.*
