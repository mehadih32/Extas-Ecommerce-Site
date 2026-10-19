# EXTAS demo store: desktop functional QA

## সংক্ষেপে (বাংলা)

- **কী টেস্ট করেছি:** ডেস্কটপের ৬টা মাপে স্টোরের সব পেজ মাউস আর কিবোর্ড দিয়ে চালিয়ে দেখেছি: 1024, 1280, 1366, 1440, 1536 আর 1920। এখানে শুধু কাজ করে কি না সেটা দেখেছি; ডিজাইন দেখছে অন্য এজেন্ট। `src` এ কিছু বদলাইনি।
- **পেজ চেক:** ১০৪টা পেজ, প্রতিটা ৬ মাপে, আর 1024-এ বাংলায় আরেকবার। মোট ৭২৮ বার পেজ খোলা হয়েছে।
  - কোনো JS error নেই।
  - কোনো পেজ পাশে স্ক্রল হয় না।
  - প্রতিটা পেজে h1 ঠিক একটা।
  - "Skip to content" লিংক সব পেজে আছে আর কাজ করে।
  - Tab চাপলে ফোকাস রিং সব জায়গায় দেখা যায়।
  - পেজ লোডের সময় কিছু নড়ে না (CLS 0)। হোভারে সবচেয়ে বেশি 0.0175, সীমা 0.02-এর নিচে।
  - ৩৭১টা ভেতরের লিংক, সব ঠিক পেজ খোলে।
- **কেনাকাটার পুরো পথ:** হোম → ক্যাটাগরি → প্রোডাক্ট → সাইজ → ব্যাগ → চেকআউট → অর্ডার → ধন্যবাদ → ইনভয়েস, ইংরেজি আর বাংলা দুটোতেই। কম্বো, পেছনে/সামনে যাওয়া, রিফ্রেশ, জুম, সাইজ গাইড, হোয়াটসঅ্যাপ আর বানান ভুল দিয়ে সার্চও চালিয়েছি। ৬ মাপেই ২১টার মধ্যে ২১টা PASS।
- **ডেস্কটপের নিজস্ব ফিচার:** ২৩টা চেক, প্রতি মাপে ১৪টা PASS। মোট **১৪টা সমস্যা (Q-001 থেকে Q-014)**:
  - **বড় (৩টা):**
    - মেগা মেনু নেই।
    - সাব-ক্যাটাগরিতে (Ralph Lauren, Lacoste ইত্যাদি) যাওয়ার কোনো রাস্তা নেই।
    - প্রোডাক্ট পেজে কিবোর্ড দিয়ে রং বা সাইজ বাছলে ফোকাস হারিয়ে পেজের একদম উপরে চলে যায়।
  - **মাঝারি (৫টা):**
    - জুম করা ছবি মাউস দিয়ে টেনে সরানো যায় না।
    - কিবোর্ড দিয়ে জুম খোলা যায় না।
    - প্রোডাক্ট কার্ডে হোভার করলে দ্বিতীয় ছবি বা কুইক-অ্যাড আসে না।
    - অ্যাকাউন্টের অফার কার্ডে নাম মাঝখানে কেটে যায় ("Heavyweight Hoodie 32…")।
    - 1024-এ অফার ৩টার জায়গায় ২টা দেখায়।
  - **ছোট (৬টা):**
    - হোয়াটসঅ্যাপ টুলটিপের লেখা মেলে না।
    - কয়েকটা বাটনের ক্লিক করার জায়গা পাশের বাটনের উপর ৩–৭ px চলে যায়।
    - কিবোর্ড দিয়ে হিরো স্লাইডারের তীর বাটনে যাওয়া যায় না।
- **ভাগ:**
  - **Batch A** (হেডার, মেনু, হোম, ক্যাটাগরি, সার্চ, ফুটার): ৫টা। Q-001, Q-002, Q-006 আর Q-014 এখন চলতি Batch A কাজে (`97-desk-a.js` আর `r12-zzdesk-a.css`) মেটার পথে, পরে আরেকবার মিলিয়ে দেখলাম।
  - **Batch B** (প্রোডাক্ট, কম্বো, ব্যাগ, চেকআউট, ধন্যবাদ, অ্যাকাউন্ট): ৯টা।
