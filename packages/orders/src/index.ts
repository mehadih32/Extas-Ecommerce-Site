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
// size) until processing starts, capped, off by default (edit.ts).
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
