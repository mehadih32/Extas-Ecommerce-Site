# D02 · Google Search Central essentials — indexing, sitemaps, Search Console, structured data for products and offers, merchant listings, hreflang

*Doot দূত · A360-06 · module 2 of 9 · level: Graduate → Post-graduate · version 1.0 · as of October 2026*

---

## 1. How a URL gets into Google (and what we control)

Discover (links, sitemaps) → crawl → render → index → rank. We control: discoverability (internal `<a href>` links, sitemaps), crawlability (robots.txt, status codes, speed), indexability (canonical, noindex, quality, duplication), and the content itself.

**Search Console statuses that matter** (Pages report):
| Status | Meaning | Action |
|---|---|---|
| Discovered – currently not indexed | Google knows the URL but postponed crawling (Google's explanation: crawling was rescheduled to avoid overloading the site) | improve internal links to it, server speed, remove low-value URLs competing for crawl; wait |
| Crawled – currently not indexed | crawled, judged not worth indexing yet | improve uniqueness/usefulness; merge thin pages; add internal links |
| Duplicate, Google chose different canonical | our canonical was ignored | make duplicates really different or consolidate |
| Excluded by noindex / blocked by robots.txt | intended? | verify it's intended |
| Soft 404 | page looks empty/error | return real 404 or add real content |

## 2. Requesting indexing (honest expectations)

- URL Inspection → "Request indexing" has an **unpublished daily quota**; Google says indexing usually happens within about a day but can take one to two weeks, and nothing is guaranteed (PPC Land summary of Google help, Apr 2026) **[COMMUNITY-reported summary of official help]**.
- For many URLs use the **sitemap with accurate lastmod**, not mass manual requests.
- New pages linked from the home page / main category + in the sitemap are usually discovered within days **[COMMUNITY]**. That is why "indexed within 3 days" is a realistic drill (PRACTICE-TASKS P1), while "ranking in 3 days" for a competitive term is not.

## 3. Sitemaps [OFFICIAL]

- ≤ 50,000 URLs or 50 MB uncompressed per file; use a sitemap index for more; UTF-8; **absolute** canonical URLs only.
- `<lastmod>` is used only if consistently accurate — change it only for significant changes (main content, structured data, links), never on every build. `<priority>` and `<changefreq>` are ignored.
- Submit via Search Console Sitemaps report (shows errors and last read), the Search Console API, or a `Sitemap:` line in robots.txt. Submission is a hint, not a guarantee.
- EXTAS split: `sitemap-products.xml`, `sitemap-combos.xml`, `sitemap-categories.xml`, `sitemap-blog.xml`, `sitemap-pages.xml`; images can be listed with the image extension **[COMMUNITY — standard practice]**. Generated from the DB; only 200, indexable, canonical URLs.

## 4. Structured data for products — merchant listings vs product snippets [OFFICIAL]

- **Merchant listings** = pages where the customer can buy from us → richer results (price, availability, shipping, returns, apparel sizing). **Product snippets** = review/editorial pages. A page meeting merchant-listing requirements is generally eligible for product snippets too.
- Using **both** on-page structured data **and** a Merchant Center feed maximises eligibility (Google). (Merchant Center availability for Bangladesh is unclear — see Tirondaj T03 §0; on-page markup works regardless.)
- **Eligibility:** only pages where the shopper can buy; a page about **one product (or its variants)** — category/listing pages are **not** eligible for Product markup.

### Merchant listing — required
`Product.name` · `Product.image` (crawlable; multiple high-res in 16×9, 4×3, 1×1 recommended) · `Product.offers` as **`Offer`** (not AggregateOffer) with `price` > 0 and `priceCurrency` = `BDT`.

### Recommended (EXTAS fills all that apply)
`brand.name` = EXTAS · `description` · `sku` · `color` · `size` · `material` · `pattern` · `audience` (PeopleAudience: male, adult) · `category` · `inProductGroupWithID` / `isVariantOf` (variants) · `aggregateRating` + `review` (**only real, verified-buyer reviews** — blueprint rule: schema only from real reviews) · `offers.availability` (InStock/OutOfStock) · `offers.itemCondition` = NewCondition · `offers.url` · `priceValidUntil`/`validFrom`/`validThrough` for sales · `shippingDetails` and `hasMerchantReturnPolicy` (best at **Organization** level, offer-level only to override).

### Sale prices [OFFICIAL]
Active price has **no** `priceType`; the old price is a second price specification with `priceType: StrikethroughPrice`. The strikethrough must be a real former price (Smart Rules / Sawdagor own pricing — Doot never invents a "was" price).

### Variants
Google added ProductGroup variant support (Search Central blog, Feb 2024): a `ProductGroup` with `variesBy` (size, color), `hasVariant` children, shared `productGroupID`. Use one PDP per style with size/colour selectors → one ProductGroup; if each colour has its own URL, each colour page carries its Product with `inProductGroupWithID`.

### Return policy [OFFICIAL]
Organization-level `hasMerchantReturnPolicy` on one page (the policy page or home), with `applicableCountry: BD`, `returnPolicyCategory` (EXTAS's rule is **exchange only, no return after receipt** — confirm the right category with the owner: `MerchantReturnNotPermitted` for returns plus exchange text, or a finite window if exchanges are modelled as returns), `merchantReturnDays`, `returnFees`. Search Console / Merchant Center account settings override markup.

### Example skeleton (values from the DB, never typed)
```json
{"@context":"https://schema.org","@type":"ProductGroup","name":"EXTAS Pique Polo Shirt",
 "productGroupID":"PQ-POLO","variesBy":["https://schema.org/size","https://schema.org/color"],
 "brand":{"@type":"Brand","name":"EXTAS"},"audience":{"@type":"PeopleAudience","suggestedGender":"male"},
 "hasVariant":[{"@type":"Product","sku":"PQ-POLO-NAVY-L","name":"EXTAS Pique Polo Shirt – Navy – L",
   "color":"Navy","size":"L","image":["https://…/pq-navy-1x1.jpg","https://…/pq-navy-4x3.jpg"],
   "offers":{"@type":"Offer","price":"750","priceCurrency":"BDT","availability":"https://schema.org/InStock",
     "itemCondition":"https://schema.org/NewCondition","url":"https://…/men/polo-shirts/pique-polo?color=navy&size=l"}}]}
```
(Variant URLs with parameters must resolve to the same canonical PDP or be their own indexable pages — decide in D04 §3.)

### FAQ markup — do not expect rich results
Since August 2023 Google shows FAQ rich results only for "well-known, authoritative government and health websites"; HowTo rich results were cut back too. Keeping FAQPage markup "does not cause problems" but gives EXTAS no visible snippet **[OFFICIAL via Search Engine Roundtable report of the Google post]**. → Keep the FAQ *content* (helps users and AI answers); don't sell FAQ schema as a ranking win. (Blueprint C4.2 says the FAQ block "is what Google shows" — correct this expectation.)

### Category pages
BreadcrumbList; optionally CollectionPage/ItemList; **no** Product or review markup on category pages **[2-SRC: Ahrefs + Go Fish Digital, consistent with Google's eligibility rule]**.

## 5. Organization and site name (brand SERP) [OFFICIAL]
- `Organization` (most specific subtype: `OnlineStore`) on home or About: `name`, `url`, `logo` (≥ 112×112, works on white), `sameAs` (Facebook page, Instagram, YouTube, TikTok), `contactPoint`, `telephone` with +880, `hasMerchantReturnPolicy`, `address` if a physical address is public.
- `WebSite` structured data on the home page with `name` "EXTAS" and `alternateName` (e.g. "extas.com.bd" lowercase domain as backup) to control the **site name** shown in results. Use the same name everywhere.

## 6. Bengali + English versions (hreflang) [OFFICIAL]
Only if the Bengali version has its own URL and real translated content (the site has an EN/বাং toggle):
- Separate URLs (`/` English, `/bn/` Bengali); each page lists **itself and all alternates**, bidirectionally; codes `en` / `bn` (optionally `en-BD`, `bn-BD`); `x-default` for the language picker/home.
- Methods: `<link rel="alternate" hreflang>` in head, HTTP headers, or sitemap — pick one.
- A toggle that swaps language **without changing the URL** = Google sees one language only. Decide before launch (open question for the owner → BLOCKED.md, recommended default: English canonical pages now, `/bn/` for category + top PDPs + blog later).

## 7. Validation routine
Rich Results Test (merchant listing, breadcrumb) · Schema Markup Validator (site name, Organization) · Search Console enhancement reports: **Merchant listings**, **Product snippets** (separate reports since Sept 2022) · URL Inspection rendered HTML.

---

**Sources** (type in brackets):
- [Official] Google, Merchant listing (Product, Offer) structured data: https://developers.google.com/search/docs/appearance/structured-data/merchant-listing
- [Official] Google, Intro to Product structured data: https://developers.google.com/search/docs/advanced/structured-data/product
- [Official] Google Search Central blog, Merchant listings report (Sept 2022): https://developers.google.com/search/blog/2022/09/merchant-listings
- [Official] Google Search Central blog, Product variants (Feb 2024): https://developers.google.com/search/blog/2024/02/product-variants?hl=en  *(body not readable by our tool; date and title confirmed)*
- [Official] Google, Merchant return policy structured data: https://developers.google.com/search/docs/appearance/structured-data/return-policy
- [Official] Google, Organization structured data: https://developers.google.com/search/docs/data-types/logo
- [Official] Google, Site names: https://developers.google.com/structured-data/site-name
- [Official] Google, Build and submit a sitemap: https://developers.google.com/search/docs/guides/create-URLs
- [Official] Google, Localized versions (hreflang): https://developers.google.com/search/docs/advanced/crawling/localized-versions
- [Industry news] Search Engine Roundtable, FAQ/HowTo rich results reduced (Aug 2023): https://www.seroundtable.com/google-faq-howto-rich-results-less-35845.html
- [Official, title only] Google Search Central blog, HowTo and FAQ changes: https://developers.google.com/search/blog/2023/08/howto-faq-changes
- [Industry news] PPC Land, URL Inspection tool: https://ppc.land/url-inspection-tool/
- [Community] Shopify Community, "Discovered – currently not indexed": https://community.shopify.com/t/google-discovered-currently-not-indexed/77000
- [Practitioner blog] Ahrefs, e-commerce category pages: https://ahrefs.com/blog/seo-ecommerce-category-pages
- [Practitioner blog] Go Fish Digital, category page SEO (Jun 2026): https://gofishdigital.com/blog/ecommerce-category-page-seo/

**Not verified:** ProductGroup property details from Google's variants page (read from memory of schema.org names
`variesBy`/`hasVariant`/`productGroupID` — validate with the Rich Results Test before shipping).

*As of October 2026.*
