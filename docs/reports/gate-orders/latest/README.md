# Go-live gate — test orders on the preview site

**সারকথা:** 18টা পরীক্ষার 16টা পাস, 2টা বাদ, কোনো ফেল নেই। সব টেস্ট অর্ডার বাতিল আর টেস্ট পণ্য আর্কাইভ করা হয়েছে।

- Run: 2026-11-01 22:13 (Asia/Dhaka) · version `0f6ac8a037d2` · host: the preview host of the server's settings · scenarios asked: all
- Result: **PASS** — 16 passed, 0 failed, 2 skipped, 26 test orders placed.
- Providers: every payment, courier, message and ERP connection is on its mock; nothing left the server.
- Payments: the mock bKash page — the run's own grant: its browser only, on the preview host, closed at the end; cash on delivery — switched on for this run only (allow_cod, the owner's OK) and put back at the end. No real payment key, price, discount or COD amount is touched.
- Speed budget (lighthouserc.json ci.assert.assertions): a page's largest paint ≤ 2.5 s, a press's server answer ≤ 0.6 s; counted on 4G and wifi, shown on 3G.

## Scenarios

| # | Scenario | Device | Network | Addresses | Result | Orders | Timings (load · product · add · checkout · submit) | Why |
|---|---|---|---|---|---|---|---|---|
| 1 | One item, cash on delivery, phone on 4G | Mid Android (393×873) | 4G | dhk-dhanmondi | ✅ PASS | 1022 | 0.7 s · 0.8 s · 0.2 s · 1.2 s · 1.9 s |  |
| 2 | Three items, low-end Android on slow 3G | Low-end Android (360×640, 4× slower CPU) | Slow 3G | sub-tongi | ✅ PASS | 1023 | 11 s · 11 s · 2.1 s · 12 s · 14 s |  |
| 3 | Eight different items on a desktop | Desktop 1366×768 | Wifi | out-chattogram | ✅ PASS | 1024 | 0.3 s · 1.4 s · 0.3 s · 0.8 s · 1.1 s |  |
| 4 | The same item twice, and the last pieces of its stock | iPhone SE (375×667) | Fast 3G | out-rajshahi | ✅ PASS | 1025 | 3.0 s · 3.2 s · 0.6 s · 3.5 s · 4.2 s |  |
| 5 | Mock bKash, paid ahead (gate check 1) | Mid Android (393×873) | 4G | out-khulna | ✅ PASS | 1026 | 0.8 s · 1.0 s · 0.3 s · 1.2 s · 1.5 s |  |
| 6 | Mock bKash fails, then the retry (gate check 21) | iPhone 13/14 (390×844) | 4G | dhk-mirpur | ✅ PASS | 1027 | 0.8 s · 0.7 s · 0.2 s · 1.1 s · 1.3 s |  |
| 7 | One customer, eight orders in a month, three cancelled | Low-end Android (360×640, 4× slower CPU) | 4G | dhk-gulshan, out-barishal, sub-fatullah, out-sylhet, out-rangpur, out-mymensingh, dhk-uttara, out-coxs-bazar | ✅ PASS | 1028, 1029, 1030, 1031, 1032, 1033, 1034, 1035 | 1.0 s · 0.9 s · 0.2 s · 1.3 s · 1.8 s |  |
| 8 | The Bengali checkout (/bn), Bengali digits in the phone | Mid Android (393×873) | Fast 3G | out-bogura-bn | ✅ PASS | 1036 | 3.0 s · 3.2 s · 0.7 s · 3.9 s · 4.6 s |  |
| 9 | A wrong phone number and a missing address first, then corrected | iPhone 13/14 (390×844) | 4G | out-cumilla | ✅ PASS | 1037 | 1.2 s · 1.1 s · 0.2 s · 1.2 s · 1.4 s |  |
| 10 | Double-tap on Confirm, a reload mid-checkout and Back after it | Mid Android (393×873) | 4G | dhk-mohammadpur-bn | ✅ PASS | 1038 | 0.8 s · 0.8 s · 0.2 s · 1.2 s · 1.3 s |  |
| 11 | The network drops while the order is sent, then he presses again | Mid Android (393×873) | Fast 3G | out-jashore | ✅ PASS | 1039 | 3.0 s · 3.2 s · 0.6 s · 3.6 s · 4.2 s |  |
| 12 | A guest order, then signed in with the sign-in code (mock SMS) | iPhone 13/14 (390×844) | Wifi | dhk-motijheel-mixed, out-kushtia | ✅ PASS | 1040, 1041 | 0.3 s · 0.3 s · 0.1 s · 0.4 s · 0.7 s |  |
| 13 | Delivery inside Dhaka, a Dhaka suburb and outside Dhaka, with the owner's charges | Tablet (820×1180) | 4G | dhk-banani-long, sub-savar, out-patuakhali-mixed | ✅ PASS | 1042, 1043, 1044 | 0.7 s · 0.7 s · 0.2 s · 1.1 s · 1.3 s | skip dhaka charge: no delivery band is switched on yet (the owner's delivery charges): only the address round trip is checked; skip suburb charge: no delivery band is switched on yet (the owner's delivery charges): only the address round trip is checked; skip outside charge: no delivery band is switched on yet (the owner's delivery charges): only the address round trip is checked |
| 14 | A coupon the owner made (only one with no use limit; none is ever made) | Desktop 1920×1080 | Wifi | — | ⏭️ SKIP | — | — | skip coupon: the owner has no open coupon without a use limit: none is made by the run |
| 15 | The admin adds a piece, records a payment and re-books (gate check 4) | Mid Android (393×873) | 4G | dhk-khilgaon-pasted | ✅ PASS | 1045 | 0.8 s · 0.8 s · 0.2 s · 1.4 s · 1.3 s | skip re-booked at the new amount: recording payments by hand is off (owner's setting payments.manual) |
| 16 | Partial delivery, a return and an exchange (on the mocks) | Mid Android (393×873) | 4G | — | ⏭️ SKIP | — | — | skip partial, return, exchange: each needs a delivered parcel: on the preview site that would count as a real sale and move the courier's cash, so it is proved on the practice courier in CI (packages/payments and packages/orders return, exchange and partial-delivery database tests) and not here |
| 17 | Two shoppers race for the last piece | Mid Android (393×873) | Wifi | dhk-rampura | ✅ PASS | 1046 | — |  |
| 18 | A 2.1 kg parcel, the courier's statement with a planted mismatch, and a gift (gate checks 24, 23, 7) | Desktop 1366×768 | 4G | out-bhola-no-thana | ✅ PASS | 1047 | 0.7 s · 0.7 s · 0.2 s · 1.1 s · 1.3 s |  |

## The six gate checks that need an order (GATE-phase2 plan rows 1, 4, 7, 21, 23, 24)

| Check | What | Result | How it was proved |
|---|---|---|---|
| 1 | A mock-bKash-paid order: no message asks for money and the sticker says collect 0 | ✅ PASS | rider collects 0, courier sent 0, sticker says 0; 22 journey messages filled, 0 would ask for money |
| 4 | Book, record a payment, re-book: the courier gets the new cash-on-delivery amount | ⏭️ SKIP | recording payments by hand is off (owner's setting payments.manual) |
| 7 | Gift: sticker and receiver's details only while gift mode (checkout.gift) is on | ⏭️ SKIP | gift mode is off (checkout.gift): no gift order, no gift sticker and no receiver's message — as it should be |
| 21 | bKash fails, then the retry: one order, one paid payment | ✅ PASS | failure shown: true; 1 order, 1 paid payment, 1 failed try |
| 23 | The courier's statement with a planted mismatch is flagged | ✅ PASS | our parcel: MISMATCH NOT_COLLECTED; a parcel we never booked: MISMATCH UNKNOWN_PARCEL |
| 24 | A 2.1 kg parcel follows its weight slab | ⏭️ SKIP | no courier rate card is entered yet (owner data): the weight was sent right, the slab price is not checked |

## Timings: phone vs desktop per network (median per step)

| Network | Screen | Orders | First load | Product page | Add to bag | Checkout open | Submit → thank-you |
|---|---|---|---|---|---|---|---|
| Slow 3G | phone | 1 | 11 s | 11 s | 2.1 s | 12 s | 14 s |
| Fast 3G | phone | 3 | 3.0 s | 3.2 s | 0.6 s | 3.6 s | 4.2 s |
| 4G | desktop | 1 | 0.7 s | 0.7 s | 0.2 s | 1.1 s | 1.3 s |
| 4G | phone | 8 | 0.8 s | 0.8 s | 0.2 s | 1.2 s | 1.3 s |
| Wifi | desktop | 1 | 0.3 s | 1.4 s | 0.3 s | 0.8 s | 1.1 s |
| Wifi | phone | 1 | 0.3 s | 0.3 s | 0.1 s | 0.4 s | 0.7 s |

## Addresses: typed → stored → admin → courier → sticker

Every order used its own address. A row fails when a word, a digit or the phone number arrives changed at any stage (spacing and line breaks are forgiven). `Place` is how the shop read the area: OK, WIDER (only the district), OTHER (another area of the same district), UNREAD (not read; the order still went through, PR 563), WRONG (another district: a fail).

| Order | Address (test data) | Quirk | Phone typed as | Stored | Admin | Courier | Sticker | Place | Band · charge | Result | Differences |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1022 | dhk-dhanmondi |  | bengali | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1023 | sub-tongi |  | plus880 | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1024 | out-chattogram |  | 880 | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1025 | out-rajshahi |  | spaced | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1026 | out-khulna |  | local | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1027 | dhk-mirpur |  | bengali | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1028 | dhk-gulshan |  | plus880 | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1029 | out-barishal |  | 880 | ✓ | ✓ | skip | skip | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1030 | sub-fatullah |  | spaced | ✓ | ✓ | skip | skip | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1031 | out-sylhet |  | local | ✓ | ✓ | skip | skip | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1032 | out-rangpur |  | bengali | ✓ | ✓ | skip | skip | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1033 | out-mymensingh |  | plus880 | ✓ | ✓ | skip | skip | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1034 | dhk-uttara |  | 880 | ✓ | ✓ | skip | skip | OK | dhaka-city · 0 | ✅ PASS |  |
| 1035 | out-coxs-bazar |  | spaced | ✓ | ✓ | skip | skip | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1036 | out-bogura-bn | bengali | bengali | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1037 | out-cumilla |  | bengali | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1038 | dhk-mohammadpur-bn | bengali | plus880 | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1039 | out-jashore |  | 880 | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1040 | dhk-motijheel-mixed | mixed | spaced | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1041 | out-kushtia |  | local | ✓ | ✓ | skip | skip | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1042 | dhk-banani-long | long | bengali | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1043 | sub-savar |  | plus880 | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1044 | out-patuakhali-mixed | mixed | 880 | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1045 | dhk-khilgaon-pasted | pasted | spaced | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1046 | dhk-rampura |  | bengali | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1047 | out-bhola-no-thana | missingThana | plus880 | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |

Coverage: 8 divisions (barishal, chattogram, dhaka, khulna, mymensingh, rajshahi, rangpur, sylhet); 14 districts outside Dhaka.

## Clean-up (nothing deleted)

- Test orders cancelled through the normal cancel path: 23 now, 24 were already closed.
- Test products archived: 3; their colours, sizes and stock shelf: 10. The test courier account the run added is archived.
- Sales (delivered only): no test order counts as a sale (0 test orders counted as sales, 0 test pieces in sales by SKU (delivered only)).
- Marked as tests: 37 of 47 test orders carry an internal "GATE TEST" note (the order flags take only the owner's own list)
- Refund requests the cancels recorded for the mock-paid test orders: 5 (requests only, no money moved; the mock never took any). The owner may close them on Money › Refunds.

How to run: GitHub › Actions › **gate-orders** › Run workflow (by hand only). `scenarios`: all, or a list such as `1,5,7`; `allow_cod` (off unless the owner says so) switches cash on delivery on for the run only and puts it back. The run places real orders only on the preview host and only on the mocks; it never runs on a schedule.

## Safety net

- Safety net: cash on delivery put back to no store value (the installation value answers); test-pay grant closed.
- ক্যাশ অন ডেলিভারি আগের অবস্থায় ফেরানো হয়েছে। টেস্ট-পেমেন্টের অনুমতি বন্ধ।
- Start check: nothing left open by an earlier run
