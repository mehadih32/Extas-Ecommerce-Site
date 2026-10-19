# Combo / set research for EXTAS

Written 19 Oct 2026. Plain English so the lead can translate it. "Fact" means I saw it or a source says it (with link). "Judgement" means it is my advice.
Phone sizes are in CSS px. The main test phone is 393 × 852.

---

## 0. Top 10 rules for EXTAS combo pages

1. **Sizes on the first screen.** On a 393 × 852 phone the size buttons and the Add button must be visible without scrolling. Today (r16) the first size button sits at y ≈ 1,128 px on all three combos, and the page is 4,016 px tall. Target: y ≤ 600.
2. **One size for all pieces by default.** Show "Size for both" (or "for all 3") as one row of buttons, with a small link "Different size for each?". Top + bottom sets get two rows (top size, bottom size).
3. **Every colour pair is its own product** (the owner's WordPress model). Generate the pairs automatically from one style, name them by colour ("Black + Navy"), and give each one its own card, page and link. Sort best sellers first and add a "Has colour" filter. Never list one colour alone in a combo section.
4. **Say the price one way, in taka:** "2 pcs ৳2,200 → ৳1,800 · Save ৳400". Use one save amount in taka, not % (all EXTAS combos cost well over 100 units). Show that price block once on the page and once in the sticky bar, nowhere else.
5. **One button wording everywhere:** **"Add both to bag · ৳1,800"** (3 pieces: "Add all 3 to bag · ৳2,550"). Do not use "Add to set" or "Add to combo". When something is missing, the button says what is missing ("Choose a size") and tapping it scrolls to that spot.
6. **The photo shows every piece you get,** in the colours you chose. Build the photos from one house standard: the same background, angle and scale for every colour. Put "2 pcs" and "Save ৳400" in as page badges (HTML), not baked into the photo.
7. **Sold-out is handled before the tap.** A size shows as available only when every piece in the pair has it. Greyed sizes say why ("3XL: Navy sold out") and offer a way out. Pairs with no size left are hidden from the grid.
8. **The bag shows one honest line per set:** set name, colours and sizes of each piece, one price, one "you save ৳X". All rows add up to the total. Never split the set price evenly across pieces. Never show a discount twice. Never advertise a set the shopper already has.
9. **The bigger pack is offered, a single piece never is.** "Add 1 more → 3 pcs ৳2,550 (৳850 each)" goes on the pair page and in the bag. In a combo section there is no 1-piece option.
10. **Short words for first-time COD shoppers.** Keep words above the fold under 40 and titles to 2 lines at 360 px. Write colour names in text next to each swatch. "Pay ৳1,800 when it arrives" sits next to the button. Use one language per screen. No fake timers.

---

## 1. What I looked at

I opened these myself in a phone browser (Playwright, 393 × 852, iPhone user agent) on 19 Oct 2026:

| Store / tool | What I opened | Verified? |
|---|---|---|
| The Souled Store (India) | Combo search list, "Boardroom Set" combo page. I added it to the cart and saw the cart. | Yes: page, error state and cart |
| Othoba (Bangladesh) | Search "combo polo", SMUG "Black, White – 2 pis combo" page, "Stylish 3 Pcs Polo Shirt Combo" | Yes |
| Fabrilife (Bangladesh) | Sports socks combo page (colour pair in title, one size picker) | Yes (page was out of stock, a pop-up covered part of it) |
| Bewakoof (India) | Combos list, men's T-shirt list (offer tags), a product page with "Buy 3 get 10% off" | Yes |
| Kaching Bundles (Shopify app) | Its demo store: quantity-break widget with a per-piece colour/size picker, and the cart drawer | Yes |
| Fast Bundle (Shopify app) | Demo store: "Buy 1 / Buy 2 Save 10% / Buy 3+ Save 20%" tiers | Yes |
| Bundler (Shopify app) | App store listing (bundle types only) | Listing only |
| Yellow, Sailor, Ecstasy (Bangladesh) | Search pages | Opened: no menswear multi-packs found (Yellow search "combo" → "no products"; Ecstasy only "co-ord sets") |
| EXTAS demo r16 | `#/combo/polo-duo`, `#/combo/office-trio`, `#/combo/polo-chino`, `#/set`, bag with Polo Duo | Yes |

I could **not** open these (blocked or failed): Myntra ("upstream request failed"), Daraz BD listings (blocked), Amazon.in (blocked "rush hour" page), H&M and Uniqlo (Access Denied), Snitch (search showed nothing), Gentle Park (no connection). For H&M I used a reseller copy of a 3-pack page on Nykaa. Wherever I describe these stores from memory, it is marked "not verified".

Screenshots: `/tmp/claude-0/-home-claude/a27f8d4d-b57b-5d41-b919-c637e74e7368/scratchpad/comboresearch/` (Souled Store: `w_souled_boardroom_1.png`, `_2.png`, `souled_err.png`, `souled_cart_1.png`; Kaching: `kach_a.png`, `kach_b.png`, `kach_cart.png`; Othoba: `w_othoba_pdp_1.png`, `w_othoba_list_2.png`; EXTAS: `s__combo_polo-duo.png`, `r16_bag.png`).

---

## 2. How other stores sell sets on a phone

### 2.1 Bangladesh

**Othoba (marketplace, sellers like SMUG).** [Search "combo polo"](https://othoba.com/ts/search/combo%20polo?t=t&q=combo%20polo), [2-pc page](https://othoba.com/smug-premium-combo-offer-polo-shirt-black-white-2-pis-combo-smug-580009), [3-pc page](https://othoba.com/stylish-3-pcs-polo-shirt-combo). Fact:
- **Each colour pair is its own listing**, the same model the owner uses: "SMUG Premium Combo Offer Polo shirt – Black, White – 2 pis combo Tk 699 ~~Tk 1,450~~ 52% OFF", plus separate 3-pc listings ("Olive, Grey, Red – 3 pis combo Tk 924").
- **Product page:** one photo of the two shirts lying on top of each other on a wooden floor. Then the price, "Select a size *" with **one size row (M L XL XXL) for both shirts**, then ADD TO CART. A phone number to order by call sits under it.
- **List:** 2-column cards. Several cards have the **same title** ("Combo Cotton Polo Shirt For Men's", Tk 949) for different colour pairs, so you can only tell them apart by the photo. The photos have "2PCS COMBO" and a red "37% OFF" burst baked into the image.
- Lessons for EXTAS. Copy: one size row, colour pair as a product. Avoid: identical titles, text baked into photos, long titles.

**Fabrilife.** [Socks combo page](https://fabrilife.com/product/72220-premium-antibacterial-sports-socks-combo-raven-antha-melangeplaymaker-antha-melange). Fact:
- The pair is a product, and the colours are in the title: "Premium Antibacterial Sports Socks Combo – Raven (Antha Melange)+Playmaker (Antha-melange) ৳345 ~~৳590~~ 42% Off". It has one "Select Size" row.
- The title wraps to **6 lines** on a 393 phone, which is a warning for EXTAS's own name pattern.
- The page also shows "Frequently Bought Together" (one item + Add to Cart).
- Fabrilife's menu has "Boys Combo Set" and "Girls Combo Set" categories. I saw no men's polo/tee combos on its site today.

**Yellow, Sailor, Ecstasy.** Fact: no men's multi-pack/combo listings were found ([Yellow search](https://www.yellowclothing.net/search?q=combo) returned "no products"; Ecstasy shows "co-ord sets" sold as one product). Judgement: the big BD brands don't compete here on their sites, so EXTAS can own "combo" in BD menswear.

**Daraz.** Not verified on BD (blocked). [Daraz PK bundles page](https://www.daraz.pk/bundles-for-everyone) (fact) lists 4 bundle types: Buy One Get One, Combo ("buy two, get the third of equal or lesser value free"), Free Gift, and Quantity Bundle. The shopper is told to "find the promotions on the product page and add to your cart".

**Rokomari.** Sells book "packages" as one product. It is not relevant to clothing pickers, so I did not open it.

### 2.2 India

**The Souled Store.** [Combo search](https://www.thesouledstore.com/search?q=combo), [Boardroom Set](https://www.thesouledstore.com/product/boardroom-set-men-combo?get=4). Fact (I tested it):
- **List:** a single "Combos" category with outfit-style names ("Boardroom Set", "Office Ready Set", "Weekend Chill Pack"). Each card shows "₹3798 ~~₹3998~~ ₹200 OFF" with the save **in rupees**.
- **Combo page, first screen:** one wide photo with a model wearing the shirt + pants on the left and flat photos of the two pieces stacked on the right, with "SHIRT + PANTS" written on the image. Below that are the name, the price and a sticky full-width **ADD TO CART** bar.
- **Pickers:** one block per piece: piece type label ("Cotton Linen Shirts"), a dropdown "-- Please Select Product --" (holds the colour; only 1 option here), "Please select a size." with **size buttons XS–XXXL, sold-out sizes crossed out**, and "Notify me".
- **Error:** tapping ADD TO CART with no sizes scrolls to the pickers and shows a **pink inline box "Please select a size." under each piece**. There is no toast.
- **Cart:** the combo is split into **separate lines per piece** (each with its own price and a "Combo Discount" label). The summary shows "Cart Total ₹4197 · Member Savings −₹390 · Total ₹3807".
- Lessons. Copy: the inline error under each piece, crossed-out sizes, the save shown in money, the model + flat-lay hero. Avoid: the dropdown for colour (it hides choices), the split cart lines with odd per-piece prices (the same problem as EXTAS audit findings 7–8).

**Bewakoof.** [Combos](https://www.bewakoof.com/combos), [men's T-shirts](https://www.bewakoof.com/men-t-shirts). Fact:
- Real "combo" products are only masks now. For clothes they use **mix-and-match offer tags on normal cards**: "Buy 2 for 1199", "Buy 3 for 1199", "Buy 3 get 10% off".
- On the [product page](https://www.bewakoof.com/p/unisex-mellow-mauve-plain-t-shirt) a box "Save extra with these offers · Buy 3 get 10% off · **Auto applied offer** · View all items" sits under the size buttons. Sizes show stock under the button ("M · 1 left", "XL · 5 left").
- Judgement: this matches EXTAS "Build your own set" (any 2 polos ৳1,500). The tag belongs on every eligible normal card as "Any 2 for ৳1,500".

**Myntra.** Not verified (blocked). From memory: "Pack of 2/3" T-shirts are sold as one product with a fixed colour mix and one size row, and the listing has a "Pack of 2" style filter. Treat this as a hint only.

**Snitch.** Could not open (search empty).

### 2.3 Global

**H&M multipacks.** Verified only through a reseller copy ([Nykaa: H&M 3-pack](https://www.nykaaman.com/h-m-men-brown-3-pack-regular-fit-t-shirts/p/26998562), [H&M IN page title](https://www2.hm.com/en_in/productpage.0890930024.html) "Green/White 3-pack Regular Fit"). Fact: the pack has a **fixed colour mix named in the title**, and **one size row (XS–2XL)** for the whole pack. Not verified: on hm.com the other colour mixes appear as swatches on the same page.

**Uniqlo.** Could not open (Access Denied). Not verified: it sells basics (socks, underwear) as fixed packs with one size.

**Amazon "Frequently bought together".** Could not open. From memory (not verified): 2–3 thumbnails joined by "+", one checkbox per item, "Total price", and one "Add all 3 to Cart" button. Each item keeps its own size picker only on its own page. Judgement: good for "add a matching item", bad for size-heavy clothing sets.

**Amazon multipack image rule.** Fact (secondary source, [Amalytix summary](https://www.amalytix.com/en/glossary/multipack-imaging-standards/) of [Amazon's "Multipack imaging standards"](https://sellercentral.amazon.com/gp/help/external/G94GSFMC79RSLDBY)): the main image should "display the total quantity delivered", the title must state the count ("X pack"), and the photo and title must not conflict.

**Kaching Bundles** (Shopify, 5.0★ from 6,397 reviews per its [app listing](https://apps.shopify.com/bundle-deals)). Fact (demo store):
- **Radio-card tiers**: "Single $29.99" / "**Duo · Save 15%** $51.00 ~~$59.98~~" with a black "Most Popular" sticker.
- The **selected tier opens per-piece rows**: "#1 [● ○ colour swatches] [S ▾]", "#2 [● ○] [S ▾]".
- **Cart drawer:** each line has **editable colour and size dropdowns inside the cart**, plus a green nudge "**Add 1 more to get 15% off**".
- The demo also shows "Hurry! Offer expires in 01:02:54" and "Your cart will expire in 09:57", both fake urgency.
- Lessons. Copy: tier cards, per-piece rows that only open when needed, editable size in the bag, the next-tier nudge. Avoid: the timers (the owner's combos run with no end date, and fake timers hurt trust).

**Fast Bundle** ([app](https://apps.shopify.com/fast-bundle-product-bundles), demo). Fact: "Buy More, Save More": Buy 1 Standard $399 / **Popular** Buy 2 Save 10% $718.20 ~~$798~~ / Buy 3+ Save 20%. It uses the same tier-card pattern.

**Bundler** ([app](https://apps.shopify.com/bundler-product-bundles)). Fact: offers fixed bundles, multipacks, mix-and-match, "build a box" and quantity breaks, with discounts as %, a fixed amount or a fixed price. I did not test its widget.

**Rebuy.** Its app listing says "not currently available on the Shopify App Store". Not tested.

### 2.4 What the stores tell us (judgement)
- Two models win on phones. **(a) The set is one product with one size row** (Othoba, Fabrilife, H&M). **(b) The product page has tier cards** (Kaching, Fast Bundle). Per-piece pickers are used only when the pieces differ (Souled Store top + bottom).
- No store I saw uses a step-by-step wizard for sets.
- Stores that show the save in money (Souled Store "₹200 OFF") read more clearly than %-only bursts.

---

## 3. What research says

| Topic | Fact (source) | What it means for EXTAS (judgement) |
|---|---|---|
| Phone + COD market | 75% of BD e-commerce payments by volume are COD, and 80% of volume is on mobile ([PCMI, 2024](https://paymentscmi.com/insights/bangladesh-ecommerce-market-insights/)). 47% of BD shoppers are comfortable paying online (same page, citing a 2021 study). | Design for one thumb, 360–430 px. Put "Pay when it arrives" next to the button. |
| Why people abandon | Baymard average abandonment is 70.22%. Reasons (US): extra costs too high 40%, delivery too slow 20%, card trust 19%, forced account 18%, checkout too long 17% ([summary of Baymard data](https://redstagfulfillment.com/percentage-of-online-shoppers-abandon-their-cart/)). | Show the final set price with "Free delivery" on the combo page. The bag must not show a surprise number. |
| Listing colours as separate items | Baymard: listing each variation as its own item clutters lists and makes users scroll and compare more, and "will cause some users to abandon". 12% of benchmarked sites still do it. Fix: one item with swatches and a colour count ([Baymard](https://baymard.com/blog/combine-variations-one-list-item)). | **Tension with the owner's model.** Generated pairs are fine on their own dedicated page, where the pairs *are* the products. On mixed pages (Polo category, home, Combo hub) show **one card per style** ("Solid Polo · 15 colour pairs"), not 15 cards. |
| Swatches on list cards | Baymard: show the colour options on list cards; a horizontally swipeable swatch row works best on mobile; 57% of sites fail to show all colours ([Baymard](https://baymard.com/blog/mobile-interactive-color-swatches)). | Style cards show the 5–6 colour dots. Pair cards show the 2 dots of that pair. |
| Size options must be visible | Baymard #850: "Some users will miss size or other non-color options when they're not immediately and directly visible" ([preview](https://baymard.com/guidelines/850-non-color-variation-selectors)). | Use size **buttons**, not dropdowns (Souled Store's colour dropdown and Kaching's size dropdown both hide options). |
| Error messages | NN/g: put errors "close to the error's source", make them noticeable and redundant, and do not show them too early ([NN/g video](https://www.nngroup.com/videos/error-message-visibility/)). Souled Store does this (inline pink box under each piece). | No toast for a missing size. Scroll to it and show red text + icon under that row. |
| Lower-literacy shoppers | NN/g: lower-literacy users read word by word, don't scan, miss things outside the main column, and lose their place when scrolling. Advice: main point at the top, key info without scrolling, single column, no moving text ([NN/g 2005, reposted](https://desis.osu.edu/seniorthesis/index.php/2021/01/25/lower-literacy-users-writing-for-a-broad-consumer-audience/), original [nngroup.com](https://www.nngroup.com/articles/writing-for-lower-literacy-users/)). | Single-column pages, colour names in words, the price written one way, no carousels that move on their own. |
| ৳ save vs % | Rule of 100 (Jonah Berger, *Contagious*): under 100 currency units a % looks bigger; above 100 the amount looks bigger. For small discounts both work equally ([InsideBE summary](https://insidebe.com/articles/guide-to-discounting/)). That article warns the studies used $, €, £. | EXTAS combos are ৳1,500–৳4,000, so "Save ৳400" looks bigger than "18%". Use taka as the main message; % is optional and small, or left out. |
| Too many choices | Jam study: 24 jams drew more people (60% vs 40%), but 3% bought vs 30% with 6 jams. A meta-analysis of 50 experiments found an average effect near zero. Overload shows up when options are hard to compare or people have no clear preference ([Psychology Today summary](https://www.psychologytoday.com/us/blog/pop-psych/201602/is-choice-overload-real-thing)). | 15 colour pairs is OK **if** the shopper can narrow fast (a "Has Black" filter, best sellers first). 20 triples or 21+ pairs: lead with a "pick your colours" builder instead of a long grid. |
| Sticky Add button | One public A/B test of a mobile sticky add-to-cart: add-to-cart +6.8 to +8.7%, but conversion −7.7% and revenue −22.1%, labelled "Inconclusive", with no sample size given ([CleanCommit](https://cleancommit.io/ab-tests/mobile-bottom-sticky-add-to-cart-button/)). | The evidence is weak either way. Keep the sticky bar but make it smart: it shows what is missing and never fires an error toast. Keep it ≤ 80 px tall (r15 grew to 142 px). |
| Photos | On-model vs flat-lay "converts 20–30% higher" claims are **unsourced** ([Photta](https://www.photta.app/resources/flat-lay-vs-on-model)). Amazon requires showing the full pack quantity (above). | Judgement only: the hero shows **all pieces**. Add one on-model photo when possible (for top + bottom sets, the on-model photo is the hero). |

---

## 4. The owner's model: auto-generated colour-pair combos (first-class)

### 4.1 What the owner described
- Years of proven sales on WordPress. **Each combo is its own product listing.** The photos of the two items sit side by side, and the title reads like "Polo — Black & Navy · 2-piece combo". There is no end date. The price reads "2 pcs regular ৳2,200 → combo ৳1,800".
- He promotes a **category page**, e.g. Polo → sub-brand → new style "Solid Polo". That page lists **only** the generated combos of that style's colours, each a normal-looking card. Tapping one opens **that pair's own page**.
- **Admin:** upload the single product as usual → Combo section → pick category / sub-category / product(s) → choose 2-piece or 3-piece → combos generate automatically, and update when a colour is added or sells out. Bindings are dynamic and can be switched on or off at once.
- **No single piece** in these sections: a 2-piece sells as 2, with an optional "add one more → 3-piece, bigger discount". A per-section tick: "No single piece here".

Fact: Othoba/SMUG and Fabrilife do exactly this by hand (section 2.1), so the model is proven in BD. The upgrade is doing it automatically and cleanly.

### 4.2 How many combos get made
Pairs = n(n−1)/2. Triples = n(n−1)(n−2)/6. These counts use different colours only.

| Colours in the style | 2-piece pairs | 3-piece triples |
|---|---|---|
| 4 | 6 | 4 |
| 5 | 10 | 10 |
| 6 | 15 | 20 |
| 7 | 21 | 35 |
| 8 | 28 | 56 |

"Same colour twice" (Black + Black) adds n more pairs. Make it an admin tick, **off by default**: it turns a "colour combo" into a plain 2-pack and needs 2 units of the same colour and size in stock.

**When does the grid get too big? (judgement, based on section 3)**
- **Up to 15 cards:** show the full grid, best sellers first, with a colour filter row. At 2 per row that is 8 rows, about 3½ phone screens.
- **16–28 cards** (e.g. 20 triples): show the top 8 first, then "See all 20 combos". The colour filter row is a must, and a "Pick your own 3 colours" builder card sits at slot 1.
- **Over 28:** lead with the builder (template P2). The grid becomes "Popular combos" (top 8) under it.
- Each colour appears in 5 of the 15 pairs, so the cards look alike. The colour filter row ("Has: ● Black ● Navy …") is what makes 15 cards easy.

### 4.3 Naming the generated combos
- **Colour order is fixed by the owner's colour order on the product** (the order he uploaded, or "darkest first"). So it is always "Black + Navy", never also "Navy + Black". There are no duplicates.
- **Card:** line 1, bold, the colours: **"Black + Navy"**. Line 2, small grey: "Solid Polo · 2 pcs". Every card on the style page shares the style, so the colours are the part that differs. This avoids Othoba's identical titles and Fabrilife's 6-line title. Fits: a 2-column card is about 174 px wide, roughly 22 characters per line at 14 px. "Charcoal + Sky Blue" (19) fits on one line.
- **Page title:** "Black + Navy" (H1) with "Solid Polo · 2-piece combo" above it as a small label.
- **SEO/tab title:** "Solid Polo Combo — Black + Navy (2 pcs) | EXTAS".
- **Bengali:** "কালো + নেভি", "সলিড পোলো · ২ পিস কম্বো".
- **Stable link per pair:** `/combo/solid-polo/black-navy`, `/combo/solid-polo/black-navy-white`. Facebook ads can then point at one pair, and the link survives restocks.
- Brand names: the owner's example used "Ralph Lauren Polo". Use a real brand name in titles only for genuine, authorised stock. Otherwise use the EXTAS sub-brand or style name. (EXTAS already promises "we say plainly which brand each item is".)

### 4.4 Ordering the generated combos
Default sort is **"Best selling"**, with this order of tie-breakers:
1. Pairs the owner **pins** (admin drag-to-top, optional).
2. Pair sales in the last 30 days.
3. For a new style with no pair sales: the sum of each colour's single-item sales (or the owner's colour order). This puts "Black + Navy" before "Olive + Yellow".
4. Stock depth: pairs available in more sizes first.
5. Pairs with **no size left** in either colour are hidden. Pairs missing some sizes stay, with the size line showing what is left.

Other sorts in the sort sheet: "Most sizes in stock", "New colours first". Price sorting is useless on this page because every pair has the same price.

### 4.5 Photographing generated combos (automatic)
The system builds combo photos from the single-colour photos, so **every colour must be shot the same way**. The **upload rule** to show the owner:
- Front view, flat-lay or ghost mannequin, plain light background (one fixed colour, e.g. #EEECE8).
- Garment centred, filling about 80% of the width, 1200 × 1500 px (4:5), the same fold and light for every colour.
- The system cuts out the background once at upload (stored as a transparent PNG) to make the composites.

Composites the system makes:

| Where | Layout | Why |
|---|---|---|
| **Pair card** (174 × 218 px, 4:5) | **Staggered overlap**: colour A top-left at 66% width, colour B bottom-right at 66% width, B in front with a soft shadow, both collars visible. | Each garment shows at about 115 px wide. Split halves would only give about 85 px. The Othoba seller photo overlaps shirts for the same reason. |
| **Triple card** | **Fan of 3**, each at about 55% width, stepped left to right. | Three halves would be too thin (58 px each). |
| **Pair page hero** (393 wide, about 300 px tall) | **Side-by-side halves**, each 50%, a 4 px gap, and a colour name chip at the bottom of each half ("Black", "Navy"). | At full width each half is about 196 px, which is clear. The name chips help shoppers who can't tell navy from black. |
| **Triple page hero** | One large on the left (60%), two stacked on the right (40%). | Keeps all 3 large enough. |
| **Gallery after the hero** | Each colour alone (front, back, fabric close-up), a daylight photo for dark colours, one on-model photo with "Model 5'9", wears L". | Answers "what does it look like on me". |

- **Never bake text into photos** ("2PCS COMBO", "37% OFF" as on Othoba). Use HTML badges: "2 pcs" bottom-left and "Save ৳400" top-left. They are crisp, translatable, and update when the price changes.
- When the owner adds a colour, its photo standard is checked at upload ("Background doesn't match. Combo photos may look uneven.").

### 4.6 Size picking on a pair
- **Default:** one row **"Size for both"**: S M L XL XXL 3XL. At 393 px that is 6 buttons of about 53 px with 8 px gaps (≥ 44 px tap target), on one row.
- A link under it: **"Different size for each?"**. Tapped, it opens two rows labelled with the colour dot + name ("● Black: …", "● Navy: …"), both pre-filled with the size already chosen.
- **A size counts as available for the pair only if both colours have it** (with "same colour twice": stock ≥ 2).
- **Greyed size with a reason:** a line under the row says "3XL: Navy sold out". Tapping the greyed 3XL opens a small sheet: "Navy 3XL is sold out. • See pairs in stock in 3XL • Choose a different size for Navy". There are no dead ends.
- **Low stock:** "Only 2 left in L" under the row once L is chosen (taken from the lower of the two colours).
- **Saved size:** if the shopper used "Find my size" or bought before, pre-select it and say "Your size: L (change)".
- Grid page: a **"My size" chip** at the top hides pairs not available in that size, and is remembered for the visit.

### 4.7 The 3-piece upsell (never 1 piece)
- On the pair page, under the size: a tickable card. **"Make it 3 pcs — add 1 more for ৳750 → ৳2,550 total (৳850 each, save ৳750)"**. Default is unticked.
- Ticked, it shows the remaining 4 colours as swatches with names. The size copies "Size for both". The hero becomes the triple layout, and the button changes to **"Add all 3 to bag · ৳2,550"**. The order is saved as the matching generated triple combo, so it gets the same price and the same link.
- In the bag: the same offer as one line inside the set card (template B3).
- Per-piece price ("৳900 each → ৳850 each") is the simplest way to show why 3 is better.
- **No single piece**: with the section tick on, single products are hidden from the style's combo page. The pair page has no "buy 1" link. The *single* product page elsewhere can carry a small link "Also as a combo: 2 for ৳1,800 →".

### 4.8 What happens when stock changes
| Event | What the shopper sees | What the owner sees |
|---|---|---|
| New colour added to the style | New pairs/triples appear in the grid at their sorted place, with a "New colour" tag for 14 days. | "Olive added → 5 new combos made" with thumbnails. One tap to hide any. |
| A colour sold out in one size | That size is greyed on pairs with that colour, with a reason line. The card's size line updates ("S–XL"). | Nothing to do. |
| A colour sold out in all sizes | Its pairs are hidden from the grid. Their links stay alive: an ad click lands on "This combo is sold out right now" plus a grid of in-stock pairs in the shopper's size. | "Navy sold out → 5 combos hidden". They come back automatically on restock. |
| Price changed on the rule | All pair cards and pages update. A bag that already holds the pair re-prices with a note (r16 already does this). | Live preview before saving. |

### 4.9 The admin rule for a non-technical owner
One screen, top to bottom, plain words, live preview. Lead translates. Sketch:

```
COMBO MAKER — "Solid Polo combos"                       [ On ●  ]

1. What goes in?
   ( ) A whole category      [ Polo ▾ ]
   (●) A sub-category        [ Polo › Ralph Lauren › Solid Polo ▾ ]
   ( ) Products I pick       [ + Pick products ]
   Pairs are made inside one style only.  [✓]

2. How many pieces?
   [✓] 2 pieces   price for 2:  ৳ [1,800]   (regular 2 pcs ৳2,200 → save ৳400)
   [✓] 3 pieces   price for 3:  ৳ [2,550]   (regular 3 pcs ৳3,300 → save ৳750)
   ⚠ Can't be more than the regular price. (blocks Save)

3. Colours
   ● Black ● Navy ● White ● Olive ● Yellow ● Grey   ← tap to leave one out
   [ ] Allow the same colour twice (Black + Black)

4. Where it shows
   [✓] Make a combo page for this sub-category   link: extas.com.bd/combo/solid-polo
   [✓] No single piece on this page
   [✓] Show "Also as a combo" on the single product page

PREVIEW: 15 two-piece combos · 20 three-piece combos will be made
[ card ][ card ][ card ][ card ] … (scrolls)   Pin to top: drag a card

[ Save and switch on ]
```

- The price is entered **in taka per pack**, not as a %, because the owner thinks in "2 pcs ৳1,800".
- Guard: the pack price must be below the regular total (fixes audit finding 5 at the source).
- One "On" switch per rule, plus a list page of all rules with on/off toggles. Bindings stay live: new products uploaded into the bound sub-category join automatically.
- If the bound products have different prices (a whole category), either refuse ("Products have different prices — pick one style, or set a price per style") or make pairs per style only. Default: per style.

---

## 5. Photos of a set (all set types)

| Set type | Hero (first photo) | Then | When colours are picked |
|---|---|---|---|
| Generated colour pair / triple | Side-by-side halves (pair) or 1 + 2 (triple), with colour chips | Each colour alone, daylight photo, one on-model | Each pair has its own page, so the photo is fixed |
| Pick-N builder (P2) | Halves, empty slot shows a dashed outline "Pick colour 2" | Same as above | Swap **only the half that changed**, 150 ms fade, item 1 always left. A screen reader announces "Picture shows Black and Navy". |
| Top + bottom (tracksuit, hoodie set, polo + chino) | **Model wearing the full set** | Flat-lay: top above bottom (fits 4:5 naturally), then each piece alone | If the set colour changes, swap the whole set photo (the set colour is one choice) |
| Mixed 3-item (jacket + hoodie + tee) | Model wearing it, or a flat-lay of all 3 in a 1 + 2 layout | Each item alone | Per-item thumbnail next to each picker updates. The hero updates only if composites exist. |
| Fixed colour pack (H&M style) | All pieces fanned | Each piece alone | The pack swatch swaps the whole photo |

Phone rules (judgement):
- Hero height about **300 px on 393 wide**, so the price and sizes still fit on screen 1. In r16 the hero + "Item 1 · Navy / Item 2 · White" chips take about 370 px.
- No auto-moving carousel. Use dots + swipe with a "1/5" counter.
- Thumbnails rail: drop it on phones. Swipe is enough, and a rail costs about 70 px.
- Remove the demo note "[ demo set image · updates with your colours ]" in production.

---

## 6. Combo category (list) pages

### 6.1 What every set card must show (top to bottom, in a 174 × about 330 px card)
1. Composite photo, 4:5. Badges: **"Save ৳400"** top-left (red), **"2 pcs"** bottom-left (dark).
2. Title, 1–2 lines: colours for pairs ("Black + Navy"), set name for others ("Navy Tracksuit").
3. Small grey line: style + pieces ("Solid Polo · 2 pcs") or contents ("Hoodie + Jogger").
4. Price row: **৳1,800** bold + ~~৳2,200~~ grey. On a style-group card: "৳1,800 for 2".
5. Sizes line: "S–3XL" if all are in stock, otherwise the list ("M · L · XL left"). With "My size" on: "✓ L in stock".
6. Colour dots: the 2–3 dots of this pair, or on a style card the 5–6 dots + "Pick any 2".

No "Add" button on the card (sizes are needed). The whole card is one tap target.

### 6.2 Filters and sorting
- **Quick chips row** (always visible, scrolls sideways): `Winter` `Summer` · `2 pcs` `3 pcs` `Top + bottom` · `My size ▾` · `Colour ▾`.
- **Full filter sheet** (bottom sheet): Season · Item type (Polo, T-shirt, Shirt, Hoodie, Sweatshirt, Jacket, Tracksuit, Jogger, Sweater) · Pack (2 pcs, 3 pcs, Top + bottom) · Price (Under ৳1,500 / ৳1,500–2,500 / ৳2,500+) · Has colour · My size (in stock for **every** piece).
- **Sort:** Best selling (default) · Biggest saving (৳) · Price low → high · New. On a generated-pair page, drop the price sorts (all pairs cost the same).

### 6.3 Five list templates

**L1 — Generated pair grid** (the owner's promoted sub-category page; e.g. `/combo/solid-polo`)
- For: one style's auto pairs/triples. This is the page Facebook ads point at.
- First screen at 393 × 852:
  - Header (88 px).
  - Offer strip (about 64 px): **"Solid Polo combos · any 2 for ৳1,800"** / "2 pcs regular ৳2,200 · Save ৳400 · Free delivery · Pay on delivery".
  - Tier switch if both exist: `[ 2 pcs ৳1,800 ] [ 3 pcs ৳2,550 ]` (40 px), which swaps the whole grid between pairs and triples.
  - Colour row: "Has: ● Black ● Navy ● White …" with names (40 px).
  - `My size ▾` chip.
  - Grid starts at about y 300, so the first 2 cards are fully visible and the next 2 half visible.
- Cards are lighter than 6.1 because the price is the same for all: photo, "Black + Navy", sizes line. The price is shown only on the strip plus a small "৳1,800" per card.
- Slot 1 (when there are more than 15 combos) or the last slot: a builder card "Pick your own 2 colours →" (opens P2).
- No single products on this page (owner's tick).
- Pros: matches the owner's proven model; 1 tap to a ready pair; each pair has an ad link. Cons: near-identical cards; it needs the colour filter row and the photo standard.

**L2 — Style-group cards** (Polo category, home rails, search)
- For: showing that combos exist without flooding (the Baymard fix).
- One card per combo rule: photo of the top pair, **"Solid Polo combo"**, "15 colour pairs · pick any", 6 colour dots, "৳1,800 for 2 · Save ৳400". Tapping opens L1.
- Pros: clean mixed lists. Cons: one extra tap to reach a pair.

**L3 — Combo hub** (`/combos`, the menu item "Combos")
- For: the main combo section, holding every set type.
- First screen: season tabs `Winter | Summer` (auto-select by month), then rails, each with a title + "See all":
  - "2-piece packs" (L2 cards: Solid Polo, Basic Tee …)
  - "3-piece packs"
  - "Top + bottom sets" (Tracksuits, Hoodie sets, Polo + Chino)
  - "Build your own" (one card).
- Pros: one link for everything, seasonal. Cons: rails hide items off-screen, so keep each to ≤ 8 and always add "See all".

**L4 — Big single-column list** (ad landing for a few sets, lower-literacy shoppers)
- For: 3–6 combos pushed by one campaign, and shoppers who read slowly.
- One card per row, 361 px wide:
  - photo 361 × 300
  - colours in big text
  - price row "2 pcs ~~৳2,200~~ → **৳1,800** · Save ৳400"
  - a size row right on the card (S–3XL)
  - a button **"Add both to bag · ৳1,800"**, active once a size is tapped.
- Pros: can be 2 taps from the ad to the bag; no page change. Cons: long scroll; only works for one-size-for-all sets.

**L5 — Tier-first list** (when every set offers 2 and 3 pieces)
- For: summer packs ("2 or 3 T-shirts").
- A big segmented control at the top: `2 pcs · ৳950` / `3 pcs · ৳1,350 (best value)` sets every card's price and photo (pair or triple).
- Pros: makes the 3-pack upsell the first decision. Cons: confusing if some sets have only one tier. Hide the control then.

---

## 7. Combo product pages

Budget for screen 1 (393 × 852): about 88 px header + 80 px sticky bar leaves **about 684 px**.

### P1 — Generated pair page (owner's model) ★ recommended for same-product 2/3-packs
- **Fits:** auto-generated colour pairs and triples (polos, tees, sweaters, boxers, caps).
- **Screen 1:**

| Block | Height |
|---|---|
| Hero halves with colour chips | 300 |
| Small label "Solid Polo · 2-piece combo" + H1 "Black + Navy" | 60 |
| Price line "2 pcs ~~৳2,200~~ → **৳1,800** · **Save ৳400**" | 40 |
| "Size for both" + 6 buttons | 84 |
| "Different size for each?" link | 24 |
| "Pay ৳1,800 when it arrives · Free delivery · Size swap 72 h" (one line, icons) | 28 |
| **Total** | **536 ✓** |

- **Below:**
  - The 3-pc upsell card (4.7).
  - "Other pairs in Solid Polo": a sideways strip of small pair thumbnails, current one ringed, sold-out pairs hidden.
  - The gallery of each colour.
  - Size chart (opens in place; one chart shared by both pieces).
  - Rules (exchange: "Swap a size in your combo — you pay only the delivery charge"), reviews, WhatsApp "Ask about this combo (Black + Navy, L/L)".
- **Sticky bar:** left "৳1,800 · Save ৳400" on one line (nowrap); right button.
  - Before a size: **"Choose a size"** (tapping scrolls to the row and pulses it).
  - After: **"Add both to bag · ৳1,800"**.
  - Secondary "Order now" sits in the page under the size row, not in the bar, to keep the bar 72–80 px.
- **Taps to bag (guest):** 2 (size, add). With a saved size: 1.
- **Pros:** the fewest taps; proven by the owner; one link per pair for ads. **Cons:** needs the photo standard; many pages.

### P2 — Pick-your-colours pack page
- **Fits:** the "Build your own pair" fallback from L1, styles with 7+ colours, a single "Polo Duo" landing page, and the existing "Any 2 polos ৳1,500" rule when it is limited to one style.
- **Screen 1:**
  - hero halves showing the current picks (240 px)
  - tier cards (Kaching style, 2 radio cards side by side, 64 px): `● 2 pcs ৳1,800 · Save ৳400` / `○ 3 pcs ৳2,550 · Save ৳750`
  - **"Pick 2 colours"**: 6 swatches, 52 px circles with names under them, 3 per row (2 rows, 150 px). A tapped swatch gets a numbered badge (1, 2), and tapping again removes it. Picking a third when 2 are chosen replaces the oldest, with the note "Changed: Navy → Olive".
  - "Size for both" (84 px).
  - Total ≈ 600 ✓.
- **Sticky bar:** "Pick 1 more colour" → "Choose a size" → "Add both to bag · ৳1,800".
- **Taps:** 3–4 (colour, colour, size, add).
- **Pros:** one page instead of 15; no grid overload. **Cons:** one more decision for the shopper; no per-pair ad links (use `?colors=black,navy` links to pre-fill).

### P3 — Top + bottom set page ★ recommended for tracksuits, hoodie sets, polo + chino
- **Fits:** two different pieces worn together, usually one matching colourway.
- **Screen 1:**

| Block | Height |
|---|---|
| Hero: model wearing the set | 300 |
| H1 "Navy Tracksuit" + small "Zip top + jogger · set of 2" | 56 |
| Price "2 pcs ~~৳3,400~~ → **৳2,800** · Save ৳600" | 40 |
| Set colour: swatches, each a whole set colourway, with names | 56 |
| "Top size" buttons S–3XL | 70 |
| "Bottom size" buttons S–3XL, or waist 30–36 for chinos | 70 |
| **Total** | **592 ✓** |

- When top and bottom share a size scale, picking a top size **pre-fills the bottom** with the same size and a small note "Same as top — change if needed". With a waist scale, the bottom is suggested from the size finder.
- "Mix colours" (top Black, bottom Grey) is an admin option, off by default. When on, a link "Mix colours?" opens a colour row per piece.
- **Sticky:** "Choose top size" → "Choose bottom size" → **"Add both to bag · ৳2,800"**.
- **Taps:** 2 with the same-size pre-fill (top size + add), 3 if the bottom is changed.
- **Pros:** the model photo sells the look; very few taps. **Cons:** needs on-model photos per colourway.

### P4 — Mixed 3-item set page
- **Fits:** jacket + hoodie + tee, the Office Trio (shirt + chino + polo), any 3 different products.
- **Screen 1:**
  - hero 1 + 2 layout (260 px)
  - H1 + contents line (56 px)
  - price line (40 px)
  - **three compact piece rows** right after, each:
    - 56 px thumbnail + name ("Oxford shirt")
    - colour swatches inline (32 px with names under them)
    - size buttons
- After a piece is complete it **folds to one line**: "✓ Oxford shirt · Sky Blue · L — Change". Not a wizard: all three are visible at once, and the next open piece scrolls into view.
- "Same size for all tops?" tick when 2+ pieces share a size scale (shirt + polo). The chino keeps its waist row.
- **Sticky:** "Choose 3 sizes" → "Choose 2 more sizes" → "Choose 1 more size" → **"Add all 3 to bag · ৳3,100"**.
- **Taps:** 4 (3 sizes + add; colours default to the first in stock), 3 with the "same size for tops" tick.
- **Pros:** handles any mix. **Cons:** longest page. Piece 3 sizes land on screen 2 (accepted), but the sticky bar always says what is missing.

### P5 — Fixed-colour pack page (H&M / Othoba style)
- **Fits:** packs where the owner chooses the colours: sweater packs, boxer 3-packs, sock packs, winter "jacket + hoodie" when sold as one colour story.
- **Screen 1:**
  - hero fan of all pieces (300 px)
  - H1 "Winter Sweater Pack — Black, Grey, Maroon" + "3 pcs" (60 px)
  - price (40 px)
  - "Pack colours": swatches where **each swatch is a split dot showing the pack's colours**, with a name under each ("Dark pack", "Earth pack") (64 px)
  - **"Size for all 3"** buttons (84 px)
- **Sticky:** "Choose a size" → **"Add all 3 to bag · ৳2,400"**.
- **Taps:** 2.
- **Pros:** the simplest page; stock is easy (one SKU per pack per size). **Cons:** no colour freedom.

### Which template for which product
| Product | Template |
|---|---|
| 2 or 3 polos / T-shirts, any colours from one style | **P1** (grid L1), with P2 as the fallback |
| Polo/T-shirt style with 7+ colours | **P2** |
| Tracksuit, hoodie set, top-bottom set, polo + chino, katua + pajama | **P3** |
| Jacket + hoodie (different products), Office Trio, mixed 3 | **P4** (or P3 if 2 pieces) |
| Sweater packs, boxer/sock packs, packs the owner pre-matches | **P5** |
| Any 2 polos across styles (existing "Build your own set") | Keep `#/set`, but rename the item button (below) |

### The one CTA wording (owner's worry)
- **Main button: "Add both to bag · ৳1,800"** / **"Add all 3 to bag · ৳2,550"**. Bengali suggestion: "দুটোই ব্যাগে নিন · ৳১,৮০০" / "তিনটাই ব্যাগে নিন · ৳২,৫৫০".
  - "bag" is the same word as on every other product. "both / all 3" says the shopper gets the whole set. The price says what they pay.
- **Before ready:** the button says the missing step ("Choose a size", "Pick 1 more colour"). It is not greyed out. Tapping it scrolls to the missing spot with inline red text.
- **Secondary:** "Order now — pay on delivery" (goes straight to checkout with the set).
- **In Build-your-own (`#/set`)**, the per-item button "Add to set" becomes **"Pick"**, and the picked state is **"✓ Picked"** (Bengali "নিন" / "✓ নেওয়া হয়েছে"). The bottom button is again "Add both to bag" / "Add all 3 to bag". The words "set" and "combo" appear only in names and labels, never on buttons.

---

## 8. Combo in the bag

Rules for every template: **one price per set**. The children list colours and sizes. The summary rows add up to the total. The save is shown once per set and once in total.

**B1 — Grouped card, read-only children** (what r16 does now, keep as the base)
```
[pair photo]  Solid Polo combo · 2 pcs          ৳1,800
              ● Black · L    ● Navy · L        ~~৳2,200~~
              Save ৳400
              Change size or colour  ·  Remove
```
"Change" opens the pair page **pre-filled with these choices** (r16 does this, fixing audit finding 12).

**B2 — Grouped card with size editable in the bag** ★ recommended default
Like B1, but each child row has small size buttons or a size dropdown ("● Black [L ▾]"), as the Kaching cart drawer does. Changing the size re-checks stock at once ("Only 1 left in Navy L" in the row). Colour changes still go through "Change pair" (a colour change means a different combo page).
Pros: fixes the most common mistake (wrong size) without leaving the bag. Cons: more UI in the bag; keep it to size only.

**B3 — Grouped card + next-tier nudge inside it** ★ use together with B2 for generated pairs
Under the children: **"Add 1 more polo → 3 for ৳2,550 · ৳850 each (save ৳350 more)"**. Tapping opens a bottom sheet with the other colours + "Size: L (same)", then "Add to this combo". The card becomes "3 pcs ৳2,550".
Show it only if a 3-pc tier exists and isn't already reached. Never next to a set already at the top tier.

**B4 — Split lines with a set tag** (Souled Store style). **Use for the order record and invoice, not the bag view.**
Each piece is its own line at its **real price** (৳1,100 + ৳1,100), then one line "Solid Polo combo discount −৳400". This is the honest accounting that fixes audit findings 1 and 8 (exchanges, invoices). Shown to shoppers, it is busier and reads like extra charges, so keep B1/B2 in the bag and B4 behind "See price details".

**B5 — Compact one-line set** (bags with 3+ sets, small phones 320–360)
"Solid Polo combo · Black + Navy · L / L · ৳1,800 ▸". Tap ▸ to expand to B2. Pros: short bag. Cons: hides details, so only use it after 3 lines.

**Bag summary (all templates):**
```
Solid Polo combo (2 pcs)     ৳1,800
   ৳2,200 separately · you save ৳400
Delivery                      FREE
Total                        ৳1,800
You save ৳400 · Pay when it arrives
```

**What NOT to do in the bag**
- Do not show the set at ৳1,800 *and* a "Subtotal ৳2,200" *and* a "−৳400" row (the double-discount look, audit 7). r16 fixed this: the subtotal now equals ৳1,500.
- Do not split the set price evenly per piece (৳1,033 × 3, audit 8). Store real piece prices + one discount line (B4) behind the scenes.
- Do not put a member % on top of a set price silently (audit 6). r16 now picks the better of the two, with a note. Keep that.
- **Do not re-advertise a set that is already in the bag.** Still happening in r16: with Polo Duo in the bag, the "Goes well with your bag" rail shows "Polo Duo · Take both for ৳1,500 · save ৳200" (seen 19 Oct). The offer box was fixed (finding 10), but this rail was not.
- No fake timers ("cart expires in 09:57", seen in the Kaching demo) and no "ships today" without a real cutoff (audit 13).
- No quantity stepper on a set line (a "2" next to a pair is ambiguous: 2 pieces or 2 sets?). Offer "Add another combo" instead.

---

## 9. Checkout: does a set need anything special?

**Yes, but only an honest summary.** No new steps, and no upsell at checkout.
- The order summary uses the same one-line-per-set format as the bag. Children (colour · size) are in small text, so the shopper checks sizes before confirming COD. This is the moment a cautious COD buyer re-reads everything.
- The totals equal the bag exactly. "Pay ৳1,800 to the rider" sits above the place-order button.
- The order record, SMS/WhatsApp confirmation and invoice list each piece with colour and size. The record stores real piece prices + one combo discount line (B4), so exchanges charge only the delivery fee for a size swap (fixes audit 1).
- Stock is re-checked for every piece of every set when the order is placed (audit 3). If one piece ran out: "Navy L just sold out — choose another size for Navy" inline. The set is never dropped silently.
- If the owner later edits the combo price, the checkout uses the bag's re-priced value with the note r16 already shows.

---

## 10. Test plan

### 10.1 What to test (matrix)
**Set types (7):**
- T1 generated pair, same style
- T2 generated triple
- T3 pick-your-colours (P2)
- T4 top + bottom, same size scale (tracksuit S–3XL)
- T5 top + bottom, mixed scale (polo S–3XL + chino 30–36)
- T6 mixed 3-item
- T7 fixed-colour pack
- plus Build-your-own `#/set`

**Colours:** 5 colours (10 pairs / 10 triples) and 6 colours (15 / 20). Plus the edge cases 2 colours (1 pair) and 7 colours (21 / 35, switch to builder).

**Sizes:** S M L XL XXL 3XL. **Stock states:**
- (a) all in stock
- (b) one colour missing one size (e.g. Navy 3XL = 0)
- (c) one colour has 1 left in L (two shoppers / two adds)
- (d) one colour sold out in all sizes (pairs hidden, ad link lands on the fallback)
- (e) "same colour twice" on, with stock 1
- (f) a colour added while a bag holds a pair

**Phones:** 320 × 568, 360 × 800, 375 × 667 (short), 393 × 852, 412 × 915, 430 × 932, 440 × 956; desktop 1280 × 800.

**Other axes:** English / Bengali; guest / saved size / VIP (offer conflict); text zoom 200%.

Full cross = 7 × 2 × 6 × 8 × 2 × 3 ≈ 4,000 runs. Use **pairwise** (every pair of values at least once), about 60 runs, plus all of (b)–(f) at 360 and 393 for every set type.

**Flows for each run:** card → page → pick → bag → change size in the bag → add the 3rd piece (where offered) → checkout → order record. Check that the numbers match at each step.

### 10.2 How to score templates (100 points, objective)

| Measure (how to measure) | Points | Full marks when |
|---|---|---|
| **Taps to bag**, guest with no saved size (count with Playwright) | 20 | Pair / fixed pack ≤ 2, top + bottom ≤ 3, mixed 3 ≤ 4. −5 per extra tap |
| **First-screen completeness** at 393 × 852 *and* 360 × 800: photo, name, price + save, all size rows (or the first), working button. Each element's bottom edge is above the sticky bar top. | 20 | All 5 on both phones (4 points each) |
| **Errors possible**: count the ways to reach an error state (Add with a missing size, sold-out combination picked, stock clash) and whether each is inline + scrolled to | 15 | No toasts, every error inline next to its control, sold-out options greyed with a reason |
| **Price clarity**: number of places the set price appears on the page (target 2: page + sticky). One save number in ৳. A 5-second test with 5 shoppers: "How much do you pay? How much do you save?" | 15 | Count = 2, ≥ 4 of 5 shoppers answer both right |
| **Text length**: words above the fold (target ≤ 40); title lines at 360 (≤ 2); button label ≤ 4 words + price | 10 | All three met |
| **Accessibility**: tap targets ≥ 44 × 44 px; contrast ≥ 4.5:1; colour names in text; buttons have `aria-pressed`; works at 200% text with no horizontal scroll at 320 | 10 | All pass |
| **Layout health**: no horizontal scroll at 320; sticky bar ≤ 80 px at 360 with prices on one line; Bengali fits | 5 | All pass |
| **Bag honesty**: summary rows add up to the total; no set re-advertised; size editable or 1-tap change | 5 | All pass |

Run the objective parts with one Playwright script per template (taps, y-positions, word counts, overflow, contrast). Do the 5-second test and a 5-person tap test with real Facebook-audience shoppers (phone in hand, Bengali UI). Rank by total. Any template that scores 0 on "errors possible" or "bag honesty" is out, whatever its total.

---

## 11. Notes on the current demo (r16), 19 Oct

- Polo Duo / Office Trio / Polo + Chino: first size button at **y ≈ 1,128 / 1,109 / 1,128 px** at 393 × 852. Page heights are 4,016 / 4,122 / 3,782 px. Rule 1 is still not met. The "Popular pairs" block (6 chips) and the large price box sit above the pickers.
- The set name and price box still show "SET PRICE ৳1,500 · Separately ৳1,700 · You save ৳200 (12%)" + the sticky bar. With "Popular pairs" and the price box removed from above the pickers, P1 fits.
- Bag: the set line and summary are now honest ("Polo Duo set ৳1,500 · ৳1,700 separately · you save ৳200 · Subtotal (2) ৳1,500"). But the "Goes well with your bag" rail re-offers Polo Duo (section 8).
- `#/set` buttons still say "Add to set" on every polo card. Change to "Pick" / "✓ Picked" (section 7).
- The data model (`DB.combos` with fixed `items`) can't express "every colour pair of a style". The owner's model needs a **combo rule** record (binding, pieces 2/3, pack prices, excluded colours, same-colour flag, no-single flag, on/off). The pairs are generated from it, not typed in.

---

## Sources (all accessed 19 Oct 2026)
- Othoba: https://othoba.com/ts/search/combo%20polo?t=t&q=combo%20polo · https://othoba.com/smug-premium-combo-offer-polo-shirt-black-white-2-pis-combo-smug-580009 · https://othoba.com/stylish-3-pcs-polo-shirt-combo
- Fabrilife: https://fabrilife.com/product/72220-premium-antibacterial-sports-socks-combo-raven-antha-melangeplaymaker-antha-melange
- Yellow: https://www.yellowclothing.net/search?q=combo · Ecstasy: https://ecstasybd.com/ · Sailor: https://www.sailor.clothing/
- Daraz PK bundles: https://www.daraz.pk/bundles-for-everyone
- The Souled Store: https://www.thesouledstore.com/search?q=combo · https://www.thesouledstore.com/product/boardroom-set-men-combo?get=4
- Bewakoof: https://www.bewakoof.com/combos · https://www.bewakoof.com/men-t-shirts · https://www.bewakoof.com/p/unisex-mellow-mauve-plain-t-shirt
- H&M 3-pack: https://www2.hm.com/en_in/productpage.0890930024.html · https://www.nykaaman.com/h-m-men-brown-3-pack-regular-fit-t-shirts/p/26998562
- Kaching: https://apps.shopify.com/bundle-deals (+ its demo store) · Fast Bundle: https://apps.shopify.com/fast-bundle-product-bundles (+ demo.fastbundle.co) · Bundler: https://apps.shopify.com/bundler-product-bundles · Rebuy: https://apps.shopify.com/rebuy
- Amazon multipack imaging: https://sellercentral.amazon.com/gp/help/external/G94GSFMC79RSLDBY (via https://www.amalytix.com/en/glossary/multipack-imaging-standards/)
- Baymard: https://baymard.com/blog/combine-variations-one-list-item · https://baymard.com/blog/mobile-interactive-color-swatches · https://baymard.com/guidelines/850-non-color-variation-selectors · abandonment data via https://redstagfulfillment.com/percentage-of-online-shoppers-abandon-their-cart/
- NN/g: https://www.nngroup.com/videos/error-message-visibility/ · https://www.nngroup.com/articles/writing-for-lower-literacy-users/ (read via https://desis.osu.edu/seniorthesis/index.php/2021/01/25/lower-literacy-users-writing-for-a-broad-consumer-audience/)
- Discount framing: https://insidebe.com/articles/guide-to-discounting/ · Choice overload: https://www.psychologytoday.com/us/blog/pop-psych/201602/is-choice-overload-real-thing
- Sticky add-to-cart test: https://cleancommit.io/ab-tests/mobile-bottom-sticky-add-to-cart-button/
- BD payments/mobile: https://paymentscmi.com/insights/bangladesh-ecommerce-market-insights/
- Photo claims (unsourced, noted as such): https://www.photta.app/resources/flat-lay-vs-on-model
- Could not open: Myntra, Daraz BD, Amazon.in, hm.com, uniqlo.com, Snitch, Gentle Park.