- **ফোনে লাগবে কি না:** Q-003, Q-007, Q-010 আর Q-013-এর কোড ফোনেও একই। ফিক্স এমনভাবে করতে হবে যাতে ফোনের চেহারা না বদলায়। বাকিগুলো শুধু ডেস্কটপের।

---

## 1. Setup

- **Build tested:** `scratchpad/proto/dist/desk-qa.html`
  - 4,418,758 bytes, MD5 `8492a905…`, built 2026-10-19 15:58 with `tools/build.sh`.
  - `r16.html` and the snapshots were not touched. `src` was not edited.
- **Second build (for comparison):** `dist/desk-qa-wip.html`, built later from `src` while the Batch A fix work was in progress.
  - It is used only for the "WIP re-check" notes, on Q-001, Q-002, Q-006 and Q-014.
  - `src` was changing during my run: `97-desk-a.js`, `r12-zzdesk-a.css`, `21-category.js` and more. All PASS and FAIL counts below are for the frozen `desk-qa.html`.
- **Browser:** Chromium, Playwright.
  - Real desktop context: `isMobile:false`, `hasTouch:false`, DPR 1.
  - Real mouse and keyboard only: `mouse.move`, `wheel`, `down`/`up` and `keyboard.press`. No touch.
  - One browser at a time, all runs in the foreground.
- **Widths:** 1024×768, 1280×800, 1366×768, 1440×900, 1536×864, 1920×1080.
- **Tools** (all in `scratchpad/desktop-qa/tools/`):

  | Tool | What it does |
  |---|---|
  | `sweep.js` | Route sweep |
  | `clip.js` | Finds text clipped by a parent box |
  | `links.js` | Checks every internal link resolves |
  | `journey.js` + `lib.js` | The R15b J1–J10 journeys, with the six desktop widths added |
  | `feat.js` + `exwalk.js` | Desktop feature tests F01–F24 |
  | `phone.js` | Checks whether a desktop fail also happens on a 393×852 phone |

- **Raw data:** `scratchpad/desktop-qa/out/`.
- **Screenshots:** `scratchpad/desktop-qa/shots/`.

## 2. Coverage

| Area | Scope | Result |
|---|---|---|
| Route sweep, EN | 104 routes × 6 widths. Every route in `ROUTES` (02-core.js) plus the routes added by 10, 42 and 73: home, 12 categories, 6 searches (including typos), 31 products, 8 combo lists and pairs, 10 combos, set, bag, checkout, thanks, order, exchange, account × 5, 9 help pages, size guide, 2 landings, journal, admin × 5 (smoke only), 404 × 2, login | 0 JS errors, 0 sideways scroll, 0 h1 problems, skip link 104/104, focus ring 0 misses, CLS on load 0.000 everywhere |
| Route sweep, BN | 104 routes at 1024 | Same as EN. No new issues. |
| Links | 371 internal `#/` links collected from every page | All resolve. 0 not-found, 0 crash. External links are wa.me (53) and `tel:` only. |
| Images and alt | `<img>` count | 0 on store pages: every product image is inline SVG. No broken images. `svg[role=img]` all labelled. |
| Journeys J1–J10 | 21 checks × 6 widths | 126/126 PASS |
| Desktop features F01–F24 | 23 checks × 6 widths | 84 PASS, 54 FAIL, which is 14 distinct issues |

## 3. Pass table per width

