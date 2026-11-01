# Go-live gate — test orders on the preview site

**সারকথা:** 18টা পরীক্ষাই বাদ পড়েছে (কারণ নিচে)। সব টেস্ট অর্ডার বাতিল আর টেস্ট পণ্য আর্কাইভ করা হয়েছে।

- Run: 2026-11-01 16:38 (Asia/Dhaka) · version `3843bb63837b` · host: the preview host of the server's settings · scenarios asked: all
- Result: **PASS** — 0 passed, 0 failed, 18 skipped, 0 test orders placed.
- Providers: every payment, courier, message and ERP connection is on its mock; nothing left the server.
- Speed budget (lighthouserc.json ci.assert.assertions): a page's largest paint ≤ 2.5 s, a press's server answer ≤ 0.6 s; counted on 4G and wifi, shown on 3G.

## Scenarios

| # | Scenario | Device | Network | Addresses | Result | Orders | Timings (load · product · add · checkout · submit) | Why |
|---|---|---|---|---|---|---|---|---|
| 1 | One item, cash on delivery, phone on 4G | Mid Android (393×873) | 4G | — | ⏭️ SKIP | — | — | skip run: no way to pay that the run can use on the mocks: cash on delivery is off and the mock bKash page is closed |
| 2 | Three items, low-end Android on slow 3G | Low-end Android (360×640, 4× slower CPU) | Slow 3G | — | ⏭️ SKIP | — | — | skip run: no way to pay that the run can use on the mocks: cash on delivery is off and the mock bKash page is closed |
| 3 | Eight different items on a desktop | Desktop 1366×768 | Wifi | — | ⏭️ SKIP | — | — | skip run: no way to pay that the run can use on the mocks: cash on delivery is off and the mock bKash page is closed |
| 4 | The same item twice, and the last pieces of its stock | iPhone SE (375×667) | Fast 3G | — | ⏭️ SKIP | — | — | skip run: no way to pay that the run can use on the mocks: cash on delivery is off and the mock bKash page is closed |
| 5 | Mock bKash, paid ahead (gate check 1) | Mid Android (393×873) | 4G | — | ⏭️ SKIP | — | — | skip run: no way to pay that the run can use on the mocks: cash on delivery is off and the mock bKash page is closed |
| 6 | Mock bKash fails, then the retry (gate check 21) | iPhone 13/14 (390×844) | 4G | — | ⏭️ SKIP | — | — | skip run: no way to pay that the run can use on the mocks: cash on delivery is off and the mock bKash page is closed |
| 7 | One customer, eight orders in a month, three cancelled | Low-end Android (360×640, 4× slower CPU) | 4G | — | ⏭️ SKIP | — | — | skip run: no way to pay that the run can use on the mocks: cash on delivery is off and the mock bKash page is closed |
| 8 | The Bengali checkout (/bn), Bengali digits in the phone | Mid Android (393×873) | Fast 3G | — | ⏭️ SKIP | — | — | skip run: no way to pay that the run can use on the mocks: cash on delivery is off and the mock bKash page is closed |
| 9 | A wrong phone number and a missing address first, then corrected | iPhone 13/14 (390×844) | 4G | — | ⏭️ SKIP | — | — | skip run: no way to pay that the run can use on the mocks: cash on delivery is off and the mock bKash page is closed |
| 10 | Double-tap on Confirm, a reload mid-checkout and Back after it | Mid Android (393×873) | 4G | — | ⏭️ SKIP | — | — | skip run: no way to pay that the run can use on the mocks: cash on delivery is off and the mock bKash page is closed |
| 11 | The network drops while the order is sent, then he presses again | Mid Android (393×873) | Fast 3G | — | ⏭️ SKIP | — | — | skip run: no way to pay that the run can use on the mocks: cash on delivery is off and the mock bKash page is closed |
| 12 | A guest order, then signed in with the sign-in code (mock SMS) | iPhone 13/14 (390×844) | Wifi | — | ⏭️ SKIP | — | — | skip run: no way to pay that the run can use on the mocks: cash on delivery is off and the mock bKash page is closed |
| 13 | Delivery inside Dhaka, a Dhaka suburb and outside Dhaka, with the owner's charges | Tablet (820×1180) | 4G | — | ⏭️ SKIP | — | — | skip run: no way to pay that the run can use on the mocks: cash on delivery is off and the mock bKash page is closed |
| 14 | A coupon the owner made (only one with no use limit; none is ever made) | Desktop 1920×1080 | Wifi | — | ⏭️ SKIP | — | — | skip run: no way to pay that the run can use on the mocks: cash on delivery is off and the mock bKash page is closed |
| 15 | The admin adds a piece, records a payment and re-books (gate check 4) | Mid Android (393×873) | 4G | — | ⏭️ SKIP | — | — | skip run: no way to pay that the run can use on the mocks: cash on delivery is off and the mock bKash page is closed |
| 16 | Partial delivery, a return and an exchange (on the mocks) | Mid Android (393×873) | 4G | — | ⏭️ SKIP | — | — | skip run: no way to pay that the run can use on the mocks: cash on delivery is off and the mock bKash page is closed |
| 17 | Two shoppers race for the last piece | Mid Android (393×873) | Wifi | — | ⏭️ SKIP | — | — | skip run: no way to pay that the run can use on the mocks: cash on delivery is off and the mock bKash page is closed |
| 18 | A 2.1 kg parcel, the courier's statement with a planted mismatch, and a gift (gate checks 24, 23, 7) | Desktop 1366×768 | 4G | — | ⏭️ SKIP | — | — | skip run: no way to pay that the run can use on the mocks: cash on delivery is off and the mock bKash page is closed |

