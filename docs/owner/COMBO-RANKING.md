# Combo template ranking (PR 576) — 19 Oct 2026

Sawdagor সওদাগর A360-04 (combos) · reviewed by Shilpi শিল্পী A360-05 (UI/UX). Built on r16 (`proto/dist/r16.html`).
Owner's notes: ROUND15 Notes 8–11. Research: COMBO-RESEARCH.md §6–§10. Register: PR 572–576.

## মালিকের জন্য সংক্ষেপে (Bengali summary)

- **তিনটা পেজের সব ডিজাইন এজেন্ট দিয়ে কাস্টমারের মতো চালিয়ে দেখেছি** — ৩টা ফোন (৩৬০, ৩৯৩, ৪৩০) আর কম্পিউটারে। মোট ১৮৮টা পরীক্ষা (ব্যাগে প্রতিটায় ৫টা কাজ), একটাও ফেল নেই, ব্যাগের দাম সবখানে ঠিক।
- **ক্যাটাগরি পেজ: L1 (জোড়ার গ্রিড) ডিফল্ট** — ৮৭/১০০, এক নম্বর। L5 সমান নম্বর পেয়েছে, কারণ ৩ পিস না থাকলে L5 নিজেই L1 হয়ে যায়। ৩ পিস অফার জোর দিতে চাইলে L5।
- **প্রোডাক্ট পেজ: একই প্রোডাক্টের জোড়া/প্যাকে P1 (জোড়ার পেজ)** — ৯৬.৫/১০০, ২ ট্যাপে ব্যাগে, সাইজ প্রথম স্ক্রিনেই।
- **উপর + নিচ সেট (হুডি + জগার, ট্র্যাকস্যুট) আর আলাদা পিসের সেটে P3 (উপর + নিচ সেট)** — P1-এর প্রায় সমান (৯৬.৮ বনাম ৯৬.৮ হুডি-জগারে), কিন্তু উপর আর নিচের সাইজ আলাদা রাখে; উপরের সাইজ দিলে নিচেরটা নিজে বসে যায়।
- **ব্যাগ: B5 ডিফল্ট** — ৯৭.৩/১০০। ১–২টা কম্বো থাকলে ব্যাগেই সাইজ বদলানো যায় (B2), ৩টা বা বেশি হলে এক লাইনে ছোট হয়ে যায়। সাইজ বদলাতে এখন ৪ ট্যাপ + পেজ বদল লাগে, নতুনটায় ২ ট্যাপ।
- **সব ডিজাইনেই আছে:** "সাইজ বা রং বদলান", উইশলিস্টে রাখা + আনডু, স্টক কম হলে সতর্কতা, মোট দাম = কম্বোর দামের যোগফল, চেকআউটেও একই।
- **আপনার সিদ্ধান্ত লাগবে:** (১) উপরের ডিফল্টগুলো চালু করব কি না; (২) "অটো" প্রোডাক্ট পেজ এখন অনেক জোড়া হলে P2 খোলে — সেটা বদলে উপর-নিচ সেটে P3 করব কি না।
- ছবি: `scratchpad/combo-wave2/sheets/` — ক্যাটাগরি, প্রোডাক্ট, ব্যাগ — তিনটা পাশাপাশি তুলনার ছবি, বাংলা লেখা।

## 1. What was tested

| Page type | Templates | Set types | Screens | Runs |
|---|---|---|---|---|
| Category | L1 pair grid · L2 style cards · L3 hub · L4 big list · L5 2-or-3 first | Solid Polo (6 colours, S–3XL, 15 pairs) · Hoodie + Jogger (36 pairs) · summer tee 3-pack (20 triples, test rule) | 360×800, 393×852, 430×932, 1280×800 | 60 |
| Product | P1 pair page · P2 pick colours · **P3 top + bottom (new)** · **P4 mixed set (new)** · P5 fixed pack | polo pair · tee 3-pack · hoodie + jogger · jacket + hoodie + jogger (test rule, 216 sets) | same 4 | 80 |
| Bag | current · **B1–B5 (new)** | 1 combo · 3 combos (polo pair, hoodie + jogger, tee 3-pack) | same 4 | 48 × 5 tasks |

**Why this subset and not the full cross.** Each page type is judged on its own: the category journey always continues on P1 (so L templates are compared on the same next page), and the bag is filled the same way for every B template. A full L × P × B cross (5 × 5 × 6 × 4 sets × 4 screens = 2,400 runs) would mostly measure the same thing three times. Instead every template meets every set type it could plausibly face (P3 and P4 also on a polo pair and a tee pack, to see how they behave out of their home), on the three phone widths that bracket the market plus desktop. A separate sweep ran the new templates (P3, P4, P2, bag current + B1–B5) on all **15 gate phone sizes (320×640 → 440×956)** for layout only.