| Check | 1024 | 1280 | 1366 | 1440 | 1536 | 1920 |
|---|---|---|---|---|---|---|
| No JS errors (104 routes) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| No sideways scroll | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Nothing outside the viewport | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Exactly one h1 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Skip link is first, visible and works | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Focus ring on Tab (10 tabs per route) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| CLS on load < 0.02 | ✅ 0 | ✅ 0 | ✅ 0 | ✅ 0 | ✅ 0 | ✅ 0 |
| CLS on hover < 0.02 (max) | ✅ .006 | ✅ .016 | ✅ .004 | ✅ .007 | ✅ .003 | ✅ .018 |
| Bottom of page reachable, nothing covers it | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| No text clipped mid-word | ✅ | ❌ Q-007 | ❌ Q-007 | ❌ Q-007 | ❌ Q-007 | ❌ Q-007 |
| No overlapping click areas | ❌ Q-010 · 011 · 012 | ❌ Q-010 · 011 · 012 | ❌ same | ❌ same | ❌ same | ❌ same |
| J1 purchase EN + invoice | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| J2 purchase BN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| J3 combo journey | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| J4 back/forward with Back button, Alt+←, Backspace, 12 mixed moves | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| J5 refresh mid-journey | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| J6 no pull-to-refresh on desktop | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| J7 zoom: open, close by ✕ / Esc / Back | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| J8 size guide + size chart cm/inch | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| J9 WhatsApp header link (prefilled, names product, new tab) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| J10 search with typos (pollo, panjbi, hoddie, shrit, oxfrod, পোলো…) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| F01 every nav link opens the right page and marks it | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| F02 mega menu on hover / click / closes on out, Esc, outside | ❌ Q-001 | ❌ | ❌ | ❌ | ❌ | ❌ |
| F03 keyboard menu (ArrowDown opens, Esc closes) | ❌ Q-001 | ❌ | ❌ | ❌ | ❌ | ❌ |
| F04 sub-categories reachable | ❌ Q-002 | ❌ | ❌ | ❌ | ❌ | ❌ |
| F05 filter by size + colour, clear, sort low→high and high→low, Esc / outside closes sort | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| F06 product colour, gallery thumbnails, next arrow, size, Add to Bag | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| F07 zoom with mouse: wheel ✅, Ctrl+wheel ✅, double-click ✅, Esc ✅, **drag-pan ❌** | ❌ Q-004 | ❌ | ❌ | ❌ | ❌ | ❌ |
| F07b zoom from the keyboard | ❌ Q-005 | ❌ | ❌ | ❌ | ❌ | ❌ |
| F08 wishlist: product heart, header heart, card heart | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| F09 WhatsApp hover: tooltip, grows 1.14×, opens WhatsApp | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| F09b tooltip text is "Need any help" | ❌ Q-009 | ❌ | ❌ | ❌ | ❌ | ❌ |
| F10 card hover: second image + quick actions, no shift | ❌ Q-006 | ❌ | ❌ | ❌ | ❌ | ❌ |
| F11 sliders: drift, pause on hover, mouse drag, hero arrows ±1 card | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| F12 sticky header, rating → reviews jump lands below header | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| F13 checkout side summary right of the form | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| F14 account: 3 offers side by side, names whole | ❌ Q-008 (2 cards) | ❌ Q-007 | ❌ Q-007 | ❌ Q-007 | ❌ Q-007 | ❌ Q-007 |
| F16 account side menu, 6 pages | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| F17 exchange flow by mouse (item → reason → size → confirm) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| F18 footer links (17) open at the top; Back returns to the footer scroll | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| F19 search: icon focuses input, Esc returns focus, typo "hodie", outside click closes | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| F20 keyboard: colour / size pick keeps focus, Enter adds to bag | ❌ Q-003 | ❌ | ❌ | ❌ | ❌ | ❌ |
| F21 size chart: table, cm↔inch, outside click closes | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| F23 back/forward with scroll restore through 8 pages (combos, search, account, order, exchange, FAQ, set) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| F24 refresh keeps page, login and content | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## 4. Fails

Each fail gives: batch, severity, widths, steps, what I measured against what was expected, screenshot, cause, and whether phone is affected.

### Q-001 · No category / mega menu on desktop

