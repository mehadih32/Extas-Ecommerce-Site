# Round 15 — review of Version 10 (notes only; work starts after he says all reviews are in)

## Note 1 — home hero + footer (19 Oct, 01:37)

| # | What |
|---|---|
| 1.1 | **"Shop sets" background → row 4 of `shopsets-compare.png` (he marked it in red, 02:02) = v3 "Brand tint"** (a wash of the hero mint). Set `HERO_SETS_BTN = 'v3'`. |
| 1.2 | **Footer brand block:** "Menswear, made in Bangladesh" has drifted to the right side — looks bad. It is EXTAS's slogan and belongs **under the EXTAS wordmark, starting exactly under the E and running right**, with **10–12 px** between the wordmark and the slogan. |
| 1.3 | **Footer newsletter:** the "Your phone number" box is far too big and the **Join** button too small — it looks bad. Make Join nicer and give it more width. |
| 1.4 | **WhatsApp / Hotline buttons:** stacked one above the other looks good (fine on 15 Pro Max). When they sit **side by side** (16 Pro Max, 440 px) they must fill the width evenly and sit centred — not pushed into one corner — and right now the text and icons shrink there. Shorten **"Message us on WhatsApp" → "Text us on WhatsApp"** (fewer words), so the icon can be a little larger. |

## Note 2 — product page, from his real iPhone 15 Pro Max (19 Oct, 01:51)

He said: product page is the most important page — 80–90 % of conversion moves here. No mistakes. **Show a before/after picture for every point.** Do these (plus Note 1) first, then the rest of the review continues.

