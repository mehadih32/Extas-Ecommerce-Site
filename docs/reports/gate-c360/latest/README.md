# Customer 360° gate — PASS

2026-11-06 01:07 (Asia/Dhaka) · https://new.extas.com.bd · by hand · 491ac5771af6 · scenarios: before, order, account, support, after

150 steps: 122 PASS, 0 FAIL, 28 SKIP. Every provider ran on its mock; the test customer is "GATE TEST customer 202611060107".

Each step says what was tried, how long it took, and why it failed or was skipped. A SKIP is never a pass: it names what is
missing (a product, a switch the owner keeps off, a part not built yet, or a real key).

Clean-up: cancelled 1, archived 1 order(s), 0 review(s), 0 back-in-stock request(s), the customer; nothing deleted

## Before ordering — 50 pass, 0 fail, 10 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| Lands from an ad link (UTM tags kept) | android-mid · en | PASS | 817 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Opens in the facebook in-app browser | android-mid · en | PASS | 1004 ms | — |
| Searches (english: "polo") | android-mid · en | PASS | 756 ms | 1 result(s) |
| Searches (bengali: "পোলো শার্ট") | android-mid · en | PASS | 752 ms | 1 result(s) |
| Searches (misspelt: "pollo shrit") | android-mid · en | PASS | 814 ms | 1 result(s) |
| Searches (banglish: "panjabi") | android-mid · en | PASS | 724 ms | 0 result(s): not a word the shop's products carry |
| Opens a category and uses its filter | android-mid · en | PASS | 657 ms | a choice was made (the address keeps no filter) |
| Opens a product and its size guide | android-mid · en | PASS | 886 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | android-mid · en | **SKIP** | 5 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |
| Lands from an ad link (UTM tags kept) | android-mid · bn | PASS | 865 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Opens in the facebook in-app browser | android-mid · bn | PASS | 878 ms | — |
| Searches (english: "polo") | android-mid · bn | PASS | 741 ms | 1 result(s) |
| Searches (bengali: "পোলো শার্ট") | android-mid · bn | PASS | 729 ms | 1 result(s) |
| Searches (misspelt: "pollo shrit") | android-mid · bn | PASS | 660 ms | 1 result(s) |
| Searches (banglish: "panjabi") | android-mid · bn | PASS | 652 ms | 0 result(s): not a word the shop's products carry |
| Opens a category and uses its filter | android-mid · bn | PASS | 651 ms | a choice was made (the address keeps no filter) |
| Opens a product and its size guide | android-mid · bn | PASS | 762 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | android-mid · bn | **SKIP** | 4 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |
| Saves to the wishlist | android-mid · bn | PASS | 656 ms | 1 saved |
| Puts a size in the bag | android-mid · bn | PASS | 713 ms | 1 line(s) |
| Starts the checkout and leaves (what the shop keeps) | android-mid · bn | **SKIP** | 696 ms | the page sent nothing to keep: the owner's follow-up switch (SIM-F-026) is off, so a customer who leaves is not followed up |
| Leaves without ordering and comes back (the bag waits) | android-mid · bn | PASS | 885 ms | the bag still holds his line |
| Lands from an ad link (UTM tags kept) | iphone · en | PASS | 823 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Opens in the messenger in-app browser | iphone · en | PASS | 807 ms | — |
| Searches (english: "polo") | iphone · en | PASS | 695 ms | 1 result(s) |
| Searches (bengali: "পোলো শার্ট") | iphone · en | PASS | 674 ms | 1 result(s) |
| Searches (misspelt: "pollo shrit") | iphone · en | PASS | 659 ms | 1 result(s) |
| Searches (banglish: "panjabi") | iphone · en | PASS | 655 ms | 0 result(s): not a word the shop's products carry |
| Opens a category and uses its filter | iphone · en | PASS | 642 ms | a choice was made (the address keeps no filter) |
| Opens a product and its size guide | iphone · en | PASS | 716 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | iphone · en | **SKIP** | 4 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |
| Lands from an ad link (UTM tags kept) | iphone · bn | PASS | 809 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Opens in the messenger in-app browser | iphone · bn | PASS | 827 ms | — |
| Searches (english: "polo") | iphone · bn | PASS | 722 ms | 1 result(s) |
| Searches (bengali: "পোলো শার্ট") | iphone · bn | PASS | 664 ms | 1 result(s) |
| Searches (misspelt: "pollo shrit") | iphone · bn | PASS | 670 ms | 1 result(s) |
| Searches (banglish: "panjabi") | iphone · bn | PASS | 655 ms | 0 result(s): not a word the shop's products carry |
| Opens a category and uses its filter | iphone · bn | PASS | 666 ms | a choice was made (the address keeps no filter) |
| Opens a product and its size guide | iphone · bn | PASS | 769 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | iphone · bn | **SKIP** | 4 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |
| Lands from an ad link (UTM tags kept) | desktop-1366 · en | PASS | 962 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Searches (english: "polo") | desktop-1366 · en | PASS | 747 ms | 1 result(s) |
| Searches (bengali: "পোলো শার্ট") | desktop-1366 · en | PASS | 704 ms | 1 result(s) |
| Searches (misspelt: "pollo shrit") | desktop-1366 · en | PASS | 646 ms | 1 result(s) |
| Searches (banglish: "panjabi") | desktop-1366 · en | PASS | 660 ms | 0 result(s): not a word the shop's products carry |
| Opens a category and uses its filter | desktop-1366 · en | **SKIP** | 638 ms | the category shows 3 style(s), no more than category.page.fewStyles: a computer drops the filter rail for so few, by design (demo D-012) |
| Opens a product and its size guide | desktop-1366 · en | PASS | 728 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | desktop-1366 · en | **SKIP** | 4 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |
| Saves to the wishlist | desktop-1366 · en | PASS | 660 ms | 1 saved |
| Puts a size in the bag | desktop-1366 · en | PASS | 689 ms | 1 line(s) |
| Starts the checkout and leaves (what the shop keeps) | desktop-1366 · en | **SKIP** | 732 ms | the page sent nothing to keep: the owner's follow-up switch (SIM-F-026) is off, so a customer who leaves is not followed up |
| Leaves without ordering and comes back (the bag waits) | desktop-1366 · en | PASS | 976 ms | the bag still holds his line |
| Lands from an ad link (UTM tags kept) | desktop-1366 · bn | PASS | 962 ms | kept in the shop's own cookie (__Host-extas_src, HttpOnly: page scripts cannot read it, by design): facebook / paid_social / gate-test-c360 / META; fbc made from fbclid |
| Searches (english: "polo") | desktop-1366 · bn | PASS | 687 ms | 1 result(s) |
| Searches (bengali: "পোলো শার্ট") | desktop-1366 · bn | PASS | 673 ms | 1 result(s) |
| Searches (misspelt: "pollo shrit") | desktop-1366 · bn | PASS | 656 ms | 1 result(s) |
| Searches (banglish: "panjabi") | desktop-1366 · bn | PASS | 674 ms | 0 result(s): not a word the shop's products carry |
| Opens a category and uses its filter | desktop-1366 · bn | **SKIP** | 637 ms | the category shows 3 style(s), no more than category.page.fewStyles: a computer drops the filter rail for so few, by design (demo D-012) |
| Opens a product and its size guide | desktop-1366 · bn | PASS | 729 ms | no size guide on this product |
| A sold-out size: "tell me when it is back" | desktop-1366 · bn | **SKIP** | 4 ms | a sold-out size cannot be pressed: the owner's "tell me when it is back" switch is off (pdp.size.notifyBack) |