- **Batch:** A. **Severity:** High.
- **Widths:** all 6.
- **Steps:** On `#/`, move the mouse onto Polos, T-Shirts, Shirts, Panjabi, Trousers or Hoodies and wait 500 ms. Also Tab to "Polos" and press ArrowDown.
- **Measured:** 0 of 7 items open any panel. There is no `aria-expanded`. ArrowDown does nothing.
- **Expected:** A panel opens on hover and on click. It closes on mouse-out, Esc and outside click, and can be used from the keyboard.
- **Screenshot:** `shots/o-hover-polos-1280.png`
- **Cause:** `03-layout.js:2`, `:16` and `:24`. `NAV` is a flat list of links, and `.nav-d a:hover` only underlines (`styles.css:157-159`).
- **Phone:** no.
- **WIP re-check (`desk-qa-wip.html`, 1280):**
  - Hover opens a panel on all 6 categories that have one.
  - `aria-expanded="true"` is set.
  - The panel closes on mouse-out, Esc and outside click.
  - ArrowDown opens it and moves focus to "All Polos".
  - One thing to confirm with the owner: Enter on a top item now opens the panel and does not go to the category page. The "All Polos" link inside the panel does that job. This is a standard disclosure pattern, so it is not counted as a fail.

### Q-002 · Sub-categories cannot be reached

- **Batch:** A. **Severity:** High.
- **Widths:** all 6.
- **Steps:** Look for any link to Polo › Ralph Lauren › Solid / Piqué, or to Lacoste, from the header or the category page.
- **Measured:** `DB.subcats` has 4 entries, but no link and no route uses them. `#/c/polos` has no sub-category filter.
- **Expected:** Sub-categories open from the menu and filter the products.
- **Screenshot:** `shots/o-hover-polos-1280.png`
- **Cause:** sub-categories exist only as combo-rule bindings (`01y-combo-auto-data.js:52-62`, `42-combo-auto.js:80`).
- **Phone:** no.
- **WIP re-check:** the panel lists Ralph Lauren (2), Solid Polo (1), Piqué Polo (1) and Lacoste (1) as `#/c/polos?sub=…`. All of them open and show the right products.

### Q-003 · Keyboard focus is lost after picking a colour or size on the product page

- **Batch:** B. **Severity:** High (keyboard and screen-reader users).
- **Widths:** all 6.
- **Steps:**
  1. On `#/p/heavy-cotton-tee`, focus size "M" and press Space. Or focus a colour and press Enter.
  2. Press Tab.
- **Measured:**
  - After the pick, `document.activeElement` is `<body>`.
  - The next Tab lands on "Skip to content" at the top of the page, so the user has to tab through about 30 controls again.
  - The same happens after Add to Bag → Esc on the "Added to bag" popup: focus ends on `<body>`.
- **Expected:** Focus stays on the control that was picked. When the popup closes, focus goes back to Add to Bag.
- **Screenshots:** `shots/q009a-size-focused-before-1280.png` (before) and `shots/q009b-after-space-tab-lands-on-skip-1280.png` (after).
- **Cause:**
  - `30-product.js:1551` (`ACT['pdp-color']`) and `:1556` (`ACT['pdp-size']`) call `rerender()`.
  - `rerender()` (`02-core.js:899`) replaces `#app` and does not restore focus.
  - `closeModal` (`02-core.js:976`) cannot return focus because the opener was re-rendered away.
  - The category filters do this right (`cat_refresh` keeps focus), so that is a pattern to copy.
- **Phone:** yes, the same code. On a 393 phone, focus also goes to BODY. The fix is invisible (it restores focus to the same control by `data-act` and `data-s`), so the phone's look does not change.

### Q-004 · Zoom viewer: the mouse cannot pan; there are no next / previous buttons for the mouse

- **Batch:** B. **Severity:** Medium.
- **Widths:** all 6.
- **Steps:**
  1. Click the product photo.
  2. Scroll the wheel up 3 times. It zooms to 1.40×.
  3. Press the mouse button, drag 120×80 px and release.
- **Measured:**
  - After the drag, `transform` is still `translate(0px, 0px) scale(1.40)`. The photo does not move.
  - The viewer's only button is "Close".
  - ArrowRight changes the photo (keyboard works), but a mouse user has no way to change photos.
  - The hint on desktop says "Pinch or double-tap to zoom".