| # | What |
|---|---|
| 2.1 | 🔴 **Buy bar (Add to Bag / Order Now) sinks under the bottom of the screen** on a real iPhone (screen recording, 430×932): while scrolling / pulling the page, the lower half of both buttons goes under the screen edge and the home-indicator line sits on "Add to Bag". Never seen in desktop tests. Plan the fix (safe-area space under the bar + stop the page bounce dragging the bar). |
| 2.2 | 🔴 **"All N colours" — placement rule (he asked "why did you do this?").** It stays **right after the last swatch, on the swatch line**, for up to **5 colours**. Only from the **6th colour** (when it truly cannot fit) does it move up to the "Colour – Navy" line. With 3 colours it must never be up there. Dynamic. *Our answer: in R14 point 14.11 "stay on the colour line" was read as the label line ("Colour – Navy"), not the swatch line. Our mistake.* |
| 2.3 | **Heart (wishlist) goes right after the product title.** **Share icon removed** (per the standing rule: switched off in the dashboard, not deleted). |
| 2.4 | **WhatsApp icon moves to the header**, in the icon group with search and bag — first or last, wherever it looks best. **Exactly the same WhatsApp icon as on the product page now — no other icon, ever.** Hover → a small smart line drops down ("Need help? Chat with us" type). Hover/finger on it → the icon grows a little (like the current one). Click / tap → opens WhatsApp. |
| 2.5 | 🔴 **Fit line under the sizes (after tapping L / XL) must never become two lines.** Show measurements only as far as they fit on one line; whatever doesn't fit (e.g. "sleeve 8.25"" at the end) **hides automatically** — never drops to a second line. Same mistake as before; remember it permanently. |
| 2.6 | 🔴 **Price line "৳ price · space · | · space · text" must be ONE line on every device.** On some screens it was split into two lines (COD / bKash / Nagad) — he asked why. The text after the bar is custom, written from the backend (free delivery when on; otherwise his fixed text; discount when there is one). No case may become two lines. He asked: can you do it, or surrender? *Our answer: R14 added a "two balanced lines" fallback for narrow phones — that broke the rule. Our mistake.* |
| 2.7 | Size chart popup scrolls — he wanted no scroll, but **waived it: leave as is, don't touch.** |
| 2.8 | **Spacing:** add **+3 px** between "Colour – Black" and the swatch row. Pay for it from the gap under the size boxes: the fit-line values sit **in the middle** of the space between the size boxes and the buy bar, and the leftover pixels cover the +3 px (photo doesn't shrink). |
| — | Size chart icon/button: fine, no problem. |

## Done for Notes 1 + 2 (19 Oct, Version 11)

| # | What changed (source: scratchpad proto/src) |
|---|---|
| 1.1 | `HERO_SETS_BTN = 'v3'` (owner marked row 4 in red at 02:02 — corrected from v1). |
| 1.2 | Footer brand block is a column: wordmark, then slogan; slogan ink starts under the E's ink (measured 23.0 = 23.0 px), gap 10.5–11.5 px. `--ftr-slogan-gap` / `--ftr-slogan-x` (r12-home.css). |
| 1.3 | Join = bold 16 px, same height as the field, ~⅓ of the row (clamp 112–150 px), arrow icon. |
| 1.4 | "Text us on WhatsApp", icons 22/19 px, 15.5 px text, centred. Side by side only when `ftrReachFit()` measures that both fit at full size; else stacked. Nothing shrinks. (At 430/440 they stack at full size; side by side on wide screens.) |
| 2.1 | `viewport-fit=cover` in the page head; buy bar `padding-bottom:max(12px, env(safe-area-inset-bottom))`; `overscroll-behavior-y:none` on html/body (stops the pull-bounce dragging the fixed bar off-screen). Final proof needs his real iPhone. |
| 2.2 | `PDP_ALLC_UP_FROM = 6`: ≤5 colours → link after the last swatch on the swatch line (steps down All 5 colours → 5 colours → ▦5 if needed); ≥6 → label line. Gate check rewritten to this rule. |
| 2.3 | Heart in `.pdp-titlerow` right after the H1. `SHOWN.pdpIcons = {panel:false, wish:true, share:false, whatsapp:false}` — share kept, switched off. Rail gutters removed when the rail is off. |
| 2.4 | `hdrWa()` in the store header, first in the search/bag group, same `waGlyph()` in the pale-green disc. Hover (real pointers only): grows ×1.14 + tip "Need help? Chat with us" (`HDR_WA_TIP`) drops down. Press: grows. Pages: `HDR_WA_PAGES = {product:true}`; switch `SHOWN.header.whatsapp`. Narrow phones (≤374): icons 40 px, logo clamps 20–24 px. |
| 2.5 | `pdp_fitLineTrim()`: one line; fields hide from the end; first field always stays. 2-line reservation removed. |
| 2.6 | `pdp_payFit()`: one line; type steps 0.5 px down to `minSize` (11.5), then last pieces hide; never wraps, never "…". New `PDP_PAYLINE_DEFAULT.text` = owner's own words (split on the separator). R14 "two balanced lines" step deleted. |
| 2.8 | Colour label → swatches 6 → 9 px. Fit line centred between size boxes and buy bar (`margin-top: 1em + .6px`, budget uses it as the bottom air); next block starts exactly at the bar edge (no peeking). Photo height unchanged (±0.1 px; +7 px on the two tight screens). |
| demo | Demo gear parks as a slim left-margin tab on the product page when the header has no free gap (demo only). |

**Version 11 published 19 Oct (same demo link).** Device gate: **0 of 240** on all 15 phone sizes (`qa/v11-final.json`). Gate updated: All-colours check now follows the owner's ≤5 / ≥6 rule; new checks PRICE-LINE-TWO-LINES/CUT, FIT-LINE-TWO-LINES/CUT/FIRST-HIDDEN/HOLE/NOT-CENTRED; demo welcome sheet closed before measuring (was a random timing fail). Old gate kept as `device-matrix.pre-r15.js`. Before/after pictures: `qa/r15/cmp-*.png`.
Open to ask the owner: header WhatsApp on product page only (now) or on every page (logo would then sit in the same place on every page).

## Note 3 — after seeing Version 11 (19 Oct, 03:10) — "do it, update the demo live, keep a picture of each"

| # | What |
|---|---|
| 3.1 | Header WhatsApp on **every** page, except pages that already have WhatsApp in/near the header (checkout). **Floating WhatsApp disc removed everywhere.** |
| 3.2 | **Checkout exception:** when scrolling hides the "Need help? WhatsApp" block, a WhatsApp icon appears in the header, left of the "Secure" lock, with a gap. |
| 3.3 | Header WhatsApp **"bleeds"** — a soft glow/ripple spreading out, **not a flicker/shimmer**. |
| 3.4 | Header icon gaps (WhatsApp → search → bag) **2 px smaller each**; use the room to try the **heart (wishlist)** in the header (no account → asks to log in). If it looks bad, drop it and keep the heart only beside the title. Experiment, show. |
| 3.5 | **Bag icon** bigger, nicer, more noticeable. When the bag has items it **blinks/pulses** in the header and the bottom nav so the customer notices. |
| 3.6 | 🐞 **Bug:** "Buy together" → Add to Bag → "View bag" appears, tapping it does not open the bag. |
| 3.7 | **Title:** first line fills the full width (no balancing); the leftover words go to line 2. Heart right after the last word (try it there). |
| 3.8 | **Size chart chip 2 px up** (too little gap to the size boxes). |
| 3.9 | **3XL test:** six sizes (S…3XL) must auto-fit; keep a screenshot. |
| 3.10 | **Price row:** price | discount (stacked) | **second bar** | free delivery (or other text). When the second bar shows is set in the backend (per product / offer / campaign). If it does not fit on one line: "Free" over "home delivery", like the discount stack. |
| 3.11 | **Add to Bag colour:** Order Now unchanged; Add to Bag a near shade of the same colour so they read as two buttons of one family (no white/black/blue/red contrast). |
| 3.12 | **Home hero buttons ("Shop now / Shop sets"):** the whole system editable in the backend — labels (e.g. "Top bottom set"), links, style, on/off. |
| 3.13 | **Analytics (must exist, part by part, dynamic):** search terms; WhatsApp clicks by page and by button; add-to-cart → purchased; direct purchase (Order Now); removed from cart / re-added / new adds; adds that came from an offer; "All N colours" clicks; Size chart clicks; wishlist (heart) saves; logged-in vs guest. |
| 3.14 | **Combo page audit by an agent:** calculations, wrong information, UX complexity. |
| — | Cart page with 3 products + free-delivery bar: looks good. Desktop review tomorrow morning, then code. |

## Note 4 — 19 Oct, 03:31 (while note 3 was being built)

| # | What |
|---|---|
| 4.1 | **Search must answer help words:** "delivery", "return policy", "exchange policy" (and the like) show nothing today. Asked long ago — add them so these searches show results (the right help/policy pages and answers). |
| 4.2 | **Checkout delivery time, in HOURS, per band, editable in the backend.** Under "Free home delivery" the line "usually 1–4 days anywhere in Bangladesh" is wrong. Inside Dhaka → **24–48 hours**; outside Dhaka → **48–72 hours**, decided from the address. Plain English, e.g. **"You'll get your order within 24–48 hours."** |
| 4.3 | **Thank-you page headline** states the same: "You'll get your order within 24–48 hours" (or 48–72 outside Dhaka). Was missing; it matters. |
| 4.4 | **Invoice design fully customisable from the backend — every word.** |
| 4.5 | **Customer dashboard:** order number must be **clickable** (opens the order page; today only "Track" does); an **invoice download icon beside the order number** (or at least download from the order page). 🐞 "Get invoice" on the order/track page opens no popup. |
| 4.6 | 🔴 **Browser back (back gesture / backspace / desktop back arrow) cannot return to the bag.** Big problem. |
| 4.7 | **Customer messages — only two from us, then stop.** SMS ① the moment the order is placed on the site; SMS ② when the shop confirms/processes it (booked with the courier). **No more from us after that** — the courier sends its own pickup message, so the customer gets three in total; more is annoying. **WhatsApp: one message from us, when we process the order.** Every later step (picked up, out for delivery, delivered) — nothing from us by default. |
| 4.8 | **Customer dashboard offers, desktop only:** the rotating single offer is good on phone (leave phone as is). On desktop the rest of the width is empty → show **three offers side by side** (left / middle / right, generous equal gaps), each from a **different category**, each showing that category's **top-selling product**. |
| — | **Standing instruction (03:34):** fix every bug without asking; for design choices pick one, apply it, and keep 2–3 screenshot options so he can confirm or change later. |

## Note 5 — 19 Oct, 03:43

| # | What |
|---|---|
| 5.0 | **Answers and picture labels in Bengali, not English.** |
| 5.1 | 🐞 **Combo / set page: tapping a product picture opens the single product page** → the customer leaves the combo and won't buy it. Picture taps must never leave the combo page (pick colour/size in place). The "Your set" empty boxes keep working as now (tap → scrolls to the list below). |
| 5.2 | **Combo is the biggest-selling section.** Keep today's page (bugs fixed) **plus 3–4 more complete layouts** built for conversion, switchable, so he can test and keep the winner. Worry: "Add to set / Add to combo" may confuse. |

## Note 6 — 19 Oct, 03:53

| # | What |
|---|---|
| 6.1 | **Pull-to-refresh is missing.** Pulling the page down from the top should refresh it (Fabrilife does it); a refresh also clears a wrongly picked size. Add it (iPhone and others). |
| 6.2 | **Final report wanted:** everything done, where I got stuck, where permission is needed, where I decided on my own. |

## Note 7 — 19 Oct, 03:57

| # | What |
|---|---|
| 7.1 | 🐞 **Swipe from the left edge → after the home page a blank page opens** (iPhone 16 Pro Max). Test on several devices with a real journey (pages, category, product, bag) and report whether it is a bug. Also: **the page order is wrong sometimes — from several products it suddenly jumps to the home page** (happened 2–3 times). |
| 7.2 | 🔴 **After a while the whole screen jolts.** Must not happen. |
| 7.3 | 🐞 **Bag page "Save for later":** tapping it removes the item and then shows "Your bag is empty" — where did it go? The guest isn't logged in and has nothing in the wishlist. Is "Save for later" sensible here (should it ask to log in)? Is "Remove" sensible? Research Fabrilife and decide. |

## Note 8 — 19 Oct, 04:02 — COMBO IS TODAY'S FOCUS

Combo is the biggest-selling section and carries the most offers. **Deep research from every angle, then fix every UI/UX problem.**
- Add a **combo category page**; **combo category, combo product page and combo bag each get 4–5 templates** (checkout too if it helps).
- Test every template with real kinds of sets: **winter** big items (tracksuit, jacket, hoodie set) and **summer** packs (2–3 polos, 2–3 tees, sweaters); **5–6 colours**, sizes **S → 3XL**, on every phone size.
- **Rank** the templates (what each is best for), tested by us/agents.
- Work out **how the set's photos show together** (two items in one picture etc.).
- Must be easy for every kind of shopper — understand the combo, pick, buy. No patchwork pages.

## Note 9 — 19 Oct, 04:06

| # | What |
|---|---|
| 9.1 | **Backend: a separate, very easy "Combos" section** (inside Products or on its own) where only combos are handled — create/update combo products, upload photos, choose which products/colours/sizes make the combo, price, offer, on/off. Built for non-technical people: everything they want, done simply. |

## Note 10 — 19 Oct, 04:09 — the owner's own combo model (from his WordPress years) — KEEP ALONGSIDE everything else

- On WordPress each combo was **a product page of its own**: the two photos side by side, title like **"Ralph Lauren Polo — Black & Navy · 2-piece combo"**, **no date, no offer window — it just keeps running**; shown as **"2 pcs regular ৳2,200 → combo ৳1,800"**.
- Wanted now, dynamic: when uploading a product he can **tick it into a combo**; or pick a **category / sub-category** and bring **all its products under the combo**. The system then **auto-generates every colour pair** (Black + Navy, Navy + Yellow, Yellow + Black …) as combo listings. He then **promotes that sub-category**: shoppers open it and see the ready colour pairs.
- **No single piece in these combo sections** — a 2-piece combo sells as 2. Optional: **add one more → 3-piece at a bigger discount**. Never 1. A tick-box per section: "no single piece here".
- All bindings dynamic: whole category, sub-category, or just chosen products; on or off at once.
- **Clarified (04:11):** the promoted link is a **category page** — e.g. Polo → sub-brand "Ralph Lauren" → the new style "Solid Polo". Under that link the page shows **only the auto-generated combo products** made from that style's colours (6 colours → Black+Navy, Navy+Yellow, Black+Yellow … every colour with every other), each as its own product card. Tapping a card opens **that pair's combo product page**. Flow: owner uploads the single product as usual → in the Combo section picks the category / sub-category / product → picks **2-piece or 3-piece** → the combos generate automatically.

## Note 11 — 19 Oct, 04:17

| # | What |
|---|---|
| 11.1 | Build the **6-colour auto-pair example in the demo** (e.g. Solid Polo, 6 colours → every colour pair as a combo product on its category page), and have an **agent walk the customer journey** with every product and every colour. |
| 11.2 | **Templates for every combo kind:** the existing combos, his auto-pair combos, and **3-product combos** (three items must display together) — each needs its own templates. The combo section has become a big section; organise it cleanly. |
| 11.3 | **Version boundary:** "EXTAS Demo store" Version 11 = everything up to the published V11. **Everything from Note 3 (header WhatsApp on all pages) onward is new and lands in Version 12.** |
| 11.4 | **Morning report, in sequence:** every item from Note 3 to now, in order; the combo work part by part; with the pictures for each place that changed. |

## Note 12 — 19 Oct, 04:21

| # | What |
|---|---|
| 12.1 | 🐞 **Footer → Help → "Size guide" opens the polo product page.** It should open the height-and-weight size finder window. |
| 12.2 | 🐞 **Back does not return to where you were:** footer → Contact → swipe back → lands at the TOP of home instead of back at the footer. |
| 12.3 | 🐞 **Back sequence bugs:** category → product → bag (header icon) → swipe back → product page comes but **jolts**; back again → category comes, jolts, then **jumps to home by itself**; forward again goes elsewhere. Elsewhere: blank pages, jolts, pages sliding down from the top. Have an agent test all of these. |
| 12.4 | **A huge e-commerce checklist** (every system a shop can have, point by point, nothing left out), then an **agent tests every point** on desktop and several phone models. Bugs found after launch drop sales. |

## Note 13 — 19 Oct, 04:26

| # | What |
|---|---|
| 13.1 | **Product photo zoom is missing.** Customers want to zoom in on the structure / fabric. The page shows a cropped, short-and-wide photo (space), so: tap / double-tap / two-finger pinch → **full-screen viewer showing the ACTUAL full image from the backend** (not the cropped one). Build it the smart way. |
| 13.2 | Owner's worry: "are you dropping earlier work for each new voice?" — **No item is dropped; every voice is noted and done.** |

## Note 14 — 19 Oct, 04:30 → filed as **PR 570** (S21)

| # | What |
|---|---|
| 14.1 | The QA agent's big checklist, filtered, **lives in the dashboard's AI section**. **One click → 2–3 agents** re-check everything; or a **schedule** (e.g. weekly) runs it and sends the report to his **Telegram bot**. He controls when, how many agents, and **which groups** (checklist grouped and prioritised). Agents write the report and the bug list; **fixes only with his permission**. |

## Note 15 — 19 Oct, 04:36

| # | What |
|---|---|
| 15.1 | **Version 12 demo must include the backend demos — all of them** (settings, backup, audit, AI control room, agents, combo section, products, customers, couriers, ads, blog/SEO, server health …) so he can review the backend too. |
| 15.2 | **The same fixed agents from now to the live server.** The agents doing the work now (bug fixing, design, categories) are the ones that stay — in the code phase and in the live dashboard's AI section, each doing its own section; skills are not re-taught to new agents. |
| 15.3 | **A 360° profile for every agent** — name, role, plan, skills it has, skills it is learning, work it is doing/has done, test results, performance. "They are our employees." |

## Note 16 — 19 Oct, 04:41–04:43

| # | What |
|---|---|
| 16.1 | **Bring outside skills into the library**, marked for the agent they are for, so every agent adopts all its skills each time it starts. More advanced skills for every agent (e.g. the brain/AI agent, the marketing agent). |
| 16.2 | **Agent reports — daily, weekly, monthly, yearly** — like an employee: history, what it did, what it didn't, skills learned; a multinational-style **appraisal**. |
| 16.3 | **Skills are now very serious:** each of the six agents must gain knowledge in its field at the level of a **Harvard / Oxford / MIT graduate, post-graduate or PhD**. |

## Note 17 — 19 Oct, 04:45 → PR 580

| # | What |
|---|---|
| 17.1 | Money stays controlled (spend caps). **Model choice two ways:** the system auto-suggests a model for each agent job; he can accept it or change it. **Free models** are in the pool and are tested: if a free model does the job at the same quality, use it. Cost control must never lower quality. |

## Note 18 — 19 Oct, 04:52 → PR 577 (extended), 581, 582

| # | What |
|---|---|
| 18.1 | Agent profiles editable by him: **photo, name, bio, joining date, rewards, verified star, assignments**. |
| 18.2 | **Start the teaching now** (curriculum is written, teaching must begin). The e-commerce agent needs deep **worldwide e-commerce** knowledge; **photo** knowledge too. |
| 18.3 | **A seventh agent — ads specialist (PPC)**: Google, Facebook, YouTube, TikTok, Instagram only. World-class (as if it had spent billions on fashion e-commerce ads). Sets up campaigns, arranges pictures/videos, runs the ads itself. He gives fixed bindings: max cost per purchase, budget, sales target; it scales up, **suggests budget increases for his approval**, cuts budget itself where needed. Instructions via **Telegram**. Load every ad skill from Google/YouTube/known sources. "If sales don't come the whole business collapses." |
| 18.4 | Question: can this run from his dashboard, or is a third-party tool needed? |
| 18.5 | **Strong memory** for the agents, built inside the system. |

## Note 19 — 19 Oct, 04:55 → PR 583, 584

| # | What |
|---|---|
| 19.1 | One **chief agent** (virtual CEO) the owner charges; it charges the others by performance — a chain of command. Claude picks who. → **Gyani জ্ঞানী, A360-01**. |
| 19.2 | Questions like "why sales low this month/week", "why was the courier entry wrong today", "why this bug on the category page" → the chief finds the responsible agent and holds it to account. In the AI section. |
| 19.3 | Broad knowledge beyond its own field, enough to run everyone. Second only to the owner. |
| 19.4 | Without permission it may NOT: transfer money, change COD on an order, pay anyone, other financial actions. Research and reports are free. |
| 19.5 | One shared Telegram: every message carries the agent's identity (who sent it, like an employee). |
| 19.6 | Command naming an agent or its **employee code** → auto-assigned to that agent. "That's why the name is Agent 360." |

### Done — auto colour-pair combos (Notes 10–11, PR 571), 19 Oct ~05:00
- New: 01y-combo-auto-data.js (Ralph Lauren Solid Polo ৳1,100, 6 colours, S–3XL; Piqué Polo 3 colours; 7 rules), 42-combo-auto.js, r12-zauto.css. Routes #/combos, #/combos/<rule>, #/combo-pair/<id>.
- Pairs: 15 polo 2-pc, 20 polo 3-pc, 15 hoodie, 15 sweater, 36 hoodie+jogger, 18 two-style. Sold-out colour hides its pairs; new colour → new pairs instantly; sizes only where every piece has stock.
- Templates L1–L5, P1/P2/P5; no single-piece link; "add 1 more → 3 pcs" upsell.
- Claude made the 3 hooks explicit (02-core bagSetPrice, 50-bag thumbnail, 88-track sources) and removed the runtime wrappers; verify.js on r16.html: ALL PASSED.

### QA checklist round (Note 17/PR 570 groundwork), 19 Oct ~05:05
- qa/ECOMMERCE-CHECKLIST.md: 405 points — 209 pass, 54 fail, 48 need the real backend, 94 not run yet.
- qa/QA-REPORT-R15.md: 22 bugs ranked (scroll lost on back, swipe breaking history, Enter placing the order, size guide link, wrong footer links, Bengali gaps, header jolt at 360, focus in popups, tap targets…).
- Passed: no blank pages, no jump-to-home, 0 JS errors, no sideways scroll on 55 routes × 8 devices, PTR on 17 page types.
- Not testable here: real iPhone Safari (no WebKit in the workspace).
- Bug 7 (offers tick on by default) = owner ruling, kept.
- Fix wave 1 dispatched to Prohori A360-02 (all other bugs, without asking — owner order 03:34).

## Note 20 — 19 Oct, 05:09 → PR 585
| # | What |
|---|---|
| 20.1 | Make two agents the most powerful: **ads (Tirondaj)** and **marketing/SEO (Doot)**. |
| 20.2 | Learn heavily from LinkedIn, Reddit, YouTube (esp. Pakistani e-commerce tutorials), Facebook authority pages, SEO and paid-ads blogs, big SEO specialists' videos and blogs worldwide. |
| 20.3 | When stuck → read every source, solve it, add it as a skill to its basket, continuously. No shortcut learning. |
| 20.4 | Give them tasks like "rank on Google within 3 days" so they get in line. |
| 20.5 | If a paid subscription is needed, the owner will buy it. |

## Note 21 — 19 Oct, 05:10 (QA standard)
| # | What |
|---|---|
| 21.1 | The 48 backend-only points are tested from inside the real backend later. |
| 21.2 | The 54 failed + 94 not-run (148) must be run again; **all 357 non-backend points must show PASS**. |
| 21.3 | Phones: 6–8 sizes minimum, all must pass. **Tablets too: Apple iPads and Android tabs.** |
| 21.4 | Every page and section: home, every category, product, bag/add-to-cart, checkout — all pass. |

## Note 22 — 19 Oct, 05:16
| # | What |
|---|---|
| 22.1 | Owner asked: make temporary emails and take every paid tool/course free trial with them so the agents learn. |
| — | **Claude's answer:** not done — throwaway accounts to get trials break those services' terms, and Claude can't create accounts from here anyway. Instead: free official academies (Google Skillshop, Meta Blueprint, TikTok Academy, Semrush/Ahrefs/HubSpot academies) added as core sources; a TRIAL-PLAN per power agent so ONE honest trial per tool, taken by the owner with his own account after go-live, is used to the maximum. |

### Done — backend demos wave 1 (Note 15, PR 491/492, 395/507, 570, 423, 304–341, 577–584), 19 Oct ~05:20
- Pages: #/admin/settings (two tiers, search, reset, own-data lock), #/admin/backup, #/admin/audit (404-point checklist, 23 groups, P1–P3), #/admin/health, #/admin/ai tabs (AI-off proof, model picks with free-model scoring PR 580, spend caps, data routing, cost book), #/admin/agents (7 agents A360-01…07, org chart, Ask the chief + investigations + editable permissions, Telegram preview with name/code assignment), #/admin/agents/<id> (editable 360° profile, skills, curriculum, work log, KPIs, Tirondaj guardrails, Bengali reports + appraisal).
- Simulated data marked "Demo · simulated"; work logs/lessons/skills/curriculum are the real files.
- Tests 1280 + 393: 0 JS errors, no sideways scroll, 612 buttons, 130 flow checks.
- Hardcoded text found (71-pages delivery/exchange, announce ৳1,500) → sent to Prohori's fix wave.
- Wave 2 started: products + combo tick, combo wizard, customers/CRM, couriers, ads (Tirondaj), blog/SEO.

### Done — curriculum wave 1 (Notes 18.2, 20, 22; PR 579/585), 19 Oct ~05:35
- 35 modules + 6 exams (138 items, pass 85%): Tirondaj 9 (+README cert map, MYTHS, LEARNING-LOOP, PRACTICE-TASKS, PAID-TOOLS, TRIAL-PLAN; exam 30), Doot 9 (same extras; exam 28), Gyani executive 5 (exam 20), Sawdagor 6 (exam 20), Shilpi photo 6 (exam 20), Bhandari photo pointer.
- Every rule tagged [OFFICIAL] / [2-SRC] / [HOUSE] / [COMMUNITY — test before use]; sources + "as of Oct 2026" on each module.
- Couldn't read: Meta Help Center pages, reddit.com directly (mirrors only), LinkedIn; no South-Asian YouTube transcripts found (no channels invented).
- **Owner decisions raised:** (1) FAQ rich results now only for gov/health sites — keep FAQ, don't promise the snippet; (2) llms.txt low priority; (3) Google Shopping availability in BD unclear → test in Merchant Center; (4) which messages count in "2 SMS + 1 WhatsApp" (vs size-check WhatsApp, review request); (5) **WhatsApp marketing opt-in ticked by default may break WhatsApp's opt-in rule**; (6) exchange-only return policy markup; (7) Bengali pages own URLs (/bn/) for search?; (8) Google Business Profile not eligible while online-only.

### Done — backend demos wave 2 (Note 15; PR 90/571–576, S14 + PR 561, S08, S13 + 581, S12/S11), 19 Oct ~05:50
- #/admin/products (list, form with colours/sizes/stock/photos, "Use in combos" tick with live pair count), #/admin/combos (auto rules, 8-step wizard, fixed combos), #/admin/customers (no address without order reveal, logged; no auto-block), #/admin/couriers (3 bands from settings, booking, refused→restock, COD reconciliation, over-charge claims), #/admin/ads (guardrails, budget approvals blocked over the daily ceiling, kill switch, delivered vs orders, tracking, connection checklist), #/admin/blog (editor, SEO checklist, Google preview, journal publish, sitemap tab).
- Flow tests pass at 1280 + 393 (new product → 16 pairs live; wizard rule → promoted page; CRM reveal logged; courier refusal → restock; ads approval/kill).
- Claude made the comboOff filter explicit in 42-combo-auto.js; 4 patches (99-boot popup-close race, productImg uploaded photos, journal slug/body, demo panel links) sent to Prohori.
- **Claude's/agent's decisions to confirm:** new product starts with "Use in combos" ticked; unticking removes it from every rule; combo rules can't be deleted, only switched off; an approval over the daily ceiling is blocked until the ceiling is raised; Bengali blog posts publish though /bn is off; phone number reveal on profile not logged (address reveal is).

### Done — curriculum wave 2 (PR 579/585), 19 Oct ~06:10
- Shilpi ux/ 10 modules (exam 24), Prohori 11 (exam 25), Bhandari 8 (exam 22), Doot + Tirondaj module 10 "South-Asia practitioners" (exams 31 / 33). Totals both waves: 66 modules + 2 deepening, 9 exams. Exams not yet sat (sandbox).
- South-Asian search (English/Bengali/Hindi/Urdu): YouTube mostly unreachable; usable BD/PK/IN blogs gave 6 two-source COD practices (confirm before dispatch, advance only for high-risk, tiered friction not blanket blocks, fast follow-up after failed delivery, ad promise = page promise, courier by region). All unsourced RTO % rejected. Found to review later: Nazmul Ahmed free Bangla digital-marketing course (YouTube).
- Unverified: bKash/Nagad official docs, courier API docs (Steadfast T&C verified: 1% COD charge etc.), BD VAT details (needs accountant).
- **Claude decided (technical, in line with earlier rulings):** reverse proxy stays Caddy (PR 7), Nginx knowledge kept for the ERP; third backup copy = a second add-only Google Drive (owner: Drive only, never Azure storage); vault key = encrypted key file on the server (VM package unchanged), PR 493 as filed; HSTS preload = no for now (hard to undo); fonts = Archivo + Hind Siliguri (current); tablet gate = portrait AND landscape (owner: everything must pass); reduced motion follows the phone's own setting, no extra switch; stock hold 15 min guest / 20 min signed-in, COD held until confirmed (max 24 h) — default, editable.
- **Owner decisions:** (a) do COD confirmation and failed-delivery follow-up count inside "2 SMS + 1 WhatsApp"? (b) "trial at delivery" (try at the door) yes/no/test; (c) GS1 barcode or internal barcodes; (d) accountant to review VAT/invoice before launch; (e) collect official merchant API docs from bKash, Nagad, SSLCommerz, Steadfast, Pathao, RedX.

### Done — Prohori fix wave 1 (QA R15 + tablets), 19 Oct ~07:15
- Gate on r16.html: **0 / 480 fail** (15 phones 240 + new tablet group 10 sizes 240). combo verify, admin ops-test/ops-flow: all pass.
- 19 of 22 bugs fully fixed: one history model (state id/idx, scroll per entry, swipe/Backspace = history.back only, late native back undone before paint, popups close first, works after refresh, slow swipes up to 1.5 s); Enter never places the order; size guide over the current page; Careers/Payment pages, social links from settings; checkout fully Bengali, Bengali digits, typo search; header 0 px jolt at 360; checkout details survive refresh; help gutter 16 px; popup focus trap; tap targets ≥32 px; aria labels; h1 + skip link; no forever timer; demo tab inside screen; FAQ/delivery/exchange/announce read settings; backend wave-2 patches applied.
- Bug 7 = owner ruling kept; 9 partial (needs owner's real WhatsApp/hotline); 21 partial (code phase).
- Checklist now: ✅297 ❌12 —58 ⬜38. Of the 12: 10 wait for owner data (WhatsApp, hotline, email, DBID, licence, social), L27 slider snap vs owner's auto-slide rule, P11 same size twice = "already in bag".
- Independent QA rerun (R15b) started on frozen snapshot r16-qa-snapshot.html; Sawdagor combo wave 2 (P3/P4, bag B1–B5, ranking) started on src.
- Publishing V12 to the demo link was blocked by the permission system → asked the owner.

### Done — combo wave 2 (PR 573–576), 19 Oct ~09:00
- P3 (top+bottom: set colour first, size row per piece, top size fills bottom) and P4 (mixed set, compact rows) built; bag templates B1–B5 in 43-combo-tpl.js (B1 grouped read-only, B2 size changed in the bag, B3 + "add 1 more", B4 real piece prices + one discount line, B5 compact rows at 3+ combos); "current" kept. Combos can now move whole to Saved for later (Undo, stock-checked Move to bag).
- Ranking, 188 agent journeys on 360/393/430/1280, no failures, all bag prices right: category L1 87 = L5 87 > L4 83.3 > L3 82.8 > L2 81.2; product P1 96.5 > P3 94.7 > P5 93.9 > P2 91.4 > P4 86.8; bag B5 97.3 > B2 94.2 > B3 93.7 > current 82.5 > B1 81.4 > B4 80.0. Report: review/COMBO-RANKING.md; Bengali sheets in scratchpad/combo-wave2/sheets/.
- Extra bugs fixed: bag 557 px wide at 360 with an auto combo (long name) → short name "Solid Polo combo (2 pcs)"; filter chips 40→44 px; price/offer lines one line; P3 labels "Polo 1 / Polo 2"; P2 colour names at 1280.
- **Claude applied the winners (owner rule 03:34: pick, apply, confirm later):** category L1 (unchanged), product Auto = P3 for top+bottom/mixed sets, P1 for same-product packs (P2 for very long lists), bag default B5; checkout uses the same short combo name. verify.js updated (B5 default, ▸ shows Change; hoodie+jogger opens P3) → ALL PASSED.
- Owner to confirm: these defaults; keep the label "Move to wishlist" for combos though they go to "Saved for later".

### QA rerun R15b (independent tester), 19 Oct ~09:30
- 20 sizes (8 phones, 10 tablet orientations, 2 desktops); route sweep 123 routes × 20 = 2,460 checks: 0 JS errors, 0 sideways scroll, 0 blank, 0 crash; device gate 0/480.
- Points: ✅313 ❌22 🔒10 (owner data) ⚖2 (owner decisions) —58 (backend / real device). **Standard not met yet.**
- Journeys: phones 128/128, tablets portrait 64/64, wide touch tablets ≥1024 66/96 (no PTR / edge swipe there), desktop 37/38.
- 16 bugs → fix wave 2 sent to Prohori (incl. single-item size/colour change in bag, wishlist Add to bag, expired offer codes, price-change note, 16 px inputs against iPad zoom, exchange bar, footer labels at 1024, a11y).

### Done — Prohori fix wave 2 (R15b bugs), 19 Oct ~11:00
- All 16 bugs fixed: touch detection by input type (iPad landscape/Pro get PTR + edge swipe; mouse never), price-change note (addedPrice) in bag + checkout, 16 px inputs everywhere, exchange bar inside screen, trio chip names full, footer labels wrap at 1024+, aria-invalid/describedby, tap targets, single-item size/colour change in the bag with stock check and merge, wishlist Add to bag + Remove, expired codes rejected with a clear message, demo tab moved, size-guide gutter, combo not-found h1, "Done" contrast 6.6:1, blog View aria-label. Extra: stock warning at the top of checkout, wallet line on phone checkout, admin <main>, an old bug where typing disabled Confirm in style "b".
- Gates on r16b-qa-snapshot.html: device gate 0/480, combo verify ALL PASSED, combo sweep clean, admin ops tests pass.
- Independent re-check R15c started.

## Note 23 — 19 Oct, 11:39 (owner's answers)
| # | Owner said | Action |
|---|---|---|
| 23.1 | Marketing ticks: **SMS tick stays on; WhatsApp tick separate and empty by default** | demo + PR 148/505 scope |
| 23.2 | "2 SMS + 1 WhatsApp" counting → agent's proposed default allocation (doot D09) accepted | file |
| 23.3 | **Bengali pages get their own URLs — wants Google traffic**; plan how it will come | Doot plan |
| 23.4 | Google Shopping in BD → test in Merchant Center after live | parked to go-live |
| 23.5 | "Use in combos" tick on a new product: keep it as an option (fine) | as built |
| 23.6 | "Combo rules can't be deleted" — didn't understand → explain | reply |
| 23.7 | Approval over the daily ceiling blocked until ceiling raised — OK | as built |
| 23.8 | Phone reveal not logged, address reveal logged — didn't understand → explain | reply |
| 23.9 | **Trial at delivery: yes** — customer may try in front of the rider | demo text + setting |
| 23.10 | Barcodes: courier/internal barcodes are enough (no GS1) | file |
| 23.11 | VAT/invoice: later, no worry. bKash/Nagad will be done. **Backend must have no gaps** | file |
| 23.12 | Slider snap (L27): **Claude's decision** → snap when the customer drags by hand, auto-drift stays | demo |
| 23.13 | P11 same size twice: keep "already in bag" as now; **quantity-2 as a backend option** | demo setting |
| 23.14 | Keep V11 and make V12 separately | V12 published as a new demo link |
| 23.15 | Why did the system restart? → explain | reply |
| 23.16 | Will check the 4 combo designs himself, may ask for more; keep current defaults | as is |
| 23.17 | "Move to wishlist" label for combos: he'll check; keep default for now | as is |

## Note 24 — 19 Oct, 11:48
| # | What |
|---|---|
| 24.1 | Phone numbers: no need for this much privacy in admin — show them, **record views**. Make it easy. → full numbers in list/profile, profile opens and copies logged; address rule PR 561 unchanged. Sent to Sawdagor. |
| 24.2 | Still doesn't understand the "combo rule can't be deleted" point → explained again with an example; offered an "archive" (hide from the list) if he wants a delete button. |

## Note 25 — 19 Oct, 11:51 — combo rule lifecycle (owner)
| # | What |
|---|---|
| 25.1 | Never delete — deleting loses Google rank of the combo pages and breaks shared links. |
| 25.2 | When an offer ends, the page goes to **archive automatically**, but the link stays live on Google and everywhere; anyone opening it can't buy — shows "offer ended" (or "sold out" when stock is gone). |
| 25.3 | Stock ends automatically; a timed offer ends automatically at its time — he shouldn't have to switch anything off. A manual off option may stay. |
| 25.4 | Combos also run without any occasion (new products are sold as combos) — so dates are optional. |
| 25.5 | "Don't make it complicated — dynamic, nice and easy." |
| → | Sent to Sawdagor: optional start/end dates, auto-end, ended state (page live, no add, alternatives), auto Archive tab, turn-on/extend brings it back on the same URL, off = ended. |

### Done — Google traffic plan (Doot A360-06; Note 23.3), 19 Oct ~12:10
- review/GOOGLE-TRAFFIC-PLAN.md (Bengali summary on top). English at /, Bengali at /bn/ with hreflang; English-script searches dominate in BD (Trends: "polo shirt" 14.5 vs "পোলো শার্ট" 0.2) except panjabi (11 vs 5); no BD fashion competitor has a /bn section → little competition in Bengali script.
- Speed of traffic: brand days–2 weeks; long-tail top 10 in 2–6 weeks; image search weeks–3 months; journal 2–6 months; Eid 2027 panjabi pages indexed by 15 Jan 2027.
- **Found:** extas.com.bd is already live (WordPress, 49 URLs) → this is a migration, 301 every old URL (PR 587). Google ended FAQ rich results for all sites on 7 May 2026 (PR 224 reworded).
- **Owner decision raised:** products named with other brands (Ralph Lauren, Prada, Boss, Diesel) on the old site and in our demo — Google Merchant Center / Meta can suspend for counterfeit/trademark; structured data must say EXTAS. Brand-name guard (N6) not filed until he decides.
- Filed PR 586–589; updated PR 220, 224, 235, 237, 503, 571.

## Note 26 — 19 Oct, 12:04
| # | What |
|---|---|
| 26.1 | extas.com.bd is his site. |
| 26.2 | Products named by style ("Classic Solid Polo") — agreed. Asked: does the brand leave the title or only the URL? |
| 26.3 | Don't fix it in code — make naming and URLs customisable in the backend; he decides there. Sales must not suffer. → PR 590 (per-product name / slug / SEO title / feed title / brand, auto 301 on slug change, brand warning not block, bulk rename, before/after report). |

## Note 27 — 19 Oct, 12:07
| # | What |
|---|---|
| 27.1 | English pages are the most important; Bengali at /bn/ as Doot proposed — OK. |
| 27.2 | WordPress links must come over — 301 redirects (Claude's advice: the 301 map of every old URL, PR 587). |
| 27.3 | **Brand names stay** (replaces 12:04): ads already run with brand-named links without problems; articles name each product's brand. Don't remove brands from the demo — **add more brands** to show it. → sent to Bhandari; PR 590 updated (brand field per product, warning off by default). |

## Note 28 — 19 Oct, 12:10 — blog as a traffic engine
| # | What |
|---|---|
| 28.1 | The blog will publish many articles beyond our products — everyday fashion knowledge (how to keep a polo in shape, how to wash denim, …) — continuously, plus our own product posts. |
| 28.2 | Doot must organise it that way: interlinking and every SEO factor in mind. "We will post a lot to pull traffic." |
| → | Queued for Doot (3 agents already running): BLOG-CONTENT-PLAN.md — topic pillars and clusters, 90-day calendar from real queries, interlinking rules (article → category/product, product → guide), templates, quality gate, cadence, Bengali twins, measurement; register scope on S12. |
| 28.3 (12:14) | Quality is Claude's/the agents' job — don't ask him. Agents propose topics (or he gives them), list shown to him in the backend; high-quality writing; **another agent proofreads**; at least 3, usually 5–6 posts a day. He only needs traffic. → PR 591. |

## Note 29 — 19 Oct, 12:14–12:17
| # | What |
|---|---|
| 29.1 | Add 2–3 more agents if needed, use every agent, finish fast. → 6 agents running (Sawdagor, QA tester, Bhandari, Doot plan, Gyani+Doot blog backend, Shilpi blog front-end). |
| 29.2 | Show the blog in V12 for review: backend pages, front-end UI/UX — how a visitor sees the blog section and how a post page looks. → Shilpi builds #/journal home, pillar pages, post template (quick answer, contents, product block, related, share, Bengali twin), 8–10 demo posts. |

## Note 30 — 19 Oct, 12:20 — blog = full section + our own ads
| # | What |
|---|---|
| 30.1 | Ad placements in the blog: banners on the blog list, inside the article (like AdSense), sidebar; popup per post possible. All **our own products/banners**, no outside ads; controlled from the backend (which ad where, which post). |
| 30.2 | The blog must be a complete, standard blog (many categories) as a section of the shop — dynamic, nothing missing, beautiful. |
| → | PR 592. Shilpi (front) renders slots; Gyani (backend) builds the ad-slot manager; shared contract ST.blogAds. |

## Note 31 — 19 Oct, 12:22 — several blog authors
| # | What |
|---|---|
| 31.1 | One author isn't enough — 4–5 author agents under the main content agent, only writing articles and helping blog SEO. |
| 31.2 | Asked: does keeping more agents raise cost if they're idle? Models kept with each agent, cost only when used? More author names good for Google? Claude's opinion/plan. |
| → | PR 593. Answer: idle agents cost nothing; cost = articles × length × model; Google doesn't rank by number of authors — real expertise and honest bylines matter; suggest a real staff reviewer (the owner's own buying-house fabric knowledge is genuine expertise). |
| 31.3 (12:26) | Owner will enter his section experts' names as reviewers in the backend. Reviewer field per author/section stays editable, empty in the seed. |

### Done — naming and links (PR 590, Bhandari), 19 Oct ~12:40
- #/admin/naming (products, templates with tokens incl. {brand}, bulk rename with preview, redirects incl. WordPress examples, settings) + "Name, link & Google" in the product form (brand, slug with preview, SEO/feed titles, Google + feed preview).
- Changed links never break (old link → product, no chains; Back one step). Brand line on cards/PDP; JSON-LD and feed use the real brand; other-brand warning off by default.
- New demo brands: Lacoste, Tommy Hilfiger, Calvin Klein, Levi's (new products), Hugo Boss, Zara (labels). All tests pass (ops, flow, combo verify, new nm-flow 50+ checks).
- Explicit hooks (02-core productCard/parseHash, 30-product header/JSON-LD) to apply at integration.

### Done — blog content plan (Doot), 19 Oct ~12:50
- review/BLOG-CONTENT-PLAN.md: 8 pillars (care 34, fit 22, fabrics 22, style 27, occasions 23, seasons 17, product/brand guides 24, behind EXTAS 10) = 179 topics (125 with Bengali twins); 90-day calendar from 2 Nov 2026 (3/day for 2 weeks, then 5/day while quality holds); Eid ul-Fitr 2027 ≈ 10 March → Eid posts 21 Dec–10 Jan.
- No BD fashion site runs a how-to blog → open space. Google spam update 24 Sep–8 Oct 2026 noted. PR 529 (source-link writer) flagged against "stitching together" rule.
- Filed as scope on PR 591 (B1–B15) and PR 244. Claude decided: review chain = peer author → Gyani business facts → Doot SEO; byline "EXTAS Journal" + author agent + owner's expert reviewer; topic list monthly batch.
- Owner to decide: a care-lab person (~half a day a week to wash/measure/photograph, for "we tested it" posts); start date (plan assumes 2 Nov 2026).

### Done — blog backend (PR 591–593, Gyani + Doot), 19 Oct ~13:00
- #/admin/blog tabs: posts, topic list (duplicate check, owner approve/add), pipeline (writer → another author proofs → Doot final; writer can never approve own post; 7 checks before publish; edits send it back to proof), schedule (min 3 / target 5 / max 6, editable slots, auto-fill, tomorrow-below-minimum warning), results (refresh/merge/prune — prune never deletes), author team (Doot + Suta, Jotno, Rong, Ritu, Bazar A360-08…12, model per job, idle author ৳0, initials avatars, honest byline + optional reviewer), categories & tags, house ad slots (editor, slot map, per-ad report, popup rules incl. not on phone arrival from Google), sitemap.
- Tests: ops-test (default + 16 blog/agent routes), ops-flow, new zb-flow 36/36 per size, 0 JS errors.
- Claude added a hook so Shilpi's front-end demo posts (BLOG_EXTRA_SEEDS) are seeded through the same store. 89b patches (Doot note, author team in org chart) to apply at integration.

### QA re-check R15c (independent), 19 Oct ~13:10
- 334 pass · 1 fail · 10 blocked on owner data · 2 owner decisions · 58 backend/real device. Wide touch tablets: journeys 96/96 (edge swipe + PTR work). Device gate 0/480. New bag B5 and P3/P4 pages clean.
- The one fail (AX02): checkout "Need help? WhatsApp us" green text 2.79:1 → Claude fixed (#0F6E37, 5.6:1). Verified again in the final run.
- Prohori's two tool claims checked independently: A09 was a real fail on R15b (now fixed); AX02 tool fixed to read gradients — that's how the checkout fail was found.

## Note 32 — 19 Oct, 12:53
| # | What |
|---|---|
| 32.1 | Blog section and blog post must be reviewed in ONE go — UI/UX, backend and front end together, tested on several devices, one report (no piecemeal re-reviews). Use the active agents now. |
| → | Independent blog QA + UX reviewer started: builds the harness now, runs the full matrix (8 phones, 5 tablets × 2 orientations, 2 desktops) the moment Shilpi finishes; front, ads, popup, backend flows, UX critique; one report qa/BLOG-QA-REPORT.md + Bengali sheets. Fixes then go back to the builders in the same round. |

### Done — owner answers built (Sawdagor; Notes 23–25), 19 Oct ~13:20
- Two consent ticks (SMS on, WhatsApp off) at checkout + landing form + account switches; stored separately on order and customer; CRM shows both with where/when.
- Trial at the door (setting, on): product page, checkout, delivery/exchange help pages, EN/BN.
- Same size twice: 'block' default, 'qty' option in Settings.
- Slider snap after hand drag in the shared engine (all rows); also fixed: a tap froze a row for good on phones.
- CRM: full numbers, profile opens and copies logged ("Who looked at this customer"); address rule unchanged.
- Combo lifecycle: optional dates, auto-end, ended/off pages live with alternatives, Archive tab, turn on again.
- New settings files 08-shop-opts.js, 89s-shop-settings.js. All suites pass; gate 0/480 on his build (later journal failures were Shilpi's in-progress files).
- Claude decided: a combo that ends while in a bag keeps its price, with a note. Integration round sent to Sawdagor (admin cut-offs, Bhandari/Gyani explicit hooks).

### Done — blog front end (Shilpi, PR 592/593), 19 Oct ~13:35
- 73-blog.js + r12-zblogfe.css: blog home, post, category/sub-category, tag, author, archive, search, RSS placeholder, all also under /bn. Posts only from Gyani's store; 13 demo posts (11 EN, 2 BN twins) via BLOG_EXTRA_SEEDS.
- Reading: 18 px phone / 19 px desktop, 66–77 chars per line, Bengali line height 1.85; desktop 720 px column + sticky contents and sidebar ad. Byline: initial avatar + "AI author", honest note; "Reviewed by" only when filled.
- Ads labelled "EXTAS offer", inline only after paragraphs; product block size sheet; combos go to combo pages; popup = bottom sheet on phones / 420 px card on desktop, never on first screen for phone visitors from Google; slim "Shop polos" bar kept as slot post-bar. Floating WhatsApp off on blog pages.
- Tests: gate 0/480, blog sweep 0/168 (+ tablets, Bengali), flow 27/27, ops-flow (journal count 12 → 25).
- 94 patches (extra seed fields, post-bar slot, wider seed ads, View link) sent to Sawdagor. Blog QA front-end run started.
- To mention to the owner: 4 old short journal notes overlap new guides → suggest unpublish (draft) or redirect; product-story facts need his confirmation before going live.

### Done — integration round (Sawdagor), 19 Oct ~13:50
- Ended-combo note in bag/checkout (price kept), wording in settings, test ended-bag.js.
- Admin cut-offs fixed with the fit engine (CRM KPIs, courier row, message steps, order meta, combo rule names/link box, date fields).
- Explicit hooks applied: brand line in productCard/pdp_header, nm_ldPut, parseHash → parseHashRaw + nm_resolve (wrappers in 95 removed); 89b draws Doot note + author org (wrappers in 94 removed); Shilpi's 94 patches (seed fields, post-bar slot + ad, all-pillar seed ads, View links via p.slug).
- All suites pass; gate 0/480 including #/journal. Demo-only: Demo controls button over "Back to the shop" in admin sidebar at 1280.

### Blog QA + UX round (independent), 19 Oct ~14:30
- 6,948 checks on 20 devices (front + ads + popup + back end): 6,275 pass, 455 fail = 15 distinct issues; 0 JS errors, 0 sideways scroll, one h1, skip link, taps ≥44 on the blog.
- Fails: stretched avatars, /bn lang attr, active chip off-screen, byline cut at 430, Bengali twin related posts, Bengali search, popup delay semantics, ad start time vs back end, hidden category labels, Bengali bio, toast overwritten, low-contrast check notes, admin taps 36–40 px, (demo) controls overlap.
- UX: too many ads (4 phone / 5 desktop per post), ads not matching the post, blog hard to reach (no Journal in nav, no care link on PDP), catalogue look (same drawing, no excerpt, Demo pills, stub posts in grid), phone first screen all chrome, sticky bars cover 15–19 %, Bengali pages show English ads, back end mixes languages / shows codes and PR numbers / ~11 taps to publish.
- **Claude decided:** keep 3 columns ≥1024; per post max 3 ads (phone: 1 inline + end + bar or popup), no ad above the first paragraph, no duplicate ad on a page, relevance first and empty slots collapse; Journal in header nav + phone menu; care-guide link on product pages; varied card images + excerpts, one "Demo content" note; old short notes in a compact list after the guides (nothing unpublished); compact blog header; tab bar hides while reading; Bengali ad text fields; back end all Bengali, names not codes, no PR numbers, agent steps as status, publish ≤4 taps.
- Fix round: Shilpi (front) + Gyani (back) in parallel, then blog QA re-run.

## Note 33 — 19 Oct, 14:59 — PR register in the backend
| # | What |
|---|---|
| 33.1 | A backend section with all stages and their PRs, full details of each PR, like the tables Claude shows him. New updates appear on their PR. So he can understand the mechanism and, in the code phase, say "this PR has this problem". Click → full details; organised the best way. → PR 594, Prohori builds it, generated from MASTER-REGISTER.md on every build. |
| 33.2 (15:00) | GitHub would be a hassle for him: the same section also keeps the latest full blueprint .md and any supporting files (backup, readable, downloadable). → added to PR 594. |
| 33.3 (15:05) | New sections must also appear automatically with dates; a new PR must show which earlier PR it aligns with, with a notification; an update to an existing PR (instead of a new PR) is recorded automatically. → added to PR 594. |

### Done — blog back-end fixes (Gyani), 19 Oct ~15:20
- F7 popup help text, F8 ad dates in whole Dhaka days (cfg.tz), F10 Bengali bio, F11 one message, F12 contrast, F13 taps ≥44 (also ≤1100 px).
- Ads: titleBn/subBn/ctaBn; settings maxPerPostPhone/Desktop 3, postTopAfterSection 1, noDuplicate; relevance inside zb_adsFor (editor lists where each ad shows and why); seed ads relevant.
- Owner view: all Bengali, names not codes, no PR numbers, agent steps as status + progress, demo strip for agent buttons (switch), publish 2 taps from posts list (with confirm), topics 2 taps.
- zb-flow 47/47, ops tests pass. Blog QA harness updated for the rule changes; full re-check after Shilpi.

### Done — PR register in the backend (PR 594, Prohori), 19 Oct ~15:45
- Generator tools/make-register.py (runs on every build): REGISTER data 498 KB + 14 documents 842 KB; state file keeps first-seen dates and text hashes; second run reports no changes; privacy filter.
- #/admin/register: totals + bell, search (number/English/Bengali), filters, stages → PR table, PR card (full text, added scope, decisions, linked PRs, history, demo link, spec section, report a problem → task to the owning agent via Gyani + Telegram preview), What's new (news, Gyani review, last 7 days), reported problems, Blueprint & files (read with contents/search, download, versions). Direct links #/admin/register/pr/<n>, /doc/<id>.
- Automatic: new stage/PR detection with date, alignment to earlier PRs, "updated" entries for grown PR text, overlap warnings for Gyani. Tested on a copy (S28 / PR 595 / PR 104 grown) — real register untouched. reg-test 159/159, 11 sizes clean, ops tests pass.
- Found and handled: desktop admin sidebar had lost the System/Operations groups (96 restores them; 03 owner to clean up). **Claude re-staged PRs 586–594 into their real stages** (S01 590; S11 586, 588; S12 591–593; S13 589; S19 587; S21 594) and fixed the stage table counts (S01 22, S03 22, S11 22, S12 22, S13 35, S15 48, S19 15, S21 14; total 594 = 588 active + 6 parked). Generator: "table vs filed: all match". Overlap pairs 573↔572, 574↔573 are deliberate (category vs product vs bag templates).

## Note 34 — 19 Oct, 15:57 — finish desktop ourselves
| # | What |
|---|---|
| 34.1 | His desktop review will be late. Before it, put several agents on the desktop version from every angle — every category, menu, everything — find points and bugs and fix them on our own. |
| 34.2 | **Phone (already fixed) must not change.** If needed keep phone as is and give desktop its own treatment, with suggestions. Bring desktop to a full finish; use free agents, 2–3 more if needed. |
| → | Step 1 (now): desktop UX/visual audit (Sawdagor + Shilpi hats) and desktop functional QA at 1024–1920, in parallel. Step 2: two fixers in parallel (Batch A header/nav/menus/home/category/search/footer/help; Batch B product/combos/bag/checkout/thanks/account), all desktop-only CSS/JS (min-width 1024 / hover:hover pointer:fine), with a phone pixel-diff guard. Step 3: re-test + Bengali before/after sheets. |

### Desktop audit done (UX/visual, Sawdagor + Shilpi hats), 19 Oct ~16:40
- review/DESKTOP-REVIEW.md: 282 page loads at 6 widths, 400-link crawl, mouse/keyboard runs. 0 JS errors, 0 sideways scroll, 0 dead links. 53 findings: S2 12, S3 26, S4 15.
- Top: hard-coded desktop nav missing Combos and 4 categories, no mega menu; no Add to Bag after the buy box; "Added to bag" modal instead of the locked right drawer; Order Now below the fold on panjabi at 1024–1366; hero off-grid; empty strips on combo hub and "You may also like"; checkout summary not sticky; tiny hero labels; no site-wide focus style.
- Bugs that also touch phone (search "polo shirt"/"গেঞ্জি", nested heart button, two different ratings, "This item ships free" with several items, "0 OFFERS") → **Claude: fix them** (text/behaviour only, never phone layout).
- **Claude's design picks:** data-driven mega menu with Combos + Journal; container 1440 max at ≥1536; 4-column desktop footer; header loop animations max 3 cycles on desktop; desktop sticky buy bar; right-side "Added to bag" drawer; Order Now above the fold at 1024–1366; fill rows (no empty right strip); combo bag on desktop stays B5.
- Two fixers started in parallel (Batch A / Batch B, disjoint files), each with a phone pixel-diff guard (0 px).

### Done — blog front-end fixes (Shilpi), 19 Oct ~17:00
- F1–F10 + U1–U7 + labels ≥13 px + contents highlight fixed. Ads: max 3 per post, none before paragraph 1, relevance first, no duplicate; Journal in nav + care-guide link on product pages; phone first guide 629 → 294 px; bottom bar hides while reading; Bengali ads.
- Her checks 82/82, flow 28/28, sweep 0/336, gate 0/480. Harness re-run: remaining fails are harness issues (৳ counted as Bengali, search button, chip scroll reset, old ad rule) — sent to blog QA for R2.
- Her choices: popup not counted in the desktop 3-ad cap; on phone the popup replaces the slim bar for the visit; short notes get noindex for the live build. Found herself: popup reopened instantly on return (fixed); nav wrap at 1024 after adding Journal (fixed).
- Claude gave the Piqué Polo and jeans seed ads real Bengali titles. Blog QA R2 started.

### Final regression R15d (independent), 19 Oct ~17:30
- **Checklist meets the owner's standard:** 337 / 337 testable non-backend points pass; 10 wait for owner data; 58 backend/real device; 0 open decisions (L27 snap and P11 setting both pass).
- Gate 0/480; route sweep 126 × 20 = 2,520 checks clean; journeys 326/326 (phones 128, tablets 160, desktop 38); back/forward/swipe after the parseHash split pass; slider snap 0–0.2 px, no jitter; consent stored correctly from checkout, landing and account.
- One S2 found: old product links forwarded only after the admin naming page had been opened → Claude fixed (redirect list set up for customers in nm_findR); verified fresh visitor: #/p/rl-pique-polo-slim → #/p/rl-pique-polo, WordPress link → #/p/rl-solid-polo.

### Blog R2 (independent re-check), 19 Oct ~18:00
- 7,058 checks on 20 devices: **front end, journeys, ads and popup 0 fails**; 10 back-end/UX fails = 4 small issues; 54 "decision" = 3 columns ≥1024 (kept).
- UX verdict: too many ads, ads not matching, blog hard to reach, phone first screen, English ads on Bengali pages, small labels — resolved; catalogue look mostly (real photos wait for PR 547); sticky stack partly (now 6–10 % of the screen, accepted); human reviewer waits for the owner's names; "Shop the look" combos on style posts not yet.
- Claude fixed the remaining 3: agent codes hidden on owner screens (tooltip only), hidden-category toast matches the shop ("Journal"), contents badges 13 px. (A quote in the toast briefly broke 94 — caught by syntax check, fixed.) zb-flow and ops-flow ALL PASSED.

### Desktop functional QA, 19 Oct ~18:20
- qa/DESKTOP-QA-REPORT.md: 104 routes × 6 widths + Bengali at 1024 (728 loads): 0 JS errors, 0 sideways scroll, CLS 0 on load, 371 links resolve; journeys J1–J10 at 6 widths 126/126; desktop feature tests → 14 issues (3 high: no mega menu, sub-categories unreachable, keyboard focus lost after colour/size pick; 5 medium: zoom drag/next/hint, zoom by keyboard, cut offer title, 2 offers at 1024, card hover; 6 low).
- **Claude decided:** mega menu Enter = go to category, Space/↓ = open panel; WhatsApp tooltip exactly "Need any help"; 3 offers at ≥1024 with a mouse, touch tablets keep 2; zoom gets drag/wheel/next-prev on desktop only; focus restore also on phone (no visual change). Forwarded to Batch A/B.

## Note 35 — 19 Oct, 18:38 — owner's desktop review (home + category)
| # | What |
|---|---|
| 35.1 | Home hero: the "Winter" text block moves further left, aligned with the "Shop by category" line; the slider gets more room and moves left. |
| 35.2 | Slider pictures look like they slide *under* a wall (the fixed panel). Make them dissolve/blend into the panel colour at that edge instead. |
| 35.3 | Customer reviews: one row only, 3 visible, sliding left continuously — not 10 at once. "From the Journal" OK. |
| 35.4 | Backend: customise the home sections — put a new offer anywhere (e.g. a new section above reviews). → PR 595 |
| 35.5 | Side gutters (left/right empty areas from under the header banner to the footer) on home and category pages: free zones by size (e.g. 100 × 500), fixed ads, popups, banners blending with the background (e.g. a 3D-like model in polo, denim, boots stepping out). Fully customisable in the backend, no fixed rules; show him separately for approval; if not approved, today's look stays. Don't break anything. → PR 596 |
| 35.6 | Footer: WhatsApp/Hotline overlap. Layout: **left** = social icons on top, payment icons below; **right** = WhatsApp button on top, Hotline button below. |
| 35.7 | Category filters from data: sizes up to the largest present (3XL/4XL/5XL supported), colours present with counts, fits present only. → PR 46 scope |
| 35.8 | Every category page customisable too (add boxes/sections). → PR 595 |
| 35.9 | Product page: carry on with our own fixes. |

## Note 36 — 19 Oct, 18:50 — owner's trust test
| # | What |
|---|---|
| 36.1 | Asked for proof that no voice note was skipped across ~13 hours of mixed topics; test: "what was my search box complaint, and did you solve it?" |
| → | Answer: Note 4.1 (03:31) — "delivery", "return policy", "exchange policy" showed nothing; solved by the help-search index (07-help-search.js), later typo search (R15 wave 1), Bengali/ "polo shirt"/"গেঞ্জি" (desktop D-015), blog Bengali search (F6). Live-checked at 18:52: all return answers. **Gap found while checking:** the help answer still said "1–2 days / 2–4 days" instead of the hours rule (Note 4.2) → sent to Batch A to read hours from settings everywhere. |

### Done — page layout builder + side canvas (PR 595–596, Shilpi + Sawdagor), 19 Oct ~19:10
- Pixel gate 56/56 identical with canvas off and default layout (phones, tablet, 1280/1440/1920, home + 7 category pages); behaviour 43/43; ops tests pass.
- #/admin/layout "পেজ সাজান": home / all categories / one category; drag or ↑/↓, on/off, edit, copy, hide/restore, add section (10 types) with "where it goes", live phone+desktop preview, one-click example "নতুন অফার" above reviews.
- #/admin/side-canvas "দুই পাশের জায়গা": live map at 1280–1920 with rulers, draw/drag/resize or type numbers, blend preview, master switch off ("অনুমোদন লাগবে"); 3 seed zones (left figure — polo, denim, boots on a faceless dress-form from our drawings; right offer; right popup).
- #/preview/side-canvas for the owner's approval; sheets sent to him.
- Fact for the owner: gutter is 132 px at 1440, 240 px at 1920, but only 52–95 px at 1280–1366 and ~80 px around 1536–1660 → zones show only where they fit.

### Done — Desktop Batch B (Sawdagor + Shilpi), 19 Oct ~19:30
- All 27 Batch B findings + QA Q-003…Q-013. Desktop sticky buy bar (64 px); right-side "Added to bag" drawer (420 px) on product, auto combos and sets; Order Now above the fold on every template (worst 707 px at 1024×768, 31 products × 6 widths); rows fill (combo hub rails share rows, product rows exactly 4, "Recently viewed" waits for 4); checkout summary aligned and sticky with "+N more items"; B5 kept with desktop sizing.
- Shared bug fixes (phone text only): one rating source; free-delivery wording follows the bag (settings bag.freeOrder/freeShort); offer count = offers shown.
- QA items: focus restored everywhere; desktop zoom drag/wheel/‹ › + keyboard; offer title shrink then two lines; 3 offers for mouse desktops at 1024–1279; hit-area overlaps fixed invisibly.
- **Kept owner rule 35** (never "add ৳X more" on the add sheet) instead of the audit's progress line — drawer says "Free delivery on this order" or "COD · 72-hour exchange".
- Gates: phone diff 0 except the listed text fixes; gate 0/480; all suites pass on combined A+B. Four phone diffs traced to Batch A files → sent to Batch A. Open on purpose: D-042 inline size chips, D-045 form cap (waits D-010), D-040 CTA style = owner's call.

## Note 37 — 19 Oct, 19:53 — side canvas: yes, plus more
| # | What |
|---|---|
| 37.1 | Will turn the side canvas on; keep a backend on/off — unticked = today's look. |
| 37.2 | A "launch default" he can return to any time — everything back to default, test ads gone. → PR 597 (also named snapshots). |
| 37.3 | **Backend menus/labels in simple English by default, Bengali optional.** → PR 503 scope. |
| 37.4 | Zones fully customisable; fixed while scrolling with a gentle float of a few cm up/down. |
| 37.5 | Full-blend mode: product blends into the page background — no border, no visible picture edge. |
| 37.6 | Animations: a model in shirt/pants changing poses; poses/animations created from our AI section. |
| 37.7 | Don't hide on smaller screens — scale to the space: a standard size, auto up/down. |
| 37.8 | Choose which categories show it (all / some), desktop only. |
| 37.9 | AI templates: 15–20 animation/short-video styles; he picks a template + products (e.g. every colour of the Solid Polo) and it plays them one after another in the side bar. "Make it more intelligent and advanced on your own." → PR 596 scope. |

## Note 38 — 19 Oct, 19:59
| # | What |
|---|---|
| 38.1 | Will the side canvas slow the site or lag? Explain why the site stays smooth, and build it that way. → speed guard (load after content, desktop only, pause off-screen, weight budget, measured). |
| 38.2 | AI videos/poses made once are kept in the backend and reused — no paying tokens twice. → AI asset library. |
| 38.3 | Common template: a model walks forward out of the site in 3D, wearing our polo, denim, shoes; beautiful from every angle; give the AI the skill to make it without bugs. → walk-out template + skill file agents/skills/gyani/studio/WALKOUT-TEMPLATE.md. |

### Done — Desktop Batch A (Shilpi + Sawdagor), 19 Oct ~20:40
- 25/26 findings fixed (D-025 info → journal), QA Q-001/002/006/009/014, owner's 18:38 notes. Mega menu from data (New in, categories, More with hidden categories, Combos, Sets, Journal; folds into More when narrow; sub-category links #/c/<cat>?sub=…; hover 150 ms, Enter = go, Space/↓ = open, Esc returns focus); 1440 content at ≥1536; footer: social + payment left, WhatsApp over Hotline right, equal width; header animations 3 rounds; hero text aligned left, 140 px fade into the panel (80 / 140 + wash kept as options); reviews one row of 3 sliding; filters from data; WhatsApp tip "Need any help".
- Phone: 0 px on every route except 5 deliberate text/result fixes (delivery hours, D-015 search). The 1 px card marks and pdp-hoodie-sale diff were caused by the first heart fix — gone. Gate 0/480; verify, ops tests pass; desktop interaction 198/198 at 6 widths; nested buttons in links 1,428 → 0.
- Builder hooks stable (HOME_SECTIONS, CAT_SECTIONS, CAT_SLOTS.afterGrid, lbGutters with --lb-gutter). Admin demo gear no longer covers anything.
- Claude switched the last "days" texts to hours from settings: delivery rule full text, landing FAQ, product FAQ (account track already uses hours).

## Note 39 — 19 Oct, 21:09 — desktop sliders resume at once
| # | What |
|---|---|
| 39.1 | Desktop: hovering a slider stops it (good), but after the cursor leaves it does not restart until a wait or a scroll. Must restart immediately; fix for every slider. |
| → | Not caught before: the shared slider engine (02-core.js) deliberately gave a 4-second hold after the mouse left. Claude changed it: mouse leave → moves again at once (touch keeps its 4-second hold; a settling mouse drag finishes its snap first). Verified at 1366 on all 4 home rows (hero, flash ×2, reviews): still on hover, moving within 0.7 s after leaving. One engine → every slider on every page. |

### Done — backend in English by default (PR 503 scope, Prohori + Doot), 19 Oct ~21:30
- New layer only (98a-admin-lang.js + 98b-admin-dict.js, 2,016 hand-written plain-English entries; tools/extract-admin-bn.py to keep it current). Switch "English | বাংলা" in the sidebar (desktop) / top bar (phone).
- Coverage: 84 admin routes and tabs × 1280/393, 442 states — **0 Bengali visible in English mode**; Bengali mode identical to before; 0 JS errors; layout checked in both languages, no sideways scroll.
- Tests pass in both modes; Claude made the register test's totals read the live register (it had fixed old numbers) → ALL PASSED.

## Note 40 — 19 Oct, 21:23 — the whole site dynamic
| # | What |
|---|---|
| 40.1 | Are header, footer, menus, categories dynamic? He wants everything like WordPress + Elementor: add, remove, rename, move, hide/show, edit, cancel — "super dynamic, no part fixed". Tell him which parts aren't. |
| 40.2 | Handover in future — keep that in mind. Share any concerns and make it more standard/smart. |
| → | Status checked in code: dynamic now — home & category sections (595), side canvas (596), blog (categories/tags/authors/ads), combos, products, settings texts, hero buttons, delivery/consent/trial texts, announcement bar text. **Not yet editable in the backend:** menus (built from data, no editor), header items, footer, category manager, product-page block order, content pages, mobile bottom bar, theme tokens. → PR 598 site builder with guardrails (grid-snapped blocks, contrast/tap checks, checkout structure locked; drafts, preview, undo). |

## Note 41 — 19 Oct, 21:33
| # | What |
|---|---|
| 41.1 | Likes "dynamic with guardrails" and grid-not-pixel; keep everything that doesn't harm style/UX editable; go ahead. "Second time I'm trusting you — honour it." |
| 41.2 | 🐞 A brand-new visitor opening Log in sees "Returning customer demo · password · Fill it in". Why? |
| → | It was a demo helper for reviewers, wrongly shown to everyone. Claude fixed: shown only on #/login?demo=1 (demo panel / intro links); a normal visitor never sees it; the real build has no demo account (own-data and demo data never ship, PR 509). Verified: #/login → hidden, #/login?demo=1 → shown. |

### Done — side canvas v2 + launch default (PR 596 v2, 597), 19 Oct ~22:00
- Canvas off = pixel-identical (56/56). Behaviour 66/66: scaling at 5 widths (1280 0.31×, 1366 0.68×, 1440 1×, 1536 0.28×, 1920 1.6× cap) never hiding (picture-only below 72 px), float ±40 px, full blend edge diff ≤3, targeting, 19 templates incl. walk-out, product-picker sequences (every colour in order), template suggestions, weight limits enforced, AI library reuse, launch default round trip + undo, admin EN/BN.
- Speed at 1440 (median of 9): LCP +28 ms, CLS 0, longest canvas task 19 ms, slow scroll frames 2.3% (off 1.7%).
- Snapshots panel on builder, side-canvas and Settings. AI media library also under AI & agents.
- Owner to decide: zones are small picture-only on 1280–1366 laptops and ~1536 px (bigger needs a different standard size); 1.6× max at 1920.
- Found: category sale-badge timing race on phone under load; demo button over admin logo on phones → sent to the site-builder agent (owns 21/03 now).

## Note 42 — 19 Oct, 22:14
| # | What |
|---|---|
| 42.1 | Angry: he keeps finding small issues; asks for a token/credit breakdown and why. → answered honestly (agent token counts seen; billing not visible here; why misses happen and what changes). |
| 42.2 | Header logo can be an uploaded image (JPG/PNG); **slogan under the logo in the header**, editable. → PR 598 |
| 42.3 | 🐞 Clicking the EXTAS logo while on home (middle/footer) does nothing — must go to the top. → Claude fixed globally (99-boot.js: any link to the current page scrolls to the top); tested 1366 and 393: 6221 → 0, 6021 → 0, and from a category goes home. |
| 42.4 | Footer columns/links drag-and-drop; social and payment icons changeable/addable. → PR 598 |
| 42.5 | Guides so no coder is ever needed; a user manual so a new owner can run and arrange everything, even add functions. → PR 599 |
| 42.6 | Side canvas vertical rule: of the visible height below the header (e.g. 800 px) the zone takes ~600, centred — spanning half the top row, the gap, half the bottom row; auto-adjust; show 3–4 screen sizes marked. Screenshot mentioned but not received. → PR 596 scope, sent to the side-canvas agent. |
| 42.7 (22:16) | Marked screenshot received (saved as review/owner-side-zone-2026-10-19.png): zone ≈157 × 644 px at 1797 × 879 — top at the first card row (~14% below header), height ≈80%, bottom gap ≈6%, close to the content (≈16 px). Replaces the 75%-centred reading; sent to the side-canvas agent. |
| 42.8 (22:17) | Placement settable from the backend against ≥10 desktop/laptop sizes, fix per size, rest auto-adjust. → PR 596 scope, sent to the side-canvas agent. |

## Note 43 — 19 Oct, 22:27 — bag page review + side zones everywhere + on-page editing idea
| # | What |
|---|---|
| 43.1 | His marked placement is the default; height and width settable per screen size; fix any size he dislikes. |
| 43.2 | Side zones on every page with empty gutters: home, category, **login, bag** (each switchable). → side-canvas agent (checkout excluded by Claude: payment focus). |
| 43.3 | Bag: "Your bag — 4 items" (longer dash, "4 items" 1–2 sizes smaller, readable colour). |
| 43.4 | "Continue shopping" one size bigger + shimmer like Checkout, text stays readable. |
| 43.5 | Shimmer on "FREE" delivery in the summary; a backend Shimmer section to control all shimmers. |
| 43.6 | "You save ৳X" in its own highlight colour (Claude: the site's sale red, bold). |
| 43.7 | Duplicate-size message box cut at the bottom → fit it; accent border on the right too (left + right only). |
| 43.8 | Cart line "Navy · M" barely visible → bold, readable; desktop titles one size bigger. |
| 43.9 | "Polo Duo", "Goes well with your bag" → plain everyday English. |
| 43.10 | Under "Pick from the same category…": tiered offer box "Take 2 ৳1,500 save ৳200 │ Take 3 … │ Take 4 …" with coloured bars; fully customisable in the backend. |
| 43.11 | **Idea to discuss first:** when logged in as super admin, edit any page right on the page (like Elementor): click a section → edit (e.g. change a tier to another product/price) → publish. When editing on desktop, ask "apply to phone too?"; if yes, show phone previews at several sizes; only after they pass and he approves does it go to phone. → plan sent to him for discussion; not built yet. |
| → | 43.3–43.10 sent to Batch B (bag); register scope PR 598 for shimmer control and tiered offers. |
| 43.12 (22:33) | Plan approved 100%; phone access as proposed (light). Phone-apply step: not 5–6 but the **10 screen sizes most used in Bangladesh**, he can open any to check. **AI mode**: an agent tests the change everywhere and reports "safe" or "Boss, don't publish — …" with a research-style report; if AI mode is off it says so. → PR 600 (queued until a builder slot frees). |

## Note 44 — 19 Oct, 22:38
| # | What |
|---|---|
| 44.1 | Pause 5 (site builder) and 6 (side canvas extensions) — finish in the code phase; do 1–4 (bag fixes, timing audit + fixes, final full test + V12, final V2 .md + report). |
| 44.2 | Server-setup blueprint file (Azure/VPS) to cross-check: he offered at 11:57; **not received yet** — asked him to attach it. |
| 44.3 | Side canvas paused cleanly: default from his marking (157×644 at 1797×879), 10-size editor, 16 page types, per-page switches; untested parts listed for the code phase in PR 596. |

## Note 45 — 19 Oct, 22:44 — new VPS
| # | What |
|---|---|
| 45.1 | **Not the old Azure VM — a brand-new VPS**, created with Ubuntu; he will share the configuration screenshot, then give IP + SSH key. |
| 45.2 | He can't open ports 22/80/443 — we do it. |
| 45.3 | Keys and accounts (AI, APIs, every system) are entered later in the backend — as agreed many times. Why would Google Drive backup and the Telegram bot be needed on day 1? GitHub access on day 1 is fine. |
| → | Register S0A PR 1–3 updated (new VPS, no in-place upgrade, we open ports). Checklist updated: day 1 = IP + SSH key + GitHub only; everything else entered later in the backend vault; Drive backup and Telegram alerts must be on **before go-live**. V2 writer informed. |

### Site builder paused cleanly (PR 598/599), 19 Oct ~23:00
- Built and working in the demo (default data = shop identical, 43 pages markup-identical, 0 px): menus (one tree → desktop row, mega menu, phone menu, bottom bar), header (announcements, icons, logo text/image + phone logo), slogan, footer drag-and-drop with social (9) and payment (10) icon sets + uploads, categories (create/rename/reorder/not listed — page stays live), product-page blocks (16, per-device; buy group can't be hidden), content pages, theme with AA contrast block, draft → preview → publish → undo, versions, status page "কী কী বদলানো যায়", Site Manual (#/admin/manual, 25 sections), launch default covers the site builder.
- **Claude switched the header slogan ON** (owner asked at 22:14); fits 320–1366 with no overflow ("Made in Bangladesh" short form at 320).
- For the code phase: full gate re-run, Bengali dictionary merge, USER-MANUAL.md export, measured tap check at publish, phone-menu footer wiring.

## Note 46 — 19 Oct, 22:54 — how later changes get in
| # | What |
|---|---|
| 46.1 | While coding (or after go-live, or 6 months later) a new plan comes: how does he give it, and how does it reach the PRs and the final blueprint? He wants it as a document kept in the backend. |
| → | review/CHANGE-PROCESS.md written (Bengali); PR 594 scope updated; V2 writer asked to include the process. |

### Done — final V2 build specification, 19 Oct ~23:30
- EXTAS-ECOMMERCE-V2.md (6,735 lines): V1 kept in full with V2 blocks and in-place "Replaced/Obsolete" tags; Bengali summary; change log by area with PR + note; 31 resolved conflicts; new sections (settings framework, delivery hours, trial at door, PR register, seven agents, blog engine, Google plan, naming, combos, desktop, builders, admin language, performance budgets, change process); Part E rewritten for 600 PRs / 28 stages / waves; Appendix A all 600 PRs, B owner data + 12 open decisions, C QA gate.
- Verification script: 600/600 PRs, 46/46 notes, stage table = register, 0 V1 lines lost, no personal data → PASS.
- Claude fixed stale register lines it found (PR 574 default B5, "reached 600", PR 577 agent count) and the checklist's day-1 wording. Known for code phase: 165 range-only PRs (S16–S26) have derived titles from V1 lists; PR 5 tuning waits for the new VPS specs.

## Note 47 — 19 Oct 23:15 · Owner's server spec file + new VM config
- Owner sent `review/SERVER-SETUP-SPEC-OWNER.md` (server setup & performance, 13 sections) and the VM choice: **Azure E8ds_v6** (8 vCPU, 64 GB, 440 GB local NVMe, $575.97/mo), **Premium SSD LRS 2048**, **Southeast Asia**, Ubuntu (asked which image). Networking screenshot showed only SSH (22) selected.
- File instruction: analyse only; report PR mapping, new PRs, conflicts, order; file into register/V2 **only after green light**.
- Analysis sent (not filed yet): proposed 4 new PRs (601 NVMe temp disk boot, 602 four-layer cache + invalidation, 603 DB index & slow-query pack, 604 hardware-aware auto profile + run without CDN/Blob) → 604 total; ~20 existing PRs updated; conflicts: backup to Azure Blob vs locked Drive-only (A2.8) — needs owner decision; Meilisearch missing from RAM table; PM2 vs Docker (keep Docker); Nginx vs Caddy (keep Caddy); stock cache display-only, checkout live; v6 NVMe is raw and must be formatted every boot (Microsoft doc).
- Image advice: Ubuntu Server 24.04 LTS x64 Gen2 (not Pro). Networking: tick SSH+HTTP+HTTPS, accelerated networking on. Disk advice: OS 128 GB + separate data disk (owner to decide size; can grow, never shrink).

## Note 48 — 19 Oct 23:15–23:33 · Owner approves the server spec analysis — filed as CN-001 (V2 → V2.1)
| # | What |
|---|---|
| 48.1 | **Approved every point** of the Note 47 analysis (23:33). Standing instruction for this filing: **wherever two decisions conflict, take the best one.** All decisions final; nothing more to ask. |
| 48.2 | **Machine:** Azure **E8ds_v6** (8 vCPU, 64 GB, 440 GB temporary NVMe), **Southeast Asia**, **Ubuntu Server 24.04 LTS x64 Gen2** (plain, not Pro), Trusted launch, accelerated networking on, NSG 22/80/443, auto-shutdown off, Azure Backup off, boot diagnostics on. |
| 48.3 | **Disks:** OS **128 GB** Premium SSD + separate **1 TB (P30) data disk**, "delete with VM" off, LVM — chosen on Claude's advice instead of 2 TB (a disk can grow, never shrink). |
| 48.4 | **Access:** he creates the VM with "Generate new key pair" and keeps the .pem; on code day 1 we give him a public key to add via Reset SSH public key (separate username). No private key in chat. |
| 48.5 | **Backup (his answer):** Google Drive mandatory (add-only Drive = third copy) **and Azure Blob added** — WAL/point-in-time, daily full, soft delete + versioning/immutability, media in Blob; restore defaults to Blob, Drive fallback; monthly automatic restore test. Blob billed separately (≈US$5–15/month at launch). He creates the Storage account later with a guide. |
| 48.6 | **Order (his answer):** "finish ALL server work at once, nothing for later" — monitoring page, monthly speed measurement and report pre-computation are pre-launch too. |
| 48.7 | **Claude's decisions (delegated):** Docker Compose stays (not PM2); Caddy stays (not Nginx); Meilisearch stays for site search (pg_trgm only for fraud matching); stock display cache 15 s with live row-locked stock at bag and checkout; image ratio 4:5; port 22 key-only + fail2ban (not IP-restricted — agents connect from changing IPs); RAM split with Meilisearch 4 GB added (Redis and worker 6 GB). |
| → | Filed as **CN-001**: register 600 → **604** (601 NVMe boot unit and 604 hardware-aware profile in S0A, 603 database performance pack in S00, 602 four-layer cache in S02); dated scope on PR 1–10, 13, 18, 22, 24, 37, 72, 88, 234, 519 and in the scope block for 362, 395/507, 423. Blueprint **EXTAS-ECOMMERCE-V2.1.md** (V2 kept as history) with a Bengali "V2.1-এ কী বদলেছে" block and the new **A2.9**. Owner checklist §ক, CHANGE-PROCESS (CN-001 example) and the register generator updated. VM guide: `review/AZURE-VM-GUIDE.pdf` (written separately). |

### Done — CN-001 filed, 19 Oct ~23:45
- **Register:** 604 PRs · 28 stages · 598 active, 6 parked (header now says "active" = filed and specified, not coded). S0A 10 → 12 (601, 604), S00 18 → 19 (603), S02 57 → 58 (602); "How this reached 604" row added; dated scope "Updated 19 Oct 23:33 (owner server spec)" on PR 1–10, 13, 18, 22, 24, 37, 72, 88, 234, 519; scope block for 362, 395/507, 423. Old "PR-208" (V1 optimisation panel) mapped to PR 423 — register PR 208 (Smart Rules) left unchanged.
- **Blueprint:** `EXTAS-ECOMMERCE-V2.1.md` (V2 unchanged as history) — Bengali "V2.1-এ কী বদলেছে", A2.9 full server spec, A2.6 split (Meilisearch), A2.8 superseded by Blob + Drive, re-size note struck, E0–E3, D12, Appendix A rows 601–604, Appendix B (VM config resolved; Storage account added), conflicts 32–40.
- **Checks:** `verify_v21.py` PASS (604/604 PRs, Notes 1–48, E0 = register, 0 V1 or V2 lines lost, no personal data). Register generator lists V2.1 as latest + SERVER-SETUP-SPEC-OWNER.md (the PDF guide is not embedded — the reader is .md only). Build OK; register test 162/162 (expectations now read the latest blueprint from the data; blockquote links counted as inline text).
- Owner checklist §ক rewritten for the fixed VM + Storage account; CHANGE-PROCESS has the CN-001 example.

### Done — CN-001 server pages in the V12 demo, 20 Oct ~00:20
- **New admin pages** (System group + a page strip; sample numbers, labelled; nothing on the storefront): **#/admin/server** (PR 423/601/603/604 — E8ds_v6 machine card with "auto profile detected" + 4 vCPU/16 GB preview, per-service RAM/CPU against limits with near-limit colours, OS 128 GB / data 1 TB disks, NVMe card with mount/free/users/last boot format + "simulate missing", services up/down, cache hit %, 7-day CDN bars, slowest queries with >100 ms flagged, Telegram rules with on/off + editable limits in ST.srv) · **#/admin/cache** (PR 602 — durations as settings, purge rules, never-cached list, live-stock line, "Clear all cache" with confirm + toast) · **#/admin/images** (PR 22/24/88 — 5 sizes × AVIF/WebP/JPEG, quality 75–80 default 78, 4:5, 40/150 KB targets, Blob/server-disk switch, CDN on/off) · **#/admin/speed** (PR 234 — monthly Dhaka 4G table with pass/fail) · **#/admin/integrations** (Keys & connections; typed keys never stored).
- **#/admin/backup** re-rendered: Google Drive (required, + add-only Drive) and Azure Blob (daily + minute-by-minute, soft delete 30 days; "Not connected — add key in Integrations" until the key is added), restore picks Blob/Drive + minute, staging first, typed RESTORE; monthly restore test rows; retention settings. Earlier behaviour kept.
- Files: `src/89v-admin-server.js`, `src/r12-zsrv.css`; tiny edit in `89-admin-system.js` (health page VM name + link). English mode 0 Bengali; Bengali mode fully Bengali.
- Checks: 120 route/modal checks (1366/768/393/360 × en/bn) 0 fails; 19 flow checks pass; phone device gate 0/240 fails.

## Note 49 — 20 Oct 00:45 · VM created (owner screenshots: Review + create, Overview, Disks)
- Created: E8ds_v6, Ubuntu Server 24.04 LTS Gen2, Trusted launch, NVMe controller, OS 128 GB + data 1 TB Premium SSD LRS (5000 IOPS, delete-with-VM off), accelerated networking on, auto-shutdown off, backup off, boot diagnostics on, Spot no, ports 22/80/443, SSH key (RSA). Price shown 0.671 USD/hr.
- **Region is Malaysia West (zone 1), not Southeast Asia** → kept; filed as CN-002 (register PR 1, V2.1 note, demo Server page). Blob must be created in Malaysia West.
- Review page showed "NIC Network security group: –" → asked owner for the VM Networking screenshot to confirm 22/80/443 inbound rules exist.
- 00:48 owner sent NSG screenshot: Extas-Ecommerce-Site-nsg attached to the NIC — inbound 80/443/22 Allow (any), DenyAllInBound default. **Network verified, server ready for code day 1.**

### Done — V2.1 final, 20 Oct ~01:30
- **Blueprint `EXTAS-ECOMMERCE-V2.1.md` — final update before code** (owner: once the backend work is finished, V2.1 gets its final update; code starts from this file). Every item marked **V2.1 final · 20 Oct**; nothing deleted, superseded text struck through or tagged. **No new PRs: 604 PRs · 28 stages.**
- **Timing (QA):** "checklist L28, L29" → **L32/L33** in Appendix C4/C5 (struck through, not deleted). Rules proven in TA-2 added to D1.2 (R18a–i) and Appendix C4: separate pause flags for mouse/touch/keyboard; every pause has a tested resume; sliders resume within ~100 ms after leave, drag and sideways wheel; vertical wheel ignored; mouse drag on every row, click after a drag doesn't open the card; toast holds on hover/focus; timers cleared on route change; focus back to the opener; cancelled pull-to-refresh resets. TA-2: 530 checks · 521 pass · 0 fail · 9 info; phone gate 0/240; phone pixel diff 0 real changes.
- **Bag (owner 43.3–43.10, Batch B):** D3.11, D1.5 (Shimmer control: 14 shimmers + master, none under reduce-motion, Add to Bag shimmer off by default), D4 switches, D10.4 (PR 598 items confirmed), tier box "Take 2 │ Take 3 │ Take 4" (desktop only; phone preview only). **Owner decision added — Appendix B.4 #13:** suggested 4-piece prices (BAG_TIER_SEED: 4 polos ৳2,700, 4 tees ৳1,750) need his yes; real prices are always owner data.
- **Admin language (D11):** 0 Bengali in English mode across 206 admin routes; mixed-label dictionary fixed; Blueprint & files documents shown as written; combo-rule states English by default (Running/Off/Ended/Starts), Bengali in Bengali mode.
- **Phone price rule (D1.2 R19, D3.4):** currency sign and number never split (nowrap); fixed in category banners.
- **Server admin pages (new A2.9.18):** #/admin/server, cache, images, speed, integrations ("Keys & connections"), backup (Blob + Drive); sample data; mapped to PR 423/601/603/604, 602, 22/24/88, 234, 493/500, 8/395/507.
- **QA totals (Appendix C):** device gate 0 fails (phones, tablets, desktop); timing 0 fails; server admin 120 checks 0 fails + 19 flows; owner-answers test passes.
- Also: Bengali "V2.1 চূড়ান্ত (২০ অক্টোবর)" block at the top ("এই ফাইল থেকেই কোড শুরু হবে"); "V2.1 final change log" table; Note 49 row in the Round 15 table; Appendix A rows updated (demo pages, timing, bag); change-log row "2.1 final".
- **Register:** dated scope "V2.1 final · 20 Oct" on PR 42, 45, 61, 98, 107, 109, 503, 570, 598 + a 20 Oct scope block (server pages PR mapping); header "as of 20 October 2026"; total unchanged (604).
- **Checks:** `verify_v21.py` updated to Notes 1–49 and the V2.1 final markers (strict: the old "(L28, L29)" line must appear struck through; no unstruck "L28, L29" left) → PASS. Register generator via `tools/build.sh` → clean build; the backend docs tab carries the final V2.1.

## Note 50 — 20 Oct 01:24–01:30 · Code starts in the owner's project (repo Extas-Ecommerce-Site)
- Owner: this chat = planning/commands; actual code runs in his Claude project on repo `mehadih32/Extas-Ecommerce-Site`. 4-piece prices stay as demo default. Staging on new.extas.com.bd (owner agreed after explanation), WordPress stays on extas.com.bd until go-live.
- Tested: cloud session cannot reach VM port 22 → **CN-003**: self-hosted GitHub runner on the VM (owner installs once via Azure Run command).
- Done: Session 0 — repo holds docs/ (BLUEPRINT V2.1 final, register 604, owner docs, QA tools, agents, demo V12 + src), CLAUDE.md, docs/START-HERE.md, PROGRESS.md, BLOCKED.md, .claude/agents (stage-builder, qa-gate, infra-prohori), infra/bootstrap/install-runner.sh, docs/owner/RUNNER-SETUP.md.

## Note 51 — 20 Oct 03:54 · Owner desktop review of V12 (home, category, product, bag drawer, bag page, checkout)
Full list (H = home/header/footer, C = category, P = product, B = bag drawer, G = bag page, K = checkout). Rule: phone must not change except where noted; every new style is an extra backend option, current stays default.
- H1 hero: text stays where it starts; the coloured board behind/after the text moves 110–115 px right, same proportion; text under "Winter 2026" may be optimised.
- H2 hero: proper gap between "Shop all" and "Shop sets"; "Cash on delivery all over Bangladesh" and "72-hour exchange" sit neatly under the two buttons; 72-hour line a little longer.
- H3 Journal out of the desktop header; a highlighted Journal/Blog link in the footer.
- H4 header has too many menus → propose a smarter arrangement (options).
- H5 EXTAS wordmark 1–2 sizes bigger with shape → 8–10 text-logo options for the owner to pick.
- H6 mega menu covers the whole screen → compact dropdown under the item; sub-category hover opens its own flyout; study 2–3 international references.
- H7 combo section: 3 top + 3 bottom with "Build your own set" as a tall tile spanning both rows; all text editable in backend.
- H8 Find your size texts editable; size-finder categories come from data (more categories → more tiles).
- H9 backend switch to turn the row shadow/fade off and return to the earlier box style.
- H10 Build-your-own-set prices highlighted.
- H11 Shop the look: bolder item names, bigger item prices, "Together" bigger, struck price red, "You save" highlighted (phone too, allowed).
- H12 home Journal block: 4 fixed posts, no arrows/slider; a new post takes its place in order (newest first).
- H13 desktop footer is broken: alignment, social icons missing (restore), COD logo nicer; layout to follow the owner's reference image (coming).
- C1 category FAQ ("Polo for men in Bangladesh"): fill the empty side creatively. C2 easy English everywhere. C3 explain why Panjabi/Shirt/Trouser/Hoodie pages differ from Polo/T-shirt (unify if wrong). C4 bundle box on category looks odd → standardise. C5 more demo products in thin categories (2–3 rows), sets incl. tracksuit and hoodie sets.
- P1 desktop gallery 75–80 px shorter, whole image inside the first screen, no big empty top/bottom. P2 "How to care for this" as an article card with read time. P3 review cards equal height. P4 Q&A left panel's fixed "I am 5'8 70 kg" example confuses → smart, grows with the right column, adds value. P5 bottom: one slider ("Goes well with…" in better words) + one fixed grid of 4 that swaps every 30–40 s; recently-viewed never empty (fill with related). P6 sticky add-to-bag bar: fill the empty middle usefully. P7 CRITICAL zoom: full image must be reachable (pan to every edge / fit view). P8 thumbnails: matching background, clearly more images.
- B1 drawer "Goes well with it" better words, fill the space with more products. B2 free-delivery lines stronger. B3 drawer shows only the item just added → new Style B showing all bag items, newest on top (current = default; backend switch; compare in reports).
- G1 "Add one more and save" full-width colour band → compact. G2 the tier/plan area too big → compact, specific names. G3 "You may also like" + "Take 4 / Choose your plan" confusing → rework; new style only as an option after the owner sees the plan.
- K1 form column −70 px, summary card +60 px, gap +10 px (both layouts as backend options). K2 confirmation box needs a gap above the bar. K3 "+2 more items" and total item count highlighted. K4 WhatsApp help box: roomier, coloured border, outside the checkout card (test 5–6 items). K5 order message card more bottom space. K6 delivery note always open, bigger text. K7 SMS and WhatsApp ticks side by side. K8 cotton upsell bigger. K9 payment options sometimes one line, sometimes boxes → flaky bug; boxes are right; must allow choosing bKash etc.
- Owner asked: fix now with agents, then QA agents on checkout and bag page, then desktop review agents; add our own findings.
- 03:57 owner sent the footer reference image (owner-fix/A/footer-reference.png): take its LAYOUT for the desktop footer, content from ours.
- 04:05 K10 (owner): checkout accepts a wrong phone number (even 1 digit) → strict BD mobile validation (01[3-9]XXXXXXXX, +880 normalised, Bengali digits) on checkout and all phone inputs incl. footer Join; sent to the bag/checkout and footer agents.
- 04:10 K10 rule (owner): never block a real number for how it was typed — normalise first (Bengali/mixed digits, strip symbols/spaces, drop 00880/880/88, doubled 00 → one 0, add missing 0), then check 01[3-9]XXXXXXXX; show the cleaned number back; one shared helper everywhere; must also go into the real build (S04).
- 04:13 owner: fix every bug, said or unsaid; check phone too; full backend audit (design, completeness vs a standard e-commerce backend, bugs, unclear text, ERP stock/accounts/report consistency, invoice design). → 4th agent started on admin audit (qa/ADMIN-AUDIT.md); phone-wide audit to run after the three desktop agents finish (avoid clashing edits).
- 04:16 owner: (a) 5–7 invoice designs he asked for earlier — never delivered → added to the backend agent (setting 'Invoice template', sheet). (b) Full simulation: ~20 real-like orders across all categories/combos/sets, mixed basket sizes, one customer several orders, through to delivery; backend reconciles; real daily P&L incl. COGS, courier, gateway, ads, employee and other costs; frontend vs backend mismatches fixed → qa/SIMULATION-REPORT.md (for the morning).
- 04:18 owner — SIMULATION SPEC (PENDING: run after the 3 storefront agents finish, on the fixed build):
  - minimum 30 orders, like a real 50-order day; every category, combos, auto-pair combos, build-your-own sets, sets, sale; basket sizes 1 / 2–3 / 4–5; one customer places several orders; Dhaka / sub-urban / outside; COD + online.
  - real-life problems: fraud and duplicate patterns (changed phone same address, re-order in transit, several same-day orders that should ship together), wrong/odd phone formats, a fake order, a cancel, a size exchange, a defect exchange, a return request (policy: no returns after delivery, only exchange for size/defect — handled per policy), courier failed delivery, partial issues.
  - each simulated customer gets an account: re-orders from the account, exchange request, return request, opens support, downloads invoices; an invoice is generated for every order; a few sent on WhatsApp (mock).
  - a separate OPS agent works the backend like staff: review fraud flags, confirm/decline with reasons, book courier, deliver, handle exchanges/returns/support; every decision logged with the reason.
  - final report: orders, statuses, reasons, revenue, COGS, courier, gateway, ads, employee + other expenses, gross/net P&L, by style/category/combo; independent recalculation vs admin reports, mismatches fixed and re-run; Bengali summary; screenshots → qa/SIMULATION-REPORT.md.
- 04:23 owner — SIMULATION SPEC additions (still PENDING until the storefront fixes land; nothing skipped):
  - **50 orders**, not 30.
  - Every step logs problems + the fix: placing orders, PDF/invoice, invoice print with 5–6 items, courier sticker size with 6 different items, courier booking, support, receiving returns, return stock matching, P&L.
  - Customer-side UX notes and "this option would help"; employee-side notes from backend staff.
  - Judgement from 6 angles: technical, customer, employee, CEO, owner, supplier.
  - Communication: email, SMS, WhatsApp to the customer (mock); support inbox receives every channel.
  - YouTube video embeds on some products — test them.
  - Use the owner's named agents (Prohori, Bhandari, Sawdagor, Shilpi, Doot, Gyani, Tirondaj) as the working team.
  - Everything learned becomes a skill (docs/agents/skills/<agent>/, synced to the repo and to the site's AI panel skills), including neighbouring cases.
  - Bring anything that can be started now forward; skip nothing.
- 04:23 code project status (repo): S0A 12/12 live; S00 merged so far: 11, 12, 13, 17, 491, 492, 493, 494, 496, 510, 603 (+ first deploy live at 03:03); next 495, 500, 508, 509 → 14, 15, 16, 18. One agent alone by rule until S00 ends, then 2–3 in parallel. The project used CN-007 for the preview-password rotation → the owner's desktop review becomes CN-008 when filed.
- 05:xx category/product agent done (fixB.html). Noticed in its sheets: a 'Demo controls' pill shows bottom-left on the storefront — check it is hidden for normal visitors (demo helpers rule) in the final QA pass.
- admin gap screens built (fixE.html, 49/49 test incl. P&L hand-sum match). Leftover for final QA: 4 Bengali leaks in English mode from 85-admin-combos.js and 89w-owner-c.js; Demo controls pill visibility.
- home/header/footer agent done (fixA.html). Final QA leftover: on desktop the 'Demo controls' pill overlaps the footer copyright line (bottom-left) — move/hide for visitors.
- container restart killed the desktop QA reviewer and the phone audit; desktop QA relaunched alone (one browser, no background jobs); phone audit queued to run right after it — sequential to avoid another restart. Then the 50-order simulation.

## Note 52 — 20 Oct 12:22 · Owner answers to the open questions (CN-009)
- Admin login e-mail: given in chat (owner data — never committed to Git; set on the server only).
- Preview password: he already has it.
- Watermark text: his website address www.extas.com.bd.
- Unused photos: never deleted, archive only.
- "Was" price: real MRP on single items where it exists; combos show the sum of the separate prices; never invented.
- Order e-mail counting (B.4 #1), the one WhatsApp slot (#2), "100% original" line (#6): all become backend settings he sets himself — ship as settings, he decides there.
- Title brand: "EXTAS" only.
- Returns row wording: "Exchange within 72 hours for size or fault".
- VAT/invoice format: after launch.
- Combo defaults, desktop CTA, side canvas: keep as built. Blog: no "tested by us" claims until a care-lab person exists; byline "EXTAS Journal" until expert names arrive; blog starts on go-live day (posts ready before); old short notes listed under the guides, noindex.
- Invoice: default design 3, all 7 selectable in the backend. Logo: all 11 styles kept, he picks in the backend. Header menu: default "main categories + More", other options kept. Drawer: default style B (whole bag), A kept. Bag "You may also like": pick one default, keep the others as options.
- Owner data (delivery charges, free-delivery limit, COD, exchange limit, AI budget) are entered by him in the backend later — never blockers (rule added to CLAUDE.md).

## Note 53 — 20 Oct 12:47 · Store on the home page, S02 now, owner account (CN-010)
- new.extas.com.bd home shows the store: what is built, "শিগগির আসছে" where a page is not built yet. Progress page only at /status.
- S02 (home, category, product page) starts now beside the rest; max 3 agents at once; every page goes live as soon as it is merged. Design = V12.1 demo exactly.
- Open his admin account (e-mail given in chat, never in Git); Bengali step-by-step for reading the password.

## Note 54 — 20 Oct 13:37 · Owner review of V12.1 (footer, bag, checkout, payment, hero, logos) — CN-012
(Note 53 / CN-010 is used by the project's PR #18; CN-011 = docs/README rules.)
**Phone rule for all items below:** text changes go to the phone too. A design change goes to the phone only after the full device gate proves 0 side-effects on every phone width; anything that doesn't fit the phone stays desktop-only. The owner must not have to re-review the phone.
1. **Footer menu icons:** every footer section link (Help, Policies, etc.) gets a small line icon. (Asked before, missed.)
2. **Footer social icons:** the social section above the payment icons shows real social icons (Facebook, Instagram, YouTube, TikTok, WhatsApp…; list from settings). (Asked before, missed.)
3. **Bag panel "Free delivery on this order":** must not look like a button. Highlight without a box: icon + coloured text, light accent.
4. **Bag panel recommendations fill the space:** show as many items as fit while keeping ≥10–12 px below the Keep shopping / View bag buttons. Only when the next item would not fit, show "+N more · View bag". Never leave empty space and then collapse. Both styles (default/old and style B) stay selectable in the backend. Check the phone; change it only if it needs it.
5. **Bag page offer cards:** the "Pick your polo" card colour/style looks cheap → refine. The left offer-list card must be the same height as the 3 product cards on the right.
6. **Checkout heading "Where should we deliver?"** → simple words (e.g. "Delivery details"). Every checkout text and the field order are editable from the backend.
7. **Checkout labels** "Full name & phone number" and "Full address" are too small → bigger labels, fix the top padding, remove the wasted space under the boxes.
8. **Full address placeholder:** no sample address. One clear Bengali line telling the customer to write the detailed address with thana and district, e.g. "বাসা/রোড নম্বর, এলাকা, থানা ও জেলা লিখুন — রাইডার যেন সহজে খুঁজে পায়".
9. **Phone error:** show only after the cursor leaves the field with a wrong number (never while typing "01…"). It must not push the address field down. A small, smart inline hint replaces the big warning box below.
10. **"Try it on in front of the rider"** moves into the right side of the "Delivery anywhere in Bangladesh" row, with a subtle shimmer/flit, to save vertical space.
11. **Bottom terms line:** remove "confirmation/tracking link by SMS… not return or refund". Keep "Items can be exchanged for size" as a link that opens the exchange/return policy.
12. **"Need help? Message us on WhatsApp":** add a space after "?" and give it a gentle flit (subtle; off under reduced motion).
13. **Payment:** Cash on delivery open by default; Mobile and Card stay closed until clicked. Make them beautiful, with proper logos: bKash/Nagad/Rocket, Visa, Mastercard, Amex, bank, and the "online payment" (gateway) option that existed before — bring it back.
14. **Product page price highlight:** revert to the previous style (owner: "my mistake"). Keep the rest of that section's changes.
15. **Logos:** the generated text logos look cheap → make refined, professional text logos (several options, all selectable). Header/menu defaults stay; options remain selectable.
16. **Menu:** good. Confirm the rule: when the 7th menu item doesn't fit, it goes into the "More" dropdown.
17. **Hero campaigns (CN-012):** backend "Hero & campaigns". Set up a campaign (Winter, Puja, Eid, Summer, Hot deals, any offer) with dates; pick from **8–10 ready hero templates** in several colours; link a collection so the hero's products swap with the campaign; optionally design a new hero inside the backend (simple editor: text, colours, image, button) and save it as a template. Simple to use, not complex.
18. **Working style:** fewer rounds, fewer tokens, finished properly the first time; use own judgement for "smart" details.

## Note 55 — 20 Oct 13:52 · Think beyond the ask; the real-life journey simulation is a go-live gate (CN-013)
- The 50-order real-life simulation is **required before real orders start**. Its report (problems found and how each was solved) is kept for the owner.
- Journey scope: from "I need a polo" to 3 days after delivery: discovery, browsing, checkout, confirmation, packing, courier, the door (try-on, negotiating with the delivery man, refusal, partial acceptance), COD settlement, exchange/return, complaints, angry customers, product faults, auto-handling and handover to a human, repeat purchase. Research real Bangladesh practice first.
- **Open boundary (standing):** every finding gets the fix + prevention + a review of the core decision behind that step + ideas that make it easier, smarter and more profitable. Agents do not stop at what the owner listed; they add what is missing. Ideas touching money, prices, COD or blocking go to the owner as proposals (hard rule 6).
- Goal set for every agent, always: the journey is **easy, smart and profitable**, better than an ordinary e-commerce site, and the decisions still pay off 2–3 years from now.

## Note 56 — 20 Oct 14:10 · Add the 8 best ideas as optional settings; Bengali guide per admin section; auto-resume (CN-014)
- All 24 ideas stay listed. The 8 best (ideas 5, 10, 13, 8, 17, 15, 19, 22) are added. Each one is optional and dynamic: an on/off switch, every number editable, kept in its own admin category, not complicated.
- One Bengali file per admin section/menu: what the section is for, how many menus it has, what can be done. It is kept as part of the blueprint and visible in the admin.
- The owner's weekly limit is almost used up. When the limit resets, both this planning chat and the code project continue from the exact stopping point without any input from the owner and without wasting tokens.

## Note 57 — 20 Oct 14:12 · Auto-detected customer problems, in the admin and at the top of README (CN-015); new demo link; admin login error
- Customers won't report bugs, so problems are detected automatically from their behaviour: any device, any network, any step from landing to checkout, dashboard or tracking. Each record carries its details, the problems are analysed in the backend, and each one gets a summary and a status (fixed / fixing / could not fix / needs owner permission / waiting for the owner's check before deploy). The owner sees them by date (today, yesterday). Problems are fixed automatically when no admin permission is needed, and a note is kept. Shown in the admin and at the top of README under "Running problems". This shows the owner what the bugs are and why sales drop.
- When the Note 54 corrections are done, the demo is published as a **new version with a new link**, so the owner can compare it with the old one.
- After logging in to the admin on new.extas.com.bd, the page shows "This page couldn't load". Fix it.

## Note 58 — 23 Oct 01:35 · Owner review of V12.2 (footer, header slogan, set price styles); public link
- Phone footer: social icons missing. Show them as a full-width row like the payment logos (must).
- Desktop footer: the Hotline gets the same box as "Message us on WhatsApp", placed under it. The social icon row sits right above the payment icons and spans the same width (must).
- Desktop **footer**: the slogan must sit under the footer logo, not beside it. The header stays unchanged. The Hotline is its own separate box, styled exactly like the WhatsApp box, placed below it.
- "Build your own set" price highlight looks cheap. Offer 3 tasteful styles plus "None" in admin; the owner ticks one and the rest stay optional. The owner approves after seeing them.
- The V12.2 artifact (7.5 MB) is too large to share publicly. A slim public build (docs data left out, under 2 MB) gets its own link.
- Independent QA of V12.2 (`qa/QA-V122-INDEPENDENT.md`): 4 fails and 7 polish items, fixed in the same pass.
- The owner is frustrated by repeated correction rounds: everything must pass an independent visual check before he sees it.

## Note 59 — 23 Oct 04:20 · Owner answers to the simulation questions (CN-018)
- All answers are filed in CN-018. Standing rule: build the system as backend settings and never ask for numbers.
- The demo admin is too crowded ("my head spun"). The live admin must be simple and grouped by section. Design `docs/ADMIN-ARCHITECTURE.md` and show the owner one picture of it first.
- Q3 (delivery-day and Day-1 messages) and Q9 (self-confirm WhatsApp counted as the one WhatsApp) were not understood. They were explained again in chat.

## Note 60 — 23 Oct 04:29 · Messages control centre; modern simple admin with mock-ups first; manual; gap report; 20 more orders (CN-019)
- Q3: the delivery-day message is built as an option. The Day-1 follow-up is built and on, controlled later from Messages. Q9 is not fixed now; it becomes a system in Messages.
- Messages section: control how many messages per order, when, where and which; the order journey from received through delivery to 1–2 follow-ups; promotions, campaigns and their counts. SMS, WhatsApp and e-mail are each set systematically.
- Main focus now: the backend. Every category is smooth, accurate and user-friendly; modern design (graphs, analytics); every option usable without confusion. A detailed user manual per section. High-res images of every section first, then the demo if it is cheap.
- Report anything discussed and dropped during the 2–3 day limit gap.
- 15–20 more simulated orders from missed angles: full prepaid, bad customers under the rules, 40+ and 50+ buyers, low-literacy rural buyers. Fix the normal ones; hold the owner questions.
- Keep token use low; the priority is getting the e-commerce site live fast.

## Note 61 — 23 Oct 05:18 · Simulation part-2 answers: send to someone else, abroad, call-me, voice address, cancel (CN-020)
- (1/2) The normal checkout stays as it is: the name and phone are the receiver's. Send-to-someone-else and abroad must not clutter checkout or invite abuse; the planning chat proposes a safer design (pending owner OK).
- (3) "Call me" is not a permanent button for everyone. It appears only when the customer struggles at checkout (repeated errors, long idle). The trigger has a standard default and can be changed in the backend (must).
- Voice address: a mic icon in the address field. Bengali speech becomes text automatically; the backend marks the order "voice-entered"; staff call only if the text is unclear.
- (4) Cancel: the customer can cancel themselves until the order is confirmed. After confirmation, a cancel request until courier booking, approved by staff. The cut-off stage is a setting.
- 23 Oct 05:28 owner confirmed: (1) normal checkout unchanged — OK. (2) Gift = advance payment always, from Bangladesh or abroad, no login needed; the owner controls gift on/off, advance on/off and the advance type and amount from the backend. (3) The call-me rule is OK.

## Note 62 — 23 Oct 05:33 · Answers to P8/P11/P12/P14/P16 (CN-021)
- There is no exchange after the window; the window is a setting counted from the courier's "delivered" mark (72 h for now). Bulk orders are fully dynamic. COD-off is a proposal only, with the full per-number history visible. The SMS-offers tick is pre-ticked. Instant COD is not a separate feature: the courier dashboard already shows the payout; just label how it was received.

## Note 63 — 23 Oct 19:22 · Architecture approved (CN-022)
- After the third-party review, the owner approved the design and everything in it, with the recommended answers. Next: build everything in the demo (the new admin) and build the backend as planned.
