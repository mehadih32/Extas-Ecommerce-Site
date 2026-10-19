# Doot · Curriculum wave 1 exam (SEO, content, social, CRM)

*31 questions (Q29–31 added in curriculum wave 2) · 1 point each · **pass mark 85% (27/31)** · (P) = practical written answer · any answer that breaks
Google's spam policy, the consent rules or the owner's message budget scores 0 and fails the exam · as of October 2026*

## Part A — Technical SEO and Search Central (D01, D02)

1. Why is a `#/product/polo` route invisible to Google as a separate page, and how do we fix it in Next.js?
2. Name the three phases Google uses for JavaScript sites and Google's recommendation about rendering.
3. A client-side "product not found" view returns HTTP 200. Give Google's two acceptable fixes and the better server-side fix.
4. You see `noindex` in the initial HTML, removed by JS after load. What can happen?
5. Sitemap: max URLs per file, which two tags Google ignores, and when to change `lastmod`.
6. Merchant listing: the three required Product properties and the two required Offer properties.
7. Why must a merchant listing use `Offer` and not `AggregateOffer`?
8. How do you mark up a sale price with a strikethrough former price?
9. Can a category page carry Product markup for eligibility? Why?
10. FAQ rich results: who is eligible since August 2023, and what do we do with our FAQ content?
11. (P) Write the hreflang set for `/men/polo-shirts` (English) and `/bn/men/polo-shirts` (Bengali), including x-default.
12. What does Google say is required to appear in AI Overviews / AI Mode?

## Part B — Keywords, pages, content (D03–D05)

13. (P) Give 3 queries each in English, Bengali script and Banglish for "hoodie price", and the URL each should target.
14. Google Trends shows "hoodie" at 100 in December and 20 in June. Does that mean 5× more searches in December? Explain.
15. A filter combination "polo + white" has clear search demand; "polo + size L + under ৳800" has none. How do you treat each?
16. Paginated category: what canonical do pages 2+ get?
17. Category intro length range supported by two sources, and where the long guide goes.
18. When does a colour deserve its own URL?
19. What is "scaled content abuse" and how does the content quality gate prevent it?
20. Who/How/Why: give one concrete EXTAS action for each.

## Part C — Local, links, social (D06–D08)

21. Is EXTAS eligible for a Google Business Profile today? Under what condition would it be?
22. Why are "Polo shirt in Sylhet / Khulna / Rajshahi" pages a bad idea?
23. A creator offers a review in exchange for a free hoodie and a dofollow link. What is the compliant version?
24. Which Instagram signal did Adam Mosseri call "one of the most important signals we use in ranking"? Give a post idea built for it.

## Part D — CRM, SMS, WhatsApp (D09)

25. State the owner's per-order message budget and the default allocation.
26. When is a WhatsApp utility template free?
27. Bengali SMS: characters per segment, and the route/time rules for promotional SMS in Bangladesh.
28. (P) A customer refused a parcel last month and is opted in to offers. May we send him the Eid offer by WhatsApp? Explain with the EXTAS rules.

## Part E — South-Asian practice (D10, wave 2)

29. Which COD-messaging practice is supported by independent sources from India, Pakistan **and** Bangladesh, and why does it raise an owner decision about the 2 SMS + 1 WhatsApp budget?
30. Name two South-Asian SEO claims D10 rejected and what EXTAS uses instead.
31. (P) Write the Bengali COD confirmation message (utility, total including delivery, reply options) and say which three numbers EXTAS measures to judge it.

---

## Answer key (graders only)

1. Google ignores/can't reliably resolve fragments — all `#` views are one URL; give each view a real path via server routing/History API with server-rendered HTML.
2. Crawl, render, index; SSR or pre-rendering still recommended (not all bots run JS).
3. Redirect to a URL returning 404, or add noindex via JS; better: server returns a real 404 (or 301 to a close replacement).
4. Google may skip rendering on seeing noindex → page not indexed.
5. 50,000 URLs (or 50 MB); priority and changefreq ignored; lastmod only on significant changes (content, structured data, links).
6. name, image, offers; price (> 0) and priceCurrency.
7. Merchant listings require the merchant to be the seller of a single offer.
8. Active price with no priceType; former price as a priceSpecification with priceType StrikethroughPrice (real former price only).
9. No — merchant listing/product markup is for single-product (or variant) pages; categories get Breadcrumb/ItemList.
10. Well-known authoritative government and health sites; keep the content (users, AI answers), markup harmless but no snippet expected.
11. On both pages: `hreflang="en"` → /men/polo-shirts, `hreflang="bn"` → /bn/men/polo-shirts, `hreflang="x-default"` → /men/polo-shirts (absolute URLs, bidirectional).
12. Nothing additional: indexed and snippet-eligible, normal SEO; no special files/schema.
13. Graded: plausible natural queries (e.g. "hoodie price in bd", "হুডি দাম", "hoodie er dam koto") → hoodie category (price intent) / size or care questions → blog/guide.
14. No — Trends is relative share normalised to the peak, sampled; not absolute volume.
15. White polo → indexable sub-category page (static path, self-canonical, own H1/intro, linked). Size+price combo → not crawlable (robots disallow/client-side filter), 404 if empty.
16. Self-referencing canonical (never page 1).
17. ~30–100 words above the grid (Ahrefs 30–60, Go Fish 50–100); guide/FAQ below the grid or in the blog.
18. When the colour has its own search demand and distinct photos (e.g. "white polo shirt").
19. Generating many pages (AI or not) without adding value, mainly to rank; the gate requires first-hand evidence, fact checks, uniqueness, beats current top results.
20. Who: named byline with bio; How: show tests/photos/measurements, disclose substantial AI; Why: written to help the buyer choose, with real product data.
21. No (online-only, no in-person contact); eligible with a real customer-facing location with hours (showroom/pickup point).
22. Doorway abuse in Google's spam policy (city-targeted pages funnelling to one page).
23. Gift with clear disclosure; any link marked rel="sponsored" (or nofollow); no link required by contract.
24. Sends per reach; e.g. "Send this to the friend who always wears the same black tee" / combo-for-two idea.
25. Max 2 SMS + 1 WhatsApp per order; default SMS-1 order placed, SMS-2 tracking at dispatch, WA-1 utility (2-size check, else review request).
26. Inside an open 24-hour customer-service window (and all messages in a 72-hour free entry window from a click-to-WhatsApp ad when we reply within 24 h).
27. 70 characters per segment (Unicode); promotional via non-masking route, ~9 AM–9 PM, NDNC-filtered; masking for transactional only.
28. No — refused-parcel customers get no marketing (EXTAS CRM rule: none to anyone who refused in the last 90 days unless he later bought and accepted); also check WhatsApp opt-in is a clear opt-in.
29. Confirm every COD order before dispatch (call/WhatsApp/SMS) — Velocity/eChai/Shipmozo (IN), DHL PK/Markaz/Aaj (PK), Future Startup (BD). Confirmation and NDR follow-up messages compete with the 2 SMS + 1 WhatsApp per order budget → owner decides whether they count inside it.
30. Any two: "≥ 150-word descriptions" (no Google rule — write what helps), "mobile ≤ 2 s / desktop ≤ 3 s" (use Core Web Vitals), "60% of traffic starts with Google" (unsourced), "SEO CAC ₹140 vs ₹480" (one unnamed brand).
31. Graded: order no., total incl. delivery, COD stated, reply 1/2 (or buttons), simple Bengali, utility tone; measures: confirmation rate, refusal rate with vs without reply, NDR recovery rate — by channel and district.

