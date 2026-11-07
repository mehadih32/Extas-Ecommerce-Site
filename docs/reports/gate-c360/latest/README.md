# Customer 360° gate — PASS

2026-11-07 19:03 (Asia/Dhaka) · https://new.extas.com.bd · by hand · eea92e3c11d1 · scenarios: before, order, account, support, after

150 steps: 122 PASS, 0 FAIL, 28 SKIP. Every provider ran on its mock; the test customer is "GATE TEST customer 202611071903".

Each step says what was tried, how long it took, and why it failed or was skipped. A SKIP is never a pass: it names what is
missing (a product, a switch the owner keeps off, a part not built yet, or a real key).

Clean-up: cancelled 1, archived 1 order(s), 0 review(s), 0 back-in-stock request(s), the customer; nothing deleted

## Before ordering — 50 pass, 0 fail, 10 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| Lands from an ad link (UTM tags kept) | android-mid · en | PASS | 828 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Opens in the facebook in-app browser | android-mid · en | PASS | 801 ms | — |
| Searches (english: "polo") | android-mid · en | PASS | 776 ms | 1 result(s) |
| Searches (bengali: "পোলো শার্ট") | android-mid · en | PASS | 736 ms | 1 result(s) |
| Searches (misspelt: "pollo shrit") | android-mid · en | PASS | 706 ms | 1 result(s) |
| Searches (banglish: "panjabi") | android-mid · en | PASS | 687 ms | 0 result(s): not a word the shop's products carry |
| Opens a category and uses its filter | android-mid · en | PASS | 679 ms | a choice was made (the address keeps no filter) |
| Opens a product and its size guide | android-mid · en | PASS | 756 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | android-mid · en | **SKIP** | 5 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |
| Lands from an ad link (UTM tags kept) | android-mid · bn | PASS | 1593 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Opens in the facebook in-app browser | android-mid · bn | PASS | 1148 ms | — |
| Searches (english: "polo") | android-mid · bn | PASS | 2056 ms | 1 result(s) |
| Searches (bengali: "পোলো শার্ট") | android-mid · bn | PASS | 1295 ms | 1 result(s) |
| Searches (misspelt: "pollo shrit") | android-mid · bn | PASS | 1256 ms | 1 result(s) |
| Searches (banglish: "panjabi") | android-mid · bn | PASS | 1254 ms | 0 result(s): not a word the shop's products carry |
| Opens a category and uses its filter | android-mid · bn | PASS | 2036 ms | a choice was made (the address keeps no filter) |
| Opens a product and its size guide | android-mid · bn | PASS | 2838 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | android-mid · bn | **SKIP** | 5 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |
| Saves to the wishlist | android-mid · bn | PASS | 1985 ms | 1 saved |
| Puts a size in the bag | android-mid · bn | PASS | 1428 ms | 1 line(s) |
| Starts the checkout and leaves (what the shop keeps) | android-mid · bn | **SKIP** | 2270 ms | the page sent nothing to keep: the owner's follow-up switch (SIM-F-026) is off, so a customer who leaves is not followed up |
| Leaves without ordering and comes back (the bag waits) | android-mid · bn | PASS | 911 ms | the bag still holds his line |
| Lands from an ad link (UTM tags kept) | iphone · en | PASS | 2718 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Opens in the messenger in-app browser | iphone · en | PASS | 816 ms | — |
| Searches (english: "polo") | iphone · en | PASS | 704 ms | 1 result(s) |
| Searches (bengali: "পোলো শার্ট") | iphone · en | PASS | 694 ms | 1 result(s) |
| Searches (misspelt: "pollo shrit") | iphone · en | PASS | 677 ms | 1 result(s) |
| Searches (banglish: "panjabi") | iphone · en | PASS | 658 ms | 0 result(s): not a word the shop's products carry |
| Opens a category and uses its filter | iphone · en | PASS | 673 ms | a choice was made (the address keeps no filter) |
| Opens a product and its size guide | iphone · en | PASS | 736 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | iphone · en | **SKIP** | 4 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |
| Lands from an ad link (UTM tags kept) | iphone · bn | PASS | 1166 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Opens in the messenger in-app browser | iphone · bn | PASS | 1616 ms | — |
| Searches (english: "polo") | iphone · bn | PASS | 1448 ms | 1 result(s) |
| Searches (bengali: "পোলো শার্ট") | iphone · bn | PASS | 1226 ms | 1 result(s) |
| Searches (misspelt: "pollo shrit") | iphone · bn | PASS | 1255 ms | 1 result(s) |
| Searches (banglish: "panjabi") | iphone · bn | PASS | 1240 ms | 0 result(s): not a word the shop's products carry |
| Opens a category and uses its filter | iphone · bn | PASS | 1391 ms | a choice was made (the address keeps no filter) |
| Opens a product and its size guide | iphone · bn | PASS | 1537 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | iphone · bn | **SKIP** | 4 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |
| Lands from an ad link (UTM tags kept) | desktop-1366 · en | PASS | 804 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Searches (english: "polo") | desktop-1366 · en | PASS | 2786 ms | 1 result(s) |
| Searches (bengali: "পোলো শার্ট") | desktop-1366 · en | PASS | 1832 ms | 1 result(s) |
| Searches (misspelt: "pollo shrit") | desktop-1366 · en | PASS | 1312 ms | 1 result(s) |
| Searches (banglish: "panjabi") | desktop-1366 · en | PASS | 1324 ms | 0 result(s): not a word the shop's products carry |
| Opens a category and uses its filter | desktop-1366 · en | **SKIP** | 2156 ms | the category shows 3 style(s), no more than category.page.fewStyles: a computer drops the filter rail for so few, by design (demo D-012) |
| Opens a product and its size guide | desktop-1366 · en | PASS | 2735 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | desktop-1366 · en | **SKIP** | 5 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |
| Saves to the wishlist | desktop-1366 · en | PASS | 2116 ms | 1 saved |
| Puts a size in the bag | desktop-1366 · en | PASS | 2183 ms | 1 line(s) |
| Starts the checkout and leaves (what the shop keeps) | desktop-1366 · en | **SKIP** | 2465 ms | the page sent nothing to keep: the owner's follow-up switch (SIM-F-026) is off, so a customer who leaves is not followed up |
| Leaves without ordering and comes back (the bag waits) | desktop-1366 · en | PASS | 2404 ms | the bag still holds his line |
| Lands from an ad link (UTM tags kept) | desktop-1366 · bn | PASS | 4122 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Searches (english: "polo") | desktop-1366 · bn | PASS | 1534 ms | 1 result(s) |
| Searches (bengali: "পোলো শার্ট") | desktop-1366 · bn | PASS | 1354 ms | 1 result(s) |
| Searches (misspelt: "pollo shrit") | desktop-1366 · bn | PASS | 1323 ms | 1 result(s) |
| Searches (banglish: "panjabi") | desktop-1366 · bn | PASS | 1325 ms | 0 result(s): not a word the shop's products carry |
| Opens a category and uses its filter | desktop-1366 · bn | **SKIP** | 1444 ms | the category shows 3 style(s), no more than category.page.fewStyles: a computer drops the filter rail for so few, by design (demo D-012) |
| Opens a product and its size guide | desktop-1366 · bn | PASS | 1537 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | desktop-1366 · bn | **SKIP** | 4 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |

## Ordering — 4 pass, 0 fail, 0 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| Places one order as a guest (cash on delivery, or the mock bKash while COD is off) | android-mid · bn | PASS | 326 ms | order 1277 (cash on delivery) |
| Sees the thank-you page with his order | android-mid · bn | PASS | 662 ms | — |
| The same phone signs in with the SMS code (mock) | android-mid · bn | PASS | 5710 ms | signed in; the page says the SMS is a practice one |
| The guest order shows in his account | android-mid · bn | PASS | 692 ms | — |

## The customer's account — 59 pass, 0 fail, 8 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| Opens /account | android-mid · en | PASS | 2480 ms | — |
| Opens /account/orders | android-mid · en | PASS | 719 ms | — |
| Opens /account/foryou | android-mid · en | PASS | 676 ms | — |
| Opens /account/rewards | android-mid · en | PASS | 705 ms | — |
| Opens /account/wallet | android-mid · en | PASS | 649 ms | — |
| Opens /account/wishlist | android-mid · en | PASS | 699 ms | — |
| Opens /account/profile | android-mid · en | PASS | 664 ms | — |
| Opens /account/orders/<order> | android-mid · en | PASS | 710 ms | — |
| Opens /account/orders/<order>/invoice | android-mid · en | PASS | 693 ms | — |
| Opens /account | android-mid · bn | PASS | 2295 ms | — |
| Opens /account/orders | android-mid · bn | PASS | 748 ms | — |
| Opens /account/foryou | android-mid · bn | PASS | 688 ms | — |
| Opens /account/rewards | android-mid · bn | PASS | 660 ms | — |
| Opens /account/wallet | android-mid · bn | PASS | 651 ms | — |
| Opens /account/wishlist | android-mid · bn | PASS | 711 ms | — |
| Opens /account/profile | android-mid · bn | PASS | 689 ms | — |
| Opens /account/orders/<order> | android-mid · bn | PASS | 737 ms | — |
| Opens /account/orders/<order>/invoice | android-mid · bn | PASS | 675 ms | — |
| Opens /account | iphone · en | PASS | 793 ms | — |
| Opens /account/orders | iphone · en | PASS | 2295 ms | — |
| Opens /account/foryou | iphone · en | PASS | 1313 ms | — |
| Opens /account/rewards | iphone · en | PASS | 1287 ms | — |
| Opens /account/wallet | iphone · en | PASS | 1276 ms | — |
| Opens /account/wishlist | iphone · en | PASS | 1462 ms | — |
| Opens /account/profile | iphone · en | PASS | 1274 ms | — |
| Opens /account/orders/<order> | iphone · en | PASS | 2169 ms | — |
| Opens /account/orders/<order>/invoice | iphone · en | PASS | 1559 ms | — |
| Opens /account | iphone · bn | PASS | 846 ms | — |
| Opens /account/orders | iphone · bn | PASS | 696 ms | — |
| Opens /account/foryou | iphone · bn | PASS | 690 ms | — |
| Opens /account/rewards | iphone · bn | PASS | 673 ms | — |
| Opens /account/wallet | iphone · bn | PASS | 642 ms | — |
| Opens /account/wishlist | iphone · bn | PASS | 670 ms | — |
| Opens /account/profile | iphone · bn | PASS | 661 ms | — |
| Opens /account/orders/<order> | iphone · bn | PASS | 724 ms | — |
| Opens /account/orders/<order>/invoice | iphone · bn | PASS | 685 ms | — |
| Opens /account | desktop-1366 · en | PASS | 824 ms | — |
| Opens /account/orders | desktop-1366 · en | PASS | 720 ms | — |
| Opens /account/foryou | desktop-1366 · en | PASS | 679 ms | — |
| Opens /account/rewards | desktop-1366 · en | PASS | 648 ms | — |
| Opens /account/wallet | desktop-1366 · en | PASS | 640 ms | — |
| Opens /account/wishlist | desktop-1366 · en | PASS | 693 ms | — |
| Opens /account/profile | desktop-1366 · en | PASS | 674 ms | — |
| Opens /account/orders/<order> | desktop-1366 · en | PASS | 688 ms | — |
| Opens /account/orders/<order>/invoice | desktop-1366 · en | PASS | 669 ms | — |
| Opens /account | desktop-1366 · bn | PASS | 2447 ms | — |
| Opens /account/orders | desktop-1366 · bn | PASS | 1373 ms | — |
| Opens /account/foryou | desktop-1366 · bn | PASS | 1353 ms | — |
| Opens /account/rewards | desktop-1366 · bn | PASS | 1314 ms | — |
| Opens /account/wallet | desktop-1366 · bn | PASS | 1335 ms | — |
| Opens /account/wishlist | desktop-1366 · bn | PASS | 1512 ms | — |
| Opens /account/profile | desktop-1366 · bn | PASS | 1340 ms | — |
| Opens /account/orders/<order> | desktop-1366 · bn | PASS | 1530 ms | — |
| Opens /account/orders/<order>/invoice | desktop-1366 · bn | PASS | 1474 ms | — |
| Order detail: live status and tracking link | android-mid · bn | PASS | 970 ms | status shown; no tracking link until a courier has the parcel |
| Downloads the invoice | android-mid · bn | PASS | 361 ms | text/html, 5 KB |
| Cancels within the window | android-mid · bn | PASS | 925 ms | cancel offered (tap) |
| The order is moved to delivered on the mocks | android-mid · bn | **SKIP** | 5106 ms | moved to PACKED on the mocks (confirmed → pack); then no courier is set up yet, and booking is a staff action, so the steps that need a delivered order wait for a person |
| His page says delivered | android-mid · bn | **SKIP** | 0 ms | needs a delivered order: the gate cannot book the parcel (a staff action), so it is not delivered |
| Writes the review after delivery | android-mid · bn | **SKIP** | 0 ms | needs a delivered order: the gate cannot book the parcel (a staff action), so it is not delivered |
| Asks for a size exchange or a return | android-mid · bn | **SKIP** | 0 ms | needs a delivered order: the gate cannot book the parcel (a staff action), so it is not delivered |
| Orders the same again | android-mid · bn | **SKIP** | 759 ms | no "order again" on his order yet: planned in PR 622 |
| Adds and edits an address, sets the default | android-mid · bn | **SKIP** | 678 ms | add and edit work; no way to choose the default address: by design — proposal in the final analysis |
| Changes his name and his phone | android-mid · bn | **SKIP** | 2980 ms | the name changes; the phone is not changed from the account: by design — proposal in the final analysis |
| Turns SMS and WhatsApp offers on and off | android-mid · bn | PASS | 5997 ms | both saved and stored |
| Asks for his data or its erasure | android-mid · bn | **SKIP** | 705 ms | his own request for his data or its erasure: planned in PR 623 (staff have the requests screen) |
| Signs out and signs in again | android-mid · bn | PASS | 7738 ms | — |

