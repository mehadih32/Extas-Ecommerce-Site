# U06 · Motion, micro-interaction and reduced motion

*Shilpi শিল্পী · A360-05 · ux module 6 of 10 · level: Post-graduate · version 1.0 · as of October 2026*

---

## 1. Rules from the standards

- `prefers-reduced-motion` has two values: `no-preference` and **`reduce`**; `@media (prefers-reduced-motion)` = reduce **[OFFICIAL — MDN]**.
- It maps to OS settings: **iOS Settings › Accessibility › Motion**; Android 9+ **Remove animations**; Windows 11 **Animation effects**; macOS Reduce motion **[OFFICIAL — MDN]**.
- Common vestibular triggers: **scaling or panning large objects**. Under reduce: remove, reduce or **replace** (e.g. a scale becomes a dissolve) **[OFFICIAL — MDN]**.
- WCAG 2.3.3 Animation from Interactions (**AAA**): motion triggered by interaction can be disabled unless essential. Motion = movement, size, position or depth change; **colour and opacity changes don't count**. Techniques: C39 (CSS media query), SCR40 (JS `matchMedia`) **[OFFICIAL — W3C Understanding 2.3.3]**.
- Auto-moving content (hero sliders, marquee promo strip) also falls under WCAG 2.2.2 Pause, Stop, Hide — give it a pause control **[HOUSE — 2.2.2 text not re-read this session; verify the exact wording before quoting it to anyone]**.

**EXTAS adopts 2.3.3 as house standard even though it is AAA [HOUSE].**

## 2. EXTAS motion budget [HOUSE]

| Use | Duration token | Easing | Under `reduce` |
|---|---|---|---|
| Tap feedback (button press, chip select) | `motion.duration.instant` 100 ms | ease-out | keep (opacity/colour only) |
| Small state change (heart fill, tick on size) | `motion.duration.short` 150 ms | ease-out | opacity only |
| Sheet / drawer open | `motion.duration.medium` 250 ms | standard decel | fade, no slide |
| Page-level transitions | none (instant) | — | none |
| Added-to-bag confirmation | 250 ms bag-icon pulse **once** | ease-out | badge count change only |
| Hero/photo carousel | **never auto-advance** on PDP; home hero only with pause | — | no auto-advance |
| Zoom viewer (pinch/double-tap) | follows finger; no extra inertia effects | — | allowed (user-driven, essential) |

Principles:
1. **Motion explains, never decorates** — it shows where something came from or went (sheet from the button, item into the bag).
2. **No layout shift from motion** — animate `transform`/`opacity` only (compositor-friendly), never `height/top` of content above the fold.
3. **Nothing moves while the customer reads the price or chooses size.**
4. **Skeletons, not spinners**, for loads > 300 ms; skeleton shimmer off under reduce.
5. Respect the owner lesson: **the photo must not resize when browser bars slide** (R15 7.2) — that's an unwanted motion; see U08 for `svh`.

## 3. Implementation pattern

```css
:root { --dur-short: 150ms; --dur-medium: 250ms; }
.sheet { transition: transform var(--dur-medium) cubic-bezier(.2,0,0,1), opacity var(--dur-medium); }
@media (prefers-reduced-motion: reduce) {
  .sheet { transition: opacity var(--dur-medium); transform: none !important; }
  .skeleton { animation: none; }
  * { scroll-behavior: auto !important; }
}
```
```js
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
function addedToBag(){ if(!reduce.matches) bagIcon.animate(pulse, 250); updateCount(); }
```
Plus a site setting "Reduce motion" in the account menu for people who don't know the OS setting (W3C 2.3.3 "Gx" technique) **[HOUSE, matches W3C suggestion]**.

## 4. Testing
- Playwright: `page.emulateMedia({ reducedMotion: 'reduce' })` and assert no `transform` transitions on sheets (Prohori R10) **[OFFICIAL — Playwright emulation supports media]**.
- Manual: iPhone with Reduce Motion on — open size chart, zoom, add to bag.

## 5. Worked example — "Added to bag"
- Before: bag drawer slides in from the right, covers the PDP, auto-closes after 3 s (customer loses place).
- After: bag icon count changes + one 250 ms pulse; a toast "ব্যাগে যোগ হয়েছে · দেখুন ›" at the bottom above the buy bar for 4 s, dismissible; under reduce, no pulse.
- Measure: add-to-bag → bag-visit rate and continue-shopping rate (Doot event layer).

---

**Sources** (type in brackets):
- [Official — MDN] prefers-reduced-motion: https://developer.mozilla.org/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion
- [Official — W3C] Understanding SC 2.3.3 Animation from Interactions: https://w3c.github.io/wcag/understanding/animation-from-interactions.html
- [Official — Playwright] Emulation (media, colour scheme): https://playwright.dev/docs/emulation
- [Internal] lessons/shilpi.md (photo must not resize when bars slide)

*As of October 2026.*