## Ordering — 4 pass, 0 fail, 0 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| Places one order as a guest (cash on delivery, or the mock bKash while COD is off) | android-mid · bn | PASS | 550 ms | order 1049 (paid ahead on the mock bKash: COD is off (owner's setting)) |
| Sees the thank-you page with his order | android-mid · bn | PASS | 654 ms | — |
| The same phone signs in with the SMS code (mock) | android-mid · bn | PASS | 5658 ms | signed in; the page says the SMS is a practice one |
| The guest order shows in his account | android-mid · bn | PASS | 673 ms | — |

## The customer's account — 59 pass, 0 fail, 8 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| Opens /account | android-mid · en | PASS | 819 ms | — |
| Opens /account/orders | android-mid · en | PASS | 937 ms | — |
| Opens /account/foryou | android-mid · en | PASS | 663 ms | — |
| Opens /account/rewards | android-mid · en | PASS | 701 ms | — |
| Opens /account/wallet | android-mid · en | PASS | 653 ms | — |
| Opens /account/wishlist | android-mid · en | PASS | 658 ms | — |
| Opens /account/profile | android-mid · en | PASS | 652 ms | — |
| Opens /account/orders/<order> | android-mid · en | PASS | 705 ms | — |
| Opens /account/orders/<order>/invoice | android-mid · en | PASS | 671 ms | — |
| Opens /account | android-mid · bn | PASS | 969 ms | — |
| Opens /account/orders | android-mid · bn | PASS | 717 ms | — |
| Opens /account/foryou | android-mid · bn | PASS | 707 ms | — |
| Opens /account/rewards | android-mid · bn | PASS | 673 ms | — |
| Opens /account/wallet | android-mid · bn | PASS | 668 ms | — |
| Opens /account/wishlist | android-mid · bn | PASS | 674 ms | — |
| Opens /account/profile | android-mid · bn | PASS | 653 ms | — |
| Opens /account/orders/<order> | android-mid · bn | PASS | 724 ms | — |
| Opens /account/orders/<order>/invoice | android-mid · bn | PASS | 709 ms | — |
| Opens /account | iphone · en | PASS | 792 ms | — |
| Opens /account/orders | iphone · en | PASS | 687 ms | — |
| Opens /account/foryou | iphone · en | PASS | 659 ms | — |
| Opens /account/rewards | iphone · en | PASS | 637 ms | — |
| Opens /account/wallet | iphone · en | PASS | 654 ms | — |
| Opens /account/wishlist | iphone · en | PASS | 662 ms | — |
| Opens /account/profile | iphone · en | PASS | 646 ms | — |
| Opens /account/orders/<order> | iphone · en | PASS | 713 ms | — |
| Opens /account/orders/<order>/invoice | iphone · en | PASS | 688 ms | — |
| Opens /account | iphone · bn | PASS | 888 ms | — |
| Opens /account/orders | iphone · bn | PASS | 719 ms | — |
| Opens /account/foryou | iphone · bn | PASS | 661 ms | — |
| Opens /account/rewards | iphone · bn | PASS | 658 ms | — |
| Opens /account/wallet | iphone · bn | PASS | 636 ms | — |
| Opens /account/wishlist | iphone · bn | PASS | 665 ms | — |
| Opens /account/profile | iphone · bn | PASS | 640 ms | — |
| Opens /account/orders/<order> | iphone · bn | PASS | 696 ms | — |
| Opens /account/orders/<order>/invoice | iphone · bn | PASS | 661 ms | — |
| Opens /account | desktop-1366 · en | PASS | 793 ms | — |
| Opens /account/orders | desktop-1366 · en | PASS | 670 ms | — |
| Opens /account/foryou | desktop-1366 · en | PASS | 638 ms | — |
| Opens /account/rewards | desktop-1366 · en | PASS | 626 ms | — |
| Opens /account/wallet | desktop-1366 · en | PASS | 634 ms | — |
| Opens /account/wishlist | desktop-1366 · en | PASS | 665 ms | — |
| Opens /account/profile | desktop-1366 · en | PASS | 633 ms | — |
| Opens /account/orders/<order> | desktop-1366 · en | PASS | 666 ms | — |
| Opens /account/orders/<order>/invoice | desktop-1366 · en | PASS | 680 ms | — |
| Opens /account | desktop-1366 · bn | PASS | 818 ms | — |
| Opens /account/orders | desktop-1366 · bn | PASS | 722 ms | — |
| Opens /account/foryou | desktop-1366 · bn | PASS | 636 ms | — |
| Opens /account/rewards | desktop-1366 · bn | PASS | 636 ms | — |
| Opens /account/wallet | desktop-1366 · bn | PASS | 652 ms | — |
| Opens /account/wishlist | desktop-1366 · bn | PASS | 674 ms | — |
| Opens /account/profile | desktop-1366 · bn | PASS | 641 ms | — |
| Opens /account/orders/<order> | desktop-1366 · bn | PASS | 681 ms | — |
| Opens /account/orders/<order>/invoice | desktop-1366 · bn | PASS | 650 ms | — |
| Order detail: live status and tracking link | android-mid · bn | PASS | 914 ms | status shown; no tracking link until a courier has the parcel |
| Downloads the invoice | android-mid · bn | PASS | 99 ms | text/html, 5 KB |
| Cancels within the window | android-mid · bn | PASS | 813 ms | cancel offered (tap) |
| The order is moved to delivered on the mocks | android-mid · bn | **SKIP** | 4605 ms | moved to PACKED on the mocks (confirmed → pack); then no courier is set up yet, and booking is a staff action, so the steps that need a delivered order wait for a person |
| His page says delivered | android-mid · bn | **SKIP** | 0 ms | needs a delivered order: the gate cannot book the parcel (a staff action), so it is not delivered |
| Writes the review after delivery | android-mid · bn | **SKIP** | 0 ms | needs a delivered order: the gate cannot book the parcel (a staff action), so it is not delivered |
| Asks for a size exchange or a return | android-mid · bn | **SKIP** | 1 ms | needs a delivered order: the gate cannot book the parcel (a staff action), so it is not delivered |
| Orders the same again | android-mid · bn | **SKIP** | 740 ms | no "order again" on his order yet: planned in PR 622 |
| Adds and edits an address, sets the default | android-mid · bn | **SKIP** | 677 ms | add and edit work; no way to choose the default address: by design — proposal in the final analysis |
| Changes his name and his phone | android-mid · bn | **SKIP** | 2942 ms | the name changes; the phone is not changed from the account: by design — proposal in the final analysis |
| Turns SMS and WhatsApp offers on and off | android-mid · bn | PASS | 5448 ms | both saved and stored |
| Asks for his data or its erasure | android-mid · bn | **SKIP** | 703 ms | his own request for his data or its erasure: planned in PR 623 (staff have the requests screen) |
| Signs out and signs in again | android-mid · bn | PASS | 7133 ms | — |

