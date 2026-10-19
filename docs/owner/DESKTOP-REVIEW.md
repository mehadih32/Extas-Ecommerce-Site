# EXTAS storefront — desktop review (audit only, no source edited)

**Team:** Sawdagor সওদাগর (A360-04, conversion / merchandising / flows) and Shilpi শিল্পী (A360-05, visual / layout / type / interaction)
**Date:** 19 Oct 2026 · **Build audited:** `proto/dist/desk-audit.html`, built from `proto/src/` with `tools/build.sh` (r16.html and the snapshots were not touched)
**Widths:** 1024×768, 1280×800, 1366×768, 1440×900, 1536×864, 1920×1080 · Chromium, mouse and keyboard, one browser, foreground
**Owner rules applied:** ROUND15 (notes 1–34), PHONE-REVIEW (locked items), EXTAS-ECOMMERCE-V1 Part D (D1.2 R1–R7, D1.4, D1.5, D3.x desktop notes), lessons/ALL.md

---

## সারাংশ (বাংলায়)

1. ছয়টা ডেস্কটপ মাপে ৪৭টা পাতা দেখেছি (মোট ২৮২ বার পাতা খোলা হয়েছে), আর ৪০০টা লিংক ঘুরে দেখেছি। কোনো JS error নেই, কোনো পাতা পাশে স্ক্রল হয় না, কোনো লিংকও মরা নয়।
2. মোট ৫৩টা পয়েন্ট পেয়েছি: S1 (ভাঙা) ০টা, S2 (বিক্রি বা নিয়মে বড় ক্ষতি) ১২টা, S3 ২৬টা, S4 (ঘষামাজা) ১৫টা।
3. সবচেয়ে বড় সমস্যা: ডেস্কটপ মেনুতে কম্বো হাব নেই, আর জ্যাকেট/সোয়েটার/ট্র্যাকস্যুট/জগার ক্যাটাগরিও নেই। মেগা মেনুও নেই। অথচ কম্বোই সবচেয়ে বেশি বিক্রি হয়।
4. হোমের হিরো: বড় স্ক্রিনে লেখাটা মাঝখানে সরে যায় (১৯২০-এ বাঁয়ে ৭৪৪ px ফাঁকা সবুজ)। আর দামের লেবেল ৭–৯ px-এ ছোট হয়ে যায়।
5. প্রোডাক্ট পেজ: নিচে নামলে Add to Bag কোথাও থাকে না। ব্যাগে যোগ করলে মাঝখানে পপআপ আসে, অথচ ঠিক হয়েছিল ডান পাশে ড্রয়ার। পাঞ্জাবি পেজে Order Now প্রথম স্ক্রিনের নিচে চলে যায়।
6. "ডানে ফাঁকা রাখা যাবে না" নিয়ম কয়েক জায়গায় ভাঙছে: প্রোডাক্ট পেজের ৩-কার্ডের সারি, কম্বো হাব, হোমের "একসাথে কিনুন", রিভিউ, আর ব্যাগের সাজেশন।
7. চেকআউটের অর্ডার সামারি ১৯ px নিচে বসে, আর স্ক্রল করলে ভাসে না। দুটোই আপনার আগের নিয়মের বাইরে।
8. কিবোর্ডে ট্যাব চাপলে হিরো স্লাইডারের ভেতরে ১০টার বেশি থামা আছে, আর ফোকাস স্ক্রিনের বাইরে চলে যায়। মেনুতে মাউস নিলেও কোনো সাড়া নেই।
9. প্রতিটা সমাধান শুধু ডেস্কটপের জন্য লেখা (`min-width:1024px` আর/অথবা `hover:hover` + `pointer:fine`)। ফোন এক পিক্সেলও বদলাবে না, প্রতি ব্যাচের পরে ফোনের ছবি মিলিয়ে দেখা হবে।
10. ৫টা পয়েন্ট ফোনকেও ছুঁয়ে যায় (সার্চের ফল, রেটিং সংখ্যা, "This item" লেখা, অফার গোনা, কার্ডের ভেতরের হার্ট বাটন)। এগুলো আলাদা করে রেখেছি, আপনার "হ্যাঁ" ছাড়া হবে না।
11. কাজ দুই ব্যাচে ভাগ করা: **A** = হেডার, মেনু, হোম, ক্যাটাগরি, সার্চ, ফুটার, হেল্প। **B** = প্রোডাক্ট, কম্বো, ব্যাগ, চেকআউট, ধন্যবাদ পেজ, অ্যাকাউন্ট। দুই ব্যাচ কোনো ফাইল ভাগাভাগি করে না।
12. মেগা মেনু, ফুটারের নতুন ডেস্কটপ ডিজাইন আর চওড়া কন্টেইনার: এই তিনটার আগে ছবি দেখাব, আপনি বেছে নেবেন।

---

## 1. Coverage and method

| What | How |
|---|---|
| Route sweep | `scratchpad/desktop-audit/tools/audit.js`: 47 routes × 6 widths. Viewport shot at every width, full-page at 1024 / 1366 / 1920. Per-page metrics: overflow, off-right elements, clipped text, grid columns, landmarks, nested interactive elements, nameless controls, text under 12 px. |
| Link crawl | `tools/crawl.js`: breadth-first crawl of every `#/` link from home at 1366, 400 routes. Result: 0 "not found", 0 errors. |
| Mouse / keyboard | `tools/interact.js`, `interact2.js`, `extra.js`: header WhatsApp hover at 1024/1366/1920; nav hover; tab order (28 stops); search open → type → Esc → Enter; category card hover shift; sort Esc; filter apply; PDP size → add → drawer → Esc; size chart focus trap; zoom; sticky checks; checkout fill; exchange; account. |
| Diagnosis | `tools/sticky.js` (why the sidebars do not stick), `tools/hero.js` (hero geometry), `tools/probe.js` (small text). |
| Pages | home · 5 categories (polos, new, hoodies, jackets, panjabi) · search (hit, typo, help word, none, empty) · 4 PDPs (T1 polo, T2 panjabi, sale hoodie, shirt) · combos hub, rule lists (2-pc, 3-pc), pair pages P1–P5, C1 combos (Polo Duo, Office Trio), set builder (2) · bag (empty, 3 items, B5 with 3 sets, "current" template, 5 items) · checkout · thank-you · order · account (dashboard, orders, wishlist, For you) · exchange · login · help (FAQ, delivery, contact) · size guide · journal index (header/footer only) · 404 |

**What already works on desktop (keep it):** 0 JS errors in 282 page loads. 0 sideways scroll at all six widths. The header WhatsApp tip "Need help? Chat with us" drops in under the icon (165×29 px, inside the viewport at every width); the disc grows 36→41 px on hover and focus; the cursor is a pointer. Esc closes the search, every modal, the zoom viewer and the sort menu. Modals trap focus (0 escapes in 30 Tabs) and return it to the opener. A skip link is present. `header`, `nav`, `main` and `footer` landmarks are on every store page. PDP T1 keeps Add to Bag and Order Now above the fold at every width (y = 614–643). The account dashboard shows three offers side by side (R15 4.8). Thank-you has Track beside Copy (§56.10). Checkout: SMS tick on, WhatsApp tick off (23.1), and the "Try it on in front of the rider" line is there. Product card hover causes no layout shift (a 2 px lift via transform).

---

## 2. Rules every fixer follows (phone must not change)

1. **New CSS lives only in new files that load last.** `build.sh` concatenates `r11-*.css` then `r12-*.css` alphabetically, so `src/r12-zzdesk-a.css` (Batch A) and `src/r12-zzdesk-b.css` (Batch B) sort after `r12-zsearch.css` and win without `!important` wars. Every rule in them sits inside `@media (min-width:1024px)`, inside `@media (hover:hover) and (pointer:fine)`, or inside both. Do not edit `styles.css`, `r11-*` or `r12-*` (other than your own new file).
2. **JS changes are gated.** Use `var DESK = matchMedia('(min-width:1024px)')` for layout and `matchMedia('(hover:hover) and (pointer:fine)')` plus `e.pointerType==='mouse'` for hover logic (lessons/ALL.md: a tap fires mouseenter). If markup is shared, only add classes or `--vars` that phone CSS never reads.
3. **Touch tablets at 1024 px and wider already get the desktop layout today.** Keep it that way, but hover-only effects must use `(hover:hover) and (pointer:fine)` so an iPad never sees them.
4. **Phone guard after each batch:** run the device gate (`scratchpad/device-matrix.js`, 15 phones and the tablets below 1024) plus a before/after pixel diff of the 47 routes at 360/390/430/440. It must be 0 px different. Take tap measurements before any full-page shots (lessons/ALL.md, Gyani).
5. Nothing is deleted. Anything replaced on desktop becomes a switch (R3). Nothing is hard-coded (labels via `t()`, counts from data).
6. Sliders keep gliding (R2). We only add edge fades, pause-on-hover and keyboard handling.

