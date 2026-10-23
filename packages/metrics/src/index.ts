// @extas/metrics — the one KPI definition (register PR 155, change note CN-022, owner decision 23 Oct 2026).
// What it is for:
//   - "Sales" means delivered orders only, counted on the day each was delivered;
//   - "Ordered value" means every placed order, counted on the day it was placed, and is always shown beside Sales,
//     never instead of it;
//   - every report view and the admin dashboard read their money numbers through these functions: the headline pair
//     (`kpi`), day by day (`kpiByDay`), by delivery zone (`kpiByZone`), by payment method (`kpiByPaymentMethod`), and
//     the order lines of a product or a combo (`lines` / `linesBoth`, added up by `sumLines`).
// The rule lives in pure.ts (SALES_STATUSES, NOT_PLACED_STATUSES, BASIS_RULE). src/guard.test.ts fails the build when
// any other package adds up order or line money on its own. Until the order state machine exists (it waits for the
// owner's approval of the architecture draft), no order reaches DELIVERED, so Sales is 0 everywhere — that is correct.
export * from './pure';
export * from './metrics';
