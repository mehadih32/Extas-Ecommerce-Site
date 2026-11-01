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
//
// PR 286: one customer's page — his orders over every profile and number a page at a time, his exchanges, his support
// history (empty until S22) and "Who looked at this customer" for the owner (profile.ts).
// S18 · PR 382: erasure requests (CUS-07, D9): filed by `customers.privacy`, carried out by the owner alone with a typed
// word, never while an order is on its way; the personal details are anonymised, money and stock stay (erasure.ts).
// PR 287: segments from real behaviour, saved and reusable (segments.ts; the conditions in segment-rules.ts, also in
// `@extas/customers/pure`): counted live over the list's own people (people-sql.ts), the list's views as built-in
// segments, the Customers list narrowed to one (`?segment=`); off as shipped (`customers.segments`).
// PR 288: the journey view (journey.ts) — every touch of a person in order, from what the shop already keeps (profiles,
// visits, touches, orders and how they ended, exchanges, messages, chats, reviews, wallet, consent, merges, notes);
// off as shipped (`customers.journey`), nothing new stored.
// PR 289: automations (journeys.ts, journey-rules.ts) — customer journeys that start on a trigger (days after a delivered
// order, days without an order, days after joining), wait, check and queue offer messages for the Messages engine;
// off as shipped (`customers.journeys`), each journey saved off.
// CN-028 · PR 620: the ERP's live customer list (erp-page.ts): one row per person who ordered, with his address, number,
// total spent (Sales), orders and first and last order; the shop never pushes it, the ERP asks when the owner clicks.
export * from './access';
export * from './context';
export * from './erasure';
export * from './erp-page';
export * from './errors';
export * from './family';
export * from './journey';
export * from './journeys';
export * from './list';
export * from './merge';
export * from './people-sql';
export * from './profile';
export * from './pure';
export * from './segments';
export * from './settings';
export * from './view';
