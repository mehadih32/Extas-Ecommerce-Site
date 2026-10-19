# EXTAS demo store — independent phone audit

Auditor: senior UI/UX (agent pass). **Not** the owner's list — nothing below was reported by him.
Demo: https://claude.ai/artifact/PyTHSfN7LM7oaaZ7FSiprk (version `1792284667-915a`)
Reference device: **440 × 956 CSS px**, 2× DPR, iOS UA, touch enabled. Spot-checks at 390 × 844 and 360 × 844.
Driven with Playwright/Chromium; every number below came from `getBoundingClientRect`, `getComputedStyle`,
`elementFromPoint`, `scrollWidth` or `PerformanceObserver` in the live page. Screenshots in
`/tmp/claude-0/-home-claude/a27f8d4d-b57b-5d41-b919-c637e74e7368/scratchpad/audit/shots/`.

**36 findings.** Journey covered: home → category → 15 product pages → combo → build-your-own-set →
bag → checkout → thank-you → my account, plus the hamburger menu, search, and the size-chart sheet.

### Two things that are NOT wrong (checked, so nobody re-checks them)
- **No horizontal page scroll anywhere.** `document.scrollWidth` = `clientWidth` = 440 on `#/`, `#/c/polos`,
  `#/p/*`, `#/set`, `#/combo/polo-duo`, `#/bag`, `#/checkout`, `#/thanks/*`, `#/account`, `#/page/faq`.
  Same at 390 and 360.
- **No layout shift worth naming.** Cumulative Layout Shift over the first 3.5 s: home 0.0004,
  category 0.0004, product 0.0061, set 0.0023, bag 0.0060. All far under the 0.1 threshold. Nothing jumps on load.

---

## BREAKS THE SALE

### 1 · Home — six carousels crawl forever, so the thing under your finger changes while you aim at it
`#/` · the hero rail, the two flash rows, the category rail, the review rail and the journal rail are all
JS-driven marquees that never stop.

Measured `scrollLeft` of `.hm-sltrack` sampled every 500 ms: 37 → 47 → 57 → 67 → 77 → 87 → 97 → 107 → 117 → 128
→ 138 → 148 → 158. **20.2 px/second, infinite, in both directions** (the second `.hm-flashrow` runs backwards:
2067 → 1922 over the same 6 s).

Proof that this costs orders: I fixed a point 120 px into the hero rail and asked the page what link was there.

| t | `elementFromPoint` returns |
|---|---|
| 0 s | `#/p/heavyweight-hoodie?color=black` |
| 1.5 s | `#/p/heavyweight-hoodie?color=black` |
| 3.0 s | **`#/p/classic-cotton-panjabi?color=white`** |

A customer who starts a tap on the hoodie opens the panjabi three seconds later. There is no pause on touch,
no pause on hover, and the rails are already off-register at first paint — at load `.hm-sltrack.scrollLeft` is
39, so the first card sits at **x = −39** with its name clipped ("…eight Hoodie 320 GSM" in `home_00.png`).
Every rail does this: first-child x = −39, −35, −30, −2049, −21, −23.

**Severity: breaks the sale.**
**Smallest fix:** pause each rail on `pointerdown`/`touchstart` and for ~4 s after, and start every rail at
`scrollLeft = 0` so the first card is whole. (Ideally also stop under `prefers-reduced-motion`, which the
CSS sheens already honour but these rAF loops do not.)

---

### 2 · Every page — the floating WhatsApp button is parked in the middle of the right edge and eats taps
`.wa-fab` — `position:fixed; right:12px; top:50%; transform:translateY(-50%)`, **50 × 50 px, z-index 44**.
At 440 × 956 it lands at **x 378–428, y 453–503** — dead centre of the screen, on top of the content column
(which ends at x = 424).

`elementFromPoint` at its centre, with the button's own `pointer-events` suspended:

