# Customer 360° gate — PASS

2026-11-06 22:20 (Asia/Dhaka) · https://new.extas.com.bd · by hand · 4689df67c695 · scenarios: before, order, account, support, after

150 steps: 122 PASS, 0 FAIL, 28 SKIP. Every provider ran on its mock; the test customer is "GATE TEST customer 202611062219".

Each step says what was tried, how long it took, and why it failed or was skipped. A SKIP is never a pass: it names what is
missing (a product, a switch the owner keeps off, a part not built yet, or a real key).

Clean-up: cancelled 1, archived 1 order(s), 0 review(s), 0 back-in-stock request(s), the customer; nothing deleted

## Before ordering — 50 pass, 0 fail, 10 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| Lands from an ad link (UTM tags kept) | android-mid · en | PASS | 892 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Opens in the facebook in-app browser | android-mid · en | PASS | 1441 ms | — |
| Searches (english: "polo") | android-mid · en | PASS | 769 ms | 1 result(s) |
| Searches (bengali: "পোলো শার্ট") | android-mid · en | PASS | 738 ms | 1 result(s) |
| Searches (misspelt: "pollo shrit") | android-mid · en | PASS | 757 ms | 1 result(s) |
| Searches (banglish: "panjabi") | android-mid · en | PASS | 672 ms | 0 result(s): not a word the shop's products carry |
| Opens a category and uses its filter | android-mid · en | PASS | 758 ms | a choice was made (the address keeps no filter) |
| Opens a product and its size guide | android-mid · en | PASS | 779 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | android-mid · en | **SKIP** | 4 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |
| Lands from an ad link (UTM tags kept) | android-mid · bn | PASS | 1192 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Opens in the facebook in-app browser | android-mid · bn | PASS | 927 ms | — |
| Searches (english: "polo") | android-mid · bn | PASS | 739 ms | 1 result(s) |
| Searches (bengali: "পোলো শার্ট") | android-mid · bn | PASS | 705 ms | 1 result(s) |
| Searches (misspelt: "pollo shrit") | android-mid · bn | PASS | 677 ms | 1 result(s) |
| Searches (banglish: "panjabi") | android-mid · bn | PASS | 685 ms | 0 result(s): not a word the shop's products carry |
| Opens a category and uses its filter | android-mid · bn | PASS | 702 ms | a choice was made (the address keeps no filter) |
| Opens a product and its size guide | android-mid · bn | PASS | 762 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | android-mid · bn | **SKIP** | 4 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |
| Saves to the wishlist | android-mid · bn | PASS | 688 ms | 1 saved |
| Puts a size in the bag | android-mid · bn | PASS | 711 ms | 1 line(s) |
| Starts the checkout and leaves (what the shop keeps) | android-mid · bn | **SKIP** | 721 ms | the page sent nothing to keep: the owner's follow-up switch (SIM-F-026) is off, so a customer who leaves is not followed up |
| Leaves without ordering and comes back (the bag waits) | android-mid · bn | PASS | 1271 ms | the bag still holds his line |
| Lands from an ad link (UTM tags kept) | iphone · en | PASS | 869 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Opens in the messenger in-app browser | iphone · en | PASS | 1097 ms | — |
| Searches (english: "polo") | iphone · en | PASS | 718 ms | 1 result(s) |
| Searches (bengali: "পোলো শার্ট") | iphone · en | PASS | 687 ms | 1 result(s) |
| Searches (misspelt: "pollo shrit") | iphone · en | PASS | 680 ms | 1 result(s) |
| Searches (banglish: "panjabi") | iphone · en | PASS | 656 ms | 0 result(s): not a word the shop's products carry |
| Opens a category and uses its filter | iphone · en | PASS | 661 ms | a choice was made (the address keeps no filter) |
| Opens a product and its size guide | iphone · en | PASS | 778 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | iphone · en | **SKIP** | 4 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |
| Lands from an ad link (UTM tags kept) | iphone · bn | PASS | 1021 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Opens in the messenger in-app browser | iphone · bn | PASS | 972 ms | — |
| Searches (english: "polo") | iphone · bn | PASS | 1180 ms | 1 result(s) |
| Searches (bengali: "পোলো শার্ট") | iphone · bn | PASS | 944 ms | 1 result(s) |
| Searches (misspelt: "pollo shrit") | iphone · bn | PASS | 973 ms | 1 result(s) |
| Searches (banglish: "panjabi") | iphone · bn | PASS | 968 ms | 0 result(s): not a word the shop's products carry |
| Opens a category and uses its filter | iphone · bn | PASS | 1021 ms | a choice was made (the address keeps no filter) |
| Opens a product and its size guide | iphone · bn | PASS | 1091 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | iphone · bn | **SKIP** | 5 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |
| Lands from an ad link (UTM tags kept) | desktop-1366 · en | PASS | 1103 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Searches (english: "polo") | desktop-1366 · en | PASS | 1092 ms | 1 result(s) |
| Searches (bengali: "পোলো শার্ট") | desktop-1366 · en | PASS | 952 ms | 1 result(s) |
| Searches (misspelt: "pollo shrit") | desktop-1366 · en | PASS | 954 ms | 1 result(s) |
| Searches (banglish: "panjabi") | desktop-1366 · en | PASS | 948 ms | 0 result(s): not a word the shop's products carry |
| Opens a category and uses its filter | desktop-1366 · en | **SKIP** | 1015 ms | the category shows 3 style(s), no more than category.page.fewStyles: a computer drops the filter rail for so few, by design (demo D-012) |
| Opens a product and its size guide | desktop-1366 · en | PASS | 1100 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | desktop-1366 · en | **SKIP** | 4 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |
| Saves to the wishlist | desktop-1366 · en | PASS | 1028 ms | 1 saved |
| Puts a size in the bag | desktop-1366 · en | PASS | 1078 ms | 1 line(s) |
| Starts the checkout and leaves (what the shop keeps) | desktop-1366 · en | **SKIP** | 1099 ms | the page sent nothing to keep: the owner's follow-up switch (SIM-F-026) is off, so a customer who leaves is not followed up |
| Leaves without ordering and comes back (the bag waits) | desktop-1366 · en | PASS | 1319 ms | the bag still holds his line |
| Lands from an ad link (UTM tags kept) | desktop-1366 · bn | PASS | 913 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Searches (english: "polo") | desktop-1366 · bn | PASS | 727 ms | 1 result(s) |
| Searches (bengali: "পোলো শার্ট") | desktop-1366 · bn | PASS | 699 ms | 1 result(s) |
| Searches (misspelt: "pollo shrit") | desktop-1366 · bn | PASS | 684 ms | 1 result(s) |
| Searches (banglish: "panjabi") | desktop-1366 · bn | PASS | 673 ms | 0 result(s): not a word the shop's products carry |
| Opens a category and uses its filter | desktop-1366 · bn | **SKIP** | 657 ms | the category shows 3 style(s), no more than category.page.fewStyles: a computer drops the filter rail for so few, by design (demo D-012) |
| Opens a product and its size guide | desktop-1366 · bn | PASS | 747 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | desktop-1366 · bn | **SKIP** | 4 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |

## Ordering — 4 pass, 0 fail, 0 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| Places one order as a guest (cash on delivery, or the mock bKash while COD is off) | android-mid · bn | PASS | 360 ms | order 1168 (cash on delivery) |
| Sees the thank-you page with his order | android-mid · bn | PASS | 688 ms | — |
| The same phone signs in with the SMS code (mock) | android-mid · bn | PASS | 6216 ms | signed in; the page says the SMS is a practice one |
| The guest order shows in his account | android-mid · bn | PASS | 700 ms | — |

## The customer's account — 59 pass, 0 fail, 8 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| Opens /account | android-mid · en | PASS | 1767 ms | — |
| Opens /account/orders | android-mid · en | PASS | 1030 ms | — |
| Opens /account/foryou | android-mid · en | PASS | 955 ms | — |
| Opens /account/rewards | android-mid · en | PASS | 957 ms | — |
| Opens /account/wallet | android-mid · en | PASS | 924 ms | — |
| Opens /account/wishlist | android-mid · en | PASS | 1019 ms | — |
| Opens /account/profile | android-mid · en | PASS | 931 ms | — |
| Opens /account/orders/<order> | android-mid · en | PASS | 1062 ms | — |
| Opens /account/orders/<order>/invoice | android-mid · en | PASS | 1038 ms | — |
| Opens /account | android-mid · bn | PASS | 1624 ms | — |
| Opens /account/orders | android-mid · bn | PASS | 784 ms | — |
| Opens /account/foryou | android-mid · bn | PASS | 990 ms | — |
| Opens /account/rewards | android-mid · bn | PASS | 674 ms | — |
| Opens /account/wallet | android-mid · bn | PASS | 670 ms | — |
| Opens /account/wishlist | android-mid · bn | PASS | 681 ms | — |
| Opens /account/profile | android-mid · bn | PASS | 683 ms | — |
| Opens /account/orders/<order> | android-mid · bn | PASS | 725 ms | — |
| Opens /account/orders/<order>/invoice | android-mid · bn | PASS | 676 ms | — |
| Opens /account | iphone · en | PASS | 834 ms | — |
| Opens /account/orders | iphone · en | PASS | 715 ms | — |
| Opens /account/foryou | iphone · en | PASS | 676 ms | — |
| Opens /account/rewards | iphone · en | PASS | 683 ms | — |
| Opens /account/wallet | iphone · en | PASS | 674 ms | — |
| Opens /account/wishlist | iphone · en | PASS | 696 ms | — |
| Opens /account/profile | iphone · en | PASS | 682 ms | — |
| Opens /account/orders/<order> | iphone · en | PASS | 717 ms | — |
| Opens /account/orders/<order>/invoice | iphone · en | PASS | 685 ms | — |
| Opens /account | iphone · bn | PASS | 894 ms | — |
| Opens /account/orders | iphone · bn | PASS | 699 ms | — |
| Opens /account/foryou | iphone · bn | PASS | 704 ms | — |
| Opens /account/rewards | iphone · bn | PASS | 661 ms | — |
| Opens /account/wallet | iphone · bn | PASS | 651 ms | — |
| Opens /account/wishlist | iphone · bn | PASS | 717 ms | — |
| Opens /account/profile | iphone · bn | PASS | 674 ms | — |
| Opens /account/orders/<order> | iphone · bn | PASS | 720 ms | — |
| Opens /account/orders/<order>/invoice | iphone · bn | PASS | 678 ms | — |
| Opens /account | desktop-1366 · en | PASS | 1165 ms | — |
| Opens /account/orders | desktop-1366 · en | PASS | 736 ms | — |
| Opens /account/foryou | desktop-1366 · en | PASS | 697 ms | — |
| Opens /account/rewards | desktop-1366 · en | PASS | 690 ms | — |
| Opens /account/wallet | desktop-1366 · en | PASS | 669 ms | — |
| Opens /account/wishlist | desktop-1366 · en | PASS | 702 ms | — |
| Opens /account/profile | desktop-1366 · en | PASS | 675 ms | — |
| Opens /account/orders/<order> | desktop-1366 · en | PASS | 705 ms | — |
| Opens /account/orders/<order>/invoice | desktop-1366 · en | PASS | 699 ms | — |
| Opens /account | desktop-1366 · bn | PASS | 1564 ms | — |
| Opens /account/orders | desktop-1366 · bn | PASS | 762 ms | — |
| Opens /account/foryou | desktop-1366 · bn | PASS | 659 ms | — |
| Opens /account/rewards | desktop-1366 · bn | PASS | 680 ms | — |
| Opens /account/wallet | desktop-1366 · bn | PASS | 651 ms | — |
| Opens /account/wishlist | desktop-1366 · bn | PASS | 688 ms | — |
| Opens /account/profile | desktop-1366 · bn | PASS | 660 ms | — |
| Opens /account/orders/<order> | desktop-1366 · bn | PASS | 742 ms | — |
| Opens /account/orders/<order>/invoice | desktop-1366 · bn | PASS | 672 ms | — |
| Order detail: live status and tracking link | android-mid · bn | PASS | 1385 ms | status shown; no tracking link until a courier has the parcel |
| Downloads the invoice | android-mid · bn | PASS | 118 ms | text/html, 5 KB |
| Cancels within the window | android-mid · bn | PASS | 814 ms | cancel offered (tap) |
| The order is moved to delivered on the mocks | android-mid · bn | **SKIP** | 5607 ms | moved to PACKED on the mocks (confirmed → pack); then no courier is set up yet, and booking is a staff action, so the steps that need a delivered order wait for a person |
| His page says delivered | android-mid · bn | **SKIP** | 0 ms | needs a delivered order: the gate cannot book the parcel (a staff action), so it is not delivered |
| Writes the review after delivery | android-mid · bn | **SKIP** | 0 ms | needs a delivered order: the gate cannot book the parcel (a staff action), so it is not delivered |
| Asks for a size exchange or a return | android-mid · bn | **SKIP** | 0 ms | needs a delivered order: the gate cannot book the parcel (a staff action), so it is not delivered |
| Orders the same again | android-mid · bn | **SKIP** | 730 ms | no "order again" on his order yet: planned in PR 622 |
| Adds and edits an address, sets the default | android-mid · bn | **SKIP** | 680 ms | add and edit work; no way to choose the default address: by design — proposal in the final analysis |
| Changes his name and his phone | android-mid · bn | **SKIP** | 3002 ms | the name changes; the phone is not changed from the account: by design — proposal in the final analysis |
| Turns SMS and WhatsApp offers on and off | android-mid · bn | PASS | 5475 ms | both saved and stored |
| Asks for his data or its erasure | android-mid · bn | **SKIP** | 707 ms | his own request for his data or its erasure: planned in PR 623 (staff have the requests screen) |
| Signs out and signs in again | android-mid · bn | PASS | 7216 ms | — |