- **Expected:** Drag to look around while zoomed. Next / previous buttons, or another way to change photos with the mouse.
- **Screenshot:** `shots/q-zoom-viewer-1280.png`
- **Cause:**
  - Pan exists only on touch: `31-zoom.js:47-60`, `touchmove`.
  - Desktop gets only wheel, double-click and keys: `31-zoom.js:71-75`.
  - The markup has no arrows: `31-zoom.js:26-28`. The hint text is at line 28.
- **Phone:** no, if the fix is gated on `pointerType === 'mouse'`.

### Q-005 · Zoom cannot be opened from the keyboard

- **Batch:** B. **Severity:** Medium.
- **Widths:** all 6.
- **Steps:** On a product page, Tab through the gallery.
- **Measured:**
  - The `.pdp-tile` photo is not focusable (`tabIndex -1`, no focusable child).
  - Zoom opens only on a click.
  - Once open, the viewer does take focus and Tab stays inside it. ✅
- **Expected:** The photo, or a "Zoom" button, can be reached with Tab and opened with Enter.
- **Cause:** `31-zoom.js:94-103`: a document click listener on `.pdp-tile` and nothing else.
- **Phone:** no.

### Q-006 · Product card hover: no second image, no quick actions

- **Batch:** A. **Severity:** Medium.
- **Widths:** all 6.
- **Steps:** On `#/c/polos`, hover a card for 600 ms.
- **Measured:**
  - The card's HTML does not change and there is no back view.
  - The only visible button is the wishlist heart.
  - The card lifts 2 px with a transform. CLS is 0, which is fine.
- **Expected:** A second image and quick actions appear, with no layout shift.
- **Screenshot:** `shots/f10-card-hover-desk-qa-1280.png`
- **Cause:** `02-core.js:233-241` (`productCard`) and `styles.css:145`.
- **Phone:** no.
- **WIP re-check:**
  - Hover shows the back view and quick add buttons "S M L XL".
  - Clicking "Add size S to bag" adds the item with a toast, the page does not change and CLS is 0, at both 1024 and 1440.
  - The quick add buttons can be reached with Tab (about 38 tabs in).
  - The heart now sits over the card link as a sibling, which also removes the old button-inside-a-link problem.

### Q-007 · Account offer card: product name clipped mid-word with no "…"

- **Batch:** B. **Severity:** Medium.
- **Widths:** 1280, 1366, 1440, 1536 and 1920. At 1024 the card is wide enough.
- **Steps:** Log in and open `#/account` or `#/account/orders`.
- **Measured:** "Heavyweight Hoodie 320 GSM" ends 44–47 px past the card's right edge and shows as "Heavyweight Hoodie 32".
  - 1280: name ends at 963, card at 919.
  - 1440: name ends at 1044, card at 997.
- **Expected:** The name fits, or ends with "…".
- **Screenshots:** `shots/q-account-offers-1440.png` and `shots/q-account-offers-1280.png`.
- **Cause:**
  - `r12-zfix.css:28` (`.ord-name,.acc-po-name{display:inline-block…}`) overrides `r12-acct.css:465-466` (`display:block; overflow:hidden; text-overflow:ellipsis`).
  - An inline-block shrinks to its text, so the ellipsis never triggers and `.acc-po{overflow:hidden}` cuts the name instead.
- **Phone:** the same rule applies to the phone's rotating offer card. With today's data the phone only shows short polo names, so nothing is cut yet, but it could happen. To keep the phone unchanged, scope the fix to `.acc-po3 .acc-po-name` (desktop only).

### Q-008 · Account dashboard shows 2 offers, not 3, at 1024–1279

- **Batch:** B. **Severity:** Medium (owner decision).
- **Widths:** 1024.
- **Measured:** 2 cards visible; the third is `display:none`.
- **Expected:** 3 offers side by side.
- **Screenshot:** `shots/q-account-offers-1024.png`
- **Cause:** `r12-zfix.css:96-102`. This was an R15 tablet rule on purpose: at 3 columns the cards were about 210 px and "See all" wrapped.
- **Decision needed:** either let 3 cards fit at 1024–1279 (shorter title, smaller gap), or accept 2 at that width.
- **Phone:** no.