| page | what is underneath it |
|---|---|
| `#/` | `<a href="#/p/slim-chino-trousers?color=khaki">` — a product card |
| `#/` (scrolled) | `a.hm-more` **"View all"**, 67 × 36 px, fully covered |
| `#/combo/polo-duo` | the **`cm`** unit toggle, 43 × 27 px, fully covered |
| `#/c/polos` | a product card image in the "Build your own set" picker |
| `#/bag` | the colour chips of the "Add a 2nd polo, pay ৳1,500" upsell |
| `#/account` | the "Used automatically on your next order" line of the Members Only card |

It also **drifts**: scrolling moves it 15 px down and it springs back (measured y 453 → 468 → 453). There is
already a special case in the code that hides it over the footer (because it was swallowing Privacy and Terms) —
the same problem exists everywhere else and was not fixed, only patched for the footer.

**Severity: breaks the sale** (it sits on the upsell on the bag page and on product links on home).
**Smallest fix:** move it to `bottom: calc(76px + env(safe-area-inset-bottom))` above the bottom nav, where
nothing tappable lives, and drop the drift. Same place it already goes on desktop.

---

### 3 · Product page — the heart/share/WhatsApp rail overlaps "All 5 colours" by 28 × 8 px, and sweeps over everything else
`#/p/*` · `.pdp-acts` is `position:fixed`, z-index 70, at **x 396–436**, holding three **40 × 40 px** buttons
(wishlist, share, WhatsApp) with **7 px gaps**. The content column runs to x = 424, so the rail permanently
covers the rightmost **28 px of the content column** and hangs 12 px past it.

Measured collision at scroll 0, both devices:

| viewport | WhatsApp button | "All 5 colours" | overlap |
|---|---|---|---|
| 440 × 956 | x 396–436, y 662–702 | x 312–424, y 694–730 | **28 × 8 px** |
| 390 × 844 | x 346–386, y 551–591 | x 262–374, y 582–618 | **28 × 9 px** |

Visible in `shots/sweep_2.png`: the green circle sits on the "s" of "colours" and on its underline. Because
the rail is fixed *and* rAF-animated (`top:38%` plus a scroll-driven transform), as the page scrolls it also
passes over the **Size chart** button (x 286–424) and the right end of the size-pill row (XXL ends at x 424).

The three buttons are also **40 × 40**, under the 44 px floor the rest of this build enforces
(`.iconbtn{min-width:44px;min-height:44px}` in the hardening pass) — `.pdp-page .pdp-act` overrides it back down to 40.

**Severity: breaks the sale** (the colour chooser is the first decision on the page).
**Smallest fix:** restore `.pdp-page .pdp-act` to 44 × 44 and give the buy block `padding-right: 58px` the way
`.pdp-head` already has `padding-right:46px` — the H1 was protected, the rest of the block was not.

---

### 4 · Everywhere — every WhatsApp and phone CTA is a dead link
| control | href |
|---|---|
| floating WhatsApp (`.wa-fab`) | `https://wa.me/8801XXXXXXXXX?text=…` |
| PDP rail "Ask about this item on WhatsApp" | `https://wa.me/8801XXXXXXXXX?text=…` |
| PDP "Ask on WhatsApp" | `https://wa.me/8801XXXXXXXXX?text=…` |
| bag / checkout / search / size-chart WhatsApp buttons | `https://wa.me/8801XXXXXXXXX?text=…` |
| footer "Message us on WhatsApp" | `https://wa.me/8801XXXXXXXXX?text=…` |
| footer "Hotline 09XXX-XXXXXX" | `tel:09XXX-XXXXXX` |

Tapping any of them opens WhatsApp on an invalid number, or the dialler with letters in it. WhatsApp is the
owner's main sales channel and **six separate CTAs across the build all lead nowhere.**

**Severity: breaks the sale.**
**Smallest fix:** one constant for the number, set once; until a real number exists, render the buttons
disabled rather than linking to a placeholder.

---

### 5 · Product page — the key selling lines fade to invisible, on a loop, forever
`#/p/*` · `.sweep` paints "Free home delivery", "Colour", "Size", "All 5 colours" and
"In stock — ships today if you order before 5 pm" with `-webkit-background-clip:text` +
`color:transparent` and an **infinite** gradient animation (`pdpSheen` 2.6 s, `pdpSheenQ` 4.6–4.8 s).

