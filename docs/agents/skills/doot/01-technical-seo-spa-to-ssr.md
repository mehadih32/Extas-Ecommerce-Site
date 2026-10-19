# D01 · Technical SEO — moving EXTAS from a hash-routed SPA to server-rendered Next.js pages

*Doot দূত · A360-06 · module 1 of 9 · level: Post-graduate · version 1.0 · as of October 2026*
*Shared with Prohori (server, performance) and Sawdagor (storefront code). Doot owns the SEO acceptance criteria; it does not write checkout code.*

Confidence tags: **[OFFICIAL]** Google Search Central / web.dev · **[2-SRC]** two independent good sources ·
**[HOUSE]** EXTAS rule · **[COMMUNITY — test before use]**.

---

## 1. Why the move matters (the demo today)

The blueprint demo uses fragment routes (`#/admin/analytics`, product views inside `#/…`). Google: *"Don't use URL
fragments (#) to load different content"* — Googlebot can't reliably resolve them; every `#/…` view is the **same URL**
to Google **[OFFICIAL]**. So today, at most the home page is indexable. The live site (Next.js + Prisma per the
blueprint) must give every product, combo, category, blog post and policy page its **own real URL with full HTML on
first response**.

## 2. Rendering decision per page type [OFFICIAL basis + HOUSE choice]

Google processes JS in three phases (crawl → render queue → index) and still recommends server-side or pre-rendering
"because not all bots can run JavaScript" **[OFFICIAL]**. AI crawlers and social preview bots generally don't run JS
either **[COMMUNITY]**.

| Page | Render | Why |
|---|---|---|
| Product (PDP), combo page | **SSG + ISR** (revalidate on price/stock change via webhook) or SSR | content + Product JSON-LD in initial HTML (Google: put Product markup in initial HTML; JS-generated markup makes Shopping crawls less frequent/reliable) **[OFFICIAL]** |
| Category / collection | SSR or ISR (short revalidate) | stock changes daily; first page of products must be in HTML |
| Blog, guides, policy pages | SSG | rarely change |
| Home | ISR | banners change |
| Cart, checkout, account, admin | client-side, **noindex**, disallow in robots.txt | no search value; private |
| Search results page (`/search?q=`) | noindex | thin/duplicate |

## 3. URL design (decide once; changing later costs rankings)

```
/                                   home
/men/polo-shirts                    category          (English slugs, lowercase, hyphens)
/men/polo-shirts/pique-polo-navy    product  (colour in slug only if each colour is its own page — see D04 §3)
/combos/polo-jogger-summer-set      combo page
/blog/how-to-choose-polo-size       article
/bn/...                             Bengali version (only if real Bengali content exists — D02 §6)
```
Rules **[OFFICIAL + HOUSE]**: one canonical URL per piece of content; History API routing (no `#`); `&` as the parameter separator for any crawlable filter; consistent filter order; return **404** for empty filter combinations and non-existent pagination pages; no session IDs in URLs.

## 4. Status codes and soft 404s [OFFICIAL]

- Real 404/410 for removed products **only when no close replacement exists**; otherwise 301 to the closest category or successor product.
- Out-of-stock-for-now products stay **200** with `availability: OutOfStock` and alternatives on the page (don't 404 a seasonal product that returns every winter).
- In client-rendered states that cannot return a status, Google's options: redirect to a URL that returns 404, or add `noindex` with JS. Better: server-render, return the real status.
- Never put `noindex` in the initial HTML of a page you want indexed — Google may skip rendering when it sees noindex.

## 5. Canonicals, robots, meta

- `rel="canonical"` in server HTML; never change it with JavaScript to a different value; exactly one per page **[OFFICIAL]**.
- Unique `<title>` and meta description per page from the admin SEO panel (blueprint: separate SEO panel per product) **[OFFICIAL + HOUSE]**.
- `robots.txt`: disallow `/cart`, `/checkout`, `/account`, `/admin`, `/api`, sort/filter parameters without demand (D04 §4); `Sitemap:` line; AI-crawler switch (blueprint C4.3) — default **allow**, owner can flip.
- Open Graph / Twitter tags server-rendered (Facebook/WhatsApp link previews read raw HTML).

## 6. Migration checklist (demo → live)

Fragment URLs were never separate pages in Google's eyes, so there is little ranking equity to lose — but users have shared links.
1. Inventory every shareable demo route (`#/product/…`, `#/combo/…`).
2. Add a tiny client script on `/` that reads `location.hash` and replaces it with the new real URL (server redirects can't see fragments — the fragment never reaches the server) **[OFFICIAL basis: fragments not sent/used]**.
3. If any older *real* URLs existed (another domain, old shop), 301 each to its new equivalent; keep redirects ≥ 1 year **[COMMUNITY — standard practice]**.
4. Generate XML sitemaps from the database (D02 §3) before launch; submit in Search Console on launch day.
5. Launch-day crawl with a crawler (Screaming Frog free ≤ 500 URLs, or similar) → zero 5xx, zero internal links to 404/redirects, canonical = self on indexable pages.
6. URL Inspection on 10 sample URLs (home, 3 categories, 4 PDPs, 1 combo, 1 article): "Page is indexable", rendered HTML contains price, title, JSON-LD.
7. Watch Search Console "Pages" report daily for 4 weeks.

## 7. Performance (Core Web Vitals) [2-SRC: web.dev via secondary + Google page experience doc]

| Metric | Good | Poor | Judged at |
|---|---|---|---|
| LCP | ≤ 2.5 s | > 4.0 s | 75th percentile of real users, mobile and desktop separately |
| INP (replaced FID on 12 March 2024) | ≤ 200 ms | > 500 ms | " |
| CLS | ≤ 0.1 | > 0.25 | " |

Google: Search "always seeks to show the most relevant content, even if the page experience is sub-par" — speed is a tie-breaker and a **conversion** issue more than a ranking lever. For a phone-first BD audience on mid-range Android and mobile data, speed is a sales issue first.
EXTAS rules **[HOUSE]**: hero/product image as the LCP element, served from CDN in AVIF/WebP with explicit width/height (CLS), `fetchpriority="high"` on the first image only, no blocking third-party scripts before LCP (pixels load after), fingerprinted static files (Google's renderer may ignore cache headers **[OFFICIAL]**). Lighthouse CI budget is already in the blueprint (Prohori).
Competitor reference: the Fabrilife teardown measured LCP 11–14 s at 390×844 — a real chance to win on speed.

## 8. Acceptance test for any new page template (Doot signs off)

- [ ] `curl` the URL (no JS): title, H1, main text, price, canonical, JSON-LD present.
- [ ] URL Inspection → rendered HTML matches; no blocked resources.
- [ ] Rich Results Test passes for Product/Merchant listing (PDP) or Breadcrumb (category).
- [ ] Status codes correct (200 / 301 / 404) on 5 edge cases.
- [ ] Internal links are `<a href>`; no `#` routes.
- [ ] LCP ≤ 2.5 s on a throttled mid-range mobile profile (lab) — field data after 28 days.

---

**Sources** (type in brackets):
- [Official] Google Search Central, JavaScript SEO basics: https://developers.google.com/webmasters/ajax-crawling
- [Official] Google Search Central, Merchant listing structured data (JS-generated markup note): https://developers.google.com/search/docs/appearance/structured-data/merchant-listing
- [Official] Google Search Central, Managing crawling of faceted navigation: https://developers.google.cn/crawling/docs/faceted-navigation?hl=en
- [Official] Google Search Central, Pagination and incremental loading: https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading?authuser=8
- [Practitioner blog] SEOJuice, Core Web Vitals 2026 (citing web.dev): https://seojuice.com/blog/core-web-vitals-2026-audit-changes/
- [Practitioner blog / dev] DEV Community, SPA → Next.js SEO playbook (Dec 2025): https://dev.to/bishoy_semsem/our-seo-journey-from-spa-to-nextjs-the-complete-playbook-3mna
- [Vendor] Screaming Frog SEO Spider pricing (free version crawls up to 500 URLs): https://www.screamingfrog.co.uk/seo-spider/pricing/
- [Internal] EXTAS blueprint C4.2–C4.3 and teardown-fabrilife.md (measured competitor LCP)

**Not verified directly:** web.dev pages themselves (thresholds taken from a secondary page that cites them).

*As of October 2026.*