### Q-009 · WhatsApp header tooltip text differs from the spec

- **Batch:** A. **Severity:** Low.
- **Widths:** all 6.
- **Measured:** The tooltip says "Need help? Chat with us".
  - Everything else passes: the tooltip shows, stays inside the screen, the disc grows 36 → 41 px (1.14×) on hover, and a click opens `api.whatsapp.com` in a new tab with the product named.
- **Expected:** "Need any help".
- **Screenshot:** `shots/f09-wa-hover-desk-qa-1280.png`
- **Cause:** `03-layout.js:55` (`HDR_WA_TIP`).
- **Phone:** the tooltip only shows on hover, but the same text is used in the link's `aria-label` on phone too. Changing the text changes what a phone screen reader says, not how the phone looks.

### Q-010 · Product page: the wishlist heart's click area overlaps the rating link

- **Batch:** B. **Severity:** Low.
- **Widths:** all 6 on `#/p/pocket-tee`. At 1024, also on `#/p/heavyweight-hoodie`.
- **Measured:** `.pdp-wish` and `.pdp-rating` overlap by 33–34 × 4–7 px, and the rating link is on top. Clicking the bottom edge of the heart jumps to the reviews instead of saving the item.
- **Expected:** No overlap.
- **Screenshot:** `shots/i-pdp-wish-rating-1280.png`
- **Cause:** `r12-zfix.css:23` (rating `min-height:32px; margin-top:-6px`) together with `r12-pdp.css:690` (heart `margin:-6px -6px -4px`).
- **Phone:** yes. At 393, the heart is at y 428–462 and the rating at y 455–487.

### Q-011 · Set builder: colour and size click areas overlap their neighbours

- **Batch:** B. **Severity:** Low.
- **Widths:** 3 px at 1024; 7 px from 1280 to 1920.
- **Steps:** Open `#/set` and check the swatches and the S/M/L/XL pills.
- **Measured:** Each pill's or swatch's box runs into the next one. It looks fine, but a click on the seam picks the neighbour.
- **Screenshot:** `shots/i-set-pills-1280.png`
- **Cause:** `41-set.js:64` and `:72`, and `r12-zfix.css:185`. The 32 px pills sit in less than 32 px of space.
- **Phone:** no. At 393 there is a 3 px gap.

### Q-012 · Landing page: order-form tick boxes overlap

- **Batch:** B. **Severity:** Low.
- **Widths:** all 6, on `#/l/polo-duo` and `#/l/winter-hoodie`.
- **Measured:** The two 32×32 checkboxes are 28 px apart, so they overlap by 4 px.
- **Screenshot:** `shots/q014-landing-ticks-1024.png`
- **Cause:** `.check` (`styles.css:130`) together with the `.ct-tick` inputs in `70-landing.js`.
- **Phone:** not measured. This is the same markup, so check it before fixing.

### Q-013 · The disabled "Previous photo" arrow is still in the Tab order

- **Batch:** B. **Severity:** Low.
- **Widths:** all 6.
- **Measured:** On the first photo, `.pdp-arrow.l.off` has `opacity:.32; pointer-events:none`, but it has no `disabled` and no `aria-disabled`. Keyboard users can still tab onto a dead button.
- **Cause:** `r12-pdp.css:303` and `30-product.js:294`.
- **Phone:** yes, if the arrow is shown there. Adding `aria-disabled` or `disabled` does not change how anything looks.

### Q-014 · Home hero arrows cannot be reached from the keyboard

- **Batch:** A. **Severity:** Low.
- **Widths:** all 6.
- **Measured:** With the mouse they work: one click moves exactly one card (+201 / −201 px). But they are `display:none` until the mouse is over the slider, so Tab never reaches them.
- **Screenshot:** `shots/q-hero-arrows-1280.png`
- **Cause:** `styles.css:1129-1134`.
- **Phone:** no.
- **WIP re-check:** `r12-zzdesk-a.css:142-143` changes the arrows to `opacity:0` and shows them on `:focus-within`, which looks like a fix (not re-tested with Tab).

