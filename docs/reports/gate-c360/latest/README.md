# Customer 360° gate — FAIL

2026-11-01 22:20 (Asia/Dhaka) · https://new.extas.com.bd · by hand · 0f6ac8a037d2 · scenarios: before, order, account, support, after

150 steps: 115 PASS, 8 FAIL, 27 SKIP. Every provider ran on its mock; the test customer is "GATE TEST customer 202611012220".

Each step says what was tried, how long it took, and why it failed or was skipped. A SKIP is never a pass: it names what is
missing (a product, a switch the owner keeps off, a part not built yet, or a real key).

Clean-up: cancelled 1, archived 1 order(s), 0 review(s), 0 back-in-stock request(s), the customer; nothing deleted

## Before ordering — 44 pass, 8 fail, 8 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| Lands from an ad link (UTM tags kept) | android-mid · en | PASS | 1063 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Opens in the facebook in-app browser | android-mid · en | PASS | 1100 ms | — |
| Searches (english: "polo") | android-mid · en | PASS | 799 ms | 1 result(s) |
| Searches (bengali: "পোলো শার্ট") | android-mid · en | PASS | 719 ms | 1 result(s) |
| Searches (misspelt: "pollo shrit") | android-mid · en | **FAIL** | 726 ms | found nothing for "pollo shrit" while the shop has products (waited 93 s for the run's new products) ([picture](before-search-misspelt-android-mid-en.jpg)) |
| Searches (banglish: "panjabi") | android-mid · en | PASS | 657 ms | 0 result(s): not a word the shop's products carry |
| Opens a category and uses its filter | android-mid · en | PASS | 674 ms | a choice was made (the address keeps no filter) |
| Opens a product and its size guide | android-mid · en | PASS | 769 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | android-mid · en | **SKIP** | 4 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |
| Lands from an ad link (UTM tags kept) | android-mid · bn | PASS | 1077 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Opens in the facebook in-app browser | android-mid · bn | PASS | 1167 ms | — |
| Searches (english: "polo") | android-mid · bn | PASS | 721 ms | 1 result(s) |
| Searches (bengali: "পোলো শার্ট") | android-mid · bn | PASS | 720 ms | 1 result(s) |
| Searches (misspelt: "pollo shrit") | android-mid · bn | **FAIL** | 688 ms | found nothing for "pollo shrit" while the shop has products ([picture](before-search-misspelt-android-mid-bn.jpg)) |
| Searches (banglish: "panjabi") | android-mid · bn | PASS | 680 ms | 0 result(s): not a word the shop's products carry |
| Opens a category and uses its filter | android-mid · bn | PASS | 710 ms | a choice was made (the address keeps no filter) |
| Opens a product and its size guide | android-mid · bn | PASS | 790 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | android-mid · bn | **SKIP** | 4 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |
| Saves to the wishlist | android-mid · bn | PASS | 698 ms | 1 saved |
| Puts a size in the bag | android-mid · bn | PASS | 712 ms | 1 line(s) |
| Starts the checkout and leaves (what the shop keeps) | android-mid · bn | **SKIP** | 745 ms | the page sent nothing to keep: the owner's follow-up switch (SIM-F-026) is off, so a customer who leaves is not followed up |
| Leaves without ordering and comes back (the bag waits) | android-mid · bn | PASS | 925 ms | the bag still holds his line |
| Lands from an ad link (UTM tags kept) | iphone · en | PASS | 835 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Opens in the messenger in-app browser | iphone · en | PASS | 877 ms | — |
| Searches (english: "polo") | iphone · en | PASS | 731 ms | 1 result(s) |
| Searches (bengali: "পোলো শার্ট") | iphone · en | PASS | 943 ms | 1 result(s) |
| Searches (misspelt: "pollo shrit") | iphone · en | **FAIL** | 685 ms | found nothing for "pollo shrit" while the shop has products ([picture](before-search-misspelt-iphone-en.jpg)) |
| Searches (banglish: "panjabi") | iphone · en | PASS | 709 ms | 0 result(s): not a word the shop's products carry |
| Opens a category and uses its filter | iphone · en | PASS | 666 ms | a choice was made (the address keeps no filter) |
| Opens a product and its size guide | iphone · en | PASS | 740 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | iphone · en | **SKIP** | 4 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |
| Lands from an ad link (UTM tags kept) | iphone · bn | PASS | 1129 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Opens in the messenger in-app browser | iphone · bn | PASS | 1199 ms | — |
| Searches (english: "polo") | iphone · bn | PASS | 1018 ms | 1 result(s) |
| Searches (bengali: "পোলো শার্ট") | iphone · bn | PASS | 801 ms | 1 result(s) |
| Searches (misspelt: "pollo shrit") | iphone · bn | **FAIL** | 791 ms | found nothing for "pollo shrit" while the shop has products ([picture](before-search-misspelt-iphone-bn.jpg)) |
| Searches (banglish: "panjabi") | iphone · bn | PASS | 773 ms | 0 result(s): not a word the shop's products carry |
| Opens a category and uses its filter | iphone · bn | PASS | 822 ms | a choice was made (the address keeps no filter) |
| Opens a product and its size guide | iphone · bn | PASS | 926 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | iphone · bn | **SKIP** | 4 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |
| Lands from an ad link (UTM tags kept) | desktop-1366 · en | PASS | 15241 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Searches (english: "polo") | desktop-1366 · en | PASS | 873 ms | 1 result(s) |
| Searches (bengali: "পোলো শার্ট") | desktop-1366 · en | PASS | 830 ms | 1 result(s) |
| Searches (misspelt: "pollo shrit") | desktop-1366 · en | **FAIL** | 857 ms | found nothing for "pollo shrit" while the shop has products ([picture](before-search-misspelt-desktop-1366-en.jpg)) |
| Searches (banglish: "panjabi") | desktop-1366 · en | PASS | 791 ms | 0 result(s): not a word the shop's products carry |
| Opens a category and uses its filter | desktop-1366 · en | **FAIL** | 800 ms | the category has products but no filter (no button, no side panel) ([picture](before-category-filter-desktop-1366-en.jpg)) |
| Opens a product and its size guide | desktop-1366 · en | PASS | 1022 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | desktop-1366 · en | **SKIP** | 4 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |
| Saves to the wishlist | desktop-1366 · en | PASS | 868 ms | 1 saved |
| Puts a size in the bag | desktop-1366 · en | PASS | 22402 ms | 1 line(s) |
| Starts the checkout and leaves (what the shop keeps) | desktop-1366 · en | **SKIP** | 884 ms | the page sent nothing to keep: the owner's follow-up switch (SIM-F-026) is off, so a customer who leaves is not followed up |
| Leaves without ordering and comes back (the bag waits) | desktop-1366 · en | PASS | 861 ms | the bag still holds his line |
| Lands from an ad link (UTM tags kept) | desktop-1366 · bn | PASS | 1134 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Searches (english: "polo") | desktop-1366 · bn | PASS | 959 ms | 1 result(s) |
| Searches (bengali: "পোলো শার্ট") | desktop-1366 · bn | PASS | 827 ms | 1 result(s) |
| Searches (misspelt: "pollo shrit") | desktop-1366 · bn | **FAIL** | 866 ms | found nothing for "pollo shrit" while the shop has products ([picture](before-search-misspelt-desktop-1366-bn.jpg)) |
| Searches (banglish: "panjabi") | desktop-1366 · bn | PASS | 792 ms | 0 result(s): not a word the shop's products carry |
| Opens a category and uses its filter | desktop-1366 · bn | **FAIL** | 807 ms | the category has products but no filter (no button, no side panel) ([picture](before-category-filter-desktop-1366-bn.jpg)) |
| Opens a product and its size guide | desktop-1366 · bn | PASS | 914 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | desktop-1366 · bn | **SKIP** | 4 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |

## Ordering — 4 pass, 0 fail, 0 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| Places one order as a guest (cash on delivery, or the mock bKash while COD is off) | android-mid · bn | PASS | 1172 ms | order 1048 (paid ahead on the mock bKash: COD is off (owner's setting)) |
| Sees the thank-you page with his order | android-mid · bn | PASS | 808 ms | — |
| The same phone signs in with the SMS code (mock) | android-mid · bn | PASS | 5565 ms | signed in; the page says the SMS is a practice one |
| The guest order shows in his account | android-mid · bn | PASS | 815 ms | — |

## The customer's account — 59 pass, 0 fail, 8 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| Opens /account | android-mid · en | PASS | 966 ms | — |
| Opens /account/orders | android-mid · en | PASS | 767 ms | — |
| Opens /account/foryou | android-mid · en | PASS | 682 ms | — |
| Opens /account/rewards | android-mid · en | PASS | 671 ms | — |
| Opens /account/wallet | android-mid · en | PASS | 771 ms | — |
| Opens /account/wishlist | android-mid · en | PASS | 706 ms | — |
| Opens /account/profile | android-mid · en | PASS | 673 ms | — |
| Opens /account/orders/<order> | android-mid · en | PASS | 745 ms | — |
| Opens /account/orders/<order>/invoice | android-mid · en | PASS | 716 ms | — |
| Opens /account | android-mid · bn | PASS | 942 ms | — |
| Opens /account/orders | android-mid · bn | PASS | 751 ms | — |
| Opens /account/foryou | android-mid · bn | PASS | 689 ms | — |
| Opens /account/rewards | android-mid · bn | PASS | 729 ms | — |
| Opens /account/wallet | android-mid · bn | PASS | 674 ms | — |
| Opens /account/wishlist | android-mid · bn | PASS | 698 ms | — |
| Opens /account/profile | android-mid · bn | PASS | 665 ms | — |
| Opens /account/orders/<order> | android-mid · bn | PASS | 715 ms | — |
| Opens /account/orders/<order>/invoice | android-mid · bn | PASS | 698 ms | — |
| Opens /account | iphone · en | PASS | 942 ms | — |
| Opens /account/orders | iphone · en | PASS | 832 ms | — |
| Opens /account/foryou | iphone · en | PASS | 805 ms | — |
| Opens /account/rewards | iphone · en | PASS | 775 ms | — |
| Opens /account/wallet | iphone · en | PASS | 779 ms | — |
| Opens /account/wishlist | iphone · en | PASS | 863 ms | — |
| Opens /account/profile | iphone · en | PASS | 771 ms | — |
| Opens /account/orders/<order> | iphone · en | PASS | 1009 ms | — |
| Opens /account/orders/<order>/invoice | iphone · en | PASS | 969 ms | — |
| Opens /account | iphone · bn | PASS | 875 ms | — |
| Opens /account/orders | iphone · bn | PASS | 720 ms | — |
| Opens /account/foryou | iphone · bn | PASS | 677 ms | — |
| Opens /account/rewards | iphone · bn | PASS | 673 ms | — |
| Opens /account/wallet | iphone · bn | PASS | 650 ms | — |
| Opens /account/wishlist | iphone · bn | PASS | 701 ms | — |
| Opens /account/profile | iphone · bn | PASS | 665 ms | — |
| Opens /account/orders/<order> | iphone · bn | PASS | 733 ms | — |
| Opens /account/orders/<order>/invoice | iphone · bn | PASS | 665 ms | — |
| Opens /account | desktop-1366 · en | PASS | 870 ms | — |
| Opens /account/orders | desktop-1366 · en | PASS | 681 ms | — |
| Opens /account/foryou | desktop-1366 · en | PASS | 650 ms | — |
| Opens /account/rewards | desktop-1366 · en | PASS | 633 ms | — |
| Opens /account/wallet | desktop-1366 · en | PASS | 662 ms | — |
| Opens /account/wishlist | desktop-1366 · en | PASS | 802 ms | — |
| Opens /account/profile | desktop-1366 · en | PASS | 650 ms | — |
| Opens /account/orders/<order> | desktop-1366 · en | PASS | 711 ms | — |
| Opens /account/orders/<order>/invoice | desktop-1366 · en | PASS | 680 ms | — |
| Opens /account | desktop-1366 · bn | PASS | 923 ms | — |
| Opens /account/orders | desktop-1366 · bn | PASS | 729 ms | — |
| Opens /account/foryou | desktop-1366 · bn | PASS | 695 ms | — |
| Opens /account/rewards | desktop-1366 · bn | PASS | 656 ms | — |
| Opens /account/wallet | desktop-1366 · bn | PASS | 796 ms | — |
| Opens /account/wishlist | desktop-1366 · bn | PASS | 702 ms | — |
| Opens /account/profile | desktop-1366 · bn | PASS | 668 ms | — |
| Opens /account/orders/<order> | desktop-1366 · bn | PASS | 704 ms | — |
| Opens /account/orders/<order>/invoice | desktop-1366 · bn | PASS | 697 ms | — |
| Order detail: live status and tracking link | android-mid · bn | PASS | 1020 ms | status shown; no tracking link until a courier has the parcel |
| Downloads the invoice | android-mid · bn | PASS | 151 ms | text/html, 5 KB |
| Cancels within the window | android-mid · bn | PASS | 839 ms | cancel offered (tap) |
| The order is moved to delivered on the mocks | android-mid · bn | **SKIP** | 4604 ms | moved to PACKED on the mocks (confirmed → pack); then no courier is set up yet, and booking is a staff action, so the steps that need a delivered order wait for a person |
| His page says delivered | android-mid · bn | **SKIP** | 0 ms | needs a delivered order: the gate cannot book the parcel (a staff action), so it is not delivered |
| Writes the review after delivery | android-mid · bn | **SKIP** | 1 ms | needs a delivered order: the gate cannot book the parcel (a staff action), so it is not delivered |
| Asks for a size exchange or a return | android-mid · bn | **SKIP** | 0 ms | needs a delivered order: the gate cannot book the parcel (a staff action), so it is not delivered |
| Orders the same again | android-mid · bn | **SKIP** | 778 ms | no "order again" on his order yet: planned in PR 622 |
| Adds and edits an address, sets the default | android-mid · bn | **SKIP** | 701 ms | add and edit work; no way to choose the default address: by design — proposal in the final analysis |
| Changes his name and his phone | android-mid · bn | **SKIP** | 2987 ms | the name changes; the phone is not changed from the account: by design — proposal in the final analysis |
| Turns SMS and WhatsApp offers on and off | android-mid · bn | PASS | 5464 ms | both saved and stored |
| Asks for his data or its erasure | android-mid · bn | **SKIP** | 722 ms | his own request for his data or its erasure: planned in PR 623 (staff have the requests screen) |
| Signs out and signs in again | android-mid · bn | PASS | 6792 ms | — |

## Support — 4 pass, 0 fail, 7 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| Writes in the shop's chat | android-mid · bn | **SKIP** | 3 ms | off — the owner's switch (support.liveChat) |
| Finds the WhatsApp button | android-mid · bn | **SKIP** | 2 ms | the owner keeps the WhatsApp button off, or has not typed the number (shell.fab, contact.whatsapp) |
| Finds a Messenger button | android-mid · bn | **SKIP** | 735 ms | no Messenger link on the shop yet: planned in PR 624 |
| Uses the contact form | android-mid · bn | **SKIP** | 655 ms | off — the owner's switch (pages.contactForm) |
| Opens the support inbox | desktop-1366 · en | PASS | 951 ms | — |
| Finds him by his number in any format (01…, +880…, Bengali digits) | desktop-1366 · en | PASS | 409 ms | every format finds him |
| Finds his conversation by his number in any format | desktop-1366 · en | **SKIP** | 53 ms | he has no conversation (the chat is off and no channel is connected): nothing to find; by reading the code, a number in Bengali digits is never searched as a number — packages/support/src/inbox.ts:85 strips non-ASCII digits (\D) before the phone search |
| Sees his orders, status and parcel beside the conversation | desktop-1366 · en | **SKIP** | 0 ms | no conversation to open; the order side panel is PR 428, not built yet (packages/support/src/inbox.ts:5) |
| Traces his order by his number (any format) and opens it | desktop-1366 · en | PASS | 1158 ms | found and opened; 6 history line(s) |
| Opens his customer page (orders and support tabs) | desktop-1366 · en | PASS | 995 ms | — |
| Sends him a product card from the inbox | desktop-1366 · en | **SKIP** | 0 ms | no conversation; sending a product card from the inbox is not built yet (S22) |

## After ordering — 4 pass, 0 fail, 4 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| The admin sees the order at once | — | PASS | 73 ms | — |
| The order says which ad brought him | — | PASS | 4104 ms | facebook / paid_social / gate-test-c360 / META |
| Confirmation messages are planned (mock senders) | — | PASS | 4102 ms | SMS/placed: SENT |
| The SMS message: right order, amount and language | — | PASS | 1 ms | 1 drawn: "EXTAS: আপনার অর্ডার 1048 পেয়েছি। ধন্যবাদ!" |
| The WhatsApp message: right order, amount and language | — | **SKIP** | 0 ms | no WHATSAPP message for this order (the owner's journey does not use it, or no address for it) |
| The e-mail message: right order, amount and language | — | **SKIP** | 0 ms | no EMAIL message for this order (the owner's journey does not use it, or no address for it) |
| A delivered order counts as a sale | — | **SKIP** | 0 ms | needs a delivered order: the gate cannot book the parcel (a staff action), so it is not delivered |
| His history in the admin, in order (journey view) | — | **SKIP** | 5644 ms | the order's own history is right (6 lines); the customer journey view (every visit, bag and message in one line) is PR 288, not built yet |


## Safety net

- Safety net: cash on delivery not touched (this gate never switches it on); test-pay grant closed.