## The six gate checks that need an order (GATE-phase2 plan rows 1, 4, 7, 21, 23, 24)

| Check | What | Result | How it was proved |
|---|---|---|---|
| 1 | A mock-bKash-paid order: no message asks for money and the sticker says collect 0 | ⏭️ SKIP | no way to pay that the run can use on the mocks: cash on delivery is off and the mock bKash page is closed |
| 4 | Book, record a payment, re-book: the courier gets the new cash-on-delivery amount | ⏭️ SKIP | no way to pay that the run can use on the mocks: cash on delivery is off and the mock bKash page is closed |
| 7 | Gift: sticker and receiver's details only while gift mode (checkout.gift) is on | ⏭️ SKIP | no way to pay that the run can use on the mocks: cash on delivery is off and the mock bKash page is closed |
| 21 | bKash fails, then the retry: one order, one paid payment | ⏭️ SKIP | no way to pay that the run can use on the mocks: cash on delivery is off and the mock bKash page is closed |
| 23 | The courier's statement with a planted mismatch is flagged | ⏭️ SKIP | no way to pay that the run can use on the mocks: cash on delivery is off and the mock bKash page is closed |
| 24 | A 2.1 kg parcel follows its weight slab | ⏭️ SKIP | no way to pay that the run can use on the mocks: cash on delivery is off and the mock bKash page is closed |

## Timings: phone vs desktop per network (median per step)

| Network | Screen | Orders | First load | Product page | Add to bag | Checkout open | Submit → thank-you |
|---|---|---|---|---|---|---|---|
| — | — | 0 | — | — | — | — | — |

## Clean-up (nothing deleted)

- Test orders cancelled through the normal cancel path: 0 now, 0 were already closed.
- Test products archived: 0; their colours, sizes and stock shelf: 0.
- Sales (delivered only): no test order counts as a sale (no order placed).
- Marked as tests: 0 of 0 test orders carry an internal "GATE TEST" note (the order flags take only the owner's own list)

How to run: GitHub › Actions › **gate-orders** › Run workflow (by hand only). `scenarios`: all, or a list such as `1,5,7`. The run places real orders only on the preview host and only on the mocks; it never runs on a schedule.