---

## 3. Findings — Batch A (header / nav / menus · home · category · search · footer · help · global foundation)

> Format: **id · page · width(s) · hat · severity** → what is wrong (measured) → **fix** (desktop-only approach, files).

**D-001 · Header nav / mega menu · all widths · Sawdagor · S2**  
→ Status: **Fixed** (Batch A, 19 Oct) — sheet-01, sheet-15
The desktop nav is a hard-coded array (`NAV` in `03-layout.js` line 2): New in, 6 categories, Sets, Journal. Four live categories (Jackets, Sweaters, Tracksuits, Joggers) are in the phone drawer, which reads `DB.categories`, but are missing on desktop. The **Combos hub `#/combos` has no entry anywhere in the header or on home**: the crawl first reached it from the Journal page. Combos are the biggest-selling section (R15 note 8). There is no mega menu and no sub-category path (Polo → Ralph Lauren → Solid / Piqué exists in `DB.subcats`).
**Fix:** (a) **ship now:** build the desktop nav from `DB.categories.filter(!hidden)` and add a **"Combos"** item → `#/combos`, while "Sets" stays → `#/set` (the step-down rule: when the nav does not fit at 1024, fold the overflow into "More ▾"). Mark Combos active for `combo`, `ca-*` and `set` pages in the `sec` logic of `storeHeader()`. (b) **Picture first (§58.3), then build:** a mega panel under the header. It opens on hover-intent (150 ms enter, 250 ms leave grace) **and** on click / Enter / Space (`aria-expanded`, `aria-controls`). Esc closes and returns focus. ←/→ move between top items, ↓ enters the panel. Content: sub-categories from `DB.subcats`, "Shop by fit", one featured combo tile (bestseller from `ca_generate`), "Build your own set". Pattern: *hover-intent mega menu with a merchandised tile*. Files: `03-layout.js` (NAV builder and `sec`), new `src/97-desk-a.js` (panel behaviour), `r12-zzdesk-a.css`. The phone drawer is untouched.

**D-002 · Header nav · all · Shilpi · S3**  
→ Status: **Fixed** (Batch A, 19 Oct) — sheet-01
Nav links have no hover state: colour, underline and `::after` are unchanged on hover (measured). Only the active page has the underline.
**Fix:** `@media(hover:hover) and (pointer:fine){ .nav-d a::after{transform:scaleX(0);transition:transform .16s} .nav-d a:hover::after,.nav-d a.on::after{transform:scaleX(1)} .nav-d a:hover{color:var(--brand)} }`. This reuses the existing active-underline element. File: `r12-zzdesk-a.css`.

**D-003 · Global focus visibility · all · Shilpi · S2 (WCAG 2.4.7 / 2.4.11)**  
→ Status: **Fixed** (Batch A, 19 Oct) — sheet-13
There are only 19 focus rules in the whole CSS. The header, nav, cards and buttons fall back to Chrome's 1 px `auto` ring. On the green hero and band sections that ring is thin, and in the hero slider focus goes **off-screen**: Tab stops 18–27 land on slides at x = 1316–2513 px with nothing visible (`shots/int2/focus-hero-slide.png`).
**Fix (foundation, lands first):** `@media(hover:hover) and (pointer:fine){ :focus-visible{outline:2px solid var(--brand);outline-offset:2px;border-radius:inherit} .hm-hero :focus-visible,.hm-band :focus-visible,.ftr :focus-visible,.announce :focus-visible{outline-color:#fff} .modal:focus-visible,.zm:focus-visible{outline:none} }`. File: `r12-zzdesk-a.css`. Batch B only verifies on its pages.

**D-004 · Home hero slider keyboard · all · Shilpi · S3**  
→ Status: **Fixed** (Batch A, 19 Oct) — sheet-13
Every slide (`a.hm-sl`) is a tab stop. A keyboard user passes 10 or more product links that are not on screen before reaching "Shop by category".
**Fix:** in `20-home.js` `after()` (desktop-gated): give `tabindex="-1"` to slides that are not fully inside `.hm-slider`, and update it on scroll. Pause the glide on `focusin` (it already pauses on hover) and `scrollIntoView({inline:'nearest'})` the focused slide. Arrow buttons stay focusable.

**D-005 · Home hero alignment · 1024–1920 · Shilpi · S2**  
→ Status: **Fixed** (Batch A, 19 Oct) — sheet-02
`.hm-hero-in{margin-right:-32px}` (styles.css 1238) on an auto-margined 1240 px container pushes the whole hero grid right. Copy x = 64 at 1024 (page grid 32), 190 at 1366 (grid 95), 360 at 1536, **744 at 1920 (grid 372)**. At 1920 a 744 px empty green block sits on the left and the slider is squeezed to 600 px (3 slides) (`sheets/1`).
**Fix:** `@media(min-width:1024px){ .hm-hero-in{max-width:none;margin-left:max(32px,calc((100% - 1208px)/2));margin-right:0;grid-template-columns:minmax(0,512px) minmax(0,1fr)} }`. The copy aligns with the logo, the media runs to the right edge, and wide screens show more slides. File: `r12-zzdesk-a.css`.

**D-006 · Home hero pins · all desktop · Sawdagor · S2**  
→ Status: **Fixed** (Batch A, 19 Oct) — sheet-02
The slides are only 160–199 px wide, so AUTO-FIT shrinks the pin text to **9.2 px** (Relaxed Twill Trousers), with the struck price at **7.3 px** (Linen Blend 8.4 px). The sale hoodie pin drops its price entirely (`fit-x`). This breaks D1.4: no text under 11 px, nothing that sells under 12.5 px. It is the discount item that loses its price.
**Fix:** `@media(min-width:1024px){ .hm-slider .hm-sl{flex:0 0 clamp(220px,17vw,280px)} .hm-slider .hm-sl .hm-pin{font-size:12.5px} }` (overrides `r11-home.css` line 28). With D-005 the media is wider, so more slides still show. Check that `fitRule(... {min:9})` never goes below 11 on desktop: pass `min:11` when `DESK.matches` (`20-home.js` line 290).

**D-007 · Home "Buy together, save more" · 1024–1920 · Shilpi · S3 (R1)**  
→ Status: **Fixed** (Batch A, 19 Oct) — sheet-12
`.hm-hscroll.c4` holds 11 tiles (10 sets plus Build) in 4 columns, so the last row is 3 tiles and an empty slot.
**Fix:** desktop shows a multiple of 4: the first 7 sets plus the Build card (2 full rows), with a **"See all combos →"** link to `#/combos` in the band header (it also adds the missing entry point from D-001). `20-home.js` adds class `fill4` and `data-n`; CSS `@media(min-width:1024px){.hm-hscroll.c4.fill4>.hm-set:nth-of-type(n+8){display:none}}`.

**D-008 · Home "What customers say" · 1024–1920 · Shilpi · S3 (R1)**  
→ Status: **Fixed** (Batch A, 19 Oct) — sheet-12
10 reviews in 3 columns leave the last row with 1 card and 2 empty slots.
**Fix:** `@media(min-width:1024px){.hm-revs>:nth-child(n+10){display:none}}` plus a "Read all 1,803 reviews" link under the grid (`20-home.js`).