Contrast of each gradient stop against the page background `#F4F3F0`:

| line | dark stop | mid stop | **bright stop** |
|---|---|---|---|
| "Colour" / "Size" (`.pdp-lbl`) | 16.18:1 | 2.31:1 | **1.07:1** |
| "All 5 colours" (`.pdp-allc`) | 8.46:1 | 1.45:1 | **1.09:1** |
| "Free home delivery" (`.pdp-fd`) | 12.71:1 | 1.52:1 | **1.08:1** |
| "In stock — ships today…" (`.pdp-stock`) | 8.67:1 | 1.81:1 | **1.06:1** |

A band of each phrase is literally invisible at any given moment, and the band never stops travelling.
Compare `shots/sweep_2.png` (where "Free" is pale) with `shots/sweep_5.png` (where "home delivery" is pale).
The words "Colour" and "Size" sit in the mid stop most of the time — 2.31:1, under half the 4.5:1 floor —
which is why the label reads as a half-erased word in every screenshot.

The same trick is on the header wordmark (`logoSheen`, 7 s infinite) — the "A" in EXTAS is permanently pale in
`cat_3.png`, `co_0.png`, `acc_0.png`.

**Severity: breaks the sale** (free delivery and stock status are the two lines that close a COD order).
**Smallest fix:** cap the bright stop so no part of the gradient falls below 4.5:1 — e.g. for `.pdp-lbl` change
`#EFEBE3`/`#A8A194` to roughly `#6E675E`/`#3A362F`. The shine survives; the words stay readable.

---

### 6 · Bag — there are two Checkout buttons and the sticky one covers the other
`#/bag` with one item · the in-card **"Checkout"** (`.btn.btn-primary.btn-block.mt16`, 378 × 58) sits at
document y **850–908**. The sticky bar `.mbar` ("Total ৳ 850 · Checkout", 408 × 60) is fixed at viewport
y **873–956**.

At scroll 0 — the state the page loads in — **35 px of the 58 px in-card button is behind the sticky bar: 60 % covered.**
See `shots/bag_0.png`: the dark green button is sliced in half mid-word.

**Severity: breaks the sale** (a half-cut primary button reads as a broken page).
**Smallest fix:** drop the in-card Checkout on phones (`@media(max-width:1023px){.bg-sum .btn-block{display:none}}`)
— the sticky bar already does the job and carries the total.

---

### 7 · Every page — the demo gear is parked on top of real controls
`.demo-fab` — `position:fixed; top:72px; right:10px; width:44px; height:44px; z-index:70`. It was moved out of
the thumb zone in an earlier round and landed directly under the header, which is where the sticky toolbars live.

| page | what it covers |
|---|---|
| `#/c/*` scrolled | the right end of the **sticky filter bar** — the "On sale ①" chip and its count badge (`cat_1.png`) |
| `#/checkout` scrolled | the **"৳ 850" order total** in the sticky summary bar (`co_1.png`) |
| `#/checkout` top | the right half of the **"WhatsApp us"** help button (`co_0.png`) |
| `#/` | the hero's top-right corner and, lower down, a product card (`home_01.png`) |
| `#/account` | the breadcrumb and the profile card corner (`acc_0.png`) |
| footer | the shield icon of **"100% original"** (`cat_3.png`) |

It is demo chrome, but it is 44 × 44 at z-index 70 and it is in front of a different real control on every page.

**Severity: breaks the sale** (it hides the running total on checkout).
**Smallest fix:** `top: calc(100% - 180px)` on the left edge, or inside the footer — anywhere a shopper never taps.

---

### 8 · Build-your-own-set — 68 controls under 44 px, and the colour dots have overlapping hit areas
`#/set` is by a wide margin the worst page in the build: **68 interactive elements measure under 44 px** in at
least one dimension, against 40 on a product page, 11 on home and 3 on checkout.