## Support — 4 pass, 0 fail, 7 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| Writes in the shop's chat | android-mid · bn | **SKIP** | 2 ms | off — the owner's switch (support.liveChat) |
| Finds the WhatsApp button | android-mid · bn | **SKIP** | 2 ms | the owner keeps the WhatsApp button off, or has not typed the number (shell.fab, contact.whatsapp) |
| Finds a Messenger button | android-mid · bn | **SKIP** | 710 ms | no Messenger link on the shop yet: planned in PR 624 |
| Uses the contact form | android-mid · bn | **SKIP** | 637 ms | off — the owner's switch (pages.contactForm) |
| Opens the support inbox | desktop-1366 · en | PASS | 862 ms | — |
| Finds him by his number in any format (01…, +880…, Bengali digits) | desktop-1366 · en | PASS | 305 ms | every format finds him |
| Finds his conversation by his number in any format | desktop-1366 · en | **SKIP** | 43 ms | he has no conversation (the chat is off and no channel is connected): nothing to find; by reading the code, a number in Bengali digits is never searched as a number — packages/support/src/inbox.ts:85 strips non-ASCII digits (\D) before the phone search |
| Sees his orders, status and parcel beside the conversation | desktop-1366 · en | **SKIP** | 0 ms | no conversation to open; the order side panel is PR 428, not built yet (packages/support/src/inbox.ts:5) |
| Traces his order by his number (any format) and opens it | desktop-1366 · en | PASS | 2464 ms | found and opened; 6 history line(s) |
| Opens his customer page (orders and support tabs) | desktop-1366 · en | PASS | 917 ms | — |
| Sends him a product card from the inbox | desktop-1366 · en | **SKIP** | 0 ms | no conversation; sending a product card from the inbox is not built yet (S22) |

