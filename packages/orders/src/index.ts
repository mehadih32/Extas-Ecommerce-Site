// @extas/orders — the order core (S05; BACKEND-ARCHITECTURE §6.5, §9.10; CN-022).
//
// The one order service: every change of an order's status, and of the flags that steer it, is a command here (PR 138)
// with the row lock, the version check, the machine's plan, an OrderEvent and an AuditLog row in one transaction.
// Courier, payment and return statuses stay in their own records (S07, S08 call the hooks). Also: cancellation with the
// owner's reason list and refund REQUESTS for paid orders (PR 144; no money moves), the customer's own cancel
// (CN-020 (5)), hold and release with a reason (PR 153), notes and internal flags (PR 147), the duplicate-order defence
// with its review queue and decisions (PR 145), the order list and one order's page data, and the order timers that
// only hand an order to a person. PR 563: the call queue every order's call tasks land in (calls.ts). PR 127: "Add to
// this parcel" — a line added to an order not yet with the courier, by the customer or the team (addon.ts).
// PR 605: deliveryTarget — who and where a parcel goes to (a gift's receiver, with the sender and the note), the one
// reading for the sticker and the booking (delivery-target.ts, also in `@extas/orders/pure`).
// PR 140: the list's courier and return/refund facts per row (admin-read.ts). PR 141:
// the customer's history beside one order and the names its page shows (history.ts). PR 154:
// the search by number, phone, name or tracking number (search.ts). PR 142: the team's edit of an order not yet
// with the courier — contact, address, a size at the same price, a piece taken out — with its reason, where the
// customer asked, and the stock and fraud checks again (edit.ts). PR 143: the customer's own edit (phone, address, a
// size) until processing starts, capped, off by default (edit.ts). PR 146: the two-size follow-up — after placing,
// the same piece in neighbouring sizes is asked about (a family's sizes, said in the bag, are only a note: SIM-F-036),
// and the answer takes the other sizes out before packing (two-size.ts). PR 566: why an order was asked for an advance
// and why its delivery charge is what it is, from its stored facts only (explain.ts).
// PR 151: the order export — the list's filter or the ticked orders as a CSV file, personal columns only with their own
// key, audited (export.ts).
// S06 · PR 157: a number's history — its other orders and what became of them (phone-history.ts).
// S06 · PR 158: the address and zone facts read against the gazetteer for the checks (address-facts.ts).
// S06 · PR 156: the risk score — the owner's signals and weights, scored once when the order lands and stored with its
// reasons (risk.ts; the model in risk-score.ts). It only informs: nothing is blocked or held by it.
// S06 · PR 160: the risk panel — why the score is what it is, from what was stored (risk-panel.ts).
// S05 · PR 541: the risk-sectioned dashboard — every order placed in its section with a note the moment it lands, a
// review where a person must decide (sections.ts; the rule in risk-section.ts), the identity check beyond the phone
// (identity.ts, SIM-F-015) and the courier booking through the machine, never while a review is open (booking.ts,
// SIM-F-014).
// S06 · PR 519: the Order Identity Graph — one identity from the phone, the name, the address, the device and the IP,
// linked when an order lands; the risk score's identity and device signals read it (identity-graph.ts).
// S06 · PR 520: the duplicate & re-order rules engine — scenarios A–E, H, I as separate rules with their own switch,
// window, confidence and action, run by the duplicate check when the owner switches them on (duplicate-rules.ts).
// S06 · PR 521: the alert summary — one review explained: why it fired, the matched orders, what the riders wrote, the
// customer's history and the decisions open to this person (alert-summary.ts).
// S06 · PR 544: the rule master switches — one list of every fraud and duplicate rule, each switchable (rule-switches.ts).
// S06 · PR 161: the actions per risk level — watch, hold, a confirmation call, and the advance a level proposes (risk-levels.ts).
// S06 · PR 542: the one-click advance request from the order — the pay link, its SMS/WhatsApp through the order
// messages and a call task, the order waiting for the money; "Send again"; the owner's auto option (advance-request.ts)
// and its card on Orders › Risk rules (advance-settings.ts).
// S08 · PR 185: the four-tier exchange engine — what may be offered (strictly in order), the window and the per-piece
// limit, the money box, the exchange opened on the delivered order and, once approved, its linked exchange order with
// the stock held and the old piece's pick-up opened (exchange.ts; the pure rules in exchange-pure.ts). PR 187: Receive &
// QC — every returned piece by the SKU scanned, sellable to the ERP, not sellable a loss (returns.ts). PR 188: the
// variant switcher — another size of the same piece at the same price, stock held again (exchange-switch.ts). PR 189:
// return handling — the courier's returned parcel opens its return, a return after receipt only when the policy allows
// it (no returns after receipt by default), a person closes it (return-cases.ts). PR 190: who pays the second delivery —
// staff waivers with a logged reason and "your mistake" claims (exchange-charge.ts); the rules, the one-trip swap and the
// linked re-ship after a try-on live in the engine (exchange.ts, exchange-pure.ts). PR 191: refused parcels — the shop's
// fault marked, the charge paid at the door kept, and the refused-parcel list a person decides (refused.ts).
// S20 · PR 407: the customer invoice, issued once per order and kept — its number made once, a new version (same number)
// only when the order is edited, the background run and the admin's invoice list (invoice.ts); the invoice page's
// settings cards, read with fulfilment.read and saved with orders.invoiceSettings (invoice-settings.ts).
//
// Import `@extas/orders/pure` for the machine without a database (the shop's labels, the tests).
export * from './context';
export * from './errors';
export * from './pure';
export * from './service';
export * from './commands';
export * from './customer';
export * from './notes';
export * from './duplicates';
export * from './list';
export * from './followups';
export * from './calls';
export * from './addon';
export * from './admin-read';
export * from './history';
export * from './search';
export * from './edit';
export * from './two-size';
export * from './explain';
export * from './export';
export * from './phone-history';
export * from './address-facts';
export * from './risk';
export * from './risk-panel';
export * from './sections';
export * from './identity';
export * from './identity-graph';
export * from './duplicate-rules';
export * from './alert-summary';
export * from './rule-switches';
export * from './risk-levels';
export * from './advance-request';
export * from './advance-settings';
export * from './booking';
export * from './checkout-layers';
export * from './checkout-risk';
export * from './exchange';
export * from './returns';
export * from './exchange-switch';
export * from './return-cases';
export * from './exchange-charge';
export * from './refused';
export * from './invoice';
export * from './invoice-settings';
// CN-028 · PR 612–614 (CN-029 Phase 1): the old return paths as switches, the hand-back desk on ERP contract v6
export * from './legacy';
export * from './handback';
export * from './erp-returns-run';
export * from './returns-erp';
