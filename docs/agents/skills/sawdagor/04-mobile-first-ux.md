# S04 · Mobile-first commerce UX

*Sawdagor সওদাগর · A360-04 · module 4 of 6 · level: Post-graduate · version 1.0 · as of October 2026*
*Shilpi owns the visual layer and the 15-size device gate; Sawdagor owns behaviour and logic.*

---

## 1. Evidence
- Baymard's mobile benchmark of 138 major US/EU mobile sites: **62% "mediocre" or worse, 0% "good"**; weakest areas: main navigation, search autocomplete, **mobile forms**, sitewide elements. Mobile is often ~50% of traffic, yet some mobile sites convert less than half as well as desktop [RESEARCH].
- EXTAS reality: phone-first (blueprint: ~95% of visitors on phones); mid-range Android, mobile data.

## 2. Rules (each mapped to evidence or owner rule)

| Area | Rule | Basis |
|---|---|---|
| Navigation | category entry in ≤ 2 taps from home; combos as a top-level entry; sticky bag icon prominent | Baymard weak area; Shilpi's header system |
| Search | autocomplete with products + categories + help answers; Bengali and misspellings handled (help search built) | Baymard weak area |
| Forms | numeric keypad for phone; autofill attributes; inline validation; big tap targets; no fields that can be inferred (band from address) | Baymard weak area; owner rule |
| Product images | swipe gallery + pinch/double-tap zoom (built), on-model first | Baymard apparel |
| Size | size buttons, disabled (not hidden) out-of-stock sizes, size guide opens over the PDP and closes back to it | Baymard apparel |
| Bag | edit qty/size in bag; undo on remove (built: Move-to-wishlist with Undo) | NN/g cart feedback |
| Speed | LCP ≤ 2.5 s p75 on mobile; images sized; no layout shift | Core Web Vitals (Doot D01) |
| Layout | AUTO ADJUST: nothing wraps or covers; price/fit lines one line on every device; step down full → short → icon, or hide | owner rules (lessons/ALL.md) |
| Back / gestures | back goes one page, same scroll; never break pull-to-refresh | owner rules |
| Sticky CTA | Add to Bag / Order Now reachable without scrolling back up | [COMMUNITY — widely used; A/B test] |
| Interstitials | no full-screen popups on entry (Fabrilife teardown: app/bKash modal blocked the hero on every new session) | [HOUSE] + teardown evidence |

## 3. Mobile QA checklist (with Shilpi's device gate)
- [ ] 15 sizes 320×640 → 440×956: 0 failures, screenshots looked at.
- [ ] Checkout completed on a real low-end Android on 3G-like throttling.
- [ ] Keyboard never covers the active field or the CTA.
- [ ] Every tap target ≥ ~44–48 px [COMMUNITY — platform guideline values; verify with Shilpi's standard].
- [ ] Bengali text renders and fits (no clipped conjuncts).

---

**Sources** (type in brackets):
- [Research] Baymard, Mobile e-commerce usability: https://baymard.com/research/mcommerce-usability
- [Research] Baymard, 5 apparel UX best practices: https://baymard.com/research-articles/apparel-5-best-practices
- [Research] NN/g, E-commerce product pages: https://www.nngroup.com/articles/ecommerce-product-pages/
- [Internal] lessons/ALL.md, teardown-fabrilife.md, sawdagor.md, shilpi.md

*As of October 2026.*
