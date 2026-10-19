# HANDOFF-A — from the agent that owns the shared core
`02-core.js · 03-layout.js · 20-home.js · 21-category.js · styles.css · r11-home.css · r12-home.css · r11-cat.css · r12-cat.css`

Everything below is a change that belongs in a file I do not own. Nothing here is
blocking — the site builds and works as it is — but each item is either dead code
left behind by a fix of mine, or a tidy-up that should land where the owning
agent is already working.

---

## 1. `r11-pdp.css` and `r12-pdp.css` — the old text-clip sweep is now dead code

**What I did.** C1 was fixed in `styles.css` (search for `ROUND 13 — SHARED CORE
CORRECTIONS`). `.sweep` no longer paints its letters with a moving
`background-clip:text` gradient; the letters keep their solid colour and a
translucent band travels over the element's box, three passes then stop.

Because `styles.css` is concatenated **first**, my rules carry the class three
times (`.sweep.sweep.sweep`) purely to out-specify the later PDP rules. That
works, but it leaves two blocks of CSS that now do nothing:

* `r11-pdp.css`, the block headed `28 / 38. THE LIGHT SWEEP` — the
  `@keyframes pdpSheen`, `.pdp-page .sweep`, the four per-element
  `background-image` gradients, `.pdp-page .pdp-stock.sweep>span`, and the
  `prefers-reduced-motion` block under it.
* `r12-pdp.css`, the block headed `22 + 29. THE LIGHT SWEEPS` — `@keyframes
  pdpSheenQ`, `.pdp-page .pdp-lbl.sweep`, `.pdp-page .pdp-allc.sweep`,
  `.pdp-page .pdp-stock.sweep>span`, `.pdp-page .pdp-lblrow .pdp-lbl.sweep`,
  and the `.pdp-page .pdp-pfd.sweep` rules higher up.

**Please delete them.** When they are gone, tell me and I will drop the triple
class back to a single `.sweep`, which is what the rule should read as.

Do **not** keep `-webkit-text-fill-color:transparent` or `color:transparent` on
anything with class `sweep`. Measured on the live page before the fix: the bright
stop of that gradient was **1.06:1** against `#F4F3F0` and the mid stop
**2.31:1**. After the fix the stroke-core ink measured **8.61:1 at its worst
frame** and the element's computed `color` never changes at all
(`rgb(21,48,43)` = 12.40:1 for the free-delivery line).

`.pdp-page .pdp-pills.shine .size-pill::after` is **correct already** — it is the
same travelling-highlight pattern. Leave it alone.

---

## 2. `01-data.js` — three things want to move into it

### a) `DB.catBanners` — the category banner slot (K3)
I built the in-grid banner slot in `21-category.js`. Its config array lives there
(`CAT_BANNERS`) only because I may not edit `01-data.js`. The code already reads
`DB.catBanners` first and falls back to the local array, so **moving it is a
cut-and-paste with no other edit**:

```js
DB.catBanners = [
  {
    id:      'eid-10',          // owner's own reference, unique
    scope:   'all',             // 'all', or ['panjabi','shirts'] — category ids
    kind:    'offer',           // 'offer' | 'occasion' | 'campaign'  (styling only)
    eyebrow: 'Eid offer',       // optional small line above
    title:   '10% off every panjabi',               // the line that must read
    sub:     'Applied in the bag. Until the 24th.', // optional
    cta:     {label:'Shop the Eid edit', href:'#/c/panjabi'},  // optional
    from:    '2026-03-01',      // optional, inclusive, YYYY-MM-DD
    to:      '2026-03-24',      // optional, inclusive
    active:  true               // optional, defaults true
  }
];
```
First still-running match wins, so the array is in priority order. With the array
empty **nothing renders and no grid cell is left** — that is the demo's current
state and it is the correct empty state. The slot is one standard size on every
device: full grid width, 104 px on a phone, 120 px from 768 px up (`.cat-ob` in
`r12-cat.css`).

### b) `DB.catPriceBands` — the hand-set price filter override (K1)
`CAT_PRICES` is gone. The three price bands are now computed per category from
that category's own lowest and highest price, rounded to recognisable numbers
and recomputed whenever the prices change. The override hook is
`CAT_PRICE_OVERRIDE` at the top of `21-category.js`:

