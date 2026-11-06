# The 70-order real-life journey simulation — on the preview site

**সারকথা:** ফেল আছে — পরিকল্পনার 70টা অর্ডারের মধ্যে 70টা চালানো হয়েছে: 35টা পাস, 7টা ফেল, 28টা বাদ। মোট 42টা টেস্ট অর্ডার দেওয়া হয়েছে।

- বাদ পড়া অর্ডারগুলো ফেল নয়: দোকানে ওই পেমেন্ট বা কুরিয়ার এখন বন্ধ (আপনার সিদ্ধান্ত: এখন শুধু ক্যাশ অন ডেলিভারি)। কারণ নিচের টেবিলে।
- সব টেস্ট অর্ডার বাতিল আর টেস্ট পণ্য আর্কাইভ করা হয়েছে; কিছু মোছা হয়নি, কোনো টাকা নড়েনি, কোনো আসল কাস্টমারকে মেসেজ যায়নি।
- দরজার ঘটনা, কুরিয়ারের টাকা মেলানো, চ্যাট আর রিভিউ মেশিন খেলতে পারে না — সেগুলো নিচের "মানুষের কাজ" তালিকায়।
- ফলাফলটা Go-live পাতায় "simulation" লাইনের পাশে দেখা যাবে। নিশ্চিত করা (Confirm) একজন মানুষের কাজ — এই রান নিজে কিছু নিশ্চিত করে না।

