# Customer 360° gate — FAIL

2026-11-01 19:10 (Asia/Dhaka) · https://new.extas.com.bd · by hand · ebef0ceda3b8 · scenarios: before, order, account, support, after

150 steps: 98 PASS, 20 FAIL, 32 SKIP. Every provider ran on its mock; the test customer is "GATE TEST customer 202611011910".

Each step says what was tried, how long it took, and why it failed or was skipped. A SKIP is never a pass: it names what is
missing (a product, a switch the owner keeps off, a part not built yet, or a real key).

Clean-up: cancelled 1, archived 1 order(s), 0 review(s), 0 back-in-stock request(s), the customer; nothing deleted

## Before ordering — 26 pass, 20 fail, 14 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| Lands from an ad link (UTM tags kept) | android-mid · en | PASS | 3390 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Opens in the facebook in-app browser | android-mid · en | PASS | 3354 ms | — |
| Searches (english: "polo") | android-mid · en | **FAIL** | 2296 ms | found nothing for "polo" while the shop has products ([picture](before-search-english-android-mid-en.jpg)) |
| Searches (bengali: "পোলো শার্ট") | android-mid · en | **FAIL** | 1397 ms | found nothing for "পোলো শার্ট" while the shop has products ([picture](before-search-bengali-android-mid-en.jpg)) |
| Searches (misspelt: "pollo shrit") | android-mid · en | **FAIL** | 1358 ms | found nothing for "pollo shrit" while the shop has products ([picture](before-search-misspelt-android-mid-en.jpg)) |
| Searches (banglish: "panjabi") | android-mid · en | PASS | 1635 ms | 0 result(s) |
| Opens a category and uses its filter | android-mid · en | **SKIP** | 2211 ms | the category opened has no products yet (the run's GATE TEST products are in no category), so no filter to use |
| Opens a product and its size guide | android-mid · en | PASS | 1662 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | android-mid · en | **SKIP** | 5 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |
| Lands from an ad link (UTM tags kept) | android-mid · bn | PASS | 3066 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Opens in the facebook in-app browser | android-mid · bn | PASS | 1206 ms | — |
| Searches (english: "polo") | android-mid · bn | **FAIL** | 1750 ms | found nothing for "polo" while the shop has products ([picture](before-search-english-android-mid-bn.jpg)) |
| Searches (bengali: "পোলো শার্ট") | android-mid · bn | **FAIL** | 1412 ms | found nothing for "পোলো শার্ট" while the shop has products ([picture](before-search-bengali-android-mid-bn.jpg)) |
| Searches (misspelt: "pollo shrit") | android-mid · bn | **FAIL** | 1488 ms | found nothing for "pollo shrit" while the shop has products ([picture](before-search-misspelt-android-mid-bn.jpg)) |
| Searches (banglish: "panjabi") | android-mid · bn | PASS | 1319 ms | 0 result(s) |
| Opens a category and uses its filter | android-mid · bn | **SKIP** | 1510 ms | the category opened has no products yet (the run's GATE TEST products are in no category), so no filter to use |
| Opens a product and its size guide | android-mid · bn | PASS | 1774 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | android-mid · bn | **SKIP** | 5 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |
| Saves to the wishlist | android-mid · bn | **FAIL** | 2123 ms | the heart was pressed but the wishlist is empty ([picture](before-wishlist-android-mid-bn.jpg)) |
| Puts a size in the bag | android-mid · bn | PASS | 1573 ms | 1 line(s) |
| Starts the checkout and leaves (what the shop keeps) | android-mid · bn | **SKIP** | 1645 ms | the page sent nothing to keep: the owner's follow-up switch (SIM-F-026) is off, so a customer who leaves is not followed up |
| Leaves without ordering and comes back (the bag waits) | android-mid · bn | PASS | 1386 ms | the bag still holds his line |
| Lands from an ad link (UTM tags kept) | iphone · en | PASS | 888 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Opens in the messenger in-app browser | iphone · en | PASS | 868 ms | — |
| Searches (english: "polo") | iphone · en | **FAIL** | 790 ms | found nothing for "polo" while the shop has products ([picture](before-search-english-iphone-en.jpg)) |
| Searches (bengali: "পোলো শার্ট") | iphone · en | **FAIL** | 721 ms | found nothing for "পোলো শার্ট" while the shop has products ([picture](before-search-bengali-iphone-en.jpg)) |
| Searches (misspelt: "pollo shrit") | iphone · en | **FAIL** | 742 ms | found nothing for "pollo shrit" while the shop has products ([picture](before-search-misspelt-iphone-en.jpg)) |
| Searches (banglish: "panjabi") | iphone · en | PASS | 706 ms | 0 result(s) |
| Opens a category and uses its filter | iphone · en | **SKIP** | 677 ms | the category opened has no products yet (the run's GATE TEST products are in no category), so no filter to use |
| Opens a product and its size guide | iphone · en | PASS | 743 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | iphone · en | **SKIP** | 4 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |
| Lands from an ad link (UTM tags kept) | iphone · bn | PASS | 1061 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Opens in the messenger in-app browser | iphone · bn | PASS | 1044 ms | — |
| Searches (english: "polo") | iphone · bn | **FAIL** | 2080 ms | found nothing for "polo" while the shop has products ([picture](before-search-english-iphone-bn.jpg)) |
| Searches (bengali: "পোলো শার্ট") | iphone · bn | **FAIL** | 1436 ms | found nothing for "পোলো শার্ট" while the shop has products ([picture](before-search-bengali-iphone-bn.jpg)) |
| Searches (misspelt: "pollo shrit") | iphone · bn | **FAIL** | 1363 ms | found nothing for "pollo shrit" while the shop has products ([picture](before-search-misspelt-iphone-bn.jpg)) |
| Searches (banglish: "panjabi") | iphone · bn | PASS | 1411 ms | 0 result(s) |
| Opens a category and uses its filter | iphone · bn | **SKIP** | 1597 ms | the category opened has no products yet (the run's GATE TEST products are in no category), so no filter to use |
| Opens a product and its size guide | iphone · bn | PASS | 1658 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | iphone · bn | **SKIP** | 4 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |
| Lands from an ad link (UTM tags kept) | desktop-1366 · en | PASS | 2390 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Searches (english: "polo") | desktop-1366 · en | **FAIL** | 801 ms | found nothing for "polo" while the shop has products ([picture](before-search-english-desktop-1366-en.jpg)) |
| Searches (bengali: "পোলো শার্ট") | desktop-1366 · en | **FAIL** | 663 ms | found nothing for "পোলো শার্ট" while the shop has products ([picture](before-search-bengali-desktop-1366-en.jpg)) |
| Searches (misspelt: "pollo shrit") | desktop-1366 · en | **FAIL** | 657 ms | found nothing for "pollo shrit" while the shop has products ([picture](before-search-misspelt-desktop-1366-en.jpg)) |
| Searches (banglish: "panjabi") | desktop-1366 · en | PASS | 680 ms | 0 result(s) |
| Opens a category and uses its filter | desktop-1366 · en | **SKIP** | 680 ms | the category opened has no products yet (the run's GATE TEST products are in no category), so no filter to use |
| Opens a product and its size guide | desktop-1366 · en | PASS | 807 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | desktop-1366 · en | **SKIP** | 5 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |
| Saves to the wishlist | desktop-1366 · en | **FAIL** | 675 ms | the heart was pressed but the wishlist is empty ([picture](before-wishlist-desktop-1366-en.jpg)) |
| Puts a size in the bag | desktop-1366 · en | PASS | 702 ms | 1 line(s) |
| Starts the checkout and leaves (what the shop keeps) | desktop-1366 · en | **SKIP** | 720 ms | the page sent nothing to keep: the owner's follow-up switch (SIM-F-026) is off, so a customer who leaves is not followed up |
| Leaves without ordering and comes back (the bag waits) | desktop-1366 · en | PASS | 1072 ms | the bag still holds his line |
| Lands from an ad link (UTM tags kept) | desktop-1366 · bn | PASS | 859 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Searches (english: "polo") | desktop-1366 · bn | **FAIL** | 744 ms | found nothing for "polo" while the shop has products ([picture](before-search-english-desktop-1366-bn.jpg)) |
| Searches (bengali: "পোলো শার্ট") | desktop-1366 · bn | **FAIL** | 679 ms | found nothing for "পোলো শার্ট" while the shop has products ([picture](before-search-bengali-desktop-1366-bn.jpg)) |
| Searches (misspelt: "pollo shrit") | desktop-1366 · bn | **FAIL** | 667 ms | found nothing for "pollo shrit" while the shop has products ([picture](before-search-misspelt-desktop-1366-bn.jpg)) |
| Searches (banglish: "panjabi") | desktop-1366 · bn | PASS | 651 ms | 0 result(s) |
| Opens a category and uses its filter | desktop-1366 · bn | **SKIP** | 633 ms | the category opened has no products yet (the run's GATE TEST products are in no category), so no filter to use |
| Opens a product and its size guide | desktop-1366 · bn | PASS | 723 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | desktop-1366 · bn | **SKIP** | 3 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |

## Ordering — 4 pass, 0 fail, 0 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| Places one order as a guest (cash on delivery, or the mock bKash while COD is off) | android-mid · bn | PASS | 527 ms | order 1021 (paid ahead on the mock bKash: COD is off (owner's setting)) |
| Sees the thank-you page with his order | android-mid · bn | PASS | 655 ms | — |
| The same phone signs in with the SMS code (mock) | android-mid · bn | PASS | 5671 ms | signed in; the page says the SMS is a practice one |
| The guest order shows in his account | android-mid · bn | PASS | 692 ms | — |

## The customer's account — 59 pass, 0 fail, 8 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| Opens /account | android-mid · en | PASS | 2147 ms | — |
| Opens /account/orders | android-mid · en | PASS | 1317 ms | — |
| Opens /account/foryou | android-mid · en | PASS | 1240 ms | — |
| Opens /account/rewards | android-mid · en | PASS | 1224 ms | — |
| Opens /account/wallet | android-mid · en | PASS | 1234 ms | — |
| Opens /account/wishlist | android-mid · en | PASS | 1437 ms | — |
| Opens /account/profile | android-mid · en | PASS | 1262 ms | — |
| Opens /account/orders/<order> | android-mid · en | PASS | 1462 ms | — |
| Opens /account/orders/<order>/invoice | android-mid · en | PASS | 1472 ms | — |
| Opens /account | android-mid · bn | PASS | 1095 ms | — |
| Opens /account/orders | android-mid · bn | PASS | 704 ms | — |
| Opens /account/foryou | android-mid · bn | PASS | 673 ms | — |
| Opens /account/rewards | android-mid · bn | PASS | 640 ms | — |
| Opens /account/wallet | android-mid · bn | PASS | 652 ms | — |
| Opens /account/wishlist | android-mid · bn | PASS | 707 ms | — |
| Opens /account/profile | android-mid · bn | PASS | 665 ms | — |
| Opens /account/orders/<order> | android-mid · bn | PASS | 720 ms | — |
| Opens /account/orders/<order>/invoice | android-mid · bn | PASS | 670 ms | — |
| Opens /account | iphone · en | PASS | 841 ms | — |
| Opens /account/orders | iphone · en | PASS | 738 ms | — |
| Opens /account/foryou | iphone · en | PASS | 663 ms | — |
| Opens /account/rewards | iphone · en | PASS | 667 ms | — |
| Opens /account/wallet | iphone · en | PASS | 728 ms | — |
| Opens /account/wishlist | iphone · en | PASS | 670 ms | — |
| Opens /account/profile | iphone · en | PASS | 680 ms | — |
| Opens /account/orders/<order> | iphone · en | PASS | 704 ms | — |
| Opens /account/orders/<order>/invoice | iphone · en | PASS | 705 ms | — |
| Opens /account | iphone · bn | PASS | 1415 ms | — |
| Opens /account/orders | iphone · bn | PASS | 1363 ms | — |
| Opens /account/foryou | iphone · bn | PASS | 1230 ms | — |
| Opens /account/rewards | iphone · bn | PASS | 1308 ms | — |
| Opens /account/wallet | iphone · bn | PASS | 1233 ms | — |
| Opens /account/wishlist | iphone · bn | PASS | 1408 ms | — |
| Opens /account/profile | iphone · bn | PASS | 1318 ms | — |
| Opens /account/orders/<order> | iphone · bn | PASS | 1461 ms | — |
| Opens /account/orders/<order>/invoice | iphone · bn | PASS | 1556 ms | — |
| Opens /account | desktop-1366 · en | PASS | 800 ms | — |
| Opens /account/orders | desktop-1366 · en | PASS | 2067 ms | — |
| Opens /account/foryou | desktop-1366 · en | PASS | 1888 ms | — |
| Opens /account/rewards | desktop-1366 · en | PASS | 1580 ms | — |
| Opens /account/wallet | desktop-1366 · en | PASS | 1575 ms | — |
| Opens /account/wishlist | desktop-1366 · en | PASS | 1628 ms | — |
| Opens /account/profile | desktop-1366 · en | PASS | 1370 ms | — |
| Opens /account/orders/<order> | desktop-1366 · en | PASS | 2622 ms | — |
| Opens /account/orders/<order>/invoice | desktop-1366 · en | PASS | 3706 ms | — |
| Opens /account | desktop-1366 · bn | PASS | 1317 ms | — |
| Opens /account/orders | desktop-1366 · bn | PASS | 777 ms | — |
| Opens /account/foryou | desktop-1366 · bn | PASS | 673 ms | — |
| Opens /account/rewards | desktop-1366 · bn | PASS | 663 ms | — |
| Opens /account/wallet | desktop-1366 · bn | PASS | 667 ms | — |
| Opens /account/wishlist | desktop-1366 · bn | PASS | 682 ms | — |
| Opens /account/profile | desktop-1366 · bn | PASS | 678 ms | — |
| Opens /account/orders/<order> | desktop-1366 · bn | PASS | 721 ms | — |
| Opens /account/orders/<order>/invoice | desktop-1366 · bn | PASS | 682 ms | — |
| Order detail: live status and tracking link | android-mid · bn | PASS | 1630 ms | status shown; no tracking link until a courier has the parcel |
| Downloads the invoice | android-mid · bn | PASS | 299 ms | text/html, 5 KB |
| Cancels within the window | android-mid · bn | PASS | 1717 ms | cancel offered (tap) |
| The order is moved to delivered on the mocks | android-mid · bn | **SKIP** | 4605 ms | moved to PACKED on the mocks (confirmed → pack); then no courier is set up yet, and booking is a staff action, so the steps that need a delivered order wait for a person |
| His page says delivered | android-mid · bn | **SKIP** | 0 ms | needs a delivered order: the gate cannot book the parcel (a staff action), so it is not delivered |
| Writes the review after delivery | android-mid · bn | **SKIP** | 0 ms | needs a delivered order: the gate cannot book the parcel (a staff action), so it is not delivered |
| Asks for a size exchange or a return | android-mid · bn | **SKIP** | 0 ms | needs a delivered order: the gate cannot book the parcel (a staff action), so it is not delivered |
| Orders the same again | android-mid · bn | **SKIP** | 1346 ms | no "order again" on his order yet: planned in PR 622 |
| Adds and edits an address, sets the default | android-mid · bn | **SKIP** | 1386 ms | add and edit work; no way to choose the default address: by design — proposal in the final analysis |
| Changes his name and his phone | android-mid · bn | **SKIP** | 4117 ms | the name changes; the phone is not changed from the account: by design — proposal in the final analysis |
| Turns SMS and WhatsApp offers on and off | android-mid · bn | PASS | 6071 ms | both saved and stored |
| Asks for his data or its erasure | android-mid · bn | **SKIP** | 1416 ms | his own request for his data or its erasure: planned in PR 623 (staff have the requests screen) |
| Signs out and signs in again | android-mid · bn | PASS | 10662 ms | — |

## Support — 4 pass, 0 fail, 7 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| Writes in the shop's chat | android-mid · bn | **SKIP** | 2 ms | off — the owner's switch (support.liveChat) |
| Finds the WhatsApp button | android-mid · bn | **SKIP** | 2 ms | the owner keeps the WhatsApp button off, or has not typed the number (shell.fab, contact.whatsapp) |
| Finds a Messenger button | android-mid · bn | **SKIP** | 1106 ms | no Messenger link on the shop yet: planned in PR 624 |
| Uses the contact form | android-mid · bn | **SKIP** | 795 ms | off — the owner's switch (pages.contactForm) |
| Opens the support inbox | desktop-1366 · en | PASS | 994 ms | — |
| Finds him by his number in any format (01…, +880…, Bengali digits) | desktop-1366 · en | PASS | 396 ms | every format finds him |
| Finds his conversation by his number in any format | desktop-1366 · en | **SKIP** | 60 ms | he has no conversation (the chat is off and no channel is connected): nothing to find; by reading the code, a number in Bengali digits is never searched as a number — packages/support/src/inbox.ts:85 strips non-ASCII digits (\D) before the phone search |
| Sees his orders, status and parcel beside the conversation | desktop-1366 · en | **SKIP** | 0 ms | no conversation to open; the order side panel is PR 428, not built yet (packages/support/src/inbox.ts:5) |
| Traces his order by his number (any format) and opens it | desktop-1366 · en | PASS | 1007 ms | found and opened; 6 history line(s) |
| Opens his customer page (orders and support tabs) | desktop-1366 · en | PASS | 1007 ms | — |
| Sends him a product card from the inbox | desktop-1366 · en | **SKIP** | 0 ms | no conversation; sending a product card from the inbox is not built yet (S22) |

## After ordering — 5 pass, 0 fail, 3 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| The admin sees the order at once | — | PASS | 77 ms | — |
| The order says which ad brought him | — | PASS | 4604 ms | facebook / paid_social / gate-test-c360 / META |
| Confirmation messages are planned (mock senders) | — | PASS | 4606 ms | SMS/placed: SENT; SMS/confirmed: SKIPPED (NO_LINK); WHATSAPP/packed: SKIPPED (NO_LINK) |
| The SMS message: right order, amount and language | — | PASS | 2 ms | 1 drawn: "EXTAS: আপনার অর্ডার 1021 পেয়েছি। ধন্যবাদ!" |
| The WhatsApp message: right order, amount and language | — | PASS | 0 ms | planned (SKIPPED); words drawn when sent |
| The e-mail message: right order, amount and language | — | **SKIP** | 0 ms | no EMAIL message for this order (the owner's journey does not use it, or no address for it) |
| A delivered order counts as a sale | — | **SKIP** | 0 ms | needs a delivered order: the gate cannot book the parcel (a staff action), so it is not delivered |
| His history in the admin, in order (journey view) | — | **SKIP** | 5646 ms | the order's own history is right (6 lines); the customer journey view (every visit, bag and message in one line) is PR 288, not built yet |

