# U10 · Conversion-safe visual hierarchy

*Shilpi শিল্পী · A360-05 · ux module 10 of 10 · level: Post-graduate → PhD · version 1.0 · as of October 2026*

"Conversion-safe" = a visual change that cannot quietly hurt orders: it keeps the buying path obvious, it is measured, and it is reversible.

---

## 1. The tools of hierarchy [OFFICIAL — NN/g]

- Three tools: **colour/contrast** (value and saturation against neighbours, not hue itself), **scale** (bigger = more important), **grouping** (proximity, white space, common regions).
- Limits NN/g recommends: **≤ 3 contrast variations, ≤ 3 type sizes** (header, subheader, body), **≤ 2 large elements**, **≤ 2 primary and 2 secondary colours**.
- **Squint/blur test:** blur the screenshot — what stands out must be what matters; one strongly coloured item can create an unintended focal point.
- Mistakes: everything the same size/colour; heavy ALL CAPS; too many colours; colour as the only cue; competing large elements; crowding; a strong image dominating a secondary slot.

## 2. The EXTAS PDP hierarchy (first screen, phone) [HOUSE — blueprint PDP_FIT + owner rules]

| Rank | Element | Treatment |
|---|---|---|
| 1 | Product photo | largest element; stable height (U08) |
| 2 | **Add to Bag / Order now** | the only filled brand-colour button on screen; bottom bar |
| 3 | Price line | largest text after title; one line; real "was" price only (Sawdagor S05) |
| 4 | Title | line one fills; weight 600 |
| 5 | Colour + size selectors | clear selected state (ring + tick), 44 px |
| 6 | Fit line, delivery line | body size, muted but ≥ 4.5 : 1 |
| 7 | Everything else | below the fold or behind labelled rows |

Rules:
1. **One primary action per screen.** Secondary actions (WhatsApp, heart, share) are outline/icon style; they never use the buy colour **[HOUSE, NN/g ≤ 2 primary colours]**.
2. **Promotions don't outrank the product:** promo strip ≤ 1 line, muted; no entry pop-up over the hero (Fabrilife teardown lesson, Sawdagor S06).
3. **Badges:** max one per card ("Combo", "New" or "Sale"), never covering the face/garment detail.
4. **Trust and cost info sits next to the decision** (delivery charge, door rule, exchange rule near the buy section), not in a banner — banner-only info is missed (Baymard 27%, Sawdagor S01) **[OFFICIAL via S01]**.
5. **Colour is never the only signal** (selected size, stock, error) **[OFFICIAL — NN/g]**.

## 3. Change protocol — how Shilpi ships a visual change safely [HOUSE]

```
1. State the hypothesis   "Bigger price line → fewer 'price koto?' WhatsApp questions, same add-to-bag rate"
2. Picture sheet          before/after at 320/393/440, Bengali labels → owner picks (owner rule: 2–3 pictures)
3. Squint test + gate     blur screenshot; device gate 0/240; contrast table passes
4. Ship behind a switch   old version kept as a switch (nothing deleted)
5. Measure 2+ weeks       primary: delivered orders per session; guard: add-to-bag rate, bag→checkout, refusals for "not as expected"
6. Keep / roll back       decision written to worklog + lesson if learned
```
A/B testing needs enough traffic; at low volume use before/after with the guard metrics and say honestly that it is weaker evidence (Sawdagor S01 testing discipline).

## 4. Evidence check — "sticky add-to-cart always wins"?
A CRO agency's own published mobile test of a sticky add-to-cart (Clean Commit) reports add-to-cart **up** but conversion rate, AOV and revenue per visitor **down**, labelled **inconclusive**, with no sample size or significance given **[COMMUNITY — single vendor case study]**. Lesson: a pattern that raises a **micro-metric** can lower **orders**. EXTAS keeps its bottom buy bar (owner-approved), but any change to it is judged on delivered orders, not taps.

## 5. Review checklist
- [ ] Blur test: photo, buy button, price are the three focal points — nothing else competes
- [ ] ≤ 3 type sizes on the first screen (excluding the price), ≤ 2 filled colours
- [ ] Buy colour used only for the buy action
- [ ] Delivery charge + door/exchange rule next to the buy section
- [ ] Selected/OOS/error states readable without colour
- [ ] Change shipped behind a switch with a written hypothesis and guard metrics

## 6. Worked example — combo card in the category grid
- Problem: "Combo ৳1,890 — Save ৳310" badge in red, price in red, title in red → three focal points, card reads as an ad.
- Fix: photo of the set (P04) dominant; price in ink 600 weight; saving line in body size green-ink "৳310 সাশ্রয়" (contrast ≥ 4.5 : 1); one "Combo" badge; tap target is the whole card.

---

**Sources** (type in brackets):
- [Official/research — NN/g] Visual hierarchy in UX — definition: https://www.nngroup.com/articles/visual-hierarchy-ux-definition/
- [Vendor case study] Clean Commit, mobile bottom sticky add-to-cart A/B test: https://cleancommit.io/ab-tests/mobile-bottom-sticky-add-to-cart-button/
- [Internal] skills/sawdagor/01, 05, 06 (banner blindness 27%, honest pricing, Fabrilife lessons); blueprint PDP_FIT; lessons/ALL.md

*As of October 2026.*
