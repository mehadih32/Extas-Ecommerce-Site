# Customer 360° gate — FAIL

2026-11-01 16:39 (Asia/Dhaka) · https://new.extas.com.bd · by hand · 3843bb63837b · scenarios: before, order, account, support, after

138 steps: 51 PASS, 12 FAIL, 75 SKIP. Every provider ran on its mock; the test customer is "GATE TEST customer 202611011639".

Each step says what was tried, how long it took, and why it failed or was skipped. A SKIP is never a pass: it names what is
missing (a product, a switch the owner keeps off, a part not built yet, or a real key).

Clean-up: cancelled 0, archived 0 order(s), 0 review(s), 0 back-in-stock request(s), the customer; nothing deleted

## Before ordering — 4 pass, 6 fail, 50 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| Lands from an ad link (UTM tags kept) | android-mid · en | **FAIL** | 919 ms | the ad link's tags are not kept: no cookie or storage holds the campaign, and no _fbc is made from fbclid, so the order cannot say which ad brought him — apps/web/src/lib/tracking/model.ts:72 only reads _fbc; nothing writes Order.utmSource/utmCampaign (packages/orders/src/export.ts:59 exports them) ([picture](before-landing-ad-android-mid-en.jpg)) |
| Opens in the facebook in-app browser | android-mid · en | PASS | 929 ms | — |
| Searches (english: "polo") | android-mid · en | **SKIP** | 778 ms | the page works (778 ms), but the shop has no products yet: nothing to find |
| Searches (bengali: "পোলো শার্ট") | android-mid · en | **SKIP** | 738 ms | the page works (738 ms), but the shop has no products yet: nothing to find |
| Searches (misspelt: "pollo shrit") | android-mid · en | **SKIP** | 688 ms | the page works (688 ms), but the shop has no products yet: nothing to find |
| Searches (banglish: "panjabi") | android-mid · en | **SKIP** | 705 ms | the page works (705 ms), but the shop has no products yet: nothing to find |
| Opens a category and uses its filter | android-mid · en | **SKIP** | 646 ms | no products in the category yet, so no filter to use |
| Opens a product and its size guide | android-mid · en | **SKIP** | 0 ms | the shop has no products yet |
| A sold-out size: "tell me when it is back" | android-mid · en | **SKIP** | 1 ms | the shop has no products yet |
| Lands from an ad link (UTM tags kept) | android-mid · bn | **FAIL** | 810 ms | the ad link's tags are not kept: no cookie or storage holds the campaign, and no _fbc is made from fbclid, so the order cannot say which ad brought him — apps/web/src/lib/tracking/model.ts:72 only reads _fbc; nothing writes Order.utmSource/utmCampaign (packages/orders/src/export.ts:59 exports them) ([picture](before-landing-ad-android-mid-bn.jpg)) |
| Opens in the facebook in-app browser | android-mid · bn | PASS | 881 ms | — |
| Searches (english: "polo") | android-mid · bn | **SKIP** | 717 ms | the page works (717 ms), but the shop has no products yet: nothing to find |
| Searches (bengali: "পোলো শার্ট") | android-mid · bn | **SKIP** | 677 ms | the page works (677 ms), but the shop has no products yet: nothing to find |
| Searches (misspelt: "pollo shrit") | android-mid · bn | **SKIP** | 700 ms | the page works (700 ms), but the shop has no products yet: nothing to find |
| Searches (banglish: "panjabi") | android-mid · bn | **SKIP** | 698 ms | the page works (698 ms), but the shop has no products yet: nothing to find |
| Opens a category and uses its filter | android-mid · bn | **SKIP** | 674 ms | no products in the category yet, so no filter to use |
| Opens a product and its size guide | android-mid · bn | **SKIP** | 0 ms | the shop has no products yet |
| A sold-out size: "tell me when it is back" | android-mid · bn | **SKIP** | 0 ms | the shop has no products yet |
| Saves to the wishlist | android-mid · bn | **SKIP** | 0 ms | the shop has no products yet |
| Puts a size in the bag | android-mid · bn | **SKIP** | 0 ms | the shop has no products yet |
| Starts the checkout and leaves (what the shop keeps) | android-mid · bn | **SKIP** | 644 ms | the bag is empty, so the checkout has no form (no products yet) |
| Leaves without ordering and comes back (the bag waits) | android-mid · bn | **SKIP** | 805 ms | nothing was in the bag (no products yet) |
| Lands from an ad link (UTM tags kept) | iphone · en | **FAIL** | 836 ms | the ad link's tags are not kept: no cookie or storage holds the campaign, and no _fbc is made from fbclid, so the order cannot say which ad brought him — apps/web/src/lib/tracking/model.ts:72 only reads _fbc; nothing writes Order.utmSource/utmCampaign (packages/orders/src/export.ts:59 exports them) ([picture](before-landing-ad-iphone-en.jpg)) |
| Opens in the messenger in-app browser | iphone · en | PASS | 856 ms | — |
| Searches (english: "polo") | iphone · en | **SKIP** | 692 ms | the page works (692 ms), but the shop has no products yet: nothing to find |
| Searches (bengali: "পোলো শার্ট") | iphone · en | **SKIP** | 689 ms | the page works (689 ms), but the shop has no products yet: nothing to find |
| Searches (misspelt: "pollo shrit") | iphone · en | **SKIP** | 642 ms | the page works (642 ms), but the shop has no products yet: nothing to find |
| Searches (banglish: "panjabi") | iphone · en | **SKIP** | 653 ms | the page works (653 ms), but the shop has no products yet: nothing to find |
| Opens a category and uses its filter | iphone · en | **SKIP** | 647 ms | no products in the category yet, so no filter to use |
| Opens a product and its size guide | iphone · en | **SKIP** | 0 ms | the shop has no products yet |
| A sold-out size: "tell me when it is back" | iphone · en | **SKIP** | 0 ms | the shop has no products yet |
| Lands from an ad link (UTM tags kept) | iphone · bn | **FAIL** | 899 ms | the ad link's tags are not kept: no cookie or storage holds the campaign, and no _fbc is made from fbclid, so the order cannot say which ad brought him — apps/web/src/lib/tracking/model.ts:72 only reads _fbc; nothing writes Order.utmSource/utmCampaign (packages/orders/src/export.ts:59 exports them) ([picture](before-landing-ad-iphone-bn.jpg)) |
| Opens in the messenger in-app browser | iphone · bn | PASS | 810 ms | — |
| Searches (english: "polo") | iphone · bn | **SKIP** | 721 ms | the page works (721 ms), but the shop has no products yet: nothing to find |
| Searches (bengali: "পোলো শার্ট") | iphone · bn | **SKIP** | 659 ms | the page works (659 ms), but the shop has no products yet: nothing to find |
| Searches (misspelt: "pollo shrit") | iphone · bn | **SKIP** | 704 ms | the page works (704 ms), but the shop has no products yet: nothing to find |
| Searches (banglish: "panjabi") | iphone · bn | **SKIP** | 653 ms | the page works (653 ms), but the shop has no products yet: nothing to find |
| Opens a category and uses its filter | iphone · bn | **SKIP** | 649 ms | no products in the category yet, so no filter to use |
| Opens a product and its size guide | iphone · bn | **SKIP** | 0 ms | the shop has no products yet |
| A sold-out size: "tell me when it is back" | iphone · bn | **SKIP** | 0 ms | the shop has no products yet |
| Lands from an ad link (UTM tags kept) | desktop-1366 · en | **FAIL** | 802 ms | the ad link's tags are not kept: no cookie or storage holds the campaign, and no _fbc is made from fbclid, so the order cannot say which ad brought him — apps/web/src/lib/tracking/model.ts:72 only reads _fbc; nothing writes Order.utmSource/utmCampaign (packages/orders/src/export.ts:59 exports them) ([picture](before-landing-ad-desktop-1366-en.jpg)) |
| Searches (english: "polo") | desktop-1366 · en | **SKIP** | 721 ms | the page works (721 ms), but the shop has no products yet: nothing to find |
| Searches (bengali: "পোলো শার্ট") | desktop-1366 · en | **SKIP** | 679 ms | the page works (679 ms), but the shop has no products yet: nothing to find |
| Searches (misspelt: "pollo shrit") | desktop-1366 · en | **SKIP** | 662 ms | the page works (662 ms), but the shop has no products yet: nothing to find |
| Searches (banglish: "panjabi") | desktop-1366 · en | **SKIP** | 663 ms | the page works (663 ms), but the shop has no products yet: nothing to find |
| Opens a category and uses its filter | desktop-1366 · en | **SKIP** | 646 ms | no products in the category yet, so no filter to use |
| Opens a product and its size guide | desktop-1366 · en | **SKIP** | 0 ms | the shop has no products yet |
| A sold-out size: "tell me when it is back" | desktop-1366 · en | **SKIP** | 0 ms | the shop has no products yet |
| Saves to the wishlist | desktop-1366 · en | **SKIP** | 0 ms | the shop has no products yet |
| Puts a size in the bag | desktop-1366 · en | **SKIP** | 0 ms | the shop has no products yet |
| Starts the checkout and leaves (what the shop keeps) | desktop-1366 · en | **SKIP** | 630 ms | the bag is empty, so the checkout has no form (no products yet) |
| Leaves without ordering and comes back (the bag waits) | desktop-1366 · en | **SKIP** | 835 ms | nothing was in the bag (no products yet) |
| Lands from an ad link (UTM tags kept) | desktop-1366 · bn | **FAIL** | 827 ms | the ad link's tags are not kept: no cookie or storage holds the campaign, and no _fbc is made from fbclid, so the order cannot say which ad brought him — apps/web/src/lib/tracking/model.ts:72 only reads _fbc; nothing writes Order.utmSource/utmCampaign (packages/orders/src/export.ts:59 exports them) ([picture](before-landing-ad-desktop-1366-bn.jpg)) |
| Searches (english: "polo") | desktop-1366 · bn | **SKIP** | 710 ms | the page works (710 ms), but the shop has no products yet: nothing to find |
| Searches (bengali: "পোলো শার্ট") | desktop-1366 · bn | **SKIP** | 713 ms | the page works (713 ms), but the shop has no products yet: nothing to find |
| Searches (misspelt: "pollo shrit") | desktop-1366 · bn | **SKIP** | 652 ms | the page works (652 ms), but the shop has no products yet: nothing to find |
| Searches (banglish: "panjabi") | desktop-1366 · bn | **SKIP** | 691 ms | the page works (691 ms), but the shop has no products yet: nothing to find |
| Opens a category and uses its filter | desktop-1366 · bn | **SKIP** | 651 ms | no products in the category yet, so no filter to use |
| Opens a product and its size guide | desktop-1366 · bn | **SKIP** | 0 ms | the shop has no products yet |
| A sold-out size: "tell me when it is back" | desktop-1366 · bn | **SKIP** | 0 ms | the shop has no products yet |

