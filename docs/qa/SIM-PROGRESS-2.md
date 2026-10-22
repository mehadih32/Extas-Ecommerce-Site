# SIM-PROGRESS-2 — Part 2, 20 more orders (CN-019 (4))
Build: EXTAS-demo-V12.2.html (scratchpad/v122) · run 2026-10-23 · one headless Chromium, closed between batches
Data: continues from the end of part 1 (no reset; backup of the part-1 end state in `scratchpad/sim/udd-part1-end`). Part-2 day k = simulated day 114+k (clock continues forward).
Scripts: `scratchpad/sim/orders4.js`, `run2.js`, `meta2.json`; results `scratchpad/sim/results/51..70.json`.
Batches: A = 51–60, B = 61–70. Resume: `node run2.js <from> <to>` skips orders that already have a result file.

| # | Persona | Status | CPs (pass/fail/gap) | Order | Note |
|---|---|---|---|---|---|
| 51 | PP bKash | done | 4/2/1 | EX-1094 · delivered | stock substitution textured-knit-polo: colour navy→charcoal (size M sold out in navy) |
| 52 | PP card | done | 5/1/2 | EX-1095 · delivered | stock substitution slim-chino-trousers: colour khaki→navy (size 32 sold out in khaki) |
| 53 | PP bank | done | 1/2/0 | EX-1096 · cancelled | internet banking: {"grand":1650,"delivery":0,"free":true,"rewardWords":[],"method":"card"} |
| 54 | PP Nagad | done | 6/2/0 | EX-1097 · delivered | placed SMS: sent (demo) — EXTAS: Order EX-1097 placed, total ৳ 1,030. We will confirm it soon. Help: WhatsApp  |
| 55 | RK hard·paid | done | 4/1/1 | EX-1098 · delivered | placed SMS: sent (demo) — EXTAS: Order EX-1098 placed, total ৳ 5,550. We will confirm it soon. Help: WhatsApp  |
| 56 | RK hard·refused | done | 1/2/1 | EX-1099 · cancelled | placed SMS: sent (demo) — EXTAS: Order EX-1099 placed, total ৳ 3,300. We will confirm it soon. Help: WhatsApp  |
| 57 | RK soft | done | 4/2/0 | EX-1100 · delivered | stock substitution pocket-tee: colour black→sky (size L sold out in black) |
| 58 | RK false+ | done | 6/2/0 | EX-1101 · delivered | placed SMS: sent (demo) — EXTAS: Order EX-1101 placed, total ৳ 1,310. We will confirm it soon. Help: WhatsApp  |
| 59 | EL 50+ | done | 6/2/0 | EX-1102 · delivered | PDP at 150% text, বাংলা, 390 px: {"tel":"Hotline 09XXX-XXXXXX tel:09XXX-XXXXXX","callWords":false,"price":"৳ 1 |
| 60 | EL son→father | done | 3/2/0 | EX-1103 · delivered | checkout: order-for-someone-else option {"forOther":true,"gift":true} |
| 61 | EL gift→mother | done | 3/2/0 | EX-1104 · delivered | placed SMS: sent (demo) — EXTAS: Order EX-1104 placed, total ৳ 1,570. We will confirm it soon. Help: WhatsApp  |
| 62 | EL 40+ voice | done | 6/2/1 | EX-1105 · delivered | AI draft for a voice note: Hi New, thank you for your message. I don't have the answer to this one yet — an em |
| 63 | RU Kurigram | done | 3/2/2 | EX-1106 · delivered | checkout in বাংলা at 390 px: {"eng":21,"sample":"Add more the bag and delivery free Cash Delivery Cotton Socks |
| 64 | RU Sunamganj | done | 4/2/0 | EX-1107 · delivered | size choice for a buyer who cannot read S/M/L: {"pills":["S","M","L","XL","XXL"],"bnSizeWords":false,"chestInc |
| 65 | EX expat card | done | 3/3/0 | EX-1108 · returned | expat types his UAE number: {"ok":false,"msg":"Enter an 11-digit mobile number, like 01712345678.","phone":"wa |
| 66 | CO corporate | done | 0/2/0 | — · enquiry only — no order | AI draft for an agreed corporate quote: Hi New, thank you for your message. I don't have the answer to this on |
| 67 | RP wallet | done | 6/1/0 | EX-1109 · delivered | login true · account {"wallet":0,"tx":0} |
| 68 | CP coupon audience | done | 5/3/0 | EX-1110 · delivered | coupon form fields: Code (A–Z, 0–9) / Name the customer sees / Type / Amount (% or ৳) / Minimum order ৳ (optio |
| 69 | FS flexible set | done | 2/3/0 | EX-1111 · returned | Combos & sets admin: {"fixedFlex":false,"split":true,"lines":["B4 · Price split","No single pieces in this sec |
| 70 | LT late+rider | done | 4/3/0 | EX-1112 · delivered | placed SMS: sent (demo) — EXTAS: Order EX-1112 placed, total ৳ 1,470. We will confirm it soon. Help: WhatsApp  |

## Run closed — 23 Oct 2026
- Status: **all 20 orders done** in 2 batches (A 51–60, B 61–70), browser closed between them. Before the real run the 20 scripts were dry-run on a copy of the data (one fix: a profile path with ".." made Chromium drop localStorage; real run guarded by a "state loaded" check: 57 orders at start).
- Order records EX-1094 … EX-1112 (19); order 66 is a corporate enquiry with no order.
- Outcomes: delivered 15 · cancelled 2 (53 prepaid cancel, 56 advance refused) · RTO 2 (65 prepaid card, 69 flexible set) · enquiry 1.
- Checkpoints: 76 pass · 41 fail · 8 gap.
- Reconciliation (read-only, `scratchpad/sim/recon2.js` → `recon2.json`): stock 23/23 SKUs consistent with the system's own formula; ERP 53 documents, 0 duplicate keys; money owed to customers and shown nowhere ৳11,020.
- Findings: 18 new (Urgent 2 · Important 14 · Can wait 2), SIM-F-040 … SIM-F-057; 14 part-1 findings re-confirmed.
- Output: `SIMULATION-REPORT.md` → "Part 2 — 20 more orders (23 Oct)"; `SIMULATION-SUMMARY-BN.md` → part 2.
- Resume at: nothing left in this run.