| control | box | pitch | gap |
|---|---|---|---|
| `.bs-sw` colour dots | **30 × 30** | 36 px | **6 px** |
| `.bs-pill` size pills | **41 × 52** | 45 px | 4 px |
| "Add to set" buttons | **176 × 40** | — | — |
| `.bs-cname` product-name links | 127 × **16** | — | — |

The dots are worse than they look. `.swatch:not(.sm)::after` adds an invisible **44 × 44** hit box to every
swatch. At a 36 px pitch those boxes **overlap by 8 px**, so a tap in the gap between two colours is resolved
by DOM order, not by where the finger landed — a customer picks Black and gets White. Seven dots sit in a
176 px-wide card.

`.btn-sm{min-height:44px}` exists in the hardening pass; the Sets "Add to set" buttons override it back to 40.

**Severity: breaks the sale** (a set is two or three items — every one of them needs a colour and a size tapped).
**Smallest fix:** `.bs-sw{width:36px;height:36px}` with a 44 px pitch, drop to 5 per row, and remove the
`min-height:40px` override on `.bs-card .btn-sm`.

---

### 9 · Header — Search and Bag are 2 px apart
Measured at 440: Menu 44 × 44 at x 16–60, Search 44 × 44 at x **334–378**, Bag 44 × 44 at x **380–424**.
**Gap = 2 px.** A thumb aiming at Search opens the bag roughly as often as not — and the bag is the one icon
in the header that takes the customer out of browsing.

**Severity: breaks the sale.**
**Smallest fix:** `.hdr-in{gap:12px}` on the right-hand group, or shift Search left by 10 px.

---

### 10 · Footer — the newsletter phone field raises a letter keyboard
`.ftr input` · placeholder "Your phone number", but `type="text"`, `inputmode` = null, `autocomplete` = null.
On a phone this opens the QWERTY keyboard; the customer has to find the 123 key before they can type a number.
The checkout phone field is correct (`type="tel" inputmode="tel" autocomplete="tel"`) — so the same role has
two different behaviours in the same build.

**Severity: breaks the sale** (it is the only lead-capture field on the site).
**Smallest fix:** `type="tel" inputmode="numeric" autocomplete="tel"`.

---

### 11 · Home — the whole Journal section is dead
Nine article cards (`a.hm-art`, "Style · 5 ways…", "Fabric · …", "Behind EXTAS", "Care · 2 min",
"Winter · …", "Size guide", "Fit guide", two more) plus the "Journal" footer link all carry `href="#/"` —
they reload the home page. Facebook, Instagram, YouTube and TikTok in the footer are `href="#/"` too.
That is **14 dead links per page**, nine of them a full home-page section with photos.

**Severity: breaks the sale** (a shopper who taps three dead tiles stops tapping).
**Smallest fix:** until the journal exists, don't render the section; make the four social links real URLs or drop them.

---

### 12 · Checkout — steps 2 and 3 are empty boxes until you type your name
`#/checkout` on arrival (`co_0.png`): step **2 Delivery** contains only a static strip
"Dhaka city ৳ 80 · Outside Dhaka ৳ 120" with nothing to choose; step **3 Payment** contains a heading and
**nothing at all** — an empty 88 px card. Both step numbers are grey.

They fill in correctly once the name, phone and address are entered (`co_filled.png` — Inside Dhaka ৳ 80,
Cash on Delivery / Mobile Banking / Card & Bank). But a first-time buyer sees a checkout where two of the
three steps look broken, before they have typed anything.

**Severity: breaks the sale.**
**Smallest fix:** render the payment options immediately (COD pre-selected) and put one line under step 2 —
"Choose after your address" — instead of an empty card.

---

## ANNOYING

### 13 · Search — the field is not focused, so the first tap does nothing
`#/search` · `document.activeElement === input` is **false**, no `autofocus`. Tapping the magnifier in the
header loads a page where the customer must tap again to type. The input is also `type="text"` with no
`enterkeyhint="search"`, so the keyboard's return key says "return", not "Search".
**Fix:** focus the field on route entry; add `enterkeyhint="search"`.