## Ordering — 1 pass, 0 fail, 3 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| Places one order as a guest (cash on delivery) | android-mid · bn | **SKIP** | 1036 ms | the shop has no products yet: the order and every step that needs it wait until the owner adds one |
| Sees the thank-you page with his order | android-mid · bn | **SKIP** | 0 ms | no order was placed |
| The same phone signs in with the SMS code (mock) | android-mid · bn | PASS | 5945 ms | signed in; the page says the SMS is a practice one |
| The guest order shows in his account | android-mid · bn | **SKIP** | 0 ms | no order was placed |

## The customer's account — 43 pass, 4 fail, 8 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| Opens /account | android-mid · en | PASS | 863 ms | — |
| Opens /account/orders | android-mid · en | PASS | 677 ms | — |
| Opens /account/foryou | android-mid · en | PASS | 649 ms | — |
| Opens /account/rewards | android-mid · en | PASS | 655 ms | — |
| Opens /account/wallet | android-mid · en | PASS | 824 ms | — |
| Opens /account/wishlist | android-mid · en | PASS | 672 ms | — |
| Opens /account/profile | android-mid · en | PASS | 659 ms | — |
| Opens /account | android-mid · bn | PASS | 856 ms | — |
| Opens /account/orders | android-mid · bn | PASS | 704 ms | — |
| Opens /account/foryou | android-mid · bn | PASS | 649 ms | — |
| Opens /account/rewards | android-mid · bn | PASS | 687 ms | — |
| Opens /account/wallet | android-mid · bn | PASS | 710 ms | — |
| Opens /account/wishlist | android-mid · bn | PASS | 696 ms | — |
| Opens /account/profile | android-mid · bn | PASS | 740 ms | — |
| Opens /account | iphone · en | PASS | 778 ms | — |
| Opens /account/orders | iphone · en | PASS | 700 ms | — |
| Opens /account/foryou | iphone · en | PASS | 648 ms | — |
| Opens /account/rewards | iphone · en | PASS | 648 ms | — |
| Opens /account/wallet | iphone · en | PASS | 657 ms | — |
| Opens /account/wishlist | iphone · en | PASS | 706 ms | — |
| Opens /account/profile | iphone · en | PASS | 666 ms | — |
| Opens /account | iphone · bn | PASS | 902 ms | — |
| Opens /account/orders | iphone · bn | PASS | 802 ms | — |
| Opens /account/foryou | iphone · bn | PASS | 667 ms | — |
| Opens /account/rewards | iphone · bn | PASS | 652 ms | — |
| Opens /account/wallet | iphone · bn | PASS | 1256 ms | — |
| Opens /account/wishlist | iphone · bn | PASS | 709 ms | — |
| Opens /account/profile | iphone · bn | PASS | 672 ms | — |
| Opens /account | desktop-1366 · en | PASS | 885 ms | — |
| Opens /account/orders | desktop-1366 · en | PASS | 695 ms | — |
| Opens /account/foryou | desktop-1366 · en | PASS | 666 ms | — |
| Opens /account/rewards | desktop-1366 · en | PASS | 671 ms | — |
| Opens /account/wallet | desktop-1366 · en | PASS | 655 ms | — |
| Opens /account/wishlist | desktop-1366 · en | PASS | 668 ms | — |
| Opens /account/profile | desktop-1366 · en | PASS | 649 ms | — |
| Opens /account | desktop-1366 · bn | PASS | 870 ms | — |
| Opens /account/orders | desktop-1366 · bn | PASS | 656 ms | — |
| Opens /account/foryou | desktop-1366 · bn | PASS | 652 ms | — |
| Opens /account/rewards | desktop-1366 · bn | PASS | 649 ms | — |
| Opens /account/wallet | desktop-1366 · bn | PASS | 637 ms | — |
| Opens /account/wishlist | desktop-1366 · bn | PASS | 672 ms | — |
| Opens /account/profile | desktop-1366 · bn | **FAIL** | 657 ms | dead link /bn/account/wallet (no answer) ([picture](account-page-profile-desktop-1366-bn.jpg)) |
| Order detail: live status and tracking link | android-mid · bn | **SKIP** | 0 ms | no order (the shop has no products yet) |
| Downloads the invoice | android-mid · bn | **SKIP** | 0 ms | no order (the shop has no products yet) |
| Cancels within the window | android-mid · bn | **SKIP** | 0 ms | no order (the shop has no products yet) |
| The order is moved to delivered on the mocks | android-mid · bn | **SKIP** | 0 ms | no order (the shop has no products yet) |
| His page says delivered | android-mid · bn | **SKIP** | 0 ms | no order (the shop has no products yet) |
| Writes the review after delivery | android-mid · bn | **SKIP** | 0 ms | no order (the shop has no products yet) |
| Asks for a size exchange or a return | android-mid · bn | **SKIP** | 0 ms | no order (the shop has no products yet) |
| Orders the same again | android-mid · bn | **SKIP** | 0 ms | no order (the shop has no products yet) |
| Adds and edits an address, sets the default | android-mid · bn | **FAIL** | 911 ms | add and edit work, but there is no way to choose the default address — apps/web/src/components/shop/account/ProfileForms.tsx:92 (the list has no default) ([picture](account-addresses-android-mid-bn.jpg)) |
| Changes his name and his phone | android-mid · bn | **FAIL** | 3017 ms | the name changes, but the phone cannot be changed from the account (read-only, no verified change) — apps/web/src/components/shop/account/ProfileForms.tsx:87 ([picture](account-profile-android-mid-bn.jpg)) |
| Turns SMS and WhatsApp offers on and off | android-mid · bn | PASS | 5102 ms | both saved and stored |
| Asks for his data or its erasure | android-mid · bn | **FAIL** | 696 ms | neither his account nor the privacy page lets him ask for his data or its erasure (staff have the requests screen) — apps/web/src/components/admin/settings/PrivacyRequests.tsx exists; nothing on the shop side ([picture](account-privacy-request-android-mid-bn.jpg)) |
| Signs out and signs in again | android-mid · bn | PASS | 6776 ms | — |