## 5. Severity ranking

1. **High:**
   - Q-001: mega menu (A, in WIP).
   - Q-002: sub-categories (A, in WIP).
   - Q-003: focus lost on product page (B, phone code).
2. **Medium:**
   - Q-004: zoom mouse pan and navigation (B).
   - Q-005: zoom from the keyboard (B).
   - Q-006: card hover (A, in WIP).
   - Q-007: account name clipped (B, phone rule).
   - Q-008: 2 offers at 1024 (B, owner decision).
3. **Low:**
   - Q-009: tooltip text (A).
   - Q-010: heart / rating overlap (B, phone too).
   - Q-011: set pill overlap (B).
   - Q-012: landing ticks overlap (B).
   - Q-013: disabled arrow in the Tab order (B).
   - Q-014: hero arrows from the keyboard (A, in WIP).

## 6. Fix batches (same split as the UX audit)

**Batch A** (header, nav, menus, home, category, search, footer, help): Q-001, Q-002, Q-006, Q-009, Q-014.

- Q-001, Q-002, Q-006 and Q-014 are already being done in `97-desk-a.js` and `r12-zzdesk-a.css`. My WIP re-check passes the mega menu (hover, Esc, outside click, ArrowDown), the sub-category links and the card back view plus quick add.
- Q-009 is a one-line text change.
- Category filters and sort, search with typos, footer links (17) and help pages all **pass**.

**Batch B** (product, combos, bag, checkout, thanks, account): Q-003, Q-004, Q-005, Q-007, Q-008, Q-010, Q-011, Q-012, Q-013.

- Q-012 (landing) is put here because the landing page is a product order page.
- These all **pass**:
  - purchase EN and BN through to the invoice
  - combo journey
  - wishlist
  - size chart
  - exchange
  - checkout side summary
  - back/forward
  - refresh

### Phone-touching fixes (phone must not change)

| ID | Shared with phone? | How to keep the phone unchanged |
|---|---|---|
| Q-003 | Yes, same `rerender` | Focus restore only, nothing visual. |
| Q-007 | Same CSS rule | Scope the fix to `.acc-po3` (desktop grid). |
| Q-010 | Yes | Any change to the heart or rating hit areas moves something on the phone. Gate it with `@media(min-width:1024px)`, or accept a phone change and get the owner's OK. |
| Q-013 | Yes | Attribute only, nothing visual. |
| Q-012 | Not measured | Check the phone before fixing. |
| All others | Desktop only | — |

## 7. Measured and not counted as fails

- **Login "Show" button inside the password field:** overlaps the field on purpose. That is the design.
- **Journal:** the promo text sits over the promo image at about y 661 / 1787. This belongs to the journal QA, not here.
- **Checkout side summary:**
  - It is `position:static`. At 1280×800 its bottom is at 855 px, so you scroll to see all of it. Nothing covers the content.
  - Its total (৳3,187) is lower than `bagTotals()` (৳3,750) because the VIP 15% discount applies at checkout. That is correct.
- **Hover CLS on `#/account/orders`:** up to 0.0175 (at 1920). This is under 0.02, from many tiny `::after` shifts. Watch it.
- **Home hero pin "Heavyweight Hoodie 320 GSM" at 1024:** the text runs 4 px past its own box but stays inside the pin's padding. Nothing is cut (`shots/q012-hero-pin-1024.png`).
- **Two home sliders don't drift:** "Shop sets" and "Reviews" at 1280 and up. Their content fits, so there is nothing to scroll and no drift. That is correct.
- **WhatsApp and hotline numbers:** still placeholders (`8801XXXXXXXXX`, `09XXX-XXXXXX`). Fill them before launch.
- **Admin and journal smoke** (`#/admin`, orders, rules, combos, products, `#/journal`): no JS errors and no sideways scroll at any width. Admin rules has 4 px overlaps between its toggle inputs, which I left to the admin QA.
