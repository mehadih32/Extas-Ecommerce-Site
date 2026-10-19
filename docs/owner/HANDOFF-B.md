# HANDOFF-B — from Agent B (product page, combo, build-your-own-set)

Files I own and changed: `src/30-product.js`, `src/40-combo.js`, `src/41-set.js`,
`src/r11-pdp.css`, `src/r12-pdp.css`. I have not opened or edited anything else.

Below is everything I needed in someone else's file. Each one is either worked
around inside my own files (noted) or still open.

---

## 1. WhatsApp green `#1FA855` — WORKED AROUND LOCALLY, TOKEN STILL WRONG
**Owner: whoever owns `src/r12-acct.css` and `src/styles.css`.**

White on `#1FA855` measures **3.09:1** — below the 4.5 floor for 15px bold text.
The colour is hard-coded in at least ten places:

- `src/r12-acct.css` lines 45, 54, 149, 154, 155
- `src/styles.css` lines 466, 476, 538, 624, 673-674, 703, 719-720
- `src/styles.css:944` — `#pdp-qa .wa-btn` (an **id** selector, which outranks
  any class override; I had to use `!important` to beat it)

I darkened it to **`#13833F` (4.83:1 on white)** but only inside `.pdp-page`,
`.cb-wrap` and `.bs-wrap`. Everywhere else — bag, checkout, thank-you, account,
the global floating WhatsApp button (`.pdp-wafab`, `styles.css:538`) and the
size-chart modal (`.modal .wa-btn`, `styles.css:466`, which renders outside
`.pdp-page` so my scope does not reach it) — is still 3.09:1.

**Ask:** replace `#1FA855` with `#13833F` and `#17904A` with `#0F6C33` globally,
ideally as one `--wa-green` / `--wa-green-dark` pair.

## 2. `.bs-pills` is forced to wrap by `styles.css:381` — WORKED AROUND
`styles.css:381` sets
`.bs-pills{grid-template-columns:repeat(auto-fit,minmax(36px,1fr))!important}`.
On a 176px set-builder card that resolves to **four** columns, so five sizes
always broke 4 + 1 (audit A3). I override it from `41-set.js` with
`.bs-card .bs-pills{...!important}` plus a type-size step per size count.
If that `styles.css` rule is ever revisited, note that the card is 176px wide
and needs explicit columns, not `auto-fit`.

## 3. Header and footer controls under 44px — NOT MINE
Measured at 440x956 on every product page (the only ones left after my pass):

- `.logo.hide-d` 112 x **36**
- 15 footer links at 126 x **32** / 125 x **32** (`New in`, `Polos`, `T-Shirts`,
  `Shirts`, `Panjabi`, `Sets`, `Track my order`, `Size guide`, `Delivery`,
  `Exchange & returns`, `Ways to pay`, `FAQ`, `Our story`, `Contact`, `Careers`)
- breadcrumb links `Home` / `Sets` at 35 x **18.8** (combo page)

## 4. Footer contrast — NOT MINE
On every page: `.ftr-h` **1.12:1**, `.ftr-legal` **1.12:1**, `.ftr-sep` 1.12:1,
`.ftr-brand-sub` **1.48:1**, `.ftr-brand-note` 1.48:1. These are the only
contrast failures left on the product, combo and set pages.

## 5. Footer height — relevant to the "pages are too long" finding
The footer is **752px**, about 16% of a 4,780px product page. I took 1,930px off
the 17 product pages by tightening my own blocks; the next biggest single win on
these pages is not in my files.

## 6. Two infinite animations left on a product page — NOT MINE
After my pass a product page runs **3** infinite animations, 2 of them in the
first screen, and none of them are mine:
`annSweep` x1 (the announcement bar) and `ctaSheen` x2-3 (`.btn-primary::after`
and `.ftr-pay-sheen`). `ctaSheen` on the buy bar runs forever in the first
screen. The shared `.sweep` engine already stops after three passes — worth
giving `ctaSheen` the same treatment.

## 7. FYI — I did NOT touch the shared `.sweep` or the `SMOOTH` engine
As agreed. Two consequences:
- `r11-pdp.css` still contains the old per-line `.pdp-page .sweep` gradient
  block (lines ~184-212). It is now completely inert — `styles.css:1272`
  `.sweep.sweep.sweep` outranks all of it. I left it in place rather than
  delete work that is mid-flight in another agent's file. It can be deleted
  once the new engine is final.
- The product page's new backend-editable payment line (`PDP_PAYLINE` in
  `30-product.js`) opts into the shimmer by adding the shared `.sweep` class.
  It does not implement its own.
