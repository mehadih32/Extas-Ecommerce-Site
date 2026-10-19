# U08 · iOS Safari quirks — toolbar resize, 100dvh, keyboard, edge-swipe back, overscroll, input zoom

*Shilpi শিল্পী · A360-05 · ux module 8 of 10 · level: Post-graduate · version 1.0 · as of October 2026*

All browsers on iPhone use WebKit, so these apply to Chrome-on-iPhone too (Chrome's own docs say its Android-only viewport options don't apply on iOS) **[OFFICIAL — Chrome for Developers]**.

---

## 1. Toolbar resize and viewport units [OFFICIAL — web.dev]

- `vh` ignores the sliding toolbars: on load (toolbars expanded) a `100vh` block is **taller than the visible area**.
- `svh` = viewport with toolbars **expanded** (small); `lvh` = toolbars **retracted** (large); `dvh` = switches between them as the toolbars move.
- **Dynamic values do not update at 60 fps** — browsers throttle/debounce them.
- Support: Safari 15.4, Firefox 101, Chrome/Edge 108.

**EXTAS rule [HOUSE — from owner lesson R15 7.2 "photo must not resize when bars slide"]:**

| Element | Unit | Why |
|---|---|---|
| PDP photo / hero height | **`svh`** (or a fixed aspect ratio 4:5) | stable; never jolts while scrolling |
| Full-screen zoom viewer, AI chat sheet | `dvh` | must exactly fill the visible screen; brief resize is acceptable inside an overlay |
| Anything below the fold | content height | no viewport unit needed |

Fallback order: `height: 100vh; height: 100svh;` (old browsers take the first).

## 2. On-screen keyboard [OFFICIAL — Chrome for Developers; HTMHell]

- Safari resizes **only the visual viewport**; the layout viewport, `vh/dvh` and `position: fixed` stay put — so a **fixed bottom bar can be covered by the keyboard**.
- `interactive-widget=resizes-content` in the viewport meta works in **Chrome 108+ and Firefox 132+, not Safari**.

**EXTAS rule [HOUSE]:** on checkout steps with text inputs, **hide the fixed buy bar while an input has focus** and show an in-flow "Continue" button right after the last field; or use `visualViewport` resize events to lift the bar (test on a real iPhone — emulation can't show this).

## 3. Edge-swipe back, bfcache and scroll [OFFICIAL — web.dev bfcache; HOUSE rules]

- Swiping from the left edge is the browser's **Back**. There is no supported way for a web page to turn it off — so design for it **[HOUSE]**: every screen that looks like a "page" (PDP, combo builder, bag, checkout step) must be a real history entry, and Back must land on the exact previous page at the same scroll (owner lesson R15 7.1, 12.2).
- The back-forward cache restores the page from memory. `pageshow` fires with **`event.persisted === true`** on restore → refresh stale data (stock, bag count, signed-in state) there **[OFFICIAL — web.dev]**.
- Things that hurt bfcache: `unload` handlers (use `pagehide`), `Cache-Control: no-store` on pages that aren't sensitive, open connections not closed in `pagehide` **[OFFICIAL — web.dev]**. On mobile, Safari attempts to cache pages even with `unload` listeners but won't run them reliably **[OFFICIAL — web.dev]**.
- Sheets/modals that the customer would "back out of" (size chart, zoom, filter) should close on Back instead of leaving the page: push a history state on open, close on `popstate` **[HOUSE]**.
- SPA scroll: save scroll per history entry before navigating; restore after content renders, not before (images with width/height set so the height is right) **[HOUSE]**.

## 4. Overscroll and pull-to-refresh

- WebKit bug 244232 (fixed, committed Jan 2023): `overscroll-behavior: none` used to be ignored on pages too short to scroll **[OFFICIAL — WebKit Bugzilla]**. The Safari release that shipped it was not stated — test on the oldest iOS we support.
- **Owner rule:** never stop the browser's own behaviours (pull-to-refresh, bounce) without putting them back (R15 6.1). So: `overscroll-behavior: contain` **only on inner scrollers** (filter sheet, chat, swatch row) to stop scroll chaining; **never on `html/body`** **[HOUSE]**.
- Body scroll lock for modals must be removed on close, and must not leave `position: fixed` on body (that jumps the page to top) — store and restore `scrollY` **[HOUSE]**.

## 5. Input zoom [2-SRC — Rick Strahl blog + common practice in the prototype]

- iOS **auto-zooms when an input's rendered font size is < 16 px**. Fix: inputs at **16 px or more**.
- **Don't** fix it with `maximum-scale=1`: on Android Chrome/Firefox that blocks pinch-zoom — an accessibility failure (the blog quotes MDN: "any value less than 3 fails accessibility").

## 6. iPhone test script (real device or BrowserStack-class; Playwright WebKit is not iOS Safari — see Prohori R10)

1. Load PDP; scroll down and up slowly → photo height must not change (svh).
2. Tap size chart → Back gesture → sheet closes, PDP same scroll.
3. PDP → combo → swipe back → PDP at same scroll; bag count fresh.
4. Checkout: focus phone field → keyboard up → nothing important hidden; no zoom.
5. Pull down at top of home → native refresh still works.
6. Rotate to landscape → notch side clear; state kept.
7. Repeat with Settings › Accessibility › Motion › Reduce Motion on.

---

**Sources** (type in brackets):
- [Official — web.dev] The large, small and dynamic viewport units: https://web.dev/blog/viewport-units
- [Official — Chrome for Developers] Viewport resize behaviour, interactive-widget, iOS default: https://developer.chrome.com/blog/viewport-resize-behavior
- [Practitioner — HTMHell advent 2024] interactive-widget support (Chrome 108+, Firefox 132+, not Safari): https://htmhell.dev/adventcalendar/2024/4/
- [Official — web.dev] Back/forward cache: https://web.dev/articles/bfcache
- [Official — WebKit Bugzilla] Bug 244232 overscroll-behavior on non-scrollable page: https://bugs.webkit.org/show_bug.cgi?id=244232
- [Practitioner blog] Rick Strahl, iOS input auto-zoom: https://weblog.west-wind.com/posts/2023/Apr/17/Preventing-iOS-Textbox-Auto-Zooming-and-ViewPort-Sizing
- [Internal] lessons/ALL.md + lessons/shilpi.md (back, pull-to-refresh, photo jolt)

*As of October 2026.*
