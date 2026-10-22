# SIMULATION-REPORT — the 50-order real-life journey simulation (demo V12.2)

*Run 23 Oct 2026 · plan `docs/qa/SIMULATION-PLAN.md` v1 (CN-013, owner Note 55) · demo `EXTAS-demo-V12.2.html` (8,102,352 bytes) · one headless Chromium, closed between the 5 batches · sample names and numbers only (0171000xxxx) · nothing was fixed in the demo during the run.*
*Bengali one-page summary for the owner: `SIMULATION-SUMMARY-BN.md` (same folder). Progress log: `SIM-PROGRESS.md`.*

---

## 1. Executive summary

**What ran.** All 50 orders of the plan, in 5 batches of 10, through the demo's own screens: ad landing page, search, product page, combo and set pages, bag, checkout (typed with the keyboard), thank-you page, My account, the exchange wizard, and in the admin: Orders, Review queue, Couriers, Fulfilment, Exchanges & returns, Support inbox, Coupons, Settings, Hero & campaigns, Finance and Expenses. 48 orders reached a real order record; 2 (the bulk buyers, orders 10 and 40) could only become an enquiry, because the demo has no bulk lane. Real life added 3 more orders (a duplicate tap, a re-ship after a try-on, and the earlier refusal of the order-35 fraudster), so the books hold **51 simulation orders**. Afterwards the back office was reconciled (stock, P&L with ad spend, courier and COD, RTO, packaging, salaries and expenses, support, fraud queue), and 4 short verification probes were run on a copy of the data.

**Result in one line: not ready to take real orders yet.** The shop side is strong: phone numbers in every format (Bengali digits too) are cleaned and said back, the Gabtali/Gabtoli collision is settled by district, a double tap makes one order, the checkout draft survives a day, and the Polo Duo price and the totals agree on bag, checkout, order and invoice in all 46 orders where they were compared. Stock is held at once and released on cancel, and the review queue never blocks anyone. But **10 Urgent problems** would cost money or lose orders on day one.

| | Count |
|---|---:|
| Orders run | 50 (+3 real-life extras = 51 order records; 2 bulk enquiries had no order) |
| Delivered / RTO / lost in transit / cancelled before dispatch | 39 / 6 / 1 / 5 |
| Checkpoint results scored by the scripts | 257 pass · 45 fail · 30 gap |
| **Findings** | **39: Urgent 10 · Important 25 · Can wait 4** |
| COD reconciliation | 45 parcels · ৳59,137 collected · 4 of 4 planted traps flagged, 0 explained · ৳812 unexplained + ৳1,568 missing |
| Stock | 48 SKUs consistent with the system's own formula · 4 real-world variances the system cannot see |

**Top 5 problems (all Urgent)**

1. **Paid customers are told to pay again.** Every bKash, Nagad and card order (8 in the run) got "Pay ৳X on delivery" in the confirmation SMS (F-001).
2. **"Book all" on the Couriers page books cancelled orders.** In the check, 5 cancelled orders got consignment numbers with COD amounts (F-002).
3. **The charge the customer sees is not the charge the order keeps** when the address is unclear and the customer picks the area: shown ৳680, stored ৳720 (F-003).
4. **Changes after the courier is booked do not reach the parcel.** Booking from the Couriers page leaves the order "confirmed", so the customer can still add items or change the address: the sticker said ৳730, the invoice ৳1,080 (F-004).
5. **Door outcomes the couriers support do not exist**: partial delivery, "return with delivery charge paid", failed attempt. Money and stock go wrong on the first partial (order 03: ৳1,700 booked, ৳850 real) (F-005).

The other Urgent items: oversold stock hidden by clipping at zero (F-006), gift parcels sent to the payer's address (F-007), wrong-item exchange restocks the wrong SKU (F-022), hard-coded customer texts and an owner domain in code (F-033), and guest accounts whose password is the phone number (F-039).

**Biggest growth levers seen in the run.** The RTO rate was 13% (6 of 46 dispatched) and every RTO came from a door moment (try-on size, phone off, late Eid parcel, change of mind). A delivery-day reminder, a prepaid nudge, an advance for flagged buyers and partial-delivery rules attack exactly these. Coupons and referral codes do not work for guests, so the Eid code and the referral programme reach only logged-in buyers.

**Reconciliation result.** Stock: the system's own arithmetic holds (48/48 SKUs), but it cannot see 4 real variances (partial 03, wrong item 47, oversold 39, lost 25). COD: all 4 planted traps were flagged as mismatches, none with a reason, and the demo's mock statement pays exactly what is expected, so settlement days cannot be measured. P&L: contribution ৳33,525 on 39 delivered orders (৳860 each) before ads; after a sample ad spend of ৳18,000 (৳462 per delivered order) it is ৳15,525 (৳398 each). Fixed costs of ৳45,000 a month need about 113 delivered orders a month to break even. The demo's own P&L understates RTO cost: it counts ৳305 of return fees, while the research model puts the 6 RTOs at ৳1,500–4,200.

---

## 2. How it was run, and the limits

- **Driver.** Playwright 1.56, one persistent Chromium profile, desktop 1366 px (phone 390 px for orders 06, 12 and 34; 150% text for order 12). Typing went through the keyboard so the demo's debounced address reader ran; every admin action was a click on the real button and the real "Yes" confirm. Page state was read only to *check* what the screens did. Scripts: `scratchpad/sim/` (`lib.js`, `flows.js`, `orders*.js`, `run.js`, `recon.js`); raw results per order in `scratchpad/sim/results/NN.json`, reconciliation in `recon.json`.
- **Demo data** was reset once before order 01 and never again, so state accumulated like a real shop. The demo's own 6 sample orders stay in the lists and are left out of every figure below.
- **Stock substitutions.** Several plan sizes were sold out in the demo stock (e.g. striped-rib polo L in every colour, navy piqué L). The driver did what a customer does (another colour, else the next size) and logged each change in the order's notes.
- **Calendar.** The simulated clock only moves forward, and the run finished each order's life (delivery, exchange window, refusal) before the next order. That stretched the plan's 18 days to 110 calendar days (order 50 on 19 Feb 2027). Same-day duplicate checks, exchange windows and the 3-day settlement flag were unaffected. The Eid cut-off check was repeated with dates around the clock (probe 4, §5.6). The P&L below therefore uses the plan's 20-day period, not the demo's calendar. (A lesson is filed.)
- **What the demo cannot do** (a real courier API, SMS, a payment gateway, a network drop) was played as an event card and recorded as a **demo gap**, with its register PR and an acceptance test for staging (§9).
- **Verification probes** (on a copy of the data, not counted as orders): (1) "Book all" with cancelled orders in the list; (2) an unclear address with the area picked by the customer; (3) an add-on after a Couriers-page booking; (4) the Eid order-by banner with dates around the simulated "today".
- **Not updated:** `BLOCKED.md` and the per-agent lesson files (`docs/agents/lessons/<agent>.md`) were outside this run's brief; the proposals in §8 are ready to copy into `BLOCKED.md`.

---

## 3. Per-order table

| # | Day | Persona | Items (plan) | Pay | Order | Outcome | CP pass/fail/gap | Findings |
|---|---|---|---|---|---|---|---|---|
| 01 | D1 | FT | Polo Duo ×2 (landing) | COD | EX-1043 | Delivered | 11/1/1 | F-031, F-034 |
| 02 | D1 | FT | Textured knit polo L | bKash | EX-1044 | Delivered | 8/2/1 | F-001, F-020 |
| 03 | D1 | FT | Piqué polo M+L same colour | COD | EX-1045 | Delivered in full in the demo (real: partial — kept L) | 7/1/2 | F-005, F-036 |
| 04 | D2 | RP | Crew tee ×3 S/M/L, wallet | COD | EX-1046 | Delivered | 8/0/0 | F-036 |
| 05 | D2 | OD | Oxford shirt + chino | COD | EX-1047 | Delivered day 3 | 7/0/0 | — |
| 06 | D2 | OD+3G | Panjabi XL | COD | EX-1048 | Delivered late (no late alert) | 5/1/3 | F-017, F-030 |
| 07 | D3 | FR | Hoodie ×2 (Test Bhai) | COD | EX-1049 | Held → call → declined (no advance) | 2/0/1 | F-013, F-014, F-016 |
| 08 | D3 | FR | Polo + Chino combo (prank) | COD | EX-1050 | Cancelled before packing | 2/0/0 | F-013, F-015, F-038 |
| 09 | D3 | GF | Panjabi L gift | bKash | EX-1051 | Delivered (receiver not on sticker) | 3/2/1 | F-001, F-007 |
| 10 | D4 | BK | 40 logo polos (bulk) | — | — | Enquiry only — no bulk lane | 0/2/1 | F-012, F-023 |
| 11 | D4 | AN | Heavy tee black XL | COD | EX-1052 | Delivered → free replacement, old = B-grade | 7/1/0 | F-012 |
| 12 | D4 | EL | Panjabi XXL (elderly) | COD | EX-1053 | Delivered (agent re-keyed order) | 8/1/1 | F-024, F-025 |
| 13 | D5 | BN | Polo Duo (বাংলা) | COD | EX-1054 | Delivered | 7/1/0 | F-025 |
| 14 | D5 | AB | Linen shirt + belt | COD | EX-1055 | Delivered after draft restore | 6/0/1 | F-026 |
| 15 | D5 | FT | Zip polo + socks, VIP15 | COD | EX-1056 | Delivered (code refused) | 5/1/0 | F-009 |
| 16 | D6 | RP | Hoodie-jogger set | Nagad | EX-1057 | Delivered (1 order on double tap) | 7/1/0 | F-001, F-026 |
| 17 | D6 | OD | 2 polos + chino, wrong phone | COD | EX-1058 | Delivered after customer self-edit of phone | 6/1/0 | F-015, F-037 |
| 18 | D6 | FT | Contrast polo M, double tap | COD | EX-1059, EX-1060 | Delivered; duplicate EX-1060 declined | 7/1/0 | F-013 |
| 19 | D7 | OD | Twill 34, Gabtali Bogura | COD | EX-1061 | Delivered, zone right | 6/0/1 | F-017 (zone id) |
| 20 | D7 | FT | Rib polo, cancel 2 h | COD | EX-1062 | Cancelled, stock released | 2/1/0 | F-012, F-013 |
| 21 | D7 | RP | 6 items | Card | EX-1063 | Delivered | 4/2/0 | F-001, F-029 |
| 22 | D8 | FT | Long-sleeve polo XL try-on | COD | EX-1064, EX-1065 | Try-on refusal → RTO; re-ship EX-1065 delivered | 6/1/1 | F-005, F-021 |
| 23 | D8 | OD | Polo Duo, door bargaining | COD | EX-1066 | Delivered (bargaining as note) | 4/0/1 | F-017 |
| 24 | D8 | FT | Hoodie L, rider +৳50 | COD | EX-1067 | Delivered; overcharge unlogged | 5/1/1 | F-012, F-017 |
| 25 | D9 | OD | Shirt + chino, lost | COD | EX-1068 | Stuck 'On the way' (lost) | 3/0/3 | F-017 |
| 26 | D9 | RP | Polo + Chino, damaged | bKash | EX-1069 | Delivered → free replacement, old = damaged | 6/1/1 | F-001, F-017 |
| 27 | D9 | FT | 2 tees, not reachable | COD | EX-1070 | RTO (not reachable) | 6/0/1 | F-017 |
| 28 | D10 | AN | Zip polo, 6 days late | COD | EX-1071 | Delivered 6 days late | 4/2/0 | F-012, F-018 |
| 29 | D10 | FT | Pocket tee, photo review | COD | EX-1072 | Delivered; review never published | 6/2/0 | F-008 |
| 30 | D10 | GF | Hoodie set gift, date | bKash | EX-1073 | Delivered (to payer zone) | 3/3/0 | F-001, F-007 |
| 31 | D10 | BN+EL | Panjabi + chino via Messenger | COD | EX-1074 | Delivered | 6/2/0 | F-012, F-024, F-025 |
| 32 | D10 | FT | Knit polo M→L exchange | COD | EX-1075 | Delivered → exchange M→L done | 8/0/0 | F-031 |
| 33 | D10 | RP | Chino, exchange D+4 | COD | EX-1076 | Delivered; exchange refused (window) | 7/0/0 | — |
| 34 | D10 | 3G | Polo Duo, Slow 3G | COD | EX-1077 | Delivered | 6/0/2 | F-026 |
| 35 | D10 | FR | Hoodie ×3, new number | COD | EX-1079, EX-1078 | History EX-1078 RTO; EX-1079 held → declined | 2/0/1 | F-014, F-015, F-016 |
| 36 | D11 | FT | Panjabi ×2, Eid | COD | EX-1080 | Delivered | 7/1/0 | F-019 |
| 37 | D11 | OD | Panjabi M after cut-off | COD | EX-1081 | Refused after Eid → RTO | 5/1/0 | F-019, F-038 |
| 38 | D11 | GF | Panjabi gift, Eid | bKash | EX-1082 | Delivered | 3/2/0 | F-001, F-007 |
| 39 | D12 | RP | Panjabi ×2 + polo, oversold | COD | EX-1083 | Delivered with a short piece | 6/1/0 | F-006 |
| 40 | D12 | BK | 25 panjabis (bulk) | — | — | Enquiry only — no bulk lane | 0/1/1 | F-023 |
| 41 | D12 | FT | Panjabi L, self-confirm | COD | EX-1084 | Delivered | 5/1/1 | F-011 |
| 42 | D13 | FR | 4 panjabis, refuser | COD | EX-1085 | Refused → RTO | 5/1/1 | F-015, F-038 |
| 43 | D13 | AB | Panjabi, bKash→COD | bKash→COD | EX-1086 | Delivered (one order) | 6/0/1 | F-026 |
| 44 | D13 | BN | Panjabi + belt, EID code | COD | EX-1087 | Delivered without coupon | 5/1/0 | F-009 |
| 45 | D14 | OD+3G | Panjabi, address change | COD | EX-1088 | Delivered (address edited after booking) | 1/1/0 | F-004 |
| 46 | D16 | RP | Crew tee ×3, reminder | COD | EX-1089 | Delivered with EID code | 6/0/1 | F-032 |
| 47 | D16 | AN | Linen shirt, wrong item | Card | EX-1090 | Delivered → free exchange | 2/2/0 | F-001, F-010, F-022 |
| 48 | D17 | OD | Hoodie-jogger set, partial | COD | EX-1091 | Whole set refused → RTO | 4/0/1 | F-005 |
| 49 | D17 | FT | Chino + belt, add socks | COD | EX-1092 | Delivered with add-on | 5/1/0 | F-031 |
| 50 | D18 | RP | Office Trio, referral | COD | EX-1093 | Delivered; referral refused | 7/1/0 | F-009 |

