# Phone UI/UX review — owner's points

Demo: Version 8 · https://claude.ai/artifact/PyTHSfN7LM7oaaZ7FSiprk
Reference device: 440 × 956 CSS px
Started: 18 October 2026

**Rules for this file.** Every point the owner gives is written here the moment it arrives, numbered,
with its page. Nothing is answered or fixed until he says "all done". An item he calls "ঠিক আছে" is
**locked** — settled, not reopened. A 🔴 marks something genuinely broken rather than a matter of taste.

| # | Page | What he said | Status |
|---|---|---|---|
| 1 | Home | **"Shop now" and "Shop set" buttons don't match.** One has a background, the other doesn't. They should stay slightly different but be closer to each other — both with a button background. The plain white background on "Shop now" looks bad; make it transparent with the opacity reduced. Same size for "Shop set" too. | open |
| 2 | Home | **Remove the WhatsApp button from the home page entirely.** Alternative, if it can be done: use the WhatsApp *icon* we already have on the product page here instead. Check whether that works; if it does, use the icon. | open |
| 3 | Home | **Find Your Size section — icon and text are misaligned.** The text "Find Your Size Once" must start from the vertical middle of the icon's body, not above or below it. The line underneath must align to the **F** of the title, not to the icon. "We remember" starts correctly. Everything else in the section is fine. **Understand it before changing it — do not touch it otherwise.** | open |
| 4 | Home | **Flash Sale must show the struck-through original price beside the discounted one.** Flash sale means discounted by definition, so the crossed-out price belongs there. | open |
| 5 | Home | **Footer language switch (English / Bengali) is wrong at the very bottom.** The spacing box has grown too large and it looks crude. Make it smart and compact. | open |
| 6 | Search | **Search only finds products — it must find the shop's rules too.** "delivery" returns nothing; "COD" returns nothing; "exchange" returns "no result". Searching a rule should open the relevant article — delivery rules, terms and conditions, privacy policy, wherever it lives. | open |
| 7 | Home | **Add the desktop search bar to this section too** (given alongside point 6). | open |
| 8 | Category | **Question: what does the price filter actually do?** The band shows ৳800–1,200. Is that computed from the real lowest and highest price in that category, or is it a fixed figure? If we hold ৳850 lowest and ৳1,200 highest, is that what it is trying to show? He wants to know how it is covering the range. (Answer, then make it match.) | question |
| 9 | Category | **"Find My Size" opens the wrong thing.** Clicking it loads a specific product page, and the sizing opens from inside that product. It should open a **half-height window sliding up from the bottom**, with the Find My Size details in it, right where he is. The connection is wired wrong. | open 🔴 |
| 10 | Category | **The questions section must be specific to that category's product.** For polo: what the quality of our polos is like, which fabrications are used — if a polo category carries three or four fabrications, say so. Two or three real questions per category, the ones a buyer would actually ask or want to know, about that product. | open |
| 11 | Category (all) | **"Set price under" / "Regular fit" / "Relaxed fit" — the right-hand side is clipping.** Seen across every category, not one. | open 🔴 |
| 12 | Category | **Add a banner slot inside the category page**, after the first row or two of products, controlled from the dashboard. It carries offers — an offer running across the whole shop, or an offer specific to that one category. Also used for an occasion or a campaign banner. **Dynamic: banner set means it shows, nothing set means nothing shows.** The banner size and its fit must be standard across every device. | open |
| 13 | Product (PDP-1, Oxford Cotton Shirt) | **The photo slider is sluggish to drag.** It moves by hand, but the movement feels heavy. A touch should push it along easily. | open |
| 14 | Product | **The COD / bKash / Nagad / card line must be fully editable from the backend** — the text itself, and beside it: the **text size**, the **font**, a **highlight** option, and the **shimmer/light sweep** as an option, not fixed. All of it sitting together in that one section so he can change what he wants and leave the rest. | open |
| 15 | Product | **"Tap a size to see its measurement" is touching Add to Bag / Order Now.** Lift it 1–2 px. | open |
| 16 | Product | **The chest/length measurement line that appears after picking a size is also touching.** Lift it 1 px by taking from the large gap under the size box, and leave **at least 2 px below the text**. *He stressed this twice: important, do it carefully, it will not be noticed later if missed now.* | open |
| 17 | Product | **"Size · L" under the colours** — replace the dot with a **dash**, make "Size – L" **two sizes bigger**, and shift it **one space to the right** (two if one does not look right). | open |
| 18 | Product | **"Just your height and weight · 20 seconds" under Find My Size is far too small to read.** One size bigger, **without the box growing**. | open |
| 19 | Product | **"In stock · Ships today if you order before 5 PM" — make it bolder and one or two sizes bigger.** There is free width to the right, so it will fit. | open |
| 20 | Product | **Add a second question to the question block** — one covering the common questions about that related product, with every answer inside it. Keep the answer short and well written, not long. | open |
| 21 | Product | **The ৳80 / ৳120 / 72-hour text alignment is wrong.** The left edge lines up, but on the right one line runs the full width, another stops halfway, another overshoots. Align them properly, the way text is justified in Word. | open |
| 22 | Product (PDP-2, Classic Cotton Panjabi) | **The main image slider here is smooth — make every product's slider behave like this one.** The panjabi slides beautifully; the Oxford shirt (point 13) does not. This one is the standard. | open |
| 23 | Product (PDP-2) | **Question: why is there no thumbnail strip under the main image?** A colour has several angles; those angles only appear in the slide, with no small boxes beneath. **Explain why first.** If the explanation is good, leave it; if not, it gets discussed again. | question |
| 24 | Product (PDP-2) | **Question: why is there no add-on / upsell block on the panjabi page?** The polo product page has one, this does not. **Explain the reason first — do not implement anything yet.** He will decide after the explanation. | question |
| 25 | Product (all) | **The question-and-answer block must exist on every product**, with a set of common questions specific to that product and one well-written answer. (Same requirement as points 10 and 20, now stated as a rule for all products.) | open |
| 26 | Bag | **Fit four colour swatches in the "Add a 2nd polo" row, not three.** A sold-out colour needs **no "Sold out" label** — it stays exactly where it is, shaded and not clickable, as now. Do not widen the button just to carry that word. | open |
| 27 | Bag | **"Use ৳200" must be highlighted in a different colour.** At the moment the whole line — "Pick a colour in size L, use ৳200" — is one colour, so the offer does not stand out at all. | open |
| 28 | Bag | **With one product in the bag, the whole screen must fit down to Checkout** — or at least down to Total — without scrolling. **Must.** Scrolling then reveals the second checkout below. | open 🔴 |
| 29 | Bag | **In Order Summary, highlight the discount on the polo set price.** | open |
| 30 | Bag | **"Free" on the delivery line must catch the eye** — dress it up so the customer notices the delivery is free. | open |
| 31 | Bag / Checkout | **Question: where does the return-delivery-charge note belong?** The rule that a returned product still carries the delivery charge must be seen clearly **once** somewhere in the journey. It does not feel right on the product page. Is the checkout page the intended place? **He wants this discussed — it matters.** | question |
| 32 | Checkout | **The WhatsApp icon is wrong here.** Pin it hard to the right edge by width, and give it a **transparent background** instead of the white one — the white block looks wrong. | open |
| 33 | Checkout | **Question / his idea: show the struck-through regular price beside the total when a discount applied.** Two products at ৳3,000 regular, ৳2,800 after a ৳200 discount — show ৳3,000 crossed out below or beside ৳2,800. **He is not insisting** — he wants Claude's opinion on whether it spoils the space, or a mock-up to decide from. | question |
| 34 | Checkout | **Every label on the checkout form must be editable from the backend** — "Where should we deliver", Full name, Phone number, Full address, Delivery. He wants to write his own titles. | open |
| 35 | Checkout | **🔴 The delivery charge is decided far too early.** Typing just "Gabtoli" makes it Inside Dhaka immediately. **Dangerous** — when "Bogura" follows, the charge jumps and the customer takes it badly. **Detect no earlier than the second word.** A comma or a space after one word must not trigger it either. | open 🔴 |
| 36 | Checkout | **🔴 When delivery is already free, no delivery charge may be shown at all.** If the product carries free delivery, or the cart passed a free-delivery threshold (over ৳1,500 / ৳2,000), showing a charge is simply wrong. It must read **"Free home delivery"**. *He called this the single most important point of the checkout review.* | open 🔴 |
| 37 | Checkout | **Under the free-delivery line, show the return note:** if the product is received and then returned, the delivery charge applies and the return is made with that charge paid. (This is where point 31 lands.) | open |
| 38 | Checkout | **"Inside Dhaka — not placed the address automatically, which one is it?" wraps onto a second line.** Keep it to one line; rewrite it in simpler words if needed. **The language must stay easy — not everyone reads English.** | open |
| 39 | Checkout | **The payment section appears too late.** It only shows after about eight letters. It should appear **after one completed word** — type a word, press space, payment opens. A word of three characters or more counts; do not wait for eight letters. | open |
| 40 | Checkout | **Payment including mobile banking does not fit on one screen.** Better if the whole block fitted. *He added: if it is not possible, drop it.* | open |
| 41 | Checkout | **Question: why are many Dhaka locations still not detected?** Is that because the demo holds only part of the list and the real site will have them all? **Explain.** | question |
| 42 | Checkout | **🔴 "Add your address above" blocks the order and nobody understands why.** The confirm button stays disabled until the address is filled, with an English line explaining it. A village customer, or anyone who does not read English, simply cannot work out why the order will not go through. **His smarter version:** let him tap the button. Nothing happens — so **highlight the address box** and show the message **from inside it, in Bengali**: *"এখানে আপনার ঠিকানাটি লিখে অর্ডারটি নিশ্চিত করুন"*. Build **both** versions and put the switch in the dashboard; he will run one, then the other, and read the analytics to see which works. **The wider problem — a customer who is not expert and does not read English must never be stuck without knowing why — needs more thought from Claude.** | open 🔴 |
| 43 | Thank-you | **Highlight the order number** — it blends into the white. Nothing else on this page changes. | open |
| 44 | Account → My Orders | **"View" should open the tracking, shown as a picture rather than words.** On each order card, to the right of the middle of the product image, run a visual flow: a **tick** for confirmed · a **pick-up mark** when collected · **the courier's own logo** (Steadfast's, if it went by Steadfast) when it is with them · a **delivery mark** showing a customer receiving from a rider. *"It will be fun, interesting, and it will look good."* | open |
| 45 | Account | **The small items under Profile can be optimised** — look at whether they belong there or somewhere better. | open |
| 46 | Account → Profile | **Rename "Saved address" to "Delivery address"**, ordered: name, phone number, then delivery address. Add an **icon to add a second address** — many people have two. Then at checkout, for a logged-in customer: **two addresses → show both to choose from; one address → fill it in automatically.** | open |
| 47 | Account | **How does the customer get back to the home page from here?** Log out at the bottom is fine, but there is no way home. | open |
| 48 | Account | **A personalised offer banner inside the customer's own dashboard.** Work out from their history what they actually buy — polos, say — and show offers on that. The discount is fixed from the dashboard (15%, for instance) and applies to whatever offer runs; the products rotate, one then another, across the range. **If it can be done it must be properly optimised, not just added.** | open |

