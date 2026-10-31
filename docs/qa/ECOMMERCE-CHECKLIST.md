# EXTAS — E-commerce QA checklist (master)

Every point is one test. Run it, then mark it:
✅ pass · ❌ fail (see the QA report for the bug number) · — not testable in the demo yet (needs the real backend, a real phone, or a real network) · ⬜ not run this round.

Devices for every round: phones 320×640, 360×800, 375×667, 393×852 (iPhone 15/16 Pro), 430×932, 440×956 (Pro Max) with touch; desktop 1280×800 and 1440×900; plus a real iPhone (Safari and the Claude app) and a real Android (Chrome) before launch.

**R15 totals: 405 points — ✅ 209 · ❌ 54 · — 48 · ⬜ 94 (not run this round).**

**After R15 wave 1 (Prohori, build `r16.html`): 405 points — ✅ 297 · ❌ 12 · — 58 · ⬜ 38 (not run yet — for the QA rerun).** The ❌ left are: real contact/social data the owner must give (code ready), and two points where the checklist disagrees with an owner rule (L27 slider snap, P11 second Add).

**R15 wave 2 (Prohori, build `r16b-qa-snapshot.html`): all 22 R15b fails fixed and measured with the R15b tools — awaiting the QA re-check. Still open: 10 owner-data points (🔒) and 2 owner decisions (⚖ L27, P11).**

**R15b (independent QA rerun, build `proto/dist/r16-qa-snapshot.html`, 2026-10-19): 405 points — ✅ 313 · ❌ 22 · 🔒 10 blocked on owner data · ⚖ 2 owner decision · — 58 backend / real device.** Each line now shows the R15 mark, then **R15b**. Non-backend points: 347; passing 313. Report: `QA-REPORT-R15b.md`. Legend: 🔒 code ready, needs the owner's real value; ⚖ owner ruling, not a bug.

**R15c (independent re-check after fix wave 2, build `proto/dist/r16b-qa-snapshot.html`): 405 points — ✅ 334 · ❌ 1 · 🔒 10 blocked on owner data · ⚖ 2 owner decision · — 58 backend / real device.** Each line now reads R15 → **R15b** → **R15c**. Non-backend points: 347; passing 334. Section "R15c" in `QA-REPORT-R15b.md`.

**R15d (final regression, build `proto/dist/r16c-qa-snapshot.html`): 405 points — ✅ 337 · ❌ 0 · 🔒 10 blocked on owner data · ⚖ 0 owner decision · — 58 backend / real device.** L27 and P11 are no longer open decisions: the owner answered and both behaviours pass. Each line reads R15 → R15b → R15c → **R15d**. Non-backend points: 347; passing 337; the rest are the 10 owner-data points. Outside the checklist, one new feature fails: old product links do not forward on the shop (R15d bug 18). Section "R15d" in `QA-REPORT-R15b.md`.

Marks below are from **QA round R15** (build `proto/dist/qa-snap.html`, 2026-10-19). Bug numbers point at `QA-REPORT-R15.md`.

---

## 1. Navigation & history

### 1a. Back / forward
- [N01] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Browser Back from any page returns to the page before it (one step, never two). *(browser Back/Forward alone are correct (desktop run, 14/14 steps))* *(R15b: journeys J4a–d on 20 sizes (8 phones, 10 tablet, 2 desktop) + fixer nav suite on 393/1280/iPad mini)* *(R15d: J4 on 20 sizes after the parseHash split; fixer nav suite ALL OK 393/1280)*
- [N02] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Browser Forward after a Back returns to the page you came back from. *(browser Back/Forward alone are correct (desktop run, 14/14 steps))* *(R15b: journeys J4a–d on 20 sizes (8 phones, 10 tablet, 2 desktop) + fixer nav suite on 393/1280/iPad mini)*
- [N03] ✅ · **R15b ❌ → R15 wave 2 ✅** · **R15c ✅** · **R15d ✅** (bug 1 fixed — see QA-REPORT-R15b "Fixed (R15 wave 2)"; for the QA re-check) Edge swipe back (iPhone) from any page returns to the page before it. *(R15b bug 1: touch tablets ≥1024 px wide (iPad landscape, iPad Pro 12.9 both ways, Android tab landscape) — the shop's edge swipe is switched off (99-boot.js:261); phones + tablet portrait pass. Confirm Safari's own swipe on a real iPad)* *(R15c: edge swipe goes back on all 6 wide touch tablets (J4 swipe))*
- [N04] ✅ · **R15b ❌ → R15 wave 2 ✅** · **R15c ✅** · **R15d ✅** (bug 1 fixed — see QA-REPORT-R15b "Fixed (R15 wave 2)"; for the QA re-check) A slow edge swipe (finger held 0.7–1.5 s) still goes back. *(R15 wave 1: bug 13 fixed — 1.1–1.5 s swipe goes back)* *(R15b bug 1: touch tablets ≥1024 px wide (iPad landscape, iPad Pro 12.9 both ways, Android tab landscape) — the shop's edge swipe is switched off (99-boot.js:261); phones + tablet portrait pass. Confirm Safari's own swipe on a real iPad)* *(R15c: fixed with bug 1 (swipe on wide tablets); phones unchanged)*
- [N05] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Edge swipe back never goes back two pages. *(R15 wave 1: bug 4 fixed — late native back undone)* *(R15b: journeys J4a–d on 20 sizes (8 phones, 10 tablet, 2 desktop) + fixer nav suite on 393/1280/iPad mini)*
- [N06] ✅ · **R15b ❌ → R15 wave 2 ✅** · **R15c ✅** · **R15d ✅** (bug 1 fixed — see QA-REPORT-R15b "Fixed (R15 wave 2)"; for the QA re-check) Edge swipe back on a page with a photo slider goes back (does not just move the photo). *(R15b bug 1: touch tablets ≥1024 px wide (iPad landscape, iPad Pro 12.9 both ways, Android tab landscape) — the shop's edge swipe is switched off (99-boot.js:261); phones + tablet portrait pass. Confirm Safari's own swipe on a real iPad)* *(R15c: fixed with bug 1)*
- [N07] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** After an edge swipe back, the browser Back button still goes further back (not forward). *(R15 wave 1: bug 2 fixed)* *(R15b: journeys J4a–d on 20 sizes (8 phones, 10 tablet, 2 desktop) + fixer nav suite on 393/1280/iPad mini)*
- [N08] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** After an edge swipe back, the browser Forward button returns to the page you left. *(R15 wave 1: bug 2 fixed)* *(R15b: journeys J4a–d on 20 sizes (8 phones, 10 tablet, 2 desktop) + fixer nav suite on 393/1280/iPad mini)*
- [N09] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Backspace (outside a text field) goes back one page.
- [N10] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Backspace inside a text field deletes a character and never leaves the page.
- [N11] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Alt+← goes back; Alt+→ goes forward.
- [N12] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Back with a popup open closes the popup first and stays on the page. *(R15 wave 1: bug 11 fixed)*
- [N13] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Back from the first page of the visit never shows a blank page. *(R15 wave 1: measured — first page stays in the shop)* *(R15b: first visit — Back closes the welcome sheet, next Back leaves to the referrer; with the sheet seen one Back leaves)*
- [N14] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Back/forward repeated 10+ times across 8 pages never shows a blank page. *(R15b: journeys J4a–d on 20 sizes (8 phones, 10 tablet, 2 desktop) + fixer nav suite on 393/1280/iPad mini)*
- [N15] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Back/forward repeated never skips a page. *(R15 wave 1: bug 2 fixed)* *(R15b: journeys J4a–d on 20 sizes (8 phones, 10 tablet, 2 desktop) + fixer nav suite on 393/1280/iPad mini)*
- [N16] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** The shop never jumps to Home by itself after a back/forward (wait 3 s, no touch). *(R15b: journeys J4a–d on 20 sizes (8 phones, 10 tablet, 2 desktop) + fixer nav suite on 393/1280/iPad mini)*
- [N17] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Back from the thank-you page does not re-place the order or show a filled checkout.
- [N18] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Back from checkout returns to the bag with the bag unchanged.
- [N19] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Back from a product reached from search returns to the same search results.
- [N20] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Back from a product reached from a filtered/sorted category keeps the filter and sort.
- [N21] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Opening a popup (menu, search, size finder) does not add a history step that needs an extra Back.
- [N22] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Changing colour/size on a product does not add history steps (Back leaves the product).
- [N23] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Category → product → header bag icon → bag → back lands on the product. *(R15b: journeys J4a–d on 20 sizes (8 phones, 10 tablet, 2 desktop) + fixer nav suite on 393/1280/iPad mini)*
- [N24] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** …→ back again lands on the category. *(R15b: journeys J4a–d on 20 sizes (8 phones, 10 tablet, 2 desktop) + fixer nav suite on 393/1280/iPad mini)*
- [N25] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** …→ forward returns to the product. *(R15 wave 1: bug 2 fixed)* *(R15b: journeys J4a–d on 20 sizes (8 phones, 10 tablet, 2 desktop) + fixer nav suite on 393/1280/iPad mini)*
- [N26] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Back still works after a pull-to-refresh. *(R15 wave 1: bug 12 fixed)* *(R15b: J5 reload on product → back lands on the category (20 sizes))*
- [N27] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Back still works after a full page reload (F5). *(R15 wave 1: bug 12 fixed)* *(R15b: J5 reload on product → back lands on the category (20 sizes))*