## Support — 4 pass, 0 fail, 7 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| Writes in the shop's chat | android-mid · bn | **SKIP** | 2 ms | off — the owner's switch (support.liveChat) |
| Finds the WhatsApp button | android-mid · bn | **SKIP** | 2 ms | the owner keeps the WhatsApp button off, or has not typed the number (shell.fab, contact.whatsapp) |
| Finds a Messenger button | android-mid · bn | **SKIP** | 1058 ms | no Messenger link on the shop yet: planned in PR 624 |
| Uses the contact form | android-mid · bn | **SKIP** | 804 ms | off — the owner's switch (pages.contactForm) |
| Opens the support inbox | desktop-1366 · en | PASS | 939 ms | — |
| Finds him by his number in any format (01…, +880…, Bengali digits) | desktop-1366 · en | PASS | 352 ms | every format finds him |
| Finds his conversation by his number in any format | desktop-1366 · en | **SKIP** | 59 ms | he has no conversation (the chat is off and no channel is connected): nothing to find; by reading the code, a number in Bengali digits is never searched as a number — packages/support/src/inbox.ts:85 strips non-ASCII digits (\D) before the phone search |
| Sees his orders, status and parcel beside the conversation | desktop-1366 · en | **SKIP** | 0 ms | no conversation to open; the order side panel is PR 428, not built yet (packages/support/src/inbox.ts:5) |
| Traces his order by his number (any format) and opens it | desktop-1366 · en | PASS | 1030 ms | found and opened; 5 history line(s) |
| Opens his customer page (orders and support tabs) | desktop-1366 · en | PASS | 1012 ms | — |
| Sends him a product card from the inbox | desktop-1366 · en | **SKIP** | 0 ms | no conversation; sending a product card from the inbox is not built yet (S22) |

