# Shilpi শিল্পী · A360-05 · ux/ — senior UI/UX playbooks (curriculum wave 2, PR 579)

Load order before any customer-facing design task: skills/shilpi/README.md → this README → task modules → MYTHS.md →
lessons/ALL.md + lessons/shilpi.md. Imported generic skills stay in `ext/`; these EXTAS modules win where they disagree.
Photo work stays in `photo/` (wave 1).

| # | File | Topic | Level |
|---|---|---|---|
| U01 | 01-mobile-first-ecommerce-ux.md | Baymard 2026 mobile benchmark, ten EXTAS screen rules, "should this be on the phone screen" tree | Grad → PG |
| U02 | 02-touch-targets-thumb-zones.md | WCAG 2.5.8 vs 44 pt/48 dp vs NN/g 1 cm; what thumb-zone research really says | Grad |
| U03 | 03-bengali-latin-typography.md | Hind Siliguri / Noto Sans Bengali facts, W3C Bengali rules, no letter-spacing, type scale, font loading | PG |
| U04 | 04-accessibility-wcag22.md | WCAG 2.2 new criteria, contrast, modal focus (APG), AA checklist | Grad → PG |
| U05 | 05-design-system-tokens.md | DTCG format 2025.10, three-tier EXTAS tokens, owner-editable semantic tokens | PG → PhD |
| U06 | 06-motion-reduced-motion.md | prefers-reduced-motion, WCAG 2.3.3, EXTAS motion budget | PG |
| U07 | 07-responsive-tablets-safe-areas.md | content-led breakpoints, iPad, container/pointer queries, safe areas, viewport-fit | PG |
| U08 | 08-ios-safari-quirks.md | svh/dvh, keyboard, edge-swipe back + bfcache, overscroll, input zoom, iPhone test script | PG |
| U09 | 09-checkout-forms-bd.md | phone-first form, BD number rules, Bengali digit normalisation, address entry, errors | PG |
| U10 | 10-conversion-safe-hierarchy.md | NN/g hierarchy limits, PDP rank order, safe change protocol | PG → PhD |
| — | MYTHS.md | 15 myths with evidence | all |
| — | **EXAM.md** | **24 items + answer key, pass 85% (21/24)** | — |

## Confidence tags
**[OFFICIAL]** standards body / platform / primary research (W3C, MDN, web.dev, Baymard, NN/g, WebKit) · **[2-SRC]** two
independent good sources agree · **[HOUSE]** EXTAS rule from owner lessons and blueprint (revisable by data) ·
**[COMMUNITY — test before use]** single practitioner/vendor claim. Only the first three are rules (PR 585 gate).

## Source types used
Standards (W3C WCAG 2.2, WAI-ARIA APG, W3C Bengali layout/gap docs, W3C DTCG) · platform docs (MDN, web.dev, Chrome for
Developers, Playwright, WebKit Bugzilla) · UX research (Baymard, NN/g, Hoober/UXmatters) · font registries (Fontsource) ·
practitioner (Rick Strahl, HTMHell, Firtman, specification.website) · vendor case study (Clean Commit) · reference
(Wikipedia) · EXTAS internal (lessons, blueprint, prototype CSS).

## Pages our tools could not read (not used as sources)
Apple Human Interface Guidelines (layout, device sizes) · Material Design accessibility page · NN/g touch target page on
first attempt (read later via search result). Numbers from Apple/Material come from two independent summaries.

## Owner decisions raised by this wave
1. **One font family or two?** Hind Siliguri for both Bengali and Latin (simpler, one download) vs Archivo for Latin + Hind Siliguri for Bengali (current look). Shilpi recommends keeping Archivo for Latin and adding Hind Siliguri for Bengali — pictures to follow.
2. **Tablet sizes in the device gate** — PR 570 note 21 already requires 5 tablets (iPad mini, iPad Air, iPad Pro 11, iPad Pro 12.9, Android tab); the owner only needs to confirm portrait **and** landscape for each (doubles gate time).
3. **"Reduce motion" switch** in the customer account menu (default follows the phone setting).

*As of October 2026.*