Order ids are the demo's. "CP pass/fail/gap" counts the checkpoints each order's script scored (the plan's focus checkpoints, plus the automatic checks on totals, messages, sticker and booking). Three results were corrected in review (02 CP13, 24 CP15, 47 CP15; see `results/*.json` → `reviewCorrections`).

### 3.1 Scorecard — 50 orders × 17 checkpoints

P = pass · **F** = fail · G = gap (needs the server build) · · = not scored for that order.

| # | 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 09 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 01 | P | P | **F** | · | · | P | P | P | P | P | P | P | P | P | G | – | – |
| 02 | · | P | · | · | P | P | G | **F** | **F** | P | P | P | P | P | – | – | – |
| 03 | · | · | · | · | P | P | · | P | P | P | P | P | G | **F** | · | G | · |
| 04 | · | · | · | · | · | P | · | P | · | P | P | P | P | P | · | · | P |
| 05 | · | · | · | · | · | P | P | P | · | P | P | P | P | · | · | · | · |
| 06 | · | · | G | · | · | P | P | P | **F** | P | P | G | G | · | · | · | · |
| 07 | · | · | · | · | · | P | G | · | P | · | · | · | · | · | · | · | · |
| 08 | · | · | · | · | · | P | · | · | P | · | · | · | · | · | · | · | · |
| 09 | · | · | · | · | · | P | P | **F** | · | **F** | P | G | · | · | · | · | · |
| 10 | · | G | · | · | · | **F** | · | · | · | · | · | · | · | · | **F** | · | · |
| 11 | · | · | · | · | · | P | · | P | · | P | P | P | P | · | **F** | P | · |
| 12 | · | **F** | · | · | P | P | P | P | · | P | P | P | P | · | G | · | · |
| 13 | · | · | **F** | · | · | P | P | P | · | P | P | P | P | · | · | · | · |
| 14 | · | · | · | · | · | P | P | G | · | P | P | P | P | · | · | · | · |
| 15 | · | · | · | · | · | **F** | · | P | · | P | P | P | P | · | · | · | · |
| 16 | · | · | · | · | · | P | P | **F** | · | P | P | P | P | · | · | · | P |
| 17 | · | · | · | · | · | P | · | P | **F** | P | P | P | P | · | · | · | · |
| 18 | · | · | · | · | · | P | P | **F** | P | P | P | P | P | · | · | · | · |
| 19 | · | · | · | · | · | P | P | P | · | P | G | P | P | · | · | · | · |
| 20 | · | · | · | · | · | P | · | · | P | · | · | · | · | · | **F** | · | · |
| 21 | · | · | · | · | · | P | · | **F** | · | P | **F** | P | P | · | · | · | · |
| 22 | · | · | · | · | · | P | · | P | · | P | P | P | G | · | **F** | P | · |
| 23 | · | · | · | · | · | P | · | P | · | P | P | · | G | · | · | · | · |
| 24 | · | · | · | · | · | P | · | P | · | P | P | P | G | · | **F** | · | · |
| 25 | · | · | · | · | · | P | · | P | · | P | G | G | · | G | · | · | · |
| 26 | · | · | · | · | · | P | · | **F** | · | P | P | P | P | G | · | P | · |
| 27 | · | · | · | · | · | P | · | P | · | P | P | G | P | P | · | · | · |
| 28 | · | · | · | · | · | P | · | P | · | P | P | **F** | · | · | **F** | · | · |
| 29 | · | · | · | · | · | P | · | P | · | P | P | P | P | · | **F** | · | **F** |
| 30 | · | · | · | · | · | P | **F** | **F** | · | P | P | **F** | · | · | · | · | · |
| 31 | · | · | · | · | **F** | P | · | P | · | P | P | P | P | · | **F** | · | · |
| 32 | · | · | · | · | · | P | · | P | · | P | P | P | P | · | P | P | · |
| 33 | · | · | · | · | · | P | · | P | · | P | P | P | P | · | P | · | · |
| 34 | · | · | G | · | · | P | G | P | · | P | P | P | P | · | · | · | · |
| 35 | · | · | · | · | · | P | G | · | P | · | · | · | · | · | · | · | · |
| 36 | P | · | **F** | · | · | P | · | P | · | P | P | P | P | · | · | · | · |
| 37 | · | · | · | · | · | P | **F** | P | · | P | P | · | P | · | · | · | · |
| 38 | · | · | · | · | · | P | · | **F** | · | P | P | **F** | · | · | · | · | · |
| 39 | · | · | · | · | · | P | · | P | · | P | P | P | P | · | **F** | · | · |
| 40 | · | · | · | · | · | **F** | · | · | · | G | · | · | · | · | · | · | · |
| 41 | · | · | · | · | · | P | · | **F** | G | P | P | P | P | · | · | · | · |
| 42 | · | G | · | · | · | P | · | P | **F** | P | P | · | P | · | · | · | · |
| 43 | · | · | · | · | · | P | P | G | · | P | P | P | P | · | · | · | · |
| 44 | · | · | · | · | · | **F** | · | P | · | P | P | P | P | · | · | · | · |
| 45 | · | · | · | · | · | P | · | · | · | · | **F** | · | · | · | · | · | · |
| 46 | · | · | · | · | · | P | · | P | · | P | P | P | P | · | · | · | G |
| 47 | · | · | · | · | · | P | · | · | · | **F** | · | · | · | · | **F** | P | · |
| 48 | · | · | · | · | · | P | · | P | · | P | P | · | G | · | · | · | · |
| 49 | · | · | · | · | · | P | · | **F** | · | P | P | P | P | · | · | · | · |
| 50 | · | · | · | · | · | P | · | P | · | P | P | P | P | · | P | · | **F** |

| Checkpoint | Pass | Fail | Gap | Not scored in the order script |
|---|---:|---:|---:|---:|
| CP01 Need | 2 | 0 | 0 | 48 |
| CP02 Discovery | 2 | 1 | 2 | 45 |
| CP03 Landing | 0 | 3 | 2 | 45 |
| CP04 Browse/search | 0 | 0 | 0 | 50 |
| CP05 Product page | 3 | 1 | 0 | 46 |
| CP06 Bag & offers | 46 | 4 | 0 | 0 |
| CP07 Checkout | 11 | 2 | 4 | 33 |
| CP08 Confirmation messages | 30 | 10 | 2 | 8 |
| CP09 Confirm call & fraud | 7 | 4 | 1 | 38 |
| CP10 Packing | 41 | 2 | 1 | 6 |
| CP11 Courier handover | 39 | 2 | 2 | 7 |
| CP12 Tracking | 31 | 3 | 4 | 12 |
| CP13 Door | 31 | 0 | 6 | 13 |
| CP14 COD settlement | 4 | 1 | 2 | 43 |
| CP15 Day 1–3 after | 3 | 10 | 2 | 35 |
| CP16 Return/exchange logistics | 5 | 0 | 1 | 44 |
| CP17 Repeat | 2 | 2 | 1 | 45 |
| **All** | **257** | **45** | **30** | |

CP04 (browse, filter, search) was only touched indirectly: searches for "polo shirt price" and "corporate polo" list polos, and a size sold out in every colour is hidden on the product page rather than shown crossed out (F-035). CP14 is scored on 7 orders above, but the reconciliation in §5.3 covers all 45 parcels.

---

## 4. Findings

Ranked Urgent → Important → Can wait; severity follows plan §5. "Register" gives the existing PR; "dated scope" means an "Updated 23 Oct" line on that PR. New items take the next free PR number (605 onwards) with a change note (CN-017 onwards); these numbers are proposals and are confirmed when filed. Several PRs named here are already merged in the real build (S00, S01, S09 and S10 lines of the register); for those the finding becomes a staging re-check.

### 4.1 Urgent (10)

### SIM-F-001 · Paid customers are told to pay again on delivery
- Order / checkpoint: SIM-02, 09, 16, 21, 26, 30, 38, 47 · CP08
- What happened: the "confirmed" SMS template is `…Pay {total} on delivery.` and `{total}` is the order total for every order. bKash, Nagad and card orders that had paid in full read, e.g., "EXTAS: Order EX-1044 confirmed and packed. Delivery within 24–48 hours. Pay ৳1,230 on delivery." Seen in Admin › Orders › order › Messages; desktop; English.
- Severity: Urgent (a wrong amount is shown to the customer; it invites a double payment or a refusal)
- Fix: give the templates `{due}` (total − paid) and `{paid}`, and a prepaid line "Paid ৳X by bKash — nothing to pay at the door". Read the same figure the invoice prints (`codDue`). Owner agent: doot (messages), sawdagor (amounts).
- Prevention: a template test matrix (COD / fully prepaid / part-paid / free delivery); a guard that any amount in an outgoing message equals the invoice's due figure (journey test "messages agree with the invoice"; checklist K11 extended to messages).
- Core-decision review: keep the 2-SMS + 1-WhatsApp rule; the template must branch on payment state. With the exact-amount line (idea 10), the same `{due}` feeds the sticker, the SMS and the tracking page.
- Growth idea: a prepaid "nothing to pay" line is itself a trust signal and supports a prepaid nudge (idea 1).
- Six angles: Technical — one variable, no payment-state awareness · Customer — "I already paid!" chats, possible refusal · Employee — reassurance calls · CEO — refusals on prepaid orders are pure loss · Owner — a wrong amount reaches customers · Supplier — the rider may try to collect; disputes with the courier.
- Register: PR 148, PR 505 (dated scope: `{due}` and payment-state templates), PR 166
- Status: open (demo and real build)

### SIM-F-002 · "Book all" on the Couriers page books cancelled orders
- Order / checkpoint: SIM-07, 08, 18 (duplicate), 20, 35 · CP11 · probe 1
- What happened: Couriers › Parcels "Ready to book" lists every order that has no parcel and is not delivered, cancelled ones included. On a copy of the end-of-run data, "Book all" gave consignments to the 5 cancelled orders (EX-1049 COD ৳3,300, EX-1050 ৳2,050, EX-1060 ৳1,030, EX-1062 ৳1,070, EX-1079 ৳4,950).
- Severity: Urgent (cancelled orders would be packed and shipped, including COD parcels to fraudsters and to people who cancelled)
- Fix: one "open for booking" filter shared by every booking path: status confirmed or packed, not cancelled or returned, not waiting in the review queue, no parcel yet. Owner agent: bhandari.
- Prevention: journey test "Book all with a cancelled and a held order in the list books neither"; lesson filed.
- Core-decision review: keep bulk booking (it is the Eid-day tool), but it must use the Fulfilment page's run list, which already leaves cancelled orders out.
- Growth idea: a booking preview ("12 parcels · ৳18,400 COD · 0 held") before the click.
- Six angles: Technical — two lists with different filters · Customer — a parcel he cancelled turns up · Employee — one click ships mistakes · CEO — wasted delivery charges, RTO · Owner — fraud decisions undone silently · Supplier — courier charges for returns of parcels that should never have left.
- Register: PR 176, PR 182 (dated scope on PR 176: booking filter = Fulfilment run list)
- Status: open

### SIM-F-003 · The delivery charge shown at checkout is not the charge stored on the order
- Order / checkpoint: probe 2 (unclear address "Notun Para, Shahid Minar er pashe", area chosen: Inside Dhaka) · CP07
- What happened: the checkout showed delivery ৳80 and total ৳680; the saved order has no zone, delivery ৳120, total ৳720 and an "Address check" flag. `placeOrder()` reads the zone again from the address text and ignores the area the checkout used. The same re-read happens when the customer edits the address later (`ord-edit-save`) and when staff set the zone (`ao-zone`); the staff fix also forgets a free-delivery promise.
- Severity: Urgent (a wrong charge is collected; owner rule "a wrong delivery charge loses the order", PR 549–553)
- Fix: the order stores the zone, band and delivery charge the checkout showed (sent with the order and re-checked on the server with the same inputs). An unclear address keeps the customer's choice and goes to the address queue (PR 563); the charge never changes without the customer being told. Owner agent: sawdagor.
- Prevention: test "shown = stored" for a recognised address, an unrecognised one with a chosen area, a free-delivery order, and an edit after placing; checklist line under K11.
- Core-decision review: keep "a district or postcode settles the band silently"; when nothing settles it, the customer's own choice is the contract.
- Growth idea: show the band chip under the address ("Inside Dhaka · ৳80") so the customer confirms it by sight.
- Six angles: Technical — two zone readers (checkout vs `placeOrder`) · Customer — the rider asks ৳40 more than the page said · Employee — door disputes · CEO — refusals · Owner — a standing rule broken · Supplier — courier band mismatch claims.
- Register: PR 125, PR 549–553, PR 563, PR 564 (dated scope on PR 125)
- Status: open

### SIM-F-004 · Changes after the courier is booked never reach the parcel
- Order / checkpoint: SIM-45 (address changed after booking), probe 3 (add-on after booking) · CP10, CP11
- What happened: booking from the Couriers page (or "Book all") does not move the order out of "confirmed". So My orders still offers "Edit order", and the thank-you page still offers "Add to this parcel". In probe 3, socks were added after booking: invoice due ৳1,080, sticker and courier COD ৳730, so the rider would under-collect ৳350. In order 45 the customer moved the parcel from Dhap, Rangpur to a village in Pirganj after booking: the sticker reprint shows the new address on the old consignment, the courier booking is unchanged, no resend charge is recorded and staff are not told.
- Severity: Urgent (the money collected is wrong; the parcel goes to an address the courier does not have)
- Fix: booking counts as "packed" for the customer: edits and add-ons close at booking on every path. After that, a change request goes to staff, who re-book (new consignment, COD updated, sticker reprinted). The sticker always reads the live amount due. Owner agent: bhandari + sawdagor.
- Prevention: test "after booking, edit and add-on are refused or re-book"; settlement keeps flagging any COD ≠ order due (it already does).
- Core-decision review: keep the add-on window (PR 127), but tie it to "not booked", not to the status word.
- Growth idea: the add-on stays profitable if offered at the right moment; the thank-you page could show the time left.
- Six angles: Technical — status and parcel state drift apart · Customer — pays the rider less or more than his invoice · Employee — re-work at the hub · CEO — loss per add-on · Owner — wrong money · Supplier — an address change is a courier resend charge (N16) nobody budgets.
- Register: PR 127, PR 143, PR 176, PR 179 (dated scope on PR 143 and PR 127)
- Status: open

### SIM-F-005 · Partial delivery and "return with the delivery charge paid" cannot be recorded
- Order / checkpoint: SIM-03 (kept L, returned M), SIM-22 (try-on return, customer pays the delivery charge), SIM-48 (kept the hoodie, refused the jogger) · CP13, CP14, CP16
- What happened: a parcel can only be Delivered or Refused. Order 03 was booked as delivered for ৳1,700, although the real cash was ৳850 and an M polo came back to the shelf. Order 22's ৳120 delivery charge, paid to the rider under the try-on policy (B1.17), appears nowhere. Order 48 had to be booked as a full refusal, so the hoodie sale was lost. In the COD check these show only as unexplained mismatches.
- Severity: Urgent (money and stock figures become wrong on the first partial)
- Fix: courier outcomes "Partially delivered (needs our approval)", "Returned — delivery charge paid" and "Attempt failed — reattempt", each with its money (amount collected, charges), stock (pieces back) and set-price rule. Owner agent: bhandari (+ gyani for money).
- Prevention: the skill `07-door-outcomes.md` (plan §9) with an exam case per outcome; staging acceptance tests in §9.
- Core-decision review: the try-on policy is right (it sells), but it needs its money path. The set-split price is an owner decision (P5).
- Growth idea: accepting partials instead of a full refusal keeps the sale of the kept piece (৳1,550 in order 48).
- Six angles: Technical — no state for the outcome · Customer — the rider cannot let him keep one piece · Employee — notes and spreadsheet fixes · CEO — lost partial sales, wrong P&L · Owner — the set-split price needs his rule · Supplier — Steadfast and Paperfly charge for partials (+50% at Paperfly, N17).
- Register: PR 166, PR 184, PR 525, PR 526, PR 212 (idea 12: new scope on 166 + 184 + 212)
- Status: demo gap (needs the server build); acceptance tests in §9

### SIM-F-006 · Oversold stock is hidden and the parcel goes out short
- Order / checkpoint: SIM-39 · CP10
- What happened: order 39 held the last sky panjabi S; then an ERP sync removed 2 pieces (sold in the outlet). Available stock is clipped to 0 instead of −1; Fulfilment shows "Short: 0"; no resolution card appears; the order was packed, booked and delivered as if complete.
- Severity: Urgent (stock figures are wrong; a customer receives fewer pieces than he pays for)
- Fix: never clip negative available stock. A negative SKU raises the resolution card on every order holding it (swap size, ship the rest, cancel the line — the team decides, blueprint B1.15 #2) and blocks booking that order until decided. Owner agent: bhandari.
- Prevention: a test with an ERP sync that takes stock below what open orders hold; the stock-audit report lists negatives.
- Core-decision review: keep the shared stock pool (PR 197); it makes oversell possible at peak, so the shortage path must exist.
- Growth idea: at Eid, a "last pieces" alert to the outlet before it sells what the website holds.
- Six angles: Technical — `Math.max(0, …)` hides the signal · Customer — a missing piece, an angry chat · Employee — finds out at the packing table · CEO — refunds and RTO at peak · Owner — "never auto-cancel" holds, but someone must decide · Supplier — ERP/outlet sync timing.
- Register: PR 183, PR 195, PR 197, PR 203 (dated scope on PR 183)
- Status: open

### SIM-F-007 · Gift orders: the receiver and the date are collected but never used
- Order / checkpoint: SIM-09, 30, 38 · CP07, CP10, CP12
- What happened: with Gift mode on (Settings, CN-014 h), the checkout saves the receiver's name and phone, a note and "deliver on or after". None of them reaches the sticker, the courier booking, the messages or the packing list; the sticker says "To: Tahmid Hossain" (the payer). There is only one address box, so in order 30 the payer typed her Gulshan address plus "(deliver to Rangpur)": the order was zoned Inside Dhaka and booked to Dhaka. The receiver gets no message at all.
- Severity: Urgent (a genuine order is delivered to the wrong person and place)
- Fix: gift mode gets a separate "Deliver to" block (receiver, phone, full address with its own band) that the sticker, booking and courier calls use; the date goes on the sticker and in the booking note; the payer gets the order messages and the receiver one "a gift is coming" SMS (owner switch). Owner agent: sawdagor + bhandari.
- Prevention: field-consumption test (lesson): every gift field must appear on the sticker, the booking and the messages.
- Core-decision review: keep gift mode optional; when it is on, receiver ≠ payer is the whole point.
- Growth idea: gift wrap or a message card at Eid; "send to Abba" landing pages.
- Six angles: Technical — fields saved, not used · Customer — the gift never arrives · Employee — calls to sort out who and where · CEO — failed Eid gifts become public complaints · Owner — a feature he asked for does not work · Supplier — wrong-zone booking, resend charges.
- Register: CN-014 h (gift PR, next free in S04) + dated scope on PR 179 and PR 176
- Status: open

### SIM-F-022 · A wrong-item exchange restocks the item that was ordered, not the one that came back
- Order / checkpoint: SIM-47 · CP16
- What happened: a white linen shirt was ordered and a blue one was packed. The free exchange sends a white M and receives "the old line": the system books the returned piece as white M (QC good → stock), so white stays unchanged and blue never comes back into stock. There is no root-cause field (packer, wrong pick), and the packing photo (on, "required") had not been taken (F-010).
- Severity: Urgent (stock figures become wrong)
- Fix: QC of a returned piece records the SKU actually received (scan or pick), and a wrong-item case carries a root cause. Owner agent: bhandari.
- Prevention: test "returned SKU ≠ ordered SKU"; packing photo enforced (F-010).
- Core-decision review: keep "free if our mistake"; the money path is right, the stock path is not.
- Growth idea: wrong-pick rate per packer as a quality measure.
- Six angles: Technical — returned SKU assumed · Customer — fine after the swap · Employee — no proof either way · CEO — shrinkage nobody sees · Owner — the ERP is the stock master; a wrong push corrupts it · Supplier — none.
- Register: PR 185, PR 187, PR 188 (dated scope on PR 187)
- Status: open

### SIM-F-033 · Hard-coded customer texts and an owner domain in code defaults
- Order / checkpoint: SIM-01, 11, 20 · CP03, CP15
- What happened: the customer's "Message us" box says "We reply here and on WhatsApp, 10 am – 10 pm."; the landing page's Terms say "We confirm every order by phone or SMS" and "Prices are in Taka and include VAT"; the exact-amount line's default report link is `extas.com.bd/report`; the Eid feature ships with fixed 2027 dates; the AI draft texts are fixed English. None comes from settings.
- Severity: Urgent (hard rule 1 "nothing hard-coded"; CN-009 "owner values never in Git")
- Fix: move each text to its setting or rule (support hours, terms, report link empty by default, Eid dates empty). Low effort. Owner agent: doot.
- Prevention: the CI hardcode guard (PR 494, merged) gets these strings as test cases.
- Core-decision review: keep the rule.
- Growth idea: support hours from settings can drive a night-time "we reply at 10 am" auto-reply.
- Six angles: Technical — strings in code · Customer — wrong hours once they change · Employee — none · CEO — none · Owner — standing rule broken · Supplier — none.
- Register: PR 494, PR 215 (dated scope on PR 494)
- Status: open

### SIM-F-039 · An account made from a guest order has the phone number as its password
- Order / checkpoint: every order · CP17
- What happened: placing an order creates an account whose password is the phone number, and logs the browser in. The login page accepts phone + phone, so anyone who knows a customer's number can open his orders and address. The run itself used this to log repeat customers in (orders 16, 26, 33, 39, 46).
- Severity: Urgent (personal data leak)
- Fix: guest accounts get no password; first login by SMS code (PR 130); setting a password is optional afterwards. Owner agent: prohori.
- Prevention: security test "phone-as-password login fails"; a smoke check.
- Core-decision review: keep the automatic account (it powers repeat purchase), never with a guessable secret.
- Growth idea: the SMS-code login is also a verified phone, useful for fraud scoring.
- Six angles: Technical — default credential · Customer — privacy · Employee — none · CEO — brand risk · Owner — data protection · Supplier — none.
- Register: PR 130 (+ PR 15, merged): staging acceptance test
- Status: demo gap in the prototype; must be verified on staging

### 4.2 Important (25)

### SIM-F-008 · Customer reviews never reach moderation; the photo reward is never paid
- Order / checkpoint: SIM-29, 50 · CP15, CP17
- What happened: "Rate & review" in My orders saves the review on the account as "pending", but Admin › Reviews reads a separate list. The review never appears there, nothing can be approved, the ৳50 photo reward promised on the page is never credited, and there is no verified-buyer mark.
- Severity: Important (a promise broken; reviews are the cheapest conversion lever)
- Fix: customer reviews go into the moderation queue with order, size, height and weight; approve → publish with the verified mark → reward to the wallet per setting. Owner agent: doot.
- Prevention: journey test "review submitted → in admin → approved → on the product page → wallet credited".
- Core-decision review: keep moderation before publishing.
- Growth idea: reviews with height and weight feed Find My Size (ideas 3, 16).
- Six angles: Technical — two stores · Customer — "my review vanished" · Employee — copies reviews by hand · CEO — fewer reviews, lower conversion · Owner — the reward amount is his setting · Supplier — size feedback per factory lost.
- Register: PR 295, PR 296, PR 65
- Status: open

### SIM-F-009 · Guests cannot use a public coupon or a friend's referral code
- Order / checkpoint: SIM-15 (VIP15), 44 (EID), 50 (referral RAKIB100) · CP06, CP17
- What happened: the bag's code box answers every guest "Member codes work after you log in". The owner's public EID code (created in Admin › Coupons) worked only for a logged-in repeat customer (order 46: ৳165 off; the totals then agreed on bag, checkout, order, invoice and SMS). First-time buyers, who are most Eid buyers, cannot use it; a friend cannot use a referral code at all (the code box does not read referral codes). VIP15 got no "why not / better offer" explanation.
- Severity: Important (campaign and referral money is spent on people who cannot redeem)
- Fix: public store coupons work for guests (per-customer limits checked by phone at checkout); member codes say "for members — log in"; referral codes accepted on first orders; the PR 112 better-offer line. Owner agent: sawdagor.
- Prevention: coupon test matrix guest/member × public/member/referral.
- Core-decision review: whether public codes are open to guests is a discount decision (P15).
- Growth idea: referral is the cheapest acquisition in Bangladesh (word of mouth); it must work.
- Six angles: Technical — login gate before the lookup · Customer — "your code doesn't work" · Employee — manual discounts in chat · CEO — campaign return lost · Owner — discount rules are his · Supplier — none.
- Register: PR 112, PR 271, PR 272, PR 273
- Status: open + proposal P15

### SIM-F-010 · "Packing photo required" does not stop packing
- Order / checkpoint: SIM-47 · CP10
- What happened: with Packing proof photo on and set to "Required", order 47 was marked Packed and booked with 0 photos; the photo is only a pill on the Fulfilment list.
- Severity: Important (the feature that settles "wrong item" disputes did not fire on the one wrong-item case)
- Fix: "Required" blocks Packed and booking until the photo count is met; an owner override with a reason. Owner agent: bhandari.
- Prevention: test "a required photo blocks Packed"; field-consumption lesson.
- Core-decision review: keep it optional (CN-014), but "required" must mean required.
- Growth idea: the photos double as packing-quality training material.
- Six angles: Technical — no gate · Customer — a dispute without proof · Employee — a false sense of safety · CEO — "not as ordered" is half of all complaints (N4) · Owner — the switch does not do what it says · Supplier — none.
- Register: CN-014 c / PR 182
- Status: open

### SIM-F-011 · Self-confirm promises a WhatsApp that is never sent
- Order / checkpoint: SIM-41 · CP08, CP09
- What happened: with WhatsApp self-confirm on, the thank-you page says "We just sent you a WhatsApp — reply 1 to confirm your order". The messages log shows only the placed SMS; there is no reply handling and no timer that moves an unanswered order to the call queue. It would also be a second WhatsApp under the one-WhatsApp rule, because the processing WhatsApp follows later.
- Severity: Important
- Fix: make the self-confirm message *the* one WhatsApp (it replaces the processing WhatsApp when on), log it, handle replies 1/2/3, and start the call-queue timer. Owner agent: doot + gyani.
- Prevention: test "a thank-you promise ⇒ a message in the log"; promise-copy lesson.
- Core-decision review: the owner's message rule and idea 5 collide; P13 asks him to let the self-confirm count as the one WhatsApp.
- Growth idea: most RTO is indecision (N6, N10); reply-to-confirm cuts calls at Eid.
- Six angles: Technical — page text only · Customer — waits for a message that never comes · Employee — calls anyway · CEO — an RTO lever unused · Owner — a rule conflict to decide · Supplier — WhatsApp API cost.
- Register: CN-014 a / PR 148, PR 292, PR 545
- Status: open + proposal P13

### SIM-F-012 · The AI draft answers the wrong question in 6 of 10 chats
- Order / checkpoint: SIM-10, 11, 17, 20, 24, 28, 31, 40, 47 (33 was right) · CP15
- What happened: drafts are keyword rules. "40 polos … 4 sizes" got the *exchange* answer (the word "size"); "cancel korte chai" got the order status; "rider 50 taka beshi chailo" got "Delivered, courier Pathao"; "white order, blue pathiyeche" got "Delivered"; a parcel 6 days late got "Delivery usually takes up to 48–72 hours"; a Bengali size question ("উচ্চতা ৫ ফুট ৬, ওজন ৬৫") got "I don't have the answer", although Find My Size gives L; unknown senders are greeted "Hi New,". Only the after-window exchange answer (33) was right. A person checks before sending, so nothing wrong left the shop.
- Severity: Important (staff time; risk when a tired agent sends it)
- Fix: intent order cancel > complaint (overcharge, wrong item, damage, fade) > late (compared with the promise) > size (call Find My Size; read Bengali digits) > bulk (hand to the owner) > status; reply in Bengali to Bengali; no name in the greeting when unknown. Owner agent: gyani.
- Prevention: a draft test set made of this run's 10 chats (Banglish and Bengali) with their expected intents.
- Core-decision review: keep "AI drafts, a person sends".
- Growth idea: a size answer from Find My Size in chat is a direct sale.
- Six angles: Technical — keyword precedence · Customer — feels unheard · Employee — rewrites every draft · CEO — slower first reply at peak · Owner — none · Supplier — rider complaints not routed to the courier.
- Register: PR 425–436 (S22, draft engine), PR 538, PR 58
- Status: open

### SIM-F-013 · No notice when an order is cancelled or declined
- Order / checkpoint: SIM-07, 08, 18 (duplicate), 20, 35 · CP08, CP09
- What happened: 5 orders were cancelled or declined in review; the customer got nothing: no SMS, no tracking link, no reason.
- Severity: Important
- Fix: the PR 546 notice (reason, and for a duplicate the tracking link of the order that stays); not sent for "fake/test" declines. Owner agent: doot.
- Prevention: test "cancel ⇒ one notice in the log".
- Core-decision review: suggest the notice sits outside the 2-SMS cap (part of P13).
- Growth idea: a "cancelled by mistake? reorder in one tap" link.
- Six angles: Technical — no hook on cancel · Customer — waits for a parcel · Employee — "where is my order" chats · CEO — lost reorders · Owner — none · Supplier — none.
- Register: PR 546
- Status: open

### SIM-F-014 · An order waiting in the fraud review can still be booked from the Couriers page
- Order / checkpoint: SIM-07, 35 · CP09, CP11
- What happened: the review holds an order back from the picking list only; Couriers › Ready to book shows "Book parcel" for it, and "Book all" books it.
- Severity: Important
- Fix: the shared booking filter of F-002 (nothing while the review is open). Owner agent: bhandari.
- Prevention: covered by the F-002 test.
- Core-decision review: keep "hold, never block".
- Growth idea: —
- Six angles: Technical — filter · Customer — none · Employee — an easy mistake · CEO — fraud parcels shipped · Owner — his review decision bypassed · Supplier — RTO charges.
- Register: PR 161, PR 541, PR 176
- Status: open

### SIM-F-015 · The identity check sees only the phone number
- Order / checkpoint: SIM-08, 17, 35, 42 · CP09
- What happened: "Refused before" is matched by phone only. The order-35 refuser with a new number was caught only by "same address, new phone" (3-day window), and the earlier refusal was not named. The wrong-number customer (17), writing from his real number, was not linked to his order (inbox panel: "Orders 0"). The prank victim (08) received the placed SMS before any call. A ৳7,400 first order of 4 panjabis at Eid (42) raised no signal and was refused.
- Severity: Important
- Fix: match on name + normalised address + device + courier fraud data (PR 559/567); a value/quantity rule for first orders; the inbox links a sender by a name + address search. Owner agent: gyani.
- Prevention: a fraud test set (this run's 4 FR orders) with expected signals.
- Core-decision review: keep "flag, never block".
- Growth idea: the flag-outcome report (PR 562) tunes the thresholds with real data.
- Six angles: Technical — single key · Customer — honest customers not bothered · Employee — manual searching · CEO — RTO from repeat refusers · Owner — the thresholds are his (P2) · Supplier — courier fraud APIs.
- Register: PR 541, PR 555, PR 556, PR 559, PR 567
- Status: open (partly a demo gap)

### SIM-F-016 · No advance-payment checkout mode and no one-click advance request
- Order / checkpoint: SIM-07, 35 · CP07, CP09
- What happened: staff could only log "asked for the delivery charge by bKash" as a call note and decline later; there is no payment link and no checkout mode that hides COD for a flagged buyer.
- Severity: Important (demo gap)
- Fix: PR 560 and PR 542 as specified. Owner agent: sawdagor + gyani.
- Prevention: staging acceptance test (§9).
- Core-decision review: the thresholds are an owner decision (P2).
- Growth idea: advances cut fake orders sharply (N9, N28).
- Six angles: Technical — not built · Customer — an honest flagged buyer can still order by paying · Employee — no chasing · CEO — RTO down · Owner — a COD rule decision · Supplier — fewer returns.
- Register: PR 542, PR 560, PR 562
- Status: demo gap

### SIM-F-017 · Courier exceptions have no states: failed attempt, address problem, lost, damage claim, zone ids, declared value
- Order / checkpoint: SIM-06, 09, 19, 23, 24, 25, 26, 27 · CP11, CP12, CP13
- What happened: a parcel goes Booked → Picked up → On the way → Delivered, or Refused. "The rider cannot find the house" (06), "receiver unreachable, second attempt" (09), "not available ×2" (27), "lost in transit 9 days" (25, still "On the way" at the end), the rider asking ৳50 extra (24) and door bargaining (23, kept as a free-text note) cannot be recorded. The booking has no declared value and no courier zone id. The "Send claim" button exists only for COD mismatches, so the damaged parcel (26) and the lost one (25) cannot be claimed.
- Severity: Important (demo gap for the courier API part; the screens need the states)
- Fix: states and reasons for attempts, address problems, lost and damaged parcels, with a claim workflow and the declared value; a rider-issue log per courier (idea 11). Owner agent: bhandari.
- Prevention: staging acceptance tests (§9).
- Core-decision review: keep the courier choice by cost, and add success rate per area (idea 7) once these states exist.
- Growth idea: courier scorecards for negotiation.
- Six angles: Technical — 4-state model · Customer — delays unexplained · Employee — notes and calls · CEO — claim money left on the table · Owner — courier accountability · Supplier — negotiation data.
- Register: PR 175–177, PR 184, PR 192, PR 554; ideas 11 and 14 (new scope on PR 176 + 192)
- Status: demo gap

### SIM-F-018 · A late parcel is not flagged; tracking and the AI keep promising the normal time
- Order / checkpoint: SIM-28 (and 06) · CP12
- What happened: 4 days after booking the tracking page still said "With courier"; no staff alert at 72 hours; the AI draft told the angry customer "usually up to 48–72 hours".
- Severity: Important
- Fix: a late flag when a parcel passes its band's promise; the tracking page and the drafts say "late — we are chasing the courier". Owner agent: bhandari + gyani.
- Prevention: a test with a parcel past the promise.
- Core-decision review: keep the promise in hours; it needs its breach path.
- Growth idea: a proactive "sorry, delayed" message (owner switch) heads off public posts.
- Six angles: Technical — no SLA check · Customer — threatens a Facebook post · Employee — reactive · CEO — brand risk · Owner — goodwill decision (P7) · Supplier — late rate per courier.
- Register: PR 135, PR 184, PR 192
- Status: open

### SIM-F-019 · After the outside-Dhaka Eid cut-off the checkout still promises 48–72 hours
- Order / checkpoint: SIM-36, 37, probe 4 · CP03, CP07
- What happened: the Eid order-by banner (CN-014 g) shows "Dhaka city 25 Feb · near Dhaka 24 Feb" and simply drops the outside chip after its date. A Dinajpur customer after the cut-off sees the normal "You'll get your order within 48–72 hours" at checkout, with no "may arrive after Eid". Order 37 arrived after Eid and was refused (RTO).
- Severity: Important (a likely refusal at peak)
- Fix: for a band past its cut-off, the checkout and thank-you page say "may arrive after Eid" and offer pre-order if the owner switches it on. Owner agent: sawdagor.
- Prevention: a test per band before and after its date.
- Core-decision review: keep per-band dates; honesty beats a refused parcel.
- Growth idea: pre-order with an advance after the date (P10).
- Six angles: Technical — banner only · Customer — feels cheated · Employee — refusals at peak · CEO — Eid is 35–40% of sales (N22) · Owner — the pre-order advance is his call · Supplier — peak capacity.
- Register: PR 193, PR 214 (merged), CN-014 g
- Status: open + proposal P10

### SIM-F-020 · Prepaid orders go to the confirmation-call queue like COD
- Order / checkpoint: SIM-02 (and every prepaid order) · CP09
- What happened: a paid bKash order sits in "To confirm" exactly like a COD order; no rule lets prepaid skip the call.
- Severity: Important (wasted calls at Eid)
- Fix: prepaid and not flagged → straight to packing; a flagged prepaid order is still reviewed. Owner agent: gyani.
- Prevention: test.
- Core-decision review: calls exist for COD risk; prepaid has almost no RTO (N7).
- Growth idea: frees staff time for the COD calls that matter.
- Six angles: Technical — rule missing · Customer — an unnecessary call · Employee — load · CEO — cost · Owner — none · Supplier — none.
- Register: PR 541, PR 545 (dated scope)
- Status: open

### SIM-F-021 · A size re-ship after a try-on is a new, unlinked order — charged again and flagged "refused before"
- Order / checkpoint: SIM-22 · CP15
- What happened: after the try-on return, the XXL re-ship (EX-1065) is an ordinary new order: no link to EX-1064, the customer pays ৳120 delivery again, and the review flags him "Refused a parcel before — ask for the delivery charge by bKash first".
- Severity: Important
- Fix: "re-ship in another size" from the refused order, linked; a refusal for size does not count as a fraud signal; the delivery charge follows an owner rule (P9). Owner agent: bhandari + gyani.
- Prevention: test.
- Core-decision review: try-on works only if the re-ship is easy.
- Growth idea: turns an RTO into a sale.
- Six angles: Technical — no link · Customer — pays twice, looks like a fraudster · Employee — manual · CEO — a saved sale · Owner — the charge decision · Supplier — two trips.
- Register: PR 186, PR 190, PR 526
- Status: open + proposal P9

### SIM-F-023 · No bulk / corporate lane
- Order / checkpoint: SIM-10, 40 · CP02, CP06, CP10
- What happened: there is no enquiry page; the bag silently stops at the stock in hand (40 polos → 4, 25 panjabis → 2) with no "bulk order? talk to us"; there is no quote, advance, stock reservation or split delivery.
- Severity: Important (enquiries worth about ৳34,000 and ৳46,000 lost in the run)
- Fix: the blueprint B8.5 #4 enquiry page, a bag message above N pieces, then owner quote → advance → reservation → split delivery. Owner agent: sawdagor.
- Prevention: journey test.
- Core-decision review: the owner already runs buying-house orders; the lane fits his business.
- Growth idea: Eid staff gifts and office uniforms (idea 21).
- Six angles: Technical — not built · Customer — leaves · Employee — handles it in chat · CEO — high-value orders · Owner — prices are his (P11) · Supplier — factory capacity for logo work.
- Register: next free PR (605) + CN-017 (proposed); idea 21
- Status: proposal for the owner (P11)

### SIM-F-024 · No "create order from chat"; the channel is lost; no "send my bag on WhatsApp"
- Order / checkpoint: SIM-12, 31 · CP02, CP15
- What happened: the elderly customer gave up on the address; the bag has no "send my bag on WhatsApp" button; the inbox has no "create order". The agent re-keyed the order in the shop checkout, and the order's source became "website".
- Severity: Important
- Fix: PR 430 order-from-chat with the channel tag; a bag-to-WhatsApp button. Owner agent: doot.
- Prevention: test that a chat order carries the source "whatsapp" or "messenger".
- Core-decision review: WhatsApp text is the support channel; it should also be an order channel.
- Growth idea: elderly and Bengali-only buyers convert in chat.
- Six angles: Technical — missing · Customer — easier · Employee — no re-keying · CEO — channel return measurable · Owner — none · Supplier — none.
- Register: PR 430 (S22)
- Status: open

### SIM-F-025 · The বাংলা journey is half English
- Order / checkpoint: SIM-13, 31, 44 · CP03, CP08
- What happened: with বাংলা on, 20 English UI words remain on the landing page's first screen; SMS and WhatsApp templates exist only in English; the AI replies in English to Bengali messages. Bengali addresses ("ফতুল্লা, নারায়ণগঞ্জ", "রেসকোর্স, কুমিল্লা") were zoned correctly and Bengali digits were cleaned — good.
- Severity: Important
- Fix: Bengali templates chosen by the customer's language; translate the landing page keys. Owner agent: doot.
- Prevention: a language gate that counts English words on বাংলা pages.
- Core-decision review: keep simple English as the default; the switch must be complete.
- Growth idea: Bengali-first ads with Bengali landing pages.
- Six angles: Technical — partial keys · Customer — trust · Employee — none · CEO — reach · Owner — none · Supplier — none.
- Register: PR 84, PR 505
- Status: open

### SIM-F-026 · Abandoned checkouts and failed payments have no capture or follow-up
- Order / checkpoint: SIM-14, 16, 34, 43 · CP07, CP08
- What happened: a name and phone typed and abandoned are not visible to staff (PR 274), and no consented follow-up exists (PR 275); the draft does come back (PR 137, works). bKash and Nagad have no gateway step, so "payment failed → retry → one order" cannot be tested; a network drop at Confirm cannot be simulated in a browser-only demo.
- Severity: Important (demo gap)
- Fix: PR 274/275 as specified; payment callbacks with idempotency keys (PR 125/170).
- Prevention: staging acceptance tests (§9).
- Core-decision review: follow-up capped at 2, consent only — keep.
- Growth idea: recovered carts are cheap sales.
- Six angles: Technical — not built · Customer — reminded once · Employee — a call list · CEO — conversion · Owner — consent rules · Supplier — gateway.
- Register: PR 274, PR 275, PR 125, PR 170
- Status: demo gap

### SIM-F-027 · RTO cost is understated and the RTO cost book shows sample rows
- Order / checkpoint: SIM-22, 27, 35, 37, 42, 48 · CP14
- What happened: the P&L counts an RTO only as the courier's return fee (৳305 for 6 RTOs). It ignores the forward leg (৳600), packaging, handling and the wasted ad cost (research model ≈৳250–700 per RTO → ৳1,500–4,200). The RTO cost book (CN-014 d) shows 12 sample rows, not the shop's own returns. The mock courier terms charge a return fee for Steadfast, although its terms say no return charge (N16). The Finance "All time" view mixes in the demo's sample orders and charges salaries for the whole calendar.
- Severity: Important (a cost leak the system cannot see)
- Fix: RTO cost = forward + return + packaging + handling + ad share, from settings; the book reads real returned parcels; courier terms per courier from settings. Owner agent: gyani.
- Prevention: a P&L test with a refused parcel.
- Core-decision review: the owner thinks in taka — show the RTO leak in taka.
- Growth idea: RTO by district and campaign tells where to stop advertising (PR 264).
- Six angles: Technical — partial formula · Customer — none · Employee — none · CEO — real profit · Owner — the values are his · Supplier — courier terms.
- Register: PR 164, PR 192, PR 267, CN-014 d, PR 175
- Status: open

### SIM-F-028 · COD statements: the mock pays exactly what is due, mismatches carry no reason, cash in transit is not shown
- Order / checkpoint: reconciliation §5.3 · CP14
- What happened: "Load statement (mock)" pays every parcel exactly its expected amount, so only hand-typed figures can test a mismatch. All 4 planted traps were flagged ("Courier paid ৳781, we expected ৳1,623", etc.) but with no reason code (partial? double charge? charge-paid return?). The lost parcel's ৳2,700 COD is not shown as cash in transit, and days-to-settle per courier cannot be measured.
- Severity: Important
- Fix: import the courier's CSV line by line; reason codes per mismatch; a cash-in-transit card; settlement days per courier. Owner agent: gyani.
- Prevention: the trap list of plan §6.3 as an automated test.
- Core-decision review: keep "flag, change nothing, message nobody" (PR 564).
- Growth idea: instant settlement (idea 20) once the days are measured.
- Six angles: Technical — mock · Customer — none · Employee — manual matching · CEO — cash flow · Owner — money · Supplier — claims.
- Register: PR 165, PR 166, PR 174, PR 525
- Status: open (partly a demo gap)

### SIM-F-029 · Parcel weight does not change the courier cost
- Order / checkpoint: SIM-21 · CP11
- What happened: 6 items, 2.1 kg; the booking cost is the flat band rate (৳60), while couriers charge per kg above 1 kg (+৳20/kg at Paperfly, N17).
- Severity: Important (a cost leak)
- Fix: weight slabs per courier in settings; the courier choice (PR 178) uses them. Owner agent: bhandari.
- Prevention: a test with a parcel over 1 kg.
- Core-decision review: the customer's charge stays the band figure (PR 550); only our cost changes.
- Growth idea: check the free-delivery limit against weight for big bundles.
- Six angles: Technical — no slab · Customer — none · Employee — none · CEO — margin on big orders · Owner — none · Supplier — invoice disputes.
- Register: PR 176, PR 178
- Status: open

### SIM-F-030 · A village address with only a landmark is not sent to the address queue
- Order / checkpoint: SIM-06 · CP09
- What happened: "bazar er pashe, Kurigram" settled the band (correct) and confirmed with no flag; nothing asked for a landmark or a house; the rider could not find the house.
- Severity: Important
- Fix: an address-quality check (no house/road/para) adds "Address check" — never a hold (PR 563) — so the confirmation call asks for directions. Owner agent: sawdagor.
- Prevention: a test with landmark-only addresses.
- Core-decision review: keep "no order is held over an address".
- Growth idea: save the rider's directions on the customer for the next order.
- Six angles: Technical — band only · Customer — a late parcel · Employee — rider calls · CEO — late deliveries and RTO · Owner — rule kept · Supplier — rider time.
- Register: PR 563, PR 549
- Status: open

### SIM-F-031 · Customer copy promises more than the system does
- Order / checkpoint: SIM-01, 32, 45, 49 · CP08, CP15
- What happened: the exchange wizard says "We send you updates on WhatsApp at every step" (the owner's rule allows one WhatsApp per order); the thank-you page says "Your order is confirmed" while the SMS says "We will confirm it soon"; the "confirmed and packed" SMS goes out at booking even when nothing is packed; an add-on (49) changes the total with no message (the placed SMS still says ৳2,100, the parcel ৳2,450).
- Severity: Important
- Fix: copy from the rule texts (PR 215); "Order received" until the call; one updated-total line in the processing WhatsApp. Owner agent: doot.
- Prevention: promise-copy lesson and test.
- Core-decision review: keep the message rule; align the words with it.
- Growth idea: clear words cut "where is my order" chats.
- Six angles: Technical — fixed copy · Customer — confusion · Employee — chats · CEO — trust · Owner — his rule · Supplier — none.
- Register: PR 148, PR 215, PR 505
- Status: open

### SIM-F-037 · Staff cannot correct a phone number with a log; a wrong number texts a stranger
- Order / checkpoint: SIM-17 · CP09
- What happened: a valid-format wrong number (one digit off) was accepted, and the placed SMS went to a stranger. Only the customer himself, logged in on the same browser, could fix it from My orders; the admin order screen has no "edit phone" with a log.
- Severity: Important
- Fix: the PR 142 admin edit with its source and log. Keep the phone read-back ("We'll call 01710-000071"), which is already there. Owner agent: sawdagor.
- Prevention: test.
- Core-decision review: keep the read-back.
- Growth idea: —
- Six angles: Technical — missing admin edit · Customer — no SMS · Employee — cannot fix it · CEO — RTO risk · Owner — privacy (a stranger gets order details) · Supplier — the courier calls a wrong number.
- Register: PR 142, PR 555
- Status: open

### SIM-F-038 · The reason lists miss real-life reasons
- Order / checkpoint: SIM-08, 37, 42 · CP09, CP13
- What happened: cancel reasons have no "did not order (number used by someone else)"; refusal reasons have no "bought elsewhere" or "arrived after Eid".
- Severity: Important (bad data for the fraud and RTO reports)
- Fix: reasons from settings, with these added. Owner agent: gyani.
- Prevention: —
- Core-decision review: the reasons feed PR 562 and the RTO book.
- Growth idea: an "arrived after Eid" count justifies earlier cut-offs.
- Six angles: Technical — fixed list · Customer — none · Employee — picks "Other" · CEO — wrong conclusions · Owner — none · Supplier — courier refusal reasons.
- Register: PR 142, PR 526
- Status: open

### 4.3 Can wait (4)

### SIM-F-032 · No product-life reminder, no points; the tier stays "New" after repeat orders
- Order / checkpoint: SIM-46 · CP17
- What happened: order 46 "came from a reminder" that does not exist; the repeat customer's tier stayed "New" and her points empty.
- Severity: Can wait (growth)
- Fix: PR 289/300 trigger by product life; PR 296 points. Prevention: consent test. Core-decision review: consent first. Growth idea: 18 (repeat buyers cost no ad money).
- Six angles: CEO — repeat revenue; the rest neutral.
- Register: PR 289, PR 296, PR 300 · Status: open

### SIM-F-034 · The try-on line is missing on the ad landing page
- Order / checkpoint: SIM-01 · CP03
- What happened: the checkout shows "Try it on in front of the rider", but the Polo Duo landing page does not.
- Severity: Can wait
- Fix: add the rule-text block (idea 4). Six angles: Customer — trust; CEO — conversion; others neutral.
- Register: B1.17, PR 254 · Status: open

### SIM-F-035 · A size sold out in every colour disappears instead of showing crossed out
- Order / checkpoint: SIM-20 · CP04
- What happened: striped-rib polo L simply was not on the product page, while the landing page says "Crossed-out sizes are sold out in this colour".
- Severity: Can wait
- Fix: a crossed-out pill with "tell me when it is back". Six angles: Customer — clarity; CEO — back-in-stock demand data.
- Register: PR 61–75, PR 72 · Status: open

### SIM-F-036 · The "2 sizes" flag fires for a family buying S, M and L
- Order / checkpoint: SIM-03, 04 · CP06, CP09
- What happened: the same product in neighbouring sizes is flagged "2 sizes — check" even when three sizes are bought on purpose (04); the two-size follow-up message (PR 146) does not exist, so order 03's partial at the door was not prevented.
- Severity: Can wait
- Fix: use the bag's "for different people?" answer (`bracketAck`) to skip the flag; add the PR 146 message. Six angles: Employee — fewer false flags; CEO — fewer two-size partials.
- Register: PR 110, PR 146 · Status: open

---

## 5. Back-office reconciliation (end of run)

### 5.1 Stock and ERP

| Check | Result |
|---|---|
| SKUs touched | 48 |
| The system's identity `opening − delivered − held + movements = available` | holds for 48 / 48 |
| Pieces delivered / still held by open orders | 70 / 2 (the lost parcel, order 25) |
| ERP documents (SalesOrder, Shipment, Payment, SalesReturn) | 144, 0 duplicate keys (retries and the double tap did not double a movement) |
| Exchanges: new piece out / old piece back | 4 / 4 (good 2 · B-grade 1 kept apart · damaged 1 written off) |
| Refused parcels back and restocked (QC good) | 6 / 6 |

Real-world variances the system cannot see (each needs a reason code): **03** partial — one M polo is back on the shelf but booked as sold (F-005); **47** wrong item — white M booked back, blue M actually back (F-022); **39** oversold — sky panjabi S true balance −1, shown as 0 (F-006); **25** lost — 2 pieces still "held" by a parcel nobody will deliver (F-017).

### 5.2 Accounts — the simulation P&L (plan period D1–D20)

Costs come from the demo's settings (packaging ৳15 per parcel; gateway bKash 1.85% · Nagad 1.5% · card 2.5%; SMS ৳0.35; WhatsApp ৳0.80; courier rates; COD fee 1%). Product cost is the demo's sample (46% of price): **owner value pending from the ERP**. Ad spend is a **sample assumption** (৳1,000 a day for 18 days, entered in Finance › Ad spend). Salaries are the demo's 3 sample staff (৳45,000 a month → ৳30,000 for 20 days). One sample expense (৳600 transport) was entered in Expenses.

| Line | ৳ | Notes |
|---|---:|---|
| Gross ordered (51 orders, incl. delivery charges) | 108,447 | goods ৳111,170 − discounts and wallet ৳4,143 + delivery ৳1,420 |
| − cancelled before dispatch (5) | 12,400 | 07, 08, 18-duplicate, 20, 35 |
| − refused / RTO, not delivered (6) | 15,920 | 22 (first parcel), 27, 35 (history), 37, 42, 48 |
| − lost in transit (1) | 2,700 | 25 |
| **Delivered revenue (39 orders)** | **77,427** | goods ৳76,407 + delivery charges ৳1,020 |
| + exchange cash collected | 80 | 32 |
| − correction: order 03 was a partial (real cash) | −850 | not visible in the demo |
| − product cost of delivered goods (sample) | 36,490 | ৳36,880 − ৳390 for the M that came back |
| − exchanges, net product cost | 540 | new pieces out − value recovered (good 100%, B-grade 50%, damaged 0) |
| − courier delivery charges (delivered parcels) | 3,230 | |
| − exchange swap trips (4 × ৳60) | 240 | |
| − COD fee 1% | 596 | |
| − RTO: return fees (as the demo counts them) | 305 | |
| − RTO: forward legs (not counted by the demo) | 600 | |
| − packaging (46 parcels × ৳15) | 690 | |
| − gateway fees | 370 | |
| − messages (97 SMS + 46 WhatsApp) | 71 | |
| **= Contribution before ads** | **33,525** | **৳860 per delivered order** |
| − ad spend (sample) | 18,000 | **৳462 per delivered order** |
| **= Contribution after ads** | **15,525** | **৳398 per delivered order** |
| − salaries (20 days) | 30,000 | |
| − expenses | 600 | |
| − goodwill credits | 0 | proposals only (orders 24, 28) |
| **= Net for the period** | **−15,075** | −৳387 per delivered order |

- Delivered 39 of 46 dispatched = **84.8%**; RTO **13.0%**; lost 2.2%; cancelled before dispatch 5 of 51 = 9.8%.
- Break-even at this contribution: ৳45,000 monthly fixed cost ÷ ৳398 ≈ **113 delivered orders a month** (about 4 a day).
- RTO true cost (research model ৳250–700 each): ৳1,500–4,200 for the 6 RTOs, against ৳305 in the demo's P&L (F-027).
- The demo's own Finance page ("All time", delivered) shows a net of −৳211k, because it includes the 6 pre-existing sample orders and spreads salaries over its whole 155-day calendar; the per-period views are fine. Orders placed through the checkout carry the source "website" only, so ad spend cannot be split by campaign; only ad-landing-page orders carry `landing:<slug>`.

### 5.3 COD reconciliation against the courier

| Courier | Parcels | COD collected | Charges | COD fee | Due to us | Paid | Not paid | Mismatches |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Steadfast | 18 | 17,140 | 1,340 | 172 | 15,628 | 14,696 | 0 | 2 |
| Pathao | 16 | 24,767 | 1,225 | 250 | 23,292 | 21,724 | 1,568 | 1 |
| RedX | 11 | 17,230 | 970 | 174 | 16,086 | 16,206 | 0 | 1 |
| **Total** | **45** | **59,137** | **3,535** | **596** | **55,006** | **52,626** | **1,568** | **4** |

Charges include the return fees of refused parcels; "due" for a refused parcel is negative (we owe the return fee).

Traps planted (plan §6.3) and what the system did:

| Trap | Parcel | Due | Paid | Caught? |
|---|---|---:|---:|---|
| Partial delivery (kept L only) | EX-1045 (03) | 1,623 | 781 | Flagged as a mismatch — no "partial" reason |
| Double deduction (charge taken twice) | EX-1054 (13) | 1,395 | 1,305 | Flagged — no reason code |
| Missing order (not in the Pathao statement) | EX-1067 (24) | 1,568 | — | Flagged "Not paid after 3 days" ✔ |
| Charge-paid return (rider kept the ৳120 delivery charge) | EX-1064 (22) | −50 | +70 | Flagged — cannot be explained (no such outcome) |
| Late settlement | all | — | — | **Not measurable** — the mock statement settles at once |

Unexplained variance ৳812 (= 842 + 90 − 120); missing ৳1,568; cash in transit not shown ৳2,700 (the lost parcel). 4 of 4 traps flagged, 0 of 4 explained.

### 5.4 RTO, packaging, salaries and expenses

- RTO: 6 parcels — try-on size (22), not reachable (27), an earlier refuser (35 history), arrived after Eid (37), changed mind / bought elsewhere (42), a partial on a set refused whole (48). 5 of 6 were outside Dhaka. All 6 came back and passed QC as good; return fees ৳305 + forward legs ৳600.
- Packaging ৳690 (46 parcels; cancelled orders were not packed).
- Salaries: 3 sample staff in Expenses › Staff & salaries (৳15,000 + ৳18,000 + ৳12,000), spread per day by the P&L. Expenses: one sample entry posted and visible in the P&L.

### 5.5 Support inbox metrics

11 simulated conversations (WhatsApp 9, Messenger 2) next to the demo's 3 samples. 3 were answered (the AI draft checked and sent by a person; the first reply was logged at 0 minutes of simulated time). 8 were opened only to read the draft and left open; in a live shop they would breach the 15-minute first-reply target. Every conversation with an order id was linked to its order; the 5 from unknown senders were not linked even when they wrote their number (F-015). Complaints by reason: size 2, colour/quality 1, wrong item 1, late 1, rider behaviour 1, cancel 1, bulk 2, status 1, wrong number 1. AI drafts: 1 right, 3 safe hand-overs, 6 wrong or misleading (F-012). Public-post risk list: orders 11 (fade — "Ami Facebook e post dibo"), 28 (late — "fraud page"), 24 (rider overcharge); the inbox has no public-comment channel to watch.

### 5.6 Fraud review queue

| Order | Signal | Action | Outcome |
|---|---|---|---|
| EX-1049 (07, "Test Bhai") | fake (high) | call → no answer → declined "advance not paid" | right; nobody blocked |
| EX-1060 (18, duplicate) | same day (medium) | declined as a duplicate | right; no notice to the customer (F-013) |
| EX-1065 (22, re-ship) | refused before (medium) | approved | **false positive** — a size re-ship (F-021) |
| EX-1079 (35, new number) | same address (medium) | call → declined | right, but "refused before" not named (F-015) |
| EX-1085 (42, ৳7,400 at Eid) | none | — | **missed** — refused at the door |

No order was blocked automatically and no genuine order was trapped (the re-ship was approved the same day). True positives 3, false positive 1, missed 1. The flag-outcome report (PR 562) does not exist yet, so this table is the number that would tune the thresholds. Eid (probe 4): the order-by banner works when its dates are around "today"; the checkout warning does not exist (F-019).

---

## 6. Six-angle review (across all findings)

| Angle | What the run showed |
|---|---|
| **Technical** | Money figures are computed in several places (checkout, `placeOrder`, order edit, staff zone fix, sticker, SMS template, settlement) and drift apart (F-001, F-003, F-004). Bulk actions use looser filters than the screens they sit on (F-002, F-014). Optional features save fields nobody reads (F-007, F-010, F-011). Fix pattern: one source per figure, one filter per action, and a test that each collected field is used. |
| **Customer** | The checkout is fast and forgiving (phone formats, Bengali digits, draft restore, one order per double tap, the try-on line). Trust breaks after the order: a wrong amount in the SMS, no word on a cancellation or a delay, a gift that goes to the payer, a review that vanishes, a code that "doesn't work". |
| **Employee** | Order screens are clear and the review queue is good. Missing: courier exceptions, partial outcomes, an admin phone edit, order-from-chat, reason codes, and AI drafts that do not need rewriting. Each costs a call or a spreadsheet fix at Eid volume. |
| **CEO** | RTO was 13% and every RTO was a door moment; contribution after ads ৳398 per delivered order. The levers with evidence: delivery-day reminder, prepaid nudge, an advance for flagged buyers, partials instead of full refusals, honest Eid cut-offs, and a coupon/referral path that works for guests. |
| **Owner** | His rules held: nothing was auto-blocked, no order was held over an address, the 2-SMS/1-WhatsApp guard worked (0 messages blocked because nothing tried a third). Broken: hard-coded texts (F-033). His decisions are listed in §8. |
| **Supplier** | The courier data needed to negotiate and claim (declared value, attempt history, rider issues, damage and loss claims, weight slabs, real return terms) is missing, and COD statements cannot be imported. Factories: wrong-item and fade cases need a root-cause field so the right factory hears about them. |

---

## 7. The 24 ideas — updated with this run's evidence

| # | Idea | Evidence from the run | Updated recommendation |
|---|---|---|---|
| 1 | Prepaid nudge | 8 prepaid orders: 0 RTO; 6 RTO among 38 dispatched COD orders | Strong — proposal P1 |
| 2 | Smart COD advance for risky orders | 07 and 35 could only be declined; 42 (৳7,400) was refused | Strong — build PR 560/542 first; thresholds P2 |
| 3 | Size-confidence tool | 03 (unsure, bought 2 sizes), 22 (too tight) | Keep; reviews must reach the tool (F-008) |
| 4 | Try-on as a selling point | On the checkout, missing on the landing page (F-034) | Keep, low effort |
| 5 | WhatsApp self-confirm | Built as a switch, sends nothing (F-011) | Fix, then P13 |
| 6 | Courier success-ratio check | Not in the demo; 35's history found only by address | Keep (PR 559/567) |
| 7 | Smart courier choice by area | Choice by cost only; no attempt data | After F-017 |
| 8 | RTO-cost dashboard | The book shows sample rows; the P&L understates RTO 5–14× (F-027) | Fix to real data |
| 9 | Delivery-day reminder | 27 RTO "phone off"; switch off by rule | Strong — proposal P3 |
| 10 | Exact-amount line | 24: rider asked ৳50 extra; feature off; needs `{due}` (F-001) | Turn on with P3; fix the amount source |
| 11 | Rider-issue log | 23 and 24 only as notes (F-017) | Keep — new scope on PR 192 + 431 |
| 12 | Partial-delivery rules | 03 and 48: wrong money, lost sale (F-005) | **Urgent build** + set split price P5 |
| 13 | Packing proof | 47: wrong item; "required" not enforced (F-010) | Fix the gate |
| 14 | Declared value + claims | 25 lost, 26 damaged — no claim path (F-017) | Keep |
| 15 | Post-delivery Day-1 care | 11 and 28 threatened public posts; the switch is a preview only | Proposal P4 |
| 16 | Review-with-photo reward | Reward promised, never paid (F-008) | Fix first |
| 17 | One-trip swap | Exchanges 11, 26, 32, 47 already one trip (swap ৳60, our cost) | Keep; the charge rule stays the owner's |
| 18 | Product-life reminder | 46 had nothing to come from (F-032) | Can wait |
| 19 | Eid order-by dates | Banner works; checkout does not warn; 37 refused after Eid (F-019) | Fix + P10 pre-order |
| 20 | Instant COD settlement | Days-to-settle not measurable; ৳2,700 in transit unseen (F-028) | After real statements |
| 21 | Bulk / corporate lane | 10 and 40 lost (≈৳80,000 of enquiries) (F-023) | Strong — P11 |
| 22 | Gift mode | Built; fields unused; gift went to the payer's zone (F-007) | **Urgent fix** |
| 23 | Wallet cashback instead of a discount | Wallet worked in 04 (৳350 used) | Keep — a P1 variant |
| 24 | Colour-truth pack | 11: fade complaint; colour note shown on the landing page | Keep; add fade/shrink QC notes |

---

## 8. Proposals for the owner (hard rule 6 — nothing here is switched on without his written OK)

| # | Proposal | Why (evidence) | Expected effect |
|---|---|---|---|
| P1 | **Prepaid nudge**: a small bKash/Nagad discount or free delivery for prepaid orders (amount yours) | 0 RTO on 8 prepaid orders vs 6 on 38 COD | Fewer RTOs; each avoided RTO saves ≈৳250–700 |
| P2 | **Advance for flagged buyers**: the delivery charge in advance when the review shows "refused before" or "fake" (thresholds yours) | 07, 35 declined; 42 refused | Fewer fake or refused parcels; no honest buyer blocked |
| P3 | **Delivery-day reminder on by default**, with the exact-amount line | 27 RTO (phone off); 24 rider overcharge | Research: −30–40% "not available" (N34) |
| P4 | **Day-1 care + Day-3 review on by default** | 11 and 28 public-post threats; reviews never requested | Problems caught in chat; more reviews |
| P5 | **Price of one piece from a set at the door** (e.g. the regular price for the kept piece) | 48 lost the hoodie sale; 03 partial | Partials become sales; the rule is clear to riders |
| P6 | **Free-delivery limit after a partial**: is the delivery charge due when the kept part is under ৳1,500? | 03 fell from ৳1,700 to ৳850 | One clear rule for riders and statements |
| P7 | **Goodwill credits**: ৳50 back for the rider overcharge (24); a wallet credit for the parcel 6 days late (28) | Public-post threats | Brand protection at a small cost |
| P8 | **Paid exchange just after the window** (e.g. up to 7 days, with the delivery charge) | 33 refused at D+4 | Keeps a customer at no cost to the shop |
| P9 | **Size re-ship after a try-on**: waive or keep the second delivery charge | 22 paid ৳120 twice | Turns an RTO into a sale |
| P10 | **Eid pre-order after the cut-off** with an advance (amount yours) and "may arrive after Eid" wording | 37 refused after Eid | Fewer late-Eid refusals |
| P11 | **Bulk / corporate lane**: minimum quantity, logo price, advance % | 10, 40 lost | High-value orders |
| P12 | **COD off after 2 refusals** — proposal only, never automatic; a person decides | 35, 42 | Fewer repeat RTOs |
| P13 | **Self-confirm WhatsApp counts as the one WhatsApp** (replaces the processing message when on); the cancellation notice sits outside the 2-SMS cap | F-011, F-013 | Fewer calls at Eid; customers informed |
| P14 | **SMS-offers tick pre-ticked or not** (demo default: pre-ticked) | consent default `sms:true` | Consent you are comfortable defending |
| P15 | **Public coupons open to guests** (EID-type codes) | 44 could not use EID; 50's referral refused | Campaigns reach first-time buyers |
| P16 | **Instant COD settlement** as a payout option (courier products) | ৳2,700 in transit; settlement days unknown | Cash flow at Eid |

---

## 9. Demo gaps → staging acceptance list (run again on new.extas.com.bd, plan §8.4)

Each must pass on staging before real orders; a failure there is Urgent for go-live.

1. A guest-order account cannot be opened with phone = password; the first login needs an SMS code (F-039, PR 130).
2. Every outgoing SMS/WhatsApp amount equals the invoice's due figure for COD, prepaid and part-paid orders (F-001).
3. "Book all" and every booking path skip cancelled, returned and review-held orders (F-002, F-014).
4. Shown delivery charge = stored = collected, for a recognised address, an unrecognised one with a chosen area, and a free-delivery order (F-003).
5. After booking, edits and add-ons are refused or re-book the parcel with the new COD and address (F-004).
6. Partial delivery (with approval), charge-paid return, failed attempt, lost and damaged each have their money, stock and claim effects (F-005, F-017).
7. A negative ERP balance raises the packing resolution card and blocks booking (F-006).
8. A gift order's receiver, address band and date are on the sticker and the booking (F-007).
9. Payment failure → retry → exactly one order and one payment; a network drop at Confirm → one order (F-026, PR 125/170).
10. A courier statement CSV import flags all five §6.3 traps with reason codes and measures days-to-settle (F-028).
11. Real page weight and LCP on 4G and Slow 3G from Dhaka within the PR 234 budget (the demo file is 8.1 MB ≈ 160 s on Slow 3G, not representative).
12. Message delivery times and courier booking success per area (zone ids, PR 554).

---

## 10. Lessons (appended to `docs/agents/lessons/ALL.md`)

- Every amount in a customer message reads the amount due (total − paid), never the order total; test each template with a COD, a fully prepaid and a part-paid order. (SIM-02 / SIM-F-001, 2026-10-23)
- A bulk action ("Book all", "Print all") uses the same open-order filter as the screen's own list, never "everything not delivered"; its test always has a cancelled and a review-held order in the list. (SIM-07 / SIM-F-002, SIM-F-014, 2026-10-23)
- The order stores exactly the zone and delivery charge the checkout showed; never re-read them from the address text at save, edit or staff fix. Test "shown = stored" with an address the resolver cannot settle. (probe 2 / SIM-F-003, 2026-10-23)
- Booking a courier, from any screen, closes the customer's edits and add-ons, or every later change re-books the parcel; the sticker's COD is read from the live amount due. (SIM-45 / SIM-F-004, 2026-10-23)
- Every door outcome the couriers support (partial, return with the charge paid, failed attempt, lost, damaged) needs its own state with its money and stock effect before real orders; "delivered or refused" is not enough. (SIM-03, SIM-48 / SIM-F-005, 2026-10-23)
- Never clip stock at zero: a negative available is a shortage card at packing that blocks booking until a person decides. (SIM-39 / SIM-F-006, 2026-10-23)
- A field a feature collects (gift receiver, date, packing photo, self-confirm) must be used downstream (sticker, booking, message, gate); the test checks where it is used, not only that it is saved. (SIM-09, 41, 47 / SIM-F-007, F-010, F-011, 2026-10-23)
- Every promise in customer copy ("we just sent you a WhatsApp", "updates at every step", "photo review reward") is tested end to end, or the copy goes. (SIM-29, 32, 41 / SIM-F-008, F-011, F-031, 2026-10-23)
- Test the AI reply drafter with real complaint types in Banglish and Bengali (cancel, rider overcharge, wrong item, late parcel, bulk, size question); an intent that falls back to "order status" is a wrong answer, not a safe one. (SIM-20, 24, 28, 31, 47 / SIM-F-012, 2026-10-23)
- A public code typed in the bag works for guests; a member-only code says so in words; referral codes are read on first orders. (SIM-44, 50 / SIM-F-009, 2026-10-23)
- An account created from a guest order never gets a guessable password (such as the phone number); the first login is by SMS code. (all orders / SIM-F-039, 2026-10-23)
- In a journey simulation, schedule every event on one simulated clock (an event queue by time), not order by order: running each order's whole life before the next one stretched 18 plan days to 110 calendar days and moved the Eid window. (simulation method, 2026-10-23)

---

# Part 2 — 20 more orders (23 Oct)

*Run 23 Oct 2026 · CN-019 (4) · same demo (`EXTAS-demo-V12.2.html`), same driver, one headless Chromium closed between the 2 batches · the shop's data continues from the end of part 1 (no reset), so earlier refusals, accounts and coupons are real history · nothing was fixed in the demo · checkpoint log `SIM-PROGRESS-2.md` · scripts `scratchpad/sim/orders4.js`, `run2.js`, `recon2.js`; results `results/51–70.json`, `recon2.json`.*

## P2.1 Summary

**What ran.** 20 orders from the angles part 1 missed, judged against the owner's CN-018 answers and the CN-019 Messages control centre: 4 fully prepaid (bKash, card, internet banking, Nagad), 4 risky customers under the rules (hard level paid, hard level refused, soft level paid, a false positive), 4 older buyers (50+ in বাংলা at 150% text, a son ordering for his father, a daughter's prepaid gift to her mother, a 40+ buyer who sends voice notes and wants a call), 2 low-literacy rural buyers (a Kurigram union address on a borrowed phone, a Sunamganj haor village), and 6 other angles (an expat paying by card, a corporate order after a quote, a repeat buyer expecting a wallet refund, a coupon audience mismatch, a flexible set kept in part, a parcel 6 days late with a rider overcharge). Before the real run the 20 scripts were dry-run once on a copy of the data.

**Result in one line: part 2 confirms "not ready for real orders" and adds 2 Urgent money problems.** Prepaid parcels are handled well at the door (every prepaid sticker says "PAID — collect nothing ৳0" and the courier COD is 0), the our-mistake exchange is free and the own-size exchange charge is right, Bengali union and upazila addresses are zoned by district, and 150% text at 390 px has no overflow. But money that customers pay outside the COD path (an advance, a prepaid order that is cancelled or returned) has no record, so the shop would collect it twice or never refund it. Most CN-018/CN-019 features are not in the demo yet; each is recorded below as a required acceptance test of the real build's PR, not as a demo bug.

| | Count |
|---|---:|
| Orders run | 20 → 19 order records (EX-1094 … EX-1112) + 1 corporate enquiry with no order |
| Delivered / RTO / cancelled before dispatch / enquiry | 15 / 2 / 2 / 1 |
| Payment mix | COD 13 · card 3 (1 internet banking) · bKash 2 · Nagad 1 |
| Checkpoints scored | 76 pass · 41 fail · 8 gap |
| **New findings** | **18: Urgent 2 · Important 14 · Can wait 2** (SIM-F-040 … SIM-F-057) |
| Part-1 findings seen again | 14 (table P2.5) |
| Money owed to customers that the system shows nowhere | **৳11,020** (P2.6) |
| Running total, both parts | 70 orders · 57 findings (Urgent 12 · Important 39 · Can wait 6) |

**Top 5 new problems**
1. **An advance paid by bKash cannot be recorded, so the rider collects it again** (F-040): a hard-level buyer paid ৳5,550 in full and the sticker still said "COLLECT CASH ৳5,550"; a soft-level buyer paid the ৳120 delivery charge and was asked for it again.
2. **Prepaid money has no refund path** (F-041): a cancelled bank payment (৳1,650) and a returned card order (৳3,700) are "refunded to the wallet by the owner" in the dialog text only; the wallet stays ৳0, nothing is logged and the customer is not told. He came back and paid again.
3. **The risk rules have no hard/soft level and no advance state** (F-043): every flag says "ask for the delivery charge", an unpaid risky order held stock for 26 hours, and there is no "advance not paid" reason or notice.
4. **Ordering for someone else only works as a "gift"** (F-045): the son's order for his father hid the prices but the rider still collected ৳3,200 from the father, and the courier had the son's number.
5. **Phone-first and Bengali-only buyers are not served** (F-046, F-047): no call-to-order button or call-back request, voice notes cannot be played, sizes are Latin letters only, and 21 English words remain on the বাংলা checkout.

## P2.2 Per-order table

| # | Day | Persona | Items (as bought) | Pay | Order | Outcome | CP pass/fail/gap | Findings |
|---|---|---|---|---|---|---|---|---|
| 51 | P2-D1 | Prepaid · bKash | Textured knit polo M (navy sold out → charcoal) | bKash | EX-1094 | Delivered | 4/2/1 | F-042, F-053, F-001, F-020 |
| 52 | P2-D1 | Prepaid · card | Oxford shirt L + chino 32 | Card | EX-1095 | Delivered → own-size exchange L→XL, ৳120 cash to the rider | 5/1/2 | F-042, F-052, F-001 |
| 53 | P2-D2 | Prepaid · internet banking | Heavyweight hoodie L | Bank | EX-1096 | Cancelled on request; ৳1,650 refund never recorded | 1/2/0 | F-041, F-055, F-056, F-013 |
| 54 | P2-D2 | Prepaid · Nagad | Contrast polo M | Nagad | EX-1097 | Delivered → our-mistake (wrong size) free exchange | 6/2/0 | F-052, F-022, F-001 |
| 55 | P2-D3 | Risk · hard, pays full advance | Panjabi ×3 (৳5,550) | COD + ৳5,550 bKash outside | EX-1098 | Delivered; rider collected ৳5,550 again | 4/1/1 | F-040, F-043 |
| 56 | P2-D3 | Risk · hard, refuses advance | Hoodie ×2 (৳3,300) | COD | EX-1099 | Held 26 h → refused → declined | 1/2/1 | F-043, F-013 |
| 57 | P2-D4 | Risk · soft, pays delivery charge | Pocket tee L + crew tee L | COD + ৳120 bKash | EX-1100 | Delivered; ৳120 collected twice | 4/2/0 | F-040, F-001 |
| 58 | P2-D4 | Risk · false positive | Long-sleeve polo L | COD | EX-1101 | Override with a note → delivered | 6/2/0 | F-044 |
| 59 | P2-D5 | Older 50+ · বাংলা · 150% text | Panjabi XL (bag kept 2 days) | COD | EX-1102 | Delivered | 6/2/0 | F-046, F-047, F-057 |
| 60 | P2-D5 | Son orders for his father | Panjabi XL + twill 36 | COD (father pays) | EX-1103 | Delivered | 3/2/0 | F-045 |
| 61 | P2-D6 | Daughter's gift to her mother | Linen shirt L | bKash | EX-1104 | Delivered; sticker names the payer | 3/2/0 | F-007, F-001 |
| 62 | P2-D6 | Older 40+ · voice note, wants a call | Oxford shirt ×2 XL | COD | EX-1105 | Delivered (agent keyed the order) | 6/2/1 | F-046, F-055, F-024 |
| 63 | P2-D7 | Rural · Kurigram union · borrowed phone | Crew tee ×2 L | COD | EX-1106 | Delivered on day 4 | 3/2/2 | F-047, F-048 |
| 64 | P2-D7 | Rural · Sunamganj haor | Heavy tee XL | COD | EX-1107 | Failed attempt (not recordable) → delivered | 4/2/0 | F-047, F-017 |
| 65 | P2-D8 | Expat in Dubai, card | Panjabi ×2 (৳3,700) | Card | EX-1108 | RTO (brother away); ৳3,700 refund never recorded | 3/3/0 | F-049, F-041, F-001 |
| 66 | P2-D8 | Corporate, after a quote | 30 logo polos at the quoted price | Bank transfer | — | Enquiry only; bag stops at 3 | 0/2/0 | F-023 (PR 606), F-055 |
| 67 | P2-D9 | Repeat buyer expects the refund | Heavyweight hoodie L | COD | EX-1109 | Delivered; wallet ৳0, paid again | 6/1/0 | F-041 |
| 68 | P2-D9 | Coupon audience mismatch | Zip polo L + WELCOME100 | COD | EX-1110 | Delivered; welcome code to a 3-time buyer, refused for a guest | 5/3/0 | F-050, F-009 |
| 69 | P2-D10 | Flexible set, keep one piece | Hoodie-jogger set XL | COD | EX-1111 | Whole set refused → RTO | 2/3/0 | F-051, F-005 |
| 70 | P2-D10 | Late 6 days + rider asks ৳30 more | Twill 32, Bandarban | COD | EX-1112 | Delivered late | 4/3/0 | F-054, F-018, F-055 |

"P2-Dk" is day k of part 2 on the same forward-only clock (simulated day 114+k). Each order's life was run before the next, as in part 1.

| Checkpoint | Pass | Fail | Gap |
|---|---:|---:|---:|
| CP02 Discovery / channel | 0 | 1 | 0 |
| CP03 Landing / large text | 1 | 0 | 0 |
| CP05 Product page | 0 | 2 | 0 |
| CP06 Bag, offers, totals | 15 | 3 | 2 |
| CP07 Checkout | 0 | 2 | 2 |
| CP08 Messages | 10 | 8 | 0 |
| CP09 Confirm call & risk | 2 | 4 | 2 |
| CP10 Packing / sticker | 14 | 4 | 0 |
| CP11 Courier handover | 15 | 2 | 0 |
| CP12 Tracking | 8 | 3 | 1 |
| CP13 Door | 9 | 2 | 0 |
| CP14 Money after the door (COD, refunds) | 0 | 3 | 0 |
| CP15 Day 1–3 after | 0 | 5 | 1 |
| CP16 Exchange logistics | 2 | 0 | 0 |
| CP17 Repeat | 0 | 2 | 0 |
| **All** | **76** | **41** | **8** |

## P2.3 New findings

Register numbers: the next free PR is **607** and the next change note **CN-020** (proposals, confirmed when filed). PR 605 (gift mode) and PR 606 (bulk / corporate lane) were filed after part 1. "Dated scope" means an "Updated 23 Oct" line on that PR. Where the demo lacks a CN-018/CN-019 feature, the finding is a required acceptance test of the real PR, not a demo fix.

### P2.3.1 Urgent (2)

### SIM-F-040 · An advance paid outside the checkout cannot be recorded, so the rider collects it again
- Order / checkpoint: SIM-55 (hard level, full advance ৳5,550 by bKash), SIM-57 (soft level, ৳120 delivery charge by bKash) · CP09, CP10, CP08
- What happened: the review card offered only "Approve / Call / Decline". The payment went into the call note ("paid ৳5,550 by bKash, TrxID 9XK2"). The order screen has no "record payment received". After approval the order stayed COD with paid ৳0: the sticker said "COLLECT CASH ৳5,550", the courier COD was ৳5,550 and the SMS said "Pay ৳5,550 on delivery". In order 57 the sticker asked ৳1,270 instead of ৳1,150. The COD statement then shows ৳5,670 collected that the customers had already paid.
- Severity: Urgent (a customer pays twice; the money figures are wrong)
- Fix: an advance is taken through the PR 542 payment link or the PR 560 advance checkout, and lands on the order as a payment (amount, method, TrxID, time). A manual "record advance received" exists only for the Accounts role, with proof and the owner's rule (hard rule 6 for anything that changes COD). The sticker, booking COD, SMS `{due}` and invoice all read total − paid. Owner agent: sawdagor + gyani.
- Prevention: tests "full advance → COD 0 everywhere" and "delivery-charge advance → COD = total − charge"; the F-001 guard (every amount in a message = invoice due) covers the SMS.
- Core-decision review: keep "flag, never block" and the two levels (CN-018 #2); the advance must be a payment, never a note.
- Growth idea: once advances are payments, the flag-outcome report (PR 562) can show "paid the advance → delivered" rates to tune the rules.
- Six angles: Technical — the review has no payment object · Customer — asked to pay again at the door, may refuse · Employee — must remember which COD to cut · CEO — refunds and disputes · Owner — a COD change without his rule · Supplier — the courier remits money we must hand back.
- Register: PR 542, PR 560, PR 173, PR 166, PR 161 (dated scope on PR 542 and PR 166)
- Status: open (partly a demo gap: no advance request exists yet)

### SIM-F-041 · Prepaid money has no refund path: cancelled and returned prepaid orders are never refunded or tracked
- Order / checkpoint: SIM-53 (internet banking ৳1,650, cancelled before dispatch), SIM-65 (card ৳3,700, RTO), SIM-67 (the order-53 customer returns) · CP14, CP17
- What happened: the cancel dialog says "the online payment is refunded to the customer's wallet by the owner". After cancelling, paid stays ৳1,650, the wallet stays ৳0, no refund record or task exists, and the customer gets no message. The card order that came back (RTO) shows paid ৳3,700 and status returned, again with no refund line. The customer could not cancel himself (no button) and wrote on WhatsApp; the AI answered "not returned or refunded" (F-055). Five days later he logged in, found ৳0 and no refund line, and paid ৳1,650 COD for a new hoodie. No account in the shop has a wallet balance above 0 after 70 orders, because nothing can credit one.
- Severity: Urgent (money owed to customers is invisible; ৳5,350 in this run)
- Fix: a refund record with states (owed → approved by the owner, hard rule 6 → paid → told to the customer), the method (original payment or wallet) and the amount rule for an RTO of a prepaid parcel (who bears the two delivery legs: a setting, CN-018). It is created automatically on cancel or RTO of any paid order and listed in Money › Refunds. The customer sees "Refund ৳X — waiting / paid" on the order. Owner agent: sawdagor + gyani.
- Prevention: tests "cancel a paid order → refund owed appears", "RTO of a paid order → refund owed", "wallet refund → balance and ledger line"; the reconciliation sums paid on cancelled/returned orders and must find each one in Refunds.
- Core-decision review: keep "no returns after receipt" for change of mind; it does not cover money for goods that never reached the customer.
- Growth idea: a wallet refund that he can use at once keeps the customer (order 67 bought again the same week).
- Six angles: Technical — no refund object · Customer — "where is my money?" · Employee — spreadsheet refunds · CEO — chargebacks and complaints · Owner — every refund needs his OK, so he needs the list · Supplier — the gateway's refund calls and fees.
- Register: PR 172, PR 171, PR 144, PR 189, PR 166 (dated scope on PR 172 and PR 144)
- Status: open

### P2.3.2 Important (14)

### SIM-F-042 · The prepaid reward does not exist yet, and its fallback is the common case
- Order / checkpoint: SIM-51, 52, 53, 54, 61, 65 · CP06
- What happened: none of the 6 prepaid orders showed or received a reward (CN-018 #1). 4 of the 6 were over the ৳1,500 free-delivery limit, so a "free delivery" reward would have been worth nothing to them; the fallback to a fixed amount or percentage is the normal path, not the edge case.
- Severity: Important (an RTO lever the owner approved; demo gap)
- Fix: build the reward on PR 120/213 as specified: type (free delivery / fixed / %), fallback when delivery is already free, shown next to the payment option ("Pay now with bKash: ৳X off") and on the bag, stored on the order, counted in the P&L. Owner agent: sawdagor.
- Prevention: test matrix: each reward type × delivery free or not × each prepaid method; the reward is removed if the customer switches back to COD.
- Core-decision review: keep it a setting, off by default (CN-018).
- Growth idea: part 1 had 0 RTO on 8 prepaid orders; part 2 had 1 RTO on 6 (expat, receiver away). The reward is the cheapest way to move COD buyers to prepaid.
- Six angles: Technical — not built · Customer — no reason to prepay · Employee — none · CEO — RTO stays high · Owner — the amount is his setting · Supplier — gateway fees per method.
- Register: PR 120, PR 213 (CN-018 #1)
- Status: demo gap → acceptance test

### SIM-F-043 · Risk rules: no hard or soft level, no advance state, no timer, no "advance not paid" reason
- Order / checkpoint: SIM-55, 56, 57 · CP07, CP09, CP08
- What happened: every flagged order showed one signal "Refused before — ask for the delivery charge by bKash first", whether it was a ৳5,550 repeat refuser or a ৳1,270 tee order. Checkout offered COD to all of them. Order 56 waited 26 hours for an advance with no state ("waiting for advance"), no payment link, no reminder and no release: 2 hoodies stayed held. The decline reasons are Duplicate / Customer asked to cancel / Fake / Could not reach — no "Advance not paid". The customer got no notice.
- Severity: Important (demo gap for the risk matrix; the money part is F-040)
- Fix: CN-018 #2 as specified on PR 161/560/542: owner-built rules with weights, Hard = full advance, Soft = delivery-charge advance, partial amount option; the advance request with link; an order state "Waiting for advance" with a timer from settings (remind, then hand to a person, never auto-cancel); decline reason "Advance not paid"; the PR 546 notice. Owner agent: gyani.
- Prevention: tests per level; flag-outcome report rows for "asked / paid / refused".
- Core-decision review: keep "never auto-block"; a timer that only hands over to a person respects it.
- Growth idea: a soft-level buyer who paid the advance was delivered (57) — commitment works; the report will show it.
- Six angles: Technical — one fixed suggestion · Customer — honest buyers can still order by paying · Employee — chasing by hand · CEO — fewer fake parcels · Owner — rules are his · Supplier — fewer return fees.
- Register: PR 156, PR 161, PR 560, PR 542, PR 562, PR 144 (CN-018 #2)
- Status: demo gap → acceptance test

### SIM-F-044 · A refusal we caused counts against the customer for ever
- Order / checkpoint: SIM-58 (his earlier parcel EX-1081 arrived after Eid, our fault) · CP09, CP15
- What happened: the new order was flagged "Refused before … ask for the delivery charge". Staff overrode it with Approve → "Checked — nothing wrong" + a note; that worked and was logged. But the approve reasons have no "False positive / our fault", the earlier refusal carries no reason that excludes it, and his next order would be flagged again ("sameday, refused").
- Severity: Important (good customers asked for advances; the risk data is polluted)
- Fix: refusal reasons from settings with an "our fault" group (late after the promise, wrong item, damaged) that never feeds the risk score; an override reason "False positive"; a "clear this signal" action with a reason, logged, for staff with the review permission. Owner agent: gyani.
- Prevention: test "a refusal marked our fault does not flag the next order"; the PR 562 report counts overrides per rule.
- Core-decision review: keep the human override; add the reason so it teaches the rules.
- Growth idea: false-positive rate per rule tells the owner which weight to lower.
- Six angles: Technical — the signal ignores the reason · Customer — feels accused · Employee — overrides every time · CEO — lost repeat buyers · Owner — fairness · Supplier — courier return reasons feed it.
- Register: PR 526, PR 156, PR 163, PR 562 (dated scope on PR 526)
- Status: open

### SIM-F-045 · Ordering for someone else (the receiver pays) only works as a "gift", which hides the price from the person paying
- Order / checkpoint: SIM-60 (son in Dhaka, father in Sylhet pays COD), SIM-61 (prepaid gift to a mother) · CP10, CP12
- What happened: the only "someone else" option is "Send it as a gift". The son used it: the invoice became "A gift for Abdul Jalil" with no prices, while the sticker said "COLLECT CASH ৳3,200" and carried the son's phone. The father, who pays, has no price list and gets no SMS or tracking link. In order 61 the sticker named the payer, not the mother (F-007 still open).
- Severity: Important
- Fix: on PR 605 add a "Deliver to someone else" block separate from gift: receiver name, phone, address band, and "who pays at the door: me (prepaid) / the receiver (COD)". Receiver-pays parcels show prices and get the receiver an SMS with the amount; gift parcels must be prepaid or hide prices only when nothing is due. Owner agent: sawdagor + bhandari.
- Prevention: tests "receiver pays → receiver's phone on sticker and booking, receiver SMS with the due amount"; "gift with COD → blocked or prices shown".
- Core-decision review: gift mode stays as approved; "for a parent" is a different, very common case.
- Growth idea: "Send to Abba/Ammu" is an Eid campaign hook (part 1 idea 22).
- Six angles: Technical — one mode for two cases · Customer — the father is surprised by a bill · Employee — calls to explain · CEO — refusals at the door · Owner — whether the option exists is his (question in the Bengali summary) · Supplier — the courier calls the wrong person.
- Register: PR 605 (dated scope), PR 179, PR 148
- Status: open

### SIM-F-046 · Phone-first buyers (40+ and 50+) have no call-to-order, no call-back request and no voice-note support
- Order / checkpoint: SIM-59, 62 · CP05, CP09, CP15, CP02
- What happened: at 150% text in বাংলা the product page has no "call to order" button; the only tel: link is the footer hotline. A 45-year-old sent a voice note: the inbox shows no player and no transcript, and the AI drafted "I don't have the answer" to an empty text. He then asked "call me, I can't type": there is no call-back request or call list. The agent keyed his order in the shop checkout, so it is tagged "website" (F-024).
- Severity: Important
- Fix: a "Call to order / call me back" button (number and hours from settings) that creates a call-back task with the bag attached; voice notes played in the inbox with a transcript (provider on mock until a key exists); order-from-chat with the channel tag "phone" or "whatsapp" (PR 430). Owner agent: doot.
- Prevention: tests "voice message → playable + transcript", "call-back request → task in the queue → order tagged phone".
- Core-decision review: keep the web checkout as the main path; phone is the fallback for buyers who will not type.
- Growth idea: older buyers order panjabis for Eid in volume; a call-back turns them into sales.
- Six angles: Technical — no audio, no task type · Customer — gives up · Employee — re-keys orders · CEO — lost older buyers · Owner — whether a call-back system exists is his call (question) · Supplier — telephony/IVR cost.
- Register: PR 430, PR 425–436 (S22 inbox), PR 84; new PR 607 proposed for the call-back queue (CN-020)
- Status: open + question for the owner

### SIM-F-047 · Low-literacy and Bengali-only buyers: Latin sizes, English left on the বাংলা checkout, English SMS
- Order / checkpoint: SIM-59, 63, 64 · CP05, CP07, CP08
- What happened: sizes are S/M/L/XL only, with no Bengali words (ছোট / মাঝারি / বড়) or a picture of the fit on the size row. With বাংলা on, the checkout at 390 px still shows 21 English words ("Add more", "the bag and delivery free", "Cash Delivery", "Send gift receiver", product names). Prices stay in Western digits. The placed SMS to a buyer who typed his name and address in Bengali is in English. There is no voice input for the address. Good: Bengali digits in the phone number were cleaned, and the Bengali union/upazila addresses were zoned correctly by district.
- Severity: Important
- Fix: Bengali size words and a "my usual size" helper on the size row; translate the remaining checkout keys (label dictionary PR 78); SMS and WhatsApp templates in Bengali chosen by the customer's language (PR 505); an optional Bengali-digit display setting; a voice-to-text button on the address field (browser speech where available). Owner agent: doot.
- Prevention: the language gate (English word count on বাংলা pages = 0 for UI keys); template test per language.
- Core-decision review: simple English stays the default; the বাংলা switch must be complete (F-025).
- Growth idea: village buyers are a large, under-served COD market; a Bengali journey is the entry ticket.
- Six angles: Technical — partial dictionary · Customer — cannot read the amount · Employee — explains by phone · CEO — reach · Owner — none · Supplier — SMS cost of Unicode (longer messages).
- Register: PR 84, PR 78, PR 505, PR 61–75 (size row) (dated scope on PR 84)
- Status: open (extends F-025)

### SIM-F-048 · Village addresses and shared phones: no contact person or call time, Bengali-only sticker, one promise for every far district
- Order / checkpoint: SIM-63 (Kurigram, neighbour's phone), SIM-64 (Sunamganj, shared phone off), SIM-70 (Bandarban) · CP09, CP11, CP12
- What happened: the buyer used a neighbour's phone, so the neighbour's name became the customer name; there is no "whose phone / best time to call" field. The sticker prints the Bengali address exactly as typed, with no English transliteration and no union/upazila fields for the courier's zone id. Kurigram took 4 days and Bandarban 6, while the checkout promised "48–72 hours" for every outside-Dhaka district.
- Severity: Important
- Fix: optional "contact person / call time" on the checkout (stored on the order, printed on the sticker); structured village fields (union, upazila) that feed the courier zone id (PR 554); a transliterated line under a Bengali address on the sticker; delivery promise per district or courier zone from settings (PR 135/193). Owner agent: sawdagor + bhandari.
- Prevention: tests with a Bengali village address and a borrowed phone; promise per band.
- Core-decision review: keep "a district settles the band"; the courier still needs the village detail.
- Growth idea: save the rider's directions on the customer for the next order (part 1 F-030 idea).
- Six angles: Technical — free-text only · Customer — late, unreachable · Employee — rider calls · CEO — RTO in far districts · Owner — none · Supplier — hub sorting.
- Register: PR 549, PR 554, PR 563, PR 179, PR 135 (dated scope on PR 179 and PR 135)
- Status: open

### SIM-F-049 · No path for a buyer abroad who pays for family in Bangladesh
- Order / checkpoint: SIM-65 · CP07, CP14
- What happened: the expat's UAE number was refused ("Enter an 11-digit mobile number"); there is no e-mail field, so the payer abroad gets no confirmation, no tracking and no word when the parcel came back. He used his brother's number; the brother was away twice and the paid parcel returned (F-041).
- Severity: Important (growth; remittance families buy for Eid)
- Fix: "I'm ordering from abroad" on the checkout: payer phone (international) or e-mail for receipts, the receiver's BD phone for the courier; prepaid only for this path. Owner agent: sawdagor.
- Prevention: test "international payer + BD receiver → payer gets e-mail receipts, receiver gets the courier SMS".
- Core-decision review: phone validation stays strict for the receiver.
- Growth idea: diaspora Eid gifting; card payments carry no COD risk.
- Six angles: Technical — one phone field · Customer — cannot even enter his own number · Employee — none · CEO — a prepaid segment lost · Owner — whether this path exists is his call (question) · Supplier — card gateway international acceptance.
- Register: new PR 608 proposed (CN-020); links PR 605 (receiver block), PR 120
- Status: question for the owner

### SIM-F-050 · Coupons have no audience and no first-order rule
- Order / checkpoint: SIM-68 · CP06, CP09, CP17
- What happened: the coupon form has Code, Name, Type, Amount, Minimum, Total uses, Per customer, Status, Starts, Ends — no "Who can use it" (CN-018 #9) and no "first order only". The owner's WELCOME100 was refused for a first-time guest ("Member codes work after you log in") and accepted for a 3-time repeat buyer (৳100 off).
- Severity: Important (campaign money goes to the wrong people)
- Fix: CN-018 #9 on PR 271: guests / logged-in / both, plus "first order only" checked by phone at checkout; the bag explains a refusal in words. Owner agent: sawdagor.
- Prevention: coupon matrix guest/member × audience × first-order.
- Core-decision review: keep coupons owner-controlled; audience is part of the coupon, not a global rule.
- Growth idea: a welcome code that really works for new guests is the cheapest first-order lever.
- Six angles: Technical — login gate before lookup · Customer — "code doesn't work" · Employee — manual discounts · CEO — wasted discount · Owner — the audience is his setting · Supplier — none.
- Register: PR 271, PR 213 (CN-018 #9); re-confirms F-009
- Status: demo gap → acceptance test

### SIM-F-051 · Sets: no Fixed / Flexible setting, and the rider is not told the rule
- Order / checkpoint: SIM-69 · CP06, CP11, CP13
- What happened: Combos & sets has no "Fixed set (no single piece can be kept or returned) / Flexible" switch, no split-price rule and no rule for the delivery charge when the kept part falls under the free limit (CN-018 #4). The sticker says nothing about the set rule. The customer wanted to keep the hoodie and return the jogger; with no partial outcome (F-005) the whole ৳2,490 set came back.
- Severity: Important (the partial-delivery state itself is Urgent F-005)
- Fix: CN-018 #4 on PR 89/97/212; the set rule printed on the sticker and in the booking note ("Fixed set — no split" or "Flexible — single piece ৳X"); the partial outcome uses the split price. Owner agent: sawdagor + bhandari.
- Prevention: tests fixed vs flexible at the door.
- Core-decision review: fixed sets never split (owner); flexible needs the rider to know.
- Growth idea: a kept hoodie is a ৳1,650 sale instead of an RTO.
- Six angles: Technical — no set type · Customer — cannot keep what fits · Employee — rider calls the shop · CEO — lost partial sales · Owner — the split price is his setting · Supplier — Paperfly/Steadfast partial charges.
- Register: PR 89, PR 97, PR 212, PR 179 (CN-018 #4); with F-005
- Status: demo gap → acceptance test

### SIM-F-052 · Exchanges: no staff waiver, the our-mistake claim has no note, and the charge on a prepaid order is cash only and unannounced
- Order / checkpoint: SIM-52 (card, own-size L→XL), SIM-54 (Nagad, wrong size sent) · CP15, CP16, CP08
- What happened: the charges were right (৳120 outside Dhaka for the own choice; ৳0 for our mistake) and the photo is required for a problem claim. But there is no staff "Waive the charge" with a reason (CN-018 #5); the claim has no note box ("you sent L, I ordered M"); "wrong size sent" shares one bucket with faulty and damaged, so packing errors cannot be counted; the card buyer can only pay the ৳120 in cash to the rider, and no message tells him the amount after approval. The returned L was booked back as the ordered M (F-022).
- Severity: Important
- Fix: CN-018 #5 on PR 185–190: waiver with a logged reason; note + photo on the claim; reasons split (wrong size sent / wrong item / faulty / damaged); pay the charge online for prepaid orders or cash to the rider; one exchange message with the amount. Owner agent: bhandari.
- Prevention: tests per reason; the claim cannot be sent without a photo and a note.
- Core-decision review: "free if our mistake" stays; staff waivers are logged for the owner.
- Growth idea: wrong-size-sent count per packer (part 1 F-022 idea).
- Six angles: Technical — fixed rules · Customer — surprise cash at the door · Employee — cannot waive · CEO — packing quality unseen · Owner — waivers visible · Supplier — none.
- Register: PR 185, PR 186, PR 187, PR 190, PR 148 (CN-018 #5)
- Status: partly a demo gap → acceptance test

### SIM-F-053 · The Messages control centre (CN-019) is not there yet; missing message steps found in this run
- Order / checkpoint: SIM-51 and all 19 orders · CP08
- What happened: Admin › Messages log is a log plus a fixed send rule ("max 2 SMS, max 1 WhatsApp"). There is no order-journey timeline, no per-step channel, template or delay, no editable caps, no promotions with quiet hours. Steps this run needed and that do not exist: cancel/decline notice (53, 56), refund notice (53, 65), exchange approved with the amount (52, 54), advance request (55–57), receiver message (60, 61), failed-attempt notice (64), late apology (70). 19 placed SMS, 17 confirmed SMS and 17 processing WhatsApp were sent; 0 blocked; 0 in Bengali.
- Severity: Important (demo gap; the CN-019 build)
- Fix: CN-019 (1) on PR 148/505/289/292/295/300/545 as one section, with these steps in the journey and the `{due}` variable (F-001). Owner agent: doot.
- Prevention: the template matrix (COD / prepaid / part-paid / refund / receiver) per language.
- Core-decision review: the owner's cap stays, now editable per channel; service notices (cancel, refund) should sit outside the marketing cap (part 1 P13).
- Growth idea: the delivery-day message (built, switchable) attacks "phone off" RTO.
- Six angles: Technical — fixed rule · Customer — silence after cancel/refund · Employee — "where is my money" chats · CEO — trust · Owner — one place to control every message · Supplier — SMS/WhatsApp cost visible per step.
- Register: PR 148, PR 505, PR 289, PR 292, PR 295, PR 300, PR 545 (CN-019 (1))
- Status: demo gap → acceptance test

### SIM-F-054 · Rider overcharge refund and late-delivery apology credit have no workflow, and no wallet credit tool exists
- Order / checkpoint: SIM-70 · CP12, CP14, CP15
- What happened: the parcel was 6 days late; tracking still said "With courier" (F-018). The customer reported that the rider asked ৳30 extra for the hill road. Customers has no wallet column or credit action; Support has no rider-issue form, refund button or credit action. So neither the exact ৳30 refund (CN-018 #7) nor an apology credit (CN-018 #8) can be given or recorded, and the courier claim cannot be raised.
- Severity: Important
- Fix: Support › Rider issues (proof, amount, staff approval, exact refund to wallet or original method, auto courier claim) on PR 192; the apology credit as a setting (amount or %, wallet or next order, per order or by rule) on PR 171/296; a wallet credit/debit tool with a reason and ledger line (Accounts role; the owner's OK per hard rule 6). Owner agent: gyani + bhandari.
- Prevention: tests "overcharge ৳30 → refund ৳30 → claim ৳30"; "late past promise → credit per rule".
- Core-decision review: refunds stay owner-approved; the exact amount rule avoids round-number goodwill.
- Growth idea: a quick apology credit stops the public post (part 1 orders 11 and 28).
- Six angles: Technical — no wallet tool · Customer — feels cheated twice · Employee — promises it cannot keep · CEO — brand risk · Owner — whether to give credit is his setting · Supplier — overcharge recovered from the courier.
- Register: PR 192, PR 171, PR 172, PR 296 (CN-018 #7, #8)
- Status: demo gap → acceptance test

### SIM-F-055 · The AI draft is wrong on the new intents, once harmfully
- Order / checkpoint: SIM-53, 62, 66, 70 · CP15
- What happened: "cancel the order, I paid by bank, I want it back" → "Once delivered, items can be exchanged for size — not returned or refunded" (wrong: it was not delivered, and a refund is owed). A voice note and an agreed corporate quote → "I don't have the answer to this one yet" with "Hi New". "6 days late, and the rider wants ৳30 more" → "Delivery usually takes up to 48–72 hours". 0 of 4 drafts were right; a person checks before sending, so nothing left the shop.
- Severity: Important (extends F-012)
- Fix: add intents "cancel + refund (prepaid)", "voice message" (transcribe first), "quote / bulk" (hand to the owner, PR 606), "late past promise" and "rider overcharge" (open a rider issue); never quote the no-return policy for an undelivered order. Owner agent: gyani.
- Prevention: add these 5 chats to the F-012 draft test set.
- Core-decision review: keep "AI drafts, a person sends".
- Growth idea: a correct refund answer is a retention moment.
- Six angles: Technical — keyword rules · Customer — wrong policy quoted · Employee — rewrites · CEO — trust · Owner — refund wording is policy · Supplier — none.
- Register: PR 425–436, PR 538 (dated scope with F-012)
- Status: open

### P2.3.3 Can wait (2)

### SIM-F-056 · A customer cannot cancel an unpacked order himself
- Order / checkpoint: SIM-53 · CP15
- What happened: My orders has "Edit order" but no "Cancel"; the customer had to write on WhatsApp and wait for staff.
- Severity: Can wait
- Fix: "Cancel this order" until packing or booking (the same lock as F-004), with a reason list; prepaid cancels create the refund record (F-041). Six angles: Customer — control; Employee — fewer chats; CEO — fewer RTOs of parcels the buyer no longer wants.
- Register: PR 143, PR 144 · Status: open + question for the owner (whether customers may cancel themselves)

### SIM-F-057 · A slow decider's bag waits with no consented reminder
- Order / checkpoint: SIM-59 · CP06
- What happened: the 50+ buyer left his bag for 2 days; it was still there (good), but no consented "still thinking? call us" message exists.
- Severity: Can wait
- Fix: PR 275 follow-up, consent only, at most the owner's cap, with the call-back button (F-046). Six angles: CEO — recovered sales; Customer — reminded once.
- Register: PR 274, PR 275 · Status: open

## P2.4 What worked (keep)

- Every prepaid sticker reads "PAID — collect nothing ৳0" and the courier COD is 0 (5 of 5 parcels).
- The own-size exchange charge was right (৳120 outside Dhaka) and the our-mistake exchange was free, with a required photo.
- Bengali union/upazila addresses (Kurigram, Sunamganj) and a Bandarban village were zoned by district; Bengali digits in the phone were cleaned.
- 150% text at 390 px: no overflow on the product page or the thank-you page; size pills 50 px high.
- The bag survived 2 days and a reload.
- The review queue never blocked anyone; a staff override with a note worked and was logged.
- Totals agreed on checkout, order and invoice in all 19 orders, including the WELCOME100 discount.

## P2.5 Part-1 findings seen again

| Finding | Seen in part 2 |
|---|---|
| F-001 prepaid told to pay on delivery | 5 of 5 prepaid confirmations (51, 52, 54, 61, 65) + the soft-advance order 57 |
| F-005 no partial delivery | 69 (flexible set) |
| F-007 gift receiver unused | 61 (sticker names the payer), 60 |
| F-009 guests cannot use codes | 68 |
| F-012 AI drafts | 53, 62, 66, 70 → F-055 |
| F-013 no cancel notice | 53, 56 |
| F-017 courier exception states | 64 (failed attempt) |
| F-018 late parcel not flagged | 70 (6 days, "With courier") |
| F-020 prepaid sent to the call queue | 51 ("To confirm") |
| F-022 returned SKU assumed | 54 (L back booked as M) |
| F-023 bulk lane | 66 (now PR 606) |
| F-024 channel lost on agent orders | 62 |
| F-025 half-English বাংলা | 59, 63 → F-047 |
| F-026 abandoned-cart follow-up | 59 → F-057 |

## P2.6 Reconciliation delta (part 2 only)

| Check | Result |
|---|---|
| Orders | 19 records: delivered 15 · cancelled 2 · RTO 2 · + 1 enquiry with no order |
| Delivered revenue | ৳28,350 (prepaid ৳6,530 on 4 orders · COD ৳21,820 on 11) |
| COD collected that the customer had already paid | **৳5,670** (55: ৳5,550 · 57: ৳120) — F-040 |
| Prepaid money on cancelled/returned orders, no refund record | **৳5,350** (53: ৳1,650 · 65: ৳3,700) — F-041 |
| Money owed to customers and shown nowhere | **৳11,020** (+ ৳30 rider overcharge, 70) |
| Exchange charges | ৳120 collected as COD (52) |
| Courier charges | ৳1,555 on 17 parcels (return fees and the 2 RTO return legs not counted by the demo, F-027) |
| Stock | 23 SKUs touched; 23 / 23 match the system's own formula; real variances it cannot see: 54 (one L back, booked as M), 69 (a sale lost, not a stock error) |
| ERP documents | 53, 0 duplicate keys |
| Wallets with a balance | 0 accounts (nothing in the system can credit a wallet) |
| Messages | 19 placed SMS · 17 confirmed SMS · 17 processing WhatsApp · 0 blocked · 6 with a wrong amount · 0 cancel, refund, exchange, receiver or Bengali messages |
| Review queue | 4 flagged, all "refused before": 55 approved (advance not recordable) · 56 declined (advance refused) · 57 approved (soft advance) · 58 approved (false positive) · 0 blocked |
| Support | 5 conversations (4 AI drafts): 0 right, 1 harmful (53), 2 "don't know" (62, 66), 1 misleading (70) |

The P&L was not re-run for part 2: its sample costs are unchanged, and the new money effects are the ৳11,020 above, which the P&L cannot see at all.

## P2.7 Six-angle notes, by angle of this part

| Angle of the run | Technical | Customer | Employee | CEO | Owner | Supplier |
|---|---|---|---|---|---|---|
| **Fully prepaid** | Payment state reaches the sticker but not the messages, the refund or the review queue | Told to pay again; refunds vanish | Manual refunds, reassurance calls | Prepaid is the RTO cure, but only if refunds and the reward work | Every refund needs his OK, so he needs the refund list | Gateway refunds and fees per method |
| **Risky under rules** | No levels, no advance object, no timer | Honest flagged buyers can pay and get the parcel | Chasing advances in call notes | Advances commit buyers (57 delivered) | Rules and weights are his settings; never auto-block held | Fewer return fees; courier fraud data (PR 559/567) |
| **Older 40+/50+** | No call-back task, no audio | Want to call, not type; large text works | Re-key phone orders | Eid panjabi buyers are often older | Whether a call-back system exists is his call | Telephony cost |
| **Low-literacy rural** | Partial dictionary; free-text village address | Cannot read sizes or the SMS amount | Rider and agent calls | A big COD market | None | Hub sorting, zone ids, far-district times |
| **Others (expat, corporate, coupons, sets, late)** | One phone field; no B2B order; no coupon audience; no set type; no wallet tool | Each meets a dead end the shop could solve | Manual workarounds | Diaspora and corporate orders are high value | Most are already his CN-018 settings | Courier claims for overcharge and lateness |

## P2.8 Staging acceptance list — additions (run on new.extas.com.bd before real orders)

13. A full and a delivery-charge advance are recorded as payments; the sticker, courier COD, SMS and invoice show total − paid (F-040).
14. Cancelling or returning a paid order creates a refund record that the owner approves and the customer sees; a wallet refund shows in the balance and ledger (F-041).
15. Prepaid reward: each type, and the fallback when delivery is already free (F-042).
16. Risk Hard → full advance, Soft → delivery-charge advance, "Waiting for advance" with its timer, "Advance not paid" reason and notice (F-043).
17. A refusal marked "our fault" never flags the next order (F-044).
18. Receiver-pays order: receiver on the sticker and booking, receiver SMS with the amount (F-045).
19. Call-back request and voice notes in the inbox; phone orders tagged "phone" (F-046).
20. বাংলা checkout with 0 English UI words; Bengali SMS for a Bengali buyer (F-047).
21. Coupon "Who can use it" and "first order only" (F-050); set Fixed/Flexible at the door (F-051); exchange waiver with a reason (F-052); rider overcharge refund and apology credit (F-054).

## P2.9 Lessons (for `docs/agents/lessons/ALL.md`)

- Money paid outside the checkout (an advance, a bank transfer) is a payment record on the order, never a note; every amount due is total − paid. (SIM-55, 57 / SIM-F-040, 2026-10-23)
- Every cancel or return of a paid order creates a refund record with an owner approval and a customer-visible status; a dialog sentence is not a refund. (SIM-53, 65, 67 / SIM-F-041, 2026-10-23)
- A risk signal records why the past event happened; refusals we caused never count against the customer. (SIM-58 / SIM-F-044, 2026-10-23)
- "For someone else" and "gift" are two cases: test who pays, who gets the messages and whose phone the courier has. (SIM-60 / SIM-F-045, 2026-10-23)
- Copy the user profile with an absolute path without "..": Chromium silently dropped localStorage for a `--user-data-dir` containing "..", and the shop started from seed data. Guard every run with a "state loaded" check. (simulation method, 2026-10-23)
