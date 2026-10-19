# EXTAS — Google traffic plan (English `/` + Bengali `/bn/`)

> **Update 19 Oct 12:07 (owner decision):** brand names stay. Every product has a real brand field used on the page, in structured data and the feed; whether slugs include the brand is the owner's choice through the `{brand}` token in the link template (PR 590). Where this plan says "no brand names other than EXTAS", read it as superseded.

*Doot দূত · A360-06 · 19 Oct 2026 · answers the owner's decision of 19 Oct, 11:39: "Bengali pages get their own URLs — how will Google traffic come?"*
*Confidence tags: **[OFFICIAL]** Google Search Central / Google help page read today · **[2-SRC]** two independent good sources · **[HOUSE]** EXTAS rule / Doot's recommendation · **[COMMUNITY]** practitioner practice, test before use · **[EST]** Doot's estimate, not measured.*
*Keyword evidence codes: **AC** = Google autocomplete, pulled 19 Oct 2026 · **TR** = Google Trends, Bangladesh, last 12 months, relative 0–100 · **COMP** = competitor page read 19 Oct 2026. No search volumes appear anywhere in this file, because none were verifiable with free tools.*

---

## মালিকের জন্য সংক্ষেপে (সহজ বাংলায়)

1. ইংরেজি পেজ থাকবে `/` তে, বাংলা পেজ `/bn/` তে। প্রতিটা পেজের একটা জোড়া থাকবে, আর hreflang দিয়ে গুগলকে জানানো হবে কোনটা কোন ভাষার।
2. **বড় খবর:** extas.com.bd তে এখন একটা WordPress দোকান চালু আছে (৪৯টা লিংক)। ওটা আপনার হলে নতুন সাইটে প্রতিটা পুরনো লিংক নতুন পেজে ঘুরিয়ে দিতে হবে (301)। না দিলে গুগলে এতদিন যা জমেছে, তা হারাবে।
3. গুগল থেকে সবার আগে লোক আসবে ব্র্যান্ড নামে খোঁজা থেকে ("extas bd")। তারপর আসবে লম্বা খোঁজা থেকে, যেমন "polo shirt price in bd" বা "পোলো শার্ট এর দাম"। এমন ছোট খোঁজায় ২–৬ সপ্তাহ লাগে। "polo shirt"-এর মতো বড় খোঁজায় ৩–৬ মাস বা তার বেশি লাগবে।
4. **সত্যি কথা:** বাংলাদেশে বেশিরভাগ মানুষ ইংরেজি হরফে খোঁজে। "t shirt" খোঁজা বাংলা "টি শার্ট"-এর চেয়ে অনেক বেশি। পাঞ্জাবিতে বাংলা খোঁজা ভালো, ইংরেজির প্রায় অর্ধেক। তাই বাংলা পেজ বাড়তি লোক আনবে, কিন্তু মূল ট্রাফিক আসবে ইংরেজি পেজ থেকে।
5. **ভালো খবর:** দেশের ১১টা বড় ফ্যাশন সাইটের পেজ দেখেছি, কারো আলাদা বাংলা পেজ পাইনি। বাংলায় খোঁজার জায়গাটা প্রায় ফাঁকা।
6. **ঝুঁকি ১:** "extas" লিখলে গুগল "ecstasis" আর নেশার জিনিসের বানান সাজেস্ট করছে। Ecstasy নামে ১৯৯৭ সালের একটা দেশি ব্র্যান্ডও আছে। তাই সব জায়গায় "EXTAS" একই বানানে লিখতে হবে, সাথে "extas.com.bd"।
7. **ঝুঁকি ২:** এখনকার সাইটে Ralph Lauren, Prada, Boss, Diesel নাম দিয়ে পণ্য বিক্রি হচ্ছে। গুগল শপিংয়ে এটা নকল পণ্যের নিয়মে পড়ে, আর আগে কোনো সতর্কবার্তা ছাড়াই অ্যাকাউন্ট বন্ধ হতে পারে। নিজের নাম দেওয়াই নিরাপদ, তবে সিদ্ধান্ত আপনার।
8. গুগল শপিংয়ের ফ্রি লিস্টিং বাংলাদেশে চলে কিনা এখনো নিশ্চিত না। লঞ্চের পর Merchant Center-এ টেস্ট করে দেখব।
9. FAQ দিলেও গুগল এখন আর আলাদা FAQ বক্স দেখায় না (৭ মে ২০২৬ থেকে সবার জন্য বন্ধ)। FAQ লেখা থাকবে, কারণ কাস্টমারের কাজে লাগে।
10. মার্চে ঈদের আগে পাঞ্জাবি খোঁজা ৬–৭ গুণ বেড়ে যায়। ২০২৭ সালের ঈদের জন্য পাঞ্জাবির পেজ জানুয়ারির মাঝামাঝির মধ্যে গুগলে উঠে থাকতে হবে।
11. আপনার কাছ থেকে যা লাগবে: ডোমেইন আর DNS অ্যাক্সেস, একটা গুগল অ্যাকাউন্ট, কোন পেজ আগে বাংলায় হবে সেই সিদ্ধান্ত, আর ব্র্যান্ড-নামের পণ্য নিয়ে সিদ্ধান্ত। পুরো তালিকা ৬ নম্বর অংশে আছে।

---

## 0. Two findings that change the plan (found during this task)

| # | Finding | Evidence | Consequence |
|---|---|---|---|
| F1 | **extas.com.bd is already live.** A WordPress/WooCommerce shop titled "EXTAS", with canonical tags and a `wp-sitemap.xml` listing 49 URLs: 24 products, 8 product categories, 3 tags, 7 pages, 4 CartFlows steps, 1 author. | Fetched 19 Oct 2026 (`/robots.txt` → `Sitemap: https://extas.com.bd/wp-sitemap.xml`) | The site is **not new to Google**, so this is a **migration**: every old URL needs a 301 to its new twin (§1.6). If the shop is not the owner's, it is a brand conflict. **Owner must confirm.** Side note for Prohori: `wp-sitemap-users-1.xml` publishes an author slug (username enumeration). |
| F2 | **Third-party brand names in product names.** Live product slugs include `ralph-lauren-polo-…`, `prada-polo-…`, `boss-tshirt`, `diesel-t-shirt-combo`. The register's PR 571 example and the demo data use "Ralph Lauren Polo" too. | Live sitemap; MASTER-REGISTER PR 571; ROUND15 note | Google Merchant Center's **Counterfeit products** policy covers products bearing a trademark "identical to or substantially indistinguishable from the trademark of another". Violations are "egregious" and can mean **suspension without prior warning** [OFFICIAL]. Structured data `brand` must always be **EXTAS**. Targeting "ralph lauren polo shirt"-type queries is excluded from this plan. Naming is the owner's decision (§6); a lawyer should advise on trademarks. |

---

## 1. URL and language structure

### 1.1 Language layout

