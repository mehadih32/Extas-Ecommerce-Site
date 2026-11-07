# Go-live gate — test orders on the preview site

**সারকথা:** 18টা পরীক্ষার 14টা পাস, 4টা বাদ, কোনো ফেল নেই। সব টেস্ট অর্ডার বাতিল আর টেস্ট পণ্য আর্কাইভ করা হয়েছে।

- Run: 2026-11-07 18:56 (Asia/Dhaka) · version `eea92e3c11d1` · host: the preview host of the server's settings · scenarios asked: all
- Result: **PASS** — 14 passed, 0 failed, 4 skipped, 24 test orders placed.
- Providers: every payment, courier, message and ERP connection is on its mock; nothing left the server.
- Payments: the mock bKash page — the run's own grant: its browser only, on the preview host, closed at the end; cash on delivery — on (the owner's setting). No real payment key, price, discount or COD amount is touched.
- Speed budget (lighthouserc.json ci.assert.assertions): a page's largest paint ≤ 2.5 s, a press's server answer ≤ 0.6 s; counted on 4G and wifi, shown on 3G.

## Scenarios

| # | Scenario | Device | Network | Addresses | Result | Orders | Timings (load · product · add · checkout · submit) | Why |
|---|---|---|---|---|---|---|---|---|
| 1 | One item, cash on delivery, phone on 4G | Mid Android (393×873) | 4G | dhk-dhanmondi | ✅ PASS | 1253 | 0.8 s · 0.8 s · 0.2 s · 1.1 s · 1.3 s |  |
| 2 | Three items, low-end Android on slow 3G | Low-end Android (360×640, 4× slower CPU) | Slow 3G | sub-tongi | ✅ PASS | 1254 | 11 s · 12 s · 2.1 s · 13 s · 14 s |  |
| 3 | Eight different items on a desktop | Desktop 1366×768 | Wifi | out-chattogram | ✅ PASS | 1255 | 0.3 s · 0.3 s · 0.1 s · 0.4 s · 0.7 s |  |
| 4 | The same item twice, and the last pieces of its stock | iPhone SE (375×667) | Fast 3G | out-rajshahi | ✅ PASS | 1256 | 3.1 s · 3.3 s · 0.6 s · 3.5 s · 4.2 s |  |
| 5 | Mock bKash, paid ahead (gate check 1) | Mid Android (393×873) | 4G | — | ⏭️ SKIP | — | — | skip paid ahead: bKash is not offered at the checkout (Payments › mobile wallets) |
| 6 | Mock bKash fails, then the retry (gate check 21) | iPhone 13/14 (390×844) | 4G | — | ⏭️ SKIP | — | — | skip fail then retry: bKash is not offered at the checkout (Payments › mobile wallets) |
| 7 | One customer, eight orders in a month, three cancelled | Low-end Android (360×640, 4× slower CPU) | 4G | dhk-mirpur, out-khulna, sub-fatullah, out-barishal, out-sylhet, out-rangpur, dhk-gulshan, out-mymensingh | ✅ PASS | 1257, 1258, 1259, 1260, 1261, 1262, 1263, 1264 | 0.9 s · 0.9 s · 0.3 s · 1.3 s · 1.4 s |  |
| 8 | The Bengali checkout (/bn), Bengali digits in the phone | Mid Android (393×873) | Fast 3G | out-bogura-bn | ✅ PASS | 1265 | 3.1 s · 3.4 s · 0.7 s · 4.0 s · 4.7 s |  |
| 9 | A wrong phone number and a missing address first, then corrected | iPhone 13/14 (390×844) | 4G | out-coxs-bazar | ✅ PASS | 1266 | 0.8 s · 0.8 s · 0.2 s · 1.1 s · 1.3 s |  |
| 10 | Double-tap on Confirm, a reload mid-checkout and Back after it | Mid Android (393×873) | 4G | dhk-uttara | ✅ PASS | 1267 | 0.8 s · 0.8 s · 0.2 s · 1.1 s · 1.4 s |  |
| 11 | The network drops while the order is sent, then he presses again | Mid Android (393×873) | Fast 3G | out-cumilla | ✅ PASS | 1268 | 3.2 s · 3.4 s · 0.6 s · 3.6 s · 4.3 s |  |
| 12 | A guest order, then signed in with the sign-in code (mock SMS) | iPhone 13/14 (390×844) | Wifi | dhk-mohammadpur-bn, out-jashore | ✅ PASS | 1269, 1270 | 0.4 s · 0.4 s · 0.1 s · 0.3 s · 0.7 s |  |
| 13 | Delivery inside Dhaka, a Dhaka suburb and outside Dhaka, with the owner's charges | Tablet (820×1180) | 4G | dhk-motijheel-mixed, sub-savar, out-kushtia | ✅ PASS | 1271, 1272, 1273 | 0.8 s · 0.8 s · 0.2 s · 1.1 s · 1.3 s | skip dhaka charge: no delivery band is switched on yet (the owner's delivery charges): only the address round trip is checked; skip suburb charge: no delivery band is switched on yet (the owner's delivery charges): only the address round trip is checked; skip outside charge: no delivery band is switched on yet (the owner's delivery charges): only the address round trip is checked |
| 14 | A coupon the owner made (only one with no use limit; none is ever made) | Desktop 1920×1080 | Wifi | — | ⏭️ SKIP | — | — | skip coupon: the owner has no open coupon without a use limit: none is made by the run |
| 15 | The admin adds a piece, records a payment and re-books (gate check 4) | Mid Android (393×873) | 4G | dhk-banani-long | ✅ PASS | 1274 | 1.4 s · 1.2 s · 0.2 s · 1.2 s · 1.5 s | skip re-booked at the new amount: recording payments by hand is off (owner's setting payments.manual) |
| 16 | Partial delivery, a return and an exchange (on the mocks) | Mid Android (393×873) | 4G | — | ⏭️ SKIP | — | — | skip partial, return, exchange: each needs a delivered parcel: on the preview site that would count as a real sale and move the courier's cash, so it is proved on the practice courier in CI (packages/payments and packages/orders return, exchange and partial-delivery database tests) and not here |
| 17 | Two shoppers race for the last piece | Mid Android (393×873) | Wifi | dhk-badda | ✅ PASS | 1275 | — |  |
| 18 | A 2.1 kg parcel, the courier's statement with a planted mismatch, and a gift (gate checks 24, 23, 7) | Desktop 1366×768 | 4G | out-patuakhali-mixed | ✅ PASS | 1276 | 0.8 s · 1.1 s · 0.3 s · 1.1 s · 1.5 s |  |

## The six gate checks that need an order (GATE-phase2 plan rows 1, 4, 7, 21, 23, 24)

| Check | What | Result | How it was proved |
|---|---|---|---|
| 1 | A mock-bKash-paid order: no message asks for money and the sticker says collect 0 | ⏭️ SKIP | its scenario (5) was skipped: bKash is not offered at the checkout (Payments › mobile wallets) |
| 4 | Book, record a payment, re-book: the courier gets the new cash-on-delivery amount | ⏭️ SKIP | recording payments by hand is off (owner's setting payments.manual) |
| 7 | Gift: sticker and receiver's details only while gift mode (checkout.gift) is on | ⏭️ SKIP | gift mode is off (checkout.gift): no gift order, no gift sticker and no receiver's message — as it should be |
| 21 | bKash fails, then the retry: one order, one paid payment | ⏭️ SKIP | bKash is not offered at the checkout (Payments › mobile wallets) |
| 23 | The courier's statement with a planted mismatch is flagged | ✅ PASS | our parcel: MISMATCH NOT_COLLECTED; a parcel we never booked: MISMATCH UNKNOWN_PARCEL |
| 24 | A 2.1 kg parcel follows its weight slab | ⏭️ SKIP | no courier rate card is entered yet (owner data): the weight was sent right, the slab price is not checked |

## Timings: phone vs desktop per network (median per step)

| Network | Screen | Orders | First load | Product page | Add to bag | Checkout open | Submit → thank-you |
|---|---|---|---|---|---|---|---|
| Slow 3G | phone | 1 | 11 s | 12 s | 2.1 s | 13 s | 14 s |
| Fast 3G | phone | 3 | 3.1 s | 3.4 s | 0.6 s | 3.6 s | 4.3 s |
| 4G | desktop | 1 | 0.8 s | 1.1 s | 0.3 s | 1.1 s | 1.5 s |
| 4G | phone | 6 | 0.8 s | 0.8 s | 0.2 s | 1.1 s | 1.3 s |
| Wifi | desktop | 1 | 0.3 s | 0.3 s | 0.1 s | 0.4 s | 0.7 s |
| Wifi | phone | 1 | 0.4 s | 0.4 s | 0.1 s | 0.3 s | 0.7 s |

## Addresses: typed → stored → admin → courier → sticker

Every order used its own address. A row fails when a word, a digit or the phone number arrives changed at any stage (spacing and line breaks are forgiven). `Place` is how the shop read the area: OK, WIDER (only the district), OTHER (another area of the same district), UNREAD (not read; the order still went through, PR 563), WRONG (another district: a fail).

| Order | Address (test data) | Quirk | Phone typed as | Stored | Admin | Courier | Sticker | Place | Band · charge | Result | Differences |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1253 | dhk-dhanmondi |  | bengali | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1254 | sub-tongi |  | plus880 | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1255 | out-chattogram |  | 880 | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1256 | out-rajshahi |  | spaced | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1257 | dhk-mirpur |  | local | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1258 | out-khulna |  | bengali | ✓ | ✓ | skip | skip | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1259 | sub-fatullah |  | plus880 | ✓ | ✓ | skip | skip | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1260 | out-barishal |  | 880 | ✓ | ✓ | skip | skip | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1261 | out-sylhet |  | spaced | ✓ | ✓ | skip | skip | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1262 | out-rangpur |  | local | ✓ | ✓ | skip | skip | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1263 | dhk-gulshan |  | bengali | ✓ | ✓ | skip | skip | OK | dhaka-city · 0 | ✅ PASS |  |
| 1264 | out-mymensingh |  | plus880 | ✓ | ✓ | skip | skip | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1265 | out-bogura-bn | bengali | bengali | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1266 | out-coxs-bazar |  | spaced | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1267 | dhk-uttara |  | local | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1268 | out-cumilla |  | bengali | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1269 | dhk-mohammadpur-bn | bengali | plus880 | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1270 | out-jashore |  | 880 | ✓ | ✓ | skip | skip | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1271 | dhk-motijheel-mixed | mixed | spaced | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1272 | sub-savar |  | local | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1273 | out-kushtia |  | bengali | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |
| 1274 | dhk-banani-long | long | plus880 | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1275 | dhk-badda |  | spaced | ✓ | ✓ | ✓ | ✓ | OK | dhaka-city · 0 | ✅ PASS |  |
| 1276 | out-patuakhali-mixed | mixed | local | ✓ | ✓ | ✓ | ✓ | OK | outside-dhaka · 0 | ✅ PASS |  |

Coverage: 8 divisions (barishal, chattogram, dhaka, khulna, mymensingh, rajshahi, rangpur, sylhet); 13 districts outside Dhaka.

## Clean-up (nothing deleted)

- Test orders cancelled through the normal cancel path: 21 now, 255 were already closed.
- Test products archived: 3; their colours, sizes and stock shelf: 10. The test courier account the run added is archived.
- Sales (delivered only): no test order counts as a sale (0 test orders counted as sales, 0 test pieces in sales by SKU (delivered only)).
- Marked as tests: 261 of 276 test orders carry an internal "GATE TEST" note (the order flags take only the owner's own list)
- Refund requests the cancels recorded for the mock-paid test orders: 10 (requests only, no money moved; the mock never took any). The owner may close them on Money › Refunds.
- the shop's web processes told to drop the pages of 3 test product(s) and every category list (cache bus)

How to run: GitHub › Actions › **gate-orders** › Run workflow (by hand only). `scenarios`: all, or a list such as `1,5,7`; `allow_cod` (off unless the owner says so) switches cash on delivery on for the run only and puts it back. The run places real orders only on the preview host and only on the mocks; it never runs on a schedule.

## Safety net

- Safety net: cash on delivery not touched; test-pay grant closed.
- ক্যাশ অন ডেলিভারিতে হাত দেওয়া হয়নি। টেস্ট-পেমেন্টের অনুমতি বন্ধ।
- Start check: nothing left open by an earlier run