## Support — 3 pass, 2 fail, 6 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| Writes in the shop's chat | android-mid · bn | **SKIP** | 2 ms | the live chat is switched off (support.liveChat, off as shipped) |
| Finds the WhatsApp button | android-mid · bn | **SKIP** | 2 ms | the owner keeps the WhatsApp button off, or has not typed the number (shell.fab, contact.whatsapp) |
| Finds a Messenger button | android-mid · bn | **FAIL** | 726 ms | no Messenger link on the shop, though most orders come from Facebook (the inbox can take Messenger, PR 426) ([picture](support-messenger-button-android-mid-bn.jpg)) |
| Uses the contact form | android-mid · bn | **FAIL** | 681 ms | the contact page lists ways to reach the shop but has no form, so nothing lands in the support inbox from it ([picture](support-contact-form-android-mid-bn.jpg)) |
| Opens the support inbox | desktop-1366 · en | PASS | 983 ms | — |
| Finds him by his number in any format (01…, +880…, Bengali digits) | desktop-1366 · en | PASS | 394 ms | every format finds him |
| Finds his conversation by his number in any format | desktop-1366 · en | **SKIP** | 56 ms | he has no conversation (the chat is off and no channel is connected): nothing to find; by reading the code, a number in Bengali digits is never searched as a number — packages/support/src/inbox.ts:85 strips non-ASCII digits (\D) before the phone search |
| Sees his orders, status and parcel beside the conversation | desktop-1366 · en | **SKIP** | 0 ms | no conversation to open; the order side panel is PR 428, not built yet (packages/support/src/inbox.ts:5) |
| Traces his order by his number (any format) and opens it | desktop-1366 · en | **SKIP** | 0 ms | no order |
| Opens his customer page (orders and support tabs) | desktop-1366 · en | PASS | 974 ms | — |
| Sends him a product card from the inbox | desktop-1366 · en | **SKIP** | 0 ms | no conversation; sending a product card from the inbox is not built yet (S22) |

## After ordering — 0 pass, 0 fail, 8 skip

| Step | Screen | Result | Time | Why / what was seen |
|---|---|---|---|---|
| The admin sees the order at once | — | **SKIP** | 0 ms | no order (the shop has no products yet) |
| The order says which ad brought him | — | **SKIP** | 0 ms | no order |
| Confirmation messages are planned (mock senders) | — | **SKIP** | 0 ms | no order |
| The SMS message: right order, amount and language | — | **SKIP** | 0 ms | no order |
| The WhatsApp message: right order, amount and language | — | **SKIP** | 0 ms | no order |
| The e-mail message: right order, amount and language | — | **SKIP** | 0 ms | no order |
| A delivered order counts as a sale | — | **SKIP** | 0 ms | no order |
| His history in the admin, in order (journey view) | — | **SKIP** | 0 ms | no order |