- Run: 2026-11-06 21:45 (Asia/Dhaka) · version `4689df67c695` · host: the preview host of the server's settings · rows asked: all
- Result: **FAIL** — of the plan's 70 orders, 70 asked: 35 passed, 7 failed, 28 skipped; 42 test orders placed (every one cancelled at the end; nothing deleted).
- Plan: docs/qa/SIMULATION-PLAN.md §3 (orders 1–50) and docs/qa/SIMULATION-REPORT.md P2.2 (orders 51–70), as tools/simulation/plan.json plays them: the GATE TEST shelf's pieces in the plan's basket sizes, the test addresses of tools/gate-orders, sample customers with made-up numbers. A row whose payment method or courier is switched off on the shop is a SKIP with the reason, never a FAIL.
- Providers: every payment, courier, message and ERP connection is on its mock; nothing left the server.
- Payments: cash on delivery — on (the owner's setting); the practice wallet page — the run's own grant: its browser only, on the preview host, closed at the end. No price, discount, COD amount or real payment key is touched.

## Why rows were skipped

| Reason | Rows | Count |
|---|---|---:|
| the shop has no RedX courier (no connection for it in this build) | 05, 14, 17, 22, 25, 28, 31, 37, 41, 43, 48 | 11 |
| bKash is switched off on the shop (Payments › mobile wallets) | 02, 09, 26, 30, 38, 51, 61 | 7 |
| a bank transfer or an advance is not a checkout method: a person records it (the plan's bulk and bank-paid orders) | 10, 40, 53, 66 | 4 |
| card payment is switched off on the shop (Payments › cards) | 21, 47, 52, 65 | 4 |
| Nagad is switched off on the shop (Payments › mobile wallets) | 16, 54 | 2 |

## The 70 orders

| # | Day | Persona | Area | Items (plan) | Pay | Courier | Result | Test orders | Proved by the run | Not proved / failed |
|---|---|---|---|---|---|---|---|---|---|---|
| 01 | D1 | FT | Mirpur 10 | Polo Duo (2× M) | cash on delivery | Steadfast | ✅ PASS | 1102 | placed; one order for this shopper; 1 line(s); quantity 2; cash on delivery: the rider collects the order's due; booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |
| 02 | D1 | FT | Dhanmondi | textured-knit-polo L | bKash | Pathao | ⏭️ SKIP | — | — | skip payment method: bKash is switched off on the shop (Payments › mobile wallets) |
| 03 | D1 | FT | Uttara | essential-pique-polo M and L | cash on delivery | Steadfast | ✅ PASS | 1103 | placed; one order for this shopper; 2 line(s); cash on delivery: the rider collects the order's due; booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |
| 04 | D2 | RP | Mohammadpur | everyday-crew-tee ×3 (S, M, L) | cash on delivery | Pathao | ❌ FAIL | 1104 | — | FAIL run: oracle book: IN_REVIEW: IN_REVIEW: confirm is not open for this order (PLACED) ([picture](scenario-4.jpg)) |
| 05 | D2 | OD | Agrabad, Chattogram | Oxford shirt + slim chino | cash on delivery | RedX | ⏭️ SKIP | — | — | skip courier: the shop has no RedX courier (no connection for it in this build) |
| 06 | D2 | OD + 3G | village near Kurigram bazar | classic-cotton-panjabi XL | cash on delivery | Steadfast | ✅ PASS | 1105 | placed; one order for this shopper; 1 line(s); cash on delivery: the rider collects the order's due; never held over the address (PR 563); booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |
| 07 | D3 | FR | Gulshan 2 | heavyweight-hoodie ×2 | cash on delivery | – | ✅ PASS | 1106 | placed; one order for this shopper; 1 line(s); quantity 2; cash on delivery: the rider collects the order's due; no automatic block (a person decides); cancelled before packing; the stock is released |  |
| 08 | D3 | FR (prank) | Badda | polo-chino combo | cash on delivery | – | ✅ PASS | 1107 | placed; one order for this shopper; 2 line(s); cash on delivery: the rider collects the order's due; no automatic block (a person decides); cancelled before packing; the stock is released |  |
| 09 | D3 | GF | pays in Dhanmondi, ships to Zindabazar, Sylhet | classic-cotton-panjabi L (gift) | bKash | Pathao | ⏭️ SKIP | — | — | skip payment method: bKash is switched off on the shop (Payments › mobile wallets) |
| 10 | D4 | BK | Tejgaon office | 40 logo polos, 4 sizes | bank transfer / advance | – | ⏭️ SKIP | — | — | skip payment method: a bank transfer or an advance is not a checkout method: a person records it (the plan's bulk and bank-paid orders) |
| 11 | D4 | AN | Mirpur 2 | heavy-cotton-tee black XL | cash on delivery | Steadfast | ✅ PASS | 1108 | placed; his orders in this run: 2; 1 line(s); cash on delivery: the rider collects the order's due; one customer for the repeat buyer; booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |
| 12 | D4 | EL | Lalbagh, Old Dhaka | classic-cotton-panjabi XXL | cash on delivery | Pathao | ✅ PASS | 1109 | placed; one order for this shopper; 1 line(s); cash on delivery: the rider collects the order's due; booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |
| 13 | D5 | BN | Fatullah, Narayanganj | Polo Duo | cash on delivery | Steadfast | ✅ PASS | 1110 | placed; one order for this shopper; 1 line(s); quantity 2; cash on delivery: the rider collects the order's due; the order is in Bengali; booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |
| 14 | D5 | AB | Savar | linen-blend-shirt + leather-look-belt | cash on delivery | RedX | ⏭️ SKIP | — | — | skip courier: the shop has no RedX courier (no connection for it in this build) |
| 15 | D5 | FT | Tongi, Gazipur | jersey-zip-polo + cotton-socks-3 | cash on delivery | Pathao | ❌ FAIL | 1111 | placed; one order for this shopper; 2 line(s); cash on delivery: the rider collects the order's due; booked with the courier; the courier collects the order's due; the sticker says collect the order's due | FAIL a code that is not his is refused with a reason: HTTP 200 ([picture](scenario-15.jpg)) |
| 16 | D6 | RP | Uttara | hoodie-jogger set | Nagad | Steadfast | ⏭️ SKIP | — | — | skip payment method: Nagad is switched off on the shop (Payments › mobile wallets) |
| 17 | D6 | OD | Rajshahi city | 2 polos + slim-chino | cash on delivery | RedX | ⏭️ SKIP | — | — | skip courier: the shop has no RedX courier (no connection for it in this build) |
| 18 | D6 | FT | Mohammadpur | contrast-collar-polo M | cash on delivery | – | ✅ PASS | 1112 | placed; one order for this shopper; 1 line(s); cash on delivery: the rider collects the order's due |  |
| 19 | D7 | OD | Masterpara, Gabtali, Bogura | relaxed-twill-trousers 34 | cash on delivery | Pathao | ✅ PASS | 1113 | placed; one order for this shopper; 1 line(s); cash on delivery: the rider collects the order's due; booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |
| 20 | D7 | FT | Dhanmondi | striped-rib-polo L | cash on delivery | – | ✅ PASS | 1114 | placed; one order for this shopper; 1 line(s); cash on delivery: the rider collects the order's due; cancelled before packing; the stock is released |  |
| 21 | D7 | RP | Gulshan 1 | 6 items: 2 polos, 2 tees, slim-chino, belt | card | Steadfast | ⏭️ SKIP | — | — | skip payment method: card payment is switched off on the shop (Payments › cards) |
| 22 | D8 | FT | Khulna | long-sleeve-polo XL | cash on delivery | RedX | ⏭️ SKIP | — | — | skip courier: the shop has no RedX courier (no connection for it in this build) |
| 23 | D8 | OD | Cox's Bazar | Polo Duo | cash on delivery | Steadfast | ✅ PASS | 1115 | placed; one order for this shopper; 1 line(s); quantity 2; cash on delivery: the rider collects the order's due; booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |
| 24 | D8 | FT | Mirpur 11 | heavyweight-hoodie L | cash on delivery | Pathao | ✅ PASS | 1116 | placed; one order for this shopper; 1 line(s); cash on delivery: the rider collects the order's due; booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |
| 25 | D9 | OD | Sylhet | oxford-cotton-shirt + slim-chino | cash on delivery | RedX | ⏭️ SKIP | — | — | skip courier: the shop has no RedX courier (no connection for it in this build) |
| 26 | D9 | RP | Badda | polo-chino combo | bKash | Steadfast | ⏭️ SKIP | — | — | skip payment method: bKash is switched off on the shop (Payments › mobile wallets) |
| 27 | D9 | FT | Mymensingh | 2 everyday-crew-tee | cash on delivery | Pathao | ✅ PASS | 1117 | placed; one order for this shopper; 1 line(s); quantity 2; cash on delivery: the rider collects the order's due; booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |
| 28 | D10 | AN | Chattogram | jersey-zip-polo | cash on delivery | RedX | ⏭️ SKIP | — | — | skip courier: the shop has no RedX courier (no connection for it in this build) |
| 29 | D10 | FT | Uttara | pocket-tee M | cash on delivery | Steadfast | ✅ PASS | 1118 | placed; one order for this shopper; 1 line(s); cash on delivery: the rider collects the order's due; booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |
| 30 | D10 | GF | pays in Gulshan, ships to Rangpur | hoodie set | bKash | Pathao | ⏭️ SKIP | — | — | skip payment method: bKash is switched off on the shop (Payments › mobile wallets) |
| 31 | D10 | BN + EL | Cumilla | classic-cotton-panjabi + slim-chino | cash on delivery | RedX | ⏭️ SKIP | — | — | skip courier: the shop has no RedX courier (no connection for it in this build) |
| 32 | D10 | FT | Dhanmondi | textured-knit-polo M | cash on delivery | Steadfast | ✅ PASS | 1119 | placed; one order for this shopper; 1 line(s); cash on delivery: the rider collects the order's due; booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |
| 33 | D10 | RP | Mohammadpur | slim-chino 32 | cash on delivery | Pathao | ❌ FAIL | 1120 | — | FAIL run: oracle book: IN_REVIEW: IN_REVIEW: confirm is not open for this order (PLACED) ([picture](scenario-33.jpg)) |
| 34 | D10 | 3G | Barishal | Polo Duo | cash on delivery | Steadfast | ✅ PASS | 1121 | placed; the lost answer leaves him on the checkout; one order for this shopper; 1 line(s); quantity 2; cash on delivery: the rider collects the order's due; booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |
| 35 | D10 | FR | Mirpur 1 | heavyweight-hoodie ×3 | cash on delivery | – | ✅ PASS | 1122 | placed; one order for this shopper; 1 line(s); quantity 3; cash on delivery: the rider collects the order's due; no automatic block (a person decides); cancelled before packing; the stock is released |  |
| 36 | D11 | FT | Mohakhali | classic-cotton-panjabi ×2 | cash on delivery | Pathao | ✅ PASS | 1123 | placed; one order for this shopper; 1 line(s); quantity 2; cash on delivery: the rider collects the order's due; booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |
| 37 | D11 | OD | Dinajpur | classic-cotton-panjabi M | cash on delivery | RedX | ⏭️ SKIP | — | — | skip courier: the shop has no RedX courier (no connection for it in this build) |
| 38 | D11 | GF | pays in Dhaka, ships to Khulna | classic-cotton-panjabi XL (gift) | bKash | Steadfast | ⏭️ SKIP | — | — | skip payment method: bKash is switched off on the shop (Payments › mobile wallets) |
| 39 | D12 | RP | Gazipur | panjabi ×2 (sizes for sons) + polo | cash on delivery | Pathao | ❌ FAIL | 1124 | — | FAIL run: oracle book: IN_REVIEW: IN_REVIEW: confirm is not open for this order (PLACED) ([picture](scenario-39.jpg)) |
| 40 | D12 | BK | Narayanganj factory | 25 panjabis for staff Eid gift | bank transfer / advance | – | ⏭️ SKIP | — | — | skip payment method: a bank transfer or an advance is not a checkout method: a person records it (the plan's bulk and bank-paid orders) |
| 41 | D12 | FT | Sylhet | classic-cotton-panjabi L | cash on delivery | RedX | ⏭️ SKIP | — | — | skip courier: the shop has no RedX courier (no connection for it in this build) |
| 42 | D13 | FR | Shyamoli | 4 panjabis | cash on delivery | Steadfast | ✅ PASS | 1125 | placed; one order for this shopper; 4 line(s); cash on delivery: the rider collects the order's due; no automatic block (a person decides); booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |
| 43 | D13 | AB | Chattogram | classic-cotton-panjabi M | bKash, then cash on delivery | RedX | ⏭️ SKIP | — | — | skip courier: the shop has no RedX courier (no connection for it in this build) |
| 44 | D13 | BN | Rajshahi | panjabi + belt, coupon EID | cash on delivery | Pathao | ✅ PASS | 1126 | placed; one order for this shopper; 2 line(s); cash on delivery: the rider collects the order's due; the order is in Bengali; booked with the courier; the courier collects the order's due; the sticker says collect the order's due | skip the owner's coupon: the owner has no open coupon without a use limit (his codes are his; the run makes none) |
| 45 | D14 | OD + 3G | Rangpur → village for Eid | classic-cotton-panjabi L | cash on delivery | Steadfast | ✅ PASS | 1127 | placed; one order for this shopper; 1 line(s); cash on delivery: the rider collects the order's due; booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |
| 46 | D16 | RP | Uttara | everyday-crew-tee ×3 | cash on delivery | Pathao | ❌ FAIL | 1128 | — | FAIL run: oracle book: IN_REVIEW: IN_REVIEW: confirm is not open for this order (PLACED) ([picture](scenario-46.jpg)) |
| 47 | D16 | AN | Dhanmondi | linen-blend-shirt white M | card | Steadfast | ⏭️ SKIP | — | — | skip payment method: card payment is switched off on the shop (Payments › cards) |
| 48 | D17 | OD | Khulna | hoodie-jogger set | cash on delivery | RedX | ⏭️ SKIP | — | — | skip courier: the shop has no RedX courier (no connection for it in this build) |
| 49 | D17 | FT | Savar | slim-chino 30 + belt | cash on delivery | Pathao | ✅ PASS | 1129 | placed; one order for this shopper; 2 line(s); cash on delivery: the rider collects the order's due; booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |
| 50 | D18 | RP (VIP) | Gulshan 2 | Office Trio | cash on delivery | Steadfast | ❌ FAIL | 1130 | — | FAIL run: oracle book: IN_REVIEW: IN_REVIEW: confirm is not open for this order (PLACED) ([picture](scenario-50.jpg)) |
| 51 | P2-D1 | Prepaid · bKash | Dhaka city | Textured knit polo M | bKash | the shop's choice | ⏭️ SKIP | — | — | skip payment method: bKash is switched off on the shop (Payments › mobile wallets) |
| 52 | P2-D1 | Prepaid · card | Dhaka city | Oxford shirt L + chino 32 | card | the shop's choice | ⏭️ SKIP | — | — | skip payment method: card payment is switched off on the shop (Payments › cards) |
| 53 | P2-D2 | Prepaid · internet banking | Dhaka city | Heavyweight hoodie L | bank transfer / advance | the shop's choice | ⏭️ SKIP | — | — | skip payment method: a bank transfer or an advance is not a checkout method: a person records it (the plan's bulk and bank-paid orders) |
| 54 | P2-D2 | Prepaid · Nagad | Outside Dhaka | Contrast polo M | Nagad | the shop's choice | ⏭️ SKIP | — | — | skip payment method: Nagad is switched off on the shop (Payments › mobile wallets) |
| 55 | P2-D3 | Risk · hard, pays full advance | Outside Dhaka | Panjabi ×3 | cash on delivery | the shop's choice | ✅ PASS | 1131 | placed; one order for this shopper; 1 line(s); quantity 3; cash on delivery: the rider collects the order's due; no automatic block (a person decides); booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |
| 56 | P2-D3 | Risk · hard, refuses advance | Dhaka city | Hoodie ×2 | cash on delivery | the shop's choice | ✅ PASS | 1132 | placed; one order for this shopper; 1 line(s); quantity 2; cash on delivery: the rider collects the order's due; no automatic block (a person decides); cancelled before packing; the stock is released |  |
| 57 | P2-D4 | Risk · soft, pays delivery charge | Dhaka city | Pocket tee L + crew tee L | cash on delivery | the shop's choice | ✅ PASS | 1133 | placed; one order for this shopper; 2 line(s); cash on delivery: the rider collects the order's due; no automatic block (a person decides); booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |
| 58 | P2-D4 | Risk · false positive | Outside Dhaka | Long-sleeve polo L | cash on delivery | the shop's choice | ✅ PASS | 1134 | placed; one order for this shopper; 1 line(s); cash on delivery: the rider collects the order's due; no automatic block (a person decides); booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |
| 59 | P2-D5 | Older 50+ · বাংলা · 150% text | Outside Dhaka | Panjabi XL (bag kept 2 days) | cash on delivery | the shop's choice | ✅ PASS | 1135 | placed; one order for this shopper; 1 line(s); cash on delivery: the rider collects the order's due; the order is in Bengali; booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |
| 60 | P2-D5 | Son orders for his father | Outside Dhaka | Panjabi XL + twill 36 | cash on delivery | the shop's choice | ✅ PASS | 1136 | placed; one order for this shopper; 2 line(s); cash on delivery: the rider collects the order's due; booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |
| 61 | P2-D6 | Daughter's gift to her mother | Outside Dhaka | Linen shirt L | bKash | the shop's choice | ⏭️ SKIP | — | — | skip payment method: bKash is switched off on the shop (Payments › mobile wallets) |
| 62 | P2-D6 | Older 40+ · voice note, wants a call | Outside Dhaka | Oxford shirt ×2 XL | cash on delivery | the shop's choice | ✅ PASS | 1137 | placed; one order for this shopper; 1 line(s); quantity 2; cash on delivery: the rider collects the order's due; booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |
| 63 | P2-D7 | Rural · Kurigram union · borrowed phone | Outside Dhaka | Crew tee ×2 L | cash on delivery | the shop's choice | ✅ PASS | 1138 | placed; one order for this shopper; 1 line(s); quantity 2; cash on delivery: the rider collects the order's due; the order is in Bengali; booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |
| 64 | P2-D7 | Rural · Sunamganj haor | Outside Dhaka | Heavy tee XL | cash on delivery | the shop's choice | ✅ PASS | 1139 | placed; one order for this shopper; 1 line(s); cash on delivery: the rider collects the order's due; the order is in Bengali; booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |
| 65 | P2-D8 | Expat in Dubai, card | Dhaka city | Panjabi ×2 | card | the shop's choice | ⏭️ SKIP | — | — | skip payment method: card payment is switched off on the shop (Payments › cards) |
| 66 | P2-D8 | Corporate, after a quote | Dhaka city | 30 logo polos at the quoted price | bank transfer / advance | – | ⏭️ SKIP | — | — | skip payment method: a bank transfer or an advance is not a checkout method: a person records it (the plan's bulk and bank-paid orders) |
| 67 | P2-D9 | Repeat buyer expects the refund | Dhaka city | Heavyweight hoodie L | cash on delivery | the shop's choice | ❌ FAIL | 1140 | — | FAIL run: oracle book: IN_REVIEW: IN_REVIEW: confirm is not open for this order (PLACED) ([picture](scenario-67.jpg)) |
| 68 | P2-D9 | Coupon audience mismatch | Dhaka sub-area | Zip polo L + WELCOME100 | cash on delivery | the shop's choice | ✅ PASS | 1141 | placed; one order for this shopper; 1 line(s); cash on delivery: the rider collects the order's due; booked with the courier; the courier collects the order's due; the sticker says collect the order's due | skip the owner's coupon: the owner has no open coupon without a use limit (his codes are his; the run makes none) |
| 69 | P2-D10 | Flexible set, keep one piece | Outside Dhaka | Hoodie-jogger set XL | cash on delivery | the shop's choice | ✅ PASS | 1142 | placed; one order for this shopper; 2 line(s); cash on delivery: the rider collects the order's due; booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |
| 70 | P2-D10 | Late 6 days + rider asks ৳30 more | Outside Dhaka | Twill 32, Bandarban | cash on delivery | the shop's choice | ✅ PASS | 1143 | placed; one order for this shopper; 1 line(s); cash on delivery: the rider collects the order's due; booked with the courier; the courier collects the order's due; the sticker says collect the order's due |  |

## Left to a person (what the run cannot play on the mocks)

The door (try-on, bargaining, partial, refusal), the courier's statement and settlement, chats, calls, reviews, refunds and the owner's money decisions stay with a person or a real courier: this list is the staging acceptance walk's part (docs/golive/ACCEPTANCE.md). The run never claims them.

| # | Event | Run's row |
|---|---|---|
| 01 | SMS + WhatsApp, the call, delivered in 24 h, review request on D+2 (switch on/off) | ✅ PASS |
| 02 | callback, paid badge on the sticker | ⏭️ SKIP |
| 03 | two-sizes follow-up; partial acceptance at the door (keeps L, returns M) | ✅ PASS |
| 04 | signed in, saved size, wallet ৳100 applied | ❌ FAIL |
| 05 | delivered day 3 | ⏭️ SKIP |
| 06 | rider cannot find the house and calls; delivered day 6 | ✅ PASS |
| 07 | 5/5 cancelled courier history, advance asked, abandons; flag-outcome report | ✅ PASS |
| 08 | the call: "I didn't order"; identity graph notes the device | ✅ PASS |
| 09 | receiver unreachable once, delivered on the 2nd attempt | ⏭️ SKIP |
| 10 | bulk enquiry and a human quote (no cart order) | ⏭️ SKIP |
| 11 | "colour faded" on WhatsApp and Facebook, free replacement, B-grade | ✅ PASS |
| 12 | gives up on the address, sends the bag on WhatsApp, agent keys the order | ✅ PASS |
| 13 | Bengali SMS | ✅ PASS |
| 14 | leaves, one consented follow-up, comes back | ⏭️ SKIP |
| 15 | the better-offer explanation | ❌ FAIL |
| 16 | Nagad fails once, then the retry | ⏭️ SKIP |
| 17 | wrong phone, merge from WhatsApp, phone corrected with a log | ⏭️ SKIP |
| 18 | reorders 10 min later; cancellation notice with a tracking link | ✅ PASS |
| 19 | courier zone id | ✅ PASS |
| 20 | cancels on WhatsApp 2 h later | ✅ PASS |
| 21 | packing 6 items, weight over 1 kg | ⏭️ SKIP |
| 22 | try-on at the door, returns, XXL re-ship linked | ⏭️ SKIP |
| 23 | bargaining at the door, the call logged | ✅ PASS |
| 24 | rider asks ৳50 extra; goodwill credit is an owner proposal | ✅ PASS |
| 25 | courier loses the parcel; claim and re-ship | ⏭️ SKIP |
| 26 | damaged parcel, replacement, courier claim | ⏭️ SKIP |
| 27 | phone off, not available twice, RTO cost | ✅ PASS |
| 28 | 6 days late; threatens a Facebook post | ⏭️ SKIP |
| 29 | photo review on D+2, moderation, verified-buyer mark | ✅ PASS |
| 30 | delivery on a date (birthday) | ⏭️ SKIP |
| 31 | size asked on Messenger, agent builds the order in chat | ⏭️ SKIP |
| 32 | D+1 size exchange M→L from My account, QC good | ✅ PASS |
| 33 | exchange asked on D+4 (window passed) | ❌ FAIL |
| 35 | identity graph match, hold and advance request; a block only proposed | ✅ PASS |
| 36 | Eid cut-off banner and the "before Eid" promise | ✅ PASS |
| 37 | after the outside-Dhaka cut-off; arrives after Eid | ⏭️ SKIP |
| 38 | courier peak delay; sender and receiver informed | ⏭️ SKIP |
| 39 | one size oversold at peak, resolution card at packing | ❌ FAIL |
| 40 | bulk enquiry, human quote, advance, split delivery | ⏭️ SKIP |
| 41 | call queue backlog at 100 orders a day | ⏭️ SKIP |
| 42 | refuses at the door, RTO, learning loop and the ads exclusion list | ✅ PASS |
| 43 | comes back from the follow-up | ⏭️ SKIP |
| 44 | the same total on SMS, invoice and sticker | ✅ PASS |
| 45 | address change after the courier is booked | ✅ PASS |
| 46 | came from a product-life reminder; points earned | ❌ FAIL |
| 47 | wrong item packed, free exchange, root cause | ⏭️ SKIP |
| 48 | partial on a set at the door | ⏭️ SKIP |
| 49 | "Add to this parcel" before packing | ✅ PASS |
| 50 | invoice copy, review, referral code for a friend | ❌ FAIL |
| 51 | prepaid reward | ⏭️ SKIP |
| 52 | own-size exchange L→XL | ⏭️ SKIP |
| 53 | cancelled on request; refund record | ⏭️ SKIP |
| 54 | our-mistake free exchange | ⏭️ SKIP |
| 55 | the full advance paid by bKash outside the checkout is recorded (F-040) | ✅ PASS |
| 56 | held, advance refused, declined with a reason and a notice | ✅ PASS |
| 57 | the ৳120 advance recorded, not collected twice (F-040) | ✅ PASS |
| 58 | override with a note | ✅ PASS |
| 59 | 150% text, the bag kept for 2 days | ✅ PASS |
| 60 | the father pays at the door; receiver on the sticker (F-045) | ✅ PASS |
| 61 | the sticker names the receiver | ⏭️ SKIP |
| 62 | voice note and a call-back request; agent keys the order | ✅ PASS |
| 63 | contact person and call time; delivered on day 4 | ✅ PASS |
| 64 | a failed attempt recorded, then delivered | ✅ PASS |
| 65 | RTO (brother away); refund record | ⏭️ SKIP |
| 66 | the quote turned into an order (PR 606) | ⏭️ SKIP |
| 67 | the wallet refund shows (F-041) | ❌ FAIL |
| 68 | who can use a coupon, first order only (F-050) | ✅ PASS |
| 69 | keeps one piece at the door (F-051) | ✅ PASS |
| 70 | late 6 days, rider overcharge refund and apology credit (F-054) | ✅ PASS |

## Clean-up (nothing deleted)

- Test orders cancelled through the normal cancel path: 37 now, 106 were already closed.
- Test products archived: 3; their colours, sizes and stock shelf: 10. The test courier account the run added is archived.
- Sales (delivered only): no test order counts as a sale (0 test orders counted as sales, 0 test pieces in sales by SKU (delivered only)).

Every order's address round trip (typed → stored → admin → courier → sticker) and the timings per device and network: [orders.md](orders.md).

How to run: GitHub › Actions › **simulation** › Run workflow (by hand only). `orders`: all, or a list such as `1,13,55`. It places test orders only on the preview host and only on the mocks, never on a schedule. The go-live page shows the last run beside its "simulation" row; a person confirms that row.

## Safety net

- Safety net: cash on delivery not touched; test-pay grant closed.
- ক্যাশ অন ডেলিভারিতে হাত দেওয়া হয়নি। টেস্ট-পেমেন্টের অনুমতি বন্ধ।
- Start check: nothing left open by an earlier run
