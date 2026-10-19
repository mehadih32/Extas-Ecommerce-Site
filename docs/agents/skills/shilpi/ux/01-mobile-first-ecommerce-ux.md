# U01 · Mobile-first e-commerce UX — what the research says and how EXTAS applies it

*Shilpi শিল্পী · A360-05 · ux module 1 of 10 · level: Graduate → Post-graduate · version 1.0 · as of October 2026*

---

## 1. The evidence base (read before arguing about any layout)

- Baymard's 2026 mobile benchmark: **150+ leading US/EU sites, 71,000+ elements rated. 75% are "Mediocre"; ~95% are "Mediocre" or "Decent"; only one is "Good", none "Perfect".** These are big-budget sites, so smaller sites probably do worse **[OFFICIAL — Baymard research article]**.
- The ten practices most sites miss (share of sites that *don't* do it) **[OFFICIAL — Baymard]**:

| # | Practice | Sites missing it | EXTAS surface |
|---|---|---|---|
| 1 | Highlight current scope in main navigation | 94% | category menu, breadcrumbs |
| 2 | Adaptive validation error messages (say exactly what is wrong) | 93% | checkout (U09) |
| 3 | Show all colour swatches in list items | 73% | category cards (6 colours per style) |
| 4 | Applied-filters overview above the list | 66% | filter chips |
| 5 | Browse reviews by reviewer photos | 57% | PDP reviews |
| 6 | Address validator at checkout | 54% | gazetteer resolver (PR 550/551) |
| 7 | "View all" at each catalogue level | 42% | category tree |
| 8 | Combine colour variants into one list item | 42% | one card per style, not per colour |
| 9 | Autocorrect misspelled searches | 28% | search (Banglish spellings) |
| 10 | Search submit button next to the field | 27% | header search |

- Wave-1 Sawdagor S04 holds the older mobile figures (62% mediocre or worse in an earlier benchmark). Use the **2026 figure** above from now on; keep S04's rules.
- Baymard and NN/g study US/EU shoppers. For Bangladesh treat them as a **checklist of failure modes**, then measure our own funnel (Doot's analytics layer) **[HOUSE]**.

## 2. Ten rules for every EXTAS customer screen

1. **One style = one card.** Colours live as swatches on the card (all of them, horizontally scrollable with a visible cue), never as six separate cards **[OFFICIAL — Baymard #3, #8]**.
2. **The current place is always visible:** highlighted nav item + breadcrumb + H1 **[OFFICIAL — Baymard #1]**.
3. **Applied filters show as removable chips above results** with a "Clear all" **[OFFICIAL — Baymard #4]**.
4. **Search has a visible submit button** and maps Banglish/misspellings ("panjabi/punjabi", "hodi/hoodie") to the right results **[OFFICIAL — Baymard #9, #10]**.
5. **Errors explain the exact problem**, one message per failure type (U09) **[OFFICIAL — Baymard #2]**.
6. **Address is validated, not just typed** — the gazetteer resolver shows the band it found as a one-tap-editable chip **[HOUSE, matches Baymard #6]**.
7. **AUTO ADJUST, never wrap:** step down full → short → icon, or hide; one line stays one line on all 15 gate sizes **[HOUSE — lessons/ALL.md]**.
8. **Back returns to the exact previous page and scroll position** (U08 §3) **[HOUSE — R15 7.1, 12.2]**.
9. **Phone first:** design at 360 px, then check 320 and 440; tablets and desktop are layouts of the same system (U07) **[HOUSE]**.
10. **Never take a customer out of a combo to a single PDP** **[HOUSE — R15 5.1]**.

## 3. Decision tree — "should this element be on the phone screen?"

```
Does it help the shopper choose, trust or pay?
├─ no  → remove (or a switch, off by default — owner rule: nothing is deleted)
└─ yes → Is it needed before Add-to-Bag?
         ├─ yes → first screen budget (PDP_FIT); one line; ≥ 44 px tap height
         └─ no  → below the fold, or behind a labelled row ("Size chart ›", "Delivery & exchange ›")
```

## 4. Worked EXTAS example — category card for a polo in 6 colours

- Before: 6 cards (one per colour), first 4 look identical at 360 px, colour name missing.
- After: 1 card; photo of the best-selling colour; swatch row with all 6 (scrolls if needed, last swatch half-visible as the cue); tap a swatch → card photo switches; name + price on one line each; "Combo available" badge only if a combo contains the style.
- Measure: gate at 0 failures on 15 sizes; click-through to PDP and colour-switch taps logged.

## 5. Checklist (Shilpi reviews every page Sawdagor builds)

- [ ] One card per style; all swatches visible or scrollable with a cue
- [ ] Current scope highlighted; breadcrumb; real H1
- [ ] Filter chips above results; "Clear all"
- [ ] Search submit button; misspelling map tested with 5 Banglish terms
- [ ] Error messages specific (U09 table)
- [ ] Address band chip visible and editable
- [ ] Back = same page, same scroll (U08 test)
- [ ] Device gate 0/240, screenshots looked at

---

**Sources** (type in brackets):
- [Research — Baymard] Mobile e-commerce UX 2026 benchmark findings: https://baymard.com/blog/mobile-ux-ecommerce
- [Research — Baymard] Mobile benchmark launch (method, 2015): https://baymard.com/blog/mobile-ecommerce-benchmark
- [Internal] lessons/ALL.md (AUTO ADJUST, back behaviour, combo rule); master register PR 550/551; skills/sawdagor/04-mobile-first-ux.md

*As of October 2026.*