## Locked as approved — not to be reopened

| Page | What he approved |
|---|---|
| Home | The page overall, as a first impression |
| Home | The scrolling slideshow below |
| Home | Category section |
| Home | "New In" — good |
| Home | **The WhatsApp mark travelling up and down — he likes it** |
| Home | "Buy Together" and the way it slides — perfect |
| Home | "Find Your Size" — the "We remember" starting point, and everything except the alignment in point 3 |
| Home | Flash Sale, apart from the missing struck price |
| Home | "Shop the Look" |
| Home | "Our Customers" — very good |
| Home | "From the Journal" and Read Article |
| Home | Footer, apart from the language box |
| Home | Every click target works |
| Search | "Popular right now" on the search page |
| Menu | Three-dot menu opens correctly; search opens downward; New, Category, Track Order, login, delivery, exchange and return all go where they should |
| Category | The page overall; the filter opens and shows all its detail |
| Category | "Build Your Own Set" — good |
| Category | "Polo for Men in Bangladesh" heading block — good |
| Category | The questions section itself (only the content needs to become category-specific, point 10) |
| Category | Hoodie category checked — fine |
| Category | T-shirt category checked — fine apart from point 11 |
| Category | **Category page review finished — section 2 closed** |
| Product | The page overall; the shirt photos load and move |
| Product | Reviews, price |
| Product | Colour list, "All 3 colours", Choose your size, size chart |
| Product | **The one-screen fit he asked for — confirmed working** |
| Product | "All colours" click; **size chart opens perfectly — "outstanding"** |
| Product | Size clicks work. The dark sweep over a selected size is accepted for now, to be changed later from the backend |
| Product | **Find My Size opens properly from the bottom here — "very good"** |
| Product | The offer block |
| Product | Reviews section and everything below it |
| Product | **PDP review 1 of 3 finished — two or three more product pages still to review** |
| Product (PDP-2) | Everything else on the panjabi page — "all fine on every side" |
| Product (PDP-2) | Everything below the fold is fine |
| Product | **He believes fixing the points already given will settle the product page; nothing else outstanding there** |
| Add to bag | The slide-up window: Checkout, Keep shopping, View bag — the total is good |
| Add to bag | The free-delivery unlock line |
| Add to bag | **Cash on delivery block — "very beautiful, outstanding", he thanked us for it** |
| Add to bag | **The bag options overall — "very good"** |
| Bag | Single product: the product block, Save, Remove, "Add a 2nd polo" — all correct apart from points 26–28 |
| Bag | Two products: order summary shows one, scroll reveals the rest — correct, since the count grew |
| Bag | Three products, then four — behaves properly, "good, not bad, everything fine, every detail fine" |
| Bag | Everything else on the page |
| Bag | **The dummy WhatsApp numbers are expected** — the real number goes in from the backend later; the backend option for it will be there anyway |
| Bag | **Add to bag and the cart are both finished** |
| Checkout | Header, and "Need help" |
| Checkout | Order summary is highlighted; total price is highlighted — good |
| Checkout | Entering the phone number — fine up to that point |
| Checkout | **Typing "Banani" then "Bogura" detects correctly after a delay — he liked this** |
| Checkout | Everything else on the page |
| Checkout | **Checkout review finished for now** |
| Thank-you | Order number with the copy icon, Track your order, confirmation, cash on delivery |
| Thank-you | "Your account is ready", member price on your next order — **he liked the offer to join** |
| Thank-you | Complete your look; the delivery lines |
| Thank-you | Invoice print and download; "Need to change something"; the question block |
| Thank-you | **"The thank-you page came out the best of all. No problem. Thank you." No changes wanted.** |
| Account | Name block at the top; My Orders button |
| Account | "Members only — see all" → "For you"; rewards rather than discounts there |
| Account | Profile — "not bad" |
| Account | Order card: order number, placed date, status (confirmed / processing / delivery) — correct |
| Account | Profile opens: photo upload, name, phone, address, change password, size |
| Account | Tracking and operations on by default |
| Account | **Log out at the bottom is fine** |
| — | **PHONE REVIEW COMPLETE. Desktop review comes after the phone fixes are done.** |

