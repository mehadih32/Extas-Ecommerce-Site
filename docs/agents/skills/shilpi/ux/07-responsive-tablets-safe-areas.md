# U07 · Responsive breakpoints (incl. iPad), safe areas and viewport-fit

*Shilpi শিল্পী · A360-05 · ux module 7 of 10 · level: Post-graduate · version 1.0 · as of October 2026*

---

## 1. Viewport widths we design for

Phones — the owner's device gate: **15 sizes from 320×640 to 440×956** (qa/devices.json) **[HOUSE]**.

Tablets — public reference widths (CSS px, portrait) **[COMMUNITY — Firtman's viewport notes, last updated Sep 2022; newer iPads not listed]**:

| Device group | Width |
|---|---|
| iPad / iPad Air / iPad mini (older generations) | 768 |
| iPad Pro (generic entry) | 1024 |

Newer iPads (10th gen, Air 11"/13", Pro 11"/13", mini 7th gen) were **not verified** this session — Apple's HIG layout page could not be fetched.

**Already the standard [HOUSE — master register PR 570, note 21]:** every non-backend checklist point must pass on 8 phone sizes, **5 tablet sizes (iPad mini, iPad Air, iPad Pro 11, iPad Pro 12.9, Android tab)** and desktop. **Action:** Prohori takes the exact CSS sizes for these five from Playwright's device registry or real devices and records the source of each size in `qa/devices.json`.

## 2. EXTAS breakpoints — content-led, not device-led [HOUSE]

| Range (CSS px) | Name | Layout |
|---|---|---|
| < 360 | `xs` | phone, tightest AUTO ADJUST steps (short labels / icons) |
| 360–599 | `phone` | 2-column product grid, bottom buy bar |
| 600–899 | `tablet-portrait` | 3-column grid; PDP gallery + info **stacked**; bottom buy bar kept |
| 900–1199 | `tablet-landscape / small laptop` | 4-column grid; PDP 2-column (gallery left, info right); buy button in info column (sticky), no bottom bar |
| ≥ 1200 | `desktop` | max content width ~1280; side filters |

Rules:
1. Breakpoints come from **where the content breaks** (price line no longer fits one line, grid card < ~160 px), not from a device list. Check the table against screenshots and move a breakpoint if content says so.
2. **Use container queries for components** (product card, size row) so a card behaves the same in a 2-col phone grid and a 4-col desktop grid **[HOUSE]**.
3. **Pointer, not width, decides hover behaviour:** `@media (hover:hover) and (pointer:fine)` for hover effects; iPads with touch get tap behaviour even at 1024 px **[HOUSE; MDN pointer media feature referenced by spec summary]**.
4. iPad split view and Slide Over make the viewport phone-narrow — never assume "iPad = wide".
5. Orientation change must keep the selected size/colour and scroll position.

## 3. Safe areas and `viewport-fit` [OFFICIAL — MDN env()]

- `env(safe-area-inset-top|right|bottom|left)` = distance from the viewport edge to the area not covered by notches, rounded corners or system UI; **0 on a plain rectangle**; can change as dynamic UI appears. `safe-area-max-inset-*` exist as the maximum values.
- Fallback syntax: `env(safe-area-inset-bottom, 0px)`; names are **case-sensitive**.
- Baseline widely available since Jan 2020 **[OFFICIAL — MDN]**.
- On iOS the insets apply to your layout only after opting in with `viewport-fit=cover` in the viewport meta **[2-SRC — MDN page note + the prototype's own working implementation in r12-pdp.css]**.

EXTAS meta (already in the prototype):
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```
Never add `maximum-scale=1` or `user-scalable=no` (blocks zoom — accessibility failure; U08).

### Patterns
```css
.buy-bar   { position: sticky; bottom: 0;
             padding: 12px 16px max(12px, env(safe-area-inset-bottom, 0px)); }
.site-head { padding-top: env(safe-area-inset-top, 0px); }
.page      { padding-left: max(16px, env(safe-area-inset-left, 0px));
             padding-right: max(16px, env(safe-area-inset-right, 0px)); } /* landscape notch */
body.has-bnav { padding-bottom: calc(var(--bar-h) + env(safe-area-inset-bottom, 0px)); }
```
- Landscape iPhone: left/right insets matter (notch side) — the prototype must be checked in landscape too.
- Background colours should extend under the insets; **content and tap targets** stay inside.

## 4. Checklist
- [ ] Gate: 15 phone sizes + agreed tablet sizes (portrait and landscape), 0 failures
- [ ] Buy bar clears the home indicator on Face-ID iPhones; no double padding on Android
- [ ] Landscape: nothing under the notch; 16 px gutters respected
- [ ] Hover-only affordances absent on touch (pointer media query)
- [ ] Split-view iPad width behaves like a phone layout
- [ ] Orientation change keeps state and scroll

## 5. Worked example — PDP on iPad Air landscape
- Before: phone layout stretched — giant 1-column photo, bottom bar across 1180 px, size boxes 200 px wide.
- After (900–1199 rule): gallery 55% left, info 45% right; buy button sticky in info column; size boxes keep 44–56 px; bottom bar hidden; photo zoom unchanged.

---

**Sources** (type in brackets):
- [Official — MDN] env() — safe-area-inset-*, fallback, baseline: https://developer.mozilla.org/en-US/docs/Web/CSS/env
- [Practitioner reference] Maximiliano Firtman, viewport sizes notes (updated Sep 2022): https://firt.dev/notes/viewports
- [Reference summary] specification.website touch target page (links MDN pointer media feature): https://specification.website/spec/accessibility/touch-target-size/
- [Internal] qa/devices.json (15-size gate), proto-backup/src/r12-pdp.css (viewport-fit + safe-area implementation)

**Not verified:** Apple HIG device-size table (blocked); current-generation iPad CSS widths.

*As of October 2026.*