### 14 · My account — the tab row arrives already scrolled, first tab clipped at x = 0
`.acc-chips` loads with **`scrollLeft = 16`**, so the active "My orders" chip sits at **x = 0** with its
rounded left corner cut off by the screen edge, while every other block on the page sits in the 16 px gutter
(`acc_0.png`). Content that has moved before the user touched it also reads as a glitch.
**Fix:** `scrollLeft = 0` on render; the right-hand mask already signals that the row scrolls.

### 15 · Build-your-own-set — the size row always breaks 4 + 1
`#/set` · five pills at **41 px** wide with a 4 px gap need 221 px; the card interior is **176 px**. S M L XL
land on one line and **XXL drops alone onto the next**, on every card, at every width (`set_1.png`). It also
makes the two cards in a row misalign internally: a card with five colours wraps its swatches to two lines and
pushes its Size label 36 px below its neighbour's.
**Fix:** `.bs-pills{grid-template-columns:repeat(5,1fr)}` with `font-size:12px` — 5 × 33 px + 4 × 2 px = 173 px, fits.

### 16 · Product page — gallery arrows are 40 px and white-on-light-grey
`.pdp-arrow` 40 × 40 at x 9 and x 391, drawn as white circles on the `#C5C6C7` photo backdrop
(`__p_essential_pique_polo_top.png`). Under the 44 px floor and almost invisible against the plate.
**Fix:** 44 × 44 with `background: rgba(255,255,255,.92)` and a 1 px `rgba(0,0,0,.12)` ring.

### 17 · Combo page — the in/cm toggle is 27 px tall, has no gap, and is under the floating button
`#/combo/polo-duo` · `in` = 34.9 × **27**, `cm` = 42.7 × **27**, sitting at x 343–378 and 378–421 — a
**0 px gap** between two controls that do opposite things, and `.wa-fab` covers `cm` outright.
**Fix:** 44 px tall, 8 px gap, and finding 2 removes the overlap.

### 18 · Footer — 940 px tall, five bands, four different background colours
Measured band heights and backgrounds: `ftr-s1` 92 px `#494847`, `ftr-s2` 194 px `#15302B`, `ftr-s3` 294 px
`#121211`, `ftr-s4` 292 px `#494847`, `ftr-s5` 68 px `#101010`. **Total 940 px — 98 % of the 956 px screen**,
on the bottom of every page, in grey → green → black → grey → black stripes.
**Fix:** merge `ftr-s1` and `ftr-s4` into the same tone as `ftr-s3`; the content needs no re-layout.

### 19 · Product page — the Delivery / Exchange / Returns values are 26 px links
`.rule-v` · "Free" 26.7 × **26**, "72 hours" 50.7 × **26**, "Size swap only" 86 × **26**, three in a row in a
408 px strip. These open the policy panels — the answers a COD buyer wants before ordering.
**Fix:** `.rule-v{min-height:44px;display:inline-flex;align-items:center}`.

### 20 · Build-your-own-set — the disabled "Add set to Bag" is 4.36:1
`#6E675E` on `#E6E3DE`, 16.5 px / 700. Needs 4.5:1. Also 155 × 54, pinned bottom-right of the sticky bar,
so the phrase "Pick at least 2 items" and the greyed button compete at the same weight (`set_1.png`).
**Fix:** `#5C564E` (5.3:1) — the build already does exactly this for `.btn-primary:disabled`.

### 21 · Green WhatsApp buttons — white text on `#1FA855` is 3.09:1
`.wa-btn`, 15 px / 700, needs 4.5:1. Appears on the PDP, bag, checkout, search and size-chart sheet.
**Fix:** `#157F3F` (5.0:1), or keep the green and put the label in `#0B3D1E`.

### 22 · Hamburger menu — the first row is indented 30 px further than the six below it
`.mn-row` text x: **"New in" 52**, Polos 22, T-Shirts 22, Shirts 22, Panjabi 22, Trousers 22, Hoodies 22.
"New in" carries an `.mn-ic` icon slot the six category rows do not, so the first item of the list looks
pushed in (`menu.png`).
**Fix:** give the six category rows the same icon, or drop the icon from "New in".