| Rule | Tag |
|---|---|
| English at the root (`https://extas.com.bd/…`), Bengali in the subdirectory `/bn` (`https://extas.com.bd/bn/…`). Same host, same server. | [OFFICIAL] subdirectories are a supported structure ("Easy to set up · Low maintenance (same host)"); URL parameters for language are "Not recommended" |
| Each language version has **its own URL**. Never switch language by cookie or browser setting on the same URL. | [OFFICIAL] "recommends using different URLs for each language version of a page" |
| **No automatic redirect** by browser language or IP. The language switch is a plain `<a href>` to the twin URL. A soft suggestion bar ("বাংলায় দেখুন") is allowed, but never a redirect. | [OFFICIAL] "Avoid automatically redirecting" + "Consider adding hyperlinks to other language versions" |
| One language per page, for both content and navigation. A `/bn` page has Bengali nav, labels, H1, intro, description, size and fabric text. Product names may keep Latin words where that is the real name ("EXTAS Piqué Polo"). No side-by-side translations. | [OFFICIAL] "use a single language for content and navigation"; translating only boilerplate "can create a bad user experience" |
| **Translation gate:** a `/bn` URL is published, linked and given hreflang only when its main content is really Bengali (written in natural চলতি Bengali, not raw machine output). Until then, the English page has no Bengali alternate. | [HOUSE] on the [OFFICIAL] basis above |
| `<html lang="en">` / `<html lang="bn">` is kept for browsers and screen readers. Google does **not** use it to detect language; it reads the visible text. | [OFFICIAL] "We don't use any code-level language information such as lang attributes" |
| **Root vs `/en`:** the earlier record (V1 §S11 answer 6; PENDING_CHANGES l.171) had `/en` + `/bn`. This plan recommends English at the root, without `/en`. Reasons: the live WordPress URLs are at the root (fewer redirect hops), URLs are shorter, and there is no extra 301 from `/` to `/en`. **Owner confirms** (§6). | [HOUSE] |

### 1.2 hreflang pairs and x-default

```html
<!-- served in the <head> of https://extas.com.bd/p/pique-polo -->
<html lang="en">
<link rel="canonical" href="https://extas.com.bd/p/pique-polo">
<link rel="alternate" hreflang="en" href="https://extas.com.bd/p/pique-polo">
<link rel="alternate" hreflang="bn" href="https://extas.com.bd/bn/p/pique-polo">
<link rel="alternate" hreflang="x-default" href="https://extas.com.bd/p/pique-polo">

<!-- served in the <head> of https://extas.com.bd/bn/p/pique-polo -->
<html lang="bn">
<link rel="canonical" href="https://extas.com.bd/bn/p/pique-polo">
<link rel="alternate" hreflang="en" href="https://extas.com.bd/p/pique-polo">
<link rel="alternate" hreflang="bn" href="https://extas.com.bd/bn/p/pique-polo">
<link rel="alternate" hreflang="x-default" href="https://extas.com.bd/p/pique-polo">
```

| Rule | Tag |
|---|---|
| Each version lists **itself and every other version**. If two pages don't point to each other, Google ignores the tags. | [OFFICIAL] |
| Codes: `en` and `bn` (ISO 639-1). A region code is optional and can't stand alone. EXTAS serves one country, so `-BD` adds no targeting and adds a chance of error. Recommended: plain `en` / `bn`. (`en-BD` / `bn-BD` would also be valid; whichever is chosen, use it everywhere.) | [OFFICIAL] codes · [HOUSE] choice |
| `x-default` → the **English twin** of the same page. Google says x-default was "designed for language selector pages", but pointing it at the default-language page is common practice. | [OFFICIAL] definition · [COMMUNITY] usage |
| Use **one method only**: HTML `<link>` tags in the server-rendered `<head>`. Google treats HTML tags, HTTP headers and sitemaps as equivalent, and using all three "gives no search benefit and makes the setup harder". HTML is chosen because `curl` can test it on every page (D01 §8). | [OFFICIAL] equivalence · [HOUSE] choice |
| Absolute `https://` URLs only. | [OFFICIAL] |
| hreflang is emitted only when **both** twins return 200, are indexable, and pass the translation gate. A `noindex` or redirected twin is never listed. | [HOUSE] |

### 1.3 Canonical rules

| Rule | Tag |
|---|---|
| Every indexable page is **self-canonical in its own language**. A `/bn` page is never canonicalised to the English page, because Google says to specify a canonical "in the same language". | [OFFICIAL] |
| `rel="canonical"` sits in the server HTML `<head>`, absolute, exactly one, and is never changed by JavaScript. | [OFFICIAL] head-only; absolute preferred; "make sure that JavaScript doesn't change the canonical" |
| One canonical across all methods: the sitemap URL equals the canonical tag equals the internal-link URL equals the hreflang URL. | [OFFICIAL] "Don't specify different URLs as canonical … using different canonicalization techniques" |
| Parameters canonicalise to the clean URL: `?color=`, `?size=`, `utm_*`, `fbclid`, `gclid`, `?sort=`. Size and sort are also blocked from crawling (D04 §4). | [HOUSE] on [OFFICIAL] facet doc (D04) |
| Pagination (`?page=2`) is self-canonical, never canonical to page 1. | [OFFICIAL] (D04 §5) |
| Never use robots.txt to canonicalise. | [OFFICIAL] |
| Lowercase only. The trailing-slash form 301s to the slash-free form (`/bn/` → `/bn`, `/polo-shirts/` → `/polo-shirts`). The owner wrote "/bn/"; both forms resolve to the same page. | [OFFICIAL] Google's URL handling is case-sensitive; "convert all text to the same case" · [HOUSE] slash choice |

### 1.4 URL map: demo route → live URL

`{bn}` means the same path exists under `/bn` once translated. Slugs are ASCII (see §1.5).

