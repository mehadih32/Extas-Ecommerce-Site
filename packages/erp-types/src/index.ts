// @extas/erp-types — CN-028 · PR 607–621, built in CN-029 Phase 0: the shared TypeScript of Retail as a separate buyer of
// the ERP (docs/RETAIL-ERP-MODEL.md, docs/erp/site-changes-v6.md), so the five lanes of Phase 1 write against one copy
// before the others land. No database and no network: plain types, the contract's schemas and small exact rules.
//
// - contract-v6 — the v6 calls and answers on the wire, the retired v5 calls, the v6 events and their parser (moved
//   from @extas/adapters, which re-exports it unchanged).
// - ledger      — Retail's ERP account: entry kinds and signs, which event makes which entry, the hash chain, the balance.
// - pipeline    — the pipeline stock: piece states, which are in the pipeline, the allowed moves, its value.
// - summary     — the daily summary's line sources, the shop cost lines, the fixed-cost spread by days of the month.
// - books       — the match engine: checks A–F, difference classes and their fix, results, close levels, the tie
//                 formula, the week / month / financial year of a business date.
// - states      — the order line, return list and event-ledger states.
// - link        — one ERP link per store (§16): the three per-store secret names (never values) and the link view.
//
// Every list here has the same values as its Prisma enum in packages/db (migration 0049_erp_v6); a test in
// packages/inventory checks they agree. Money is in minor units (whole taka in v6), dates the ERP's own (YYYY-MM-DD).
export * from './contract-v6';
export * from './ledger';
export * from './pipeline';
export * from './summary';
export * from './books';
export * from './states';
export * from './link';