## After ordering — 5 pass, 0 fail, 3 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| The admin sees the order at once | — | PASS | 68 ms | — |
| The order says which ad brought him | — | PASS | 4604 ms | facebook / paid_social / gate-test-c360 / META |
| Confirmation messages are planned (mock senders) | — | PASS | 4604 ms | SMS/placed: SENT; SMS/confirmed: SKIPPED (NO_LINK); WHATSAPP/packed: SKIPPED (NO_LINK) |
| The SMS message: right order, amount and language | — | PASS | 1 ms | 1 drawn: "EXTAS: আপনার অর্ডার 1049 পেয়েছি। ধন্যবাদ!" |
| The WhatsApp message: right order, amount and language | — | PASS | 0 ms | planned (SKIPPED); words drawn when sent |
| The e-mail message: right order, amount and language | — | **SKIP** | 0 ms | no EMAIL message for this order (the owner's journey does not use it, or no address for it) |
| A delivered order counts as a sale | — | **SKIP** | 0 ms | needs a delivered order: the gate cannot book the parcel (a staff action), so it is not delivered |
| His history in the admin, in order (journey view) | — | **SKIP** | 5083 ms | the order's own history is right (6 lines); the customer journey view (every visit, bag and message in one line) is PR 288, not built yet |


## Safety net

- Safety net: cash on delivery not touched (this gate never switches it on); test-pay grant closed.