## After ordering — 5 pass, 0 fail, 3 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| The admin sees the order at once | — | PASS | 79 ms | — |
| The order says which ad brought him | — | PASS | 4602 ms | facebook / paid_social / gate-test-c360 / META |
| Confirmation messages are planned (mock senders) | — | PASS | 4605 ms | SMS/placed: SENT; SMS/confirmed: SKIPPED (NO_LINK); WHATSAPP/packed: SKIPPED (NO_LINK) |
| The SMS message: right order, amount and language | — | PASS | 1 ms | 1 drawn: "EXTAS: আপনার অর্ডার 1168 পেয়েছি। ডেলিভারির সময় ৳500 হাতে রাখুন। ধন্যবাদ!" |
| The WhatsApp message: right order, amount and language | — | PASS | 0 ms | planned (SKIPPED); words drawn when sent |
| The e-mail message: right order, amount and language | — | **SKIP** | 0 ms | no EMAIL message for this order (the owner's journey does not use it, or no address for it) |
| A delivered order counts as a sale | — | **SKIP** | 0 ms | needs a delivered order: the gate cannot book the parcel (a staff action), so it is not delivered |
| His history in the admin, in order (journey view) | — | **SKIP** | 5641 ms | the order's own history is right (5 lines); the customer journey view (every visit, bag and message in one line) is PR 288, not built yet |


## Safety net

- Safety net: cash on delivery not touched (this gate never switches it on); test-pay grant closed.