## Owner's rulings on the agent audit — 18 Oct, final

| Agent finding | His ruling |
|---|---|
| Shimmer makes selling copy unreadable | **Approved Claude's fix** — the light passes *over* the text, text stays readable |
| Panjabi has no thumbnail strip (T2 template) | **Approved** — add thumbnails to T2 as well |
| Templates generally (2–3 per page type) | **Do as Claude suggests**; the backend can adjust them in production |
| Thank-you page prints the password | **Overruled, knowingly.** Leave it exactly as it is. The password is hidden, the line is not important, and it is not a serious matter. *"Don't take pain over it."* **Instead: fix the alignment** — "Log in with", the password, and the phone number must all sit on one alignment, in that order. |
| Checkout marketing consent pre-ticked | **Overruled, knowingly, as the owner.** The box stays **ticked by default — and so does every box like it, everywhere.** The customer unticks it if they want to. |
| Journal section is dead | **Link it up now.** He meant to say this last round and forgot. |
| Return note placement | **Not on checkout.** Thank-you page and My Account → Orders only. |
| Struck-through price at checkout | **Approved** — but show him a picture of it before it ships. Can come later. |

**Build instruction:** at most **three agents**, all of top quality. *"Don't give it to just anybody — someone
who fixes one tiger and designs two new tigers in the process. Only the really able ones, three at most."*