```js
CAT_PRICE_OVERRIDE['caps']    = [300, 600];    // two cut points, in taka
CAT_PRICE_OVERRIDE['jackets'] = [2500, 4000];
CAT_PRICE_OVERRIDE['socks']   = [];            // [] = show no price filter
```
If you want it in data, add `DB.catPriceBands` and I will read that first.

### c) The phone numbers are already correct — do not "fix" them
`DB.whatsapp = '8801XXXXXXXXX'` and `DB.hotline = '09XXX-XXXXXX'` are the
owner's intended placeholders and must stay as they are. Every WhatsApp link and
every hotline link on the site now goes through `waNumber()`, `waLink()`,
`hotlineNumber()` and `telLink()` in `02-core.js`, which pass the values through
untouched. That block carries the BACKEND HOOK comment. **Nothing else anywhere
should hold a number of its own.**

---

## 3. `52-thanks.js` and `71-pages.js` — read the hotline through the hook

Both still read `DB.hotline` directly:

* `52-thanks.js` ~line 414: `'WhatsApp '+esc(DB.whatsapp)+' · Hotline '+esc(DB.hotline)`
* `71-pages.js` ~line 76: `var hot = DB.hotline || '[hotline number]';`

Please change them to `hotlineNumber()` / `waNumber()`, and any `href="tel:…"`
to `telLink()`. Functionally identical today; it keeps the single point of
change real when the backend fills the number in.

---

## 4. `30-product.js` — one line to delete when the PDP CSS is cleaned up

`30-product.js` line ~389 carries a comment that is now out of date:

> *"…which keeps the letters at full contrast — a text sweep would grey them out."*

After the C1 fix a `.sweep` no longer greys anything out, so `.pdp-pills.shine`
and `.sweep` are the same technique under two names. Worth a note when you next
touch it. No behaviour change needed.

---

## 5. What I changed in the shared core that your files sit on

So you are not surprised by a diff you did not make:

| file | change | why it may touch you |
|---|---|---|
| `02-core.js` | `SMOOTH` holds for **4000 ms** (was 2600) on pointerdown / pointermove-with-button / touchstart / touchmove / wheel, and on mouseleave. `scroll` is deliberately **not** a hold trigger — the drift writes `scrollLeft` itself and it would freeze the row for good. | every slider on every page, yours included |
| `02-core.js` | `SMOOTH.start()` now sets `el.scrollLeft = 0` itself, and a `dir:1` track starts at exactly `_smHalf` (was `_smHalf - 1`). | tracks always start card-aligned |
| `02-core.js` | new `waNumber() / hotlineNumber() / waLink() / telLink()` | see §2c |
| `02-core.js` | two new routes: `#/journal` and `#/journal/<slug>` | nothing of yours uses those paths |
| `03-layout.js` | the floating WhatsApp button no longer drifts; it is fixed low-right above the bottom nav, is hidden on `home` and `product`, and hides itself whenever any part of `.ftr` is on screen | `FAB_PAGES` in `03-layout.js` is the per-page switch if it is in your way |
| `03-layout.js` | the demo gear parks itself in the empty part of the header and steps right until `elementFromPoint` finds nothing tappable | it used to sit on your controls; it should not any more — shout if it does |
| `styles.css` | `.hdr-in>.row{gap:10px}` (Search/Bag were 2 px apart) | any header you render |
| `styles.css` | `.hdr .logo` / `.ftr .logo` no longer transparent-filled | the mark reads as EXTAS, not EXTA_ |
| `r12-home.css` | the footer is two bands (brand green, footer black) and 752 px instead of 940 px | the footer is on every store-layout page |

---

## 6. Not mine, found while measuring — someone should own these

1. **Horizontal overflow at 360 px.** `document.scrollWidth` is **413 on a 360 px
   viewport** on every category page. It is **not** a regression — the pristine
   baseline build measures the same 413 — and 440 px is clean (440 exactly, every
   route). Worth a look from whoever owns the page shell.
2. **`#/set` and `#/search`** both render a product grid under the floating
   WhatsApp button, same as the category pages — see the note in my report about
   what the disc still overlaps.