## Support — 4 pass, 0 fail, 7 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| Writes in the shop's chat | android-mid · bn | **SKIP** | 2 ms | off — the owner's switch (support.liveChat) |
| Finds the WhatsApp button | android-mid · bn | **SKIP** | 2 ms | the owner keeps the WhatsApp button off, or has not typed the number (shell.fab, contact.whatsapp) |
| Finds a Messenger button | android-mid · bn | **SKIP** | 748 ms | no Messenger link on the shop yet: planned in PR 624 |
| Uses the contact form | android-mid · bn | **SKIP** | 655 ms | off — the owner's switch (pages.contactForm) |
| Opens the support inbox | desktop-1366 · en | PASS | 1002 ms | — |
| Finds him by his number in any format (01…, +880…, Bengali digits) | desktop-1366 · en | PASS | 346 ms | every format finds him |
| Finds his conversation by his number in any format | desktop-1366 · en | **SKIP** | 52 ms | he has no conversation (the chat is off and no channel is connected): nothing to find; by reading the code, a number in Bengali digits is never searched as a number — packages/support/src/inbox.ts:85 strips non-ASCII digits (\D) before the phone search |
| Sees his orders, status and parcel beside the conversation | desktop-1366 · en | **SKIP** | 0 ms | no conversation to open; the order side panel is PR 428, not built yet (packages/support/src/inbox.ts:5) |
| Traces his order by his number (any format) and opens it | desktop-1366 · en | PASS | 966 ms | found and opened; 5 history line(s) |
| Opens his customer page (orders and support tabs) | desktop-1366 · en | PASS | 1096 ms | — |
| Sends him a product card from the inbox | desktop-1366 · en | **SKIP** | 0 ms | no conversation; sending a product card from the inbox is not built yet (S22) |

