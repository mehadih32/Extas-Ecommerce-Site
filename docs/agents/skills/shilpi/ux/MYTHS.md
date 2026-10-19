# Shilpi · ux/ · Doesn't work / myths (UI/UX)

| # | Myth | Evidence | Do instead |
|---|---|---|---|
| 1 | "24 px targets are enough — WCAG says so." | 24 × 24 is the **AA minimum** (2.5.8); NN/g recommends ~1 cm; Apple 44 pt, Material 48 dp. Spacing doesn't fix tiny targets (NN/g). | 44 px hit areas for frequent targets (U02). |
| 2 | "The thumb-zone map tells us exactly where to put buttons." | Hoober's 2013 drawings came from an informal sample; he later asked people to ignore them; centre taps are fastest and most accurate. | Primary action in a bottom bar, rare/destructive actions away from it; test (U02). |
| 3 | "`100vh` fills the phone screen." | `vh` ignores the sliding toolbars — too tall on load (web.dev). | `svh` for stable heights, `dvh` only inside overlays (U08). |
| 4 | "`100dvh` is always right." | Dynamic units don't update at 60 fps and change as bars slide — the owner's "photo jolt" (R15 7.2). | `svh` or aspect-ratio for the PDP photo. |
| 5 | "Add `maximum-scale=1` to stop iOS zooming into inputs." | Blocks pinch-zoom on Android — an accessibility failure (MDN quoted by Rick Strahl). | 16 px input text. |
| 6 | "`interactive-widget=resizes-content` fixes the keyboard on all phones." | Chrome 108+ and Firefox 132+ only; not Safari. | Hide the fixed bar while an input is focused; in-flow Continue button (U08). |
| 7 | "Letter-spacing makes Bengali buttons look premium." | Breaks half-form conjuncts in all engines; no workaround (W3C gap #117). | Weight, not tracking; scope tracking to `:lang(en)` (U03). |
| 8 | "Underline is a fine link style for Bengali." | Underline isn't traditional and collides with vowel signs (W3C). | Colour + weight; check offset on screenshots. |
| 9 | "Contrast 4.4 rounds up to 4.5." | Thresholds are not rounded — 4.499 fails (W3C). | Record exact ratios in tokens (U05). |
| 10 | "A sticky add-to-cart always lifts sales." | A published vendor test: add-to-cart up, CR/AOV/RPV down, inconclusive. | Judge on delivered orders, not taps (U10). |
| 11 | "Reduced motion means no animation at all." | Colour/opacity changes don't count as motion (W3C 2.3.3); replace scale/slide with fade (MDN). | Fade-only variants under `reduce` (U06). |
| 12 | "iPad = desktop layout." | Split view/Slide Over make it phone-narrow; touch has no hover. | Content-led breakpoints + `pointer` queries (U07). |
| 13 | "We can disable the iOS edge-swipe back." | No supported web API; it's the browser's Back. | Make every page-like view a real history entry; restore scroll; close sheets on Back (U08). |
| 14 | "Baymard numbers describe Bangladeshi shoppers." | Baymard tests US/EU sites and users. | Use as a failure-mode checklist; measure our own funnel. |
| 15 | "Require the phone number and say nothing — COD needs it anyway." | 14% would never give a phone; 39% of sites don't explain it; fake numbers result (Baymard). | One-line reason under the field (U09). |

Sources: see U01–U10.

*As of October 2026.*
