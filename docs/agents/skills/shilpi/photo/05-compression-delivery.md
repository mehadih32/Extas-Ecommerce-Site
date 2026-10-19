# P05 · Image compression and delivery — fast on a mid-range Android on mobile data

*Shilpi শিল্পী · A360-05 · photo module 5 of 6 · version 1.0 · as of October 2026*
*Pipeline code is Prohori's/Bhandari's (sharp, CDN); Shilpi sets the visual standard and the budgets.*

---

## 1. Rules

| Rule | Detail | Evidence |
|---|---|---|
| Keep originals untouched | master at full resolution forever; derived files generated | blueprint C7.5 |
| Modern formats with fallback | `<picture>`: AVIF → WebP → JPEG `<img>`; PNG only for flat graphics | Specification.website (citing web.dev/MDN); Google supports AVIF/WebP in Search |
| Quality | photos: WebP ~75–80 is visually indistinguishable from 95; never export at 100 | Specification.website [single technical source — check visually on our garments, especially dark fabrics and fine knit texture] |
| Right size | generate several widths; `srcset` + `sizes`; never send a 2000 px image to a 400 px slot | Specification.website; Google image SEO (srcset/picture with `<img>` fallback) |
| Reserve space | always `width` + `height` (or aspect-ratio) → no layout shift (CLS ≤ 0.1) | Specification.website; Core Web Vitals (Doot D01) |
| LCP image | first product/hero image: not lazy-loaded, `fetchpriority="high"`; others lazy | [COMMUNITY — standard web.dev practice; not in the pages read this session] |
| Real `<img>` tags | Google doesn't index CSS background images | Google image SEO (official) |
| Same URL everywhere | reference each image by one consistent URL so it caches | Google image SEO (official) |
| Metadata | strip EXIF/thumbnails; keep or convert to sRGB first (P02) | Specification.website + EIZO |
| Budget | flag any delivered image > 200 KB for review | Specification.website |

## 2. EXTAS size ladder (starting point) [HOUSE]
Grid thumbnails: 320, 480, 640 px wide · PDP gallery: 640, 960, 1280 px · zoom: 2000 px loaded **only on zoom** (blueprint: high-resolution version loads on zoom) · ads/catalogue exports: per P03 table.

## 3. Checks
- Lighthouse: "Properly size images", "Serve images in next-gen formats" pass.
- DevTools network: images sorted by size, none > 200 KB in the first screen.
- Visual check of compressed dark navy/black garments for banding and texture loss on a phone.

---

**Sources** (type in brackets):
- [Technical spec] Specification.website, Image optimisation: https://specification.website/spec/performance/image-optimization/
- [Official] Google, Image SEO best practices: https://developers.google.com/search/docs/appearance/google-images
- [Industry/vendor] EIZO, Colour management summary: https://eizo.com/library/management/color-management-summary
- [Internal] EXTAS blueprint C7.5, C7.15; skills/doot/01-technical-seo-spa-to-ssr.md

**Not verified directly:** web.dev's own image pages (guidance taken from a technical page that cites them).

*As of October 2026.*