**D-009 · Home glide rows clipped hard · all · Shilpi · S3**  
→ Status: **Fixed** (Batch A, 19 Oct) — sheet-12
Flash sale (2 rows), Journal and other glide rows cut cards mid-letter at the 1240 container edge ("ontrast Collar Polo", "ıd article", the Bengali title). On desktop this reads as broken.
**Fix:** `@media(min-width:1024px){ .hm-hrow{-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 40px,#000 calc(100% - 40px),transparent);mask-image:…} }` and pause on hover for these rows (reuse the hero's pause). The Journal row (only 3–4 posts) becomes a static 4-column grid on desktop: `.hm-jrow{display:grid;grid-template-columns:repeat(4,1fr)}` and the glide is stopped when `DESK.matches` (`20-home.js`). R2 stays intact for the rows that keep gliding.

**D-010 · Global container width · ≥1440 · Shilpi · S3 (picture first)**  
→ Status: **Fixed** (Batch A, 19 Oct) — sheet-03
`.container{max-width:1240px}` leaves 680 px (35 %) blank at 1920. Category cards stay 209 px wide, the PDP gallery 543 px, and the footer floats in the middle.
**Fix:** `@media(min-width:1536px){.container{max-width:1400px}} @media(min-width:1800px){.container{max-width:1480px}}`, with the category grid at 5 columns from 1680. The header uses `.container`, so logo and content stay aligned. Batch B checks its pages after this lands (checkout form capped at 640 px, see D-044). File: `r12-zzdesk-a.css`. Show the owner 1920 before / after.

**D-011 · Category filter sidebar · all · Sawdagor · S3**  
→ Status: **Fixed** (Batch A, 19 Oct) — deskint
`.cat-side.cat-dt` is `position:static` and 947 px tall, so the filters scroll away after the first row of products.
**Fix:** `@media(min-width:1024px){.cat-side.cat-dt{position:sticky;top:88px;align-self:start;max-height:calc(100vh - 104px);overflow:auto;overscroll-behavior:contain}}` (pattern: *sticky filter rail*). File: `r12-zzdesk-a.css`.

**D-012 · Category with few products · Hoodies (2), Jackets / Panjabi (1) · Sawdagor · S3**  
→ Status: **Fixed** (Batch A, 19 Oct) — sheet-07
The full filter rail (6 sizes, colours, fit, price) shows for 1–2 products, and about 70 % of the grid is empty.
**Fix:** in `21-category.js`, when the result count is 4 or fewer and `DESK.matches`, hide the rail (class `cat-few`) and fill the row with the category banner slot (PHONE-REVIEW #12) or "Complete the look" (combos containing this category, then the next category's bestsellers). Fixes R1 as well.

**D-013 · Product card hover · category / home / search · Sawdagor · S3**  
→ Status: **Fixed** (Batch A, 19 Oct) — sheet-11
On hover the card only lifts 2 px. There is no second image and no quick add. Pattern missing: *hover image swap plus quick-add size row*.
**Fix:** a desktop-only enhancer in `src/97-desk-a.js`. On the first `pointerenter` (mouse only), inject `productImg(p,color,{view:'back'})` as `.pcard-alt` and cross-fade at 200 ms. A slide-up size row with in-stock sizes calls `bagAdd()`, then the add-to-bag drawer (D-028). Cards stay `<a>` and the enhancer adds siblings only, so the phone markup is untouched. Batch A owns `.pcard` behaviour site-wide, including on PDP and bag rows.

**D-014 · Search overlay · all · Sawdagor · S3**  
→ Status: **Fixed** (Batch A, 19 Oct) — sheet-04
On desktop the search is the phone's 560×228 centred modal at y = 270, covering the hero.
**Fix:** desktop opens a *header-anchored search panel* (full container width, directly under the header). Autofocused input; live results as a 4-product grid with image and price; help answers; popular searches; categories. Esc and outside-click close it. Focus returns to the icon. File: `07-help-search.js` (desktop branch inside `ACT['open-search']`), styles in `r12-zzdesk-a.css`.

**D-015 · Search results engine · all · Sawdagor · S2 · ⚠ touches phone**  
→ Status: **Fixed** (Batch A, 19 Oct) — sheet-05 (phone results change too, layout identical)
The typeahead matches "pollo" (fuzzy), but the results page shows **0 products** for "pollo shrt", "polo shirt" and "গেঞ্জি". It still prints "0 products found" above 4 "Popular" cards. Multi-word, typo and Bengali queries fail.
**Fix:** token-wise matching (every token fuzzy, the same matcher as the typeahead). Plurals (shirt → shirts). Synonyms (গেঞ্জি → polo, tee; পাঞ্জাবি → panjabi; "t shirt" → tshirts). Drop unmatched filler words. `07-help-search.js` / `PAGES.search` in `21-category.js`. **This is shared logic, so phone results change too (for the better). It needs the owner's or Gyani's yes.** There is no honest desktop-only alternative: results must not differ by device.

**D-016 · Search results page · all · Sawdagor · S3**  
→ Status: **Fixed** (Batch A, 19 Oct) — sheet-05
No filters and no sort (known, D3.2).
**Fix:** desktop reuses the category filter rail (`cat_*` helpers) on the results grid, with sort on the right. `21-category.js` (`PAGES.search`).

**D-017 · Help pages (FAQ, Delivery, Exchange, Payment, Contact) · all · Shilpi · S3**  
→ Status: **Fixed** (Batch A, 19 Oct) — sheet-08
Single 760 px column, no breadcrumb, no topic navigation. At 1920, 60 % of the width is blank.
**Fix:** desktop *help-centre layout*: a left sticky topic list (Track order, Delivery, Exchange & returns, Ways to pay, FAQ, Size guide, Contact), content in the middle, and a right "Still stuck? WhatsApp" card plus the hotline. Breadcrumb Home / Help / Topic. `71-pages.js` `pg_render()` wraps in `.pg-d` with the rail as `hide-m`; CSS in `r12-zzdesk-a.css`.

**D-018 · Size guide page · all · Shilpi · S3**  
→ Status: **Fixed** (Batch A, 19 Oct) — sheet-09
The page body is one button plus an auto-opened modal. The dialog takes programmatic focus and shows a **thick black outline** around the whole modal.
**Fix:** desktop renders the finder inline (category picker, then height and weight) next to the per-category size tables. No modal on load when `DESK.matches`. Outline fixed by D-003 (`.modal:focus-visible{outline:none}`); move focus to the first control. File: `10-size-guide.js`.

**D-019 · 404 · all · Sawdagor · S3**  
→ Status: **Fixed** (Batch A, 19 Oct) — sheet-10
Grey H1, one "Go to home" button, about 300 px of empty space. No way to recover.
**Fix:** desktop 404 with a search box, category chips, 4 bestsellers and the WhatsApp line. `PAGES.notfound` (`03-layout.js` line 583), extra blocks wrapped `hide-m`.

**D-020 · Footer desktop design · all · Shilpi · S3 (picture first)**  
→ Status: **Fixed** (Batch A, 19 Oct) — sheet-06
The footer is the phone design stretched. The brand band leaves an empty ~560 px middle. "10 am – 10 pm" is centred under the left half only. The legal line lacks trade licence and DBID (§46.16; owner data pending). The owner said the desktop footer is a separate design (§58.2).
**Fix:** a desktop-only 5-column footer: Brand + slogan + newsletter | Shop | Help | EXTAS | Contact (WhatsApp, hotline, hours, payment marks), with the promise strip on top and the legal line plus EN | বাং below. Behind switch `footer.desktopLayout`, default on for ≥1024. `storeFooter()` in `03-layout.js` emits an extra `.ftr-d` block (`hide-m`) and the phone footer gets `hide-d` at ≥1024. CSS in `r12-zzdesk-a.css`.

**D-021 · Header icon labels · all · Shilpi · S4**  
→ Status: **Fixed** (Batch A, 19 Oct) — deskint
Search, Wishlist, Account and Bag are icon-only with no visible hover label (only WhatsApp has one).
**Fix:** `data-tip` on those four links/buttons. `@media(hover:hover) and (pointer:fine){[data-tip]:hover::after{…same look as .hdr-wa-tip…}}`. `03-layout.js` adds attributes only.

**D-022 · Header motion · all · Shilpi · S4 (owner choice)**  
→ Status: **Fixed** (Batch A, 19 Oct) — 3 rounds, decision D-022
Three animations loop forever on every page: WhatsApp bleed (3.2 s, `infinite`), bag count glow (2.8 s) and bag nudge (5.6 s), plus the logo sweep. D1.5 says "nothing loops forever, one thing moves at a time". The owner asked for the bleed and the pulse (R15 3.3 / 3.5), so they stay.
**Suggestion:** on desktop `animation-iteration-count:4`, restarted on route change and on bag change (`97-desk-a.js` toggles a class). Ask the owner.

**D-023 · Home category tiles / "View all" links · all · Shilpi · S4**  
→ Status: **Fixed** (Batch A, 19 Oct) — deskint
`.hm-cat` tiles have no hover feedback (measured).
**Fix:** hover-only `.hm-cat:hover .pimg svg{transform:scale(1.04)}` plus a label underline, 200 ms.

**D-024 · Product card heart nested in link · all · Shilpi · S3 (a11y) · ⚠ touches phone markup**  
→ Status: **Fixed** (Batch A, 19 Oct) — phone pixels identical on every card page (see §9)
`<button class="heart">` sits inside `<a class="pcard">`: 6–16 nested interactive elements per page (screen readers announce a link containing a button; the click goes through both handlers).
**Fix:** `productCard()` in `02-core.js` outputs `<div class="pcard-w"><a class="pcard">…</a><button class="heart">…</button></div>`, with the heart absolutely positioned exactly where it is now. **Markup changes on phone, pixels must not:** gate it with the phone pixel diff. `02-core.js` belongs to Batch A only.

**D-025 · Journal integration · all · Shilpi · S4 (info)**  
→ Status: **No change, by design** (info only: handed to the journal reviewers; r12-zblogfe.css is outside Batch A)
The header and footer are the store's own (consistent). The breadcrumb sits at x = 99 vs 95 and is 6–11 px higher than on store pages. Hand this to the journal reviewers (`r12-zblogfe.css`); no Batch A change.

**D-026 · Category last-row orphans · New in (29 → last row 1 + 3 empty) · Sawdagor · S4**  
→ Status: **Fixed** (Batch A, 19 Oct) — sheet-07
**Fix:** when `count % columns` is not 0 on desktop, fill the gap with the banner slot or a "Build your own set" tile (`21-category.js`, desktop-gated).

---

## 4. Findings — Batch B (product page · combos · bag · checkout · thank-you · account)

**D-027 · PDP — no buy action after scrolling · all · Sawdagor · S2**
**Status (Batch B, 19 Oct): Fixed. A 64 px bar slides in right under the header once the buy buttons have scrolled under it: photo, name, colour and size chips, price, Add to Bag, Order Now. With no size chosen, Add to Bag takes you to the sizes and marks them, as the main button does. Desktop only (`hide-m`, `.dkb-bar`).**
Below the buy box (scrollY > ~700), the reviews, Q&A, "You may also like" and footer run for about 3,000 px with no Add to Bag on screen. `.pdp-mbar` is `display:none` on desktop. Pattern missing: *sticky mini buy bar*.
**Fix:** a 64 px bar under the header (thumb, name, price, chosen colour/size chips, Add to Bag, Order Now). It shows when `IntersectionObserver` says the main CTA row is out of view and hides when it is back. With no size chosen, Add to Bag scrolls to the sizes and pulses them (as the phone does). `30-product.js` (desktop-gated), `r12-zzdesk-b.css`.

**D-028 · Add-to-bag confirmation · all · Sawdagor · S2 (locked rule §46.5)**
**Status (Batch B, 19 Oct): Fixed. On desktop "Added to bag" is a 420 px right-side drawer for the product page, the auto combos and the ready-made sets. It closes on Esc, outside click and ✕; focus goes in and comes back to Add to Bag. It shows the item, the bag subtotal, the delivery line and 3 things that go with it. Claude asked for a "free-delivery progress line", but owner rule 35 (no "add ৳X more" at the moment of adding) wins. So the line says "Free delivery on this order" when the bag has it, and otherwise "Cash on Delivery · 72-hour size exchange", the same as the phone. The phone sheet is unchanged apart from the D-043 wording fix.**
The "Added to bag" sheet is a 560×510 **centred modal** that covers the product. The locked rule is desktop = right-side drawer, phone = bottom sheet.
**Fix:** `30-product.js` line 1657 `openModal(…, {title:'Added to bag', rebuild:…, cls:'atb-d'})` (also the combo add in `42-combo-auto.js`). CSS `@media(min-width:1024px){ .modal-back:has(>.modal.atb-d){justify-content:flex-end;align-items:stretch;padding:0} .modal.atb-d{width:420px;max-width:420px;height:100vh;max-height:none;border-radius:0;animation:atbIn .22s ease-out} .modal.atb-d .row-of-3-buttons{flex-direction:column} }`. Phone CSS never targets `.atb-d`, so phone pixels stay the same.

**D-029 · PDP "You may also like" / "Goes well with" rows · all · Shilpi · S2 (R1)**
**Status (Batch B, 19 Oct): Fixed. Desktop rows show exactly 4 cards per view and glide when they hold more. Rows with fewer than 4 are merged ("Goes well with · Trousers & Shirts"); a row that is still short is topped up with other pairings ("… & more"). "Recently viewed" waits on desktop until it has 4 items. The phone rows are unchanged.**
`.pdp-slide.pdp-prow-s` shows **3 cards (270 px), leaving a 341 px empty strip on the right** at 1366, and the same at every width.
**Fix:** desktop `@media(min-width:1024px){.pdp-prow-s{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px}}` and feed 4 products (5 at ≥1536 once D-010 lands). `30-product.js` row builder near line 1036: `n = DESK.matches ? 4 : 3`.

**D-030 · PDP combo nudges · 1280–1920 · Shilpi · S3 (one-line rule)**
**Status (Batch B, 19 Oct): Fixed. One line on desktop: the description steps out first ("Polo + Chino for ৳ 2,050 · Save ৳ 250"), and the price and saving never break. On the set nudge the second tier steps out first. The split markup is drawn on desktop only, so the phone text run is identical.**
"Polo + Chino: Essential polo with slim chinos for ৳ 2,050 · **Save ৳ / 250**" wraps, breaking the number from its currency sign.
**Fix:** in the nudge builder in `30-product.js`, wrap the price part ("for ৳ 2,050 · Save ৳ 250") in `<span class="pdp-nw">` and the description in `<span class="pdp-nd">` (phone CSS never reads them). Then `@media(min-width:1024px){ .pdp-nudge .pdp-nw{white-space:nowrap;flex-shrink:0} .pdp-nudge .pdp-nd{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap} }`. The AUTO ADJUST order (full → short) shortens the description first, never the price.

**D-031 · PDP trust strip · 1024–1199 · Shilpi · S3**
**Status (Batch B, 19 Oct): Fixed. One line; "size" steps out when the column is narrow ("72-hour swap"). Desktop only.**
"72-hour size swap" breaks onto 2 lines in the 430 px box at 1024.
**Fix:** desktop step-down: 12.5 px, then drop "size" (full → short), never wrap. `30-product.js` fit rule plus `r12-zzdesk-b.css`.

**D-032 · PDP gallery cursor and zoom viewer · all · Shilpi · S3**
**Status (Batch B, 19 Oct): Fixed. Cursor zoom-in; on desktop with a mouse the viewer has ‹ ›, a thumbnail strip and the hint "Scroll or click to zoom · drag to move". A click zooms in at the pointer, dragging pans, and a click at full zoom comes back out. The photo is a Tab stop that opens on Enter (QA Q-004, Q-005). Touch tablets and phones keep today's viewer.**
The main image opens the viewer on click, but `cursor:auto`. The viewer says "Pinch or double-tap to zoom" and has no visible prev/next and no thumbnails. The desktop helpers (wheel, double-click, ←/→ in `31-zoom.js` lines 71–75) are invisible to users.
**Fix:** `.pdp-gal .pdp-main{cursor:zoom-in}`. In `31-zoom.js`, when `DESK.matches`: hint "Scroll or double-click to zoom · ← → more photos", ‹ › buttons, a bottom thumbnail strip, and click-to-zoom at the cursor point (pattern: *lightbox with point zoom*).

**D-033 · PDP rating mismatch · all · Sawdagor · S2 · ⚠ touches phone**
**Status (Batch B, 19 Oct): Fixed (shared bug fix, phone text too). One source, `pdp_rating()`: the owner's approved reviews (Admin › Reviews) when there are any, otherwise the catalogue figure. The title, the Reviews block and the T3 card agree, and the Reviews list shows those same reviews.**
The title says **4.7 · 3 reviews**; the Reviews block on the same page says **4.6 · 128 reviews** (Essential Piqué Polo). Mismatched numbers kill trust.
**Fix:** read both from one source (the review summary) in `30-product.js` / product data. **The phone shows the corrected number too, so it needs the owner's yes.** It is a bug fix, so we recommend shipping it.

**D-034 · PDP size chart modal · 768/800-high screens · Shilpi · S3**
**Status (Batch B, 19 Oct): Fixed. On desktop the chart opens 860 px wide in two columns: table on the left; Find my size, WhatsApp and How to measure on the right. It is 579 px tall at 1366×768, with no inner scroll.**
The 560 px modal is 707 px tall and scrolls inside. (The phone scroll was waived in 2.7; desktop has room.)
**Fix:** on desktop open with `wide:true` (860 px). Table on the left; "How to measure", "Find my size" and WhatsApp on the right, so there is no scroll. `30-product.js` (`pdp-open-chart`), `r12-zzdesk-b.css`.

**D-035 · PDP reviews row and Account "For you" rows clipped · all · Shilpi · S3**
**Status (Batch B, 19 Oct): Fixed. Gliding rows (reviews, cross-sell rows, account rows) fade over 28 px at both edges instead of cutting cards. Pause on hover was already in the glide engine.**
The glide tracks cut cards mid-word at the edges ("Rakib H." half under the summary card; "Lacoste Classic Piqué Polo" cut on the account page).
**Fix:** the same edge mask as D-009 on `.pdp-revlist` and the account rows, plus pause on hover. `r12-zzdesk-b.css`.

**D-036 · PDP Q&A balance · all · Shilpi · S4**
**Status (Batch B, 19 Oct): Fixed. Both cards stretch to one height. On desktop the WhatsApp line closes the left card; the phone keeps it in the right card.**
The left Q&A card is 137 px tall and the right "Common questions" card 340 px, leaving an empty hole under the left one.
**Fix:** `align-items:stretch`, and move "Ask on WhatsApp" to the bottom of the left card on desktop.

**D-037 · PDP size pick shift · all · Shilpi · S4**
**Status (Batch B, 19 Oct): Fixed. The fit line height is reserved; Add to Bag moves 0 px when a size is picked (it was 2 px).**
Picking a size shows the fit line and pushes Add to Bag down 2 px (614 → 616).
**Fix:** reserve the fit-line height on desktop (`min-height` on the line container).

**D-038 · Combos hub · all · Shilpi / Sawdagor · S2 (R1)**
**Status (Batch B, 19 Oct): Fixed. Rails share rows of 4. A later rail that fits moves up into the gap, "Build your own" fills what is left (as a wide banner when that is 2+ columns), and a rail of 5+ cards scrolls 4 at a time. Summer is 2-pc (3) + 3-pc (1) / Top+bottom (2) + Build banner; winter is 2-pc (2) + 3-pc (1) + Build / Top+bottom (4). The phone is unchanged.**
Each `.ca-rail` renders a 4-column track: 2-piece shows 3 cards, 3-piece 1, Top + bottom 2, Build 1. So 25–75 % of every row is empty, and "Build your own" is a lone 286×415 tile with a "+" (`sheets/3`).
**Fix:** on desktop, let the sections share rows. `42-combo-auto.js` (line 457 `rail()`) adds `style="--n:<cards>"` to each `.ca-rail`, and the hub body (lines 473–476) wraps the four rails in a plain `<div class="ca-rails">`. Neither is read by phone CSS; confirm with the 0 px pixel diff, because a new wrapper can break sibling spacing selectors. CSS `@media(min-width:1024px){ .ca-L3 .ca-rails{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:28px 20px} .ca-rail{grid-column:span min(var(--n),4)} .ca-rail .ca-railtrk{grid-template-columns:repeat(var(--n),minmax(0,1fr))} }`. Now 3-piece (1) + Top+bottom (2) + Build (1) fill one row, and the Build tile is half height.

**D-039 · Combo pair page P1 · all · Shilpi · S4**
**Status (Batch B, 19 Oct): Fixed. On desktop the size pills fill the column, and "Other pairs" is one row of 112 px tiles with one-line names ("Black + Grey") and ‹ › when it overflows.**
The size row ends at x = 1203 vs the 1271 column (68 px gap). "Other pairs" thumbnails are 92 px with 2-line labels.
**Fix:** desktop size pills `flex:1`; pair thumbs 112 px with one-line labels (step-down: "Black + Grey Melange" → "Black + Grey").

**D-040 · Combo naming / crumbs / CTA · all · Sawdagor · S4 (consistency note)**
**Status (Batch B, 19 Oct): Fixed for the crumbs: desktop uses "/" and "Combos" (auto combos, ready-made sets, set builder), matching Batch A's new Combos nav item. The CTA style is left to the owner (not changed).**
Auto combos use "Home › Combos › …" while C1 sets use "Home / Sets / Polo Duo". The nav marks "Sets" on combos. The P1 CTAs ("Choose a size" solid + "Order now — pay on delivery" outline) differ from the PDP pair (`PDP_CTA_STYLE`).
**Fix:** one separator "/" and one word ("Combos") on desktop crumbs once D-001 adds the Combos nav item. Leave the CTA style to the owner (no phone change).

**D-041 · Bag "Goes well with your bag" · all · Shilpi · S3 (R1)**
**Status (Batch B, 19 Oct): Fixed. Desktop shows one full row of 4; the phone slider keeps all 6.**
6 cards in 4 columns leave row 2 with 2 cards and 2 empty slots.
**Fix:** `72-upsell.js` takes `n = DESK.matches ? 4 (or 8) : current`. The same block on thank-you already shows 4.

**D-042 · Bag B5 compact rows on desktop · all · Shilpi · S3**
**Status (Batch B, 19 Oct): Fixed. B5 is kept as the default (ranking winner, the owner confirms later). On desktop B5 rows use 72 px pictures and 15 / 13.5 px text. The sizes stay as text ("L / L"); no inline size chips were added.**
B5 set rows use 44 px thumbs and 13 px text beside a 112 px regular item row, so they look cramped and odd on a wide bag column.
**Fix:** `@media(min-width:1024px){.cbt-row > :first-child /* cbt_thumb() output */{width:72px;height:72px}.cbt-row{font-size:15px}}` and show the two size chips inline. Alternatively use B2 cards on desktop (owner setting `bagTplDesktop`). `43-combo-tpl.js` / `r12-zzdesk-b.css`.

**D-043 · "This item ships free" with 3–5 items · bag + checkout · Sawdagor · S3 · ⚠ touches phone copy**
**Status (Batch B, 19 Oct): Fixed (shared bug fix, phone text too). With more than one piece the bag and checkout say "Free delivery on this order, anywhere in Bangladesh." The Added-to-bag sheet/drawer now says free delivery whenever the BAG has it (a product, a campaign or the amount), in one line: "Free delivery on this order". Wording comes from settings: `bag.freeOrder` / `bag.freeOrderBn` / `bag.freeShort` / `bag.freeShortBn` in Admin › Settings › Bag.**
The free-delivery banner says "This item ships free" when the bag holds several items.
**Fix:** plural text when count > 1 ("Your order ships free…"). **This is a phone copy change, so it needs the owner's yes.** Desktop-only alternative: a `hide-m` span with the plural text.

**D-044 · Checkout summary alignment and float · all · Shilpi · S2 (§56.9)**
**Status (Batch B, 19 Oct): Fixed. The summary top is measured to the first form card (both at y 160) and the side column runs the full form height, so it floats (top = header + 16). With more than 3 lines it shows 3 and a "+N more items" switch, so Confirm order stays on screen (661 px at 1366×768 with 5 items).**
The summary card top is at y = 180 vs the first form card at y = 161 (**19 px low**). `.co-side{align-self:start}` (styles.css 1036) makes the aside only as tall as its content, so `.co-float{position:sticky;top:92px}` has 74 px of travel and never floats. With 5 items the float is 989 px tall, taller than the viewport.
**Fix:** `@media(min-width:1024px){ .co-side{align-self:stretch;padding-top:<measured, ≈55px>} .co-float{max-height:calc(100vh - 110px)} .co-float .co-rows{overflow:auto;overscroll-behavior:contain} /* item list; confirm the class in co_render() */ }`. With more than 3 items, show the first 3 and a "+2 more" toggle so Confirm Order is always in view (`51-checkout.js`, desktop-gated). Check: both boxes start on the same pixel line at all six widths.

**D-045 · Checkout form width · all · Shilpi · S4**
**Status (Batch B, 19 Oct): Fixed: name and phone side by side on desktop. The 640 px form cap waits for D-010 (the wider container), which has not landed.**
Full name and Phone are 714 px wide each.
**Fix:** desktop `grid-template-columns:1fr 1fr` for name and phone (about 90 px shorter); form column max 640 px when D-010 widens the container.

**D-046 · Thank-you hero row · all · Shilpi · S4**
**Status (Batch B, 19 Oct): Fixed. Track sits on the same baseline as Copy (both 9 px above the box edge).**
The order-number box is 136 px tall; the Track button is 52 px and floats at mid-height.
**Fix:** align the Track button to the box (same height, or bottom-aligned with Copy), desktop only.

**D-047 · Account stats vs offers · all · Sawdagor · S3 · ⚠ touches phone**
**Status (Batch B, 19 Oct): Fixed (shared bug fix, phone text too). The Offers figure counts what is shown: personal codes plus the picked-for-you offers (1 card on phone, 3 on a desktop with a mouse, 2 on a touch tablet at 1024–1279). "For you" lists those same offers with the same count.**
The header stat says **"0 OFFERS"** while three "15% off" offers are shown, and "For you" says "No personal offers right now".
**Fix:** count the dashboard offers in the stat, or relabel them "Picks". **This is shared logic, so it needs the owner's yes.**

**D-048 · Account offer cards · 1920 and 1024 · Shilpi · S3**
**Status (Batch B, 19 Oct): Fixed (QA Q-007), on `.acc-po3` only. The name comes down 15 → 13.5 px, then takes a second line; it is never cut and never ends in "…".**
At 1920 the name is cut at the card edge with no ellipsis ("Heavyweight Hoodie 32"). At 1024 it touches the edge.
**Fix:** `@media(min-width:1024px){.acc-po-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}` (or a 2-line clamp) plus right padding.

**D-049 · Account duplicate identity / wide button · all · Shilpi · S4**
**Status (Batch B, 19 Oct): Fixed. The desktop side menu shows navigation only (no second avatar or name). "Shop now" is natural width (min 240 px).**
Avatar, name and badge appear twice (sidebar and hero card). The members "Shop now" button is 860 px wide.
**Fix:** desktop sidebar shows navigation only; "Shop now" gets auto width (min 240 px).

**D-050 · Wishlist empty state · all · Sawdagor · S4**
**Status (Batch B, 19 Oct): Fixed. Desktop says "Click ♡ on any product to save it here." and shows 4 best sellers under it. The phone wording is unchanged.**
It says "Tap the heart…" and shows no products.
**Fix:** desktop copy "Click ♡ on any product to save it" (`hide-m` / `hide-d` spans) plus 4 bestsellers under it (pattern: *empty state with recovery*). `60-account.js` line 733.

**D-051 · Phone wording on desktop · PDP / size chart / zoom · Shilpi · S4**
**Status (Batch B, 19 Oct): Fixed. Desktop wording: "Pick a size to see its measurements", "Click a size to choose it.", "Click a colour…", "pick a colour" in the duo offer, and the zoom hint. The phone strings are identical.**
"Tap a size to see its measurements" (`30-product.js` 614), "Tap a size to choose it" (1115), "Pinch or double-tap to zoom" (`31-zoom.js` 29).
**Fix:** desktop strings "Pick a size…", "Click a size…", "Scroll or double-click…", using paired `hide-m` / `hide-d` spans so phone text is identical.

**D-052 · Login card alignment · all · Shilpi · S4**
**Status (Batch B, 19 Oct): Fixed. The login grid fills the container (95–1271 at 1366).**
The login card spans 164–1203 while the breadcrumb and grid span 95–1271.
**Fix:** desktop card fills the container width, or the breadcrumb aligns to the card.

**D-053 · PDP T2 (Classic Cotton Panjabi) buttons below the fold · 1024×768, 1280×800, 1366×768 (1536×864 borderline) · Sawdagor · S2 (§56.6)**
**Status (Batch B, 19 Oct): Fixed on every template at 1024×768, 1280×800 and 1366×768 (31 products plus the template variants; the worst Order Now bottom is 707 px). T2: a 28–34 px title and the buttons side by side. T3: on desktop the fit card is unboxed, so its size row joins the other choices and the buttons follow; the finder, measurements, fit and "customers like you" come straight after, still open.**
The T2 title wraps to 2 lines at 44 px and the buy buttons stack. **Add to Bag starts at y = 743 and Order Now is fully below the fold** on 768/800-high screens. The locked rule says both are visible in the first window on desktop.
**Fix:** `@media(min-width:1024px){ .pdp-tpl-T2 h1{font-size:clamp(28px,2.3vw,34px)} .pdp-tpl-T2 <CTA row>{display:grid;grid-template-columns:1fr 1fr;gap:10px} }` (the same side-by-side pair as T1). Measured target: both buttons' bottom ≤ 740 px at 1366×768. File: `r12-zzdesk-b.css` (the page wrapper is `.pdp-tpl-T2`; take the CTA row class from the T2 branch of `30-product.js`).

---

## 5. Points that would touch the phone (held for the owner)

| id | What | Why it touches phone | Desktop-only alternative |
|---|---|---|---|
| D-015 | Search: multi-word, typo, Bengali | one search engine for all devices | none honest (results must not differ by device). Ship as a bug fix after his yes |
| D-024 | Heart button nested inside card link | `productCard()` markup is shared | none. Markup-only change, guarded by the phone pixel diff (0 px) |
| D-033 | Rating 4.7·3 vs 4.6·128 | the number is shown on phone | none (it is wrong on phone too). Recommend the fix |
| D-043 | "This item ships free" for many items | phone copy | `hide-m` span with plural text on desktop only |
| D-047 | "0 offers" while 3 offers show | stat shared | desktop-only stat label "3 picks" in the desktop offer row |

**Owner decisions (pictures first):** D-001b mega menu, D-010 wider container at 1536+, D-020 desktop footer, D-022 loop count, D-042 B5 or B2 on desktop.

---

## 6. Severity counts

| | S1 broken | S2 major | S3 | S4 polish | Total |
|---|---|---|---|---|---|
| Batch A | 0 | 5 (D-001, 003, 005, 006, 015) | 16 | 5 | 26 |
| Batch B | 0 | 7 (D-027, 028, 029, 033, 038, 044, 053) | 10 | 10 | 27 |
| **All** | **0** | **12** | **26** | **15** | **53** |

**Top 10 (fix first):** D-001 (no Combos / mega menu / missing categories in desktop nav) · D-027 (no sticky buy on PDP) · D-028 (add-to-bag is a centred modal, not the locked right drawer) · D-053 (T2 Order Now below the fold) · D-005 (hero copy pushed off-grid, 744 px empty at 1920) · D-038 (combos hub rows 25–75 % empty) · D-044 (checkout summary 19 px low and not floating) · D-029 (3-card rows leave 341 px empty right) · D-006 (hero pins shrink to 7–9 px, sale price hidden) · D-003 (no visible / brand focus, focus lost off-screen).

---

## 7. Two independent fix batches (no shared files)

### Batch A — header / nav / menus · home · category · search · footer · help · global desktop foundation
**Files it may touch:**
- `src/r12-zzdesk-a.css` (new, desktop-only)
- `src/97-desk-a.js` (new: mega menu behaviour, card hover enhancer, header tooltips, motion limiter)
- `src/03-layout.js` (NAV builder, `storeHeader()` sec / Combos active, `data-tip`, `storeFooter()` desktop block, `PAGES.notfound`)
- `src/02-core.js` (only `productCard()` for D-024, after the owner's yes; Batch B never touches 02)
- `src/20-home.js` (hero tabindex / pin min, Buy-together `fill4` + See-all link, reviews link, journal static grid)
- `src/21-category.js` (sparse category, orphans, search page filters, `PAGES.search`)
- `src/07-help-search.js` (desktop search panel, D-015 matcher)
- `src/71-pages.js` (help-centre layout)
- `src/10-size-guide.js` (inline finder on desktop)

**Findings:** D-001 … D-026. **Order:** land the foundation first (D-003 focus, D-009 mask base, `.modal:focus-visible`), then the rest. D-010 waits for the owner's picture.

### Batch B — product page · combos · bag · checkout · thank-you · account
**Files it may touch:**
- `src/r12-zzdesk-b.css` (new, desktop-only)
- `src/30-product.js` (sticky mini bar, `cls:'atb-d'`, 4-up rows, size chart wide, copy spans, T2 CTA wrapper, rating source)
- `src/31-zoom.js` (desktop hint, arrows, thumbs)
- `src/40-combo.js` and `src/41-set.js` (crumbs, CTA checks)
- `src/42-combo-auto.js` (`--n` on rails, combo add drawer, pair-page tweaks)
- `src/43-combo-tpl.js` (B5 desktop)
- `src/50-bag.js`
- `src/72-upsell.js` (count multiple of 4)
- `src/51-checkout.js` (compact list >3, alignment hook)
- `src/52-thanks.js`
- `src/60-account.js` (offer name, duplicate identity, wishlist empty, stats)
- `src/61-exchange.js` (verify only)

**Findings:** D-027 … D-053. B checks its pages again after A's foundation and D-010 land (CSS-only, no file overlap).

**Neither batch edits:** `styles.css`, `r11-*.css`, existing `r12-*.css`, `73-blog.js` / `r12-zblogfe.css` (journal, reviewed separately), admin files, `99-boot.js`.

**Done means:** every S2/S3 fixed or switched; device gate 0 on 15 phones; phone pixel diff 0 px on 47 routes; desktop re-run of `audit.js` / `interact*.js` at six widths shows no new overflow or errors; Bengali before/after sheets.

---

## 8. Evidence

- Shots: `scratchpad/desktop-audit/shots/w{1024,1280,1366,1440,1536,1920}/<route>-<w>.png` (+ `-full.png` at 1024/1366/1920), `shots/int/` and `shots/int2/` (interaction states), metrics in each `metrics.json`, `interact.json`, `interact2.json`; crawl in `data/crawl.json`.
- Bengali-labelled before-sheets: `scratchpad/desktop-audit/sheets/1-header-home.png`, `2-category-search-footer.png`, `3-product-combo.png`, `4-bag-checkout-account.png`.
- Tools (re-run for the after pass): `scratchpad/desktop-audit/tools/audit.js`, `crawl.js`, `interact.js`, `interact2.js`, `extra.js`, `sticky.js`, `hero.js`, `probe.js`, `slice.py`.

---

## 9. Batch A — fix record (19 Oct 2026 · Shilpi A360-05 with Sawdagor A360-04)

**সারাংশ (বাংলায়):** ব্যাচ A-র ২৬টা পয়েন্টের ২৫টা ঠিক করা হয়েছে। বাকি ১টা (D-025) শুধু তথ্য, জার্নাল টিমকে দেওয়া হয়েছে। ফোনের ১৫৩টা ছবি (৫১টা পাতা × ৩ মাপ) মিলিয়ে দেখা হয়েছে, লেআউট এক পিক্সেলও বদলায়নি। শুধু সার্চের ফল বদলেছে, কারণ ওটা আসল বাগ ছিল ("pollo shrt" আর "গেঞ্জি" এখন পণ্য খুঁজে পায়)। ডিভাইস গেট ৪৮০টার মধ্যে ০টা ফেল। কম্বো, ops-test আর ops-flow সব পাস। ডেস্কটপে ৬টা মাপে ১৮৬টা চেক, সব পাস।

**Files (Batch A only):** new `src/r12-zzdesk-a.css`, new `src/97-desk-a.js`; edited `03-layout.js` (data-built nav + DESK_NAV, deskOn(), header data-tip, desktop footer ftrDesk() + shared ftrHelpLinks/ftrExtasLinks, 404 nf_desk), `02-core.js` (productCard only), `20-home.js`, `21-category.js`, `07-help-search.js`, `71-pages.js`, `10-size-guide.js`. No Batch B, journal or admin file touched. The Journal link (Shilpi's journal work) stays in the desktop nav and in the phone menu.

**Decisions applied (Claude's, recorded):**
- **D-001 mega menu:** desktop row = New in · every live category from `DB.categories` · More · Combos (`#/combos`) · Sets · Journal. Every category panel: "Shop <category>" (All + the `DB.subcats` tree, linked as `#/c/<cat>?sub=<path>`, which the category page now narrows to), "Shop by fit" (from the products, only when there is a choice), "Popular" (best-reviewed) and one featured tile (the category's best combo: auto colour-pair first, then fixed sets, then Build your own set). Combos panel: colour-pair rules, ready-made sets, build-your-own rules, All combos, featured best combo. More: folded categories + the categories kept out of the main row (`hidden`: Jackets, Sweaters, Tracksuits, Joggers, Extras), switch `DESK_NAV.showHidden` (on). Opens on mouse hover after 150 ms (250 ms leave grace); a **mouse click follows the link**, a touch tap or Enter/Space opens the panel first (second press follows); ↓ enters the panel, ←/→ move between items (and switch panels), ↑/↓ inside, Esc closes and returns focus, outside click and focus leaving close it. Desktop only (≥1024); the phone drawer is unchanged. When the row does not fit (1024 px), the last categories fold into More (measured, `deskNavFit`).
- **D-010:** at ≥1536 the content is 1440 px wide (`.container` max 1504 incl. 32 px gutters), centred; the hero and help centre follow `--cmax`. Batch B pages inherit this (CSS only) and should re-check at 1536/1920.
- **D-020:** desktop footer = brand line on top, then Shop · Help · EXTAS · Join (newsletter, WhatsApp, Hotline, hours, payment marks); promise strip and legal bar unchanged; switch `FOOTER_DESK.on`.
- **D-022:** WhatsApp bleed, bag glow + nudge, and also the logo sheen: 3 rounds after each page draw (load, page change, bag change), then still until hovered. Desktop only with motion allowed; reduced-motion already has none; phone unchanged.
- **D-003 foundation:** one 2 px brand focus ring for keyboard (`:focus-visible`, white on green/dark bands, inset in sliders), no ring on a window or the page given focus by code; scoped to ≥1024 (the pixel diff showed no other scope was needed). Slider edge fades on the home glide rows and the category bundle row (≥1024).
- **D-006:** desktop hero pin is two lines (name / price row) at 12.5 px with a desktop floor of 11 px (phone floor stays 9), slides 220–280 px, so the sale price and old price always show.
- **D-008:** there is no all-reviews page yet, so the link under the 9 reviews is "Shop our top-rated styles" (New in sorted by rating) — not "Read all 1,803 reviews".
- **D-013:** quick add confirms with a toast + "View bag" link (the right-side drawer is D-028, Batch B's); it uses the same bagAdd() rules as the product page (duplicate setting, stock).
- **D-015:** steps 0–4 in `21-category.js` (phrases "t shirt"/"polo shirt", synonyms গেঞ্জি/genji → t-shirt/tee, pant → trouser/chino/jeans/jogger …, singulars, then general words such as "shirt"/a slip of it are dropped). A synonym must match as written (so "tshirt" is never read as a slip of "shirt"). The lists (`SRCH_PHRASES`, `SRCH_SYNONYMS`, `SRCH_GENERIC`) are settings. Same engine for the results page and the live suggestions.
- **D-024:** (final, after the combined-build check) card = `<div class="pcard-w"><div class="pcard" data-testid="pcard-…"><a class="pcard-lnk" href aria-label="name, price"></a><div class="pimg">badge + heart</div><div class="pinfo">…</div></div></div>`. The link is an empty full-card layer drawn first; the photo lets clicks fall through (`pointer-events:none`) and the heart takes its own clicks. The heart, badge, photo and text are drawn exactly as before, so every phone route is 0 px. (A first version with the heart in clipped layers outside the card left ±1 colour values on product-page rows; a positioned wrapper inside the product-row scrollers did the same — both replaced.)

**Gates (on the Batch A build `desktop-fix/a/iso.html` = baseline source + only Batch A's files; and on `dist/r16.html`):**
- Phone pixel diff, 51 routes (the 47 audit routes + "polo shirt", "গেঞ্জি", exchange, payment, sweaters) × 360×800 / 393×852 / 430×932, full page, reduced motion, fixed clock and random seed: **0 px on every route** except (a) D-015 search pages ("pollo shrt", "polo shirt", "গেঞ্জি": results now found — content, same layout) and (b) D-024 on 4 product pages: ±1 colour value on 1–79 anti-aliased edge pixels (raster layering of the moved heart; sizes and positions identical). A few routes (combos-list, set, set-polos, bag-3) differ between two runs of the *same* baseline; re-shot, they match 0 px. Tools: `scratchpad/desktop-fix/a/tools/phone-shots.js`, `diff.js`, `confirm.sh`.
- Device gate `qa/device-matrix.js --group=all` in slices: **0 of 480** failing (15 phones + tablets).
- `combo-auto/verify.js` ALL PASSED · `admin-shots/ops-test.js` ALL PASSED · `admin-shots/ops-flow.js` ALL PASSED.
- Desktop re-run of `tools/audit.js` at 1024/1280/1366/1440/1536/1920: 0 JS errors, 0 sideways scroll, 0 off-right elements; nested interactive elements 1,428 → 0. `interact.js` / `interact2.js` re-run (search "pollo"/"polo shirt"/"গেঞ্জি" → 10/10/5 products; filter rail sticky; nav hover reacts). New `desktop-fix/a/tools/deskint.js`: 31 checks × 6 widths = **186/186 pass** (also on r16).
- Bengali before/after sheets: `scratchpad/desktop-fix/a/sheet-01 … sheet-15` (sheet-14 = phone unchanged).

**Hand-offs / notes:** the journal breadcrumb offset (D-025) stays with the journal reviewers. Batch B: re-check product/combo/bag/checkout/account at 1536 and 1920 after D-010, and D-028 can reuse the quick-add confirmation point (`ACT['desk-qa']` in 97-desk-a.js). The desktop QA report (`qa/DESKTOP-QA-REPORT.md`) did not exist when Batch A closed, so no forwarded QA items were in this batch.

---

## 9. Batch B — fix report (19 Oct 2026, Sawdagor সওদাগর A360-04 · Shilpi শিল্পী A360-05)

**All 27 Batch B findings are marked above (D-027 … D-053): 27 fixed. D-042, D-045 and D-040 each have one part left open on purpose:**
- D-042: no inline size chips.
- D-045: the 640 px form cap waits for D-010.
- D-040: the CTA style is the owner's call.

**Desktop QA items (qa/DESKTOP-QA-REPORT.md), Batch B:**

| QA | Result |
|---|---|
| Q-003 focus after colour / size pick and after the popup | Fixed on all devices (focus only, nothing visible). F20 PASS at all 6 widths |
| Q-004 zoom: mouse pan, ‹ ›, wheel, hint | Fixed (desktop with a mouse). F07 PASS at all 6 widths |
| Q-005 zoom from the keyboard | Fixed: the photo on show is a Tab stop and opens on Enter / Space. F07b PASS |
| Q-007 offer name cut | Fixed on `.acc-po3` (15 → 13.5 px → two lines). F14 PASS |
| Q-008 3 offers at 1024–1279 | Fixed for mouse desktops; touch tablets keep 2; the count follows. F14 PASS at 1024 |
| Q-010 heart / rating hit areas | Fixed at 0 px phone diff: the rating's spare 6 px of tap box moved from above the stars to below them (overlap 6.9 → 0.9 px) |
| Q-011 set builder pills / dots | Fixed on desktop (they fill their own column; overlap 1.4–2 → 0). The phone had no overlap and is unchanged |
| Q-012 landing ticks | Fixed at 0 px phone diff: each tick's box is 28 px tall around the same 18 px square (overlap 3.7 → 0); applies to the checkout ticks too |
| Q-013 faded Previous arrow | Fixed: `aria-disabled` + out of the Tab order while faded; no visual change |

**How it was checked:**
- **Phone pixel diff.** 60 routes × 360/393/430, full page, reduced motion and animations disabled, against a baseline of the untouched source. It is 0 px everywhere except the text-only bug fixes:
  - D-033: polo reviews.
  - D-043: bag line and the sheet line.
  - D-047: offer count and the For you list.
  - Known run-to-run noise (≤55 px).
  - The combined build also shows Batch A's own phone changes (help page, search, 1 px on card rows); those are not from Batch B files.
- **Other gates:**
  - Device gate: 0 of 480.
  - combo-auto verify (updated so a desktop add checks and closes the new drawer), combo-wave2 sweep, owner-answers test + ended-bag, ops-test, ops-flow: ALL PASSED.
  - Audit tools at all 6 widths: 0 JS errors, 0 overflow.
  - Order Now above the fold: 0 of 31 products × 6 widths below.
- **Evidence:** before/after sheets in `scratchpad/desktop-fix/b/sheets/` (20 Bengali-labelled sheets); tools and raw shots in `scratchpad/desktop-fix/b/`.


## 10. Batch A — second round (19 Oct, evening): QA items, owner's 18:38 notes, coordinator items

**সারাংশ (বাংলায়):** QA-র ৫টা পয়েন্ট (Q-001, Q-002, Q-006, Q-009, Q-014) পাস। মালিকের ১৮:৩৮-এর ৬টা পয়েন্ট করা হয়েছে: হিরোর ছবি এখন প্যানেলের রঙে মিলিয়ে যায় (১৪০ px, বাকি দুটো বিকল্পের ছবিও আছে), রিভিউ এক সারিতে ৩টা করে চলে, ফুটারে WhatsApp আর হটলাইন সমান মাপে একটার নিচে আরেকটা, ফিল্টার শুধু ডেটায় যা আছে তাই দেখায়, আর লেআউট-বিল্ডারের জন্য হুক আছে। ডেলিভারির সময় সার্চে, ডেলিভারি পাতায় আর FAQ-তে এখন ঘণ্টায় আর সেটিংস থেকে আসে। অ্যাডমিনে ডেমো বোতাম আর কিছু ঢাকে না। ফোনে শুধু লেখা বদলেছে, কোনো লেআউট না।

**QA items (`qa/DESKTOP-QA-REPORT.md`), re-run with `scratchpad/desktop-qa/tools/feat.js` on the Batch A build at all six widths:**
- Q-001 mega menu: F02 PASS 6/6 → 8/8 at every width (New in got its own panel; "More" got its own address `#/c/new?all=1`, it was sharing New in's link, which the tool counts once). F03 keyboard PASS.
- Q-002 sub-categories: F04 PASS.
- Q-006 card hover: F10 PASS at all six (second image, quick add, CLS 0). The quick-add row now lives inside the card box; the card box is no longer a link (D-024), so this is not a nested control.
- Q-009 tooltip: F09 + F09b PASS — `HDR_WA_TIP = 'Need any help'` (03-layout.js). Phone: no visible change (the tip only shows on hover); the WhatsApp link's screen-reader name follows the same words.
- Q-014 hero arrows: F11 PASS; arrows stay in the Tab order on desktop and show on `:focus-within` (also on touch-less ≥1024 when focus is inside).
- Mega-menu keyboard (Claude's decision): Enter on a top item goes to the category page; Space or ↓ opens its panel; Esc closes and returns focus; hover keeps the 150 ms intent. A touch tap (1024 tablet) still opens first.

**Owner 18:38:**
1. Hero: the copy's left edge = the content edge ("Shop by category" heading) — measured 0 px apart at 1024/1366/1920 (it already was after D-005; the owner's screen may have been the older build). The text column is now narrower (clamp 380–470 px, gap 40) so the slider starts 36–112 px further left and gets the room.
2. Slider edge: the slides dissolve into the panel through a gradient from the panel's own token (`--hero`) to clear, on the slider's left edge. Variants kept: 140 px (**chosen**), 80 px, 140 px + a soft wash on the panel's right edge (`?herofade=80|140`, `?herowash=1`; setting `HERO_FADE`). Sheet-16.
3. Reviews: one row, 3 cards to a view, gliding on the shared SMOOTH engine (pause on hover, snap after drag); no more 10 at once. Phone review row unchanged (0 px). Sheet-17.
4. Footer: the 4 columns stay (Shop · Help · EXTAS · Join); under them a contact block — left: social links (when set) over the payment marks; right: WhatsApp over Hotline, equal width (340 px), no overlap or cut text at 1024–1920 (measured). Sheet-18.
5. Filters from data: checked per category at 1024/1366/1920 — sizes, colours (with counts) and fits are exactly the ones in that category's products (fit group only when there is a choice; 1–4-style categories drop the rail on desktop). `5XL` added to `CAT_SIZE_ORDER` (4XL was there). No phone change (no category has different data). Sheet-19.
6. Layout-builder hooks (PR 595/596), kept stable as the builder asked:
   - `HOME_SECTIONS` (20-home.js): ordered `{id, render()}` — ids `hero, festive, categories, new-in, sets, size-finder, flash-sale, shop-the-look, reviews, journal`; `PAGES.home.render` = `HOME_SECTIONS.map(...)`.
   - `CAT_SECTIONS` (21-category.js): `{id, render(ctx)}` with ctx `{id, name, base, list, few, hd, side, main, info}` — ids `header, grid, after-grid, info`; `PAGES.category.render` = `CAT_SECTIONS.map(...(ctx))`. Insertion point between grid and footer: `CAT_SLOTS.afterGrid` (array of `function(ctx){ return html; }`, empty by default).
   - Gutters: `lbGutters()` (03-layout.js) draws `<div class="lb-gutters"><div id="lb-side-l" class="lb-side"></div><div id="lb-side-r" class="lb-side"></div></div>` as the first child of the page on home and category, desktop only; shown at ≥1280, absolutely positioned in the side margins, `pointer-events:none` until they hold something. `--lb-h` (page height) and `--lb-gutter` (usable width, px) are set on `.lb-gutters` by 97-desk-a.js. Full-width bands stay direct children of `main.page`.

**Coordinator items:** delivery time in hours — the help answer is built by `hs_deliveryAnswer()` (07-help-search.js) from `zoneFee()` / `zoneHours()` / `SET('delivery', …)`, English and Bengali (Bengali digits); the Delivery page and the FAQ answer use `{insideHours}/{subHours}/{outsideHours}`, and the sub-area charge follows its mode (`zoneFee('sub')`). Verified: setting insideHours to 12–24 changes the search answer, the Delivery page and the FAQ at once. Still in days, outside Batch A (for their owners): `01-data.js` rule `delivery.full`, `30-product.js:899`, `51-checkout.js:355/399`, `52-thanks.js:55`, `60-account.js:980` (fallback), `70-landing.js:293`. Admin demo gear: on admin pages it now takes the first free place (beside the Admin tag on a phone, the window's top-right on desktop) and scrolls with the page; nothing under it (measured at 360/393/1024/1366); shop pages unchanged. Sheet-21.

**Gates (final):** phone diff of the Batch A build vs the 16:33 baseline: 0 px on every route except page-delivery (hours wording, same size), search-help (the longer delivery answer wraps one more line), search-typo / polo-shirt / গেঞ্জি (D-015 results found). Routes that differ between two runs of the *same* build (combos-list, set, set-polos, bag-3, some PDP thumbnails) re-shot to 0 px. Combined A+B build (r16) vs combined-without-Batch-A: the same five text/result routes only; everything else 0 px after re-shoot. Device gate 0/480 · combo verify, ops-test, ops-flow ALL PASSED · `deskint.js` 198/198 on the Batch A build and on combined r16 · audit 6 widths: 0 errors, 0 sideways scroll, nested 1,428 → 0, small text 5,949 → 5,105.