### 23 · Product page — the thumbnail strip is not on one line
`.pdp-thumb` y: selected **458.8**, the other four **459.8**. The selected thumb's 2 px border against the
others' 1 px lifts it by 1 px, so the row of five reads as slightly crooked.
**Fix:** `box-shadow: inset 0 0 0 2px var(--brand)` on the selected thumb instead of a thicker border.

### 24 · Thank-you — the password is printed on screen in plain text
`#/thanks/*` · "Log in with 01712345678 / Password ●●●●●●●●●● **Show**" and underneath
"Your password is your phone number — change it anytime" (`ty_0.png`). A phone number is public; this hands
anyone looking over a shoulder in a shop the account.
**Fix:** drop the password block; send the login link by SMS, which the page already promises to do.

### 25 · Checkout — the marketing consent box is pre-ticked
"Send me offers by SMS and WhatsApp. Stop anytime." is checked on arrival (`co_1.png`), buried under the terms
line and 40 px above the Confirm button. For a first-time village buyer it is consent they never gave.
**Fix:** unticked by default.

### 26 · Checkout — inputs are 42 px while every button is 46–52 px
`#co-name`, `#co-phone`, `#co-address` measure **42 px** tall; `.btn` is 46 px, `.pdp-mbar .btn` 52 px,
`.cat-ptools .btn` 46 px. The form fields are the smallest targets on the most important page.
**Fix:** 48 px, which is what `.input{padding:13px;font-size:16px}` gives when nothing overrides it.

### 27 · Every image — "[ demo image · front ]" burned in at 3.03:1
`.pimg-label`, `rgba(0,0,0,.45)` on `#C5C6C7` = **3.03:1** (needs 4.5), and it reads
"[ demo image · front ]", "[ buyer photo ]", "[ journal photo ]", "[ demo set image · updates with your colours ]".
A first-time buyer sees a bracketed note on every single photo and does not know whether the product is real.
The footer carries the same: "Hotline 09XXX-XXXXXX", "[support email]", "DBID: [your DBID number]",
"Trade licence: [number]".
**Fix:** hide `.pimg-label` behind the demo switch that already exists for the other demo chrome.

### 28 · Announce bar — ellipsises below 376 px
`.announce{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`. Fine at 440 (scrollWidth 440 = clientWidth)
and at 390. At **360 px** scrollWidth is **720 vs 360** — half the sentence is cut, and what is cut is
"…Cash on Delivery all over Bangladesh". Plenty of Android phones in Bangladesh are 360 px.
**Fix:** allow two lines under 400 px.

### 29 · Product page — "4.7 · 3 reviews" is a 20 px-tall button
`.pdp-rating`, **162 × 20**, scrolls to the reviews. Breadcrumb links are 35 × **19**. The header wordmark link
is 112 × **36**.
**Fix:** 44 px minimum on the rating button; leave the breadcrumb (it is secondary) but give it 8 px vertical padding.

### 30 · Product page — one mistake produces two different error messages
Tapping Add to Bag with no size selected shows **both** an inline "⚠ Please choose a size" under the pills
(with the pills turning red) **and** a black toast at the bottom saying the same thing — and the toast lands
on top of the "Build your own set" row (`flow_nosize.png`).
**Fix:** inline message only; it is the one next to the control the customer must fix.

### 31 · Checkout — two zero-size duplicate Confirm buttons in the DOM
Three elements match "Confirm Order · ৳ 930": one at 408 × 58, two at **0 × 0**. Harmless to look at,
but screen readers and any future tap-target tooling will trip over them.
**Fix:** render one.

### 32 · Checkout — "+ Add a delivery note (optional)" is the only control outside a card
It sits bare on the page background at x = 16 between two cards (`co_0.png`), underlined, 15 px.
Every other control on the page lives in a white card.
**Fix:** put it inside the card above it.

