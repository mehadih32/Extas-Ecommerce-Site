# U02 · Touch targets and thumb zones

*Shilpi শিল্পী · A360-05 · ux module 2 of 10 · level: Graduate · version 1.0 · as of October 2026*

---

## 1. The numbers (and which one EXTAS uses)

| Standard | Minimum | Status | Source |
|---|---|---|---|
| WCAG 2.2 SC 2.5.8 Target Size (Minimum) | **24 × 24 CSS px** (or spacing so a 24 px circle around each target doesn't touch another) | Level **AA** — legal floor | [OFFICIAL — W3C] |
| WCAG 2.2 SC 2.5.5 Target Size (Enhanced) | 44 × 44 CSS px | Level AAA | [2-SRC — W3C via specification.website, disabilityworld] |
| Apple HIG | 44 pt | platform guideline | [2-SRC — two independent summaries; Apple page not fetchable by our tools] |
| Material Design | 48 dp | platform guideline | [2-SRC — same] |
| NN/g | **1 cm × 1 cm** physical (≈ 0.4 in) | research-based recommendation (Parhi, Karlson & Bederson 2006) | [OFFICIAL — NN/g article] |

**EXTAS rule [HOUSE]:** every primary or frequent target (size boxes, colour swatches, Add-to-Bag, qty ±, bag icon, filter chips, bottom-bar buttons) is **≥ 44 × 44 CSS px hit area**. Secondary inline targets (links inside text) may be smaller but must pass 2.5.8 (24 px or spacing exception). The *visible* shape can be smaller than the hit area — pad it with `padding` or a pseudo-element.

Why: 24 px is the accessibility floor, not a comfort target. NN/g notes fingertips are ~1.6–2 cm wide and a thumb's contact area ~2.5 cm (MIT Touch Lab, cited by NN/g), and that **extra spacing does not make up for a tiny target** **[OFFICIAL — NN/g]**.

## 2. Thumb zones — what is actually known

- Hoober (2013, UXmatters): 1,333 observations in public, 780 touching the screen: **49% one-handed, 36% cradled, 15% two-handed** **[OFFICIAL — primary study]**.
- Caveats from the author himself: a snapshot (seconds per person), no device or task recorded, data from 2013; he later asked readers to **ignore his early reach drawings** and reported people touch the **centre** of the screen more, faster and more accurately than corners or edges **[OFFICIAL — same article + author note]**.
- People **shift grip** to reach things; a thumb hides the label it presses.

**So [HOUSE]:**
1. Don't treat the famous green/red "thumb map" as law. The safe claims: centre is easiest; corners (especially top-left on a big phone) cost a grip change; the bottom edge is reachable but crowded by the iOS home indicator (U07 safe areas).
2. Put the **one action that matters** (Add to Bag / Order now / Confirm order) in a **bottom bar**, full-width or near, above `env(safe-area-inset-bottom)`.
3. Put **destructive or rare** actions away from the primary one (not adjacent to Add-to-Bag; "Remove" in the bag is a small text button with an undo).
4. Paired buttons: **side by side** gives more width for error than stacked **[OFFICIAL — NN/g]**; keep ≥ 8 px gap **[HOUSE]**.
5. A label must stay readable **while** pressed — icon + label, label not under the thumb (e.g. qty "2" sits between − and +, not on the button).

## 3. EXTAS target checklist (run at 320 px and 440 px)

- [ ] Size boxes S–3XL: each ≥ 44 px tall; 6 boxes fit one row at 320 px or step down (AUTO ADJUST), never wrap
- [ ] Colour swatches: visible circle may be 28 px, hit area ≥ 44 px; selected state not by colour alone (ring + tick)
- [ ] Header icons (search, WhatsApp, bag): each ≥ 44 × 44 hit area even when the glyph is 22 px
- [ ] Bottom bar buttons clear the home indicator (`padding-bottom: max(12px, env(safe-area-inset-bottom))`)
- [ ] No two tappable things closer than 8 px unless each is ≥ 44 px
- [ ] Carousel dots are not the only way to change photo (swipe + arrows/counter) — dots are tiny targets

## 4. Worked example — qty stepper in the bag at 320 px

- Problem: "−  1  +" drawn at 28 px boxes; mis-taps remove items.
- Fix: buttons 44 × 44 hit area (visual 32 px), number between them, "Remove" moved to a text link at the row's end with a 5-second "Undo" toast.
- Test: Playwright tap at the edge of each hit area at 320×640 (Prohori R10); the owner's gate shows no overlap.

## 5. Common mistakes
- Shrinking targets to "keep one line" — step down the **content**, not the target.
- Relying on hover (doesn't exist on touch).
- Using 24 px as the design target because "WCAG says so" — it's the minimum.

---

**Sources** (type in brackets):
- [Official — W3C] What's new in WCAG 2.2 (2.5.8 Target Size Minimum, 24 px): https://w3.org/WAI/standards-guidelines/wcag/new-in-22/
- [Official/research — NN/g] Touch target size: https://www.nngroup.com/articles/touch-target-size/
- [Primary study] Hoober, How do users really hold mobile devices (UXmatters, 2013): https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php?
- [Reference summary] specification.website, Touch target size (Apple 44 pt, Material 48 dp, WCAG 2.5.5/2.5.8): https://specification.website/spec/accessibility/touch-target-size/

**Not verified directly:** Apple HIG and Material pages could not be fetched by our tools; their numbers are taken from two independent summaries.

*As of October 2026.*
