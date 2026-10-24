// @extas/customers — the shop's customers (S14; BACKEND-ARCHITECTURE §5.5; Blueprint B5).
//
// PR 284: the customer model on what S04–S07 built (the shop account, the phone history and risk, the orders, the
// wallet): one record keyed by phone (B5.5), and a person as the profile he stays under plus the profiles merged into
// it (family.ts). The single view of a person by phone — every number, what his orders came to, his lifetime value as
// Sales (delivered only) beside Ordered value from @extas/metrics (CN-022) — and "Who looked at this customer"
// (view.ts, access.ts; Note 24.1). The merge rules (an e-mail, a WhatsApp number, a name with an address, the identity
// graph; the owner's `customers.merge` setting), and merges, "not the same person" and splits by a person only:
// reversible, audited, nothing moved or deleted, no money touched (merge.ts). Phone numbers are masked for anyone
// without `customers.phone` (`customers.phoneMask`). The rules without a database are in `@extas/customers/pure`.
//
// PR 285: the Customers list — one row per person with his orders, Sales beside Ordered value, refusals that were not
// the shop's fault and exchanges; the owner's views (New, Returning, VIP, At risk, Refused before, Exchanged, No offers)
// with their counts, search by name, e-mail or any of his numbers, a source filter and five sorts (list.ts).
export * from './access';
export * from './context';
export * from './errors';
export * from './family';
export * from './list';
export * from './merge';
export * from './pure';
export * from './view';