### 33 · Product page — the hero photo is landscape, every other product photo is portrait
`.pdp-main .pimg` = **440 × 357 (1.23:1)** at 440 × 956; the garment artwork is portrait (viewBox 200 × 222)
so it renders ~322 px wide and leaves **59 px of empty backdrop on each side**. Grid cards use
`.ratio-45` = **198 × 247.5 (0.80:1)**. At 390 × 844 the hero is **390 × 248** — 29 % of the screen,
versus 37 % at 440. The same garment is shown in three different shapes.
**Fix:** `aspect-ratio: 4/5` with a `max-height: 42vh` cap, so the shape matches the cards and the price still
clears the fold.

---

## COSMETIC

### 34 · Product pages run 4,611–5,663 px — 4.8 to 5.9 screens — on all 15 products
Measured document heights at 440 × 956: essential-pique-polo 4,611 · classic-cotton-panjabi 4,788 ·
linen-blend-shirt 4,788 · heavyweight-hoodie 4,854 · relaxed-twill-trousers 4,854 · oxford-cotton-shirt 4,923 ·
everyday-crew-tee 4,918 · textured-knit-polo 4,918 · long-sleeve-polo 4,917 · jersey-zip-polo 4,917 ·
striped-rib-polo 4,917 · pocket-tee 4,917 · heavy-cotton-tee 4,917 · slim-chino-trousers 4,989 ·
**contrast-collar-polo 5,663**. The good news: price (y 539–605) and the Add-to-Bag bar (fixed at y 889) are
on the first screen for **all 15**, and the size pills (y 789–839) are too. The length is below the fold, so
it is a scroll-fatigue issue, not a conversion blocker.

### 35 · 17 infinite animations run on a product page, 12 of them in the first screen
Counted with `getComputedStyle(...).animationIterationCount === 'infinite'` at rest:
product page **17** (annSweep ×1, logoSheen ×2, pdpSheen ×2, pdpSheenQ ×4, pdpPillShine ×5, ctaSheen ×3),
home 6 + the six JS marquees of finding 1, combo 6, category 4, set 4. Nothing on a product page is ever still.
**Fix:** keep the Order Now sheen and the announce sweep; retire the rest.

### 36 · Hamburger menu — 233 px of menu below the fold with no hint
`.modal` is 428 × 881 with `scrollHeight` **1,114**. The last visible row ends flush at the sheet edge, so
there is no half-row peeking to say "keep scrolling" (`menu.png`). The grab handle that used to signal a sheet
was removed in the round-5 floating-sheet change.
**Fix:** 12 px bottom padding inside `.modal-bd`, so the next row is half-visible.

---

## Suggestions — not defects, but they would sell more

1. **Put the size chart in the first screen as a size, not a link.** The chart button is a 138 × 40 control at
   y 741. For menswear sold COD, "which size am I" is the number-one reason a cart is abandoned and the
   number-one reason a parcel comes back. The "Find my size" card (408 × 56, y 898) is better copy than the
   Size chart button — swap their prominence.
2. **Say the exchange promise next to the buy button, not 600 px down.** "72-hour size exchange" currently lives
   in the `.pdp-rules` strip at y 1358. On a COD order the fear is "what if it doesn't fit" — one line under
   Add to Bag removes it.
3. **The bag upsell is the best-performing thing on the page and it is below the WhatsApp button.**
   "Add a 2nd polo, pay ৳1,500 for both — you save ৳200" with four colour chips (`bag_0.png`) is genuinely good;
   move it above the order summary and it will be seen before the total.
4. **Show the delivery charge on the product page.** The bag says "Add ৳650 more for free delivery" but the
   product page only says "Free home delivery". A buyer at ৳850 finds out about the ৳80 at checkout.
   State it where the decision is made.
5. **Bengali is a toggle in the footer.** The language pill is 81 × 40 at the very bottom of a 940 px footer.
   For this customer base Bengali is not a setting, it is the default — put the toggle in the header next to the
   bag, or detect and ask once.
6. **Three photo slots per product are placeholder-labelled "[ buyer photo ]".** Real customer photos in the
   review rail are the cheapest trust signal available to a Bangladeshi menswear brand and the slots are already built.
7. **"Cotton Socks, 3 pairs ৳350 · Goes in the same parcel"** at checkout is an excellent attach offer. One
   is not enough — two or three low-price items in the same strip would lift average order value with no new UI.