## After ordering — 5 pass, 0 fail, 3 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| The admin sees the order at once | — | PASS | 105 ms | — |
| The order says which ad brought him | — | PASS | 5104 ms | facebook / paid_social / gate-test-c360 / META |
| Confirmation messages are planned (mock senders) | — | PASS | 5105 ms | SMS/placed: SENT; SMS/confirmed: SKIPPED (NO_LINK); WHATSAPP/packed: SKIPPED (NO_LINK) |
| The SMS message: right order, amount and language | — | PASS | 1 ms | 1 drawn: "EXTAS: আপনার অর্ডার 1277 পেয়েছি। ডেলিভারির সময় ৳500 হাতে রাখুন। ধন্যবাদ!" |
| The WhatsApp message: right order, amount and language | — | PASS | 0 ms | planned (SKIPPED); words drawn when sent |
| The e-mail message: right order, amount and language | — | **SKIP** | 0 ms | no EMAIL message for this order (the owner's journey does not use it, or no address for it) |
| A delivered order counts as a sale | — | **SKIP** | 0 ms | needs a delivered order: the gate cannot book the parcel (a staff action), so it is not delivered |
| His history in the admin, in order (journey view) | — | **SKIP** | 6217 ms | the order's own history is right (5 lines); the customer journey view (every visit, bag and message in one line) is PR 288, not built yet |


## Safety net

- Safety net: cash on delivery not touched (this gate never switches it on); test-pay grant closed.