### 1b. Scroll position
- [N28] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Home → scroll to footer → tap Contact → back lands at the footer position, not the top. *(R15 wave 1: bug 1 fixed — y 5922→5922)* *(R15b: footer→Contact→back y kept (e.g. 5997→5997 @393, 6142 @320); category grid y kept after back and after forward on 20 sizes)*
- [N29] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Category scrolled to row 4 → product → back returns to row 4 (same product on screen). *(R15 wave 1: bug 1 fixed — 900→900)* *(R15b: footer→Contact→back y kept (e.g. 5997→5997 @393, 6142 @320); category grid y kept after back and after forward on 20 sizes)*
- [N30] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Search results scrolled → product → back keeps the scroll. *(kept 500 px — by browser luck, no code does it (see bug #1))*
- [N31] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Journal scrolled → article → back keeps the scroll. *(R15 wave 1: bug 1 fixed (per-entry scroll))* *(R15d: blog not re-run here (separate blog QA agent))*
- [N32] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Bag scrolled → product → back keeps the scroll. *(R15 wave 1: bug 1 fixed (per-entry scroll))*
- [N33] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Forward to a page you had scrolled restores that scroll too. *(R15 wave 1: bug 1 fixed — forward 900→900)* *(R15b: footer→Contact→back y kept (e.g. 5997→5997 @393, 6142 @320); category grid y kept after back and after forward on 20 sizes)*
- [N34] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** A NEW page (tapped link) always opens at the top.
- [N35] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Scroll restore lands on the final spot directly (no visible jump from top, no "slide down"). *(R15 wave 1: bug 1 fixed — restored in the render task)* *(R15b: footer→Contact→back y kept (e.g. 5997→5997 @393, 6142 @320); category grid y kept after back and after forward on 20 sizes)*
- [N36] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Changing size/colour/quantity on a page keeps the scroll where it is.
- [N37] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Opening and closing a popup keeps the page scroll where it was. *(R15 wave 1: measured — scroll 700→700)*

### 1c. Gestures, refresh, deep links, 404
- [N38] ✅ · **R15b ❌ → R15 wave 2 ✅** · **R15c ✅** · **R15d ✅** (bug 1 fixed — see QA-REPORT-R15b "Fixed (R15 wave 2)"; for the QA re-check) Pull-to-refresh at the top of Home reloads and stays on Home. *(R15b bug 1: no pull-to-refresh at all on touch tablets ≥1024 px (09-ptr.js:26 + overscroll-behavior-y:none); 8 phones + 4 tablet-portrait sizes pass on 11 page types)* *(R15c: pull-to-refresh on 11 page types on all 6 wide tablets; still none on desktop)*
- [N39] ✅ · **R15b ❌ → R15 wave 2 ✅** · **R15c ✅** · **R15d ✅** (bug 1 fixed — see QA-REPORT-R15b "Fixed (R15 wave 2)"; for the QA re-check) Pull-to-refresh works at the top of: category, product, combo, set builder, bag, checkout, thank-you, account, order, help page, journal, search, landing, admin. *(R15b bug 1: no pull-to-refresh at all on touch tablets ≥1024 px (09-ptr.js:26 + overscroll-behavior-y:none); 8 phones + 4 tablet-portrait sizes pass on 11 page types)* *(R15c: as N38)*
- [N40] ✅ · **R15b ❌ → R15 wave 2 ✅** · **R15c ✅** · **R15d ✅** (bug 1 fixed — see QA-REPORT-R15b "Fixed (R15 wave 2)"; for the QA re-check) Pull-to-refresh shows "Pull to refresh" → "Release to refresh" → "Refreshing…". *(R15b bug 1: no pull-to-refresh at all on touch tablets ≥1024 px (09-ptr.js:26 + overscroll-behavior-y:none); 8 phones + 4 tablet-portrait sizes pass on 11 page types)* *(R15c: "Release to refresh" shown on wide tablets)*
- [N41] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** A short pull (below the line) does not reload. *(R15b: J6 on 12 touch sizes; desktop shows no indicator)*
- [N42] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Pulling while scrolled down just scrolls (no refresh). *(R15b: J6 on 12 touch sizes; desktop shows no indicator)*
- [N43] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Pulling inside a popup/menu does not refresh the page. *(R15b: J6 on 12 touch sizes; desktop shows no indicator)*
- [N44] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Refresh keeps the bag, the login and the page you were on. *(R15b: J6 on 12 touch sizes; desktop shows no indicator)*
- [N45] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Pull-to-refresh never appears on desktop. *(R15b: J6 on 12 touch sizes; desktop shows no indicator)*
- [N46] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Every page opened directly from a pasted link (deep link) renders fully. *(R15d: 126 routes × 20 sizes render (incl. new brand products, #/admin/naming). Old product links: see R15d bug 18)*
- [N47] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** A deep link to a product with ?finder=1 opens the size finder once.
- [N48] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** An unknown address shows a friendly "Page not found" with a way home.
- [N49] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** A product/combo/order/landing that does not exist shows "not found", never a crash or blank.
- [N50] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Home has no blank history step before it (Back from Home stays in the shop or leaves cleanly). *(R15 wave 1: measured)* *(R15b: first visit — Back closes the welcome sheet, next Back leaves to the referrer; with the sheet seen one Back leaves)*
- [N51] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Page transitions have no jolt: main content position is stable 0/300/800/1500 ms after every navigation. *(R15 wave 1: bug 10 fixed — header 0 px, CLS 0)*
- [N52] — · **R15b —** · **R15c —** · **R15d —** No "slide down from the top" movement after landing on a page. *(no slide seen in Chromium; needs a real iPhone (WebKit not installed))*

## 2. Layout & responsiveness
- [L01] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** No page scrolls sideways at 320 px. *(R15b: 123 routes × 20 sizes, 0 sideways scroll)*
- [L02] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** No page scrolls sideways at 360, 375, 393, 430, 440 px. *(R15b: 123 routes × 20 sizes, 0 sideways scroll)*
- [L03] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** No page scrolls sideways at 1280 and 1440 px. *(R15b: 123 routes × 20 sizes, 0 sideways scroll)*
- [L04] ✅ · **R15b ❌ → R15 wave 2 ✅** · **R15c ✅** · **R15d ✅** (bug 4 fixed — see QA-REPORT-R15b "Fixed (R15 wave 2)"; for the QA re-check) Nothing sticks out past the right edge on any phone width. *(demo-only 'Demo controls' tab pokes past 1280 px (bug #22))* *(R15b bug 4: exchange step bar 16 px past both screen edges on phones + tablet portrait (Next button cut))* *(R15c: exchange bar 0…W, buttons 16 px in on phones and tablet portrait; hidden on desktop layout (side summary))*
- [L05] ✅ · **R15b ❌ → R15 wave 2 ✅** · **R15c ✅** · **R15d ✅** (bug 5, 6 fixed — see QA-REPORT-R15b "Fixed (R15 wave 2)"; for the QA re-check) Text is never cut off mid-word inside buttons, pills or price rows. *(R15 wave 1: measured (sweep, 12 sizes))* *(R15b bugs 5 + 6: combo colour-pair chips cut mid-word (ct-tee-trio 15/20 sizes, ct-polo-trio); footer WhatsApp/Hotline labels overflow their buttons at ≥1024 px and overlap at 1024)* *(R15c: combo pair chips no longer cut (ct-tee-trio, ct-polo-trio, 20 sizes); footer WhatsApp/Hotline labels fit at every width; only "…" ellipsis left)*
- [L06] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Rotating a phone to landscape keeps every page usable (no overflow, bars fit). *(R15b: every route swept in tablet portrait AND landscape (10 tablet sizes) + 393 rotation probe)*
- [L07] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Rotating back to portrait restores the layout without a reload. *(R15b: every route swept in tablet portrait AND landscape (10 tablet sizes) + 393 rotation probe)*
- [L08] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** The browser toolbar hiding/showing while scrolling does not move the page content (no jolt). *(R15b: toolbar hide/show 0 px movement on 6 page types)*
- [L09] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** No layout shift after the page has drawn (CLS < 0.1 per page, ideally < 0.02). *(R15b: no page over CLS 0.02 in 2460 route checks)*
- [L10] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Late web fonts do not make text jump. *(R15 wave 1: measured — first-load CLS ≤ 0.001)*
- [L11] — · **R15b —** · **R15c —** · **R15d —** Images reserve their space before they load (no jump when they appear). *(needs real photos / a real iPhone)*
- [L12] — · **R15b —** · **R15c —** · **R15d —** iPhone safe areas: bottom bars clear the home indicator (viewport-fit=cover + env()). *(needs real photos / a real iPhone)*
- [L13] — · **R15b —** · **R15c —** · **R15d —** iPhone safe areas: nothing hides under the notch / Dynamic Island in landscape. *(needs real photos / a real iPhone)*
- [L14] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** The sticky header stays put while scrolling and never covers the page title after a jump.
- [L15] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** The bottom nav / buy bar never covers the last item on the page. *(R15 wave 1: measured — bottom room = bar height)* *(R15b: last content never under a bottom bar (2460 route checks))*
- [L16] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** The buy bar on the product page is always fully on screen (never half sunk).
- [L17] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Only one sticky bottom bar shows at a time (buy bar OR bottom nav, not stacked).
- [L18] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Desktop: content has a max width and does not stretch edge-to-edge at 1440. *(R15 wave 1: measured — 1240 max)*
- [L19] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Desktop: hover states exist on links, cards and buttons. *(R15 wave 1: measured — 96 hover rules)*
- [L20] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Grids drop to 2 columns on phones, 3–4 on desktop, with even gaps. *(R15 wave 1: measured — 2 / 4 columns)*
- [L21] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** The page has no rubber-band that drags fixed bars off screen.
- [L22] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Zoom (pinch) is allowed; text stays readable at 200 % zoom. *(R15b: viewport allows zoom)*
- [L23] — · **R15b —** · **R15c —** · **R15d —** Dark mode (if offered) has no white flashes or unreadable text. *(needs real photos / a real iPhone)*
- [L24] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Every page has a minimum height (footer never floats mid-screen on short pages).
- [L25] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Popups fit the screen at 320×640 and scroll inside themselves. *(R15 wave 1: measured)*
- [L26] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Popups on iPhone do not let the page behind scroll. *(R15b: menu open, page scroll stays 500)*
- [L27] ❌ · **R15b ⚖** · **R15c ⚖** · **R15d ✅** Horizontal carousels scroll with a swipe and snap cleanly. *(R15 wave 1: conflicts with the owner's rule "every slider drifts on its own" (SMOOTH turns snap off) — owner decision needed)* *(R15b: owner ruling — sliders drift on their own, no snap (not a bug))* *(R15d: owner answer implemented — after a hand drag the row glides to the nearest card edge (0 px off), 0 direction reversals (no jitter), holds 4 s, then drifts on; touch on phones/tablets, mouse on desktop)*
- [L28] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Carousels do not drag the whole page sideways.
- [L29] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Long product names wrap cleanly on 320 px cards. *(R15 wave 1: measured)*
- [L30] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Bengali text (taller glyphs) fits the same boxes without clipping.
- [L31] ✅ · **R15b ❌ → R15 wave 2 ✅** · **R15c ✅** · **R15d ✅** (bug 13 fixed — see QA-REPORT-R15b "Fixed (R15 wave 2)"; for the QA re-check) Every page keeps the 16 px side gutter on phones (text never touches the screen edge). *(R15 wave 1: bug 15 fixed — 16 px)* *(R15b bug 13: #/size-guide page heading and text at 0 px from the edge on all 8 phones)* *(R15c: #/size-guide 16 px gutter on all phones)*

## 3. Header, footer, menus
- [H01] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Logo tap goes Home from every page.
- [H02] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Bag icon shows the correct item count and updates instantly after add/remove.
- [H03] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Bag icon tap opens the bag.
- [H04] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Search icon opens search with the keyboard up.
- [H05] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Menu (phone) opens, lists every category, and closes with ✕, backdrop tap, Esc and Back. *(R15 wave 1: bug 11 fixed)*
- [H06] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Menu links go to the right pages and the menu closes after tapping.
- [H07] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Wishlist heart shows when there is room and never overlaps the logo.
- [H08] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Account icon goes to login when logged out, account when logged in.
- [H09] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** WhatsApp icon in the header opens WhatsApp with a prefilled message (product named on a product page). *(R15b: J9 on 20 sizes — prefilled, names product + SKU, opens new tab (number itself = M01))*
- [H10] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Desktop nav highlights the current section. *(R15 wave 1: fixed + measured (product page marks its category))*
- [H11] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Announcement bar text is short, readable and not cut.
- [H12] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Footer → Help → "Size guide" opens the height/weight size finder (not a product page). *(R15 wave 1: bug 5 fixed)* *(R15b: J8 on 20 sizes — finder opens over the current page, gives a size)*
- [H13] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Footer → Contact opens the contact page.
- [H14] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Footer → Careers opens a careers page (not Contact). *(R15 wave 1: bug 6 fixed — #/page/careers)*
- [H15] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Footer → Track my order opens order tracking (asks to log in if needed).
- [H16] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Footer → Delivery, Exchange & returns, FAQ, Privacy, Terms each open their own page.
- [H17] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Footer → "Ways to pay" opens a payment page (not Terms). *(R15 wave 1: bug 6 fixed — #/page/payment)*
- [H18] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Footer → Journal opens the journal. *(R15d: blog not re-run here (separate blog QA agent))*
- [H19] ❌ · **R15b 🔒** · **R15c 🔒** · **R15d 🔒** Footer social links open the real social pages (not Home). *(R15 wave 1: bug 6: fixed in code (links from settings, empty = hidden); needs the owner's real social page addresses)* *(R15b: BLOCKED-NEEDS-OWNER-DATA — code ready, needs the social page links)*
- [H20] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Footer phone-number signup raises the number pad and validates the number.
- [H21] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Footer hotline is a tap-to-call link.
- [H22] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Footer shows payment marks (bKash, Nagad, Visa, Mastercard, COD).
- [H23] ❌ · **R15b 🔒** · **R15c 🔒** · **R15d 🔒** Footer shows DBID and trade licence numbers (real numbers before launch). *(R15 wave 1: code ready (SITE dbid / tradeLicence, hidden when empty); needs the real numbers (bug 9))* *(R15b: BLOCKED-NEEDS-OWNER-DATA — code ready, needs the DBID + trade licence numbers)*
- [H24] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Bottom nav (phone) highlights the current tab and every tab works.
- [H25] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Footer link columns line up and have tap targets ≥ 44 px tall. *(R15 wave 1: fixed — 44 px rows)*

## 4. Search
- [SR01] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Searching "polo" shows polo products.
- [SR02] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** A search with no results shows a friendly empty state with suggestions.
- [SR03] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** An empty search does not crash and shows suggestions or popular items.
- [SR04] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Search is not case-sensitive.
- [SR05] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Search tolerates a typo ("pollo", "panjbi"). *(R15 wave 1: bug 8 fixed — pollo 9, panjbi 1)* *(R15b: J10 on 20 sizes — pollo 9, panjbi 1, hoddie 2, shrit 2, oxfrod, chinos, tshirt all > 0)*
- [SR06] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Search finds by Bengali word (পোলো, পাঞ্জাবি).
- [SR07] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Search finds by colour ("navy polo").
- [SR08] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Search suggestions appear while typing. *(R15 wave 1: measured)*
- [SR09] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Search can answer help questions (delivery, exchange, size).
- [SR10] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** The search term stays in the box on the results page.
- [SR11] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** The results page address can be shared (#/search?q=…).
- [SR12] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Back from a result returns to the results at the same scroll.
- [SR13] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Pressing Enter / the keyboard's Search key submits. *(R15 wave 1: measured)*
- [SR14] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** The search input raises a keyboard with a "Search" key (type=search / enterkeyhint).
- [SR15] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Special characters (<script>, %, &) in the search do not break the page.

## 5. Category / listing
- [C01] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Every category in the menu opens and shows products.
- [C02] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Product cards show photo, name, price in ৳ and colour count.
- [C03] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Sale price shows the old price struck through. *(R15 wave 1: measured)*
- [C04] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Sort (price low→high, high→low, new) reorders correctly. *(R15b: low→high and high→low sorted through the UI (393, 1280))*
- [C05] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Filters (size, colour, price) narrow the list and show a count.
- [C06] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Clearing filters restores the full list. *(R15 wave 1: measured)*
- [C07] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** A filter combination with no products shows an empty state with "Clear filters". *(R15 wave 1: measured)*
- [C08] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Filter/sort choices survive Back from a product.
- [C09] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Filter/sort are in the address (shareable) or at least kept for the session.
- [C10] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Out-of-stock items are marked or moved to the end. *(R15 wave 1: measured)*
- [C11] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Wishlist heart on a card saves without opening the product.
- [C12] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Tapping anywhere on the card photo or name opens the product.
- [C13] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** Long lists load more (paging or "show more") without losing the scroll. *(R15b: whole category on one page (25 cards ≥ 20 products) — no paging needed at this catalogue size)*
- [C14] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** The category page has a title and a short description.
- [C15] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** An empty category shows an empty state (not a blank grid). *(R15 wave 1: measured)*
- [C16] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** The category page has no layout shift as images load.
- [C17] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Category banners (offers, sets) link to working pages. *(R15 wave 1: measured)*
- [C18] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Category FAQ / SEO text opens and closes. *(R15 wave 1: measured)*
- [C19] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** "New in" lists the newest items. *(R15 wave 1: measured)*
- [C20] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Card prices match the product page prices.
- [C21] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** The filter sheet fits 320×640 and its Apply button is always reachable. *(R15 wave 1: measured — Apply on screen at 320)*
- [C22] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Chip rows scroll sideways without dragging the page.

## 6. Product page
- [P01] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** The product page shows name, price (৳), colour, sizes, add to bag, and photos above the fold on a phone.
- [P02] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Photo gallery swipes left/right on a phone.
- [P03] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Gallery arrows/dots/thumbnails show which photo is on. *(R15 wave 1: measured)*
- [P04] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Photo zoom (tap or pinch) works and closes. *(R15 wave 1: measured)* *(R15b: J7 zoom opens full screen, swipes, closes by ✕/Esc/Back (20 sizes))*
- [P05] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Choosing a colour changes the photos and the name of the colour. *(R15 wave 1: measured)*
- [P06] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Choosing a size marks it selected.
- [P07] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Out-of-stock sizes are shown crossed out and cannot be added.
- [P08] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Low stock shows "only N left".
- [P09] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Add to bag without a size asks for a size (no silent failure).
- [P10] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Add to bag with a size adds exactly one item and updates the bag count.
- [P11] ❌ · **R15b ⚖** · **R15c ⚖** · **R15d ✅** Adding twice increases quantity (or adds a line) — never loses the first. *(R15 wave 1: second "Add" says "already in your bag" by design (no accidental doubles) — owner decision needed)* *(R15b: open owner decision — second Add of the same size says 'already in your bag' (built on purpose))* *(R15d: owner answer implemented as setting bag.duplicateAdd — "block" (default): "Already in your bag — size S (1)"; "qty": "now 2 in your bag" (qty 2). Both verified)*
- [P12] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** After adding, a confirmation shows with "View bag" and "Keep shopping".
- [P13] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** "Order now" / buy now goes straight to checkout with that item. *(R15 wave 1: measured)*
- [P14] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Size chart opens, shows cm/inch, and closes. *(R15b: J8 size chart with cm and inch (20 sizes))*
- [P15] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Find my size (height + weight) recommends a size and can select it.
- [P16] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** The recommended size is remembered for other products. *(R15 wave 1: measured)*
- [P17] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Price shows the sale price and the saving when on sale. *(R15 wave 1: measured)*
- [P18] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Delivery charge and delivery time are shown on the page.
- [P19] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** COD and exchange promise are shown near the buy button. *(R15 wave 1: measured)*
- [P20] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Fabric, GSM, fit and care details are present. *(R15 wave 1: measured)*
- [P21] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Reviews show stars, count and real-looking text; empty state if none.
- [P22] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Questions & answers open. *(R15 wave 1: measured)*
- [P23] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** "Pairs well with" / combo upsell links work. *(R15 wave 1: measured)*
- [P24] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Recently viewed shows the last products. *(R15 wave 1: measured)*
- [P25] — · **R15b —** · **R15c —** · **R15d —** Share / copy link works. *(R15 wave 1: Share is switched off by the owner (SHOWN.pdpIcons.share) — kept)*
- [P26] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Wishlist heart on the product page toggles and shows a message. *(R15 wave 1: measured)*
- [P27] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** WhatsApp "ask about this" names the product and SKU.
- [P28] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** The sticky buy bar appears and its button works.
- [P29] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** The selected size/colour is kept after Back and Forward to the same product.
- [P30] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** A one-size item (socks, belt) does not ask for a size.
- [P31] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Product page loads with no layout shift.
- [P32] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Product URL with an unknown id shows "not found".
- [P33] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Swiping the gallery does not trigger edge-swipe back unless it starts at the edge.
- [P34] — · **R15b —** · **R15c —** · **R15d —** Photo alt text names the product and colour. *(demo uses drawn placeholders, no photos)*
- [P35] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Price never shows NaN, undefined or ৳0.

## 7. Combos & sets
- [CB01] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Each combo page opens and lists the items in the set.
- [CB02] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** The combo price and the saving vs buying separately are correct. *(R15b: Polo Duo ৳1,500 vs ৳1,700 = save ৳200; Office Trio ৳3,100 vs ৳3,850 = save ৳750 — page matches)*
- [CB03] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** Every item in the combo needs a size before adding. *(R15b: Add with a size missing → 'Pick a size for item 1', nothing added; pair CTA says 'Choose a size')*
- [CB04] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** The size finder can fill sizes for all items at once. *(R15b: finder filled L/32/L for all 3 items)*
- [CB05] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** Adding a combo puts one set line in the bag with the set price. *(R15b: one set line at ৳1,500; combo journey J3 on 20 sizes)*
- [CB06] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** Changing a size inside a set in the bag keeps the set price. *(R15b: bag 'Change size or colour' L,L→S,S keeps ৳1,500 (fixed combo) and ৳1,800 (auto pair S→M))* *(R15c: B5 (default) — set sizes change in the bag row, ৳1,800 kept; with 3+ sets the ▸ (44×44) opens the row and size change keeps ৳4,500; "Change" link inside the card and in ?btpl=current)*
- [CB07] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** Build-your-own set: picking items updates the running price. *(R15b: running price ৳1,500→৳2,000/৳1,500→৳2,950/৳2,100; Add disabled at 1 item, enabled at 2)*
- [CB08] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** Build-your-own set: the "add" button is disabled until the set is complete. *(R15b: running price ৳1,500→৳2,000/৳1,500→৳2,950/৳2,100; Add disabled at 1 item, enabled at 2)*
- [CB09] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** Combo with an out-of-stock item explains what to do. *(R15b: sold-out size → 'Size M is sold out in Navy. Pick another size or colour…', nothing added)*
- [CB10] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Combo page has no layout shift and no horizontal scroll at 320.
- [CB11] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Unknown combo id shows "not found".
- [CB12] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Back from a combo step returns to the previous page (steps are not history entries). *(R15 wave 1: measured)*

## 8. Bag
- [B01] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Empty bag shows an empty state with a "Shop" button.
- [B02] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Each line shows photo, name, colour, size, quantity, price.
- [B03] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Quantity + / − updates the line and the totals instantly.
- [B04] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Quantity cannot go below 1 (removing is a separate action) or above stock.
- [B05] ⬜ · **R15b ❌ → R15 wave 2 ✅** · **R15c ✅** · **R15d ✅** (bug 9 fixed — see QA-REPORT-R15b "Fixed (R15 wave 2)"; for the QA re-check) Changing size in the bag works and re-checks stock. *(R15b bug 9: a single-item bag line has no size or colour change (only sets have 'Change size or colour') — owner to confirm if intended)* *(R15c: bag line size select (sold-out XXL disabled), L→XL works, one line kept (20 sizes))*
- [B06] ⬜ · **R15b ❌ → R15 wave 2 ✅** · **R15c ✅** · **R15d ✅** (bug 9 fixed — see QA-REPORT-R15b "Fixed (R15 wave 2)"; for the QA re-check) Changing colour in the bag works. *(R15b bug 9: a single-item bag line has no size or colour change (only sets have 'Change size or colour') — owner to confirm if intended)* *(R15c: bag line colour select, navy→black works (20 sizes))*
- [B07] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Remove shows "Undo"; Undo restores the line in the same place.
- [B08] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** Save for later moves the line out of the totals; it can be moved back. *(R15b: Move to wishlist takes it out of totals; Move to bag puts it back (৳850))*
- [B09] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Subtotal = sum of lines; total = subtotal − discounts + delivery.
- [B10] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Delivery band (Dhaka / outside) and free-delivery threshold are shown.
- [B11] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** "Add ৳X for free delivery" is correct and updates.
- [B12] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** Offer codes apply, show the saving, and can be removed. *(R15b: BDAY200 added, shown, removed; bag explains VIP 15% beats it)*
- [B13] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** A wrong offer code shows a clear error.
- [B14] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** An out-of-stock line blocks checkout with a clear message. *(R15b: 'Fix your bag to continue' block, checkout button disabled, Confirm refuses)*
- [B15] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** The bag survives a reload and a new tab.
- [B16] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** The bag count in the header matches the bag.
- [B17] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Checkout button is always reachable (sticky on phones).
- [B18] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** Two sizes of the same item asks "for someone else?" (owner rule). *(R15b: L + XL of one polo → 'Is one for someone else?' with two buttons)*
- [B19] — · **R15b —** · **R15c —** · **R15d —** Send bag on WhatsApp works. *(R15 wave 1: Send bag on WhatsApp is switched off by the owner (SHOWN.bag.waSendBag) — kept)*
- [B20] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Bag page has no jolt when quantity changes.
- [B21] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Bag totals never show NaN or negative numbers.
- [B22] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Bag lines link back to their product page.

## 9. Checkout
- [CO01] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Checkout with an empty bag shows an empty state, not a form.
- [CO02] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Name, phone and address fields have labels.
- [CO03] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Phone field raises the number pad (type=tel / inputmode).
- [CO04] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Phone accepts 01XXXXXXXXX, +8801…, 8801… and spaces/dashes.
- [CO05] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Phone rejects too short / wrong operator numbers with a clear message.
- [CO06] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Address field accepts Bengali text.
- [CO07] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Address picks the delivery zone (inside / outside Dhaka) and updates the charge.
- [CO08] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Delivery charge, discount and total are correct and match the bag.
- [CO09] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Cash on Delivery is the default and is clearly explained. *(R15d: COD default; "Try it on in front of the rider" line on product, checkout and help pages (EN + BN))*
- [CO10] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** bKash / Nagad / card options show (and say what happens next).
- [CO11] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Submitting with a missing field scrolls to it and says what to write.
- [CO12] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Pressing Enter in a field does not place the order. *(R15 wave 1: bug 3 fixed)*
- [CO13] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Double-tapping "Confirm order" places only one order.
- [CO14] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** After placing, the bag is empty and the thank-you page shows.
- [CO15] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** A returning customer's name/phone/address are prefilled. *(R15b: name/phone prefilled; 2 saved addresses offered and pickable)*
- [CO16] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** Saved addresses can be picked. *(R15b: name/phone prefilled; 2 saved addresses offered and pickable)*
- [CO17] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** The order summary can be opened/collapsed on phones.
- [CO18] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Quantity can be changed or a line removed from checkout. *(R15 wave 1: measured)*
- [CO19] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Order note is optional and saved with the order. *(R15 wave 1: measured)*
- [CO20] — · **R15b —** · **R15c —** · **R15d —** Marketing opt-in is unticked by default. *(R15 wave 1: owner ruling — kept ticked (bug 7))* *(R15d: owner ruling — two consent ticks now: SMS ticked, WhatsApp unticked (both stored per order and on the account))*
- [CO21] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Checkout header is slim (no distractions) with a way back to the bag.
- [CO22] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** "Need help?" WhatsApp is reachable on checkout.
- [CO23] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Checkout keeps typed details after a reload / pull-to-refresh. *(R15 wave 1: bug 14 fixed)*
- [CO24] — · **R15b —** · **R15c —** · **R15d —** Checkout keyboard does not cover the focused field on iPhone. *(needs a real phone keyboard / real gateway / server)*
- [CO25] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Autofill (name, tel, street-address) works.
- [CO26] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** The confirm button shows the total to pay.
- [CO27] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** Wallet credit can be applied and shown. *(R15b: wallet tick takes ৳350 off (৳1,402→৳1,052), confirm button follows)*
- [CO28] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Checkout has no horizontal scroll at 320 px.
- [CO29] — · **R15b —** · **R15c —** · **R15d —** Real payment gateway success/fail/cancel return pages work. *(needs a real phone keyboard / real gateway / server)*
- [CO30] — · **R15b —** · **R15c —** · **R15d —** Server re-checks stock and price at order time. *(needs a real phone keyboard / real gateway / server)*

## 10. Thank-you, order tracking, invoice
- [T01] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Thank-you page shows the order number, items, total and delivery estimate.
- [T02] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Thank-you page explains what happens next (call/SMS, courier).
- [T03] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Order number can be copied.
- [T04] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Refreshing the thank-you page keeps showing the order.
- [T05] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** An unknown order id on thanks/order shows "not found".
- [T06] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Order page shows a status timeline.
- [T07] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Order page shows the courier and tracking number.
- [T08] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Invoice opens, prints and downloads.
- [T09] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** Invoice totals match the order. *(R15b: invoice total = order total = checkout total, line count matches, download works (J1/J2 on 20 sizes))*
- [T10] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** The customer can edit size before the order ships (owner rule). *(R15b: size L→S before packing (1 of N edits); no Edit button once shipped)*
- [T11] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** Exchange request flow opens from a delivered order and respects the window. *(R15b: from delivered order, 51 h left, steps work; 30-day-old order says window closed)*
- [T12] — · **R15b —** · **R15c —** · **R15d —** SMS / WhatsApp confirmation is sent. *(needs SMS / backend)*
- [T13] — · **R15b —** · **R15c —** · **R15d —** Track my order without logging in (phone + order number). *(needs SMS / backend)*
- [T14] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** Review request appears after delivery. *(R15b: 'Rate & review' on delivered lines opens the review sheet)*

## 11. Account
- [A01] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Login with phone + password works for the demo customer.
- [A02] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Wrong password shows a clear error (no page change).
- [A03] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Login phone field raises the number pad.
- [A04] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Show/hide password works. *(R15 wave 1: measured)*
- [A05] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Forgot password explains the next step (OTP).
- [A06] — · **R15b —** · **R15c —** · **R15d —** OTP login/sign-up by SMS. *(needs SMS / backend)*
- [A07] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Account home shows orders, wishlist, addresses, profile.
- [A08] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Orders list shows each order with status and total.
- [A09] ⬜ · **R15b ❌ → R15 wave 2 ✅** · **R15c ✅** · **R15d ✅** (bug 10 fixed — see QA-REPORT-R15b "Fixed (R15 wave 2)"; for the QA re-check) Wishlist shows saved items and lets you add to bag or remove. *(R15b bug 10: wishlist shows items + remove, but no 'Add to bag')* *(R15c: wishlist cards have "Add to bag" (size pick) and Remove; tool now scans the whole page (old build re-checked: no Add to bag there))*
- [A10] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Wishlist works logged out (saved on this phone) and merges on login.
- [A11] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** Addresses can be added and removed. *(R15b: add second address, save, remove)*
- [A12] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** Profile name / password can be changed. *(R15b: name saved; password rule checked; password change is a demo toast (real change = backend))*
- [A13] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** My size is saved and used on product pages. *(R15 wave 1: measured)*
- [A14] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Logout logs out and returns to a sensible page.
- [A15] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Account pages need login (redirect to login, then back to the page asked for). *(R15 wave 1: measured)*
- [A16] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Account tabs are real addresses (#/account/orders) and Back moves between them.
- [A17] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Referral code / wallet balance shows.
- [A18] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Account page has no horizontal scroll at 320.
- [A19] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Language switch is in the account/menu and remembered.
- [A20] — · **R15b —** · **R15c —** · **R15d —** Delete my account / data request is possible. *(needs SMS / backend)*

## 12. Messages & WhatsApp
- [M01] ❌ · **R15b 🔒** · **R15c 🔒** · **R15d 🔒** WhatsApp links use a real number in international format (wa.me/8801…). *(R15 wave 1: needs the real WhatsApp number in DB.whatsapp (bug 9))* *(R15b: BLOCKED-NEEDS-OWNER-DATA — code ready, needs the real WhatsApp number (DB.whatsapp = 8801XXXXXXXXX))*
- [M02] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** WhatsApp message is prefilled and names the product/order.
- [M03] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** WhatsApp opens in a new tab/app, the shop stays open.
- [M04] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** The floating WhatsApp button never covers the buy button or bag total. *(R15 wave 1: floating button is off (owner) — nothing covered)*
- [M05] ❌ · **R15b 🔒** · **R15c 🔒** · **R15d 🔒** Hotline is tap-to-call with a real number. *(R15 wave 1: needs the real hotline in DB.hotline (bug 9))* *(R15b: BLOCKED-NEEDS-OWNER-DATA — code ready, needs the real hotline (DB.hotline = 09XXX-XXXXXX))*
- [M06] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Support hours are shown.
- [M07] ❌ · **R15b 🔒** · **R15c 🔒** · **R15d 🔒** Contact page has phone, WhatsApp, email and address. *(R15 wave 1: email/address lines ready, hidden while empty; needs the owner's details (bug 9))* *(R15b: BLOCKED-NEEDS-OWNER-DATA — code ready, needs the support email + street address)*
- [M08] — · **R15b —** · **R15c —** · **R15d —** Facebook Messenger link (if offered) works.

## 13. Performance
- [PF01] — · **R15b —** · **R15c —** · **R15d —** First screen shows in < 2.5 s on a mid phone on 4G. *(needs real hosting / photos / network)*
- [PF02] — · **R15b —** · **R15c —** · **R15d —** Page HTML + JS + CSS is small (< 500 KB compressed for the first page). *(R15 wave 1: code phase — single-file demo (bug 21, owner ruling))*
- [PF03] — · **R15b —** · **R15c —** · **R15d —** Images are WebP/AVIF, sized per screen (srcset), and lazy below the fold. *(needs real hosting / photos / network)*
- [PF04] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Fonts use font-display: swap and are preloaded or self-hosted.
- [PF05] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** No console errors on any page. *(R15b: 0 JS errors in 2460 route checks + all journeys)*
- [PF06] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Navigating between pages draws in < 200 ms. *(R15b: route draw 19–180 ms)*
- [PF07] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Scrolling stays smooth (no heavy work on every scroll event). *(R15 wave 1: measured — 17 ms/frame)*
- [PF08] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** No timers running forever that wake the phone (setInterval). *(R15 wave 1: bug 20 fixed)*
- [PF09] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Infinite CSS animations are few and stop when off screen / reduced motion.
- [PF10] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** The page works on a 4× slower CPU without double navigations. *(R15 wave 1: bug 4 fixed — CPU×4/×8)*
- [PF11] — · **R15b —** · **R15c —** · **R15d —** Caching: repeat visit loads from cache. *(needs real hosting / photos / network)*
- [PF12] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** No layout thrash (forced reflow) loops. *(R15b: 0 long frames, 0 idle layouts on category; 8 ms layout on Home in 2 s)*

## 14. Accessibility
- [AX01] ✅ · **R15b ❌ → R15 wave 2 ✅** · **R15c ✅** · **R15d ✅** (bug 8 fixed — see QA-REPORT-R15b "Fixed (R15 wave 2)"; for the QA re-check) Every tap target is at least 44×44 px (32 px minimum for inline text links). *(R15 wave 1: bug 17 fixed — 0 small targets (QA rule))* *(R15b bug 8: combos breadcrumbs 36×20 (all 20 sizes), bag product name link 19 px tall, set builder swatches 22×22 at ≥768 px, 'See all colours' 29 px at 320/360, admin links)* *(R15c: 0 small targets on combos, pair, bag, set, product, admin routes (20 sizes); B5 ▸ button 44×44)*
- [AX02] ⬜ · **R15b ❌ → R15 wave 2 ✅** · **R15c ❌** · **R15d ✅** (bug 15 fixed — see QA-REPORT-R15b "Fixed (R15 wave 2)"; for the QA re-check) Text contrast ≥ 4.5:1 (body) and ≥ 3:1 (large text, icons). *(R15b bug 15: checkout header step 'Done' 3.41:1 at ≥1024 px (rest of 10 pages clean))* *(R15c: checkout "Done" step fixed (≥1024 clean); tool now measures gradients (account wallet card passes; courier logo badge is decorative/aria-hidden). STILL FAIL: checkout "Need help? WhatsApp us" — green #1FA855 bold 15.5 px on #F3F1EC = 2.79:1 on phones + tablet portrait (r12-acct.css:289-293). Present in the R15b build too (missed by the R15b tool))* *(R15d: checkout "WhatsApp us" now #0F6E37 (passes); 10 pages × 3 sizes clean (decorative aria-hidden courier logos skipped))*
- [AX03] ✅ · **R15b ❌ → R15 wave 2 ✅** · **R15c ✅** · **R15d ✅** (bug 16 fixed — see QA-REPORT-R15b "Fixed (R15 wave 2)"; for the QA re-check) Every icon-only button has a screen-reader name (aria-label). *(R15 wave 1: bug 18 fixed)* *(R15b bug 16: admin blog 'View' link is icon-only on phones, no name)* *(R15c: admin blog View links named on phones)*
- [AX04] — · **R15b —** · **R15c —** · **R15d —** Every image has alt text (empty alt for decoration). *(no real photos yet)*
- [AX05] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Every form field has a visible label tied to it.
- [AX06] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Keyboard Tab reaches every control in order, with a visible focus ring.
- [AX07] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Popups trap focus, close with Esc, and return focus to the opener. *(R15 wave 1: bug 16 fixed)*
- [AX08] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Popups have role=dialog and a name.
- [AX09] ✅ · **R15b ❌ → R15 wave 2 ✅** · **R15c ✅** · **R15d ✅** (bug 14 fixed — see QA-REPORT-R15b "Fixed (R15 wave 2)"; for the QA re-check) Each page has one h1 and a sensible heading order. *(R15 wave 1: bug 19 fixed)* *(R15b bug 14: no h1 on #/combos/<switched-off rule> and #/combo-pair/<unknown>)* *(R15c: one h1 on #/combos/nope and #/combo-pair/nope~x (20 sizes))*
- [AX10] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** The page language is set (lang="en" / "bn").
- [AX11] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Reduced motion: shimmering/sweeping/bouncing animations stop.
- [AX12] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Toasts are announced (role=status).
- [AX13] ⬜ · **R15b ❌ → R15 wave 2 ✅** · **R15c ✅** · **R15d ✅** (bug 7 fixed — see QA-REPORT-R15b "Fixed (R15 wave 2)"; for the QA re-check) Errors are announced and tied to the field (aria-invalid / aria-describedby). *(R15b bug 7: no aria-invalid on any checkout/login field after an error; name error not tied to the field)* *(R15c: checkout name/phone/address get aria-invalid + aria-describedby to the message; login phone/password marked and tied to the alert)*
- [AX14] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Selected size/colour state is exposed (aria-pressed / aria-checked).
- [AX15] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** Text can be enlarged to 200 % without loss. *(R15b: root font 200 % — no sideways scroll on 4 pages; 200 % page zoom = 320 sweep)*
- [AX16] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** Colour is never the only signal (stock, errors). *(R15b: sold-out size struck through + labelled; errors in words)*
- [AX17] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Skip-to-content link exists. *(R15 wave 1: bug 19 fixed)*
- [AX18] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Page title changes on every navigation (announced by screen readers).

## 15. Forms & keyboards
- [F01] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Every phone field opens the number pad.
- [F02] — · **R15b —** · **R15c —** · **R15d —** Email fields open the email keyboard. *(no email fields)*
- [F03] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Search field shows a "Search" key.
- [F04] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Bengali digits (০১৭…) in a phone field are accepted and converted. *(R15 wave 1: bug 8 fixed)*
- [F05] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Pasting a number with spaces/dashes/+880 is cleaned.
- [F06] ✅ · **R15b ❌ → R15 wave 2 ✅** · **R15c ✅** · **R15d ✅** (bug 3 fixed — see QA-REPORT-R15b "Fixed (R15 wave 2)"; for the QA re-check) Inputs are at least 16 px font (no iPhone auto-zoom on focus). *(R15b bug 3: inputs drop to 15 px at ≥1024 px (iPad landscape zooms on focus: checkout, footer, search); admin inputs 13–14 px on phones)* *(R15c: no input under 16 px on any tablet ≥1024 or on admin phone pages (23-route subset × 20 sizes))*
- [F07] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Errors appear next to the field, in plain words.
- [F08] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Typed text is never lost on re-render.
- [F09] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** The keyboard "Next" moves to the next field. *(R15 wave 1: measured — Enter/Next moves on)*
- [F10] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Autocomplete attributes are set (name, tel, street-address, current-password).

## 16. Language (English / Bengali)
- [LG01] ✅ · **R15b ❌ → R15 wave 2 ✅** · **R15c ✅** · **R15d ✅** (bug 12 fixed — see QA-REPORT-R15b "Fixed (R15 wave 2)"; for the QA re-check) The language switch shows its current state. *(R15b bug 12: at 1024–1366 px the demo 'Demo controls' tab sits on the footer EN/বাং switch — taps hit the demo tab (demo-only, remove before launch))* *(R15c: footer EN/বাং switch free and tappable at 1024–1366 (demo tab moved); J2 passes on all wide tablets and 1280)*
- [LG02] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Switching to Bengali changes menus, buttons and headings. *(R15 wave 1: bug 8 fixed (checkout + product labels))*
- [LG03] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** The choice is remembered after reload.
- [LG04] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Prices and numbers stay correct in Bengali (৳ and digits). *(R15 wave 1: measured)*
- [LG05] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Bengali text uses a Bengali font and never shows boxes (tofu).
- [LG06] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Bengali never overflows buttons at 320 px.
- [LG07] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** html lang changes to "bn".
- [LG08] — · **R15b —** · **R15c —** · **R15d —** Product names/descriptions have Bengali versions (or a clear plan).

## 17. Trust & legal
- [TR01] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Privacy policy page exists and is real text.
- [TR02] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Terms page exists and is real text.
- [TR03] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Delivery policy states charges and days for Dhaka and outside.
- [TR04] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Exchange/return policy states the window and conditions.
- [TR05] ❌ · **R15b 🔒** · **R15c 🔒** · **R15d 🔒** Contact page with phone, WhatsApp, email, physical address. *(R15 wave 1: needs the owner's details (bug 9))* *(R15b: BLOCKED-NEEDS-OWNER-DATA — code ready, needs the email + physical address)*
- [TR06] ❌ · **R15b 🔒** · **R15c 🔒** · **R15d 🔒** DBID (Digital Business ID) number shown. *(R15 wave 1: needs the DBID number (bug 9))* *(R15b: BLOCKED-NEEDS-OWNER-DATA — code ready, needs the DBID number)*
- [TR07] ❌ · **R15b 🔒** · **R15c 🔒** · **R15d 🔒** Trade licence number shown. *(R15 wave 1: needs the trade licence number (bug 9))* *(R15b: BLOCKED-NEEDS-OWNER-DATA — code ready, needs the trade licence number)*
- [TR08] ❌ · **R15b 🔒** · **R15c 🔒** · **R15d 🔒** No placeholder text left ([your DBID], 01XXXX, [support email]). *(R15 wave 1: [support email]/[DBID] gone; WhatsApp 8801XXXXXXXXX and hotline 09XXX-XXXXXX remain until the owner gives the numbers (bug 9))* *(R15b: BLOCKED-NEEDS-OWNER-DATA — code ready, needs the WhatsApp 8801XXXXXXXXX and hotline 09XXX-XXXXXX still placeholders)*
- [TR09] — · **R15b —** · **R15c —** · **R15d —** Real reviews only; review photos credited.
- [TR10] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** Payment security marks are honest (only methods actually accepted). *(R15b: footer marks = checkout options = Ways to pay page)*
- [TR11] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** "About / Our story" page exists.
- [TR12] ❌ · **R15b 🔒** · **R15c 🔒** · **R15d 🔒** Social links go to real, active pages. *(R15 wave 1: needs the owner's real social pages (code ready, bug 6))* *(R15b: BLOCKED-NEEDS-OWNER-DATA — code ready, needs the social page links)*

## 18. Analytics & tracking
- [AN01] — · **R15b —** · **R15c —** · **R15d —** Page view fires on every route change (SPA). *(needs real Pixel/GA/CAPI)*
- [AN02] — · **R15b —** · **R15c —** · **R15d —** view_item fires on product pages. *(needs real Pixel/GA/CAPI)*
- [AN03] — · **R15b —** · **R15c —** · **R15d —** add_to_cart fires with product, size, price. *(needs real Pixel/GA/CAPI)*
- [AN04] — · **R15b —** · **R15c —** · **R15d —** begin_checkout fires. *(needs real Pixel/GA/CAPI)*
- [AN05] — · **R15b —** · **R15c —** · **R15d —** purchase fires once (not again on refresh/back). *(needs real Pixel/GA/CAPI)*
- [AN06] — · **R15b —** · **R15c —** · **R15d —** Meta Pixel + Conversions API dedup with event_id. *(needs real Pixel/GA/CAPI)*
- [AN07] — · **R15b —** · **R15c —** · **R15d —** UTM / fbclid kept through to the order source. *(needs real Pixel/GA/CAPI)*
- [AN08] — · **R15b —** · **R15c —** · **R15d —** Search terms are logged. *(needs real Pixel/GA/CAPI)*
- [AN09] — · **R15b —** · **R15c —** · **R15d —** Errors are logged (client error reporting). *(needs real Pixel/GA/CAPI)*
- [AN10] — · **R15b —** · **R15c —** · **R15d —** Consent for tracking is respected. *(needs real Pixel/GA/CAPI)*

## 19. SEO basics
- [SE01] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Every page has a unique, descriptive <title>. *(R15 wave 1: bug 9b fixed — honest titles)*
- [SE02] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Every page has a meta description. *(R15 wave 1: bug 21 — basic meta description)*
- [SE03] — · **R15b —** · **R15c —** · **R15d —** Canonical URLs are set. *(R15 wave 1: code phase (bug 21))*
- [SE04] — · **R15b —** · **R15c —** · **R15d —** Open Graph / WhatsApp preview tags (og:title, og:image) are set. *(R15 wave 1: code phase (bug 21))*
- [SE05] — · **R15b —** · **R15c —** · **R15d —** Product structured data (JSON-LD Product with price in BDT, availability). *(R15 wave 1: code phase (bug 21))*
- [SE06] — · **R15b —** · **R15c —** · **R15d —** Breadcrumb structured data. *(R15 wave 1: code phase (bug 21))*
- [SE07] — · **R15b —** · **R15c —** · **R15d —** Organization / LocalBusiness structured data. *(R15 wave 1: code phase (bug 21))*
- [SE08] — · **R15b —** · **R15c —** · **R15d —** Real URLs (/p/slug) instead of #hash routes, so pages can be indexed. *(R15 wave 1: code phase — hash URLs in the demo (bug 21))*
- [SE09] — · **R15b —** · **R15c —** · **R15d —** sitemap.xml and robots.txt. *(needs real hosting)*
- [SE10] ✅ · **R15b ❌ → R15 wave 2 ✅** · **R15c ✅** · **R15d ✅** (bug 14 fixed — see QA-REPORT-R15b "Fixed (R15 wave 2)"; for the QA re-check) One h1 per page containing the main keyword. *(R15 wave 1: bug 19 — one h1)* *(R15b bug 14: no h1 on #/combos/<switched-off rule> and #/combo-pair/<unknown>)* *(R15c: as AX09)*
- [SE11] — · **R15b —** · **R15c —** · **R15d —** Image alt text is descriptive. *(needs real hosting)*
- [SE12] — · **R15b —** · **R15c —** · **R15d —** 404 pages return a real 404 status. *(needs real hosting)*

## 20. Security & privacy
- [SC01] — · **R15b —** · **R15c —** · **R15d —** The site is HTTPS only. *(needs the real backend)*
- [SC02] — · **R15b —** · **R15c —** · **R15d —** Passwords are never stored in plain text or in the browser. *(needs the real backend)*
- [SC03] — · **R15b —** · **R15c —** · **R15d —** The customer's data is not readable by other customers (order ids not guessable). *(needs the real backend)*
- [SC04] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Text typed by users (search, names, reviews) is escaped (no script injection). *(R15b: injected markup inert in search and checkout; all target=_blank links noopener)*
- [SC05] — · **R15b —** · **R15c —** · **R15d —** Admin is behind a login. *(needs the real backend)*
- [SC06] — · **R15b —** · **R15c —** · **R15d —** OTP / login attempts are rate-limited. *(needs the real backend)*
- [SC07] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** COD fraud checks (phone verified, repeat no-shows flagged). *(R15b: 'Phone check' order flag; refused-parcel counts and exclusion list in Customers)*
- [SC08] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** External links use rel="noopener". *(R15b: injected markup inert in search and checkout; all target=_blank links noopener)*
- [SC09] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** No secrets/API keys in the page source. *(R15 wave 1: measured)*
- [SC10] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Cookie / storage use is explained in the privacy policy. *(R15 wave 1: fixed — privacy page explains on-phone storage)*
- [SC11] — Dependency vulnerability gate green: no high advisory in what ships, no critical in the build tools, every acceptance with a reason and an end date (`tools/dep-audit.mjs`, CI job `deps`; PR 381, added 31 Oct 2026).
- [SC12] — The independent security review is signed off before the payment gateways' live keys are typed in (`docs/security/REVIEW.md`; PR 381, added 31 Oct 2026).

## 21. Offline & slow network
- [OF01] — · **R15b —** · **R15c —** · **R15d —** On a slow network the page shows content progressively (no long white screen). *(needs real network / server)*
- [OF02] — · **R15b —** · **R15c —** · **R15d —** Offline: a clear message instead of a browser error. *(needs real network / server)*
- [OF03] — · **R15b —** · **R15c —** · **R15d —** Placing an order with a dropped connection does not double-order and tells the customer. *(needs real network / server)*
- [OF04] — · **R15b —** · **R15c —** · **R15d —** Images show a placeholder until loaded. *(needs real network / server)*
- [OF05] — · **R15b —** · **R15c —** · **R15d —** Failed image loads show a fallback, not a broken icon. *(needs real network / server)*
- [OF06] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** Fonts failing to load leave readable text. *(R15b: Google Fonts blocked → system font, page readable)*
- [OF07] — · **R15b —** · **R15c —** · **R15d —** The bag is not lost if the network drops. *(needs real network / server)*
- [OF08] — · **R15b —** · **R15c —** · **R15d —** Retry is offered after a failed request. *(needs real network / server)*

## 22. Error handling
- [E01] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** A page that throws shows a friendly message with a way home (never blank).
- [E02] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** No JavaScript errors in the console on any route. *(R15b: 0 JS errors in 2460 route checks + all journeys)*
- [E03] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** Stock changed while in the bag is explained at checkout. *(R15b: Confirm is refused with 'Only 1 left…' and the bag shows the fix (typed details kept); note: nothing warns before Confirm)*
- [E04] ⬜ · **R15b ❌ → R15 wave 2 ✅** · **R15c ✅** · **R15d ✅** (bug 2 fixed — see QA-REPORT-R15b "Fixed (R15 wave 2)"; for the QA re-check) Price changed while in the bag is explained at checkout. *(R15b bug 2: loose item price raised ৳100 after adding — bag and checkout charge the new price with no note)* *(R15c: price stored at add (৳550); after +৳100 bag and checkout say "Price changed from ৳550 to ৳650 — you pay the new price" (20 sizes))*
- [E05] ⬜ · **R15b ❌ → R15 wave 2 ✅** · **R15c ✅** · **R15d ✅** (bug 11 fixed — see QA-REPORT-R15b "Fixed (R15 wave 2)"; for the QA re-check) An expired offer code is explained. *(R15b bug 11: a code whose offer has ended is still accepted (no end-date check))* *(R15c: ended code → "Code OLD100 has expired — it ended on 1 Oct"; an applied code that ends → "has expired, so it is not used" at checkout)*
- [E06] — · **R15b —** · **R15c —** · **R15d —** Server errors (500) show a friendly page. *(needs server)*
- [E07] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Storage blocked / private mode still lets you shop. *(R15 wave 1: measured — storage blocked, no errors)*
- [E08] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Malformed addresses (#/p/, #/c/%%%) do not crash. *(R15 wave 1: fixed + measured (URI malformed crash))*

## 23. Admin basics
- [AD01] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Admin orders list opens and shows orders with status.
- [AD02] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** Order status can be advanced. *(R15b: EX-1042 confirmed→packed from the order sheet)*
- [AD03] ⬜ · **R15b ✅** · **R15c ✅** · **R15d ✅** Flags (address check, phone check, two sizes) show on orders. *(R15b: Address check, 2 sizes, Phone check, Exchange requested flags shown)*
- [AD04] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Rules / offers page opens and saves.
- [AD05] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Size charts page opens and edits.
- [AD06] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Combos page opens.
- [AD07] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Reviews moderation page opens.
- [AD08] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Landing page builder opens. *(R15 wave 1: measured)*
- [AD09] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Analytics page opens. *(R15 wave 1: measured)*
- [AD10] ✅ · **R15b ✅** · **R15c ✅** · **R15d ✅** Admin is usable on a phone (no horizontal scroll at 393). *(R15b: admin routes, 0 sideways scroll on all phones)*
- [AD11] — · **R15b —** · **R15c —** · **R15d —** Admin needs a login (not public). *(needs the real backend)*


## Added 19 Oct 21:12 (owner catch)
| ID | Check | Where |
|---|---|---|
| L32 | Auto-moving sliders stop while the mouse is over them and **start again immediately when the mouse leaves** (no wait, no scroll needed); touch keeps its hold **TA-2 20 Oct: ✅ resumes 54–97 ms after the mouse leaves, also after a drag, a wheel, an arrow click and 20 fast cycles; touch hold unchanged** | all sliders, desktop |
| L33 | Every pause/stop in the interface has a matching resume check (hover, focus, touch, popup, menu, video) with the expected timing **TA-2 20 Oct: ✅ 530 checks, 0 fail (9 info)** | all pages, all devices |
| L33.01 | Slider: mouse over → still; mouse leaves → moving again ≤ 0.5 s *(TA-1 19 Oct: ✅ 56–72 ms, 25 rows)* **TA-2 20 Oct: ✅ 54–88 ms** | every auto-moving row · 1366 en+bn, 1920 |
| L33.02 | Slider: sideways wheel / trackpad on the row, then leave → moving ≤ 0.5 s *(TA-1: ✅)* **TA-2 20 Oct: ✅ 55–97 ms** | every row · desktop |
| L33.03 | Slider: mouse drag released on the row → still while the mouse is over it; leave → moving ≤ 0.5 s *(TA-1: ✅)* **TA-2 20 Oct: ✅ 94 ms** | every row · desktop |
| L33.04 | Slider: mouse drag released off the row → moving ≤ 0.85 s (glide + 0.5 s) *(TA-1: ✅)* **TA-2 20 Oct: ✅ 2–67 ms** | every row · desktop |
| L33.05 | Slider: mouse leaves while the row is still gliding to a card edge → moving ≤ 0.5 s after the glide (no 4 s hold for a mouse) *(TA-1: ❌ 4.0–4.4 s, T1)* **TA-2 20 Oct: ✅ moving 5–51 ms after the glide (T1 fixed)** | every row · desktop |
| L33.06 | Slider: page wheel-scrolled past a row → the row moves ≤ 0.5 s once it is no longer under the cursor *(TA-1: ❌ ~4.0 s, T2)* **TA-2 20 Oct: ✅ 18–45 ms (T2 fixed)** | home, category · desktop |
| L33.07 | Slider: a mouse drag moves every row (category, product, account too) — no browser "ghost" link drag *(TA-1: ❌ T3)* **TA-2 20 Oct: ✅ 25/25 rows follow a 100 px drag, no ghost drag; a drag never opens the card, a plain click does (DR-01/02 9/9) (T3 fixed)** | category, product, account · desktop |
| L33.08 | Slider: 20 fast enter/leave cycles → ends outside: moving; ends inside: still *(TA-1: ✅)* **TA-2 20 Oct: ✅** | every row · desktop |
| L33.09 | Slider: page redraw (heart, quick add, language) under a resting mouse → row stays still *(TA-1: ✅)* **TA-2 20 Oct: ✅** | home, category · desktop |
| L33.10 | Hero: › moves exactly one card; still while the mouse is on the arrow; leaving → moving ≤ 0.5 s, also after a quick flick off the arrow *(TA-1: slow leave ✅ · quick flick ❌ stays stopped, T4)* **TA-2 20 Oct: ✅ quick flick 26–41 ms (T4 fixed)** | home · desktop |
| L33.11 | Hero arrows fade in on hover and out on leave — also after they were clicked *(TA-1: ❌ stay visible, T5)* **TA-2 20 Oct: ✅ opacity 0 after leave (T5 fixed)** | home · desktop |
| L33.12 | Hero: keyboard focus on a slide → still; focus leaves → moving after the 1.5 s grace *(TA-1: ✅ 1.52 s)* **TA-2 20 Oct: ✅ 1.52 s** | home · desktop |
| L33.13 | Phone: tap → 4 s hold (3.8–4.6 s) then drift; swipe → glide to card, hold, drift (3.9–5.0 s); a tap never leaves the hover flag on *(TA-1: ✅ 4.03–4.10 s)* **TA-2 20 Oct: ✅ tap 4.04–4.07 s · swipe ~4.24 s** | home, category, product, thanks, account · phone |
| L33.14 | Mega menu: opens 100–260 ms after the mouse rests on an item; a brief pass never opens it *(TA-1: ✅ 160–167 ms)* **TA-2 20 Oct: ✅ 153–176 ms** | header · desktop en+bn |
| L33.15 | Mega menu: leave item or panel → closes 200–360 ms; item → panel stays open; next item switches at once *(TA-1: ✅ 264–290 ms)* **TA-2 20 Oct: ✅ 280–291 ms** | header · desktop |
| L33.16 | Mega menu: Esc closes with focus on the item; click outside closes; a link click leaves no open panel on the new page *(TA-1: ✅)* **TA-2 20 Oct: ✅** | header · desktop |
| L33.17 | Mega menu: 20 fast cycles → closed and stays closed (or open when ending on the item); Space opens, focus out closes *(TA-1: ✅)* **TA-2 20 Oct: ✅** | header · desktop |
| L33.18 | Header motion stops after 3 rounds; hover restarts it; leaving stops it again *(TA-1: ✅ WhatsApp disc, bag)* **TA-2 20 Oct: ✅** | header · desktop |
| L33.19 | WhatsApp tip: shows ~0.18 s on hover, clears ≤ 0.4 s on leave, also after a click; icon labels after the 0.25 s delay, none left after 20 fast passes *(TA-1: ✅)* **TA-2 20 Oct: ✅** | header · desktop |
| L33.20 | Card hover: back view + quick add show; leave clears both; 20 fast cycles leave nothing showing *(TA-1: ✅)* **TA-2 20 Oct: ✅** | category · desktop |
| L33.21 | Quick add: after adding (redraw) or "already in your bag" (no redraw), leaving the card clears the panel *(TA-1: redraw ✅ · no redraw ❌ stuck open, T6)* **TA-2 20 Oct: ✅ no-redraw case clears too (T6 fixed)** | category · desktop |
| L33.22 | Toast: gone at 2.6 s; never blocks a click under it; a new toast gets its full time; Undo toast 6 s *(TA-1: ✅ 2.61 s / 6.01 s)* **TA-2 20 Oct: ✅ 2.61 s / 6.02 s** | all pages |
| L33.23 | A toast with a link ("View bag", "Undo") holds while hovered or focused *(TA-1: ❌ vanishes at 2.6 s, T7)* **TA-2 20 Oct: ✅ held 9 s under the mouse; goes 2.6 s after the mouse leaves (T7 fixed)** | all pages · desktop |
| L33.24 | Every popup / sheet / drawer / zoom: open → page locked; close by ✕ / Esc / backdrop / Back / edge swipe / swipe down → unlocked at the same scroll spot *(TA-1: ✅ 41 cycles)* **TA-2 20 Oct: ✅** | home, category, product, combo, account, admin · phone + desktop |
| L33.25 | After any popup closes, keyboard focus is back on the button that opened it *(TA-1: shop ✅ · admin PR register panel ❌, T15)* **TA-2 20 Oct: ✅ PR register panel too (T15 fixed)** | all pages |
| L33.26 | Sort menu: Esc / pick / veil close it and focus goes back to the Sort button *(TA-1: ❌ focus lost, T10)* **TA-2 20 Oct: ✅ focus on Sort (T10 fixed)** | category · phone + desktop |
| L33.27 | Share row (when switched on): closes itself after 8 s; re-opened it gets a fresh 8 s; closing leaves no click listener behind *(TA-1: 8 s ✅ · re-open ❌ 1.4–1.6 s, T8 · leftover listener ❌, T9)* **TA-2 20 Oct: ✅ re-open 8.08–8.15 s · 0 leftover redraws (T8, T9 fixed)** | product · phone + desktop |
| L33.28 | Sticky bars appear and go at the right points in BOTH directions: bag bar, landing bar, checkout header WhatsApp, desktop product bar (inert when off) *(TA-1: ✅)* **TA-2 20 Oct: ✅** | bag, landing, checkout, product |
| L33.29 | Journal popup waits for the owner's scroll % and delay, locks the page, "No thanks" unlocks at the same spot, once per session *(TA-1: ✅)* **TA-2 20 Oct: ✅** | journal post · phone + desktop |
| L33.30 | Journal (phone): tab bar hides on scroll down, returns on scroll up; slim bar only while the tab bar is away, never stacked *(TA-1: ✅)* **TA-2 20 Oct: ✅** | journal post · phone |
| L33.31 | Side canvas: motion pauses off-screen and resumes ≤ one cycle; popup opens after 3 s in view, is cancelled if the zone leaves earlier, locks/unlocks, comes once; motion holds under the mouse *(TA-1: ✅ except hover hold ❌ T14 ⚖ owner)* **TA-2 20 Oct: ✅ hover holds the zone under the mouse; leave → turns 29–85 ms (T14 fixed)** | home · 1920 |
| L33.32 | Pull-to-refresh: a short pull resets; a cancelled touch resets; a full pull reloads with nothing left on screen *(TA-1: cancelled touch ❌ stuck, T11 · rest ✅)* **TA-2 20 Oct: ✅ cancelled touch resets (T11 fixed)** | all pages · phone |
| L33.33 | Swipe-back from the edge = exactly one page back, and closes an open popup first *(TA-1: ✅)* **TA-2 20 Oct: ✅** | all pages · phone |
| L33.34 | Press-and-hold steppers repeat after 0.45 s and stop on release, slide-off and touch cancel *(TA-1: ✅)* **TA-2 20 Oct: ✅** | size finder · phone + desktop |
| L33.35 | Rotating offer card holds for a resting finger and for keyboard focus (focus never left on a hidden slide) *(TA-1: ❌ T12, T13)* **TA-2 20 Oct: ✅ finger and keyboard focus hold it (T12, T13 fixed)** | account · phone |
| L33.36 | Welcome popup opens ~0.35 s after a first load; Esc closes and unlocks *(TA-1: ✅ 288 ms)* **TA-2 20 Oct: ✅ 220 ms** | home · phone |
| L33.37 | No forever timer keeps running on an idle shop page *(TA-1: ❌ 30 s interval, T16)* **TA-2 20 Oct: ✅ none (T16 fixed)** | all pages |

*L33.xx scripts: `scratchpad/timing-audit/tools/run-all.sh` (report `qa/TIMING-AUDIT.md`, rounds TA-1 and TA-2). Renumbered 20 Oct (TA-2): this table used L28 / L29 / L29.01–L29.37, which clashed with the older [L28] (carousels) and [L29] (long names) in section 2. Now L28 → **L32**, L29 → **L33**, L29.xx → **L33.xx** (same order, results kept). The timing-audit report and test scripts still say "L29" in older text — read it as L33.*