**The agent journey.** A script plays a first-time guest (no saved size, empty bag). On a product page it reads the main button and does what it asks ("Choose a size" → taps L, or the first size in stock; "Pick 1 more colour" → taps a colour; "Add both to bag" → taps it) until the combo is in the bag. It also taps the button too early once, to check the error. On the bag it changes one piece's size (black polo L → XL), moves a combo to the wishlist and taps Undo, makes a piece go out of stock, and opens "Change size or colour".

**Measured (scripts: `scratchpad/combo-wave2/rank.js`, `score.js`, `sweep.js`):** taps to bag · scrolls needed · scripted time (ms) and an estimated human time (1.1 s per tap, +1.2 s per scroll, +0.6 s per new page) · first screen: photo, price line, saving, size rows (share visible above the sticky bar), button · words above the fold · text cut off (ellipsis/hidden) · label/price lines that wrap (counted from the text's own line boxes) · things past the right edge / sideways scroll · overlapping tap targets · primary targets ≥ 44 px and nothing < 24 px · early-tap error inline (no toast, nothing added) · JS errors · bag: total = sum of combo prices = rows = checkout total.

## 2. Weights (100 points per page type) and why

**Product page:** taps to bag 20 · first-screen info 20 · errors 15 · layout health 15 · time 10 · tap targets 10 · words above the fold 5 · desktop works 5.
Taps and the first screen carry most weight because the research (§0 rules 1, 2, 5) and the owner's notes point at the same problem: shoppers who can't see the size buttons tap Add and get an error. Errors and layout are next because a toast, a cut price or a wrapped price line breaks trust for a COD buyer. Time is mostly taps + scrolls again, so it gets less. Taps target per set type: pair/pack 2, top + bottom 3, mixed 3-item 4; −5 per extra tap.

**Category page:** taps land → bag 20 · first-screen info (price, saving, ≥ 2 full cards, size info) 20 · layout 15 · time 10 · choice (cards in the first two screens) 10 · errors 10 · targets 10 · words 5.

**Bag:** change-size taps 20 · money correct 15 (also a knock-out) · first screen (3 combos: how many fully visible, total visible) 15 · keeps the required features (Change link opens the pair page, Move to wishlist + Undo, stock warning on the line) 15 · layout 15 · targets 10 · change time 5 · compactness 5.

**Knock-out (research §10.2):** a template whose journey fails on any screen, or that puts a wrong price in the bag, is out whatever its total. **No template was knocked out.**

## 3. Results

### Product page (score / 100)

| Template | polo pair | tee 3-pack | hoodie + jogger | jacket + hoodie + jogger | mean | taps | first size row y @393 |
|---|---|---|---|---|---|---|---|
| **P1 pair page** | **96.2** | **96.3** | **96.8** | **96.5** | **96.5** | 2 / 2 / 2 / 2 | 563 |
| P3 top + bottom | 95.4 | 91.0 | **96.8** | 95.7 | 94.7 | 2 / 2 / 2 / 2 | 646 / 727 / 573 / 573 |
| P5 fixed pack | 94.5 | 93.3 | 94.5 | 93.3 | 93.9 | 2 | 707–721 |
| P2 pick colours | 91.4 | 93.9 | 90.2 | 90.0 | 91.4 | 2 | 769–1,182 (below the fold) |
| P4 mixed set | 87.2 | 77.1 | 95.8 | 87.0 | 86.8 | 3 / 4 / 3 / 4 | 624–678 |

- All 80 journeys reached the bag with the right price. Early tap: inline error at the size row on every template, never a toast, nothing added.
- Every template loses its words points: 46–87 words above the fold vs the research target of 40.
- P2's size row sits under the fold on every phone (842 px at 393 for the polo), so it loses first-screen points.
- P4 needs one tap per piece (3–4) — right for truly different items, too many for a pack.
- P1 on a top + bottom set gives one "Size for both" row (one size for hoodie and jogger); the "Different size for each?" link is a click away. P3 gives a row per piece with the bottom pre-filled from the top — same 2 taps, but a shopper whose jogger size differs is not pushed into the wrong one. That is why P3 is the pick for top + bottom even though P1 ties on points.

### Category page (score / 100)

| Template | Solid Polo | hoodie + jogger | tee 3-pack | mean | taps | full cards on 1st screen |
|---|---|---|---|---|---|---|
| **L1 pair grid** | **88.7** | **86.2** | **86.2** | **87.0** | 3 | 2 / 1 / 1 |
| L5 2-or-3 first | 88.7 | 86.2 | 86.2 | 87.0 | 3 | 2 / 1 / 1 |
| L4 big list | 83.4 | 83.3 | 83.3 | 83.3 | **2** | 0 (one big card) |
| L3 hub | 82.2 | 84.1 | 82.2 | 82.8 | 4 | 3 / 2 / 3 |
| L2 style cards | 81.2 | 81.0 | 81.3 | 81.2 | 4 | 1 |

- L5 equals L1 where a style has no 3-piece tier (it shows L1 with a note). With a tier (Solid Polo) they still tie: L5 puts the 2/3 switch first and L1 shows it under the offer strip.
- L4 is the fastest (size on the card, 2 taps, no page change) but shows no complete card on the first screen.
- L2 and L3 add a page (style card → pair grid → pair), so 4 taps.

### Bag (score / 100)

| Template | total | change one size (taps) | est. s | px per combo (3 in bag) | money | required features |
|---|---|---|---|---|---|---|
| **B5 compact (B2 under 3 combos)** | **97.3** | 2.5 | 2.8 | **65** | ok | 15 / 15 |
| B2 size in the bag | 94.2 | **2** | 2.2 | 257 | ok | 15 / 15 |
| B3 B2 + "add 1 more" | 93.7 | 2 | 2.2 | 280 | ok | 15 / 15 |
| current (R16) | 82.5 | 4 + page change | 5.6 | 257 | ok | 15 / 15 |
| B1 grouped card | 81.4 | 4 + page change | 5.6 | 257 | ok | 15 / 15 |
| B4 price split | 80.0 | 4 + page change | 5.6 | 268 | ok | 15 / 15 |

- Bag total = sum of combo prices = rows = checkout total in all 48 runs. Move to wishlist + Undo, the stock warning and the "Change size or colour" link worked in every template.
- B4 (real piece prices + one combo discount) is the honest order-record / invoice view; in the bag it is the tallest and reads like extra charges, as the research warned.

## 4. Default picks (owner confirms — **nothing has been switched yet**)

| Page type | Default | Also offered |
|---|---|---|
| Category | **L1 pair grid** (already the default) | L5 when the owner wants to push the 3-piece pack |
| Product | **P1** for same-product pairs and packs · **P3** for top + bottom and mixed sets | P2 only as the "Pick your own colours" builder card; P5 for owner-matched packs; P4 for 3 truly different items when separate colours per piece matter |
| Bag | **B5** (draws B2 for 1–2 combos, compact rows from 3) | B2 if the owner never wants rows collapsed |

To apply after the owner says yes: Admin → Combos → Shop default templates (Combo category page / Combo product page / **Combo in the bag**). The product "Auto" rule today opens P2 when a style has more than 28 pairs (hoodie + jogger); the recommendation is Auto = P3 for two-different-product sets. That changes one expectation in `combo-auto/verify.js` ("hoodie+jogger (36) opens P2 automatically"), so it is left for the owner's yes.

## 5. Defects found and fixed while testing (find more than given)

1. **Bag 200 px wider than a 360 phone** whenever an auto combo was in it — the long generated name ("Ralph Lauren Solid Polo — Black + Navy · 2-piece combo") was nowrap in the order summary. The QA snapshot has it too. Fixed: summary names the combo the research way ("Solid Polo combo (2 pcs)"), and the bag's grid columns can no longer grow past the screen.
2. **Filter chips and sort 40 px** on L1/L4/L5 (house rule 44 px) — fixed.
3. **Style-card price wrapped** "৳1,800 for 2 · Save ৳ / 400" on L2/L3, and the offer strip's second line wrapped — fixed (saving stays on the photo badge; the strip steps down "Pay on delivery", then "Free delivery").
4. **Card sub-lines cut with "…"** on L1/L3 ("Choose from every colour", "36 colour pairs · pick any", product names) — shortened.
5. **Trust line under the size rows wrapped** to two lines at 360 on every pair page — now one line, dropping "Size swap" then "Free delivery" when needed.
6. **P2 colour names cut at 1280** ("Grey Melange", 6 across) — 3 per row on desktop too.
7. **A combo could not be moved to the wishlist** (only single items could) — every bag template now has Move to wishlist + Undo for combos; the combo goes to "Saved for later" whole and "Move to bag" puts it back with a stock check.

## 6. Limits — what this ranking is not

- Agents, not people. The 5-second "how much do you pay / save?" test and a 5-person tap test with real Facebook-audience shoppers (research §10.2) are still to do; the scores above cover the objective half.
- No real iPhone Safari here (no WebKit in the workspace).
- English UI only; Bengali UI of the combo pages is a separate item.
- The tee 3-pack and the jacket + hoodie + jogger rules are injected by the test only; they are not shipped. The owner can make the same rules in Admin → Combos → Make a combo.

## 7. Files

- Templates: `src/42-combo-auto.js` (P3, P4), `src/43-combo-tpl.js` (bag B1–B5, new), `src/50-bag.js` (template hook, shared helpers, combo → Saved for later, summary names), `src/85-admin-combos.js` (template choice only), `src/r12-zcombo2.css` (new).
- Tests and results: `scratchpad/combo-wave2/rank.js`, `score.js`, `sweep.js`, `rank/results_*.json`, `rank/scores.json`, `rank/shots/<screen>/`.
- Sheets (Bengali, Hind Siliguri): `scratchpad/combo-wave2/sheets/sheet-category.png`, `sheet-product.png`, `sheet-bag.png`.