| Demo (hash, invisible to Google [OFFICIAL]) | Live English | Live Bengali | Index? | Notes |
|---|---|---|---|---|
| `#/` | `/` | `/bn` | yes | Organization + WebSite markup here |
| `#/c/<id>` | `/<category>` e.g. `/polo-shirts`, `/t-shirts`, `/hoodies`, `/joggers`, `/panjabi` | `/bn/polo-shirts` | yes | Category URLs carry **no** product path. Reserved first segments (never a category slug): `bn p combo combos set l journal help collections search bag checkout account login order thanks t exchange admin api new-in about contact privacy terms` |
| sub-category / indexable facet (PR 227) | `/polo-shirts/pique`, `/polo-shirts/black` | `/bn/polo-shirts/black` | only where demand is proven (D04 §4) | Colour/fit landings only; size, price and sort are never indexable |
| `#/c/new` | `/new-in` | `/bn/new-in` | yes | |
| `#/p/<id>` | `/p/<style-slug>` e.g. `/p/pique-polo` | `/bn/p/pique-polo` | yes | Product URLs **don't include the category**, so moving a product between categories never changes its URL (PR 527). One URL per style; colour/size are selectors (`?color=` canonicalises to the style URL). D04 §3 option A. |
| `#/combos` | `/combos` | `/bn/combos` | yes | Combo hub (PR 572 L3): the main ranking page for "combo" queries |
| `#/combos/<rule>` | `/combos/<rule-slug>` e.g. `/combos/polo-2-piece` | `/bn/combos/polo-2-piece` | yes | Combo category (PR 572 L1/L5) |
| `#/combo-pair/<id>` | **`/combo/<style>-<colourA>-<colourB>[-<colourC>]-<n>-piece`** e.g. `/combo/pique-polo-black-navy-2-piece` | `/bn/combo/…` (same slug) | **featured pairs only** (see below) | Colours in a **fixed order** (colour-dictionary order, PR 30), so black+navy and navy+black are one URL; the other order 301s. |
| `#/combo/<id>` (fixed combos) | `/combo/<slug>` e.g. `/combo/office-trio` | `/bn/combo/office-trio` | yes | |
| `#/set` (builder) · `#/set/<id>` (preset) | `/set` · `/set/<slug>` | `/bn/set…` | builder: noindex,follow · preset: yes if it has its own photo and text | |
| `#/l/<id>` (ad landing, PR 254) | `/l/<slug>` | `/bn/l/<slug>` | **noindex,follow** by default | Ad pages duplicate combos/categories; a switch per page allows indexing |
| seasonal pages (PR 246/530) | `/collections/<slug>` e.g. `/collections/eid-panjabi` | `/bn/collections/eid-panjabi` | yes, all year | Same URL every year; archived ≠ deleted (PR 530) |
| `#/journal` · `#/journal/<slug>` | `/journal` · `/journal/<slug>` | `/bn/journal` · `/bn/journal/<slug>` | yes | "Journal" matches the storefront label (the register says "blog"; same thing). A Bengali-first article with no English twin has **no** hreflang. |
| `#/page/delivery`, `exchange`, `faq` (+ returns, payment, size guide) | `/help/<slug>` e.g. `/help/delivery`, `/help/exchange`, `/help/size-guide`, `/help/faq` | `/bn/help/…` | yes | PR 247/248 help articles, answer line drawn from Smart Rules |
| `#/page/story`, `contact`, `privacy`, `terms` | `/about`, `/contact`, `/privacy`, `/terms` | `/bn/about` … | yes (privacy/terms may be noindex; owner's choice) | |
| `#/search?q=` | `/search?q=` | `/bn/search?q=` | **noindex,follow** (not robots-blocked, so the noindex is seen) | |
| `#/bag`, `#/checkout`, `#/account/*`, `#/login`, `#/order/*`, `#/thanks/*`, `#/exchange/*`, `#/admin/*`, tracking `/t/<no>` | same paths | — | **robots.txt disallow**, login-protected, not in sitemaps | D01 §2 |

**Combo-pair indexing policy (PR 571 auto-pairs) [HOUSE, COMMUNITY basis].** One style in 6 colours makes 15 two-piece pairs and 20 three-piece triples. That is dozens of near-identical pages that differ only by colour. No autocomplete or Trends evidence shows pair-level searches (e.g. "black navy polo combo") **[AC: none seen]**. Google clusters near-duplicates and may leave them "Crawled – currently not indexed" (D02 §1). So:
- **Ranking pages:** `/combos` and `/combos/<rule>`.
- **Pair pages:** indexable only when switched to **featured**: the pair has its own set photo (PR 575) and its own line of text. All other pairs are `noindex,follow`, still fully linked for shoppers and ads.
- **A paused pair** (a colour sold out) keeps its URL at **200** with an honest "this pair is paused" message and other live pairs (PR 527, never 404).
- **Internal links** from combo pages to single pieces stay inside the combo flow (lessons/ALL.md: never take a customer from a combo to a single product page). PDPs link *to* combos (PR 102).

### 1.5 Slug rules: Bengali script vs transliterated vs same-as-English

| Option | Example | For | Against |
|---|---|---|---|
| **A. Same ASCII slug as the English twin** (recommended) | `/bn/p/pique-polo`, `/bn/polo-shirts` | Pairing is automatic (`/bn` + same path), so hreflang can't drift. Links stay readable when shared on WhatsApp/Facebook. A product rename touches one slug, not two. Admin staff never type Bengali into a URL field. | Bengali words aren't in the URL |
| B. Bengali-script slug | `/bn/পোলো-শার্ট` | words in the audience's language | Must be percent-encoded [OFFICIAL]: shared links look like `/bn/%E0%A6%AA%E0%A7%8B…` (each Bengali character becomes 9 characters). Spelling variants (টি-শার্ট / টিশার্ট / টি শার্ট) and invisible joiner characters (ZWJ/ZWNJ) can create duplicate URLs. Harder in ads and SMS, and SMS is Unicode-length-limited (D09 §3). |
| C. Banglish slug | `/bn/chheleder-polo-shirt` | ASCII | No standard spelling (chheleder / cheleder), so every editor invents one. Mixes two registers. |

**Recommendation: A** [HOUSE]. Google allows audience-language words "and, if applicable, transliterated words" in URLs [OFFICIAL], so all three options are legal. The deciding factor is reliability. Bengali searchers' words go where they carry weight: the `<title>`, H1, intro, description, image alt text and FAQ answers. Google's own advice puts readable words in URLs as a usability point, not a promised ranking lever. Slug format: lowercase ASCII, hyphens (never underscores [OFFICIAL]), words not IDs [OFFICIAL], 3–6 words, no brand names other than EXTAS (F2), never changed once live (PR 527). A changed slug 301s, and the redirect manager (PR 235) logs it. A Bengali-first journal article gets a short English or transliterated ASCII slug chosen in the PR 528 brief.

### 1.6 Migration: hash routes and the live WordPress shop

1. **Hash links** shared from the demo (`#/p/x`, `#/combo-pair/…`): a tiny script on `/` reads `location.hash` and replaces it with the real URL. Servers never see fragments, so this can't be a server redirect [OFFICIAL basis: fragments not supported; D01 §6].
2. **WordPress URLs (if F1 is the owner's site):** before the switch, export the old site's Search Console data and backlinks. On go-live, 301 every old URL to its closest new twin:
   - `/product/<slug>/` → `/p/<new-slug>` or `/combo/<new-slug>`
   - `/product-category/polo-shirts/` → `/polo-shirts`
   - `/product-category/polo-shirts/ralph-lauren-polo/` and `/product-category/polo-shirts/prada-polo/` → `/polo-shirts` (brand sub-categories are not recreated, see F2)
   - `/product-category/t-shirt/combo/` → `/combos`
   - `/product-tag/*` → closest category
   - `/shop/` → `/`
   - `/author/*` → `/about`
   - `/step/*` and `/cart/`, `/checkout/`, `/my-account/` → their new equivalents
   
   Keep the redirects at least a year [COMMUNITY]. Same domain, so no Change of Address tool is needed.

### 1.7 What must be in the server-rendered HTML (first response, no JS) [OFFICIAL basis + HOUSE list]

Every indexable page, in both languages:
- `<html lang>`, a unique `<title>`, a meta description (PR 221; Bengali text on `/bn`)
- `rel="canonical"` (self, absolute) plus the hreflang set from §1.2
- `noindex` **only** on pages meant to stay out. Never put noindex in the initial HTML of a wanted page, because Google may skip rendering [OFFICIAL].
- Open Graph for WhatsApp/Facebook previews (they read raw HTML): `og:title`, `og:description`, `og:image`, `og:url`, `og:locale` (`en_US` / `bn_BD`) + `og:locale:alternate`
- One H1; visible breadcrumb; main text:
  - category: 30–100-word intro and **the first page of the product grid as `<a href>` links**
  - PDP: description, fabric and care, size chart, delivery/exchange lines from Smart Rules, reviews, Q&A, all in the HTML and not loaded on click (PR 225)
- Visible price and availability, matching the JSON-LD exactly
- JSON-LD per type (§3 step 5), with name and description in the page's language
- `<img src alt width height>` with `srcset` and a `src` fallback. Product photos are never CSS backgrounds: "Google doesn't index CSS images" [OFFICIAL].
- Crawlable links: nav, footer, related products, pagination `<a href>`, and the language switch to the twin [OFFICIAL] ("Google can discover links only when they are `<a>` HTML elements with an `href`")
- Correct status codes: 200 / 301 / 404 for truly unknown URLs (QA SE12). PR 527's "never 404" applies to pages that once existed, not to random typos.

### 1.8 Register PRs this touches (no edits made; for Gyani to file)

| PR | Current line (summary) | What this plan needs |
|---|---|---|
| **220** | "URL structure and canonical rules. **English only, live** — the `/bn` path is built and left switched off" | **Out of date** since the owner's answer of 19 Oct 11:39 (register l.86). Update: `/bn` live for pages that pass the translation gate; URL map §1.4; canonical rules §1.3 |
| **236** | Hreflang and the language alternates | §1.2: `en`/`bn`/x-default, HTML head only, pair only complete twins |
| **503** | Language framework — "**One language ships live**; the second is turned on later" | Reconcile: both languages live, Bengali **per page** behind the translation gate |
| 84 | Bengali and English throughout, with the language switch | Switch = `<a href>` to the twin; no auto-redirect; suggestion bar allowed |
| 78 / 72 | Label dictionary in both languages / search with Bengali keywords | Bengali labels feed the `/bn` HTML; on-site search logs feed the keyword map (§4) |
| 221 | Title/meta templates | Bengali templates; OG tags per language |
| **222** | Structured data: Product, Offer, BreadcrumbList, Organization | Add **WebSite** (site name) and **ProductGroup** variants; combo pages as Product + Offer at set price; `brand` always EXTAS |
| **224** | "FAQPage schema from the real questions on the page" | **Google stopped showing FAQ rich results for every site on 7 May 2026** [OFFICIAL + 2-SRC]. Reword: FAQ content stays for users and AI answers; markup optional (other engines); no Google rich result is expected |
| 225 / 226 / 227 | PDP accordions in HTML / category SEO block / filter-page indexing | Unchanged; apply to both languages |
| **228** | Sitemaps split by type | Split **by type × language**; add image entries (§3 step 3) |
| 229 | robots.txt + AI-crawler switch | Disallow list from §1.4 |
| 231 | Internal linking engine | Language-switch link; combo-flow rule; journal → category links |
| **232** | Alt text "English live, Bengali held in the dictionary" | Bengali alt text **live** on `/bn` pages |
| 233 / 234 / 237 / 238 | Search Console/Bing, CWV, SEO health, organic report | Health report gets a "Bengali twin ready?" column and a hreflang return-link check; organic report splits EN / BN / Banglish queries |
| **235** | Redirect manager + 404 report | Load the WordPress 301 map (§1.6) and colour-order 301s for combos |
| 527 | Permanent URL policy | Product URLs category-free; paused combo pairs stay 200 |
| 571–573 / 102 | Auto colour-pair combos and templates | Pair slug rule + featured/noindex policy (§1.4); remove third-party brand names from examples (F2) |
| 22 / 547 | Image naming / blog image sourcing | Descriptive filenames (translated where localised [OFFICIAL]); original photos first |
| 246 / 530 / 247 / 248 / 239–249 | Seasonal pages, help articles, journal | URL patterns `/collections/`, `/help/`, `/journal/` in both languages |
| 62 | Trust row "100% original" | Conflicts with brand-named stock (F2). Owner decision |

**Needs filing (not in the register; one-line specs):**

| # | Spec | Suggested home |
|---|---|---|
| N1 | **Hash-to-real-URL forwarder:** a client script on `/` that maps every demo `#/…` route to its live URL with `location.replace`, with a test table | new PR in S11 (or scope on 235) |
| N2 | **WordPress → new site migration:** export old Search Console data and backlinks, 301 all 49 sitemap URLs to their twins (§1.6), verify with a crawl on go-live day, keep redirects at least 12 months | new PR in S19 + scope on 235 |
| N3 | **Bengali translation gate:** per page, a "Bengali ready" flag (main content translated and approved). Only then does `/bn` publish, enter the sitemap and get hreflang. The SEO health report shows coverage. | new PR in S11 (or scope on 236 + 503) |
| N4 | **Combo-pair SEO policy:** fixed colour order in the slug, reverse order 301s, a featured switch (index) vs default `noindex,follow`, paused pairs stay 200 with alternatives | scope on 571 |
| N5 | **Merchant Center feed + BD test** (the owner's answer "Merchant Center test after go-live" has no PR): XML or Content API feed from the catalogue, English titles, `brand` EXTAS, `identifier_exists=no`, a test of Bangladesh as target country and BDT, result logged | new PR in S13 (shared with Tirondaj) |
| N6 | **Brand-name guard:** product health (PR 29) blocks third-party trademarks in product names, slugs, schema `brand` and the feed, unless the owner marks the product as authorised stock with proof | new PR in S01 (owner decision first, §6) |
| N7 | **hreflang/canonical CI check:** a crawl on every deploy fails if any twin lacks a return link, a canonical points cross-language, or a `#` route is linked | scope on 237 / S21 audit runner (PR 413–424, 570) |

---

## 2. Where Google traffic will actually come from, ranked by expected speed

Timelines start at **go-live (G)** and assume §1 and §3 are done. Google: "Crawling can take anywhere from a few days to a few weeks", and a crawl request "does not guarantee that inclusion in search results will happen instantly or even at all" [OFFICIAL]. The Shopify SEO lead quoted in PRACTICE-TASKS gives 3–6 months for measurable results and 12+ months for competitive terms [COMMUNITY].

### First, the honest language finding (TR, Bangladesh, 12 months, medians to damp one odd spike)

| Comparison (same chart) | English script | Bengali script | Other |
|---|---|---|---|
| t shirt / টি শার্ট / গেঞ্জি / tshirt | **17** | 2 (টি শার্ট) · 4 (গেঞ্জি) | tshirt 4 |
| polo shirt / পোলো শার্ট / polo t shirt (12-month means) | **14.5** | 0.2 (zero in 48 of 52 weeks) | polo t shirt 5.1 |
| hoodie / হুডি (means) | **6.1** | 0.3 (zero in 42 weeks) | — |
| panjabi / পাঞ্জাবি / punjabi | **11** | **5** | punjabi 14 (likely mixed with Indian "Punjabi" topics [EST]) |

*Note:* every English term spiked in the same week (15–21 Feb 2026), which looks like a data anomaly, so medians are used. Trends is a relative sample, not a volume count [OFFICIAL — Google News Initiative training, via D03].

**What it means [EST]:** English-script pages will carry most Google traffic. `/bn` pages add reach where Bengali script is common: **panjabi**, **গেঞ্জি**, price questions ("…দাম কত", "…এর দাম"), seasonal searches (ঈদ, শীত, বৈশাখ) and size charts. There is little competition there: **none of 11 Bangladeshi fashion sites checked serves hreflang or a `/bn` section** (COMP: Fabrilife, Sailor, Easy Fashion, Othoba, Aarong, Yellow, Gentle Park, Infinity, Le Reve, Twelve, Daraz; home pages plus one category page, so a Bengali section elsewhere can't be fully ruled out).

**Banglish:** Latin-script "dam" probes mostly returned German/Swedish "damen" suggestions. "polo shirt er dam" returned Bengali-script suggestions ("পোলো শার্ট এর দাম") (AC; the probe server is not in Bangladesh, so treat this as indicative). **No separate Banglish pages** [HOUSE]. Banglish is covered by the EN/BN pages and FAQ phrasing, then measured in Search Console (D03 §6).

### The ranking

| Rank | Source | Example queries (evidence) | Realistic timeline | Depends on |
|---|---|---|---|---|
| **1** | **Brand searches** | "extas", "extas bd", "extas polo" | Indexed brand result in **days to 2 weeks** after G; site-name display in **2–6 weeks** [EST] | Indexing; WebSite + Organization markup; Facebook/ads creating the demand (brand volume is whatever the owner's marketing makes it, and there is no public number). **Risk:** AC for "extas" suggests "ecstasis…" and drug spellings, and **Ecstasy** (ecstasybd.com, Bangladeshi clothing brand since 1997) is an established near-homonym. Searchers may be steered away, so always print "EXTAS" plus "extas.com.bd" together on social media, parcels and ads [HOUSE]. |
| **2** | **Long-tail product and category queries, EN** | "polo shirt price in bd", "drop shoulder t shirt price in bd", "t shirt combo price in bd", "men's polo shirt bd", "hoodie for men bd", "joggers price in bd", "panjabi price in bd under 1000" (all AC) | First impressions **1–3 weeks**; low-competition long-tail in top 10 **2–6 weeks**; category head terms ("polo shirt") **3–6+ months** [COMMUNITY/EST] | SSR category pages with price in the title (D04 §2), real intros, internal links, speed. SERPs include Daraz, Othoba and big brands (AC shows "…daraz", "easy…", "sailor…", "aarong…" variants), so judge difficulty on the live SERP. |
| **3** | **Long-tail, Bengali script** | "পোলো শার্ট এর দাম", "ছেলেদের টি শার্ট দাম", "ছেলেদের হুডির দাম কত", "পাঞ্জাবির দাম ২০২৬", "ঈদ পাঞ্জাবি কালেকশন ২০২৬", "ট্রাউজার প্যান্ট দাম" (AC) | **2–6 weeks** for top-10 once `/bn` twins are indexed, possibly faster than EN given thin competition [EST, to be proven by practice task P5] | Translation gate passed; Bengali title/H1/intro; hreflang correct; Bengali alt text. Smaller pool than EN (table above). |
| **4** | **Image search** | Visual intent is huge: top related queries are "t shirt design", "polo shirt design", "black polo shirt", "পাঞ্জাবি ডিজাইন", "পাঞ্জাবি পিক", "পাঞ্জাবি ছবি", "সাদা পাঞ্জাবি" (TR related, AC) | **Weeks to 3 months** after images are crawled [EST] | `<img>` not CSS; descriptive filenames (localised and URL-encoded if translated); alt text in each language; images near relevant text; high quality; Product markup with `image` for badges in Google Images; image sitemap [all OFFICIAL]. Honest caveat: "design/pic" searchers often browse rather than buy, and many results are women's or kids' [EST]. |
| **5** | **Merchant listings / free product listings** | product cards in Search, Shopping tab, Images | **Unknown, unverified for Bangladesh.** Test in week 2 | The official free-listings country table **does not list Bangladesh**; Merchant Center supported currencies **do not list BDT**; Bengali is **not** a Merchant Center language [all OFFICIAL, read today]. Tirondaj T03 §0 found that Merchant Center's regional-availability page does list Bangladesh, so official pages conflict. Google's merchant-listing structured-data page states **no country availability** [OFFICIAL]. Plan: on-page Product markup regardless (also feeds Images and AI answers), plus a Merchant Center test (N5). Merchant Center access is at risk from F2. |
| **6** | **Journal content** | size charts, GSM, polo vs T-shirt, Eid panjabi (§3 topic list) | Indexed in days; meaningful traffic **2–6 months** [COMMUNITY] | People-first quality, first-hand evidence (the owner is an exporter with factory knowledge, which is real E-E-A-T), links to categories, 1–2 strong articles a week (D05). Seasonal articles must be live **8+ weeks** before the season [EST]. |
| **7** | **Local and brand signals** | brand SERP, mentions, links | Site name **2–6 weeks**; first quality links **3–6 months** [COMMUNITY] | **Google Business Profile: not eligible** for an online-only business ("must make in-person contact with customers during its stated hours"; "online-only businesses" listed as ineligible) [OFFICIAL]. Only if a real showroom or exchange counter opens. No city doorway pages [OFFICIAL spam policy, via D06]. Organization `sameAs` to the Facebook/Instagram/YouTube/TikTok profiles; consistent name and phone; digital PR with own data (D07). |

**Seasonality to plan around (TR):** panjabi interest in **March 2026 ran at a median of 74 vs 6.5–14 in other months**, peaking 8–14 Mar 2026, about a week before Eid ul-Fitr. A smaller bump came in May (Eid ul-Adha). Hoodie interest rose in November (5 vs 1 in spring and summer months). **Eid ul-Fitr 2027 is expected around 9–10 March 2027** (moon-dependent [EST]), so panjabi pages in both languages should be **indexed by 15 Jan 2027**. Winter pages (hoodies, sweatshirts, jackets) are in season now.

**AI answers:** AI Overviews / AI Mode have "no additional requirements" beyond normal SEO, and their clicks are counted in Search Console [OFFICIAL, via D05; not re-read today]. No separate plan is needed.

---

## 3. Launch checklist: the first 30 days after go-live

| When | Step | Detail | Tag |
|---|---|---|---|
| G−7 | **Search Console: Domain property** | Verify `extas.com.bd` by a DNS TXT record, the only method for a Domain property. It covers http/https and all subdomains. **Never delete the record** ("To stay verified, don't remove the DNS record"). Optional: add a URL-prefix property for `https://extas.com.bd/bn/` to read Bengali data on its own. Add Bing Webmaster Tools (import from Search Console). | [OFFICIAL] · [COMMUNITY] for the /bn property |
| G−7 | **Old site (F1)** | Export Search Console performance and links for the WordPress site; finalise the 301 map (N2) | [HOUSE] |
| G−3 | **Staging crawl** | Free crawler (≤ 500 URLs). Checks: 0 hash links, canonical = self, hreflang return links complete, no noindex on wanted pages, `curl` shows title/H1/price/JSON-LD (D01 §8) | [HOUSE] |
| G | **robots.txt** | Disallow `/bag /checkout /account /login /order /thanks /t/ /exchange /admin /api` and sort/size params. **Don't** disallow `/search` (it carries noindex). `Sitemap:` line. AI-crawler switch default on (PR 229). | [OFFICIAL] basis (D01/D04) |
| G | **Sitemaps per language** | One sitemap index listing `sitemap-en-categories.xml`, `sitemap-en-products.xml`, `sitemap-en-combos.xml` (hub, rules, featured pairs, fixed combos), `sitemap-en-collections.xml`, `sitemap-en-journal.xml`, `sitemap-en-help.xml`, plus the same six for `bn` (only gate-passed pages). Absolute canonical URLs; 200 and indexable only; `<lastmod>` only when main content really changed; image entries on product/combo URLs (CDN images allowed); no priority/changefreq ("ignored"); max 50,000 URLs / 50 MB each. Submit the index in Search Console and in robots.txt. Submission is "merely a hint". | [OFFICIAL] |
| G | **301s live** | WordPress map plus hash forwarder (N1, N2); spot-check 10 old URLs | [HOUSE] |
| G to G+1 | **Indexing requests (few, key URLs)** | URL Inspection → Request indexing for about 16 URLs: `/` and `/bn`, 3 top categories ×2 languages, 3 PDPs, `/combos` and 1 combo rule, `/help/size-guide`. There is a quota, and "requesting a recrawl multiple times for the same URL won't get it crawled any faster". Everything else goes through sitemaps. | [OFFICIAL] |
| G to G+7 | **Structured data** (in initial HTML, matching visible text, Bengali text on /bn) | **Home:** `OnlineStore` (the Organization subtype Google recommends for e-commerce): name, url, logo ≥ 112×112, `sameAs`, `contactPoint`/telephone +880, `hasMerchantReturnPolicy` (exchange-only category to be confirmed, D02 §4) + **WebSite** (`name` "EXTAS", `alternateName` "extas.com.bd") for the site name. **PDP:** `ProductGroup` + variant `Product`s; `Offer` with `price` > 0 and `priceCurrency` BDT, availability, `brand` EXTAS; strikethrough only from a real former price (PR 38). Product markup in initial HTML because "dynamically-generated markup can make Shopping crawls less frequent and less reliable". **Combo / featured pair page:** the set as one `Product` + `Offer` at the visible set price (Google documents no bundle type, so validate in the Rich Results Test [HOUSE]). **Category, PDP, journal:** `BreadcrumbList` (Google shows breadcrumbs on **desktop** only, so most BD mobile searchers won't see it; still worth adding). **Reviews:** only from real review rows (PR 223). **No FAQ rich results:** the feature ended for all sites on 7 May 2026, and the Rich Results Test / Search Console report dropped it in June 2026. | [OFFICIAL] · combo choice [HOUSE] |
| G+1 to G+7 | **Internal linking** | Nav + footer → every category (both languages); category → PDPs (first page in HTML) and → sub-categories; PDP → category, combos (PR 102), related; combo hub ↔ rules ↔ featured pairs; journal → 1 pillar category + 1–3 products; home → top categories, `/combos`, current season; **every page → its language twin**; breadcrumbs. Descriptive anchors ("men's polo shirts", "ছেলেদের পোলো শার্ট"). | [OFFICIAL] links must be `<a href>` · [HOUSE] map |
| G | **Page speed** | Lab test (PageSpeed Insights, mid-range mobile profile) on home, 2 categories, 2 PDPs, 1 combo. Targets at p75 mobile: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1. Field data needs about 28 days. Speed matters more for sales than for rank (Google shows relevant content "even if the page experience is sub-par"). The competitor Fabrilife measured LCP 11–14 s. | [2-SRC] thresholds (D01 §7) |
| G+1 to G+14 | **Watch daily** | Search Console → Pages ("Discovered/Crawled – currently not indexed", "Duplicate, Google chose different canonical", soft 404), Sitemaps (read status, per-language counts), Enhancements (Product snippets / Merchant listings, if reported for BD) | [OFFICIAL] (D02) |
| G+7 | **Merchant Center test (N5)** | Try target country Bangladesh with BDT pricing; log the result in BLOCKED.md; no brand-named items in the feed (F2) | [HOUSE] |
| G+14 / G+28 | **First query review** | Script split (EN / BN / Banglish share of impressions) replaces the Trends estimate; queries at positions 8–20 get page improvements; low CTR at positions 3–10 gets title rewrites (D03 §6) | [HOUSE] |
| G+30 | **Report to owner** | Indexed pages per language, impressions/clicks per language, top 20 queries, practice-task grades (§5) | [HOUSE] |

### First 10 journal topics (target queries seen in AC/TR on 19 Oct 2026; volumes unknown)

| # | Article (language) | Target queries (evidence) | Links to | Timing |
|---|---|---|---|---|
| 1 | **T-shirt size chart for Bangladesh (men): how to measure** (EN + BN) | "t shirt size chart bangladesh men's", "bangladeshi t shirt size chart", "t shirt measurement chart bd", "টি শার্ট সাইজ চার্ট বাংলাদেশ" (AC) | `/t-shirts`, `/help/size-guide` | G+7 |
| 2 | **পাঞ্জাবির সাইজ চার্ট (বাংলাদেশ): কোন সাইজ নেবেন** (BN first, EN twin) | "পাঞ্জাবি সাইজ চার্ট বাংলাদেশ" (TR rising: Breakout), "panjabi size" (TR top) | `/panjabi` | by 15 Jan 2027 |
| 3 | **Polo shirt size chart and fit guide** (EN + BN) | "polo t shirt size chart bangladesh men's", "bangladeshi polo t shirt size chart" (AC) | `/polo-shirts` | G+14 |
| 4 | **What GSM means: 160 vs 180 vs 200 vs 240 GSM T-shirts** (EN + BN) | "gsm t shirt meaning", "gsm t shirt quality", "180 gsm t shirt", "240 gsm t shirt" (AC) | `/t-shirts` | G+21 |
| 5 | **Polo shirt vs T-shirt: which one, when** (EN) | "polo shirt vs t shirt", "polo shirt or t shirt" (AC) | `/polo-shirts`, `/t-shirts` | G+28 |
| 6 | **Drop-shoulder vs regular-fit T-shirt: how to pick your size** (EN + BN) | "drop shoulder t shirt size chart", "drop shoulder t shirt men", "ড্রপ সোল্ডার টি শার্ট দাম" (AC); "drop shoulder t shirt" (TR top related) | `/t-shirts/drop-shoulder` (if demand proven) | month 2 |
| 7 | **Eid panjabi 2027: colours and styles, with prices** (BN + EN; refresh the same URL each year) | "eid panjabi collection 2026" (TR Breakout; the year rolls over), "ঈদ পাঞ্জাবি কালেকশন ২০২৬" (AC), "white / maroon / off white panjabi" (TR) | `/collections/eid-panjabi`, `/panjabi` | by 15 Jan 2027 |
| 8 | **পোলো শার্টের বিভিন্ন অংশের নাম: কলার, প্ল্যাকেট, রিব, কাফ** (BN) | "পোলো শার্টের বিভিন্ন অংশের নাম", "পোলো শার্ট কি" (AC) | `/bn/polo-shirts` | month 2 (the owner's factory knowledge is first-hand evidence) |
| 9 | **Winter hoodie guide: fleece vs French terry, zipper vs pullover, sizing** (EN + BN) | "winter hoodies for men bd", "zipper hoodie for men bd" (AC), "শীতের পোশাক ছেলেদের হুডি" (AC), "oversized hoodie" (TR rising) | `/hoodies` | G+14 (season now) |
| 10 | **Black, white or navy polo: what works in Bangladesh heat, and how to stop fading** (EN + BN) | "black polo shirt" (TR top and rising), "white polo shirt price in bd" (AC) | `/polo-shirts/black`, `/polo-shirts` | month 2 |

Every article passes the D05 §7 content gate: byline, real photos and measurements, facts checked against product data and Smart Rules, no invented numbers.

---

## 4. Keyword starting map

**Method and limits.** Sources: Google autocomplete (AC) for 63 seeds in English, Bengali and Banglish (`gl=bd`, `hl=en` and `hl=bn`), and Google Trends (TR) for Bangladesh over the last 12 months (interest comparisons and related/rising queries), both pulled 19 Oct 2026; plus competitor pages (COMP). **Limits:** the probe server is outside Bangladesh, so some suggestions leaked Indian (Flipkart/Myntra/"under 500") and European ("damen") results, and those were discarded. AC shows that a phrasing exists, **not how many people search it**. TR is relative. **No search volumes are given.** Volumes need Keyword Planner in the owner's Google Ads account (D03 §2), then Search Console after G. Priority is **[EST]**: business value × likely achievability.

| Cluster | English (evidence) | বাংলা (evidence) | Banglish | Target URL (EN / BN) | Priority [EST] |
|---|---|---|---|---|---|
| **Polo: core + price** | polo shirt price in bangladesh, polo shirt bd price, polo t shirt price in bd men's, mens polo shirt bd, premium polo shirt bd (AC); polo shirt 14.5 vs polo t shirt 5.1 (TR) | পোলো শার্ট এর দাম, পোলো টি শার্ট দাম, ছেলেদের পোলো শার্ট (AC) | "polo shirt dam" (appears inside Bengali suggestions, AC) | `/polo-shirts` · `/bn/polo-shirts` | **High** |
| Polo: colour | black polo shirt (TR top, rising +70%), white polo shirt price in bd (AC) | পোলো টি শার্ট সাদা / কালো (AC) | — | `/polo-shirts/black`, `/polo-shirts/white` (if demand holds) | Medium |
| Polo: style | zipper polo t shirt, oversized polo t shirt bd (AC), old money polo shirt (TR) | পোলো টি শার্ট ফুল হাতা (AC) | — | sub-category or PDP | Medium |
| **T-shirt: style** | drop shoulder t shirt price in bd (AC; TR top related), oversized t shirt price in bd, full sleeve / v neck / cotton / big size t shirt for men bd (AC); crew neck, henley, acid wash (TR rising) | ছেলেদের টি শার্ট দাম, ড্রপ সোল্ডার টি শার্ট দাম, সাদা টি শার্ট দাম, গেঞ্জি (TR 4 vs টি শার্ট 2) | "t shirt dam koto" → AC returns "টি শার্ট দাম কত" | `/t-shirts` (+ `/t-shirts/drop-shoulder` if proven) | **High** |
| **Combos** | t shirt combo price in bd, t shirt combo for men, polo shirt combo offer, polo t shirt combo offer, t shirt combo pack of 3 (AC) | **caution:** "কম্বো অফার" alone = telecom bundles (Robi/GP/Banglalink, AC), so always qualify it: "টি শার্ট কম্বো", "পোলো কম্বো" | tshirt combo offer (AC, partly Indian) | `/combos`, `/combos/<rule>` | **High** (biggest-selling section) |
| **Hoodie / sweatshirt** | hoodie price in bangladesh, hoodie for men bd, zipper hoodie, winter hoodies for men bd, sweatshirt price in bd, drop shoulder sweatshirt (AC); oversized / acid wash hoodie (TR rising) | ছেলেদের হুডির দাম কত, শীতের হুডির দাম কত, বাংলাদেশে হুডির দাম (AC); হুডি alone is noisy (AC returns a diet-pill brand) | "hoodie dam" leaked to Swedish/German results (discarded) | `/hoodies`, `/sweatshirts` | **High** (season now) |
| **Joggers / trousers / tracksuits** | joggers price in bd, men joggers, cargo / baggy / gym joggers price in bd, jogger pants price in bd, trouser price in bd, cotton trouser, tracksuit for men price in bd (AC); joggers 0.4 and tracksuit 0.0 on the TR shared scale (low) | জগার প্যান্ট, কার্গো জগার প্যান্ট, ট্রাউজার প্যান্ট দাম (AC) | — | `/joggers`, `/trousers`, `/tracksuits` | Medium |
| Twill pant | "twill pant price in bd" returned no matching suggestions (AC) | — | — | inside `/trousers` | Low (no demand seen) |
| **Panjabi** | panjabi price in bd (under 1000 / online / 2026), eid panjabi collection 2026, panjabi for men, white / black / maroon / off-white panjabi, panjabi size (AC, TR) | পাঞ্জাবির দাম ২০২৬, পাঞ্জাবি দাম, ঈদ পাঞ্জাবি কালেকশন ২০২৬, ছেলেদের পাঞ্জাবি, সাদা পাঞ্জাবি, পাঞ্জাবি সাইজ চার্ট বাংলাদেশ, বৈশাখের পাঞ্জাবি (AC, TR); Bengali share is strongest here (TR) | "punjabi dam koto" (AC) | `/panjabi`, `/collections/eid-panjabi` | **High** (seasonal; Bengali matters most) |
| Shirts | shirt price in bd under 1000, formal shirt price in bd, check / white shirt price in bd, casual shirt for men price in bd (AC); "shirt" 13 on the TR shared scale (broad, includes jerseys) | ফরমাল শার্ট এর দাম, ছেলেদের শার্টের দাম কত, চেক শার্ট এর দাম (AC) | — | `/shirts` | Medium |
| **Size & fit (info)** | t shirt size chart bangladesh men's, polo t shirt size chart bangladesh, drop shoulder t shirt size chart (AC); t shirt size (TR top) | টি শার্টের সাইজ চার্ট, পাঞ্জাবি সাইজ চার্ট বাংলাদেশ (AC, TR Breakout) | — | journal 1–3, `/help/size-guide` | **High** (also cuts size refusals) |
| Fabric (info) | gsm t shirt meaning / quality / chart, 180 / 200 / 240 gsm t shirt (AC) | — | — | journal 4 | Medium |
| Seasonal | eid panjabi collection 2026 (TR Breakout) | শীতের পোশাক ছেলেদের ২০২৬, শীতের পোশাক ছেলেদের হুডি / জেকেট (AC) | — | `/collections/<season>` | High near season |
| **Brand** | extas, extas bd → AC suggests "ecstasis…" and drug spellings (collision) | — | — | `/` · `/bn` | High (protect) |
| General store | men's clothing online bangladesh, men's online shopping bd (AC) | — | — | `/` | Low (marketplaces dominate [EST]) |

**Excluded on purpose:** third-party brand queries ("us polo", "ralph lauren polo shirt", "lacoste", "prada": F2); wholesale and industry terms ("polo shirt hs code", "পাইকারি বাজার", "mockup", "লেআউট"); women/girls/kids variants (menswear line); pure "design ছবি / পিক" browsing, which is targeted through **image search** rather than dedicated pages; standalone "কম্বো অফার" (telecom).

**Cannibalisation rule:** one primary query cluster per URL (D03 §3). For example, "polo shirt price in bd" belongs to `/polo-shirts`, never to the home page or a journal post.

---

## 5. Practice tasks with deadlines (adapted from PRACTICE-TASKS)

Grades: **A** on time with evidence · **B** late or partial · **C** missed, with root cause and next test · **F** broke a rule (spam policy, doorway, fake review, third-party brand in schema). Evidence is always a dated Search Console screenshot or export.

| # | Drill (from) | Deadline | Pass (A) |
|---|---|---|---|
| P1 | EN + BN pair indexed (S1) | **G+3 days** | `/`, `/bn`, 3 categories ×2, 3 PDPs, `/combos` show "URL is on Google" in URL Inspection; each linked from nav and in its language sitemap |
| P2 | Launch-day audit (S2) | **G+2 days** | Crawl: 0 5xx; 0 internal links to 404/redirects; canonical = self on all indexable pages; **0 hreflang return-link errors**; 0 `#` routes; **all 49 WordPress URLs 301 to the right twin** |
| P3 | Structured data on PDPs + combos (S3) | **G+7 days** | Rich Results Test passes on 10 PDPs + 5 combo pages in both languages; Search Console Merchant listings / Product snippets report shows valid items, **or** a logged note that Google doesn't report them for BD |
| P4 | Brand SERP (S9) | **G+21 days** | "extas bd" and "extas.com.bd" → our home in position 1; site name shows "EXTAS"; OnlineStore + WebSite valid; social profiles link both ways. Record what "extas" alone shows (collision watch). |
| P5 | Long-tail top 10 (S4) | **G+14 to G+28 days** | Two pre-chosen queries, one EN ("t shirt combo price in bd") and one BN ("পোলো শার্ট এর দাম"), each average position ≤ 10 over 7 days. A by G+28, B by G+42. |
| P6 | Keyword map v1 (S6) | **G+7 days** | §4 expanded to ≥ 150 queries with Keyword Planner volumes (owner's account) + first Search Console queries, each cluster on one URL, no cannibalisation |
| P7 | Two quality articles (S7) | **G+14 days** | Journal 1 (EN + BN) and 9 published, passing the D05 §7 gate, linked to their pillars, tracked 28 days |
| P8 | Bengali coverage and script split (new) | **G+28 days** | Agreed Bengali scope (§6 item 4) 100% gate-passed and indexed; report the real EN / BN / Banglish impression share, which replaces the Trends estimate in §2 |
| P9 | Merchant Center BD test (new, with Tirondaj) | **G+14 days** | Result logged (accepted or not, currency, any policy flags); 0 counterfeit flags |
| P10 | Eid panjabi readiness (new, seasonal) | **15 Jan 2027** (indexed) · **1 Mar 2027** (ranking) | `/collections/eid-panjabi` + `/panjabi` + journal 2 and 7, EN + BN, indexed by 15 Jan; at least one "eid panjabi collection 2027" / "ঈদ পাঞ্জাবি কালেকশন ২০২৭" query in the top 20 by 1 Mar [EST target] |
| P11 | Core Web Vitals (S13) | **G+28 days** (field data) | PDP + category LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at p75 mobile, **or** a written fix plan with Prohori |

**How they show in the appraisal (APPRAISAL-TEMPLATE, PR 578):**
- **Daily:** each drill step appears under "tasks done" with its evidence file.
- **Weekly:** drills due that week appear in "goals vs done (percent)" and gate/QA pass rate. A missed drill appears under risks/blockers, with what Doot needs from the owner (e.g. no DNS access means P1 can't start).
- **Monthly:** grade trend (A/B/C/F count), best and worst drill with screenshots, lessons.
- **Yearly:** each drill is a line in "Goals set vs achieved — target, result, evidence". P2/P3/P8 feed "quality", P1/P5 "speed", F1/F2-type catches feed "ownership (finding problems before the owner)". Any F is reported plainly with its root cause.

---

## 6. What the owner must provide or decide

1. **Is the live WordPress shop at extas.com.bd yours?** If yes: the new site launches on the same domain (recommended, because it keeps its history) and Doot gets its old Search Console data. **DNS access** is needed for verification.
2. **Google accounts:** one owner Google account for Search Console, Bing (via import), Google Ads (Keyword Planner volumes) and the Merchant Center test. The owner pastes keys himself (S11 answer 10).
3. **Third-party brand names** (Ralph Lauren, Prada, Boss, Diesel) in product names, slugs and the "100% original" trust line: recommended default is **EXTAS's own style names** everywhere online. They can never appear in schema `brand` or the Merchant feed. Ask a lawyer about trademarks.
4. **Bengali scope at launch.** Recommended default: home, every category, `/combos` + rules, help pages, **all panjabi**, top 20 PDPs. The rest follow weekly. Also decide **who writes and approves Bengali text** (native চলতি, never raw machine output).
5. **Confirm English at the root `/` (not `/en`)** and `en` / `bn` hreflang codes.
6. **Exchange-only return policy wording** for structured data (which return category Google should be told).
7. **Brand assets:** logo file (≥ 112×112, works on white), the Facebook/Instagram/YouTube/TikTok profile URLs, business phone/WhatsApp, and whether a business address may be public.
8. **Photos:** real photos for every colour and **set photos for featured combo pairs** (needed for image search and pair indexing), plus a named author and short bio for the journal.
9. **Brand-name collision:** keep "EXTAS" alone, or always pair it with a descriptor ("EXTAS Menswear") in page titles and social names.
10. **Go-live date.** For Eid 2027, panjabi pages must be indexed by **15 Jan 2027**.

---

**Sources** (As of October 2026; read 19 Oct 2026 unless marked):
- [Official] Google Search Central, Tell Google about localized versions of your page (hreflang), updated 2026-09-21: https://developers.google.com/search/docs/specialty/international/localized-versions
- [Official] Google Search Central, Managing multi-regional and multilingual sites, updated 2025-12-10: https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites?authuser=6
- [Official] Google Search Central, URL structure best practices, updated 2025-12-10: https://developers.google.com/search/docs/crawling-indexing/url-structure
- [Official] Google Search Central, How to specify a canonical URL, updated 2026-07-10: https://developers.google.com/search/docs/advanced/guidelines/duplicate-content
- [Official] Google Search Central, Build and submit a sitemap, updated 2026-07-08: https://developers.google.com/search/docs/guides/create-URLs
- [Official] Google Search Central, Ask Google to recrawl your URLs, updated 2025-12-10: https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl?rd=2
- [Official] Google Search Central, JavaScript SEO basics, updated 2026-03-04: https://developers.google.com/webmasters/ajax-crawling
- [Official] Google Search Central, Google image SEO best practices, updated 2026-03-02: https://developers.google.com/search/docs/appearance/google-images
- [Official] Google Search Central, Introduction to Product structured data, updated 2025-12-10: https://developers.google.com/search/docs/advanced/structured-data/product
- [Official] Google Search Central, Merchant listing (Product, Offer) structured data: https://developers.google.cn/search/docs/appearance/structured-data/merchant-listing?hl=en
- [Official] Google Search Central, Organization structured data, updated 2026-09-08: https://developers.google.com/search/docs/data-types/logo
- [Official] Google Search Central, Breadcrumb structured data (desktop availability), updated 2026-09-08: https://developers.google.com/search/docs/data-types/breadcrumbs
- [Official] Google Search Central, FAQPage structured data, deprecation notice (7 May 2026) and updates log: https://developers.google.com/search/docs/data-types/faqpage?authuser=8
- [Industry news] PPC Land, Google kills FAQ rich results (second source for the May 2026 change): https://ppc.land/google-kills-faq-rich-results-what-seos-saw-coming-since-2019/
- [Official, title/date only; body not readable] Google Search Central blog, Changes to HowTo and FAQ rich results (Aug 2023): https://developers.google.com/search/blog/2023/08/howto-faq-changes
- [Official] Search Console Help, Verify your site ownership: https://support.google.com/webmasters/answer/9008080
- [Official] Merchant Center Help, Show your products for free on Google (country table; Bangladesh absent): https://support.google.com/merchants/answer/13427531 and https://support.google.com/merchants/answer/13692890?hl=en
- [Official] Merchant Center Help, Supported languages and currencies (no BDT, no Bengali): https://support.google.com/merchants/answer/160637
- [Official] Merchant Center Help, Set up Shopping ads and free listings in multiple countries: https://support.google.com/merchants/answer/15404838?hl=en
- [Official] Merchant Center Help, Counterfeit products policy: https://support.google.com/merchants/answer/6149993?authuser=3
- [Official] Google Business Profile Help, Business eligibility and ownership guidelines: https://support.google.com/business/answer/13763036
- [Reference] Wikipedia, Ecstasy (clothing), Bangladeshi brand, ecstasybd.com: https://en.wikipedia.org/wiki/Ecstasy_(clothing)
- [Data, free tools] Google autocomplete (suggestqueries.google.com, `gl=bd`) and Google Trends (trends.google.com, geo BD, today 12-m), pulled 19 Oct 2026; raw pulls kept in Doot's scratchpad, not shipped
- [Competitor pages, read 19 Oct 2026] fabrilife.com, sailor.clothing, easyfashion.com.bd, othoba.com/mens-polo-shirts, aarong.com, yellowclothing.net, gentlepark.com, infinitymegamall.com, lerevecraze.com, twelvebd.com, daraz.com.bd (ecstasybd.com refused the connection)
- [Live site] extas.com.bd home, robots.txt, wp-sitemap.xml (read 19 Oct 2026)
- [Internal] Doot skills D01–D06, MYTHS, PRACTICE-TASKS; Tirondaj T03 §0 (Merchant Center availability conflict); MASTER-REGISTER S02/S03/S11/S12 and owner answers 19 Oct 11:39; PENDING_CHANGES S11; EXTAS-ECOMMERCE-V1 §S11; QA ECOMMERCE-CHECKLIST §19; ROUND15

**Not verified:** Bangladesh availability of free listings and merchant-listing experiences (official pages conflict, so test it); exact Eid 2027 dates (moon-dependent); whether the WordPress shop is the owner's; Google's site-names guidance body (blog post body not readable; rule carried from D02/D06); the AI-features doc and spam policy were not re-read today (carried from D05/D06).

**Skill updates proposed (LEARNING-LOOP → owner/Gyani approval, PR 420 gate):**
- MYTHS #1 and D02 §4: FAQ rich results are now **gone for all sites (7 May 2026)**, not only limited to government and health sites.
- D03 §1: add the Trends script ratios above as a dated baseline until Search Console data replaces them.
- D04 §8 / D02: combo-pair indexing policy.

*As of October 2026.*
